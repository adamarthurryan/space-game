import { describe, expect, it } from 'vitest';
import { createRng, next, range } from '../math/rng';
import { DEG } from '../math/units';
import {
  eccentricFromTrue,
  hyperbolicFromTrue,
  meanFromEccentric,
  meanFromHyperbolic,
  meanFromTrue,
  solveKeplerElliptic,
  solveKeplerEllipticDetailed,
  solveKeplerHyperbolic,
  solveKeplerHyperbolicDetailed,
  solveUniversal,
  stumpffC2,
  stumpffC3,
  trueFromEccentric,
  trueFromHyperbolic,
  trueFromMean,
} from './kepler';

const MU_EARTH = 398_600; // km³/s², the value used by Curtis

describe('textbook cases', () => {
  // Vallado, Fundamentals of Astrodynamics and Applications (4th ed.), Example 2-1.
  it('Vallado 2-1: M = 235.4°, e = 0.4 → E = 220.512 074 767 522°', () => {
    const E = solveKeplerElliptic(235.4 * DEG, 0.4);
    expect(E / DEG).toBeCloseTo(220.512_074_767_522, 9);
  });

  // Curtis, Orbital Mechanics for Engineering Students (3rd ed.), Example 3.1: perigee and
  // apogee radii 9600 and 21 000 km; the time from perigee to ν = 120°.
  it('Curtis 3.1: time from perigee to ν = 120°', () => {
    const e = (21_000 - 9600) / (21_000 + 9600);
    expect(e).toBeCloseTo(0.372_55, 5);
    const a = (21_000 + 9600) / 2;
    const T = 2 * Math.PI * Math.sqrt(a ** 3 / MU_EARTH);
    expect(T).toBeCloseTo(18_834, -1);
    const E = eccentricFromTrue(120 * DEG, e);
    expect(E).toBeCloseTo(1.7281, 4);
    const M = meanFromEccentric(E, e);
    expect(M).toBeCloseTo(1.3601, 4);
    expect((M / (2 * Math.PI)) * T).toBeCloseTo(4077, -1);
  });

  // Curtis Example 3.2: the same orbit, three hours after perigee.
  it('Curtis 3.2: true anomaly three hours after perigee', () => {
    const e = (21_000 - 9600) / (21_000 + 9600);
    const a = (21_000 + 9600) / 2;
    const T = 2 * Math.PI * Math.sqrt(a ** 3 / MU_EARTH);
    const M = ((2 * Math.PI) / T) * 3 * 3600;
    expect(M).toBeCloseTo(3.6029, 4);
    const E = solveKeplerElliptic(M, e);
    expect(E).toBeCloseTo(3.4794, 4);
    expect(trueFromMean(M, e) / DEG + 360).toBeCloseTo(193.2, 1);
  });

  // Curtis Example 3.4: a geocentric parabola with perigee speed 10 km/s, 6 hours after perigee.
  // Curtis writes Barker's equation as ½D + ⅙D³ = μ²t/h³; here M = D + D³/3 is twice that.
  it('Curtis 3.4 (parabolic): position 6 hours after perigee', () => {
    const rp = (2 * MU_EARTH) / 10 ** 2;
    expect(rp).toBeCloseTo(7972, 0);
    const h = rp * 10;
    const M = (2 * MU_EARTH ** 2 * 6 * 3600) / h ** 3;
    const nu = trueFromMean(M, 1);
    expect(nu / DEG).toBeCloseTo(144.75, 1);
  });

  // Curtis Example 3.5: a geocentric hyperbola with perigee speed 15 km/s at 300 km altitude.
  it('Curtis 3.5 (hyperbolic): ν = 100°, then 3 hours later', () => {
    const rp = 6378 + 300;
    const h = rp * 15;
    const e = (h * h) / MU_EARTH / rp - 1;
    expect(e).toBeCloseTo(2.7696, 4);
    const F = hyperbolicFromTrue(100 * DEG, e);
    expect(F).toBeCloseTo(2.2927, 4);
    const Mh = meanFromHyperbolic(F, e);
    expect(Mh).toBeCloseTo(11.279, 2);
    const scale = (MU_EARTH ** 2 / h ** 3) * (e * e - 1) ** 1.5; // dMh/dt
    const t = Mh / scale;
    expect(t).toBeCloseTo(4141, -1);
    const Mh2 = (t + 3 * 3600) * scale;
    expect(Mh2).toBeCloseTo(40.69, 1);
    const F2 = solveKeplerHyperbolic(Mh2, e);
    expect(F2).toBeCloseTo(3.4631, 3);
    expect(trueFromHyperbolic(F2, e) / DEG).toBeCloseTo(107.78, 1);
  });
});

