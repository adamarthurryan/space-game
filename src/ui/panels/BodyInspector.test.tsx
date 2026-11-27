// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useView } from '../../store/useView';
import { BodyInspector } from './BodyInspector';

const initialView = useView.getState();
beforeEach(() => useView.setState(initialView, true));
afterEach(cleanup);

const select = (id: string) => act(() => useView.getState().select({ kind: 'body', id }));

describe('BodyInspector', () => {
  it('shows "Nothing selected" with no selection', () => {
    render(<BodyInspector />);
    expect(screen.getByText('Nothing selected')).toBeTruthy();
  });

  it('shows Jupiter: name, class, physical data, orbit and SOI', () => {
    render(<BodyInspector />);
    select('jupiter');
    expect(screen.getByRole('heading', { name: 'Jupiter' })).toBeTruthy();
    expect(screen.getByText('Planet')).toBeTruthy();
    for (const h of ['Physical', 'Orbit', 'Sphere of influence']) {
      expect(screen.getByRole('heading', { name: h })).toBeTruthy();
    }
    expect(screen.getByText('Mass').nextElementSibling?.textContent).toBe('1.898 × 10²⁷ kg');
    expect(screen.getByText('Parent').nextElementSibling?.textContent).toBe('Sun');
    expect(screen.getByText('SOI radius').nextElementSibling?.textContent).toMatch(/AU$/);
  });

  it("shows a moon's inclination to its parent's equator", () => {
    render(<BodyInspector />);
    select('io');
    expect(screen.getByText("Inclination (Jupiter's equator)")).toBeTruthy();
    expect(screen.getByText('Ω (Laplace plane)')).toBeTruthy();
  });

  it('shows no orbit section for the Sun', () => {
    render(<BodyInspector />);
    select('sun');
    expect(screen.getByRole('heading', { name: 'Sun' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Orbit' })).toBeNull();
    expect(screen.getByText('SOI radius').nextElementSibling?.textContent).toBe('—');
  });

  it('marks a minor body', () => {
    render(<BodyInspector />);
    select('phobos');
    expect(screen.getByText('Moon · minor')).toBeTruthy();
    expect(screen.getByText('SOI radius').nextElementSibling?.textContent).toBe(
      'none (minor body)',
    );
  });
});
