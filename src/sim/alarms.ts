/**
 * Alarms (decisions S6-12 to S6-18 in planning/sprint-6.md).
 *
 * An alarm is plain data in `world.alarms`: a scope (a ship, a fleet, or every ship), a trigger
 * (a plan item, an event type, or a time), a lead time and an action. Alarms are fired by the
 * event queue, never checked per frame: for each enabled alarm and each coasting ship in its
 * scope, the next matching upcoming event is found from the ship's prediction, and one `alarm`
 * sim event is queued at `max(t − leadTime, now)`, ranked before ship events at the same time
 * (S6-15). Schedules are rebuilt by removal and re-queueing whenever an input changes (the
 * ship's trajectory, its fleet, the alarm), so an alarm event is never stale (S6-14).
 */

import { calendarFromJd, formatCountdown, formatDate, jdFromSimTime } from '../math/time';
import { push, removeWhere } from '../math/pqueue';
import type { BodyId } from './body';
import { setWarpIndex } from './clock';
import { on, type EventRegistry } from './events';
import type { FleetId } from './fleet';
import type { NodeId } from './maneuver';
import type { ShipId } from './ship';
import { assertNever } from './trajectory';
import { eventLabel, upcomingEvents, type UpcomingEvent } from './upcoming';
import type { World } from './world';

export type AlarmId = string;

export type AlarmScope =
  { kind: 'ship'; shipId: ShipId } | { kind: 'fleet'; fleetId: FleetId } | { kind: 'global' };

/** What an event-type trigger matches (S6-13); 'soi-change' is an entry or an exit. */
export type AlarmEventType = 'node' | 'soi-change' | 'soi-enter' | 'soi-exit' | 'impact';
export const ALARM_EVENT_TYPES: readonly AlarmEventType[] = [
  'node',
  'soi-change',
  'soi-enter',
  'soi-exit',
  'impact',
];

export type AlarmTrigger =
  /** A node (ship scope only); an arc's start in milestone 3. */
  | { kind: 'plan-item'; itemId: NodeId }
  | { kind: 'event-type'; type: AlarmEventType; targetId?: BodyId; once?: boolean }
  /** A sim time (global scope only). */
  | { kind: 'time'; t: number };

export type AlarmAction = 'pause' | 'drop-warp';

export interface Alarm {
  /** `alarm-<n>`. */
  id: AlarmId;
  seq: number;
  scope: AlarmScope;
  trigger: AlarmTrigger;
  /** Seconds before the event, 0 to MAX_LEAD_TIME. */
  leadTime: number;
  action: AlarmAction;
  enabled: boolean;
  /** Per ship, the time of the last occurrence fired for (S6-12). */
  fired: Record<ShipId, number>;
  /** One of the scenario's default alarms (S6-23). */
  isDefault?: boolean;
}

/** A fired alarm (S6-17). The text is built when it fires. */
export interface AlarmNotification {
  /** `note-<n>`. */
  id: string;
  alarmId: AlarmId;
  shipId: ShipId | null;
  /** When it fired. */
  t: number;
  /** The occurrence's time. */
  eventT: number;
  text: string;
  action: AlarmAction;
  dismissed: boolean;
}

/** The longest lead time, s (S6-12). */
export const MAX_LEAD_TIME = 10 * 365.25 * 86_400;
/** Notifications kept (S6-17). */
export const MAX_NOTIFICATIONS = 50;
/** Alarm events come out before ship events at the same time (S6-15). */
export const ALARM_RANK = -1;

/** Whether the alarm's scope covers the ship now: a fleet's members are read at call time. */
export function alarmCovers(world: World, alarm: Alarm, shipId: ShipId): boolean {
  const ship = world.ships[shipId];
  if (!ship || alarm.trigger.kind === 'time') return false;
  const { scope } = alarm;
  switch (scope.kind) {
    case 'ship':
      return scope.shipId === shipId;
    case 'fleet':
      return ship.fleetId === scope.fleetId;
    case 'global':
      return true;
    default:
      return assertNever(scope);
  }
}

/** Whether an upcoming event matches the trigger (S6-13). Disabled nodes never match. */
export function triggerMatches(trigger: AlarmTrigger, e: UpcomingEvent): boolean {
  switch (trigger.kind) {
    case 'plan-item':
      return e.kind === 'node' && e.enabled && e.nodeId === trigger.itemId;
    case 'time':
      return false;
    case 'event-type': {
      const target = trigger.targetId;
      const entered = e.kind === 'soi-enter' && (!target || e.bodyId === target);
      const left = e.kind === 'soi-exit' && (!target || e.parentId === target);
      switch (trigger.type) {
        case 'node':
          return e.kind === 'node' && e.enabled;
        case 'soi-enter':
          return entered;
        case 'soi-exit':
          return left;
        case 'soi-change':
          return entered || left;
        case 'impact':
          return e.kind === 'impact' && (!target || e.bodyId === target);
        default:
          return assertNever(trigger.type);
      }
    }
    default:
      return assertNever(trigger);
  }
}

