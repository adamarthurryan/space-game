/**
 * The labels stage (decision S2-15 in planning/sprint-2.md): candidates from the projection,
 * greedy placement, and writing the DOM spans. The spans are positioned through the registry
 * every frame, without React re-rendering.
 */

import { getBody, type BodySystem } from '../../sim/body';
import type { ShipId } from '../../sim/ship';
import type { World } from '../../sim/world';
import { sameRef, type FocusRef, type MapObjectRef } from '../../store/useView';
import { bodyStyle } from '../bodyStyle';
import type { MapFrame, PlacedLabel, Rect } from '../mapFrame';
import { occludedAt } from '../occlusion';
import { SHIP_MARKER_PX } from '../shipStyle';
import type { ViewSnapshot } from '../stages';
import {
  declutter,
  FORCED,
  labelPriority,
  labelRect,
  shipLabelPriority,
  type LabelCandidate,
} from './declutter';
import styles from './LabelOverlay.module.css';

/** Gap between a marker or disc and its label, px. */
export const LABEL_GAP_PX = 4;

/** The label spans by frame index, and their measured sizes. */
export interface LabelRegistry {
  spans: (HTMLElement | null)[];
  widths: Float32Array;
  heights: Float32Array;
  /** 1 if placed this frame. */
  placed: Uint8Array;
  candidates: LabelCandidate[];
  /** Ship label spans by ship ID, registered by the overlay. */
  shipSpans: Map<ShipId, HTMLElement>;
  /** Measured ship label sizes, by ID: [width, height]. */
  shipSizes: Map<ShipId, [number, number]>;
  /** Ship candidates, in frame.ships order; rebuilt when that array changes. */
  shipCandidates: LabelCandidate[];
  shipCandidatesFor: readonly ShipId[] | null;
  /** The overlay's container, for the "+N" spans of merged labels (S5b-16). */
  container: HTMLElement | null;
  /** Pooled "+N" spans, and the measured width of each text. */
  moreSpans: HTMLElement[];
  moreWidths: Map<string, number>;
}

export function createLabelRegistry(frame: MapFrame): LabelRegistry {
  const n = frame.order.length;
  return {
    spans: new Array<HTMLElement | null>(n).fill(null),
    widths: new Float32Array(n),
    heights: new Float32Array(n),
    placed: new Uint8Array(n),
    candidates: frame.order.map((id) => ({
      ref: { kind: 'body', id },
      anchorX: 0,
      anchorY: 0,
      width: 0,
      height: 0,
      priority: 0,
      hidden: true,
    })),
    shipSpans: new Map(),
    shipSizes: new Map(),
    shipCandidates: [],
    shipCandidatesFor: null,
    container: null,
    moreSpans: [],
    moreWidths: new Map(),
  };
}

/** Sets the overlay's container (null on unmount, which drops the pooled spans). */
export function attachLabelContainer(reg: LabelRegistry, el: HTMLElement | null): void {
  reg.container = el;
  if (!el) reg.moreSpans = [];
}

/** Space between the names of a merged label, where its separator is drawn, px (S5b-16). */
export const MERGE_GAP_PX = 10;
/** A merged label lists this many ship names, then "+N" for the rest (S5b-16). */
export const MERGED_NAMES = 2;

/** Whether body i's centre is behind a nearer body's drawn disc. */
function occluded(frame: MapFrame, i: number): boolean {
  return occludedAt(frame, frame.screenX[i]!, frame.screenY[i]!, frame.depth[i]!, i);
}

