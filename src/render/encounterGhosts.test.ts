import { describe, expect, it } from 'vitest';
import { SMOKE_TLI } from '../gen/lunarMission';
import { presetOrbit } from '../gen/sandboxShips';
import { createSandboxWorld } from '../gen/scenario';
import { addNode, spawnShip } from '../game/actions';
import { add, norm, sub } from '../math/vec3';
import { bodyWorldState, getBody, soiRadiusOf } from '../sim/body';
import { encounterGhosts, encounterShips } from './encounterGhosts';

function lunar() {
  const w = createSandboxWorld();
  const r = spawnShip(w, {
    designId: 'starship',
    orbit: presetOrbit(w.system, 'leo-lunar-plane', 0),
  });
  if (!r.ok) throw new Error(r.error);
  addNode(w, r.value, { t: SMOKE_TLI.dt, dv: { prograde: SMOKE_TLI.dv, normal: 0, radial: 0 } });
  const entry = w.derived.trajectories[r.value]!.segments.find((s) => s.endEvent === 'soi-enter')!;
  return { w, id: r.value, tEntry: entry.tEnd };
}

const rel = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  norm(sub(a, b)) / norm(b);

describe('encounterGhosts (S5b-13)', () => {
  it('places the Moon where it will be at the SOI entry, in the Earth frame', () => {
    const { w, id, tEntry } = lunar();
    const ghosts = encounterGhosts(w, [id], 'earth', 0);
    expect(ghosts).toHaveLength(1);
    const g = ghosts[0]!;
    expect(g.bodyId).toBe('moon');
    expect(g.t).toBe(tEntry);
    expect(g.soiRadius).toBe(soiRadiusOf(getBody(w.system, 'moon')));
    const want = add(
      bodyWorldState(w.system, 'earth', 0).r,
      sub(bodyWorldState(w.system, 'moon', tEntry).r, bodyWorldState(w.system, 'earth', tEntry).r),
    );
    expect(rel(g.world, want)).toBeLessThan(1e-9);
  });

  it("is the frame body itself, now, in the Moon's frame", () => {
    const { w, id } = lunar();
    const g = encounterGhosts(w, [id], 'moon', 0)[0]!;
    expect(rel(g.world, bodyWorldState(w.system, 'moon', 0).r)).toBeLessThan(1e-9);
  });

  it('has none during a preview after the entry', () => {
    const { w, id, tEntry } = lunar();
    expect(encounterGhosts(w, [id], 'earth', tEntry - 1)).toHaveLength(1);
    expect(encounterGhosts(w, [id], 'earth', tEntry + 1)).toHaveLength(0);
  });

  it('is drawn for the selected, hovered, focused and active ships', () => {
    const drawn = ['a', 'b', 'c', 'd', 'e'];
    expect(
      encounterShips(drawn, {
        focus: { kind: 'ship', id: 'c' },
        selected: { kind: 'node', shipId: 'a', id: 'n' },
        hovered: { kind: 'ship', id: 'b' },
        activeShipId: 'd',
      }),
    ).toEqual(['a', 'b', 'c', 'd']);
  });
});
