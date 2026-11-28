import { describe, expect, it } from 'vitest';
import { nearestOnPath, PATH_PICK_PX, type ProjectedPolyline } from './pathPicking';

const line = (
  shipId: string,
  pts: [number, number][],
  times: number[],
  seg = 0,
): ProjectedPolyline => ({
  shipId,
  segmentIndex: seg,
  screen: new Float32Array(pts.flat()),
  times: new Float64Array(times),
  count: pts.length,
});

describe('nearestOnPath', () => {
  const a = line(
    's',
    [
      [0, 0],
      [100, 0],
      [100, 100],
    ],
    [0, 10, 30],
  );

  it('interpolates the time between vertices', () => {
    const h = nearestOnPath([a], 25, 3)!;
    expect(h.t).toBeCloseTo(2.5, 6);
    expect(h.screenX).toBeCloseTo(25, 6);
    expect(h.screenY).toBeCloseTo(0, 6);
    expect(h.distancePx).toBeCloseTo(3, 6);
    expect(nearestOnPath([a], 104, 50)!.t).toBeCloseTo(20, 6);
  });

  it('chooses the nearer of two polylines', () => {
    const b = line(
      's',
      [
        [0, 5],
        [100, 5],
      ],
      [100, 200],
      1,
    );
    expect(nearestOnPath([a, b], 50, 4)!.segmentIndex).toBe(1);
    expect(nearestOnPath([a, b], 50, 1)!.segmentIndex).toBe(0);
  });

  it('gives null beyond the radius', () => {
    expect(nearestOnPath([a], 50, PATH_PICK_PX + 1)).toBeNull();
    expect(nearestOnPath([], 0, 0)).toBeNull();
  });

  it('skips steps with a vertex behind the camera', () => {
    const c = line(
      's',
      [
        [0, 0],
        [NaN, NaN],
        [100, 0],
      ],
      [0, 1, 2],
    );
    expect(nearestOnPath([c], 50, 0)).toBeNull();
    expect(nearestOnPath([c], 1, 0)).toBeNull();
  });
});
