import { describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../gen/scenario';
import { vec3 } from '../math/vec3';
import { sampleMeanOrbitInto } from '../orbital/sample';
import { bodyWorldState, getBody } from '../sim/body';
import {
  distanceFade,
  ORBIT_SEGMENTS,
  projectedDiameterPx,
  screenFade,
  writeOrbitLine,
} from './orbitFade';

describe('fades', () => {
  it('screenFade: 0 under 15 px, 1 above 40 px', () => {
    expect(screenFade(0)).toBe(0);
    expect(screenFade(15)).toBe(0);
    expect(screenFade(27.5)).toBeCloseTo(0.5, 12);
    expect(screenFade(40)).toBe(1);
    expect(screenFade(Infinity)).toBe(1);
  });

  it('distanceFade: 1 within 10×, log-linear to 0.2 at 1000×, then flat', () => {
    expect(distanceFade(0)).toBe(1);
    expect(distanceFade(10)).toBe(1);
    expect(distanceFade(100)).toBeCloseTo(0.6, 12);
    expect(distanceFade(1000)).toBeCloseTo(0.2, 12);
    expect(distanceFade(1e6)).toBe(0.2);
  });

  it('projectedDiameterPx', () => {
    // A radius equal to the distance × tan(fov/2) spans the whole viewport height.
    const fov = (50 * Math.PI) / 180;
    expect(projectedDiameterPx(Math.tan(fov / 2) * 1000, 1000, 700, fov)).toBeCloseTo(700, 9);
    expect(projectedDiameterPx(10, 5, 700, fov)).toBe(Infinity);
  });

  it("hides the Moon's orbit at system zoom, and shows Jupiter's", () => {
    const fov = (50 * Math.PI) / 180;
    const d = 1e10; // about 21 notches out from low Earth orbit
    expect(screenFade(projectedDiameterPx(405_500, d, 716, fov))).toBe(0);
    expect(screenFade(projectedDiameterPx(8.16e8, d, 716, fov))).toBe(1);
  });
});

describe('writeOrbitLine', () => {
  const sys = createSandboxWorld().system;
  const t = 5e7;
  const n = ORBIT_SEGMENTS;

  it("starts exactly at the body, relative to the origin, with Earth's orbit around the Sun", () => {
    const sample = sampleMeanOrbitInto(
      getBody(sys, 'earth').orbit!,
      t,
      n,
      new Float64Array(3 * (n + 1)),
    );
    const out = { positions: new Float32Array(3 * (n + 1)), colors: new Float32Array(4 * (n + 1)) };
    const origin = bodyWorldState(sys, 'earth', t).r;
    writeOrbitLine(
      out,
      sample,
      n,
      vec3(0, 0, 0),
      origin,
      vec3(0, 0, 1e4),
      1e4,
      [1, 0.5, 0.25],
      0.5,
      true,
    );
    // The body is at the origin: the first vertex is within float32 rounding of zero.
    for (let k = 0; k < 3; k++) expect(Math.abs(out.positions[k]!)).toBeLessThan(1e-3);
    expect([...out.colors.subarray(0, 4)]).toEqual([1, 0.5, 0.25, 0.5]);
    // Far round the orbit, the alpha has faded to the floor.
    expect(out.colors[4 * (n / 2) + 3]).toBeCloseTo(0.5 * 0.2, 6);
  });

  it('without the distance fade, every vertex has the given alpha', () => {
    const sample = new Float64Array(3 * 3).fill(1e9);
    const out = { positions: new Float32Array(9), colors: new Float32Array(12) };
    writeOrbitLine(
      out,
      sample,
      2,
      vec3(0, 0, 0),
      vec3(0, 0, 0),
      vec3(0, 0, 1),
      1,
      [1, 1, 1],
      0.7,
      false,
    );
    for (let j = 0; j < 3; j++) expect(out.colors[4 * j + 3]).toBeCloseTo(0.7, 6);
  });
});
