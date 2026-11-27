/**
 * The projection stage (decisions S2-7 and S2-14 in planning/sprint-2.md): every body's screen
 * position, distance and disc size, and which bodies are drawn as spheres or markers. Pure: it
 * reads and writes the MapFrame only.
 */

import { getBody, type BodySystem } from '../sim/body';
import type { MapFrame } from './mapFrame';

/** Below this disc radius, px, a marker is drawn (S2-7). */
export const MARKER_BELOW_DISC_PX = 3;
/** Below this disc radius, px, the sphere is hidden, to avoid sub-pixel flicker. */
export const SPHERE_MIN_DISC_PX = 0.5;
/** A body this close to its parent's centre on screen, px, merges into it. */
export const MERGE_PX = 6;
/** Points closer to the camera plane than this (km) count as behind it. */
const NEAR_KM = 1e-3;

/**
 * Projects every body with `frame.camera`. Behind-camera bodies get depth Infinity and no marker.
 * The disc radius is the body's angular radius over half the vertical field of view.
 */
export function projectFrame(frame: MapFrame, system: BodySystem): void {
  const { world, origin, camera: cam, order } = frame;
  const tanHalf = Math.tan(cam.fovRad / 2);
  const aspect = cam.width / cam.height;
  const halfH = cam.height / 2;

  for (let i = 0; i < order.length; i++) {
    const rx = world[3 * i]! - origin.x - cam.position.x;
    const ry = world[3 * i + 1]! - origin.y - cam.position.y;
    const rz = world[3 * i + 2]! - origin.z - cam.position.z;
    const z = rx * cam.forward.x + ry * cam.forward.y + rz * cam.forward.z;
    const dist = Math.hypot(rx, ry, rz);
    const radius = getBody(system, order[i]!).radius;
    // Inside a body, or looking away from it: its disc fills the view or is behind.
    const disc =
      dist <= radius ? Infinity : (Math.asin(radius / dist) / Math.atan(tanHalf)) * halfH;
    frame.discPx[i] = disc;
    frame.sphereShown[i] = disc >= SPHERE_MIN_DISC_PX ? 1 : 0;
    if (z <= NEAR_KM) {
      frame.depth[i] = Infinity;
      frame.screenX[i] = NaN;
      frame.screenY[i] = NaN;
      continue;
    }
    const x = (rx * cam.right.x + ry * cam.right.y + rz * cam.right.z) / (z * tanHalf * aspect);
    const y = (rx * cam.up.x + ry * cam.up.y + rz * cam.up.z) / (z * tanHalf);
    frame.depth[i] = dist;
    frame.screenX[i] = ((x + 1) / 2) * cam.width;
    frame.screenY[i] = ((1 - y) / 2) * cam.height;
  }

  // Parents come before children in the order, so a merged parent is already known.
  for (let i = 0; i < order.length; i++) {
    const parentId = getBody(system, order[i]!).parentId;
    const p = parentId === null ? -1 : (frame.indexOf[parentId] ?? -1);
    let merged = 0;
    if (p >= 0 && frame.depth[i]! < Infinity && frame.depth[p]! < Infinity) {
      const d = Math.hypot(
        frame.screenX[i]! - frame.screenX[p]!,
        frame.screenY[i]! - frame.screenY[p]!,
      );
      merged = d < MERGE_PX ? 1 : 0;
    }
    frame.merged[i] = merged;
    frame.markerShown[i] =
      !merged && frame.depth[i]! < Infinity && frame.discPx[i]! < MARKER_BELOW_DISC_PX ? 1 : 0;
  }
}

/** Camera stage helper: stores the pose and viewport the projection uses. */
export function setFrameCamera(
  frame: MapFrame,
  pose: {
    offset: { x: number; y: number; z: number };
    forward: { x: number; y: number; z: number };
    up: { x: number; y: number; z: number };
  },
  fovRad: number,
  width: number,
  height: number,
): void {
  const c = frame.camera;
  const { offset: o, forward: f, up: u } = pose;
  c.position.x = o.x;
  c.position.y = o.y;
  c.position.z = o.z;
  c.forward.x = f.x;
  c.forward.y = f.y;
  c.forward.z = f.z;
  c.up.x = u.x;
  c.up.y = u.y;
  c.up.z = u.z;
  // right = forward × up
  c.right.x = f.y * u.z - f.z * u.y;
  c.right.y = f.z * u.x - f.x * u.z;
  c.right.z = f.x * u.y - f.y * u.x;
  c.fovRad = fovRad;
  c.width = Math.max(width, 1);
  c.height = Math.max(height, 1);
}
