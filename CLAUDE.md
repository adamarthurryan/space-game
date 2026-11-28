# Current Status

Milestone 1, sprints 0 to 5 and 5b are complete. Sprint 0 (foundations): the toolchain, the lint-enforced layer rules, the `math/` layer, and the app shell with an empty 3D canvas. Sprint 1 (orbital math and the real solar system, headless): `math/time.ts`, the `orbital/` layer (Kepler, elements, propagation, frames, SOI), `sim/body.ts` (the body tree), and `gen/realSystem.ts` with its JPL data in `gen/data/` and a pinned Horizons fixture in `gen/fixtures/`. Sprint 2 (the map): the sim clock and world (`sim/clock.ts`, `sim/world.ts`, `gen/scenario.ts`), the map in `render/` (bodies, markers, orbit lines, labels, picking, the camera controller), the System tab, the body inspector, the live timeline and the map keys. Its R3F review found `render/` mostly imperative, so React Three Fiber was replaced with plain three.js (decision 90). Sprint 3 (ships and trajectories): `render/` on plain three.js (`MapRenderer`, `stages.ts`, layers in `render/layers/`, input in `render/input/`); the minimal content pipeline in `content/` (Starship); `sim/ship.ts`, patched-conic coasting in `sim/trajectory.ts`, the event queue in `sim/events.ts` and `advanceWorld`; player actions in `game/actions.ts`; sandbox ships and spawn presets in `gen/sandboxShips.ts`; ships, trajectories and trajectory markers on the map; the Fleets list, the spawn form and the ship inspector. Sprint 4 (maneuver nodes): `sim/maneuver.ts` (nodes on `ship.plan`, the Δv budget, propellant deduction), trajectories through a plan (`'maneuver'` segment ends), node execution as an event, the clock's `pauseOn`, the trajectory cache, `orbital/passages.ts`, node actions in `game/actions.ts`, the active ship, the inspector's node editor and Plan section, the Pause on ▾ menu, dashed planned paths, the ghost node and the node gizmo (`render/NodeGizmo.ts`), and a hand-flown lunar flight in tests and the smoke test. Sprint 5 (timeline, time control and preview): upcoming events from trajectories (`sim/upcoming.ts`), warp-to on the clock (`clock.warpTo`, easing into a stop a minute before a node or just after another event) and its actions, the logarithmic event strip and warp-to buttons in `ui/timeline/`, and preview scrubbing (`useView.preview`): the map drawn at the preview time with ships placed from their trajectories, the route flown in the preview faded, map editing off, and the PREVIEW badge. Sprint 5b (interface and usability review): separate pointers for selection, focus, the reference frame (`useView.frame`, Frame ▾) and the active ship (set only by A or the Fly button); focusing an on-screen object moves only the centre, and ships are framed to their path; a top-down start view; spawned ships flash; overlays behind bodies dimmed, the gizmo shrinking and then hiding as the planned path gets small on screen, ship labels merged with their parent's, and the body entered drawn at the SOI entry (`render/encounterGhosts.ts`); the node editor inline in the ship inspector, read-only plans for non-active ships, `formatDv`, `hasApsides` for circular orbits, and a shared `Popover`; the strip on a fixed 10-year scale; placeholder chrome hidden. See `planning/milestone-1-sprints.md` for the next sprints.

# Scripts

- `npm run dev` — Vite dev server
- `npm run build` — type check (`tsc -b`) and production build
- `npm run preview` — serve the production build
- `npm test` — Vitest, once (`npm run test:watch` to watch)
- `npm run lint` — ESLint, including the layer and determinism rules
- `npm run format` / `npm run format:check` — Prettier (code only; Markdown is excluded)
- `npm run smoke` — headless-browser checks of the running app shell, map, ships, maneuver nodes, the timeline, and the usability review (needs Google Chrome; see `.claude/skills/run-app`)

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
- `guides/` — entries in this folder are only for use use of human coders and reviewers - they are not a source of architectural truth 
- `guides/README.md` — index of the code guides, one per layer as built: `math.md`, `orbital.md`, `sim.md`, `gen.md`, `game.md`, `store.md`, `render.md`, `ui.md`, `content.md`
- `decisions.md` — open questions and the decision log for all docs

Development planning is in the `planning` folder:

- `milestones.md` — the high-level development milestones
- `milestone-1-sprints.md` — the sprints of milestone 1
- `sprint-0.md` — the detailed plan of sprint 0
- other sprints and milestones have similar files

Source code is in `src/`, one folder per layer (see "Layered structure" in `docs/architecture.md`). A layer may import only the layers below it; `npm run lint` enforces this.

# Tech Stack

The project is built using TypeScript, plain Three.js for the map (`render/`), React for the UI panels, and zustand for UI state. It is purely client-side and browser-based.
