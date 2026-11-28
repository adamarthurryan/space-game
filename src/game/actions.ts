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
  cancelWarpTo as cancelClockWarpTo,
  setPaused,
  setWarpIndex as setClockWarpIndex,
  startWarpTo,
  WARP_TO_NODE_LEAD,
  warpDown as clockWarpDown,
  warpUp as clockWarpUp,
} from '../sim/clock';
import { elementsFromState } from '../orbital/elements';
import type { LocalDv } from '../orbital/frames';
import { hasApsides, nearestPassage, timeToPassage, type PassageKind } from '../orbital/passages';
import { PAUSABLE_EVENTS, type PausableEvent } from '../sim/clock';
import { fallbackPole, MAX_NODES, MIN_NODE_LEAD, type NodeId } from '../sim/maneuver';
import {
  assignShip as simAssignShip,
  checkFleetName,
  createFleet as simCreateFleet,
  defaultFleetName,
  deleteFleet as simDeleteFleet,
  renameFleet as simRenameFleet,
  type FleetId,
} from '../sim/fleet';
import {
  addAlarm as simAddAlarm,
  ALARM_EVENT_TYPES,
  deleteAlarm as simDeleteAlarm,
  deleteNodeAlarms,
  MAX_LEAD_TIME,
  updateAlarm,
  type AlarmAction,
  type AlarmId,
  type AlarmPatch,
  type AlarmScope,
  type AlarmTrigger,
} from '../sim/alarms';
import { createShip, shipStats, type OrbitState, type Ship, type ShipId } from '../sim/ship';
import { assertNever, computeTrajectory, segmentStateAt, type Segment } from '../sim/trajectory';
import {
  eventLabel,
  MIN_WARP_TO,
  nextWarpStop,
  warpStopTime,
  type UpcomingEvent,
} from '../sim/upcoming';
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
  /** The fleet to put it in (S6-4); default Unassigned. */
  fleetId?: FleetId | null;
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
  if (p.fleetId && !world.fleets[p.fleetId])
    return { ok: false, error: `Unknown fleet: ${p.fleetId}` };
  const seq = world.nextShipSeq;
  const id = `ship-${seq}`;
  const name = p.name?.trim() || `${design.name} ${seq}`;
  addShip(world, createShip(id, seq, name, design, p.orbit));
  if (p.fleetId) simAssignShip(world, id, p.fleetId);
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

/** The refusal for an apsis on a circular orbit (S5b-20). */
export const CIRCULAR_ORBIT = 'Circular orbit';

/** Whether a segment's conic is circular for its apsides (S5b-20). */
function circular(world: World, seg: Segment): boolean {
  const mu = world.system.bodies[seg.parentId]!.mu;
  return !hasApsides(elementsFromState(mu, { r: seg.r0, v: seg.v0 }).e, 'periapsis');
}

/** Where "Add node ▾" searches from: after the last enabled node reached, or after now. */
function addNodeFrom(world: World, ship: Ship, segments: readonly Segment[]): number {
  const reached = new Set(segments.map((s) => s.endNodeId));
  let tFrom = world.clock.t;
  for (const n of ship.plan) if (n.enabled && reached.has(n.id)) tFrom = Math.max(tFrom, n.t);
  return tFrom;
}

/**
 * Why "At next Pe" or "At next Ap" can't be used on the ship's path, or null: the path is
 * circular where the search starts (S5b-20). The menu disables the item with this reason.
 */
export function addApsisRefusal(
  world: World,
  shipId: ShipId,
  kind: 'periapsis' | 'apoapsis',
): string | null {
  const ship = world.ships[shipId];
  const segments = world.derived.trajectories[shipId]?.segments ?? [];
  if (!ship) return null;
  const tFrom = addNodeFrom(world, ship, segments);
  const seg = segments.find((s) => s.tEnd > tFrom);
  return seg && circular(world, seg) && passageOnPath(world, segments, kind, tFrom) === null
    ? CIRCULAR_ORBIT
    : null;
}

/**
 * Adds a node at the next passage of `at` on the planned path after the last enabled node (or
 * after now), or at a given time (S4-16). Pe and Ap are refused on a circular orbit (S5b-20).
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
  const tFrom = addNodeFrom(world, ship, segments);
  const t = passageOnPath(world, segments, at, tFrom);
  if (t === null) {
    if (at === 'periapsis' || at === 'apoapsis') {
      const refusal = addApsisRefusal(world, shipId, at);
      if (refusal) return fail(refusal);
    }
    return fail(`No ${PASSAGE_NAMES[at]} ahead on the path`);
  }
  return addNode(world, shipId, { t });
}

/**
 * Why a node can't be snapped to Pe or Ap, or null: the path it sits on is circular there
 * (S5b-20). Read from the current trajectory: the segment that ends at the node, or (for a node
 * not executed) the one containing it, which is the path without the node up to its time.
 */
