/**
 * Player actions (decision S3-12 in planning/sprint-3.md). Every player action goes through
 * here: a function `(world, …args) → ActionResult` that checks the rules and changes the world.
 * The store calls them and bumps its version on success. `sim/` holds the mechanisms; actions
 * add the rules.
 */

import { registry } from '../content/registry';
import type { DesignId } from '../content/types';
import { norm } from '../math/vec3';
import { soiRadiusOf } from '../sim/body';
import {
  setPaused,
  setWarpIndex as setClockWarpIndex,
  warpDown as clockWarpDown,
  warpUp as clockWarpUp,
} from '../sim/clock';
import { createShip, type OrbitState, type ShipId } from '../sim/ship';
import { addShip, type World } from '../sim/world';

export type ActionResult<T = void> = { ok: true; value: T } | { ok: false; error: string };

const ok = (): ActionResult => ({ ok: true, value: undefined });

export function togglePause(world: World): ActionResult {
  setPaused(world.clock, !world.clock.paused);
  return ok();
}

export function warpUp(world: World): ActionResult {
  clockWarpUp(world.clock);
  return ok();
}

export function warpDown(world: World): ActionResult {
  clockWarpDown(world.clock);
  return ok();
}

export function setWarpIndex(world: World, i: number): ActionResult {
  if (!Number.isFinite(i)) return { ok: false, error: `Invalid warp step: ${i}` };
  setClockWarpIndex(world.clock, i);
  return ok();
}

export interface SpawnShipParams {
  designId: DesignId;
  /** Default: `<Design> <seq>`. */
  name?: string;
  orbit: OrbitState;
}

/**
 * Adds a ship with full tanks. Refuses an unknown design or body, a minor-body parent, a
 * non-finite state, or a start outside the parent's SOI, leaving the world unchanged.
 */
export function spawnShip(world: World, p: SpawnShipParams): ActionResult<ShipId> {
  const design = registry.design(p.designId);
  if (!design) return { ok: false, error: `Unknown design: ${p.designId}` };
  const body = world.system.bodies[p.orbit.parentId];
  if (!body) return { ok: false, error: `Unknown body: ${p.orbit.parentId}` };
  if (!body.major) {
    return { ok: false, error: `${body.name} is a minor body: ships can't orbit it (no SOI)` };
  }
  const { r, v, t } = p.orbit;
  if (![r.x, r.y, r.z, v.x, v.y, v.z, t].every(Number.isFinite)) {
    return { ok: false, error: 'The orbit is not a valid state' };
  }
  const soi = soiRadiusOf(body);
  if (norm(r) >= soi) {
    return { ok: false, error: `The start is outside ${body.name}'s sphere of influence` };
  }
  const seq = world.nextShipSeq;
  const id = `ship-${seq}`;
  const name = p.name?.trim() || `${design.name} ${seq}`;
  addShip(world, createShip(id, seq, name, design, p.orbit));
  return { ok: true, value: id };
}
