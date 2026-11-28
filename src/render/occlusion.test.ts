import { describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../gen/scenario';
import { vec3 } from '../math/vec3';
import { createMapFrame } from './mapFrame';
import { occludedAt, sceneOccluded } from './occlusion';

/** A frame with Earth's disc of 100 px at the centre, 1e5 km from a camera looking down −z. */
function frame() {
  const { system } = createSandboxWorld();
  const f = createMapFrame(system);
  f.camera = { ...f.camera, position: vec3(0, 0, 1e5), width: 800, height: 600 };
  const e = f.indexOf['earth']!;
  f.screenX[e] = 400;
  f.screenY[e] = 300;
  f.depth[e] = 1e5;
  f.discPx[e] = 100;
  f.sphereShown[e] = 1;
  return { f, e };
}

describe('occlusion (S5b-14)', () => {
  it('a point behind a nearer disc is occluded; in front of it, or beside it, is not', () => {
    const { f, e } = frame();
    expect(occludedAt(f, 420, 300, 1.1e5)).toBe(true);
    expect(occludedAt(f, 420, 300, 0.9e5)).toBe(false);
    expect(occludedAt(f, 520, 300, 1.1e5)).toBe(false);
    expect(occludedAt(f, 420, 300, 1.1e5, e)).toBe(false);
  });

  it('a scene point is tested at its distance from the camera', () => {
    const { f } = frame();
    // Earth at the origin; 7000 km behind it, and 7000 km in front of it.
    expect(sceneOccluded(f, 0, 0, -7000)).toBe(true);
    expect(sceneOccluded(f, 0, 0, 7000)).toBe(false);
    // Behind the camera: not occluded.
    expect(sceneOccluded(f, 0, 0, 2e5)).toBe(false);
  });
});