export function snapRefusal(world: World, shipId: ShipId, nodeId: NodeId): string | null {
  const node = world.ships[shipId]?.plan.find((n) => n.id === nodeId);
  const segments = world.derived.trajectories[shipId]?.segments ?? [];
  if (!node) return null;
  const seg =
    segments.find((s) => s.endNodeId === nodeId) ??
    segments.find((s) => s.tStart <= node.t && node.t <= s.tEnd);
  return seg && circular(world, seg) ? CIRCULAR_ORBIT : null;
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
  deleteNodeAlarms(world, shipId, nodeId);
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

/** Moves a node to the nearest Pe or Ap of the path it sits on (S4-15); not on a circular orbit (S5b-20). */
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
  if (circular(world, seg)) return fail(CIRCULAR_ORBIT);
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

// ---- Warp-to (decisions S5-3 to S5-5 in planning/sprint-5.md) ------------------------------

/** Warps to WARP_TO_NODE_LEAD before one of the ship's nodes, paused (S5-4). */
export function warpToNode(world: World, shipId: ShipId, nodeId: NodeId): ActionResult {
  const ship = plannable(world, shipId);
  if (isFail(ship)) return ship;
  const node = ship.plan.find((n) => n.id === nodeId);
  if (!node) return fail(`Unknown node: ${nodeId}`);
  if (!node.enabled) return fail('The node is disabled');
  const segments = world.derived.trajectories[shipId]?.segments ?? [];
  if (!segments.some((s) => s.endNodeId === nodeId)) return fail('The node is not reached');
  const stop = node.t - WARP_TO_NODE_LEAD;
  if (stop < world.clock.t + MIN_WARP_TO) return fail('The node is less than a minute away');
  startWarpTo(world.clock, { t: stop, kind: 'node', shipId, label: 'Node' });
  return ok();
}

/**
 * Warps to the ship's next event, the earliest of several ships' (the timeline's shown ships,
 * S6-25), or of any ship's if null (S5-5): a node stops WARP_TO_NODE_LEAD before it, any other
 * event just after it is handled.
 */
export function warpToNextEvent(
  world: World,
  ships: ShipId | readonly ShipId[] | null,
): ActionResult<UpcomingEvent> {
  if (typeof ships === 'string') {
    const ship = plannable(world, ships);
    if (isFail(ship)) return ship;
  }
  const e = nextWarpStop(world, typeof ships === 'string' ? [ships] : ships);
  if (!e) return fail('No upcoming events');
  startWarpTo(world.clock, {
    t: warpStopTime(e),
    kind: e.kind === 'node' ? 'node' : 'event',
    shipId: e.shipId,
    label: eventLabel(world.system, e),
  });
  return { ok: true, value: e };
}

/** Ends a warp-to; the clock keeps running at its warp step. */
export function cancelWarpTo(world: World): ActionResult {
  if (!world.clock.warpTo) return fail('No warp-to in progress');
  cancelClockWarpTo(world.clock);
  return ok();
}

// ---- Fleets (decisions S6-1 and S6-2 in planning/sprint-6.md) ------------------------------

/** Adds a fleet; with no name, "Fleet <n>". */
export function createFleet(world: World, name?: string): ActionResult<FleetId> {
  const check = checkFleetName(world, name ?? defaultFleetName(world));
  if (!check.ok) return check;
  return { ok: true, value: simCreateFleet(world, check.name) };
}

export function renameFleet(world: World, id: FleetId, name: string): ActionResult {
  if (!world.fleets[id]) return fail(`Unknown fleet: ${id}`);
  const check = checkFleetName(world, name, id);
  if (!check.ok) return check;
  simRenameFleet(world, id, check.name);
  return ok();
}

/** Deletes a fleet: its ships move to Unassigned, and its fleet alarms are deleted (S6-2). */
export function deleteFleet(world: World, id: FleetId): ActionResult {
  if (!world.fleets[id]) return fail(`Unknown fleet: ${id}`);
  simDeleteFleet(world, id);
  return ok();
}

/** Moves a ship to a fleet, or to Unassigned with null. Destroyed ships can be moved. */
export function assignShip(world: World, shipId: ShipId, fleetId: FleetId | null): ActionResult {
  if (!world.ships[shipId]) return fail(`Unknown ship: ${shipId}`);
  if (fleetId !== null && !world.fleets[fleetId]) return fail(`Unknown fleet: ${fleetId}`);
  simAssignShip(world, shipId, fleetId);
  return ok();
}

// ---- Alarms (decisions S6-12 to S6-21 in planning/sprint-6.md) -----------------------------

export interface AlarmParams {
  scope: AlarmScope;
  trigger: AlarmTrigger;
  leadTime: number;
  action: AlarmAction;
}

/** Why an alarm can't be set as given, or null (S6-12). */
function alarmError(world: World, p: AlarmParams): string | null {
  const { scope, trigger } = p;
  if (scope.kind === 'ship' && !world.ships[scope.shipId]) return `Unknown ship: ${scope.shipId}`;
  if (scope.kind === 'fleet' && !world.fleets[scope.fleetId]) {
    return `Unknown fleet: ${scope.fleetId}`;
  }
  if (!Number.isFinite(p.leadTime) || p.leadTime < 0) return 'The lead time must be 0 or more';
  if (p.leadTime > MAX_LEAD_TIME) return 'The lead time is longer than 10 years';
  if (p.action !== 'pause' && p.action !== 'drop-warp')
    return `Unknown action: ${String(p.action)}`;
  switch (trigger.kind) {
    case 'plan-item': {
      if (scope.kind !== 'ship') return 'A node alarm needs a ship';
      const ship = world.ships[scope.shipId]!;
      if (!ship.plan.some((n) => n.id === trigger.itemId)) {
        return `Unknown node: ${trigger.itemId}`;
      }
      return null;
    }
    case 'event-type': {
      if (!ALARM_EVENT_TYPES.includes(trigger.type)) return `Unknown event type: ${trigger.type}`;
      if (trigger.targetId !== undefined) {
        if (trigger.type === 'node') return 'A node alarm has no body';
        const body = world.system.bodies[trigger.targetId];
        if (!body) return `Unknown body: ${trigger.targetId}`;
        if (!body.major) return `${body.name} is a minor body: it has no SOI`;
      }
      return null;
    }
    case 'time':
      if (scope.kind !== 'global') return 'A time alarm covers every ship';
      if (!Number.isFinite(trigger.t) || trigger.t <= world.clock.t) return 'The time has passed';
      return null;
    default:
      return assertNever(trigger);
  }
}

/** Sets an alarm, enabled. */
export function addAlarm(world: World, p: AlarmParams): ActionResult<AlarmId> {
  const error = alarmError(world, p);
  if (error) return fail(error);
  return { ok: true, value: simAddAlarm(world, { ...p, enabled: true }) };
}

/** Changes an alarm's trigger, lead time, action or enabled flag. Its scope is fixed. */
export function editAlarm(
  world: World,
  id: AlarmId,
  p: Partial<Omit<AlarmParams, 'scope'>> & { enabled?: boolean },
): ActionResult {
  const alarm = world.alarms[id];
  if (!alarm) return fail(`Unknown alarm: ${id}`);
  const next: AlarmParams = {
    scope: alarm.scope,
    trigger: p.trigger ?? alarm.trigger,
    leadTime: p.leadTime ?? alarm.leadTime,
    action: p.action ?? alarm.action,
  };
  // An unchanged time trigger that has passed is fine to keep while editing the rest.
  const error = p.trigger || next.trigger.kind !== 'time' ? alarmError(world, next) : null;
  if (error) return fail(error);
  const patch: AlarmPatch = {};
  if (p.trigger) patch.trigger = p.trigger;
  if (p.leadTime !== undefined) patch.leadTime = p.leadTime;
  if (p.action !== undefined) patch.action = p.action;
  if (p.enabled !== undefined) patch.enabled = p.enabled;
  updateAlarm(world, id, patch);
  return ok();
}

export function deleteAlarm(world: World, id: AlarmId): ActionResult {
  if (!world.alarms[id]) return fail(`Unknown alarm: ${id}`);
  simDeleteAlarm(world, id);
  return ok();
}

/**
 * An alarm on one upcoming event (S6-20): a plan-item alarm for a node; for any other event, a
 * once alarm on its kind, narrowed to its body (the body entered, left or hit). Pauses.
 */
export function setAlarmForEvent(
  world: World,
  e: UpcomingEvent,
  leadTime: number,
): ActionResult<AlarmId> {
  if (e.t <= world.clock.t) return fail('The event has passed');
  const scope: AlarmScope = { kind: 'ship', shipId: e.shipId };
  let trigger: AlarmTrigger;
  switch (e.kind) {
    case 'node':
      if (!e.nodeId) return fail('Unknown node');
      trigger = { kind: 'plan-item', itemId: e.nodeId };
      break;
    case 'soi-enter':
    case 'impact':
      trigger = { kind: 'event-type', type: e.kind, once: true };
      if (e.bodyId) trigger.targetId = e.bodyId;
      break;
    case 'soi-exit':
      trigger = { kind: 'event-type', type: 'soi-exit', targetId: e.parentId, once: true };
      break;
    default:
      return assertNever(e.kind);
  }
  return addAlarm(world, { scope, trigger, leadTime, action: 'pause' });
}

export function dismissNotification(world: World, id: string): ActionResult {
  const n = world.notifications.find((x) => x.id === id);
  if (!n) return fail(`Unknown notification: ${id}`);
  n.dismissed = true;
  return ok();
}

export function dismissAllNotifications(world: World): ActionResult {
  for (const n of world.notifications) n.dismissed = true;
  return ok();
}
