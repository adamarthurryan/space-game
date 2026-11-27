/**
 * Read-only lookups over the content (docs/architecture.md, "Content files"), and
 * `validateContent`, which checks what types can't.
 */

import { designs } from './designs';
import { backbones } from './modules/backbones';
import { engines } from './modules/engines';
import { tanks } from './modules/tanks';
import type { Backbone, DesignId, Engine, Module, ModuleId, ShipDesign, Tank } from './types';

export interface Registry {
  modules: readonly Module[];
  backbones: readonly Backbone[];
  engines: readonly Engine[];
  tanks: readonly Tank[];
  designs: readonly ShipDesign[];
  byId(id: ModuleId): Module | undefined;
  design(id: DesignId): ShipDesign | undefined;
}

/** A registry over a content set. */
export function createRegistry(
  modules: readonly Module[],
  designList: readonly ShipDesign[],
): Registry {
  const moduleMap = new Map(modules.map((m) => [m.id, m]));
  const designMap = new Map(designList.map((d) => [d.id, d]));
  return {
    modules,
    backbones: modules.filter((m): m is Backbone => m.category === 'backbone'),
    engines: modules.filter((m): m is Engine => m.category === 'engine'),
    tanks: modules.filter((m): m is Tank => m.category === 'tank'),
    designs: designList,
    byId: (id) => moduleMap.get(id),
    design: (id) => designMap.get(id),
  };
}

const allModules: readonly Module[] = [...backbones, ...engines, ...tanks];

/** The game's content. */
export const registry: Registry = createRegistry(allModules, designs);

const FRACTION_TOLERANCE = 1e-9;

const positive = (x: number) => Number.isFinite(x) && x > 0;

/** Problems in a content set; [] if valid. */
export function validateContent(
  modules: readonly Module[],
  designList: readonly ShipDesign[],
): string[] {
  const errors: string[] = [];
  const reg = createRegistry(modules, designList);

  const seen = new Set<string>();
  for (const m of modules) {
    if (seen.has(m.id)) errors.push(`duplicate module ID ${m.id}`);
    seen.add(m.id);
  }
  const seenDesigns = new Set<string>();
  for (const d of designList) {
    if (seenDesigns.has(d.id)) errors.push(`duplicate design ID ${d.id}`);
    seenDesigns.add(d.id);
  }

  for (const m of modules) {
    if (!positive(m.mass)) errors.push(`${m.id}: mass must be positive`);
    if (!positive(m.volume)) errors.push(`${m.id}: volume must be positive`);
    switch (m.category) {
      case 'backbone':
        if (!positive(m.maxMass)) errors.push(`${m.id}: maxMass must be positive`);
        if (!positive(m.maxVolume)) errors.push(`${m.id}: maxVolume must be positive`);
        break;
      case 'engine': {
        if (!positive(m.thrust)) errors.push(`${m.id}: thrust must be positive`);
        if (!positive(m.isp)) errors.push(`${m.id}: Isp must be positive`);
        const fractions = Object.values(m.propellant) as number[];
        if (fractions.length === 0) errors.push(`${m.id}: propellant is empty`);
        else {
          const sum = fractions.reduce((a, b) => a + b, 0);
          if (fractions.some((f) => !positive(f)) || Math.abs(sum - 1) > FRACTION_TOLERANCE) {
            errors.push(`${m.id}: propellant fractions sum to ${+sum.toPrecision(9)}, not 1`);
          }
        }
        break;
      }
      case 'tank':
        if (!positive(m.capacity)) errors.push(`${m.id}: capacity must be positive`);
        break;
    }
  }

  for (const d of designList) {
    const backbone = reg.byId(d.backboneId);
    if (!backbone) {
      errors.push(`design ${d.id}: backbone ${d.backboneId} does not exist`);
    } else if (backbone.category !== 'backbone') {
      errors.push(`design ${d.id}: ${d.backboneId} is not a backbone`);
    }
    if (!(d.payload >= 0)) errors.push(`design ${d.id}: payload must not be negative`);

    let mass = backbone?.mass ?? 0;
    let volume = 0;
    let complete = true;
    const stored = new Set<string>();
    const burned = new Set<string>();
    for (const inst of d.modules) {
      if (!Number.isInteger(inst.count) || inst.count <= 0) {
        errors.push(`design ${d.id}: count of ${inst.moduleId} must be a positive integer`);
      }
      const m = reg.byId(inst.moduleId);
      if (!m) {
        errors.push(`design ${d.id}: module ${inst.moduleId} does not exist`);
        complete = false;
        continue;
      }
      if (m.category === 'backbone') {
        errors.push(`design ${d.id}: ${m.id} is a backbone, not a module`);
        continue;
      }
      mass += m.mass * inst.count;
      volume += m.volume * inst.count;
      if (m.category === 'tank') {
        stored.add(m.resource);
        mass += m.capacity * inst.count;
      } else {
        for (const r of Object.keys(m.propellant)) burned.add(r);
      }
    }
    mass += d.payload;
    if (backbone?.category === 'backbone' && complete) {
      if (mass > backbone.maxMass) {
        errors.push(
          `design ${d.id}: ${mass} kg at full load is over its backbone's ${backbone.maxMass} kg`,
        );
      }
      if (volume > backbone.maxVolume) {
        errors.push(`design ${d.id}: ${volume} m³ is over its backbone's ${backbone.maxVolume} m³`);
      }
    }
    for (const r of burned) {
      if (!stored.has(r)) errors.push(`design ${d.id}: no tank for propellant ${r}`);
    }
  }
  return errors;
}
