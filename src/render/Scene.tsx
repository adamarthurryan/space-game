import { Canvas } from '@react-three/fiber';
import { FrameLoop } from './FrameLoop';

/** The 3D map. The clock runs; bodies, camera and depth settings follow in sprint 2. */
export function Scene() {
  return (
    <Canvas frameloop="always" camera={{ position: [0, 0, 10], fov: 50 }}>
      <color attach="background" args={['#05060a']} />
      <FrameLoop />
    </Canvas>
  );
}
