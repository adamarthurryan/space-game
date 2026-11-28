// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Popover } from './Popover';

afterEach(cleanup);

function Menu() {
  return (
    <div>
      <p>outside</p>
      <Popover label="Menu ▾">
        {(close) => (
          <div role="menu" aria-label="Things">
            <button type="button" role="menuitem" onClick={close}>
              Item
            </button>
            <button type="button">Stay</button>
          </div>
        )}
      </Popover>
    </div>
  );
}

const button = () => screen.getByRole('button', { name: 'Menu ▾' });
const menu = () => screen.queryByRole('menu');

describe('Popover (S5b-21)', () => {
  it('opens and closes on its button', () => {
    render(<Menu />);
    expect(menu()).toBeNull();
    fireEvent.click(button());
    expect(menu()).not.toBeNull();
    expect(button().getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(button());
    expect(menu()).toBeNull();
  });

  it('closes on a press outside, not on one inside', () => {
    render(<Menu />);
    fireEvent.click(button());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Stay' }));
    expect(menu()).not.toBeNull();
    fireEvent.pointerDown(screen.getByText('outside'));
    expect(menu()).toBeNull();
  });

  it('closes after an item is chosen', () => {
    render(<Menu />);
    fireEvent.click(button());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Item' }));
    expect(menu()).toBeNull();
  });

  it('closes on Esc, and consumes it', () => {
    const seen = vi.fn();
    window.addEventListener('keydown', seen);
    render(<Menu />);
    fireEvent.click(button());
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Item' }), { key: 'Escape' });
    expect(menu()).toBeNull();
    expect(seen).not.toHaveBeenCalled();
    // Closed, Esc goes through.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', seen);
  });

  it('opens above its button when there is more room there', () => {
    render(<Menu />);
    const wrapper = button().parentElement!;
    vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue({
      top: window.innerHeight - 30,
      bottom: window.innerHeight - 6,
      left: 10,
      right: 80,
      width: 70,
      height: 24,
      x: 10,
      y: window.innerHeight - 30,
      toJSON: () => ({}),
    });
    const proto = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ ...new DOMRect(0, 0, 120, 200), toJSON: () => ({}) });
    fireEvent.click(button());
    expect(menu()!.parentElement!.dataset['side']).toBe('above');
    proto.mockRestore();
  });
});
