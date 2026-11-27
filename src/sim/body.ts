/**
 * Celestial bodies: the body tree, its derived fields, positions and frame changes.
 *
 * Bodies are on rails: each body's orbit is a set of mean elements relative to its parent
 * (decision S1-5). Every body frame is non-rotating and parallel to the world frame (S1-1), so a
 * change of frame is a translation. States are moved between frames through the lowest common
 * ancestor, never through the Sun unless that is the common ancestor (S1-11), to keep precision
 * at docking scale.
 *
 * `major`, `soiRadius` and `childIds` are derived once by `buildBodySystem` and stored as plain
 * data (S1-10). A `BodySystem` is plain data: it survives a JSON round trip.
 */

import { G, wrapTwoPi } from '../math/units';
import type { Vec3 } from '../math/vec3';
import type { MeanElements, ReferencePlane, StateVector } from '../orbital/elements';
import { addState, planePole, subState } from '../orbital/frames';
import { stateFromMeanElements } from '../orbital/propagate';
import { laplaceSoiRadius } from '../orbital/soi';

export type BodyId = string; // 'sun', 'earth', 'moon', …
export type BodyClass = 'star' | 'planet' | 'dwarf-planet' | 'moon'; // sprint 8 adds 'asteroid'

/** Spin axis and prime meridian (S1-16). Plain data. */
export interface BodyRotation {
  /** The equator's pole: RA and Dec at J2000, ICRF. The equator is the plane. */
  pole: ReferencePlane;
  /** Prime meridian angle W at t = 0, rad. */
  w0: number;
  /** rad/s; negative for retrograde rotators. */
  wRate: number;
}

/** The inputs a generator supplies. */
export interface BodyInput {
  id: BodyId;
  name: string;
  class: BodyClass;
  /** null only for the root. */
  parentId: BodyId | null;
  /** GM, km³/s² (S1-9). */
  mu: number;
  /** Mean radius, km. */
  radius: number;
  /** Height above `radius` at which an impact happens (sprint 3), km; 0 if none. */
  atmosphereHeight: number;
  /** Relative to the parent; absent only for the root. */
  orbit?: MeanElements;
  /** Absent if the IAU gives no rotation elements. */
  rotation?: BodyRotation;
}

/** A body in the system. Plain data. */
export interface Body extends BodyInput {
  // Derived by buildBodySystem (S1-10):
  /** Mass ≥ MAJOR_MASS_THRESHOLD_KG; the root is always major. */
  major: boolean;
  /** Major non-root bodies only. */
  soiRadius?: number;
  /** Ordered by semi-major axis. */
  childIds: BodyId[];
}

export interface BodySystem {
  /** TDB Julian date of t = 0 (S1-2). */
  epochJd: number;
  rootId: BodyId;
  bodies: Record<BodyId, Body>;
}

/** Bodies at least this massive are major and have an SOI (S1-8). */
export const MAJOR_MASS_THRESHOLD_KG = 1e19;

// ---- Building and validation ----------------------------------------------------------------

/** Derives `major`, `soiRadius` and `childIds`, then validates. Throws listing every error. */
export function buildBodySystem(epochJd: number, inputs: readonly BodyInput[]): BodySystem {
  const bodies: Record<BodyId, Body> = {};
  for (const input of inputs) {
    const body: Body = { ...structuredClone(input), major: false, childIds: [] };
    body.major = input.parentId === null || input.mu / G >= MAJOR_MASS_THRESHOLD_KG;
    bodies[input.id] = body;
  }

  for (const body of Object.values(bodies)) {
    const parent = body.parentId === null ? undefined : bodies[body.parentId];
    if (!parent) continue;
    parent.childIds.push(body.id);
    if (body.major && body.orbit) {
      body.soiRadius = laplaceSoiRadius(body.orbit.a, body.mu, parent.mu);
    }
  }

  const semiMajor = (id: BodyId) => bodies[id]?.orbit?.a ?? 0;
  for (const body of Object.values(bodies)) {
    body.childIds.sort((a, b) => semiMajor(a) - semiMajor(b) || (a < b ? -1 : a > b ? 1 : 0));
  }

  const roots = inputs.filter((b) => b.parentId === null);
  const sys: BodySystem = { epochJd, rootId: roots[0]?.id ?? '', bodies };
  const errors = validateBodySystem(sys);
  if (errors.length > 0) {
    throw new Error(`Invalid body system:\n- ${errors.join('\n- ')}`);
  }
  return sys;
}

