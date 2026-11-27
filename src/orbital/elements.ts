/**
 * State vectors and orbital elements, and the conversions between them.
 *
 * `ConicElements` uses the semi-latus rectum `p` and the true anomaly `ν`, so one type covers
 * ellipses, parabolas and hyperbolas (decision S1-13). The singular cases follow fixed
 * conventions:
 *
 * - circular (e < CIRCULAR_E): ω = 0, and ν is the argument of latitude;
 * - equatorial (i < EQUATORIAL_I or π − i < EQUATORIAL_I): Ω = 0, and ω is the longitude of
 *   periapsis, measured in the direction of motion;
 * - both: Ω = ω = 0, and ν is the true longitude, measured in the direction of motion.
 *
 * A radial state (zero angular momentum) has no orbit plane, and gives non-finite elements.
 */

import { cross, dot, norm, normSq, rotateX, rotateZ, scale, sub, type Vec3 } from '../math/vec3';
import { wrapPi, wrapTwoPi } from '../math/units';
import { PARABOLIC_TOLERANCE } from './kepler';

/** Position and velocity relative to some body, in world-parallel axes. Plain data. */
export interface StateVector {
  /** km */
  r: Vec3;
  /** km/s */
  v: Vec3;
}

/** Osculating elements of any conic. */
export interface ConicElements {
  /** Semi-latus rectum, km (h²/μ). */
  p: number;
  e: number;
  /** Inclination, [0, π]. */
  i: number;
  /** Longitude of the ascending node Ω, [0, 2π). */
  lan: number;
  /** Argument of periapsis ω, [0, 2π). */
  argp: number;
  /** True anomaly, (−π, π]. */
  nu: number;
}

/**
 * A reference plane by its pole in ICRF. The node is measured from the plane's ascending node
 * on the ICRF equator (decision S1-6).
 */
export interface ReferencePlane {
  poleRa: number;
  poleDec: number;
}

/** A body's orbit on rails (decision S1-5). Elliptic only. Plain data. */
export interface MeanElements {
  a: number;
  e: number;
  i: number;
  lan: number;
  argp: number;
  /** M₀, at t = 0. */
  meanAnomaly: number;
  /** n, rad/s. */
  meanMotion: number;
  /** Linear secular rates, per second. */
  rates?: { a?: number; e?: number; i?: number; lan?: number; argp?: number };
  /** Absent = ecliptic. */
  plane?: ReferencePlane;
}

export const CIRCULAR_E = 1e-11;
export const EQUATORIAL_I = 1e-11;

/** The signed angle from `from` to `to`, about the unit axis `axis`, in (−π, π]. */
function signedAngle(from: Vec3, to: Vec3, axis: Vec3): number {
  return Math.atan2(dot(cross(from, to), axis), dot(from, to));
}

export function elementsFromState(mu: number, s: StateVector): ConicElements {
  const { r, v } = s;
  const rMag = norm(r);
  const hVec = cross(r, v);
  const h = norm(hVec);
  const hHat = scale(hVec, 1 / h);

  // e = ((v² − μ/r) r − (r·v) v) / μ
  const eVec = scale(sub(scale(r, normSq(v) - mu / rMag), scale(v, dot(r, v))), 1 / mu);
  const e = norm(eVec);
  const p = (h * h) / mu;

  const i = Math.atan2(Math.hypot(hVec.x, hVec.y), hVec.z);
  const equatorial = i < EQUATORIAL_I || Math.PI - i < EQUATORIAL_I;
  const circular = e < CIRCULAR_E;

  // The node line is ẑ × h; for an equatorial orbit it is taken to be x̂.
  const node: Vec3 = equatorial ? { x: 1, y: 0, z: 0 } : { x: -hVec.y, y: hVec.x, z: 0 };
  const lan = equatorial ? 0 : wrapTwoPi(Math.atan2(node.y, node.x));
  // The periapsis direction; for a circular orbit, the node.
  const peri = circular ? node : eVec;
  const argp = circular ? 0 : wrapTwoPi(signedAngle(node, peri, hHat));
  const nu = wrapPi(signedAngle(peri, r, hHat));

  return { p, e, i, lan, argp, nu };
}

export function stateFromElements(mu: number, el: ConicElements): StateVector {
  const { p, e, i, lan, argp, nu } = el;
  const cosNu = Math.cos(nu);
  const sinNu = Math.sin(nu);
  const rMag = p / (1 + e * cosNu);
  const vScale = Math.sqrt(mu / p);
  // Perifocal frame, then Rz(Ω)·Rx(i)·Rz(ω).
  const toWorld = (w: Vec3) => rotateZ(rotateX(rotateZ(w, argp), i), lan);
  return {
    r: toWorld({ x: rMag * cosNu, y: rMag * sinNu, z: 0 }),
    v: toWorld({ x: -vScale * sinNu, y: vScale * (e + cosNu), z: 0 }),
  };
}

export type ConicKind = 'elliptic' | 'parabolic' | 'hyperbolic';

/** Parabolic when |e − 1| < 1e-12. */
export function conicKind(e: number): ConicKind {
  if (Math.abs(e - 1) < PARABOLIC_TOLERANCE) return 'parabolic';
  return e < 1 ? 'elliptic' : 'hyperbolic';
}

// Derived values, for display and planning. Infinity where undefined (never stored).

/** Negative for hyperbolas, Infinity for a parabola. */
export function semiMajorAxis(el: ConicElements): number {
  if (conicKind(el.e) === 'parabolic') return Infinity;
  return el.p / (1 - el.e * el.e);
}

export function periapsis(el: ConicElements): number {
  return el.p / (1 + el.e);
}

/** Infinity for e ≥ 1. */
export function apoapsis(el: ConicElements): number {
  return conicKind(el.e) === 'elliptic' ? el.p / (1 - el.e) : Infinity;
}

/** Infinity for e ≥ 1. */
export function period(mu: number, el: ConicElements): number {
  if (conicKind(el.e) !== 'elliptic') return Infinity;
  const a = semiMajorAxis(el);
  return 2 * Math.PI * Math.sqrt((a * a * a) / mu);
}

export function specificEnergy(mu: number, s: StateVector): number {
  return normSq(s.v) / 2 - mu / norm(s.r);
}

export function angularMomentum(s: StateVector): Vec3 {
  return cross(s.r, s.v);
}
