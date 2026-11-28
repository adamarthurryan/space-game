import { describe, expect, it } from 'vitest';
import { registry } from '../content/registry';
import { SECONDS_PER_DAY } from '../math/units';
import { add, norm, sub, vec3, type Vec3 } from '../math/vec3';
import { peek, size } from '../math/pqueue';
import { bodyWorldState } from './body';
import { setWarpIndex } from './clock';
import { createEventRegistry, refreshShipDerived, registerShipHandlers } from './events';
import { planBudget, type ManeuverNode } from './maneuver';
import { createShip, shipStats, type OrbitState } from './ship';
import { MU_PLANET, syntheticSystem } from './testSystem';
import { segmentStateAt, type Segment } from './trajectory';
import { addShip, advanceWorld, createWorld, rebuildDerived, type World } from './world';

const sys = syntheticSystem();
const design = registry.designs[0]!;
const R = 7000;
const V = Math.sqrt(MU_PLANET / R);
const leo: OrbitState = { parentId: 'planet', t: 0, r: vec3(R, 0, 0), v: vec3(0, V, 0.3) };
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

const node = (id: string, t: number, prograde: number, normal = 0): ManeuverNode => ({
  id,
  t,
  enabled: true,
  dv: { prograde, normal, radial: 0 },
  execution: 'impulsive',
});

function setUp(plan: ManeuverNode[], orbit = leo): World {
  const w = createWorld(sys, 0);
  const ship = createShip('ship-1', 1, 'S', design, orbit);
  ship.plan = plan;
  addShip(w, ship);
  return w;
}

/** The ship's world position at t, from a list of segments. */
function worldPos(segments: Segment[], t: number): Vec3 {
  const seg = segments.find((s) => s.tStart <= t && t <= s.tEnd)!;
  return add(bodyWorldState(sys, seg.parentId, t).r, segmentStateAt(sys, seg, t).r);
}

/** Runs the clock in 1/60 s frames until t ≥ until (resuming after pauses if asked). */
function run(w: World, until: number, resume: boolean) {
  const reg = createEventRegistry();
  registerShipHandlers(reg);
  const pauses: number[] = [];
  for (let i = 0; i < 1e6 && w.clock.t < until; i++) {
    const r = advanceWorld(w, 1 / 60, reg);
    if (r.pause) {
      pauses.push(w.clock.t);
      if (!resume) return pauses;
      w.clock.paused = false;
    }
  }
  return pauses;
}

