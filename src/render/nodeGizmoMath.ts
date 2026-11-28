/**
 * The node gizmo's pure parts (decision S4-14 in planning/sprint-4.md): the handles and their
 * axes, the drag sensitivity, the screen-constant size and the screen axis of a handle.
 */

import type { Vec3 } from '../math/vec3';
import type { LocalDv, OrbitalBasis } from '../orbital/frames';
import type { FrameCamera } from './mapFrame';
import { projectScenePoint, type ScreenPoint } from './screenDash';

/** Arm length on screen, px. */
export const GIZMO_ARM_PX = 60;
/** The Δv change of a 100 px drag, km/s; the curve is cubic (S4-14). */
export const DRAG_SCALE = 0.1;
const DRAG_UNIT_PX = 100;

export type GizmoHandle =
  'prograde' | 'retrograde' | 'normal' | 'anti-normal' | 'radial-out' | 'radial-in';

export const GIZMO_HANDLES: readonly GizmoHandle[] = [
  'prograde',
  'retrograde',
  'normal',
  'anti-normal',
  'radial-out',
  'radial-in',
];

/** The Δv component a handle changes, and the sign of its direction. */
export const HANDLE_AXIS: Record<GizmoHandle, { component: keyof LocalDv; sign: 1 | -1 }> = {
  prograde: { component: 'prograde', sign: 1 },
  retrograde: { component: 'prograde', sign: -1 },
  normal: { component: 'normal', sign: 1 },
  'anti-normal': { component: 'normal', sign: -1 },
  'radial-out': { component: 'radial', sign: 1 },
  'radial-in': { component: 'radial', sign: -1 },
};

/** Handle colours: prograde yellow, normal magenta, radial cyan (S4-14). */
export const HANDLE_COLOR: Record<keyof LocalDv, string> = {
  prograde: '#f2d230',
  normal: '#e04fe0',
  radial: '#36d0e0',
};

export type DragMode = 'fine' | 'normal' | 'coarse';
const MODE_FACTOR: Record<DragMode, number> = { fine: 0.1, normal: 1, coarse: 10 };

/** Shift is fine, Alt coarse (S4-14). */
export const dragModeOf = (e: { shiftKey: boolean; altKey: boolean }): DragMode =>
  e.shiftKey ? 'fine' : e.altKey ? 'coarse' : 'normal';

/** The change of a handle's component for a drag of dPx along its screen axis, km/s. */
export function dragDelta(dPx: number, mode: DragMode = 'normal'): number {
  const u = Math.abs(dPx) / DRAG_UNIT_PX;
  return Math.sign(dPx) * DRAG_SCALE * u * u * u * MODE_FACTOR[mode];
}

/** The node's Δv after dragging handle h by `delta` (km/s) from `start`. */
export function handleEdit(h: GizmoHandle, start: LocalDv, delta: number): LocalDv {
  const { component, sign } = HANDLE_AXIS[h];
  return { ...start, [component]: start[component] + sign * delta };
}

/** A handle's direction in world axes. */
export function handleDirection(b: OrbitalBasis, h: GizmoHandle, out: Vec3): Vec3 {
  const { component, sign } = HANDLE_AXIS[h];
  const d = b[component];
  out.x = sign * d.x;
  out.y = sign * d.y;
  out.z = sign * d.z;
  return out;
}

/** World units that span GIZMO_ARM_PX on screen at `depth` km in front of the camera. */
export function gizmoScale(depth: number, cam: FrameCamera, armPx = GIZMO_ARM_PX): number {
  return (2 * depth * Math.tan(cam.fovRad / 2) * armPx) / cam.height;
}

const a: ScreenPoint = { x: 0, y: 0, depth: 0 };
const b: ScreenPoint = { x: 0, y: 0, depth: 0 };

/**
 * The handle's axis on screen, as a unit 2D vector (y down), from the node's scene position and
 * the axis direction; null if the axis points (nearly) at the camera or the node is behind it.
 */
export function screenAxis(
  cam: FrameCamera,
  node: Vec3,
  axis: Vec3,
): { x: number; y: number } | null {
  projectScenePoint(cam, node.x, node.y, node.z, a);
  if (!(a.depth > 0)) return null;
  const s = gizmoScale(a.depth, cam) * 0.1;
  projectScenePoint(cam, node.x + axis.x * s, node.y + axis.y * s, node.z + axis.z * s, b);
  if (!(b.depth > 0)) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  // Under 0.3 px for a 6 px step: the axis is within ~3° of the view direction.
  if (len < 0.3) return null;
  return { x: dx / len, y: dy / len };
}
