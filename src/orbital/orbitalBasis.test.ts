import { describe, expect, it } from 'vitest';
import { DEG } from '../math/units';
import { cross, dot, norm, vec3, type Vec3 } from '../math/vec3';
import { stateFromElements, type StateVector } from './elements';
import { dvToVector, localOrbitalBasis, vectorToDv } from './frames';

const MU = 398_600.435;
const Z = vec3(0, 0, 1);

const states: [string, StateVector][] = [
  ['circular', stateFromElements(MU, { p: 7000, e: 0, i: 0.3, lan: 1, argp: 0, nu: 0.4 })],
  ['eccentric', stateFromElements(MU, { p: 9000, e: 0.6, i: 1.1, lan: 2, argp: 1, nu: 2 })],
  ['hyperbolic', stateFromElements(MU, { p: 12000, e: 1.8, i: 0.2, lan: 0, argp: 3, nu: -1 })],
  [
    'retrograde',
    stateFromElements(MU, { p: 8000, e: 0.1, i: 170 * DEG, lan: 0.5, argp: 0, nu: 1 }),
  ],
];

const near = (a: Vec3, b: Vec3, eps: number) =>
  norm({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }) < eps;

describe('localOrbitalBasis', () => {
  it.each(states)('is orthonormal and right-handed (%s)', (_, s) => {
    const b = localOrbitalBasis(s, Z);
    for (const u of [b.prograde, b.normal, b.radial]) expect(norm(u)).toBeCloseTo(1, 14);
    expect(dot(b.prograde, b.normal)).toBeCloseTo(0, 14);
    expect(dot(b.prograde, b.radial)).toBeCloseTo(0, 14);
    expect(dot(b.normal, b.radial)).toBeCloseTo(0, 14);
    expect(near(cross(b.prograde, b.normal), b.radial, 1e-14)).toBe(true);
    expect(near(cross(b.radial, b.prograde), b.normal, 1e-14)).toBe(true);
    // The normal is along the angular momentum.
    expect(dot(b.normal, cross(s.r, s.v))).toBeGreaterThan(0);
  });

  it('points radial along r̂ on a circular orbit', () => {
    const s = states[0]![1];
    const rHat = { x: s.r.x / norm(s.r), y: s.r.y / norm(s.r), z: s.r.z / norm(s.r) };
    expect(near(localOrbitalBasis(s, Z).radial, rHat, 1e-12)).toBe(true);
  });

  it('round-trips a Δv', () => {
    for (const [, s] of states) {
      const b = localOrbitalBasis(s, Z);
      const dv = { prograde: 1.25, normal: -0.5, radial: 0.125 };
      const back = vectorToDv(b, dvToVector(b, dv));
      expect(back.prograde).toBeCloseTo(dv.prograde, 15);
      expect(back.normal).toBeCloseTo(dv.normal, 15);
      expect(back.radial).toBeCloseTo(dv.radial, 15);
    }
  });

  it('falls back to the pole for a radial state', () => {
    const s = { r: vec3(7000, 0, 0), v: vec3(3, 0, 0) };
    const b = localOrbitalBasis(s, Z);
    expect(near(b.normal, Z, 1e-15)).toBe(true);
    expect(dot(b.prograde, b.normal)).toBeCloseTo(0, 15);
    expect(norm(b.radial)).toBeCloseTo(1, 15);
    // A pole parallel to v falls back again.
    const c = localOrbitalBasis({ r: vec3(0, 0, 7000), v: vec3(0, 0, 3) }, Z);
    expect(norm(c.normal)).toBeCloseTo(1, 15);
    expect(dot(c.prograde, c.normal)).toBeCloseTo(0, 15);
  });
});