/** Fills `reg.candidates` from the frame's projection and the measured label sizes. */
export function updateLabelCandidates(
  reg: LabelRegistry,
  frame: MapFrame,
  system: BodySystem,
  view: { focus: MapObjectRef; selected: MapObjectRef | null; hovered: MapObjectRef | null },
): void {
  for (let i = 0; i < frame.order.length; i++) {
    const c = reg.candidates[i]!;
    const body = getBody(system, frame.order[i]!);
    const drawn = frame.markerShown[i] || frame.sphereShown[i];
    c.hidden =
      !(frame.depth[i]! < Infinity) || !drawn || frame.merged[i] === 1 || occluded(frame, i);
    if (c.hidden) continue;
    const reach = Math.max(
      frame.discPx[i]!,
      frame.markerShown[i] ? bodyStyle(body).markerPx / 2 : 0,
    );
    c.anchorX = frame.screenX[i]! + reach + LABEL_GAP_PX;
    c.anchorY = frame.screenY[i]!;
    c.width = reg.widths[i]!;
    c.height = reg.heights[i]!;
    c.priority = labelPriority(body, c.ref, view);
  }
}

/** Fills `reg.shipCandidates` from the frame's ship projection (S3-20). */
export function updateShipLabelCandidates(
  reg: LabelRegistry,
  frame: MapFrame,
  world: World,
  view: { focus: MapObjectRef; selected: MapObjectRef | null; hovered: MapObjectRef | null },
): void {
  const fs = frame.ships;
  if (reg.shipCandidatesFor !== fs.ids) {
    reg.shipCandidates = fs.ids.map((id) => ({
      ref: { kind: 'ship', id },
      anchorX: 0,
      anchorY: 0,
      width: 0,
      height: 0,
      priority: 0,
      hidden: true,
    }));
    reg.shipCandidatesFor = fs.ids;
  }
  for (let k = 0; k < fs.ids.length; k++) {
    const c = reg.shipCandidates[k]!;
    const size = reg.shipSizes.get(fs.ids[k]!);
    const ship = world.ships[fs.ids[k]!];
    c.hidden =
      !ship ||
      !size ||
      !fs.markerShown[k] ||
      occludedAt(frame, fs.screenX[k]!, fs.screenY[k]!, fs.depth[k]!);
    if (c.hidden || !size || !ship) continue;
    c.anchorX = fs.screenX[k]! + SHIP_MARKER_PX / 2 + LABEL_GAP_PX;
    c.anchorY = fs.screenY[k]!;
    c.width = size[0];
    c.height = size[1];
    c.priority = shipLabelPriority(ship.seq, c.ref, view);
  }
}

/** Measures labels not measured yet (a layout read, once per label in practice). */
export function measureLabels(reg: LabelRegistry): void {
  for (let i = 0; i < reg.spans.length; i++) {
    const span = reg.spans[i];
    if (!span || reg.widths[i]! > 0) continue;
    reg.widths[i] = span.offsetWidth;
    reg.heights[i] = span.offsetHeight;
  }
  for (const [id, span] of reg.shipSpans) {
    if (!reg.shipSizes.has(id) && span.offsetWidth > 0) {
      reg.shipSizes.set(id, [span.offsetWidth, span.offsetHeight]);
    }
  }
}

/** The view that orders and forces labels: selection, focus, the active ship and the flash. */
type MergeView = Pick<ViewSnapshot, 'focus' | 'selected' | 'activeShipId' | 'flash'>;

