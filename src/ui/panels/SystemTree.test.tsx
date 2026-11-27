// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useView } from '../../store/useView';
import { SystemTree } from './SystemTree';

const initialView = useView.getState();
beforeEach(() => useView.setState(initialView, true));
afterEach(cleanup);

const item = (name: string) => screen.getByRole('treeitem', { name });
const childNames = (name: string) =>
  within(within(item(name)).getByRole('group'))
    .getAllByRole('treeitem')
    .filter(
      (el) =>
        el.getAttribute('aria-level') === String(Number(item(name).getAttribute('aria-level')) + 1),
    )
    .map((el) => el.getAttribute('aria-label'));

describe('SystemTree', () => {
  it('shows the Sun, expanded, and its nine children, collapsed', () => {
    render(<SystemTree />);
    expect(item('Sun').getAttribute('aria-expanded')).toBe('true');
    expect(childNames('Sun')).toEqual([
      'Mercury',
      'Venus',
      'Earth',
      'Mars',
      'Jupiter',
      'Saturn',
      'Uranus',
      'Neptune',
      'Pluto',
    ]);
    expect(item('Jupiter').getAttribute('aria-expanded')).toBe('false');
    expect(item('Mercury').getAttribute('aria-expanded')).toBeNull();
  });

  it('expanding Jupiter shows its four moons in order of a', async () => {
    const user = userEvent.setup();
    render(<SystemTree />);
    await user.click(within(item('Jupiter')).getByText('▸'));
    expect(childNames('Jupiter')).toEqual(['Io', 'Europa', 'Ganymede', 'Callisto']);
  });

  it('click selects, double-click focuses', async () => {
    const user = userEvent.setup();
    render(<SystemTree />);
    await user.click(within(item('Mars')).getByText('Mars'));
    expect(useView.getState().selected).toEqual({ kind: 'body', id: 'mars' });
    expect(item('Mars').getAttribute('aria-selected')).toBe('true');
    const seq = useView.getState().focusSeq;
    await user.dblClick(within(item('Mars')).getByText('Mars'));
    expect(useView.getState().focusSeq).toBeGreaterThan(seq);
    expect(useView.getState().focus).toEqual({ kind: 'body', id: 'mars' });
  });

  it('moves with the keyboard: Down/Up, Right expands, Left collapses and goes to the parent, Enter focuses', async () => {
    const user = userEvent.setup();
    render(<SystemTree />);
    await user.click(within(item('Earth')).getByText('Earth'));
    item('Earth').focus();

    await user.keyboard('{ArrowDown}');
    expect(useView.getState().selected?.id).toBe('mars');
    expect(document.activeElement).toBe(item('Mars'));
    await user.keyboard('{ArrowUp}');
    expect(useView.getState().selected?.id).toBe('earth');

    await user.keyboard('{ArrowRight}');
    expect(item('Earth').getAttribute('aria-expanded')).toBe('true');
    await user.keyboard('{ArrowRight}');
    expect(useView.getState().selected?.id).toBe('moon');

    await user.keyboard('{ArrowLeft}');
    expect(useView.getState().selected?.id).toBe('earth');
    await user.keyboard('{ArrowLeft}');
    expect(item('Earth').getAttribute('aria-expanded')).toBe('false');

    await user.keyboard('{Enter}');
    expect(useView.getState().focus).toEqual({ kind: 'body', id: 'earth' });
  });

  it('marks minor bodies', async () => {
    const user = userEvent.setup();
    render(<SystemTree />);
    await user.click(within(item('Mars')).getByText('▸'));
    expect(within(item('Phobos')).getByText('minor')).toBeTruthy();
    expect(within(item('Mars')).queryAllByText('minor')).toHaveLength(2); // Phobos and Deimos
  });

  it('reveals a body selected from the map', () => {
    render(<SystemTree />);
    expect(screen.queryByRole('treeitem', { name: 'Titan' })).toBeNull();
    useView.getState().select({ kind: 'body', id: 'titan' });
    return new Promise<void>((resolve) =>
      setTimeout(() => {
        expect(item('Saturn').getAttribute('aria-expanded')).toBe('true');
        expect(item('Titan').getAttribute('aria-selected')).toBe('true');
        expect(item('Titan').tabIndex).toBe(0);
        resolve();
      }),
    );
  });
});
