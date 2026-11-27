import { describe, expect, it } from 'vitest';
import { buildBodySystem } from './body';
import { setWarpIndex } from './clock';
import { createWorld } from './world';

const system = buildBodySystem(2_451_545, [
  {
    id: 'sun',
    name: 'Sun',
    class: 'star',
    parentId: null,
    mu: 1.327_124_400_18e11,
    radius: 695_700,
    atmosphereHeight: 0,
  },
]);

describe('world', () => {
  it('holds the system and a running clock', () => {
    const w = createWorld(system, 7);
    expect(w.system).toBe(system);
    expect(w.clock).toEqual({ t: 7, warpIndex: 0, paused: false });
  });

  it('survives a JSON round trip', () => {
    const w = createWorld(system, 1e6);
    setWarpIndex(w.clock, 6);
    expect(JSON.parse(JSON.stringify(w))).toEqual(w);
  });
});
