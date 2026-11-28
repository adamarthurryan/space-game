import { describe, expect, it } from 'vitest';
import { vec3 } from '../math/vec3';
import { localOrbitalBasis } from '../orbital/frames';
import type { FrameCamera } from './mapFrame';
import { MU_PLANET, syntheticSystem } from '../sim/testSystem';
import type { Segment } from '../sim/trajectory';
import {
  conicScreenSize,
  dragDelta,
  dragModeOf,
  GIZMO_ARM_PX,
  GIZMO_FULL_CONIC_PX,
  GIZMO_MIN_ARM_PX,
  GIZMO_MIN_CONIC_PX,
  gizmoArmPx,
  gizmoScale,
  handleDirection,
  handleEdit,
  screenAxis,
} from './nodeGizmoMath';
import { projectScenePoint } from './screenDash';
import { conicGeometry } from './trajectoryGeometry';

const sys = syntheticSystem(0.3);

const cam: FrameCamera = {
  position: vec3(0, 0, 10),
  forward: vec3(0, 0, -1),
  up: vec3(0, 1, 0),
  right: vec3(1, 0, 0),
  fovRad: Math.PI / 3,
  width: 800,
  height: 600,
  pixelRatio: 1,
};
const dv = { prograde: 1, normal: 0.5, radial: 0 };

describe('dragDelta', () => {
  it('is cubic: 10 px ≈ 0.1 m/s, 100 px = 100 m/s, 300 px = 2.7 km/s', () => {
    expect(dragDelta(10)).toBeCloseTo(1e-4, 15);
    expect(dragDelta(100)).toBeCloseTo(0.1, 15);
    expect(dragDelta(-100)).toBeCloseTo(-0.1, 15);
    expect(dragDelta(300)).toBeCloseTo(2.7, 12);
    expect(dragDelta(0)).toBe(0);
  });

  it('is monotonic and odd, with fine and coarse modes', () => {
    for (let d = -400; d < 400; d += 7) {
      expect(dragDelta(d + 1)).toBeGreaterThan(dragDelta(d));
      expect(dragDelta(-d)).toBeCloseTo(-dragDelta(d), 15);
    }
    expect(dragDelta(100, 'fine')).toBeCloseTo(0.01, 15);
    expect(dragDelta(100, 'coarse')).toBeCloseTo(1, 15);
    expect(dragModeOf({ shiftKey: true, altKey: false })).toBe('fine');
    expect(dragModeOf({ shiftKey: false, altKey: true })).toBe('coarse');
    expect(dragModeOf({ shiftKey: false, altKey: false })).toBe('normal');
  });
});

describe('handleEdit and handleDirection', () => {
  it('adds along the handle’s sign', () => {
    expect(handleEdit('prograde', dv, 0.2).prograde).toBeCloseTo(1.2, 15);
    expect(handleEdit('retrograde', dv, 0.2).prograde).toBeCloseTo(0.8, 15);
    expect(handleEdit('anti-normal', dv, 0.5).normal).toBe(0);
    expect(handleEdit('radial-in', dv, 0.1)).toEqual({ prograde: 1, normal: 0.5, radial: -0.1 });
  });

  it('points each handle along the basis', () => {
    const b = localOrbitalBasis({ r: vec3(7000, 0, 0), v: vec3(0, 7.5, 0) }, vec3(0, 0, 1));
    const out = vec3(0, 0, 0);
    expect(handleDirection(b, 'prograde', out)).toEqual(vec3(0, 1, 0));
    expect(handleDirection(b, 'anti-normal', out)).toEqual(vec3(-0, -0, -1));
    expect(handleDirection(b, 'radial-out', out).x).toBeCloseTo(1, 15);
  });
});

describe('gizmoScale', () => {
  it('spans the arm length in px at any depth', () => {
    for (const depth of [1, 1e3, 1e8]) {
      const s = gizmoScale(depth, cam);
      const p = { x: 0, y: 0, depth: 0 };
      const q = { x: 0, y: 0, depth: 0 };
      projectScenePoint(cam, 0, 0, 10 - depth, p);
      projectScenePoint(cam, 0, s, 10 - depth, q);
      expect(p.y - q.y).toBeCloseTo(GIZMO_ARM_PX, 6);
    }
  });
});

