import { describe, expect, it } from 'vitest';
import { SMOKE_TLI } from '../../gen/lunarMission';
import { presetOrbit } from '../../gen/sandboxShips';
import { createSandboxWorld } from '../../gen/scenario';
import { addNode, spawnShip } from '../../game/actions';
import { getBody } from '../../sim/body';
import {
  framingDistance,
  framingDistanceOf,
  MAX_DISTANCE,
  minDistance,
  minDistanceOf,
  pathFramingDistance,
} from './framing';

const sys = createSandboxWorld().system;
const apo = (id: string) => {
  const o = getBody(sys, id).orbit!;
  return o.a * (1 + o.e);
};
/** Whether a radius r around the focus fits a 50° field of view from distance d. */
const fits = (r: number, d: number) => Math.atan(r / d) < (25 * Math.PI) / 180;

describe('framing', () => {
  it("Jupiter's framing shows Callisto's orbit", () => {
    const d = framingDistance(sys, 'jupiter');
    expect(d).toBeCloseTo(3 * apo('callisto'), 0);
    expect(fits(apo('callisto'), d)).toBe(true);
  });

  it("Earth's framing shows the Moon's orbit", () => {
    const d = framingDistance(sys, 'earth');
    expect(d).toBeCloseTo(3 * apo('moon'), 0);
    expect(fits(apo('moon'), d)).toBe(true);
  });

  it('a body without major moons gives 8 × its radius', () => {
    expect(framingDistance(sys, 'mars')).toBe(8 * getBody(sys, 'mars').radius);
    expect(framingDistance(sys, 'moon')).toBe(8 * getBody(sys, 'moon').radius);
  });

  it("the Sun gives 2 × Neptune's apoapsis", () => {
    expect(framingDistance(sys, 'sun')).toBeCloseTo(2 * apo('neptune'), 0);
    expect(framingDistance(sys, 'sun')).toBeLessThan(MAX_DISTANCE);
  });

  it('the minimum distance is 1.05 × the radius', () => {
    expect(minDistance(sys, 'earth')).toBeCloseTo(1.05 * 6371.0084, 6);
  });
});

describe('ship framing (S5b-12)', () => {
  const world = createSandboxWorld();
  const earthR = getBody(sys, 'earth').radius;

  it('shows the whole of a low Earth orbit, around the ship', () => {
    // Kestrel: a 400 km circular orbit.
    const d = pathFramingDistance(world, 'ship-1', 0);
    const r = earthR + 400;
    expect(fits(2 * r, d)).toBe(true);
    expect(d).toBeGreaterThanOrEqual(3 * earthR);
    expect(d).toBeLessThan(framingDistance(sys, 'earth'));
    expect(framingDistanceOf(world, { kind: 'ship', id: 'ship-1' }, 0)).toBe(d);
    expect(minDistanceOf(world, { kind: 'ship', id: 'ship-1' }, 0)).toBe(0.05);
  });

  it('frames a trans-lunar path out past the Moon, capped by Earth’s framing', () => {
    const w = createSandboxWorld();
    const r = spawnShip(w, {
      designId: 'starship',
      orbit: presetOrbit(w.system, 'leo-lunar-plane', 0),
    });
    if (!r.ok) throw new Error(r.error);
    addNode(w, r.value, { t: SMOKE_TLI.dt, dv: { prograde: SMOKE_TLI.dv, normal: 0, radial: 0 } });
    // Before the burn, the path ends at the node: it frames the low orbit.
    const before = pathFramingDistance(w, r.value, 0);
    expect(before).toBeLessThan(1e5);
    // Just after it, the path runs out to the Moon's SOI.
    const after = pathFramingDistance(w, r.value, SMOKE_TLI.dt + 1);
    expect(after).toBeGreaterThan(apo('moon'));
    expect(after).toBeLessThanOrEqual(framingDistance(sys, 'earth'));
  });

  it('frames bodies as before', () => {
    const mars = { kind: 'body', id: 'mars' } as const;
    expect(framingDistanceOf(world, mars, 0)).toBe(framingDistance(sys, 'mars'));
    expect(minDistanceOf(world, mars, 0)).toBe(minDistance(sys, 'mars'));
  });
});
