/**
 * Parsing typed values in the inspector fields (decision S4-15 in planning/sprint-4.md). Each
 * returns null for text it can't read, so the field can show an error and keep its value.
 */

import { jdFromCalendar, simTimeFromJd } from '../math/time';

const NUMBER = String.raw`[+-−]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?`;
const num = (s: string) => Number(s.replace('−', '-'));

/** A speed in km/s from `12`, `12 m/s`, `-3.5 m/s` or `3.1 km/s`; no unit means m/s. */
export function parseSpeed(text: string): number | null {
  const m = new RegExp(`^\\s*(${NUMBER})\\s*(m/s|km/s)?\\s*$`, 'i').exec(text);
  if (!m) return null;
  const v = num(m[1]!);
  if (!Number.isFinite(v)) return null;
  return m[2]?.toLowerCase() === 'km/s' ? v : v / 1000;
}

const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  sec: 1,
  secs: 1,
  m: 60,
  min: 60,
  mins: 60,
  h: 3600,
  hr: 3600,
  hrs: 3600,
  d: 86_400,
  day: 86_400,
  days: 86_400,
};

/**
 * A duration in s from `1d 2h 30m`, `+90s`, `45 min`, `-10 s` or a bare number of seconds.
 * A leading sign applies to the whole duration.
 */
export function parseDuration(text: string): number | null {
  let s = text.trim().replace('−', '-');
  let sign = 1;
  if (s.startsWith('+') || s.startsWith('-')) {
    if (s[0] === '-') sign = -1;
    s = s.slice(1).trim();
  }
  if (s === '') return null;
  if (/^\d+(\.\d*)?$|^\.\d+$/.test(s)) return sign * Number(s);
  const part = /(\d+(?:\.\d*)?|\.\d+)\s*([a-z]+)\s*/giy;
  let total = 0;
  let matched = 0;
  for (let m = part.exec(s); m; m = part.exec(s)) {
    const k = UNIT_SECONDS[m[2]!.toLowerCase()];
    if (k === undefined) return null;
    total += Number(m[1]) * k;
    matched = part.lastIndex;
  }
  return matched === s.length ? sign * total : null;
}

/** Sim t from `YYYY-MM-DD hh:mm:ss` (or `YYYY-MM-DD hh:mm`, or a date alone), read as UTC. */
export function parseDate(text: string, epochJd: number): number | null {
  const m =
    /^\s*([+-−]?\d{1,6})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d*)?))?)?\s*$/.exec(
      text,
    );
  if (!m) return null;
  const [year, month, day] = [num(m[1]!), Number(m[2]), Number(m[3])];
  const [hour, minute, second] = [Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second >= 60) {
    return null;
  }
  return simTimeFromJd(epochJd, jdFromCalendar({ year, month, day, hour, minute, second }));
}
