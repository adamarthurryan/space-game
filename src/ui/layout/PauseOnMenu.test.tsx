// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useWorld } from '../../store/useWorld';
import { resetStores } from '../panels/testStores';
import { PauseOnMenu } from './PauseOnMenu';

beforeEach(resetStores);
afterEach(cleanup);

const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
const pauseOn = () => useWorld.getState().world.clock.pauseOn;

describe('PauseOnMenu', () => {
  it('pauses on node execution only by default', () => {
    render(<PauseOnMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause on ▾' }));
    expect(box('Node execution').checked).toBe(true);
    expect(box('SOI change').checked).toBe(false);
    expect(box('Impact').checked).toBe(false);
    expect(box('All events').checked).toBe(false);
    expect(box('All events').indeterminate).toBe(true);
  });

  it('ticks one type, and all of them', () => {
    render(<PauseOnMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause on ▾' }));
    fireEvent.click(box('Impact'));
    expect(pauseOn().impact).toBe(true);
    fireEvent.click(box('All events'));
    expect(pauseOn()).toEqual({ node: true, 'soi-change': true, impact: true });
    expect(box('All events').checked).toBe(true);
    fireEvent.click(box('All events'));
    expect(pauseOn()).toEqual({ node: false, 'soi-change': false, impact: false });
  });
});
