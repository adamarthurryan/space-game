// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useView } from '../store/useView';
import { useWorld } from '../store/useWorld';
import { resetStores } from './panels/testStores';
import { useMapKeys } from './useMapKeys';

beforeEach(resetStores);
afterEach(cleanup);

function Harness() {
  useMapKeys();
  return null;
}
const key = (k: string) => fireEvent.keyDown(window, { key: k });

describe('cycling keys (S6-8)', () => {
  it('] and [ activate, select and focus the next and previous ship', () => {
    render(<Harness />);
    key(']');
    expect(useView.getState()).toMatchObject({
      activeShipId: 'ship-1',
      selected: { kind: 'ship', id: 'ship-1' },
      focus: { kind: 'ship', id: 'ship-1' },
      frame: { kind: 'ship-parent', shipId: 'ship-1' },
    });
    key(']');
    expect(useView.getState().activeShipId).toBe('ship-2');
    key('[');
    key('[');
    expect(useView.getState().activeShipId).toBe('ship-3');
  });

  it('} stays in the fleet; I picks the next idle ship', () => {
    act(() => {
      const s = useWorld.getState();
      s.createFleet('A');
      s.assignShip('ship-1', 'fleet-1');
      s.assignShip('ship-3', 'fleet-1');
      s.addNode('ship-3', { t: 5000 });
      useView.getState().activate('ship-1');
    });
    render(<Harness />);
    key('}');
    expect(useView.getState().activeShipId).toBe('ship-3');
    key('}');
    expect(useView.getState().activeShipId).toBe('ship-1');
    key('I');
    expect(useView.getState().activeShipId).toBe('ship-2');
  });

  it('ignores a fleet selection for F, A and P', () => {
    act(() => {
      useWorld.getState().createFleet('A');
      useView.getState().select({ kind: 'fleet', id: 'fleet-1' });
    });
    render(<Harness />);
    const seq = useView.getState().focusSeq;
    key('f');
    key('a');
    key('p');
    expect(useView.getState().focusSeq).toBe(seq);
    expect(useView.getState().activeShipId).toBeNull();
    expect(useView.getState().snapRequest).toBeNull();
  });
});
