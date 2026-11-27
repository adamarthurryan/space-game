import { describe, expect, it } from 'vitest';
import { createRng, next, range, type Rng } from '../math/rng';
import { norm, normSq, scale, sub, vec3, type Vec3 } from '../math/vec3';
import {
  angularMomentum,
  elementsFromState,
  type MeanElements,
  period,
  specificEnergy,
  stateFromElements,
  type StateVector,
} from './elements';
import { meanFromTrue, solveKeplerHyperbolic, trueFromHyperbolic, trueFromMean } from './kepler';
import { meanElementsAt, propagate, propagateInto, stateFromMeanElements } from './propagate';
import { planeToEcliptic } from './frames';

const MU_EARTH = 398_600.4418;
const MU_SUN = 1.327_124_400_18e11;

function expectVecClose(actual: Vec3, expected: Vec3, tol: number) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tol);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tol);
  expect(Math.abs(actual.z - expected.z)).toBeLessThanOrEqual(tol);
}

function stateDistance(a: StateVector, b: StateVector) {
  return { dr: norm(sub(a.r, b.r)), dv: norm(sub(a.v, b.v)) };
}

function randomUnit(rng: Rng): Vec3 {
  const z = range(rng, -1, 1);
  const phi = range(rng, 0, 2 * Math.PI);
  const s = Math.sqrt(1 - z * z);
  return vec3(s * Math.cos(phi), s * Math.sin(phi), z);
}

type Kind = 'elliptic' | 'hyperbolic' | 'near-parabolic';

function randomState(rng: Rng, kind: Kind): StateVector {
  const rMag = 10 ** range(rng, 3.82, 5.5);
  const vEsc = Math.sqrt((2 * MU_EARTH) / rMag);
  const factor =
    kind === 'elliptic'
      ? range(rng, 0.3, 0.98)
      : kind === 'hyperbolic'
        ? range(rng, 1.02, 3)
        : 1 + (next(rng) - 0.5) * 2e-8;
  return { r: scale(randomUnit(rng), rMag), v: scale(randomUnit(rng), vEsc * factor) };
}

describe('textbook cases', () => {
  // Vallado, Fundamentals of Astrodynamics and Applications (4th ed.), Example 2-4.
  it('Vallado 2-4: 40 minutes of an Earth orbit', () => {
    const s = propagate(
      MU_EARTH,
      { r: vec3(1131.34, -2282.343, 6672.423), v: vec3(-5.64305, 4.30333, 2.42879) },
      40 * 60,
    );
    expectVecClose(s.r, vec3(-4219.7527, 4363.0292, -3958.7666), 1e-3);
    expectVecClose(s.v, vec3(3.689866, -1.916735, -6.112511), 1e-6);
  });

  // Curtis, Orbital Mechanics for Engineering Students (3rd ed.), Example 3.7.
  it('Curtis 3.7: 60 minutes of an Earth orbit', () => {
    const s = propagate(398_600, { r: vec3(7000, -12_124, 0), v: vec3(2.6679, 4.621, 0) }, 60 * 60);
    expectVecClose(s.r, vec3(-3297.8, 7413.4, 0), 0.05);
    // v_y is a difference of large terms, and Curtis works with rounded f, g, ḟ and ġ, so his
    // last digit is off: this gives −0.96404.
    expectVecClose(s.v, vec3(-8.2977, -0.96309, 0), 1e-3);
  });
});

