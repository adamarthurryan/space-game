/**
 * Trajectory geometry (decisions S3-16 and S3-17 in planning/sprint-3.md). Pure: no three.js.
 *
 * A segment is sampled in anomaly, not time: E for ellipses, H for hyperbolas, D = tan(ν/2) for
 * parabolas, so points are dense at periapsis. Each point stores its time from Kepler's
 * equation, without a solve. Points are expressed relative to a frame body at the point's own
 * time: p_k = r_k + bodyStateIn(parent, frameBody, t_k).r, so a lunar flyby is a hyperbola in
 * the Moon's frame and the real geocentric path in Earth's. Vertices are written as
 * float32(frameBodyWorld(t) + p_k − origin), the differences taken in float64 (decision 77).
 */

import { TWO_PI } from '../math/units';
import { cross, dot, norm, normalize, vec3, type Vec3 } from '../math/vec3';
import { elementsFromState, conicKind, type ConicKind } from '../orbital/elements';
import { solveKeplerElliptic, solveKeplerHyperbolic } from '../orbital/kepler';
import { bodyStateIn, getBody, type BodyId, type BodySystem } from '../sim/body';
import { assertNever, type Segment } from '../sim/trajectory';

/** Points per drawn piece of a segment (S3-17). */
export const SEGMENT_POINTS = 128;
/** Vertices a piece can write: the ship, then the points. */
export const MAX_VERTICES = SEGMENT_POINTS + 2;

/** A segment's conic in closed form: the perifocal basis, size, and periapsis time. */
export interface ConicGeometry {
  kind: ConicKind;
  mu: number;
  e: number;
  p: number;
  /** |a|, km; Infinity for a parabola. */
  a: number;
  /** Mean motion: rad/s for ellipses and hyperbolas; 2√(μ/p³) for a parabola (Barker). */
  n: number;
  /** Period, s; Infinity for open conics. */
  period: number;
  /** Unit vectors: towards periapsis, and 90° ahead of it in the orbit plane. */
  P: Vec3;
  Q: Vec3;
  /** A time of periapsis passage (the one before or at tStart for ellipses). */
  tPeri: number;
}

/** The closed-form conic of a segment (in its parent's frame). */
export function conicGeometry(sys: BodySystem, seg: Segment): ConicGeometry {
  switch (seg.kind) {
    case 'conic': {
      const mu = getBody(sys, seg.parentId).mu;
      const s = { r: seg.r0, v: seg.v0 };
      const el = elementsFromState(mu, s);
      const kind = conicKind(el.e);
      const h = normalize(cross(seg.r0, seg.v0));
      // e-vector = ((v² − μ/r) r − (r·v) v) / μ; for a circle, periapsis is the start point.
      const r = norm(seg.r0);
      const v2 = dot(seg.v0, seg.v0);
      const rv = dot(seg.r0, seg.v0);
      const ev = vec3(
        ((v2 - mu / r) * seg.r0.x - rv * seg.v0.x) / mu,
        ((v2 - mu / r) * seg.r0.y - rv * seg.v0.y) / mu,
        ((v2 - mu / r) * seg.r0.z - rv * seg.v0.z) / mu,
      );
      const e = norm(ev);
      const P = e > 1e-10 ? normalize(ev) : normalize(seg.r0);
      const Q = cross(h, P);
      const nu0 = Math.atan2(dot(seg.r0, Q), dot(seg.r0, P));
      const p = el.p;
      let a: number;
      let n: number;
      let M0: number;
      if (kind === 'parabolic') {
        a = Infinity;
        n = 2 * Math.sqrt(mu / (p * p * p));
        const D = Math.tan(nu0 / 2);
        M0 = D + (D * D * D) / 3;
      } else if (kind === 'elliptic') {
        a = p / (1 - e * e);
        n = Math.sqrt(mu / (a * a * a));
        const E =
          2 *
          Math.atan2(Math.sqrt(1 - e) * Math.sin(nu0 / 2), Math.sqrt(1 + e) * Math.cos(nu0 / 2));
        M0 = E - e * Math.sin(E);
        if (M0 < 0) M0 += TWO_PI;
      } else {
        a = p / (e * e - 1);
        n = Math.sqrt(mu / (a * a * a));
        const H = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu0 / 2));
        M0 = e * Math.sinh(H) - H;
      }
      return {
        kind,
        mu,
        e,
        p,
        a,
        n,
        period: kind === 'elliptic' ? TWO_PI / n : Infinity,
        P,
        Q,
        tPeri: seg.tStart - M0 / n,
      };
    }
    default:
      return assertNever(seg.kind);
  }
}

