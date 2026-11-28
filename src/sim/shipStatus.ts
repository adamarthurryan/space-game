/**
 * Status flags for the Fleets tab and cycling (decision S6-3 in planning/sprint-6.md): idle, low
 * propellant, impact predicted, over budget, alarmed and in trouble, plus the next event for the
 * row's countdown. Pure.
 */

import { registry as contentRegistry, type Registry } from '../content/registry';
import { alarmCovers } from './alarms';
import { planBudget } from './maneuver';
import type { Ship, ShipId } from './ship';
import { upcomingEvents, type UpcomingEvent } from './upcoming';
import type { World } from './world';

/** Under this fraction of tank capacity, a ship is low on propellant (S6-3). */
export const LOW_PROPELLANT_FRACTION = 0.1;

export interface ShipStatusFlags {
  /** Coasting with no enabled, reached node ahead. */
  idle: boolean;
  lowPropellant: boolean;
  /** The trajectory ends at an impact. */
  impactPredicted: boolean;
  /** A planned node gets less Δv than it asks for. */
  overBudget: boolean;
  /** A ship, fleet or plan-item alarm covers it; global alarms don't count. */
  alarmed: boolean;
  /** Low propellant, impact predicted or over budget, while coasting. */
  inTrouble: boolean;
  /** The next enabled upcoming event. */
  next: UpcomingEvent | null;
}

const NONE: ShipStatusFlags = {
  idle: false,
  lowPropellant: false,
  impactPredicted: false,
  overBudget: false,
  alarmed: false,
  inTrouble: false,
  next: null,
};

/** Propellant mass over tank capacity, 0–1; 1 for a ship with no tanks. */
export function propellantFraction(ship: Ship, reg: Registry = contentRegistry): number {
  let capacity = 0;
  for (const inst of ship.modules) {
    const m = reg.byId(inst.moduleId);
    if (m?.category === 'tank') capacity += m.capacity * inst.count;
  }
  if (capacity <= 0) return 1;
  const mass = Object.values(ship.propellant).reduce((a, b) => a + (b ?? 0), 0);
  return mass / capacity;
}

export function shipStatus(world: World, shipId: ShipId): ShipStatusFlags {
  const ship = world.ships[shipId];
  const traj = world.derived.trajectories[shipId];
  if (!ship || ship.status !== 'coasting' || !traj) return NONE;
  const events = upcomingEvents(world, shipId).events;
  const next = events.find((e) => e.enabled) ?? null;
  const idle = !events.some((e) => e.kind === 'node' && e.enabled);
  const lowPropellant = propellantFraction(ship) < LOW_PROPELLANT_FRACTION;
  const impactPredicted = traj.segments.at(-1)?.endEvent === 'impact';
  const overBudget = planBudget(ship, traj).nodes.some((n) => n.overBudget);
  const alarmed = Object.values(world.alarms).some(
    (a) => a.enabled && a.scope.kind !== 'global' && alarmCovers(world, a, shipId),
  );
  return {
    idle,
    lowPropellant,
    impactPredicted,
    overBudget,
    alarmed,
    inTrouble: lowPropellant || impactPredicted || overBudget,
    next,
  };
}
