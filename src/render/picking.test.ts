import { describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../gen/scenario';
import { createMapFrame, type MapFrame } from './mapFrame';
import { pick } from './picking';

const { system } = createSandboxWorld();

/** A synthetic frame: every body off screen, except those placed. */
function frame(): MapFrame {
  const f = createMapFrame(system);
  f.screenX.fill(-1e4);
  f.screenY.fill(-1e4);
  f.depth.fill(Infinity);
  return f;
}

function place(
  f: MapFrame,
  id: string,
  x: number,
  y: number,
  opts: { depth?: number; disc?: number; marker?: boolean } = {},
) {
  const i = f.indexOf[id]!;
  f.screenX[i] = x;
  f.screenY[i] = y;
  f.depth[i] = opts.depth ?? 1e6;
  f.discPx[i] = opts.disc ?? 0;
  f.sphereShown[i] = (opts.disc ?? 0) >= 0.5 ? 1 : 0;
  f.markerShown[i] = opts.marker ? 1 : 0;
}

describe('pick', () => {
  it('picks the nearer of two discs under the cursor', () => {
    const f = frame();
    place(f, 'jupiter', 100, 100, { depth: 2e6, disc: 50 });
    place(f, 'io', 110, 100, { depth: 1e6, disc: 20 });
    expect(pick(f, 105, 100)).toEqual({ kind: 'body', id: 'io' });
    expect(pick(f, 140, 100)).toEqual({ kind: 'body', id: 'jupiter' });
  });

  it('picks a body by its label, far from its marker', () => {
    const f = frame();
    place(f, 'mars', 100, 100, { marker: true });
    f.labels = [{ ref: { kind: 'body', id: 'mars' }, rect: { x: 106, y: 94, w: 40, h: 12 } }];
    expect(pick(f, 140, 100)).toEqual({ kind: 'body', id: 'mars' });
  });

  it('picks a marker within 8 px, and nothing at 9 px', () => {
    const f = frame();
    place(f, 'mars', 100, 100, { marker: true });
    expect(pick(f, 107, 100)).toEqual({ kind: 'body', id: 'mars' });
    expect(pick(f, 109, 100)).toBeNull();
  });

  it('picks the nearest of two markers', () => {
    const f = frame();
    place(f, 'mars', 100, 100, { marker: true });
    place(f, 'venus', 106, 100, { marker: true });
    expect(pick(f, 104, 100)).toEqual({ kind: 'body', id: 'venus' });
  });

  it('never picks a body behind the camera', () => {
    const f = frame();
    place(f, 'saturn', 100, 100, { disc: 30, marker: true });
    f.depth[f.indexOf['saturn']!] = Infinity;
    f.markerShown[f.indexOf['saturn']!] = 0;
    expect(pick(f, 100, 100)).toBeNull();
  });
});
