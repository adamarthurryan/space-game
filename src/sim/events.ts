/**
 * Sim events (decisions S3-9 to S3-11 in planning/sprint-3.md).
 *
 * The queue is a `PQueue<SimEvent>` keyed by sim time, in `world.derived`. Each ship has at
 * most one pending event: the end of its current segment. Handlers are registered by event type
 * in an `EventRegistry` passed to `advanceWorld`, so `sim/` never imports higher layers and no
 * module-level state is shared.
 */

import { createPQueue, push, removeWhere } from '../math/pqueue';
import type { PausableEvent } from './clock';
import { burnPropellant, type NodeId } from './maneuver';
import { shipStats, type ShipId } from './ship';
import {
  assertNever,
  computeTrajectory,
  segmentStateAt,
  trajectoryKey,
  transitionState,
  type Segment,
  type SegmentEnd,
} from './trajectory';
import type { Derived, World } from './world';

export type SimEvent =
  | { type: 'soi-change'; shipId: ShipId; trajectoryVersion: number }
  | { type: 'impact'; shipId: ShipId; trajectoryVersion: number }
  | { type: 'trajectory-horizon'; shipId: ShipId; trajectoryVersion: number }
  | { type: 'node'; shipId: ShipId; nodeId: NodeId; trajectoryVersion: number };
export type SimEventType = SimEvent['type'];

export interface EventOutcome {
  pause?: boolean;
}
export type EventHandler<E extends SimEvent = SimEvent> = (
  world: World,
  event: E,
) => EventOutcome | void;

export interface EventRegistry {
  handlers: Partial<Record<SimEventType, EventHandler[]>>;
}

export function createEventRegistry(): EventRegistry {
  return { handlers: {} };
}

/** Registers a handler for one event type. Handlers run in registration order. */
export function on<T extends SimEventType>(
  reg: EventRegistry,
  type: T,
  h: EventHandler<Extract<SimEvent, { type: T }>>,
): void {
  const handlers: Partial<Record<SimEventType, EventHandler[]>> = reg.handlers;
  const list: EventHandler[] = handlers[type] ?? [];
  list.push(h as EventHandler);
  handlers[type] = list;
}

/** Calls every handler for the event's type; pauses if any asks to. */
export function dispatch(reg: EventRegistry, world: World, e: SimEvent): EventOutcome {
  let pause = false;
  for (const h of reg.handlers[e.type] ?? []) {
    if (h(world, e)?.pause) pause = true;
  }
  return pause ? { pause } : {};
}

/** The event that ends a segment. */
function eventTypeFor(end: SegmentEnd): SimEventType {
  switch (end) {
    case 'soi-exit':
    case 'soi-enter':
      return 'soi-change';
    case 'impact':
      return 'impact';
    case 'horizon':
      return 'trajectory-horizon';
    case 'maneuver':
      return 'node';
    default:
      return assertNever(end);
  }
}

/** An empty set of derived data. */
export function emptyDerived(): Derived {
  return {
    trajectories: {},
    events: createPQueue(),
    trajectoryCache: {},
    cacheStats: { hits: 0, misses: 0 },
  };
}

/** Trajectories kept per ship in the cache (S4-8). */
export const TRAJECTORY_CACHE_SIZE = 4;

/** Replaces the ship's pending event with the end of its current segment (none if destroyed). */
export function queueShipEvent(world: World, shipId: ShipId): void {
  const { events, trajectories } = world.derived;
  removeWhere(events, (e) => e.shipId === shipId);
  const ship = world.ships[shipId];
  const traj = trajectories[shipId];
  const seg = traj?.segments[0];
  if (!ship || ship.status !== 'coasting' || !traj || !seg) return;
  const type = eventTypeFor(seg.endEvent);
  const trajectoryVersion = traj.version;
  push(
    events,
    seg.tEnd,
    type === 'node'
      ? { type, shipId, nodeId: seg.endNodeId ?? '', trajectoryVersion }
      : { type, shipId, trajectoryVersion },
  );
}

