/**
 * Physical data for the bodies of the real solar system, transcribed verbatim in the sources'
 * units (S1-15).
 *
 * - GM (km³/s²), the body's own and not its system's (S1-9): the Sun, the planets and Pluto from
 *   DE440 (NAIF gm_de440.tpc, https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/gm_de440.tpc);
 *   the moons from JPL's satellite physical parameters (https://ssd.jpl.nasa.gov/sats/phys_par/).
 * - Mean radius (km): the planets and Pluto from JPL's planetary physical parameters
 *   (https://ssd.jpl.nasa.gov/planets/phys_par.html); the moons from the satellite page; the Sun
 *   is the IAU nominal radius.
 * - Atmosphere height (km above the radius): game values for sprint 3's impact check, not data.
 * - Rotation (S1-16): the IAU WGCCRE 2015 report (Archinal et al. 2018), as given in NAIF's
 *   pck00011.tpc (https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc). Only the
 *   constant terms of the pole, α₀ and δ₀ (deg, ICRF, at J2000), and the constant and linear
 *   terms of the prime meridian, W = W₀ + Ẇ·d (deg, d in days from J2000 TDB), are kept: the
 *   pole's precession, the periodic (nutation) terms and Phobos's quadratic term are dropped.
 *   The IAU's conventions are kept: a planet's north pole is on the north side of the invariable
 *   plane, so Venus and Uranus have Ẇ < 0; dwarf planets use the pole they spin about (the
 *   right-hand rule), so Pluto's Ẇ is positive.
 *
 * All retrieved 2026-11-27.
 */

import type { BodyClass, BodyId } from '../../sim/body';

export interface PhysicalRow {
  id: BodyId;
  name: string;
  class: BodyClass;
  /** JPL/NAIF ID. */
  code: number;
  /** GM, km³/s². */
  gm: number;
  /** Mean radius, km. */
  radius: number;
  /** km above the radius at which an impact happens; a game value. */
  atmosphereHeight: number;
  /** IAU rotation elements: α₀, δ₀ and W₀ in deg, Ẇ in deg/day. */
  rotation: { ra0: number; dec0: number; w0: number; wDot: number };
}