/** The ship's next matching event after the last one fired for, or null (S6-14). */
export function nextOccurrence(world: World, alarm: Alarm, shipId: ShipId): UpcomingEvent | null {
  if (!alarm.enabled || world.ships[shipId]?.status !== 'coasting') return null;
  if (!alarmCovers(world, alarm, shipId)) return null;
  const after = alarm.fired[shipId] ?? -Infinity;
  for (const e of upcomingEvents(world, shipId).events) {
    if (e.t > after && triggerMatches(alarm.trigger, e)) return e;
  }
  return null;
}

/** When an alarm fires for an occurrence: its lead time before it, or now if that has passed. */
export function fireTime(world: World, alarm: Alarm, occurrence: number): number {
  return Math.max(occurrence - alarm.leadTime, world.clock.t);
}

/** Queues the alarm's event for one ship, if it has an occurrence. */
function queueFor(world: World, alarm: Alarm, shipId: ShipId): void {
  const e = nextOccurrence(world, alarm, shipId);
  if (!e) return;
  push(
    world.derived.events,
    fireTime(world, alarm, e.t),
    {
      type: 'alarm',
      alarmId: alarm.id,
      shipId,
      occurrence: e.t,
      label: eventLabel(world.system, e),
    },
    ALARM_RANK,
  );
}

const bySeq = (world: World): Alarm[] => Object.values(world.alarms).sort((a, b) => a.seq - b.seq);

/** Replaces the ship's alarm events: one per enabled alarm covering it with an occurrence. */
export function scheduleShipAlarms(world: World, shipId: ShipId): void {
  removeWhere(world.derived.events, (e) => e.type === 'alarm' && e.shipId === shipId);
  for (const alarm of bySeq(world)) queueFor(world, alarm, shipId);
}

/** Replaces one alarm's events, for every ship it covers (or its time). */
export function scheduleAlarm(world: World, alarmId: AlarmId): void {
  removeWhere(world.derived.events, (e) => e.type === 'alarm' && e.alarmId === alarmId);
  const alarm = world.alarms[alarmId];
  if (!alarm?.enabled) return;
  if (alarm.trigger.kind === 'time') {
    const t = alarm.trigger.t;
    if (t < world.clock.t) return;
    push(
      world.derived.events,
      fireTime(world, alarm, t),
      { type: 'alarm', alarmId, shipId: null, occurrence: t, label: '' },
      ALARM_RANK,
    );
    return;
  }
  for (const shipId of Object.keys(world.ships)) queueFor(world, alarm, shipId);
}

/** Rebuilds every alarm event. */
export function scheduleAllAlarms(world: World): void {
  removeWhere(world.derived.events, (e) => e.type === 'alarm');
  for (const alarm of bySeq(world)) scheduleAlarm(world, alarm.id);
}

/** A queued alarm event: what fires when (S6-25, S6-29). */
export interface ScheduledAlarm {
  alarmId: AlarmId;
  shipId: ShipId | null;
  fireT: number;
  occurrence: number;
}

/** The queued alarm events, by fire time. */
export function alarmSchedule(world: World): ScheduledAlarm[] {
  const out: ScheduledAlarm[] = [];
  for (const entry of world.derived.events.heap) {
    const e = entry.value;
    if (e.type !== 'alarm') continue;
    out.push({ alarmId: e.alarmId, shipId: e.shipId, fireT: entry.key, occurrence: e.occurrence });
  }
  return out.sort((a, b) => a.fireT - b.fireT || a.alarmId.localeCompare(b.alarmId));
}

/** Adds an alarm (valid input assumed: see game/actions.ts) and schedules it. */
export function addAlarm(world: World, a: Omit<Alarm, 'id' | 'seq' | 'fired'>): AlarmId {
  const seq = world.nextAlarmSeq++;
  const id = `alarm-${seq}`;
  world.alarms[id] = { ...structuredClone(a), id, seq, fired: {} };
  scheduleAlarm(world, id);
  return id;
}

export type AlarmPatch = Partial<Pick<Alarm, 'trigger' | 'leadTime' | 'action' | 'enabled'>>;

