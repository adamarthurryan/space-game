/**
 * Label placement (decision S2-15 in planning/sprint-2.md): greedy, highest priority first; a
 * label that overlaps one already placed is hidden. The focus and the selection are always
 * placed when on screen.
 */

import type { Body } from '../../sim/body';
import type { MapObjectRef } from '../../store/useView';
import type { PlacedLabel, Rect } from '../mapFrame';

export interface LabelCandidate {
  ref: MapObjectRef;
  /** Left edge and vertical centre of the label: it goes right of the marker or disc. */
  anchorX: number;
  anchorY: number;
  /** Measured once per label text. */
  width: number;
  height: number;
  /** Higher first. */
  priority: number;
  /** Behind the camera, occluded, or merged into its parent. */
  hidden: boolean;
}

/** Priority tiers; the body's radius (< 1e7 km) breaks ties within a tier. */
const TIER = { focus: 7, selected: 6, hovered: 5, star: 4, planet: 3, 'dwarf-planet': 2, moon: 1 };
const TIER_SCALE = 1e7;
/** Priorities at or above this are always placed. */
const FORCED = TIER.selected * TIER_SCALE;

const sameRef = (a: MapObjectRef | null, b: MapObjectRef) =>
  a !== null && a.kind === b.kind && a.id === b.id;

/** Focus > selection > hover > star > planet > dwarf planet > moon, then by radius. */
export function labelPriority(
  body: Body,
  ref: MapObjectRef,
  view: { focus: MapObjectRef; selected: MapObjectRef | null; hovered: MapObjectRef | null },
): number {
  const tier = sameRef(view.focus, ref)
    ? TIER.focus
    : sameRef(view.selected, ref)
      ? TIER.selected
      : sameRef(view.hovered, ref)
        ? TIER.hovered
        : TIER[body.class];
  return tier * TIER_SCALE + Math.min(body.radius, TIER_SCALE - 1);
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function labelRect(c: LabelCandidate): Rect {
  return { x: c.anchorX, y: c.anchorY - c.height / 2, w: c.width, h: c.height };
}

/**
 * Greedy placement: highest priority first, skipping labels that overlap an earlier one or lie
 * outside the viewport. Stable for equal priorities. The focus and the selection are placed
 * whenever they are on screen, even over another label.
 */
export function declutter(cands: readonly LabelCandidate[], viewport: Rect): PlacedLabel[] {
  const idx = cands.map((_, i) => i).filter((i) => !cands[i]!.hidden);
  idx.sort((a, b) => cands[b]!.priority - cands[a]!.priority || a - b);
  const placed: PlacedLabel[] = [];
  for (const i of idx) {
    const c = cands[i]!;
    const rect = labelRect(c);
    if (!overlaps(rect, viewport)) continue;
    if (c.priority < FORCED && placed.some((p) => overlaps(p.rect, rect))) continue;
    placed.push({ ref: c.ref, rect });
  }
  return placed;
}
