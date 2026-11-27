/**
 * The approximate errors of JPL's Keplerian formulation, 3000 BC to 3000 AD (Tables 2a and 2b),
 * transcribed verbatim: right ascension and declination in arcseconds, distance in 1000 km.
 *
 * The current JPL page (https://ssd.jpl.nasa.gov/planets/approx_pos.html) no longer has this
 * table. Source: its earlier version, https://ssd.jpl.nasa.gov/?planet_pos, as archived at
 * https://web.archive.org/web/20210208193506/https://ssd.jpl.nasa.gov/?planet_pos (retrieved
 * 2026-11-27).
 */

import type { PlanetId } from '../data/jplPlanets';

export interface Table2Error {
  /** arcsec */
  ra: number;
  /** arcsec */
  dec: number;
  /** 1000 km */
  r: number;
}

export const TABLE_2_ERRORS: Readonly<Record<PlanetId, Table2Error>> = {
  mercury: { ra: 20, dec: 15, r: 1 },
  venus: { ra: 40, dec: 30, r: 8 },
  earth: { ra: 40, dec: 15, r: 15 }, // Earth-Moon barycentre
  mars: { ra: 100, dec: 40, r: 30 },
  jupiter: { ra: 600, dec: 100, r: 1000 },
  saturn: { ra: 1000, dec: 100, r: 4000 },
  uranus: { ra: 2000, dec: 30, r: 8000 },
  neptune: { ra: 400, dec: 15, r: 4000 },
  pluto: { ra: 400, dec: 100, r: 2500 },
};
