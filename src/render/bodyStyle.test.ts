import { describe, expect, it } from 'vitest';
import { SANDBOX_EPOCH_JD } from '../gen/scenario';
import { generateRealSystem } from '../gen/realSystem';
import { getBody, type Body } from '../sim/body';
import { bodyStyle, MARKER_PX } from './bodyStyle';

const sys = generateRealSystem(SANDBOX_EPOCH_JD);
const HEX = /^#[0-9a-f]{6}$/;

describe('bodyStyle', () => {
  it('gives every real body a colour and a marker size', () => {
    for (const b of Object.values(sys.bodies)) {
      const s = bodyStyle(b);
      expect(s.color).toMatch(HEX);
      expect(s.markerPx).toBe(b.major ? MARKER_PX.major : MARKER_PX.minor);
    }
  });

  it('uses the ID first, then the class', () => {
    expect(bodyStyle(getBody(sys, 'mars')).color).toBe('#c1643e');
    const fictional: Body = { ...getBody(sys, 'mars'), id: 'kerbin' };
    expect(bodyStyle(fictional).color).toMatch(HEX);
    expect(bodyStyle(fictional).color).not.toBe('#c1643e');
  });

  it('gives minor bodies the smaller marker', () => {
    expect(bodyStyle(getBody(sys, 'phobos')).markerPx).toBe(4);
    expect(bodyStyle(getBody(sys, 'earth')).markerPx).toBe(6);
  });
});
