/**
 * The marker material (decision S2-7 in planning/sprint-2.md): round points of a per-point size
 * in px. Each point is pulled towards the camera by its body's radius, so a marker is never
 * hidden by its own sphere, but still by a nearer body. Includes three's logdepthbuf chunks, as
 * every custom shader must (S2-5).
 */

import { ShaderMaterial } from 'three';

const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float size;
attribute float radius;
attribute vec3 markerColor;
varying vec3 vColor;
void main() {
  vColor = markerColor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float d = length(mvPosition.xyz);
  mvPosition.xyz *= max(1.0 - 1.01 * radius / d, 0.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = size;
  #include <logdepthbuf_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  gl_FragColor = vec4(vColor, 1.0);
  #include <logdepthbuf_fragment>
  #include <colorspace_fragment>
}
`;

export function createMarkerMaterial(): ShaderMaterial {
  return new ShaderMaterial({ vertexShader, fragmentShader, depthWrite: false });
}