describe('elliptic solver', () => {
  it('has residual < 1e-13 and fewer than 30 iterations for 10,000 random (M, e)', () => {
    const rng = createRng('kepler-elliptic');
    let worstIter = 0;
    for (let k = 0; k < 10_000; k++) {
      // Weight e towards 1, where the solver is hardest.
      const e = k % 2 === 0 ? range(rng, 0, 0.999_999) : 1 - 10 ** range(rng, -6, -1);
      const M = range(rng, -Math.PI, Math.PI) * (k % 3 === 0 ? 10 ** range(rng, -8, 0) : 1);
      const { x: E, iterations } = solveKeplerEllipticDetailed(M, e);
      worstIter = Math.max(worstIter, iterations);
      expect(Math.abs(E - e * Math.sin(E) - M)).toBeLessThan(1e-13);
    }
    expect(worstIter).toBeLessThan(30);
  });

  it('gives E = M for e = 0, and keeps whole revolutions', () => {
    expect(solveKeplerElliptic(1.234, 0)).toBe(1.234);
    expect(solveKeplerElliptic(0, 0.7)).toBe(0);
    const E = solveKeplerElliptic(1 + 10 * Math.PI, 0.3);
    expect(E - 10 * Math.PI).toBeCloseTo(solveKeplerElliptic(1, 0.3), 12);
  });
});

describe('hyperbolic solver', () => {
  it('has residual < 1e-12 relative to |M| for e ∈ (1, 100] and |M| up to 1e4', () => {
    const rng = createRng('kepler-hyperbolic');
    for (let k = 0; k < 10_000; k++) {
      const e = k % 2 === 0 ? 1 + 10 ** range(rng, -8, 2) : range(rng, 1.000_001, 100);
      const M = (next(rng) < 0.5 ? -1 : 1) * 10 ** range(rng, -8, 4);
      const { x: H, iterations } = solveKeplerHyperbolicDetailed(M, e);
      // The residual in the cancellation-free form; e sinh H − H itself loses digits near e = 1.
      expect(Math.abs(meanFromHyperbolic(H, e) - M) / Math.abs(M)).toBeLessThan(1e-12);
      expect(iterations).toBeLessThan(50);
    }
  });
});

describe('anomalies', () => {
  it('true ↔ eccentric ↔ mean round-trips for ellipses', () => {
    const rng = createRng('anomalies-elliptic');
    for (let k = 0; k < 2000; k++) {
      const e = range(rng, 0, 0.99);
      const nu = range(rng, -Math.PI, Math.PI);
      const E = eccentricFromTrue(nu, e);
      expect(trueFromEccentric(E, e)).toBeCloseTo(nu, 12);
      expect(solveKeplerElliptic(meanFromEccentric(E, e), e)).toBeCloseTo(E, 12);
    }
  });

  it('true ↔ hyperbolic ↔ mean round-trips for hyperbolas', () => {
    const rng = createRng('anomalies-hyperbolic');
    for (let k = 0; k < 2000; k++) {
      const e = 1 + 10 ** range(rng, -3, 1.5);
      const nuMax = Math.acos(-1 / e);
      const nu = range(rng, -0.999, 0.999) * nuMax;
      const H = hyperbolicFromTrue(nu, e);
      expect(trueFromHyperbolic(H, e)).toBeCloseTo(nu, 10);
      expect(solveKeplerHyperbolic(meanFromHyperbolic(H, e), e)).toBeCloseTo(H, 10);
    }
  });

  it('trueFromMean inverts meanFromTrue, at e = 1 and near it', () => {
    const rng = createRng('anomalies-dispatch');
    const es = [0, 0.5, 1 - 1e-6, 1 - 1e-9, 1 - 1e-12, 1, 1 + 1e-12, 1 + 1e-9, 1 + 1e-6, 3];
    for (const e of es) {
      const nuMax = e < 1 ? Math.PI : Math.min(Math.acos(-1 / e), 3);
      for (let k = 0; k < 200; k++) {
        const nu = range(rng, -0.999, 0.999) * nuMax;
        expect(Math.abs(trueFromMean(meanFromTrue(nu, e), e) - nu)).toBeLessThan(1e-9);
      }
    }
  });
});

