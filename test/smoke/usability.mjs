// Headless-browser checks of the interface review: the acceptance criteria of sprint 5b
// (planning/sprint-5b.md, "test/smoke/usability.mjs").
//
//   npm run smoke
//
// Reads the dev-only debug handle `window.__spaceGame`: frame(), fly(), flash(),
// encounterGhosts(), labels() (with the parts of merged labels), gizmo() (with visible, conicPx
// and armPx), trajectoryMarkers(), timeline() (with ticks and beyondX), plus the earlier probes.

import { resolve } from 'node:path';
import { outDir, smoke, url } from './lib.mjs';

// The TLI (S4-19): seconds after the spawn, and prograde km/s. Keep in step with SMOKE_TLI in
// src/gen/lunarMission.ts; test/smoke/constants.test.ts checks this file has them.
const TLI = { dt: 3600, dv: 3.130535 };
const DEG = Math.PI / 180;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probe = (page, name, ...args) =>
  page.evaluate(([n, a]) => window.__spaceGame[n](...a), [name, args]);
const view = (page) => page.evaluate(() => window.__spaceGame.view.getState());
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

/** Presses keys with nothing focused, so they reach the map shortcuts. */
async function keys(page, ...ks) {
  await page.evaluate(
    () => document.activeElement instanceof HTMLElement && document.activeElement.blur(),
  );
  for (const k of ks) await page.keyboard.press(k);
}

