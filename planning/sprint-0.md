# Sprint 0 — Foundations: detailed plan

This expands [sprint 0](milestone-1-sprints.md#sprint-0--foundations) of milestone 1. Module paths follow the source layout in [architecture.md](../docs/architecture.md#layered-structure).

**Goal:** an empty but correctly structured project. The toolchain works, the layer rule is enforced by lint, the `math/` layer is complete and tested, and the app shell shows the screen layout with an empty 3D canvas.

**Out of scope:** anything in `orbital/` or below-`store/` beyond `math/`; camera controls (sprint 2); the clock and event queue (sprint 3, which builds on `pqueue.ts`); unit switching and value formatting (sprint 10); the look-and-feel pass (sprint 10).

## Decisions made for this sprint

| # | Topic | Decision |
|---|-------|----------|
| S0-1 | Layer order | **Strict linear order.** A layer imports only the layers listed below it: `ui > render > store > game > gen > economy > knowledge > planning > sim > orbital > math`. So `gen` can't import `game`, `sim` can't import `planning`, `knowledge` can't import `economy`, and `render` can't import `ui`. `content/` may be imported by any layer, and itself imports no layer. `src/main.tsx` (the entry point) may import anything. |
| S0-2 | Vec3 | Plain `{ x, y, z }` objects of float64 `number`s. Pure functions that return new objects, plus a few `…Into(out, …)` variants for hot loops. |
| S0-3 | Styling | CSS Modules (built into Vite), with theme values as CSS custom properties in one global `theme.css`. |
| S0-4 | Determinism lint | Below `store/` (and in `content/`), `Math.random`, `Date.now`, `performance.now`, `new Date()`, `Date()` and `crypto.getRandomValues` are lint errors. |
| S0-5 | Formatting | Prettier, with `format` and `format:check` scripts. |
| S0-6 | Plain-data state for `rng` and `pqueue` | Both keep their state in plain, JSON-serialisable objects, operated on by free functions (the same pattern as the world, see [architecture.md](../docs/architecture.md#technical-constraints)). So an RNG stream or an event queue can live inside the world and survive a save. |
| S0-7 | `fork` independence | `fork(rng, label)` depends only on the parent's identity (its seed path) and the label, not on how many numbers the parent has drawn. Adding draws to one subsystem never changes another subsystem's stream. |
| S0-8 | Imports | Relative imports only, no path alias. One less piece of config for Vite, TypeScript, Vitest and ESLint to agree on. |
| S0-9 | Unit types | No branded unit types. Units are fixed by convention (`km`, `s`, `kg`, `km/s`, rad) and documented in JSDoc. |
| S0-10 | TypeScript strictness | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` and `noPropertyAccessFromIndexSignature` on from the start (see [TypeScript](#typescript)). |
| S0-11 | Event queue on load | The sim event queue is **not saved**. It is rebuilt from the world on load (plans, trajectories, alarms, scheduled dockings). `pqueue` stays plain data anyway, in case this changes. Sprint 3 must provide the rebuild function, and the sprint 10 save test checks that a rebuilt queue gives the same event times. |

These should be copied into [decisions.md](../docs/decisions.md) at the end of the sprint.

## Files to create

```
package.json                 scripts, dependencies, "engines"
package-lock.json
.nvmrc                       current Node LTS
.gitignore                   node_modules, dist, coverage
.prettierrc.json
.prettierignore              dist, coverage, package-lock.json
index.html                   Vite entry, <div id="root">
vite.config.ts               React plugin + Vitest config
tsconfig.json                project references
tsconfig.app.json            src/, strict
tsconfig.node.json           vite.config.ts, eslint.config.js
eslint.config.js             flat config: TS, React hooks, layers, determinism

src/
  main.tsx                   mounts <AppShell/>; imports ui/theme.css
  vite-env.d.ts
  math/
    vec3.ts       vec3.test.ts
    units.ts      units.test.ts
    roots.ts      roots.test.ts
    rng.ts        rng.test.ts
    pqueue.ts     pqueue.test.ts
  store/
    useView.ts               panel open/closed state, left tab
  render/
    Scene.tsx                <Canvas> with an empty scene
  ui/
    theme.css                CSS custom properties (dark theme), base reset
    layout/
      AppShell.tsx   AppShell.module.css   AppShell.test.tsx
      TopBar.tsx     TopBar.module.css
      LeftSidebar.tsx LeftSidebar.module.css
      MapView.tsx    MapView.module.css
      Inspector.tsx  Inspector.module.css
      Timeline.tsx   Timeline.module.css

test/
  lint/
    layers.test.ts           proves the layer and determinism rules fire
```

Layer folders with no files yet (`orbital/`, `sim/`, …) are not created: git doesn't track empty folders. The ESLint config defines every layer from the start, so the rule is already in force when each folder gets its first file.

Also update [CLAUDE.md](../CLAUDE.md): the current status (implementation has started) and a short list of the npm scripts.

## Tooling

### Dependencies

Latest stable versions at install time. R3F v9 needs React 19.

- **Runtime:** `react`, `react-dom`, `three`, `@react-three/fiber`, `zustand`.
- **Dev:** `typescript`, `vite`, `@vitejs/plugin-react`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@types/react`, `@types/react-dom`, `@types/three`, `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-plugin-boundaries`, `eslint-import-resolver-typescript`, `eslint-config-prettier`, `prettier`, `globals`.

`@react-three/drei` is not added until sprint 2 needs it.

### Scripts

| Script | Command |
|--------|---------|
| `dev` | `vite` |
| `build` | `tsc -b && vite build` (type checks the whole project) |
| `preview` | `vite preview` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `lint` | `eslint .` |
| `format` | `prettier --write .` |
| `format:check` | `prettier --check .` |

### TypeScript

`tsconfig.app.json`: `strict: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `jsx: react-jsx`, `verbatimModuleSyntax: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules`, `noEmit` (the Vite React template defaults), plus the stricter flags (S0-10):

- `noUncheckedIndexedAccess`: `arr[i]` and `record[key]` are typed `T | undefined`. This matters for the ID-keyed world maps, where a lookup by a stale ID must be handled.
- `exactOptionalPropertyTypes`: `foo?: number` means "absent or a number", not "may be `undefined`". This keeps saved plain data honest (no `{ endTargetId: undefined }` keys after a JSON round trip).
- `noImplicitOverride` and `noPropertyAccessFromIndexSignature`, which cost nothing in this codebase.

### Vitest

Configured in `vite.config.ts`:

- `include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.ts']`
- `environment: 'node'` by default. UI tests opt in with a `// @vitest-environment jsdom` comment, so the math tests stay fast and DOM-free.

### ESLint

Flat config in `eslint.config.js`, in this order:

1. `@eslint/js` recommended, `typescript-eslint` recommended, `react-hooks`, `react-refresh` (for `.tsx` files), `eslint-config-prettier` last.
2. **Layer rule** with `eslint-plugin-boundaries` and the TypeScript import resolver. Each layer is an element type matched by folder (`src/math/**` → `math`, …, `src/ui/**` → `ui`, `src/content/**` → `content`, `src/main.tsx` → `app`). The element-types rule is `default: 'disallow'`, with one allow entry per layer:

   | From | May import |
   |------|-----------|
   | `math` | — |
   | `content` | — |
   | `orbital` | `math`, `content` |
   | `sim` | `orbital` and below, `content` |
   | `planning` | `sim` and below, `content` |
   | `knowledge` | `planning` and below, `content` |
   | `economy` | `knowledge` and below, `content` |
   | `gen` | `economy` and below, `content` |
   | `game` | `gen` and below, `content` |
   | `store` | `game` and below, `content` |
   | `render` | `store` and below, `content` |
   | `ui` | `render` and below, `content` |
   | `app` | everything |

   Plus `boundaries/no-unknown-files`, so a source file outside a known layer is an error. Imports within a layer are always allowed. Tests belong to the layer of the folder they're in.

   Boundaries resolves relative paths, so `../../store/useView` is caught as well as any other spelling. (Check the rule names against the installed plugin version: recent versions have renamed some rules.)
3. **Framework imports below `store/`:** `no-restricted-imports` on `src/{math,orbital,sim,planning,knowledge,economy,gen,game,content}/**`, with patterns `react`, `react-dom`, `react/*`, `three`, `three/*`, `@react-three/*` and `zustand`. The message points to the dependency rule in architecture.md.
4. **Determinism** (S0-4), on the same folders:
   - `no-restricted-properties`: `Math.random` (message: use `math/rng.ts`), `Date.now`, `performance.now`, `crypto.getRandomValues`;
   - `no-restricted-syntax`: `NewExpression[callee.name='Date']` and `CallExpression[callee.name='Date']` (message: sim time comes from the clock).

## Interfaces and data models

All `math/` modules are pure TypeScript with no imports. Units: `km`, `s`, `kg`, `km/s`, angles in radians.

### `math/vec3.ts`

```ts
/** A float64 3-vector. Plain data: safe to store in the world and to serialise. */
export interface Vec3 { x: number; y: number; z: number }

export const ZERO: Readonly<Vec3>;        // frozen
export const X_AXIS: Readonly<Vec3>;
export const Y_AXIS: Readonly<Vec3>;
export const Z_AXIS: Readonly<Vec3>;

export function vec3(x: number, y: number, z: number): Vec3;
export function clone(a: Vec3): Vec3;

// Pure: return a new vector, never mutate inputs.
export function add(a: Vec3, b: Vec3): Vec3;
export function sub(a: Vec3, b: Vec3): Vec3;
export function scale(a: Vec3, s: number): Vec3;
export function addScaled(a: Vec3, b: Vec3, s: number): Vec3;   // a + b·s
export function negate(a: Vec3): Vec3;
export function lerp(a: Vec3, b: Vec3, t: number): Vec3;
export function cross(a: Vec3, b: Vec3): Vec3;
export function normalize(a: Vec3): Vec3;                       // zero vector → zero vector
export function rotateX(a: Vec3, angle: number): Vec3;          // right-handed, radians
export function rotateZ(a: Vec3, angle: number): Vec3;

export function dot(a: Vec3, b: Vec3): number;
export function norm(a: Vec3): number;
export function normSq(a: Vec3): number;
export function distance(a: Vec3, b: Vec3): number;
export function angleBetween(a: Vec3, b: Vec3): number;         // [0, π], stable near 0 and π (atan2 form)
export function equalsApprox(a: Vec3, b: Vec3, eps: number): boolean;  // max-component test

// Hot-loop variants: write into `out` and return it. `out` may alias an input.
export function addInto(out: Vec3, a: Vec3, b: Vec3): Vec3;
export function subInto(out: Vec3, a: Vec3, b: Vec3): Vec3;
export function scaleInto(out: Vec3, a: Vec3, s: number): Vec3;
export function addScaledInto(out: Vec3, a: Vec3, b: Vec3, s: number): Vec3;
```

`rotateX` and `rotateZ` are what the 3-1-3 rotation from orbital elements to state vectors needs in sprint 1. `rotateY` and general matrices are added when something needs them.

### `math/units.ts`

```ts
// Distance
export const M_PER_KM = 1000;
export const AU_KM = 149_597_870.7;                 // IAU 2012, exact

// Time
export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 86_400;
export const SECONDS_PER_JULIAN_YEAR = 31_557_600;  // 365.25 d

// Physics
export const G = 6.674_30e-20;                      // km³ kg⁻¹ s⁻² (CODATA 2018)
export const G0 = 9.806_65e-3;                      // km/s², standard gravity (rocket equation)

// Angles
export const DEG = Math.PI / 180;
export const TWO_PI = 2 * Math.PI;
export function degToRad(deg: number): number;
export function radToDeg(rad: number): number;
export function wrapTwoPi(angle: number): number;   // → [0, 2π)
export function wrapPi(angle: number): number;      // → (−π, π]

// Conversions to and from internal units
export type DistanceUnit = 'm' | 'km' | 'AU';
export type SpeedUnit = 'm/s' | 'km/s';
export type MassUnit = 'kg' | 't';
export type DurationUnit = 's' | 'min' | 'h' | 'd' | 'yr';
export function toKm(value: number, unit: DistanceUnit): number;
export function fromKm(km: number, unit: DistanceUnit): number;
export function toKmPerS(value: number, unit: SpeedUnit): number;
export function fromKmPerS(kmps: number, unit: SpeedUnit): number;
export function toKg(value: number, unit: MassUnit): number;
export function fromKg(kg: number, unit: MassUnit): number;
export function toSeconds(value: number, unit: DurationUnit): number;
export function fromSeconds(s: number, unit: DurationUnit): number;
```

Display formatting ("3 d 04:12", "1.52 AU") belongs in `ui/`, and arrives with the inspector in sprint 2. Epoch and Julian date constants arrive with the ephemeris in sprint 1.

### `math/roots.ts`

```ts
export interface RootOptions {
  xtol?: number;     // absolute tolerance on x; default 1e-12. Brent also applies 4·ε·|x|.
  maxIter?: number;  // default 200
}

export interface RootResult {
  x: number;          // best estimate of the root
  fx: number;         // f(x)
  iterations: number;
  converged: boolean; // false if maxIter was reached
}

/** Requires f(a) and f(b) of opposite sign (or one of them zero), else throws RangeError. */
export function bisect(f: (x: number) => number, a: number, b: number, opts?: RootOptions): RootResult;

/** Brent's method (inverse quadratic interpolation, secant, bisection). Same contract as bisect. */
export function brent(f: (x: number) => number, a: number, b: number, opts?: RootOptions): RootResult;

/**
 * Samples f at `steps` equal intervals over [a, b] and returns the first interval with a sign
 * change, or null. Used for SOI entry and closest approach (sprints 3 and 9).
 */
export function findFirstBracket(
  f: (x: number) => number, a: number, b: number, steps: number,
): [lo: number, hi: number] | null;
```

- `a > b` is accepted, and the interval is treated as `[b, a]`.
- A non-finite `f(a)` or `f(b)` throws `RangeError`. A missing sign change is a programming error (the caller should have bracketed), so it throws, while running out of iterations is reported through `converged: false`.

Newton's method for Kepler's equation is specific to that equation, so it lives in `orbital/kepler.ts` (sprint 1), not here.

### `math/rng.ts`

```ts
/** sfc32 state. Plain data: JSON round-trips and resumes the same sequence. */
export interface Rng {
  path: string;                  // identity, e.g. "42/planets/moons"; forks hash this
  a: number; b: number; c: number; d: number;   // uint32 state
}

export function createRng(seed: string | number): Rng;   // path = String(seed)
export function fork(rng: Rng, label: string): Rng;      // path = `${rng.path}/${label}`; ignores rng's draw count

// These advance (mutate) the state in place.
export function nextUint32(rng: Rng): number;            // [0, 2³²)
export function next(rng: Rng): number;                  // [0, 1), 32 bits of randomness
export function range(rng: Rng, min: number, max: number): number;       // [min, max)
export function int(rng: Rng, min: number, maxInclusive: number): number; // unbiased (rejection)
export function chance(rng: Rng, p: number): boolean;
export function pick<T>(rng: Rng, items: readonly T[]): T;               // throws on empty
export function shuffle<T>(rng: Rng, items: readonly T[]): T[];          // new array, Fisher–Yates
export function normal(rng: Rng, mean?: number, sd?: number): number;    // Box–Muller, no cached spare
```

- **Seeding:** the path string is hashed with `cyrb128` to the four state words, then the generator is advanced 15 times to mix the state.
- `normal` draws two uniforms for each call and discards the second result, so that the state stays four integers and nothing else.
- `int` uses rejection sampling, so small ranges have no modulo bias.

### `math/pqueue.ts`

The basis of the sim event queue in sprint 3.

```ts
export interface PQEntry<T> { key: number; seq: number; value: T }

/** Binary min-heap on (key, seq). Plain data if T is. */
export interface PQueue<T> { heap: PQEntry<T>[]; nextSeq: number }

export function createPQueue<T>(): PQueue<T>;
export function push<T>(q: PQueue<T>, key: number, value: T): number;   // returns seq (handle); throws on non-finite key
export function peek<T>(q: PQueue<T>): PQEntry<T> | undefined;
export function pop<T>(q: PQueue<T>): PQEntry<T> | undefined;
export function size<T>(q: PQueue<T>): number;
export function remove<T>(q: PQueue<T>, seq: number): boolean;          // O(n) find, O(log n) repair
export function removeWhere<T>(q: PQueue<T>, pred: (value: T) => boolean): number;  // O(n) rebuild; returns count
export function clear<T>(q: PQueue<T>): void;
```

- **Ordering:** by `key` ascending, and equal keys in insertion order (by `seq`). That makes the order of simultaneous events deterministic.
- `remove` and `removeWhere` cover replanning: "drop this node's event" and "drop every event for ship X". At the expected sizes (hundreds of events), O(n) is fine.

### `store/useView.ts`

A placeholder for the view store that sprint 2 extends (selection, camera, focus).

```ts
export type LeftTab = 'system' | 'fleets' | 'stations' | 'routes';

interface ViewState {
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  leftTab: LeftTab;
  toggleLeftPanel(): void;
  toggleRightPanel(): void;
  setLeftTab(tab: LeftTab): void;
}

export const useView: UseBoundStore<StoreApi<ViewState>>;  // zustand create()
```

## App shell

The layout from [interface.md](../docs/interface.md#screen-layout), as placeholder panels.

- **`AppShell`:** a CSS grid filling the viewport, with rows `top bar / main / timeline` and columns `left sidebar / map / inspector`. Each region uses a landmark element: `<header>` (top bar), `<nav aria-label="Sidebar">` (left), `<main>` (map), `<aside aria-label="Inspector">` (right), `<footer>` (timeline). When a side panel is closed, its grid column becomes `0` and the map takes the space.
- **`TopBar`:** a "Sandbox" title, a menu button (no menu yet), a panel toggle for each side, and placeholder warning and alarm counts (`⚠ 0`, `⏰ 0`). The phase, reserves and stockpile summary from the mock-up are milestone 3+ and are left out.
- **`LeftSidebar`:** tabs System, Fleets, Stations and Routes, bound to `leftTab`. Each tab shows an "empty" placeholder. A collapsed "Filters ▾" section at the bottom.
- **`MapView`:** hosts `render/Scene.tsx` and fills its grid cell.
- **`Scene` (render):** an R3F `<Canvas>` with a near-black background colour, a perspective camera, `frameloop="always"`, and no objects. Logarithmic depth and camera settings are decided in sprint 2.
- **`Inspector`:** "Nothing selected".
- **`Timeline`:** a placeholder row with disabled ◀◀ ⏸ ▶ ▶▶ buttons, a "×1" warp readout, an empty strip and a date readout `—`.
- **`theme.css`:** CSS variables for background, panel, border, text and accent colours, the panel widths (`--left-width: 260px`, `--right-width: 300px`), and the UI and monospace font stacks. A minimal reset: `html, body, #root { height: 100%; margin: 0 }`, `overflow: hidden`.

## Tests

### `math/` (Vitest, node environment)

**`vec3.test.ts`**
- Identities: `add`/`sub` are inverses, `cross(X, Y) = Z` and anticommutativity, `dot` of perpendicular vectors is 0, `norm(normalize(v)) ≈ 1`, `normalize(ZERO)` is `ZERO`.
- `rotateZ(X_AXIS, π/2) ≈ Y_AXIS`, `rotateX(Y_AXIS, π/2) ≈ Z_AXIS`, and rotations preserve the norm.
- `angleBetween` is accurate for nearly parallel vectors (1e-9 rad apart), where the `acos` form fails.
- **Float64 precision:** two points about 1 AU from the origin and 1 m apart: `norm(sub(a, b))` equals `0.001` km to within 1e-9 km. (In float32 this would be 0 or wildly off.)
- Pure functions don't mutate their inputs. `…Into` variants match the pure versions, including when `out` aliases an input.
- `JSON.parse(JSON.stringify(v))` deep-equals `v`.

**`units.test.ts`**
- Constants have their defined values (`AU_KM`, `G`, `G0`, `SECONDS_PER_DAY`).
- Round trips for each `to…`/`from…` pair and unit (1 AU → km → AU, 7.8 km/s ↔ 7800 m/s, 1 t = 1000 kg, 1 yr = 365.25 d).
- `wrapTwoPi`: negative angles, exactly `2π` → `0`, large multiples. `wrapPi`: `−π` → `π`, `π` stays `π`.

**`roots.test.ts`**
- `x² − 2` on [0, 2]: both methods give √2 to 1e-12.
- `cos x − x` on [0, 1]: matches 0.7390851332151607.
- Kepler's equation `E − e·sin E − M` for `e = 0.9` and several `M`: Brent converges, and the residual is below 1e-12.
- Brent takes fewer iterations than bisection on the same smooth problem.
- A root exactly at an endpoint is returned with 0 iterations. A reversed interval (`a > b`) works.
- A step function with its sign change at a discontinuity converges to the discontinuity.
- **Time scale:** `f(t) = t − (1e9 + 0.123)` on [0, 2e9]: the root is found to within 1e-6 s (relative tolerance at 30 years of sim time).
- Throws `RangeError` when there's no sign change, and when `f(a)` is NaN.
- `maxIter: 3` on a hard problem returns `converged: false` instead of throwing.
- `findFirstBracket` returns the first of several sign changes, and `null` when there are none.

**`rng.test.ts`**
- **Golden values:** the first 10 `nextUint32` outputs for seed `"sprint-0"` are pinned in the test (captured from the first implementation, and checked against a reference sfc32 from the literature with the same state). This catches accidental changes to the generator, which would reshuffle every seed.
- **Determinism:** two RNGs with the same seed produce identical sequences of 1,000 values. Different seeds differ.
- **Fork independence:** `fork(r, 'planets')` gives the same stream whether it's taken before or after drawing 100 values from `r`. `fork(r, 'a')` and `fork(r, 'b')` differ, and both differ from `r`. A label that is empty or contains `/` throws, so paths stay unambiguous (`fork(r, 'a/b')` can't collide with `fork(fork(r, 'a'), 'b')`).
- **Save and resume:** a JSON round trip of the state halfway through a sequence continues identically.
- **Ranges:** 100,000 `next` values all in [0, 1), with a mean within 0.005 of 0.5. `int(r, 1, 6)` hits every value from 1 to 6 and never 0 or 7, and each frequency is within 2% of ⅙. `normal` has a mean ≈ 0 and SD ≈ 1 over 100,000 draws.
- `pick` on an empty array throws. `shuffle` returns a permutation and leaves its input unchanged.

**`pqueue.test.ts`**
- Pops in key order after random insertion.
- Equal keys pop in insertion order.
- `remove(seq)` removes exactly that entry, from the root, a leaf or the middle, and returns `false` for an unknown handle. `removeWhere` returns the count and leaves a valid heap.
- `peek` doesn't change the size. `pop` on an empty queue returns `undefined`. `push` with NaN or ±Infinity throws.
- **Save and resume:** after a JSON round trip, the queue pops the same sequence.
- **Randomised check against a model:** 10,000 random push, pop and remove operations (driven by `rng.ts` with a fixed seed), compared at every step against a sorted array.

### Lint rules (`test/lint/layers.test.ts`)

These run ESLint programmatically (`new ESLint()` and `lintText(code, { filePath })`), so the bad code never exists on disk and `npm run lint` stays clean. Each case asserts the specific rule ID that fires.

| File path given | Code | Expected |
|-----------------|------|----------|
| `src/math/bad.ts` | `import { useView } from '../store/useView'` | layer error |
| `src/math/bad.ts` | `import * as THREE from 'three'` | restricted import |
| `src/math/bad.ts` | `import { useState } from 'react'` | restricted import |
| `src/math/bad.ts` | `Math.random()` | determinism error |
| `src/math/bad.ts` | `Date.now()`, `new Date()` | determinism error |
| `src/render/bad.tsx` | `import { AppShell } from '../ui/layout/AppShell'` | layer error (render → ui) |
| `src/ui/ok.tsx` | `import { Scene } from '../render/Scene'` | no errors |
| `src/store/ok.ts` | `import { vec3 } from '../math/vec3'` | no errors |
| `src/render/ok.tsx` | `Math.random()` | no errors (determinism applies below `store/` only) |
| `src/misc/bad.ts` | any | unknown-file error |

The cases for `orbital → sim`, `sim → planning` and `content → sim` need target files that don't exist yet. They are added to this table as those layers get their first files.

### App shell (`ui/layout/AppShell.test.tsx`, jsdom)

`render/Scene` is replaced with a stub through `vi.mock`, because jsdom has no WebGL.

- The five landmarks render: banner, sidebar navigation, main, inspector aside, contentinfo.
- `main` contains the scene stub.
- Clicking the left panel toggle hides the sidebar (it leaves the accessibility tree), and clicking again shows it. The same for the inspector.
- Clicking the Fleets tab marks it selected (`aria-selected`) and shows its placeholder.

## Acceptance criteria

Sprint 0 is done when all of these hold:

1. **Clean install and checks:** from a fresh clone, `npm ci`, then `npm test`, `npm run lint`, `npm run build` and `npm run format:check` all succeed, with no warnings from lint.
2. **Layer rule:** every row of the lint-rule table above gives the expected result in `npm test`.
3. **Deliberate bad import, by hand:** adding `import { useView } from '../store/useView'` to `src/math/vec3.ts` makes `npm run lint` fail with a boundaries error. Adding `import * as THREE from 'three'` or a `Math.random()` call there also fails. Reverting makes lint pass.
4. **Math layer:** `vec3`, `units`, `roots`, `rng` and `pqueue` export the interfaces above, have no imports, and pass the tests above.
5. **Shell in the browser:** `npm run dev` shows the top bar, left sidebar with four tabs, map, inspector and timeline in the layout of interface.md. The map area contains a WebGL canvas that fills it, and resizes with the window and when either side panel is collapsed. There are no errors or warnings in the browser console.
6. **Docs:** CLAUDE.md shows the new status and the scripts, and decisions S0-1 to S0-11 are logged in decisions.md.

## Suggested order of work

1. Scaffold with `npm create vite@latest` (react-ts template) and trim it. Add Prettier and the `.nvmrc`.
2. ESLint with the layer and determinism rules, then `test/lint/layers.test.ts`. (The lint test needs `src/store/useView.ts`, `src/render/Scene.tsx` and `src/ui/layout/AppShell.tsx` to exist as import targets, so create stubs first.)
3. `math/` modules with their tests, in this order: `vec3`, `units`, `roots`, `rng`, `pqueue` (its randomised test uses `rng`).
4. App shell, theme and the shell test.
5. Docs updates and the acceptance check.

## Open questions

1. **Should `content/` be allowed to import `math/units.ts`?** Kept separate for now: content imports nothing. Units are the likely reason to relax this, so that content can write values in convenient units (for example `mass: toKg(2.3, 't')`) or use `G0`. If that's wanted, the narrow change is to allow `content → math/units.ts` only, which is safe because `units.ts` has no imports of its own.
