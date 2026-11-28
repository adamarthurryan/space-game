import { getBody, majorChildren, type BodyId, type BodySystem } from '../../sim/body';
import { shipBodyAt, shipPointAt, type World } from '../../sim/world';
import type { MapObjectRef } from '../../store/useView';

/** The farthest the camera goes from its focus, km (S2-10). */
export const MAX_DISTANCE = 5e10;

/** Apoapsis of a body's orbit at t = 0, km; 0 for the root. */
function apoapsisOf(sys: BodySystem, id: BodyId): number {
  const o = getBody(sys, id).orbit;
  return o ? o.a * (1 + o.e) : 0;
}

/**
 * The distance a refocus moves to (S2-11): 3 × the apoapsis of the body's outermost major moon,
 * or 8 × its radius if it has none. For the root, 2 × the largest planet apoapsis (Neptune's
 * in the real system), so that dwarf planets don't set the scale.
 */
export function framingDistance(sys: BodySystem, id: BodyId): number {
  const body = getBody(sys, id);
  if (body.parentId === null) {
    const planets = majorChildren(sys, id).filter((c) => c.class === 'planet');
    const candidates = planets.length ? planets : majorChildren(sys, id);
    const apo = Math.max(0, ...candidates.map((c) => apoapsisOf(sys, c.id)));
    return apo > 0 ? Math.min(2 * apo, MAX_DISTANCE) : 8 * body.radius;
  }
  const moons = majorChildren(sys, id);
  const apo = Math.max(0, ...moons.map((c) => apoapsisOf(sys, c.id)));
  return apo > 0 ? 3 * apo : 8 * body.radius;
}

/** The closest the camera goes to a body's centre: 1.05 × its radius (S2-10). */
export function minDistance(sys: BodySystem, id: BodyId): number {
  return 1.05 * getBody(sys, id).radius;
}

/** The closest the camera goes to a ship, km (S3-15). */
export const SHIP_MIN_DISTANCE = 0.05;
/** A focused ship is framed at this multiple of its distance from its parent (S3-15). */
export const SHIP_FRAMING_FACTOR = 2.5;

/** The ship's framing: 2.5 × its distance from its parent, capped at the parent's framing. */
export function shipFramingDistance(distanceFromParent: number, parentFraming: number): number {
  return Math.max(
    Math.min(SHIP_FRAMING_FACTOR * distanceFromParent, parentFraming),
    SHIP_MIN_DISTANCE,
  );
}

/**
 * The framing distance of a body or a ship at t: now, or the preview time (S2-11, S3-15,
 * S5-10). A ship not drawn at t is framed like the body it is drawn around.
 */
export function framingDistanceOf(world: World, ref: MapObjectRef, t: number): number {
  if (ref.kind === 'body') return framingDistance(world.system, ref.id);
  const parentFraming = framingDistance(world.system, shipBodyAt(world, ref.id, t));
  const point = shipPointAt(world, ref.id, t);
  if (!point) return parentFraming;
  const r = point.state.r;
  return shipFramingDistance(Math.hypot(r.x, r.y, r.z), parentFraming);
}

/** The minimum camera distance for a body or a ship at t. */
export function minDistanceOf(world: World, ref: MapObjectRef, t: number): number {
  if (ref.kind === 'body') return minDistance(world.system, ref.id);
  return shipPointAt(world, ref.id, t)
    ? SHIP_MIN_DISTANCE
    : minDistance(world.system, shipBodyAt(world, ref.id, t));
}
