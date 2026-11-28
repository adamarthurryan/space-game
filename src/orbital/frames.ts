/**
 * Frames: the world frame is heliocentric ecliptic and mean equinox of J2000 (decision S1-1).
 * Every body frame is non-rotating and parallel to it, so changing between body frames is a
 * translation (`addState`, `subState`). The tree walks live in `sim/body.ts`.
 *
 * Orbits may be given relative to a reference plane, defined by its pole's RA and Dec in ICRF,
 * with the node measured from the plane's ascending node on the ICRF equator (S1-6).
 */

import { DEG } from '../math/units';
import { add, rotateX, rotateZ, sub, type Vec3 } from '../math/vec3';
import type { ReferencePlane, StateVector } from './elements';

/** 84381.448″ in rad; matches the ecliptic frame of JPL Horizons. */
export const OBLIQUITY_J2000 = (84_381.448 / 3600) * DEG;

export function equatorialToEcliptic(v: Vec3): Vec3 {
  return rotateX(v, -OBLIQUITY_J2000);
}

export function eclipticToEquatorial(v: Vec3): Vec3 {
  return rotateX(v, OBLIQUITY_J2000);
}

/**
 * Rotation from a reference plane's axes (x = its ascending node on the ICRF equator, z = its
 * pole) to ecliptic axes: Rx(−ε)·Rz(α + π/2)·Rx(π/2 − δ).
 */
export function planeToEcliptic(plane: ReferencePlane, v: Vec3): Vec3 {
  const equatorial = rotateZ(rotateX(v, Math.PI / 2 - plane.poleDec), plane.poleRa + Math.PI / 2);
  return equatorialToEcliptic(equatorial);
}

export function eclipticToPlane(plane: ReferencePlane, v: Vec3): Vec3 {
  const equatorial = eclipticToEquatorial(v);
  return rotateX(
    rotateZ(equatorial, -(plane.poleRa + Math.PI / 2)),
    -(Math.PI / 2 - plane.poleDec),
  );
}

/** As `planeToEcliptic`, rotating `v` in place (for per-frame loops). Returns v. */
export function planeToEclipticInPlace(plane: ReferencePlane, v: Vec3): Vec3 {
  // Rx(π/2 − δ): cos = sin δ, sin = cos δ.
  const cd = Math.cos(plane.poleDec);
  const sd = Math.sin(plane.poleDec);
  const y1 = v.y * sd - v.z * cd;
  const z1 = v.y * cd + v.z * sd;
  // Rz(α + π/2): cos = −sin α, sin = cos α.
  const ca = Math.cos(plane.poleRa);
  const sa = Math.sin(plane.poleRa);
  const x2 = -v.x * sa - y1 * ca;
  const y2 = v.x * ca - y1 * sa;
  // Rx(−ε).
  const ce = Math.cos(OBLIQUITY_J2000);
  const se = Math.sin(OBLIQUITY_J2000);
  v.x = x2;
  v.y = y2 * ce + z1 * se;
  v.z = -y2 * se + z1 * ce;
  return v;
}

/** The plane's pole as a unit vector in ecliptic axes. */
export function planePole(plane: ReferencePlane): Vec3 {
  return planeToEcliptic(plane, { x: 0, y: 0, z: 1 });
}

/** Translation between parallel frames: `s` relative to `origin` → relative to the outer frame. */
export function addState(s: StateVector, origin: StateVector): StateVector {
  return { r: add(s.r, origin.r), v: add(s.v, origin.v) };
}

/** Translation between parallel frames: `s` in the outer frame → relative to `origin`. */
export function subState(s: StateVector, origin: StateVector): StateVector {
  return { r: sub(s.r, origin.r), v: sub(s.v, origin.v) };
}

/** Unit vectors of a state's local orbital frame (decision S4-2 in planning/sprint-4.md). */
export interface OrbitalBasis {
  prograde: Vec3;
  normal: Vec3;
  /** Radial out: prograde × normal, in the orbit plane, perpendicular to the velocity. */
  radial: Vec3;
}

/** A Δv in a local orbital frame, km/s. */
export interface LocalDv {
  prograde: number;
  normal: number;
  radial: number;
}

/** Below this |r × v| / (|r||v|), the state is treated as radial and the normal falls back. */
const DEGENERATE_SIN = 1e-12;

const newBasis = (): OrbitalBasis => ({
  prograde: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 0 },
  radial: { x: 0, y: 0, z: 0 },
});

/**
 * The local orbital frame of s (S4-2): prograde = v̂, normal = (r × v)/|r × v|, radial =
 * prograde × normal (outward: v × (r × v) = v²r − (r·v)v). For a radial state, the normal is the part
 * of `fallbackPole` perpendicular to v (or of x̂, if the pole is parallel to v too).
 */
export function localOrbitalBasis(
  s: StateVector,
  fallbackPole: Vec3,
  out: OrbitalBasis = newBasis(),
): OrbitalBasis {
  const { r, v } = s;
  const vm = Math.hypot(v.x, v.y, v.z);
  const p = out.prograde;
  p.x = v.x / vm;
  p.y = v.y / vm;
  p.z = v.z / vm;
  const n = out.normal;
  n.x = r.y * v.z - r.z * v.y;
  n.y = r.z * v.x - r.x * v.z;
  n.z = r.x * v.y - r.y * v.x;
  let nm = Math.hypot(n.x, n.y, n.z);
  if (!(nm > DEGENERATE_SIN * Math.hypot(r.x, r.y, r.z) * vm)) {
    // Gram–Schmidt of the fallback pole against the prograde direction.
    for (const c of [fallbackPole, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }]) {
      const d = c.x * p.x + c.y * p.y + c.z * p.z;
      n.x = c.x - d * p.x;
      n.y = c.y - d * p.y;
      n.z = c.z - d * p.z;
      nm = Math.hypot(n.x, n.y, n.z);
      if (nm > 1e-6) break;
    }
  }
  n.x /= nm;
  n.y /= nm;
  n.z /= nm;
  const q = out.radial;
  q.x = p.y * n.z - p.z * n.y;
  q.y = p.z * n.x - p.x * n.z;
  q.z = p.x * n.y - p.y * n.x;
  return out;
}

/** The Δv vector of a local Δv. */
export function dvToVector(b: OrbitalBasis, dv: LocalDv, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const { prograde: p, normal: n, radial: q } = b;
  out.x = p.x * dv.prograde + n.x * dv.normal + q.x * dv.radial;
  out.y = p.y * dv.prograde + n.y * dv.normal + q.y * dv.radial;
  out.z = p.z * dv.prograde + n.z * dv.normal + q.z * dv.radial;
  return out;
}

/** The local components of a Δv vector. */
export function vectorToDv(b: OrbitalBasis, v: Vec3): LocalDv {
  const d = (a: Vec3) => a.x * v.x + a.y * v.y + a.z * v.z;
  return { prograde: d(b.prograde), normal: d(b.normal), radial: d(b.radial) };
}
