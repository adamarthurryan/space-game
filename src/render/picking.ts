/**
 * Screen-space picking (decision S2-14 in planning/sprint-2.md, S3-20 in sprint-3.md, S4-13 in
 * sprint-4.md): one path for nodes, ships, discs, labels and markers, reading the MapFrame's
 * projection. Priority: the nearest node glyph within reach > the nearest ship marker within reach that isn't behind a nearer disc > a disc under the cursor (the
 * nearest) > a label under the cursor > the nearest body marker within reach. Ships come first
 * because they are tiny and sit in front of their parent's disc.
 */

import type { MapObjectRef } from '../store/useView';
import type { MapFrame, PlacedLabel, Rect } from './mapFrame';
import { occludedAt } from './occlusion';

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

  // Node glyphs (S4-13): they often sit next to their ship, so they come first.
  let bestNode: (typeof frame.nodes)[number] | null = null;
  let bestNodeD = radiusPx;
  for (const nd of frame.nodes) {
    const d = Math.hypot(x - nd.x, y - nd.y);
    if (d <= bestNodeD) {
      bestNodeD = d;
      bestNode = nd;
    }
  }
  if (bestNode) return { kind: 'node', shipId: bestNode.shipId, id: bestNode.nodeId };

  // 0. Ship markers.
  const fs = frame.ships;
  let bestShip = -1;
  let bestShipD = radiusPx;
  for (let k = 0; k < fs.ids.length; k++) {
    if (!fs.markerShown[k]) continue;
    const d = Math.hypot(x - fs.screenX[k]!, y - fs.screenY[k]!);
    if (d <= bestShipD && !occludedAt(frame, fs.screenX[k]!, fs.screenY[k]!, fs.depth[k]!)) {
      bestShipD = d;
      bestShip = k;
    }
  }
  if (bestShip >= 0) return { kind: 'ship', id: fs.ids[bestShip]! };

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
