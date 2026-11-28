/**
 * Ships (decisions S3-4 to S3-6 in planning/sprint-3.md). A ship is plain data: its identity,
 * the modules copied from its design, a propellant stock, a status, and its orbit as the state
 * at the start of its current trajectory segment. Mass, propellant and Δv are derived on demand
 * from the content, and never stored.
 */

import { registry as contentRegistry, type Registry } from '../content/registry';
import type { ResourceId } from '../content/resources';
import type { DesignId, ModuleId, ModuleInstance, ShipDesign } from '../content/types';
import { G0 } from '../math/units';
import type { Vec3 } from '../math/vec3';
import type { StateVector } from '../orbital/elements';
import { propagateInto } from '../orbital/propagate';
import { getBody, type BodyId, type BodySystem } from './body';
import type { ManeuverNode } from './maneuver';

export type ShipId = string;

/** A state relative to a body at a time (S3-6). The parent must be a major body. */
export interface OrbitState {
  parentId: BodyId;
  t: number;
  r: Vec3;
  v: Vec3;
}

export type ShipStatus = 'coasting' | 'destroyed';

export interface Ship {
  id: ShipId;
  /** Creation number: palette and ordering. */
  seq: number;
  name: string;
  /** Display only (S3-4). */
  designId: DesignId;
  backboneId: ModuleId;
  modules: ModuleInstance[];
  /** kg, copied from the design. */
  payload: number;
  /** kg per resource. */
  propellant: Partial<Record<ResourceId, number>>;
  status: ShipStatus;
  destroyedAt?: { t: number; bodyId: BodyId };
  /** The state at the start of the current segment (S3-6). */
  orbit: OrbitState;
  /** Maneuver nodes, sorted by t (S4-1). */
  plan: ManeuverNode[];
}

const cloneOrbit = (o: OrbitState): OrbitState => ({
  parentId: o.parentId,
  t: o.t,
  r: { ...o.r },
  v: { ...o.v },
});

/** A ship built from `design`, with full tanks. */
export function createShip(
  id: ShipId,
  seq: number,
  name: string,
  design: ShipDesign,
  orbit: OrbitState,
  reg: Registry = contentRegistry,
): Ship {
  const propellant: Partial<Record<ResourceId, number>> = {};
  for (const inst of design.modules) {
    const m = reg.byId(inst.moduleId);
    if (m?.category === 'tank') {
      propellant[m.resource] = (propellant[m.resource] ?? 0) + m.capacity * inst.count;
    }
  }
  return {
    id,
    seq,
    name,
    designId: design.id,
    backboneId: design.backboneId,
    modules: design.modules.map((m) => ({ moduleId: m.moduleId, count: m.count })),
    payload: design.payload,
    propellant,
    status: 'coasting',
    orbit: cloneOrbit(orbit),
    plan: [],
  };
}

export interface EngineStats {
  moduleId: ModuleId;
  count: number;
  /** N, total for the count. */
  thrust: number;
  isp: number;
}

export interface ShipStats {
  payload: number;
  /** Backbone + modules + payload, kg. */
  dryMass: number;
  propellantMass: number;
  wetMass: number;
  /** The backbone's limit, kg. */
  maxMass: number;
  /** Module volume, m³. */
  volume: number;
  maxVolume: number;
  engines: EngineStats[];
  /** N, all engines together. */
  thrust: number;
  /** Combined Isp, s: ΣF / Σ(F/Isp). */
  isp: number;
  /** The most the engines can burn at their combined mixture, kg. */
  usablePropellant: number;
  /** km/s. */
  dv: number;
  /** km/s², at the current mass. */
  acceleration: number;
  /** Mass fraction of each propellant in the combined flow of all engines (sums to 1). */
  mixture: Partial<Record<ResourceId, number>>;
}

/** Mass, propellant and Δv from the modules, with every engine firing together (S3-5). */
export function shipStats(ship: Ship, reg: Registry = contentRegistry): ShipStats {
  const backbone = reg.byId(ship.backboneId);
  let dryMass = (backbone?.mass ?? 0) + ship.payload;
  let volume = 0;
  const engines: EngineStats[] = [];
  let thrust = 0;
  let flow = 0; // Σ F/Isp
  const mixture: Partial<Record<ResourceId, number>> = {};
  for (const inst of ship.modules) {
    const m = reg.byId(inst.moduleId);
    if (!m || m.category === 'backbone') continue;
    dryMass += m.mass * inst.count;
    volume += m.volume * inst.count;
    if (m.category !== 'engine') continue;
    const F = m.thrust * inst.count;
    engines.push({ moduleId: m.id, count: inst.count, thrust: F, isp: m.isp });
    thrust += F;
    flow += F / m.isp;
    for (const [r, fraction] of Object.entries(m.propellant) as [ResourceId, number][]) {
      mixture[r] = (mixture[r] ?? 0) + (F / m.isp) * fraction;
    }
  }

  let propellantMass = 0;
  for (const kg of Object.values(ship.propellant)) propellantMass += kg ?? 0;
  const wetMass = dryMass + propellantMass;

  let usable = flow > 0 ? Infinity : 0;
  const fractions: Partial<Record<ResourceId, number>> = {};
  for (const [r, w] of Object.entries(mixture) as [ResourceId, number][]) {
    const fraction = w / flow;
    fractions[r] = fraction;
    if (fraction > 0) usable = Math.min(usable, (ship.propellant[r] ?? 0) / fraction);
  }
  if (!Number.isFinite(usable)) usable = 0;
  const isp = flow > 0 ? thrust / flow : 0;
  const dv = usable > 0 ? isp * G0 * Math.log(wetMass / (wetMass - usable)) : 0;

  return {
    payload: ship.payload,
    dryMass,
    propellantMass,
    wetMass,
    maxMass: backbone?.category === 'backbone' ? backbone.maxMass : 0,
    volume,
    maxVolume: backbone?.category === 'backbone' ? backbone.maxVolume : 0,
    engines,
    thrust,
    isp,
    usablePropellant: usable,
    dv,
    // N / kg = m/s²; ÷ 1000 for km/s².
    acceleration: wetMass > 0 ? thrust / wetMass / 1000 : 0,
    mixture: fractions,
  };
}

/** The ship's state relative to orbit.parentId at t (propagated from its orbit). */
export function shipStateAt(
  sys: BodySystem,
  ship: Ship,
  t: number,
  out: StateVector = { r: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 } },
): StateVector {
  const { orbit } = ship;
  return propagateInto(out, getBody(sys, orbit.parentId).mu, orbit, t - orbit.t);
}
