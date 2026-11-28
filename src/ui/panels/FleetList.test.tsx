// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { presetOrbit } from '../../gen/sandboxShips';
import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { FleetList } from './FleetList';
import { resetStores } from './testStores';

beforeEach(resetStores);
afterEach(cleanup);

const option = (name: string) => screen.getByRole('option', { name });

describe('FleetList', () => {
  it('lists Kestrel, Tern and Heron in order, with their SOI', () => {
    render(<FleetList />);
    const rows = within(screen.getByRole('listbox', { name: 'Ships' })).getAllByRole('option');
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['Kestrel', 'Tern', 'Heron']);
    expect(within(option('Kestrel')).getByText(/Starship · Earth/)).toBeTruthy();
    expect(within(option('Heron')).getByText(/Starship · Moon/)).toBeTruthy();
    expect(within(option('Kestrel')).getByText(/km\/s/)).toBeTruthy();
  });

  it('selects on click and focuses on double-click', async () => {
    const user = userEvent.setup();
    render(<FleetList />);
    await user.click(option('Tern'));
    expect(useView.getState().selected).toEqual({ kind: 'ship', id: 'ship-2' });
    expect(option('Tern').getAttribute('aria-selected')).toBe('true');
    const seq = useView.getState().focusSeq;
    await user.dblClick(option('Heron'));
    expect(useView.getState().focus).toEqual({ kind: 'ship', id: 'ship-3' });
    expect(useView.getState().focusSeq).toBeGreaterThan(seq);
  });

  it('moves and selects with Up and Down', async () => {
    const user = userEvent.setup();
    render(<FleetList />);
    await user.click(option('Kestrel'));
    await user.keyboard('{ArrowDown}');
    expect(useView.getState().selected).toEqual({ kind: 'ship', id: 'ship-2' });
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(useView.getState().selected).toEqual({ kind: 'ship', id: 'ship-3' });
    await user.keyboard('{ArrowUp}');
    expect(useView.getState().selected).toEqual({ kind: 'ship', id: 'ship-2' });
  });

  it('greys out a destroyed ship with what it hit', () => {
    render(<FleetList />);
    act(() => {
      const s = useWorld.getState();
      const r = s.spawnShip({
        designId: 'starship',
        name: 'Dunlin',
        orbit: presetOrbit(s.world.system, 'suborbital', 0),
      });
      const ship = s.world.ships[r.ok ? r.value : '']!;
      ship.status = 'destroyed';
      ship.destroyedAt = { t: 100, bodyId: 'earth' };
      s.bumpVersion();
    });
    expect(within(option('Dunlin')).getByText(/impacted Earth/)).toBeTruthy();
  });

  it('opens the spawn form', async () => {
    const user = userEvent.setup();
    render(<FleetList />);
    await user.click(screen.getByRole('button', { name: 'Spawn ship…' }));
    expect(screen.getByRole('form', { name: 'Spawn ship' })).toBeTruthy();
  });
});

describe('FleetList: the active ship (S4-9)', () => {
  it('marks the last selected ship with ★, and keeps it when a body is selected', () => {
    render(<FleetList />);
    fireEvent.click(screen.getByRole('option', { name: /Tern/ }));
    expect(screen.getByRole('option', { name: /Tern/ }).textContent).toContain('★');
    act(() => useView.getState().select({ kind: 'body', id: 'moon' }));
    expect(screen.getByRole('option', { name: /Tern/ }).textContent).toContain('★');
    expect(screen.getByRole('option', { name: /Kestrel/ }).textContent).not.toContain('★');
  });
});
