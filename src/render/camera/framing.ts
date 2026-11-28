import { getBody, majorChildren, type BodyId, type BodySystem } from '../../sim/body';
import type { ShipId } from '../../sim/ship';
import { shipBodyAt, shipPointAt, type World } from '../../sim/world';
import type { MapObjectRef } from '../../store/useView';
import { anomalyAt, conicGeometry, positionAtAnomaly, segmentIndexAt } from '../trajectoryGeometry';

/** The map camera's vertical field of view, degrees. */
export const FOV_DEG = 50;

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
/** A ship's path framing is at least this multiple of its parent's radius (S5b-12). */
export const SHIP_FRAMING_MIN_RADII = 3;
/** Points sampled along the path to frame it. */
const FRAMING_SAMPLES = 64;
/** The path's farthest point from the ship, ×this, fills half the view's height. */
const FRAMING_MARGIN = 1.1;

/**
 * The distance to frame a ship (S5b-12 in planning/sprint-5b.md): far enough to show its drawn
 * path, from t to the end of the segment it is on or one revolution, whichever is first, around
 * the ship at the centre. At least 3 × the parent's radius and at most the parent's framing.
 * A ship not drawn at t gets the framing of the body it is drawn around.
 */
export function pathFramingDistance(world: World, shipId: ShipId, t: number): number {
  const parentId = shipBodyAt(world, shipId, t);
  const parentFraming = framingDistance(world.system, parentId);
  const segs = world.derived.trajectories[shipId]?.segments ?? [];
  const i = segmentIndexAt(segs, t);
  if (i < 0) return parentFraming;
  const seg = segs[i]!;
  const g = conicGeometry(world.system, seg);
  const tTo = g.kind === 'elliptic' ? Math.min(seg.tEnd, t + g.period) : seg.tEnd;
  const x0 = anomalyAt(g, t);
  let x1 = anomalyAt(g, tTo);
  if (g.kind === 'elliptic' && tTo - t >= g.period * (1 - 1e-12)) x1 = x0 + 2 * Math.PI;
  const ship = positionAtAnomaly(g, x0, { x: 0, y: 0, z: 0 });
  const p = { x: 0, y: 0, z: 0 };
  let extent = 0;
  for (let k = 1; k <= FRAMING_SAMPLES; k++) {
    positionAtAnomaly(g, x0 + ((x1 - x0) * k) / FRAMING_SAMPLES, p);
    extent = Math.max(extent, Math.hypot(p.x - ship.x, p.y - ship.y, p.z - ship.z));
  }
  const fit = (FRAMING_MARGIN * extent) / Math.tan((FOV_DEG * Math.PI) / 360);
  const floor = SHIP_FRAMING_MIN_RADII * getBody(world.system, seg.parentId).radius;
  return Math.max(Math.min(Math.max(fit, floor), parentFraming), SHIP_MIN_DISTANCE);
}

/**
 * The framing distance of a body or a ship at t: now, or the preview time (S2-11, S5-10,
 * S5b-12). A ship not drawn at t is framed like the body it is drawn around.
 */
export function framingDistanceOf(world: World, ref: MapObjectRef, t: number): number {
  if (ref.kind === 'body') return framingDistance(world.system, ref.id);
  const shipId = ref.kind === 'ship' ? ref.id : ref.shipId;
  return pathFramingDistance(world, shipId, t);
}

/** The minimum camera distance for a body or a ship at t. */
export function minDistanceOf(world: World, ref: MapObjectRef, t: number): number {
  if (ref.kind === 'body') return minDistance(world.system, ref.id);
  return shipPointAt(world, ref.id, t)
    ? SHIP_MIN_DISTANCE
    : minDistance(world.system, shipBodyAt(world, ref.id, t));
}
