import type { Backbone } from '../types';

/** Values are round estimates for Starship V3 (S3-23), not a spec. */
export const backbones = [
  {
    id: 'starship-v3-structure',
    name: 'Starship V3 structure',
    category: 'backbone',
    mass: 72_000,
    volume: 2_600,
    maxMass: 1_900_000,
    maxVolume: 2_000,
    materials: { 'structural-metals': 72_000 },
  },
] as const satisfies readonly Backbone[];
