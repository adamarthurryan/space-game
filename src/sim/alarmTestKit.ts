/**
 * Shared set-up for the alarm tests (sprint 6): ships on the synthetic system, and a run of the
 * clock until it pauses. Test-only.
 */

import { registry } from '../content/registry';
import { propagate } from '../orbital/propagate';
import { timeToRadius } from '../orbital/soi';
import { vec3 } from '../math/vec3';
import { registerAlarmHandlers } from './alarms';
import { createEventRegistry, registerShipHandlers } from './events';
import type { ManeuverNode } from './maneuver';
import { createShip, type OrbitState } from './ship';
import { MOON_A, MU_PLANET, moonMeanMotion, syntheticSystem } from './testSystem';
import { addShip, advanceWorld, createWorld, type World } from './world';

export const reg = createEventRegistry();
registerShipHandlers(reg);
registerAlarmHandlers(reg);

const R = 7000;
const V = Math.sqrt(MU_PLANET / R);
export const leo: OrbitState = { parentId: 'planet', t: 0, r: vec3(R, 0, 0), v: vec3(0, V, 0) };
export const escape: OrbitState = { ...leo, v: vec3(0, V * 1.45, 0) };

/** A transfer from a 6700 km periapsis on +x to a 420,000 km apoapsis, in the moon's plane. */
export const transfer: OrbitState = (() => {
  const rp = 6700;
  const a = (rp + 420_000) / 2;
  return {
    parentId: 'planet',
    t: 0,
    r: vec3(rp, 0, 0),
    v: vec3(0, Math.sqrt(MU_PLANET * (2 / rp - 1 / a)), 0),
  };
})();

/** The moon phase that puts the moon just ahead of `transfer` when it reaches the moon's orbit. */
export function encounterPhase(delta = 0.01): number {
  const s = { r: transfer.r, v: transfer.v };
  const dt = timeToRadius(MU_PLANET, s, MOON_A, 'outbound')!;
  const p = propagate(MU_PLANET, s, dt).r;
  return Math.atan2(p.y, p.x) + delta - moonMeanMotion * dt;
}

export const node = (id: string, t: number, prograde: number, enabled = true): ManeuverNode => ({
  id,
  t,
  enabled,
  dv: { prograde, normal: 0, radial: 0 },
  execution: 'impulsive',
});

/** A world with ships `ship-1`, `ship-2`, … on the given orbits and plans. */
export function alarmWorld(
  ships: { orbit: OrbitState; plan?: ManeuverNode[] }[],
  moonPhase = 0,
): World {
  const w = createWorld(syntheticSystem(moonPhase), 0);
  for (const s of ships) addTestShip(w, s.orbit, s.plan);
  return w;
}

export function addTestShip(w: World, orbit: OrbitState, plan: ManeuverNode[] = []): string {
  const seq = w.nextShipSeq;
  const ship = createShip(`ship-${seq}`, seq, `S${seq}`, registry.designs[0]!, orbit);
  ship.plan = plan;
  addShip(w, ship);
  return ship.id;
}

/** Runs ×10⁷ frames until the clock pauses (or `limit` frames). */
export function runUntilPaused(w: World, limit = 1e5): void {
  w.clock.warpIndex = 7;
  w.clock.paused = false;
  for (let i = 0; i < limit && !w.clock.paused; i++) advanceWorld(w, 1 / 60, reg);
}
