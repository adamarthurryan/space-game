import { useFrame } from '@react-three/fiber';
import { advanceClock } from '../sim/clock';
import { useWorld } from '../store/useWorld';
import { STAGE, updateFrameBodies, useMapFrame } from './mapFrame';

/** The sim stages: the clock (−4), then every body's world position at the new t (−3). */
export function FrameLoop() {
  const frame = useMapFrame();

  useFrame((_, delta) => {
    advanceClock(useWorld.getState().world.clock, delta);
  }, STAGE.clock);

  useFrame(() => {
    const world = useWorld.getState().world;
    updateFrameBodies(frame, world.system, world.clock.t);
  }, STAGE.bodies);

  return null;
}
