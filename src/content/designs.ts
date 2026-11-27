import type { ShipDesign } from './types';

/**
 * Preset ship designs (S3-4). They are content until the designer (milestone 2) adds a design
 * library to the world. A ship copies its design when it is created.
 */
export const designs = [
  {
    id: 'starship',
    name: 'Starship',
    backboneId: 'starship-v3-structure',
    modules: [
      { moduleId: 'raptor-3', count: 3 },
      { moduleId: 'raptor-3-vac', count: 3 },
      { moduleId: 'starship-lox-tank', count: 1 },
      { moduleId: 'starship-ch4-tank', count: 1 },
    ],
    payload: 100_000,
  },
] as const satisfies readonly ShipDesign[];
