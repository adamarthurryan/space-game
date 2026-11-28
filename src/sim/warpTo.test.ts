import { describe, expect, it } from 'vitest';
import { registry } from '../content/registry';
import { SECONDS_PER_DAY } from '../math/units';
import { vec3 } from '../math/vec3';
import {
  MAX_WARP,
  setPaused,
  setWarpIndex,
  startWarpTo,
  warpDown,
  warpToRate,
  warpUp,
  WARP_TO_MIN_RATE,
  type Clock,
} from './clock';
import { createEventRegistry, registerShipHandlers } from './events';
import type { ManeuverNode } from './maneuver';
import { createShip, type OrbitState } from './ship';
import { MU_PLANET, syntheticSystem } from './testSystem';
import { addShip, advanceWorld, createWorld, type World } from './world';

const sys = syntheticSystem();
const R = 7000;
const V = Math.sqrt(MU_PLANET / R);
const leo: OrbitState = { parentId: 'planet', t: 0, r: vec3(R, 0, 0), v: vec3(0, V, 0.3) };
const escape: OrbitState = { ...leo, v: vec3(0, V * 1.45, 0) };
const node = (id: string, t: number, prograde: number): ManeuverNode => ({
  id,
  t,
  enabled: true,
  dv: { prograde, normal: 0, radial: 0 },
  execution: 'impulsive',
});

function setUp(orbit: OrbitState, plan: ManeuverNode[] = []): World {
  const w = createWorld(sys, 0);
  const ship = createShip('ship-1', 1, 'S', registry.designs[0]!, orbit);
  ship.plan = plan;
  addShip(w, ship);
  return w;
}

const reg = createEventRegistry();
registerShipHandlers(reg);
const warpTo = (c: Clock, t: number) =>
  startWarpTo(c, { t, kind: 'event', shipId: null, label: 'x' });

describe('warpToRate (S5-3)', () => {
  it('is the top step far away, eases in, and has a floor', () => {
    expect(warpToRate(1e9)).toBe(MAX_WARP);
    expect(warpToRate(1e4)).toBeCloseTo(1e5, 6);
    expect(warpToRate(1)).toBe(WARP_TO_MIN_RATE);
    const xs = [0, 1, 10, 1e3, 1e5, 1e7, 1e9].map(warpToRate);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]!);
  });
});

describe('warp-to in advanceWorld (S5-3)', () => {
  it('arrives exactly, paused, once, with the warp step unchanged, in a few wall seconds', () => {
    const w = setUp(leo);
    w.clock.paused = true;
    setWarpIndex(w.clock, 2);
    w.clock.paused = true;
    const stop = 30 * SECONDS_PER_DAY;
    warpTo(w.clock, stop);
    expect(w.clock.paused).toBe(false);
    let frames = 0;
    let arrivals = 0;
    while (!w.clock.paused && frames < 1e5) {
      if (advanceWorld(w, 1 / 60, reg).arrived) arrivals++;
      frames++;
    }
    expect(w.clock.t).toBe(stop);
    expect(w.clock.warpTo).toBeNull();
    expect(arrivals).toBe(1);
    expect(w.clock.warpIndex).toBe(2);
    expect(frames / 60).toBeGreaterThan(0.2);
    expect(frames / 60).toBeLessThan(4);
  });

  it('handles events on the way at their times, and stops early at a Pause-on event', () => {
    const w = setUp(leo, [node('node-1', 5000, 0.01)]);
    warpTo(w.clock, SECONDS_PER_DAY);
    let r;
    do r = advanceWorld(w, 1 / 60, reg);
    while (!w.clock.paused);
    expect(r.pause).toBe(true);
    expect(w.clock.t).toBe(5000);
    expect(w.clock.warpTo).toBeNull();
    expect(w.ships['ship-1']!.plan).toEqual([]);
  });

  it('handles an event exactly at the stop before pausing', () => {
    const w = setUp(escape);
    const exit = w.derived.trajectories['ship-1']!.segments[0]!.tEnd;
    warpTo(w.clock, exit);
    let r;
    do r = advanceWorld(w, 1 / 60, reg);
    while (!w.clock.paused);
    expect(r.arrived).toBe(true);
    expect(w.clock.t).toBe(exit);
    expect(w.ships['ship-1']!.orbit.parentId).toBe('star');
  });

  it('is cancelled by play/pause and warp changes', () => {
    for (const f of [
      (c: Clock) => setPaused(c, true),
      (c: Clock) => setPaused(c, false),
      warpUp,
      warpDown,
      (c: Clock) => setWarpIndex(c, 3),
    ]) {
      const w = setUp(leo);
      warpTo(w.clock, 1e6);
      f(w.clock);
      expect(w.clock.warpTo).toBeNull();
    }
  });
});
