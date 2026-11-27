/**
 * The world: everything the sim owns, as plain data (decision S2-2 in planning/sprint-2.md).
 * Sprint 3 adds ships, fleets and plans without moving it.
 */

import type { BodySystem } from './body';
import { createClock, type Clock } from './clock';

export interface World {
  system: BodySystem;
  clock: Clock;
  // sprint 3: ships, fleets, plans, …
}

/** A world around `system` with a running ×1 clock at `t`. */
export function createWorld(system: BodySystem, t = 0): World {
  return { system, clock: createClock(t) };
}
