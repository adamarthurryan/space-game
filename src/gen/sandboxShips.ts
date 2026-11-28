/**
 * Sandbox ships and spawn presets (decisions S3-13 and S3-14 in planning/sprint-3.md).
 */

import type { DesignId } from '../content/types';
import { DEG } from '../math/units';
import { cross, dot, normalize, norm, scale, sub, type Vec3 } from '../math/vec3';
import { elementsFromState, periapsis, stateFromElements } from '../orbital/elements';
import { planeToEcliptic } from '../orbital/frames';
import { bodyStateIn, getBody, type BodyId, type BodySystem } from '../sim/body';
import type { OrbitState } from '../sim/ship';
import { computeTrajectory } from '../sim/trajectory';

export type SpawnPreset =
  'leo' | 'leo-lunar-plane' | 'low-lunar' | 'earth-escape' | 'to-the-moon' | 'suborbital';
/** Presets that depend on the time (the Moon's position), computed as a state at t. */
export type ComputedPreset = 'to-the-moon' | 'leo-lunar-plane';
export const isComputedPreset = (p: SpawnPreset): p is ComputedPreset =>
  p === 'to-the-moon' || p === 'leo-lunar-plane';

export const SPAWN_PRESETS: readonly { id: SpawnPreset; name: string }[] = [
  { id: 'leo', name: 'LEO (400 km)' },
  { id: 'leo-lunar-plane', name: 'LEO (lunar plane)' },
  { id: 'low-lunar', name: 'Low lunar orbit (100 km)' },
  { id: 'earth-escape', name: 'Earth escape' },
  { id: 'to-the-moon', name: 'To the Moon' },
  { id: 'suborbital', name: 'Suborbital' },
];

/** An orbit as the spawn form's fields (S3-14). */
export interface OrbitInput {
  parentId: BodyId;
  /** km above the mean radius. */
  periapsisAltitude: number;
  /** ≥ 1 for escape orbits. */
  e: number;
  /** rad. */
  i: number;
  lan: number;
  argp: number;
  nu: number;
  /** The reference plane of the angles: the parent's equator (if it has a pole) or the ecliptic. */
  plane: 'equator' | 'ecliptic';
}

/** The state of an orbit given as the form's fields, at t. */
export function orbitFromInput(sys: BodySystem, input: OrbitInput, t: number): OrbitState {
  const body = getBody(sys, input.parentId);
  const rp = body.radius + input.periapsisAltitude;
  const s = stateFromElements(body.mu, {
    p: rp * (1 + input.e),
    e: input.e,
    i: input.i,
    lan: input.lan,
    argp: input.argp,
    nu: input.nu,
  });
  const pole = input.plane === 'equator' ? body.rotation?.pole : undefined;
  return {
    parentId: input.parentId,
    t,
    r: pole ? planeToEcliptic(pole, s.r) : s.r,
    v: pole ? planeToEcliptic(pole, s.v) : s.v,
  };
}

/** The form's fields for a preset, where the preset is a fixed orbit (not a computed one). */
export function presetInput(
  sys: BodySystem,
  preset: Exclude<SpawnPreset, ComputedPreset>,
): OrbitInput {
  const base = { lan: 0, argp: 0, nu: 0, plane: 'equator' as const };
  switch (preset) {
    case 'leo':
      return { ...base, parentId: 'earth', periapsisAltitude: 400, e: 0, i: 51.6 * DEG };
    case 'low-lunar':
      return { ...base, parentId: 'moon', periapsisAltitude: 100, e: 0, i: 0 };
    case 'earth-escape': {
      // Pe 300 km, v∞ 3 km/s: e = 1 + rp·v∞²/μ.
      const earth = getBody(sys, 'earth');
      const rp = earth.radius + 300;
      return {
        ...base,
        parentId: 'earth',
        periapsisAltitude: 300,
        e: 1 + (rp * 9) / earth.mu,
        i: 28.5 * DEG,
      };
    }
    case 'suborbital': {
      // Pe −100 km, Ap 400 km, from the apoapsis: impacts within one orbit.
      const R = getBody(sys, 'earth').radius;
      const rp = R - 100;
      const ra = R + 400;
      return {
        ...base,
        parentId: 'earth',
        periapsisAltitude: -100,
        e: (ra - rp) / (ra + rp),
        i: 51.6 * DEG,
        nu: Math.PI,
      };
    }
  }
}

/** Periapsis of the 'to-the-moon' transfer, km above Earth's radius. */
const TLI_PERIAPSIS_ALTITUDE = 200;
/** The lunar periapsis the transfer aims for, km above the Moon's radius. */
const LUNAR_FLYBY_ALTITUDE = 1000;

/**
 * A transfer from a 200 km Earth periapsis at t, in the Moon's orbit plane, whose apoapsis is
 * aimed at the Moon's position at arrival by fixed-point iteration, then offset in-plane (in
 * apoapsis radius) so the lunar periapsis is above the surface (S3-13).
 */
