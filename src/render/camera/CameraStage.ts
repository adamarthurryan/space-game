import { Matrix4, Vector3, type PerspectiveCamera } from 'three';
import { cross, normalize, vec3, type Vec3 } from '../../math/vec3';
import { meanOrbitNormal } from '../../orbital/propagate';
import { getBody } from '../../sim/body';
import { shipPointAt, type World } from '../../sim/world';
import { mapSelection, focusRefOf, useView, type FocusRef } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { mapObjectWorldInto, type MapFrame } from '../mapFrame';
import { viewTime } from '../previewTime';
import { projectPoint, setFrameCamera } from '../projection';
import {
  beginRefocus,
  beginSnap,
  controllerOriginInto,
  controllerPose,
  createController,
  START_PITCH,
  stepController,
  type CameraController,
} from './controller';
import { framingDistanceOf, minDistanceOf } from './framing';

/**
 * The orbit pole of a body or ship at t (now, or the preview time): a body's mean orbit normal,
 * or a ship's r × v on its trajectory (S3-15, S5-10). Null for the root, or a ship not drawn at t.
 */
export function orbitPoleOf(world: World, ref: FocusRef, t: number): Vec3 | null {
  const { system } = world;
  if (ref.kind === 'body') {
    const orbit = system.bodies[ref.id] ? getBody(system, ref.id).orbit : undefined;
    return orbit ? meanOrbitNormal(orbit, t) : null;
  }
  const point = shipPointAt(world, ref.id, t);
  if (!point) return null;
  const s = point.state;
  return normalize(cross(s.r, s.v));
}

/** The time the map is drawn at: the preview's, or now (S5-10). */
function currentViewTime(): number {
  return viewTime(useWorld.getState().world.clock.t, useView.getState().preview);
}

/** The pole for a snap request, or null if the request can't be met. */
function snapPole(plane: 'ecliptic' | 'selected-orbit'): Vec3 | null {
  if (plane === 'ecliptic') return vec3(0, 0, 1);
  const selected = mapSelection(useView.getState().selected);
  // Evaluated once, at the time of the snap, then kept fixed (S2-12).
  return selected
    ? orbitPoleOf(useWorld.getState().world, focusRefOf(selected), currentViewTime())
    : null;
}

const scratchWorld = vec3(0, 0, 0);
const scratchScreen = { x: 0, y: 0, depth: 0 };

/**
 * Whether a body's or ship's centre projects inside the map's viewport, in front of the camera,
 * in the last frame drawn (S5b-5).
 */
export function onScreen(frame: MapFrame, world: World, ref: FocusRef): boolean {
  mapObjectWorldInto(frame, world, ref, scratchWorld);
  projectPoint(frame, scratchWorld.x, scratchWorld.y, scratchWorld.z, scratchScreen);
  const { x, y, depth } = scratchScreen;
  return (
    depth < Infinity && x >= 0 && x <= frame.camera.width && y >= 0 && y <= frame.camera.height
  );
}

const right = new Vector3();
const up = new Vector3();
const back = new Vector3();

/** Applies the controller's pose to a three.js camera, through a basis (no lookAt). */
function applyPose(
  pose: ReturnType<typeof controllerPose>,
  camera: PerspectiveCamera,
  m: Matrix4,
): void {
  const { offset, forward: f, up: u } = pose;
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
 * The camera stage. Owns the controller, reacts to focus and snap requests from the view
 * store, and each frame steps it, writes the scene origin into the MapFrame and sets the
 * three.js camera from its pose. Wheel and drag input reach the controller through
 * `input/cameraInput.ts`. The focus may be a body or a ship (S3-15).
 *
 * It starts at the focus's framing, looking straight down on the ecliptic (S5b-10). A new focus
 * that is on screen moves only the centre, keeping the distance and orientation; one off screen
 * is framed (S5b-5).
 */
export class CameraStage {
  readonly controller: CameraController;
  private readonly matrix = new Matrix4();
  private readonly unsubscribe: () => void;
  private readonly focusWorld: (ref: FocusRef, out: Vec3) => Vec3;
  private readonly camera: PerspectiveCamera;

  constructor(camera: PerspectiveCamera, frame: MapFrame) {
    this.camera = camera;
    const world = useWorld.getState().world;
    const focus = useView.getState().focus;
    const t = currentViewTime();
    this.controller = createController(
      focus,
      framingDistanceOf(world, focus, t),
      minDistanceOf(world, focus, t),
      START_PITCH,
    );
    this.focusWorld = (ref, out) => mapObjectWorldInto(frame, useWorld.getState().world, ref, out);
    this.unsubscribe = useView.subscribe((s, prev) => {
      if (s.focusSeq !== prev.focusSeq) {
        const w = useWorld.getState().world;
        const t = currentViewTime();
        const distance = onScreen(frame, w, s.focus)
          ? 10 ** this.controller.target.logDistance
          : framingDistanceOf(w, s.focus, t);
        beginRefocus(this.controller, s.focus, distance, minDistanceOf(w, s.focus, t));
      }
      if (s.snapRequest && s.snapRequest.seq !== prev.snapRequest?.seq) {
        const pole = snapPole(s.snapRequest.plane);
        if (pole) beginSnap(this.controller, pole);
      }
    });
  }

  update(frame: MapFrame, dtWall: number, width: number, height: number, dpr: number): void {
    stepController(this.controller, dtWall);
    controllerOriginInto(this.controller, this.focusWorld, frame.origin);
    const pose = controllerPose(this.controller);
    applyPose(pose, this.camera, this.matrix);
    setFrameCamera(frame, pose, (this.camera.fov * Math.PI) / 180, width, height);
    frame.camera.pixelRatio = dpr;
  }

  dispose(): void {
    this.unsubscribe();
  }
}
