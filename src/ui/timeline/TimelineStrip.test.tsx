// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SMOKE_TLI } from '../../gen/lunarMission';
import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { resetStores } from '../panels/testStores';
import { setUpLunar } from './testLunar';
import { TimelineStrip } from './TimelineStrip';

beforeEach(resetStores);
afterEach(cleanup);

const glyphs = () => Array.from(document.querySelectorAll<HTMLElement>('[data-strip-glyph]'));
const strip = () => screen.getByRole('group', { name: 'Timeline strip' });
const preview = () => useView.getState().preview;

describe('TimelineStrip', () => {
  it('shows nothing without an active ship', () => {
    render(<TimelineStrip />);
    expect(glyphs()).toEqual([]);
  });

  it("shows the active ship's node and Moon SOI entry, in time order", () => {
    setUpLunar();
    render(<TimelineStrip />);
    const g = glyphs();
    expect(g.map((e) => e.dataset['stripGlyph'])).toEqual(
      expect.arrayContaining(['node', 'soi-enter']),
    );
    expect(g[0]!.dataset['stripGlyph']).toBe('node');
    expect(Number(g[0]!.dataset['t'])).toBe(SMOKE_TLI.dt);
    const lefts = g.map((e) => parseFloat(e.style.left));
    expect([...lefts].sort((a, b) => a - b)).toEqual(lefts);
  });

  it('shows the hover details', () => {
    setUpLunar();
    render(<TimelineStrip />);
    const entry = glyphs().find((e) => e.dataset['stripGlyph'] === 'soi-enter')!;
    fireEvent.pointerEnter(entry);
    expect(screen.getByRole('tooltip').textContent).toMatch(/^Moon SOI entry · .* · in 3 d/);
    fireEvent.pointerLeave(entry);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('previews while the strip is pressed, and returns on release', () => {
    setUpLunar();
    render(<TimelineStrip />);
    fireEvent.pointerDown(strip(), { button: 0, pointerId: 1, clientX: 300 });
    const p = preview()!;
    expect(p.sticky).toBe(false);
    expect(p.t).toBeGreaterThan(0);
    fireEvent.pointerMove(strip(), { pointerId: 1, clientX: 400 });
    expect(preview()!.t).toBeGreaterThan(p.t);
    expect(document.querySelector('[data-sticky]')).not.toBeNull();
    fireEvent.pointerUp(strip(), { pointerId: 1, clientX: 400 });
    expect(preview()).toBeNull();
  });

  it('keeps a sticky preview at a clicked event, after release', () => {
    setUpLunar();
    render(<TimelineStrip />);
    const entry = glyphs().find((e) => e.dataset['stripGlyph'] === 'soi-enter')!;
    fireEvent.click(entry);
    expect(preview()).toEqual({ t: Number(entry.dataset['t']), sticky: true });
    expect(useWorld.getState().world.clock.t).toBe(0);
  });

  it('shows the playhead only in a preview', () => {
    setUpLunar();
    render(<TimelineStrip />);
    expect(document.querySelector('[data-sticky]')).toBeNull();
    act(() => useView.getState().startPreview(5000, true));
    expect(document.querySelector('[data-sticky="true"]')).not.toBeNull();
  });
});
