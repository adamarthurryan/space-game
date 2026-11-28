import { BufferAttribute, BufferGeometry, Line, type Scene } from 'three';
import { vec3, type Vec3 } from '../../math/vec3';
import type { ShipId } from '../../sim/ship';
import type { Segment, Trajectory } from '../../sim/trajectory';
import type { World } from '../../sim/world';
import { sameRef, type MapObjectRef } from '../../store/useView';
import { frameWorldInto, type FrameCamera, type MapFrame } from '../mapFrame';
import type { ProjectedPolyline } from '../pathPicking';
import { projectVerticesInto, screenLineDistances } from '../screenDash';
import { hexToRgb, highlightRgb, shipColor } from '../shipStyle';
import type { MapLayer, ViewSnapshot } from '../stages';
import {
  conicGeometry,
  createPolyline,
  currentOrbitRestWindow,
  elapsedWindow,
  firstNodeSegment,
  lastRevolutionWindow,
  MAX_VERTICES,
  samplePieceInto,
  sampleSegmentInto,
  segmentIndexAt,
  writeTrajectoryVertices,
  type ConicGeometry,
  type SegmentPolyline,
} from '../trajectoryGeometry';
import { createTrajectoryMaterial, type TrajectoryMaterial } from '../trajectoryMaterial';

/** Alpha of a highlighted ship's trajectory, and of the others (S3-18). */
export const TRAJECTORY_ALPHA = { highlighted: 1, normal: 0.45 } as const;
/** Future revolutions are drawn at this fraction of the ship's alpha, not brightened. */
export const FUTURE_REVOLUTION_FADE = 0.35;
/** The route flown during a preview is drawn at this fraction of the ship's alpha (S5-16). */
export const ELAPSED_FADE = 0.35;

/** One drawable piece: a THREE.Line, its vertex buffers, and the float64 polyline behind it. */
interface Piece {
  line: Line<BufferGeometry, TrajectoryMaterial>;
  positions: Float32Array;
  /** Per-vertex cumulative screen length, px, for dashes (S4-11). */
  distances: Float32Array;
  /** Projected vertices (2 per vertex) and their times, for dashes and path picking. */
  screen: Float32Array;
  times: Float64Array;
  poly: SegmentPolyline;
  /** The frame body the polyline was sampled in. */
  frameBodyId: string;
}

interface SegmentLines {
  geometry: ConicGeometry;
  main: Piece;
  /** The faded last revolution before the event, if the segment has one. */
  last: Piece;
  /** The rest of the current orbit after a node on it (segment 0 of the active ship, S4-11). */
  rest: Piece;
  /** In a preview, the part flown between now and the preview time, faded (S5-16). */
  elapsed: Piece;
}

interface ShipLines {
  version: number;
  segments: SegmentLines[];
  rgb: [number, number, number];
  highlight: [number, number, number];
}

function createPiece(scene: Scene, name: string): Piece {
  const positions = new Float32Array(3 * MAX_VERTICES);
  const distances = new Float32Array(MAX_VERTICES);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('lineDistance', new BufferAttribute(distances, 1));
  geometry.setDrawRange(0, 0);
  const line = new Line(geometry, createTrajectoryMaterial());
  // Vertices are rewritten every frame relative to the origin, so the bounds are never valid.
  line.frustumCulled = false;
  line.name = name;
  line.visible = false;
  scene.add(line);
  return {
    line,
    positions,
    distances,
    screen: new Float32Array(2 * MAX_VERTICES),
    times: new Float64Array(MAX_VERTICES),
    poly: createPolyline(),
    frameBodyId: '',
  };
}

function disposePiece(scene: Scene, p: Piece): void {
  scene.remove(p.line);
  p.line.geometry.dispose();
  p.line.material.dispose();
}

const frameBodyWorld = vec3(0, 0, 0);
const shipRel = vec3(0, 0, 0);

/**
 * Trajectory lines (S3-16 to S3-18, S4-11): one THREE.Line per drawn piece of each segment, in
 * the ship's colour, relative to the frame body; the planned path after the first node dashed in
 * screen space. Objects are rebuilt only when a ship's trajectory changes (its version), or the
 * set of ships does. The active ship's main pieces are kept projected in `frame.paths`, for the
 * ghost node (S4-12). Paths are drawn from the frame's time, which is the preview time in a
 * preview (S5-10); the route flown between now and then is drawn faded (S5-16).
 */
