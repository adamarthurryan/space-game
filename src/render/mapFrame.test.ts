import { describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../gen/scenario';
import { norm, sub, vec3 } from '../math/vec3';
import { bodyWorldState } from '../sim/body';
import { createMapFrame, frameWorldInto, STAGE, updateFrameBodies } from './mapFrame';

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

  it('orders the stages clock < bodies < camera < projection < layers < labels, all ≤ 0', () => {
    const p = [
      STAGE.clock,
      STAGE.bodies,
      STAGE.camera,
      STAGE.projection,
      STAGE.layers,
      STAGE.labels,
    ];
    expect([...p].sort((a, b) => a - b)).toEqual(p);
    expect(Math.max(...p)).toBeLessThanOrEqual(0);
  });
});
