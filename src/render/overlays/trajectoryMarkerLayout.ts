/**
 * Placing the trajectory markers (decision S3-19 in planning/sprint-3.md): a pooled set of DOM
 * spans, positioned every frame. Glyphs are always shown; texts are placed after the body and
 * ship labels, and hidden where they would overlap a label or an earlier marker text. Markers
 * aren't clickable this sprint, so they aren't added to the picking labels.
 */

import { sameRef, type MapObjectRef } from '../../store/useView';
import type { World } from '../../sim/world';
import { frameWorldInto, type MapFrame, type Rect } from '../mapFrame';
import type { ViewSnapshot } from '../stages';
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

/** A marker placed this frame, for the debug handle. */
export interface PlacedMarker {
  shipId: string;
  kind: TrajectoryMarker['kind'];
  text: string;
  x: number;
  y: number;
  textShown: boolean;
}

export interface TrajectoryMarkerRegistry {
  /** The overlay's container; set by the overlay component. */
  container: HTMLElement | null;
  pool: MarkerSpan[];
  /** Distance formatter for Pe/Ap texts (render/ may not import ui/). */
  fmt: (km: number) => string;
  placed: PlacedMarker[];
  /** Called by the overlay with its container (null on unmount). */
  attach(el: HTMLElement | null): void;
}

export function createTrajectoryMarkerRegistry(
  fmt: (km: number) => string = (km) => `${Math.round(km)} km`,
): TrajectoryMarkerRegistry {
  const reg: TrajectoryMarkerRegistry = {
    container: null,
    pool: [],
    fmt,
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
  glyph.className = styles['glyph'] ?? '';
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
function glyphFor(kind: TrajectoryMarker['kind']): string {
  return kind === 'impact' ? '✕' : kind === 'periapsis' || kind === 'apoapsis' ? '•' : '▲';
}

/** Computes, projects and places every drawn trajectory's markers (S3-19). */
export function placeTrajectoryMarkers(
  reg: TrajectoryMarkerRegistry,
  frame: MapFrame,
  world: World,
  view: ViewSnapshot,
): void {
  const fb = frame.indexOf[view.frameBodyId];
  const markers: TrajectoryMarker[] = [];
  if (fb !== undefined) {
    for (const id of frame.ships.ids) {
      const traj = world.derived.trajectories[id];
      if (!traj) continue;
      const ref: MapObjectRef = { kind: 'ship', id };
      const apsides =
        sameRef(view.focus, ref) || sameRef(view.selected, ref) || sameRef(view.hovered, ref);
      markers.push(
        ...trajectoryMarkers(world.system, id, traj, frame.t, view.frameBodyId, apsides, reg.fmt),
      );
    }
  }
  const base = frameWorldInto(frame, fb ?? 0, { x: 0, y: 0, z: 0 });
  const { camera: cam, origin } = frame;
  const tanHalf = Math.tan(cam.fovRad / 2);
  const aspect = cam.width / cam.height;
  const taken: Rect[] = frame.labels.map((l) => l.rect);
  reg.placed = [];

  let used = 0;
  for (const m of markers) {
    const rx = base.x + m.pos.x - origin.x - cam.position.x;
    const ry = base.y + m.pos.y - origin.y - cam.position.y;
    const rz = base.z + m.pos.z - origin.z - cam.position.z;
    const z = rx * cam.forward.x + ry * cam.forward.y + rz * cam.forward.z;
    if (z <= 1e-3) continue;
    const x =
      ((1 + (rx * cam.right.x + ry * cam.right.y + rz * cam.right.z) / (z * tanHalf * aspect)) /
        2) *
      cam.width;
    const y =
      ((1 - (rx * cam.up.x + ry * cam.up.y + rz * cam.up.z) / (z * tanHalf)) / 2) * cam.height;
    if (x < -50 || y < -50 || x > cam.width + 50 || y > cam.height + 50) continue;
    const span = spanAt(reg, used);
    if (!span) break;
    used++;
    const key = `${m.kind}|${m.text}`;
    if (span.textKey !== key) {
      (span.root.firstChild as HTMLElement).textContent = glyphFor(m.kind);
      span.text.textContent = m.text.replace(/^[▲✕] /, '');
      span.textKey = key;
      span.width = span.text.offsetWidth;
      span.height = span.text.offsetHeight;
    }
    const rect = { x: x + LABEL_GAP_PX + 4, y: y - span.height / 2, w: span.width, h: span.height };
    const textShown = !taken.some((r) => overlaps(r, rect));
    if (textShown) taken.push(rect);
    span.root.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    span.root.style.visibility = 'visible';
    span.text.style.visibility = textShown ? 'inherit' : 'hidden';
    reg.placed.push({ shipId: m.shipId, kind: m.kind, text: m.text, x, y, textShown });
  }
  for (let i = used; i < reg.pool.length; i++) reg.pool[i]!.root.style.visibility = 'hidden';
}
