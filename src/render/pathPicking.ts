/**
 * Picking a point on the active ship's drawn path (decision S4-12 in planning/sprint-4.md): the
 * nearest point on the projected polylines within a radius, with its time interpolated linearly
 * between the two neighbouring vertices.
 */

import type { ShipId } from '../sim/ship';

/** One drawn piece of a trajectory, projected: 2 floats per vertex (NaN if behind the camera). */
export interface ProjectedPolyline {
  shipId: ShipId;
  segmentIndex: number;
  screen: Float32Array;
  times: Float64Array;
  count: number;
}

export interface PathHit {
  shipId: ShipId;
  segmentIndex: number;
  t: number;
  screenX: number;
  screenY: number;
  distancePx: number;
}

/** Ghost nodes appear within this distance of the path, px (S4-12). */
export const PATH_PICK_PX = 8;

/** The nearest point on the polylines within radiusPx of (x, y), or null. */
export function nearestOnPath(
  lines: readonly ProjectedPolyline[],
  x: number,
  y: number,
  radiusPx = PATH_PICK_PX,
): PathHit | null {
  let best: PathHit | null = null;
  for (const l of lines) {
    for (let k = 0; k + 1 < l.count; k++) {
      const ax = l.screen[2 * k]!;
      const ay = l.screen[2 * k + 1]!;
      const bx = l.screen[2 * k + 2]!;
      const by = l.screen[2 * k + 3]!;
      if (!Number.isFinite(ax + ay + bx + by)) continue;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const u = len2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
      const px = ax + u * dx;
      const py = ay + u * dy;
      const d = Math.hypot(x - px, y - py);
      if (d > radiusPx || (best && d >= best.distancePx)) continue;
      const t0 = l.times[k]!;
      const t1 = l.times[k + 1]!;
      best = {
        shipId: l.shipId,
        segmentIndex: l.segmentIndex,
        t: t0 + u * (t1 - t0),
        screenX: px,
        screenY: py,
        distancePx: d,
      };
    }
  }
  return best;
}
