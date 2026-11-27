/**
 * JPL Planetary Satellite Mean Elements, transcribed verbatim in the table's units (S1-15).
 *
 * Source: https://ssd.jpl.nasa.gov/sats/elem/ (retrieved 2026-11-27). Epoch 2000-01-01.5 TDB
 * (J2000) for every row. JPL's column notes:
 *
 * - a, e, ω (argument of periapsis), M (mean anomaly), i (inclination to the reference plane) and
 *   node (measured from the node of the reference plane on the ICRF equator, as S1-6);
 * - P is the sidereal period, so 2π/P is the rate of the mean longitude Ω + ω + M, not of M;
 * - Pw is the precession period of the argument of periapsis ω (for the Moon, 5.997 yr combines
 *   the 8.85 yr apsidal and 18.6 yr nodal periods), and Pnode that of the node. Both are given
 *   unsigned; "-" (here null) means none was fitted, and 0 means no precession;
 * - the reference plane is the ecliptic, the planet's equator ("equatorial") or the local
 *   Laplace plane, given by its pole's RA and Dec in ICRF. The table gives no pole for the
 *   equatorial frame: it is the planet's pole.
 *
 * The mean elements are "not intended for ephemeris computation" (JPL); they are a precessing
 * ellipse fitted to the integrated orbit. That is what the game needs (S1-7, S1-17).
 */

import type { BodyId } from '../../sim/body';

export interface SatelliteRow {
  id: BodyId;
  parentId: BodyId;
  /** JPL/NAIF ID. */
  code: number;
  /** The satellite ephemeris the elements were fitted to. */
  ephemeris: string;
  /** km */
  a: number;
  e: number;
  /** deg */
  argp: number;
  M: number;
  i: number;
  node: number;
  /** Sidereal period, days. */
  P: number;
  /** Precession period of ω, years; null if not fitted. */
  Pw: number | null;
  /** Precession period of the node, years; null if not fitted. */
  Pnode: number | null;
  /** Reference plane; a Laplace plane by its pole, deg, ICRF. */
  plane: 'ecliptic' | 'equatorial' | { ra: number; dec: number };
}

