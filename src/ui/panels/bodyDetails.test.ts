import { describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../../gen/scenario';
import { DEG, SECONDS_PER_DAY } from '../../math/units';
import { bodyDetails } from './bodyDetails';

const sys = createSandboxWorld().system;

describe('bodyDetails', () => {
  it('Earth', () => {
    const d = bodyDetails(sys, 'earth', 0);
    expect(d.physical.surfaceGravity * 1000).toBeCloseTo(9.8, 1);
    expect(Math.abs(d.physical.surfaceGravity * 1000 - 9.8)).toBeLessThan(0.05);
    expect(Math.abs(d.physical.escapeSpeed - 11.19)).toBeLessThan(0.02);
    // 23 h 56 min.
    expect(Math.floor(d.physical.siderealDay! / 60)).toBe(23 * 60 + 56);
    expect(Math.abs(d.physical.axialTilt! / DEG - 23.44)).toBeLessThan(0.1);
    expect(Math.abs(d.orbit!.period / SECONDS_PER_DAY - 365.25)).toBeLessThan(0.1);
    expect(d.soi.kind).toBe('radius');
    if (d.soi.kind === 'radius') expect(d.soi.radius / 9.25e5).toBeCloseTo(1, 1);
    expect(d.orbit!.referencePlane).toBe('ecliptic');
  });

  it('Moon: inclined about 5.1° to the ecliptic and 18–29° to Earth’s equator', () => {
    const o = bodyDetails(sys, 'moon', 0).orbit!;
    expect(Math.abs(o.inclinationEcliptic / DEG - 5.1)).toBeLessThan(0.2);
    expect(o.inclinationParentEquator! / DEG).toBeGreaterThan(18.2);
    expect(o.inclinationParentEquator! / DEG).toBeLessThan(28.7);
    expect(o.referencePlane).toBe('ecliptic');
    expect(o.parentId).toBe('earth');
    expect(o.distance).toBeGreaterThan(o.periapsis * 0.999);
    expect(o.distance).toBeLessThan(o.apoapsis * 1.001);
  });

  it('Io: Laplace plane, under 0.1° from Jupiter’s equator', () => {
    const o = bodyDetails(sys, 'io', 0).orbit!;
    expect(o.referencePlane).toBe('laplace');
    expect(o.inclinationParentEquator! / DEG).toBeLessThan(0.1);
  });

  it('Venus and Uranus spin retrograde or sideways', () => {
    expect(bodyDetails(sys, 'venus', 0).physical.axialTilt! / DEG).toBeGreaterThan(170);
    const uranus = bodyDetails(sys, 'uranus', 0).physical.axialTilt! / DEG;
    expect(uranus).toBeGreaterThan(95);
    expect(uranus).toBeLessThan(100);
  });

  it('the Sun has no orbit; Phobos is minor', () => {
    const sun = bodyDetails(sys, 'sun', 0);
    expect(sun.orbit).toBeUndefined();
    expect(sun.soi.kind).toBe('root');
    expect(bodyDetails(sys, 'phobos', 0).soi.kind).toBe('minor');
  });
});
