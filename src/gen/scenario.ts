/**
 * Scenario setup. For now only the milestone 1 sandbox: the real solar system at a fixed epoch
 * (decision S2-1 in planning/sprint-2.md), so screenshots and smoke checks are reproducible.
 */

import { createWorld, type World } from '../sim/world';
import { generateRealSystem } from './realSystem';

/** 2030-01-01 00:00 TDB (S2-1). */
export const SANDBOX_EPOCH_JD = 2_462_502.5;

/** The real solar system at SANDBOX_EPOCH_JD, with the clock at 0. Deterministic. */
export function createSandboxWorld(): World {
  return createWorld(generateRealSystem(SANDBOX_EPOCH_JD), 0);
}
