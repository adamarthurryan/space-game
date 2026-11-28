import { describe, expect, it } from 'vitest';
import { addNode, assignShip, createFleet, spawnShip } from '../../game/actions';
import { presetOrbit } from '../../gen/sandboxShips';
import { createSandboxWorld } from '../../gen/scenario';
import { cycleOrder, cycleShip } from './cycle';

/** Kestrel (1), Tern (2), Heron (3), and Starship 4 (4); fleet A = {3, 1}, the rest unassigned. */
function world() {
  const w = createSandboxWorld();
  spawnShip(w, { designId: 'starship', orbit: presetOrbit(w.system, 'leo', 0) });
  createFleet(w, 'A');
  assignShip(w, 'ship-3', 'fleet-1');
  assignShip(w, 'ship-1', 'fleet-1');
  return w;
}

describe('cycling the active ship (S6-8)', () => {
  it('follows the Fleets tab order and wraps', () => {
    const w = world();
    expect(cycleOrder(w)).toEqual(['ship-1', 'ship-3', 'ship-2', 'ship-4']);
    expect(cycleShip(w, 'ship-3', 'next')).toBe('ship-2');
    expect(cycleShip(w, 'ship-4', 'next')).toBe('ship-1');
    expect(cycleShip(w, 'ship-1', 'previous')).toBe('ship-4');
  });

  it('starts at the first (or last) ship with none active', () => {
    const w = world();
    expect(cycleShip(w, null, 'next')).toBe('ship-1');
    expect(cycleShip(w, null, 'previous')).toBe('ship-4');
    expect(cycleShip(w, null, 'next-in-fleet')).toBeNull();
  });

  it('stays in the fleet, or in Unassigned', () => {
    const w = world();
    expect(cycleShip(w, 'ship-3', 'next-in-fleet')).toBe('ship-1');
    expect(cycleShip(w, 'ship-2', 'next-in-fleet')).toBe('ship-4');
    expect(cycleShip(w, 'ship-2', 'previous-in-fleet')).toBe('ship-4');
  });

  it('jumps to the next idle ship, skipping busy and destroyed ones', () => {
    const w = world();
    addNode(w, 'ship-3', { t: 5000 });
    addNode(w, 'ship-2', { t: 5000 });
    w.ships['ship-4']!.status = 'destroyed';
    expect(cycleShip(w, 'ship-1', 'next-idle')).toBe('ship-1');
    expect(cycleShip(w, null, 'next-idle')).toBe('ship-1');
    addNode(w, 'ship-1', { t: 5000 });
    expect(cycleShip(w, 'ship-1', 'next-idle')).toBeNull();
    expect(cycleShip(w, 'ship-1', 'next')).toBe('ship-3');
  });
});
