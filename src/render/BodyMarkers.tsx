import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, Color, Points, type ShaderMaterial } from 'three';
import { getBody, type BodySystem } from '../sim/body';
import { useWorld } from '../store/useWorld';
import { bodyStyle } from './bodyStyle';
import { STAGE, useMapFrame, type MapFrame } from './mapFrame';
import { createMarkerMaterial } from './markerMaterial';
import { toOriginRelativeInto } from './precision';

interface Markers {
  points: Points<BufferGeometry, ShaderMaterial>;
  positions: Float32Array;
  sizes: Float32Array;
  markerPx: Float32Array;
}

function createMarkers(frame: MapFrame, system: BodySystem): Markers {
  const n = frame.order.length;
  const positions = new Float32Array(3 * n);
  const sizes = new Float32Array(n);
  const colors = new Float32Array(3 * n);
  const radii = new Float32Array(n);
  const markerPx = new Float32Array(n);
  frame.order.forEach((id, i) => {
    const body = getBody(system, id);
    const style = bodyStyle(body);
    const c = new Color(style.color);
    colors.set([c.r, c.g, c.b], 3 * i);
    radii[i] = body.radius;
    markerPx[i] = style.markerPx;
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('size', new BufferAttribute(sizes, 1));
  geometry.setAttribute('markerColor', new BufferAttribute(colors, 3));
  geometry.setAttribute('radius', new BufferAttribute(radii, 1));
  const points = new Points(geometry, createMarkerMaterial());
  points.frustumCulled = false;
  points.name = 'markers';
  return { points, positions, sizes, markerPx };
}

/** Layers stage: marker positions relative to the origin, and sizes (0 = hidden). */
function updateMarkers(m: Markers, frame: MapFrame, dpr: number): void {
  toOriginRelativeInto(m.positions, frame.world, frame.origin);
  for (let i = 0; i < frame.order.length; i++) {
    m.sizes[i] = frame.markerShown[i] ? m.markerPx[i]! * dpr : 0;
  }
  const { position, size } = m.points.geometry.attributes;
  if (position) position.needsUpdate = true;
  if (size) size.needsUpdate = true;
}

/** One THREE.Points for every body's marker (S2-7). */
export function BodyMarkers() {
  const frame = useMapFrame();
  const system = useWorld((s) => s.world.system);
  const markers = useMemo(() => createMarkers(frame, system), [frame, system]);
  useEffect(
    () => () => {
      markers.points.geometry.dispose();
      markers.points.material.dispose();
    },
    [markers],
  );

  useFrame((state) => updateMarkers(markers, frame, state.gl.getPixelRatio()), STAGE.layers);

  return <primitive object={markers.points} />;
}