/** Changes an alarm and re-schedules it. A new trigger forgets what was fired. */
export function updateAlarm(world: World, id: AlarmId, patch: AlarmPatch): void {
  const alarm = world.alarms[id];
  if (!alarm) return;
  if (patch.trigger) {
    alarm.trigger = structuredClone(patch.trigger);
    alarm.fired = {};
  }
  if (patch.leadTime !== undefined) alarm.leadTime = patch.leadTime;
  if (patch.action !== undefined) alarm.action = patch.action;
  if (patch.enabled !== undefined) alarm.enabled = patch.enabled;
  scheduleAlarm(world, id);
}

export function deleteAlarm(world: World, id: AlarmId): void {
  delete world.alarms[id];
  removeWhere(world.derived.events, (e) => e.type === 'alarm' && e.alarmId === id);
}

function deleteWhere(world: World, pred: (a: Alarm) => boolean): void {
  for (const a of bySeq(world)) if (pred(a)) deleteAlarm(world, a.id);
}

/** Deletes the plan-item alarms on a node (S6-18). */
export function deleteNodeAlarms(world: World, shipId: ShipId, nodeId: NodeId): void {
  deleteWhere(
    world,
    (a) =>
      a.scope.kind === 'ship' &&
      a.scope.shipId === shipId &&
      a.trigger.kind === 'plan-item' &&
      a.trigger.itemId === nodeId,
  );
}

/** Deletes a ship's own alarms, plan items included (S6-18). */
export function deleteShipAlarms(world: World, shipId: ShipId): void {
  deleteWhere(world, (a) => a.scope.kind === 'ship' && a.scope.shipId === shipId);
}

/** Deletes a fleet's alarms (S6-2). */
export function deleteFleetAlarms(world: World, fleetId: FleetId): void {
  deleteWhere(world, (a) => a.scope.kind === 'fleet' && a.scope.fleetId === fleetId);
}

/**
 * The notification text (S6-17): "Kestrel: Moon SOI entry in 10 min", "Haulers · Tern: Node
 * now", "Alarm: 2030-03-01 00:00:00".
 */
export function alarmNotificationText(
  world: World,
  alarm: Alarm,
  shipId: ShipId | null,
  occurrence: number,
  label: string,
): string {
  if (shipId === null) {
    const date = formatDate(calendarFromJd(jdFromSimTime(world.system.epochJd, occurrence)));
    return `Alarm: ${date}`;
  }
  const ship = world.ships[shipId]?.name ?? shipId;
  const fleet =
    alarm.scope.kind === 'fleet' ? `${world.fleets[alarm.scope.fleetId]?.name ?? '?'} · ` : '';
  const left = occurrence - world.clock.t;
  const when = left < 1 ? 'now' : `in ${formatCountdown(left)}`;
  return `${fleet}${ship}: ${label} ${when}`;
}

/** Appends a notification, dropping the oldest (dismissed ones first) past MAX_NOTIFICATIONS. */
function notify(world: World, n: Omit<AlarmNotification, 'id' | 'dismissed'>): void {
  world.notifications.push({ ...n, id: `note-${world.nextNotificationSeq++}`, dismissed: false });
  while (world.notifications.length > MAX_NOTIFICATIONS) {
    const i = world.notifications.findIndex((x) => x.dismissed);
    world.notifications.splice(i >= 0 ? i : 0, 1);
  }
}

/** Whether an alarm is deleted after firing: once, time and plan-item alarms (S6-16). */
const firesOnce = (a: Alarm): boolean => a.trigger.kind !== 'event-type' || !!a.trigger.once;

/** The alarm handler (S6-16): records, notifies, then pauses or drops warp to ×1. */
export function registerAlarmHandlers(reg: EventRegistry): void {
  on(reg, 'alarm', (world, e) => {
    const alarm = world.alarms[e.alarmId];
    if (!alarm?.enabled) return;
    if (e.shipId !== null) alarm.fired[e.shipId] = e.occurrence;
    notify(world, {
      alarmId: alarm.id,
      shipId: e.shipId,
      t: world.clock.t,
      eventT: e.occurrence,
      text: alarmNotificationText(world, alarm, e.shipId, e.occurrence, e.label),
      action: alarm.action,
    });
    if (firesOnce(alarm)) deleteAlarm(world, alarm.id);
    else if (e.shipId !== null) {
      removeWhere(
        world.derived.events,
        (x) => x.type === 'alarm' && x.alarmId === alarm.id && x.shipId === e.shipId,
      );
      queueFor(world, alarm, e.shipId);
    }
    if (alarm.action === 'pause') return { pause: true };
    setWarpIndex(world.clock, 0);
    return { stop: true };
  });
}
