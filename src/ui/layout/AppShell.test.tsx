// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useView } from '../../store/useView';
import { AppShell } from './AppShell';

// jsdom has no WebGL, so the map canvas is replaced with a stub.
vi.mock('../../render/Scene', () => ({
  Scene: () => <div data-testid="scene-stub" />,
}));

const initialView = useView.getState();

beforeEach(() => {
  useView.setState(initialView, true);
});

afterEach(cleanup);

describe('AppShell', () => {
  it('renders the five landmarks', () => {
    render(<AppShell />);
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Sidebar' })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });

  it('puts the scene in the main landmark', () => {
    render(<AppShell />);
    expect(within(screen.getByRole('main')).getByTestId('scene-stub')).toBeTruthy();
  });

  it('toggles the left sidebar', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    const toggle = screen.getByRole('button', { name: 'Sidebar' });

    await user.click(toggle);
    expect(screen.queryByRole('navigation', { name: 'Sidebar' })).toBeNull();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    await user.click(toggle);
    expect(screen.getByRole('navigation', { name: 'Sidebar' })).toBeTruthy();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('toggles the inspector', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    const toggle = screen.getByRole('button', { name: 'Inspector' });

    await user.click(toggle);
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();

    await user.click(toggle);
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeTruthy();
  });

  it('selects the Fleets tab and shows the ship list', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    const fleets = screen.getByRole('tab', { name: 'Fleets' });
    expect(fleets.getAttribute('aria-selected')).toBe('false');

    await user.click(fleets);
    expect(fleets.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'System' }).getAttribute('aria-selected')).toBe('false');
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).queryByText('No ships yet.')).toBeNull();
    expect(within(panel).getByRole('option', { name: 'Kestrel' })).toBeTruthy();
  });

  it('switches the inspector between a body and a ship', () => {
    render(<AppShell />);
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    act(() => useView.getState().select({ kind: 'body', id: 'mars' }));
    expect(within(inspector).getByRole('heading', { name: 'Mars' })).toBeTruthy();
    act(() => useView.getState().select({ kind: 'ship', id: 'ship-2' }));
    expect(within(inspector).getByRole('heading', { name: 'Tern' })).toBeTruthy();
  });

  it('shows the body tree in the System tab', () => {
    render(<AppShell />);
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByRole('tree', { name: 'System' })).toBeTruthy();
    expect(within(panel).getByRole('treeitem', { name: 'Sun' })).toBeTruthy();
    expect(within(panel).queryByText('No bodies yet.')).toBeNull();
  });

  it('moves between tabs with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    await user.click(screen.getByRole('tab', { name: 'System' }));

    await user.keyboard('{ArrowLeft}');
    const routes = screen.getByRole('tab', { name: 'Routes' });
    expect(routes.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(routes);

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'System' }).getAttribute('aria-selected')).toBe('true');
  });
});