/** A ship label folded into its parent's (S5b-16). */
export interface MergeGroup {
  /** The parent's frame index. */
  body: number;
  /** Ship indices of frame.ships, in label order: selected, active, focused, then by seq. */
  ships: number[];
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * The merged labels (S5b-16 in planning/sprint-5b.md): a ship whose label would overlap its
 * parent's label joins it, and so does a flashing ship (S5b-11), even when it is merged into
 * its parent on screen. Only parents whose own label is shown take ships in.
 */
export function mergeGroups(
  reg: LabelRegistry,
  frame: MapFrame,
  seqOf: (id: ShipId) => number,
  view: MergeView,
): MergeGroup[] {
  const fs = frame.ships;
  const byBody = new Map<number, number[]>();
  for (let k = 0; k < fs.ids.length; k++) {
    const sc = reg.shipCandidates[k];
    const p = fs.parentIndex[k]!;
    const bc = reg.candidates[p];
    if (!sc || !bc || bc.hidden || !reg.shipSizes.has(fs.ids[k]!)) continue;
    const flashing = sameRef(view.flash?.ref ?? null, { kind: 'ship', id: fs.ids[k]! });
    const joins = sc.hidden
      ? flashing && fs.depth[k]! < Infinity
      : flashing || overlaps(labelRect(sc), labelRect(bc));
    if (!joins) continue;
    const list = byBody.get(p) ?? [];
    list.push(k);
    byBody.set(p, list);
  }
  const rank = (k: number) => {
    const ref: MapObjectRef = { kind: 'ship', id: fs.ids[k]! };
    const selected = view.selected?.kind === 'node' ? view.selected.shipId : null;
    if (sameRef(view.selected, ref) || selected === fs.ids[k]) return 0;
    if (view.activeShipId === fs.ids[k]) return 1;
    if (sameRef(view.focus, ref)) return 2;
    return 3;
  };
  return [...byBody].map(([body, ships]) => ({
    body,
    ships: ships.sort((a, b) => rank(a) - rank(b) || seqOf(fs.ids[a]!) - seqOf(fs.ids[b]!)),
  }));
}

/** A merged label's "+N" span, from the pool; its width is measured once per text. */
function moreSpan(reg: LabelRegistry, i: number, text: string): [HTMLElement | null, number] {
  let span = reg.moreSpans[i] ?? null;
  if (!span && reg.container) {
    span = document.createElement('span');
    span.className = `${styles['label'] ?? ''} ${styles['more'] ?? ''}`;
    reg.container.append(span);
    reg.moreSpans.push(span);
  }
  if (!span) return [null, 7 * text.length];
  if (span.textContent !== text) span.textContent = text;
  let w = reg.moreWidths.get(text);
  if (w === undefined || w === 0) {
    w = span.offsetWidth;
    if (w > 0) reg.moreWidths.set(text, w);
  }
  return [span, w || 7 * text.length];
}

const placedShips = new Set<ShipId>();
const mergedPart = new Map<ShipId, 'first' | 'next'>();

/**
 * Places the labels, records them on the frame for picking, and positions the spans. A ship
 * label that would overlap its parent's merges into it (S5b-16): "Earth · Kestrel, Tern +2",
 * one span per name, each its own pick target. A flashing ship's label is always placed
 * (S5b-11).
 */
export function placeLabels(
  reg: LabelRegistry,
  frame: MapFrame,
  world: World,
  view: MergeView,
): void {
  const fs = frame.ships;
  const groups = mergeGroups(reg, frame, (id) => world.ships[id]?.seq ?? 0, view);
  const flashK = view.flash?.ref.kind === 'ship' ? (fs.indexOf[view.flash.ref.id] ?? -1) : -1;

  // The candidates: merged bodies widened, their ships taken out.
  const cands = reg.candidates.slice();
  const ships = reg.shipCandidates.slice();
  const layouts = new Map<number, { shown: number[]; more: string; moreW: number }>();
  let moreUsed = 0;
  for (const g of groups) {
    const bc = reg.candidates[g.body]!;
    const shown = g.ships.slice(0, MERGED_NAMES);
    const more = g.ships.length > shown.length ? `+${g.ships.length - shown.length}` : '';
    const moreW = more ? moreSpan(reg, moreUsed++, more)[1] : 0;
    let width = bc.width;
    let priority = bc.priority;
    for (const k of g.ships) {
      const sc = reg.shipCandidates[k]!;
      ships[k] = { ...sc, hidden: true };
      if (!sc.hidden) priority = Math.max(priority, sc.priority);
      if (k === flashK) priority = Math.max(priority, FORCED);
    }
    for (const k of shown) width += MERGE_GAP_PX + reg.shipSizes.get(fs.ids[k]!)![0];
    if (more) width += MERGE_GAP_PX + moreW;
    cands[g.body] = { ...bc, width, priority };
    layouts.set(g.body, { shown, more, moreW });
  }
  // A flashing ship with its own label is always placed (S5b-11).
  if (flashK >= 0 && ships[flashK] && !ships[flashK].hidden) {
    ships[flashK] = { ...ships[flashK], priority: Math.max(ships[flashK].priority, FORCED) };
  }

  const placed = declutter(cands.concat(ships), {
    x: 0,
    y: 0,
    w: frame.camera.width,
    h: frame.camera.height,
  });

  // Split merged labels into their parts, one pick target each.
  const labels: PlacedLabel[] = [];
  const moreAt: { rect: Rect; text: string }[] = [];
  mergedPart.clear();
  for (const l of placed) {
    const i = l.ref.kind === 'body' ? frame.indexOf[l.ref.id] : undefined;
    const layout = i === undefined ? undefined : layouts.get(i);
    if (!layout || i === undefined) {
      labels.push(l);
      continue;
    }
    const bw = reg.candidates[i]!.width;
    const parts: FocusRef[] = [l.ref];
    const partRects: PlacedLabel[] = [];
    let x = l.rect.x + bw;
    layout.shown.forEach((k, n) => {
      const id = fs.ids[k]!;
      const w = reg.shipSizes.get(id)![0];
      x += MERGE_GAP_PX;
      const ref: FocusRef = { kind: 'ship', id };
      parts.push(ref);
      partRects.push({ ref, rect: { x, y: l.rect.y, w, h: l.rect.h } });
      mergedPart.set(id, n === 0 ? 'first' : 'next');
      x += w;
    });
    labels.push({ ref: l.ref, rect: { ...l.rect, w: bw }, parts }, ...partRects);
    if (layout.more) {
      x += MERGE_GAP_PX;
      moreAt.push({ rect: { x, y: l.rect.y, w: layout.moreW, h: l.rect.h }, text: layout.more });
    }
  }
  frame.labels = labels;

  reg.placed.fill(0);
  placedShips.clear();
  for (const l of labels) {
    let span: HTMLElement | null | undefined;
    if (l.ref.kind === 'ship') {
      placedShips.add(l.ref.id);
      span = reg.shipSpans.get(l.ref.id);
    } else {
      const i = frame.indexOf[l.ref.id];
      if (i === undefined) continue;
      reg.placed[i] = 1;
      span = reg.spans[i];
    }
    if (span) {
      span.style.transform = `translate(${l.rect.x.toFixed(1)}px, ${l.rect.y.toFixed(1)}px)`;
    }
  }
  for (let i = 0; i < reg.spans.length; i++) {
    const span = reg.spans[i];
    if (span) span.style.visibility = reg.placed[i] ? 'visible' : 'hidden';
  }
  const flashId = flashK >= 0 ? fs.ids[flashK] : undefined;
  for (const [id, span] of reg.shipSpans) {
    span.style.visibility = placedShips.has(id) ? 'visible' : 'hidden';
    const part = mergedPart.get(id);
    span.classList.toggle(styles['partFirst'] ?? 'partFirst', part === 'first');
    span.classList.toggle(styles['partNext'] ?? 'partNext', part === 'next');
    span.classList.toggle(styles['flash'] ?? 'flash', id === flashId);
  }
  moreAt.forEach((m, n) => {
    const [span] = moreSpan(reg, n, m.text);
    if (!span) return;
    span.style.transform = `translate(${m.rect.x.toFixed(1)}px, ${m.rect.y.toFixed(1)}px)`;
    span.style.visibility = 'visible';
  });
  for (let n = moreAt.length; n < reg.moreSpans.length; n++) {
    reg.moreSpans[n]!.style.visibility = 'hidden';
  }
}