/** The anomaly (E, H or D) at time t. Elliptic E keeps whole revolutions. */
export function anomalyAt(g: ConicGeometry, t: number): number {
  const M = g.n * (t - g.tPeri);
  switch (g.kind) {
    case 'elliptic':
      return solveKeplerElliptic(M, g.e);
    case 'hyperbolic':
      return solveKeplerHyperbolic(M, g.e);
    case 'parabolic':
      // D³ + 3D − 3M = 0.
      return 2 * Math.sinh(Math.asinh(1.5 * M) / 3);
    default:
      return assertNever(g.kind);
  }
}

/** Time at an anomaly (E, H or D): Kepler's equation, no solve. */
export function timeAtAnomaly(g: ConicGeometry, x: number): number {
  switch (g.kind) {
    case 'elliptic':
      return g.tPeri + (x - g.e * Math.sin(x)) / g.n;
    case 'hyperbolic':
      return g.tPeri + (g.e * Math.sinh(x) - x) / g.n;
    case 'parabolic':
      return g.tPeri + (x + (x * x * x) / 3) / g.n;
    default:
      return assertNever(g.kind);
  }
}

/** Position in the parent's frame at an anomaly (E, H or D), into out. */
export function positionAtAnomaly(g: ConicGeometry, x: number, out: Vec3): Vec3 {
  let px: number;
  let qy: number;
  switch (g.kind) {
    case 'elliptic':
      px = g.a * (Math.cos(x) - g.e);
      qy = g.a * Math.sqrt(1 - g.e * g.e) * Math.sin(x);
      break;
    case 'hyperbolic':
      px = g.a * (g.e - Math.cosh(x));
      qy = g.a * Math.sqrt(g.e * g.e - 1) * Math.sinh(x);
      break;
    case 'parabolic':
      px = (g.p / 2) * (1 - x * x);
      qy = g.p * x;
      break;
    default:
      return assertNever(g.kind);
  }
  out.x = px * g.P.x + qy * g.Q.x;
  out.y = px * g.P.y + qy * g.Q.y;
  out.z = px * g.P.z + qy * g.Q.z;
  return out;
}

/** A piece of a segment sampled in anomaly, relative to the frame body, float64, with times. */
export interface SegmentPolyline {
  /** 3·n, km, relative to the frame body at each point's time. */
  points: Float64Array;
  /** n, sim seconds. */
  times: Float64Array;
  count: number;
  /** True if the piece is a whole revolution, ending where it started (in the parent's frame). */
  closedLoop: boolean;
  /** The sim time it was sampled at. */
  builtAt: number;
}

export function createPolyline(): SegmentPolyline {
  return {
    points: new Float64Array(3 * (SEGMENT_POINTS + 1)),
    times: new Float64Array(SEGMENT_POINTS + 1),
    count: 0,
    closedLoop: false,
    builtAt: NaN,
  };
}

const scratch = vec3(0, 0, 0);

/**
 * Samples the segment's conic from time tFrom to tTo (both within the segment) into `out`, in
 * SEGMENT_POINTS equal steps of anomaly, relative to `frameBodyId` at each point's time.
 */
export function samplePieceInto(
  sys: BodySystem,
  seg: Segment,
  g: ConicGeometry,
  frameBodyId: BodyId,
  tFrom: number,
  tTo: number,
  out: SegmentPolyline,
): SegmentPolyline {
  const x0 = anomalyAt(g, tFrom);
  let x1 = anomalyAt(g, tTo);
  // A whole revolution: the anomaly comes back to its start, one turn on.
  const whole = g.kind === 'elliptic' && tTo - tFrom >= g.period * (1 - 1e-12);
  if (whole) x1 = x0 + TWO_PI;
  const sameFrame = frameBodyId === seg.parentId;
  for (let k = 0; k <= SEGMENT_POINTS; k++) {
    const x = k === SEGMENT_POINTS ? x1 : x0 + ((x1 - x0) * k) / SEGMENT_POINTS;
    const t = k === 0 ? tFrom : k === SEGMENT_POINTS ? tTo : timeAtAnomaly(g, x);
    positionAtAnomaly(g, x, scratch);
    if (!sameFrame) {
      const off = bodyStateIn(sys, seg.parentId, frameBodyId, t).r;
      scratch.x += off.x;
      scratch.y += off.y;
      scratch.z += off.z;
    }
    out.points[3 * k] = scratch.x;
    out.points[3 * k + 1] = scratch.y;
    out.points[3 * k + 2] = scratch.z;
    out.times[k] = t;
  }
  out.count = SEGMENT_POINTS + 1;
  out.closedLoop = whole && sameFrame;
  return out;
}

/**
 * The first drawn piece of a segment from tFrom (S3-17): to its end for an open conic, or for
 * one revolution at most for an ellipse.
 */
