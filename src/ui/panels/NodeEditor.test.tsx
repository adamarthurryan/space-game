// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SMOKE_TLI } from '../../gen/lunarMission';
import { presetOrbit } from '../../gen/sandboxShips';
import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { Inspector } from '../layout/Inspector';
import { resetStores } from './testStores';

beforeEach(resetStores);
afterEach(cleanup);

/** A LEO (lunar plane) ship with a TLI node, selected. */
function setUp(dv: number = SMOKE_TLI.dv): { shipId: string; nodeId: string } {
  const s = useWorld.getState();
  const r = s.spawnShip({
    designId: 'starship',
    orbit: presetOrbit(s.world.system, 'leo-lunar-plane', 0),
  });
  if (!r.ok) throw new Error(r.error);
  const n = useWorld.getState().addNode(r.value, {
    t: SMOKE_TLI.dt,
    dv: { prograde: dv, normal: 0, radial: 0 },
  });
  if (!n.ok) throw new Error(n.error);
  act(() => {
    useView.getState().activate(r.value);
    useView.getState().select({ kind: 'node', shipId: r.value, id: n.value });
  });
  return { shipId: r.value, nodeId: n.value };
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, text: string) => {
  fireEvent.change(field(label), { target: { value: text } });
  fireEvent.keyDown(field(label), { key: 'Enter' });
};

describe('NodeEditor inline in the ship inspector (S5b-17)', () => {
  it("expands the node's row, with the plan totals and the ship's sections still shown", () => {
    const { shipId } = setUp();
    render(<Inspector />);
    const row = screen.getByRole('button', { name: /^◆ Node 1/ });
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(row.closest('li')!.querySelector('[aria-label="Node editor"]')).not.toBeNull();
    expect(screen.getByLabelText('Δv left after plan')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Starship 4' })).toBeTruthy();
    // Its header selects the ship, which collapses it.
    fireEvent.click(row);
    expect(useView.getState().selected).toEqual({ kind: 'ship', id: shipId });
    expect(screen.queryByRole('region', { name: 'Node editor' })).toBeNull();
  });

  it("shows a non-active ship's plan read-only (S5b-8)", () => {
    setUp();
    act(() => useView.getState().activate('ship-1'));
    render(<Inspector />);
    expect(screen.getByRole('note').textContent).toBe('Read-only: fly this ship to edit (A)');
    for (const label of ['Time', 'From now', 'Prograde', 'Normal', 'Radial (out)', 'Enabled']) {
      expect(field(label).disabled).toBe(true);
    }
    for (const name of ['Snap to Pe', 'Snap to Ap', 'Delete', 'Warp to node', 'Add node ▾']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });
});

describe('NodeEditor', () => {
  it('shows a TLI’s Δv, burn duration and Moon encounter', () => {
    setUp();
    render(<Inspector />);
    const editor = screen.getByRole('region', { name: 'Node editor' });
    expect(field('Prograde').value).toBe('3,130.5 m/s');
    expect(within(editor).getByText('Burn duration').nextElementSibling?.textContent).toMatch(
      /min/,
    );
    expect(screen.getByLabelText('Result').textContent).toMatch(/^Moon encounter, Pe \d+/);
  });

  it('recomputes the result when the Δv is typed', () => {
    const { shipId } = setUp();
    render(<Inspector />);
    type('Prograde', '100 m/s');
    expect(useWorld.getState().world.ships[shipId]!.plan[0]!.dv.prograde).toBeCloseTo(0.1, 12);
    expect(screen.getByLabelText('Result').textContent).toMatch(/^Earth orbit/);
    type('Normal', '-0.2 km/s');
    expect(useWorld.getState().world.ships[shipId]!.plan[0]!.dv.normal).toBeCloseTo(-0.2, 12);
  });

  it('moves the node by a typed duration and refuses the past', () => {
    const { shipId } = setUp();
    render(<Inspector />);
    type('From now', '2h');
    expect(useWorld.getState().world.ships[shipId]!.plan[0]!.t).toBeCloseTo(7200, 6);
    type('From now', '-1h');
    expect(screen.getByRole('alert').textContent).toContain('future');
    expect(useWorld.getState().world.ships[shipId]!.plan[0]!.t).toBeCloseTo(7200, 6);
  });

  it('shows an over-budget node in red', () => {
    setUp(9);
    render(<Inspector />);
    expect(screen.getByText(/^Over budget: \d,\d{3}\.\d m\/s of 9,000\.0 m\/s$/)).toBeTruthy();
  });

  it('disables, snaps and deletes', () => {
    const { shipId, nodeId } = setUp();
    render(<Inspector />);
    fireEvent.click(screen.getByLabelText('Enabled'));
    expect(useWorld.getState().world.ships[shipId]!.plan[0]!.enabled).toBe(false);
    expect(screen.getByLabelText('Result').textContent).toContain('disabled');
    fireEvent.click(screen.getByLabelText('Enabled'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(useWorld.getState().world.ships[shipId]!.plan).toEqual([]);
    expect(useView.getState().selected).toEqual({ kind: 'ship', id: shipId });
    expect(nodeId).toBe('node-1');
  });

  it('snaps to apoapsis on an elliptic orbit', () => {
    // Tern (ship-2) is elliptic.
    const n = useWorld.getState().addNode('ship-2', { t: 1000 });
    if (!n.ok) throw new Error(n.error);
    act(() => {
      useView.getState().activate('ship-2');
      useView.getState().select({ kind: 'node', shipId: 'ship-2', id: n.value });
    });
    render(<Inspector />);
    fireEvent.click(screen.getByRole('button', { name: 'Snap to Ap' }));
    expect(useWorld.getState().world.ships['ship-2']!.plan[0]!.t).not.toBe(1000);
  });

  it('warps to the node, or shows why not (S5-4)', () => {
    const { nodeId } = setUp();
    render(<Inspector />);
    fireEvent.click(screen.getByRole('button', { name: 'Warp to node' }));
    const w = useWorld.getState().world;
    expect(w.clock.warpTo).toMatchObject({ t: SMOKE_TLI.dt - 60, kind: 'node' });
    expect(nodeId).toBeTruthy();
    w.clock.t = SMOKE_TLI.dt - 30;
    fireEvent.click(screen.getByRole('button', { name: 'Warp to node' }));
    expect(screen.getByRole('alert').textContent).toBe('The node is less than a minute away');
  });
});