export class TrajectoryLayer implements MapLayer {
  private readonly scene: Scene;
  private world: World | null = null;
  private readonly ships = new Map<ShipId, ShipLines>();
  /** Drawn vertices per segment of each ship, this frame (main pieces), for the debug handle. */
  readonly vertexCounts = new Map<ShipId, number[]>();
  /** Drawn vertices per segment of each ship's elapsed pieces this frame (S5-16), for debug. */
  readonly elapsedCounts = new Map<ShipId, number[]>();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  sync(world: World): void {
    this.world = world;
  }

  update(frame: MapFrame, view: ViewSnapshot): void {
    const world = this.world;
    frame.paths = [];
    if (!world) return;
    const fs = frame.ships;
    const seen = new Set<ShipId>();
    const fb = frame.indexOf[view.frameBodyId];
    if (fb === undefined) return;
    frameWorldInto(frame, fb, frameBodyWorld);
    const t = frame.t;

    const now = frame.now;
    // Every coasting ship: one not drawn at a previewed time (past its impact) still has its
    // elapsed route (S5-16).
    for (const ship of Object.values(world.ships)) {
      const id = ship.id;
      const traj = world.derived.trajectories[id];
      if (ship.status !== 'coasting' || !traj) continue;
      const k = fs.indexOf[id];
      seen.add(id);
      const lines = this.linesFor(id, ship.seq, traj);
      const ref: MapObjectRef = { kind: 'ship', id };
      const active = view.activeShipId === id;
      const highlighted =
        active ||
        sameRef(view.focus, ref) ||
        sameRef(view.selected, ref) ||
        sameRef(view.hovered, ref);
      const alpha = highlighted ? TRAJECTORY_ALPHA.highlighted : TRAJECTORY_ALPHA.normal;
      const rgb = highlighted ? lines.highlight : lines.rgb;
      if (k !== undefined) {
        shipRel.x = fs.world[3 * k]! - frameBodyWorld.x;
        shipRel.y = fs.world[3 * k + 1]! - frameBodyWorld.y;
        shipRel.z = fs.world[3 * k + 2]! - frameBodyWorld.z;
      }
      const planned = firstNodeSegment(traj.segments, t);
      // The segment the ship is on at t: its path starts at the ship (S5-10).
      const cur = k === undefined ? -1 : segmentIndexAt(traj.segments, t);

      const counts: number[] = [];
      const elapsedCounts: number[] = [];
      traj.segments.forEach((seg, i) => {
        const sl = lines.segments[i]!;
        const g = sl.geometry;
        elapsedCounts.push(
          this.showElapsed(
            sl,
            seg,
            g,
            now,
            t,
            view.frameBodyId,
            frameBodyWorld,
            frame,
            lines.rgb,
            alpha,
          ),
        );
        if (seg.tEnd <= t) {
          sl.main.line.visible = false;
          sl.last.line.visible = false;
          sl.rest.line.visible = false;
          counts.push(0);
          return;
        }
        const dashed = i > planned;
        const tFrom = Math.max(t, seg.tStart);
        const live = g.kind === 'elliptic' && seg.parentId === view.frameBodyId;

        // The first piece: live from the ship's anomaly in its parent's frame; otherwise
        // cached, and rebuilt after a quarter period for an ellipse.
        const main = sl.main;
        const stale =
          main.frameBodyId !== view.frameBodyId ||
          Number.isNaN(main.poly.builtAt) ||
          // A preview moved back before the sampling (S5-10).
          tFrom < main.poly.builtAt ||
          (g.kind === 'elliptic' && t - main.poly.builtAt > g.period / 4);
        if (live || stale) {
          sampleSegmentInto(world.system, seg, view.frameBodyId, tFrom, main.poly, g);
          main.frameBodyId = view.frameBodyId;
        }
        const n = writeTrajectoryVertices(
          main.positions,
          main.poly,
          t,
          i === cur ? shipRel : null,
          frameBodyWorld,
          frame.origin,
          main.times,
        );
        this.show(main, n, rgb, alpha, dashed, frame.camera, active);
        counts.push(n);
        if (active && n >= 2) {
          frame.paths.push({
            shipId: id,
            segmentIndex: i,
            screen: main.screen,
            times: main.times,
            count: n,
          } satisfies ProjectedPolyline);
        }

        // The last revolution before the event, faded.
        const last = sl.last;
        const win = lastRevolutionWindow(seg, g, view.frameBodyId, tFrom);
        if (!win) {
          last.line.visible = false;
        } else {
          if (
            live ||
            last.frameBodyId !== view.frameBodyId ||
            Number.isNaN(last.poly.builtAt) ||
            t < last.poly.builtAt
          ) {
            samplePieceInto(world.system, seg, g, view.frameBodyId, win[0], win[1], last.poly);
            last.poly.builtAt = t;
            last.frameBodyId = view.frameBodyId;
          }
          const m = writeTrajectoryVertices(
            last.positions,
            last.poly,
            t,
            null,
            frameBodyWorld,
            frame.origin,
          );
          this.show(
            last,
            m,
            lines.rgb,
            alpha * FUTURE_REVOLUTION_FADE,
            dashed,
            frame.camera,
            false,
          );
        }

        // The rest of the current orbit after a node on it, for the active ship (S4-11).
        const rest = sl.rest;
        const restWin = i === cur && active ? currentOrbitRestWindow(seg, g, tFrom) : null;
        if (!restWin) {
          rest.line.visible = false;
        } else {
          samplePieceInto(
            world.system,
            seg,
            g,
            view.frameBodyId,
            restWin[0],
            restWin[1],
            rest.poly,
          );
          const m = writeTrajectoryVertices(
            rest.positions,
            rest.poly,
            t,
            null,
            frameBodyWorld,
            frame.origin,
          );
          this.show(rest, m, lines.rgb, alpha * FUTURE_REVOLUTION_FADE, false, frame.camera, false);
        }
      });
      this.vertexCounts.set(id, counts);
      this.elapsedCounts.set(id, elapsedCounts);
    }

    for (const id of [...this.ships.keys()]) {
      if (!seen.has(id)) this.drop(id);
    }
  }

