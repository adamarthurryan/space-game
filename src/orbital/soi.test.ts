import { describe, expect, it } from 'vitest';
import { AU_KM } from '../math/units';
import { norm, vec3 } from '../math/vec3';
import { stateFromElements, type StateVector } from './elements';
import { meanFromTrue } from './kepler';
import { propagate } from './propagate';
import { findSphereEntry, laplaceSoiRadius, timeToRadius } from './soi';

// GM in km³/s² (JPL DE440: the bodies' own GM, not their systems') and semi-major axes in km.
const MU_SUN = 1.327_124_400_18e11;
const MU_EARTH = 398_600.435;
const MU_MOON = 4902.8;
const MU_MARS = 42_828.37;
const MU_JUPITER = 126_686_531.9;
const MU_NEPTUNE = 6_835_100;
const MU_PHOBOS = 7.087e-4;

function expectWithin(actual: number, expected: number, rel: number) {
  expect(Math.abs(actual / expected - 1)).toBeLessThan(rel);
}

describe('laplaceSoiRadius', () => {
  it('matches the published SOI radii to 2%', () => {
    expectWithin(laplaceSoiRadius(1.000_001 * AU_KM, MU_EARTH, MU_SUN), 9.25e5, 0.02);
    expectWithin(laplaceSoiRadius(384_400, MU_MOON, MU_EARTH), 6.6e4, 0.02);
    expectWithin(laplaceSoiRadius(1.523_71 * AU_KM, MU_MARS, MU_SUN), 5.8e5, 0.02);
    expectWithin(laplaceSoiRadius(5.202_89 * AU_KM, MU_JUPITER, MU_SUN), 4.82e7, 0.02);
    expectWithin(laplaceSoiRadius(30.069_92 * AU_KM, MU_NEPTUNE, MU_SUN), 8.7e7, 0.02);
  });

  it('puts Phobos’s SOI inside its 11 km radius', () => {
    expect(laplaceSoiRadius(9376, MU_PHOBOS, MU_MARS)).toBeLessThan(11.08);
  });
});

describe('timeToRadius', () => {
  const mu = MU_EARTH;
  const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
  /** A state at true anomaly nu on an orbit of periapsis rp and eccentricity e. */
  const at = (rp: number, e: number, nu: number): StateVector =>
    stateFromElements(mu, { p: rp * (1 + e), e, i: 0.4, lan: 1, argp: 2, nu });

  it('ellipse: outbound from periapsis matches Kepler, and inbound is the mirror time', () => {
    const rp = 7000;
    const e = 0.5;
    const ra = (rp * (1 + e)) / (1 - e);
    const R = (rp + ra) / 2;
    const s = at(rp, e, 0);
    const out = timeToRadius(mu, s, R, 'outbound')!;
    const a = (rp + ra) / 2;
    const n = Math.sqrt(mu / a ** 3);
    const nuR = Math.acos((rp * (1 + e)) / R / e - 1 / e);
    expect(rel(out, meanFromTrue(nuR, e) / n)).toBeLessThan(1e-9);
    expect(rel(norm(propagate(mu, s, out).r), R)).toBeLessThan(1e-9);
    const inb = timeToRadius(mu, s, R, 'inbound')!;
    const P = (2 * Math.PI) / n;
    expect(rel(inb, P - out)).toBeLessThan(1e-9);
    expect(rel(norm(propagate(mu, s, inb).r), R)).toBeLessThan(1e-9);
  });

  it('ellipse with apoapsis below the radius: null', () => {
    expect(timeToRadius(mu, at(7000, 0.1, 0.3), 20_000, 'outbound')).toBeNull();
  });

  it('hyperbola: outbound to 10 r_p matches the hyperbolic Kepler equation', () => {
    const rp = 6700;
    const e = 1.4;
    const s = at(rp, e, 0);
    const R = 10 * rp;
    const t = timeToRadius(mu, s, R, 'outbound')!;
    const a = rp / (e - 1);
    const n = Math.sqrt(mu / a ** 3);
    const nuR = Math.acos((rp * (1 + e)) / R / e - 1 / e);
    expect(rel(t, meanFromTrue(nuR, e) / n)).toBeLessThan(1e-9);
    expect(rel(norm(propagate(mu, s, t).r), R)).toBeLessThan(1e-9);
  });

  it('hyperbola: inbound after periapsis is null', () => {
    expect(timeToRadius(mu, at(6700, 1.4, 0.5), 6800, 'inbound')).toBeNull();
  });

  it('parabola (e = 1) works', () => {
    const rp = 6700;
    const s = at(rp, 1, 0);
    const t = timeToRadius(mu, s, 5 * rp, 'outbound')!;
    expect(rel(norm(propagate(mu, s, t).r), 5 * rp)).toBeLessThan(1e-9);
  });

  it('already outside, moving in: inbound is positive, outbound null on an escape', () => {
    const s = at(6700, 1.4, -2.2);
    expect(norm(s.r)).toBeGreaterThan(20_000);
    const t = timeToRadius(mu, s, 20_000, 'inbound')!;
    expect(t).toBeGreaterThan(0);
    expect(rel(norm(propagate(mu, s, t).r), 20_000)).toBeLessThan(1e-9);
    const outward = at(6700, 1.4, 2.2);
    expect(timeToRadius(mu, outward, norm(outward.r) * 0.9, 'outbound')).toBeNull();
  });

  it('a near-circular orbit works from its argument-of-latitude convention', () => {
    const s = { r: vec3(7000, 0, 0), v: vec3(0, Math.sqrt(mu / 7000) * 1.000001, 0) };
    const R = norm(s.r) * 1.000001;
    const t = timeToRadius(mu, s, R, 'outbound')!;
    expect(rel(norm(propagate(mu, s, t).r), R)).toBeLessThan(1e-9);
  });
});

describe('findSphereEntry', () => {
  it('finds the first of two dips', () => {
    const f = (t: number) => Math.min(Math.abs(t - 100), Math.abs(t - 300)) - 10;
    expect(findSphereEntry(f, 0, 1000, 1, 1e-3)).toBeCloseTo(90, 6);
  });

  it('finds a dip of 2% below zero between huge steps', () => {
    // f starts at 1e6 and dips to −0.02·R at t = 5e5, at a rate of at most 1 per second.
    const R = 1000;
    const f = (t: number) => Math.abs(t - 5e5) - 0.02 * R;
    const t = findSphereEntry(f, 0, 1e7, 1, R / 100)!;
    expect(Math.abs(t - (5e5 - 0.02 * R))).toBeLessThan(1e-6);
  });

  it('gives null when f stays ≥ 0', () => {
    expect(findSphereEntry((t) => 1 + Math.sin(t) ** 2, 0, 1e4, 2, 1e-2)).toBeNull();
  });

  it('is accurate to 1e-6 s', () => {
    const f = (t: number) => 3e5 - 1.2 * t + 0.5 * Math.sin(t / 100);
    const t = findSphereEntry(f, 0, 1e6, 2, 1)!;
    expect(Math.abs(f(t))).toBeLessThan(1e-5);
    expect(f(t - 1e-6)).toBeGreaterThan(0);
  });

  it('ignores a start inside until f has gone positive', () => {
    const f = (t: number) => Math.abs(t - 50) - 10; // inside from t = 40 to 60
    expect(findSphereEntry(f, 45, 100, 1, 1e-3)).toBeNull();
    const g = (t: number) => Math.min(Math.abs(t - 50), Math.abs(t - 200)) - 10;
    expect(findSphereEntry(g, 45, 300, 1, 1e-3)).toBeCloseTo(190, 6);
  });
});