/** Returns the problems found; [] if valid. */
export function validateBodySystem(sys: BodySystem): string[] {
  const errors: string[] = [];
  const { bodies } = sys;
  const all = Object.entries(bodies);

  const roots = all.filter(([, b]) => b.parentId === null).map(([, b]) => b);
  if (roots.length !== 1) {
    errors.push(
      `expected exactly one root, found ${roots.length}: ${roots.map((b) => b.id).join(', ')}`,
    );
  }
  for (const root of roots) {
    if (root.class !== 'star') errors.push(`root ${root.id} is a ${root.class}, not a star`);
  }
  if (!bodies[sys.rootId] || bodies[sys.rootId]?.parentId !== null) {
    errors.push(`rootId ${sys.rootId} is not a root body`);
  }

  for (const [key, b] of all) {
    const name = b.id;
    if (key !== b.id) errors.push(`key ${key} holds body ${b.id}`);
    if (!(b.mu > 0)) errors.push(`${name}: mu must be positive, got ${b.mu}`);
    if (!(b.radius > 0)) errors.push(`${name}: radius must be positive, got ${b.radius}`);
    if (!(b.atmosphereHeight >= 0)) {
      errors.push(`${name}: atmosphereHeight must be ≥ 0, got ${b.atmosphereHeight}`);
    }

    const isRoot = b.parentId === null;
    if (isRoot && b.orbit) errors.push(`${name}: the root has an orbit`);
    if (!isRoot && !b.orbit) errors.push(`${name}: has no orbit`);

    const parent = b.parentId === null ? undefined : bodies[b.parentId];
    if (!isRoot && !parent) errors.push(`${name}: parent ${b.parentId} does not exist`);

    // Reaches the root, without a cycle.
    if (!isRoot && parent) {
      const seen = new Set<BodyId>([b.id]);
      let cur: Body | undefined = parent;
      while (cur && cur.parentId !== null) {
        if (seen.has(cur.id)) {
          errors.push(`${name}: its ancestors form a cycle through ${cur.id}`);
          break;
        }
        seen.add(cur.id);
        cur = bodies[cur.parentId];
      }
      if (!cur) errors.push(`${name}: does not reach the root`);
    }

    const o = b.orbit;
    if (o) {
      if (!(o.e >= 0 && o.e < 1)) errors.push(`${name}: e must be in [0, 1), got ${o.e}`);
      if (!(o.a > 0)) errors.push(`${name}: a must be positive, got ${o.a}`);
      if (!(o.meanMotion > 0)) errors.push(`${name}: n must be positive, got ${o.meanMotion}`);
      if (parent) {
        const pe = o.a * (1 - o.e);
        const ap = o.a * (1 + o.e);
        const floor = parent.radius + parent.atmosphereHeight;
        if (!(pe > floor)) {
          errors.push(`${name}: periapsis ${pe} km is inside ${parent.id} (${floor} km)`);
        }
        if (parent.parentId !== null) {
          const soi = soiRadiusOf(parent);
          if (!(ap < soi)) {
            errors.push(
              `${name}: apoapsis ${ap} km is outside the SOI of ${parent.id} (${soi} km)`,
            );
          }
        }
      }
    }

    if (b.major && !isRoot && !(b.soiRadius !== undefined && b.soiRadius > b.radius)) {
      errors.push(`${name}: SOI radius ${b.soiRadius} km is not above its radius ${b.radius} km`);
    }

    // childIds match the parent links.
    const expected = all
      .filter(([, c]) => c.parentId === b.id)
      .map(([k]) => k)
      .sort();
    const actual = [...b.childIds].sort();
    if (expected.length !== actual.length || expected.some((id, k) => id !== actual[k])) {
      errors.push(`${name}: childIds [${actual.join(', ')}] ≠ children [${expected.join(', ')}]`);
    }
  }
  return errors;
}

// ---- Queries --------------------------------------------------------------------------------

/** Throws on an unknown ID. */
export function getBody(sys: BodySystem, id: BodyId): Body {
  const b = sys.bodies[id];
  if (!b) throw new Error(`Unknown body: ${id}`);
  return b;
}

