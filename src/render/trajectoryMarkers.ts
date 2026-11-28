/**
 * Trajectory markers (decision S3-19 in planning/sprint-3.md): SOI changes and impacts for
 * every drawn trajectory, and the next periapsis and apoapsis passages for the selected,
 * hovered and focused ships. Pure: positions are relative to the frame body.
 */

import { norm, vec3, type Vec3 } from '../math/vec3';
import { bodyStateIn, getBody, type BodyId, type BodySystem } from '../sim/body';
import type { ShipId } from '../sim/ship';
import { segmentStateAt, type Segment, type Trajectory } from '../sim/trajectory';
import { conicGeometry, positionAtAnomaly, type ConicGeometry } from './trajectoryGeometry';

export type TrajectoryMarkerKind = 'soi-enter' | 'soi-exit' | 'impact' | 'periapsis' | 'apoapsis';

export interface TrajectoryMarker {
  shipId: ShipId;
  kind: TrajectoryMarkerKind;
  t: number;
  /** Relative to the frame body, at the marker's time. */
  pos: Vec3;
  text: string;
}

/** A point of a segment, relative to the frame body at time t. */
function relativeToFrame(
  sys: BodySystem,
  seg: Segment,
  r: Vec3,
  t: number,
  frameBodyId: BodyId,
): Vec3 {
  if (seg.parentId === frameBodyId) return { ...r };
  const off = bodyStateIn(sys, seg.parentId, frameBodyId, t).r;
  return vec3(r.x + off.x, r.y + off.y, r.z + off.z);
}

/** The next passage after `from` of the anomaly `x` (0 = periapsis, π = apoapsis), or null. */
function nextPassage(g: ConicGeometry, x: number, from: number, to: number): number | null {
  if (g.kind !== 'elliptic') {
    // Open conics pass periapsis once, at tPeri.
    return x === 0 && g.tPeri > from && g.tPeri <= to ? g.tPeri : null;
  }
  const t0 = g.tPeri + (x / (2 * Math.PI)) * g.period;
  const k = Math.floor((from - t0) / g.period) + 1;
  const t = t0 + k * g.period;
  return t <= to ? t : null;
}

/** Markers for one trajectory after t (S3-19); Pe/Ap only if `withApsides`. */
export function trajectoryMarkers(
  sys: BodySystem,
  shipId: ShipId,
  traj: Trajectory,
  t: number,
  frameBodyId: BodyId,
  withApsides: boolean,
  fmt: (km: number) => string,
): TrajectoryMarker[] {
  const out: TrajectoryMarker[] = [];
  traj.segments.forEach((seg, i) => {
    if (seg.tEnd <= t) return;
    const from = i === 0 ? Math.max(t, seg.tStart) : seg.tStart;
    const g = conicGeometry(sys, seg);
    const parent = getBody(sys, seg.parentId);

    if (withApsides) {
      // Within the segment's drawn window: its first revolution, or to its end.
      const to = Math.min(seg.tEnd, from + g.period);
      const apsides: [TrajectoryMarkerKind, number][] = [['periapsis', 0]];
      if (g.kind === 'elliptic') apsides.push(['apoapsis', Math.PI]);
      for (const [kind, x] of apsides) {
        const tp = nextPassage(g, x, from, to);
        if (tp === null) continue;
        const r = positionAtAnomaly(g, x, vec3(0, 0, 0));
        const alt = norm(r) - parent.radius;
        out.push({
          shipId,
          kind,
          t: tp,
          pos: relativeToFrame(sys, seg, r, tp, frameBodyId),
          text: `${kind === 'periapsis' ? 'Pe' : 'Ap'} ${fmt(alt)}`,
        });
      }
    }

    // Nodes have their own markers (S4-9).
    if (seg.endEvent === 'horizon' || seg.endEvent === 'maneuver') return;
    const end = segmentStateAt(sys, seg, seg.tEnd).r;
    const pos = relativeToFrame(sys, seg, end, seg.tEnd, frameBodyId);
    // Past the first revolution, the text names the revolution.
    const rev =
      g.kind === 'elliptic' && seg.tEnd - from > g.period
        ? ` (rev ${Math.floor((seg.tEnd - from) / g.period) + 1})`
        : '';
    if (seg.endEvent === 'impact') {
      out.push({ shipId, kind: 'impact', t: seg.tEnd, pos, text: `✕ Impact${rev}` });
    } else {
      const target = seg.endTargetId ? getBody(sys, seg.endTargetId).name : '?';
      out.push({
        shipId,
        kind: seg.endEvent,
        t: seg.tEnd,
        pos,
        text: `▲ ${target} SOI${rev}`,
      });
    }
  });
  return out;
}