/** Turns the wheel over the canvas centre (+ = out), and lets the zoom settle. */
async function wheel(page, notches) {
  const c = await page.locator('main canvas').boundingBox();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
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

const rel = (a, b) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / Math.max(Math.hypot(b.x, b.y, b.z), 1);

/** Waits for a warp-to to arrive (the clock pauses there). */
const arrived = (page) =>
  until(async () => {
    const c = await probe(page, 'clock');
    return c.warpTo === null && c.paused;
  }, 20_000);

async function run(page, check) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('main canvas');
  await page.waitForFunction(() => window.__spaceGame !== undefined);
  await sleep(300);

  // 1. Start view (S5b-10) and no placeholder chrome (S5b-22).
  const cam0 = await probe(page, 'camera');
  const moonApo = await page.evaluate(() => {
    const o = window.__spaceGame.world.getState().world.system.bodies.moon.orbit;
    return o.a * (1 + o.e);
  });
  check((await view(page)).selected === null, '1. nothing is selected at start');
  check(
    cam0.focusId === 'earth' &&
      Math.abs(cam0.distance / (3 * moonApo) - 1) < 1e-3 &&
      cam0.pole.z > 0.999999 &&
      Math.abs(cam0.pitch - 90 * DEG) < 1e-9,
    `1. the camera looks down the ecliptic pole at Earth's framing (${cam0.distance.toFixed(0)} km, pitch ${(cam0.pitch / DEG).toFixed(3)}°)`,
  );
  const chrome = await page.evaluate(() => ({
    menu: !!document.querySelector('button[aria-label="Menu"]'),
    counts: /⚠|⏰/.test(document.querySelector('header')?.textContent ?? ''),
    tabs: Array.from(document.querySelectorAll('[role="tab"]')).map((t) => t.textContent),
    filters: /Filters/.test(document.querySelector('#left-sidebar')?.textContent ?? ''),
  }));
  check(
    !chrome.menu && !chrome.counts && !chrome.filters && chrome.tabs.join(',') === 'System,Fleets',
    `1. no ≡, ⚠, ⏰, Stations, Routes or Filters (${JSON.stringify(chrome)})`,
  );
  await page.screenshot({ path: resolve(outDir, 'usability-start.png') });

  // 2. Spawn LEO (lunar plane): selected and flashing, not active, the camera unmoved (S5b-11).
  await keys(page, 'Space'); // pause: planning happens at a fixed time
  await page.getByRole('tab', { name: 'Fleets' }).click();
  await page.getByRole('button', { name: 'Spawn ship…' }).click();
  await page.getByLabel('Preset').selectOption('leo-lunar-plane');
  await page.getByRole('button', { name: 'Spawn', exact: true }).click();
  await sleep(200);
  const id = (await view(page)).selected?.id;
  check(
    (await view(page)).selected?.kind === 'ship' && (await probe(page, 'activeShip')) === null,
    `2. the spawned ship ${id} is selected, and no ship is active`,
  );
  check(
    (await probe(page, 'fly'))?.label === 'Fly Starship 4 (A)',
    `2. Fly reads "Fly Starship 4 (A)" (${(await probe(page, 'fly'))?.label})`,
  );
  const flash = await probe(page, 'flash');
  const earthLabel = (await probe(page, 'labels')).find((l) => l.id === 'earth');
  check(flash?.ref.id === id, `2. the ship flashes (${JSON.stringify(flash)})`);
  check(
    earthLabel?.parts?.join(',') === `earth,${id}`,
    `2. its label merges with Earth's: "Earth · Starship 4" (${earthLabel?.parts})`,
  );
  check(
    Math.abs((await probe(page, 'camera')).distance / cam0.distance - 1) < 1e-9,
    '2. the camera distance is unchanged',
  );
  await page.screenshot({ path: resolve(outDir, 'usability-merged-label.png') });

  // 3. Activate with A (S5b-6): Fly shows ★, and the frame follows the ship.
  await keys(page, 'KeyA');
  await sleep(100);
  const fly = await probe(page, 'fly');
  const frame3 = await probe(page, 'frame');
  check((await probe(page, 'activeShip')) === id, '3. A makes the ship active');
  check(fly?.label === '★ Starship 4' && fly.pressed, `3. Fly shows ★, pressed (${fly?.label})`);
  check(
    frame3.ref.kind === 'ship-parent' && frame3.ref.shipId === id && frame3.bodyId === 'earth',
    `3. the frame follows the ship, with Earth (${JSON.stringify(frame3)})`,
  );

  // 4. F on an object on screen moves only the centre (S5b-5).
  const before4 = await probe(page, 'camera');
  await keys(page, 'KeyF');
  await until(async () => {
    const c = await probe(page, 'camera');
    return c.focusId === id && !c.animating;
  }, 3000);
  const after4 = await probe(page, 'camera');
  check(
    after4.focusId === id &&
      Math.abs(after4.distance / before4.distance - 1) < 1e-9 &&
      after4.yaw === before4.yaw &&
      after4.pitch === before4.pitch,
    `4. F moves the centre to the ship and keeps the distance, yaw and pitch (${after4.distance.toFixed(0)} km)`,
  );

  // 5. A circular orbit has no Pe or Ap (S5b-20); the popover closes on Esc (S5b-21).
  await page.getByRole('button', { name: 'Add node ▾' }).click();
  const ap = page.getByRole('menuitem', { name: 'At next Ap' });
  check(
    (await ap.isDisabled()) && (await ap.getAttribute('title')) === 'Circular orbit',
    '5. "At next Ap" is disabled with "Circular orbit"',
  );
  const apsides = (await probe(page, 'trajectoryMarkers')).filter(
    (m) => m.shipId === id && (m.kind === 'periapsis' || m.kind === 'apoapsis'),
  );
  check(apsides.length === 0, `5. no Pe or Ap markers (${apsides.length})`);
  await keys(page, 'Escape');
  await sleep(100);
  check(
    (await page.getByRole('menu', { name: 'Add node' }).count()) === 0 &&
      (await view(page)).selected?.id === id,
    '5. Esc closes the menu, and the ship stays selected',
  );

  // 6. Plan the TLI through "At time T…" and the fields: the editor is inline (S5b-17).
  await page.getByRole('button', { name: 'Add node ▾' }).click();
  await page.getByRole('menuitem', { name: 'At time T…' }).click();
  await page.getByPlaceholder('1h 30m').fill('1h');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await sleep(100);
  await type(page, 'Prograde', `${TLI.dv} km/s`);
  const nodeRow = page.getByRole('button', { name: /^◆ Node 1/, expanded: true });
  check(
    (await nodeRow.count()) === 1 &&
      (await page.getByRole('region', { name: 'Node editor' }).count()) === 1 &&
      (await page.getByLabel('Δv left after plan').isVisible()),
    "6. the node's row is expanded inside the ship inspector, with Δv left after plan",
  );
  const pro = await page.getByLabel('Prograde', { exact: true }).inputValue();
  check(pro === '3130.5 m/s', `6. the Prograde field reads "3130.5 m/s" (${pro})`);
  const timeFits = await page
    .getByLabel('Time', { exact: true })
    .evaluate((el) => el.scrollWidth <= el.clientWidth);
  check(timeFits, '6. the Time field shows its whole value');
  await page.screenshot({ path: resolve(outDir, 'usability-inline-editor.png') });

  // 7. The Moon at the SOI entry (S5b-13).
  const ghosts = await probe(page, 'encounterGhosts');
  const g = ghosts[0];
  const earthNow = await probe(page, 'bodyWorld', 'earth');
  await page.evaluate((t) => window.__spaceGame.view.getState().startPreview(t, true), g?.t ?? 0);
  await sleep(200);
  const moonT = await probe(page, 'bodyWorld', 'moon');
  const earthT = await probe(page, 'bodyWorld', 'earth');
  await keys(page, 'Escape');
  await sleep(200);
  const want = {
    x: earthNow.x + moonT.x - earthT.x,
    y: earthNow.y + moonT.y - earthT.y,
    z: earthNow.z + moonT.z - earthT.z,
  };
  check(
    ghosts.length === 1 && g.bodyId === 'moon' && g.text === 'Moon at entry',
    `7. one Moon ghost, labelled "Moon at entry" (${ghosts.map((x) => `${x.bodyId}: ${x.text}`)})`,
  );
  check(
    g && moonT.t === g.t && rel(g.world, want) < 1e-6,
    `7. at the Moon's position at the entry, in the frame (rel ${g && rel(g.world, want)})`,
  );
  await wheel(page, -3);
  await page.screenshot({ path: resolve(outDir, 'usability-encounter.png') });

  // 8. The gizmo follows the planned path's size on screen (decision 181): full size at 150 px
  // and above, shrinking to 20 px arms at 37.5 px, hidden below. Zoom in, then out notch by notch.
  await wheel(page, -4);
  const gzIn = await probe(page, 'gizmo');
  check(
    gzIn?.visible === true && gzIn.armPx === 60,
    `8. zoomed in, the gizmo shows at full size (path ${gzIn?.conicPx?.toFixed(0)} px)`,
  );
  let shrunk = null;
  let notches = 0;
  let gz = gzIn;
  while (gz?.visible && notches < 40) {
    await wheel(page, 1);
    notches++;
    gz = await probe(page, 'gizmo');
    if (gz?.visible && gz.armPx < 60 && !shrunk) shrunk = gz;
  }
  check(
    shrunk !== null && shrunk.armPx >= 20 && shrunk.conicPx < 150 && shrunk.conicPx >= 37.5,
    `8. zooming out, it shrinks (arm ${shrunk?.armPx?.toFixed(1)} px, path ${shrunk?.conicPx?.toFixed(0)} px)`,
  );
  check(
    gz?.visible === false && gz.conicPx < 37.5,
    `8. further out, it hides (path ${gz?.conicPx?.toFixed(0)} px, ${notches} notches)`,
  );
  await wheel(page, -notches);
  check((await probe(page, 'gizmo'))?.visible === true, '8. zoomed back in, it shows again');

  // 9. The frame changes on focus or activation only (decision 183); Frame ▾ (S5b-4).
  await page.getByRole('tab', { name: 'System' }).click();
  const earthItem = page.getByRole('treeitem', { name: 'Earth', exact: true });
  if ((await earthItem.getAttribute('aria-expanded')) === 'false') {
    await earthItem.getByText('▸', { exact: true }).first().click();
  }
  const row = (name) =>
    page.getByRole('treeitem', { name, exact: true }).getByText(name, { exact: true }).first();
  await row('Moon').click();
  const frame9 = await probe(page, 'frame');
  check(
    frame9.ref.kind === 'ship-parent' && frame9.bodyId === 'earth',
    `9. selecting the Moon leaves the frame following the ship (${JSON.stringify(frame9.ref)})`,
  );
  await page.getByRole('button', { name: /^Frame: Earth \(Starship 4\)/ }).click();
  const options = await page.getByRole('menuitemradio').allTextContents();
  check(
    options.join(',') === 'Earth,Sun,Moon',
    `9. Frame ▾ lists Earth, Sun and the selected Moon (${options})`,
  );
  await page.getByRole('menuitemradio', { name: 'Moon' }).click();
  const moonFrame = await probe(page, 'frame');
  check(
    moonFrame.ref.kind === 'body' && moonFrame.bodyId === 'moon',
    '9. choosing Moon sets a fixed Moon frame',
  );
  await row('Earth').dblclick();
  const earthFrame = await probe(page, 'frame');
  check(
    earthFrame.ref.kind === 'body' && earthFrame.bodyId === 'earth',
    `9. focusing Earth sets the frame to Earth (${JSON.stringify(earthFrame.ref)})`,
  );

  // 10. A non-active ship's plan is read-only (S5b-8).
  await page.getByRole('tab', { name: 'Fleets' }).click();
  await page.getByRole('option', { name: /Kestrel/ }).click();
  check((await probe(page, 'activeShip')) === id, '10. selecting Kestrel keeps the active ship');
  check(
    (await page.getByRole('button', { name: 'Add node ▾' }).isDisabled()) &&
      (await page.getByText('Read-only: fly this ship to edit (A)').isVisible()),
    "10. Kestrel's Add node ▾ is disabled, with the read-only line",
  );

  // 11. The strip's ticks never move (S5b-23); shading past the prediction (S5b-24). A retrograde
  // node before the TLI drops the orbit into Earth, so the prediction ends at an impact.
  const ticks0 = (await probe(page, 'timeline')).ticks;
  const impactNode = await store(
    page,
    (g, id, tli) => {
      const w = g.world.getState();
      const t0 = w.world.clock.t;
      const r = w.addNode(id, { t: t0 + tli.dt / 2, dv: { prograde: -0.3, normal: 0, radial: 0 } });
      return r.ok ? r.value : null;
    },
    id,
    TLI,
  );
  await sleep(200);
  await page.getByRole('button', { name: 'Warp to next event' }).click();
  await arrived(page);
  await sleep(300);
  const tl = await probe(page, 'timeline');
  const same = tl.ticks.length === ticks0.length && tl.ticks.every((t, i) => t.x === ticks0[i].x);
  check(same, `11. after a warp-to, the ticks haven't moved (${tl.ticks.map((t) => t.label)})`);
  const impact = tl.glyphs.find((x) => x.kind === 'impact');
  check(
    impact && tl.beyondX !== null && Math.abs(tl.beyondX - impact.x) < 1,
    `11. the shading starts at the impact glyph (${tl.beyondX?.toFixed(1)} vs ${impact?.x.toFixed(1)})`,
  );
  await page.screenshot({ path: resolve(outDir, 'usability-strip.png') });
  await store(page, (g, id, n) => g.world.getState().deleteNode(id, n), id, impactNode);

  // 12. The frame follows the active ship into the Moon's SOI (S5b-3).
  await page.getByRole('option', { name: /Starship 4/ }).click();
  await keys(page, 'KeyA');
  // Run through the TLI node, then warp to the next event: the Moon SOI entry.
  const tNode = await store(page, (g, id) => g.world.getState().world.ships[id].plan[0].t, id);
  await keys(page, 'Space');
  await until(async () => (await probe(page, 'simTime')) > tNode + 1, 10_000);
  const c12 = await probe(page, 'clock');
  if (!c12.paused) await keys(page, 'Space');
  for (let i = 0; i < 4 && (await probe(page, 'frame')).bodyId !== 'moon'; i++) {
    await page.getByRole('button', { name: 'Warp to next event' }).click();
    await arrived(page);
  }
  const frame12 = await probe(page, 'frame');
  check(
    frame12.ref.kind === 'ship-parent' && frame12.bodyId === 'moon',
    `12. after the Moon SOI entry, the frame resolves to the Moon (${JSON.stringify(frame12)})`,
  );
}

smoke('Usability', run);
