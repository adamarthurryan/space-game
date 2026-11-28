import { describe, expect, it } from 'vitest';
import { presetOrbit } from '../gen/sandboxShips';
import { createSandboxWorld } from '../gen/scenario';
import { fleetShips } from '../sim/fleet';
import { assignShip, createFleet, deleteFleet, renameFleet, spawnShip } from './actions';

describe('fleet actions', () => {
  it('creates fleets with default or given names, refusing duplicates', () => {
    const w = createSandboxWorld();
    expect(createFleet(w)).toEqual({ ok: true, value: 'fleet-1' });
    expect(w.fleets['fleet-1']!.name).toBe('Fleet 1');
    expect(createFleet(w, ' Haulers ').ok).toBe(true);
    expect(createFleet(w, 'haulers')).toEqual({
      ok: false,
      error: 'A fleet named Haulers already exists',
    });
    expect(createFleet(w, '')).toEqual({ ok: false, error: 'Name is empty' });
  });

  it('renames, refusing unknown fleets and bad names', () => {
    const w = createSandboxWorld();
    createFleet(w, 'A');
    createFleet(w, 'B');
    expect(renameFleet(w, 'fleet-1', 'C').ok).toBe(true);
    expect(w.fleets['fleet-1']!.name).toBe('C');
    expect(renameFleet(w, 'fleet-1', 'b').ok).toBe(false);
    expect(renameFleet(w, 'fleet-9', 'D')).toEqual({ ok: false, error: 'Unknown fleet: fleet-9' });
  });

  it('assigns ships and deletes fleets', () => {
    const w = createSandboxWorld();
    createFleet(w, 'A');
    expect(assignShip(w, 'ship-1', 'fleet-1').ok).toBe(true);
    expect(assignShip(w, 'ship-1', 'fleet-2').ok).toBe(false);
    expect(assignShip(w, 'ship-99', null).ok).toBe(false);
    expect(fleetShips(w, 'fleet-1')).toEqual(['ship-1']);
    expect(deleteFleet(w, 'fleet-1').ok).toBe(true);
    expect(w.ships['ship-1']!.fleetId).toBeNull();
    expect(deleteFleet(w, 'fleet-1').ok).toBe(false);
  });

  it('spawns a ship into a fleet', () => {
    const w = createSandboxWorld();
    createFleet(w, 'A');
    const orbit = presetOrbit(w.system, 'leo', 0);
    const r = spawnShip(w, { designId: 'starship', orbit, fleetId: 'fleet-1' });
    expect(r.ok && w.ships[r.value]!.fleetId).toBe('fleet-1');
    expect(spawnShip(w, { designId: 'starship', orbit, fleetId: 'fleet-7' }).ok).toBe(false);
  });
});
