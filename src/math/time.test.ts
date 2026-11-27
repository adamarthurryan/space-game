import { describe, expect, it } from 'vitest';
import { createRng, int, next } from './rng';
import {
  calendarFromJd,
  centuriesSinceJ2000,
  DAYS_PER_JULIAN_CENTURY,
  J2000_JD,
  jdFromCalendar,
  jdFromSimTime,
  SECONDS_PER_JULIAN_CENTURY,
  simTimeFromJd,
  type CalendarDate,
} from './time';
import { SECONDS_PER_DAY } from './units';

function date(year: number, month: number, day: number, hour = 0, minute = 0, second = 0) {
  return { year, month, day, hour, minute, second };
}

/** Days in a month, in the calendar in force (Julian leap years before 1583). */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap =
      year < 1583 ? year % 4 === 0 : (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

describe('jdFromCalendar', () => {
  // Meeus, Astronomical Algorithms (2nd ed.), ch. 7.
  it('matches Meeus’s worked examples', () => {
    expect(jdFromCalendar(date(2000, 1, 1, 12))).toBe(2_451_545.0);
    // Example 7.a: 1957 October 4.81 (Sputnik 1). 0.81 d = 19:26:24.
    expect(jdFromCalendar(date(1957, 10, 4, 19, 26, 24))).toBeCloseTo(2_436_116.31, 8);
    // Example 7.b: 333 January 27.5, Julian calendar.
    expect(jdFromCalendar(date(333, 1, 27, 12))).toBe(1_842_713.0);
    expect(jdFromCalendar(date(-4712, 1, 1, 12))).toBe(0);
  });

  it('more of Meeus’s table 7 values', () => {
    expect(jdFromCalendar(date(1987, 1, 27))).toBe(2_446_822.5);
    expect(jdFromCalendar(date(1988, 6, 19, 12))).toBe(2_447_332.0);
    expect(jdFromCalendar(date(1600, 1, 1))).toBe(2_305_447.5);
    expect(jdFromCalendar(date(1600, 12, 31))).toBe(2_305_812.5);
    expect(jdFromCalendar(date(837, 4, 10, 7, 12))).toBeCloseTo(2_026_871.8, 8);
    expect(jdFromCalendar(date(-1000, 7, 12, 12))).toBe(1_356_001.0);
    expect(jdFromCalendar(date(-1001, 8, 17, 21, 36))).toBeCloseTo(1_355_671.4, 8);
  });

  it('switches to the Gregorian calendar with consecutive days', () => {
    const lastJulian = jdFromCalendar(date(1582, 10, 4));
    const firstGregorian = jdFromCalendar(date(1582, 10, 15));
    expect(firstGregorian - lastJulian).toBe(1);
    expect(calendarFromJd(lastJulian)).toEqual(date(1582, 10, 4));
    expect(calendarFromJd(firstGregorian)).toEqual(date(1582, 10, 15));
  });
});

describe('calendarFromJd', () => {
  it('inverts the worked examples', () => {
    expect(calendarFromJd(2_451_545.0)).toEqual(date(2000, 1, 1, 12));
    expect(calendarFromJd(2_436_116.31)).toEqual(date(1957, 10, 4, 19, 26, 24));
    expect(calendarFromJd(1_842_713.0)).toEqual(date(333, 1, 27, 12));
    expect(calendarFromJd(1_355_671.4)).toEqual(date(-1001, 8, 17, 21, 36));
  });

  it('round-trips 10,000 random dates across 3000 BC – 3000 AD to within 1 ms', () => {
    const rng = createRng('time-round-trip');
    for (let k = 0; k < 10_000; k++) {
      const year = int(rng, -2999, 3000);
      const month = int(rng, 1, 12);
      let day = int(rng, 1, daysInMonth(year, month));
      // Skip the dates the Gregorian reform removed.
      if (year === 1582 && month === 10 && day > 4 && day < 15) day = 15;
      const d: CalendarDate = {
        year,
        month,
        day,
        hour: int(rng, 0, 23),
        minute: int(rng, 0, 59),
        second: Math.floor(next(rng) * 60_000) / 1000,
      };
      const back = calendarFromJd(jdFromCalendar(d));
      expect({ ...back, second: 0 }).toEqual({ ...d, second: 0 });
      expect(Math.abs(back.second - d.second)).toBeLessThanOrEqual(0.001);
    }
  });

  it('carries a time that rounds up to midnight into the next day', () => {
    const jd = jdFromCalendar(date(2024, 12, 31)) + 1 - 1e-10;
    expect(calendarFromJd(jd)).toEqual(date(2025, 1, 1));
  });
});

describe('sim time and centuries', () => {
  it('centuriesSinceJ2000 is zero at J2000 and one a century later', () => {
    expect(centuriesSinceJ2000(J2000_JD)).toBe(0);
    expect(centuriesSinceJ2000(J2000_JD + DAYS_PER_JULIAN_CENTURY)).toBe(1);
    expect(SECONDS_PER_JULIAN_CENTURY).toBe(DAYS_PER_JULIAN_CENTURY * SECONDS_PER_DAY);
  });

  it('converts sim time to JD and back', () => {
    const epoch = jdFromCalendar(date(2031, 3, 14, 6));
    expect(jdFromSimTime(epoch, 0)).toBe(epoch);
    expect(jdFromSimTime(epoch, SECONDS_PER_DAY)).toBe(epoch + 1);
    const rng = createRng('time-sim');
    for (let k = 0; k < 1000; k++) {
      const t = (next(rng) - 0.5) * 2e9;
      // JD resolution near 2.46e6 is ~40 µs.
      expect(simTimeFromJd(epoch, jdFromSimTime(epoch, t))).toBeCloseTo(t, 3);
    }
  });
});
