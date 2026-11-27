import { useFrame } from '@react-three/fiber';
import { advanceClock } from '../sim/clock';
import { useWorld } from '../store/useWorld';
import { STAGE } from './mapFrame';

/** The per-frame sim stages. For now only the clock; step 3 adds body positions. */
export function FrameLoop() {
  useFrame((_, delta) => {
    advanceClock(useWorld.getState().world.clock, delta);
  }, STAGE.clock);
  return null;
}
