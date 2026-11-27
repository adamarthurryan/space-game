// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../../gen/scenario';
import { useWorld } from '../../store/useWorld';
import { Timeline } from './Timeline';

beforeEach(() => {
  useWorld.setState({ world: createSandboxWorld(), version: 0 });
});

afterEach(cleanup);

const clock = () => useWorld.getState().world.clock;
const warp = () => screen.getByRole('status', { name: 'Warp rate' }).textContent;

describe('Timeline', () => {
  it('shows the epoch and ×1 at start', () => {
    render(<Timeline />);
    expect(screen.getByRole('status', { name: 'Date' }).textContent).toBe('2030-01-01 00:00:00');
    expect(warp()).toBe('×1');
  });

  it('toggles the clock with Play/Pause', async () => {
    const user = userEvent.setup();
    render(<Timeline />);
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(clock().paused).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(clock().paused).toBe(false);
  });

  it('steps the warp, disabling Slower at ×1 and Faster at ×10⁷', async () => {
    const user = userEvent.setup();
    render(<Timeline />);
    const slower = screen.getByRole('button', { name: 'Slower' }) as HTMLButtonElement;
    const faster = screen.getByRole('button', { name: 'Faster' }) as HTMLButtonElement;
    expect(slower.disabled).toBe(true);

    for (let i = 0; i < 6; i++) await user.click(faster);
    expect(warp()).toBe('×10⁶');
    expect(slower.disabled).toBe(false);

    await user.click(faster);
    expect(warp()).toBe('×10⁷');
    expect(faster.disabled).toBe(true);

    await user.click(slower);
    expect(warp()).toBe('×10⁶');
    expect(clock().warpIndex).toBe(6);
  });
});
