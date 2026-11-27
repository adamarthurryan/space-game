import { describe, expect, it } from 'vitest';
import { addNode, editNode, spawnShip } from '../game/actions';
import { presetOrbit } from '../gen/sandboxShips';
import { createSandboxWorld } from '../gen/scenario';
import { norm, sub } from '../math/vec3';
import { bodyStateIn } from '../sim/body';
import { segmentStateAt } from '../sim/trajectory';
import { nodeMarkers } from './nodeMarkers';

function setUp() {
  const w = createSandboxWorld();
  const r = spawnShip(w, {
    designId: 'starship',
    orbit: presetOrbit(w.system, 'leo-lunar-plane', 0),
  });
  if (!r.ok) throw new Error(r.error);
  return { w, id: r.value };
}

describe('nodeMarkers', () => {
  it('puts a node at its time on the trajectory', () => {
    const { w, id } = setUp();
    addNode(w, id, { t: 1000, dv: { prograde: 0.5, normal: 0, radial: 0 } });
    const traj = w.derived.trajectories[id]!;
    const [m] = nodeMarkers(w.system, w.ships[id]!, traj, 0, 'earth', true);
    const r = segmentStateAt(w.system, traj.segments[0]!, 1000).r;
    expect(norm(sub(m!.pos, r))).toBe(0);
    expect(m).toMatchObject({ nodeId: 'node-1', state: 'enabled', editable: true, t: 1000 });
  });

  it('expresses it in another frame at the node’s time', () => {
    const { w, id } = setUp();
    addNode(w, id, { t: 1000 });
    const traj = w.derived.trajectories[id]!;
    const [m] = nodeMarkers(w.system, w.ships[id]!, traj, 0, 'moon', false);
    const r = segmentStateAt(w.system, traj.segments[0]!, 1000).r;
    const off = bodyStateIn(w.system, 'earth', 'moon', 1000).r;
    expect(norm(sub(m!.pos, { x: r.x + off.x, y: r.y + off.y, z: r.z + off.z }))).toBeLessThan(
      1e-6,
    );
    expect(m!.editable).toBe(false);
  });

  it('marks disabled nodes, and skips past and unreached ones', () => {
    const { w, id } = setUp();
    addNode(w, id, { t: 1000 });
    addNode(w, id, { t: 2000 });
    editNode(w, id, 'node-2', { enabled: false });
    const ship = w.ships[id]!;
    // An unreached node: past the end of the trajectory.
    ship.plan.push({
      id: 'far',
      t: 1e12,
      enabled: true,
      dv: { prograde: 0, normal: 0, radial: 0 },
      execution: 'impulsive',
    });
    const traj = w.derived.trajectories[id]!;
    const ms = nodeMarkers(w.system, ship, traj, 1500, 'earth', true);
    expect(ms.map((m) => [m.nodeId, m.state])).toEqual([['node-2', 'disabled']]);
  });
});
