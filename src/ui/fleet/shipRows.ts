/**
 * The Fleets tab's rows and groups (decisions S6-4 and S6-5 in planning/sprint-6.md). Pure, so it
 * is tested in the node environment.
 */

import { registry } from '../../content/registry';
import { shipColor } from '../../render/shipStyle';
import { getBody } from '../../sim/body';
import { fleetShips, groupOrder, type FleetId } from '../../sim/fleet';
import { shipStats, type Ship, type ShipId } from '../../sim/ship';
import { shipBodyAt, type World } from '../../sim/world';
import { shipStatus } from '../../sim/shipStatus';
import { eventLabel, type UpcomingEvent } from '../../sim/upcoming';
import type { FleetsFilter } from '../../store/useView';
import { formatCountdown, formatSpeed } from '../format';

export type StatusGlyph = '⏰' | '⛽' | '✕' | '⚠';

export interface ShipRowData {
  id: ShipId;
  name: string;
  color: string;
  design: string;
  /** The engines' kind: "chemical". */
  engine: string;
  /** The current SOI. */
  soi: string;
  /** "Moon SOI in 3 d 4 h", or null when idle. */
  next: string | null;
  dv: string;
  icons: { glyph: StatusGlyph; title: string }[];
  /** "impacted Moon", for a destroyed ship. */
  destroyed: string | null;
  active: boolean;
}

export interface FleetGroupData {
  /** Null for Unassigned. */
  id: FleetId | null;
  name: string;
  /** Ships in the group, before filtering. */
  count: number;
  /** A fleet alarm is set. */
  alarmed: boolean;
  rows: ShipRowData[];
}

/** "Moon SOI", "Earth SOI exit": the short form for a countdown (S6-5). */
export function nextText(world: World, e: UpcomingEvent, now: number): string {
  const name = (id: string | undefined) => (id && world.system.bodies[id]?.name) || '?';
  const what =
    e.kind === 'soi-enter'
      ? `${name(e.bodyId)} SOI`
      : e.kind === 'node'
        ? 'Node'
        : eventLabel(world.system, e);
  return `${what} in ${formatCountdown(e.t - now)}`;
}

/** The engines' kinds, joined: "chemical". */
function engineKind(ship: Ship): string {
  const kinds = new Set<string>();
  for (const inst of ship.modules) {
    const m = registry.byId(inst.moduleId);
    if (m?.category === 'engine') kinds.add(m.kind);
  }
  return [...kinds].join(', ') || 'no engine';
}

export function shipRow(
  world: World,
  ship: Ship,
  now: number,
  activeId: ShipId | null,
): ShipRowData {
  const status = shipStatus(world, ship.id);
  const icons: ShipRowData['icons'] = [];
  if (status.alarmed) icons.push({ glyph: '⏰', title: 'Alarm set' });
  if (status.lowPropellant) icons.push({ glyph: '⛽', title: 'Low propellant' });
  if (status.impactPredicted) icons.push({ glyph: '✕', title: 'Impact predicted' });
  if (status.overBudget) icons.push({ glyph: '⚠', title: 'Plan over budget' });
  return {
    id: ship.id,
    name: ship.name,
    color: shipColor(ship.seq),
    design: registry.design(ship.designId)?.name ?? ship.designId,
    engine: engineKind(ship),
    soi: getBody(world.system, shipBodyAt(world, ship.id, now)).name,
    next: status.next ? nextText(world, status.next, now) : null,
    dv: formatSpeed(shipStats(ship).dv),
    icons: ship.status === 'destroyed' ? [] : icons,
    destroyed: ship.destroyedAt
      ? `impacted ${getBody(world.system, ship.destroyedAt.bodyId).name}`
      : null,
    active: ship.id === activeId,
  };
}

/** Whether a ship passes the status filter (S6-4). */
export function passesFilter(world: World, id: ShipId, filter: FleetsFilter): boolean {
  if (filter === 'all') return true;
  const s = shipStatus(world, id);
  return filter === 'idle' ? s.idle : s.inTrouble;
}

/** Whether a fleet alarm is set on the fleet. */
const fleetAlarmed = (world: World, id: FleetId): boolean =>
  Object.values(world.alarms).some(
    (a) => a.enabled && a.scope.kind === 'fleet' && a.scope.fleetId === id,
  );

/**
 * The groups in order (fleets by seq, Unassigned last), with the rows that pass the filter and
 * are visible (S6-28). Under a filter (or a search), empty groups are left out; Unassigned is
 * left out when it is empty.
 */
export function fleetGroups(
  world: World,
  now: number,
  activeId: ShipId | null,
  filter: FleetsFilter,
  visible: ReadonlySet<ShipId> | null = null,
): FleetGroupData[] {
  const out: FleetGroupData[] = [];
  for (const id of groupOrder(world)) {
    const ids = fleetShips(world, id);
    const rows = ids
      .filter((s) => passesFilter(world, s, filter) && (!visible || visible.has(s)))
      .map((s) => shipRow(world, world.ships[s]!, now, activeId));
    const narrowed = filter !== 'all' || visible !== null;
    if (rows.length === 0 && (narrowed || id === null)) continue;
    out.push({
      id,
      name: id === null ? 'Unassigned' : (world.fleets[id]?.name ?? id),
      count: ids.length,
      alarmed: id !== null && fleetAlarmed(world, id),
      rows,
    });
  }
  return out;
}

/** "3 ships move to Unassigned. 1 alarm is deleted." (S6-2). */
export function deleteFleetText(ships: number, alarms: number): string {
  const parts: string[] = [];
  if (ships > 0) parts.push(`${ships} ${ships === 1 ? 'ship moves' : 'ships move'} to Unassigned.`);
  if (alarms > 0) parts.push(`${alarms} ${alarms === 1 ? 'alarm is' : 'alarms are'} deleted.`);
  return parts.join(' ');
}
