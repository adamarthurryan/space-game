/**
 * Julian dates, calendar dates and sim time (decisions S1-2 and S1-14).
 *
 * Sim time `t` is TDB seconds from the scenario epoch, which is stored as a TDB Julian date.
 * There is no UTC and there are no leap seconds.
 *
 * Calendar conversions use Meeus's algorithm (*Astronomical Algorithms*, ch. 7): the Gregorian
 * calendar from 1582-10-15, the Julian calendar before it, and astronomical year numbering
 * (year 0 = 1 BC, −1 = 2 BC). `Date` is not used (the determinism lint forbids it anyway).
 *
 * A JD near 2.46 × 10⁶ has a float64 resolution of about 40 µs, which is fine for epochs and
 * display. Sim time never round-trips through JD in the sim.
 */

import { SECONDS_PER_DAY } from './units';

/** 2000-01-01 12:00 TDB. */
export const J2000_JD = 2_451_545.0;
export const DAYS_PER_JULIAN_CENTURY = 36_525;
export const SECONDS_PER_JULIAN_CENTURY = 3_155_760_000;

export interface CalendarDate {
  /** Astronomical: 0 = 1 BC, −1 = 2 BC. */
  year: number;
  /** 1–12. */
  month: number;
  /** 1–31. */
  day: number;
  hour: number;
  minute: number;
  /** May be fractional. */
  second: number;
}

const MS_PER_DAY = SECONDS_PER_DAY * 1000;
/** The JD (at midnight) of the first Gregorian day, 1582-10-15. */
const GREGORIAN_START_DAY = 2_299_161;

function isGregorian(year: number, month: number, day: number): boolean {
  if (year !== 1582) return year > 1582;
  if (month !== 10) return month > 10;
  return day >= 15;
}

/**
 * The Julian date of a calendar date. Dates before 1582-10-15 are read in the Julian calendar,
 * later ones in the Gregorian (so the skipped dates 1582-10-05 to 10-14 are read as Julian).
 */
export function jdFromCalendar(d: CalendarDate): number {
  let y = d.year;
  let m = d.month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  let b = 0;
  if (isGregorian(d.year, d.month, d.day)) {
    const a = Math.floor(y / 100);
    b = 2 - a + Math.floor(a / 4);
  }
  // Midnight of the day, an exact half-integer, then the time of day.
  const midnight =
    Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d.day + b - 1524.5;
  const seconds = d.hour * 3600 + d.minute * 60 + d.second;
  return midnight + seconds / SECONDS_PER_DAY;
}

/**
 * The calendar date of a Julian date (valid for JD ≥ 0). The time of day is rounded to the
 * nearest millisecond, well above the JD's own resolution, so float noise doesn't turn 12:00:00
 * into 11:59:59.99999.
 */
export function calendarFromJd(jd: number): CalendarDate {
  let z = Math.floor(jd + 0.5);
  let ms = Math.round((jd + 0.5 - z) * MS_PER_DAY);
  if (ms >= MS_PER_DAY) {
    z += 1;
    ms -= MS_PER_DAY;
  }

  let a = z;
  if (z >= GREGORIAN_START_DAY) {
    const alpha = Math.floor((z - 1_867_216.25) / 36_524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const dd = Math.floor(365.25 * c);
  const e = Math.floor((b - dd) / 30.6001);

  const day = b - dd - Math.floor(30.6001 * e);
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;

  const hour = Math.floor(ms / 3_600_000);
  const minute = Math.floor((ms % 3_600_000) / 60_000);
  const second = (ms % 60_000) / 1000;
  return { year, month, day, hour, minute, second };
}

/** The Julian date at sim time `t` (s) for a scenario starting at `epochJd`. */
export function jdFromSimTime(epochJd: number, t: number): number {
  return epochJd + t / SECONDS_PER_DAY;
}

/** The sim time (s) at a Julian date, for a scenario starting at `epochJd`. */
export function simTimeFromJd(epochJd: number, jd: number): number {
  return (jd - epochJd) * SECONDS_PER_DAY;
}

/** Julian centuries since J2000: the `T` of the JPL tables. */
export function centuriesSinceJ2000(jd: number): number {
  return (jd - J2000_JD) / DAYS_PER_JULIAN_CENTURY;
}

// ---- Text (moved from ui/format.ts so the sim can build notification texts, S6-17) -------

const MINUS = '−';
const pad = (n: number, width: number) => String(n).padStart(width, '0');
const DAY = 86_400;
const YEAR = 365.25 * DAY;

/**
 * `YYYY-MM-DD hh:mm:ss`, shown as if UTC (S1-2, S2-19). Astronomical year numbering with a sign
 * for years ≤ 0 (`−0999-01-01`); seconds are truncated.
 */
export function formatDate(d: CalendarDate): string {
  const year = d.year > 0 ? pad(d.year, 4) : `${MINUS}${pad(-d.year, 4)}`;
  const date = `${year}-${pad(d.month, 2)}-${pad(d.day, 2)}`;
  const time = `${pad(d.hour, 2)}:${pad(d.minute, 2)}:${pad(Math.floor(d.second), 2)}`;
  return `${date} ${time}`;
}

/**
 * A time until an event, to the two leading units: `42 s`, `41 min`, `5 h 12 min`, `2 d 22 h`,
 * `1.881 yr`.
 */
export function formatCountdown(s: number): string {
  const a = Math.max(s, 0);
  if (a < 60) return `${Math.floor(a)} s`;
  if (a < 3600) return `${Math.floor(a / 60)} min`;
  if (a < DAY) return `${Math.floor(a / 3600)} h ${Math.floor((a % 3600) / 60)} min`;
  if (a < YEAR) return `${Math.floor(a / DAY)} d ${Math.floor((a % DAY) / 3600)} h`;
  return `${(a / YEAR).toFixed(3)} yr`;
}
