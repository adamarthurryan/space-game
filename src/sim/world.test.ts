import { describe, expect, it } from 'vitest';
import { buildBodySystem } from './body';
import { registry } from '../content/registry';
import { peek, pop, size } from '../math/pqueue';
import { SECONDS_PER_DAY } from '../math/units';
import { add, norm, sub, vec3 } from '../math/vec3';
import { bodyWorldState } from './body';
import { DEFAULT_PAUSE_ON, setWarpIndex } from './clock';
import { createEventRegistry, dispatch, on, registerShipHandlers } from './events';
import { createShip, shipStateAt, type OrbitState } from './ship';
import { MU_PLANET, syntheticSystem } from './testSystem';
import { HORIZON_CAP, segmentStateAt } from './trajectory';
import { addShip, advanceWorld, createWorld, rebuildDerived, type World } from './world';

const system = buildBodySystem(2_451_545, [
  {
    id: 'sun',
    name: 'Sun',
    class: 'star',
    parentId: null,
    mu: 1.327_124_400_18e11,
    radius: 695_700,
    atmosphereHeight: 0,
  },
]);

describe('world', () => {
  it('holds the system and a running clock', () => {
    const w = createWorld(system, 7);
    expect(w.system).toBe(system);
    expect(w.clock).toEqual({ t: 7, warpIndex: 0, paused: false, pauseOn: DEFAULT_PAUSE_ON });
  });

  it('survives a JSON round trip', () => {
    const w = createWorld(system, 1e6);
    setWarpIndex(w.clock, 6);
    expect(JSON.parse(JSON.stringify(w))).toEqual(w);
  });
});

