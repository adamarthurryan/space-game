/**
 * The sim clock (decisions S2-2 and S2-3 in planning/sprint-2.md).
 *
 * Plain data, mutated in place once per frame by `advanceClock`. Warp steps are powers of ten,
 * ×1 … ×10⁷. Wall time per frame is clamped to `MAX_FRAME_DT`, so a frame after a stall jumps at
 * most `MAX_FRAME_DT × warp`. Clamping at sim events is `advanceWorld`'s (sim/world.ts), which
 * aims for `clockTarget` and stops at each event on the way.
 */

export const WARP_STEPS = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7] as const;
/** Seconds of wall time per frame, at most (S2-3). */
export const MAX_FRAME_DT = 0.25;

/** Events the clock can pause at (decision S4-7 in planning/sprint-4.md). */
export type PausableEvent = 'node' | 'soi-change' | 'impact';
export const PAUSABLE_EVENTS: readonly PausableEvent[] = ['node', 'soi-change', 'impact'];

/** By default the clock pauses at node execution only (S4-7). */
export const DEFAULT_PAUSE_ON: Readonly<Record<PausableEvent, boolean>> = Object.freeze({
  node: true,
  'soi-change': false,
  impact: false,
});

/** Plain data. */
export interface Clock {
  /** Sim seconds from the epoch. */
  t: number;
  /** Index into WARP_STEPS. */
  warpIndex: number;
  paused: boolean;
  /** Which events pause the clock when they are handled (S4-7). */
  pauseOn: Record<PausableEvent, boolean>;
}

/** A running clock at ×1. */
export function createClock(t = 0): Clock {
  return { t, warpIndex: 0, paused: false, pauseOn: { ...DEFAULT_PAUSE_ON } };
}

/** The current warp step, whether paused or not. */
export function warpStep(c: Clock): number {
  return WARP_STEPS[c.warpIndex] ?? 1;
}

/** Sim seconds per wall second: 0 when paused. */
export function warpRate(c: Clock): number {
  return c.paused ? 0 : warpStep(c);
}

/** The time this frame aims for: t + min(dtWall, MAX_FRAME_DT) × warp (S2-3); t when paused. */
export function clockTarget(c: Clock, dtWall: number): number {
  return c.t + Math.min(Math.max(dtWall, 0), MAX_FRAME_DT) * warpRate(c);
}

/** `t += min(dtWall, MAX_FRAME_DT) × warp`, unless paused. Mutates c. Returns the sim time advanced. */
export function advanceClock(c: Clock, dtWall: number): number {
  const dt = Math.min(Math.max(dtWall, 0), MAX_FRAME_DT) * warpRate(c);
  c.t += dt;
  return dt;
}

/** Sets the warp step, clamped to the valid indices. */
export function setWarpIndex(c: Clock, i: number): void {
  c.warpIndex = Math.min(Math.max(Math.round(i), 0), WARP_STEPS.length - 1);
}

/** One step faster; stops at ×10⁷. */
export function warpUp(c: Clock): void {
  setWarpIndex(c, c.warpIndex + 1);
}

/** One step slower; stops at ×1 and does not pause. */
export function warpDown(c: Clock): void {
  setWarpIndex(c, c.warpIndex - 1);
}

/** Pausing keeps the warp step. */
export function setPaused(c: Clock, paused: boolean): void {
  c.paused = paused;
}
