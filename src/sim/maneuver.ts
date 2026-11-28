/**
 * Maneuver nodes (decisions S4-1 to S4-6 in planning/sprint-4.md): impulsive Δv at a set time,
 * in the local orbital frame of the pre-burn state. A ship's plan is a list of nodes sorted by
 * time. The trajectory applies the enabled nodes it reaches, spending the ship's Δv node by node
 * (a node asking for more than is left gets what's left); `planBudget` gives the masses,
 * propellant and burn durations of that spend, and `burnPropellant` deducts it at execution.
 */

import { registry as contentRegistry, type Registry } from '../content/registry';
import type { ResourceId } from '../content/resources';
import { G0 } from '../math/units';
import type { Vec3 } from '../math/vec3';
import type { StateVector } from '../orbital/elements';
import { dvToVector, localOrbitalBasis, type LocalDv, type OrbitalBasis } from '../orbital/frames';
import { bodyPole, getBody, type BodyId, type BodySystem } from './body';
import { shipStats, type Ship } from './ship';
import type { Trajectory } from './trajectory';

export type { LocalDv };
export type NodeId = string;

export interface ManeuverNode {
  id: NodeId;
  t: number;
  enabled: boolean;
  /** km/s, local orbital frame (S4-2). */
  dv: LocalDv;
  /** 'finite' arrives in milestone 3. */
  execution: 'impulsive';
}

/** At most this many nodes per ship (S4-1). */
export const MAX_NODES = 16;
/** A node must be at least this long after now, s (S4-18). */
export const MIN_NODE_LEAD = 1;

export const dvMagnitude = (dv: LocalDv): number => Math.hypot(dv.prograde, dv.normal, dv.radial);

const Z: Vec3 = { x: 0, y: 0, z: 1 };

/** The pole used for the frame of a radial state: the parent's, or the ecliptic's. */
export function fallbackPole(sys: BodySystem, parentId: BodyId): Vec3 {
  return bodyPole(getBody(sys, parentId)) ?? Z;
}

/** The local orbital frame of a pre-burn state relative to `parentId` (S4-2). */
export function nodeBasis(
  sys: BodySystem,
  parentId: BodyId,
  pre: StateVector,
  out?: OrbitalBasis,
): OrbitalBasis {
  return localOrbitalBasis(pre, fallbackPole(sys, parentId), out);
}

/** The Δv vector of a node, scaled to magnitude `dvApplied` (zero for a zero node). */
export function nodeDvVector(
  sys: BodySystem,
  parentId: BodyId,
  pre: StateVector,
  dv: LocalDv,
  dvApplied: number,
  out: Vec3 = { x: 0, y: 0, z: 0 },
): Vec3 {
  dvToVector(nodeBasis(sys, parentId, pre), dv, out);
  const m = dvMagnitude(dv);
  const k = m > 0 ? dvApplied / m : 0;
  // + 0 turns −0 into 0, so the segment survives a JSON round trip unchanged.
  out.x = out.x * k + 0;
  out.y = out.y * k + 0;
  out.z = out.z * k + 0;
  return out;
}

/** The post-burn state: Δv along the node's direction, with magnitude `dvApplied`. */
export function applyNode(
  sys: BodySystem,
  parentId: BodyId,
  pre: StateVector,
  node: ManeuverNode,
  dvApplied: number,
  out: StateVector = { r: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 } },
): StateVector {
  const d = nodeDvVector(sys, parentId, pre, node.dv, dvApplied);
  out.r = { ...pre.r };
  out.v = { x: pre.v.x + d.x, y: pre.v.y + d.y, z: pre.v.z + d.z };
  return out;
}

export interface NodeBudget {
  nodeId: NodeId;
  /** On the trajectory: enabled and applied, or disabled but within it. */
  reached: boolean;
  /** km/s */
  dvRequested: number;
  /** km/s; less than requested when over budget, 0 if disabled or not reached. */
  dvApplied: number;
  overBudget: boolean;
  /** kg */
  massBefore: number;
  propellantUsed: Partial<Record<ResourceId, number>>;
  /** s, at full combined thrust (S4-6). */
  burnDuration: number;
}

