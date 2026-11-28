/**
 * The trajectory line material (decision S4-11 in planning/sprint-4.md): one colour and
 * opacity, and optional dashes of DASH_PX on and GAP_PX off in screen space, from a per-vertex
 * `lineDistance` attribute in px written each frame on the CPU. Includes three's logdepthbuf
 * chunks (S2-5), and tone mapping and colour space, as LineBasicMaterial had.
 */

import { Color, ShaderMaterial } from 'three';

export const DASH_PX = 8;
export const GAP_PX = 6;

const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float lineDistance;
varying float vDistance;
void main() {
  vDistance = lineDistance;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 color;
uniform float opacity;
uniform float dashed;
uniform float dashSize;
uniform float totalSize;
varying float vDistance;
void main() {
  #include <logdepthbuf_fragment>
  if (dashed > 0.5 && mod(vDistance, totalSize) > dashSize) discard;
  gl_FragColor = vec4(color, opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface TrajectoryMaterial extends ShaderMaterial {
  uniforms: {
    color: { value: Color };
    opacity: { value: number };
    dashed: { value: number };
    dashSize: { value: number };
    totalSize: { value: number };
  };
}

export function createTrajectoryMaterial(): TrajectoryMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    uniforms: {
      color: { value: new Color() },
      opacity: { value: 1 },
      dashed: { value: 0 },
      dashSize: { value: DASH_PX },
      totalSize: { value: DASH_PX + GAP_PX },
    },
  }) as TrajectoryMaterial;
}
