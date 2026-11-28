import { describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../../gen/scenario';
import { getBody } from '../../sim/body';
import type { FocusRef } from '../../store/useView';
import { declutter, labelPriority, shipLabelPriority, type LabelCandidate } from './declutter';

const viewport = { x: 0, y: 0, w: 800, h: 600 };
const ref = (id: string): FocusRef => ({ kind: 'body', id });

function cand(id: string, x: number, y: number, priority: number, hidden = false): LabelCandidate {
  return { ref: ref(id), anchorX: x, anchorY: y, width: 50, height: 12, priority, hidden };
}

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('declutter', () => {
  it('never returns overlapping rects', () => {
    const cands: LabelCandidate[] = [];
    for (let k = 0; k < 60; k++) cands.push(cand(`b${k}`, (k * 37) % 300, (k * 53) % 200, k % 7));
    const placed = declutter(cands, viewport);
    expect(placed.length).toBeGreaterThan(5);
    for (let a = 0; a < placed.length; a++) {
      for (let b = a + 1; b < placed.length; b++) {
        expect(overlaps(placed[a]!.rect, placed[b]!.rect)).toBe(false);
      }
    }
  });

  it('a higher priority wins an overlap; equal priorities keep input order', () => {
    expect(
      declutter([cand('a', 10, 10, 1), cand('b', 20, 12, 2)], viewport).map((p) => p.ref.id),
    ).toEqual(['b']);
    expect(
      declutter([cand('a', 10, 10, 1), cand('b', 20, 12, 1)], viewport).map((p) => p.ref.id),
    ).toEqual(['a']);
  });

  it('always places the focus and the selection when on screen', () => {
    const view = { focus: ref('earth'), selected: ref('moon'), hovered: null };
    const sys = createSandboxWorld().system;
    const p = (id: string) => labelPriority(getBody(sys, id), ref(id), view);
    const placed = declutter(
      [
        cand('sun', 10, 10, p('sun')),
        cand('earth', 20, 12, p('earth')),
        cand('moon', 30, 14, p('moon')),
      ],
      viewport,
    );
    expect(placed.map((l) => l.ref.id).sort()).toEqual(['earth', 'moon']);
  });

  it('never places hidden or off-screen candidates', () => {
    const placed = declutter([cand('a', 10, 10, 1, true), cand('b', 900, 10, 1)], viewport);
    expect(placed).toEqual([]);
  });
});

describe('labelPriority', () => {
  const sys = createSandboxWorld().system;
  type View = Parameters<typeof labelPriority>[2];
  const none: View = { focus: ref('pluto'), selected: null, hovered: null };
  const p = (id: string, view: View = none) => labelPriority(getBody(sys, id), ref(id), view);

  it('orders focus > selection > hover > star > planet > dwarf planet > moon', () => {
    const view = { focus: ref('phobos'), selected: ref('deimos'), hovered: ref('io') };
    const order = [
      p('phobos', view),
      p('deimos', view),
      p('io', view),
      p('sun'),
      p('mercury'),
      p('pluto', { ...none, focus: ref('sun') }),
      p('ganymede'),
    ];
    for (let k = 1; k < order.length; k++) expect(order[k - 1]).toBeGreaterThan(order[k]!);
  });

  it('breaks ties by radius', () => {
    expect(p('jupiter')).toBeGreaterThan(p('earth'));
    expect(p('ganymede')).toBeGreaterThan(p('moon'));
  });

  it('ranks ships below dwarf planets and above moons, earlier ships first', () => {
    const ship = (id: string, seq: number, view: View = none) =>
      shipLabelPriority(seq, { kind: 'ship', id }, view);
    expect(p('pluto', { ...none, focus: ref('sun') })).toBeGreaterThan(ship('ship-1', 1));
    expect(ship('ship-9', 9)).toBeGreaterThan(p('ganymede'));
    expect(ship('ship-1', 1)).toBeGreaterThan(ship('ship-2', 2));
    const selected = { ...none, selected: { kind: 'ship', id: 'ship-2' } } as View;
    expect(ship('ship-2', 2, selected)).toBeGreaterThan(p('sun'));
  });
});
