import { describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../../gen/scenario';
import { getBody } from '../../sim/body';
import { framingDistance, MAX_DISTANCE, minDistance } from './framing';

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
