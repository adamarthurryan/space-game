import { describe, expect, it } from 'vitest';
import { registry } from '../content/registry';
import {
  assignShip,
  checkFleetName,
  createFleet,
  defaultFleetName,
  deleteFleet,
  fleetShips,
  groupOrder,
  renameFleet,
} from './fleet';
import { createShip } from './ship';
import { syntheticSystem } from './testSystem';
import { addShip, createWorld, type World } from './world';

function worldWithShips(n: number): World {
  const world = createWorld(syntheticSystem());
  const design = registry.designs[0]!;
  for (let i = 0; i < n; i++) {
    const seq = world.nextShipSeq;
    addShip(
      world,
      createShip(`ship-${seq}`, seq, `S${seq}`, design, {
        parentId: 'planet',
        t: 0,
        r: { x: 7000 + i * 100, y: 0, z: 0 },
        v: { x: 0, y: 7.5, z: 0 },
      }),
    );
  }
  return world;
}

describe('fleets', () => {
  it('numbers fleets and lists them in seq order, then Unassigned', () => {
    const world = worldWithShips(0);
    expect(createFleet(world, 'A')).toBe('fleet-1');
    expect(createFleet(world, 'B')).toBe('fleet-2');
    expect(groupOrder(world)).toEqual(['fleet-1', 'fleet-2', null]);
  });

  it('checks names: trimmed, not empty, not too long, unique ignoring case', () => {
    const world = worldWithShips(0);
    const id = createFleet(world, 'Haulers');
    expect(checkFleetName(world, '  Survey ')).toEqual({ ok: true, name: 'Survey' });
    expect(checkFleetName(world, '   ').ok).toBe(false);
    expect(checkFleetName(world, 'x'.repeat(41)).ok).toBe(false);
    expect(checkFleetName(world, 'haulers')).toEqual({
      ok: false,
      error: 'A fleet named Haulers already exists',
    });
    expect(checkFleetName(world, 'HAULERS', id).ok).toBe(true);
  });

  it('gives default names that are not taken', () => {
    const world = worldWithShips(0);
    createFleet(world, 'Fleet 1');
    expect(defaultFleetName(world)).toBe('Fleet 2');
  });

  it('assigns ships and lists them in seq order', () => {
    const world = worldWithShips(3);
    const f = createFleet(world, 'A');
    assignShip(world, 'ship-3', f);
    assignShip(world, 'ship-1', f);
    expect(fleetShips(world, f)).toEqual(['ship-1', 'ship-3']);
    expect(fleetShips(world, null)).toEqual(['ship-2']);
    renameFleet(world, f, 'B');
    expect(world.fleets[f]!.name).toBe('B');
  });

  it('deleting a fleet moves its ships to Unassigned', () => {
    const world = worldWithShips(2);
    const f = createFleet(world, 'A');
    assignShip(world, 'ship-1', f);
    deleteFleet(world, f);
    expect(world.fleets[f]).toBeUndefined();
    expect(world.ships['ship-1']!.fleetId).toBeNull();
    expect(groupOrder(world)).toEqual([null]);
  });

  it("deleting a fleet deletes its fleet alarms, not its ships' own", () => {
    const world = worldWithShips(1);
    const f = createFleet(world, 'A');
    assignShip(world, 'ship-1', f);
    const common = { leadTime: 0, action: 'pause' as const, enabled: true };
    const trigger = { kind: 'event-type' as const, type: 'node' as const };
    const fleetAlarm = addAlarm(world, {
      ...common,
      trigger,
      scope: { kind: 'fleet', fleetId: f },
    });
    const shipAlarm = addAlarm(world, {
      ...common,
      trigger,
      scope: { kind: 'ship', shipId: 'ship-1' },
    });
    deleteFleet(world, f);
    expect(world.alarms[fleetAlarm]).toBeUndefined();
    expect(world.alarms[shipAlarm]).toBeDefined();
    expect(alarmSchedule(world)).toEqual([]);
  });
});
