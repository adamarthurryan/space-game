import { BufferAttribute, BufferGeometry, Color, Line, LineBasicMaterial } from 'three';
import type { Body, BodyId } from '../sim/body';
import { bodyStyle } from './bodyStyle';
import { ORBIT_SEGMENTS, type OrbitLineBuffers } from './orbitFade';

/** One orbit line: the three.js object, its buffers, and the float64 sample scratch. */
export interface OrbitLineEntry {
  bodyId: BodyId;
  parentId: BodyId;
  /** Apoapsis at t = 0, km: the orbit's size for the screen-size fade. */
  apoapsis: number;
  line: Line<BufferGeometry, LineBasicMaterial>;
  buffers: OrbitLineBuffers;
  sample: Float64Array;
  /** Linear RGB: normal, and brighter for the focused, selected or hovered body. */
  rgb: [number, number, number];
  highlightRgb: [number, number, number];
}

/** Builds the line object for a body with an orbit. Call `disposeOrbitLine` when done. */
export function createOrbitLine(body: Body): OrbitLineEntry {
  const orbit = body.orbit;
  if (!orbit || body.parentId === null) throw new Error(`${body.id} has no orbit`);
  const points = ORBIT_SEGMENTS + 1;
  const buffers = {
    positions: new Float32Array(3 * points),
    colors: new Float32Array(4 * points),
  };
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('color', new BufferAttribute(buffers.colors, 4));
  const material = new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  });
  const line = new Line(geometry, material);
  // Vertices are rewritten every frame relative to the origin, so the bounds are never valid.
  line.frustumCulled = false;
  line.name = `orbit:${body.id}`;

  const c = new Color(bodyStyle(body).color);
  const h = c.clone().lerp(new Color(1, 1, 1), 0.35);
  return {
    bodyId: body.id,
    parentId: body.parentId,
    apoapsis: orbit.a * (1 + orbit.e),
    line,
    buffers,
    sample: new Float64Array(3 * points),
    rgb: [c.r, c.g, c.b],
    highlightRgb: [h.r, h.g, h.b],
  };
}

export function disposeOrbitLine(e: OrbitLineEntry): void {
  e.line.geometry.dispose();
  e.line.material.dispose();
}
