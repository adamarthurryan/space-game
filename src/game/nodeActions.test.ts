import { describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../gen/scenario';
import { presetOrbit } from '../gen/sandboxShips';
import { norm } from '../math/vec3';
import { timeToPassage } from '../orbital/passages';
import { fallbackPole } from '../sim/maneuver';
import { segmentStateAt } from '../sim/trajectory';
import type { World } from '../sim/world';
import {
  addApsisRefusal,
  addNode,
  addNodeAt,
  deleteNode,
  editNode,
  MAX_NODE_DV_COMPONENT,
  setPauseOn,
  snapNode,
  snapRefusal,
  spawnShip,
} from './actions';

/** Kestrel is ship-1 (circular LEO), Tern ship-2 (elliptic), Heron ship-3 (lunar). */
const world = () => createSandboxWorld();
const dv = (prograde: number, normal = 0, radial = 0) => ({ prograde, normal, radial });
const snapshot = (w: World) => JSON.stringify({ ...w, derived: undefined });

describe('addNode', () => {
  it('numbers nodes across ships and keeps the plan sorted', () => {
    const w = world();
    expect(addNode(w, 'ship-1', { t: 5000, dv: dv(0.1) })).toEqual({ ok: true, value: 'node-1' });
    expect(addNode(w, 'ship-2', { t: 3000 })).toEqual({ ok: true, value: 'node-2' });
    expect(addNode(w, 'ship-1', { t: 2000 })).toEqual({ ok: true, value: 'node-3' });
    expect(w.ships['ship-1']!.plan.map((n) => n.id)).toEqual(['node-3', 'node-1']);
    expect(w.ships['ship-2']!.plan[0]!.dv).toEqual(dv(0));
    const segs = w.derived.trajectories['ship-1']!.segments;
    expect(segs.filter((s) => s.endEvent === 'maneuver').map((s) => s.endNodeId)).toEqual([
      'node-3',
      'node-1',
    ]);
  });

  it.each([
    ['an unknown ship', (w: World) => addNode(w, 'ship-9', { t: 100 }), 'Unknown ship'],
    ['a time in the past', (w: World) => addNode(w, 'ship-1', { t: 0.5 }), 'future'],
    ['a non-finite time', (w: World) => addNode(w, 'ship-1', { t: NaN }), 'not a number'],
    [
      'a huge Δv',
      (w: World) => addNode(w, 'ship-1', { t: 100, dv: dv(MAX_NODE_DV_COMPONENT + 1) }),
      'at most',
    ],
    ['a NaN Δv', (w: World) => addNode(w, 'ship-1', { t: 100, dv: dv(NaN) }), 'not a number'],
    ['a time past the trajectory', (w: World) => addNode(w, 'ship-1', { t: 1e12 }), 'past the end'],
  ])('refuses %s, leaving the world unchanged', (_, f, message) => {
    const w = world();
    const before = snapshot(w);
    const r = f(w);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain(message);
    expect(snapshot(w)).toBe(before);
  });

  it('refuses a clash, a node after an impact, and a full plan', () => {
    const w = world();
    addNode(w, 'ship-1', { t: 100 });
    expect(addNode(w, 'ship-1', { t: 100.0001 }).ok).toBe(false);
    const sub = spawnShip(w, {
      designId: 'starship',
      orbit: presetOrbit(w.system, 'suborbital', 0),
    });
    const id = sub.ok ? sub.value : '';
    const tImpact = w.derived.trajectories[id]!.segments.at(-1)!.tEnd;
    const r = addNode(w, id, { t: tImpact + 1 });
    expect(!r.ok && r.error).toContain('impacts');
    for (let i = 1; i < 16; i++) expect(addNode(w, 'ship-1', { t: 100 + 10 * i }).ok).toBe(true);
    const full = addNode(w, 'ship-1', { t: 5000 });
    expect(!full.ok && full.error).toContain('at most 16');
  });
});

describe('editNode and deleteNode', () => {
  it('re-sorts after a time edit and recomputes the trajectory', () => {
    const w = world();
    addNode(w, 'ship-1', { t: 1000, dv: dv(0.1) });
    addNode(w, 'ship-1', { t: 2000, dv: dv(0.2) });
    const v = w.derived.trajectories['ship-1']!.version;
    expect(editNode(w, 'ship-1', 'node-1', { t: 3000 }).ok).toBe(true);
    expect(w.ships['ship-1']!.plan.map((n) => n.id)).toEqual(['node-2', 'node-1']);
    expect(w.derived.trajectories['ship-1']!.version).toBe(v + 1);
    expect(editNode(w, 'ship-1', 'node-1', { dv: { normal: 0.05 } }).ok).toBe(true);
    expect(w.ships['ship-1']!.plan[1]!.dv).toEqual(dv(0.1, 0.05));
    expect(editNode(w, 'ship-1', 'node-1', { enabled: false }).ok).toBe(true);
    expect(editNode(w, 'ship-1', 'node-1', { t: 2000 }).ok).toBe(false);
    expect(editNode(w, 'ship-1', 'node-9', { t: 2000 }).ok).toBe(false);
  });

  it('refuses to edit a node that is about to execute', () => {
    const w = world();
    addNode(w, 'ship-1', { t: 100 });
    w.clock.t = 99.5;
    expect(editNode(w, 'ship-1', 'node-1', { dv: { prograde: 1 } }).ok).toBe(false);
  });

  it('deletes a node and re-queues the event', () => {
    const w = world();
    addNode(w, 'ship-1', { t: 1000, dv: dv(0.1) });
    expect(deleteNode(w, 'ship-1', 'node-1').ok).toBe(true);
    expect(w.ships['ship-1']!.plan).toEqual([]);
    expect(w.derived.trajectories['ship-1']!.segments[0]!.endEvent).toBe('horizon');
    expect(deleteNode(w, 'ship-1', 'node-1').ok).toBe(false);
  });
});

describe('addNodeAt', () => {
  it('adds at the next apoapsis, then searches after the last node', () => {
    const w = world();
    const r = addNodeAt(w, 'ship-2', 'apoapsis');
    expect(r.ok).toBe(true);
    const tern = w.ships['ship-2']!;
    const seg0 = w.derived.trajectories['ship-2']!.segments[0]!;
    const ra = segmentStateAt(w.system, seg0, tern.plan[0]!.t);
    expect(Math.abs(norm(ra.r) - (6378 + 35_786))).toBeLessThan(20);
    // The next Pe is after that node.
    expect(addNodeAt(w, 'ship-2', 'periapsis').ok).toBe(true);
    expect(tern.plan[1]!.t).toBeGreaterThan(tern.plan[0]!.t);
  });

  it('adds at the next ascending node against the equator', () => {
    const w = world();
    expect(addNodeAt(w, 'ship-1', 'ascending-node').ok).toBe(true);
    const n = w.ships['ship-1']!.plan[0]!;
    const seg = w.derived.trajectories['ship-1']!.segments[0]!;
    const s = segmentStateAt(w.system, seg, n.t);
    const pole = fallbackPole(w.system, 'earth');
    const z = s.r.x * pole.x + s.r.y * pole.y + s.r.z * pole.z;
    expect(Math.abs(z) / norm(s.r)).toBeLessThan(1e-9);
    expect(
      timeToPassage(w.system.bodies['earth']!.mu, s, 'ascending-node', pole, 1),
    ).toBeGreaterThan(5000);
  });

  it('finds an escape trajectory’s apoapsis in the Sun’s frame, and adds at a time', () => {
    const w = world();
    const e = spawnShip(w, {
      designId: 'starship',
      orbit: presetOrbit(w.system, 'earth-escape', 0),
    });
    const id = e.ok ? e.value : '';
    expect(addNodeAt(w, id, 'apoapsis').ok).toBe(true);
    const n = w.ships[id]!.plan[0]!;
    const seg = w.derived.trajectories[id]!.segments.find((x) => x.endNodeId === n.id)!;
    expect(seg.parentId).toBe('sun');
    expect(addNodeAt(w, id, { t: 500 }).ok).toBe(true);
  });

  it('refuses Pe and Ap on a circular orbit (S5b-20), and a passage that isn’t on the path', () => {
    const w = world();
    // Kestrel's orbit is exactly circular.
    for (const k of ['periapsis', 'apoapsis'] as const) {
      const r = addNodeAt(w, 'ship-1', k);
      expect(!r.ok && r.error).toBe('Circular orbit');
      expect(addApsisRefusal(w, 'ship-1', k)).toBe('Circular orbit');
    }
    expect(addApsisRefusal(w, 'ship-2', 'apoapsis')).toBeNull(); // Tern is elliptic
  });
});

describe('snapNode', () => {
  it('refuses on a circular orbit (S5b-20)', () => {
    const w = world();
    addNode(w, 'ship-1', { t: 1000, dv: dv(0.1) });
    expect(snapRefusal(w, 'ship-1', 'node-1')).toBe('Circular orbit');
    const r = snapNode(w, 'ship-1', 'node-1', 'apoapsis');
    expect(!r.ok && r.error).toBe('Circular orbit');
    addNode(w, 'ship-2', { t: 1000, dv: dv(0.1) });
    expect(snapRefusal(w, 'ship-2', 'node-1')).toBeNull();
  });

  it('moves a node to the nearest periapsis of its path', () => {
    const w = world();
    const tern = w.ships['ship-2']!;
    const seg0 = w.derived.trajectories['ship-2']!.segments[0]!;
    const mu = w.system.bodies['earth']!.mu;
    const pole = fallbackPole(w.system, 'earth');
    const s0 = segmentStateAt(w.system, seg0, 0);
    const tPe = timeToPassage(mu, s0, 'periapsis', pole, 1)!;
    addNode(w, 'ship-2', { t: tPe + 300, dv: dv(0.1) });
    expect(snapNode(w, 'ship-2', 'node-1', 'periapsis').ok).toBe(true);
    expect(Math.abs(tern.plan[0]!.t - tPe)).toBeLessThan(1e-3);
  });
});

describe('setPauseOn', () => {
  it('sets one type or all', () => {
    const w = world();
    setPauseOn(w, 'impact', true);
    expect(w.clock.pauseOn).toEqual({ node: true, 'soi-change': false, impact: true });
    setPauseOn(w, 'all', false);
    expect(w.clock.pauseOn).toEqual({ node: false, 'soi-change': false, impact: false });
  });
});
