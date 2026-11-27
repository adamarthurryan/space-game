/**
 * Derived values for the body inspector (decision S2-18 in planning/sprint-2.md). Pure, so it's
 * tested in the node environment.
 */

import { G, TWO_PI } from '../../math/units';
import { angleBetween, norm, vec3, type Vec3 } from '../../math/vec3';
import { meanElementsAt, meanOrbitNormal, stateFromMeanElements } from '../../orbital/propagate';
import { bodyPole, getBody, type BodyId, type BodySystem } from '../../sim/body';

export interface BodyDetails {
  physical: {
    mass: number;
    mu: number;
    radius: number;
    /** km/s². */
    surfaceGravity: number;
    /** km/s. */
    escapeSpeed: number;
    /** s, absent without rotation data. */
    siderealDay?: number;
    /** Spin axis vs. orbit normal (vs. the ecliptic pole for the root), rad; > 90° is retrograde. */
    axialTilt?: number;
  };
  orbit?: {
    parentId: BodyId;
    a: number;
    e: number;
    inclinationEcliptic: number;
    /** Absent when the parent has no rotation data. */
    inclinationParentEquator?: number;
    /** Ω and ω, measured in the reference plane. */
    lan: number;
    argp: number;
    referencePlane: 'ecliptic' | 'laplace';
    period: number;
    periapsis: number;
    apoapsis: number;
    /** Current distance from the parent, km, and speed relative to it, km/s. */
    distance: number;
    speed: number;
  };
  soi: { kind: 'radius'; radius: number } | { kind: 'minor' } | { kind: 'root' };
}

const ECLIPTIC_POLE: Vec3 = vec3(0, 0, 1);

/** The direction the body spins about: the IAU north pole, reversed for retrograde rotators. */
function spinAxis(sys: BodySystem, id: BodyId): Vec3 | undefined {
  const b = getBody(sys, id);
  const pole = bodyPole(b);
  if (!pole || !b.rotation) return undefined;
  return b.rotation.wRate < 0 ? vec3(-pole.x, -pole.y, -pole.z) : pole;
}

export function bodyDetails(sys: BodySystem, id: BodyId, t: number): BodyDetails {
  const b = getBody(sys, id);
  const spin = spinAxis(sys, id);
  const normal = b.orbit ? meanOrbitNormal(b.orbit, t) : ECLIPTIC_POLE;

  const physical: BodyDetails['physical'] = {
    mass: b.mu / G,
    mu: b.mu,
    radius: b.radius,
    surfaceGravity: b.mu / (b.radius * b.radius),
    escapeSpeed: Math.sqrt((2 * b.mu) / b.radius),
  };
  if (b.rotation && b.rotation.wRate !== 0)
    physical.siderealDay = TWO_PI / Math.abs(b.rotation.wRate);
  if (spin) physical.axialTilt = angleBetween(spin, normal);

  const details: BodyDetails = {
    physical,
    soi:
      b.parentId === null
        ? { kind: 'root' }
        : b.major
          ? { kind: 'radius', radius: b.soiRadius ?? 0 }
          : { kind: 'minor' },
  };

  if (b.orbit && b.parentId !== null) {
    const el = meanElementsAt(b.orbit, t);
    const s = stateFromMeanElements(b.orbit, t);
    // The parent's equator: its IAU north pole (the plane, whichever way it spins).
    const parentPole = bodyPole(getBody(sys, b.parentId));
    details.orbit = {
      parentId: b.parentId,
      a: el.a,
      e: el.e,
      inclinationEcliptic: angleBetween(normal, ECLIPTIC_POLE),
      lan: el.lan,
      argp: el.argp,
      referencePlane: b.orbit.plane ? 'laplace' : 'ecliptic',
      period: TWO_PI / Math.abs(b.orbit.meanMotion),
      periapsis: el.a * (1 - el.e),
      apoapsis: el.a * (1 + el.e),
      distance: norm(s.r),
      speed: norm(s.v),
    };
    if (parentPole) details.orbit.inclinationParentEquator = angleBetween(normal, parentPole);
  }
  return details;
}
