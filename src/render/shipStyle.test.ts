import { describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../gen/scenario';
import { bodyStyle } from './bodyStyle';
import { hexToRgb, highlightRgb, SHIP_PALETTE, shipColor } from './shipStyle';

/** Distance between two colours in 0–255 sRGB. */
const dist = (a: string, b: string) => {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return 255 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
const MIN_DISTANCE = 60;

describe('ship style', () => {
  it('has 8 distinct colours, cycled by seq', () => {
    expect(new Set(SHIP_PALETTE).size).toBe(8);
    for (let i = 0; i < 8; i++) {
      for (let j = i + 1; j < 8; j++) {
        expect(dist(SHIP_PALETTE[i]!, SHIP_PALETTE[j]!)).toBeGreaterThan(MIN_DISTANCE);
      }
    }
    expect(shipColor(1)).toBe(shipColor(9));
    expect(shipColor(1)).not.toBe(shipColor(2));
  });

  it('keeps every colour away from every body colour', () => {
    const { system } = createSandboxWorld();
    const bodies = new Set(Object.values(system.bodies).map((b) => bodyStyle(b).color));
    for (const c of SHIP_PALETTE) {
      for (const b of bodies) expect(dist(c, b), `${c} vs ${b}`).toBeGreaterThan(MIN_DISTANCE);
    }
  });

  it('lightens the highlight colour', () => {
    for (const c of SHIP_PALETTE) {
      const rgb = hexToRgb(c);
      const h = highlightRgb(rgb);
      for (let k = 0; k < 3; k++) expect(h[k]).toBeGreaterThanOrEqual(rgb[k]!);
      expect(h[0] + h[1] + h[2]).toBeGreaterThan(rgb[0] + rgb[1] + rgb[2]);
    }
  });
});
