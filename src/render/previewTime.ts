/**
 * Preview time (decision S5-9 in planning/sprint-5.md): view state only. The map is drawn at
 * `viewTime`; the sim only ever advances `world.clock.t`.
 */

import type { Preview } from '../store/useView';

/** The time the map is drawn at: the preview's, or now. */
export function viewTime(clockT: number, preview: Preview | null): number {
  return preview ? preview.t : clockT;
}

/** Whether now has caught up with the preview, which then ends (S5-9). */
export function previewCaughtUp(clockT: number, preview: Preview | null): boolean {
  return preview !== null && clockT >= preview.t;
}
