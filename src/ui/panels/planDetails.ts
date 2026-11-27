/**
 * The live feedback of a ship's plan (decision S4-17 in planning/sprint-4.md): per node, the Δv,
 * propellant, burn duration (with the long-burn warning), over-budget flag and the resulting
 * orbit or encounter; and the plan's totals. Pure: computed from the world.
 */

import { resources, type ResourceId } from '../../content/resources';
import { apoapsis, elementsFromState, period, periapsis } from '../../orbital/elements';
import { eclipticToPlane, type LocalDv } from '../../orbital/frames';
import { getBody } from '../../sim/body';
import { planBudget, type NodeId } from '../../sim/maneuver';
import type { ShipId } from '../../sim/ship';
import type { Segment } from '../../sim/trajectory';
import type { World } from '../../sim/world';
import { formatCountdown, formatDistance, formatDuration } from '../format';

/** A burn longer than this share of the pre-burn orbit's period is flagged (S4-17). */
export const LONG_BURN_FRACTION = 0.1;

export type NodeResult =
  | {
      kind: 'encounter';
      bodyName: string;
      periapsisAlt: number;
      /** s from now to the SOI entry. */
      in: number;
      impact: boolean;
    }
  | {
      kind: 'orbit';
      parentName: string;
      periapsisAlt: number;
      apoapsisAlt?: number;
      i: number;
      period?: number;
      escape: boolean;
    }
  | { kind: 'none' };

export interface NodeDetails {
  nodeId: NodeId;
  t: number;
  /** s from now. */
  countdown: number;
  reached: boolean;
  enabled: boolean;
  dv: LocalDv;
  dvRequested: number;
  dvApplied: number;
  overBudget: boolean;
  propellant: { resource: ResourceId; name: string; mass: number }[];
  burnDuration: number;
  longBurn: boolean;
  /** The pre-burn orbit's period, if it is closed. */
  prePeriod?: number;
  result: NodeResult;
}

export interface PlanDetails {
  nodes: NodeDetails[];
  dvPlanned: number;
  dvAvailable: number;
  dvLeft: number;
  overBudget: boolean;
}

/** Elements of a segment's start, with i measured from the parent's equator if it has one. */
function segmentElements(world: World, seg: Segment) {
  const parent = getBody(world.system, seg.parentId);
  const pole = parent.rotation?.pole;
  const s = { r: seg.r0, v: seg.v0 };
  const el = elementsFromState(
    parent.mu,
    pole ? { r: eclipticToPlane(pole, s.r), v: eclipticToPlane(pole, s.v) } : s,
  );
  return { parent, el };
}

/** The result of the node that ends segment i: the next encounter before the next node, or the orbit. */
function resultAfter(world: World, segments: readonly Segment[], i: number, t: number): NodeResult {
  for (let j = i + 1; j < segments.length; j++) {
    const seg = segments[j]!;
    if (seg.endEvent === 'soi-enter') {
      const entered = segments[j + 1];
      if (!entered) break;
      const { parent, el } = segmentElements(world, entered);
      return {
        kind: 'encounter',
        bodyName: parent.name,
        periapsisAlt: periapsis(el) - parent.radius,
        in: seg.tEnd - t,
        impact: entered.endEvent === 'impact',
      };
    }
    if (seg.endEvent === 'maneuver' || seg.endEvent === 'soi-exit') break;
  }
  const next = segments[i + 1];
  if (!next) return { kind: 'none' };
  const { parent, el } = segmentElements(world, next);
  const escape = el.e >= 1;
  return {
    kind: 'orbit',
    parentName: parent.name,
    periapsisAlt: periapsis(el) - parent.radius,
    ...(escape ? {} : { apoapsisAlt: apoapsis(el) - parent.radius, period: period(parent.mu, el) }),
    i: el.i,
    escape,
  };
}

export function planDetails(world: World, shipId: ShipId, t: number): PlanDetails {
  const ship = world.ships[shipId];
  const traj = world.derived.trajectories[shipId];
  if (!ship || !traj) throw new Error(`Unknown ship: ${shipId}`);
  const budget = planBudget(ship, traj);
  const segments = traj.segments;
  const nodes = ship.plan.map((node, k): NodeDetails => {
    const b = budget.nodes[k]!;
    const i = segments.findIndex((s) => s.endNodeId === node.id);
    let prePeriod: number | undefined;
    if (i >= 0) {
      const { parent, el } = segmentElements(world, segments[i]!);
      const P = period(parent.mu, el);
      if (Number.isFinite(P)) prePeriod = P;
    }
    return {
      nodeId: node.id,
      t: node.t,
      countdown: node.t - t,
      reached: b.reached,
      enabled: node.enabled,
      dv: node.dv,
      dvRequested: b.dvRequested,
      dvApplied: b.dvApplied,
      overBudget: b.overBudget,
      propellant: (Object.entries(b.propellantUsed) as [ResourceId, number][]).map(
        ([resource, mass]) => ({ resource, name: resources[resource].name, mass }),
      ),
      burnDuration: b.burnDuration,
      longBurn: prePeriod !== undefined && b.burnDuration > LONG_BURN_FRACTION * prePeriod,
      ...(prePeriod !== undefined ? { prePeriod } : {}),
      result: i >= 0 && node.enabled ? resultAfter(world, segments, i, t) : { kind: 'none' },
    };
  });
  return {
    nodes,
    dvPlanned: budget.dvPlanned,
    dvAvailable: budget.dvAvailable,
    dvLeft: budget.dvLeft,
    overBudget: budget.dvLeft < 0,
  };
}

/** `Moon encounter, Pe 230 km, in 3 d 4 h`; `Moon impact in 3 d 4 h`; `Earth orbit, Pe …`. */
export function resultText(r: NodeResult): string {
  switch (r.kind) {
    case 'encounter':
      return r.impact
        ? `${r.bodyName} impact in ${formatCountdown(r.in)}`
        : `${r.bodyName} encounter, Pe ${formatDistance(r.periapsisAlt)}, in ${formatCountdown(r.in)}`;
    case 'orbit':
      return r.escape
        ? `${r.parentName} escape, Pe ${formatDistance(r.periapsisAlt)}`
        : `${r.parentName} orbit, Pe ${formatDistance(r.periapsisAlt)}, Ap ${formatDistance(
            r.apoapsisAlt ?? 0,
          )}, period ${formatDuration(r.period ?? 0)}`;
    case 'none':
      return 'No result: the node is disabled or not reached';
  }
}
