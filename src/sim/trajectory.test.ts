import { describe, expect, it } from 'vitest';
import { bisect } from '../math/roots';
import { add, dot, norm, sub, vec3 } from '../math/vec3';
import { propagate } from '../orbital/propagate';
import { timeToRadius } from '../orbital/soi';
import { bodyLocalState, bodyWorldState, getBody, type BodySystem } from './body';
import type { OrbitState } from './ship';
import {
  computeTrajectory,
  HORIZON_CAP,
  MAX_SEGMENTS,
  MIN_SEGMENT_S,
  segmentStateAt,
  transitionState,
  type Segment,
} from './trajectory';
import {
  MOON_A,
  MOON_RADIUS,
  MU_PLANET,
  moonMeanMotion,
  PLANET_ATMOSPHERE,
  PLANET_RADIUS,
  syntheticSystem,
} from './testSystem';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

/** A transfer from a 6700 km periapsis on +x, in the moon's plane, to an apoapsis of `ra`. */
function transferStart(ra = 420_000): OrbitState {
  const rp = 6700;
  const a = (rp + ra) / 2;
  const vp = Math.sqrt(MU_PLANET * (2 / rp - 1 / a));
  return { parentId: 'planet', t: 0, r: vec3(rp, 0, 0), v: vec3(0, vp, 0) };
}

/** The moon phase that puts the moon `delta` rad ahead of the transfer when it reaches r = MOON_A. */
function phaseFor(start: OrbitState, delta: number): number {
  const s = { r: start.r, v: start.v };
  const dt = timeToRadius(MU_PLANET, s, MOON_A, 'outbound')!;
  const p = propagate(MU_PLANET, s, dt).r;
  return Math.atan2(p.y, p.x) + delta - moonMeanMotion * (start.t + dt);
}

/** Half the window around the transfer's arrival that counts as its first pass, s. */
const FIRST_PASS = 1.5e5;

/** The closest approach of the unpatched transfer to the moon, km. */
function closestApproach(sys: BodySystem, start: OrbitState): number {
  const s = { r: start.r, v: start.v };
  const dt = timeToRadius(MU_PLANET, s, MOON_A, 'outbound')!;
  const d = (t: number) =>
    norm(sub(propagate(MU_PLANET, s, t - start.t).r, bodyLocalState(sys, 'moon', t).r));
  let best = Infinity;
  let tBest = 0;
  for (let t = start.t + dt - FIRST_PASS; t < start.t + dt + FIRST_PASS; t += 600) {
    const x = d(t);
    if (x < best) [best, tBest] = [x, t];
  }
  let lo = tBest - 600;
  let hi = tBest + 600;
  for (let k = 0; k < 100; k++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (d(m1) < d(m2)) hi = m2;
    else lo = m1;
  }
  return d((lo + hi) / 2);
}

/** World state at the end of a segment and at the start of the next. */
function worldEnd(sys: BodySystem, seg: Segment) {
  const s = segmentStateAt(sys, seg, seg.tEnd);
  const b = bodyWorldState(sys, seg.parentId, seg.tEnd);
  return { r: add(s.r, b.r), v: add(s.v, b.v) };
}
function worldStart(sys: BodySystem, seg: Segment) {
  const b = bodyWorldState(sys, seg.parentId, seg.tStart);
  return { r: add(seg.r0, b.r), v: add(seg.v0, b.v) };
}

