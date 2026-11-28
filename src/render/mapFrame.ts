/**
 * Shared per-frame state of the map (decision S2-16 in planning/sprint-2.md).
 *
 * The frame stages run in the order of `STAGES` (stages.ts) and share one `MapFrame`: plain
 * arrays allocated once per body system, so no stage allocates per frame.
 */

import { vec3, type Vec3 } from '../math/vec3';
import { bodyOrder, bodyWorldPositionsInto, type BodyId, type BodySystem } from '../sim/body';
import type { ShipId } from '../sim/ship';
import { shipBodyAt, shipPointAt, type World } from '../sim/world';
import type { NodeId } from '../sim/maneuver';
import type { FocusRef } from '../store/useView';
import type { ProjectedPolyline } from './pathPicking';

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
  /** Device pixels per CSS px of the drawing buffer. */
  pixelRatio: number;
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
  ref: FocusRef;
  rect: Rect;
}

export interface MapFrame {
  /** The time this frame is drawn at: the preview time, or now (bodies stage, S5-10). */
  t: number;
  /** The sim's time, `world.clock.t` (bodies stage); equals `t` unless previewing (S5-16). */
  now: number;
  /** bodyOrder(system): the index order of every per-body array. */
  order: BodyId[];
  indexOf: Record<BodyId, number>;
  /** 3n world positions at t, float64, km (bodies stage). */
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
  /** The drawn ships (S3-2, S3-20). */
  ships: FrameShips;
  /** The active ship's drawn main pieces, projected (layers stage), for the ghost (S4-12). */
  paths: ProjectedPolyline[];
  /** Node glyphs placed this frame (labels stage), for picking (S4-13). */
  nodes: PlacedNode[];
  /** The ghost node under the pointer, if any (pointer input, S4-12). */
  ghost: Ghost | null;
}

/** A node glyph on screen. */
export interface PlacedNode {
  shipId: ShipId;
  nodeId: NodeId;
  x: number;
  y: number;
}

/** The ghost node: where a click on the active ship's path would create a node (S4-12). */
export interface Ghost {
  shipId: ShipId;
  segmentIndex: number;
  t: number;
  x: number;
  y: number;
}

/** Per-ship arrays, reallocated only when the set of drawn ships changes. */
export interface FrameShips {
  /** Drawn (coasting) ships, in seq order. */
  ids: ShipId[];
  indexOf: Record<ShipId, number>;
  /** Body index of each ship's current parent (ships stage). */
  parentIndex: Int32Array;
  /** 3m world positions, float64, km (ships stage). */
  world: Float64Array;
  // Projection stage.
  screenX: Float32Array;
  screenY: Float32Array;
  depth: Float32Array;
  markerShown: Uint8Array;
  /** 1 if within 6 px of its parent's centre on screen, and neither focused nor selected. */
  merged: Uint8Array;
}

function createFrameShips(ids: ShipId[]): FrameShips {
  const m = ids.length;
  return {
    ids,
    indexOf: Object.fromEntries(ids.map((id, i) => [id, i])),
    parentIndex: new Int32Array(m),
    world: new Float64Array(3 * m),
    screenX: new Float32Array(m),
    screenY: new Float32Array(m),
    depth: new Float32Array(m).fill(Infinity),
    markerShown: new Uint8Array(m),
    merged: new Uint8Array(m),
  };
}

export function createMapFrame(system: BodySystem): MapFrame {
  const order = bodyOrder(system);
  const n = order.length;
  return {
    t: 0,
    now: 0,
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
      pixelRatio: 1,
    },
    screenX: new Float32Array(n),
    screenY: new Float32Array(n),
    depth: new Float32Array(n).fill(Infinity),
    discPx: new Float32Array(n),
    sphereShown: new Uint8Array(n),
    markerShown: new Uint8Array(n),
    merged: new Uint8Array(n),
    labels: [],
    ships: createFrameShips([]),
    paths: [],
    nodes: [],
    ghost: null,
  };
}

/**
 * Body positions stage: the frame's time (the preview time, or now) and every body's world
 * position at it (S5-10).
 */
export function updateFrameBodies(
  frame: MapFrame,
  system: BodySystem,
  t: number,
  now: number = t,
): void {
  frame.t = t;
  frame.now = now;
  bodyWorldPositionsInto(system, frame.order, t, frame.world);
}

/** The world position of body `i` of the frame's order, copied into `out`. */
export function frameWorldInto(frame: MapFrame, i: number, out: Vec3): Vec3 {
  out.x = frame.world[3 * i]!;
  out.y = frame.world[3 * i + 1]!;
  out.z = frame.world[3 * i + 2]!;
  return out;
}

/** The ships that are drawn: coasting, with a trajectory that reaches t (S5-10), in seq order. */
function drawnShipIds(world: World, t: number): ShipId[] {
  return Object.values(world.ships)
    .filter((s) => s.status === 'coasting' && shipPointAt(world, s.id, t) !== null)
    .sort((a, b) => a.seq - b.seq)
    .map((s) => s.id);
}

/** Reallocates the ship arrays if the drawn ship set changed. Returns whether it did. */
export function syncFrameShips(frame: MapFrame, world: World): boolean {
  const ids = drawnShipIds(world, frame.t);
  const cur = frame.ships.ids;
  if (ids.length === cur.length && ids.every((id, i) => id === cur[i])) return false;
  frame.ships = createFrameShips(ids);
  return true;
}

const scratchState = { r: vec3(0, 0, 0), v: vec3(0, 0, 0) };

/**
 * Ships stage: each ship's parent index and world position at frame.t, from its trajectory, so
 * a previewed ship is on the right conic around the right parent (S5-10).
 */
export function updateFrameShips(frame: MapFrame, world: World): void {
  const fs = frame.ships;
  for (let k = 0; k < fs.ids.length; k++) {
    const point = shipPointAt(world, fs.ids[k]!, frame.t, scratchState);
    const p = point ? (frame.indexOf[point.parentId] ?? 0) : 0;
    fs.parentIndex[k] = p;
    if (!point) continue;
    const s = point.state;
    fs.world[3 * k] = frame.world[3 * p]! + s.r.x;
    fs.world[3 * k + 1] = frame.world[3 * p + 1]! + s.r.y;
    fs.world[3 * k + 2] = frame.world[3 * p + 2]! + s.r.z;
  }
}

/**
 * The world position of a body or ship at frame.t, into `out`. A ship that isn't drawn (it was
 * destroyed) gives the body it impacted, or its parent.
 */
export function mapObjectWorldInto(frame: MapFrame, world: World, ref: FocusRef, out: Vec3): Vec3 {
  if (ref.kind === 'ship') {
    const k = frame.ships.indexOf[ref.id];
    if (k !== undefined) {
      out.x = frame.ships.world[3 * k]!;
      out.y = frame.ships.world[3 * k + 1]!;
      out.z = frame.ships.world[3 * k + 2]!;
      return out;
    }
    const bodyId = shipBodyAt(world, ref.id, frame.t);
    return frameWorldInto(frame, frame.indexOf[bodyId] ?? 0, out);
  }
  return frameWorldInto(frame, frame.indexOf[ref.id] ?? 0, out);
}

/**
 * The body trajectories are drawn relative to: the focus, or a focused ship's parent at t
 * (S3-16, S5-10). A ship not drawn at t gives the body it hit, or its current parent.
 */
export function frameBodyOf(world: World, focus: FocusRef, t: number): BodyId {
  return focus.kind === 'body' ? focus.id : shipBodyAt(world, focus.id, t);
}