describe('invariants', () => {
  for (const kind of ['elliptic', 'hyperbolic', 'near-parabolic'] as const) {
    it(`${kind}: energy and angular momentum conserved; reversible; composable`, () => {
      const rng = createRng(`propagate-${kind}`);
      for (let k = 0; k < 500; k++) {
        const s0 = randomState(rng, kind);
        const dt1 = (next(rng) - 0.5) * 2 * 10 ** range(rng, 1, 6);
        const dt2 = (next(rng) - 0.5) * 2 * 10 ** range(rng, 1, 6);
        const s1 = propagate(MU_EARTH, s0, dt1);

        const energyScale = normSq(s0.v) / 2 + MU_EARTH / norm(s0.r);
        expect(
          Math.abs(specificEnergy(MU_EARTH, s1) - specificEnergy(MU_EARTH, s0)) / energyScale,
        ).toBeLessThan(1e-12);
        const h0 = angularMomentum(s0);
        expect(norm(sub(angularMomentum(s1), h0)) / norm(h0)).toBeLessThan(1e-12);

        // Coming back from far out on a hyperbola, f·r and g·v are ~1e10 km and cancel to the
        // ~1e4 km start, so rounding alone costs ~1e-10 relative.
        const tol = kind === 'hyperbolic' ? 1e-9 : 1e-11;
        const back = stateDistance(propagate(MU_EARTH, s1, -dt1), s0);
        expect(back.dr / norm(s0.r)).toBeLessThan(tol);
        expect(back.dv / norm(s0.v)).toBeLessThan(tol);

        const direct = propagate(MU_EARTH, s0, dt1 + dt2);
        const steps = stateDistance(propagate(MU_EARTH, s1, dt2), direct);
        expect(steps.dr / norm(direct.r)).toBeLessThan(tol);
        expect(steps.dv / norm(direct.v)).toBeLessThan(tol);
      }
    });
  }

  it('dt = 0 is the identity', () => {
    const s0 = { r: vec3(7000, 100, -20), v: vec3(0.1, 7.5, 0.3) };
    expect(propagate(MU_EARTH, s0, 0)).toEqual(s0);
  });
});

describe('long times', () => {
  it('a LEO state propagated by 1e9 s matches the mean-anomaly position', () => {
    const s0 = { r: vec3(6778, 0, 0), v: vec3(0, 7.6, 1.2) };
    const el = elementsFromState(MU_EARTH, s0);
    const a = el.p / (1 - el.e * el.e);
    const n = Math.sqrt(MU_EARTH / a ** 3);
    const dt = 1e9;
    const M = meanFromTrue(el.nu, el.e) + ((n * dt) % (2 * Math.PI));
    const expected = stateFromElements(MU_EARTH, { ...el, nu: trueFromMean(M, el.e) });
    const actual = propagate(MU_EARTH, s0, dt);
    // 1e9 s is itself only resolved to 1.2e-7 s, which is ~1e-6 km at 7.6 km/s.
    expect(norm(sub(actual.r, expected.r))).toBeLessThan(5e-6);
  });

  it('an elliptic orbit propagated by exactly N periods returns to the start', () => {
    const s0 = { r: vec3(8000, 1000, -500), v: vec3(-1, 8, 2) };
    const T = period(MU_EARTH, elementsFromState(MU_EARTH, s0));
    for (const N of [1, 7, 1000]) {
      const d = stateDistance(propagate(MU_EARTH, s0, N * T), s0);
      expect(d.dr).toBeLessThan(1e-9 * N + 1e-8);
    }
  });
});

describe('parabolic and near-parabolic', () => {
  const rp = 7000;
  const vp = Math.sqrt((2 * MU_EARTH) / rp);

  /** Barker's equation for a parabola with periapsis on +x at t = 0, in the xy plane. */
  function barker(t: number): Vec3 {
    const p = 2 * rp;
    const nu = trueFromMean(2 * Math.sqrt(MU_EARTH / p ** 3) * t, 1);
    const r = p / (1 + Math.cos(nu));
    return vec3(r * Math.cos(nu), r * Math.sin(nu), 0);
  }

  it('an exactly parabolic state agrees with Barker’s equation', () => {
    const s0 = { r: vec3(rp, 0, 0), v: vec3(0, vp, 0) };
    for (const t of [60, 3600, 86_400, -86_400, 1e7]) {
      const r = propagate(MU_EARTH, s0, t).r;
      expect(norm(sub(r, barker(t))) / norm(r)).toBeLessThan(1e-10);
    }
  });

  it('e = 1 ± 1e-9 stays within metres of the parabola after a day', () => {
    const t = 86_400;
    for (const e of [1 - 1e-9, 1 + 1e-9]) {
      const s0 = { r: vec3(rp, 0, 0), v: vec3(0, Math.sqrt((MU_EARTH * (1 + e)) / rp), 0) };
      const r = propagate(MU_EARTH, s0, t).r;
      expect(norm(sub(r, barker(t)))).toBeLessThan(0.01);
    }
  });
});

