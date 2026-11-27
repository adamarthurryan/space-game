import { describe, expect, it } from 'vitest';
import {
  add,
  addInto,
  addScaled,
  addScaledInto,
  angleBetween,
  clone,
  cross,
  distance,
  dot,
  equalsApprox,
  lerp,
  negate,
  norm,
  normalize,
  normSq,
  rotateX,
  rotateZ,
  scale,
  scaleInto,
  sub,
  subInto,
  vec3,
  X_AXIS,
  Y_AXIS,
  Z_AXIS,
  ZERO,
  type Vec3,
} from './vec3';

const EPS = 1e-15;
const a = vec3(1.5, -2.25, 3);
const b = vec3(-0.5, 4, 7.125);

describe('vec3 identities', () => {
  it('add and sub are inverses', () => {
    expect(sub(add(a, b), b)).toEqual(a);
    expect(add(sub(a, b), b)).toEqual(a);
  });

  it('cross(X, Y) = Z, cyclically, and cross is anticommutative', () => {
    expect(cross(X_AXIS, Y_AXIS)).toEqual(Z_AXIS);
    expect(cross(Y_AXIS, Z_AXIS)).toEqual(X_AXIS);
    expect(cross(Z_AXIS, X_AXIS)).toEqual(Y_AXIS);
    expect(cross(a, b)).toEqual(negate(cross(b, a)));
  });

  it('dot of perpendicular vectors is 0', () => {
    expect(dot(X_AXIS, Y_AXIS)).toBe(0);
    expect(dot(a, cross(a, b))).toBeCloseTo(0, 12);
  });

  it('norm, normSq and distance agree', () => {
    expect(norm(vec3(3, 4, 12))).toBe(13);
    expect(normSq(vec3(3, 4, 12))).toBe(169);
    expect(distance(a, b)).toBeCloseTo(norm(sub(a, b)), 14);
  });

  it('normalize gives a unit vector, and the zero vector stays zero', () => {
    expect(norm(normalize(a))).toBeCloseTo(1, 15);
    expect(normalize(ZERO)).toEqual(ZERO);
  });

  it('scale, addScaled, negate and lerp', () => {
    expect(scale(a, 2)).toEqual(add(a, a));
    expect(addScaled(a, b, 2)).toEqual(add(a, scale(b, 2)));
    expect(add(a, negate(a))).toEqual(ZERO);
    expect(lerp(a, b, 0)).toEqual(a);
    expect(lerp(a, b, 1)).toEqual(b);
    expect(lerp(a, b, 0.5)).toEqual(scale(add(a, b), 0.5));
  });

  it('equalsApprox uses the largest component difference', () => {
    expect(equalsApprox(vec3(1, 2, 3), vec3(1, 2, 3.1), 0.11)).toBe(true);
    expect(equalsApprox(vec3(1, 2, 3), vec3(1, 2, 3.1), 0.09)).toBe(false);
  });
});

describe('rotations', () => {
  it('rotateZ(X, π/2) = Y and rotateX(Y, π/2) = Z', () => {
    expect(equalsApprox(rotateZ(X_AXIS, Math.PI / 2), Y_AXIS, EPS)).toBe(true);
    expect(equalsApprox(rotateX(Y_AXIS, Math.PI / 2), Z_AXIS, EPS)).toBe(true);
  });

  it('leave the rotation axis unchanged', () => {
    expect(rotateZ(Z_AXIS, 1.234)).toEqual(Z_AXIS);
    expect(rotateX(X_AXIS, 1.234)).toEqual(X_AXIS);
  });

  it('preserve the norm', () => {
    for (const angle of [0.1, 1, 2.5, -4, 100]) {
      expect(norm(rotateZ(a, angle))).toBeCloseTo(norm(a), 13);
      expect(norm(rotateX(a, angle))).toBeCloseTo(norm(a), 13);
    }
  });
});

