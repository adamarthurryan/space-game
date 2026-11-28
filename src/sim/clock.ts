/**
 * The sim clock (decisions S2-2 and S2-3 in planning/sprint-2.md).
 *
 * Plain data, mutated in place once per frame by `advanceClock`. Warp steps are powers of ten,
 * ×1 … ×10⁷. Wall time per frame is clamped to `MAX_FRAME_DT`, so a frame after a stall jumps at
 * most `MAX_FRAME_DT × warp`. Clamping at sim events is `advanceWorld`'s (sim/world.ts), which
 * aims for `clockTarget` and stops at each event on the way. A warp-to (S5-3 in
 * planning/sprint-5.md) overrides the rate, easing into its stop.
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

/** What a warp-to is heading for (S5-3). */
export type WarpToKind = 'node' | 'event';

/** A warp-to in progress (decision S5-3 in planning/sprint-5.md). */
export interface WarpTo {
  /** Where the clock stops, paused. */
  t: number;
  kind: WarpToKind;
  shipId: string | null;
  /** What it is heading for, for the timeline readout: "Moon SOI entry", "Node". */
  label: string;
}

/** Wall seconds over which a warp-to eases into its stop (S5-3). */
export const WARP_TO_EASE = 0.1;
/** The slowest a warp-to gets while easing in (S5-3). */
export const WARP_TO_MIN_RATE = 100;
/** Warp to node stops this long before the node, s (S5-4). */
export const WARP_TO_NODE_LEAD = 60;

/** Plain data. */
export interface Clock {
  /** Sim seconds from the epoch. */
  t: number;
  /** Index into WARP_STEPS. */
  warpIndex: number;
  paused: boolean;
  /** Which events pause the clock when they are handled (S4-7). */
  pauseOn: Record<PausableEvent, boolean>;
  /** A warp-to in progress, or null (S5-3). */
  warpTo: WarpTo | null;
}

/** A running clock at ×1. */
export function createClock(t = 0): Clock {
  return { t, warpIndex: 0, paused: false, pauseOn: { ...DEFAULT_PAUSE_ON }, warpTo: null };
}

/** The current warp step, whether paused or not. */
export function warpStep(c: Clock): number {
  return WARP_STEPS[c.warpIndex] ?? 1;
}

/** The fastest warp step. */
export const MAX_WARP: number = WARP_STEPS[WARP_STEPS.length - 1]!;

/** The eased warp-to rate for the sim time left (S5-3): remaining / WARP_TO_EASE, clamped. */
export function warpToRate(remaining: number): number {
  return Math.min(Math.max(remaining / WARP_TO_EASE, WARP_TO_MIN_RATE), MAX_WARP);
}

/** Sim seconds per wall second: 0 when paused, the eased rate during a warp-to, else the step. */
export function warpRate(c: Clock): number {
  if (c.paused) return 0;
  return c.warpTo ? warpToRate(c.warpTo.t - c.t) : warpStep(c);
}

/**
 * The time this frame aims for: t + min(dtWall, MAX_FRAME_DT) × rate (S2-3), never past a
 * warp-to's stop (S5-3); t when paused.
 */
export function clockTarget(c: Clock, dtWall: number): number {
  const target = c.t + Math.min(Math.max(dtWall, 0), MAX_FRAME_DT) * warpRate(c);
  return c.warpTo && !c.paused ? Math.min(target, Math.max(c.warpTo.t, c.t)) : target;
}

/** `t += min(dtWall, MAX_FRAME_DT) × warp`, unless paused. Mutates c. Returns the sim time advanced. */
export function advanceClock(c: Clock, dtWall: number): number {
  const target = clockTarget(c, dtWall);
  const dt = target - c.t;
  c.t = target;
  return dt;
}

/** Starts a warp-to (S5-3): unpauses; the warp step is kept for afterwards. */
export function startWarpTo(c: Clock, w: WarpTo): void {
  c.warpTo = { ...w };
  c.paused = false;
}

/** Ends a warp-to, if any, leaving the clock running at its warp step. */
export function cancelWarpTo(c: Clock): void {
  c.warpTo = null;
}

/** Sets the warp step, clamped to the valid indices. Cancels a warp-to (S5-3). */
export function setWarpIndex(c: Clock, i: number): void {
  c.warpTo = null;
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

/** Pausing keeps the warp step. Pausing or playing cancels a warp-to (S5-3). */
export function setPaused(c: Clock, paused: boolean): void {
  c.warpTo = null;
  c.paused = paused;
}
