import { describe, expect, it } from 'vitest';
import { designs } from './designs';
import { backbones } from './modules/backbones';
import { engines } from './modules/engines';
import { tanks } from './modules/tanks';
import { registry, validateContent } from './registry';
import type { Engine, Module, ShipDesign } from './types';

const modules: Module[] = [...backbones, ...engines, ...tanks];
const designList: ShipDesign[] = [...designs];

/** A small synthetic content set, so the broken copies don't depend on the real numbers. */
function testContent(): { modules: Module[]; designs: ShipDesign[] } {
  return {
    modules: [
      {
        id: 'frame',
        name: 'Frame',
        category: 'backbone',
        mass: 1000,
        volume: 50,
        maxMass: 20_000,
        maxVolume: 40,
        materials: {},
      },
      {
        id: 'motor',
        name: 'Motor',
        category: 'engine',
        kind: 'chemical',
        mass: 200,
        volume: 2,
        thrust: 50_000,
        isp: 320,
        propellant: { oxygen: 0.8, methane: 0.2 },
        materials: {},
      },
      {
        id: 'ox',
        name: 'Ox tank',
        category: 'tank',
        resource: 'oxygen',
        mass: 300,
        volume: 10,
        capacity: 8000,
        materials: {},
      },
      {
        id: 'fuel',
        name: 'Fuel tank',
        category: 'tank',
        resource: 'methane',
        mass: 100,
        volume: 5,
        capacity: 2000,
        materials: {},
      },
    ],
    designs: [
      {
        id: 'probe',
        name: 'Probe',
        backboneId: 'frame',
        modules: [
          { moduleId: 'motor', count: 1 },
          { moduleId: 'ox', count: 1 },
          { moduleId: 'fuel', count: 1 },
        ],
        payload: 500,
      },
    ],
  };
}

describe('validateContent', () => {
  it('accepts the real content', () => {
    expect(validateContent(modules, designList)).toEqual([]);
  });

  it('accepts the synthetic content', () => {
    const c = testContent();
    expect(validateContent(c.modules, c.designs)).toEqual([]);
  });

  const broken: [string, (c: ReturnType<typeof testContent>) => void, RegExp][] = [
    [
      'a duplicate module ID',
      (c) => c.modules.push({ ...c.modules[1]! }),
      /duplicate module ID motor/,
    ],
    [
      'a design naming a missing module',
      (c) => (c.designs[0] = { ...c.designs[0]!, modules: [{ moduleId: 'warp-core', count: 1 }] }),
      /module warp-core does not exist/,
    ],
    [
      'a design naming an engine as its backbone',
      (c) => (c.designs[0] = { ...c.designs[0]!, backboneId: 'motor' }),
      /motor is not a backbone/,
    ],
    [
      'propellant fractions summing to 0.9',
      (c) => {
        const m = c.modules[1] as Engine;
        c.modules[1] = { ...m, propellant: { oxygen: 0.7, methane: 0.2 } };
      },
      /propellant fractions sum to 0\.9/,
    ],
    [
      'a design over its backbone mass at full load',
      (c) => (c.designs[0] = { ...c.designs[0]!, payload: 10_000 }),
      /full load is over its backbone/,
    ],
    [
      'an engine without a tank for one of its propellants',
      (c) =>
        (c.designs[0] = {
          ...c.designs[0]!,
          modules: c.designs[0]!.modules.filter((m) => m.moduleId !== 'fuel'),
        }),
      /no tank for propellant methane/,
    ],
  ];

  for (const [what, breakIt, error] of broken) {
    it(`rejects ${what}`, () => {
      const c = testContent();
      breakIt(c);
      const errors = validateContent(c.modules, c.designs);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(error);
    });
  }
});

describe('content types', () => {
  it('make a misspelt resource ID a type error', () => {
    const engine = {
      id: 'typo',
      name: 'Typo',
      category: 'engine',
      kind: 'chemical',
      mass: 1,
      volume: 1,
      thrust: 1,
      isp: 1,
      // @ts-expect-error 'methan' is not a ResourceId. `npm run build` fails if this stops erroring.
      propellant: { methan: 1 },
      materials: {},
    } satisfies Engine;
    expect(engine.id).toBe('typo');
  });
});

describe('registry', () => {
  it('finds every module by ID and lists each category', () => {
    for (const m of modules) expect(registry.byId(m.id)).toBe(m);
    expect(registry.byId('no-such-module')).toBeUndefined();
    expect(registry.backbones.map((m) => m.id)).toEqual(backbones.map((m) => m.id));
    expect(registry.engines.map((m) => m.id)).toEqual(engines.map((m) => m.id));
    expect(registry.tanks.map((m) => m.id)).toEqual(tanks.map((m) => m.id));
    expect(registry.modules).toHaveLength(modules.length);
  });

  it('finds every design by ID', () => {
    for (const d of designList) expect(registry.design(d.id)).toBe(d);
    expect(registry.design('starship')?.name).toBe('Starship');
  });
});
