// Headless-browser checks of the map: the acceptance criteria of sprint 2
// (planning/sprint-2.md, "test/smoke/map.mjs").
//
//   npm run smoke
//
// Reads the dev-only debug handle `window.__spaceGame` (S2-21) for the camera state and each
// body's projection. Screen positions are CSS px from the canvas's top left.

import { resolve } from 'node:path';
import { outDir, smoke, url } from './lib.mjs';

const DEG = Math.PI / 180;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Calls a debug probe in the page. */
const probe = (page, name, ...args) =>
  page.evaluate(([n, a]) => window.__spaceGame[n](...a), [name, args]);
const camera = (page) => probe(page, 'camera');
const body = (page, id) => probe(page, 'body', id);
const labels = async (page) => (await probe(page, 'labels')).map((l) => l.id);

/** Waits until `f()` (in Node) is truthy, polling; returns the last value. */
async function until(f, timeoutMs, everyMs = 50) {
  const deadline = Date.now() + timeoutMs;
  let v = await f();
  while (!v && Date.now() < deadline) {
    await sleep(everyMs);
    v = await f();
  }
  return v;
}

const treeItem = (page, name) => page.getByRole('treeitem', { name, exact: true });
const treeRow = (page, name) => treeItem(page, name).getByText(name, { exact: true }).first();

/** Expands a collapsed tree row. */
async function expand(page, name) {
  const item = treeItem(page, name);
  if ((await item.getAttribute('aria-expanded')) === 'false') {
    await item.getByText('▸', { exact: true }).first().click();
  }
}

/** Double-clicks a body in the tree and waits for the refocus to finish. */
async function focusFromTree(page, name, id) {
  await treeRow(page, name).dblclick();
  return until(async () => {
    const c = await camera(page);
    return c.focusId === id && !c.animating;
  }, 3000);
}

/** Moves the mouse to the canvas centre and turns the wheel `notches` times (+ = out). */
async function wheel(page, notches) {
  const c = await page.locator('main canvas').boundingBox();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  for (let i = 0; i < Math.abs(notches); i++) {
    await page.mouse.wheel(0, 100 * Math.sign(notches));
    await sleep(15);
  }
  // Let the 150 ms zoom easing settle.
  await until(async () => {
    const cam = await camera(page);
    return Math.abs(Math.log10(cam.distance / cam.targetDistance)) < 1e-4;
  }, 2000);
}

/** Presses keys with nothing focused, so the map shortcuts see them. */
async function keys(page, ...ks) {
  await page.evaluate(
    () => document.activeElement instanceof HTMLElement && document.activeElement.blur(),
  );
  for (const k of ks) await page.keyboard.press(k);
}

/** Sets the warp step by keyboard: down to ×1, then up `index` steps. */
async function setWarp(page, index) {
  await keys(page, ...Array(8).fill('Comma'), ...Array(index).fill('Period'));
}

/** The brightest pixel (max of R, G, B) in a small square of the page, decoded in the page. */
async function brightness(page, x, y, half = 4) {
  const png = await page.screenshot({
    clip: { x: x - half, y: y - half, width: 2 * half + 1, height: 2 * half + 1 },
  });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let max = 0;
    for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i], d[i + 1], d[i + 2]);
    return max;
  }, png.toString('base64'));
}

const angleDeg = (a, b) => {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  const n = Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z);
  return Math.acos(Math.min(1, Math.max(-1, dot / n))) / DEG;
};

