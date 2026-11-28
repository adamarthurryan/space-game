import { describe, expect, it } from 'vitest';
import { registry } from '../content/registry';
import { vec3 } from '../math/vec3';
import type { ManeuverNode } from './maneuver';
import { createShip, type OrbitState } from './ship';
import { MU_PLANET, PLANET_RADIUS, syntheticSystem } from './testSystem';
import { nextWarpStop, upcomingEvents, warpStopTime } from './upcoming';
import { addShip, createWorld, type World } from './world';

const sys = syntheticSystem();
const design = registry.designs[0]!;
const R = 7000;
const V = Math.sqrt(MU_PLANET / R);
const leo: OrbitState = { parentId: 'planet', t: 0, r: vec3(R, 0, 0), v: vec3(0, V, 0) };
const escape: OrbitState = { ...leo, v: vec3(0, V * 1.45, 0) };
const suborbital: OrbitState = { ...leo, r: vec3(PLANET_RADIUS + 200, 0, 0), v: vec3(0, 6, 0) };

const node = (id: string, t: number, prograde: number, enabled = true): ManeuverNode => ({
  id,
  t,
  enabled,
  dv: { prograde, normal: 0, radial: 0 },
  execution: 'impulsive',
});

function world(ships: { orbit: OrbitState; plan?: ManeuverNode[] }[], t = 0): World {
  const w = createWorld(sys, t);
  ships.forEach((s, i) => {
    const ship = createShip(`ship-${i + 1}`, i + 1, `S${i + 1}`, design, s.orbit);
    ship.plan = s.plan ?? [];
    addShip(w, ship);
  });
  return w;
}

describe('upcomingEvents (S5-2)', () => {
  it('lists nodes and the SOI exit in time order, with the horizon', () => {
    const w = world([
      { orbit: escape, plan: [node('node-1', 100, 0.01), node('node-2', 200, 0.01)] },
    ]);
    const { events, horizon } = upcomingEvents(w, 'ship-1');
    expect(events.map((e) => e.kind)).toEqual(['node', 'node', 'soi-exit']);
    expect(events[0]).toMatchObject({ nodeId: 'node-1', t: 100, enabled: true, dvApplied: 0.01 });
    expect(events[2]!.bodyId).toBe('star');
    const segs = w.derived.trajectories['ship-1']!.segments;
    expect(horizon).toBe(segs.at(-1)!.tEnd);
    expect(events.map((e) => e.kind)).not.toContain('horizon');
  });

  it('lists a disabled node inside the trajectory, greyed, and not one past it', () => {
    const w = world([
      { orbit: suborbital, plan: [node('on', 100, 0.001, false), node('off', 1e7, 1, false)] },
    ]);
    const { events } = upcomingEvents(w, 'ship-1');
    expect(events.map((e) => [e.kind, e.enabled, e.nodeId])).toEqual([
      ['node', false, 'on'],
      ['impact', true, undefined],
    ]);
    expect(events[1]!.bodyId).toBe('planet');
  });

  it('drops events at or before now, and has none for an unknown ship', () => {
    const w = world([{ orbit: leo, plan: [node('a', 100, 0.01), node('b', 200, 0.01)] }]);
    w.clock.t = 100;
    expect(upcomingEvents(w, 'ship-1').events.map((e) => e.nodeId)).toEqual(['b']);
    expect(upcomingEvents(w, 'nope')).toEqual({ events: [], horizon: null });
  });
});

describe('nextWarpStop (S5-5)', () => {
  it('stops before a node by its lead, and at other events', () => {
    const w = world([{ orbit: escape, plan: [node('a', 500, 0.01)] }]);
    const [n, exit] = upcomingEvents(w, 'ship-1').events;
    expect(warpStopTime(n!)).toBe(440);
    expect(warpStopTime(exit!)).toBe(exit!.t);
  });

  it('skips disabled nodes and a node within its lead', () => {
    const w = world([
      { orbit: escape, plan: [node('near', 30, 0.01), node('off', 500, 0.01, false)] },
    ]);
    expect(nextWarpStop(w, 'ship-1')!.kind).toBe('soi-exit');
  });

  it('picks the earliest stop across ships, and null when nothing is left', () => {
    const w = world([
      { orbit: escape, plan: [node('a', 5000, 0.01)] },
      { orbit: leo, plan: [node('b', 3000, 0.01)] },
    ]);
    expect(nextWarpStop(w, null)!.nodeId).toBe('b');
    expect(nextWarpStop(w, 'ship-1')!.nodeId).toBe('a');
    const idle = world([{ orbit: leo }]);
    expect(nextWarpStop(idle, null)).toBeNull();
  });
});
