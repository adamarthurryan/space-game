/**
 * The real solar system at any epoch from 3000 BC to 3000 AD.
 *
 * - Planets come from JPL Tables 2a and 2b, evaluated at the epoch and stored as the elements
 *   at t = 0 plus linear rates (decision S1-3). Earth sits on the Earth–Moon barycentre's orbit
 *   (S1-4), and Pluto on its system barycentre's.
 * - Moons come from JPL's satellite mean elements, read as given (S1-18), and are propagated
 *   from their epoch (J2000) to the scenario epoch with their mean motion and precession.
 * - Physical data and spin come from `data/physical.ts` (S1-9, S1-16).
 *
 * The data files are in the sources' units; every conversion happens here (S1-15).
 */

import {
  centuriesSinceJ2000,
  J2000_JD,
  jdFromCalendar,
  SECONDS_PER_JULIAN_CENTURY,
} from '../math/time';
import {
  AU_KM,
  DEG,
  SECONDS_PER_DAY,
  SECONDS_PER_JULIAN_YEAR,
  TWO_PI,
  wrapTwoPi,
} from '../math/units';
import type { MeanElements, ReferencePlane } from '../orbital/elements';
import { meanElementsAt } from '../orbital/propagate';
import { buildBodySystem, type BodyInput, type BodySystem } from '../sim/body';
import { JPL_PLANETS, type PlanetRow } from './data/jplPlanets';
import { PHYSICAL, type PhysicalRow } from './data/physical';
import { JPL_SATELLITES, type SatelliteRow } from './data/satellites';

/** 3000 BC Jan 1 – 3000 AD Dec 31, 0h TDB: the validity of Tables 2a and 2b. */
export const REAL_SYSTEM_RANGE_JD: readonly [min: number, max: number] = [
  jdFromCalendar({ year: -2999, month: 1, day: 1, hour: 0, minute: 0, second: 0 }),
  jdFromCalendar({ year: 3000, month: 12, day: 31, hour: 0, minute: 0, second: 0 }),
];

/** deg per century → rad per second. */
const DEG_PER_CENTURY = DEG / SECONDS_PER_JULIAN_CENTURY;

/**
 * A Table 2a/2b row evaluated at epochJd, as mean elements with rates (S1-3).
 *
 * ω = ϖ − Ω and M = L − ϖ + bT² + c·cos(fT) + s·sin(fT). n is dM/dt at the epoch, extra terms
 * included, and the other rates are the table's. Linearising the extra terms is only good near
 * the epoch: see the linearisation test.
 */
export function planetMeanElements(row: PlanetRow, epochJd: number): MeanElements {
  const T = centuriesSinceJ2000(epochJd);
  const x = row.extra ?? { b: 0, c: 0, s: 0, f: 0 };
  const fT = x.f * T * DEG; // f is in deg per century
  const L = row.L + row.LDot * T;
  const varpi = row.varpi + row.varpiDot * T;
  const node = row.node + row.nodeDot * T;
  const M = L - varpi + x.b * T * T + x.c * Math.cos(fT) + x.s * Math.sin(fT);
  // dM/dT in deg/century; the periodic terms' derivative needs f in rad per century.
  const MDot =
    row.LDot - row.varpiDot + 2 * x.b * T + (-x.c * Math.sin(fT) + x.s * Math.cos(fT)) * x.f * DEG;

  return {
    a: (row.a + row.aDot * T) * AU_KM,
    e: row.e + row.eDot * T,
    i: (row.I + row.IDot * T) * DEG,
    lan: wrapTwoPi(node * DEG),
    argp: wrapTwoPi((varpi - node) * DEG),
    meanAnomaly: wrapTwoPi(M * DEG),
    meanMotion: MDot * DEG_PER_CENTURY,
    rates: {
      a: (row.aDot * AU_KM) / SECONDS_PER_JULIAN_CENTURY,
      e: row.eDot / SECONDS_PER_JULIAN_CENTURY,
      i: row.IDot * DEG_PER_CENTURY,
      lan: row.nodeDot * DEG_PER_CENTURY,
      argp: (row.varpiDot - row.nodeDot) * DEG_PER_CENTURY,
    },
  };
}

const PHYSICAL_BY_ID = new Map(PHYSICAL.map((p) => [p.id, p]));

function physicalOf(id: string): PhysicalRow {
  const p = PHYSICAL_BY_ID.get(id);
  if (!p) throw new Error(`No physical data for ${id}`);
  return p;
}

