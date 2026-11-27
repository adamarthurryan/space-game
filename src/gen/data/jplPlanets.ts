/**
 * JPL "Keplerian Elements for Approximate Positions of the Major Planets" (E. M. Standish),
 * Tables 2a and 2b: valid 3000 BC – 3000 AD (decision S1-3). Transcribed verbatim, in the
 * table's units; all conversion is done in code (S1-15).
 *
 * Source: https://ssd.jpl.nasa.gov/planets/approx_pos.html (retrieved 2026-11-27). That page no
 * longer lists Pluto, so the rows are taken from the earlier text version of the same tables,
 * https://ssd.jpl.nasa.gov/txt/p_elem_t2.txt, as archived at
 * https://web.archive.org/web/20191023173318/https://ssd.jpl.nasa.gov/txt/p_elem_t2.txt.
 * The eight other planets' numbers are identical in both. The recipe is in the archived PDF,
 * https://web.archive.org/web/20210528064645/https://ssd.jpl.nasa.gov/txt/aprx_pos_planets.pdf.
 *
 * Elements are relative to the mean ecliptic and equinox of J2000. Each rate is per Julian
 * century of TDB (T = (JD − 2451545)/36525). Earth's row is the Earth–Moon barycentre (S1-4).
 */

export type PlanetId =
  'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto';

export interface PlanetRow {
  id: PlanetId;
  /** au */
  a: number;
  e: number;
  /** Inclination, deg. */
  I: number;
  /** Mean longitude, deg. */
  L: number;
  /** Longitude of perihelion ϖ = ω + Ω, deg. */
  varpi: number;
  /** Longitude of the ascending node Ω, deg. */
  node: number;
  /** au/century */
  aDot: number;
  /** per century */
  eDot: number;
  /** deg/century */
  IDot: number;
  LDot: number;
  varpiDot: number;
  nodeDot: number;
  /**
   * Table 2b: M gains b·T² + c·cos(f·T) + s·sin(f·T), in deg, with f·T in deg. Jupiter–Pluto.
   */
  extra?: { b: number; c: number; s: number; f: number };
}

// prettier-ignore
export const JPL_PLANETS: readonly PlanetRow[] = [
  {
    id: 'mercury', // Mercury
    a: 0.38709843, e: 0.20563661, I: 7.00559432, L: 252.25166724, varpi: 77.45771895, node: 48.33961819,
    aDot: 0.00000000, eDot: 0.00002123, IDot: -0.00590158, LDot: 149472.67486623, varpiDot: 0.15940013, nodeDot: -0.12214182,
  },
  {
    id: 'venus', // Venus
    a: 0.72332102, e: 0.00676399, I: 3.39777545, L: 181.97970850, varpi: 131.76755713, node: 76.67261496,
    aDot: -0.00000026, eDot: -0.00005107, IDot: 0.00043494, LDot: 58517.81560260, varpiDot: 0.05679648, nodeDot: -0.27274174,
  },
  {
    id: 'earth', // EM Bary
    a: 1.00000018, e: 0.01673163, I: -0.00054346, L: 100.46691572, varpi: 102.93005885, node: -5.11260389,
    aDot: -0.00000003, eDot: -0.00003661, IDot: -0.01337178, LDot: 35999.37306329, varpiDot: 0.31795260, nodeDot: -0.24123856,
  },
  {
    id: 'mars', // Mars
    a: 1.52371243, e: 0.09336511, I: 1.85181869, L: -4.56813164, varpi: -23.91744784, node: 49.71320984,
    aDot: 0.00000097, eDot: 0.00009149, IDot: -0.00724757, LDot: 19140.29934243, varpiDot: 0.45223625, nodeDot: -0.26852431,
  },
  {
    id: 'jupiter', // Jupiter
    a: 5.20248019, e: 0.04853590, I: 1.29861416, L: 34.33479152, varpi: 14.27495244, node: 100.29282654,
    aDot: -0.00002864, eDot: 0.00018026, IDot: -0.00322699, LDot: 3034.90371757, varpiDot: 0.18199196, nodeDot: 0.13024619,
    extra: { b: -0.00012452, c: 0.06064060, s: -0.35635438, f: 38.35125000 },
  },
  {
    id: 'saturn', // Saturn
    a: 9.54149883, e: 0.05550825, I: 2.49424102, L: 50.07571329, varpi: 92.86136063, node: 113.63998702,
    aDot: -0.00003065, eDot: -0.00032044, IDot: 0.00451969, LDot: 1222.11494724, varpiDot: 0.54179478, nodeDot: -0.25015002,
    extra: { b: 0.00025899, c: -0.13434469, s: 0.87320147, f: 38.35125000 },
  },
  {
    id: 'uranus', // Uranus
    a: 19.18797948, e: 0.04685740, I: 0.77298127, L: 314.20276625, varpi: 172.43404441, node: 73.96250215,
    aDot: -0.00020455, eDot: -0.00001550, IDot: -0.00180155, LDot: 428.49512595, varpiDot: 0.09266985, nodeDot: 0.05739699,
    extra: { b: 0.00058331, c: -0.97731848, s: 0.17689245, f: 7.67025000 },
  },
  {
    id: 'neptune', // Neptune
    a: 30.06952752, e: 0.00895439, I: 1.77005520, L: 304.22289287, varpi: 46.68158724, node: 131.78635853,
    aDot: 0.00006447, eDot: 0.00000818, IDot: 0.00022400, LDot: 218.46515314, varpiDot: 0.01009938, nodeDot: -0.00606302,
    extra: { b: -0.00041348, c: 0.68346318, s: -0.10162547, f: 7.67025000 },
  },
  {
    id: 'pluto', // Pluto
    a: 39.48686035, e: 0.24885238, I: 17.14104260, L: 238.96535011, varpi: 224.09702598, node: 110.30167986,
    aDot: 0.00449751, eDot: 0.00006016, IDot: 0.00000501, LDot: 145.18042903, varpiDot: -0.00968827, nodeDot: -0.00809981,
    extra: { b: -0.01262724, c: 0, s: 0, f: 0 }, // Table 2b gives only b for Pluto
  },
];
