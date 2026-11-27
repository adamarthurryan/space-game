/**
 * Node markers (decisions S4-9 and S4-10 in planning/sprint-4.md): where each reached node sits
 * on its ship's trajectory, relative to the frame body at the node's time. An enabled node sits
 * at the end of the segment it ends; a disabled one on the segment that contains its time.
 * Unreached nodes have no marker. Pure.
 */

import { vec3, type Vec3 } from '../math/vec3';
import { bodyStateIn, type BodyId, type BodySystem } from '../sim/body';
import type { NodeId } from '../sim/maneuver';
import type { StateVector } from '../orbital/elements';
import type { Ship, ShipId } from '../sim/ship';
import { segmentStateAt, type Trajectory } from '../sim/trajectory';

export interface NodeMarker {
  shipId: ShipId;
  nodeId: NodeId;
  t: number;
  /** Relative to the frame body, at the node's time. */
  pos: Vec3;
  state: 'enabled' | 'disabled';
  /** The active ship's nodes are editable; others are plain markers (S4-9). */
  editable: boolean;
}

/** Where a node sits: its pre-burn state relative to the segment's parent, and the frame offset. */
export interface NodeAnchor {
  t: number;
  parentId: BodyId;
  /** Pre-burn state relative to parentId. */
  pre: StateVector;
  /** Relative to the frame body, at t. */
  pos: Vec3;
}

/** The anchor of one node on the ship's trajectory, or null if it isn't reached (S4-14). */
export function nodeAnchor(
  sys: BodySystem,
  ship: Ship,
  traj: Trajectory,
  nodeId: NodeId,
  frameBodyId: BodyId,
): NodeAnchor | null {
  const node = ship.plan.find((n) => n.id === nodeId);
  if (!node) return null;
  const seg = node.enabled
    ? traj.segments.find((s) => s.endNodeId === node.id)
    : traj.segments.find((s) => s.tStart <= node.t && node.t <= s.tEnd);
  if (!seg) return null;
  const pre = segmentStateAt(sys, seg, node.t);
  const pos = vec3(pre.r.x, pre.r.y, pre.r.z);
  if (seg.parentId !== frameBodyId) {
    const off = bodyStateIn(sys, seg.parentId, frameBodyId, node.t).r;
    pos.x += off.x;
    pos.y += off.y;
    pos.z += off.z;
  }
  return { t: node.t, parentId: seg.parentId, pre, pos };
}

/** The markers of one ship's nodes after `now`. */
export function nodeMarkers(
  sys: BodySystem,
  ship: Ship,
  traj: Trajectory,
  now: number,
  frameBodyId: BodyId,
  editable: boolean,
): NodeMarker[] {
  const out: NodeMarker[] = [];
  for (const node of ship.plan) {
    if (node.t < now) continue;
    const a = nodeAnchor(sys, ship, traj, node.id, frameBodyId);
    if (!a) continue;
    out.push({
      shipId: ship.id,
      nodeId: node.id,
      t: node.t,
      pos: a.pos,
      state: node.enabled ? 'enabled' : 'disabled',
      editable,
    });
  }
  return out;
}
