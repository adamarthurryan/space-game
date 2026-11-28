/**
 * The timeline strip's time axis (decision S5-6 in planning/sprint-5.md): logarithmic from now at
 * the left edge to the span's end at the right, so a node in 20 min and an arrival in 200 days
 * both fit. x(Δt) = width · log(1 + Δt/T0) / log(1 + span/T0).
 *
 * The span is fixed at 10 years, with T0 = 10 min (S5b-23 in planning/sprint-5b.md), so the
 * ticks never move: 1 h sits at 15%, 1 d at 38%, 1 mo at 64% and 1 yr at 83%.
 */

import { SECONDS_PER_DAY, SECONDS_PER_JULIAN_YEAR } from '../../math/units';

/** The axis's knee, s: below it the axis is nearly linear (S5b-23). */
export const STRIP_T0 = 600;
/** The strip's span from now, s: fixed (S5b-23). */
export const STRIP_SPAN = 10 * SECONDS_PER_JULIAN_YEAR;
/** Ticks closer than this to the previous one (or to now) are dropped, px. */
export const TICK_MIN_GAP_PX = 40;

export interface StripScale {
  /** s from now to the right edge: STRIP_SPAN in the app. */
  span: number;
  /** px. */
  width: number;
}

/** The strip's scale at a width: the fixed span (S5b-23). */
export const stripScale = (width: number): StripScale => ({ span: STRIP_SPAN, width });

/** px from the left edge for a time dt after now, clamped to the strip. */
export function xOf(s: StripScale, dt: number): number {
  const d = Math.min(Math.max(dt, 0), s.span);
  return (s.width * Math.log1p(d / STRIP_T0)) / Math.log1p(s.span / STRIP_T0);
}

/** The inverse of xOf: the time after now at x px, clamped to [0, span]. */
export function dtOf(s: StripScale, x: number): number {
  const f = Math.min(Math.max(x / s.width, 0), 1);
  if (f === 1) return s.span;
  return Math.min(STRIP_T0 * Math.expm1(f * Math.log1p(s.span / STRIP_T0)), s.span);
}

export interface Tick {
  dt: number;
  x: number;
  label: string;
}

const TICKS: readonly [number, string][] = [
  [60, '1 min'],
  [600, '10 min'],
  [3600, '1 h'],
  [6 * 3600, '6 h'],
  [SECONDS_PER_DAY, '1 d'],
  [10 * SECONDS_PER_DAY, '10 d'],
  [SECONDS_PER_JULIAN_YEAR / 12, '1 mo'],
  [SECONDS_PER_JULIAN_YEAR, '1 yr'],
  [10 * SECONDS_PER_JULIAN_YEAR, '10 yr'],
];

/** The ticks inside the span, each at least TICK_MIN_GAP_PX from the one before (and from now). */
export function stripTicks(s: StripScale): Tick[] {
  const out: Tick[] = [];
  let lastX = 0;
  for (const [dt, label] of TICKS) {
    if (dt > s.span) break;
    const x = xOf(s, dt);
    if (x - lastX < TICK_MIN_GAP_PX) continue;
    out.push({ dt, x, label });
    lastX = x;
  }
  return out;
}
