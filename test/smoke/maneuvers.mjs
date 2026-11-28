// Headless-browser checks of maneuver nodes: the acceptance criteria of sprint 4
// (planning/sprint-4.md, "test/smoke/maneuvers.mjs"): fly to the Moon by hand.
//
//   npm run smoke
//
// Reads the dev-only debug handle `window.__spaceGame` (S4-20): plan(id), nodeScreen(id),
// gizmo(), ghost(), activePath(), activeShip(), trajectory(id) and trajectoryVertices(id).
// Screen positions are CSS px from the canvas's top left.

import { resolve } from 'node:path';
import { outDir, smoke, url } from './lib.mjs';

// The TLI typed in (S4-19): seconds after the spawn, and prograde km/s. Keep in step with
// SMOKE_TLI in src/gen/lunarMission.ts; gen/lunarMission.test.ts checks this file has them.
const TLI = { dt: 3600, dv: 3.130535 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probe = (page, name, ...args) =>
  page.evaluate(([n, a]) => window.__spaceGame[n](...a), [name, args]);
const simTime = (page) => probe(page, 'simTime');
const paused = (page) =>
  page.evaluate(() => window.__spaceGame.world.getState().world.clock.paused);

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

async function wheel(page, canvas, notches) {
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  for (let i = 0; i < Math.abs(notches); i++) {
    await page.mouse.wheel(0, 100 * Math.sign(notches));
    await sleep(15);
  }
  await until(async () => {
    const cam = await probe(page, 'camera');
    return Math.abs(Math.log10(cam.distance / cam.targetDistance)) < 1e-4 && !cam.animating;
  }, 3000);
}

/** Types into a labelled inspector field and commits it. */
async function type(page, label, text) {
  const f = page.getByLabel(label, { exact: true });
  await f.fill(text);
  await f.press('Enter');
  await sleep(100);
}

const result = (page) => page.getByLabel('Result').textContent();

/** Pe and Ap (km from the centre) of a state around a body of GM mu. */
function apsides(mu, r, v) {
  const rm = Math.hypot(r.x, r.y, r.z);
  const v2 = v.x ** 2 + v.y ** 2 + v.z ** 2;
  const h = Math.hypot(r.y * v.z - r.z * v.y, r.z * v.x - r.x * v.z, r.x * v.y - r.y * v.x);
  const energy = v2 / 2 - mu / rm;
  const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (mu * mu)));
  const p = (h * h) / mu;
  return { pe: p / (1 + e), ap: e < 1 ? p / (1 - e) : Infinity, e, h };
}

/** The world's raw segments of a ship (states included). */
const segments = (page, id) =>
  page.evaluate(
    (s) => window.__spaceGame.world.getState().world.derived.trajectories[s].segments,
    id,
  );
const muOf = (page, body) =>
  page.evaluate((b) => window.__spaceGame.world.getState().world.system.bodies[b].mu, body);

/** Drags from (x, y) by (dx, dy) in 10 steps, optionally holding Shift. */
async function drag(page, canvas, x, y, dx, dy, shift = false) {
  await page.mouse.move(canvas.x + x, canvas.y + y);
  await sleep(50);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) {
    await page.mouse.move(canvas.x + x + (dx * k) / 10, canvas.y + y + (dy * k) / 10);
    await sleep(20);
  }
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  await sleep(150);
}

