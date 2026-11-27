import { describe, expect, it } from 'vitest';
import { vec3 } from '../math/vec3';
import type { FrameCamera } from './mapFrame';
import { projectScenePoint, projectVerticesInto, screenLineDistances } from './screenDash';

/** Looking down −z from (0, 0, 10), 90° vertical field of view, 200 × 100 px. */
const cam: FrameCamera = {
  position: vec3(0, 0, 10),
  forward: vec3(0, 0, -1),
  up: vec3(0, 1, 0),
  right: vec3(1, 0, 0),
  fovRad: Math.PI / 2,
  width: 200,
  height: 100,
  pixelRatio: 1,
};

describe('projectScenePoint', () => {
  it('puts the view axis at the centre and scales by depth', () => {
    const p = projectScenePoint(cam, 0, 0, 0, { x: 0, y: 0, depth: 0 });
    expect([p.x, p.y, p.depth]).toEqual([100, 50, 10]);
    // tan(45°) = 1: y = 10 at depth 10 is the top edge.
    expect(projectScenePoint(cam, 0, 10, 0, p).y).toBeCloseTo(0, 9);
    expect(projectScenePoint(cam, 20, 0, 0, p).x).toBeCloseTo(200, 9);
  });

  it('marks points behind the camera', () => {
    const p = projectScenePoint(cam, 0, 0, 20, { x: 0, y: 0, depth: 0 });
    expect(p.depth).toBeLessThan(0);
    expect(p.x).toBeNaN();
  });
});

describe('screenLineDistances', () => {
  it('accumulates projected lengths in px', () => {
    const pos = new Float32Array([0, 0, 0, 10, 0, 0, 10, 5, 0]);
    const screen = new Float32Array(6);
    projectVerticesInto(cam, pos, 3, screen);
    const d = new Float32Array(3);
    screenLineDistances(screen, 3, d);
    expect(Array.from(d)).toEqual([0, 50, 75]);
  });

  it('adds nothing across a vertex behind the camera', () => {
    const screen = new Float32Array([0, 0, NaN, NaN, 10, 0, 20, 0]);
    const d = new Float32Array(4);
    screenLineDistances(screen, 4, d);
    expect(Array.from(d)).toEqual([0, 0, 0, 10]);
  });
});
