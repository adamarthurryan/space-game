// Headless-browser checks of ships and trajectories: the acceptance criteria of sprint 3
// (planning/sprint-3.md, "test/smoke/ships.mjs").
//
//   npm run smoke
//
// Reads the dev-only debug handle `window.__spaceGame` (S2-21, S3-22): ship(id), trajectory(id),
// trajectoryVertices(id), trajectoryMarkers() and camera(). Ships are spawned through the form,
// so the form is tested too. Screen positions are CSS px from the canvas's top left.

import { resolve } from 'node:path';
import { outDir, smoke, url } from './lib.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Calls a debug probe in the page. */
const probe = (page, name, ...args) =>
  page.evaluate(([n, a]) => window.__spaceGame[n](...a), [name, args]);
const camera = (page) => probe(page, 'camera');

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

/** Moves the mouse to the canvas centre and turns the wheel `notches` times (+ = out). */
async function wheel(page, notches) {
  const c = await page.locator('main canvas').boundingBox();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  for (let i = 0; i < Math.abs(notches); i++) {
    await page.mouse.wheel(0, 100 * Math.sign(notches));
    await sleep(15);
  }
  await until(async () => {
    const cam = await camera(page);
    return Math.abs(Math.log10(cam.distance / cam.targetDistance)) < 1e-4;
  }, 2000);
}

/** Waits for a refocus on `id` to finish; returns the wall time it took, or null. */
async function focused(page, id, timeoutMs = 3000) {
  const start = Date.now();
  const ok = await until(async () => {
    const c = await camera(page);
    return c.focusId === id && !c.animating;
  }, timeoutMs);
  return ok ? (Date.now() - start) / 1000 : null;
}

const shipRow = (page, name) => page.getByRole('option', { name, exact: true });
const inspector = (page) => page.getByRole('complementary', { name: 'Inspector' });

/** Spawns a ship from a form preset; returns its ID (the new selection). */
async function spawnPreset(page, preset) {
  await page.getByRole('button', { name: 'Spawn ship…' }).click();
  await page.getByLabel('Preset').selectOption(preset);
  await page.getByRole('button', { name: 'Spawn', exact: true }).click();
  const sel = await page.evaluate(() => window.__spaceGame.view.getState().selected);
  return sel?.kind === 'ship' ? sel.id : null;
}

/** The SOI row of the ship inspector. */
const inspectorSoi = (page) =>
  inspector(page)
    .getByText('SOI', { exact: true })
    .locator('xpath=following-sibling::dd[1]')
    .textContent()
    .catch(() => null);

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

