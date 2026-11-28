import { describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../../gen/scenario';
import type { UpcomingEvent } from '../../sim/upcoming';
import { eventTooltip } from './eventText';

const { system } = createSandboxWorld();
const ev = (kind: UpcomingEvent['kind'], extra: Partial<UpcomingEvent> = {}): UpcomingEvent => ({
  shipId: 'ship-1',
  kind,
  t: 86_400 + 3600 * 4,
  segmentIndex: 0,
  parentId: 'earth',
  enabled: true,
  ...extra,
});

describe('eventTooltip (S5-8)', () => {
  it('names the event, with date, countdown and Δv for nodes', () => {
    expect(eventTooltip(system, ev('node', { dvApplied: 3.131 }), 0)).toBe(
      'Node · 2030-01-02 04:00:00 · in 1 d 4 h · Δv 3.13 km/s',
    );
    expect(eventTooltip(system, ev('node', { enabled: false }), 0)).toBe(
      'Node (disabled) · 2030-01-02 04:00:00 · in 1 d 4 h',
    );
    expect(eventTooltip(system, ev('soi-enter', { bodyId: 'moon' }), 0)).toMatch(
      /^Moon SOI entry · /,
    );
    expect(eventTooltip(system, ev('soi-exit', { bodyId: 'sun' }), 0)).toMatch(
      /^Earth SOI exit · /,
    );
    expect(eventTooltip(system, ev('impact', { bodyId: 'moon' }), 0)).toMatch(/^Moon impact · /);
  });
});
