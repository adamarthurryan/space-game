/**
 * Glyphs on the timeline strip (decision S5-7 in planning/sprint-5.md): one per upcoming event, at
 * its x, in its ship's colour. Glyphs closer than GLYPH_GAP_PX stack into a second row, and past
 * that fold into a "+n".
 */

import type { NodeId } from '../../sim/maneuver';
import type { ShipId } from '../../sim/ship';
import { assertNever } from '../../sim/trajectory';
import type { UpcomingEvent } from '../../sim/upcoming';
import { xOf, type StripScale } from './scale';

export const GLYPH_GAP_PX = 6;
export const GLYPH_ROWS = 2;

export type GlyphSymbol = '◆' | '◇' | '▲' | '▼' | '✕';

export interface StripGlyph {
  /** Stable across frames. */
  key: string;
  event: UpcomingEvent;
  x: number;
  /** 0 (lower) or 1 (stacked above). */
  row: number;
  glyph: GlyphSymbol;
  color: string;
  selected: boolean;
}

export interface StripOverflow {
  x: number;
  count: number;
}

export function glyphFor(e: UpcomingEvent): GlyphSymbol {
  switch (e.kind) {
    case 'node':
      return e.enabled ? '◆' : '◇';
    case 'soi-enter':
      return '▲';
    case 'soi-exit':
      return '▼';
    case 'impact':
      return '✕';
    default:
      return assertNever(e.kind);
  }
}

/** The glyphs of the events within `now + span`, stacked, and what didn't fit. */
export function stripGlyphs(
  events: readonly UpcomingEvent[],
  s: StripScale,
  now: number,
  colorOf: (id: ShipId) => string,
  selectedNodeId: NodeId | null,
): { glyphs: StripGlyph[]; overflow: StripOverflow[] } {
  const glyphs: StripGlyph[] = [];
  const overflow: StripOverflow[] = [];
  const lastX = new Array<number>(GLYPH_ROWS).fill(-Infinity);
  const sorted = [...events].sort((a, b) => a.t - b.t);
  for (const e of sorted) {
    const dt = e.t - now;
    if (dt < 0 || dt > s.span) continue;
    const x = xOf(s, dt);
    const row = lastX.findIndex((l) => x - l >= GLYPH_GAP_PX);
    if (row < 0) {
      const last = overflow.at(-1);
      if (last && x - last.x < GLYPH_GAP_PX) last.count++;
      else overflow.push({ x, count: 1 });
      continue;
    }
    lastX[row] = x;
    glyphs.push({
      key: `${e.shipId}:${e.kind}:${e.nodeId ?? e.t}`,
      event: e,
      x,
      row,
      glyph: glyphFor(e),
      color: colorOf(e.shipId),
      selected: e.nodeId !== undefined && e.nodeId === selectedNodeId,
    });
  }
  return { glyphs, overflow };
}