// prettier-ignore
export const JPL_SATELLITES: readonly SatelliteRow[] = [
  { id: 'moon', parentId: 'earth', code: 301, ephemeris: 'DE405/LE405',
    a: 384400, e: 0.0554, argp: 318.15, M: 135.27, i: 5.16, node: 125.08, P: 27.322, Pw: 5.997, Pnode: 18.600,
    plane: 'ecliptic' },
  { id: 'phobos', parentId: 'mars', code: 401, ephemeris: 'MAR099',
    a: 9375, e: 0.015, argp: 216.3, M: 189.7, i: 1.1, node: 169.2, P: 0.3187, Pw: 1.1, Pnode: 2.3,
    plane: { ra: 317.7, dec: 52.9 } },
  { id: 'deimos', parentId: 'mars', code: 402, ephemeris: 'MAR099',
    a: 23457, e: 0.000, argp: 0.0, M: 205.0, i: 1.8, node: 54.3, P: 1.2625, Pw: 0.0, Pnode: 56.2,
    plane: { ra: 316.6, dec: 53.5 } },
  { id: 'io', parentId: 'jupiter', code: 501, ephemeris: 'JUP365',
    a: 421800, e: 0.004, argp: 49.1, M: 330.9, i: 0.0, node: 0.0, P: 1.762732, Pw: 1.333, Pnode: 0.000,
    plane: { ra: 268.1, dec: 64.5 } },
  { id: 'europa', parentId: 'jupiter', code: 502, ephemeris: 'JUP365',
    a: 671100, e: 0.009, argp: 45.0, M: 345.4, i: 0.5, node: 184.0, P: 3.525463, Pw: 1.394, Pnode: 30.202,
    plane: { ra: 268.1, dec: 64.5 } },
  { id: 'ganymede', parentId: 'jupiter', code: 503, ephemeris: 'JUP365',
    a: 1070400, e: 0.001, argp: 198.3, M: 324.8, i: 0.2, node: 58.5, P: 7.155588, Pw: 68.301, Pnode: 137.812,
    plane: { ra: 268.2, dec: 64.6 } },
  { id: 'callisto', parentId: 'jupiter', code: 504, ephemeris: 'JUP365',
    a: 1882700, e: 0.007, argp: 43.8, M: 87.4, i: 0.3, node: 309.1, P: 16.690440, Pw: 277.921, Pnode: 577.264,
    plane: { ra: 268.7, dec: 64.8 } },
  { id: 'mimas', parentId: 'saturn', code: 601, ephemeris: 'SAT441',
    a: 186000, e: 0.020, argp: 160.4, M: 275.3, i: 1.6, node: 66.2, P: 0.942422, Pw: 0.493, Pnode: 0.986,
    plane: { ra: 40.6, dec: 83.5 } },
  { id: 'enceladus', parentId: 'saturn', code: 602, ephemeris: 'SAT441',
    a: 238400, e: 0.005, argp: 119.5, M: 57.0, i: 0.0, node: 0.0, P: 1.370218, Pw: 2.916, Pnode: 0.000,
    plane: { ra: 40.6, dec: 83.5 } },
  { id: 'tethys', parentId: 'saturn', code: 603, ephemeris: 'SAT441',
    a: 295000, e: 0.001, argp: 335.3, M: 0.0, i: 1.1, node: 273.0, P: 1.887802, Pw: 0.005, Pnode: 4.982,
    plane: { ra: 40.6, dec: 83.5 } },
  { id: 'dione', parentId: 'saturn', code: 604, ephemeris: 'SAT441',
    a: 377700, e: 0.002, argp: 116.0, M: 212.0, i: 0.0, node: 0.0, P: 2.736916, Pw: 11.698, Pnode: 0.000,
    plane: { ra: 40.6, dec: 83.5 } },
  { id: 'rhea', parentId: 'saturn', code: 605, ephemeris: 'SAT441',
    a: 527200, e: 0.001, argp: 44.3, M: 31.5, i: 0.3, node: 133.7, P: 4.517503, Pw: 33.939, Pnode: 35.775,
    plane: { ra: 40.6, dec: 83.5 } },
  { id: 'titan', parentId: 'saturn', code: 606, ephemeris: 'SAT441',
    a: 1221900, e: 0.029, argp: 78.3, M: 11.7, i: 0.3, node: 78.6, P: 15.945448, Pw: 346.680, Pnode: 687.370,
    plane: { ra: 36.4, dec: 84.0 } },
  { id: 'iapetus', parentId: 'saturn', code: 608, ephemeris: 'SAT441',
    a: 3561700, e: 0.028, argp: 254.5, M: 74.8, i: 7.6, node: 86.5, P: 79.331002, Pw: 1662.900, Pnode: 3130.302,
    plane: { ra: 288.7, dec: 78.9 } },
  { id: 'miranda', parentId: 'uranus', code: 705, ephemeris: 'URA182',
    a: 129846, e: 0.001, argp: 154.8, M: 73.0, i: 4.4, node: 100.9, P: 1.413479, Pw: 8.939, Pnode: 17.787,
    plane: 'equatorial' },
  { id: 'ariel', parentId: 'uranus', code: 701, ephemeris: 'URA182',
    a: 190929, e: 0.001, argp: 9.6, M: 193.5, i: 0.0, node: 0.0, P: 2.520379, Pw: 28.901, Pnode: 0.000,
    plane: 'equatorial' },
  { id: 'umbriel', parentId: 'uranus', code: 702, ephemeris: 'URA182',
    a: 265986, e: 0.004, argp: 183.4, M: 253.0, i: 0.1, node: 174.8, P: 4.144177, Pw: 64.126, Pnode: 129.945,
    plane: 'equatorial' },
  { id: 'titania', parentId: 'uranus', code: 703, ephemeris: 'URA182',
    a: 436298, e: 0.002, argp: 184.0, M: 68.1, i: 0.1, node: 29.5, P: 8.705869, Pw: 579.928, Pnode: 1644.649,
    plane: 'equatorial' },
  { id: 'oberon', parentId: 'uranus', code: 704, ephemeris: 'URA182',
    a: 583511, e: 0.002, argp: 132.2, M: 143.6, i: 0.1, node: 76.8, P: 13.463237, Pw: 158.604, Pnode: 192.798,
    plane: 'equatorial' },
  { id: 'triton', parentId: 'neptune', code: 801, ephemeris: 'NEP098',
    a: 354800, e: 0.000, argp: 0.0, M: 63.0, i: 157.3, node: 177.7, P: 5.8792, Pw: 675.2, Pnode: 299.4,
    plane: 'equatorial' },
  { id: 'charon', parentId: 'pluto', code: 901, ephemeris: 'PLU060',
    a: 19600, e: 0.000, argp: 0.0, M: 304.1, i: 0.0, node: 0.0, P: 6.387222, Pw: null, Pnode: null,
    plane: 'equatorial' },
];
