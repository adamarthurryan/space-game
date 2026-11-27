/** Scroll nudges of the inspector fields (decision S4-15 in planning/sprint-4.md). */

export interface Nudge {
  /** The step of one wheel notch, in the value's unit (S4-15). */
  step: number;
  /** With Shift held; default step × 0.1. */
  fine?: number;
  /** With Alt held; default step × 10. */
  coarse?: number;
}

/** The wheel step with its modifiers (S4-15): Shift is fine, Alt coarse. */
export function nudgeStep(n: Nudge, e: { shiftKey: boolean; altKey: boolean }): number {
  if (e.shiftKey) return n.fine ?? n.step * 0.1;
  if (e.altKey) return n.coarse ?? n.step * 10;
  return n.step;
}
