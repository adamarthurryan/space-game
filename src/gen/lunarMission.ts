/**
 * A trans-lunar injection found by scanning (decision S4-19 in planning/sprint-4.md). Test-only,
 * like sim/testSystem.ts: the real-system test and the smoke test fly to the Moon by hand with
 * it. It is not a planning tool (those are sprint 7).
 */

import { norm } from '../math/vec3';
import { elementsFromState, periapsis } from '../orbital/elements';
import { getBody, type BodySystem } from '../sim/body';
import type { ManeuverNode } from '../sim/maneuver';
import type { OrbitState } from '../sim/ship';
import { computeTrajectory, type Segment } from '../sim/trajectory';

/** The lunar periapsis the scan aims for, and the band it accepts, km above the surface. */
export const TLI_TARGET_ALTITUDE = 200;
export const TLI_BAND: readonly [number, number] = [100, 300];
/** A direct transfer: the Moon's SOI is entered within this long of the burn, s. */
export const MAX_TOF = 6 * 86_400;

export interface Tli {
  /** Seconds after the start state's t. */
  dt: number;
  /** Prograde Δv, km/s. */
  dv: number;
  /** Lunar periapsis altitude, km. */
  lunarPeriapsisAltitude: number;
  /** The Moon SOI entry time, absolute. */
  tEnter: number;
}

export const tliNode = (
  start: OrbitState,
  tli: Pick<Tli, 'dt' | 'dv'>,
  id = 'tli',
): ManeuverNode => ({
  id,
  t: start.t + tli.dt,
  enabled: true,
  dv: { prograde: tli.dv, normal: 0, radial: 0 },
  execution: 'impulsive',
});

/** The lunar arrival of a single-node plan: the Moon-centred segment's periapsis altitude. */
export function lunarArrival(
  sys: BodySystem,
  start: OrbitState,
  node: ManeuverNode,
  maxTof = MAX_TOF,
): { altitude: number; tEnter: number; segments: Segment[] } | null {
  const segments = computeTrajectory(sys, start, {
    plan: [node],
    maxSegments: 3,
    horizonCap: node.t - start.t + maxTof,
  });
  const i = segments.findIndex((s) => s.endEvent === 'soi-enter' && s.endTargetId === 'moon');
  const lunar = segments[i + 1];
  if (i < 0 || !lunar) return null;
  const moon = getBody(sys, 'moon');
  const el = elementsFromState(moon.mu, { r: lunar.r0, v: lunar.v0 });
  if (norm(lunar.r0) === 0) return null;
  return { altitude: periapsis(el) - moon.radius, tEnter: lunar.tStart, segments };
}

/**
 * Scans departure times over one orbit of `start` (every `dtStep` s). For each, it steps the
 * prograde Δv over [dvMin, dvMax] (every `dvStep` km/s), and bisects every bracket of the lunar
 * periapsis altitude around the target. Returns the cheapest Δv found, with the time rounded to
 * whole seconds and the Δv to 1 mm/s (so the smoke test can type them), or null. Deterministic.
 */
export function findTli(
  sys: BodySystem,
  start: OrbitState,
  opts: { dtStep?: number; dvMin?: number; dvMax?: number; dvStep?: number } = {},
): Tli | null {
  const { dtStep = 60, dvMin = 3.0, dvMax = 3.3, dvStep = 0.002 } = opts;
  const mu = getBody(sys, start.parentId).mu;
  const r = norm(start.r);
  const period = 2 * Math.PI * Math.sqrt((r * r * r) / mu);
  const alt = (dt: number, dv: number) =>
    lunarArrival(sys, start, tliNode(start, { dt, dv }))?.altitude ?? null;
  let best: Tli | null = null;
  for (let dt = dtStep; dt <= period; dt += dtStep) {
    let prev: { dv: number; f: number } | null = null;
    for (let k = 0; dvMin + k * dvStep <= dvMax + 1e-12; k++) {
      const dv = dvMin + k * dvStep;
      const a = alt(dt, dv);
      const cur = a === null ? null : { dv, f: a - TLI_TARGET_ALTITUDE };
      if (prev && cur && Math.sign(prev.f) !== Math.sign(cur.f)) {
        let [lo, hi] = [prev, cur];
        for (let i = 0; i < 40; i++) {
          const mid = (lo.dv + hi.dv) / 2;
          const m = alt(dt, mid);
          if (m === null) break;
          const f = m - TLI_TARGET_ALTITUDE;
          if (Math.sign(f) === Math.sign(lo.f)) lo = { dv: mid, f };
          else hi = { dv: mid, f };
        }
        const dvR = Math.round(((lo.dv + hi.dv) / 2) * 1e6) / 1e6;
        const got = lunarArrival(sys, start, tliNode(start, { dt, dv: dvR }));
        if (
          got &&
          got.altitude >= TLI_BAND[0] &&
          got.altitude <= TLI_BAND[1] &&
          (!best || dvR < best.dv)
        ) {
          best = { dt, dv: dvR, lunarPeriapsisAltitude: got.altitude, tEnter: got.tEnter };
        }
      }
      prev = cur;
    }
  }
  return best;
}

/**
 * The TLI the smoke test types in (S4-19): `findTli` from 'leo-lunar-plane' spawned at the
 * sandbox epoch, as a time after the spawn and a prograde Δv. The unit test checks it still
 * gives a Moon encounter, from a spawn at t = 0 and a few seconds later.
 */
export const SMOKE_TLI = { dt: 3600, dv: 3.130535 } as const;
