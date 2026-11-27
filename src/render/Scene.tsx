import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { useWorld } from '../store/useWorld';
import { Bodies } from './Bodies';
import { BodyMarkers } from './BodyMarkers';
import { CameraRig } from './camera/CameraRig';
import { FrameLoop } from './FrameLoop';
import { registerDebug } from './debugHandle';
import { createMapFrame, MapFrameContext } from './mapFrame';
import { OrbitLines } from './OrbitLines';
import { createLabelRegistry } from './overlays/labelLayout';
import { LabelOverlay, LabelStage } from './overlays/LabelOverlay';
import styles from './Scene.module.css';

/** Fixed clip planes, km, with a logarithmic depth buffer (S2-5). */
const NEAR = 1e-3;
const FAR = 1e12;

/**
 * The 3D map and its label overlay. Scene axes are ecliptic J2000 in km; the origin is the
 * camera focus (S2-4).
 */
export function Scene() {
  const system = useWorld((s) => s.world.system);
  const frame = useMemo(() => createMapFrame(system), [system]);
  const labels = useMemo(() => createLabelRegistry(frame), [frame]);
  useEffect(() => registerDebug('frame', frame), [frame]);

  return (
    <div className={styles['scene']}>
      <Canvas
        frameloop="always"
        gl={{ logarithmicDepthBuffer: true, antialias: true }}
        camera={{ fov: 50, near: NEAR, far: FAR, position: [0, -1, 0] }}
      >
        <color attach="background" args={['#05060a']} />
        <MapFrameContext.Provider value={frame}>
          <FrameLoop />
          <CameraRig />
          <Bodies />
          <OrbitLines />
          <BodyMarkers />
          <LabelStage registry={labels} />
        </MapFrameContext.Provider>
      </Canvas>
      <LabelOverlay registry={labels} order={frame.order} />
    </div>
  );
}