describe('ships in the world', () => {
  const starship = registry.design('starship')!;
  const rp = 6700;
  const escape: OrbitState = {
    parentId: 'planet',
    t: 0,
    r: vec3(rp, 0, 0),
    v: vec3(0, 0, 1.2 * Math.sqrt((2 * MU_PLANET) / rp)),
  };
  /** An orbit from a 6771 km apoapsis with a 6000 km periapsis: impacts within half an orbit. */
  const ra = 6771;
  const suborbital: OrbitState = {
    parentId: 'planet',
    t: 0,
    r: vec3(ra, 0, 0),
    v: vec3(0, Math.sqrt(MU_PLANET * (2 / ra - 2 / (ra + 6000))), 0),
  };
  const leo: OrbitState = {
    parentId: 'planet',
    t: 0,
    r: vec3(0, 7000, 0),
    v: vec3(-Math.sqrt(MU_PLANET / 7000), 0, 0),
  };

  function setUp(...orbits: OrbitState[]) {
    const w = createWorld(syntheticSystem(), 0);
    orbits.forEach((o, i) =>
      addShip(w, createShip(`ship-${i + 1}`, i + 1, `S${i + 1}`, starship, o)),
    );
    const reg = createEventRegistry();
    registerShipHandlers(reg);
    return { w, reg };
  }

  it('adding a ship computes its trajectory and queues one event', () => {
    const { w } = setUp(escape);
    expect(w.derived.trajectories['ship-1']!.segments[0]!.endEvent).toBe('soi-exit');
    expect(size(w.derived.events)).toBe(1);
    expect(peek(w.derived.events)!.value).toEqual({
      type: 'soi-change',
      shipId: 'ship-1',
      trajectoryVersion: 1,
    });
    expect(w.nextShipSeq).toBe(2);
  });

  it('soi-change re-bases the orbit to segment 1, which becomes segment 0', () => {
    const { w, reg } = setUp(escape);
    const before = w.derived.trajectories['ship-1']!.segments;
    w.clock.t = before[0]!.tEnd;
    dispatch(reg, w, pop(w.derived.events)!.value);
    const ship = w.ships['ship-1']!;
    expect(ship.orbit).toEqual({
      parentId: 'star',
      t: before[1]!.tStart,
      r: before[1]!.r0,
      v: before[1]!.v0,
    });
    const after = w.derived.trajectories['ship-1']!;
    expect(after.version).toBe(2);
    // The horizon cap counts from the re-based start, so only a horizon end moves.
    const { tEnd, ...rest } = after.segments[0]!;
    const { tEnd: tEndBefore, ...restBefore } = before[1]!;
    expect(rest).toEqual(restBefore);
    if (rest.endEvent === 'horizon') expect(tEnd).toBeGreaterThan(tEndBefore);
    else expect(tEnd).toBe(tEndBefore);
    expect(peek(w.derived.events)!.key).toBe(after.segments[0]!.tEnd);
  });

  it('impact destroys the ship, clears its trajectory and queues nothing', () => {
    const { w, reg } = setUp(suborbital);
    const seg = w.derived.trajectories['ship-1']!.segments[0]!;
    expect(seg.endEvent).toBe('impact');
    w.clock.warpIndex = 7;
    while (w.ships['ship-1']!.status === 'coasting') advanceWorld(w, 1 / 60, reg);
    const ship = w.ships['ship-1']!;
    expect(ship.destroyedAt).toEqual({ t: seg.tEnd, bodyId: 'planet' });
    expect(w.derived.trajectories['ship-1']!.segments).toEqual([]);
    expect(size(w.derived.events)).toBe(0);
  });

  it('ignores a stale event', () => {
    const { w, reg } = setUp(escape);
    const orbit = structuredClone(w.ships['ship-1']!.orbit);
    dispatch(reg, w, { type: 'soi-change', shipId: 'ship-1', trajectoryVersion: 0 });
    dispatch(reg, w, { type: 'impact', shipId: 'ship-1', trajectoryVersion: 0 });
    expect(w.ships['ship-1']!.orbit).toEqual(orbit);
    expect(w.ships['ship-1']!.status).toBe('coasting');
    expect(w.derived.trajectories['ship-1']!.version).toBe(1);
  });

  it('a horizon event re-bases to the state at t', () => {
    const { w, reg } = setUp(leo);
    const seg = w.derived.trajectories['ship-1']!.segments[0]!;
    expect(seg.endEvent).toBe('horizon');
    w.clock.t = seg.tEnd;
    dispatch(reg, w, pop(w.derived.events)!.value);
    expect(w.ships['ship-1']!.orbit.t).toBe(seg.tEnd);
    expect(peek(w.derived.events)!.key).toBe(seg.tEnd + HORIZON_CAP);
  });

  it('at ×10⁷, an escape ship is re-based into the star at the exact event time', () => {
    const { w, reg } = setUp(escape);
    const original = w.derived.trajectories['ship-1']!.segments;
    const handled: number[] = [];
    on(reg, 'soi-change', (wd) => void handled.push(wd.clock.t));
    w.clock.warpIndex = 7;
    while (w.clock.t < 60 * SECONDS_PER_DAY) advanceWorld(w, 1 / 60, reg);
    const ship = w.ships['ship-1']!;
    expect(ship.orbit.parentId).toBe('star');
    expect(handled).toEqual(
      original.filter((s) => s.tEnd <= w.clock.t && s.endEvent !== 'horizon').map((s) => s.tEnd),
    );
    const t = w.clock.t;
    const seg = original.find((s) => s.tStart <= t && t <= s.tEnd)!;
    const want = add(
      segmentStateAt(w.system, seg, t).r,
      bodyWorldState(w.system, seg.parentId, t).r,
    );
    const got = add(
      shipStateAt(w.system, ship, t).r,
      bodyWorldState(w.system, ship.orbit.parentId, t).r,
    );
    expect(norm(sub(got, want)) / norm(want)).toBeLessThan(1e-6);
  });

  it('rebuildDerived reproduces the incremental trajectories and event times', () => {
    const { w, reg } = setUp(escape, suborbital, leo);
    w.clock.warpIndex = 7;
    while (w.clock.t < 10 * SECONDS_PER_DAY) advanceWorld(w, 1 / 60, reg);
    const strip = (x: World['derived']) => ({
      segments: Object.fromEntries(
        Object.entries(x.trajectories).map(([id, tr]) => [id, tr.segments]),
      ),
      times: [...x.events.heap].map((e) => [e.key, e.value.shipId, e.value.type]).sort(),
    });
    const incremental = strip(w.derived);
    rebuildDerived(w);
    expect(strip(w.derived)).toEqual(incremental);
  });

  it('the world without derived survives a JSON round trip', () => {
    const { w } = setUp(escape, leo);
    const rest: Partial<World> = { ...w };
    delete rest.derived;
    expect(JSON.parse(JSON.stringify(rest))).toEqual(rest);
  });
});