describe('hyperbolic', () => {
  it('agrees with the hyperbolic Kepler equation', () => {
    const rp = 7000;
    const e = 2;
    const s0 = { r: vec3(rp, 0, 0), v: vec3(0, Math.sqrt((MU_EARTH * (1 + e)) / rp), 0) };
    const a = rp / (1 - e);
    const n = Math.sqrt(MU_EARTH / (-a) ** 3);
    for (const t of [600, 36_000, -5000, 1e8]) {
      const nu = trueFromHyperbolic(solveKeplerHyperbolic(n * t, e), e);
      const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
      const expected = vec3(r * Math.cos(nu), r * Math.sin(nu), 0);
      const actual = propagate(MU_EARTH, s0, t).r;
      expect(norm(sub(actual, expected)) / r).toBeLessThan(1e-10);
    }
  });

  it('a heliocentric escape propagated by 1e9 s is finite', () => {
    const s0 = { r: vec3(1.496e8, 0, 0), v: vec3(5, 60, 1) };
    const s = propagate(MU_SUN, s0, 1e9);
    for (const c of [s.r.x, s.r.y, s.r.z, s.v.x, s.v.y, s.v.z]) {
      expect(Number.isFinite(c)).toBe(true);
    }
    expect(Math.abs(specificEnergy(MU_SUN, s) / specificEnergy(MU_SUN, s0) - 1)).toBeLessThan(
      1e-12,
    );
  });
});

describe('radial trajectory (h = 0)', () => {
  it('gives no NaN, and conserves energy away from the singularity', () => {
    const s0 = { r: vec3(7000, 0, 0), v: vec3(5, 0, 0) };
    const e0 = specificEnergy(MU_EARTH, s0);
    for (let t = -20_000; t <= 20_000; t += 97) {
      const s = propagate(MU_EARTH, s0, t);
      for (const c of [s.r.x, s.r.y, s.r.z, s.v.x, s.v.y, s.v.z]) {
        expect(Number.isNaN(c)).toBe(false);
      }
      if (norm(s.r) > 1000) {
        expect(Math.abs(specificEnergy(MU_EARTH, s) / e0 - 1)).toBeLessThan(1e-9);
      }
    }
  });
});

describe('propagateInto', () => {
  it('matches propagate, including when out aliases s0', () => {
    const s0 = { r: vec3(7000, -300, 1200), v: vec3(0.5, 7.2, 1.1) };
    const expected = propagate(MU_EARTH, s0, 1234);
    const out = { r: vec3(0, 0, 0), v: vec3(0, 0, 0) };
    expect(propagateInto(out, MU_EARTH, s0, 1234)).toEqual(expected);
    const aliased = { r: vec3(7000, -300, 1200), v: vec3(0.5, 7.2, 1.1) };
    expect(propagateInto(aliased, MU_EARTH, aliased, 1234)).toEqual(expected);
  });
});

