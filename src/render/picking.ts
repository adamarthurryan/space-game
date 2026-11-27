/**
 * Screen-space picking (decision S2-14 in planning/sprint-2.md): one path for discs, labels
 * and markers, reading the MapFrame's projection. Priority: a disc under the cursor (the
 * nearest) > a label under the cursor > the nearest marker within reach.
 */

import type { MapObjectRef } from '../store/useView';
import type { MapFrame, PlacedLabel, Rect } from './mapFrame';

export type { PlacedLabel, Rect };

/** How far from a marker's centre a click still picks it, px. */
export const PICK_RADIUS_PX = 8;

/** The object under (x, y) in CSS px from the canvas's top left, or null. */
export function pick(
  frame: MapFrame,
  x: number,
  y: number,
  radiusPx = PICK_RADIUS_PX,
): MapObjectRef | null {
  const n = frame.order.length;

  // 1. Discs: the nearest one whose drawn sphere contains the cursor.
  let best = -1;
  for (let i = 0; i < n; i++) {
    if (!frame.sphereShown[i] || !(frame.depth[i]! < Infinity)) continue;
    const d = Math.hypot(x - frame.screenX[i]!, y - frame.screenY[i]!);
    if (d <= frame.discPx[i]! && (best < 0 || frame.depth[i]! < frame.depth[best]!)) best = i;
  }
  if (best >= 0) return { kind: 'body', id: frame.order[best]! };

  // 2. Labels.
  for (const l of frame.labels) {
    const r = l.rect;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return l.ref;
  }

  // 3. Markers: the nearest within reach.
  let bestD = radiusPx;
  for (let i = 0; i < n; i++) {
    if (!frame.markerShown[i]) continue;
    const d = Math.hypot(x - frame.screenX[i]!, y - frame.screenY[i]!);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best >= 0 ? { kind: 'body', id: frame.order[best]! } : null;
}
