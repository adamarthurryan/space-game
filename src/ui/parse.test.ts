import { describe, expect, it } from 'vitest';
import { calendarFromJd, jdFromSimTime } from '../math/time';
import { formatDate } from './format';
import { parseDate, parseDuration, parseSpeed } from './parse';

describe('parseSpeed', () => {
  it.each([
    ['12', 0.012],
    ['12 m/s', 0.012],
    ['-3.5 m/s', -0.0035],
    ['−3.5m/s', -0.0035],
    ['3.1 km/s', 3.1],
    ['3130.535', 3.130535],
    [' .5 KM/S ', 0.5],
    ['1e3', 1],
  ])('reads %s', (text, kmps) => expect(parseSpeed(text)).toBeCloseTo(kmps, 12));

  it.each(['', 'abc', '3 mph', '1.2.3', '--1'])('rejects %j', (text) =>
    expect(parseSpeed(text)).toBeNull(),
  );
});

describe('parseDuration', () => {
  it.each([
    ['1d 2h 30m', 86_400 + 7200 + 1800],
    ['+90s', 90],
    ['45 min', 2700],
    ['-10 s', -10],
    ['3600', 3600],
    ['1.5h', 5400],
    ['2 days 3 hrs', 2 * 86_400 + 3 * 3600],
  ])('reads %s', (text, s) => expect(parseDuration(text)).toBe(s));

  it.each(['', '+', '1 fortnight', 'h', '1h x', 'abc'])('rejects %j', (text) =>
    expect(parseDuration(text)).toBeNull(),
  );
});

describe('parseDate', () => {
  const epoch = 2_462_502.5; // 2030-01-01 00:00

  it('round-trips formatDate', () => {
    for (const t of [0, 3600, 1234567, -86_400 * 400]) {
      const text = formatDate(calendarFromJd(jdFromSimTime(epoch, t)));
      expect(parseDate(text, epoch)).toBeCloseTo(Math.floor(t), 3);
    }
  });

  it('reads a date alone or without seconds', () => {
    expect(parseDate('2030-01-02', epoch)).toBeCloseTo(86_400, 3);
    expect(parseDate('2030-01-01 01:30', epoch)).toBeCloseTo(5400, 3);
  });

  it.each(['2030-13-01', '2030-01-01 25:00', 'tomorrow', '2030/01/01'])('rejects %j', (text) =>
    expect(parseDate(text, epoch)).toBeNull(),
  );
});
