import { Matrix4, Vector3, type PerspectiveCamera } from 'three';
import { vec3, type Vec3 } from '../../math/vec3';
import { meanOrbitNormal } from '../../orbital/propagate';
import { getBody } from '../../sim/body';
import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { frameWorldInto, type MapFrame } from '../mapFrame';
import { setFrameCamera } from '../projection';
import {
  beginRefocus,
  beginSnap,
  controllerOriginInto,
  controllerPose,
  createController,
  stepController,
  type CameraController,
} from './controller';
import { framingDistance, minDistance } from './framing';

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
 * `input/cameraInput.ts`.
 */
export class CameraStage {
  readonly controller: CameraController;
  private readonly matrix = new Matrix4();
  private readonly unsubscribe: () => void;
  private readonly focusWorld: (id: string, out: Vec3) => Vec3;

  private readonly camera: PerspectiveCamera;

  constructor(camera: PerspectiveCamera, frame: MapFrame) {
    this.camera = camera;
    const { system } = useWorld.getState().world;
    const id = useView.getState().focus.id;
    this.controller = createController(id, framingDistance(system, id), minDistance(system, id));
    this.focusWorld = (fid, out) => frameWorldInto(frame, frame.indexOf[fid] ?? 0, out);
    this.unsubscribe = useView.subscribe((s, prev) => {
      if (s.focusSeq !== prev.focusSeq) {
        const sys = useWorld.getState().world.system;
        const fid = s.focus.id;
        beginRefocus(this.controller, fid, framingDistance(sys, fid), minDistance(sys, fid));
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
