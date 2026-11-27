/**
 * Physical constants, angle helpers and unit conversions.
 *
 * Internal units, used everywhere below `ui/` (decision S0-9): distance in km, time in s,
 * mass in kg, speed in km/s, angles in radians. Display formatting belongs in `ui/`.
 */

// ---- Distance -------------------------------------------------------------------------------

export const M_PER_KM = 1000;
/** Astronomical unit in km (IAU 2012, exact). */
export const AU_KM = 149_597_870.7;

// ---- Time -----------------------------------------------------------------------------------

export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 86_400;
/** Julian year, 365.25 d. */
export const SECONDS_PER_JULIAN_YEAR = 31_557_600;

// ---- Physics --------------------------------------------------------------------------------

/** Gravitational constant in km³ kg⁻¹ s⁻² (CODATA 2018). */
export const G = 6.674_3e-20;
/** Standard gravity in km/s², for the rocket equation. */
export const G0 = 9.806_65e-3;

// ---- Angles ---------------------------------------------------------------------------------

/** One degree in radians. */
export const DEG = Math.PI / 180;
export const TWO_PI = 2 * Math.PI;

export function degToRad(deg: number): number {
  return deg * DEG;
}

export function radToDeg(rad: number): number {
  return rad / DEG;
}

/** Wraps an angle to [0, 2π). */
export function wrapTwoPi(angle: number): number {
  const r = angle % TWO_PI;
  if (r < 0) {
    const w = r + TWO_PI;
    // A tiny negative r rounds up to exactly 2π.
    return w < TWO_PI ? w : 0;
  }
  return r + 0; // −0 → +0
}

/** Wraps an angle to (−π, π]. */
export function wrapPi(angle: number): number {
  const r = wrapTwoPi(angle);
  return r > Math.PI ? r - TWO_PI : r;
}

// ---- Conversions to and from internal units ------------------------------------------------

export type DistanceUnit = 'm' | 'km' | 'AU';
export type SpeedUnit = 'm/s' | 'km/s';
export type MassUnit = 'kg' | 't';
export type DurationUnit = 's' | 'min' | 'h' | 'd' | 'yr';

/** Size of one of each unit, in internal units. */
const KM_PER: Record<DistanceUnit, number> = { m: 1 / M_PER_KM, km: 1, AU: AU_KM };
const KMPS_PER: Record<SpeedUnit, number> = { 'm/s': 1 / M_PER_KM, 'km/s': 1 };
const KG_PER: Record<MassUnit, number> = { kg: 1, t: 1000 };
const S_PER: Record<DurationUnit, number> = {
  s: 1,
  min: SECONDS_PER_MINUTE,
  h: SECONDS_PER_HOUR,
  d: SECONDS_PER_DAY,
  yr: SECONDS_PER_JULIAN_YEAR,
};

// Conversions to the smaller unit divide by its size in internal units rather than multiply by
// the reciprocal, so that m ↔ km round trips are exact.

export function toKm(value: number, unit: DistanceUnit): number {
  return unit === 'm' ? value / M_PER_KM : value * KM_PER[unit];
}

export function fromKm(km: number, unit: DistanceUnit): number {
  return unit === 'm' ? km * M_PER_KM : km / KM_PER[unit];
}

export function toKmPerS(value: number, unit: SpeedUnit): number {
  return unit === 'm/s' ? value / M_PER_KM : value * KMPS_PER[unit];
}

export function fromKmPerS(kmps: number, unit: SpeedUnit): number {
  return unit === 'm/s' ? kmps * M_PER_KM : kmps / KMPS_PER[unit];
}

export function toKg(value: number, unit: MassUnit): number {
  return value * KG_PER[unit];
}

export function fromKg(kg: number, unit: MassUnit): number {
  return kg / KG_PER[unit];
}

export function toSeconds(value: number, unit: DurationUnit): number {
  return value * S_PER[unit];
}

export function fromSeconds(s: number, unit: DurationUnit): number {
  return s / S_PER[unit];
}
