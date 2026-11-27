import { describe, expect, it } from 'vitest';
import { createRng, next, range, type Rng } from '../math/rng';
import { DEG } from '../math/units';
import { norm, normalize, scale, vec3, type Vec3 } from '../math/vec3';
import {
  apoapsis,
  conicKind,
  elementsFromState,
  periapsis,
  period,
  semiMajorAxis,
  stateFromElements,
  type ConicElements,
  type StateVector,
} from './elements';

const MU_CURTIS = 398_600;
const MU_VALLADO = 398_600.4418;

function expectVecClose(actual: Vec3, expected: Vec3, tol: number) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tol);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tol);
  expect(Math.abs(actual.z - expected.z)).toBeLessThanOrEqual(tol);
}

function expectStateClose(actual: StateVector, expected: StateVector, rel: number) {
  expectVecClose(actual.r, expected.r, rel * norm(expected.r));
  expectVecClose(actual.v, expected.v, rel * norm(expected.v));
}

function expectFinite(el: ConicElements) {
  for (const v of Object.values(el)) expect(Number.isFinite(v)).toBe(true);
}

function randomUnit(rng: Rng): Vec3 {
  const z = range(rng, -1, 1);
  const phi = range(rng, 0, 2 * Math.PI);
  const s = Math.sqrt(1 - z * z);
  return vec3(s * Math.cos(phi), s * Math.sin(phi), z);
}

describe('textbook cases', () => {
  // Curtis, Orbital Mechanics for Engineering Students (3rd ed.), Example 4.3.
  it('Curtis 4.3: state → elements', () => {
    const el = elementsFromState(MU_CURTIS, {
      r: vec3(-6045, -3490, 2500),
      v: vec3(-3.457, 6.618, 2.533),
    });
    expect(Math.sqrt(el.p * MU_CURTIS)).toBeCloseTo(58_310, -1);
    expect(el.i / DEG).toBeCloseTo(153.2, 1);
    expect(el.lan / DEG).toBeCloseTo(255.3, 1);
    expect(el.e).toBeCloseTo(0.1712, 4);
    expect(el.argp / DEG).toBeCloseTo(20.07, 1);
    expect(el.nu / DEG).toBeCloseTo(28.45, 1);
  });

  // Curtis Example 4.7: elements → state, hyperbolic.
  it('Curtis 4.7: elements → state (hyperbolic)', () => {
    const s = stateFromElements(MU_CURTIS, {
      p: 80_000 ** 2 / MU_CURTIS,
      e: 1.4,
      i: 30 * DEG,
      lan: 40 * DEG,
      argp: 60 * DEG,
      nu: 30 * DEG,
    });
    expectVecClose(s.r, vec3(-4040, 4815, 3629), 1);
    expectVecClose(s.v, vec3(-10.39, -4.772, 1.744), 0.005);
  });

  // Vallado, Fundamentals of Astrodynamics and Applications (4th ed.), Example 2-5.
  it('Vallado 2-5: state → elements', () => {
    const el = elementsFromState(MU_VALLADO, {
      r: vec3(6524.834, 6862.875, 6448.296),
      v: vec3(4.901327, 5.533756, -1.976341),
    });
    expect(el.p).toBeCloseTo(11_067.79, 1);
    expect(semiMajorAxis(el)).toBeCloseTo(36_127.343, 0);
    expect(el.e).toBeCloseTo(0.832_853, 5);
    expect(el.i / DEG).toBeCloseTo(87.87, 2);
    expect(el.lan / DEG).toBeCloseTo(227.89, 1);
    expect(el.argp / DEG).toBeCloseTo(53.38, 2);
    expect(el.nu / DEG).toBeCloseTo(92.335, 2);
  });

  // Vallado Example 2-6: elements → state.
  it('Vallado 2-6: elements → state', () => {
    const s = stateFromElements(MU_VALLADO, {
      p: 11_067.79,
      e: 0.832_85,
      i: 87.87 * DEG,
      lan: 227.89 * DEG,
      argp: 53.38 * DEG,
      nu: 92.335 * DEG,
    });
    expectVecClose(s.r, vec3(6525.368, 6861.532, 6449.119), 0.05);
    expectVecClose(s.v, vec3(4.902279, 5.53314, -1.97571), 5e-5);
  });
});

describe('round trips', () => {
  it('state → elements → state for 10,000 random states', () => {
    const rng = createRng('elements-round-trip');
    for (let k = 0; k < 10_000; k++) {
      const rMag = 10 ** range(rng, 3.8, 6);
      const vEsc = Math.sqrt((2 * MU_CURTIS) / rMag);
      // Speeds from slow ellipses to fast hyperbolas, a third of them within 1e-6 of escape.
      const factor =
        k % 3 === 0 ? 1 + (next(rng) - 0.5) * 2 * 10 ** range(rng, -12, -6) : range(rng, 0.2, 2);
      const s: StateVector = {
        r: scale(randomUnit(rng), rMag),
        v: scale(randomUnit(rng), vEsc * factor),
      };
      const el = elementsFromState(MU_CURTIS, s);
      expectFinite(el);
      expectStateClose(stateFromElements(MU_CURTIS, el), s, 1e-10);
    }
  });
});

