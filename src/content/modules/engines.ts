import type { Engine } from '../types';

/** Methalox at O/F 3.6: oxygen and methane mass fractions. */
const METHALOX = { oxygen: 0.783, methane: 0.217 } as const;

/** Values are round estimates for Raptor 3 (S3-23), not a spec. */
export const engines = [
  {
    id: 'raptor-3',
    name: 'Raptor 3',
    category: 'engine',
    kind: 'chemical',
    mass: 1_525,
    volume: 5,
    thrust: 2_450_000,
    isp: 350,
    propellant: METHALOX,
    materials: { 'structural-metals': 1_525 },
  },
  {
    id: 'raptor-3-vac',
    name: 'Raptor 3 Vacuum',
    category: 'engine',
    kind: 'chemical',
    mass: 2_000,
    volume: 10,
    thrust: 2_700_000,
    isp: 380,
    propellant: METHALOX,
    materials: { 'structural-metals': 2_000 },
  },
] as const satisfies readonly Engine[];
