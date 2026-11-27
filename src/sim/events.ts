/**
 * Sim events (decisions S3-9 to S3-11 in planning/sprint-3.md).
 *
 * The queue is a `PQueue<SimEvent>` keyed by sim time, in `world.derived`. Each ship has at
 * most one pending event: the end of its current segment. Handlers are registered by event type
 * in an `EventRegistry` passed to `advanceWorld`, so `sim/` never imports higher layers and no
 * module-level state is shared.
 */

import { createPQueue, push, removeWhere } from '../math/pqueue';
import type { NodeId } from './maneuver';
import { shipStats, type ShipId } from './ship';
import {
  assertNever,
  computeTrajectory,
  segmentStateAt,
  transitionState,
  type SegmentEnd,
} from './trajectory';
import type { World } from './world';

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
export function emptyDerived(): World['derived'] {
  return { trajectories: {}, events: createPQueue() };
}

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

/** Recomputes one ship's trajectory from its orbit, bumps its version, and re-queues its event. */
export function refreshShipDerived(world: World, shipId: ShipId): void {
  const ship = world.ships[shipId];
  if (!ship) throw new Error(`Unknown ship: ${shipId}`);
  const old = world.derived.trajectories[shipId];
  world.derived.trajectories[shipId] = {
    segments:
      ship.status === 'coasting'
        ? computeTrajectory(world.system, ship.orbit, {
            plan: ship.plan,
            dvAvailable: shipStats(ship).dv,
          })
        : [],
    version: (old?.version ?? 0) + 1,
  };
  queueShipEvent(world, shipId);
}

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
  });
  on(reg, 'impact', (world, e) => {
    const c = current(world, e);
    if (!c) return;
    c.ship.status = 'destroyed';
    c.ship.destroyedAt = { t: c.seg.tEnd, bodyId: c.seg.endTargetId ?? c.seg.parentId };
    refreshShipDerived(world, e.shipId);
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