describe('node execution', () => {
  it('queues the node and executes it as predicted', () => {
    const w = setUp([node('node-1', 600, 0.5), node('node-2', 4000, -0.2, 0.1)]);
    const ship = w.ships['ship-1']!;
    const before = w.derived.trajectories['ship-1']!;
    expect(size(w.derived.events)).toBe(1);
    expect(peek(w.derived.events)!.key).toBe(600);
    expect(peek(w.derived.events)!.value).toMatchObject({ type: 'node', nodeId: 'node-1' });
    const budget = planBudget(ship, before);
    const oxygen = ship.propellant.oxygen!;

    const pauses = run(w, 601, false);
    expect(pauses).toEqual([600]);
    expect(w.clock.t).toBe(600);
    expect(w.clock.paused).toBe(true);
    expect(ship.plan.map((n) => n.id)).toEqual(['node-2']);
    expect(
      rel(oxygen - ship.propellant.oxygen!, budget.nodes[0]!.propellantUsed.oxygen!),
    ).toBeLessThan(1e-9);
    expect(ship.orbit.t).toBe(600);
    expect(ship.orbit.r).toEqual(before.segments[1]!.r0);
    expect(ship.orbit.v).toEqual(before.segments[1]!.v0);
    // The new trajectory is the old one after the node (apart from the trailing horizon).
    const after = w.derived.trajectories['ship-1']!.segments;
    const old = before.segments.slice(1);
    expect(after.length).toBe(old.length);
    after.forEach((s, i) => {
      const o = old[i]!;
      expect(s.endEvent).toBe(o.endEvent);
      expect(s.r0).toEqual(o.r0);
      expect(s.tStart).toBe(o.tStart);
      if (s.endEvent !== 'horizon') expect(rel(s.tEnd, o.tEnd)).toBeLessThan(1e-9);
      if (s.dvApplied !== undefined) expect(rel(s.dvApplied, o.dvApplied!)).toBeLessThan(1e-9);
    });
    expect(rel(shipStats(ship).dv, budget.dvAvailable - 0.5)).toBeLessThan(1e-9);
  });

  it('matches the prediction at ×10⁷ with pausing off', () => {
    const w = setUp([node('node-1', 600, 2.6), node('node-2', 2 * SECONDS_PER_DAY, 0.1, 0.2)]);
    w.clock.pauseOn.node = false;
    setWarpIndex(w.clock, 7);
    const predicted = w.derived.trajectories['ship-1']!.segments;
    expect(predicted.map((x) => x.endEvent)).not.toContain('impact');
    const tCheck = 10 * SECONDS_PER_DAY;
    expect(run(w, tCheck, false)).toEqual([]);
    const ship = w.ships['ship-1']!;
    expect(ship.plan).toEqual([]);
    // Bring the ship to exactly tCheck along its own trajectory.
    const segs = w.derived.trajectories['ship-1']!.segments;
    const a = worldPos(segs, tCheck);
    const b = worldPos(predicted, tCheck);
    expect(norm(sub(a, b)) / norm(b)).toBeLessThan(1e-9);
  });

  it('pauses at the node, and leaves an event due in the same frame for the next frame', () => {
    const w = setUp([node('node-1', 600, 0.1)]);
    const other = createShip('ship-2', 2, 'T', design, leo);
    other.plan = [node('node-9', 600.5, 0.1)];
    addShip(w, other);
    setWarpIndex(w.clock, 3); // 1000 s per wall second
    const reg = createEventRegistry();
    registerShipHandlers(reg);
    w.clock.t = 599;
    const r = advanceWorld(w, 0.1, reg); // aims for 699
    expect(r).toEqual({ events: 1, pause: true, arrived: false });
    expect(w.clock.t).toBe(600);
    expect(w.ships['ship-2']!.plan.length).toBe(1);
    w.clock.paused = false;
    advanceWorld(w, 0.001, reg);
    expect(w.ships['ship-2']!.plan.length).toBe(0);
  });

  it('pauses at SOI changes and impacts when ticked, and not otherwise', () => {
    const escape: OrbitState = { ...leo, v: vec3(0, V * 1.45, 0) };
    const w = setUp([], escape);
    const tExit = w.derived.trajectories['ship-1']!.segments[0]!.tEnd;
    setWarpIndex(w.clock, 6);
    expect(run(w, tExit + 10, false)).toEqual([]);
    const w2 = setUp([], escape);
    w2.clock.pauseOn['soi-change'] = true;
    setWarpIndex(w2.clock, 6);
    expect(run(w2, tExit + 10, false)).toEqual([tExit]);
    const sub: OrbitState = { ...leo, v: vec3(0, 6, 0) };
    const w3 = setUp([], sub);
    w3.clock.pauseOn.impact = true;
    setWarpIndex(w3.clock, 4);
    const pauses = run(w3, 1e5, false);
    expect(pauses.length).toBe(1);
    expect(w3.ships['ship-1']!.status).toBe('destroyed');
  });

  it('ignores a stale node event', () => {
    const w = setUp([node('node-1', 600, 0.5)]);
    const stale = peek(w.derived.events)!.value;
    const reg = createEventRegistry();
    registerShipHandlers(reg);
    w.ships['ship-1']!.plan[0]!.t = 700;
    refreshShipDerived(w, 'ship-1');
    const orbit = structuredClone(w.ships['ship-1']!.orbit);
    for (const h of reg.handlers.node!) h(w, stale);
    expect(w.ships['ship-1']!.orbit).toEqual(orbit);
    expect(w.ships['ship-1']!.plan.length).toBe(1);
  });
});

describe('trajectory cache', () => {
  it('doesn’t recompute an unchanged ship', () => {
    const w = setUp([node('node-1', 600, 0.5)]);
    const v = w.derived.trajectories['ship-1']!.version;
    const misses = w.derived.cacheStats.misses;
    refreshShipDerived(w, 'ship-1');
    expect(w.derived.trajectories['ship-1']!.version).toBe(v);
    expect(w.derived.cacheStats.misses).toBe(misses);
  });

  it('hits when an edit is restored, and leaves other ships alone', () => {
    const w = setUp([node('node-1', 600, 0.5)]);
    addShip(w, createShip('ship-2', 2, 'T', design, leo));
    const v2 = w.derived.trajectories['ship-2']!.version;
    const n = w.ships['ship-1']!.plan[0]!;
    const original = w.derived.trajectories['ship-1']!.segments;
    n.dv.prograde = 0.7;
    refreshShipDerived(w, 'ship-1');
    expect(w.derived.trajectories['ship-1']!.segments).not.toEqual(original);
    const hits = w.derived.cacheStats.hits;
    n.dv.prograde = 0.5;
    refreshShipDerived(w, 'ship-1');
    expect(w.derived.cacheStats.hits).toBe(hits + 1);
    expect(w.derived.trajectories['ship-1']!.segments).toBe(original);
    expect(w.derived.trajectories['ship-2']!.version).toBe(v2);
    n.enabled = false;
    refreshShipDerived(w, 'ship-1');
    expect(w.derived.trajectories['ship-1']!.segments.length).toBe(1);
  });

  it('is rebuilt by rebuildDerived with the same segments and event times', () => {
    const w = setUp([node('node-1', 600, 0.5), node('node-2', 4000, 0.1)]);
    const segs = w.derived.trajectories['ship-1']!.segments;
    const t = peek(w.derived.events)!.key;
    rebuildDerived(w);
    expect(w.derived.trajectories['ship-1']!.segments).toEqual(segs);
    expect(peek(w.derived.events)!.key).toBe(t);
  });

  it('keeps plans as plain data', () => {
    const w = setUp([node('node-1', 600, 0.5)]);
    const rest = { ...w, derived: undefined };
    expect(JSON.parse(JSON.stringify(rest))).toEqual({ ...rest, derived: undefined });
  });
});
