// Headless-browser checks of the timeline, warp-to and preview: the acceptance criteria of
// sprint 5 (planning/sprint-5.md, "test/smoke/timeline.mjs").
//
//   npm run smoke
//
// Reads the dev-only debug handle `window.__spaceGame` (S5-15): timeline(), preview(), clock(),
// shipWorld(id), shipPredicted(id, t), bodyWorld(id), elapsedVertices(id), plus the sprint 4
// probes. Page coordinates for the strip's glyphs are CSS px from the page's top left.

import { resolve } from 'node:path';
import { outDir, smoke, url } from './lib.mjs';

// The TLI (S4-19): seconds after the spawn, and prograde km/s. Keep in step with SMOKE_TLI in
// src/gen/lunarMission.ts; test/smoke/constants.test.ts checks this file has them.
const TLI = { dt: 3600, dv: 3.130535 };
const NODE_LEAD = 60; // WARP_TO_NODE_LEAD in src/sim/clock.ts

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probe = (page, name, ...args) =>
  page.evaluate(([n, a]) => window.__spaceGame[n](...a), [name, args]);
const store = (page, f, ...args) =>
  page.evaluate(
    ([src, a]) => new Function('g', 'a', `return (${src})(g, ...a)`)(window.__spaceGame, a),
    [f.toString(), args],
  );

async function until(f, timeoutMs, everyMs = 50) {
  const deadline = Date.now() + timeoutMs;
  let v = await f();
  while (!v && Date.now() < deadline) {
    await sleep(everyMs);
    v = await f();
  }
  return v;
}

async function keys(page, ...ks) {
  await page.evaluate(
    () => document.activeElement instanceof HTMLElement && document.activeElement.blur(),
  );
  for (const k of ks) await page.keyboard.press(k);
}

async function setWarp(page, index) {
  await keys(page, ...Array(8).fill('Comma'), ...Array(index).fill('Period'));
}

const rel = (a, b) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / Math.max(Math.hypot(b.x, b.y, b.z), 1);

/** Loads the app paused, spawns LEO (lunar plane) and gives it the TLI node. */
async function lunarShip(page) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('main canvas');
  await page.waitForFunction(() => window.__spaceGame !== undefined);
  await keys(page, 'Space');
  await page.getByRole('tab', { name: 'Fleets' }).click();
  await page.getByRole('button', { name: 'Spawn ship…' }).click();
  await page.getByLabel('Preset').selectOption('leo-lunar-plane');
  await page.getByRole('button', { name: 'Spawn', exact: true }).click();
  const id = await probe(page, 'activeShip');
  const nodeId = await store(
    page,
    (g, id, tli) => {
      const w = g.world.getState();
      const t0 = w.world.derived.trajectories[id].segments[0].tStart;
      const r = w.addNode(id, { t: t0 + tli.dt, dv: { prograde: tli.dv, normal: 0, radial: 0 } });
      return r.ok ? r.value : null;
    },
    id,
    TLI,
  );
  await page.evaluate(
    (s) => window.__spaceGame.view.getState().focusOn({ kind: 'ship', id: s }),
    id,
  );
  await sleep(1600);
  return { id, nodeId };
}

const plan = (page, id) => probe(page, 'plan', id);
const parentOf = (page, id) =>
  page.evaluate((s) => window.__spaceGame.world.getState().world.ships[s].orbit.parentId, id);
const trajVersion = async (page, id) => (await probe(page, 'trajectoryKey', id)).version;

