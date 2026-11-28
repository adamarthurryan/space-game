/**
 * The sprint 5 "done when" for the clock (S5-1): at ×10⁶ and ×10⁷ the clock stops exactly at a
 * node instead of passing it.
 */
import { describe, expect, it } from 'vitest';
import { registry } from '../content/registry';
import { SECONDS_PER_DAY } from '../math/units';
import { vec3 } from '../math/vec3';
import { PAUSABLE_EVENTS, setWarpIndex, WARP_STEPS } from './clock';
import { createEventRegistry, registerShipHandlers } from './events';
import type { ManeuverNode } from './maneuver';
import { createShip, type OrbitState } from './ship';
import { MU_PLANET, syntheticSystem } from './testSystem';
import { addShip, advanceWorld, createWorld } from './world';

const sys = syntheticSystem();
const R = 7000;
const V = Math.sqrt(MU_PLANET / R);
const leo: OrbitState = { parentId: 'planet', t: 0, r: vec3(R, 0, 0), v: vec3(0, V, 0.3) };
const reg = createEventRegistry();
registerShipHandlers(reg);

describe('the clock stops exactly at a node (S5-1)', () => {
  for (const warp of [1e6, 1e7]) {
    for (const [label, tNode] of [
      ['an hour', 3600.25],
      ['a day', SECONDS_PER_DAY + 0.125],
      ['a month', 30 * SECONDS_PER_DAY + 7.5],
    ] as const) {
      it(`at ×${warp}, a node ${label} away`, () => {
        const w = createWorld(sys, 0);
        const ship = createShip('ship-1', 1, 'S', registry.designs[0]!, leo);
        const node: ManeuverNode = {
          id: 'node-1',
          t: tNode,
          enabled: true,
          dv: { prograde: 0.01, normal: 0, radial: 0 },
          execution: 'impulsive',
        };
        ship.plan = [node];
        addShip(w, ship);
        setWarpIndex(w.clock, WARP_STEPS.indexOf(warp as (typeof WARP_STEPS)[number]));
        let passed = false;
        for (let i = 0; i < 1e5 && !w.clock.paused; i++) {
          advanceWorld(w, 1 / 60, reg);
          if (w.clock.t > tNode) passed = true;
        }
        expect(passed).toBe(false);
        expect(w.clock.paused).toBe(true);
        expect(w.clock.t).toBe(tNode);
        expect(w.ships['ship-1']!.plan).toEqual([]);
      });
    }
  }

  it('runs through the node, exactly, with Pause on cleared', () => {
    const w = createWorld(sys, 0);
    const ship = createShip('ship-1', 1, 'S', registry.designs[0]!, leo);
    ship.plan = [
      {
        id: 'node-1',
        t: 5000.5,
        enabled: true,
        dv: { prograde: 0.01, normal: 0, radial: 0 },
        execution: 'impulsive',
      },
    ];
    addShip(w, ship);
    for (const e of PAUSABLE_EVENTS) w.clock.pauseOn[e] = false;
    setWarpIndex(w.clock, 7);
    let at = NaN;
    for (let i = 0; i < 1000 && Number.isNaN(at); i++) {
      advanceWorld(w, 1 / 60, reg);
      if (w.ships['ship-1']!.plan.length === 0) at = w.ships['ship-1']!.orbit.t;
    }
    expect(at).toBe(5000.5);
    expect(w.clock.paused).toBe(false);
  });
});