describe('screenAxis', () => {
  it('projects an axis to a unit screen direction, y down', () => {
    const up = screenAxis(cam, vec3(0, 0, 0), vec3(0, 1, 0))!;
    expect(up.x).toBeCloseTo(0, 9);
    expect(up.y).toBeCloseTo(-1, 9);
    const right = screenAxis(cam, vec3(0, 0, 0), vec3(1, 0, 0))!;
    expect(right.x).toBeCloseTo(1, 9);
  });

  it('is null for an axis pointing at the camera, or a node behind it', () => {
    expect(screenAxis(cam, vec3(0, 0, 0), vec3(0, 0, 1))).toBeNull();
    expect(screenAxis(cam, vec3(0, 0, 20), vec3(1, 0, 0))).toBeNull();
  });
});

describe('conicScreenSize (S5b-15)', () => {
  // Looking straight down at the XY plane from 3e4 km: 600 px span 2·3e4·tan 30° km.
  const far: FrameCamera = { ...cam, position: vec3(0, 0, 3e4) };
  const kmPerPx = (2 * 3e4 * Math.tan(Math.PI / 6)) / 600;
  const id = (p: { x: number; y: number; z: number }) => p;
  const seg = (v: number): Segment => ({
    kind: 'conic',
    parentId: 'planet',
    r0: vec3(7000, 0, 0),
    v0: vec3(0, v, 0),
    tStart: 0,
    tEnd: 3e4,
    endEvent: 'horizon',
  });

  it("is an ellipse's projected major axis, seen face on", () => {
    // Circular at 7000 km: 14,000 km across.
    const g = conicGeometry(sys, seg(Math.sqrt(MU_PLANET / 7000)));
    const px = conicScreenSize(far, g, 0, 1, id);
    expect(px).toBeCloseTo(14_000 / kmPerPx, 0);
    expect(px).toBeGreaterThan(GIZMO_MIN_CONIC_PX);
  });

  it('keeps the minor axis when the major axis points at the camera', () => {
    const g = conicGeometry(sys, seg(Math.sqrt(MU_PLANET / 7000) * 1.2));
    // Rotate the plane so the major axis (along x) points down the view axis.
    const edge = (p: { x: number; y: number; z: number }) => vec3(0, p.y, p.x);
    expect(conicScreenSize(far, g, 0, 1, edge)).toBeGreaterThan(0);
  });

  it("is an open conic's drawn piece's extent, and Infinity behind the camera", () => {
    const g = conicGeometry(sys, seg(Math.sqrt((2.5 * MU_PLANET) / 7000)));
    const px = conicScreenSize(far, g, 0, 3e4, id);
    expect(px).toBeGreaterThan(0);
    expect(px).toBeLessThan(conicScreenSize(far, g, 0, 6e4, id));
    const near: FrameCamera = { ...cam, position: vec3(0, 0, 10) };
    expect(conicScreenSize(near, g, 0, 3e4, (p) => vec3(p.x, p.y, p.z + 20))).toBe(Infinity);
  });
});

describe('gizmoArmPx (decision 181)', () => {
  it('is full size at 150 px, shrinks linearly to 20 px at 37.5 px, and hides below', () => {
    expect(GIZMO_FULL_CONIC_PX).toBe(150);
    expect(GIZMO_MIN_CONIC_PX).toBe(37.5);
    expect(gizmoArmPx(1000)).toBe(GIZMO_ARM_PX);
    expect(gizmoArmPx(150)).toBe(GIZMO_ARM_PX);
    expect(gizmoArmPx(37.5)).toBe(GIZMO_MIN_ARM_PX);
    expect(gizmoArmPx((150 + 37.5) / 2)).toBeCloseTo((60 + 20) / 2, 12);
    expect(gizmoArmPx(37.4)).toBeNull();
    expect(gizmoArmPx(Infinity)).toBe(GIZMO_ARM_PX);
    expect(gizmoArmPx(NaN)).toBeNull();
  });
});
