/**
 * Patched-conic coasting (decisions S3-7 and S3-8 in planning/sprint-3.md).
 *
 * A trajectory is a list of segments. Each conic segment stores its start state in its parent's
 * frame and ends at the earliest of: impact, SOI exit, SOI entry into a major child, or the
 * horizon. At an SOI event the end state is moved into the next frame, which starts the next
 * segment. Deterministic, and plain data out.
 *
 * Every consumer of `Segment` switches on `kind` with an `assertNever` default, so adding a
 * segment kind (milestone 3's thrust segments) lists every place that must handle it.
 */

import { SECONDS_PER_JULIAN_YEAR } from '../math/units';
import { vec3, type Vec3 } from '../math/vec3';
import { elementsFromState, periapsis, type StateVector } from '../orbital/elements';
import { meanPositionInto, propagateInto } from '../orbital/propagate';
import { findSphereEntry, timeToRadius } from '../orbital/soi';
import { changeFrame, getBody, majorChildren, type BodyId, type BodySystem } from './body';
import type { OrbitState } from './ship';

export type SegmentEnd = 'soi-exit' | 'soi-enter' | 'impact' | 'horizon'; // sprint 4 adds 'maneuver'

export interface ConicSegment {
  kind: 'conic';
  parentId: BodyId;
  /** At tStart, in the parent's frame. */
  r0: Vec3;
  v0: Vec3;
  tStart: number;
  tEnd: number;
  endEvent: SegmentEnd;
  /** The body entered, exited to, or impacted. */
  endTargetId?: BodyId;
}

/** Milestone 3 adds ThrustSegment. */
export type Segment = ConicSegment;

export interface Trajectory {
  segments: Segment[];
  /** Bumped on every recompute. */
  version: number;
}

/** At most this many segments per trajectory (S3-7). */
export const MAX_SEGMENTS = 5;
/** Safety cap from the trajectory's start (S3-7). */
export const HORIZON_CAP = 10 * SECONDS_PER_JULIAN_YEAR;
/** A segment never ends sooner than this after starting on the boundary it just crossed, s. */
export const MIN_SEGMENT_S = 1;
/** The entry search's smallest step is the SOI radius over this many times the closing speed. */
const ENTRY_MIN_STEP_DIVISOR = 100;

export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}

const newState = (): StateVector => ({ r: vec3(0, 0, 0), v: vec3(0, 0, 0) });

/** State in the segment's parent frame at t ∈ [tStart, tEnd]. */
export function segmentStateAt(
  sys: BodySystem,
  seg: Segment,
  t: number,
  out: StateVector = newState(),
): StateVector {
  switch (seg.kind) {
    case 'conic':
      return propagateInto(
        out,
        getBody(sys, seg.parentId).mu,
        { r: seg.r0, v: seg.v0 },
        t - seg.tStart,
      );
    default:
      return assertNever(seg.kind);
  }
}

/** The body whose frame the next segment is in, after an SOI event; null otherwise. */
function nextParent(sys: BodySystem, seg: Segment): BodyId | null {
  switch (seg.endEvent) {
    case 'soi-exit':
      return getBody(sys, seg.parentId).parentId;
    case 'soi-enter':
      return seg.endTargetId ?? null;
    case 'impact':
    case 'horizon':
      return null;
    default:
      return assertNever(seg.endEvent);
  }
}

/** The segment's end state, moved into the next segment's frame (the next segment's start). */
export function transitionState(sys: BodySystem, seg: Segment): OrbitState | null {
  const to = nextParent(sys, seg);
  if (to === null) return null;
  const end = segmentStateAt(sys, seg, seg.tEnd);
  const s = changeFrame(sys, end, seg.parentId, to, seg.tEnd);
  return { parentId: to, t: seg.tEnd, r: s.r, v: s.v };
}

interface SegmentEndResult {
  tEnd: number;
  endEvent: SegmentEnd;
  endTargetId?: BodyId;
}

