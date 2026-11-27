import { describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../gen/scenario';
import { presetOrbit } from '../gen/sandboxShips';
import { size } from '../math/pqueue';
import { vec3 } from '../math/vec3';
import type { OrbitState } from '../sim/ship';
import { setWarpIndex, spawnShip, togglePause, warpDown, warpUp } from './actions';

describe('spawnShip', () => {
  it('adds ship-4 to the sandbox world with a trajectory and one queued event', () => {
    const w = createSandboxWorld();
    const queued = size(w.derived.events);
    const r = spawnShip(w, { designId: 'starship', orbit: presetOrbit(w.system, 'leo', 0) });
    expect(r).toEqual({ ok: true, value: 'ship-4' });
    expect(w.ships['ship-4']!.name).toBe('Starship 4');
    expect(w.derived.trajectories['ship-4']!.segments.length).toBeGreaterThan(0);
    expect(size(w.derived.events)).toBe(queued + 1);
  });

  it('uses a given name', () => {
    const w = createSandboxWorld();
    const r = spawnShip(w, {
      designId: 'starship',
      name: 'Plover',
      orbit: presetOrbit(w.system, 'leo', 0),
    });
    expect(r.ok && w.ships[r.value]!.name).toBe('Plover');
  });

  const leo = (parentId: string, r = 7000): OrbitState => ({
    parentId,
    t: 0,
    r: vec3(r, 0, 0),
    v: vec3(0, 7.5, 0),
  });
  const refusals: [string, Parameters<typeof spawnShip>[1], RegExp][] = [
    ['an unknown design', { designId: 'warbird', orbit: leo('earth') }, /Unknown design: warbird/],
    ['an unknown body', { designId: 'starship', orbit: leo('vulcan') }, /Unknown body: vulcan/],
    [
      'a minor-body parent',
      { designId: 'starship', orbit: leo('phobos', 50) },
      /Phobos is a minor body/,
    ],
    [
      'a start outside the SOI',
      { designId: 'starship', orbit: leo('earth', 2e6) },
      /outside Earth's sphere of influence/,
    ],
  ];
  for (const [what, params, error] of refusals) {
    it(`refuses ${what}, leaving the world unchanged`, () => {
      const w = createSandboxWorld();
      const before = JSON.stringify(w);
      const r = spawnShip(w, params);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(error);
      expect(JSON.stringify(w)).toBe(before);
    });
  }
});

describe('clock actions', () => {
  it('pause, warp up and down, and set the warp step', () => {
    const w = createSandboxWorld();
    expect(togglePause(w)).toEqual({ ok: true, value: undefined });
    expect(w.clock.paused).toBe(true);
    togglePause(w);
    expect(w.clock.paused).toBe(false);
    expect(warpUp(w).ok).toBe(true);
    expect(w.clock.warpIndex).toBe(1);
    warpDown(w);
    warpDown(w);
    expect(w.clock.warpIndex).toBe(0);
    expect(setWarpIndex(w, 99).ok).toBe(true);
    expect(w.clock.warpIndex).toBe(7);
    expect(setWarpIndex(w, NaN).ok).toBe(false);
  });
});
