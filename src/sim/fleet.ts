/**
 * Fleets (decisions S6-1 and S6-2 in planning/sprint-6.md): named groups of ships, in the world
 * because alarms resolve fleet scope inside `sim/`. A ship names its fleet (`Ship.fleetId`), or
 * null for Unassigned. These functions assume valid input; `game/actions.ts` checks the rules.
 */

import type { ShipId } from './ship';
import type { World } from './world';

export type FleetId = string;

export interface Fleet {
  /** `fleet-<n>`. */
  id: FleetId;
  /** Creation number: the listing order. */
  seq: number;
  name: string;
}

/** Longest fleet name (S6-2). */
export const FLEET_NAME_MAX = 40;

export type NameCheck = { ok: true; name: string } | { ok: false; error: string };

/** The trimmed name, or why it can't be used: empty, too long, or another fleet's (any case). */
export function checkFleetName(world: World, name: string, exceptId?: FleetId): NameCheck {
  const trimmed = name.trim();
  if (trimmed === '') return { ok: false, error: 'Name is empty' };
  if (trimmed.length > FLEET_NAME_MAX) {
    return { ok: false, error: `Name is longer than ${FLEET_NAME_MAX} characters` };
  }
  const lower = trimmed.toLowerCase();
  for (const f of Object.values(world.fleets)) {
    if (f.id !== exceptId && f.name.toLowerCase() === lower) {
      return { ok: false, error: `A fleet named ${f.name} already exists` };
    }
  }
  return { ok: true, name: trimmed };
}

/** The default name of the next fleet: "Fleet <n>", skipping names in use. */
export function defaultFleetName(world: World): string {
  for (let n = world.nextFleetSeq; ; n++) {
    const name = `Fleet ${n}`;
    if (checkFleetName(world, name).ok) return name;
  }
}

/** Adds a fleet with the name as given. */
export function createFleet(world: World, name: string): FleetId {
  const seq = world.nextFleetSeq++;
  const id = `fleet-${seq}`;
  world.fleets[id] = { id, seq, name };
  return id;
}

export function renameFleet(world: World, id: FleetId, name: string): void {
  const f = world.fleets[id];
  if (f) f.name = name;
}

/** Moves its ships to Unassigned, then removes it (its alarms go with it, S6-2). */
export function deleteFleet(world: World, id: FleetId): void {
  if (!world.fleets[id]) return;
  for (const shipId of fleetShips(world, id)) assignShip(world, shipId, null);
  delete world.fleets[id];
}

/** Sets the ship's fleet (null = Unassigned). */
export function assignShip(world: World, shipId: ShipId, fleetId: FleetId | null): void {
  const ship = world.ships[shipId];
  if (!ship || ship.fleetId === fleetId) return;
  ship.fleetId = fleetId;
}

/** Fleets in seq order, then null (Unassigned). */
export function groupOrder(world: World): (FleetId | null)[] {
  return [
    ...Object.values(world.fleets)
      .sort((a, b) => a.seq - b.seq)
      .map((f) => f.id),
    null,
  ];
}

/** The fleet's ships (or Unassigned's) in seq order, destroyed ships included. */
export function fleetShips(world: World, fleetId: FleetId | null): ShipId[] {
  return Object.values(world.ships)
    .filter((s) => (s.fleetId ?? null) === fleetId)
    .sort((a, b) => a.seq - b.seq)
    .map((s) => s.id);
}
