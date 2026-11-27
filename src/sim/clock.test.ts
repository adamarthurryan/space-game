import { describe, expect, it } from 'vitest';
import { SECONDS_PER_DAY } from '../math/units';
import {
  advanceClock,
  createClock,
  MAX_FRAME_DT,
  setPaused,
  setWarpIndex,
  WARP_STEPS,
  warpDown,
  warpRate,
  warpUp,
} from './clock';

describe('clock', () => {
  it('starts running at ×1', () => {
    const c = createClock();
    expect(c).toEqual({ t: 0, warpIndex: 0, paused: false });
    expect(warpRate(c)).toBe(1);
    expect(createClock(42).t).toBe(42);
  });

  it('advances by dtWall × warp and returns the sim time advanced', () => {
    const c = createClock(10);
    setWarpIndex(c, 3);
    expect(advanceClock(c, 0.1)).toBeCloseTo(100, 9);
    expect(c.t).toBeCloseTo(110, 9);
  });

  it('adds nothing while paused', () => {
    const c = createClock(5);
    setPaused(c, true);
    expect(warpRate(c)).toBe(0);
    expect(advanceClock(c, 0.1)).toBe(0);
    expect(c.t).toBe(5);
  });

  it('clamps dtWall to MAX_FRAME_DT, and ignores negative dt', () => {
    const c = createClock();
    setWarpIndex(c, 2);
    expect(advanceClock(c, 10)).toBe(MAX_FRAME_DT * 100);
    expect(advanceClock(c, -1)).toBe(0);
  });

  it('warps up and down between ×1 and ×10⁷', () => {
    const c = createClock();
    warpDown(c);
    expect(c.warpIndex).toBe(0);
    expect(c.paused).toBe(false);
    for (let i = 0; i < 20; i++) warpUp(c);
    expect(WARP_STEPS[c.warpIndex]).toBe(1e7);
    warpDown(c);
    expect(WARP_STEPS[c.warpIndex]).toBe(1e6);
    setWarpIndex(c, -3);
    expect(c.warpIndex).toBe(0);
    setWarpIndex(c, 99);
    expect(c.warpIndex).toBe(WARP_STEPS.length - 1);
  });

  it('keeps the warp step when paused', () => {
    const c = createClock();
    setWarpIndex(c, 4);
    setPaused(c, true);
    setPaused(c, false);
    expect(c.warpIndex).toBe(4);
    expect(warpRate(c)).toBe(1e4);
  });

  it('advances a Julian year in 3.156 s of 1/60 s frames at ×10⁷', () => {
    const c = createClock();
    setWarpIndex(c, 7);
    const year = 365.25 * SECONDS_PER_DAY;
    // 3.15576 s of wall time in frames of about 1/60 s.
    const frames = Math.round((year / 1e7) * 60);
    const dt = year / 1e7 / frames;
    for (let i = 0; i < frames; i++) advanceClock(c, dt);
    expect(Math.abs(c.t - year) / year).toBeLessThan(1e-9);
  });

  it('survives a JSON round trip', () => {
    const c = createClock(123.456);
    setWarpIndex(c, 5);
    setPaused(c, true);
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });
});
