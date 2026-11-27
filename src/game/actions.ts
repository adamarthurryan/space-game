/**
 * Player actions (decision S3-12 in planning/sprint-3.md). Every player action goes through
 * here: a function `(world, …args) → ActionResult` that checks the rules and changes the world.
 * The store calls them and bumps its version on success. `sim/` holds the mechanisms; actions
 * add the rules.
 */

import { registry } from '../content/registry';
import type { DesignId } from '../content/types';
import { norm } from '../math/vec3';
import { soiRadiusOf } from '../sim/body';
import {
  setPaused,
  setWarpIndex as setClockWarpIndex,
  warpDown as clockWarpDown,
  warpUp as clockWarpUp,
} from '../sim/clock';
import type { LocalDv } from '../orbital/frames';
import { nearestPassage, timeToPassage, type PassageKind } from '../orbital/passages';
import { PAUSABLE_EVENTS, type PausableEvent } from '../sim/clock';
import { fallbackPole, MAX_NODES, MIN_NODE_LEAD, type NodeId } from '../sim/maneuver';
import { createShip, shipStats, type OrbitState, type Ship, type ShipId } from '../sim/ship';
import { computeTrajectory, segmentStateAt, type Segment } from '../sim/trajectory';
import { addShip, refreshShip, type World } from '../sim/world';

export type ActionResult<T = void> = { ok: true; value: T } | { ok: false; error: string };

const ok = (): ActionResult => ({ ok: true, value: undefined });

export function togglePause(world: World): ActionResult {
  setPaused(world.clock, !world.clock.paused);
  return ok();
}

export function warpUp(world: World): ActionResult {
  clockWarpUp(world.clock);
  return ok();
}

export function warpDown(world: World): ActionResult {
  clockWarpDown(world.clock);
  return ok();
}

export function setWarpIndex(world: World, i: number): ActionResult {
  if (!Number.isFinite(i)) return { ok: false, error: `Invalid warp step: ${i}` };
  setClockWarpIndex(world.clock, i);
  return ok();
}

export interface SpawnShipParams {
  designId: DesignId;
  /** Default: `<Design> <seq>`. */
  name?: string;
  orbit: OrbitState;
}

/**
 * Adds a ship with full tanks. Refuses an unknown design or body, a minor-body parent, a
 * non-finite state, or a start outside the parent's SOI, leaving the world unchanged.
 */
export function spawnShip(world: World, p: SpawnShipParams): ActionResult<ShipId> {
  const design = registry.design(p.designId);
  if (!design) return { ok: false, error: `Unknown design: ${p.designId}` };
  const body = world.system.bodies[p.orbit.parentId];
  if (!body) return { ok: false, error: `Unknown body: ${p.orbit.parentId}` };
  if (!body.major) {
    return { ok: false, error: `${body.name} is a minor body: ships can't orbit it (no SOI)` };
  }
  const { r, v, t } = p.orbit;
  if (![r.x, r.y, r.z, v.x, v.y, v.z, t].every(Number.isFinite)) {
    return { ok: false, error: 'The orbit is not a valid state' };
  }
  const soi = soiRadiusOf(body);
  if (norm(r) >= soi) {
    return { ok: false, error: `The start is outside ${body.name}'s sphere of influence` };
  }
  const seq = world.nextShipSeq;
  const id = `ship-${seq}`;
  const name = p.name?.trim() || `${design.name} ${seq}`;
  addShip(world, createShip(id, seq, name, design, p.orbit));
  return { ok: true, value: id };
}

// ---- Maneuver nodes (decisions S4-1 and S4-16 to S4-18 in planning/sprint-4.md) ------------

/** Largest Δv component a node may ask for, km/s (S4-18). */
export const MAX_NODE_DV_COMPONENT = 50;
/** Two nodes of one ship may not be closer than this, s (S4-18). */
export const MIN_NODE_SEPARATION = 1e-3;

export interface NodeEdit {
  t?: number;
  dv?: Partial<LocalDv>;
  enabled?: boolean;
}

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

