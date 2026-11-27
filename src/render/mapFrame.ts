/**
 * Shared per-frame state of the map (decision S2-16 in planning/sprint-2.md). Step 3 adds the
 * `MapFrame` scratch object and its context.
 */

/** Frame stage priorities. Negative, so R3F keeps rendering; lower runs first. Keep them ≤ 0. */
export const STAGE = { clock: -4, bodies: -3, camera: -2, layers: -1, projection: 0 } as const;
