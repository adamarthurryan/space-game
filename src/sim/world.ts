/**
 * The world: everything the sim owns, as plain data (decision S2-2 in planning/sprint-2.md),
 * with ships and their derived data (S3-9 to S3-11 in planning/sprint-3.md).
 */

import { peek, pop, type PQueue } from '../math/pqueue';
import type { BodyId, BodySystem } from './body';
import { clockTarget, createClock, type Clock } from './clock';
import {
  dispatch,
  emptyDerived,
  refreshShipDerived,
  type EventRegistry,
  type SimEvent,
} from './events';
import type { Ship, ShipId } from './ship';
import type { StateVector } from '../orbital/elements';
import {
  trajectoryStateAt,
  type Segment,
  type Trajectory,
  type TrajectoryPoint,
} from './trajectory';

export interface World {
  system: BodySystem;
  clock: Clock;
  /** Insertion order = seq order. */
  ships: Record<ShipId, Ship>;
  nextShipSeq: number;
  /** The next node's number: IDs are `node-<n>`, unique across ships (S4-1). */
  nextNodeSeq: number;
  /** Rebuildable from the rest; not saved (S3-11). */
  derived: Derived;
}

export interface Derived {
  trajectories: Record<ShipId, Trajectory>;
  events: PQueue<SimEvent>;
  /** The last few trajectories of each ship, by key, most recent last (S4-8). */
  trajectoryCache: Record<ShipId, { key: string; segments: Segment[] }[]>;
  cacheStats: { hits: number; misses: number };
}

/** At most this many events are handled per frame (S3-9). */
export const MAX_EVENTS_PER_FRAME = 256;

/** A world around `system` with a running ×1 clock at `t`, and no ships. */
export function createWorld(system: BodySystem, t = 0): World {
  return {
    system,
    clock: createClock(t),
    ships: {},
    nextShipSeq: 1,
    nextNodeSeq: 1,
    derived: emptyDerived(),
  };
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
 * A coasting ship's state at t from its trajectory (S5-10 in planning/sprint-5.md): the right
 * conic and parent after nodes and SOI changes. Null if the ship isn't coasting, or its
 * trajectory doesn't reach t (it ends at an impact or a cap before then).
 */
export function shipPointAt(
  world: World,
  shipId: ShipId,
  t: number,
  out?: StateVector,
): TrajectoryPoint | null {
  const ship = world.ships[shipId];
  const traj = world.derived.trajectories[shipId];
  if (!ship || ship.status !== 'coasting' || !traj) return null;
  return trajectoryStateAt(world.system, traj.segments, t, out);
}

/**
 * The body a ship is drawn around at t: its trajectory's parent then; past a predicted impact,
 * the body it hits; otherwise the body it hit, or its current parent (S5-10).
 */
export function shipBodyAt(world: World, shipId: ShipId, t: number): BodyId {
  const point = shipPointAt(world, shipId, t);
  if (point) return point.parentId;
  const ship = world.ships[shipId];
  const last = world.derived.trajectories[shipId]?.segments.at(-1);
  if (ship?.status === 'coasting' && last?.endEvent === 'impact' && t > last.tEnd) {
    return last.endTargetId ?? last.parentId;
  }
  return ship?.destroyedAt?.bodyId ?? ship?.orbit.parentId ?? world.system.rootId;
}

/** What a frame of `advanceWorld` did. */
export interface AdvanceResult {
  /** Events handled. */
  events: number;
  /** Whether a Pause-on event paused the clock (S4-7). */
  pause: boolean;
  /** Whether a warp-to reached its stop, pausing the clock (S5-3). */
  arrived: boolean;
}

/**
 * The clock stage (S3-9): aims for `clockTarget`, and on the way sets t to each due event's
 * time exactly and dispatches it. Handlers may queue events, which run in the same frame if
 * due. After MAX_EVENTS_PER_FRAME events, t stays at the last one. When a handler asks to pause
 * (S4-7), the clock is paused with t at that event's time, a warp-to is cancelled, and nothing
 * more runs this frame. A warp-to (S5-3) caps the target at its stop; reaching it, after the
 * events due there, pauses the clock and ends the warp-to.
 */
export function advanceWorld(world: World, dtWall: number, reg: EventRegistry): AdvanceResult {
  const { clock } = world;
  if (clock.paused) return { events: 0, pause: false, arrived: false };
  const target = clockTarget(clock, dtWall);
  const queue = world.derived.events;
  let events = 0;
  for (;;) {
    const next = peek(queue);
    if (!next || next.key > target) break;
    if (events >= MAX_EVENTS_PER_FRAME) return { events, pause: false, arrived: false };
    pop(queue);
    clock.t = Math.max(clock.t, next.key);
    events++;
    if (dispatch(reg, world, next.value).pause) {
      clock.paused = true;
      clock.warpTo = null;
      return { events, pause: true, arrived: false };
    }
  }
  clock.t = Math.max(clock.t, target);
  if (clock.warpTo && clock.t >= clock.warpTo.t) {
    clock.paused = true;
    clock.warpTo = null;
    return { events, pause: false, arrived: true };
  }
  return { events, pause: false, arrived: false };
}
