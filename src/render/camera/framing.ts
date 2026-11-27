import { getBody, majorChildren, type BodyId, type BodySystem } from '../../sim/body';

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
