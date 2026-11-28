/**
 * The frame stages (decision S3-2 in planning/sprint-3.md). `MapRenderer` runs them in the order
 * of `STAGES` every frame, sharing one `MapFrame`, then renders. The stages that aren't layers
 * are thin functions here; the camera stage is `camera/CameraStage.ts` and the layers are in
 * `layers/`.
 */

import type { BodyId } from '../sim/body';
import type { EventRegistry } from '../sim/events';
import { advanceWorld, type World } from '../sim/world';
import type { ShipId } from '../sim/ship';
import type { FocusRef, MapObjectRef } from '../store/useView';
import { syncFrameShips, updateFrameBodies, updateFrameShips, type MapFrame } from './mapFrame';
import {
  measureLabels,
  placeLabels,
  updateLabelCandidates,
  updateShipLabelCandidates,
  type LabelRegistry,
} from './overlays/labelLayout';
import {
  placeTrajectoryMarkers,
  type TrajectoryMarkerRegistry,
} from './overlays/trajectoryMarkerLayout';
import { projectFrame } from './projection';

/**
 * The stages, in run order. The ships stage comes before the camera, which may focus a ship;
 * projection comes before the layers, which need this frame's disc sizes (S2-7).
 */
export const STAGES = [
  'clock',
  'bodies',
  'ships',
  'camera',
  'projection',
  'layers',
  'labels',
] as const;
export type StageName = (typeof STAGES)[number];

/** What the layers need of the view store, read once per frame. */
export interface ViewSnapshot {
  focus: FocusRef;
  selected: MapObjectRef | null;
  hovered: MapObjectRef | null;
  /** The body trajectories are drawn relative to: the resolved reference frame (S5b-1). */
  frameBodyId: BodyId;
  /** The active ship, if it is coasting (S4-9). */
  activeShipId: ShipId | null;
  /** Whether the map is drawn at a preview time, not now: map editing is off (S5-11). */
  previewing: boolean;
  /** The object flashing, and the wall seconds since the flash began (S5b-11); null if none. */
  flash: { ref: MapObjectRef; elapsed: number } | null;
}

/** One kind of object on the map, as a plain three.js layer. */
export interface MapLayer {
  update(frame: MapFrame, view: ViewSnapshot): void;
  /** Called when the store version changes: rebuild objects if the set of entities changed. */
  sync?(world: World): void;
  dispose(): void;
}

/**
 * Clock stage: advances the world by a frame of wall time, stopping at every sim event on the
 * way (S3-9). Returns whether any event was handled or a warp-to arrived (S5-14), so the caller
 * can bump the store version.
 */
export function clockStage(world: World, dtWall: number, events: EventRegistry): boolean {
  const r = advanceWorld(world, dtWall, events);
  return r.events > 0 || r.arrived;
}

/**
 * Bodies stage: the frame's time, which is the preview time or now (S5-10), and every body's
 * world position at it.
 */
export function bodiesStage(frame: MapFrame, world: World, viewTime: number): void {
  updateFrameBodies(frame, world.system, viewTime, world.clock.t);
}

/**
 * Ships stage (S3-2): the drawn ship set (arrays reallocated only when it changes), and each
 * ship's world position at the new t.
 */
export function shipsStage(frame: MapFrame, world: World): void {
  syncFrameShips(frame, world);
  updateFrameShips(frame, world);
}

/** Projection stage: screen positions, discs, markers and merging (S2-7, S3-20). */
export function projectionStage(frame: MapFrame, world: World, view: ViewSnapshot): void {
  projectFrame(frame, world.system, view);
}

/**
 * Labels stage: candidates, declutter, and the span positions (S2-15); then the trajectory
 * markers, whose texts give way to the labels (S3-19).
 */
export function labelsStage(
  reg: LabelRegistry,
  markers: TrajectoryMarkerRegistry,
  frame: MapFrame,
  world: World,
  view: ViewSnapshot,
): void {
  measureLabels(reg);
  updateLabelCandidates(reg, frame, world.system, view);
  updateShipLabelCandidates(reg, frame, world, view);
  placeLabels(reg, frame, world, view);
  placeTrajectoryMarkers(markers, frame, world, view);
}