describe('singular cases', () => {
  const r0 = 7000;
  const vc = Math.sqrt(MU_CURTIS / r0);

  const cases: [string, StateVector, Partial<ConicElements>][] = [
    ['circular inclined', { r: vec3(r0, 0, 0), v: vec3(0, vc * 0.6, vc * 0.8) }, { argp: 0 }],
    ['equatorial elliptic', { r: vec3(r0, 0, 0), v: vec3(0, vc * 1.2, 0) }, { lan: 0, i: 0 }],
    [
      'retrograde equatorial',
      { r: vec3(r0, 0, 0), v: vec3(0, -vc * 1.2, 0) },
      { lan: 0, i: Math.PI },
    ],
    [
      'circular equatorial',
      { r: vec3(0, r0, 0), v: vec3(-vc, 0, 0) },
      { lan: 0, argp: 0, i: 0, nu: Math.PI / 2 },
    ],
    [
      'circular retrograde equatorial',
      { r: vec3(0, r0, 0), v: vec3(vc, 0, 0) },
      { lan: 0, argp: 0, i: Math.PI, nu: -Math.PI / 2 },
    ],
    ['parabolic', { r: vec3(r0, 0, 0), v: vec3(0, vc * Math.SQRT2, 0) }, { lan: 0, nu: 0 }],
  ];

  for (const [name, s, expected] of cases) {
    it(`${name}: finite, follows S1-13, round-trips`, () => {
      const el = elementsFromState(MU_CURTIS, s);
      expectFinite(el);
      for (const [key, value] of Object.entries(expected)) {
        expect(el[key as keyof ConicElements]).toBeCloseTo(value, 12);
      }
      expectStateClose(stateFromElements(MU_CURTIS, el), s, 1e-12);
    });
  }

  it('the circular ν is the argument of latitude', () => {
    const el: ConicElements = { p: r0, e: 0, i: 0.5, lan: 1, argp: 0, nu: 0.7 };
    const back = elementsFromState(MU_CURTIS, stateFromElements(MU_CURTIS, el));
    expect(back.lan).toBeCloseTo(1, 12);
    expect(back.argp).toBe(0);
    expect(back.nu).toBeCloseTo(0.7, 12);
  });

  it('the equatorial ω is the longitude of periapsis, prograde and retrograde', () => {
    for (const i of [0, Math.PI]) {
      const el: ConicElements = { p: r0, e: 0.3, i, lan: 0, argp: 1.2, nu: 0.3 };
      const back = elementsFromState(MU_CURTIS, stateFromElements(MU_CURTIS, el));
      expect(back.lan).toBe(0);
      expect(back.argp).toBeCloseTo(1.2, 12);
      expect(back.nu).toBeCloseTo(0.3, 12);
    }
  });

  it('a near-circular, near-equatorial orbit is finite', () => {
    const v = scale(normalize(vec3(0, 1, 1e-13)), vc * (1 + 1e-12));
    expectFinite(elementsFromState(MU_CURTIS, { r: vec3(r0, 0, 0), v }));
  });
});

describe('derived values', () => {
  it('for a known ellipse', () => {
    // rp = 7000 km, ra = 21 000 km: a = 14 000, e = 0.5, p = a(1 − e²) = 10 500.
    const el: ConicElements = { p: 10_500, e: 0.5, i: 0, lan: 0, argp: 0, nu: 0 };
    expect(conicKind(el.e)).toBe('elliptic');
    expect(semiMajorAxis(el)).toBeCloseTo(14_000, 9);
    expect(periapsis(el)).toBeCloseTo(7000, 9);
    expect(apoapsis(el)).toBeCloseTo(21_000, 9);
    expect(period(MU_CURTIS, el)).toBeCloseTo(2 * Math.PI * Math.sqrt(14_000 ** 3 / MU_CURTIS), 6);
  });

  it('for a hyperbola and a parabola', () => {
    const hyp: ConicElements = { p: 20_000, e: 1.5, i: 0, lan: 0, argp: 0, nu: 0 };
    expect(conicKind(hyp.e)).toBe('hyperbolic');
    expect(semiMajorAxis(hyp)).toBeLessThan(0);
    expect(periapsis(hyp)).toBeCloseTo(8000, 9);
    expect(apoapsis(hyp)).toBe(Infinity);
    expect(period(MU_CURTIS, hyp)).toBe(Infinity);

    const par: ConicElements = { ...hyp, e: 1 };
    expect(conicKind(1 + 1e-13)).toBe('parabolic');
    expect(semiMajorAxis(par)).toBe(Infinity);
    expect(periapsis(par)).toBe(10_000);
    expect(apoapsis(par)).toBe(Infinity);
    expect(period(MU_CURTIS, par)).toBe(Infinity);
  });
});
