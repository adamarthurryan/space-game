import { getBody, majorChildren, type BodyId, type BodySystem } from '../../sim/body';
import { shipStateAt } from '../../sim/ship';
import type { World } from '../../sim/world';
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

/** The parent body a ship is drawn around: its current parent, or the body it hit. */
function shipBodyOf(world: World, id: string): BodyId {
  const ship = world.ships[id];
  return ship?.destroyedAt?.bodyId ?? ship?.orbit.parentId ?? world.system.rootId;
}

/** The framing distance of a body or a ship at the world's current time (S2-11, S3-15). */
export function framingDistanceOf(world: World, ref: MapObjectRef): number {
  if (ref.kind === 'body') return framingDistance(world.system, ref.id);
  const ship = world.ships[ref.id];
  const parentId = shipBodyOf(world, ref.id);
  const parentFraming = framingDistance(world.system, parentId);
  if (!ship || ship.status !== 'coasting') return parentFraming;
  const r = shipStateAt(world.system, ship, world.clock.t).r;
  return shipFramingDistance(Math.hypot(r.x, r.y, r.z), parentFraming);
}

/** The minimum camera distance for a body or a ship. */
export function minDistanceOf(world: World, ref: MapObjectRef): number {
  if (ref.kind === 'body') return minDistance(world.system, ref.id);
  const ship = world.ships[ref.id];
  return ship && ship.status === 'coasting'
    ? SHIP_MIN_DISTANCE
    : minDistance(world.system, shipBodyOf(world, ref.id));
}
