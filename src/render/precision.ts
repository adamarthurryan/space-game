/**
 * The float64 → float32 path (decision S2-4 in planning/sprint-2.md). The scene origin is the
 * camera focus point; every position is computed in float64 as `world − origin`, and only the
 * difference is written to float32. Nothing on the GPU ever holds a world position.
 */

import type { Vec3 } from '../math/vec3';

interface Positionable {
  position: { set(x: number, y: number, z: number): unknown };
}

/**
 * out[3i..3i+2] = float32(world[3j..3j+2] − origin), for j = indices[i], or j = i for every
 * point of `world` if `indices` is absent. Returns out.
 */
export function toOriginRelativeInto(
  out: Float32Array,
  world: Float64Array,
  origin: Vec3,
  indices?: ArrayLike<number>,
): Float32Array {
  const n = indices ? indices.length : world.length / 3;
  for (let i = 0; i < n; i++) {
    const j = indices ? indices[i]! : i;
    out[3 * i] = world[3 * j]! - origin.x;
    out[3 * i + 1] = world[3 * j + 1]! - origin.y;
    out[3 * i + 2] = world[3 * j + 2]! - origin.z;
  }
  return out;
}

/** Sets an object's position to `world − origin`, the difference taken in float64. */
export function setObjectPosition(obj: Positionable, world: Vec3, origin: Vec3): void {
  obj.position.set(world.x - origin.x, world.y - origin.y, world.z - origin.z);
}

/** As `setObjectPosition`, for point `i` of a packed float64 array (3 values per point). */
export function setObjectPositionAt(
  obj: Positionable,
  world: Float64Array,
  i: number,
  origin: Vec3,
): void {
  obj.position.set(
    world[3 * i]! - origin.x,
    world[3 * i + 1]! - origin.y,
    world[3 * i + 2]! - origin.z,
  );
}