/** The ship, if it can have nodes. */
function plannable(world: World, shipId: ShipId): Ship | Fail {
  const ship = world.ships[shipId];
  if (!ship) return fail(`Unknown ship: ${shipId}`);
  if (ship.status !== 'coasting') return fail(`${ship.name} is destroyed`);
  return ship;
}
const isFail = (x: Ship | Fail): x is Fail => 'ok' in x;

/** An error for a node time, or null if it is allowed. */
function checkTime(world: World, ship: Ship, t: number, ignore?: NodeId): string | null {
  if (!Number.isFinite(t)) return 'The node time is not a number';
  if (t < world.clock.t + MIN_NODE_LEAD) return 'The node must be in the future';
  const clash = ship.plan.find((n) => n.id !== ignore && Math.abs(n.t - t) < MIN_NODE_SEPARATION);
  if (clash) return 'Another node is at the same time';
  return null;
}

function checkDv(dv: LocalDv): string | null {
  for (const v of [dv.prograde, dv.normal, dv.radial]) {
    if (!Number.isFinite(v)) return 'The Δv is not a number';
    if (Math.abs(v) > MAX_NODE_DV_COMPONENT) {
      return `A Δv component may be at most ${MAX_NODE_DV_COMPONENT} km/s`;
    }
  }
  return null;
}

/** The end of the ship's trajectory: nodes may be added up to it (before an impact). */
function pathEnd(world: World, shipId: ShipId): { t: number; impact: boolean } {
  const last = world.derived.trajectories[shipId]?.segments.at(-1);
  return last
    ? { t: last.tEnd, impact: last.endEvent === 'impact' }
    : { t: -Infinity, impact: false };
}

const sortPlan = (ship: Ship) => ship.plan.sort((a, b) => a.t - b.t);

/** Adds a node to the ship's plan (S4-18). */
export function addNode(
  world: World,
  shipId: ShipId,
  p: { t: number; dv?: LocalDv },
): ActionResult<NodeId> {
  const ship = plannable(world, shipId);
  if (isFail(ship)) return ship;
  if (ship.plan.length >= MAX_NODES) return fail(`A plan may have at most ${MAX_NODES} nodes`);
  const dv = p.dv ?? { prograde: 0, normal: 0, radial: 0 };
  const error = checkTime(world, ship, p.t) ?? checkDv(dv);
  if (error) return fail(error);
  const end = pathEnd(world, shipId);
  if (end.impact ? p.t >= end.t : p.t > end.t) {
    return fail(
      end.impact ? 'The ship impacts before then' : 'That is past the end of the trajectory',
    );
  }
  const id = `node-${world.nextNodeSeq++}`;
  ship.plan.push({ id, t: p.t, enabled: true, dv: { ...dv }, execution: 'impulsive' });
  sortPlan(ship);
  refreshShip(world, shipId);
  return { ok: true, value: id };
}

const PASSAGE_NAMES: Record<PassageKind, string> = {
  periapsis: 'periapsis',
  apoapsis: 'apoapsis',
  'ascending-node': 'ascending node',
  'descending-node': 'descending node',
};

/** The pole AN/DN are measured against: the parent's equator, or the ecliptic (S4-16). */
const nodePole = (world: World, parentId: string) => fallbackPole(world.system, parentId);

/**
 * The first passage of `kind` on `segments` after tFrom (later than tFrom by at least
 * MIN_NODE_LEAD), or null.
 */
function passageOnPath(
  world: World,
  segments: readonly Segment[],
  kind: PassageKind,
  tFrom: number,
): number | null {
  for (const seg of segments) {
    if (seg.tEnd <= tFrom) continue;
    const t0 = Math.max(tFrom, seg.tStart);
    const s = segmentStateAt(world.system, seg, t0);
    const mu = world.system.bodies[seg.parentId]!.mu;
    const minDt = t0 === tFrom ? MIN_NODE_LEAD : 0;
    const dt = timeToPassage(mu, s, kind, nodePole(world, seg.parentId), minDt);
    if (dt !== null && t0 + dt <= seg.tEnd) return t0 + dt;
  }
  return null;
}

/**
 * Adds a node at the next passage of `at` on the planned path after the last enabled node (or
 * after now), or at a given time (S4-16).
 */
