/**
 * The world: everything the sim owns, as plain data (decision S2-2 in planning/sprint-2.md),
 * with ships and their derived data (S3-9 to S3-11 in planning/sprint-3.md).
 */

import { peek, pop, type PQueue } from '../math/pqueue';
import type { BodySystem } from './body';
import { clockTarget, createClock, type Clock } from './clock';
import {
  dispatch,
  emptyDerived,
  refreshShipDerived,
  type EventRegistry,
  type SimEvent,
} from './events';
import type { Ship, ShipId } from './ship';
import type { Trajectory } from './trajectory';

export interface World {
  system: BodySystem;
  clock: Clock;
  /** Insertion order = seq order. */
  ships: Record<ShipId, Ship>;
  nextShipSeq: number;
  /** Rebuildable from the rest; not saved (S3-11). */
  derived: { trajectories: Record<ShipId, Trajectory>; events: PQueue<SimEvent> };
}

/** At most this many events are handled per frame (S3-9). */
export const MAX_EVENTS_PER_FRAME = 256;

/** A world around `system` with a running ×1 clock at `t`, and no ships. */
export function createWorld(system: BodySystem, t = 0): World {
  return { system, clock: createClock(t), ships: {}, nextShipSeq: 1, derived: emptyDerived() };
}

/** Adds a ship, computes its trajectory and queues its event. */
export function addShip(world: World, ship: Ship): void {
  if (world.ships[ship.id]) throw new Error(`Duplicate ship: ${ship.id}`);
  world.ships[ship.id] = ship;
  world.nextShipSeq = Math.max(world.nextShipSeq, ship.seq + 1);
  refreshShipDerived(world, ship.id);
}

/** Recomputes one ship's trajectory from its orbit, bumps its version, and re-queues its event. */
export function refreshShip(world: World, shipId: ShipId): void {
  refreshShipDerived(world, shipId);
}

/** Rebuilds the trajectories and the event queue from the ships (S3-11). */
export function rebuildDerived(world: World): void {
  world.derived = emptyDerived();
  for (const id of Object.keys(world.ships)) refreshShipDerived(world, id);
}

/**
 * The clock stage (S3-9): aims for `clockTarget`, and on the way sets t to each due event's
 * time exactly and dispatches it. Handlers may queue events, which run in the same frame if
 * due. After MAX_EVENTS_PER_FRAME events, t stays at the last one. Returns the number of events
 * handled and whether any handler asked to pause.
 */
export function advanceWorld(
  world: World,
  dtWall: number,
  reg: EventRegistry,
): { events: number; pause: boolean } {
  const { clock } = world;
  if (clock.paused) return { events: 0, pause: false };
  const target = clockTarget(clock, dtWall);
  const queue = world.derived.events;
  let events = 0;
  let pause = false;
  for (;;) {
    const next = peek(queue);
    if (!next || next.key > target) break;
    if (events >= MAX_EVENTS_PER_FRAME) return { events, pause };
    pop(queue);
    clock.t = Math.max(clock.t, next.key);
    events++;
    if (dispatch(reg, world, next.value).pause) pause = true;
  }
  clock.t = Math.max(clock.t, target);
  return { events, pause };
}
