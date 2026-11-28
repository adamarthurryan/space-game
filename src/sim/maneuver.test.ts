import { describe, expect, it } from 'vitest';
import { createRegistry } from '../content/registry';
import type { Module, ShipDesign } from '../content/types';
import { G0 } from '../math/units';
import { cross, dot, norm, vec3 } from '../math/vec3';
import { elementsFromState } from '../orbital/elements';
import { applyNode, burnPropellant, dvMagnitude, planBudget, type ManeuverNode } from './maneuver';
import { createShip, shipStats, type OrbitState } from './ship';
import { MU_PLANET, syntheticSystem } from './testSystem';
import { computeTrajectory } from './trajectory';

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
    { moduleId: 'ox', count: 1 },
    { moduleId: 'fuel', count: 1 },
  ],
  payload: 400,
};
const reg = createRegistry(modules, [design]);
const sys = syntheticSystem();
const R = 7000;
const V = Math.sqrt(MU_PLANET / R);
const orbit: OrbitState = { parentId: 'planet', t: 0, r: vec3(R, 0, 0), v: vec3(0, V, 0) };
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

const node = (id: string, t: number, prograde: number, normal = 0, radial = 0): ManeuverNode => ({
  id,
  t,
  enabled: true,
  dv: { prograde, normal, radial },
  execution: 'impulsive',
});
const pre = { r: orbit.r, v: orbit.v };

describe('applyNode', () => {
  it('raises the opposite apsis by the vis-viva amount for a prograde Δv', () => {
    const post = applyNode(sys, 'planet', pre, node('n', 0, 0.5), 0.5);
    const el = elementsFromState(MU_PLANET, post);
    const v = V + 0.5;
    const a = 1 / (2 / R - (v * v) / MU_PLANET);
    expect(rel(el.p / (1 - el.e), 2 * a - R)).toBeLessThan(1e-12);
    expect(norm(post.r)).toBe(R);
  });

  it('turns the plane by 2·asin(Δv/2v) for a normal Δv that keeps the speed', () => {
    const turn = 0.2;
    // A normal-only Δv changes the speed too; the pure rotation needs a retrograde part.
    const dvN = V * Math.sin(turn);
    const dvP = V * (Math.cos(turn) - 1);
    const post = applyNode(sys, 'planet', pre, node('n', 0, dvP, dvN), Math.hypot(dvP, dvN));
    const h0 = cross(pre.r, pre.v);
    const h1 = cross(post.r, post.v);
    expect(Math.acos(dot(h0, h1) / (norm(h0) * norm(h1)))).toBeCloseTo(turn, 12);
    expect(rel(norm(post.v), V)).toBeLessThan(1e-12);
    expect(2 * Math.asin(Math.hypot(dvP, dvN) / (2 * V))).toBeCloseTo(turn, 12);
  });

  it('keeps the plane, and the energy to first order, for a radial Δv', () => {
    const post = applyNode(sys, 'planet', pre, node('n', 0, 0, 0, 1e-4), 1e-4);
    const h0 = cross(pre.r, pre.v);
    const h1 = cross(post.r, post.v);
    expect(norm(cross(h0, h1)) / (norm(h0) * norm(h1))).toBeLessThan(1e-15);
    expect(rel(norm(post.v) ** 2, V * V)).toBeLessThan(1e-9);
  });

  it('scales a short burn and keeps its direction', () => {
    const full = applyNode(sys, 'planet', pre, node('n', 0, 0.3, 0.4), 0.5);
    const half = applyNode(sys, 'planet', pre, node('n', 0, 0.3, 0.4), 0.25);
    const d = (s: { v: { x: number; y: number; z: number } }) =>
      vec3(s.v.x - pre.v.x, s.v.y - pre.v.y, s.v.z - pre.v.z);
    expect(rel(norm(d(half)), 0.25)).toBeLessThan(1e-12);
    expect(norm(cross(d(full), d(half)))).toBeLessThan(1e-15);
  });
});

describe('burnPropellant', () => {
  it('uses m0(1 − e^(−Δv/ve)) at the mixture', () => {
    const ship = createShip('s', 1, 'S', design, orbit, reg);
    const m0 = shipStats(ship, reg).wetMass;
    const used = burnPropellant(ship, 1, reg);
    const dm = m0 * (1 - Math.exp(-1 / (300 * G0)));
    expect(rel(used.oxygen! + used.methane!, dm)).toBeLessThan(1e-12);
    expect(rel(used.oxygen! / used.methane!, 4)).toBeLessThan(1e-12);
    expect(ship.propellant.oxygen).toBeCloseTo(8000 - used.oxygen!, 9);
  });

  it('empties the tanks exactly when the whole Δv is burnt', () => {
    const ship = createShip('s', 1, 'S', design, orbit, reg);
    burnPropellant(ship, shipStats(ship, reg).dv, reg);
    expect(ship.propellant.oxygen).toBe(0);
    expect(ship.propellant.methane).toBe(0);
    expect(shipStats(ship, reg).dv).toBe(0);
  });
});

describe('planBudget', () => {
  it('spends the Δv node by node, burning what is left', () => {
    const ship = createShip('s', 1, 'S', design, orbit, reg);
    const stats = shipStats(ship, reg);
    const dv = stats.dv;
    ship.plan = [node('a', 600, 0.4 * dv), node('b', 3000, 0, 0.8 * dv)];
    const segments = computeTrajectory(sys, orbit, { plan: ship.plan, dvAvailable: dv });
    const b = planBudget(ship, { segments, version: 1, key: '' }, reg);
    const [na, nb] = b.nodes;
    expect(na!.dvApplied).toBe(0.4 * dv);
    expect(na!.overBudget).toBe(false);
    expect(rel(nb!.dvApplied, 0.6 * dv)).toBeLessThan(1e-12);
    expect(nb!.overBudget).toBe(true);
    expect(rel(b.dvLeft, -0.2 * dv)).toBeLessThan(1e-12);
    expect(b.dvAvailable).toBe(dv);
    // The masses chain, and the rocket equation adds the Δv up.
    const mEnd = nb!.massBefore - (nb!.propellantUsed.oxygen! + nb!.propellantUsed.methane!);
    expect(rel(300 * G0 * Math.log(na!.massBefore / mEnd), dv)).toBeLessThan(1e-12);
    // Burn duration (m0 − m1)/ṁ, with ṁ = F/(Isp·g0).
    const dm = na!.massBefore - nb!.massBefore;
    expect(rel(na!.burnDuration, dm / (60_000 / (300 * G0 * 1000)))).toBeLessThan(1e-12);
  });

  it('gives disabled and unreached nodes no Δv', () => {
    const ship = createShip('s', 1, 'S', design, orbit, reg);
    const off = { ...node('a', 600, 0.1), enabled: false };
    ship.plan = [off, node('b', 1e12, 0.1)];
    const segments = computeTrajectory(sys, orbit, { plan: ship.plan });
    const b = planBudget(ship, { segments, version: 1, key: '' }, reg);
    expect(b.nodes.map((n) => [n.reached, n.dvApplied])).toEqual([
      [true, 0],
      [false, 0],
    ]);
    expect(b.dvPlanned).toBe(0);
    expect(dvMagnitude(off.dv)).toBeCloseTo(0.1, 15);
  });
});
