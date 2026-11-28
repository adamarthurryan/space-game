import { beforeEach, describe, expect, it } from 'vitest';
import { focusRefOf, resolveActiveShip, useView } from './useView';

describe('the active ship (S4-9)', () => {
  beforeEach(() => useView.setState({ selected: null, activeShipId: null }));

  it('is the last selected ship, kept when a body is selected', () => {
    const v = useView.getState();
    v.select({ kind: 'ship', id: 'ship-2' });
    expect(useView.getState().activeShipId).toBe('ship-2');
    v.select({ kind: 'body', id: 'moon' });
    expect(useView.getState().activeShipId).toBe('ship-2');
    v.select(null);
    expect(useView.getState().activeShipId).toBe('ship-2');
  });

  it('follows a selected node’s ship, and a node focuses its ship', () => {
    const v = useView.getState();
    v.select({ kind: 'node', shipId: 'ship-3', id: 'node-1' });
    expect(useView.getState().activeShipId).toBe('ship-3');
    v.focusOn({ kind: 'node', shipId: 'ship-1', id: 'node-2' });
    const s = useView.getState();
    expect(s.focus).toEqual({ kind: 'ship', id: 'ship-1' });
    expect(s.selected).toEqual({ kind: 'node', shipId: 'ship-1', id: 'node-2' });
    expect(s.activeShipId).toBe('ship-1');
    expect(focusRefOf({ kind: 'body', id: 'earth' })).toEqual({ kind: 'body', id: 'earth' });
  });

  it('resolves to null for a destroyed or missing ship', () => {
    const world = { ships: { a: { status: 'coasting' }, b: { status: 'destroyed' } } };
    expect(resolveActiveShip(world, 'a')).toBe('a');
    expect(resolveActiveShip(world, 'b')).toBeNull();
    expect(resolveActiveShip(world, 'c')).toBeNull();
    expect(resolveActiveShip(world, null)).toBeNull();
  });
});

describe('preview (S5-9)', () => {
  it('starts, moves keeping sticky, and ends', () => {
    const v = useView.getState();
    v.startPreview(100, true);
    expect(useView.getState().preview).toEqual({ t: 100, sticky: true });
    useView.getState().movePreview(200);
    expect(useView.getState().preview).toEqual({ t: 200, sticky: true });
    useView.getState().endPreview();
    expect(useView.getState().preview).toBeNull();
    useView.getState().movePreview(300);
    expect(useView.getState().preview).toBeNull();
  });
});
