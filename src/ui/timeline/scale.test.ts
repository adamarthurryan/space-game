import { describe, expect, it } from 'vitest';
import { SECONDS_PER_DAY, SECONDS_PER_JULIAN_YEAR } from '../../math/units';
import { dtOf, STRIP_SPAN, STRIP_T0, stripScale, stripTicks, TICK_MIN_GAP_PX, xOf } from './scale';

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

  it('is logarithmic: 20 min and 200 days both fit, well apart', () => {
    const f = stripScale(600);
    expect(xOf(f, 1200)).toBeGreaterThan(40);
    expect(xOf(f, 200 * SECONDS_PER_DAY)).toBeLessThan(560);
    expect(xOf(f, 200 * SECONDS_PER_DAY) - xOf(f, 1200)).toBeGreaterThan(300);
  });

  it('inverts', () => {
    for (const dt of [0, 1, 59, 3600, 1e6, s.span]) {
      const back = dtOf(s, xOf(s, dt));
      expect(Math.abs(back - dt)).toBeLessThanOrEqual(1e-9 * Math.max(dt, 1));
    }
    expect(dtOf(s, -10)).toBe(0);
    expect(dtOf(s, 1e4)).toBe(s.span);
  });

  it('spans a fixed 10 years with T0 = 10 min, so the ticks never move (S5b-23)', () => {
    expect(STRIP_T0).toBe(600);
    expect(STRIP_SPAN).toBe(10 * SECONDS_PER_JULIAN_YEAR);
    const f = stripScale(1000);
    expect(f.span).toBe(STRIP_SPAN);
    const pct = (dt: number) => (100 * xOf(f, dt)) / f.width;
    expect(pct(3600)).toBeCloseTo(15, 0);
    expect(Math.abs(pct(SECONDS_PER_DAY) - 38)).toBeLessThan(0.5);
    expect(Math.abs(pct(SECONDS_PER_JULIAN_YEAR / 12) - 64)).toBeLessThan(0.5);
    expect(Math.abs(pct(SECONDS_PER_JULIAN_YEAR) - 83)).toBeLessThan(0.5);
    expect(Math.abs(pct(3600) - 15)).toBeLessThan(0.5);
    // The ticks depend on the width only: the same for any now.
    expect(stripTicks(stripScale(1000))).toEqual(stripTicks(f));
    const back = dtOf(f, xOf(f, 4 * SECONDS_PER_DAY));
    expect(Math.abs(back - 4 * SECONDS_PER_DAY)).toBeLessThan(1e-6);
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
