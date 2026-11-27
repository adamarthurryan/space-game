/**
 * Display formatting. Sprint 2 step 1 has the date and warp; distances, speeds and the rest
 * come with the body inspector.
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
