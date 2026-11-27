import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { Matrix4, Vector3 } from 'three';
import { vec3, type Vec3 } from '../../math/vec3';
import { meanOrbitNormal } from '../../orbital/propagate';
import { getBody } from '../../sim/body';
import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { STAGE, frameWorldInto, useMapFrame, type MapFrame } from '../mapFrame';
import {
  beginRefocus,
  beginSnap,
  controllerOriginInto,
  controllerPose,
  createController,
  DRAG_THRESHOLD_PX,
  orbitBy,
  stepController,
  wheelNotches,
  zoomBy,
  type CameraController,
} from './controller';
import { framingDistance, minDistance } from './framing';

function focusWorldOf(frame: MapFrame) {
  return (id: string, out: Vec3): Vec3 => frameWorldInto(frame, frame.indexOf[id] ?? 0, out);
}

/** The pole for a snap request, or null if the request can't be met. */
function snapPole(plane: 'ecliptic' | 'selected-orbit'): Vec3 | null {
  if (plane === 'ecliptic') return vec3(0, 0, 1);
  const selected = useView.getState().selected;
  if (!selected) return null;
  const { system, clock } = useWorld.getState().world;
  const orbit = getBody(system, selected.id).orbit;
  // Evaluated once, at the time of the snap, then kept fixed (S2-12).
  return orbit ? meanOrbitNormal(orbit, clock.t) : null;
}

const right = new Vector3();
const up = new Vector3();
const back = new Vector3();

/** Applies the controller's pose to a three.js camera, through a basis (no lookAt). */
function applyPose(
  c: CameraController,
  camera: {
    position: Vector3;
    up: Vector3;
    quaternion: { setFromRotationMatrix(m: Matrix4): unknown };
  },
  m: Matrix4,
): void {
  const { offset, forward: f, up: u } = controllerPose(c);
  // Right = forward × up. three's camera looks down its −z, with +y up and +x right.
  right.set(f.y * u.z - f.z * u.y, f.z * u.x - f.x * u.z, f.x * u.y - f.y * u.x);
  up.set(u.x, u.y, u.z);
  back.set(-f.x, -f.y, -f.z);
  m.makeBasis(right, up, back);
  camera.quaternion.setFromRotationMatrix(m);
  camera.up.set(u.x, u.y, u.z);
  camera.position.set(offset.x, offset.y, offset.z);
}

/**
 * The camera stage (−2). Owns the controller, feeds it wheel and drag input from the canvas,
 * reacts to focus and snap requests from the view store, and each frame steps it, writes the
 * scene origin into the MapFrame and sets the three.js camera from its pose.
 */
export function CameraRig() {
  const frame = useMapFrame();
  const gl = useThree((s) => s.gl);
  const [controller] = useState(() => {
    const { system } = useWorld.getState().world;
    const id = useView.getState().focus.id;
    return createController(id, framingDistance(system, id), minDistance(system, id));
  });
  const [matrix] = useState(() => new Matrix4());

  // Wheel and drag on the canvas.
  useEffect(() => {
    const el = gl.domElement;
    let press: { id: number; x: number; y: number; dragging: boolean } | null = null;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(controller, wheelNotches(e));
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || press) return;
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false };
    };
    const onMove = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      const dx = e.clientX - press.x;
      const dy = e.clientY - press.y;
      if (!press.dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        press.dragging = true;
        el.setPointerCapture(e.pointerId);
      }
      orbitBy(controller, dx, dy);
      press.x = e.clientX;
      press.y = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      press = null;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [gl, controller]);

  // Focus and snap requests.
  useEffect(
    () =>
      useView.subscribe((s, prev) => {
        if (s.focusSeq !== prev.focusSeq) {
          const { system } = useWorld.getState().world;
          const id = s.focus.id;
          beginRefocus(controller, id, framingDistance(system, id), minDistance(system, id));
        }
        if (s.snapRequest && s.snapRequest.seq !== prev.snapRequest?.seq) {
          const pole = snapPole(s.snapRequest.plane);
          if (pole) beginSnap(controller, pole);
        }
      }),
    [controller],
  );

  useFrame(({ camera }, delta) => {
    stepController(controller, delta);
    controllerOriginInto(controller, focusWorldOf(frame), frame.origin);
    applyPose(controller, camera, matrix);
  }, STAGE.camera);

  return null;
}
