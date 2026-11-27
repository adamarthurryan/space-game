import { describe, expect, it } from 'vitest';
import { DEG, TWO_PI } from '../math/units';
import { cross, dot, norm, normalize, sub, vec3, type Vec3 } from '../math/vec3';
import type { MeanElements } from './elements';
import { createMeanOrbitGeometry, meanOrbitGeometryInto, stateFromMeanElements } from './propagate';
import { orbitSpacing, sampleMeanOrbitInto } from './sample';

const MU_SUN = 1.327_124_400_18e11;
const MU_EARTH = 398_600.4418;

function orbit(mu: number, a: number, e: number, extra: Partial<MeanElements> = {}): MeanElements {
  return {
    a,
    e,
    i: 0.3,
    lan: 1.1,
    argp: 2.2,
    meanAnomaly: 0.7,
    meanMotion: Math.sqrt(mu / a ** 3),
    ...extra,
  };
}

const EARTH = orbit(MU_SUN, 1.496e8, 0.0167, { i: 0.00005, lan: -0.196, argp: 1.996 });
const CASES: Record<string, MeanElements> = {
  circular: orbit(MU_SUN, 1e8, 0),
  earth: EARTH,
  pluto: orbit(MU_SUN, 5.9e9, 0.2488, { i: 17.16 * DEG }),
  eccentric: orbit(MU_SUN, 1e8, 0.95),
  // The Moon's elements with its nodal and apsidal rates.
  moonLike: orbit(MU_EARTH, 384_400, 0.0549, {
    i: 5.1 * DEG,
    rates: { lan: -1.07e-8, argp: 2.25e-8, a: 1e-9, e: 1e-12 },
  }),
  // Retrograde, on a Laplace plane, like Triton.
  retrograde: orbit(6.8e6, 354_759, 0.00002, {
    i: 156.8 * DEG,
    plane: { poleRa: 299.36 * DEG, poleDec: 43.46 * DEG },
  }),
  // n < 0, as for Tethys in JPL's table (S1-18).
  negativeN: { ...orbit(3.79e7, 294_660, 0.0001), meanMotion: -1e-6 },
};

const N = 256;

function point(out: Float64Array, j: number): Vec3 {
  return vec3(out[3 * j]!, out[3 * j + 1]!, out[3 * j + 2]!);
}

function sample(m: MeanElements, t: number, density?: number): Float64Array {
  return sampleMeanOrbitInto(m, t, N, new Float64Array(3 * (N + 1)), density);
}

describe('sampleMeanOrbitInto', () => {
  for (const [name, m] of Object.entries(CASES)) {
    it(`${name}: starts and ends at the body`, () => {
      for (const t of [0, 3.3e7, -1e9]) {
        const out = sample(m, t);
        const r = stateFromMeanElements(m, t).r;
        expect(norm(sub(point(out, 0), r)) / norm(r)).toBeLessThan(1e-9);
        expect(point(out, N)).toEqual(point(out, 0));
      }
    });

    it(`${name}: every point lies on the ellipse, at distance a(1 − e cos E)`, () => {
      const t = 1e8;
      const out = sample(m, t);
      const g = meanOrbitGeometryInto(m, t, createMeanOrbitGeometry());
      for (let j = 0; j <= N; j++) {
        const p = point(out, j);
        expect(Math.abs(dot(p, g.W))).toBeLessThan(1e-9 * g.a);
        // Perifocal coordinates: x = a(cos E − e), y = b sin E.
        const cosE = dot(p, g.P) / g.a + g.e;
        const sinE = dot(p, g.Q) / g.b;
        expect(Math.abs(cosE * cosE + sinE * sinE - 1)).toBeLessThan(1e-9);
        expect(Math.abs(norm(p) - g.a * (1 - g.e * cosE))).toBeLessThan(1e-9 * g.a);
      }
    });
  }

  it('has an orthonormal perifocal basis, with W along r × v for n > 0', () => {
    for (const m of Object.values(CASES)) {
      const g = meanOrbitGeometryInto(m, 0, createMeanOrbitGeometry());
      for (const v of [g.P, g.Q, g.W]) expect(norm(v)).toBeCloseTo(1, 12);
      expect(dot(g.P, g.Q)).toBeCloseTo(0, 12);
      expect(norm(sub(cross(g.P, g.Q), g.W))).toBeLessThan(1e-12);
      const noRates: MeanElements = { ...m };
      delete noRates.rates;
      const s = stateFromMeanElements(noRates, 0);
      const h = normalize(cross(s.r, s.v));
      expect(dot(h, g.W)).toBeCloseTo(Math.sign(m.meanMotion), 9);
    }
  });

  it('is uniform in E with density 0, and about (1 − k) of uniform next to the body', () => {
    const uniform = TWO_PI / N;
    for (let j = 0; j < N; j++) {
      const dE = TWO_PI * (orbitSpacing((j + 1) / N, 0) - orbitSpacing(j / N, 0));
      expect(dE).toBeCloseTo(uniform, 12);
    }
    const k = 0.5;
    const first = TWO_PI * orbitSpacing(1 / N, k);
    const last = TWO_PI * (1 - orbitSpacing((N - 1) / N, k));
    const middle = TWO_PI * (orbitSpacing(0.5 + 1 / N, k) - orbitSpacing(0.5, k));
    expect(first / uniform).toBeCloseTo(1 - k, 3);
    expect(last / uniform).toBeCloseTo(1 - k, 3);
    expect(middle).toBeGreaterThan(uniform);
    // Monotonic, from 0 to 1, at every density.
    for (const d of [0, 0.5, 1]) {
      expect(orbitSpacing(0, d)).toBe(0);
      expect(orbitSpacing(1, d)).toBeCloseTo(1, 15);
      for (let j = 0; j < N; j++) {
        expect(orbitSpacing((j + 1) / N, d)).toBeGreaterThan(orbitSpacing(j / N, d));
      }
    }
  });

  it("misses Earth's orbit by under 1 km within 1e5 km of Earth (256 segments)", () => {
    const m = EARTH;
    const t = 0;
    const out = sample(m, t);
    const body = point(out, 0);
    // The true orbit, finely sampled, against the nearest chord.
    let worst = 0;
    const fine = new Float64Array(3 * (100_000 + 1));
    sampleMeanOrbitInto(m, t, 100_000, fine, 0);
    for (let f = 0; f <= 100_000; f++) {
      const p = point(fine, f);
      if (norm(sub(p, body)) > 1e5) continue;
      let best = Infinity;
      for (let j = 0; j < N; j++) {
        best = Math.min(best, distanceToSegment(p, point(out, j), point(out, j + 1)));
      }
      worst = Math.max(worst, best);
    }
    expect(worst).toBeLessThan(1);
  });

  it('rejects a buffer that is too short', () => {
    expect(() => sampleMeanOrbitInto(EARTH, 0, N, new Float64Array(3 * N))).toThrow(RangeError);
  });
});

function distanceToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  const s = len2 === 0 ? 0 : Math.min(1, Math.max(0, dot(sub(p, a), ab) / len2));
  return norm(sub(p, vec3(a.x + s * ab.x, a.y + s * ab.y, a.z + s * ab.z)));
}
