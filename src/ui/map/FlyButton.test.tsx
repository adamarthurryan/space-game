// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { resetStores } from '../panels/testStores';
import { useMapKeys } from '../useMapKeys';
import { FlyButton } from './FlyButton';

beforeEach(resetStores);
afterEach(cleanup);

function Harness() {
  useMapKeys();
  return <FlyButton />;
}

const button = () => screen.getByRole('button') as HTMLButtonElement;

describe('FlyButton (S5b-6, S5b-7)', () => {
  it('reads "No active ship", disabled, with nothing flown', () => {
    render(<Harness />);
    expect(button().getAttribute('aria-label')).toBe('No active ship');
    expect(button().disabled).toBe(true);
  });

  it('flies the selected ship, then shows it pressed', () => {
    render(<Harness />);
    act(() => useView.getState().select({ kind: 'ship', id: 'ship-1' }));
    expect(button().getAttribute('aria-label')).toBe('Fly Kestrel (A)');
    fireEvent.click(button());
    expect(useView.getState().activeShipId).toBe('ship-1');
    expect(useView.getState().frame).toEqual({ kind: 'ship-parent', shipId: 'ship-1' });
    expect(button().getAttribute('aria-label')).toBe('★ Kestrel');
    expect(button().getAttribute('aria-pressed')).toBe('true');
  });

  it("shows the active ship's name, disabled, with a body selected", () => {
    render(<Harness />);
    act(() => {
      useView.getState().activate('ship-2');
      useView.getState().select({ kind: 'body', id: 'mars' });
    });
    expect(button().getAttribute('aria-label')).toBe('★ Tern');
    expect(button().disabled).toBe(true);
    expect(button().getAttribute('aria-pressed')).toBe('false');
  });

  it("A flies the selected ship or node's ship; not a destroyed one", () => {
    render(<Harness />);
    act(() => useView.getState().select({ kind: 'node', shipId: 'ship-3', id: 'n' }));
    fireEvent.keyDown(window, { key: 'a' });
    expect(useView.getState().activeShipId).toBe('ship-3');
    useWorld.getState().world.ships['ship-1']!.status = 'destroyed';
    act(() => useView.getState().select({ kind: 'ship', id: 'ship-1' }));
    fireEvent.keyDown(window, { key: 'A' });
    expect(useView.getState().activeShipId).toBe('ship-3');
  });
});
