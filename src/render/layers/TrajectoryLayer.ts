import { BufferAttribute, BufferGeometry, Color, Line, LineBasicMaterial, type Scene } from 'three';
import { vec3 } from '../../math/vec3';
import type { ShipId } from '../../sim/ship';
import type { Trajectory } from '../../sim/trajectory';
import type { World } from '../../sim/world';
import { sameRef, type MapObjectRef } from '../../store/useView';
import { frameWorldInto, type MapFrame } from '../mapFrame';
import { hexToRgb, highlightRgb, shipColor } from '../shipStyle';
import type { MapLayer, ViewSnapshot } from '../stages';
import {
  conicGeometry,
  createPolyline,
  lastRevolutionWindow,
  MAX_VERTICES,
  samplePieceInto,
  sampleSegmentInto,
  writeTrajectoryVertices,
  type ConicGeometry,
  type SegmentPolyline,
} from '../trajectoryGeometry';

/** Alpha of a highlighted ship's trajectory, and of the others (S3-18). */
export const TRAJECTORY_ALPHA = { highlighted: 1, normal: 0.45 } as const;
/** Future revolutions are drawn at this fraction of the ship's alpha, not brightened. */
export const FUTURE_REVOLUTION_FADE = 0.35;

/** One drawable piece: a THREE.Line, its vertex buffer, and the float64 polyline behind it. */
interface Piece {
  line: Line<BufferGeometry, LineBasicMaterial>;
  positions: Float32Array;
  poly: SegmentPolyline;
  /** The frame body the polyline was sampled in. */
  frameBodyId: string;
}

interface SegmentLines {
  geometry: ConicGeometry;
  main: Piece;
  /** The faded last revolution before the event, if the segment has one. */
  last: Piece;
}

interface ShipLines {
  version: number;
  segments: SegmentLines[];
  rgb: [number, number, number];
  highlight: [number, number, number];
}

function createPiece(scene: Scene, name: string): Piece {
  const positions = new Float32Array(3 * MAX_VERTICES);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);
  const material = new LineBasicMaterial({ transparent: true, depthWrite: false });
  const line = new Line(geometry, material);
  // Vertices are rewritten every frame relative to the origin, so the bounds are never valid.
  line.frustumCulled = false;
  line.name = name;
  line.visible = false;
  scene.add(line);
  return { line, positions, poly: createPolyline(), frameBodyId: '' };
}

function disposePiece(scene: Scene, p: Piece): void {
  scene.remove(p.line);
  p.line.geometry.dispose();
  p.line.material.dispose();
}

const frameBodyWorld = vec3(0, 0, 0);
const shipRel = vec3(0, 0, 0);
const color = new Color();

/**
 * Trajectory lines (S3-16 to S3-18): one THREE.Line per drawn piece of each segment, in the
 * ship's colour, relative to the frame body. Objects are rebuilt only when a ship's trajectory
 * changes (its version), or the set of ships does.
 */
export class TrajectoryLayer implements MapLayer {
  private readonly scene: Scene;
  private world: World | null = null;
  private readonly ships = new Map<ShipId, ShipLines>();
  /** Drawn vertices per segment of each ship, this frame (main pieces), for the debug handle. */
  readonly vertexCounts = new Map<ShipId, number[]>();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  sync(world: World): void {
    this.world = world;
  }

  update(frame: MapFrame, view: ViewSnapshot): void {
    const world = this.world;
    if (!world) return;
    const fs = frame.ships;
    const seen = new Set<ShipId>();
    const fb = frame.indexOf[view.frameBodyId];
    if (fb === undefined) return;
    frameWorldInto(frame, fb, frameBodyWorld);

    for (let k = 0; k < fs.ids.length; k++) {
      const id = fs.ids[k]!;
      const ship = world.ships[id];
      const traj = world.derived.trajectories[id];
      if (!ship || !traj) continue;
      seen.add(id);
      const lines = this.linesFor(id, ship.seq, traj);
      const ref: MapObjectRef = { kind: 'ship', id };
      const highlighted =
        sameRef(view.focus, ref) || sameRef(view.selected, ref) || sameRef(view.hovered, ref);
      const alpha = highlighted ? TRAJECTORY_ALPHA.highlighted : TRAJECTORY_ALPHA.normal;
      shipRel.x = fs.world[3 * k]! - frameBodyWorld.x;
      shipRel.y = fs.world[3 * k + 1]! - frameBodyWorld.y;
      shipRel.z = fs.world[3 * k + 2]! - frameBodyWorld.z;

      const counts: number[] = [];
      traj.segments.forEach((seg, i) => {
        const sl = lines.segments[i]!;
        const t = frame.t;
        if (seg.tEnd <= t) {
          sl.main.line.visible = false;
          sl.last.line.visible = false;
          counts.push(0);
          return;
        }
        const tFrom = i === 0 ? Math.max(t, seg.tStart) : seg.tStart;
        const g = sl.geometry;
        const live = g.kind === 'elliptic' && seg.parentId === view.frameBodyId;

        // The first piece: live from the ship's anomaly in its parent's frame; otherwise
        // cached, and rebuilt after a quarter period for an ellipse.
        const main = sl.main;
        const stale =
          main.frameBodyId !== view.frameBodyId ||
          Number.isNaN(main.poly.builtAt) ||
          (g.kind === 'elliptic' && t - main.poly.builtAt > g.period / 4);
        if (live || stale) {
          sampleSegmentInto(world.system, seg, view.frameBodyId, tFrom, main.poly, g);
          main.frameBodyId = view.frameBodyId;
        }
        const n = writeTrajectoryVertices(
          main.positions,
          main.poly,
          t,
          i === 0 ? shipRel : null,
          frameBodyWorld,
          frame.origin,
        );
        this.show(main, n, highlighted ? lines.highlight : lines.rgb, alpha);
        counts.push(n);

        // The last revolution before the event, faded.
        const last = sl.last;
        const win = lastRevolutionWindow(seg, g, view.frameBodyId, tFrom);
        if (!win) {
          last.line.visible = false;
          return;
        }
        if (live || last.frameBodyId !== view.frameBodyId || Number.isNaN(last.poly.builtAt)) {
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
        this.show(last, m, lines.rgb, alpha * FUTURE_REVOLUTION_FADE);
      });
      this.vertexCounts.set(id, counts);
    }

    for (const id of [...this.ships.keys()]) {
      if (!seen.has(id)) this.drop(id);
    }
  }

  private show(p: Piece, n: number, rgb: [number, number, number], alpha: number): void {
    p.line.visible = n >= 2;
    if (!p.line.visible) return;
    p.line.geometry.setDrawRange(0, n);
    const pos = p.line.geometry.attributes['position'];
    if (pos) pos.needsUpdate = true;
    p.line.material.color.copy(color.setRGB(rgb[0], rgb[1], rgb[2], 'srgb'));
    p.line.material.opacity = alpha;
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
    }
    this.ships.delete(id);
    this.vertexCounts.delete(id);
  }

  dispose(): void {
    for (const id of [...this.ships.keys()]) this.drop(id);
  }
}