export function sampleSegmentInto(
  sys: BodySystem,
  seg: Segment,
  frameBodyId: BodyId,
  tFrom: number,
  out: SegmentPolyline,
  g: ConicGeometry = conicGeometry(sys, seg),
): SegmentPolyline {
  const from = Math.max(tFrom, seg.tStart);
  const to = g.kind === 'elliptic' ? Math.min(seg.tEnd, from + g.period) : seg.tEnd;
  samplePieceInto(sys, seg, g, frameBodyId, from, to, out);
  out.builtAt = tFrom;
  return out;
}

/**
 * The window of a segment's last revolution (S3-17), or null if it has none: a closed segment
 * that lasts longer than one period from tFrom and ends at an event. In the parent's own frame
 * it starts where the ship is now on the loop (the last time before tEnd the ship is at its
 * current anomaly); in another frame, at max(tFrom + P, tEnd − P).
 */
export function lastRevolutionWindow(
  seg: Segment,
  g: ConicGeometry,
  frameBodyId: BodyId,
  tFrom: number,
): [number, number] | null {
  if (g.kind !== 'elliptic' || seg.endEvent === 'horizon') return null;
  const from = Math.max(tFrom, seg.tStart);
  if (seg.tEnd - from <= g.period) return null;
  if (frameBodyId === seg.parentId) {
    const back = (seg.tEnd - from) % g.period;
    return [seg.tEnd - back, seg.tEnd];
  }
  return [Math.max(from + g.period, seg.tEnd - g.period), seg.tEnd];
}

/**
 * Writes float32(frameBodyWorld + p − origin) for the points after t, preceded by the ship's
 * current position (relative to the frame body) if given; returns the vertex count. `out` holds
 * at least 3 · MAX_VERTICES floats. `outTimes`, if given, gets each written vertex's time.
 */
export function writeTrajectoryVertices(
  out: Float32Array,
  line: SegmentPolyline,
  t: number,
  shipRel: Vec3 | null,
  frameBodyWorld: Vec3,
  origin: Vec3,
  outTimes?: Float64Array,
): number {
  const ox = frameBodyWorld.x - origin.x;
  const oy = frameBodyWorld.y - origin.y;
  const oz = frameBodyWorld.z - origin.z;
  let n = 0;
  if (shipRel) {
    out[0] = ox + shipRel.x;
    out[1] = oy + shipRel.y;
    out[2] = oz + shipRel.z;
    if (outTimes) outTimes[0] = t;
    n = 1;
  }
  for (let k = 0; k < line.count; k++) {
    if (!(line.times[k]! > t)) continue;
    out[3 * n] = ox + line.points[3 * k]!;
    out[3 * n + 1] = oy + line.points[3 * k + 1]!;
    out[3 * n + 2] = oz + line.points[3 * k + 2]!;
    if (outTimes) outTimes[n] = line.times[k]!;
    n++;
  }
  return n;
}

/**
 * The index of the first segment after `t` that ends at a node: every later segment is the
 * planned path, drawn dashed (S4-11). Infinity if no node is reached.
 */
export function firstNodeSegment(segments: readonly Segment[], t: number): number {
  const i = segments.findIndex((s) => s.endEvent === 'maneuver' && s.tEnd > t);
  return i < 0 ? Infinity : i;
}

/**
 * The window of the current orbit after a node on it (S4-11): for a closed segment that ends at
 * a node, from the node to one revolution after tFrom. Null otherwise.
 */
export function currentOrbitRestWindow(
  seg: Segment,
  g: ConicGeometry,
  tFrom: number,
): [number, number] | null {
  if (g.kind !== 'elliptic' || seg.endEvent !== 'maneuver') return null;
  const end = Math.max(tFrom, seg.tStart) + g.period;
  return seg.tEnd < end ? [seg.tEnd, end] : null;
}

/**
 * The window of a segment's elapsed piece in a preview (S5-16 in planning/sprint-5.md): the part
 * flown between now and the preview time t, at most the last revolution of an ellipse before t.
 * Null outside a preview, or if the segment isn't flown in that interval.
 */
export function elapsedWindow(
  seg: Segment,
  g: ConicGeometry,
  now: number,
  t: number,
): [number, number] | null {
  const from = Math.max(now, seg.tStart);
  const to = Math.min(t, seg.tEnd);
  if (!(to > from)) return null;
  return [g.kind === 'elliptic' ? Math.max(from, to - g.period) : from, to];
}

/** The index of the segment containing t (the later one at a boundary), or -1 (S5-10). */
export function segmentIndexAt(segments: readonly Segment[], t: number): number {
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i]!;
    if (s.tStart <= t && t <= s.tEnd) return i;
  }
  return -1;
}
