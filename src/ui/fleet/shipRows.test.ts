import { describe, expect, it } from 'vitest';
import { createFleet, addNode, assignShip, spawnShip } from '../../game/actions';
import { presetOrbit } from '../../gen/sandboxShips';
import { createSandboxWorld } from '../../gen/scenario';
import { upcomingEvents } from '../../sim/upcoming';
import { fleetGroups, nextText, shipRow } from './shipRows';

describe('shipRows (S6-4, S6-5)', () => {
  it('describes a ship: engine, SOI, countdown, Δv', () => {
    const w = createSandboxWorld();
    addNode(w, 'ship-1', { t: 3 * 86_400 + 4 * 3600 });
    const row = shipRow(w, w.ships['ship-1']!, 0, 'ship-1');
    expect(row).toMatchObject({
      name: 'Kestrel',
      engine: 'chemical',
      soi: 'Earth',
      next: 'Node in 3 d 4 h',
      active: true,
      destroyed: null,
    });
    expect(row.dv).toMatch(/km\/s$/);
  });

  it('names SOI entries and exits for the countdown', () => {
    const w = createSandboxWorld();
    const r = spawnShip(w, {
      designId: 'starship',
      orbit: presetOrbit(w.system, 'to-the-moon', 0),
    });
    const id = r.ok ? r.value : '';
    const entry = upcomingEvents(w, id).events.find((e) => e.kind === 'soi-enter')!;
    expect(nextText(w, entry, 0)).toMatch(/^Moon SOI in \d+ d \d+ h$/);
    const s = spawnShip(w, {
      designId: 'starship',
      orbit: presetOrbit(w.system, 'earth-escape', 0),
    });
    const exit = upcomingEvents(w, s.ok ? s.value : '').events[0]!;
    expect(nextText(w, exit, 0)).toMatch(/^Earth SOI exit in /);
  });

  it('groups fleets in order, then Unassigned, which is left out when empty', () => {
    const w = createSandboxWorld();
    createFleet(w, 'B');
    createFleet(w, 'A');
    assignShip(w, 'ship-3', 'fleet-1');
    assignShip(w, 'ship-1', 'fleet-2');
    const g = fleetGroups(w, 0, null, 'all');
    expect(g.map((x) => [x.name, x.rows.map((r) => r.name)])).toEqual([
      ['B', ['Heron']],
      ['A', ['Kestrel']],
      ['Unassigned', ['Tern']],
    ]);
    assignShip(w, 'ship-2', 'fleet-2');
    expect(fleetGroups(w, 0, null, 'all').map((x) => x.name)).toEqual(['B', 'A']);
  });

  it('filters by status and visibility, leaving out empty groups', () => {
    const w = createSandboxWorld();
    createFleet(w, 'Busy');
    assignShip(w, 'ship-1', 'fleet-1');
    addNode(w, 'ship-1', { t: 5000 });
    expect(fleetGroups(w, 0, null, 'idle').map((x) => x.name)).toEqual(['Unassigned']);
    const visible = new Set(['ship-1']);
    const g = fleetGroups(w, 0, null, 'all', visible);
    expect(g.map((x) => [x.name, x.count, x.rows.length])).toEqual([['Busy', 1, 1]]);
  });
});
