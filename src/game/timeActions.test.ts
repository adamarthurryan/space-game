import { describe, expect, it } from 'vitest';
import { SMOKE_TLI } from '../gen/lunarMission';
import { presetOrbit } from '../gen/sandboxShips';
import { createSandboxWorld } from '../gen/scenario';
import { add } from '../math/vec3';
import { bodyWorldState } from '../sim/body';
import { WARP_TO_NODE_LEAD } from '../sim/clock';
import { createEventRegistry, registerShipHandlers } from '../sim/events';
import { trajectoryStateAt } from '../sim/trajectory';
import { upcomingEvents } from '../sim/upcoming';
import { advanceWorld, type World } from '../sim/world';
import {
  addNode,
  cancelWarpTo,
  editNode,
  spawnShip,
  togglePause,
  warpToNextEvent,
  warpToNode,
} from './actions';

const reg = createEventRegistry();
registerShipHandlers(reg);

/** A sandbox world with a "LEO (lunar plane)" ship carrying the smoke test's TLI node. */
function lunarWorld(): { w: World; id: string; nodeId: string } {
  const w = createSandboxWorld();
  const r = spawnShip(w, {
    designId: 'starship',
    orbit: presetOrbit(w.system, 'leo-lunar-plane', 0),
  });
  const id = r.ok ? r.value : '';
  const n = addNode(w, id, {
    t: SMOKE_TLI.dt,
    dv: { prograde: SMOKE_TLI.dv, normal: 0, radial: 0 },
  });
  return { w, id, nodeId: n.ok ? n.value : '' };
}

/** Runs frames until the clock pauses. */
function runToPause(w: World) {
  for (let i = 0; i < 1e5 && !w.clock.paused; i++) advanceWorld(w, 1 / 60, reg);
}

/** The world without its derived data, as JSON. */
const without = (w: World) => JSON.parse(JSON.stringify({ ...w, derived: null })) as unknown;

describe('warpToNode (S5-4)', () => {
  it('stops a minute before the node, paused, and leaves the node to be edited', () => {
    const { w, id, nodeId } = lunarWorld();
    w.clock.paused = true;
    expect(warpToNode(w, id, nodeId).ok).toBe(true);
    expect(w.clock.paused).toBe(false);
    expect(w.clock.warpTo!.t).toBe(SMOKE_TLI.dt - WARP_TO_NODE_LEAD);
    runToPause(w);
    expect(w.clock.t).toBe(SMOKE_TLI.dt - WARP_TO_NODE_LEAD);
    expect(w.ships[id]!.plan).toHaveLength(1);
    expect(editNode(w, id, nodeId, { dv: { prograde: SMOKE_TLI.dv + 1e-6 } }).ok).toBe(true);
  });

  it('refuses a disabled, unreached, near or unknown node, changing nothing', () => {
    const { w, id, nodeId } = lunarWorld();
    for (const f of [() => warpToNode(w, id, 'node-99'), () => warpToNode(w, 'ship-99', nodeId)]) {
      const before = without(w);
      expect(f().ok).toBe(false);
      expect(without(w)).toEqual(before);
    }
    // A node the trajectory doesn't reach: one placed past the end of a later, shorter path.
    const ship = w.ships[id]!;
    ship.plan.push({ ...ship.plan[0]!, id: 'node-unreached', t: 1e12 });
    expect(warpToNode(w, id, 'node-unreached')).toEqual({
      ok: false,
      error: 'The node is not reached',
    });
    ship.plan.pop();
    expect(editNode(w, id, nodeId, { enabled: false }).ok).toBe(true);
    const before = without(w);
    expect(warpToNode(w, id, nodeId)).toEqual({ ok: false, error: 'The node is disabled' });
    expect(without(w)).toEqual(before);
    expect(editNode(w, id, nodeId, { enabled: true, t: 30 }).ok).toBe(true);
    expect(warpToNode(w, id, nodeId)).toEqual({
      ok: false,
      error: 'The node is less than a minute away',
    });
  });
});

describe('warpToNextEvent (S5-5)', () => {
  it('steps through a TLI: before the node, then exactly at the Moon SOI entry', () => {
    const { w, id } = lunarWorld();
    const first = warpToNextEvent(w, id);
    expect(first.ok && first.value.kind).toBe('node');
    runToPause(w);
    expect(w.clock.t).toBe(SMOKE_TLI.dt - WARP_TO_NODE_LEAD);
    // Play through the node (Pause on stops there), then warp to the next event.
    togglePause(w);
    runToPause(w);
    expect(w.clock.t).toBe(SMOKE_TLI.dt);

    // Done when: the arrival positions are the ones predicted before the warp.
    const entry = upcomingEvents(w, id).events.find((e) => e.kind === 'soi-enter')!;
    expect(entry.bodyId).toBe('moon');
    const p = trajectoryStateAt(w.system, w.derived.trajectories[id]!.segments, entry.t)!;
    const predictedShip = add(bodyWorldState(w.system, p.parentId, entry.t).r, p.state.r);
    const predictedMoon = bodyWorldState(w.system, 'moon', entry.t).r;

    const next = warpToNextEvent(w, id);
    expect(next.ok && next.value.kind).toBe('soi-enter');
    expect(w.clock.warpTo!.label).toBe('Moon SOI entry');
    runToPause(w);
    expect(w.clock.t).toBe(entry.t);
    const ship = w.ships[id]!;
    expect(ship.orbit.parentId).toBe('moon');
    const shipPos = add(bodyWorldState(w.system, 'moon', w.clock.t).r, ship.orbit.r);
    for (const k of ['x', 'y', 'z'] as const) {
      expect(Math.abs(shipPos[k] - predictedShip[k])).toBeLessThan(1e-9 * 4e5);
    }
    expect(bodyWorldState(w.system, 'moon', w.clock.t).r).toEqual(predictedMoon);
  });

  it('with no ship, picks the earliest event of any ship; refuses when nothing is left', () => {
    const { w } = lunarWorld();
    const r = warpToNextEvent(w, null);
    expect(r.ok).toBe(true);
    const stops = Object.keys(w.ships).flatMap((id) => upcomingEvents(w, id).events);
    expect(stops.length).toBeGreaterThan(0);
    const empty = createSandboxWorld();
    for (const id of Object.keys(empty.ships)) delete empty.ships[id];
    expect(warpToNextEvent(empty, null)).toEqual({ ok: false, error: 'No upcoming events' });
  });

  it('cancelWarpTo ends it, and refuses when none runs', () => {
    const { w, id } = lunarWorld();
    expect(cancelWarpTo(w).ok).toBe(false);
    warpToNextEvent(w, id);
    expect(cancelWarpTo(w).ok).toBe(true);
    expect(w.clock.warpTo).toBeNull();
  });
});
