// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SMOKE_TLI } from '../../gen/lunarMission';
import { WARP_TO_NODE_LEAD } from '../../sim/clock';
import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { resetStores } from '../panels/testStores';
import { setUpLunar } from './testLunar';
import { shownWarpStep } from './warpTo';
import { WarpToButtons } from './WarpToButtons';

beforeEach(resetStores);
afterEach(cleanup);

const clock = () => useWorld.getState().world.clock;
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('WarpToButtons', () => {
  it('warps to the next event of the active ship, and shows the ⏩ readout', async () => {
    const user = userEvent.setup();
    setUpLunar();
    render(<WarpToButtons />);
    await user.click(button('Warp to next event'));
    expect(clock().warpTo).toMatchObject({ t: SMOKE_TLI.dt - WARP_TO_NODE_LEAD, label: 'Node' });
    expect(screen.getByRole('status', { name: 'Warping to' }).textContent).toMatch(/^⏩ Node · /);
  });

  it('warps to the selected node, or the next one; disabled with none', async () => {
    const user = userEvent.setup();
    render(<WarpToButtons />);
    expect(button('Warp to node').disabled).toBe(true);
    cleanup();
    const { shipId, nodeId } = setUpLunar();
    act(() => useView.getState().select({ kind: 'node', shipId, id: nodeId }));
    render(<WarpToButtons />);
    await user.click(button('Warp to node'));
    expect(clock().warpTo?.kind).toBe('node');
  });

  it('shows a refusal as the button title', async () => {
    const user = userEvent.setup();
    const s = useWorld.getState();
    for (const id of Object.keys(s.world.ships)) delete s.world.ships[id];
    render(<WarpToButtons />);
    await user.click(button('Warp to next event'));
    expect(button('Warp to next event').title).toBe('No upcoming events');
  });

  it('shows the largest warp step at or below the eased rate', () => {
    expect(shownWarpStep(5e5)).toBe(1e5);
    expect(shownWarpStep(1e7)).toBe(1e7);
    expect(shownWarpStep(100)).toBe(100);
  });
});