/** The earliest event of a conic from `start` before tCap (S3-8). */
function findSegmentEnd(
  sys: BodySystem,
  start: OrbitState,
  tCap: number,
  justEntered: boolean,
): SegmentEndResult {
  const parent = getBody(sys, start.parentId);
  const mu = parent.mu;
  const s0: StateVector = { r: start.r, v: start.v };
  const t0 = start.t;

  let best: SegmentEndResult = { tEnd: tCap, endEvent: 'horizon' };
  const consider = (t: number | null, r: SegmentEndResult) => {
    // Strictly earlier only: ties go to the candidate considered first.
    if (t !== null && t < best.tEnd) best = r;
  };

  // Impact, inbound at the top of the atmosphere.
  const dtImpact = timeToRadius(mu, s0, parent.radius + parent.atmosphereHeight, 'inbound');
  if (dtImpact !== null) {
    const t = t0 + dtImpact;
    consider(t, { tEnd: t, endEvent: 'impact', endTargetId: parent.id });
  }

  // SOI exit, outbound; the root has none.
  if (parent.parentId !== null && parent.soiRadius !== undefined) {
    const dtExit = timeToRadius(mu, s0, parent.soiRadius, 'outbound');
    if (dtExit !== null) {
      const t = t0 + (justEntered ? Math.max(dtExit, MIN_SEGMENT_S) : dtExit);
      consider(t, { tEnd: t, endEvent: 'soi-exit', endTargetId: parent.parentId });
    }
  }

  // SOI entry into a major child whose radial band overlaps the ship's.
  const el = elementsFromState(mu, s0);
  const rp = periapsis(el);
  const ra = el.e < 1 ? el.p / (1 - el.e) : Infinity;
  const vp = Math.sqrt((mu * (1 + el.e)) / rp);
  const ship = newState();
  const childPos = vec3(0, 0, 0);
  for (const child of majorChildren(sys, parent.id)) {
    const orbit = child.orbit;
    const R = child.soiRadius;
    if (!orbit || R === undefined) continue;
    const q = orbit.a * (1 - orbit.e);
    const Q = orbit.a * (1 + orbit.e);
    if (q - R > ra || Q + R < rp) continue;
    const vChild = Math.sqrt((mu * (1 + orbit.e)) / q);
    const vMax = vp + vChild;
    const f = (t: number) => {
      propagateInto(ship, mu, s0, t - t0);
      meanPositionInto(orbit, t, childPos);
      return Math.hypot(ship.r.x - childPos.x, ship.r.y - childPos.y, ship.r.z - childPos.z) - R;
    };
    const t = findSphereEntry(f, t0, best.tEnd, vMax, R / (ENTRY_MIN_STEP_DIVISOR * vMax));
    consider(t, { tEnd: t ?? 0, endEvent: 'soi-enter', endTargetId: child.id });
  }
  return best;
}

/** Patched-conic coasting from `start` (S3-7, S3-8). Deterministic; plain data out. */
export function computeTrajectory(
  sys: BodySystem,
  start: OrbitState,
  opts: { maxSegments?: number; horizonCap?: number } = {},
): Segment[] {
  const maxSegments = opts.maxSegments ?? MAX_SEGMENTS;
  const tCap = start.t + (opts.horizonCap ?? HORIZON_CAP);
  const segments: Segment[] = [];
  let state: OrbitState | null = start;
  let justEntered = false;
  while (state && segments.length < maxSegments) {
    const end = findSegmentEnd(sys, state, tCap, justEntered);
    const seg: ConicSegment = {
      kind: 'conic',
      parentId: state.parentId,
      r0: { ...state.r },
      v0: { ...state.v },
      tStart: state.t,
      tEnd: end.tEnd,
      endEvent: end.endEvent,
    };
    if (end.endTargetId !== undefined) seg.endTargetId = end.endTargetId;
    segments.push(seg);
    justEntered = end.endEvent === 'soi-enter';
    state = transitionState(sys, seg);
  }
  return segments;
}
