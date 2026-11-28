import { beforeEach, describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../gen/scenario';
import { focusRefOf, mapSelection, resolveActiveShip, shipOf, useView } from './useView';
import { useWorld } from './useWorld';

const initialView = useView.getState();

beforeEach(() => {
  useView.setState(initialView, true);
  useWorld.setState({ world: createSandboxWorld(), version: 0 });
});

describe('the active ship (S5b-6)', () => {
  it('is not changed by selecting a ship, a node or a body', () => {
    const v = useView.getState();
    v.select({ kind: 'ship', id: 'ship-2' });
    expect(useView.getState().activeShipId).toBeNull();
    v.select({ kind: 'node', shipId: 'ship-3', id: 'node-1' });
    v.focusOn({ kind: 'ship', id: 'ship-1' });
    expect(useView.getState().activeShipId).toBeNull();
  });

  it('is set by activate, kept when anything else is selected, and refuses a destroyed ship', () => {
    const v = useView.getState();
    v.activate('ship-2');
    expect(useView.getState().activeShipId).toBe('ship-2');
    v.select({ kind: 'ship', id: 'ship-1' });
    v.select({ kind: 'body', id: 'moon' });
    v.select(null);
    expect(useView.getState().activeShipId).toBe('ship-2');
    useWorld.getState().world.ships['ship-1']!.status = 'destroyed';
    v.activate('ship-1');
    expect(useView.getState().activeShipId).toBe('ship-2');
    v.activate('nope');
    expect(useView.getState().activeShipId).toBe('ship-2');
  });

  it('a node focuses its ship', () => {
    useView.getState().focusOn({ kind: 'node', shipId: 'ship-1', id: 'node-2' });
    const s = useView.getState();
    expect(s.focus).toEqual({ kind: 'ship', id: 'ship-1' });
    expect(s.selected).toEqual({ kind: 'node', shipId: 'ship-1', id: 'node-2' });
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

describe('the reference frame (S5b-1, decision 183)', () => {
  it('starts on Earth', () => {
    expect(useView.getState().frame).toEqual({ kind: 'body', id: 'earth' });
  });

  it('is not changed by selecting anything', () => {
    const v = useView.getState();
    v.select({ kind: 'body', id: 'mars' });
    v.select({ kind: 'ship', id: 'ship-3' });
    v.select({ kind: 'node', shipId: 'ship-3', id: 'node-1' });
    v.select(null);
    expect(useView.getState().frame).toEqual({ kind: 'body', id: 'earth' });
    v.activate('ship-3');
    v.select({ kind: 'body', id: 'mars' });
    expect(useView.getState().frame).toEqual({ kind: 'ship-parent', shipId: 'ship-3' });
  });

  it('is the focused body', () => {
    useView.getState().focusOn({ kind: 'body', id: 'mars' });
    expect(useView.getState().frame).toEqual({ kind: 'body', id: 'mars' });
  });

  it("is a focused non-active ship's parent, fixed, for the ship or its node", () => {
    // Heron (ship-3) orbits the Moon.
    useView.getState().focusOn({ kind: 'ship', id: 'ship-3' });
    expect(useView.getState().frame).toEqual({ kind: 'body', id: 'moon' });
    useView.getState().focusOn({ kind: 'body', id: 'sun' });
    useView.getState().focusOn({ kind: 'node', shipId: 'ship-3', id: 'node-1' });
    expect(useView.getState().frame).toEqual({ kind: 'body', id: 'moon' });
  });

  it('follows the active ship when it is activated or focused', () => {
    const v = useView.getState();
    v.focusOn({ kind: 'body', id: 'mars' });
    v.activate('ship-3');
    expect(useView.getState().frame).toEqual({ kind: 'ship-parent', shipId: 'ship-3' });
    v.focusOn({ kind: 'body', id: 'mars' });
    v.focusOn({ kind: 'node', shipId: 'ship-3', id: 'node-1' });
    expect(useView.getState().frame).toEqual({ kind: 'ship-parent', shipId: 'ship-3' });
  });

  it('setFrame fixes it, and stops following', () => {
    const v = useView.getState();
    v.activate('ship-3');
    v.setFrame('earth');
    expect(useView.getState().frame).toEqual({ kind: 'body', id: 'earth' });
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

describe('fleet selection (S6-7)', () => {
  it('selecting a fleet shows it on the timeline; it is not a map object', () => {
    useView.getState().select({ kind: 'fleet', id: 'fleet-1' });
    expect(useView.getState().show).toEqual({ kind: 'fleet', id: 'fleet-1' });
    const sel = useView.getState().selected;
    expect(mapSelection(sel)).toBeNull();
    expect(shipOf(sel)).toBeNull();
    useView.getState().select({ kind: 'ship', id: 'ship-1' });
    expect(useView.getState().show).toEqual({ kind: 'fleet', id: 'fleet-1' });
    expect(mapSelection(useView.getState().selected)).toEqual({ kind: 'ship', id: 'ship-1' });
  });
});
