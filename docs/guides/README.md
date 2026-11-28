# Code guides

These guides describe the code in `src/` as it stands after milestone 1, sprint 5b: one guide per layer, covering its architecture, its common patterns, its key files and its core functions, with recipes for common changes. They are for human coders and reviewers. They are not a source of architectural truth: where they disagree with [architecture.md](../architecture.md), [features.md](../features.md) or [interface.md](../interface.md), those win, and the guide should be fixed.

## The layers

The layers, lowest first. A layer may import only the layers below it, plus `content/`; `npm run lint` enforces this (`eslint.config.js`).

| Layer | Guide | What it is |
|---|---|---|
| `math/` | [math.md](math.md) | Float64 vectors, units, calendar and sim time, root finding, seeded RNG, priority queue |
| `orbital/` | [orbital.md](orbital.md) | Pure orbital mechanics: elements, Kepler, propagation, frames, SOI, passages |
| `sim/` | [sim.md](sim.md) | The world: body tree, ships, maneuver nodes, patched-conic trajectories, clock, events |
| `gen/` | [gen.md](gen.md) | The real solar system from JPL data, the sandbox scenario, spawn presets |
| `game/` | [game.md](game.md) | Player actions and their rules |
| `store/` | [store.md](store.md) | The zustand stores: the world and its version, and view state |
| `render/` | [render.md](render.md) | The three.js map: frame stages, layers, camera, picking, overlays |
| `ui/` | [ui.md](ui.md) | The React panels: shell, sidebar, inspectors, toolbar, timeline |
| `content/` | [content.md](content.md) | Game data as typed TypeScript, importable from any layer |

`planning/`, `knowledge/` and `economy/` are in the lint's layer list but have no code yet.

## Rules that hold across layers

- **Below `store/`, code is pure and deterministic.** No React, three.js or zustand, and no `Math.random`, `Date` or `performance.now` (use `math/rng.ts` and the sim clock). The lint enforces both. `test/lint/layers.test.ts` proves that the rules fire.
- **The world is plain data.** Everything in `World` except `world.derived` survives a JSON round trip, and `derived` is rebuildable from the rest.
- **Internal units are km, s, kg, km/s and radians** everywhere below `ui/`. Content files use kg, m³, N and s. Display formatting is in `ui/format.ts`.
- **Every player action goes through `game/actions.ts`**, called through `store/useWorld.ts`'s wrappers.
- **Code cites decisions** as `S<sprint>-<n>` (decision n of `planning/sprint-<sprint>.md`) or by number in [decisions.md](../decisions.md). Keep the citations when you edit the code.
- **Tests sit next to the code** (`*.test.ts`, and `*.test.tsx` for components in jsdom), and `npm run smoke` checks the running app. Before finishing a change, `npm test`, `npm run lint`, `npm run build` and `npm run format:check` should pass, and `npm run smoke` too for visible changes.