/**
 * Brings one ship's trajectory up to date with its orbit, plan and Δv (S4-8): nothing changes if
 * the key is the same; otherwise the segments come from the ship's cache or are computed, the
 * version is bumped, and the ship's event is re-queued.
 */
export function refreshShipDerived(world: World, shipId: ShipId): void {
  const ship = world.ships[shipId];
  if (!ship) throw new Error(`Unknown ship: ${shipId}`);
  const d = world.derived;
  const old = d.trajectories[shipId];
  const coasting = ship.status === 'coasting';
  const dv = coasting ? shipStats(ship).dv : 0;
  const key = trajectoryKey(ship, dv);
  if (old && old.key === key) return;
  const cache = (d.trajectoryCache[shipId] ??= []);
  const i = cache.findIndex((c) => c.key === key);
  let segments: Segment[];
  if (i >= 0) {
    segments = cache[i]!.segments;
    cache.splice(i, 1);
    d.cacheStats.hits++;
  } else {
    segments = coasting
      ? computeTrajectory(world.system, ship.orbit, { plan: ship.plan, dvAvailable: dv })
      : [];
    d.cacheStats.misses++;
  }
  cache.push({ key, segments });
  if (cache.length > TRAJECTORY_CACHE_SIZE) cache.shift();
  d.trajectories[shipId] = { segments, version: (old?.version ?? 0) + 1, key };
  queueShipEvent(world, shipId);
}

/** Whether a handled event of this type pauses the clock (S4-7). */
const pauseFor = (world: World, type: PausableEvent): EventOutcome =>
  world.clock.pauseOn[type] ? { pause: true } : {};

/** The ship's trajectory if the event is current for it, else null (a stale event). */
function current(world: World, e: SimEvent) {
  const ship = world.ships[e.shipId];
  const traj = world.derived.trajectories[e.shipId];
  if (!ship || ship.status !== 'coasting' || !traj || traj.version !== e.trajectoryVersion) {
    return null;
  }
  const seg = traj.segments[0];
  return seg ? { ship, seg } : null;
}

/** The ship handlers of S3-10. */
export function registerShipHandlers(reg: EventRegistry): void {
  on(reg, 'soi-change', (world, e) => {
    const c = current(world, e);
    if (!c) return;
    const next = transitionState(world.system, c.seg);
    if (!next) return;
    c.ship.orbit = next;
    refreshShipDerived(world, e.shipId);
    return pauseFor(world, 'soi-change');
  });
  on(reg, 'impact', (world, e) => {
    const c = current(world, e);
    if (!c) return;
    c.ship.status = 'destroyed';
    c.ship.destroyedAt = { t: c.seg.tEnd, bodyId: c.seg.endTargetId ?? c.seg.parentId };
    c.ship.plan = [];
    refreshShipDerived(world, e.shipId);
    return pauseFor(world, 'impact');
  });
  // Node execution (S4-5): the burn the prediction made, from the same numbers.
  on(reg, 'node', (world, e) => {
    const c = current(world, e);
    if (!c || c.seg.endEvent !== 'maneuver' || c.seg.endNodeId !== e.nodeId) return;
    const next = transitionState(world.system, c.seg);
    if (!next) return;
    burnPropellant(c.ship, c.seg.dvApplied ?? 0);
    c.ship.plan = c.ship.plan.filter((n) => n.id !== e.nodeId);
    c.ship.orbit = next;
    refreshShipDerived(world, e.shipId);
    return pauseFor(world, 'node');
  });
  on(reg, 'trajectory-horizon', (world, e) => {
    const c = current(world, e);
    if (!c) return;
    const t = world.clock.t;
    const s = segmentStateAt(world.system, c.seg, t);
    c.ship.orbit = { parentId: c.seg.parentId, t, r: s.r, v: s.v };
    refreshShipDerived(world, e.shipId);
  });
}
