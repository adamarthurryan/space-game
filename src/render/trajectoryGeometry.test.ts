import { describe, expect, it } from 'vitest';
import { norm, sub, vec3, type Vec3 } from '../math/vec3';
import { bodyStateIn } from '../sim/body';
import { MU_PLANET, syntheticSystem } from '../sim/testSystem';
import { computeTrajectory, segmentStateAt, type Segment } from '../sim/trajectory';
import {
  conicGeometry,
  createPolyline,
  lastRevolutionWindow,
  MAX_VERTICES,
  SEGMENT_POINTS,
  samplePieceInto,
  sampleSegmentInto,
  writeTrajectoryVertices,
  type SegmentPolyline,
  currentOrbitRestWindow,
  firstNodeSegment,
} from './trajectoryGeometry';

const sys = syntheticSystem(0.3);
const point = (l: SegmentPolyline, k: number) =>
  vec3(l.points[3 * k]!, l.points[3 * k + 1]!, l.points[3 * k + 2]!);

/** An ellipse around the planet from t = 1000, ending at `end` after `revs` periods. */
function ellipse(revs: number, end: Segment['endEvent']): Segment {
  const rp = 7000;
  const ra = 20_000;
  const a = (rp + ra) / 2;
  const P = 2 * Math.PI * Math.sqrt(a ** 3 / MU_PLANET);
  return {
    kind: 'conic',
    parentId: 'planet',
    r0: vec3(0, rp, 0),
    v0: vec3(-Math.sqrt(MU_PLANET * (2 / rp - 1 / a)), 0, 0.3),
    tStart: 1000,
    tEnd: 1000 + revs * P,
    endEvent: end,
    ...(end === 'soi-enter' ? { endTargetId: 'moon' } : {}),
  };
}

describe('sampleSegmentInto', () => {
  it('puts every point on the conic, at its own time', () => {
    const seg = ellipse(3, 'horizon');
    const line = sampleSegmentInto(sys, seg, 'planet', 5000, createPolyline());
    expect(line.count).toBe(SEGMENT_POINTS + 1);
    for (let k = 0; k < line.count; k++) {
      const want = segmentStateAt(sys, seg, line.times[k]!).r;
      expect(norm(sub(point(line, k), want)) / norm(want)).toBeLessThan(1e-9);
    }
  });

  it('in the parent frame, starts at the ship and closes the loop after one revolution', () => {
    const seg = ellipse(3, 'horizon');
    const t = 5000;
    const line = sampleSegmentInto(sys, seg, 'planet', t, createPolyline());
    expect(line.closedLoop).toBe(true);
    const ship = segmentStateAt(sys, seg, t).r;
    const out = new Float32Array(3 * MAX_VERTICES);
    const origin = vec3(0, 0, 0);
    const n = writeTrajectoryVertices(out, line, t, ship, origin, origin);
    expect(n).toBe(SEGMENT_POINTS + 1);
    const first = vec3(out[0]!, out[1]!, out[2]!);
    const last = vec3(out[3 * (n - 1)]!, out[3 * (n - 1) + 1]!, out[3 * (n - 1) + 2]!);
    expect(norm(sub(first, ship))).toBeLessThan(1e-2);
    expect(norm(sub(last, ship))).toBeLessThan(1e-2);
  });

  it('draws a lunar segment in the planet frame as the real path, point by point', () => {
    // A hyperbola around the moon.
    const seg: Segment = {
      kind: 'conic',
      parentId: 'moon',
      r0: vec3(-60_000, 5000, 0),
      v0: vec3(1.0, 0, 0.1),
      tStart: 2e5,
      tEnd: 2e5 + 1.2e5,
      endEvent: 'soi-exit',
      endTargetId: 'planet',
    };
    const line = sampleSegmentInto(sys, seg, 'planet', seg.tStart, createPolyline());
    expect(line.closedLoop).toBe(false);
    for (let k = 0; k < line.count; k++) {
      const t = line.times[k]!;
      const want = vec3(0, 0, 0);
      const s = segmentStateAt(sys, seg, t).r;
      const m = bodyStateIn(sys, 'moon', 'planet', t).r;
      want.x = s.x + m.x;
      want.y = s.y + m.y;
      want.z = s.z + m.z;
      expect(norm(sub(point(line, k), want))).toBeLessThan(1e-6);
    }
  });

  it('samples a hyperbola in H, denser at periapsis', () => {
    const rp = 6700;
    const v = 1.3 * Math.sqrt((2 * MU_PLANET) / rp);
    const seg = computeTrajectory(sys, {
      parentId: 'planet',
      t: 0,
      r: vec3(rp, 0, 0),
      v: vec3(0, 0, v),
    })[0]!;
    // From before periapsis: start a little back along the conic.
    const back = {
      ...seg,
      tStart: -3 * 3600,
      ...(() => {
        const s = segmentStateAt(sys, seg, -3 * 3600);
        return { r0: s.r, v0: s.v };
      })(),
    };
    const line = sampleSegmentInto(sys, back, 'planet', back.tStart, createPolyline());
    const gaps: number[] = [];
    for (let k = 1; k < line.count; k++) gaps.push(norm(sub(point(line, k), point(line, k - 1))));
    const nearPe = Math.min(...gaps);
    expect(nearPe).toBeLessThan(gaps[gaps.length - 1]! / 5);
    const g = conicGeometry(sys, back);
    expect(g.kind).toBe('hyperbolic');
  });
});

