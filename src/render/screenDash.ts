/**
 * Screen-space projection of scene vertices (decisions S4-11 and S4-12 in planning/sprint-4.md):
 * for the dashes of planned paths, and for picking the active ship's path. Scene coordinates
 * are relative to the origin, as the camera's position in the `FrameCamera` is.
 */

import type { FrameCamera } from './mapFrame';

/** Screen x, y in CSS px and the depth along the view axis (≤ 0 if behind the camera). */
export interface ScreenPoint {
  x: number;
  y: number;
  depth: number;
}

/** Projects one scene point (relative to the origin). */
export function projectScenePoint(
  cam: FrameCamera,
  px: number,
  py: number,
  pz: number,
  out: ScreenPoint,
): ScreenPoint {
  const rx = px - cam.position.x;
  const ry = py - cam.position.y;
  const rz = pz - cam.position.z;
  const z = rx * cam.forward.x + ry * cam.forward.y + rz * cam.forward.z;
  const tanHalf = Math.tan(cam.fovRad / 2);
  const aspect = cam.width / cam.height;
  out.depth = z;
  if (z <= 0) {
    out.x = NaN;
    out.y = NaN;
    return out;
  }
  out.x =
    ((1 + (rx * cam.right.x + ry * cam.right.y + rz * cam.right.z) / (z * tanHalf * aspect)) / 2) *
    cam.width;
  out.y = ((1 - (rx * cam.up.x + ry * cam.up.y + rz * cam.up.z) / (z * tanHalf)) / 2) * cam.height;
  return out;
}

const scratch: ScreenPoint = { x: 0, y: 0, depth: 0 };

/** Projects `count` scene vertices (3 floats each) into `out` (2 floats each; NaN if behind). */
export function projectVerticesInto(
  cam: FrameCamera,
  positions: Float32Array,
  count: number,
  out: Float32Array,
): void {
  for (let k = 0; k < count; k++) {
    projectScenePoint(
      cam,
      positions[3 * k]!,
      positions[3 * k + 1]!,
      positions[3 * k + 2]!,
      scratch,
    );
    out[2 * k] = scratch.x;
    out[2 * k + 1] = scratch.y;
  }
}

/**
 * Cumulative screen-space length per vertex, px (S4-11), from projected vertices. A step with
 * either end behind the camera adds nothing.
 */
export function screenLineDistances(screen: Float32Array, count: number, out: Float32Array): void {
  let d = 0;
  for (let k = 0; k < count; k++) {
    if (k > 0) {
      const dx = screen[2 * k]! - screen[2 * k - 2]!;
      const dy = screen[2 * k + 1]! - screen[2 * k - 1]!;
      const step = Math.hypot(dx, dy);
      if (Number.isFinite(step)) d += step;
    }
    out[k] = d;
  }
}
