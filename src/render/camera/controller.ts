/**
 * The camera controller (decisions S2-10 to S2-12 in planning/sprint-2.md). Pure TypeScript, no
 * three.js, so it's tested headlessly; `CameraRig.tsx` feeds it input and applies it each frame.
 *
 * The camera orbits the scene origin at yaw and pitch about a reference pole, at a distance kept
 * as log10(km). Its orientation is built from the pole's basis, not with `lookAt`, so looking
 * straight down the pole (pitch ±90°) is not degenerate.
 */

import { cross, dot, normalize, vec3, type Vec3 } from '../../math/vec3';
import type { BodyId } from '../../sim/body';
import { MAX_DISTANCE } from './framing';

/** One wheel notch zooms by ×2 (S2-10). */
export const ZOOM_PER_NOTCH = Math.log10(2);
/** Radians of orbit per pixel of drag. */
export const ORBIT_RAD_PER_PX = 0.005;
/** Zoom easing time constant, s: about 95% of a notch in 150 ms. */
export const ZOOM_TAU = 0.05;
export const REFOCUS_DURATION = 0.8;
export const SNAP_DURATION = 0.5;
const HALF_PI = Math.PI / 2;

/** A press that moves less than this is a click, not a drag (S2-14). */
export const DRAG_THRESHOLD_PX = 4;
/** Wheel delta per notch: Chrome and Firefox send 100 px per mouse-wheel notch. */
const PX_PER_NOTCH = 100;
const LINES_PER_NOTCH = 3;

/** Wheel delta → notches; positive zooms out. Trackpad deltas scale proportionally (S2-10). */
export function wheelNotches(e: { deltaY: number; deltaMode: number }): number {
  if (e.deltaMode === 1) return e.deltaY / LINES_PER_NOTCH;
  if (e.deltaMode === 2) return e.deltaY;
  return e.deltaY / PX_PER_NOTCH;
}