describe('writeTrajectoryVertices', () => {
  it('drops exactly the points with t_k ≤ t, and offsets by frame body − origin in float64', () => {
    const seg = ellipse(3, 'horizon');
    const line = sampleSegmentInto(sys, seg, 'moon', seg.tStart, createPolyline());
    const t = line.times[40]!;
    const out = new Float32Array(3 * MAX_VERTICES);
    const fb = vec3(1.5e8, 2e3, -7);
    const origin = vec3(1.5e8 + 10, 2e3, -7);
    const n = writeTrajectoryVertices(out, line, t, null, fb, origin);
    expect(n).toBe(line.count - 41);
    const p = point(line, 41);
    expect(out[0]).toBe(Math.fround(-10 + p.x));
    expect(out[1]).toBe(Math.fround(p.y));
  });
});

describe('last revolution', () => {
  it('a closed segment ending at an encounter on its fifth revolution, in another frame', () => {
    const seg = ellipse(4.5, 'soi-enter');
    const g = conicGeometry(sys, seg);
    const t = seg.tStart;
    const first = sampleSegmentInto(sys, seg, 'moon', t, createPolyline(), g);
    expect(first.times[first.count - 1]! - t).toBeCloseTo(g.period, 3);
    const win = lastRevolutionWindow(seg, g, 'moon', t)!;
    expect(win[1]).toBe(seg.tEnd);
    expect(win[0]).toBeCloseTo(seg.tEnd - g.period, 6);
    const last = samplePieceInto(sys, seg, g, 'moon', win[0], win[1], createPolyline());
    const end = segmentStateAt(sys, seg, seg.tEnd).r;
    const off = bodyStateIn(sys, 'planet', 'moon', seg.tEnd).r;
    const want: Vec3 = vec3(end.x + off.x, end.y + off.y, end.z + off.z);
    expect(norm(sub(point(last, last.count - 1), want))).toBeLessThan(1e-6);
  });

  it('in the parent frame, runs from the ship anomaly to the event', () => {
    const seg = ellipse(4.5, 'soi-enter');
    const g = conicGeometry(sys, seg);
    const win = lastRevolutionWindow(seg, g, 'planet', seg.tStart)!;
    expect(win[1] - win[0]).toBeCloseTo((seg.tEnd - seg.tStart) % g.period, 6);
    expect(win[1] - win[0]).toBeLessThan(g.period);
  });

  it('a segment ending at the horizon has none', () => {
    const seg = ellipse(4.5, 'horizon');
    expect(lastRevolutionWindow(seg, conicGeometry(sys, seg), 'moon', seg.tStart)).toBeNull();
  });
});

describe('planned path and the current orbit after a node (S4-11)', () => {
  it('finds the first node segment after t', () => {
    const seg = (endEvent: 'maneuver' | 'horizon', tEnd: number) =>
      ({ endEvent, tEnd }) as Parameters<typeof firstNodeSegment>[0][number];
    const segs = [seg('maneuver', 100), seg('maneuver', 200), seg('horizon', 300)];
    expect(firstNodeSegment(segs, 0)).toBe(0);
    expect(firstNodeSegment(segs, 150)).toBe(1);
    expect(firstNodeSegment(segs, 250)).toBe(Infinity);
  });

  it('gives the rest of a closed orbit after a node on it', () => {
    const g = { kind: 'elliptic', period: 1000 } as Parameters<typeof currentOrbitRestWindow>[1];
    const seg = (endEvent: 'maneuver' | 'horizon', tEnd: number) =>
      ({ endEvent, tEnd, tStart: 0 }) as Parameters<typeof currentOrbitRestWindow>[0];
    expect(currentOrbitRestWindow(seg('maneuver', 300), g, 100)).toEqual([300, 1100]);
    expect(currentOrbitRestWindow(seg('maneuver', 3000), g, 100)).toBeNull();
    expect(currentOrbitRestWindow(seg('horizon', 300), g, 100)).toBeNull();
    const open = { kind: 'hyperbolic', period: Infinity } as Parameters<
      typeof currentOrbitRestWindow
    >[1];
    expect(currentOrbitRestWindow(seg('maneuver', 300), open, 100)).toBeNull();
  });
});
