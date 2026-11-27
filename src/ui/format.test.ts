import { describe, expect, it } from 'vitest';
import { calendarFromJd } from '../math/time';
import { formatDate, formatWarp } from './format';

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
