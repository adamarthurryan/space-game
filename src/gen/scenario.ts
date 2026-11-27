/**
 * Scenario setup. For now only the milestone 1 sandbox: the real solar system at a fixed epoch
 * (decision S2-1 in planning/sprint-2.md), so screenshots and smoke checks are reproducible.
 */

import { registry } from '../content/registry';
import { createShip } from '../sim/ship';
import { addShip, createWorld, type World } from '../sim/world';
import { generateRealSystem } from './realSystem';
import { sandboxShips } from './sandboxShips';

/** 2030-01-01 00:00 TDB (S2-1). */
export const SANDBOX_EPOCH_JD = 2_462_502.5;

/**
 * The real solar system at SANDBOX_EPOCH_JD, with the clock at 0 and the three sandbox ships
 * (S3-13). Deterministic.
 */
export function createSandboxWorld(): World {
  const world = createWorld(generateRealSystem(SANDBOX_EPOCH_JD), 0);
  for (const s of sandboxShips(world.system)) {
    const design = registry.design(s.designId);
    if (!design) throw new Error(`Unknown design: ${s.designId}`);
    const seq = world.nextShipSeq;
    addShip(world, createShip(`ship-${seq}`, seq, s.name, design, s.orbit));
  }
  return world;
}
