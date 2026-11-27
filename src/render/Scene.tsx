import { Canvas } from '@react-three/fiber';

/** The 3D map: an empty scene for now. Camera and depth settings are decided in sprint 2. */
export function Scene() {
  return (
    <Canvas frameloop="always" camera={{ position: [0, 0, 10], fov: 50 }}>
      <color attach="background" args={['#05060a']} />
    </Canvas>
  );
}