describe('Stumpff functions', () => {
  it('are ½ and ⅙ at ψ = 0', () => {
    expect(stumpffC2(0)).toBe(0.5);
    expect(stumpffC3(0)).toBe(1 / 6);
  });

  it('are continuous across the switch to the series', () => {
    for (const edge of [1e-3, -1e-3]) {
      const below = edge * (1 - 1e-12);
      const above = edge * (1 + 1e-12);
      expect(Math.abs(stumpffC2(above) / stumpffC2(below) - 1)).toBeLessThan(1e-12);
      expect(Math.abs(stumpffC3(above) / stumpffC3(below) - 1)).toBeLessThan(1e-11);
    }
  });

  it('are finite for large negative ψ', () => {
    for (const psi of [-1e2, -1e4, -4e5]) {
      expect(Number.isFinite(stumpffC2(psi))).toBe(true);
      expect(Number.isFinite(stumpffC3(psi))).toBe(true);
      expect(stumpffC2(psi)).toBeGreaterThan(0);
    }
  });
});

describe('universal χ', () => {
  /** χ from the anomaly change, for an orbit with periapsis state at t = 0 (σ₀ = 0). */
  function chiFromAnomalies(mu: number, rp: number, e: number, dt: number): number {
    if (Math.abs(e - 1) < 1e-12) {
      // χ = √p · D for a parabola.
      const p = 2 * rp;
      const M = 2 * Math.sqrt(mu / p ** 3) * dt; // D + D³/3 = 2√(μ/p³)·t
      return Math.sqrt(p) * Math.tan(trueFromMean(M, 1) / 2);
    }
    const a = rp / (1 - e);
    const n = Math.sqrt(mu / Math.abs(a) ** 3);
    if (e < 1) return Math.sqrt(a) * solveKeplerElliptic(n * dt, e);
    return Math.sqrt(-a) * solveKeplerHyperbolic(n * dt, e);
  }

  const cases: [string, number][] = [
    ['elliptic', 0.3],
    ['parabolic', 1],
    ['hyperbolic', 1.8],
  ];
  for (const [name, e] of cases) {
    it(`agrees with the anomaly-based solution (${name})`, () => {
      const rp = 7000;
      const vp = Math.sqrt((MU_EARTH * (1 + e)) / rp);
      const alpha = 2 / rp - (vp * vp) / MU_EARTH;
      for (const dt of [60, 1800, 5000, -3000]) {
        const sol = solveUniversal(MU_EARTH, rp, 0, alpha, dt);
        const expected = chiFromAnomalies(MU_EARTH, rp, e, dt);
        expect(sol.chi / expected).toBeCloseTo(1, 10);
      }
    });
  }

  it('gives the same χ when forced onto the Brent fallback', () => {
    const rp = 7000;
    for (const e of [0.9, 1, 3]) {
      const vp = Math.sqrt((MU_EARTH * (1 + e)) / rp);
      const alpha = 2 / rp - (vp * vp) / MU_EARTH;
      const sigma0 = 0.37;
      for (const dt of [123, 4567, -890]) {
        const newton = solveUniversal(MU_EARTH, rp, sigma0, alpha, dt);
        const fallback = solveUniversal(MU_EARTH, rp, sigma0, alpha, dt, 1);
        expect(fallback.iterations).toBeGreaterThan(1);
        expect(fallback.chi / newton.chi).toBeCloseTo(1, 12);
      }
    }
  });
});
