/**
 * Content types (decision S3-3 in planning/sprint-3.md). Units inside `content/` are fixed by
 * convention: mass in kg, volume in m³, thrust in N, Isp in s. `sim/` converts where needed.
 */

import type { ResourceId } from './resources';

export type ModuleId = string;
export type DesignId = string;

/** Fields every module type shares. */
export interface ModuleBase {
  /** Unique across all module files. */
  id: ModuleId;
  name: string;
  /** Dry mass, kg. */
  mass: number;
  /** m³. A module's volume counts against its backbone's limit; a backbone's own doesn't. */
  volume: number;
  /** Build cost, kg. */
  materials: Partial<Record<ResourceId, number>>;
}

/** The structure a ship is built on: its mass and volume limits. */
export interface Backbone extends ModuleBase {
  category: 'backbone';
  /** The most the ship may mass at full load, kg. */
  maxMass: number;
  /** The most module volume it carries, m³. */
  maxVolume: number;
}

export interface Engine extends ModuleBase {
  category: 'engine';
  /** The engine type. Milestones 3–4 add the others. */
  kind: 'chemical';
  /** N. */
  thrust: number;
  /** s. */
  isp: number;
  /** Mass fraction of each propellant burned, summing to 1. */
  propellant: Partial<Record<ResourceId, number>>;
}

export interface Tank extends ModuleBase {
  category: 'tank';
  resource: ResourceId;
  /** kg. */
  capacity: number;
}

/** Every module type, discriminated by `category`. */
export type Module = Backbone | Engine | Tank;
export type ModuleCategory = Module['category'];

export interface ModuleInstance {
  moduleId: ModuleId;
  count: number;
}

/** A preset ship design (S3-4). */
export interface ShipDesign {
  id: DesignId;
  name: string;
  backboneId: ModuleId;
  modules: readonly ModuleInstance[];
  /** kg of inert mass (no cargo modules until milestone 3). */
  payload: number;
}