  /** The segment's elapsed piece in a preview (S5-16): solid, faded; hidden otherwise. */
  private showElapsed(
    sl: SegmentLines,
    seg: Segment,
    g: ConicGeometry,
    now: number,
    t: number,
    frameBodyId: string,
    frameBodyWorld: Vec3,
    frame: MapFrame,
    rgb: [number, number, number],
    alpha: number,
  ): number {
    const p = sl.elapsed;
    const win = elapsedWindow(seg, g, now, t);
    if (!win) {
      p.line.visible = false;
      return 0;
    }
    samplePieceInto(this.world!.system, seg, g, frameBodyId, win[0], win[1], p.poly);
    const n = writeTrajectoryVertices(
      p.positions,
      p.poly,
      -Infinity,
      null,
      frameBodyWorld,
      frame.origin,
    );
    this.show(p, n, rgb, alpha * ELAPSED_FADE, false, frame.camera, false);
    return n;
  }

  private show(
    p: Piece,
    n: number,
    rgb: [number, number, number],
    alpha: number,
    dashed: boolean,
    cam: FrameCamera,
    project: boolean,
  ): void {
    p.line.visible = n >= 2;
    if (!p.line.visible) return;
    const geom = p.line.geometry;
    geom.setDrawRange(0, n);
    const pos = geom.attributes['position'];
    if (pos) pos.needsUpdate = true;
    if (dashed || project) projectVerticesInto(cam, p.positions, n, p.screen);
    if (dashed) {
      screenLineDistances(p.screen, n, p.distances);
      const dist = geom.attributes['lineDistance'];
      if (dist) dist.needsUpdate = true;
    }
    const u = p.line.material.uniforms;
    u.color.value.setRGB(rgb[0], rgb[1], rgb[2], 'srgb');
    u.opacity.value = alpha;
    u.dashed.value = dashed ? 1 : 0;
  }

  /** The ship's line objects, rebuilt if its trajectory changed. */
  private linesFor(id: ShipId, seq: number, traj: Trajectory): ShipLines {
    const cur = this.ships.get(id);
    if (cur && cur.version === traj.version) return cur;
    if (cur) this.drop(id);
    const world = this.world!;
    const rgb = hexToRgb(shipColor(seq));
    const lines: ShipLines = {
      version: traj.version,
      rgb,
      highlight: highlightRgb(rgb),
      segments: traj.segments.map((seg, i) => ({
        geometry: conicGeometry(world.system, seg),
        main: createPiece(this.scene, `trajectory:${id}:${i}`),
        last: createPiece(this.scene, `trajectory:${id}:${i}:last`),
        rest: createPiece(this.scene, `trajectory:${id}:${i}:rest`),
        elapsed: createPiece(this.scene, `trajectory:${id}:${i}:elapsed`),
      })),
    };
    this.ships.set(id, lines);
    return lines;
  }

  private drop(id: ShipId): void {
    const lines = this.ships.get(id);
    if (!lines) return;
    for (const s of lines.segments) {
      disposePiece(this.scene, s.main);
      disposePiece(this.scene, s.last);
      disposePiece(this.scene, s.rest);
      disposePiece(this.scene, s.elapsed);
    }
    this.ships.delete(id);
    this.vertexCounts.delete(id);
    this.elapsedCounts.delete(id);
  }

  dispose(): void {
    for (const id of [...this.ships.keys()]) this.drop(id);
  }
}
