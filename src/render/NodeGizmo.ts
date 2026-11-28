/**
 * The node gizmo (decision S4-14 in planning/sprint-4.md): six handles on the active ship's
 * selected node, along its local orbital frame, kept 60 px long on screen and drawn on top.
 * Handles are picked with a Raycaster against invisible hit spheres, from the pointer listeners.
 * A handle drag changes its Δv component with a cubic sensitivity (Shift fine, Alt coarse); a
 * drag of the node itself slides its time along the path without the node, frozen at the press.
 * Edits are queued and applied once per animation frame by `flush()` (S4-8).
 */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  SphereGeometry,
  Vector2,
  Vector3,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import { pathWithout, type NodeEdit } from '../game/actions';
import { vec3, type Vec3 } from '../math/vec3';
import { localOrbitalBasis, type LocalDv, type OrbitalBasis } from '../orbital/frames';
import { fallbackPole } from '../sim/maneuver';
import type { ShipId } from '../sim/ship';
import { MIN_NODE_LEAD } from '../sim/maneuver';
import type { World } from '../sim/world';
import { useWorld } from '../store/useWorld';
import { frameWorldInto, type MapFrame } from './mapFrame';
import {
  dragDelta,
  dragModeOf,
  GIZMO_ARM_PX,
  gizmoScale,
  GIZMO_HANDLES,
  handleDirection,
  handleEdit,
  HANDLE_AXIS,
  HANDLE_COLOR,
  screenAxis,
  type DragMode,
  type GizmoHandle,
} from './nodeGizmoMath';
import { nodeAnchor } from './nodeMarkers';
import { nearestOnPath, type ProjectedPolyline } from './pathPicking';
import { projectScenePoint, type ScreenPoint } from './screenDash';
import type { MapLayer, ViewSnapshot } from './stages';
import {
  conicGeometry,
  createPolyline,
  sampleSegmentInto,
  type SegmentPolyline,
} from './trajectoryGeometry';

const Y = new Vector3(0, 1, 0);
const RENDER_ORDER = 20;
/** Handles sit at the end of their arm; the hit sphere is larger than the cone. */
const CONE_AT = 0.88;
const HIT_RADIUS = 0.22;

interface HandleObjects {
  cone: Mesh<ConeGeometry, MeshBasicMaterial>;
  hit: Mesh<SphereGeometry, MeshBasicMaterial>;
  base: Color;
  dir: Vec3;
  /** False when the arm points nearly at the camera: hidden, and not hittable. */
  shown: boolean;
}

/** A handle whose arm is shorter than this share of its length on screen is hidden. */
const MIN_ARM_SHARE = 0.35;
/** A press this close to the node's centre drags the node, not a handle, px. */
export const NODE_CENTRE_PX = 10;

/** What the gizmo is on this frame. */
interface Target {
  shipId: ShipId;
  nodeId: string;
  dv: LocalDv;
  /** Scene position (relative to the origin) and the world-units arm length. */
  scene: Vec3;
  scale: number;
  basis: OrbitalBasis;
}

type Drag =
  | {
      kind: 'handle';
      handle: GizmoHandle;
      shipId: ShipId;
      nodeId: string;
      axis: { x: number; y: number };
      x: number;
      y: number;
      start: LocalDv;
      current: LocalDv;
      mode: DragMode;
    }
  | {
      kind: 'time';
      shipId: ShipId;
      nodeId: string;
      frameBodyId: string;
      lines: { segmentIndex: number; poly: SegmentPolyline }[];
    };

export class NodeGizmo implements MapLayer {
  private readonly group = new Group();
  private readonly arms: LineSegments<BufferGeometry, LineBasicMaterial>;
  private readonly armPositions = new Float32Array(6 * 6);
  private readonly handles = new Map<GizmoHandle, HandleObjects>();
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private world: World | null = null;
  private target: Target | null = null;
  private hovered: GizmoHandle | null = null;
  private drag: Drag | null = null;
  private pending: { shipId: ShipId; nodeId: string; edit: NodeEdit } | null = null;

  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;

