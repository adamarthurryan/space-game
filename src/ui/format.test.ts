import { describe, expect, it } from 'vitest';
import { calendarFromJd } from '../math/time';
import { parseSpeed } from './parse';
import {
  formatAngle,
  formatCountdown,
  formatDate,
  formatDistance,
  formatDuration,
  formatDv,
  formatMass,
  formatScientific,
  formatSpeed,
  formatWarp,
} from './format';

describe('formatDate', () => {
  it('formats the sandbox epoch', () => {
    expect(formatDate(calendarFromJd(2_462_502.5))).toBe('2030-01-01 00:00:00');
  });

  it('pads every field and truncates seconds', () => {
    expect(formatDate({ year: 987, month: 3, day: 4, hour: 5, minute: 6, second: 7.999 })).toBe(
      '0987-03-04 05:06:07',
    );
  });

  it('signs years ≤ 0', () => {
    expect(formatDate({ year: -999, month: 1, day: 1, hour: 0, minute: 0, second: 0 })).toBe(
      '−0999-01-01 00:00:00',
    );
    expect(formatDate({ year: 0, month: 12, day: 31, hour: 23, minute: 59, second: 59 })).toBe(
      '−0000-12-31 23:59:59',
    );
  });
});

describe('formatWarp', () => {
  it('writes powers of ten with superscripts', () => {
    expect(formatWarp(1)).toBe('×1');
    expect(formatWarp(10)).toBe('×10');
    expect(formatWarp(100)).toBe('×10²');
    expect(formatWarp(1e6)).toBe('×10⁶');
    expect(formatWarp(1e7)).toBe('×10⁷');
  });

  it('writes other rates in full', () => {
    expect(formatWarp(0)).toBe('×0');
    expect(formatWarp(2)).toBe('×2');
  });
});

describe('formatDistance', () => {
  it('uses km with separators below 1e7 km, AU above', () => {
    expect(formatDistance(6771.4)).toBe('6771 km');
    expect(formatDistance(9_999_999)).toBe('9999999 km');
    expect(formatDistance(2.28e8)).toBe('1.524 AU');
    expect(formatDistance(11.08)).toBe('11.1 km');
    expect(formatDistance(Infinity)).toBe('∞');
  });
});

describe('formatSpeed', () => {
  it('uses km/s, or m/s below 1 km/s', () => {
    expect(formatSpeed(7.6712)).toBe('7.67 km/s');
    expect(formatSpeed(0.34)).toBe('340 m/s');
    expect(formatSpeed(1.5)).toBe('1.50 km/s');
  });
});

describe('formatDuration', () => {
  it('covers seconds to years', () => {
    expect(formatDuration(42)).toBe('42.0 s');
    expect(formatDuration(725)).toBe('12 min 5 s');
    expect(formatDuration(86_164.1)).toBe('23 h 56 min');
    expect(formatDuration(27.32 * 86_400)).toBe('27 d 7 h');
    expect(formatDuration(1.881 * 365.25 * 86_400)).toBe('1.881 yr');
    expect(formatDuration(-90)).toBe('−1 min 30 s');
  });
});

describe('formatAngle and formatMass', () => {
  it('formats degrees with two decimals', () => {
    expect(formatAngle((23.4392 * Math.PI) / 180)).toBe('23.44°');
    expect(formatAngle(-Math.PI / 2)).toBe('−90.00°');
  });

  it('formats mass in scientific notation', () => {
    expect(formatMass(5.9722e24)).toBe('5.972 × 10²⁴ kg');
    expect(formatMass(1.0659e16)).toBe('1.066 × 10¹⁶ kg');
    expect(formatMass(9.9996e19)).toBe('1.000 × 10²⁰ kg');
    expect(formatScientific(2.5e-3, 'm')).toBe('2.500 × 10⁻³ m');
  });
});

describe('formatCountdown', () => {
  it('shows the two leading units', () => {
    expect(formatCountdown(42.7)).toBe('42 s');
    expect(formatCountdown(41 * 60 + 30)).toBe('41 min');
    expect(formatCountdown(5 * 3600 + 12 * 60)).toBe('5 h 12 min');
    expect(formatCountdown(2 * 86_400 + 22 * 3600 + 5)).toBe('2 d 22 h');
    expect(formatCountdown(2 * 365.25 * 86_400)).toBe('2.000 yr');
    expect(formatCountdown(-5)).toBe('0 s');
  });
});

describe('formatDv (S5b-18)', () => {
  it('is m/s with one decimal, no digit grouping, and a sign', () => {
    expect(formatDv(3.1305)).toBe('3130.5 m/s');
    expect(formatDv(0.0004)).toBe('0.4 m/s');
    expect(formatDv(-0.012)).toBe('−12.0 m/s');
    expect(formatDv(0)).toBe('0.0 m/s');
    expect(formatDv(-0.00001)).toBe('0.0 m/s');
    expect(formatDv(12.34567)).toBe('12345.7 m/s');
  });
});

describe('no digit grouping (decision 182)', () => {
  it('never puts a comma in a number', () => {
    for (const x of [0.5, 999, 1234.5, 98_765.4, 9_999_999]) {
      expect(formatDistance(x)).not.toContain(',');
      expect(formatSpeed(x)).not.toContain(',');
      expect(formatSpeed(x / 1000)).not.toContain(',');
      expect(formatDv(x)).not.toContain(',');
    }
  });

  it('a plan Δv reads back as typed input', () => {
    for (const kmps of [3.1305, -12.3456, 0.0004, 45.6789]) {
      expect(parseSpeed(formatDv(kmps))).toBeCloseTo(kmps, 4);
    }
  });
});
