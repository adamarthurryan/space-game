/** Hover texts for the timeline strip (decision S5-8 in planning/sprint-5.md). */

import { calendarFromJd, jdFromSimTime } from '../../math/time';
import type { BodySystem } from '../../sim/body';
import { eventLabel, type UpcomingEvent } from '../../sim/upcoming';
import { formatCountdown, formatDate, formatSpeed } from '../format';

/**
 * "Node · 2031-04-02 06:12:00 · in 3 h 12 min · Δv 3.13 km/s", "Moon SOI entry · … · in 3 d 4 h".
 */
export function eventTooltip(sys: BodySystem, e: UpcomingEvent, now: number): string {
  const date = formatDate(calendarFromJd(jdFromSimTime(sys.epochJd, e.t)));
  const parts = [eventLabel(sys, e), date, `in ${formatCountdown(e.t - now)}`];
  if (e.kind === 'node' && e.enabled && e.dvApplied !== undefined) {
    parts.push(`Δv ${formatSpeed(e.dvApplied)}`);
  }
  return parts.join(' · ');
}
