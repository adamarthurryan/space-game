/**
 * Occlusion by body discs (decision S2-15 for labels; S5b-14 in planning/sprint-5b.md for every
 * overlay): whether a screen point at a distance from the camera is behind a nearer drawn disc.
 * Pure: reads the MapFrame's projection.
 */

import type { MapFrame } from './mapFrame';
import { projectScenePoint, type ScreenPoint } from './screenDash';

/**
 * Whether a point at (x, y) CSS px, `depth` km from the camera, is behind a nearer drawn disc
 * (other than body `self`).
 */
export function occludedAt(
  frame: MapFrame,
  x: number,
  y: number,
  depth: number,
  self = -1,
): boolean {
  for (let j = 0; j < frame.order.length; j++) {
    if (j === self || !frame.sphereShown[j] || !(frame.depth[j]! < depth)) continue;
    if (Math.hypot(x - frame.screenX[j]!, y - frame.screenY[j]!) < frame.discPx[j]!) return true;
  }
  return false;
}

const scratch: ScreenPoint = { x: 0, y: 0, depth: 0 };

/**
 * Whether a scene point (km, relative to the origin) is behind a nearer drawn disc; false if it
 * is behind the camera. Writes its screen position into `out` when given.
 */
export function sceneOccluded(
  frame: MapFrame,
  sx: number,
  sy: number,
  sz: number,
  out: ScreenPoint = scratch,
): boolean {
  projectScenePoint(frame.camera, sx, sy, sz, out);
  if (!(out.depth > 0)) return false;
  const c = frame.camera.position;
  return occludedAt(frame, out.x, out.y, Math.hypot(sx - c.x, sy - c.y, sz - c.z));
}
