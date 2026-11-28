import { describe, expect, it } from 'vitest';
import {
  dtOf,
  SPAN_DEFAULT,
  SPAN_MAX,
  SPAN_MIN,
  stripSpan,
  stripTicks,
  TICK_MIN_GAP_PX,
  xOf,
} from './scale';

const s = { span: 200 * 86_400, width: 600 };

describe('strip scale (S5-6)', () => {
  it('maps now to the left edge and the span to the right, monotonically', () => {
    expect(xOf(s, 0)).toBe(0);
    expect(xOf(s, s.span)).toBeCloseTo(600, 9);
    let last = -1;
    for (const dt of [1, 60, 3600, 86_400, 30 * 86_400, s.span]) {
      expect(xOf(s, dt)).toBeGreaterThan(last);
      last = xOf(s, dt);
    }
    expect(xOf(s, -5)).toBe(0);
    expect(xOf(s, s.span * 2)).toBeCloseTo(600, 9);
  });

  it('is logarithmic: 20 min and 200 days both fit', () => {
    expect(xOf(s, 1200)).toBeGreaterThan(100);
    expect(xOf(s, 1200)).toBeLessThan(250);
  });

  it('inverts', () => {
    for (const dt of [0, 1, 59, 3600, 1e6, s.span]) {
      const back = dtOf(s, xOf(s, dt));
      expect(Math.abs(back - dt)).toBeLessThanOrEqual(1e-9 * Math.max(dt, 1));
    }
    expect(dtOf(s, -10)).toBe(0);
    expect(dtOf(s, 1e4)).toBe(s.span);
  });

  it('spans to the trajectory end, clamped, or a year with no ship', () => {
    expect(stripSpan(null, 0)).toBe(SPAN_DEFAULT);
    expect(stripSpan(100, 0)).toBe(SPAN_MIN);
    expect(stripSpan(1e12, 0)).toBe(SPAN_MAX);
    expect(stripSpan(1e6 + 50, 50)).toBe(1e6);
  });

  it('places ticks inside the span, ordered, apart', () => {
    const ticks = stripTicks(s);
    expect(ticks.length).toBeGreaterThan(3);
    let last = 0;
    for (const t of ticks) {
      expect(t.dt).toBeLessThanOrEqual(s.span);
      expect(t.x - last).toBeGreaterThanOrEqual(TICK_MIN_GAP_PX);
      last = t.x;
    }
    expect(ticks.map((t) => t.label)).not.toContain('1 yr');
  });
});
