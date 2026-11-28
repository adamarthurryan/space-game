import { describe, expect, it } from 'vitest';
import { addNode, editNode, spawnShip } from '../../game/actions';
import { SMOKE_TLI } from '../../gen/lunarMission';
import { presetOrbit } from '../../gen/sandboxShips';
import { createSandboxWorld } from '../../gen/scenario';
import { LONG_BURN_FRACTION, planDetails, resultText } from './planDetails';

const dv = (prograde: number, normal = 0) => ({ prograde, normal, radial: 0 });

function lunarShip() {
  const w = createSandboxWorld();
  const r = spawnShip(w, {
    designId: 'starship',
    orbit: presetOrbit(w.system, 'leo-lunar-plane', 0),
  });
  if (!r.ok) throw new Error(r.error);
  return { w, id: r.value };
}

describe('planDetails', () => {
  it('describes a TLI as a Moon encounter', () => {
    const { w, id } = lunarShip();
    addNode(w, id, { t: SMOKE_TLI.dt, dv: dv(SMOKE_TLI.dv) });
    const d = planDetails(w, id, 0);
    const n = d.nodes[0]!;
    expect(n.result.kind).toBe('encounter');
    expect(resultText(n.result)).toMatch(/^Moon encounter, Pe \d+\.?\d* km, in 3 d \d+ h$/);
    expect(n.propellant.map((p) => p.name).sort()).toEqual(['Methane', 'Oxygen']);
    expect(n.burnDuration).toBeGreaterThan(200);
    expect(n.countdown).toBe(SMOKE_TLI.dt);
    expect(d.overBudget).toBe(false);
    expect(d.dvLeft).toBeCloseTo(d.dvAvailable - SMOKE_TLI.dv, 12);
  });

  it('compares the burn duration with the pre-burn period', () => {
    const { w, id } = lunarShip();
    addNode(w, id, { t: 600, dv: dv(3.13) });
    const n = planDetails(w, id, 0).nodes[0]!;
    // A ~6 min burn on an 88 min orbit: a few percent, under the 10% threshold.
    expect(n.prePeriod! / 60).toBeCloseTo(88.4, 0);
    expect(n.burnDuration / n.prePeriod!).toBeGreaterThan(0.03);
    expect(n.burnDuration / n.prePeriod!).toBeLessThan(LONG_BURN_FRACTION);
    expect(n.longBurn).toBe(false);
  });

  it('describes an orbit, an escape and an over-budget plan', () => {
    const { w, id } = lunarShip();
    addNode(w, id, { t: 600, dv: dv(0.1) });
    const orbit = planDetails(w, id, 0).nodes[0]!.result;
    expect(resultText(orbit)).toMatch(/^Earth orbit, Pe 20\d km, Ap \d/);
    editNode(w, id, 'node-1', { dv: { prograde: 4 } });
    const escape = planDetails(w, id, 0).nodes[0]!.result;
    expect(escape.kind === 'orbit' && escape.escape).toBe(true);
    expect(resultText(escape)).toMatch(/^Earth escape/);
    editNode(w, id, 'node-1', { dv: { prograde: 20 } });
    const d = planDetails(w, id, 0);
    expect(d.overBudget).toBe(true);
    expect(d.nodes[0]!.overBudget).toBe(true);
    expect(d.dvLeft).toBeLessThan(0);
  });

  it('gives a disabled node no result', () => {
    const { w, id } = lunarShip();
    addNode(w, id, { t: 600, dv: dv(0.1) });
    editNode(w, id, 'node-1', { enabled: false });
    const n = planDetails(w, id, 0).nodes[0]!;
    expect(n.result).toEqual({ kind: 'none' });
    expect(n.reached).toBe(true);
    expect(resultText(n.result)).toContain('disabled');
  });

  it('describes an impact encounter', () => {
    expect(
      resultText({
        kind: 'encounter',
        bodyName: 'Moon',
        periapsisAlt: -500,
        in: 3 * 86_400,
        impact: true,
      }),
    ).toBe('Moon impact in 3 d 0 h');
  });
});