/** kg, derived from GM (S1-9). */
export function bodyMass(b: Body): number {
  return b.mu / G;
}

/** Infinity for the root, 0 for a minor body. */
export function soiRadiusOf(b: Body): number {
  if (b.parentId === null) return Infinity;
  return b.major ? (b.soiRadius ?? 0) : 0;
}

export function majorChildren(sys: BodySystem, id: BodyId): Body[] {
  return getBody(sys, id)
    .childIds.map((c) => getBody(sys, c))
    .filter((c) => c.major);
}

/** Parent first, root last. Empty for the root. */
export function ancestors(sys: BodySystem, id: BodyId): BodyId[] {
  const out: BodyId[] = [];
  let parentId = getBody(sys, id).parentId;
  while (parentId !== null) {
    out.push(parentId);
    parentId = getBody(sys, parentId).parentId;
  }
  return out;
}

/** The lowest common ancestor; a body counts as its own ancestor. */
export function commonAncestor(sys: BodySystem, a: BodyId, b: BodyId): BodyId {
  const chainA = new Set([a, ...ancestors(sys, a)]);
  for (const id of [b, ...ancestors(sys, b)]) if (chainA.has(id)) return id;
  throw new Error(`${a} and ${b} have no common ancestor`);
}

// ---- States ---------------------------------------------------------------------------------

function zeroState(): StateVector {
  return { r: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 } };
}

/** Relative to its parent, in world axes. The root's is zero. */
export function bodyLocalState(sys: BodySystem, id: BodyId, t: number): StateVector {
  const b = getBody(sys, id);
  return b.orbit ? stateFromMeanElements(b.orbit, t) : zeroState();
}

/**
 * The state of `id` relative to its ancestor `ancestorId`: local(id) + rel(parent, ancestor),
 * summed from the ancestor down so that rel(x) = local(x) + rel(parent(x)) holds exactly.
 */
function stateRelativeToAncestor(
  sys: BodySystem,
  id: BodyId,
  ancestorId: BodyId,
  t: number,
): StateVector {
  const chain: BodyId[] = [];
  for (let cur: BodyId = id; cur !== ancestorId;) {
    chain.push(cur);
    const parentId = getBody(sys, cur).parentId;
    if (parentId === null) throw new Error(`${ancestorId} is not an ancestor of ${id}`);
    cur = parentId;
  }
  const top = chain.at(-1);
  if (top === undefined) return zeroState();
  // Start from the top body's own state rather than zero + it, which could turn −0 into +0.
  let acc = bodyLocalState(sys, top, t);
  for (let k = chain.length - 2; k >= 0; k--) {
    acc = addState(bodyLocalState(sys, chain[k]!, t), acc);
  }
  return acc;
}

/** Heliocentric (relative to the root), summed up the tree. */
export function bodyWorldState(sys: BodySystem, id: BodyId, t: number): StateVector {
  return stateRelativeToAncestor(sys, id, sys.rootId, t);
}

/** The state of body `id` relative to body `frameId`, through their common ancestor (S1-11). */
export function bodyStateIn(sys: BodySystem, id: BodyId, frameId: BodyId, t: number): StateVector {
  const c = commonAncestor(sys, id, frameId);
  if (c === frameId) return stateRelativeToAncestor(sys, id, c, t);
  return subState(
    stateRelativeToAncestor(sys, id, c, t),
    stateRelativeToAncestor(sys, frameId, c, t),
  );
}

/** Moves a state relative to `fromId` into the frame of `toId`, through the common ancestor. */
export function changeFrame(
  sys: BodySystem,
  s: StateVector,
  fromId: BodyId,
  toId: BodyId,
  t: number,
): StateVector {
  if (fromId === toId) return { r: { ...s.r }, v: { ...s.v } };
  return addState(s, bodyStateIn(sys, fromId, toId, t));
}

// ---- Rotation -------------------------------------------------------------------------------

/** Unit north pole in ecliptic axes, or undefined without rotation data. */
export function bodyPole(b: Body): Vec3 | undefined {
  return b.rotation ? planePole(b.rotation.pole) : undefined;
}

/** The prime meridian angle W at t, wrapped to [0, 2π), or undefined without rotation data. */
export function rotationAngle(b: Body, t: number): number | undefined {
  return b.rotation ? wrapTwoPi(b.rotation.w0 + b.rotation.wRate * t) : undefined;
}