async function run(page, check) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('main canvas');
  await page.waitForFunction(() => window.__spaceGame !== undefined);
  const canvas = await page.locator('main canvas').boundingBox();
  const centre = { x: canvas.width / 2, y: canvas.height / 2 };
  await keys(page, 'Space'); // pause: spawns and checks happen at a fixed time
  await page.getByRole('tab', { name: 'Fleets' }).click();

  // 1. The sandbox ships, projected, with drawn trajectories.
  const names = await page
    .getByRole('option')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  check(
    JSON.stringify(names) === JSON.stringify(['Kestrel', 'Tern', 'Heron']),
    `1. the Fleets tab lists Kestrel, Tern and Heron (${names.join(', ')})`,
  );
  await sleep(300);
  for (const id of ['ship-1', 'ship-2', 'ship-3']) {
    const s = await probe(page, 'ship', id);
    const v = await probe(page, 'trajectoryVertices', id);
    check(
      s !== null && Number.isFinite(s.x) && Number.isFinite(s.y) && sum(v) > 0,
      `1. ${id} has a projection and a drawn trajectory (${sum(v)} vertices)`,
    );
  }

  // 2. Earth escape: a Sun SOI event, and the re-base into the Sun's frame at ×10⁶.
  const escape = await spawnPreset(page, 'earth-escape');
  check(escape !== null, `2. the form spawns an Earth escape ship (${escape})`);
  const sunEvent = await until(
    () =>
      inspector(page)
        .getByText(/^Sun SOI in /)
        .count(),
    2000,
  );
  check(sunEvent > 0, '2. the inspector lists a Sun SOI event');
  await keys(page, 'Space');
  await setWarp(page, 6);
  const rebased = await until(async () => {
    const tr = await probe(page, 'trajectory', escape);
    return tr.segments[0]?.parentId === 'sun' && (await inspectorSoi(page)) === 'Sun';
  }, 10_000);
  await keys(page, 'Space');
  await setWarp(page, 0);
  check(!!rebased, `2. within 10 s at ×10⁶, segment 0 is Sun-centred and the inspector says Sun`);

  // 3. To the Moon: the SOI entry, and the lunar segment drawn in the Moon's frame.
  const lunar = await spawnPreset(page, 'to-the-moon');
  const tr = await probe(page, 'trajectory', lunar);
  const entry = tr.segments.findIndex(
    (s) => s.endEvent === 'soi-enter' && s.endTargetId === 'moon',
  );
  check(
    entry >= 0 && tr.segments[entry + 1]?.parentId === 'moon',
    `3. To the Moon: an SOI entry into the Moon, then a Moon-centred segment (${tr.segments
      .map((s) => `${s.parentId}→${s.endEvent}`)
      .join(', ')})`,
  );
  await sleep(300);
  await page.screenshot({ path: resolve(outDir, 'ships-flyby-earth.png') });
  await page.evaluate(() =>
    window.__spaceGame.view.getState().focusOn({ kind: 'body', id: 'moon' }),
  );
  await focused(page, 'moon');
  await wheel(page, 3);
  await sleep(300);
  const lunarVerts = (await probe(page, 'trajectoryVertices', lunar))[entry + 1] ?? 0;
  const moonMarker = (await probe(page, 'trajectoryMarkers')).find(
    (m) => m.shipId === lunar && m.text === '▲ Moon SOI',
  );
  check(
    lunarVerts > 0,
    `3. focused on the Moon, the lunar segment is drawn (${lunarVerts} vertices)`,
  );
  check(!!moonMarker, '3. focused on the Moon, a ▲ Moon SOI marker is placed');
  await page.screenshot({ path: resolve(outDir, 'ships-flyby-moon.png') });

  // 4. Suborbital: the trajectory ends at an impact, and the ship is destroyed when it's reached.
  await page.evaluate(() =>
    window.__spaceGame.view.getState().focusOn({ kind: 'body', id: 'earth' }),
  );
  await focused(page, 'earth');
  const sub = await spawnPreset(page, 'suborbital');
  const subTr = await probe(page, 'trajectory', sub);
  check(
    subTr.segments.at(-1)?.endEvent === 'impact',
    `4. Suborbital: the trajectory ends with an impact (${subTr.segments.map((s) => s.endEvent).join(', ')})`,
  );
  const impactT = subTr.segments.at(-1)?.tEnd ?? 0;
  await keys(page, 'Space');
  await setWarp(page, 3);
  await until(async () => (await probe(page, 'simTime')) > impactT + 10, 10_000);
  await keys(page, 'Space');
  await setWarp(page, 0);
  await sleep(300);
  const subName = await page.evaluate(
    (id) => window.__spaceGame.ships().find((s) => s.id === id)?.name,
    sub,
  );
  const row = shipRow(page, subName);
  const greyed = (await row.textContent())?.includes('impacted Earth');
  const gone =
    (await probe(page, 'ship', sub)) === null &&
    sum(await probe(page, 'trajectoryVertices', sub)) === 0;
  check(
    (await probe(page, 'trajectory', sub)).status === 'destroyed' && !!greyed && gone,
    `4. after the impact, ${subName} is greyed out ("impacted Earth") with no marker or trajectory`,
  );

  // 5. Focus Kestrel from the list: no jitter at a ship focus.
  await shipRow(page, 'Kestrel').dblclick();
  const took = await focused(page, 'ship-1');
  check(
    took !== null && took <= 1.5,
    `5. double-clicking Kestrel focuses it within 1.5 s (${took} s)`,
  );
  await keys(page, 'Space');
  await setWarp(page, 3);
  const samples = [];
  const end = Date.now() + 2000;
  while (Date.now() < end) {
    samples.push(await probe(page, 'ship', 'ship-1'));
    await sleep(50);
  }
  await keys(page, 'Space');
  await setWarp(page, 0);
  const drift = Math.max(...samples.map((s) => Math.hypot(s.x - centre.x, s.y - centre.y)));
  check(
    drift < 0.5,
    `5. Kestrel at ×10³: within ${drift.toFixed(3)} px of the centre (${samples.length} samples)`,
  );

  // 6. Hover and click Kestrel's marker. Snap to its orbit first, so Earth can't hide it, and
  // zoom out so the whole orbit is on screen.
  await keys(page, 'p');
  await until(async () => !(await camera(page)).animating, 2000);
  await wheel(page, 2);
  await keys(page, 'Escape');
  await sleep(200);
  const k = await probe(page, 'ship', 'ship-1');
  await page.mouse.move(canvas.x + k.x + 1, canvas.y + k.y + 1);
  await sleep(150);
  const cursor = await page.evaluate(() => document.querySelector('main canvas').style.cursor);
  check(
    cursor === 'pointer',
    `6. hovering Kestrel's marker shows a pointer cursor (${cursor || 'default'})`,
  );
  await page.mouse.click(canvas.x + k.x + 1, canvas.y + k.y + 1);
  await sleep(300);
  const selected = await page.evaluate(() => window.__spaceGame.view.getState().selected);
  check(
    selected?.kind === 'ship' && selected.id === 'ship-1',
    `6. clicking Kestrel's marker selects it (${JSON.stringify(selected)})`,
  );
  const kinds = (await probe(page, 'trajectoryMarkers'))
    .filter((m) => m.shipId === 'ship-1')
    .map((m) => m.kind);
  check(
    !kinds.includes('periapsis') && !kinds.includes('apoapsis'),
    `6. Kestrel's circular orbit has no Pe or Ap markers (S5b-20) (${kinds.join(', ')})`,
  );
  await page.screenshot({ path: resolve(outDir, 'ships-kestrel.png') });
}

await smoke('Ships', run);
