/**
 * Float64 3-vectors as plain `{ x, y, z }` objects (decision S0-2).
 *
 * The pure functions return new vectors and never mutate their inputs. The `…Into` variants
 * write into `out` and return it, for hot loops; `out` may alias an input.
 */

/** A float64 3-vector. Plain data: safe to store in the world and to serialise. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const ZERO: Readonly<Vec3> = Object.freeze({ x: 0, y: 0, z: 0 });
export const X_AXIS: Readonly<Vec3> = Object.freeze({ x: 1, y: 0, z: 0 });
export const Y_AXIS: Readonly<Vec3> = Object.freeze({ x: 0, y: 1, z: 0 });
export const Z_AXIS: Readonly<Vec3> = Object.freeze({ x: 0, y: 0, z: 1 });

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function clone(a: Vec3): Vec3 {
  return { x: a.x, y: a.y, z: a.z };
}

// ---- Pure functions -------------------------------------------------------------------------

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

/** a + b·s */
export function addScaled(a: Vec3, b: Vec3, s: number): Vec3 {
  return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
}

export function negate(a: Vec3): Vec3 {
  return { x: -a.x, y: -a.y, z: -a.z };
}

/** a + (b − a)·t */
export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** Unit vector in the direction of `a`. The zero vector normalises to the zero vector. */
export function normalize(a: Vec3): Vec3 {
  const n = norm(a);
  if (n === 0) return { x: 0, y: 0, z: 0 };
  return { x: a.x / n, y: a.y / n, z: a.z / n };
}

/** Right-handed rotation about the x axis by `angle` radians. */
export function rotateX(a: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: a.x, y: a.y * c - a.z * s, z: a.y * s + a.z * c };
}

/** Right-handed rotation about the z axis by `angle` radians. */
export function rotateZ(a: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c, z: a.z };
}

// ---- Scalars --------------------------------------------------------------------------------

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function norm(a: Vec3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function normSq(a: Vec3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

export function distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Angle between two vectors, in [0, π]. Uses atan2(|a×b|, a·b), which stays accurate for
 * nearly parallel and nearly antiparallel vectors, where acos of the normalised dot product
 * loses precision. 0 if either vector is zero.
 */
export function angleBetween(a: Vec3, b: Vec3): number {
  return Math.atan2(norm(cross(a, b)), dot(a, b));
}

/** True if every component of a and b differs by at most `eps`. */
export function equalsApprox(a: Vec3, b: Vec3, eps: number): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.z - b.z) <= eps;
}

// ---- Hot-loop variants: write into `out` and return it -------------------------------------

export function addInto(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  out.z = a.z + b.z;
  return out;
}

export function subInto(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  out.z = a.z - b.z;
  return out;
}

export function scaleInto(out: Vec3, a: Vec3, s: number): Vec3 {
  out.x = a.x * s;
  out.y = a.y * s;
  out.z = a.z * s;
  return out;
}

/** out = a + b·s */
export function addScaledInto(out: Vec3, a: Vec3, b: Vec3, s: number): Vec3 {
  out.x = a.x + b.x * s;
  out.y = a.y + b.y * s;
  out.z = a.z + b.z * s;
  return out;
}
