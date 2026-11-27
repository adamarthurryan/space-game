import { useFrame } from '@react-three/fiber';
import { advanceClock } from '../sim/clock';
import { useWorld } from '../store/useWorld';
import { STAGE, updateFrameBodies, useMapFrame } from './mapFrame';
import { projectFrame } from './projection';
import { useMapPointer } from './useMapPointer';

/**
 * The sim and projection stages: the clock, every body's world position at the new t, and,
 * after the camera stage, the projection of every body (S2-16). Also owns map pointer input.
 */
export function FrameLoop() {
  const frame = useMapFrame();

  useFrame((_, delta) => {
    advanceClock(useWorld.getState().world.clock, delta);
  }, STAGE.clock);

  useFrame(() => {
    const world = useWorld.getState().world;
    updateFrameBodies(frame, world.system, world.clock.t);
  }, STAGE.bodies);

  useFrame(() => {
    projectFrame(frame, useWorld.getState().world.system);
  }, STAGE.projection);

  useMapPointer(frame);

  return null;
}
