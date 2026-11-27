import { describe, expect, it } from 'vitest';
import { norm, sub, vec3 } from '../math/vec3';
import { MU_PLANET, PLANET_RADIUS, syntheticSystem } from '../sim/testSystem';
import { segmentStateAt, type Segment, type Trajectory } from '../sim/trajectory';
import { conicGeometry } from './trajectoryGeometry';
import { trajectoryMarkers } from './trajectoryMarkers';

const sys = syntheticSystem(0.3);
const fmt = (km: number) => `${Math.round(km)} km`;
const rp = 7000;
const ra = 20_000;
const a = (rp + ra) / 2;
const P = 2 * Math.PI * Math.sqrt(a ** 3 / MU_PLANET);
const vp = Math.sqrt(MU_PLANET * (2 / rp - 1 / a));

/** An ellipse starting at periapsis at t = 0, ending after `revs` periods. */
function traj(revs: number, end: Segment['endEvent']): Trajectory {
  return {
    version: 1,
    key: '',
    segments: [
      {
        kind: 'conic',
        parentId: 'planet',
        r0: vec3(rp, 0, 0),
        v0: vec3(0, vp, 0),
        tStart: 0,
        tEnd: revs * P,
        endEvent: end,
        ...(end === 'soi-enter' ? { endTargetId: 'moon' } : {}),
        ...(end === 'impact' ? { endTargetId: 'planet' } : {}),
      },
    ],
  };
}

describe('trajectoryMarkers', () => {
  it('puts SOI and impact markers at the segment ends', () => {
    for (const [end, text] of [
      ['soi-enter', '▲ Moon SOI'],
      ['impact', '✕ Impact'],
    ] as const) {
      const tr = traj(0.6, end);
      const m = trajectoryMarkers(sys, 'ship-1', tr, 10, 'planet', false, fmt);
      expect(m).toHaveLength(1);
      expect(m[0]!.text).toBe(text);
      expect(m[0]!.t).toBe(tr.segments[0]!.tEnd);
      const want = segmentStateAt(sys, tr.segments[0]!, tr.segments[0]!.tEnd).r;
      expect(norm(sub(m[0]!.pos, want))).toBeLessThan(1e-9);
    }
  });

  it('names the revolution of an event past the first', () => {
    const m = trajectoryMarkers(sys, 'ship-1', traj(3.5, 'soi-enter'), 10, 'planet', false, fmt);
    expect(m[0]!.text).toBe('▲ Moon SOI (rev 4)');
  });

  it('adds Pe and Ap only with apsides, after t, within the drawn window', () => {
    const tr = traj(3.5, 'horizon');
    expect(trajectoryMarkers(sys, 'ship-1', tr, 10, 'planet', false, fmt)).toEqual([]);
    const m = trajectoryMarkers(sys, 'ship-1', tr, 10, 'planet', true, fmt);
    const pe = m.find((x) => x.kind === 'periapsis')!;
    const ap = m.find((x) => x.kind === 'apoapsis')!;
    expect(pe.t).toBeCloseTo(P, 3);
    expect(ap.t).toBeCloseTo(P / 2, 3);
    expect(pe.text).toBe(`Pe ${Math.round(rp - PLANET_RADIUS)} km`);
    expect(ap.text).toBe(`Ap ${Math.round(ra - PLANET_RADIUS)} km`);
    // Past the apoapsis, the next Ap is a revolution on.
    const later = trajectoryMarkers(sys, 'ship-1', tr, P / 2 + 10, 'planet', true, fmt);
    expect(later.find((x) => x.kind === 'apoapsis')!.t).toBeCloseTo(1.5 * P, 3);
  });

  it('gives a hyperbola a Pe and no Ap', () => {
    const v = 1.3 * Math.sqrt((2 * MU_PLANET) / rp);
    const seg: Segment = {
      kind: 'conic',
      parentId: 'planet',
      r0: vec3(rp, 0, 0),
      v0: vec3(0, v, 0),
      tStart: 0,
      tEnd: 1e5,
      endEvent: 'soi-exit',
      endTargetId: 'star',
    };
    // Start an hour before periapsis.
    const s = segmentStateAt(sys, seg, -3600);
    const before: Segment = { ...seg, r0: s.r, v0: s.v, tStart: -3600 };
    expect(conicGeometry(sys, before).kind).toBe('hyperbolic');
    const m = trajectoryMarkers(
      sys,
      'ship-1',
      { version: 1, key: '', segments: [before] },
      -3600,
      'planet',
      true,
      fmt,
    );
    expect(m.map((x) => x.kind)).toEqual(['periapsis', 'soi-exit']);
    expect(m[0]!.t).toBeCloseTo(0, 6);
    expect(m[1]!.text).toBe('▲ Star SOI');
  });
});
