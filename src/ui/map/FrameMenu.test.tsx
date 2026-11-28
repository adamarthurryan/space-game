// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useView } from '../../store/useView';
import { resetStores } from '../panels/testStores';
import { FrameMenu } from './FrameMenu';

beforeEach(resetStores);
afterEach(cleanup);

const items = () => screen.getAllByRole('menuitemradio').map((e) => e.textContent);

describe('FrameMenu (S5b-4)', () => {
  it('shows the frame, and lists the focus body, its parents and the selected body', () => {
    render(<FrameMenu />);
    act(() => useView.getState().select({ kind: 'body', id: 'moon' }));
    fireEvent.click(screen.getByRole('button', { name: 'Frame: Moon ▾' }));
    expect(items()).toEqual(['Earth', 'Sun', 'Moon']);
  });

  it('sets a fixed frame, and closes', () => {
    render(<FrameMenu />);
    act(() => useView.getState().activate('ship-3'));
    fireEvent.click(screen.getByRole('button', { name: 'Frame: Moon (Heron) ▾' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Sun' }));
    expect(useView.getState().frame).toEqual({ kind: 'body', id: 'sun' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Frame: Sun ▾' })).toBeTruthy();
  });
});
