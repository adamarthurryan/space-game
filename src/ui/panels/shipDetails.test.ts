import { describe, expect, it } from 'vitest';
import { spawnShip } from '../../game/actions';
import { presetOrbit } from '../../gen/sandboxShips';
import { createSandboxWorld } from '../../gen/scenario';
import { DEG } from '../../math/units';
import { getBody } from '../../sim/body';
import { eventLabel, shipDetails } from './shipDetails';

describe('shipDetails', () => {
  it("gives Kestrel's design, propellant and orbit", () => {
    const w = createSandboxWorld();
    const d = shipDetails(w, 'ship-1', 0);
    expect(d.name).toBe('Kestrel');
    expect(d.designName).toBe('Starship');
    expect(d.status).toBe('coasting');
    expect(d.propellant.map((p) => [p.name, p.mass, p.capacity])).toEqual([
      ['Oxygen', 1_253_000, 1_253_000],
      ['Methane', 347_000, 347_000],
    ]);
    expect(d.stats.dv).toBeGreaterThan(7.5);
    const R = getBody(w.system, 'earth').radius;
    expect(d.orbit!.parentId).toBe('earth');
    expect(d.orbit!.periapsis - R).toBeCloseTo(400, 3);
    expect(d.orbit!.apoapsis! - R).toBeCloseTo(400, 3);
    expect(d.orbit!.i).toBeCloseTo(51.6 * DEG, 9);
    expect(d.orbit!.inclinationPlane).toBe('equator');
    expect(d.orbit!.escape).toBe(false);
    expect(d.events).toEqual([]);
  });

  it('lists an escape ship as escaping, with a Sun SOI event', () => {
    const w = createSandboxWorld();
    const r = spawnShip(w, {
      designId: 'starship',
      orbit: presetOrbit(w.system, 'earth-escape', 0),
    });
    const d = shipDetails(w, r.ok ? r.value : '', 0);
    expect(d.orbit!.escape).toBe(true);
    expect(d.orbit!.apoapsis).toBeUndefined();
    expect(d.events.map(eventLabel)).toEqual(['Sun SOI']);
  });

  it('reports an impact', () => {
    const w = createSandboxWorld();
    const r = spawnShip(w, { designId: 'starship', orbit: presetOrbit(w.system, 'suborbital', 0) });
    const id = r.ok ? r.value : '';
    expect(shipDetails(w, id, 0).events.map(eventLabel)).toEqual(['Impact (Earth)']);
    w.ships[id]!.status = 'destroyed';
    w.ships[id]!.destroyedAt = { t: 100, bodyId: 'earth' };
    const d = shipDetails(w, id, 200);
    expect(d.destroyed).toEqual({ t: 100, bodyName: 'Earth' });
    expect(d.orbit).toBeUndefined();
  });
});
