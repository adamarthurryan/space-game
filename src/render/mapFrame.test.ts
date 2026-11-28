import { describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../gen/scenario';
import { add, norm, sub, vec3 } from '../math/vec3';
import { bodyWorldState } from '../sim/body';
import { shipStateAt } from '../sim/ship';
import {
  createMapFrame,
  frameBodyOf,
  frameWorldInto,
  mapObjectWorldInto,
  syncFrameShips,
  updateFrameBodies,
  updateFrameShips,
} from './mapFrame';

describe('MapFrame', () => {
  const { system } = createSandboxWorld();

  it('sizes every array to the body order', () => {
    const f = createMapFrame(system);
    const n = Object.keys(system.bodies).length;
    expect(f.order).toHaveLength(n);
    expect(f.world).toHaveLength(3 * n);
    for (const a of [
      f.screenX,
      f.screenY,
      f.depth,
      f.discPx,
      f.sphereShown,
      f.markerShown,
      f.merged,
    ]) {
      expect(a).toHaveLength(n);
    }
    f.order.forEach((id, i) => expect(f.indexOf[id]).toBe(i));
  });

  it('the body stage writes the world positions at t', () => {
    const f = createMapFrame(system);
    const t = 3.2e7;
    updateFrameBodies(f, system, t);
    expect(f.t).toBe(t);
    const i = f.indexOf['moon']!;
    const p = frameWorldInto(f, i, vec3(0, 0, 0));
    expect(norm(sub(p, bodyWorldState(system, 'moon', t).r))).toBeLessThan(1e-6);
  });
});

describe('MapFrame ships', () => {
  it('allocates the drawn ships in seq order, and reallocates only when the set changes', () => {
    const world = createSandboxWorld();
    const f = createMapFrame(world.system);
    expect(syncFrameShips(f, world)).toBe(true);
    expect(f.ships.ids).toEqual(['ship-1', 'ship-2', 'ship-3']);
    const arrays = f.ships;
    expect(syncFrameShips(f, world)).toBe(false);
    expect(f.ships).toBe(arrays);
    world.ships['ship-2']!.status = 'destroyed';
    expect(syncFrameShips(f, world)).toBe(true);
    expect(f.ships.ids).toEqual(['ship-1', 'ship-3']);
    expect(f.ships.world).toHaveLength(6);
  });

  it('the ships stage writes parent + ship state at t', () => {
    const world = createSandboxWorld();
    const f = createMapFrame(world.system);
    const t = 5000;
    updateFrameBodies(f, world.system, t);
    syncFrameShips(f, world);
    updateFrameShips(f, world);
    const k = f.ships.indexOf['ship-3']!;
    const heron = world.ships['ship-3']!;
    expect(f.ships.parentIndex[k]).toBe(f.indexOf['moon']);
    const want = add(
      bodyWorldState(world.system, 'moon', t).r,
      shipStateAt(world.system, heron, t).r,
    );
    const got = mapObjectWorldInto(f, world, { kind: 'ship', id: 'ship-3' }, vec3(0, 0, 0));
    expect(norm(sub(got, want))).toBeLessThan(1e-6);
  });

  it('frames trajectories on the focus body, or a focused ship parent', () => {
    const world = createSandboxWorld();
    expect(frameBodyOf(world, { kind: 'body', id: 'mars' }, 0)).toBe('mars');
    expect(frameBodyOf(world, { kind: 'ship', id: 'ship-3' }, 0)).toBe('moon');
  });
});
