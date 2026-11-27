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