function toTheMoon(sys: BodySystem, t: number): OrbitState {
  const earth = getBody(sys, 'earth');
  const moon = getBody(sys, 'moon');
  const mu = earth.mu;
  const rp = earth.radius + TLI_PERIAPSIS_ALTITUDE;
  const m0 = bodyStateIn(sys, 'moon', 'earth', t);
  const h = normalize(cross(m0.r, m0.v));

  /** The departure state for an apoapsis `dr` km above the Moon's position at arrival. */
  const departure = (dr: number): OrbitState => {
    let tof = 3 * 86_400;
    let target: Vec3 = m0.r;
    for (let k = 0; k < 20; k++) {
      target = bodyStateIn(sys, 'moon', 'earth', t + tof).r;
      const ra = norm(target) + dr;
      const a = (rp + ra) / 2;
      tof = Math.PI * Math.sqrt((a * a * a) / mu);
    }
    // The apoapsis direction: the Moon's direction at arrival, projected into its orbit plane.
    const apoDir = normalize(sub(target, scale(h, dot(target, h))));
    const ra = norm(target) + dr;
    const vp = Math.sqrt(mu * (2 / rp - 2 / (rp + ra)));
    const periDir = scale(apoDir, -1);
    const vDir = cross(h, periDir);
    return { parentId: 'earth', t, r: scale(periDir, rp), v: scale(vDir, vp) };
  };

  /** Lunar periapsis altitude of the transfer, or −Infinity if it misses the Moon's SOI. */
  const flyby = (dr: number): number => {
    const segs = computeTrajectory(sys, departure(dr), {
      maxSegments: 2,
      horizonCap: 20 * 86_400,
    });
    const lunar = segs[1];
    if (segs[0]?.endEvent !== 'soi-enter' || !lunar) return -Infinity;
    const el = elementsFromState(moon.mu, { r: lunar.r0, v: lunar.v0 });
    // Only a periapsis ahead counts; an inbound hyperbola reaches it.
    return dot(lunar.r0, lunar.v0) < 0 ? periapsis(el) - moon.radius : -Infinity;
  };

  // Scan apoapsis offsets for the flyby altitude nearest the aim (deterministic).
  let best = 0;
  let bestErr = Infinity;
  for (let k = -40; k <= 40; k++) {
    const dr = k * 500;
    const alt = flyby(dr);
    if (!Number.isFinite(alt) || alt < 50) continue;
    const err = Math.abs(alt - LUNAR_FLYBY_ALTITUDE);
    if (err < bestErr) [best, bestErr] = [dr, err];
  }
  return departure(best);
}

/** Altitude of the 'leo-lunar-plane' preset, km (S4-19). */
const LUNAR_PLANE_LEO_ALTITUDE = 200;

/**
 * A 200 km circular Earth orbit in the Moon's orbit plane at t, moving the same way as the
 * Moon, starting under the Moon (S4-19): the parking orbit for a trans-lunar injection by hand.
 */
function leoLunarPlane(sys: BodySystem, t: number): OrbitState {
  const earth = getBody(sys, 'earth');
  const m = bodyStateIn(sys, 'moon', 'earth', t);
  const h = normalize(cross(m.r, m.v));
  const rHat = normalize(m.r);
  const r = earth.radius + LUNAR_PLANE_LEO_ALTITUDE;
  return {
    parentId: 'earth',
    t,
    r: scale(rHat, r),
    v: scale(cross(h, rHat), Math.sqrt(earth.mu / r)),
  };
}

/** The state of a spawn preset at t. */
export function presetOrbit(sys: BodySystem, preset: SpawnPreset, t: number): OrbitState {
  if (preset === 'to-the-moon') return toTheMoon(sys, t);
  if (preset === 'leo-lunar-plane') return leoLunarPlane(sys, t);
  return orbitFromInput(sys, presetInput(sys, preset), t);
}

/** Kestrel, Tern and Heron (S3-13). */
export function sandboxShips(
  sys: BodySystem,
): { designId: DesignId; name: string; orbit: OrbitState }[] {
  const R = getBody(sys, 'earth').radius;
  const tern = { rp: R + 300, ra: R + 35_786 };
  const equator = { lan: 0, argp: 0, nu: 0, plane: 'equator' as const };
  return [
    {
      designId: 'starship',
      name: 'Kestrel',
      orbit: orbitFromInput(
        sys,
        { ...equator, parentId: 'earth', periapsisAltitude: 400, e: 0, i: 51.6 * DEG },
        0,
      ),
    },
    {
      designId: 'starship',
      name: 'Tern',
      orbit: orbitFromInput(
        sys,
        {
          ...equator,
          parentId: 'earth',
          periapsisAltitude: 300,
          e: (tern.ra - tern.rp) / (tern.ra + tern.rp),
          i: 28.5 * DEG,
          lan: 40 * DEG,
        },
        0,
      ),
    },
    {
      designId: 'starship',
      name: 'Heron',
      orbit: orbitFromInput(
        sys,
        { ...equator, parentId: 'moon', periapsisAltitude: 100, e: 0, i: 0 },
        0,
      ),
    },
  ];
}
