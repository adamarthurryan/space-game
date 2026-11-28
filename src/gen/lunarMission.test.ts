import { describe, expect, it } from 'vitest';
import { norm } from '../math/vec3';
import { elementsFromState } from '../orbital/elements';
import { addShip } from '../sim/world';
import { createShip } from '../sim/ship';
import { registry } from '../content/registry';
import { findTli, lunarArrival, MAX_TOF, SMOKE_TLI, TLI_BAND, tliNode } from './lunarMission';
import { presetOrbit } from './sandboxShips';
import { createSandboxWorld } from './scenario';

const DAY = 86_400;

describe('the LEO (lunar plane) preset', () => {
  it('is a 200 km circular orbit in the Moon’s plane', () => {
    const w = createSandboxWorld();
    const o = presetOrbit(w.system, 'leo-lunar-plane', 0);
    const earth = w.system.bodies['earth']!;
    const el = elementsFromState(earth.mu, o);
    expect(el.e).toBeLessThan(1e-12);
    expect(norm(o.r) - earth.radius).toBeCloseTo(200, 9);
    addShip(w, createShip('ship-9', 9, 'S', registry.design('starship')!, o));
    expect(w.derived.trajectories['ship-9']!.segments[0]!.endEvent).toBe('horizon');
  });
});

describe('findTli', () => {
  it('finds a direct transfer with a low lunar periapsis', () => {
    const w = createSandboxWorld();
    const start = presetOrbit(w.system, 'leo-lunar-plane', 0);
    const tli = findTli(w.system, start)!;
    expect(tli).not.toBeNull();
    expect(tli.dv).toBeGreaterThan(3.0);
    expect(tli.dv).toBeLessThan(3.3);
    const tof = tli.tEnter - (start.t + tli.dt);
    expect(tof).toBeGreaterThan(2 * DAY);
    expect(tof).toBeLessThan(6 * DAY);
    expect(tli.lunarPeriapsisAltitude).toBeGreaterThanOrEqual(TLI_BAND[0]);
    expect(tli.lunarPeriapsisAltitude).toBeLessThanOrEqual(TLI_BAND[1]);
    expect({ dt: tli.dt, dv: tli.dv }).toEqual(SMOKE_TLI);
  }, 20_000); // The scan takes about 1 s, more on a loaded machine.

  it.each([0, 5, 30])('keeps the smoke constants on target from a spawn at t = %d s', (t0) => {
    const w = createSandboxWorld();
    const start = presetOrbit(w.system, 'leo-lunar-plane', t0);
    const a = lunarArrival(w.system, start, tliNode(start, SMOKE_TLI), MAX_TOF)!;
    expect(a).not.toBeNull();
    expect(a.altitude).toBeGreaterThan(TLI_BAND[0]);
    expect(a.altitude).toBeLessThan(TLI_BAND[1]);
  });
});
