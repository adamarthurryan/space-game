// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { PlanSection } from './PlanSection';
import { resetStores } from './testStores';

beforeEach(() => {
  resetStores();
  useView.getState().activate('ship-2');
});
afterEach(cleanup);

const plan = () => useWorld.getState().world.ships['ship-2']!.plan;

describe('PlanSection', () => {
  it('lists nodes in time order', () => {
    const s = useWorld.getState();
    s.addNode('ship-2', { t: 5000, dv: { prograde: 0.1, normal: 0, radial: 0 } });
    s.addNode('ship-2', { t: 2000, dv: { prograde: 0.2, normal: 0, radial: 0 } });
    render(<PlanSection shipId="ship-2" />);
    const rows = screen.getAllByRole('button', { name: /^◆ Node/ });
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('200.0 m/s'),
      expect.stringContaining('100.0 m/s'),
    ]);
    fireEvent.click(rows[1]!);
    expect(useView.getState().selected).toEqual({ kind: 'node', shipId: 'ship-2', id: 'node-1' });
  });

  it('adds a node at the next periapsis and selects it', () => {
    render(<PlanSection shipId="ship-2" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add node ▾' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'At next Pe' }));
    expect(plan().length).toBe(1);
    expect(useView.getState().selected).toEqual({ kind: 'node', shipId: 'ship-2', id: 'node-1' });
  });

  it('adds a node at a time', () => {
    render(<PlanSection shipId="ship-2" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add node ▾' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'At time T…' }));
    fireEvent.change(screen.getByPlaceholderText('1h 30m'), { target: { value: '1h 30m' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(plan()[0]!.t).toBeCloseTo(5400, 6);
  });

  it('disables At next Pe and Ap on a circular orbit, with the reason (S5b-20)', () => {
    useView.getState().activate('ship-1');
    render(<PlanSection shipId="ship-1" />); // Kestrel: circular
    fireEvent.click(screen.getByRole('button', { name: 'Add node ▾' }));
    for (const name of ['At next Pe', 'At next Ap']) {
      const item = screen.getByRole('menuitem', { name }) as HTMLButtonElement;
      expect(item.disabled).toBe(true);
      expect(item.title).toBe('Circular orbit');
      expect(item.textContent).toContain('Circular orbit');
    }
    expect(
      (screen.getByRole('menuitem', { name: 'At next AN' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('shows Δv left in red when over budget', () => {
    useWorld.getState().addNode('ship-2', { t: 2000, dv: { prograde: 9, normal: 0, radial: 0 } });
    render(<PlanSection shipId="ship-2" />);
    const left = screen.getByLabelText('Δv left after plan');
    expect(left.textContent).toMatch(/^−\d/);
    expect(left.className).toMatch(/danger/);
  });
});
