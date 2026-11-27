/**
 * Sphere of influence: its radius, and the times a conic crosses a sphere (sprint 3).
 */

import { brent } from '../math/roots';
import { TWO_PI } from '../math/units';
import { dot, norm } from '../math/vec3';
import {
  CIRCULAR_E,
  conicKind,
  elementsFromState,
  type ConicElements,
  type StateVector,
} from './elements';
import { meanFromTrue } from './kepler';

/** Laplace SOI radius a·(m/M)^(2/5), with the mass ratio taken as the GM ratio (km). */
export function laplaceSoiRadius(a: number, muBody: number, muParent: number): number {
  return a * Math.pow(muBody / muParent, 0.4);
}

/**
 * Time from state s until |r| first equals `radius` while moving outward ('outbound') or inward
 * ('inbound'), from the conic in closed form (decision S3-8 in planning/sprint-3.md); null if the
 * conic never does (for example, an ellipse with apoapsis < radius, or 'inbound' on an escape
 * past its periapsis). The result is ≥ 0; on an ellipse it is less than one period.
 */
export function timeToRadius(
  mu: number,
  s: StateVector,
  radius: number,
  crossing: 'outbound' | 'inbound',
): number | null {
  const el = elementsFromState(mu, s);
  const { e, p } = el;
  if (!(e > 0) || !(radius > 0)) return null;
  // r = p / (1 + e cos ν)  ⇒  cos ν = (p/r − 1) / e. Outbound crossings have ν in (0, π).
  const c = (p / radius - 1) / e;
  if (!(c >= -1 && c <= 1)) return null;
  const nuTarget = crossing === 'outbound' ? Math.acos(c) : -Math.acos(c);
  const nu0 = anomalyFromPeriapsis(s, el);

  const kind = conicKind(e);
  if (kind === 'elliptic') {
    const a = p / (1 - e * e);
    const n = Math.sqrt(mu / (a * a * a));
    let dM = meanFromTrue(nuTarget, e) - meanFromTrue(nu0, e);
    if (dM < 0) dM += TWO_PI;
    return dM / n;
  }
  // Open conics: no wrap; the crossing must be ahead.
  const n =
    kind === 'parabolic' ? 2 * Math.sqrt(mu / (p * p * p)) : Math.sqrt(mu / (p / (e * e - 1)) ** 3);
  const dM = meanFromTrue(nuTarget, e) - meanFromTrue(nu0, e);
  return dM >= 0 ? dM / n : null;
}

/**
 * The true anomaly of s measured from periapsis, whatever `elementsFromState`'s convention for
 * circular orbits (where ν is the argument of latitude). The sign follows r·v.
 */
function anomalyFromPeriapsis(s: StateVector, el: ConicElements): number {
  if (el.e >= CIRCULAR_E) return el.nu;
  const r = norm(s.r);
  const cosNu = Math.max(-1, Math.min(1, (el.p / r - 1) / el.e));
  const nu = Math.acos(cosNu);
  return dot(s.r, s.v) >= 0 ? nu : -nu;
}

/**
 * The first t in (t0, t1] where f crosses from > 0 to ≤ 0, by conservative advancement
 * (step = max(|f|/vMax, minStep)), then Brent; null if none (S3-8). f(t) = |r_rel(t)| − R must
 * change by at most vMax per second, so a crossing can't be stepped over, except a graze that
 * dips below zero for less than minStep.
 */
export function findSphereEntry(
  f: (t: number) => number,
  t0: number,
  t1: number,
  vMax: number,
  minStep: number,
): number | null {
  let t = t0;
  let ft = f(t);
  while (t < t1) {
    const step = Math.max(Math.abs(ft) / vMax, minStep);
    const tNext = Math.min(t + step, t1);
    const fNext = f(tNext);
    if (ft > 0 && fNext <= 0) {
      if (fNext === 0) return tNext;
      return brent(f, t, tNext, { xtol: 1e-9 }).x;
    }
    t = tNext;
    ft = fNext;
  }
  return null;
}
