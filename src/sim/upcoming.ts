/**
 * A ship's upcoming events, from its trajectory (decision S5-2 in planning/sprint-5.md), and
 * where a warp-to for one of them stops (S5-4, S5-5).
 */

import type { BodyId, BodySystem } from './body';
import { WARP_TO_NODE_LEAD } from './clock';
import type { NodeId } from './maneuver';
import type { ShipId } from './ship';
import { assertNever, type SegmentEnd } from './trajectory';
import type { World } from './world';

export type UpcomingKind = 'node' | 'soi-enter' | 'soi-exit' | 'impact';

export interface UpcomingEvent {
  shipId: ShipId;
  kind: UpcomingKind;
  t: number;
  /** The segment that ends here; for a disabled node, the segment that contains it. */
  segmentIndex: number;
  /** For nodes. */
  nodeId?: NodeId;
  /** False only for a disabled node, which never executes. */
  enabled: boolean;
  /** The parent of the segment that ends here (or contains a disabled node): an exit leaves it. */
  parentId: BodyId;
  /** The body entered, exited to, or impacted. */
  bodyId?: BodyId;
  /** km/s, for enabled nodes. */
  dvApplied?: number;
}

export interface ShipUpcoming {
  /** After the clock's t, in time order. */
  events: UpcomingEvent[];
  /** The trajectory's end time; null if the ship has none (destroyed). */
  horizon: number | null;
}

/** The kind of event a segment end is, or null if it isn't one (the horizon). */
function kindOf(end: SegmentEnd): UpcomingKind | null {
  switch (end) {
    case 'maneuver':
      return 'node';
    case 'soi-enter':
    case 'soi-exit':
    case 'impact':
      return end;
    case 'horizon':
      return null;
    default:
      return assertNever(end);
  }
}

/** The ship's future events (S5-2): segment ends, plus disabled nodes inside the trajectory. */
export function upcomingEvents(world: World, shipId: ShipId): ShipUpcoming {
  const ship = world.ships[shipId];
  const traj = world.derived.trajectories[shipId];
  if (!ship || ship.status !== 'coasting' || !traj || traj.segments.length === 0) {
    return { events: [], horizon: null };
  }
  const now = world.clock.t;
  const segs = traj.segments;
  const events: UpcomingEvent[] = [];
  segs.forEach((seg, i) => {
    const kind = kindOf(seg.endEvent);
    if (kind === null || seg.tEnd <= now) return;
    const e: UpcomingEvent = {
      shipId,
      kind,
      t: seg.tEnd,
      segmentIndex: i,
      parentId: seg.parentId,
      enabled: true,
    };
    if (seg.endNodeId !== undefined) e.nodeId = seg.endNodeId;
    if (seg.endTargetId !== undefined) e.bodyId = seg.endTargetId;
    if (seg.dvApplied !== undefined) e.dvApplied = seg.dvApplied;
    events.push(e);
  });
  for (const node of ship.plan) {
    if (node.enabled || node.t <= now) continue;
    const i = segs.findIndex((s) => s.tStart <= node.t && node.t <= s.tEnd);
    if (i < 0) continue;
    events.push({
      shipId,
      kind: 'node',
      t: node.t,
      segmentIndex: i,
      parentId: segs[i]!.parentId,
      nodeId: node.id,
      enabled: false,
    });
  }
  // Stable: at equal times, segment ends keep their order and come before disabled nodes.
  events.sort((a, b) => a.t - b.t);
  return { events, horizon: segs[segs.length - 1]!.tEnd };
}

/** Where a warp-to for the event stops: before a node by its lead, else at the event (S5-4, S5-5). */
export function warpStopTime(e: UpcomingEvent): number {
  return e.kind === 'node' ? e.t - WARP_TO_NODE_LEAD : e.t;
}

/** A warp-to must move the clock at least this far, s (S5-5). */
export const MIN_WARP_TO = 1;

/**
 * The next event worth warping to (S5-5): enabled, with its stop at least MIN_WARP_TO after now.
 * For one ship, several (S6-25), or every coasting ship if null (the earliest stop wins).
 */
export function nextWarpStop(
  world: World,
  ships: ShipId | readonly ShipId[] | null,
): UpcomingEvent | null {
  const ids =
    ships === null ? Object.keys(world.ships) : typeof ships === 'string' ? [ships] : ships;
  const now = world.clock.t;
  let best: UpcomingEvent | null = null;
  for (const id of ids) {
    for (const e of upcomingEvents(world, id).events) {
      if (!e.enabled || warpStopTime(e) < now + MIN_WARP_TO) continue;
      // A node's stop is before its time, so an earlier event can stop later: compare them all.
      if (!best || warpStopTime(e) < warpStopTime(best)) best = e;
    }
  }
  return best;
}

/** A short name for the event: "Node", "Moon SOI entry", "Earth SOI exit", "Moon impact". */
export function eventLabel(sys: BodySystem, e: UpcomingEvent): string {
  const name = (id: BodyId | undefined) => (id && sys.bodies[id]?.name) || '?';
  switch (e.kind) {
    case 'node':
      return e.enabled ? 'Node' : 'Node (disabled)';
    case 'soi-enter':
      return `${name(e.bodyId)} SOI entry`;
    case 'soi-exit':
      return `${name(e.parentId)} SOI exit`;
    case 'impact':
      return `${name(e.bodyId)} impact`;
    default:
      return assertNever(e.kind);
  }
}
