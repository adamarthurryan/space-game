# Guide to the `content/` layer

`src/content/` is the game's data: module types (backbones, engines, tanks), resources and preset ship designs, as typed TypeScript. It is not a layer in the stack so much as a shared library beside it. **Any layer may import it, and it imports nothing outside itself.** Like the layers below `store/`, it may not use React, three.js or any nondeterminism.

This guide describes the code as it stands after milestone 1, sprint 5b. The design is in [architecture.md](../architecture.md), "Content files"; the code cites decisions as `S<sprint>-<n>` (S3-3 is decision 3 of `planning/sprint-3.md`).

## 1. Architecture

```
src/content/
  types.ts           Module (Backbone | Engine | Tank), ModuleInstance, ShipDesign
  resources.ts       resources and ResourceId
  modules/
    backbones.ts     one file per module type, each an array checked with `satisfies`
    engines.ts
    tanks.ts
  designs.ts         preset ship designs
  registry.ts        Registry (lookups), createRegistry, the game's `registry`, validateContent
```

The content is Starship-shaped for now (S3-23): one backbone (`starship-v3-structure`), two engines (`raptor-3` and `raptor-3-vac`, methalox), two tanks (LOX and CH₄) and one design, `starship` (three of each Raptor, both tanks, 100 t of payload). The values are round estimates, not a specification. There are three resources: `oxygen`, `methane` and `structural-metals`.

### Who reads it

- `sim/ship.ts`: `createShip` copies a design and fills its tanks; `shipStats` looks modules up by ID to compute mass, thrust, Isp and Δv.
- `sim/maneuver.ts`: `planBudget` and `burnPropellant`, through `shipStats`.
- `game/actions.ts`: `spawnShip` looks up the design.
- `gen/scenario.ts`: the sandbox ships' design.
- `ui/`: design names, engine names and the spawn form's design list.

## 2. Common patterns

- **Data as typed arrays.** Each module file exports `[...] as const satisfies readonly Backbone[]` (or `Engine[]`, `Tank[]`). `as const` keeps the literal types, and `satisfies` checks every field without widening. There is no parser and no runtime schema library.
- **IDs are types where it pays.** `ResourceId` is `keyof typeof resources`, so a misspelt resource anywhere in content (an engine's `propellant`, a tank's `resource`, a module's `materials`) fails the type check. `content.test.ts` has a `@ts-expect-error` case that proves it, so `npm run build` fails if the check ever stops working. Module and design IDs are plain strings, checked at test time.
- **A discriminated union.** `Module` is `Backbone | Engine | Tank`, discriminated by `category`. `Engine.kind` (`'chemical'` so far) is the engine technology, separate from the category. Code switches on `category`, as `shipStats` and `validateContent` do.
- **Fixed units inside content (S3-3):** mass in kg, volume in m³, thrust in N, Isp in s. `sim/` converts to its own units where needed (thrust to km/s² of acceleration, for example).
- **Ships copy, saves reference.** A ship copies its design's module list when it is created (S3-4), so changing a design never changes existing ships. A ship stores module IDs, not copies of the module definitions, so a balance change to a module applies to existing ships.
- **Injectable registry.** Code that reads content takes a `Registry` parameter that defaults to the game's `registry`. Tests pass `createRegistry(...)` over a small synthetic set.

## 3. Key files and core functions

### `types.ts`

- `ModuleBase`: `id` (unique across all module files), `name`, `mass` (dry, kg), `volume` (m³), `materials` (build cost by resource, kg).
- `Backbone`: adds `maxMass` (the most the ship may mass at full load) and `maxVolume` (the module volume it carries). A backbone's own volume doesn't count against its limit.
- `Engine`: `kind`, `thrust` (N), `isp` (s), and `propellant`, the mass fraction of each resource burned, summing to 1.
- `Tank`: `resource` and `capacity` (kg).
- `ModuleInstance { moduleId, count }` and `ShipDesign { id, name, backboneId, modules, payload }`.

### `registry.ts`

- `Registry`: `modules`, `backbones`, `engines`, `tanks`, `designs`, `byId(id)` and `design(id)`. Lookups return `undefined` for an unknown ID; callers decide whether that is an error.
- `createRegistry(modules, designs)` builds one over any content set.
- `registry` is the game's content: every module file plus `designs.ts`.
- **`validateContent(modules, designs)`** returns the problems that types can't catch, or `[]`:
  - duplicate module or design IDs;
  - non-positive mass, volume, limits, thrust, Isp or capacity;
  - engine propellant fractions that are empty, non-positive, or don't sum to 1;
  - designs naming a missing backbone or module, a non-backbone as the backbone, or a backbone as a module; non-integer counts; negative payload;
  - a design over its backbone's mass at full load or over its volume;
  - an engine with no tank for one of its propellants.

### `resources.ts`

`resources` maps each ID to `{ name, kind: 'raw' | 'refined' }`.

### `designs.ts`

The preset designs. They are content until the ship designer (milestone 2) adds a design library to the world.

## 4. Testing

`content.test.ts` checks that the real content and a synthetic set both pass `validateContent`, that each kind of breakage is caught with exactly one error, that a misspelt resource is a type error, and that the registry finds every module and design. `sim/ship.test.ts` checks the Starship's stats against S3-23's numbers.

## 5. Recipes

**A new module of an existing type:** add an entry to the right file in `modules/`. `npm test` runs `validateContent` over it. If a design should use it, add it to the design's `modules`.

**A new module type** (for example a reactor, in a later milestone): add an interface with a new `category` to `types.ts` and to the `Module` union, a file in `modules/` with its array, a filtered list in `Registry` and `createRegistry`, and checks in `validateContent`. Then follow the compiler through every `switch (m.category)`, notably `shipStats` in `sim/ship.ts`.

**A new resource:** add it to `resources`. Its ID becomes valid in every content file at once.

**A new design:** add it to `designs.ts`. The spawn form lists it automatically.
