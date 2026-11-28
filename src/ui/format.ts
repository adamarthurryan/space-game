/**
 * Display formatting for the panels. Unit switching is sprint 10; for now distances switch from
 * km to AU at 1e7 km (S2-18).
 */

import type { CalendarDate } from '../math/time';

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const MINUS = '−';

const pad = (n: number, width: number) => String(n).padStart(width, '0');

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

/** A warp rate as a power of ten: `×1`, `×10`, `×10⁶`. Other rates are shown in full. */
export function formatWarp(rate: number): string {
  const exp = Math.log10(rate);
  if (!Number.isInteger(exp) || exp < 0) return `×${rate}`;
  if (exp <= 1) return `×${rate}`;
  const sup = [...String(exp)].map((c) => SUPERSCRIPT[Number(c)]).join('');
  return `×10${sup}`;
}

const AU_KM = 149_597_870.7;
const DAY = 86_400;
const YEAR = 365.25 * DAY;
/** No digit grouping anywhere: a shown value must read back as typed input (decision 182). */
const THOUSANDS = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
  useGrouping: false,
});

/** `6771 km` below 1e7 km (one decimal under 100 km), `1.524 AU` above. */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return '∞';
  if (Math.abs(km) >= 1e7) return `${(km / AU_KM).toFixed(3)} AU`;
  if (Math.abs(km) < 100) return `${km.toFixed(1)} km`;
  return `${THOUSANDS.format(km)} km`;
}

/** `7.67 km/s`, or `340 m/s` below 1 km/s. */
export function formatSpeed(kmps: number): string {
  if (Math.abs(kmps) < 1) return `${THOUSANDS.format(kmps * 1000)} m/s`;
  return `${kmps.toFixed(2)} km/s`;
}

const DV = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  useGrouping: false,
});

/**
 * Plan Δv (S5b-18 in planning/sprint-5b.md): m/s with one decimal and no digit grouping
 * (decision 182), `3131.0 m/s`, `0.4 m/s`, `−12.0 m/s`. A ship's own Δv and orbital speeds use formatSpeed.
 */
export function formatDv(kmps: number): string {
  const text = DV.format(Math.abs(kmps * 1000));
  const negative = kmps < 0 && text !== '0.0';
  return `${negative ? MINUS : ''}${text} m/s`;
}

/** `42.0 s`, `12 min 5 s`, `23 h 56 min`, `27 d 7 h`, `1.881 yr`. */
export function formatDuration(s: number): string {
  const a = Math.abs(s);
  const sign = s < 0 ? MINUS : '';
  if (a < 60) return `${sign}${a.toFixed(1)} s`;
  if (a < 3600) return `${sign}${Math.floor(a / 60)} min ${Math.floor(a % 60)} s`;
  if (a < DAY) return `${sign}${Math.floor(a / 3600)} h ${Math.floor((a % 3600) / 60)} min`;
  if (a < YEAR) return `${sign}${Math.floor(a / DAY)} d ${Math.floor((a % DAY) / 3600)} h`;
  return `${sign}${(a / YEAR).toFixed(3)} yr`;
}

/** Radians as `23.44°`. */
export function formatAngle(rad: number): string {
  const deg = (rad * 180) / Math.PI;
  return `${deg < 0 ? MINUS : ''}${Math.abs(deg).toFixed(2)}°`;
}

/** Scientific notation with 4 significant figures and a superscript exponent. */
export function formatScientific(x: number, unit: string): string {
  if (x === 0) return `0 ${unit}`;
  const exp = Math.floor(Math.log10(Math.abs(x)));
  let mantissa = x / 10 ** exp;
  let e = exp;
  if (Math.abs(Number(mantissa.toFixed(3))) >= 10) {
    mantissa /= 10;
    e += 1;
  }
  const sup = [...String(Math.abs(e))].map((c) => SUPERSCRIPT[Number(c)]).join('');
  return `${mantissa.toFixed(3)} × 10${e < 0 ? '⁻' : ''}${sup} ${unit}`;
}

/** `5.972 × 10²⁴ kg`. */
export function formatMass(kg: number): string {
  return formatScientific(kg, 'kg');
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
