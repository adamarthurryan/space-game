import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import type { PerspectiveCamera } from 'three';
import { vec3, type Vec3 } from '../math/vec3';
import { sampleMeanOrbitInto } from '../orbital/sample';
import { getBody, type BodySystem } from '../sim/body';
import { useView } from '../store/useView';
import { useWorld } from '../store/useWorld';
import { frameWorldInto, STAGE, useMapFrame, type MapFrame } from './mapFrame';
import { OrbitLine } from './OrbitLine';
import { createOrbitLine, disposeOrbitLine, type OrbitLineEntry } from './orbitLineObject';
import {
  BASE_ALPHA,
  HIGHLIGHT_ALPHA,
  ORBIT_SEGMENTS,
  projectedDiameterPx,
  screenFade,
  writeOrbitLine,
} from './orbitFade';

const parentWorld = vec3(0, 0, 0);
const camera = vec3(0, 0, 0);

interface FrameView {
  camera: Vec3;
  cameraDistance: number;
  viewportHeight: number;
  fovRad: number;
  /** The focused, selected and hovered bodies (null if none). */
  focusId: string;
  selectedId: string | null;
  hoveredId: string | null;
}

/** Stage −1 for one line: resample at t, fade, and write the buffers. */
function updateOrbitLine(e: OrbitLineEntry, system: BodySystem, frame: MapFrame, v: FrameView) {
  const orbit = getBody(system, e.bodyId).orbit;
  if (!orbit) return;
  frameWorldInto(frame, frame.indexOf[e.parentId] ?? 0, parentWorld);
  const px = parentWorld.x - frame.origin.x - v.camera.x;
  const py = parentWorld.y - frame.origin.y - v.camera.y;
  const pz = parentWorld.z - frame.origin.z - v.camera.z;
  const diameter = projectedDiameterPx(
    e.apoapsis,
    Math.hypot(px, py, pz),
    v.viewportHeight,
    v.fovRad,
  );
  const id = e.bodyId;
  const highlighted = id === v.focusId || id === v.selectedId || id === v.hoveredId;
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
    v.camera,
    v.cameraDistance,
    highlighted ? e.highlightRgb : e.rgb,
    alpha,
    !highlighted,
  );
  const { position, color } = e.line.geometry.attributes;
  if (position) position.needsUpdate = true;
  if (color) color.needsUpdate = true;
}

/**
 * The orbit layer (S2-8, S2-9): every body's orbit around its parent, resampled from its mean
 * elements at the current t every frame, in one `useFrame` (stage −1).
 */
export function OrbitLines() {
  const frame = useMapFrame();
  const system = useWorld((s) => s.world.system);
  const entries = useMemo(
    () =>
      frame.order
        .map((id) => getBody(system, id))
        .filter((b) => b.orbit && b.parentId !== null)
        .map(createOrbitLine),
    [frame, system],
  );
  useEffect(() => () => entries.forEach(disposeOrbitLine), [entries]);

  useFrame((state) => {
    const { focus, selected, hovered } = useView.getState();
    const cam = state.camera as PerspectiveCamera;
    camera.x = cam.position.x;
    camera.y = cam.position.y;
    camera.z = cam.position.z;
    const view: FrameView = {
      camera,
      cameraDistance: Math.hypot(camera.x, camera.y, camera.z),
      viewportHeight: state.size.height,
      fovRad: (cam.fov * Math.PI) / 180,
      focusId: focus.id,
      selectedId: selected?.id ?? null,
      hoveredId: hovered?.id ?? null,
    };
    for (const e of entries) updateOrbitLine(e, system, frame, view);
  }, STAGE.layers);

  return (
    <>
      {entries.map((e) => (
        <OrbitLine key={e.bodyId} entry={e} />
      ))}
    </>
  );
}