  constructor(scene: Scene, camera: PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    const armGeom = new BufferGeometry();
    armGeom.setAttribute('position', new BufferAttribute(this.armPositions, 3));
    this.arms = new LineSegments(
      armGeom,
      new LineBasicMaterial({
        color: '#c8cfdc',
        depthTest: false,
        transparent: true,
        opacity: 0.8,
      }),
    );
    this.arms.renderOrder = RENDER_ORDER;
    this.arms.frustumCulled = false;
    this.group.add(this.arms);
    for (const h of GIZMO_HANDLES) {
      const base = new Color(HANDLE_COLOR[HANDLE_AXIS[h].component]);
      const cone = new Mesh(
        new ConeGeometry(0.07, 0.24, 12),
        new MeshBasicMaterial({ color: base.clone(), depthTest: false, transparent: true }),
      );
      cone.renderOrder = RENDER_ORDER + 1;
      cone.frustumCulled = false;
      // Hit targets: drawn with no colour or depth, so the raycaster always sees them.
      const hit = new Mesh(
        new SphereGeometry(HIT_RADIUS, 8, 6),
        new MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
          colorWrite: false,
        }),
      );
      hit.frustumCulled = false;
      hit.userData['handle'] = h;
      this.group.add(cone, hit);
      this.handles.set(h, { cone, hit, base, dir: vec3(0, 0, 0), shown: true });
    }
    this.group.visible = false;
    this.group.name = 'node-gizmo';
    scene.add(this.group);
  }

  sync(world: World): void {
    this.world = world;
  }

  update(frame: MapFrame, view: ViewSnapshot): void {
    this.target = this.findTarget(frame, view);
    const t = this.target;
    this.group.visible = t !== null;
    if (!t) return;
    const centre: ScreenPoint = { x: 0, y: 0, depth: 0 };
    const tip: ScreenPoint = { x: 0, y: 0, depth: 0 };
    projectScenePoint(frame.camera, t.scene.x, t.scene.y, t.scene.z, centre);
    this.group.position.set(t.scene.x, t.scene.y, t.scene.z);
    this.group.scale.setScalar(t.scale);
    let k = 0;
    for (const h of GIZMO_HANDLES) {
      const o = this.handles.get(h)!;
      handleDirection(t.basis, h, o.dir);
      const d = new Vector3(o.dir.x, o.dir.y, o.dir.z);
      o.cone.position.copy(d).multiplyScalar(CONE_AT);
      o.cone.quaternion.setFromUnitVectors(Y, d);
      o.hit.position.copy(d).multiplyScalar(CONE_AT);
      const k2 = t.scale * CONE_AT;
      projectScenePoint(
        frame.camera,
        t.scene.x + d.x * k2,
        t.scene.y + d.y * k2,
        t.scene.z + d.z * k2,
        tip,
      );
      const armPx = Math.hypot(tip.x - centre.x, tip.y - centre.y);
      o.shown = tip.depth > 0 && armPx >= MIN_ARM_SHARE * GIZMO_ARM_PX * CONE_AT;
      o.cone.visible = o.shown;
      const active = this.hovered === h || (this.drag?.kind === 'handle' && this.drag.handle === h);
      o.cone.material.color.copy(o.base);
      if (active) o.cone.material.color.lerp(new Color('#ffffff'), 0.45);
      o.cone.scale.setScalar(active ? 1.35 : 1);
      const arm = o.shown ? CONE_AT : 0;
      this.armPositions.set([0, 0, 0, d.x * arm, d.y * arm, d.z * arm], 6 * k++);
    }
    const pos = this.arms.geometry.attributes['position'];
    if (pos) pos.needsUpdate = true;
    this.group.updateMatrixWorld(true);
  }

  /**
   * The selected node of the active ship, if it is reached and in front of the camera. None in a
   * preview: map editing is off there (S5-11).
   */
  private findTarget(frame: MapFrame, view: ViewSnapshot): Target | null {
    const world = this.world;
    const sel = view.selected;
    if (!world || view.previewing) return null;
    if (sel?.kind !== 'node' || sel.shipId !== view.activeShipId) return null;
    const ship = world.ships[sel.shipId];
    const traj = world.derived.trajectories[sel.shipId];
    const node = ship?.plan.find((n) => n.id === sel.id);
    if (!ship || !traj || !node || node.t < frame.t) return null;
    const fb = frame.indexOf[view.frameBodyId];
    if (fb === undefined) return null;
    const a = nodeAnchor(world.system, ship, traj, node.id, view.frameBodyId);
    if (!a) return null;
    const base = frameWorldInto(frame, fb, vec3(0, 0, 0));
    const scene = vec3(
      base.x + a.pos.x - frame.origin.x,
      base.y + a.pos.y - frame.origin.y,
      base.z + a.pos.z - frame.origin.z,
    );
    const sp: ScreenPoint = { x: 0, y: 0, depth: 0 };
    projectScenePoint(frame.camera, scene.x, scene.y, scene.z, sp);
    if (!(sp.depth > 0)) return null;
    return {
      shipId: ship.id,
      nodeId: node.id,
      dv: { ...node.dv },
      scene,
      scale: gizmoScale(sp.depth, frame.camera),
      basis: localOrbitalBasis(a.pre, fallbackPole(world.system, a.parentId)),
    };
  }

  /** The handle under (x, y) CSS px, or null; never within NODE_CENTRE_PX of the node. */
  hitHandle(x: number, y: number, frame: MapFrame): GizmoHandle | null {
    const t = this.target;
    if (!t || !this.group.visible) return null;
    const c: ScreenPoint = { x: 0, y: 0, depth: 0 };
    projectScenePoint(frame.camera, t.scene.x, t.scene.y, t.scene.z, c);
    if (Math.hypot(x - c.x, y - c.y) < NODE_CENTRE_PX) return null;
    this.ndc.set((x / frame.camera.width) * 2 - 1, -((y / frame.camera.height) * 2 - 1));
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(
      [...this.handles.values()].filter((o) => o.shown).map((o) => o.hit),
      false,
    );
    return (hits[0]?.object.userData['handle'] as GizmoHandle | undefined) ?? null;
  }

  setHovered(h: GizmoHandle | null): void {
    this.hovered = h;
  }

  /** A tooltip for a handle: its component and value. */
  tooltip(h: GizmoHandle): string {
    const t = this.target;
    if (!t) return '';
    const { component } = HANDLE_AXIS[h];
    const name =
      component === 'radial' ? 'Radial (out)' : component[0]!.toUpperCase() + component.slice(1);
    return `${name} ${(t.dv[component] * 1000).toFixed(1)} m/s`;
  }

  get dragging(): boolean {
    return this.drag !== null;
  }

  /** Starts dragging a handle at (x, y); false if its axis points at the camera. */
  beginHandleDrag(
    h: GizmoHandle,
    x: number,
    y: number,
    frame: MapFrame,
    e: { shiftKey: boolean; altKey: boolean },
  ): boolean {
    const t = this.target;
    if (!t) return false;
    const dir = handleDirection(t.basis, h, vec3(0, 0, 0));
    const axis = screenAxis(frame.camera, t.scene, dir);
    if (!axis) return false;
    this.drag = {
      kind: 'handle',
      handle: h,
      shipId: t.shipId,
      nodeId: t.nodeId,
      axis,
      x,
      y,
      start: { ...t.dv },
      current: { ...t.dv },
      mode: dragModeOf(e),
    };
    return true;
  }

  /** Starts dragging a node along its path: the path without the node, sampled now. */
  beginTimeDrag(shipId: ShipId, nodeId: string, frameBodyId: string, now: number): boolean {
    const world = this.world;
    const ship = world?.ships[shipId];
    if (!world || !ship) return false;
    const lines = pathWithout(world, ship, nodeId)
      .map((seg, segmentIndex) => ({ seg, segmentIndex }))
      .filter(({ seg }) => seg.tEnd > now)
      .map(({ seg, segmentIndex }) => {
        const poly = createPolyline();
        sampleSegmentInto(
          world.system,
          seg,
          frameBodyId,
          Math.max(now, seg.tStart),
          poly,
          conicGeometry(world.system, seg),
        );
        return { segmentIndex, poly };
      });
    this.drag = { kind: 'time', shipId, nodeId, frameBodyId, lines };
    return true;
  }

  /** Moves the drag to (x, y); the edit is applied at the next flush. */
  dragTo(x: number, y: number, frame: MapFrame, e: { shiftKey: boolean; altKey: boolean }): void {
    const d = this.drag;
    if (!d) return;
    if (d.kind === 'handle') {
      const mode = dragModeOf(e);
      if (mode !== d.mode) {
        // Re-anchor, so the value doesn't jump when a modifier changes (S4-14).
        d.start = { ...d.current };
        d.x = x;
        d.y = y;
        d.mode = mode;
      }
      const px = (x - d.x) * d.axis.x + (y - d.y) * d.axis.y;
      d.current = handleEdit(d.handle, d.start, dragDelta(px, mode));
      this.pending = { shipId: d.shipId, nodeId: d.nodeId, edit: { dv: { ...d.current } } };
      return;
    }
    const fb = frame.indexOf[d.frameBodyId];
    if (fb === undefined) return;
    const base = frameWorldInto(frame, fb, vec3(0, 0, 0));
    const sp: ScreenPoint = { x: 0, y: 0, depth: 0 };
    const projected: ProjectedPolyline[] = d.lines.map(({ segmentIndex, poly }) => {
      const screen = new Float32Array(2 * poly.count);
      for (let k = 0; k < poly.count; k++) {
        projectScenePoint(
          frame.camera,
          base.x + poly.points[3 * k]! - frame.origin.x,
          base.y + poly.points[3 * k + 1]! - frame.origin.y,
          base.z + poly.points[3 * k + 2]! - frame.origin.z,
          sp,
        );
        screen[2 * k] = sp.x;
        screen[2 * k + 1] = sp.y;
      }
      return { shipId: d.shipId, segmentIndex, screen, times: poly.times, count: poly.count };
    });
    const hit = nearestOnPath(projected, x, y, Infinity);
    if (!hit) return;
    const t = Math.max(hit.t, frame.t + MIN_NODE_LEAD * 1.5);
    this.pending = { shipId: d.shipId, nodeId: d.nodeId, edit: { t } };
  }

  endDrag(): void {
    this.flush();
    this.drag = null;
  }

  /** Applies the queued edit, once per animation frame (S4-8). */
  flush(): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    useWorld.getState().editNode(p.shipId, p.nodeId, p.edit);
  }

  /** The gizmo on screen, for the debug handle (S4-20). */
  debug(frame: MapFrame) {
    const t = this.target;
    if (!t || !this.group.visible) return null;
    const sp: ScreenPoint = { x: 0, y: 0, depth: 0 };
    return {
      shipId: t.shipId,
      nodeId: t.nodeId,
      handles: GIZMO_HANDLES.map((h) => {
        const { dir, shown } = this.handles.get(h)!;
        const k = t.scale * CONE_AT;
        projectScenePoint(
          frame.camera,
          t.scene.x + dir.x * k,
          t.scene.y + dir.y * k,
          t.scene.z + dir.z * k,
          sp,
        );
        return { handle: h, shown, x: sp.x, y: sp.y, axis: screenAxis(frame.camera, t.scene, dir) };
      }),
    };
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.arms.geometry.dispose();
    this.arms.material.dispose();
    for (const o of this.handles.values()) {
      o.cone.geometry.dispose();
      o.cone.material.dispose();
      o.hit.geometry.dispose();
      o.hit.material.dispose();
    }
  }
}
