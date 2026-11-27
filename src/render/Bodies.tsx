import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { SphereGeometry, type Mesh, type PointLight } from 'three';
import { getBody } from '../sim/body';
import { useWorld } from '../store/useWorld';
import { BodyMesh } from './BodyMesh';
import { STAGE, useMapFrame } from './mapFrame';
import { setObjectPositionAt } from './precision';

/** Light from the Sun, with no distance decay (S2-6). */
const SUN_INTENSITY = 3;
/** A faint ambient, so night sides are visible. */
const AMBIENT_INTENSITY = 0.12;

/**
 * The body layer: one sphere per body and the Sun's light, positioned relative to the scene
 * origin in one `useFrame` (layers stage). A sphere under 0.5 px is hidden (S2-7).
 */
export function Bodies() {
  const frame = useMapFrame();
  const system = useWorld((s) => s.world.system);
  const geometry = useMemo(() => new SphereGeometry(1, 48, 24), []);
  const meshes = useRef<(Mesh | null)[]>([]);
  const light = useRef<PointLight>(null);
  const sunIndex = frame.indexOf[system.rootId] ?? 0;

  useFrame(() => {
    const { world, origin, order } = frame;
    for (let i = 0; i < order.length; i++) {
      const mesh = meshes.current[i];
      if (!mesh) continue;
      mesh.visible = frame.sphereShown[i] === 1;
      if (mesh.visible) setObjectPositionAt(mesh, world, i, origin);
    }
    if (light.current) setObjectPositionAt(light.current, world, sunIndex, origin);
  }, STAGE.layers);

  return (
    <>
      <ambientLight intensity={AMBIENT_INTENSITY} />
      <pointLight ref={light} intensity={SUN_INTENSITY} decay={0} />
      {frame.order.map((id, i) => (
        <BodyMesh
          key={id}
          body={getBody(system, id)}
          geometry={geometry}
          ref={(m) => {
            meshes.current[i] = m;
          }}
        />
      ))}
    </>
  );
}