// prettier-ignore
export const PHYSICAL: readonly PhysicalRow[] = [
  { id: 'sun', name: 'Sun', class: 'star', code: 10, gm: 132712440041.27942, radius: 695700, atmosphereHeight: 0, // the radius is the photosphere
    rotation: { ra0: 286.13, dec0: 63.87, w0: 84.176, wDot: 14.1844 } },
  { id: 'mercury', name: 'Mercury', class: 'planet', code: 199, gm: 22031.868551400003, radius: 2439.4, atmosphereHeight: 0,
    rotation: { ra0: 281.0103, dec0: 61.4155, w0: 329.5988, wDot: 6.1385108 } },
  { id: 'venus', name: 'Venus', class: 'planet', code: 299, gm: 324858.592, radius: 6051.8, atmosphereHeight: 250,
    rotation: { ra0: 272.76, dec0: 67.16, w0: 160.2, wDot: -1.4813688 } },
  { id: 'earth', name: 'Earth', class: 'planet', code: 399, gm: 398600.43550702266, radius: 6371.0084, atmosphereHeight: 100, // the Kármán line
    rotation: { ra0: 0.0, dec0: 90.0, w0: 190.147, wDot: 360.9856235 } },
  { id: 'mars', name: 'Mars', class: 'planet', code: 499, gm: 42828.37362069909, radius: 3389.50, atmosphereHeight: 125,
    rotation: { ra0: 317.269202, dec0: 54.432516, w0: 176.049863, wDot: 350.891982443297 } },
  { id: 'jupiter', name: 'Jupiter', class: 'planet', code: 599, gm: 126686531.9003704, radius: 69911, atmosphereHeight: 1000, // above the 1-bar radius
    rotation: { ra0: 268.056595, dec0: 64.495303, w0: 284.95, wDot: 870.536 } },
  { id: 'saturn', name: 'Saturn', class: 'planet', code: 699, gm: 37931206.23436167, radius: 58232, atmosphereHeight: 1000, // above the 1-bar radius
    rotation: { ra0: 40.589, dec0: 83.537, w0: 38.9, wDot: 810.7939024 } },
  { id: 'uranus', name: 'Uranus', class: 'planet', code: 799, gm: 5793951.256527211, radius: 25362, atmosphereHeight: 1000, // above the 1-bar radius
    rotation: { ra0: 257.311, dec0: -15.175, w0: 203.81, wDot: -501.1600928 } },
  { id: 'neptune', name: 'Neptune', class: 'planet', code: 899, gm: 6835103.145462294, radius: 24622, atmosphereHeight: 1000, // above the 1-bar radius
    rotation: { ra0: 299.36, dec0: 43.46, w0: 249.978, wDot: 541.1397757 } },
  { id: 'pluto', name: 'Pluto', class: 'dwarf-planet', code: 999, gm: 869.6138177608748, radius: 1188.3, atmosphereHeight: 0, // its atmosphere is too thin to matter
    rotation: { ra0: 132.993, dec0: -6.163, w0: 302.695, wDot: 56.3625225 } },
  { id: 'moon', name: 'Moon', class: 'moon', code: 301, gm: 4902.800, radius: 1737.4, atmosphereHeight: 0,
    rotation: { ra0: 269.9949, dec0: 66.5392, w0: 38.3213, wDot: 13.17635815 } },
  { id: 'phobos', name: 'Phobos', class: 'moon', code: 401, gm: 0.0007087, radius: 11.08, atmosphereHeight: 0,
    rotation: { ra0: 317.67071657, dec0: 52.88627266, w0: 35.1877444, wDot: 1128.84475928 } },
  { id: 'deimos', name: 'Deimos', class: 'moon', code: 402, gm: 0.0000962, radius: 6.2, atmosphereHeight: 0,
    rotation: { ra0: 316.65705808, dec0: 53.50992033, w0: 79.39932954, wDot: 285.16188899 } },
  { id: 'io', name: 'Io', class: 'moon', code: 501, gm: 5959.91547, radius: 1821.49, atmosphereHeight: 0,
    rotation: { ra0: 268.05, dec0: 64.5, w0: 200.39, wDot: 203.4889538 } },
  { id: 'europa', name: 'Europa', class: 'moon', code: 502, gm: 3202.71210, radius: 1560.80, atmosphereHeight: 0,
    rotation: { ra0: 268.08, dec0: 64.51, w0: 36.022, wDot: 101.3747235 } },
  { id: 'ganymede', name: 'Ganymede', class: 'moon', code: 503, gm: 9887.83275, radius: 2631.20, atmosphereHeight: 0,
    rotation: { ra0: 268.2, dec0: 64.57, w0: 44.064, wDot: 50.3176081 } },
  { id: 'callisto', name: 'Callisto', class: 'moon', code: 504, gm: 7179.28340, radius: 2410.30, atmosphereHeight: 0,
    rotation: { ra0: 268.72, dec0: 64.83, w0: 259.51, wDot: 21.5710715 } },
  { id: 'mimas', name: 'Mimas', class: 'moon', code: 601, gm: 2.50349, radius: 198.20, atmosphereHeight: 0,
    rotation: { ra0: 40.66, dec0: 83.52, w0: 333.46, wDot: 381.994555 } },
  { id: 'enceladus', name: 'Enceladus', class: 'moon', code: 602, gm: 7.21037, radius: 252.10, atmosphereHeight: 0,
    rotation: { ra0: 40.66, dec0: 83.52, w0: 6.32, wDot: 262.7318996 } },
  { id: 'tethys', name: 'Tethys', class: 'moon', code: 603, gm: 41.21353, radius: 531.10, atmosphereHeight: 0,
    rotation: { ra0: 40.66, dec0: 83.52, w0: 8.95, wDot: 190.6979085 } },
  { id: 'dione', name: 'Dione', class: 'moon', code: 604, gm: 73.11607, radius: 561.40, atmosphereHeight: 0,
    rotation: { ra0: 40.66, dec0: 83.52, w0: 357.6, wDot: 131.5349316 } },
  { id: 'rhea', name: 'Rhea', class: 'moon', code: 605, gm: 153.94175, radius: 763.50, atmosphereHeight: 0,
    rotation: { ra0: 40.38, dec0: 83.55, w0: 235.16, wDot: 79.6900478 } },
  { id: 'titan', name: 'Titan', class: 'moon', code: 606, gm: 8978.13710, radius: 2574.76, atmosphereHeight: 600, // dense atmosphere
    rotation: { ra0: 39.4827, dec0: 83.4279, w0: 186.5855, wDot: 22.5769768 } },
  { id: 'iapetus', name: 'Iapetus', class: 'moon', code: 608, gm: 120.51511, radius: 734.30, atmosphereHeight: 0,
    rotation: { ra0: 318.16, dec0: 75.03, w0: 355.2, wDot: 4.5379572 } },
  { id: 'miranda', name: 'Miranda', class: 'moon', code: 705, gm: 4.3, radius: 235.8, atmosphereHeight: 0,
    rotation: { ra0: 257.43, dec0: -15.08, w0: 30.7, wDot: -254.6906892 } },
  { id: 'ariel', name: 'Ariel', class: 'moon', code: 701, gm: 83.5, radius: 578.9, atmosphereHeight: 0,
    rotation: { ra0: 257.43, dec0: -15.1, w0: 156.22, wDot: -142.8356681 } },
  { id: 'umbriel', name: 'Umbriel', class: 'moon', code: 702, gm: 85.1, radius: 584.7, atmosphereHeight: 0,
    rotation: { ra0: 257.43, dec0: -15.1, w0: 108.05, wDot: -86.8688923 } },
  { id: 'titania', name: 'Titania', class: 'moon', code: 703, gm: 226.9, radius: 788.9, atmosphereHeight: 0,
    rotation: { ra0: 257.43, dec0: -15.1, w0: 77.74, wDot: -41.3514316 } },
  { id: 'oberon', name: 'Oberon', class: 'moon', code: 704, gm: 205.3, radius: 761.4, atmosphereHeight: 0,
    rotation: { ra0: 257.43, dec0: -15.1, w0: 6.77, wDot: -26.7394932 } },
  { id: 'triton', name: 'Triton', class: 'moon', code: 801, gm: 1428.49546, radius: 1352.60, atmosphereHeight: 0,
    rotation: { ra0: 299.36, dec0: 41.17, w0: 296.53, wDot: -61.2572637 } },
  { id: 'charon', name: 'Charon', class: 'moon', code: 901, gm: 106.1, radius: 606.0, atmosphereHeight: 0,
    rotation: { ra0: 132.993, dec0: -6.163, w0: 122.695, wDot: 56.3625225 } },
];