export function addNodeAt(
  world: World,
  shipId: ShipId,
  at: PassageKind | { t: number },
): ActionResult<NodeId> {
  if (typeof at === 'object') return addNode(world, shipId, { t: at.t });
  const ship = plannable(world, shipId);
  if (isFail(ship)) return ship;
  const segments = world.derived.trajectories[shipId]?.segments ?? [];
  const reached = new Set(segments.map((s) => s.endNodeId));
  let tFrom = world.clock.t;
  for (const n of ship.plan) if (n.enabled && reached.has(n.id)) tFrom = Math.max(tFrom, n.t);
  const t = passageOnPath(world, segments, at, tFrom);
  if (t === null) return fail(`No ${PASSAGE_NAMES[at]} ahead on the path`);
  return addNode(world, shipId, { t });
}

/** Edits a node's time, Δv or enabled flag (S4-18). The plan is re-sorted. */
export function editNode(
  world: World,
  shipId: ShipId,
  nodeId: NodeId,
  edit: NodeEdit,
): ActionResult {
  const ship = plannable(world, shipId);
  if (isFail(ship)) return ship;
  const node = ship.plan.find((n) => n.id === nodeId);
  if (!node) return fail(`Unknown node: ${nodeId}`);
  if (node.t < world.clock.t + MIN_NODE_LEAD) return fail('The node is about to execute');
  const t = edit.t ?? node.t;
  const dv = { ...node.dv, ...edit.dv };
  const error = (edit.t !== undefined ? checkTime(world, ship, t, nodeId) : null) ?? checkDv(dv);
  if (error) return fail(error);
  node.t = t;
  node.dv = dv;
  if (edit.enabled !== undefined) node.enabled = edit.enabled;
  sortPlan(ship);
  refreshShip(world, shipId);
  return ok();
}

export function deleteNode(world: World, shipId: ShipId, nodeId: NodeId): ActionResult {
  const ship = world.ships[shipId];
  if (!ship) return fail(`Unknown ship: ${shipId}`);
  const i = ship.plan.findIndex((n) => n.id === nodeId);
  if (i < 0) return fail(`Unknown node: ${nodeId}`);
  ship.plan.splice(i, 1);
  refreshShip(world, shipId);
  return ok();
}

/** The ship's trajectory with one node left out (the path the node sits on). */
export function pathWithout(world: World, ship: Ship, nodeId: NodeId): Segment[] {
  return computeTrajectory(world.system, ship.orbit, {
    plan: ship.plan.filter((n) => n.id !== nodeId),
    dvAvailable: shipStats(ship).dv,
  });
}

/** Moves a node to the nearest Pe or Ap of the path it sits on (S4-15). */
export function snapNode(
  world: World,
  shipId: ShipId,
  nodeId: NodeId,
  to: 'periapsis' | 'apoapsis',
): ActionResult {
  const ship = plannable(world, shipId);
  if (isFail(ship)) return ship;
  const node = ship.plan.find((n) => n.id === nodeId);
  if (!node) return fail(`Unknown node: ${nodeId}`);
  const seg = pathWithout(world, ship, nodeId).find((s) => s.tStart <= node.t && node.t <= s.tEnd);
  if (!seg) return fail('The node is not on the trajectory');
  const mu = world.system.bodies[seg.parentId]!.mu;
  const s = segmentStateAt(world.system, seg, node.t);
  const pole = nodePole(world, seg.parentId);
  const candidates = [nearestPassage(mu, s, to), timeToPassage(mu, s, to, pole)]
    .filter((dt): dt is number => dt !== null)
    .map((dt) => node.t + dt)
    .filter((t) => t >= seg.tStart && t <= seg.tEnd && t >= world.clock.t + MIN_NODE_LEAD)
    .sort((a, b) => Math.abs(a - node.t) - Math.abs(b - node.t));
  const t = candidates[0];
  if (t === undefined) return fail(`No ${PASSAGE_NAMES[to]} on this part of the path`);
  return editNode(world, shipId, nodeId, { t });
}

/** Sets whether the clock pauses at one event type, or at all of them (S4-7). */
export function setPauseOn(world: World, type: PausableEvent | 'all', on: boolean): ActionResult {
  for (const k of type === 'all' ? PAUSABLE_EVENTS : [type]) world.clock.pauseOn[k] = on;
  return ok();
}
