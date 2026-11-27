import { describe, expect, it } from 'vitest';
import {
  AU_KM,
  DEG,
  degToRad,
  fromKg,
  fromKm,
  fromKmPerS,
  fromSeconds,
  G,
  G0,
  radToDeg,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_JULIAN_YEAR,
  SECONDS_PER_MINUTE,
  toKg,
  toKm,
  toKmPerS,
  toSeconds,
  TWO_PI,
  wrapPi,
  wrapTwoPi,
  type DistanceUnit,
  type DurationUnit,
  type MassUnit,
  type SpeedUnit,
} from './units';

describe('constants', () => {
  it('have their defined values', () => {
    expect(AU_KM).toBe(149_597_870.7);
    expect(G).toBe(6.6743e-20);
    expect(G0).toBe(0.00980665);
    expect(SECONDS_PER_MINUTE).toBe(60);
    expect(SECONDS_PER_HOUR).toBe(3600);
    expect(SECONDS_PER_DAY).toBe(86_400);
    expect(SECONDS_PER_JULIAN_YEAR).toBe(365.25 * 86_400);
    expect(TWO_PI).toBe(2 * Math.PI);
    expect(180 * DEG).toBe(Math.PI);
  });
});

describe('conversions', () => {
  it('convert to internal units', () => {
    expect(toKm(1, 'AU')).toBe(AU_KM);
    expect(toKm(2500, 'm')).toBe(2.5);
    expect(toKmPerS(7800, 'm/s')).toBe(7.8);
    expect(fromKmPerS(7.8, 'km/s')).toBe(7.8);
    expect(toKg(1, 't')).toBe(1000);
    expect(toSeconds(1, 'yr')).toBe(365.25 * SECONDS_PER_DAY);
    expect(toSeconds(1, 'd')).toBe(86_400);
    expect(fromSeconds(5400, 'h')).toBe(1.5);
  });

  it('round-trip for every unit', () => {
    const values = [0, 1, 7.8, -3.25, 1e-6, 123_456.789];
    const close = (x: number, y: number) =>
      expect(Math.abs(x - y)).toBeLessThanOrEqual(1e-15 * Math.max(1, Math.abs(y)));

    for (const v of values) {
      for (const u of ['m', 'km', 'AU'] as DistanceUnit[]) close(fromKm(toKm(v, u), u), v);
      for (const u of ['m/s', 'km/s'] as SpeedUnit[]) close(fromKmPerS(toKmPerS(v, u), u), v);
      for (const u of ['kg', 't'] as MassUnit[]) close(fromKg(toKg(v, u), u), v);
      for (const u of ['s', 'min', 'h', 'd', 'yr'] as DurationUnit[]) {
        close(fromSeconds(toSeconds(v, u), u), v);
      }
    }
  });

  it('1 AU → km → AU, and 7.8 km/s ↔ 7800 m/s, are exact', () => {
    expect(fromKm(toKm(1, 'AU'), 'AU')).toBe(1);
    expect(fromKmPerS(7.8, 'm/s')).toBe(7800);
    expect(toKmPerS(7800, 'm/s')).toBe(7.8);
  });
});

describe('angles', () => {
  it('degToRad and radToDeg are inverses', () => {
    expect(degToRad(180)).toBe(Math.PI);
    expect(radToDeg(Math.PI / 2)).toBe(90);
    expect(radToDeg(degToRad(37.5))).toBeCloseTo(37.5, 13);
  });

  it('wrapTwoPi maps into [0, 2π)', () => {
    expect(wrapTwoPi(0)).toBe(0);
    expect(wrapTwoPi(TWO_PI)).toBe(0);
    expect(wrapTwoPi(-Math.PI / 2)).toBeCloseTo(1.5 * Math.PI, 15);
    expect(wrapTwoPi(-TWO_PI)).toBe(0);
    expect(wrapTwoPi(1 + 1000 * TWO_PI)).toBeCloseTo(1, 10);
    expect(wrapTwoPi(1 - 1000 * TWO_PI)).toBeCloseTo(1, 10);
    // A tiny negative angle must not round to exactly 2π.
    const w = wrapTwoPi(-1e-17);
    expect(w).toBeGreaterThanOrEqual(0);
    expect(w).toBeLessThan(TWO_PI);
  });

  it('wrapPi maps into (−π, π]', () => {
    expect(wrapPi(Math.PI)).toBe(Math.PI);
    expect(wrapPi(-Math.PI)).toBe(Math.PI);
    expect(wrapPi(0)).toBe(0);
    expect(wrapPi(1.5 * Math.PI)).toBeCloseTo(-0.5 * Math.PI, 15);
    expect(wrapPi(-1.5 * Math.PI)).toBeCloseTo(0.5 * Math.PI, 15);
    expect(wrapPi(-0.1)).toBeCloseTo(-0.1, 15);
    expect(wrapPi(3 * Math.PI)).toBeCloseTo(Math.PI, 13);
  });
});