export interface CameraController {
  focusId: BodyId;
  /** Reference pole, unit, ecliptic axes (S2-12). */
  pole: Vec3;
  /** About the pole, from the pole basis's u axis. */
  yaw: number;
  /** [−π/2, π/2]. */
  pitch: number;
  /** log10 km. */
  logDistance: number;
  target: { yaw: number; pitch: number; logDistance: number };
  refocus: { fromId: BodyId; elapsed: number; duration: number; fromLogDistance: number } | null;
  snap: { fromPole: Vec3; fromPitch: number; elapsed: number; duration: number } | null;
  limits: { minLogDistance: number; maxLogDistance: number };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

/** Smooth start and stop, 0 → 0 and 1 → 1. */
export function easeInOut(s: number): number {
  const x = clamp(s, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/**
 * The pole's basis: u = its ascending node on the ecliptic (X if the pole is ±Z), v = w × u,
 * w = the pole.
 */
export function poleBasis(pole: Vec3): { u: Vec3; v: Vec3; w: Vec3 } {
  const w = normalize(pole);
  // The node line is ẑ × w.
  const node = vec3(-w.y, w.x, 0);
  const u = Math.hypot(node.x, node.y) < 1e-12 ? vec3(1, 0, 0) : normalize(node);
  return { u, v: cross(w, u), w };
}

export function createController(
  focusId: BodyId,
  framing: number,
  minDist: number,
): CameraController {
  const limits = { minLogDistance: Math.log10(minDist), maxLogDistance: Math.log10(MAX_DISTANCE) };
  const logDistance = clamp(Math.log10(framing), limits.minLogDistance, limits.maxLogDistance);
  // Looking at the focus from 30° above the ecliptic.
  const yaw = -HALF_PI;
  const pitch = Math.PI / 6;
  return {
    focusId,
    pole: vec3(0, 0, 1),
    yaw,
    pitch,
    logDistance,
    target: { yaw, pitch, logDistance },
    refocus: null,
    snap: null,
    limits,
  };
}

/** Zooms by ×2 per notch (positive = out), clamped to the limits; animated by stepController. */
export function zoomBy(c: CameraController, notches: number): void {
  c.target.logDistance = clamp(
    c.target.logDistance + notches * ZOOM_PER_NOTCH,
    c.limits.minLogDistance,
    c.limits.maxLogDistance,
  );
}

/** Orbits by a drag of (dx, dy) px: right turns the camera left about the pole, down raises it. */
export function orbitBy(c: CameraController, dxPx: number, dyPx: number): void {
  c.snap = null;
  c.yaw -= dxPx * ORBIT_RAD_PER_PX;
  c.pitch = clamp(c.pitch + dyPx * ORBIT_RAD_PER_PX, -HALF_PI, HALF_PI);
  c.target.yaw = c.yaw;
  c.target.pitch = c.pitch;
}

/** Starts a refocus on `toId` (S2-11), moving to its framing distance. */
export function beginRefocus(
  c: CameraController,
  toId: BodyId,
  framing: number,
  minDist: number,
): void {
  // A refocus mid-refocus starts from where the origin is now only approximately; it restarts
  // from the old target. Good enough for a camera.
  c.refocus = {
    fromId: c.focusId,
    elapsed: 0,
    duration: REFOCUS_DURATION,
    fromLogDistance: c.logDistance,
  };
  c.focusId = toId;
  c.limits.minLogDistance = Math.log10(minDist);
  c.target.logDistance = clamp(
    Math.log10(framing),
    c.limits.minLogDistance,
    c.limits.maxLogDistance,
  );
}

/**
 * Snaps to look straight down `pole` (S2-12). The current camera direction is re-expressed in
 * the new pole's basis first, so the view doesn't jump; then pitch animates to 90°. The new
 * pole persists for orbiting.
 */
export function beginSnap(c: CameraController, pole: Vec3): void {
  const dir = offsetDirection(c);
  const fromPole = c.pole;
  c.pole = normalize(pole);
  const { u, v, w } = poleBasis(c.pole);
  c.pitch = Math.asin(clamp(dot(dir, w), -1, 1));
  c.yaw = Math.atan2(dot(dir, v), dot(dir, u));
  c.target.yaw = c.yaw;
  c.target.pitch = HALF_PI;
  c.snap = { fromPole, fromPitch: c.pitch, elapsed: 0, duration: SNAP_DURATION };
}

/** Advances the zoom, refocus and snap animations by dtWall seconds. */
export function stepController(c: CameraController, dtWall: number): void {
  const dt = Math.max(dtWall, 0);

  if (c.snap) {
    c.snap.elapsed += dt;
    const s = c.snap.elapsed / c.snap.duration;
    c.pitch = c.snap.fromPitch + (c.target.pitch - c.snap.fromPitch) * easeInOut(s);
    if (s >= 1) {
      c.pitch = c.target.pitch;
      c.snap = null;
    }
  }

  if (c.refocus) {
    c.refocus.elapsed += dt;
    const s = c.refocus.elapsed / c.refocus.duration;
    const from = c.refocus.fromLogDistance;
    c.logDistance = from + (c.target.logDistance - from) * easeInOut(s);
    if (s >= 1) {
      c.logDistance = c.target.logDistance;
      c.refocus = null;
    }
  } else {
    const diff = c.target.logDistance - c.logDistance;
    c.logDistance =
      Math.abs(diff) < 1e-9
        ? c.target.logDistance
        : c.logDistance + diff * (1 - Math.exp(-dt / ZOOM_TAU));
  }
}

/**
 * The scene origin, written into `out`: the focus, or the eased blend of the old and new focus
 * during a refocus. `focusWorld(id, out)` writes a body's world position at the current t, and
 * is called with two different output vectors. At the end of a refocus the origin is exactly
 * the new focus.
 */
export function controllerOriginInto(
  c: CameraController,
  focusWorld: (id: BodyId, out: Vec3) => Vec3,
  out: Vec3,
): Vec3 {
  focusWorld(c.focusId, out);
  if (!c.refocus) return out;
  const k = easeInOut(c.refocus.elapsed / c.refocus.duration);
  const from = focusWorld(c.refocus.fromId, scratchFrom);
  out.x = from.x + (out.x - from.x) * k;
  out.y = from.y + (out.y - from.y) * k;
  out.z = from.z + (out.z - from.z) * k;
  return out;
}
const scratchFrom = vec3(0, 0, 0);

/** Unit vector from the origin to the camera. */
function offsetDirection(c: CameraController): Vec3 {
  const { u, v, w } = poleBasis(c.pole);
  const cp = Math.cos(c.pitch);
  const sp = Math.sin(c.pitch);
  const cy = Math.cos(c.yaw);
  const sy = Math.sin(c.yaw);
  return vec3(
    cp * (cy * u.x + sy * v.x) + sp * w.x,
    cp * (cy * u.y + sy * v.y) + sp * w.y,
    cp * (cy * u.z + sy * v.z) + sp * w.z,
  );
}

/**
 * The camera's position relative to the origin, and its orientation: forward (towards the
 * origin) and up (the direction of increasing pitch, so it is defined at ±90°). Orthonormal.
 */
export function controllerPose(c: CameraController): { offset: Vec3; forward: Vec3; up: Vec3 } {
  const { u, v, w } = poleBasis(c.pole);
  const dir = offsetDirection(c);
  const cp = Math.cos(c.pitch);
  const sp = Math.sin(c.pitch);
  // The horizontal direction (in the pole's plane) of the camera, then up = ∂dir/∂pitch.
  const hx = Math.cos(c.yaw) * u.x + Math.sin(c.yaw) * v.x;
  const hy = Math.cos(c.yaw) * u.y + Math.sin(c.yaw) * v.y;
  const hz = Math.cos(c.yaw) * u.z + Math.sin(c.yaw) * v.z;
  const d = 10 ** c.logDistance;
  return {
    offset: vec3(d * dir.x, d * dir.y, d * dir.z),
    forward: vec3(-dir.x, -dir.y, -dir.z),
    up: vec3(-sp * hx + cp * w.x, -sp * hy + cp * w.y, -sp * hz + cp * w.z),
  };
}