export interface PlanBudget {
  nodes: NodeBudget[];
  /** Σ requested Δv of the enabled, reached nodes, km/s. */
  dvPlanned: number;
  /** The ship's Δv now, km/s. */
  dvAvailable: number;
  /** dvAvailable − dvPlanned; negative when over budget. */
  dvLeft: number;
}

/** Exhaust velocity Isp·g0, km/s. */
const exhaust = (isp: number) => isp * G0;

/** Per-node budget along the plan, from the ship's stats and the trajectory's dvApplied (S4-4). */
export function planBudget(
  ship: Ship,
  traj: Trajectory,
  reg: Registry = contentRegistry,
): PlanBudget {
  const stats = shipStats(ship, reg);
  const ve = exhaust(stats.isp);
  // Mass flow at full thrust, kg/s: N / (s · m/s²).
  const mdot = stats.thrust > 0 ? stats.thrust / (stats.isp * G0 * 1000) : 0;
  const applied = new Map<NodeId, number>();
  for (const seg of traj.segments) {
    if (seg.endEvent === 'maneuver' && seg.endNodeId !== undefined) {
      applied.set(seg.endNodeId, seg.dvApplied ?? 0);
    }
  }
  const last = traj.segments[traj.segments.length - 1];
  const tEnd = last ? last.tEnd : -Infinity;

  let mass = stats.wetMass;
  let dvPlanned = 0;
  const nodes: NodeBudget[] = ship.plan.map((node) => {
    const dvRequested = dvMagnitude(node.dv);
    const a = applied.get(node.id);
    const reached = a !== undefined || (!node.enabled && node.t <= tEnd);
    const dvApplied = node.enabled ? (a ?? 0) : 0;
    const massBefore = mass;
    const used: Partial<Record<ResourceId, number>> = {};
    let dm = 0;
    if (dvApplied > 0 && ve > 0) {
      dm = mass * -Math.expm1(-dvApplied / ve);
      mass -= dm;
      for (const [r, f] of Object.entries(stats.mixture) as [ResourceId, number][]) {
        if (f > 0) used[r] = dm * f;
      }
    }
    if (node.enabled && a !== undefined) dvPlanned += dvRequested;
    return {
      nodeId: node.id,
      reached,
      dvRequested,
      dvApplied,
      overBudget: node.enabled && a !== undefined && dvApplied < dvRequested * (1 - 1e-12),
      massBefore,
      propellantUsed: used,
      burnDuration: mdot > 0 ? dm / mdot : 0,
    };
  });
  return { nodes, dvPlanned, dvAvailable: stats.dv, dvLeft: stats.dv - dvPlanned };
}

/**
 * Deducts the propellant for `dv` (km/s) from the ship's tanks at the engines' mixture (S4-6),
 * never more than is usable. Returns the kg used per resource.
 */
export function burnPropellant(
  ship: Ship,
  dv: number,
  reg: Registry = contentRegistry,
): Partial<Record<ResourceId, number>> {
  const stats = shipStats(ship, reg);
  const used: Partial<Record<ResourceId, number>> = {};
  if (!(dv > 0) || !(stats.isp > 0)) return used;
  const dm = Math.min(
    stats.wetMass * -Math.expm1(-dv / exhaust(stats.isp)),
    stats.usablePropellant,
  );
  for (const [r, f] of Object.entries(stats.mixture) as [ResourceId, number][]) {
    if (!(f > 0)) continue;
    const before = ship.propellant[r] ?? 0;
    let left = before - dm * f;
    // Rounding at the end of the limiting tank: an empty tank reads 0, not −1e-10.
    if (left < 1e-9 * Math.max(1, before)) left = 0;
    used[r] = before - left;
    ship.propellant[r] = left;
  }
  return used;
}