/** A satellite's reference plane: none for the ecliptic, else a pole in ICRF. */
function satellitePlane(row: SatelliteRow): ReferencePlane | undefined {
  if (row.plane === 'ecliptic') return undefined;
  if (row.plane === 'equatorial') {
    // The planet's equator, with its pole on the side the planet spins about (S1-18). For a
    // retrograde rotator (Ẇ < 0, Uranus) that is opposite the IAU north pole; Horizons puts the
    // Uranian moons at i ≈ 180° to the IAU pole, and JPL's table at i ≈ 0.
    const parent = physicalOf(row.parentId).rotation;
    const flip = parent.wDot < 0;
    return {
      poleRa: (parent.ra0 + (flip ? 180 : 0)) * DEG,
      poleDec: (flip ? -parent.dec0 : parent.dec0) * DEG,
    };
  }
  return { poleRa: row.plane.ra * DEG, poleDec: row.plane.dec * DEG };
}

/**
 * A satellite row propagated from its epoch (J2000) to epochJd (S1-18). P is the sidereal
 * period, the period of the mean longitude Ω + ω + M, so n = 2π/P − ω̇ − Ω̇. The apse advances
 * (ω̇ = 2π/Pw) and the node regresses (Ω̇ = −2π/Pnode, the other way for a retrograde orbit).
 */
export function satelliteMeanElements(row: SatelliteRow, epochJd: number): MeanElements {
  const i = row.i * DEG;
  const argpRate = row.Pw ? TWO_PI / (row.Pw * SECONDS_PER_JULIAN_YEAR) : 0;
  const lanRate = row.Pnode
    ? (-Math.sign(Math.cos(i)) * TWO_PI) / (row.Pnode * SECONDS_PER_JULIAN_YEAR)
    : 0;
  const longitudeRate = TWO_PI / (row.P * SECONDS_PER_DAY);

  const atJ2000: MeanElements = {
    a: row.a,
    e: row.e,
    i,
    lan: wrapTwoPi(row.node * DEG),
    argp: wrapTwoPi(row.argp * DEG),
    meanAnomaly: wrapTwoPi(row.M * DEG),
    meanMotion: longitudeRate - argpRate - lanRate,
  };
  if (argpRate || lanRate) {
    atJ2000.rates = {};
    if (argpRate) atJ2000.rates.argp = argpRate;
    if (lanRate) atJ2000.rates.lan = lanRate;
  }
  const plane = satellitePlane(row);
  if (plane) atJ2000.plane = plane;

  return meanElementsAt(atJ2000, (epochJd - J2000_JD) * SECONDS_PER_DAY);
}

function bodyInput(p: PhysicalRow, parentId: string | null, epochJd: number): BodyInput {
  const days = epochJd - J2000_JD;
  return {
    id: p.id,
    name: p.name,
    class: p.class,
    parentId,
    mu: p.gm,
    radius: p.radius,
    atmosphereHeight: p.atmosphereHeight,
    rotation: {
      pole: { poleRa: p.rotation.ra0 * DEG, poleDec: p.rotation.dec0 * DEG },
      // W = W₀ + Ẇ·d, evaluated at the epoch (d in days from J2000).
      w0: wrapTwoPi(((p.rotation.w0 + p.rotation.wDot * days) % 360) * DEG),
      wRate: (p.rotation.wDot * DEG) / SECONDS_PER_DAY,
    },
  };
}

/** Throws RangeError outside REAL_SYSTEM_RANGE_JD. Deterministic: same epoch → deep-equal result. */
export function generateRealSystem(epochJd: number): BodySystem {
  const [min, max] = REAL_SYSTEM_RANGE_JD;
  if (!(epochJd >= min && epochJd <= max)) {
    throw new RangeError(
      `Epoch JD ${epochJd} is outside the real system's range [${min}, ${max}] (3000 BC – 3000 AD)`,
    );
  }

  const inputs: BodyInput[] = [bodyInput(physicalOf('sun'), null, epochJd)];
  for (const row of JPL_PLANETS) {
    inputs.push({
      ...bodyInput(physicalOf(row.id), 'sun', epochJd),
      orbit: planetMeanElements(row, epochJd),
    });
  }
  for (const row of JPL_SATELLITES) {
    inputs.push({
      ...bodyInput(physicalOf(row.id), row.parentId, epochJd),
      orbit: satelliteMeanElements(row, epochJd),
    });
  }
  return buildBodySystem(epochJd, inputs);
}
