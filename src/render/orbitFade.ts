/**
 * Orbit lines: their fading and buffer filling (decisions S2-8 and S2-9 in
 * planning/sprint-2.md). Pure, so it's tested headlessly; `layers/OrbitLayer.ts` applies it each frame.
 *
 * Each line's opacity is a base alpha × a screen-size fade (which hides moon orbits at system
 * zoom) × a per-vertex distance fade (which keeps distant outer orbits as faint context). The
 * thresholds are to be tuned by eye.
 */

import type { Vec3 } from '../math/vec3';

/** Segments per orbit line (257 points). */
export const ORBIT_SEGMENTS = 256;
/** Projected orbit diameter, px: hidden below `from`, full above `to`. */
export const SCREEN_FADE_PX = { from: 15, to: 40 } as const;
/** Vertex distance from the camera, as a multiple of the camera's distance from the origin. */
export const DISTANCE_FADE = { near: 10, far: 1000, floor: 0.2 } as const;
/** Opacity of an ordinary orbit, and of the focused, selected or hovered body's orbit. */
export const BASE_ALPHA = 0.45;
export const HIGHLIGHT_ALPHA = 1;

/** 0 below SCREEN_FADE_PX.from, 1 above .to, linear between. */
export function screenFade(diameterPx: number): number {
  const { from, to } = SCREEN_FADE_PX;
  return Math.min(Math.max((diameterPx - from) / (to - from), 0), 1);
}

/** 1 within `near`, falling log-linearly to `floor` at `far` and beyond. */
export function distanceFade(ratio: number): number {
  const { near, far, floor } = DISTANCE_FADE;
  if (!(ratio > near)) return 1;
  const s = Math.log10(ratio / near) / Math.log10(far / near);
  return Math.max(1 - (1 - floor) * s, floor);
}

/**
 * The on-screen diameter, px, of a circle of `radius` km seen from `distance` km, with a vertical
 * field of view `fovRad` over `viewportHeightPx`. Infinity when the camera is inside it.
 */
export function projectedDiameterPx(
  radius: number,
  distance: number,
  viewportHeightPx: number,
  fovRad: number,
): number {
  if (distance <= radius) return Infinity;
  return (2 * radius * viewportHeightPx) / (2 * distance * Math.tan(fovRad / 2));
}

export interface OrbitLineBuffers {
  /** 3 per point, origin-relative, float32. */
  positions: Float32Array;
  /** 4 per point, RGBA, linear. */
  colors: Float32Array;
}

/**
 * Fills a line's buffers from an orbit sample relative to its parent (`count + 1` points,
 * float64). Positions are `parent + sample − origin`, summed in float64 before the float32 write.
 * Each vertex's alpha is `alpha`, times the distance fade if `fadeByDistance`. `camera` is the
 * camera position relative to the origin, and `cameraDistance` its distance from the origin.
 */
export function writeOrbitLine(
  out: OrbitLineBuffers,
  sample: Float64Array,
  count: number,
  parent: Vec3,
  origin: Vec3,
  camera: Vec3,
  cameraDistance: number,
  rgb: readonly [number, number, number],
  alpha: number,
  fadeByDistance: boolean,
): void {
  const ox = parent.x - origin.x;
  const oy = parent.y - origin.y;
  const oz = parent.z - origin.z;
  for (let j = 0; j <= count; j++) {
    const x = ox + sample[3 * j]!;
    const y = oy + sample[3 * j + 1]!;
    const z = oz + sample[3 * j + 2]!;
    out.positions[3 * j] = x;
    out.positions[3 * j + 1] = y;
    out.positions[3 * j + 2] = z;
    let a = alpha;
    if (fadeByDistance && a > 0) {
      const d = Math.hypot(x - camera.x, y - camera.y, z - camera.z);
      a *= distanceFade(d / cameraDistance);
    }
    out.colors[4 * j] = rgb[0];
    out.colors[4 * j + 1] = rgb[1];
    out.colors[4 * j + 2] = rgb[2];
    out.colors[4 * j + 3] = a;
  }
}
