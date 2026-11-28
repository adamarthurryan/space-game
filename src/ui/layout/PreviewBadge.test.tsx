// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useView } from '../../store/useView';
import { resetStores } from '../panels/testStores';
import { PreviewBadge } from './PreviewBadge';

beforeEach(resetStores);
afterEach(cleanup);

describe('PreviewBadge', () => {
  it('is hidden without a preview', () => {
    render(<PreviewBadge />);
    expect(screen.queryByRole('status', { name: 'Preview' })).toBeNull();
  });

  it("shows the preview's date and time from now; Now ends it", async () => {
    const user = userEvent.setup();
    render(<PreviewBadge />);
    act(() => useView.getState().startPreview(86_400 * 3 + 3600 * 4, true));
    const badge = screen.getByRole('status', { name: 'Preview' });
    expect(badge.textContent).toContain('PREVIEW');
    expect(badge.textContent).toContain('2030-01-04 04:00:00');
    expect(badge.textContent).toContain('T+3 d 4 h');
    await user.click(screen.getByRole('button', { name: 'Now (Esc)' }));
    expect(useView.getState().preview).toBeNull();
  });
});
