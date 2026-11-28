/**
 * Placing the trajectory markers (decision S3-19 in planning/sprint-3.md): a pooled set of DOM
 * spans, positioned every frame. Glyphs are always shown; texts are placed after the body and
 * ship labels, and hidden where they would overlap a label or an earlier marker text. Markers
 * aren't clickable this sprint, so they aren't added to the picking labels. A marker behind a
 * nearer body's disc is dimmed, with no text (S5b-14 in planning/sprint-5b.md).
 */

import { sameRef, type MapObjectRef } from '../../store/useView';
import type { World } from '../../sim/world';
import { frameWorldInto, type MapFrame, type Rect } from '../mapFrame';
import type { ViewSnapshot } from '../stages';
import { bodyStateIn, getBody } from '../../sim/body';
import { segmentStateAt } from '../../sim/trajectory';
import { nodeMarkers } from '../nodeMarkers';
import { sceneOccluded } from '../occlusion';
import type { ScreenPoint } from '../screenDash';
import { shipColor } from '../shipStyle';
import { trajectoryMarkers, type TrajectoryMarker } from '../trajectoryMarkers';
import { LABEL_GAP_PX } from './labelLayout';
import styles from './TrajectoryMarkerOverlay.module.css';

/** A pooled marker: its root span (positioned), the glyph and the text. */
interface MarkerSpan {
  root: HTMLElement;
  text: HTMLElement;
  /** Measured once per text. */
  textKey: string;
  width: number;
  height: number;
}

/** What a placed glyph is: a trajectory marker, a node, or the ghost node (S4-9, S4-12). */
export type MarkerKind = TrajectoryMarker['kind'] | 'node' | 'ghost';

/** A marker placed this frame, for the debug handle. */
export interface PlacedMarker {
  shipId: string;
  kind: MarkerKind;
  nodeId?: string;
  text: string;
  x: number;
  y: number;
  textShown: boolean;
  /** Behind a nearer body's disc: drawn at 30%, with no text (S5b-14). */
  dimmed: boolean;
}

export interface TrajectoryMarkerRegistry {
  /** The overlay's container; set by the overlay component. */
  container: HTMLElement | null;
  pool: MarkerSpan[];
  /** Distance formatter for Pe/Ap texts (render/ may not import ui/). */
  fmt: (km: number) => string;
  /** Countdown formatter for the ghost node's text. */
  fmtDuration: (s: number) => string;
  placed: PlacedMarker[];
  /** Called by the overlay with its container (null on unmount). */
  attach(el: HTMLElement | null): void;
}

export function createTrajectoryMarkerRegistry(
  fmt: (km: number) => string = (km) => `${Math.round(km)} km`,
  fmtDuration: (s: number) => string = (s) => `${Math.round(s)} s`,
): TrajectoryMarkerRegistry {
  const reg: TrajectoryMarkerRegistry = {
    container: null,
    pool: [],
    fmt,
    fmtDuration,
    placed: [],
    attach(el) {
      reg.container = el;
      if (!el) reg.pool = [];
    },
  };
  return reg;
}