async function run(page, check) {
  // 1. The strip shows the node, then the Moon SOI entry.
  let { id } = await lunarShip(page);
  const nodeT = (await plan(page, id))[0].t;
  let tl = await probe(page, 'timeline');
  const node = tl.glyphs.find((g) => g.kind === 'node');
  let entry = tl.glyphs.find((g) => g.kind === 'soi-enter');
  check(
    !!node && !!entry && node.x < entry.x,
    `1. the strip lists the node then the SOI entry (${tl.glyphs.map((g) => g.kind).join(', ')})`,
  );
  check(
    tl.glyphs.every((g) => g.x >= tl.box.left && g.x <= tl.box.left + tl.box.width),
    '1. every glyph is inside the strip',
  );

  // 2. Hover details.
  await page.mouse.move(entry.x, entry.y);
  const tip = await until(
    () =>
      page
        .getByRole('tooltip')
        .textContent({ timeout: 500 })
        .catch(() => null),
    2000,
  );
  check(/^Moon SOI entry · /.test(tip ?? ''), `2. hovering the ▲ shows "${tip}"`);
  await page.screenshot({ path: resolve(outDir, 'timeline-hover.png') });
  await page.mouse.move(10, 10);

  // 3. Done when, part 1: at ×10⁶ the clock stops exactly at the node.
  await setWarp(page, 6);
  await keys(page, 'Space');
  await until(async () => (await probe(page, 'clock')).paused, 5000);
  const atNode = await probe(page, 'clock');
  check(
    atNode.t === nodeT,
    `3. ×10⁶: the clock pauses at the node exactly (t ${atNode.t}, node ${nodeT})`,
  );
  check((await plan(page, id)).length === 0, '3. the node has executed');

  // 4. Warp to next event: exactly at the Moon SOI entry, just after it is handled.
  tl = await probe(page, 'timeline');
  entry = tl.glyphs.find((g) => g.kind === 'soi-enter');
  await page.getByRole('button', { name: 'Warp to next event' }).click();
  const label = await page.getByRole('status', { name: 'Warping to' }).textContent();
  check(label.startsWith('⏩ Moon SOI entry'), `4. the ⏩ readout shows "${label}"`);
  const t0 = Date.now();
  await until(async () => (await probe(page, 'clock')).paused, 10_000);
  const atEntry = await probe(page, 'clock');
  check(
    atEntry.t === entry.t && atEntry.warpTo === null,
    `4. warp to next event stops at the SOI entry in ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
  check((await parentOf(page, id)) === 'moon', '4. the ship is in the Moon’s SOI');

  // 5. Warp to node: a minute before a node at the lunar periapsis.
  const pe = await store(page, (g, id) => g.world.getState().addNodeAt(id, 'periapsis'), id);
  const peT = (await plan(page, id))[0]?.t;
  await page.getByRole('button', { name: 'Warp to node' }).click();
  await until(async () => (await probe(page, 'clock')).paused, 10_000);
  const atPe = await probe(page, 'clock');
  check(
    pe.ok && Math.abs(atPe.t - (peT - NODE_LEAD)) < 1e-6,
    `5. warp to node stops ${peT - atPe.t} s before the node`,
  );

  // 6. Done when, part 2: preview the lunar arrival without changing the sim.
  ({ id } = await lunarShip(page));
  tl = await probe(page, 'timeline');
  entry = tl.glyphs.find((g) => g.kind === 'soi-enter');
  const before = { clock: await probe(page, 'clock'), version: await trajVersion(page, id) };
  await page.mouse.click(entry.x, entry.y);
  await sleep(300);
  const pv = await probe(page, 'preview');
  check(
    pv?.sticky === true && pv.viewTime === entry.t,
    '6. clicking ▲ starts a sticky preview at the entry',
  );
  check(
    await page.getByRole('status', { name: 'Preview' }).isVisible(),
    '6. the PREVIEW badge is shown',
  );
  const drawn = await probe(page, 'shipWorld', id);
  const predicted = await probe(page, 'shipPredicted', id, entry.t);
  const moon = await probe(page, 'bodyWorld', 'moon');
  check(
    drawn !== null && drawn.t === entry.t && rel(drawn, predicted) < 1e-6,
    `6. the ship is drawn at its predicted arrival position (rel ${drawn && rel(drawn, predicted)})`,
  );
  const soi = await page.evaluate(
    () => window.__spaceGame.world.getState().world.system.bodies.moon.soiRadius,
  );
  const fromMoon = Math.hypot(drawn.x - moon.x, drawn.y - moon.y, drawn.z - moon.z);
  check(
    moon.t === entry.t && Math.abs(fromMoon - soi) / soi < 1e-6,
    `6. the Moon is drawn at its arrival position (ship ${fromMoon.toFixed(0)} km away, SOI ${soi.toFixed(0)} km)`,
  );
  check(
    (await probe(page, 'elapsedVertices', id)).some((n) => n > 0),
    '6. the route flown in the preview is drawn',
  );
  await page.screenshot({ path: resolve(outDir, 'timeline-preview.png') });
  const after = { clock: await probe(page, 'clock'), version: await trajVersion(page, id) };
  check(
    after.clock.t === before.clock.t && after.clock.paused && after.version === before.version,
    '6. the sim is unchanged by the preview',
  );
  await keys(page, 'Escape');
  await sleep(200);
  const back = await probe(page, 'shipWorld', id);
  check(
    (await probe(page, 'preview')) === null && back.t === before.clock.t,
    '6. Esc returns the map to now',
  );
  check(
    (await probe(page, 'elapsedVertices', id)).every((n) => n === 0),
    '6. no elapsed route at now',
  );

  // 7. Drag: a transient preview, map editing off, ended by release.
  const nodeId = (await plan(page, id))[0].id;
  await page.evaluate(
    ([s, n]) => window.__spaceGame.view.getState().select({ kind: 'node', shipId: s, id: n }),
    [id, nodeId],
  );
  await sleep(200);
  check((await probe(page, 'gizmo')) !== null, '7. the gizmo is shown at now');
  const box = tl.box;
  const y = box.top + box.height - 4;
  await page.mouse.move(box.left + box.width * 0.5, y);
  await page.mouse.down();
  await sleep(150);
  const p1 = await probe(page, 'preview');
  await page.mouse.move(box.left + box.width * 0.6, y, { steps: 5 });
  await sleep(150);
  const p2 = await probe(page, 'preview');
  check(
    p1?.sticky === false && p2?.viewTime > p1.viewTime,
    '7. dragging the strip previews, moving with the pointer',
  );
  check((await probe(page, 'gizmo')) === null, '7. the gizmo is hidden in a preview');
  await page.mouse.up();
  await sleep(150);
  check((await probe(page, 'preview')) === null, '7. release returns to now');

  // 8. Catch-up: a sticky preview a minute ahead at ×10³ ends by itself.
  const now = (await probe(page, 'clock')).t;
  await page.evaluate((t) => window.__spaceGame.view.getState().startPreview(t, true), now + 60);
  await setWarp(page, 3);
  await keys(page, 'Space');
  const ended = await until(async () => (await probe(page, 'preview')) === null, 3000);
  check(ended, '8. a preview ends when now catches up');
  await keys(page, 'Space');
}

await smoke('Timeline', run);
