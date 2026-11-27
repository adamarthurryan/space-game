/**
 * Derived values for the ship inspector and the Fleets list (decision S3-21 in
 * planning/sprint-3.md). Pure, so it's tested in the node environment.
 */

import { registry } from '../../content/registry';
import { resources, type ResourceId } from '../../content/resources';
import { norm } from '../../math/vec3';
import {
  apoapsis,
  elementsFromState,
  periapsis,
  period,
  type StateVector,
} from '../../orbital/elements';
import { eclipticToPlane } from '../../orbital/frames';
import { getBody, type BodyId } from '../../sim/body';
import { shipStateAt, shipStats, type ShipId, type ShipStats } from '../../sim/ship';
import type { SegmentEnd } from '../../sim/trajectory';
import type { World } from '../../sim/world';

export interface ShipDetails {
  name: string;
  designName: string;
  status: 'coasting' | 'destroyed';
  destroyed?: { t: number; bodyName: string };
  stats: ShipStats;
  propellant: { resource: ResourceId; name: string; mass: number; capacity: number }[];
  orbit?: {
    parentId: BodyId;
    /** Distances from the parent's centre, km. */
    periapsis: number;
    apoapsis?: number;
    e: number;
    /** From the parent's equator if it has a pole, else from the ecliptic. */
    i: number;
    inclinationPlane: 'equator' | 'ecliptic';
    period?: number;
    escape: boolean;
    /** Current distance from the parent and speed relative to it. */
    distance: number;
    speed: number;
  };
  /** Upcoming events from the trajectory, excluding the horizon. */
  events: { kind: SegmentEnd; targetName?: string; t: number }[];
}

/** Tank capacity per resource for the ship's modules. */
function capacities(moduleIds: { moduleId: string; count: number }[]) {
  const out: Partial<Record<ResourceId, number>> = {};
  for (const inst of moduleIds) {
    const m = registry.byId(inst.moduleId);
    if (m?.category === 'tank') out[m.resource] = (out[m.resource] ?? 0) + m.capacity * inst.count;
  }
  return out;
}

export function shipDetails(world: World, id: ShipId, t: number): ShipDetails {
  const ship = world.ships[id];
  if (!ship) throw new Error(`Unknown ship: ${id}`);
  const { system } = world;
  const caps = capacities(ship.modules);
  const propellant = (Object.keys(caps) as ResourceId[]).map((r) => ({
    resource: r,
    name: resources[r].name,
    mass: ship.propellant[r] ?? 0,
    capacity: caps[r] ?? 0,
  }));

  const d: ShipDetails = {
    name: ship.name,
    designName: registry.design(ship.designId)?.name ?? ship.designId,
    status: ship.status,
    stats: shipStats(ship),
    propellant,
    events: [],
  };
  if (ship.destroyedAt) {
    d.destroyed = {
      t: ship.destroyedAt.t,
      bodyName: getBody(system, ship.destroyedAt.bodyId).name,
    };
  }
  if (ship.status !== 'coasting') return d;

  const parent = getBody(system, ship.orbit.parentId);
  const s: StateVector = shipStateAt(system, ship, t);
  const pole = parent.rotation?.pole;
  const el = elementsFromState(
    parent.mu,
    pole ? { r: eclipticToPlane(pole, s.r), v: eclipticToPlane(pole, s.v) } : s,
  );
  const escape = el.e >= 1;
  d.orbit = {
    parentId: parent.id,
    periapsis: periapsis(el),
    e: el.e,
    i: el.i,
    inclinationPlane: pole ? 'equator' : 'ecliptic',
    escape,
    distance: norm(s.r),
    speed: norm(s.v),
  };
  if (!escape) {
    d.orbit.apoapsis = apoapsis(el);
    d.orbit.period = period(parent.mu, el);
  }

  for (const seg of world.derived.trajectories[id]?.segments ?? []) {
    if (seg.endEvent === 'horizon' || seg.tEnd < t) continue;
    const e: ShipDetails['events'][number] = { kind: seg.endEvent, t: seg.tEnd };
    if (seg.endTargetId) e.targetName = getBody(system, seg.endTargetId).name;
    d.events.push(e);
  }
  return d;
}

/** One line for an event: `Moon SOI`, `Sun SOI`, `Impact (Earth)`. */
export function eventLabel(e: { kind: SegmentEnd; targetName?: string }): string {
  return e.kind === 'impact' ? `Impact (${e.targetName ?? '?'})` : `${e.targetName ?? '?'} SOI`;
}
