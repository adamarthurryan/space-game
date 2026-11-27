import type { Scene } from 'three';
import { vec3 } from '../../math/vec3';
import { sampleMeanOrbitInto } from '../../orbital/sample';
import { getBody, type BodySystem } from '../../sim/body';
import { frameWorldInto, type MapFrame } from '../mapFrame';
import {
  BASE_ALPHA,
  HIGHLIGHT_ALPHA,
  ORBIT_SEGMENTS,
  projectedDiameterPx,
  screenFade,
  writeOrbitLine,
} from '../orbitFade';
import { createOrbitLine, disposeOrbitLine, type OrbitLineEntry } from '../orbitLineObject';
import type { MapLayer, ViewSnapshot } from '../stages';

const parentWorld = vec3(0, 0, 0);

/**
 * The orbit layer (S2-8, S2-9): every body's orbit around its parent, resampled from its mean
 * elements at the current t every frame, and faded by its size on screen.
 */
export class OrbitLayer implements MapLayer {
  private readonly entries: OrbitLineEntry[];

  private readonly scene: Scene;
  private readonly system: BodySystem;

  constructor(scene: Scene, frame: MapFrame, system: BodySystem) {
    this.scene = scene;
    this.system = system;
    this.entries = frame.order
      .map((id) => getBody(system, id))
      .filter((b) => b.orbit && b.parentId !== null)
      .map(createOrbitLine);
    for (const e of this.entries) scene.add(e.line);
  }

  update(frame: MapFrame, view: ViewSnapshot): void {
    for (const e of this.entries) this.updateLine(e, frame, view);
  }

  private updateLine(e: OrbitLineEntry, frame: MapFrame, view: ViewSnapshot): void {
    const orbit = getBody(this.system, e.bodyId).orbit;
    if (!orbit) return;
    const cam = frame.camera;
    frameWorldInto(frame, frame.indexOf[e.parentId] ?? 0, parentWorld);
    const px = parentWorld.x - frame.origin.x - cam.position.x;
    const py = parentWorld.y - frame.origin.y - cam.position.y;
    const pz = parentWorld.z - frame.origin.z - cam.position.z;
    const diameter = projectedDiameterPx(
      e.apoapsis,
      Math.hypot(px, py, pz),
      cam.height,
      cam.fovRad,
    );
    const id = e.bodyId;
    const highlighted =
      isBody(view.focus, id) || isBody(view.selected, id) || isBody(view.hovered, id);
    const alpha = (highlighted ? HIGHLIGHT_ALPHA : BASE_ALPHA) * screenFade(diameter);
    e.line.visible = alpha > 0;
    if (!e.line.visible) return;

    sampleMeanOrbitInto(orbit, frame.t, ORBIT_SEGMENTS, e.sample);
    writeOrbitLine(
      e.buffers,
      e.sample,
      ORBIT_SEGMENTS,
      parentWorld,
      frame.origin,
      cam.position,
      Math.hypot(cam.position.x, cam.position.y, cam.position.z),
      highlighted ? e.highlightRgb : e.rgb,
      alpha,
      !highlighted,
    );
    const { position, color } = e.line.geometry.attributes;
    if (position) position.needsUpdate = true;
    if (color) color.needsUpdate = true;
  }

  dispose(): void {
    for (const e of this.entries) {
      this.scene.remove(e.line);
      disposeOrbitLine(e);
    }
  }
}

function isBody(ref: { kind: string; id: string } | null, id: string): boolean {
  return ref !== null && ref.kind === 'body' && ref.id === id;
}