async function run(page, check) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('main canvas');
  await page.waitForFunction(() => window.__spaceGame !== undefined);
  const canvas = await page.locator('main canvas').boundingBox();
  await keys(page, 'Space'); // pause: planning happens at a fixed time
  await page.getByRole('tab', { name: 'Fleets' }).click();

  // 1. Spawn LEO (lunar plane), and fly it (A, S5b-6): it becomes the active ship.
  await page.getByRole('button', { name: 'Spawn ship…' }).click();
  await page.getByLabel('Preset').selectOption('leo-lunar-plane');
  await page.getByRole('button', { name: 'Spawn', exact: true }).click();
  const sel = await page.evaluate(() => window.__spaceGame.view.getState().selected);
  const id = sel?.id;
  await keys(page, 'KeyA');
  const spawnT = (await segments(page, id))[0].tStart;
  check((await probe(page, 'activeShip')) === id, `1. the spawned ship ${id} is active`);
  const star = await page.getByRole('option', { name: /Starship 4/ }).textContent();
  check(star.includes('★'), '1. the Fleets list marks it ★');
  await page.evaluate(
    (s) => window.__spaceGame.view.getState().focusOn({ kind: 'ship', id: s }),
    id,
  );
  await sleep(1600);
  await keys(page, 'KeyP');
  await sleep(1200);
  // The ship was on screen, so focusing it kept Earth's framing (S5b-5): zoom in to the low orbit.
  await wheel(page, canvas, -6);

  // 2. The ghost on the path, and click to create.
  const path = await probe(page, 'activePath');
  // The low orbit, seen from above, runs just outside Earth's disc.
  const earth = await probe(page, 'body', 'earth');
  const offEarth = (p) => Math.hypot(p.x - earth.x, p.y - earth.y) - earth.disc;
  const pts = path[0].points.filter(
    (p) =>
      Number.isFinite(p.x) &&
      p.x > 40 &&
      p.y > 40 &&
      p.x < canvas.width - 40 &&
      p.y < canvas.height - 40 &&
      offEarth(p) > 0,
  );
  const pt = pts[Math.floor(pts.length / 4)];
  // 2 px off the path, away from Earth's disc.
  const away = Math.hypot(pt.x - earth.x, pt.y - earth.y);
  await page.mouse.move(
    canvas.x + pt.x + (2 * (pt.x - earth.x)) / away,
    canvas.y + pt.y + (2 * (pt.y - earth.y)) / away,
  );
  await sleep(150);
  const ghost = await probe(page, 'ghost');
  check(
    ghost !== null && Math.hypot(ghost.x - pt.x, ghost.y - pt.y) < 8,
    `2. hovering the path shows a ghost node within 8 px (${ghost && Math.hypot(ghost.x - pt.x, ghost.y - pt.y).toFixed(1)} px)`,
  );
  await page.mouse.down();
  await page.mouse.up();
  await sleep(200);
  let plan = await probe(page, 'plan', id);
  check(
    plan.length === 1 && Math.abs(plan[0].t - ghost.t) < 1e-6,
    `2. a click creates a node at the ghost's time (${plan[0]?.t} s, ghost ${ghost.t} s)`,
  );
  check(
    (await page.getByRole('region', { name: 'Node editor' }).count()) === 1,
    '2. the node editor is shown',
  );

  // 3. The gizmo: six handles; prograde by 100 px, then 100 px with Shift.
  const gz = await probe(page, 'gizmo');
  check(
    gz?.handles.length === 6,
    `3. the gizmo has six handles (${gz?.handles.filter((h) => h.shown).length} facing the view)`,
  );
  const v0 = (await probe(page, 'trajectoryKey', id)).version;
  const pro = gz.handles.find((h) => h.handle === 'prograde');
  await drag(page, canvas, pro.x, pro.y, pro.axis.x * 100, pro.axis.y * 100);
  const p1 = (await probe(page, 'plan', id))[0].dv.prograde;
  check(Math.abs(p1 - 0.1) < 0.005, `3. a 100 px prograde drag gives 0.1 km/s (${p1.toFixed(5)})`);
  const pro2 = (await probe(page, 'gizmo')).handles.find((h) => h.handle === 'prograde');
  await drag(page, canvas, pro2.x, pro2.y, pro2.axis.x * 100, pro2.axis.y * 100, true);
  const p2 = (await probe(page, 'plan', id))[0].dv.prograde;
  check(
    Math.abs(p2 - p1 - 0.01) < 0.0005,
    `3. with Shift, 100 px adds 0.01 km/s (${(p2 - p1).toFixed(5)})`,
  );
  const v1 = (await probe(page, 'trajectoryKey', id)).version;
  const verts = await probe(page, 'trajectoryVertices', id);
  check(
    v1 > v0 && verts.length > 1 && verts[1] > 0,
    `3. the trajectory was recomputed and its planned part drawn (${verts})`,
  );

  // 4. Typed values: the TLI.
  const now = await simTime(page);
  await type(page, 'From now', String(spawnT + TLI.dt - now));
  await type(page, 'Prograde', `${TLI.dv} km/s`);
  plan = await probe(page, 'plan', id);
  check(
    Math.abs(plan[0].t - (spawnT + TLI.dt)) < 1e-6,
    `4. the typed time is T+${TLI.dt} s from the spawn`,
  );
  const tliText = await result(page);
  check(/^Moon encounter, Pe /.test(tliText), `4. the result reads "${tliText}"`);
  const tr = await probe(page, 'trajectory', id);
  const ends = tr.segments.map((s) => s.endEvent);
  check(
    ends[0] === 'maneuver' && ends[1] === 'soi-enter' && tr.segments[1].endTargetId === 'moon',
    `4. the trajectory has a node, then a Moon SOI entry (${ends.join(', ')})`,
  );
  await wheel(page, canvas, 8);
  await page.screenshot({ path: resolve(outDir, 'maneuvers-tli.png') });

  // 5. Chain: Add node ▾ → at next Pe, then a circularising retrograde Δv.
  // The node's row is expanded in the ship inspector (S5b-17); its header collapses it.
  await page.getByRole('button', { name: /^◆ Node/, expanded: true }).click();
  await page.getByRole('button', { name: 'Add node ▾' }).click();
  await page.getByRole('menuitem', { name: 'At next Pe' }).click();
  await sleep(200);
  plan = await probe(page, 'plan', id);
  const loi = plan[1];
  const segs = await segments(page, id);
  const lunarSeg = segs.find((s) => s.endNodeId === loi?.id);
  check(
    lunarSeg?.parentId === 'moon',
    `5. the next Pe is in the Moon's SOI (${lunarSeg?.parentId})`,
  );
  const muMoon = await muOf(page, 'moon');
  const a = apsides(muMoon, lunarSeg.r0, lunarSeg.v0);
  const vp = a.h / a.pe;
  const dvLoi = Math.sqrt(muMoon / a.pe) - vp;
  await type(page, 'Prograde', `${(dvLoi * 1000).toFixed(3)} m/s`);
  const loiText = await result(page);
  check(/^Moon orbit, Pe /.test(loiText), `5. the result reads "${loiText}"`);
  const after = (await segments(page, id)).find((s, i, all) => all[i - 1]?.endNodeId === loi.id);
  const predicted = apsides(muMoon, after.r0, after.v0);

  // 6. Execute: the clock pauses at each node, at its time exactly.
  await keys(page, 'Space');
  await setWarp(page, 5);
  const firstStop = await until(async () => (await paused(page)) && (await simTime(page)), 10_000);
  check(
    firstStop === plan[0].t,
    `6. the clock pauses at the TLI (t = ${firstStop}, node at ${plan[0].t})`,
  );
  await keys(page, 'Space');
  const secondStop = await until(
    async () => (await paused(page)) && (await simTime(page)) > plan[0].t && (await simTime(page)),
    30_000,
  );
  check(
    secondStop === loi.t,
    `6. it pauses again at the LOI (t = ${secondStop}, node at ${loi.t})`,
  );
  const now6 = await segments(page, id);
  const got = apsides(muMoon, now6[0].r0, now6[0].v0);
  check(now6[0].parentId === 'moon', "6. the ship is in the Moon's SOI");
  check(
    Math.abs(got.pe - predicted.pe) < 1 && Math.abs(got.ap - predicted.ap) < 1,
    `6. its orbit matches the prediction (Pe ${(got.pe - predicted.pe).toExponential(1)} km, Ap ${(got.ap - predicted.ap).toExponential(1)} km)`,
  );
  check((await probe(page, 'plan', id)).length === 0, '6. the plan is empty');
  await page.evaluate(() =>
    window.__spaceGame.view.getState().focusOn({ kind: 'body', id: 'moon' }),
  );
  await sleep(1600);
  await page.screenshot({ path: resolve(outDir, 'maneuvers-lunar-orbit.png') });

  // 7. Pause on: with "Node execution" cleared, the clock runs through a node.
  await page.getByRole('button', { name: 'Pause on ▾' }).click();
  await page.getByRole('checkbox', { name: 'Node execution' }).uncheck();
  await page.getByRole('button', { name: 'Pause on ▾' }).click();
  await page.evaluate(
    (s) => window.__spaceGame.view.getState().select({ kind: 'ship', id: s }),
    id,
  );
  await page.getByRole('button', { name: 'Add node ▾' }).click();
  await page.getByRole('menuitem', { name: 'At time T…' }).click();
  await page.getByPlaceholder('1h 30m').fill('10 min');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await sleep(100);
  const tNode = (await probe(page, 'plan', id))[0].t;
  await keys(page, 'Space');
  await setWarp(page, 3);
  const ran = await until(async () => (await simTime(page)) > tNode + 60, 10_000);
  check(!!ran && !(await paused(page)), '7. with node pauses off, the clock runs through the node');
  check((await probe(page, 'plan', id)).length === 0, '7. the node was executed');
  await keys(page, 'Space');
  await setWarp(page, 0);

  // 8. Over budget: a 20 km/s node turns Δv left red.
  await page.evaluate(
    (s) => window.__spaceGame.view.getState().select({ kind: 'ship', id: s }),
    id,
  );
  await page.getByRole('button', { name: 'Add node ▾' }).click();
  await page.getByRole('menuitem', { name: 'At time T…' }).click();
  await page.getByPlaceholder('1h 30m').fill('1h');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await type(page, 'Prograde', '20 km/s');
  await page.getByRole('button', { name: /^◆ Node/, expanded: true }).click();
  const left = page.getByLabel('Δv left after plan');
  const leftText = await left.textContent();
  const leftClass = await left.getAttribute('class');
  check(
    leftText.startsWith('−') && /danger/.test(leftClass),
    `8. Δv left is red and negative (${leftText})`,
  );
}

await smoke('Maneuvers', run);
