// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../../gen/scenario';
import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { useMapKeys } from '../useMapKeys';
import { MapToolbar } from './MapToolbar';

const initialView = useView.getState();
beforeEach(() => {
  useView.setState(initialView, true);
  useWorld.setState({ world: createSandboxWorld(), version: 0 });
});
afterEach(cleanup);

function Harness() {
  useMapKeys();
  return (
    <>
      <MapToolbar />
      <input aria-label="text" />
    </>
  );
}

const button = (name: RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('MapToolbar', () => {
  it('snaps to the ecliptic; Orbit plane and Focus need a selection with an orbit', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(button(/Ecliptic/));
    expect(useView.getState().snapRequest).toEqual({ plane: 'ecliptic', seq: 1 });
    expect(button(/Orbit plane/).disabled).toBe(true);
    expect(button(/Focus/).disabled).toBe(true);

    act(() => useView.getState().select({ kind: 'body', id: 'sun' }));
    expect(button(/Orbit plane/).disabled).toBe(true);
    expect(button(/Focus/).disabled).toBe(false);

    act(() => useView.getState().select({ kind: 'body', id: 'moon' }));
    await user.click(button(/Orbit plane/));
    expect(useView.getState().snapRequest).toEqual({ plane: 'selected-orbit', seq: 2 });
    await user.click(button(/Focus/));
    expect(useView.getState().focus).toEqual({ kind: 'body', id: 'moon' });
  });
});

describe('useMapKeys', () => {
  it('Space, comma and period control the clock', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const clock = () => useWorld.getState().world.clock;
    await user.keyboard(' ');
    expect(clock().paused).toBe(true);
    await user.keyboard('..');
    expect(clock().warpIndex).toBe(2);
    await user.keyboard(',');
    expect(clock().warpIndex).toBe(1);
  });

  it('E and P snap, F focuses, Esc clears the selection', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.keyboard('p');
    expect(useView.getState().snapRequest).toBeNull(); // nothing selected
    await user.keyboard('e');
    expect(useView.getState().snapRequest?.plane).toBe('ecliptic');

    act(() => useView.getState().select({ kind: 'body', id: 'mars' }));
    await user.keyboard('p');
    expect(useView.getState().snapRequest?.plane).toBe('selected-orbit');
    await user.keyboard('f');
    expect(useView.getState().focus).toEqual({ kind: 'body', id: 'mars' });
    await user.keyboard('{Escape}');
    expect(useView.getState().selected).toBeNull();
  });

  it('is ignored while a text field has focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('textbox', { name: 'text' }));
    await user.keyboard(' e');
    expect(useWorld.getState().world.clock.paused).toBe(false);
    expect(useView.getState().snapRequest).toBeNull();
  });
});

describe('MapToolbar with a node selected (S4-10)', () => {
  it('snaps to and focuses the node’s ship', async () => {
    const n = useWorld.getState().addNode('ship-1', { t: 1000 });
    if (!n.ok) throw new Error(n.error);
    act(() => useView.getState().select({ kind: 'node', shipId: 'ship-1', id: n.value }));
    render(<MapToolbar />);
    const orbit = screen.getByRole('button', { name: /Orbit plane/ }) as HTMLButtonElement;
    expect(orbit.disabled).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: /Focus/ }));
    expect(useView.getState().focus).toEqual({ kind: 'ship', id: 'ship-1' });
  });
});
