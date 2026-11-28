import { describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../../gen/scenario';
import { getBody } from '../../sim/body';
import {
  framingDistance,
  framingDistanceOf,
  MAX_DISTANCE,
  minDistance,
  minDistanceOf,
  SHIP_MIN_DISTANCE,
  shipFramingDistance,
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

describe('ship framing', () => {
  const world = createSandboxWorld();

  it('frames a ship at 2.5 × its distance from its parent, capped at the parent framing', () => {
    expect(shipFramingDistance(7000, 1e6)).toBe(17_500);
    expect(shipFramingDistance(1e6, 1.2e6)).toBe(1.2e6);
    expect(shipFramingDistance(0, 1e6)).toBe(SHIP_MIN_DISTANCE);
    const kestrel = { kind: 'ship', id: 'ship-1' } as const;
    expect(framingDistanceOf(world, kestrel, 0)).toBeCloseTo(
      2.5 * (getBody(sys, 'earth').radius + 400),
      6,
    );
    expect(minDistanceOf(world, kestrel, 0)).toBe(0.05);
  });

  it('frames bodies as before', () => {
    const mars = { kind: 'body', id: 'mars' } as const;
    expect(framingDistanceOf(world, mars, 0)).toBe(framingDistance(sys, 'mars'));
    expect(minDistanceOf(world, mars, 0)).toBe(minDistance(sys, 'mars'));
  });
});
