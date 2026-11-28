import { describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../../gen/scenario';
import { frameOptions } from './frameOptions';

describe('frameOptions (S5b-4)', () => {
  const world = createSandboxWorld();

  it("lists a focused ship's parent and its parents, then the selected body", () => {
    // Heron (ship-3) orbits the Moon.
    const got = frameOptions(
      world,
      { kind: 'ship', id: 'ship-3' },
      { kind: 'body', id: 'mars' },
      0,
    );
    expect(got).toEqual(['moon', 'earth', 'sun', 'mars']);
  });

  it("doesn't repeat a body already listed; a selected ship or node gives its parent", () => {
    const earth = { kind: 'body', id: 'earth' } as const;
    expect(frameOptions(world, earth, { kind: 'body', id: 'sun' }, 0)).toEqual(['earth', 'sun']);
    expect(frameOptions(world, earth, { kind: 'ship', id: 'ship-3' }, 0)).toEqual([
      'earth',
      'sun',
      'moon',
    ]);
    expect(frameOptions(world, earth, { kind: 'node', shipId: 'ship-1', id: 'node-1' }, 0)).toEqual(
      ['earth', 'sun'],
    );
    expect(frameOptions(world, earth, null, 0)).toEqual(['earth', 'sun']);
  });
});
