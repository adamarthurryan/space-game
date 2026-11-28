/**
 * The map renderer (decision S3-1 in planning/sprint-3.md): plain three.js. It owns the
 * `WebGLRenderer`, the scene and camera, a `ResizeObserver` on its container, the map input
 * listeners on the canvas, and the `requestAnimationFrame` loop, which runs the frame stages in
 * the order of `STAGES` (S3-2) and then renders. It is the only place in `render/` that reads the
 * wall clock.
 */

import { ACESFilmicToneMapping, Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { World } from '../sim/world';
import { FLASH_MS, mapSelection, resolveActiveShip, useView } from '../store/useView';
import { useWorld } from '../store/useWorld';
import { CameraStage } from './camera/CameraStage';
import { FOV_DEG } from './camera/framing';
import { registerDebug } from './debugHandle';
import { attachCameraInput } from './input/cameraInput';
import { attachPointerInput } from './input/pointerInput';
import { BodyLayer } from './layers/BodyLayer';
import { EncounterGhostLayer } from './layers/EncounterGhostLayer';
import { MarkerLayer } from './layers/MarkerLayer';
import { NodeGizmo } from './NodeGizmo';
import { OrbitLayer } from './layers/OrbitLayer';
import { TrajectoryLayer } from './layers/TrajectoryLayer';
import { resolveFrameBody, type MapFrame } from './mapFrame';
import { previewCaughtUp, viewTime } from './previewTime';
import type { LabelRegistry } from './overlays/labelLayout';
import type { TrajectoryMarkerRegistry } from './overlays/trajectoryMarkerLayout';
import {
  bodiesStage,
  clockStage,
  labelsStage,
  projectionStage,
  shipsStage,
  STAGES,
  type MapLayer,
  type StageName,
  type ViewSnapshot,
} from './stages';

/** Fixed clip planes, km, with a logarithmic depth buffer (S2-5). */
const NEAR = 1e-3;
const FAR = 1e12;
const BACKGROUND = '#05060a';
/** The drawing buffer's pixel ratio is capped, as R3F's default was. */
const MAX_PIXEL_RATIO = 2;

export class MapRenderer {
  readonly frame: MapFrame;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FOV_DEG, 1, NEAR, FAR);
  private readonly cameraStage: CameraStage;
  private readonly layers: MapLayer[];
  private readonly gizmo: NodeGizmo;
  private readonly detach: (() => void)[] = [];
  private readonly resizeObserver: ResizeObserver;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private rafId = 0;
  private lastTimestamp: number | null = null;
  private dtWall = 0;
  private view: ViewSnapshot;

  private readonly labels: LabelRegistry;
  private readonly markers: TrajectoryMarkerRegistry;

  constructor(
    container: HTMLElement,
    frame: MapFrame,
    labels: LabelRegistry,
    markers: TrajectoryMarkerRegistry,
  ) {
    this.frame = frame;
    this.labels = labels;
    this.markers = markers;
    const world = useWorld.getState().world;

    this.renderer = new WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);
    this.scene.background = new Color(BACKGROUND);

    this.cameraStage = new CameraStage(this.camera, frame);
    const trajectories = new TrajectoryLayer(this.scene);
    this.gizmo = new NodeGizmo(this.scene, this.camera);
    // Layers draw in this order, so markers come last, and the gizmo is drawn on top.
    this.layers = [
      new BodyLayer(this.scene, frame, world.system),
      new OrbitLayer(this.scene, frame, world.system),
      trajectories,
      new EncounterGhostLayer(this.scene),
      new MarkerLayer(this.scene, frame, world.system),
      this.gizmo,
    ];
    for (const l of this.layers) l.sync?.(world);
    this.view = this.readView(world);

    // Pointer input first: it claims gizmo and node drags before the camera sees them.
    this.detach.push(attachPointerInput(canvas, frame, this.gizmo));
    this.detach.push(attachCameraInput(canvas, this.cameraStage.controller));
    this.detach.push(
      useWorld.subscribe((s, prev) => {
        if (s.version !== prev.version || s.world !== prev.world) {
          for (const l of this.layers) l.sync?.(s.world);
        }
      }),
    );

    this.resize(container.clientWidth, container.clientHeight);
    this.resizeObserver = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) this.resize(box.width, box.height);
    });
    this.resizeObserver.observe(container);

    registerDebug('frame', frame);
    registerDebug('controller', this.cameraStage.controller);
    registerDebug('trajectories', trajectories);
    registerDebug('markers', markers);
    registerDebug('gizmo', () => this.gizmo.debug(frame));
  }

  /** Starts the loop. */
  start(): void {
    if (this.rafId !== 0) return;
    const loop = (timestamp: number) => {
      this.rafId = requestAnimationFrame(loop);
      this.dtWall = this.lastTimestamp === null ? 0 : (timestamp - this.lastTimestamp) / 1000;
      this.lastTimestamp = timestamp;
      this.renderFrame();
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /** Stops the loop, detaches input, disposes every layer, the renderer and its canvas. */
  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.resizeObserver.disconnect();
    for (const d of this.detach) d();
    this.cameraStage.dispose();
    for (const l of this.layers) l.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  /** The view for this frame, at the time the map is drawn at (S5-10). */
  private readView(world: World): ViewSnapshot {
    const { focus, frame, selected, hovered, activeShipId, preview, flash } = useView.getState();
    const left = flash ? flash.until - performance.now() : 0;
    return {
      focus,
      selected: mapSelection(selected),
      hovered,
      frameBodyId: resolveFrameBody(world, frame, viewTime(world.clock.t, preview)),
      activeShipId: resolveActiveShip(world, activeShipId),
      previewing: preview !== null,
      flash: flash && left > 0 ? { ref: flash.ref, elapsed: (FLASH_MS - left) / 1000 } : null,
    };
  }

  /** The preview time, or now; a preview that now has caught up ends here (S5-9). */
  private readViewTime(world: World): number {
    const { preview, endPreview } = useView.getState();
    if (previewCaughtUp(world.clock.t, preview)) {
      endPreview();
      return world.clock.t;
    }
    return viewTime(world.clock.t, preview);
  }

  /** One frame: the queued node edit (S4-8), every stage in order, then the draw. */
  private renderFrame(): void {
    this.gizmo.flush();
    for (const stage of STAGES) this.runStage(stage);
    this.renderer.render(this.scene, this.camera);
  }

  private runStage(stage: StageName): void {
    const world: World = useWorld.getState().world;
    const frame = this.frame;
    switch (stage) {
      case 'clock':
        if (clockStage(world, this.dtWall, useWorld.getState().events)) {
          useWorld.getState().bumpVersion();
        }
        return;
      case 'bodies':
        bodiesStage(frame, world, this.readViewTime(world));
        return;
      case 'ships':
        this.view = this.readView(world);
        shipsStage(frame, world);
        return;
      case 'camera':
        this.cameraStage.update(frame, this.dtWall, this.width, this.height, this.pixelRatio);
        return;
      case 'projection':
        projectionStage(frame, world, this.view);
        return;
      case 'layers':
        for (const l of this.layers) l.update(frame, this.view);
        return;
      case 'labels':
        labelsStage(this.labels, this.markers, frame, world, this.view);
        return;
    }
  }
}