describe('mean elements', () => {
  const YEAR = 31_557_600;
  // A Moon-like orbit: a, e, i, Ω, ω, M₀ and n.
  const base: MeanElements = {
    a: 384_400,
    e: 0.0554,
    i: 5.16 * (Math.PI / 180),
    lan: 2.18,
    argp: 5.55,
    meanAnomaly: 2.36,
    meanMotion: 2.661_7e-6,
  };
  // Nodal regression in 18.6 years, apsidal advance in 8.85 years, and a made-up i̇.
  const withRates: MeanElements = {
    ...base,
    rates: { lan: (-2 * Math.PI) / (18.6 * YEAR), argp: (2 * Math.PI) / (8.85 * YEAR), i: 1e-12 },
  };
  const plane = { poleRa: 0.7, poleDec: 1.1 };

  it('without rates, is periodic with 2π/n', () => {
    const T = (2 * Math.PI) / base.meanMotion;
    for (const t of [0, 1e5, -3e6]) {
      const d = stateDistance(
        stateFromMeanElements(base, t + 5 * T),
        stateFromMeanElements(base, t),
      );
      expect(d.dr).toBeLessThan(1e-6);
      expect(d.dv).toBeLessThan(1e-12);
    }
  });

  it('at t = 0, agrees with stateFromElements for μ = n²a³', () => {
    const mu = base.meanMotion ** 2 * base.a ** 3;
    const expected = stateFromElements(mu, {
      p: base.a * (1 - base.e ** 2),
      e: base.e,
      i: base.i,
      lan: base.lan,
      argp: base.argp,
      nu: trueFromMean(base.meanAnomaly, base.e),
    });
    const d = stateDistance(stateFromMeanElements(base, 0), expected);
    expect(d.dr).toBeLessThan(1e-9);
    expect(d.dv).toBeLessThan(1e-15);
  });

  it('applies the rates linearly and wraps the angles', () => {
    const m: MeanElements = {
      ...base,
      rates: { a: 1e-3, e: 1e-12, i: 1e-11, lan: -1e-8, argp: 2e-8 },
    };
    const t = 50 * YEAR;
    const at = meanElementsAt(m, t);
    expect(at.a).toBeCloseTo(base.a + 1e-3 * t, 6);
    expect(at.e).toBeCloseTo(base.e + 1e-12 * t, 15);
    expect(at.i).toBeCloseTo(base.i + 1e-11 * t, 15);
    for (const [key, rate, start] of [
      ['lan', -1e-8, base.lan],
      ['argp', 2e-8, base.argp],
      ['meanAnomaly', base.meanMotion, base.meanAnomaly],
    ] as const) {
      const angle = at[key];
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(2 * Math.PI);
      expect(Math.cos(angle - (start + rate * t))).toBeCloseTo(1, 9);
      expect(Math.sin(angle - (start + rate * t))).toBeCloseTo(0, 9);
    }
    expect(at.rates).toBe(m.rates);
    expect(at.meanMotion).toBe(base.meanMotion);
  });

  it('the velocity matches the central difference of the position', () => {
    for (const m of [base, withRates, { ...withRates, plane }]) {
      for (const t of [0, 1.234e6, 3e9, -5e9]) {
        const h = 1;
        const ahead = stateFromMeanElements(m, t + h).r;
        const behind = stateFromMeanElements(m, t - h).r;
        const numeric = scale(sub(ahead, behind), 1 / (2 * h));
        const v = stateFromMeanElements(m, t).v;
        expect(norm(sub(v, numeric)) / norm(v)).toBeLessThan(1e-6);
      }
    }
  });

  it('includes the rates of a and e in the velocity', () => {
    // Large enough that leaving the terms out would miss 1e-6 by orders of magnitude.
    const m: MeanElements = { ...withRates, rates: { ...withRates.rates, a: 1e-2, e: 3e-9 } };
    for (const t of [0, 2.5e5, 1e6]) {
      const numeric = scale(
        sub(stateFromMeanElements(m, t + 1).r, stateFromMeanElements(m, t - 1).r),
        0.5,
      );
      const v = stateFromMeanElements(m, t).v;
      expect(norm(sub(v, numeric)) / norm(v)).toBeLessThan(1e-6);
    }
  });

  it('moves backwards along the ellipse when n < 0 (as Tethys does, S1-18)', () => {
    const m: MeanElements = { ...withRates, meanMotion: -base.meanMotion };
    for (const t of [0, 3e5]) {
      const numeric = scale(
        sub(stateFromMeanElements(m, t + 1).r, stateFromMeanElements(m, t - 1).r),
        0.5,
      );
      const v = stateFromMeanElements(m, t).v;
      expect(norm(sub(v, numeric)) / norm(v)).toBeLessThan(1e-6);
    }
  });

  it('applies the reference plane as a rotation', () => {
    const local = stateFromMeanElements(base, 1e6);
    const rotated = stateFromMeanElements({ ...base, plane }, 1e6);
    expect(norm(sub(rotated.r, planeToEcliptic(plane, local.r)))).toBeLessThan(1e-9);
    expect(norm(sub(rotated.v, planeToEcliptic(plane, local.v)))).toBeLessThan(1e-15);
  });
});
