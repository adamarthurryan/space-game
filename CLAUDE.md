# Current Status

Milestone 1, sprints 0 to 4 are complete. Sprint 0 (foundations): the toolchain, the lint-enforced layer rules, the `math/` layer, and the app shell with an empty 3D canvas. Sprint 1 (orbital math and the real solar system, headless): `math/time.ts`, the `orbital/` layer (Kepler, elements, propagation, frames, SOI), `sim/body.ts` (the body tree), and `gen/realSystem.ts` with its JPL data in `gen/data/` and a pinned Horizons fixture in `gen/fixtures/`. Sprint 2 (the map): the sim clock and world (`sim/clock.ts`, `sim/world.ts`, `gen/scenario.ts`), the map in `render/` (bodies, markers, orbit lines, labels, picking, the camera controller), the System tab, the body inspector, the live timeline and the map keys. Its R3F review found `render/` mostly imperative, so React Three Fiber was replaced with plain three.js (decision 90). Sprint 3 (ships and trajectories): `render/` on plain three.js (`MapRenderer`, `stages.ts`, layers in `render/layers/`, input in `render/input/`); the minimal content pipeline in `content/` (Starship); `sim/ship.ts`, patched-conic coasting in `sim/trajectory.ts`, the event queue in `sim/events.ts` and `advanceWorld`; player actions in `game/actions.ts`; sandbox ships and spawn presets in `gen/sandboxShips.ts`; ships, trajectories and trajectory markers on the map; the Fleets list, the spawn form and the ship inspector. Sprint 4 (maneuver nodes): `sim/maneuver.ts` (nodes on `ship.plan`, the Δv budget, propellant deduction), trajectories through a plan (`'maneuver'` segment ends), node execution as an event, the clock's `pauseOn`, the trajectory cache, `orbital/passages.ts`, node actions in `game/actions.ts`, the active ship, the inspector's node editor and Plan section, the Pause on ▾ menu, dashed planned paths, the ghost node and the node gizmo (`render/NodeGizmo.ts`), and a hand-flown lunar flight in tests and the smoke test. See `planning/milestone-1-sprints.md` for the next sprints.

# Scripts

- `npm run dev` — Vite dev server
- `npm run build` — type check (`tsc -b`) and production build
- `npm run preview` — serve the production build
- `npm test` — Vitest, once (`npm run test:watch` to watch)
- `npm run lint` — ESLint, including the layer and determinism rules
- `npm run format` / `npm run format:check` — Prettier (code only; Markdown is excluded)
- `npm run smoke` — headless-browser checks of the running app shell, map, ships, and maneuver nodes (needs Google Chrome; see `.claude/skills/run-app`)

Before finishing a change, `npm test`, `npm run lint`, `npm run build` and `npm run format:check` should pass, and `npm run smoke` too for visible changes.

# Project Description

The goal of this project is to create a space exploration game and orbital mechanics simulator. The game is to be a roguelike with randomly generated scenarios either in the real solar system or in a fictional solar system.

The core mechanic of the game is planning orbital mechanics and maneuvers.

The principle view of the game is a map of a solar system, with the position, trajectories maneuver notes of ships indicated.

# Project Structure

The concept and architecture of the game are documented in the `docs` folder:

- `gameplay-concept.md`, `scenarios.md`, `worldbuilding.md` — vision and setting
- `features.md` — game systems and rules (what the game does)
- `architecture.md` — technical design (how it is built)
- `interface.md` — UI design
- `decisions.md` — open questions and the decision log for all docs

Development planning is in the `planning` folder:

- `milestones.md` — the high-level development milestones
- `milestone-1-sprints.md` — the sprints of milestone 1
- `sprint-0.md` — the detailed plan of sprint 0
- other sprints and milestones have similar files

Source code is in `src/`, one folder per layer (see "Layered structure" in `docs/architecture.md`). A layer may import only the layers below it; `npm run lint` enforces this.

# Tech Stack

The project is built using TypeScript, plain Three.js for the map (`render/`), React for the UI panels, and zustand for UI state. It is purely client-side and browser-based.
