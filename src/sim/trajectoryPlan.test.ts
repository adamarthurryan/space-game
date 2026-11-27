import { describe, expect, it } from 'vitest';
import { vec3 } from '../math/vec3';
import type { ManeuverNode } from './maneuver';
import { applyNode } from './maneuver';
import type { OrbitState } from './ship';
import { MU_PLANET, PLANET_RADIUS, syntheticSystem } from './testSystem';
import { computeTrajectory, HORIZON_CAP, segmentStateAt } from './trajectory';

const sys = syntheticSystem();
const R = 7000;
const V = Math.sqrt(MU_PLANET / R);
const leo: OrbitState = { parentId: 'planet', t: 0, r: vec3(R, 0, 0), v: vec3(0, V, 0) };

const node = (id: string, t: number, prograde: number, normal = 0): ManeuverNode => ({
  id,
  t,
  enabled: true,
  dv: { prograde, normal, radial: 0 },
  execution: 'impulsive',
});

describe('computeTrajectory with a plan', () => {
  it('ends a segment at a node and continues from the post-burn state', () => {
    const n = node('n1', 1234.5, 0.8);
    const segs = computeTrajectory(sys, leo, { plan: [n] });
    const [s0, s1] = segs;
    expect(s0!.endEvent).toBe('maneuver');
    expect(s0!.endNodeId).toBe('n1');
    expect(s0!.tEnd).toBe(1234.5);
    expect(s0!.dvApplied).toBe(0.8);
    const pre = segmentStateAt(sys, s0!, n.t);
    const post = applyNode(sys, 'planet', pre, n, 0.8);
    expect(s1!.tStart).toBe(n.t);
    expect(s1!.parentId).toBe('planet');
    expect(s1!.r0).toEqual(pre.r);
    for (const k of ['x', 'y', 'z'] as const) expect(s1!.v0[k]).toBeCloseTo(post.v[k], 12);
    // The rest is ordinary coasting from that state.
    const rest = computeTrajectory(
      sys,
      { parentId: 'planet', t: n.t, r: s1!.r0, v: s1!.v0 },
      { horizonCap: HORIZON_CAP - n.t },
    );
    expect(segs.slice(1)).toEqual(rest);
  });

  it('gives ties with an SOI exit to the node', () => {
    const escape: OrbitState = { ...leo, v: vec3(0, V * 1.45, 0) };
    const plain = computeTrajectory(sys, escape);
    expect(plain[0]!.endEvent).toBe('soi-exit');
    const T = plain[0]!.tEnd;
    const segs = computeTrajectory(sys, escape, { plan: [node('n', T, 0.001)] });
    expect(segs[0]!.endEvent).toBe('maneuver');
    expect(segs[0]!.tEnd).toBe(T);
    expect(segs[1]!.parentId).toBe('planet');
    expect(segs[1]!.endEvent).toBe('soi-exit');
    expect(segs[1]!.tEnd - T).toBeLessThan(1);
  });

  it('doesn’t count node segments towards the cap', () => {
    const plan = [node('a', 100, 0.01), node('b', 200, 0.01)];
    const segs = computeTrajectory(sys, leo, { plan, maxSegments: 1 });
    expect(segs.map((s) => s.endEvent)).toEqual(['maneuver', 'maneuver', 'horizon']);
  });

  it('doesn’t reach a node after an impact or past the cap', () => {
    const suborbital: OrbitState = { ...leo, r: vec3(PLANET_RADIUS + 200, 0, 0), v: vec3(0, 6, 0) };
    const plain = computeTrajectory(sys, suborbital);
    expect(plain.at(-1)!.endEvent).toBe('impact');
    const late = computeTrajectory(sys, suborbital, {
      plan: [node('late', plain.at(-1)!.tEnd + 10, 1)],
    });
    expect(late).toEqual(plain);
    const capped = computeTrajectory(sys, leo, { plan: [node('far', 5000, 1)], horizonCap: 4000 });
    expect(capped.map((s) => s.endEvent)).toEqual(['horizon']);
  });

  it('ignores disabled nodes and nodes at or before the start', () => {
    const plain = computeTrajectory(sys, leo);
    const off = { ...node('off', 500, 1), enabled: false };
    expect(computeTrajectory(sys, leo, { plan: [off, node('past', 0, 1)] })).toEqual(plain);
  });

  it('clamps an over-budget node to the Δv left', () => {
    const plan = [node('a', 100, 0.3), node('b', 200, 0, 0.4)];
    const segs = computeTrajectory(sys, leo, { plan, dvAvailable: 0.5 });
    expect(segs[0]!.dvApplied).toBe(0.3);
    expect(segs[1]!.dvApplied).toBeCloseTo(0.2, 15);
    const empty = computeTrajectory(sys, leo, { plan, dvAvailable: 0 });
    expect(empty[0]!.dvApplied).toBe(0);
    expect(empty[1]!.dvApplied).toBe(0);
  });

  it('is deterministic and plain data', () => {
    const plan = [node('a', 100, 0.3), node('b', 4000, -0.1, 0.05)];
    const a = computeTrajectory(sys, leo, { plan });
    const b = computeTrajectory(sys, leo, { plan });
    expect(a).toEqual(b);
    // JSON writes −0 as 0 (an equatorial orbit propagates to z = −0), so compare the text.
    expect(JSON.stringify(JSON.parse(JSON.stringify(a)))).toBe(JSON.stringify(a));
  });
});
