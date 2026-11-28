/**
 * The labels stage (decision S2-15 in planning/sprint-2.md): candidates from the projection,
 * greedy placement, and writing the DOM spans. The spans are positioned through the registry
 * every frame, without React re-rendering.
 */

import { getBody, type BodySystem } from '../../sim/body';
import type { ShipId } from '../../sim/ship';
import type { World } from '../../sim/world';
import type { MapObjectRef } from '../../store/useView';
import { bodyStyle } from '../bodyStyle';
import type { MapFrame } from '../mapFrame';
import { occludedAt } from '../occlusion';
import { SHIP_MARKER_PX } from '../shipStyle';
import { declutter, labelPriority, shipLabelPriority, type LabelCandidate } from './declutter';

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
  };
}

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

const placedShips = new Set<ShipId>();

/** Places the labels, records them on the frame for picking, and positions the spans. */
export function placeLabels(reg: LabelRegistry, frame: MapFrame): void {
  const cands =
    reg.shipCandidates.length > 0 ? reg.candidates.concat(reg.shipCandidates) : reg.candidates;
  frame.labels = declutter(cands, {
    x: 0,
    y: 0,
    w: frame.camera.width,
    h: frame.camera.height,
  });
  reg.placed.fill(0);
  placedShips.clear();
  for (const l of frame.labels) {
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
  for (const [id, span] of reg.shipSpans) {
    span.style.visibility = placedShips.has(id) ? 'visible' : 'hidden';
  }
}
