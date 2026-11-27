// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { SpawnShipForm } from './SpawnShipForm';
import { resetStores } from './testStores';

beforeEach(() => {
  resetStores();
  useView.setState({ spawnFormOpen: true });
});
afterEach(cleanup);

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe('SpawnShipForm', () => {
  it('spawns with the defaults, selects the new ship and closes', async () => {
    const user = userEvent.setup();
    render(<SpawnShipForm />);
    await user.click(screen.getByRole('button', { name: 'Spawn' }));
    const world = useWorld.getState().world;
    expect(world.ships['ship-4']?.name).toBe('Starship 4');
    expect(world.ships['ship-4']?.orbit.parentId).toBe('earth');
    expect(useView.getState().selected).toEqual({ kind: 'ship', id: 'ship-4' });
    expect(useView.getState().spawnFormOpen).toBe(false);
  });

  it('fills e > 1 from the Earth escape preset', async () => {
    const user = userEvent.setup();
    render(<SpawnShipForm />);
    await user.selectOptions(screen.getByLabelText('Preset'), 'earth-escape');
    expect(Number(field('Eccentricity').value)).toBeGreaterThan(1);
    expect(field('Periapsis alt. (km)').value).toBe('300');
    await user.type(field('Name'), 'Plover');
    await user.click(screen.getByRole('button', { name: 'Spawn' }));
    const ship = Object.values(useWorld.getState().world.ships).find((s) => s.name === 'Plover');
    expect(useWorld.getState().world.derived.trajectories[ship!.id]!.segments[0]!.endEvent).toBe(
      'soi-exit',
    );
  });

  it("shows the action's error for a periapsis outside the SOI, and adds nothing", async () => {
    const user = userEvent.setup();
    render(<SpawnShipForm />);
    await user.clear(field('Periapsis alt. (km)'));
    await user.type(field('Periapsis alt. (km)'), '2000000');
    await user.click(screen.getByRole('button', { name: 'Spawn' }));
    expect(screen.getByRole('alert').textContent).toMatch(/outside Earth's sphere of influence/);
    expect(Object.keys(useWorld.getState().world.ships)).toHaveLength(3);
    expect(useView.getState().spawnFormOpen).toBe(true);
  });

  it('lists only major bodies as parents', () => {
    render(<SpawnShipForm />);
    const names = within(screen.getByLabelText('Parent'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(names).toContain('Earth');
    expect(names).toContain('Moon');
    expect(names).not.toContain('Phobos');
    expect(names).not.toContain('Deimos');
  });
});
