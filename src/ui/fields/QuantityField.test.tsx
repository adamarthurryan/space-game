// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSpeed } from '../parse';
import { QuantityField } from './QuantityField';

afterEach(cleanup);

const fmt = (kmps: number) => `${(kmps * 1000).toFixed(1)} m/s`;

function Harness({ onCommit }: { onCommit?: (v: number) => string | null }) {
  const [v, setV] = useState(0.1);
  return (
    <>
      <QuantityField
        label="Prograde"
        value={v}
        format={fmt}
        parse={parseSpeed}
        nudge={{ step: 0.001 }}
        onCommit={(x) => {
          const e = onCommit?.(x) ?? null;
          if (!e) setV(x);
          return e;
        }}
      />
      <output aria-label="value">{v}</output>
    </>
  );
}

const input = () => screen.getByLabelText('Prograde') as HTMLInputElement;
const value = () => Number(screen.getByLabelText('value').textContent);

describe('QuantityField', () => {
  it('puts its label on a line above the input (S5b-19)', () => {
    render(<Harness />);
    const label = input().closest('label')!;
    expect([...label.children].map((e) => e.tagName)).toEqual(['SPAN', 'INPUT']);
    expect(label.children[0]!.textContent).toBe('Prograde');
  });

  it('commits a typed value with units on Enter', () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: '3.1 km/s' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(value()).toBe(3.1);
    expect(input().value).toBe('3100.0 m/s');
  });

  it('shows an error and keeps the value for unreadable text', () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: 'abc' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toContain('abc');
    expect(value()).toBe(0.1);
  });

  it('shows the commit’s error', () => {
    render(<Harness onCommit={() => 'Too much'} />);
    fireEvent.change(input(), { target: { value: '5' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toBe('Too much');
  });

  it('reverts on Escape', () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: '999' } });
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(input().value).toBe('100.0 m/s');
    expect(value()).toBe(0.1);
  });

  it('nudges with the wheel when focused: 1 m/s, Shift 0.1, Alt 10', () => {
    render(<Harness />);
    const el = input();
    fireEvent.wheel(el, { deltaY: -1 });
    expect(value()).toBe(0.1); // not focused
    el.focus();
    fireEvent.wheel(el, { deltaY: -1 });
    expect(value()).toBeCloseTo(0.101, 12);
    fireEvent.wheel(el, { deltaY: 1, shiftKey: true });
    expect(value()).toBeCloseTo(0.1009, 12);
    fireEvent.wheel(el, { deltaY: -1, altKey: true });
    expect(value()).toBeCloseTo(0.1109, 12);
  });

  it('commits on blur', () => {
    const spy = vi.fn(() => null);
    render(<Harness onCommit={spy} />);
    fireEvent.change(input(), { target: { value: '250' } });
    fireEvent.blur(input());
    expect(spy).toHaveBeenCalledWith(0.25);
  });
});