describe('computeTrajectory', () => {
  it('a circular orbit inside the moon band gives one horizon segment', () => {
    const sys = syntheticSystem();
    const v = Math.sqrt(MU_PLANET / 7000);
    const segs = computeTrajectory(sys, {
      parentId: 'planet',
      t: 50,
      r: vec3(7000, 0, 0),
      v: vec3(0, v, 0),
    });
    expect(segs).toHaveLength(1);
    expect(segs[0]!.endEvent).toBe('horizon');
    expect(segs[0]!.tEnd).toBe(50 + HORIZON_CAP);
    expect(segs[0]!.endTargetId).toBeUndefined();
  });

  it('an escape ends at the SOI exit into the star, continuously', () => {
    const sys = syntheticSystem();
    const rp = 6700;
    const v = 1.2 * Math.sqrt((2 * MU_PLANET) / rp);
    // A polar escape, out of the moon's plane.
    const segs = computeTrajectory(sys, {
      parentId: 'planet',
      t: 0,
      r: vec3(rp, 0, 0),
      v: vec3(0, 0, v),
    });
    const [s0, s1] = segs;
    expect(s0!.endEvent).toBe('soi-exit');
    expect(s0!.endTargetId).toBe('star');
    const soi = getBody(sys, 'planet').soiRadius!;
    expect(rel(norm(segmentStateAt(sys, s0!, s0!.tEnd).r), soi)).toBeLessThan(1e-9);
    expect(s1!.parentId).toBe('star');
    expect(s1!.tStart).toBe(s0!.tEnd);
    const a = worldEnd(sys, s0!);
    const b = worldStart(sys, s1!);
    expect(norm(sub(a.r, b.r)) / norm(a.r)).toBeLessThan(1e-6);
    expect(norm(sub(a.v, b.v)) / norm(a.v)).toBeLessThan(1e-12);
  });

  it('a transfer aimed at the moon enters its SOI, then flies by on a hyperbola', () => {
    const start = transferStart();
    const sys = syntheticSystem(phaseFor(start, 0.01));
    const segs = computeTrajectory(sys, start);
    const [s0, s1] = segs;
    expect(s0!.endEvent).toBe('soi-enter');
    expect(s0!.endTargetId).toBe('moon');
    const end = segmentStateAt(sys, s0!, s0!.tEnd).r;
    const moon = bodyLocalState(sys, 'moon', s0!.tEnd).r;
    expect(rel(norm(sub(end, moon)), getBody(sys, 'moon').soiRadius!)).toBeLessThan(1e-9);
    expect(s1!.parentId).toBe('moon');
    expect(dot(s1!.r0, s1!.v0)).toBeLessThan(0);
    const e = norm(s1!.v0) ** 2 / 2 - 4902.8 / norm(s1!.r0);
    expect(e).toBeGreaterThan(0);
    expect(['soi-exit', 'impact']).toContain(s1!.endEvent);
    if (s1!.endEvent === 'soi-exit') expect(s1!.endTargetId).toBe('planet');
    // No zero-length segments either side of the moon.
    expect(s1!.tEnd - s1!.tStart).toBeGreaterThan(MIN_SEGMENT_S);
    if (segs[2]) expect(segs[2].tEnd - segs[2].tStart).toBeGreaterThan(3600);
    const a = worldEnd(sys, s0!);
    const b = worldStart(sys, s1!);
    expect(norm(sub(a.r, b.r)) / norm(a.r)).toBeLessThan(1e-6);
  });

  it('an aimed impact on the moon ends there', () => {
    const start = transferStart();
    const sys = syntheticSystem(phaseFor(start, 0));
    // Search the offset for which the transfer hits the moon's centre region.
    const segs = computeTrajectory(sys, start);
    expect(segs[0]!.endEvent).toBe('soi-enter');
    const lunar = segs[1]!;
    const g = (d: number) => {
      const s = computeTrajectory(syntheticSystem(phaseFor(start, d)), start);
      return s[1]?.endEvent === 'impact' ? 1 : 0;
    };
    const impact = [0, 0.001, -0.001, 0.002, -0.002, 0.003, -0.003].find((d) => g(d) === 1);
    expect(impact, `lunar segment ended ${lunar.endEvent}`).toBeDefined();
    const s = computeTrajectory(syntheticSystem(phaseFor(start, impact!)), start);
    expect(s).toHaveLength(2);
    expect(s[1]!.endTargetId).toBe('moon');
    const r = segmentStateAt(syntheticSystem(phaseFor(start, impact!)), s[1]!, s[1]!.tEnd);
    expect(rel(norm(r.r), MOON_RADIUS)).toBeLessThan(1e-9);
  });

  it('a periapsis below the atmosphere ends at the impact radius, inbound', () => {
    const sys = syntheticSystem();
    // From an apoapsis of 6771 km, with a periapsis of 6000 km.
    const ra = 6771;
    const rp = 6000;
    const a = (ra + rp) / 2;
    const va = Math.sqrt(MU_PLANET * (2 / ra - 1 / a));
    const segs = computeTrajectory(sys, {
      parentId: 'planet',
      t: 0,
      r: vec3(ra, 0, 0),
      v: vec3(0, va, 0),
    });
    expect(segs).toHaveLength(1);
    const seg = segs[0]!;
    expect(seg.endEvent).toBe('impact');
    expect(seg.endTargetId).toBe('planet');
    const s = segmentStateAt(sys, seg, seg.tEnd);
    expect(rel(norm(s.r), PLANET_RADIUS + PLANET_ATMOSPHERE)).toBeLessThan(1e-9);
    expect(dot(s.r, s.v)).toBeLessThan(0);
    expect(transitionState(sys, seg)).toBeNull();
  });

  it('a launch from below the impact radius, moving out, does not impact at once', () => {
    const sys = syntheticSystem();
    const r = PLANET_RADIUS + 20;
    const segs = computeTrajectory(sys, {
      parentId: 'planet',
      t: 0,
      r: vec3(r, 0, 0),
      v: vec3(2, 6.5, 0),
    });
    expect(segs[0]!.endEvent).toBe('impact');
    expect(segs[0]!.tEnd).toBeGreaterThan(600);
  });

  it('grazes: 1.05 × the SOI radius gives no entry, 0.95 × gives one', () => {
    const start = transferStart();
    const R = getBody(syntheticSystem(), 'moon').soiRadius!;
    const offsetFor = (k: number) =>
      bisect((d) => closestApproach(syntheticSystem(phaseFor(start, d)), start) - k * R, 0.02, 0.5)
        .x;
    for (const [k, enters] of [
      [1.05, false],
      [0.95, true],
    ] as const) {
      const sys = syntheticSystem(phaseFor(start, offsetFor(k)));
      expect(rel(closestApproach(sys, start), k * R)).toBeLessThan(1e-3);
      const tArr = timeToRadius(MU_PLANET, start, MOON_A, 'outbound')!;
      const segs = computeTrajectory(sys, start, { horizonCap: tArr + FIRST_PASS });
      expect(segs[0]!.endEvent === 'soi-enter', `k = ${k}`).toBe(enters);
    }
  });

  it('stops at the segment cap; the last segment ends at its own event', () => {
    const start = transferStart();
    const sys = syntheticSystem(phaseFor(start, 0.01));
    const two = computeTrajectory(sys, start, { maxSegments: 2 });
    expect(two).toHaveLength(2);
    expect(['soi-exit', 'impact']).toContain(two[1]!.endEvent);
    const all = computeTrajectory(sys, start);
    expect(all.length).toBeLessThanOrEqual(MAX_SEGMENTS);
    expect(all.slice(0, 2)).toEqual(two);
  });

  it('a hyperbola around the root ends at the horizon', () => {
    const sys = syntheticSystem();
    const segs = computeTrajectory(sys, {
      parentId: 'star',
      t: 0,
      r: vec3(5e8, 0, 0),
      v: vec3(30, 30, 0),
    });
    expect(segs).toHaveLength(1);
    expect(segs[0]!.endEvent).toBe('horizon');
  });

  it('is deterministic, and its segments survive a JSON round trip', () => {
    const start = transferStart();
    const sys = syntheticSystem(phaseFor(start, 0.01));
    const a = computeTrajectory(sys, start);
    expect(computeTrajectory(sys, start)).toEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });
});