describe('angleBetween', () => {
  it('gives exact simple angles', () => {
    expect(angleBetween(X_AXIS, Y_AXIS)).toBeCloseTo(Math.PI / 2, 15);
    expect(angleBetween(X_AXIS, X_AXIS)).toBe(0);
    expect(angleBetween(X_AXIS, negate(X_AXIS))).toBeCloseTo(Math.PI, 15);
  });

  it('is accurate for nearly parallel vectors, where the acos form fails', () => {
    const u = vec3(1, 0, 0);
    const v = vec3(1, 1e-9, 0);
    const acosForm = Math.acos(dot(u, v) / (norm(u) * norm(v)));
    expect(acosForm).toBe(0); // the naive form loses the angle entirely
    expect(angleBetween(u, v) / 1e-9).toBeCloseTo(1, 12);
  });

  it('is accurate for nearly antiparallel vectors', () => {
    const angle = angleBetween(vec3(1, 0, 0), vec3(-1, 1e-9, 0));
    expect((Math.PI - angle) / 1e-9).toBeCloseTo(1, 6);
  });
});

describe('float64 precision', () => {
  it('resolves 1 m at 1 AU from the origin', () => {
    // At 1.5e8 km, adjacent float64 values are ~3e-8 km apart, so each coordinate carries up
    // to ~1.5e-8 km of rounding error. In float32 they are ~16 km apart.
    const AU = 149_597_870.7;
    const p = vec3(AU * 0.6, AU * 0.8, 1e3);
    const q = add(p, vec3(0.0006, 0.0008, 0)); // 1 m from p, along p's direction
    expect(Math.abs(norm(sub(q, p)) - 0.001)).toBeLessThan(1e-7);
    // The same x difference in float32 is 0 or a whole float32 step, never 0.0006.
    const dx32 = Math.fround(q.x) - Math.fround(p.x);
    expect(Math.abs(dx32 - 0.0006)).toBeGreaterThan(0.0005);
  });
});

describe('purity and the …Into variants', () => {
  it('pure functions do not mutate their inputs', () => {
    const a0 = clone(a);
    const b0 = clone(b);
    add(a, b);
    sub(a, b);
    scale(a, 3);
    addScaled(a, b, 2);
    negate(a);
    lerp(a, b, 0.3);
    cross(a, b);
    normalize(a);
    rotateX(a, 1);
    rotateZ(a, 1);
    expect(a).toEqual(a0);
    expect(b).toEqual(b0);
  });

  it('clone returns a distinct copy', () => {
    const c = clone(a);
    expect(c).toEqual(a);
    expect(c).not.toBe(a);
  });

  it('match the pure versions', () => {
    const out = vec3(0, 0, 0);
    expect(addInto(out, a, b)).toEqual(add(a, b));
    expect(subInto(out, a, b)).toEqual(sub(a, b));
    expect(scaleInto(out, a, 2.5)).toEqual(scale(a, 2.5));
    expect(addScaledInto(out, a, b, -1.5)).toEqual(addScaled(a, b, -1.5));
  });

  it('return out', () => {
    const out = vec3(0, 0, 0);
    expect(addInto(out, a, b)).toBe(out);
  });

  it('work when out aliases an input', () => {
    const cases: [(out: Vec3, x: Vec3, y: Vec3) => Vec3, (x: Vec3, y: Vec3) => Vec3][] = [
      [addInto, add],
      [subInto, sub],
      [(o, x, y) => addScaledInto(o, x, y, 3), (x, y) => addScaled(x, y, 3)],
    ];
    for (const [into, pure] of cases) {
      const x1 = clone(a);
      expect(into(x1, x1, b)).toEqual(pure(a, b));
      const y1 = clone(b);
      expect(into(y1, a, y1)).toEqual(pure(a, b));
      const z1 = clone(a);
      expect(into(z1, z1, z1)).toEqual(pure(a, a));
    }
    const s = clone(a);
    expect(scaleInto(s, s, 2)).toEqual(scale(a, 2));
  });
});

describe('plain data', () => {
  it('round-trips through JSON', () => {
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('constants are frozen', () => {
    expect(Object.isFrozen(ZERO)).toBe(true);
    expect(Object.isFrozen(X_AXIS)).toBe(true);
  });
});
