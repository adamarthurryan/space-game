import { describe, expect, it } from 'vitest';
import { SMOKE_TLI } from '../gen/lunarMission';
import { presetOrbit } from '../gen/sandboxShips';
import { createSandboxWorld } from '../gen/scenario';
import { norm } from '../math/vec3';
import { apoapsis, elementsFromState, periapsis } from '../orbital/elements';
import { setWarpIndex } from '../sim/clock';
import { createEventRegistry, registerShipHandlers } from '../sim/events';
import { planBudget } from '../sim/maneuver';
import { shipStats } from '../sim/ship';
import { segmentStateAt } from '../sim/trajectory';
import { advanceWorld } from '../sim/world';
import { addNode, addNodeAt, editNode, setPauseOn, spawnShip } from './actions';

/** The lunar orbit insertion the smoke test types: retrograde, circularising at periapsis. */
function circularisingDv(w: ReturnType<typeof createSandboxWorld>, shipId: string, t: number) {
  const segs = w.derived.trajectories[shipId]!.segments;
  const seg = segs.find((s) => s.parentId === 'moon' && s.tStart <= t && t <= s.tEnd)!;
  const s = segmentStateAt(w.system, seg, t);
  return Math.sqrt(w.system.bodies['moon']!.mu / norm(s.r)) - norm(s.v);
}

describe('a lunar flight by plan (acceptance 3)', () => {
  it('executes a TLI and a lunar orbit insertion as predicted', () => {
    const w = createSandboxWorld();
    const r = spawnShip(w, {
      designId: 'starship',
      orbit: presetOrbit(w.system, 'leo-lunar-plane', 0),
    });
    const id = r.ok ? r.value : '';
    expect(
      addNode(w, id, { t: SMOKE_TLI.dt, dv: { prograde: SMOKE_TLI.dv, normal: 0, radial: 0 } }).ok,
    ).toBe(true);
    const loi = addNodeAt(w, id, 'periapsis');
    expect(loi.ok).toBe(true);
    const loiId = loi.ok ? loi.value : '';
    const ship = w.ships[id]!;
    const tLoi = ship.plan[1]!.t;
    const segsBefore = w.derived.trajectories[id]!.segments;
    expect(segsBefore.find((s) => s.endNodeId === loiId)!.parentId).toBe('moon');
    const dvLoi = circularisingDv(w, id, tLoi);
    expect(dvLoi).toBeLessThan(-0.5);
    expect(editNode(w, id, loiId, { dv: { prograde: dvLoi } }).ok).toBe(true);

    // The prediction: a closed orbit around the Moon after the LOI node.
    const traj = w.derived.trajectories[id]!;
    const after = traj.segments[traj.segments.findIndex((s) => s.endNodeId === loiId) + 1]!;
    expect(after.parentId).toBe('moon');
    const mu = w.system.bodies['moon']!.mu;
    const predicted = elementsFromState(mu, { r: after.r0, v: after.v0 });
    expect(predicted.e).toBeLessThan(0.05);
    const budget = planBudget(ship, traj);
    expect(budget.dvLeft).toBeGreaterThan(0);

    // Fly it.
    setPauseOn(w, 'all', false);
    setWarpIndex(w.clock, 6);
    const reg = createEventRegistry();
    registerShipHandlers(reg);
    for (let i = 0; i < 10_000 && w.clock.t < tLoi + 1000; i++) advanceWorld(w, 1 / 60, reg);
    expect(ship.plan).toEqual([]);
    expect(ship.orbit.parentId).toBe('moon');
    const el = elementsFromState(mu, ship.orbit);
    expect(Math.abs(periapsis(el) - periapsis(predicted))).toBeLessThan(1);
    expect(Math.abs(apoapsis(el) - apoapsis(predicted))).toBeLessThan(1);
    expect(Math.abs(shipStats(ship).dv - budget.dvLeft)).toBeLessThan(1e-9);
  });
});