async function run(page, check) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('main canvas');
  await page.waitForFunction(() => window.__spaceGame !== undefined);
  const canvasBox = await page.locator('main canvas').boundingBox();
  const centre = { x: canvasBox.width / 2, y: canvasBox.height / 2 };

  // 1. The tree, and a lit canvas at system zoom.
  const sunChildren = await treeItem(page, 'Sun')
    .getByRole('group')
    .first()
    .locator(':scope > [role="treeitem"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  check(
    sunChildren.length === 9 && sunChildren[2] === 'Earth' && sunChildren[8] === 'Pluto',
    `1. the System tab lists the Sun and its nine children (${sunChildren.join(', ')})`,
  );
  await focusFromTree(page, 'Sun', 'sun');
  const sun = await body(page, 'sun');
  const sunLight = await brightness(page, canvasBox.x + sun.x, canvasBox.y + sun.y);
  check(
    sunLight > 200,
    `1. the canvas is not blank: the Sun's pixels are bright (max ${sunLight})`,
  );
  await page.screenshot({ path: resolve(outDir, 'map-system.png') });

  // 2. Selecting Jupiter in the tree.
  await treeRow(page, 'Jupiter').click();
  const heading = await page.locator('#inspector h3').textContent();
  const soi = await page
    .locator('#inspector dt', { hasText: 'SOI radius' })
    .locator('xpath=following-sibling::dd[1]')
    .textContent();
  check(
    heading === 'Jupiter' && /AU|km/.test(soi ?? ''),
    `2. clicking Jupiter selects it (inspector: ${heading}, SOI ${soi})`,
  );

  // 3. Double-clicking Jupiter frames its moons.
  const t0 = Date.now();
  const refocused = await focusFromTree(page, 'Jupiter', 'jupiter');
  const took = (Date.now() - t0) / 1000;
  check(
    refocused && took < 1.5,
    `3. double-clicking Jupiter refocuses within 1.5 s (${took.toFixed(2)} s)`,
  );
  await sleep(200);
  const moons = ['io', 'europa', 'ganymede', 'callisto'];
  const placed = await labels(page);
  check(
    moons.every((m) => placed.includes(m)),
    `3. the four Galilean moons are labelled (${placed.join(', ')})`,
  );
  const pos = await Promise.all(moons.map((m) => body(page, m)));
  let minGap = Infinity;
  for (let a = 0; a < pos.length; a++) {
    for (let b = a + 1; b < pos.length; b++) {
      const d = Math.hypot(pos[a].x - pos[b].x, pos[a].y - pos[b].y);
      minGap = Math.min(minGap, d - Math.max(pos[a].disc, 0) - Math.max(pos[b].disc, 0));
    }
  }
  check(
    minGap >= 6,
    `3. their markers or discs are at least 6 px apart (closest ${minGap.toFixed(1)} px)`,
  );
  await page.screenshot({ path: resolve(outDir, 'map-jupiter.png') });

  // 4. Snaps.
  await keys(page, 'e');
  const ecliptic = await until(async () => {
    const c = await camera(page);
    return c.pole.z > 0.999999 && Math.abs(c.pitch - Math.PI / 2) < 1e-9 ? c : null;
  }, 1000);
  check(!!ecliptic, '4. E snaps to the ecliptic: pitch reaches 90° within 1 s');
  await expand(page, 'Earth');
  await treeRow(page, 'Moon').click();
  await keys(page, 'p');
  await until(async () => !(await camera(page)).animating, 1500);
  const normal = await probe(page, 'orbitNormal', 'moon');
  const fwd = (await camera(page)).forward;
  const off = angleDeg(fwd, { x: -normal.x, y: -normal.y, z: -normal.z });
  check(off < 0.1, `4. P looks straight down the Moon's orbit normal (${off.toFixed(4)}° off)`);

  // 5. Zoom: from Earth's minimum distance, 21 notches out show the whole system.
  await focusFromTree(page, 'Earth', 'earth');
  await wheel(page, -40);
  const minD = (await camera(page)).distance;
  await wheel(page, 21);
  const farD = (await camera(page)).distance;
  await sleep(200);
  check(
    Math.abs(minD / (1.05 * 6371.0084) - 1) < 1e-3 && farD >= 9e9,
    `5. 21 notches out from Earth's minimum distance (${Math.round(minD)} km) reach ${farD.toExponential(2)} km`,
  );
  check((await labels(page)).includes('neptune'), "5. Neptune's label is placed at that zoom");

  // 6. No jitter at ×10⁵, at Earth's and the Moon's minimum distances.
  for (const [name, id] of [
    ['Earth', 'earth'],
    ['Moon', 'moon'],
  ]) {
    await focusFromTree(page, name, id);
    await wheel(page, -40);
    await setWarp(page, 5);
    const samples = [];
    const end = Date.now() + 2000;
    while (Date.now() < end) {
      samples.push(await body(page, id));
      await sleep(50);
    }
    await setWarp(page, 0);
    const drift = Math.max(...samples.map((s) => Math.hypot(s.x - centre.x, s.y - centre.y)));
    const discs = samples.map((s) => s.disc);
    const spread = Math.max(...discs) - Math.min(...discs);
    check(
      drift < 0.5 && spread < 0.5,
      `6. ${name} at its minimum distance, ×10⁵: centre within ${drift.toFixed(3)} px, disc varies ${spread.toFixed(3)} px (${samples.length} samples)`,
    );
  }

  // 7. Warp: a year in a few seconds.
  const dateOf = () => page.getByRole('status', { name: 'Date' }).textContent();
  const yearBefore = Number((await dateOf()).slice(0, 4));
  await setWarp(page, 7);
  const sample = () =>
    page.evaluate(() => ({ t: window.__spaceGame.simTime(), wall: performance.now() }));
  const before = await sample();
  await sleep(4000);
  const after = await sample();
  await keys(page, 'Space');
  const ratio = (after.t - before.t) / (1e7 * ((after.wall - before.wall) / 1000));
  check(
    ratio > 0.9 && ratio < 1.1,
    `7. ×10⁷ advances 10⁷ × the wall time (ratio ${ratio.toFixed(3)})`,
  );
  await sleep(250); // the date readout refreshes at 10 Hz
  const date = await dateOf();
  check(Number(date.slice(0, 4)) > yearBefore, `7. the date readout follows (${date})`);
  await keys(page, 'Space');
  await setWarp(page, 0);

  // 8. Hovering Mars's label shows a pointer; clicking it selects Mars.
  await focusFromTree(page, 'Mars', 'mars');
  await keys(page, 'Escape');
  await sleep(100);
  const marsLabel = (await probe(page, 'labels')).find((l) => l.id === 'mars');
  if (check(!!marsLabel, "8. Mars's label is placed")) {
    const lx = canvasBox.x + marsLabel.x + marsLabel.w / 2;
    const ly = canvasBox.y + marsLabel.y + marsLabel.h / 2;
    await page.mouse.move(lx, ly);
    await sleep(100);
    const cursor = await page.evaluate(() => document.querySelector('main canvas').style.cursor);
    check(
      cursor === 'pointer',
      `8. hovering Mars's label shows a pointer cursor (${cursor || 'default'})`,
    );
    await page.mouse.click(lx, ly);
    const selected = await page.evaluate(() => window.__spaceGame.view.getState().selected);
    check(
      selected?.id === 'mars',
      `8. clicking Mars's label selects Mars (${selected?.id ?? 'nothing'})`,
    );
  }
}

await smoke('Map', run);
