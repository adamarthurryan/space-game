import { describe, expect, it } from 'vitest';
import { createRng, range, type Rng } from '../math/rng';
import { DEG } from '../math/units';
import { angleBetween, norm, vec3, type Vec3 } from '../math/vec3';
import type { ReferencePlane } from './elements';
import {
  addState,
  eclipticToEquatorial,
  eclipticToPlane,
  equatorialToEcliptic,
  OBLIQUITY_J2000,
  planePole,
  planeToEcliptic,
  subState,
} from './frames';

function expectVecClose(actual: Vec3, expected: Vec3, tol: number) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tol);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tol);
  expect(Math.abs(actual.z - expected.z)).toBeLessThanOrEqual(tol);
}

function randomVec(rng: Rng): Vec3 {
  return vec3(range(rng, -1, 1), range(rng, -1, 1), range(rng, -1, 1));
}

function randomPlane(rng: Rng): ReferencePlane {
  return { poleRa: range(rng, 0, 2 * Math.PI), poleDec: Math.asin(range(rng, -1, 1)) };
}

const Z = vec3(0, 0, 1);

describe('equatorial ↔ ecliptic', () => {
  // 23° 26′ 21.448″: the IAU 1976 value that Horizons uses, not IAU 2006's 84381.406″.
  it('is 84381.448″ = 23.439 291 1°', () => {
    expect(OBLIQUITY_J2000 / DEG).toBeCloseTo(23.439_291_1, 7);
  });

  it('are inverses, and keep the equinox', () => {
    const rng = createRng('frames-equatorial');
    for (let k = 0; k < 100; k++) {
      const v = randomVec(rng);
      expectVecClose(eclipticToEquatorial(equatorialToEcliptic(v)), v, 1e-15);
      expectVecClose(equatorialToEcliptic(eclipticToEquatorial(v)), v, 1e-15);
    }
    expect(equatorialToEcliptic(vec3(1, 0, 0))).toEqual(vec3(1, 0, 0));
  });

  it('puts the poles the obliquity apart', () => {
    const eclipticPoleInEquatorial = eclipticToEquatorial(Z);
    expect(angleBetween(eclipticPoleInEquatorial, Z)).toBeCloseTo(OBLIQUITY_J2000, 15);
    // The ecliptic pole is at RA 270°: on the −y side of the equatorial frame.
    expect(eclipticPoleInEquatorial.x).toBeCloseTo(0, 15);
    expect(eclipticPoleInEquatorial.y).toBeLessThan(0);
  });
});

describe('reference planes', () => {
  it('the ecliptic as a plane (RA 270°, Dec 90° − ε) is the identity', () => {
    const ecliptic: ReferencePlane = { poleRa: 270 * DEG, poleDec: 90 * DEG - OBLIQUITY_J2000 };
    const rng = createRng('frames-ecliptic-plane');
    for (let k = 0; k < 100; k++) {
      const v = randomVec(rng);
      expectVecClose(planeToEcliptic(ecliptic, v), v, 1e-15);
      expectVecClose(eclipticToPlane(ecliptic, v), v, 1e-15);
    }
  });

  it('the ICRF equator as a plane (pole at Dec 90°) is equatorialToEcliptic', () => {
    // The node of the equator "on itself" is taken at RA α + 90°, so α = 270° puts it at RA 0.
    const equator: ReferencePlane = { poleRa: 270 * DEG, poleDec: 90 * DEG };
    const rng = createRng('frames-equator-plane');
    for (let k = 0; k < 100; k++) {
      const v = randomVec(rng);
      expectVecClose(planeToEcliptic(equator, v), equatorialToEcliptic(v), 1e-15);
    }
  });

  it('a plane’s node is on the ICRF equator, at RA α + 90°', () => {
    const plane: ReferencePlane = { poleRa: 40 * DEG, poleDec: 64 * DEG };
    const node = eclipticToEquatorial(planeToEcliptic(plane, vec3(1, 0, 0)));
    expect(node.z).toBeCloseTo(0, 15);
    expect(Math.atan2(node.y, node.x) / DEG).toBeCloseTo(130, 12);
  });

  it('planePole is the image of z, at the plane’s RA and Dec', () => {
    const rng = createRng('frames-pole');
    for (let k = 0; k < 100; k++) {
      const plane = randomPlane(rng);
      const pole = planePole(plane);
      expect(pole).toEqual(planeToEcliptic(plane, Z));
      expect(norm(pole)).toBeCloseTo(1, 15);
      const eq = eclipticToEquatorial(pole);
      expect(Math.asin(eq.z)).toBeCloseTo(plane.poleDec, 12);
      if (Math.cos(plane.poleDec) > 1e-3) {
        const ra = Math.atan2(eq.y, eq.x);
        expect(Math.cos(ra - plane.poleRa)).toBeCloseTo(1, 12);
      }
    }
  });

  it('the rotations preserve the norm, and eclipticToPlane inverts planeToEcliptic', () => {
    const rng = createRng('frames-inverse');
    for (let k = 0; k < 1000; k++) {
      const plane = randomPlane(rng);
      const v = randomVec(rng);
      const w = planeToEcliptic(plane, v);
      expect(norm(w)).toBeCloseTo(norm(v), 15);
      expectVecClose(eclipticToPlane(plane, w), v, 1e-15);
    }
  });
});

describe('translations', () => {
  it('addState and subState are inverses', () => {
    const s = { r: vec3(384_400, -12, 3e4), v: vec3(0.1, 1.02, -0.05) };
    const origin = { r: vec3(1.496e8, 2e6, -1e3), v: vec3(-0.4, 29.78, 0.001) };
    const round = subState(addState(s, origin), origin);
    expectVecClose(round.r, s.r, 3e-8);
    expectVecClose(round.v, s.v, 1e-14);
  });
});
