/**
 * Passage times on a conic (decision S4-16 in planning/sprint-4.md): the next periapsis,
 * apoapsis, ascending node or descending node, in closed form from the true anomaly.
 */

import { TWO_PI } from '../math/units';
import { cross, dot, norm, scale, type Vec3 } from '../math/vec3';
import { CIRCULAR_E, conicKind, elementsFromState, type StateVector } from './elements';
import { meanFromTrue } from './kepler';

export type PassageKind = 'periapsis' | 'apoapsis' | 'ascending-node' | 'descending-node';

/** Below this |pole × ĥ|, the orbit lies in the reference plane and has no nodes. */
const IN_PLANE_SIN = 1e-9;

function signedAngle(from: Vec3, to: Vec3, axis: Vec3): number {
  return Math.atan2(dot(cross(from, to), axis), dot(from, to));
}

interface Conic {
  e: number;
  /** Mean motion: rad/s for ellipses; for open conics, the rate of their mean anomaly. */
  n: number;
  /** The true anomaly of the state, from the reference direction. */
  nu0: number;
  /** Periapsis direction (or r̂ for a circular orbit), and the unit angular momentum. */
  ref: Vec3;
  hHat: Vec3;
  elliptic: boolean;
}

function conic(mu: number, s: StateVector): Conic {
  const el = elementsFromState(mu, s);
  const { e, p } = el;
  const h = cross(s.r, s.v);
  const hHat = scale(h, 1 / norm(h));
  // e vector = ((v² − μ/r) r − (r·v) v) / μ
  const r = norm(s.r);
  const v2 = dot(s.v, s.v);
  const rv = dot(s.r, s.v);
  const eVec = {
    x: ((v2 - mu / r) * s.r.x - rv * s.v.x) / mu,
    y: ((v2 - mu / r) * s.r.y - rv * s.v.y) / mu,
    z: ((v2 - mu / r) * s.r.z - rv * s.v.z) / mu,
  };
  const ref = e >= CIRCULAR_E ? scale(eVec, 1 / norm(eVec)) : scale(s.r, 1 / r);
  const kind = conicKind(e);
  let n: number;
  if (kind === 'elliptic') {
    const a = p / (1 - e * e);
    n = Math.sqrt(mu / (a * a * a));
  } else if (kind === 'parabolic') {
    n = 2 * Math.sqrt(mu / (p * p * p));
  } else {
    n = Math.sqrt(mu / (p / (e * e - 1)) ** 3);
  }
  return { e, n, nu0: signedAngle(ref, s.r, hHat), ref, hHat, elliptic: kind === 'elliptic' };
}

/** The target true anomaly of a passage, or null if the conic has none. */
function targetAnomaly(c: Conic, kind: PassageKind, pole: Vec3): number | null {
  switch (kind) {
    case 'periapsis':
      return c.e >= CIRCULAR_E ? 0 : null;
    case 'apoapsis':
      return c.elliptic && c.e >= CIRCULAR_E ? Math.PI : null;
    case 'ascending-node':
    case 'descending-node': {
      const node = cross(pole, c.hHat);
      const s = norm(node);
      if (!(s > IN_PLANE_SIN)) return null;
      const nu = signedAngle(c.ref, node, c.hHat);
      return kind === 'ascending-node' ? nu : nu > 0 ? nu - Math.PI : nu + Math.PI;
    }
  }
}

/** Whether an open conic reaches true anomaly nu (inside its asymptotes). */
const reaches = (c: Conic, nu: number) => c.elliptic || 1 + c.e * Math.cos(nu) > 1e-12;

/** Time from the state to anomaly nu: (0, P] … for ellipses after minDt; signed for open conics. */
function dtTo(c: Conic, nu: number): number {
  return (meanFromTrue(nu, c.e) - meanFromTrue(c.nu0, c.e)) / c.n;
}

/**
 * Time from s to the next passage of the given kind (> minDt), from the conic in closed form;
 * null if there is none (apoapsis on an open orbit, periapsis already passed on a hyperbola, a
 * node on an orbit in the reference plane). Nodes are against the plane with pole `pole`.
 */
export function timeToPassage(
  mu: number,
  s: StateVector,
  kind: PassageKind,
  pole: Vec3,
  minDt = 0,
): number | null {
  const c = conic(mu, s);
  const nu = targetAnomaly(c, kind, pole);
  if (nu === null || !reaches(c, nu)) return null;
  let dt = dtTo(c, nu);
  if (c.elliptic) {
    const P = TWO_PI / c.n;
    dt = ((dt % P) + P) % P;
    while (dt <= minDt) dt += P;
    return dt;
  }
  return dt > minDt ? dt : null;
}

/** The nearest Pe or Ap passage, earlier (negative) or later; null as for `timeToPassage`. */
export function nearestPassage(
  mu: number,
  s: StateVector,
  kind: 'periapsis' | 'apoapsis',
): number | null {
  const c = conic(mu, s);
  const nu = targetAnomaly(c, kind, { x: 0, y: 0, z: 1 });
  if (nu === null || !reaches(c, nu)) return null;
  const dt = dtTo(c, nu);
  if (!c.elliptic) return dt;
  const P = TWO_PI / c.n;
  const next = ((dt % P) + P) % P;
  return next <= P - next ? next : next - P;
}
