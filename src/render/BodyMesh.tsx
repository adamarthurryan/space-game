import type { Ref } from 'react';
import type { BufferGeometry, Mesh } from 'three';
import type { Body } from '../sim/body';
import { bodyStyle } from './bodyStyle';

interface Props {
  body: Body;
  geometry: BufferGeometry;
  ref: Ref<Mesh>;
}

/**
 * One body as a sphere of its true radius (S2-6). Its position is set every frame by the
 * bodies layer through the ref; the JSX only fixes what exists and how it looks.
 */
export function BodyMesh({ body, geometry, ref }: Props) {
  const { color } = bodyStyle(body);
  const isStar = body.class === 'star';
  return (
    <mesh ref={ref} geometry={geometry} scale={body.radius} name={body.id}>
      {isStar ? <meshBasicMaterial color={color} /> : <meshLambertMaterial color={color} />}
    </mesh>
  );
}
