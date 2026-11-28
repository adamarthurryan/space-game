// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { Inspector } from '../layout/Inspector';
import { deleteFleetText } from '../fleet/shipRows';
import { resetStores } from './testStores';

beforeEach(() => {
  resetStores();
  act(() => {
    const s = useWorld.getState();
    s.createFleet('Survey');
    s.assignShip('ship-1', 'fleet-1');
    s.assignShip('ship-3', 'fleet-1');
    useView.getState().select({ kind: 'fleet', id: 'fleet-1' });
  });
});
afterEach(cleanup);

describe('FleetInspector (S6-10)', () => {
  it('shows the name, the ship count and the ships', () => {
    render(<Inspector />);
    expect(screen.getByRole('heading', { name: 'Survey' })).toBeTruthy();
    expect(screen.getByText('Fleet · 2 ships')).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Fleet ships' });
    expect(list.textContent).toBe('KestrelHeron');
  });

  it('renames in place', async () => {
    const user = userEvent.setup();
    render(<Inspector />);
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByRole('textbox', { name: 'Fleet name' });
    await user.clear(input);
    await user.type(input, 'Scouts{Enter}');
    expect(screen.getByRole('heading', { name: 'Scouts' })).toBeTruthy();
  });

  it('shows the fleet on the timeline', async () => {
    const user = userEvent.setup();
    act(() => useView.getState().setShow({ kind: 'all' }));
    render(<Inspector />);
    await user.click(screen.getByRole('button', { name: 'Show on timeline' }));
    expect(useView.getState().show).toEqual({ kind: 'fleet', id: 'fleet-1' });
  });

  it('confirms before deleting a fleet with ships, then clears the selection', async () => {
    const user = userEvent.setup();
    render(<Inspector />);
    await user.click(screen.getByRole('button', { name: 'Delete fleet…' }));
    expect(screen.getByRole('alertdialog').textContent).toContain(
      'Delete Survey? 2 ships move to Unassigned.',
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(useWorld.getState().world.fleets['fleet-1']).toBeUndefined();
    expect(useView.getState().selected).toBeNull();
  });

  it('words the confirmation', () => {
    expect(deleteFleetText(1, 1)).toBe('1 ship moves to Unassigned. 1 alarm is deleted.');
    expect(deleteFleetText(0, 2)).toBe('2 alarms are deleted.');
  });
});
