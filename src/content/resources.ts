/**
 * Resources (docs/architecture.md, "Content files"). The keys of `resources` are the resource
 * IDs, so a misspelt resource anywhere in content is a type error.
 */

export interface Resource {
  name: string;
  kind: 'raw' | 'refined';
}

export const resources = {
  oxygen: { name: 'Oxygen', kind: 'refined' },
  methane: { name: 'Methane', kind: 'refined' },
  'structural-metals': { name: 'Structural metals', kind: 'raw' },
} as const satisfies Record<string, Resource>;

export type ResourceId = keyof typeof resources;
