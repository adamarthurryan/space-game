/**
 * Shared per-frame state of the map (decision S2-16 in planning/sprint-2.md).
 *
 * The frame stages run in order of their `useFrame` priority, and share one `MapFrame`: plain
 * arrays allocated once per body system, so no stage allocates per frame.
 */

import { createContext, useContext } from 'react';
import { vec3, type Vec3 } from '../math/vec3';
import { bodyOrder, bodyWorldPositionsInto, type BodyId, type BodySystem } from '../sim/body';
import type { MapObjectRef } from '../store/useView';

/**
 * Frame stage priorities. Negative, so R3F keeps rendering; lower runs first. Keep them ≤ 0.
 * Projection runs before the layers, which need this frame's disc sizes (S2-7).
 */
export const STAGE = {
  clock: -5,
  bodies: -4,
  camera: -3,
  projection: -2,
  layers: -1,
  labels: 0,
} as const;

/** The camera of this frame, relative to the origin: position and orthonormal basis. */
export interface FrameCamera {
  position: Vec3;
  forward: Vec3;
  up: Vec3;
  right: Vec3;
  /** Vertical field of view, rad. */
  fovRad: number;
  /** Viewport, CSS px. */
  width: number;
  height: number;
}

/** A screen rectangle, CSS px from the canvas's top left. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A label placed by the declutter pass (step 6), kept for picking. */
export interface PlacedLabel {
  ref: MapObjectRef;
  rect: Rect;
}

export interface MapFrame {
  /** Sim time of this frame (stage −3). */
  t: number;
  /** bodyOrder(system): the index order of every per-body array. */
  order: BodyId[];
  indexOf: Record<BodyId, number>;
  /** 3n world positions at t, float64, km (stage −3). */
  world: Float64Array;
  /** World position of the scene origin (camera stage). */
  origin: Vec3;
  /** Camera stage. */
  camera: FrameCamera;
  // Projection stage.
  /** n, CSS px from the canvas's top left. */
  screenX: Float32Array;
  screenY: Float32Array;
  /** Distance from the camera, km; Infinity if behind it. */
  depth: Float32Array;
  /** Projected radius, px. */
  discPx: Float32Array;
  /** 1 if the body's sphere is drawn (disc ≥ 0.5 px). */
  sphereShown: Uint8Array;
  /** 1 if the body's marker is drawn (disc < 3 px, on screen, not merged). */
  markerShown: Uint8Array;
  /** 1 if the body is within 6 px of its parent's centre on screen: no marker, no label. */
  merged: Uint8Array;
  /** Labels stage, kept for picking. */
  labels: PlacedLabel[];
}

export function createMapFrame(system: BodySystem): MapFrame {
  const order = bodyOrder(system);
  const n = order.length;
  return {
    t: 0,
    order,
    indexOf: Object.fromEntries(order.map((id, i) => [id, i])),
    world: new Float64Array(3 * n),
    origin: vec3(0, 0, 0),
    camera: {
      position: vec3(0, 0, 1),
      forward: vec3(0, 0, -1),
      up: vec3(0, 1, 0),
      right: vec3(1, 0, 0),
      fovRad: (50 * Math.PI) / 180,
      width: 1,
      height: 1,
    },
    screenX: new Float32Array(n),
    screenY: new Float32Array(n),
    depth: new Float32Array(n).fill(Infinity),
    discPx: new Float32Array(n),
    sphereShown: new Uint8Array(n),
    markerShown: new Uint8Array(n),
    merged: new Uint8Array(n),
    labels: [],
  };
}

/** Body positions stage: the frame's time and every body's world position at it. */
export function updateFrameBodies(frame: MapFrame, system: BodySystem, t: number): void {
  frame.t = t;
  bodyWorldPositionsInto(system, frame.order, t, frame.world);
}

/** The world position of body `i` of the frame's order, copied into `out`. */
export function frameWorldInto(frame: MapFrame, i: number, out: Vec3): Vec3 {
  out.x = frame.world[3 * i]!;
  out.y = frame.world[3 * i + 1]!;
  out.z = frame.world[3 * i + 2]!;
  return out;
}

export const MapFrameContext = createContext<MapFrame | null>(null);

/** The scene's MapFrame. Throws outside a MapFrameContext provider. */
export function useMapFrame(): MapFrame {
  const frame = useContext(MapFrameContext);
  if (!frame) throw new Error('useMapFrame must be used inside the map scene');
  return frame;
}
