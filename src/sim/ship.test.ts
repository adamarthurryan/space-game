import { describe, expect, it } from 'vitest';
import { createRegistry, registry } from '../content/registry';
import type { Module, ShipDesign } from '../content/types';
import { G0 } from '../math/units';
import { vec3 } from '../math/vec3';
import { propagate } from '../orbital/propagate';
import { createShip, shipStateAt, shipStats, type OrbitState } from './ship';
import { MU_PLANET, syntheticSystem } from './testSystem';

const modules: Module[] = [
  {
    id: 'frame',
    name: 'Frame',
    category: 'backbone',
    mass: 1000,
    volume: 50,
    maxMass: 50_000,
    maxVolume: 100,
    materials: {},
  },
  {
    id: 'main',
    name: 'Main',
    category: 'engine',
    kind: 'chemical',
    mass: 200,
    volume: 2,
    thrust: 60_000,
    isp: 300,
    propellant: { oxygen: 0.8, methane: 0.2 },
    materials: {},
  },
  {
    id: 'vac',
    name: 'Vac',
    category: 'engine',
    kind: 'chemical',
    mass: 150,
    volume: 3,
    thrust: 20_000,
    isp: 400,
    propellant: { oxygen: 0.75, methane: 0.25 },
    materials: {},
  },
  {
    id: 'ox',
    name: 'Ox',
    category: 'tank',
    resource: 'oxygen',
    mass: 300,
    volume: 10,
    capacity: 8000,
    materials: {},
  },
  {
    id: 'fuel',
    name: 'Fuel',
    category: 'tank',
    resource: 'methane',
    mass: 100,
    volume: 5,
    capacity: 2000,
    materials: {},
  },
];
const design: ShipDesign = {
  id: 'probe',
  name: 'Probe',
  backboneId: 'frame',
  modules: [
    { moduleId: 'main', count: 1 },
    { moduleId: 'vac', count: 2 },
    { moduleId: 'ox', count: 1 },
    { moduleId: 'fuel', count: 1 },
  ],
  payload: 500,
};
const reg = createRegistry(modules, [design]);
const orbit: OrbitState = {
  parentId: 'planet',
  t: 100,
  r: vec3(7000, 0, 0),
  v: vec3(0, 7.6, 0.2),
};
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('createShip', () => {
  it('copies the design and fills the tanks', () => {
    const ship = createShip('ship-1', 1, 'Probe 1', design, orbit, reg);
    expect(ship.propellant).toEqual({ oxygen: 8000, methane: 2000 });
    expect(ship.modules).toEqual(design.modules);
    expect(ship.modules).not.toBe(design.modules);
    expect(ship.orbit).toEqual(orbit);
    expect(ship.orbit.r).not.toBe(orbit.r);
    expect(ship.status).toBe('coasting');
  });

  it('survives a JSON round trip unchanged', () => {
    const ship = createShip('ship-1', 1, 'Probe 1', design, orbit, reg);
    expect(JSON.parse(JSON.stringify(ship))).toEqual(ship);
  });
});

describe('shipStats', () => {
  it('sums the masses by hand', () => {
    const s = shipStats(createShip('s', 1, 'S', design, orbit, reg), reg);
    expect(s.dryMass).toBe(1000 + 200 + 2 * 150 + 300 + 100 + 500);
    expect(s.propellantMass).toBe(10_000);
    expect(s.wetMass).toBe(s.dryMass + 10_000);
    expect(s.volume).toBe(2 + 6 + 10 + 5);
    expect(s.maxMass).toBe(50_000);
    expect(s.engines).toEqual([
      { moduleId: 'main', count: 1, thrust: 60_000, isp: 300 },
      { moduleId: 'vac', count: 2, thrust: 40_000, isp: 400 },
    ]);
  });

  it('combines two engine types: Isp = ΣF / Σ(F/Isp), and the rocket equation', () => {
    const s = shipStats(createShip('s', 1, 'S', design, orbit, reg), reg);
    const isp = 100_000 / (60_000 / 300 + 40_000 / 400);
    expect(rel(s.isp, isp)).toBeLessThan(1e-12);
    expect(s.thrust).toBe(100_000);
    const m0 = s.wetMass;
    const m1 = m0 - s.usablePropellant;
    expect(rel(s.dv, isp * G0 * Math.log(m0 / m1))).toBeLessThan(1e-12);
    expect(rel(s.acceleration, 100_000 / m0 / 1000)).toBeLessThan(1e-12);
  });

  it('limits usable propellant by the scarcer resource of the mixture', () => {
    const ship = createShip('s', 1, 'S', design, orbit, reg);
    // Mixture: oxygen (200·0.8 + 100·0.75)/300 = 0.78333…, methane 0.21666…
    ship.propellant = { oxygen: 8000, methane: 0.5 * 0.21666666666666667 * 10_000 };
    const s = shipStats(ship, reg);
    expect(rel(s.usablePropellant, 5000)).toBeLessThan(1e-12);
  });

  it('gives Δv 0 with no propellant', () => {
    const ship = createShip('s', 1, 'S', design, orbit, reg);
    ship.propellant = {};
    expect(shipStats(ship, reg).dv).toBe(0);
  });

  it('gives the Starship preset its S3-23 values', () => {
    const starship = registry.design('starship')!;
    const s = shipStats(createShip('s', 1, 'Starship', starship, orbit));
    expect(s.wetMass / 1000).toBeGreaterThan(1750);
    expect(s.wetMass / 1000).toBeLessThan(1850);
    expect(s.dv).toBeGreaterThan(7.5);
    expect(s.dv).toBeLessThan(8.3);
    expect(s.acceleration * 1000).toBeGreaterThan(8);
    expect(s.acceleration * 1000).toBeLessThan(9.5);
  });
});

describe('shipStateAt', () => {
  it('equals propagate from the orbit state, before and after orbit.t', () => {
    const sys = syntheticSystem();
    const ship = createShip('s', 1, 'S', design, orbit, reg);
    for (const t of [-5000, 100, 4321]) {
      const got = shipStateAt(sys, ship, t);
      const want = propagate(MU_PLANET, orbit, t - orbit.t);
      expect(got).toEqual(want);
    }
  });
});
