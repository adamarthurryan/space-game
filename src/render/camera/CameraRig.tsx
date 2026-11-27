import { useFrame } from '@react-three/fiber';
import { STAGE, frameWorldInto, useMapFrame } from '../mapFrame';

/** Placeholder framing until the controller arrives (sprint 2 step 4): Earth, from 1.2e6 km. */
const FOCUS_ID = 'earth';
const DISTANCE = 1.2e6;
const ELEVATION = 0.5; // rad above the ecliptic

/**
 * The camera stage (−2): sets the scene origin and the camera. For now the origin is Earth and
 * the camera sits at a fixed offset from it; step 4 replaces this with the camera controller.
 */
export function CameraRig() {
  const frame = useMapFrame();

  useFrame(({ camera }) => {
    const i = frame.indexOf[FOCUS_ID] ?? 0;
    frameWorldInto(frame, i, frame.origin);
    camera.up.set(0, 0, 1);
    camera.position.set(0, -DISTANCE * Math.cos(ELEVATION), DISTANCE * Math.sin(ELEVATION));
    camera.lookAt(0, 0, 0);
  }, STAGE.camera);

  return null;
}
