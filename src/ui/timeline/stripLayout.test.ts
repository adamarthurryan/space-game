import { describe, expect, it } from 'vitest';
import type { UpcomingEvent } from '../../sim/upcoming';
import { dtOf } from './scale';
import { stripGlyphs } from './stripLayout';

const s = { span: 86_400 * 10, width: 500 };
const ev = (
  kind: UpcomingEvent['kind'],
  t: number,
  extra: Partial<UpcomingEvent> = {},
): UpcomingEvent => ({
  shipId: 'ship-1',
  kind,
  t,
  segmentIndex: 0,
  parentId: 'earth',
  enabled: true,
  ...extra,
});
const color = (id: string) => (id === 'ship-1' ? '#f00' : '#0f0');

describe('stripGlyphs (S5-7)', () => {
  it('gives each event its symbol and ship colour, and flags the selected node', () => {
    const { glyphs } = stripGlyphs(
      [
        ev('node', 100, { nodeId: 'node-1' }),
        ev('node', 1000, { nodeId: 'node-2', enabled: false }),
        ev('soi-exit', 1e4),
        ev('soi-enter', 1e5, { shipId: 'ship-2' }),
        ev('impact', 5e5),
      ],
      s,
      0,
      color,
      'node-1',
    );
    expect(glyphs.map((g) => g.glyph)).toEqual(['◆', '◇', '▼', '▲', '✕']);
    expect(glyphs[3]!.color).toBe('#0f0');
    expect(glyphs.map((g) => g.selected)).toEqual([true, false, false, false, false]);
  });

  it('stacks close glyphs into a second row, then folds into +n', () => {
    const t = dtOf(s, 200);
    const t2 = dtOf(s, 203);
    const t3 = dtOf(s, 204);
    const t4 = dtOf(s, 205);
    const { glyphs, overflow } = stripGlyphs(
      [
        ev('node', t, { nodeId: 'a' }),
        ev('node', t2, { nodeId: 'b' }),
        ev('node', t3, { nodeId: 'c' }),
        ev('node', t4, { nodeId: 'd' }),
      ],
      s,
      0,
      color,
      null,
    );
    expect(glyphs.map((g) => g.row)).toEqual([0, 1]);
    expect(overflow).toHaveLength(1);
    expect(overflow[0]!.count).toBe(2);
  });

  it('leaves out events past the span or before now', () => {
    const { glyphs } = stripGlyphs(
      [ev('impact', s.span + 200), ev('impact', 50)],
      s,
      100,
      color,
      null,
    );
    expect(glyphs).toEqual([]);
  });
});
