import type { Tank } from '../types';

/** Values are round estimates for Starship V3's main tanks (S3-23), not a spec. */
export const tanks = [
  {
    id: 'starship-lox-tank',
    name: 'Starship LOX tank',
    category: 'tank',
    resource: 'oxygen',
    mass: 12_000,
    volume: 1_100,
    capacity: 1_253_000,
    materials: { 'structural-metals': 12_000 },
  },
  {
    id: 'starship-ch4-tank',
    name: 'Starship CH₄ tank',
    category: 'tank',
    resource: 'methane',
    mass: 6_000,
    volume: 830,
    capacity: 347_000,
    materials: { 'structural-metals': 6_000 },
  },
] as const satisfies readonly Tank[];
