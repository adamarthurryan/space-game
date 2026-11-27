import { describe, expect, it } from 'vitest';
import { STAGES, type StageName } from './stages';

describe('STAGES', () => {
  it('orders the stages clock < bodies < ships < camera < projection < layers < labels', () => {
    const at = (s: StageName) => STAGES.indexOf(s);
    const expected: StageName[] = [
      'clock',
      'bodies',
      'ships',
      'camera',
      'projection',
      'layers',
      'labels',
    ];
    for (let i = 1; i < expected.length; i++) {
      expect(at(expected[i - 1]!)).toBeLessThan(at(expected[i]!));
    }
    expect(STAGES).toHaveLength(expected.length);
  });
});
