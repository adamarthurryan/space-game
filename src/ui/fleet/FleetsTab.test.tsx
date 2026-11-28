// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { presetOrbit } from '../../gen/sandboxShips';
import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { resetStores } from '../panels/testStores';
import { FleetsTab } from './FleetsTab';

beforeEach(resetStores);
afterEach(cleanup);

const option = (name: string) => screen.getByRole('option', { name });

describe('FleetsTab', () => {
  it('lists Kestrel, Tern and Heron in order, with their SOI', () => {
    render(<FleetsTab />);
    const rows = within(screen.getByRole('listbox', { name: 'Ships' })).getAllByRole('option');
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['Kestrel', 'Tern', 'Heron']);
    expect(within(option('Kestrel')).getByText(/Starship \(chemical\) · Earth/)).toBeTruthy();
    expect(within(option('Heron')).getByText(/Starship \(chemical\) · Moon/)).toBeTruthy();
    expect(within(option('Kestrel')).getByText(/km\/s/)).toBeTruthy();
  });

  it('selects on click and focuses on double-click', async () => {
    const user = userEvent.setup();
    render(<FleetsTab />);
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
    render(<FleetsTab />);
    await user.click(option('Kestrel'));
    await user.keyboard('{ArrowDown}');
    expect(useView.getState().selected).toEqual({ kind: 'ship', id: 'ship-2' });
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(useView.getState().selected).toEqual({ kind: 'ship', id: 'ship-3' });
    await user.keyboard('{ArrowUp}');
    expect(useView.getState().selected).toEqual({ kind: 'ship', id: 'ship-2' });
  });

  it('greys out a destroyed ship with what it hit', () => {
    render(<FleetsTab />);
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
    render(<FleetsTab />);
    await user.click(screen.getByRole('button', { name: 'Spawn ship…' }));
    expect(screen.getByRole('form', { name: 'Spawn ship' })).toBeTruthy();
  });
});

describe('FleetsTab: the active ship (S5b-6)', () => {
  it('marks the activated ship with ★, not the selected one, and keeps it when a body is selected', () => {
    render(<FleetsTab />);
    fireEvent.click(screen.getByRole('option', { name: /Tern/ }));
    expect(screen.getByRole('option', { name: /Tern/ }).textContent).not.toContain('★');
    act(() => useView.getState().activate('ship-2'));
    expect(screen.getByRole('option', { name: /Tern/ }).textContent).toContain('★');
    act(() => useView.getState().select({ kind: 'body', id: 'moon' }));
    expect(screen.getByRole('option', { name: /Tern/ }).textContent).toContain('★');
    expect(screen.getByRole('option', { name: /Kestrel/ }).textContent).not.toContain('★');
  });
});

const header = (key: string) => document.querySelector(`[data-fleet-header="${key}"]`)!;

describe('FleetsTab: fleets (S6-4 to S6-7)', () => {
  it('+ New fleet adds a group with its name being edited', async () => {
    const user = userEvent.setup();
    render(<FleetsTab />);
    await user.click(screen.getByRole('button', { name: '+ New fleet' }));
    const input = screen.getByRole('textbox', { name: 'Fleet name' });
    await user.clear(input);
    await user.type(input, 'Haulers{Enter}');
    expect(useWorld.getState().world.fleets['fleet-1']!.name).toBe('Haulers');
    expect(header('fleet-1').textContent).toContain('Haulers');
  });

  it('renames with a double-click, showing an error for a duplicate', async () => {
    const user = userEvent.setup();
    act(() => {
      useWorld.getState().createFleet('A');
      useWorld.getState().createFleet('B');
    });
    render(<FleetsTab />);
    await user.dblClick(header('fleet-2'));
    const input = screen.getByRole('textbox', { name: 'Fleet name' });
    await user.clear(input);
    await user.type(input, 'a{Enter}');
    expect(screen.getByRole('alert').textContent).toBe('A fleet named A already exists');
    await user.keyboard('{Escape}');
    expect(useWorld.getState().world.fleets['fleet-2']!.name).toBe('B');
  });

  it('drops a dragged ship onto a fleet header, and back onto Unassigned', () => {
    act(() => void useWorld.getState().createFleet('Survey'));
    render(<FleetsTab />);
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
      get types() {
        return [...data.keys()];
      },
      effectAllowed: '',
      dropEffect: '',
    };
    fireEvent.dragStart(option('Tern'), { dataTransfer });
    fireEvent.dragOver(header('fleet-1'), { dataTransfer });
    fireEvent.drop(header('fleet-1'), { dataTransfer });
    expect(useWorld.getState().world.ships['ship-2']!.fleetId).toBe('fleet-1');
    expect(
      within(header('fleet-1').parentElement!).getByRole('option', { name: 'Tern' }),
    ).toBeTruthy();
    fireEvent.dragStart(option('Tern'), { dataTransfer });
    fireEvent.drop(header('unassigned'), { dataTransfer });
    expect(useWorld.getState().world.ships['ship-2']!.fleetId).toBeNull();
  });

  it('hides Unassigned when empty, and filters by status', async () => {
    const user = userEvent.setup();
    act(() => {
      const s = useWorld.getState();
      s.createFleet('All');
      for (const id of ['ship-1', 'ship-2', 'ship-3']) s.assignShip(id, 'fleet-1');
      s.addNode('ship-1', { t: 5000 });
    });
    render(<FleetsTab />);
    expect(document.querySelector('[data-fleet-header="unassigned"]')).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Idle' }));
    const names = () => screen.queryAllByRole('option').map((o) => o.getAttribute('aria-label'));
    expect(names()).toEqual(['Tern', 'Heron']);
    await user.click(screen.getByRole('radio', { name: 'In trouble' }));
    expect(names()).toEqual([]);
    expect(screen.getByText('No ships match.')).toBeTruthy();
  });

  it('clicking a header selects the fleet and shows it on the timeline; ▾ collapses it', async () => {
    const user = userEvent.setup();
    act(() => {
      useWorld.getState().createFleet('Survey');
      useWorld.getState().assignShip('ship-1', 'fleet-1');
    });
    render(<FleetsTab />);
    await user.click(header('fleet-1'));
    expect(useView.getState().selected).toEqual({ kind: 'fleet', id: 'fleet-1' });
    expect(useView.getState().show).toEqual({ kind: 'fleet', id: 'fleet-1' });
    await user.click(screen.getByRole('button', { name: 'Collapse Survey' }));
    expect(screen.queryByRole('option', { name: 'Kestrel' })).toBeNull();
    expect(useView.getState().selected).toEqual({ kind: 'fleet', id: 'fleet-1' });
  });

  it('shows the next-event countdown and status icons', () => {
    act(() => {
      const s = useWorld.getState();
      s.addNode('ship-1', { t: 7200 });
      s.addAlarm({
        scope: { kind: 'ship', shipId: 'ship-1' },
        trigger: { kind: 'event-type', type: 'node' },
        leadTime: 0,
        action: 'pause',
      });
    });
    render(<FleetsTab />);
    expect(option('Kestrel').textContent).toMatch(/Node in 2 h 0 min/);
    expect(within(option('Kestrel')).getByRole('img', { name: 'Alarm set' })).toBeTruthy();
    expect(within(option('Tern')).queryByRole('img')).toBeNull();
  });
});
