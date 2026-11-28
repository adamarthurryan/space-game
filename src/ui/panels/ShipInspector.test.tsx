// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useView } from '../../store/useView';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { presetOrbit } from '../../gen/sandboxShips';
import { useWorld } from '../../store/useWorld';
import { ShipInspector } from './ShipInspector';
import { resetStores } from './testStores';

beforeEach(resetStores);
afterEach(cleanup);

const row = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

function spawn(preset: Parameters<typeof presetOrbit>[1]): string {
  const s = useWorld.getState();
  const r = s.spawnShip({ designId: 'starship', orbit: presetOrbit(s.world.system, preset, 0) });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('ShipInspector', () => {
  it("shows Kestrel's design, Δv, SOI and orbit", () => {
    render(<ShipInspector id="ship-1" />);
    expect(screen.getByRole('heading', { name: 'Kestrel' })).toBeTruthy();
    expect(screen.getByText(/Starship · coasting/)).toBeTruthy();
    expect(row('Δv')).toMatch(/^7\.\d\d km\/s$/);
    expect(row('SOI')).toBe('Earth');
    expect(row('Periapsis alt.')).toBe('400 km');
    expect(row("Inclination (Earth's equator)")).toBe('51.60°');
    expect(screen.getByText('None within the horizon')).toBeTruthy();
  });

  it('lists a Sun SOI event for an escape ship', () => {
    const id = spawn('earth-escape');
    render(<ShipInspector id={id} />);
    expect(row('Apoapsis alt.')).toBe('escape');
    expect(screen.getByText(/^Sun SOI in \d+ d \d+ h$/)).toBeTruthy();
  });

  it('shows an impact', () => {
    const id = spawn('suborbital');
    render(<ShipInspector id={id} />);
    expect(screen.getByText(/^Impact \(Earth\) in \d+ min$/)).toBeTruthy();
    act(() => {
      const s = useWorld.getState();
      const ship = s.world.ships[id]!;
      ship.status = 'destroyed';
      ship.destroyedAt = { t: 600, bodyId: 'earth' };
      s.bumpVersion();
    });
    expect(screen.getByText(/destroyed: impacted Earth/)).toBeTruthy();
    expect(screen.queryByText('Upcoming events')).toBeNull();
  });
});

describe('ShipInspector: the full inspector (S6-9)', () => {
  it('has its sections in order', () => {
    render(<ShipInspector id="ship-1" />);
    const sections = [...document.querySelectorAll('h4, label')].map((e) => e.textContent);
    expect(sections).toEqual([
      'Fleet',
      'Plan',
      'Modules',
      'Mass and propellant',
      'Engines',
      'Orbit',
      'Upcoming events',
    ]);
    expect(screen.getByRole('meter', { name: 'Mass' })).toBeTruthy();
    expect(screen.getByRole('meter', { name: 'Volume' })).toBeTruthy();
    expect(screen.getAllByText(/× .*\(chemical\)/)).toHaveLength(2);
  });

  it('moves the ship to a fleet with the Fleet select', async () => {
    const user = userEvent.setup();
    act(() => void useWorld.getState().createFleet('Survey'));
    render(<ShipInspector id="ship-1" />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Fleet' }), 'Survey');
    expect(useWorld.getState().world.ships['ship-1']!.fleetId).toBe('fleet-1');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Fleet' }), 'Unassigned');
    expect(useWorld.getState().world.ships['ship-1']!.fleetId).toBeNull();
  });

  it('flies the ship from its header', async () => {
    const user = userEvent.setup();
    render(<ShipInspector id="ship-2" />);
    await user.click(screen.getByRole('button', { name: 'Fly (A)' }));
    expect(useView.getState().activeShipId).toBe('ship-2');
    expect(screen.getByRole('button', { name: '★ Tern' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});