function spanAt(reg: TrajectoryMarkerRegistry, i: number): MarkerSpan | null {
  const existing = reg.pool[i];
  if (existing) return existing;
  if (!reg.container) return null;
  const root = document.createElement('span');
  root.className = styles['marker'] ?? '';
  const glyph = document.createElement('span');
  const text = document.createElement('span');
  text.className = styles['text'] ?? '';
  root.append(glyph, text);
  reg.container.append(root);
  const m: MarkerSpan = { root, text, textKey: '', width: 0, height: 0 };
  reg.pool.push(m);
  return m;
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The glyph's character for a marker kind. Pe and Ap use a small dot. */
function glyphFor(kind: MarkerKind): string {
  switch (kind) {
    case 'impact':
      return '✕';
    case 'periapsis':
    case 'apoapsis':
      return '•';
    case 'node':
      return '◆';
    case 'ghost':
      return '◇';
    default:
      return '▲';
  }
}

/** A glyph to place: at a frame-body-relative point, or at a screen point (the ghost). */
interface Item {
  kind: MarkerKind;
  shipId: string;
  nodeId?: string;
  pos?: { x: number; y: number; z: number };
  /** The ghost: its screen point, and its point relative to the frame body for occlusion. */
  screen?: { x: number; y: number; pos: { x: number; y: number; z: number } };
  text: string;
  /** CSS classes of the glyph, and its colour. */
  glyphClass: string;
  color?: string;
}

const cls = (...names: (string | false)[]) =>
  names
    .filter((n): n is string => !!n)
    .map((n) => styles[n] ?? '')
    .join(' ');

/**
 * Computes, projects and places every drawn trajectory's markers (S3-19), its nodes (S4-9) and
 * the ghost node (S4-12). Node glyphs are recorded in `frame.nodes` for picking.
 */
export function placeTrajectoryMarkers(
  reg: TrajectoryMarkerRegistry,
  frame: MapFrame,
  world: World,
  view: ViewSnapshot,
): void {
  const fb = frame.indexOf[view.frameBodyId];
  const items: Item[] = [];
  if (fb !== undefined) {
    for (const id of frame.ships.ids) {
      const traj = world.derived.trajectories[id];
      const ship = world.ships[id];
      if (!traj || !ship) continue;
      const ref: MapObjectRef = { kind: 'ship', id };
      const active = view.activeShipId === id;
      const apsides =
        active ||
        sameRef(view.focus, ref) ||
        sameRef(view.selected, ref) ||
        sameRef(view.hovered, ref);
      for (const m of trajectoryMarkers(
        world.system,
        id,
        traj,
        frame.t,
        view.frameBodyId,
        apsides,
        reg.fmt,
      )) {
        items.push({ ...m, glyphClass: cls('glyph') });
      }
      const color = shipColor(ship.seq);
      for (const n of nodeMarkers(world.system, ship, traj, frame.t, view.frameBodyId, active)) {
        const selected = view.selected?.kind === 'node' && view.selected.id === n.nodeId;
        items.push({
          kind: 'node',
          shipId: id,
          nodeId: n.nodeId,
          pos: n.pos,
          text: '',
          color,
          glyphClass: cls(
            'glyph',
            'node',
            !n.editable && 'nodeOther',
            n.state === 'disabled' && 'nodeDisabled',
            selected && 'nodeSelected',
          ),
        });
      }
    }
  }
  const ghost = frame.ghost;
  if (ghost) {
    const ship = world.ships[ghost.shipId];
    const seg = world.derived.trajectories[ghost.shipId]?.segments[ghost.segmentIndex];
    if (ship && seg) {
      const r = segmentStateAt(world.system, seg, ghost.t).r;
      const alt = Math.hypot(r.x, r.y, r.z) - getBody(world.system, seg.parentId).radius;
      const off =
        seg.parentId === view.frameBodyId
          ? { x: 0, y: 0, z: 0 }
          : bodyStateIn(world.system, seg.parentId, view.frameBodyId, ghost.t).r;
      items.push({
        kind: 'ghost',
        shipId: ghost.shipId,
        screen: { x: ghost.x, y: ghost.y, pos: { x: r.x + off.x, y: r.y + off.y, z: r.z + off.z } },
        text: `T+${reg.fmtDuration(ghost.t - frame.t)} · ${reg.fmt(alt)}`,
        color: shipColor(ship.seq),
        glyphClass: cls('glyph', 'node', 'ghost'),
      });
    }
  }

  const base = frameWorldInto(frame, fb ?? 0, { x: 0, y: 0, z: 0 });
  const { camera: cam, origin } = frame;
  const taken: Rect[] = frame.labels.map((l) => l.rect);
  reg.placed = [];
  frame.nodes = [];
  const sp: ScreenPoint = { x: 0, y: 0, depth: 0 };

  let used = 0;
  for (const m of items) {
    let x: number;
    let y: number;
    const p = m.screen ? m.screen.pos : m.pos!;
    const sx = base.x + p.x - origin.x;
    const sy = base.y + p.y - origin.y;
    const sz = base.z + p.z - origin.z;
    const dimmed = sceneOccluded(frame, sx, sy, sz, sp);
    if (m.screen) {
      ({ x, y } = m.screen);
    } else {
      if (sp.depth <= 1e-3) continue;
      ({ x, y } = sp);
    }
    if (x < -50 || y < -50 || x > cam.width + 50 || y > cam.height + 50) continue;
    const span = spanAt(reg, used);
    if (!span) break;
    used++;
    const glyph = span.root.firstChild as HTMLElement;
    const key = `${m.kind}|${m.text}|${m.glyphClass}|${m.color ?? ''}`;
    if (span.textKey !== key) {
      glyph.textContent = glyphFor(m.kind);
      glyph.className = m.glyphClass;
      glyph.style.color = m.color ?? '';
      span.text.textContent = m.text.replace(/^[▲✕] /, '');
      span.textKey = key;
      span.width = span.text.offsetWidth;
      span.height = span.text.offsetHeight;
    }
    let textShown = false;
    if (m.text && !dimmed) {
      const rect = {
        x: x + LABEL_GAP_PX + 4,
        y: y - span.height / 2,
        w: span.width,
        h: span.height,
      };
      // The ghost's text is always shown: it follows the pointer.
      textShown = m.kind === 'ghost' || !taken.some((r) => overlaps(r, rect));
      if (textShown) taken.push(rect);
    }
    span.root.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    span.root.style.visibility = 'visible';
    span.root.classList.toggle(styles['dimmed'] ?? 'dimmed', dimmed);
    span.text.style.visibility = textShown ? 'inherit' : 'hidden';
    const placed: PlacedMarker = {
      shipId: m.shipId,
      kind: m.kind,
      text: m.text,
      x,
      y,
      textShown,
      dimmed,
    };
    if (m.nodeId !== undefined) {
      placed.nodeId = m.nodeId;
      frame.nodes.push({ shipId: m.shipId, nodeId: m.nodeId, x, y, occluded: dimmed });
    }
    reg.placed.push(placed);
  }
  for (let i = used; i < reg.pool.length; i++) reg.pool[i]!.root.style.visibility = 'hidden';
}
