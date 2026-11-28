/** Helpers for the warp-to buttons (decisions S5-4 and S5-5 in planning/sprint-5.md). */

import { WARP_STEPS } from '../../sim/clock';
import type { NodeId } from '../../sim/maneuver';
import { upcomingEvents } from '../../sim/upcoming';
import type { World } from '../../sim/world';
import { resolveActiveShip, type MapObjectRef } from '../../store/useView';

/**
 * The node "warp to node" goes to (S5-4): the selected node, if it is the active ship's,
 * otherwise the active ship's next enabled, reached node.
 */
export function warpNodeTarget(
  world: World,
  activeShipId: string | null,
  selected: MapObjectRef | null,
): { shipId: string; nodeId: NodeId } | null {
  const shipId = resolveActiveShip(world, activeShipId);
  if (!shipId) return null;
  if (selected?.kind === 'node' && selected.shipId === shipId) {
    return { shipId, nodeId: selected.id };
  }
  const next = upcomingEvents(world, shipId).events.find((e) => e.kind === 'node' && e.enabled);
  return next?.nodeId ? { shipId, nodeId: next.nodeId } : null;
}

/** The warp step shown during a warp-to: the largest at or below the eased rate (S5-5). */
export function shownWarpStep(rate: number): number {
  let step: number = WARP_STEPS[0];
  for (const s of WARP_STEPS) if (s <= rate) step = s;
  return step;
}
