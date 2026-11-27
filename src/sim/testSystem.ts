/**
 * A synthetic star–planet–moon system with Earth-like values, for the `sim/` tests (which may
 * not import `gen/`). The moon's orbit is circular and in the planet's xy plane, starting on +x,
 * so tests can aim at it in closed form. Test-only.
 */

import { buildBodySystem, type BodySystem } from './body';

export const MU_STAR = 1.327_124_400_18e11;
export const MU_PLANET = 398_600.4418;
export const MU_MOON = 4902.8;
export const PLANET_A = 1.496e8;
export const MOON_A = 384_400;
export const PLANET_RADIUS = 6371;
export const PLANET_ATMOSPHERE = 100;
export const MOON_RADIUS = 1737.4;

/** The moon's angle from +x at t: θ0 + n·t. */
export const moonMeanMotion = Math.sqrt(MU_PLANET / MOON_A ** 3);

export function syntheticSystem(moonPhase = 0): BodySystem {
  return buildBodySystem(2_451_545, [
    {
      id: 'star',
      name: 'Star',
      class: 'star',
      parentId: null,
      mu: MU_STAR,
      radius: 695_700,
      atmosphereHeight: 0,
    },
    {
      id: 'planet',
      name: 'Planet',
      class: 'planet',
      parentId: 'star',
      mu: MU_PLANET,
      radius: PLANET_RADIUS,
      atmosphereHeight: PLANET_ATMOSPHERE,
      orbit: {
        a: PLANET_A,
        e: 0.0167,
        i: 0,
        lan: 0,
        argp: 1.8,
        meanAnomaly: 0.3,
        meanMotion: Math.sqrt(MU_STAR / PLANET_A ** 3),
      },
    },
    {
      id: 'moon',
      name: 'Moon',
      class: 'moon',
      parentId: 'planet',
      mu: MU_MOON,
      radius: MOON_RADIUS,
      atmosphereHeight: 0,
      orbit: {
        a: MOON_A,
        e: 0,
        i: 0,
        lan: 0,
        argp: 0,
        meanAnomaly: moonPhase,
        meanMotion: moonMeanMotion,
      },
    },
  ]);
}
