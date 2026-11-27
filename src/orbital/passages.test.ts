import { describe, expect, it } from 'vitest';
import { DEG } from '../math/units';
import { norm, vec3 } from '../math/vec3';
import { period, stateFromElements, type ConicElements } from './elements';
import { eclipticToPlane, planePole } from './frames';
import { meanFromTrue } from './kepler';
import { nearestPassage, timeToPassage } from './passages';
import { propagate } from './propagate';

const MU = 398_600.435;
const Z = vec3(0, 0, 1);
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

const ellipse: ConicElements = { p: 8000 * (1 - 0.04), e: 0.2, i: 0.5, lan: 1, argp: 0.7, nu: 1.2 };
const n = (el: ConicElements) => {
  const a = el.p / (1 - el.e * el.e);
  return Math.sqrt(MU / a ** 3);
};

describe('timeToPassage', () => {
  it('finds periapsis and apoapsis by Kepler’s equation', () => {
    const s = stateFromElements(MU, ellipse);
    const P = period(MU, ellipse);
    const tPe = timeToPassage(MU, s, 'periapsis', Z)!;
    const expected = (2 * Math.PI - meanFromTrue(ellipse.nu, ellipse.e)) / n(ellipse);
    expect(rel(tPe, expected)).toBeLessThan(1e-9);
    const rp = ellipse.p / (1 + ellipse.e);
    expect(rel(norm(propagate(MU, s, tPe).r), rp)).toBeLessThan(1e-9);
    const tAp = timeToPassage(MU, s, 'apoapsis', Z)!;
    expect(tAp).toBeGreaterThan(0);
    expect(tAp).toBeLessThan(P);
    expect(rel(norm(propagate(MU, s, tAp).r), ellipse.p / (1 - ellipse.e))).toBeLessThan(1e-9);
  });

  it('skips a passage within minDt', () => {
    const atPe = stateFromElements(MU, { ...ellipse, nu: 0 });
    const P = period(MU, ellipse);
    expect(rel(timeToPassage(MU, atPe, 'periapsis', Z)!, P)).toBeLessThan(1e-9);
    const t = timeToPassage(MU, atPe, 'apoapsis', Z)!;
    expect(rel(t, P / 2)).toBeLessThan(1e-9);
    expect(rel(timeToPassage(MU, atPe, 'apoapsis', Z, t + 1)!, 1.5 * P)).toBeLessThan(1e-9);
  });

  it('has no apoapsis on a hyperbola, and no periapsis once past it', () => {
    const before = stateFromElements(MU, { p: 14000, e: 1.5, i: 0.1, lan: 0, argp: 0, nu: -1 });
    const after = stateFromElements(MU, { p: 14000, e: 1.5, i: 0.1, lan: 0, argp: 0, nu: 1 });
    expect(timeToPassage(MU, before, 'apoapsis', Z)).toBeNull();
    const t = timeToPassage(MU, before, 'periapsis', Z)!;
    expect(rel(norm(propagate(MU, before, t).r), 14000 / 2.5)).toBeLessThan(1e-9);
    expect(timeToPassage(MU, after, 'periapsis', Z)).toBeNull();
  });

  it('finds the nodes against an inclined plane', () => {
    const plane = { poleRa: 30 * DEG, poleDec: 70 * DEG };
    const pole = planePole(plane);
    const s = stateFromElements(MU, ellipse);
    for (const kind of ['ascending-node', 'descending-node'] as const) {
      const t = timeToPassage(MU, s, kind, pole)!;
      const at = propagate(MU, s, t);
      const r = eclipticToPlane(plane, at.r);
      const v = eclipticToPlane(plane, at.v);
      expect(Math.abs(r.z) / norm(r)).toBeLessThan(1e-9);
      expect(kind === 'ascending-node' ? v.z > 0 : v.z < 0).toBe(true);
    }
  });

  it('finds nodes on a circular orbit, and none in the plane', () => {
    const circ = stateFromElements(MU, { p: 7000, e: 0, i: 0.4, lan: 1, argp: 0, nu: 2 });
    const t = timeToPassage(MU, circ, 'ascending-node', Z)!;
    const at = propagate(MU, circ, t);
    expect(Math.abs(at.r.z)).toBeLessThan(1e-6);
    expect(at.v.z).toBeGreaterThan(0);
    expect(timeToPassage(MU, circ, 'periapsis', Z)).toBeNull();
    const flat = stateFromElements(MU, { p: 7000, e: 0.1, i: 0, lan: 0, argp: 0, nu: 2 });
    expect(timeToPassage(MU, flat, 'ascending-node', Z)).toBeNull();
  });
});

describe('nearestPassage', () => {
  it('picks the closer of the previous and next passage', () => {
    const P = period(MU, ellipse);
    const justAfter = stateFromElements(MU, { ...ellipse, nu: 0.1 });
    const back = nearestPassage(MU, justAfter, 'periapsis')!;
    expect(back).toBeLessThan(0);
    expect(back).toBeGreaterThan(-P / 2);
    const justBefore = stateFromElements(MU, { ...ellipse, nu: -0.1 });
    expect(nearestPassage(MU, justBefore, 'periapsis')!).toBeGreaterThan(0);
  });

  it('gives a signed periapsis time on a hyperbola', () => {
    const after = stateFromElements(MU, { p: 14000, e: 1.5, i: 0.1, lan: 0, argp: 0, nu: 1 });
    expect(nearestPassage(MU, after, 'periapsis')!).toBeLessThan(0);
    expect(nearestPassage(MU, after, 'apoapsis')).toBeNull();
  });
});
