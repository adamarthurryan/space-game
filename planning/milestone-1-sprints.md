# Milestone 1 — Orbital sandbox: sprints

This breaks [milestone 1](milestones.md#1-orbital-sandbox) into sprints. Each sprint ends with something that can be demonstrated in the browser or proven by tests, and each builds on the one before. Sprints are units of scope, not fixed lengths of time. Module paths refer to the source layout in [architecture.md](../docs/architecture.md).

## Scope boundaries

**In milestone 1:** the real solar system on rails, patched-conic coasting, impulsive maneuver nodes, the impulsive planning tools and porkchop planner, fleets and the active ship, the timeline with preview scrubbing, alarms, targets, rendezvous, and automatic docking.

**Not in milestone 1** (deferred to the milestone that owns it):

| Deferred                                                                  | Why                                                                                           | Milestone |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------- |
| Thrust segments, thrust arcs, finite execution of nodes, low-thrust tools | Impulsive only in milestones 1–2 (decision 18). Segments already carry a `kind` discriminant. | 3         |
| Crew dose, radiation layer, porkchop dose overlay                         | Radiation environment arrives with discovery.                                                 | 2         |
| True/known world split, orbit uncertainty bands                           | Every body is fully known in the sandbox.                                                     | 2         |
| Ship designer, construction                                               | Sandbox ships come from preset designs.                                                       | 2         |
| Cargo transfer, mining, economy                                           | Docking forms a stack, but nothing is exchanged.                                              | 3         |
| Fictional system generator                                                | The real solar system only.                                                                   | 2         |

## Sprint 0 — Foundations

**Goal:** an empty but correctly structured project.

- Vite + TypeScript + React + R3F + zustand. Vitest. ESLint with import rules enforcing the layer dependency rule (no React or Three.js below `store/`).
- `math/`: `vec3.ts` (float64), `units.ts`, `roots.ts` (bisection, Brent), `rng.ts` (`sfc32` with `fork`), `pqueue.ts`.
- Empty app shell: the layout from [interface.md](../docs/interface.md#screen-layout) as placeholder panels (top bar, left sidebar, map, inspector, timeline).

**Done when:** `npm test` and `npm run lint` pass, a deliberate bad import fails lint, and the shell renders an empty 3D canvas.

## Sprint 1 — Orbital math and the real solar system (headless)

**Goal:** correct positions of every major body at any time, tested without rendering.

- `orbital/`: `elements.ts` (elements ↔ state vectors), `kepler.ts` (universal-variable propagation: elliptic, parabolic, hyperbolic), `propagate.ts`, `frames.ts` (body-to-body frame transforms), `soi.ts` (Laplace SOI radius).
- `sim/body.ts`: the body tree, position at `t` summed up the tree, the major/minor mass threshold.
- `gen/realSystem.ts`: the JPL approximate-positions table for the planets, mean elements for major moons. (A sample of asteroids as minor bodies can wait until sprint 8, when they become rendezvous targets.)

**Done when:** tests pass for Kepler textbook cases, state ↔ elements round trips, hyperbolic propagation, and planet positions at a reference epoch against JPL Horizons values within the table's stated accuracy.

## Sprint 2 — The map

**Goal:** watch the solar system move.

- `render/`: `Scene.tsx`, `BodyMesh.tsx`, `OrbitLine.tsx`. Camera-relative rendering (float64 subtraction, then float32). Bodies at true size when close, with a minimum screen size and labels when far. Orbit lines faded by distance; moon orbits hidden at system zoom.
- `render/camera/`: orbit controls around a focus object, logarithmic zoom, animated refocus, snapping to the ecliptic or the selected body's plane.
- A simple clock: pause, warp steps ×1 … ×10⁷, date readout. (It becomes `sim/clock.ts` with the event queue in sprint 3.)
- The System tab (body tree), click to select, double-click to focus. A minimal body inspector (physical data, elements, SOI radius).
- `render/picking.ts`: screen-space picking of bodies and labels. `render/overlays/`: the label overlay, decluttered by priority. Both follow the rendering conventions in [architecture.md](../docs/architecture.md#units-precision-and-rendering-scale).
- **R3F review** (decision 53): at the end of the sprint, check how much of `render/` uses JSX for more than which objects exist. If it is mostly refs and imperative code, plan the switch to plain three.js for sprint 3.
  - **Outcome:** `render/` was mostly imperative, and the switch to plain three.js is decided for the start of sprint 3 (decision 90; the review is in [sprint-2.md](sprint-2.md#r3f-review)).

**Done when:** you can zoom from low Earth orbit to the whole system in a few scroll steps without jitter, focus Jupiter's moons, snap to a plane, and warp a year in a few seconds.

## Sprint 3 — Ships and trajectories

**Goal:** ships on patched-conic trajectories.

- **First: replace React Three Fiber with plain three.js** (decision 90), before trajectories add a second imperative line layer. Nothing outside `render/` changes, and the sprint 2 tests and smoke checks are the safety net.
  - `render/MapRenderer.ts`: a class that owns the `WebGLRenderer` (logarithmic depth), the scene and camera, a `ResizeObserver` (canvas size and device pixel ratio), and the `requestAnimationFrame` loop. It runs the frame stages in the order of `STAGE` (clock, body positions, camera, projection, layers, labels), sharing the `MapFrame`, and disposes everything in `dispose()`.
  - `render/layers/`: the bodies, orbit lines and markers as classes with `constructor(scene, frame, system)`, `update(frame, view)` and `dispose()`. The bodies layer rebuilds its meshes when the body system changes.
  - `render/Scene.tsx` stays a React component: it creates the renderer in an effect, disposes it on unmount, and renders the DOM label overlay. The camera rig's and `useMapPointer`'s listeners move into the renderer (or stay as hooks on its canvas element).
  - The pure modules (`camera/controller.ts`, `camera/framing.ts`, `projection.ts`, `picking.ts`, `precision.ts`, `overlays/declutter.ts`, `overlays/labelLayout.ts`, `orbitFade.ts`, `bodyStyle.ts`, `markerMaterial.ts`, `orbitLineObject.ts`) and their tests carry over unchanged.
  - Remove `@react-three/fiber` from the dependencies, and lift the three.js pin (decision 48), which existed only because R3F 9.8 uses the deprecated `THREE.Clock`.
- `sim/`: `events.ts` (priority queue of sim events, with handler registration), `ship.ts`, `trajectory.ts`, and the sprint 2 `clock.ts` and `world.ts` extended with next-event clamping and ships. World state is plain data (see [architecture.md](../docs/architecture.md#technical-constraints)). `Segment` is `ConicSegment` only, storing its starting state vector, with a `kind` discriminant and exhaustive switches.
- Coasting propagation: find the earliest of SOI exit, SOI entry into a major child, impact, or horizon; transform to the new frame; stop at the segment cap.
- `store/useWorld.ts` (from sprint 2: the world object and its version counter); `game/actions.ts` as the entry point for player actions, with the clock controls moved behind it.
- **Minimal content:** `content/types.ts`, `resources.ts`, `registry.ts`, and `modules/backbones.ts`, `engines.ts` and `tanks.ts` only, with a few chemical entries. The content test (ID uniqueness, cross-references, sanity). Ship mass, propellant and Δv (rocket equation) derived from them. A handful of preset designs.
- A sandbox scenario: a few ships in Earth and lunar orbits, and a "spawn ship" debug action (design, parent body, orbit).
- `render/layers/TrajectoryLayer.ts` (a plain three.js layer, like the orbit lines): segments drawn in the focus body's frame, colour per ship, SOI transition markers, Pe/Ap markers.

- **Outcome:** done; see the implementation notes in [sprint-3.md](sprint-3.md#implementation-notes) and decisions 91–113.

**Done when:** `render/` has no React Three Fiber (no `@react-three/*` dependency) and the sprint 2 tests and smoke checks pass unchanged after the switch; a ship spawned on an Earth-escape orbit shows a trajectory that crosses into the Sun's frame correctly, a ship aimed at the Moon shows the SOI entry and the lunar flyby, and an impact ends the trajectory. A misspelt resource ID in content fails type checking, and a duplicate module ID fails the content test.

## Sprint 4 — Maneuver nodes

**Goal:** fly to the Moon by hand.

- `sim/maneuver.ts`: `ManeuverNode` (with `execution: 'impulsive'` only), plan execution as an event (Δv applied in the local orbital frame, propellant deducted), enable/disable, delete.
- Trajectory caching by ship state plus plan; recomputation of the active ship only while editing.
- `render/NodeGizmo.ts` (plain three.js; the handles are picked with a `Raycaster` from the renderer's pointer listeners, since there are no R3F pointer events): hover the trajectory to place a ghost node, click to create, six-handle gizmo with nonlinear drag sensitivity and fine/coarse modifiers, drag the node along the path to change its time.
- Inspector node editor: time and Δv fields with units, scroll nudges, "add at next Pe / Ap / AN / DN / time T", snap to Pe/Ap.
- Live feedback: Δv used and remaining (red when over budget), propellant used, burn duration warning, resulting orbit or encounter ("Moon encounter, Pe 230 km, in 3 d").

**Done when:** you can plan and execute a trans-lunar injection and a lunar orbit insertion by hand, and the executed orbit matches the prediction.

## Sprint 5 — Timeline, time control and preview scrubbing

**Goal:** time is controlled from the timeline, and the future can be inspected.

- `ui/timeline/`: play/pause, warp steps, "warp to next event", "warp to node". The strip shows the active ship's upcoming events (nodes, SOI changes, impact), with hover details.
- Event-driven clock: `t` is clamped at the next event; warp drops at events that need a decision (node execution, predicted impact).
- Preview scrubbing: `viewTime` as view state only, dragging the playhead, a tinted border and "PREVIEW" badge, Esc or release to return. Ghost positions of all objects at `viewTime`. Clicking an event jumps the preview to it.

**Done when:** at ×10⁶ warp, the clock stops exactly at a node instead of passing it, and scrubbing to the arrival time shows the ship and the Moon in their arrival positions without changing the sim.

## Sprint 6 — Fleets, the active ship and alarms

**Goal:** manage several ships, and let alarms run the clock.

- `sim/fleet.ts` and the Fleets tab: create, rename and delete fleets, drag ships between them, "Unassigned". Ship rows with SOI, next-event countdown, remaining Δv, and status icons (alarm set, low propellant, impact predicted). Status filters: idle, docked, in trouble.
- The active ship: select by list, map click or keyboard (next/previous, next in fleet, next idle). Only the active ship's nodes are editable; other plans are drawn as markers that make their ship active when clicked. The full ship inspector for milestone 1 (modules, mass, propellant, Δv, engines, current orbit, fleet, node list, alarms).
- The timeline "Show" selector: active ship, selected ships or a fleet.
- `sim/alarms.ts`: the `Alarm` model, with plan-item, event-type (optional target, optional once) and time triggers; fleet scope resolved at evaluation time, lead times, pause or drop warp. Set from a timeline event, a trajectory marker, or a ship or fleet context menu. Notifications with "Go to". The alarm list popover. The default impact alarm.
- The Filters panel: map layers (orbits, trajectories all/active/fleet/none, nodes, labels, SOI spheres) and category toggles, plus search.

**Done when:** with three fleets of ships, a fleet-wide "SOI change" alarm fires for a ship added to the fleet after the alarm was set, an alarm on one node survives that node being edited, and a "next SOI entry into the Moon" alarm set from the timeline still fires after a node earlier in the plan is added.

## Sprint 7 — Targets and the basic planning tools

**Goal:** the Plan ▾ menu, with tools that produce ordinary nodes.

- Set target from the context menu or a key; the inspector shows target distance and relative velocity.
- `planning/basic.ts`: Change Pe, Change Ap, Circularise (at Pe / Ap / after time), Change inclination, Change LAN.
- `planning/plane.ts`: Match planes with target (at AN/DN).
- `planning/transfer.ts` (first part): Hohmann to target, with phase angle and the next window.
- The Plan ▾ menu pattern: parameters → map preview → confirm → editable nodes, with tools run through `game/actions.ts`. The tools are never suggested.

**Done when:** each tool's result matches its analytic Δv in tests (including Earth→Mars Hohmann), and the nodes it creates can be edited like hand-placed ones.

## Sprint 8 — Lambert, transfers and the porkchop planner

**Goal:** interplanetary transfers.

- `orbital/lambert.ts` (Izzo's algorithm, multi-revolution where it is cheap), tested against published cases.
- Transfer tools: Intercept at time (Lambert), Bi-elliptic, Return from moon.
- `orbital/lagrange.ts`, the Lagrange-points layer, and Transfer to L-point (the target is placed on rails at the point).
- The job worker: `store/jobs.ts` and `store/jobWorker.ts`, running named pure functions in chunks, with progress and cancellation.
- The porkchop dialog: total Δv by departure date and time of flight, computed as a job so the UI stays responsive. Click a cell to preview it on the map; Apply creates the departure node and optionally a capture node. The Hohmann estimate and next-window list beside it.
- A sample of numbered asteroids added to `gen/realSystem.ts` as minor bodies (instanced points, orbit lines on demand), as transfer and rendezvous targets.

**Done when:** a porkchop plot for Earth→Mars shows the known launch windows in the right years, and applying a cell produces a Mars encounter.

## Sprint 9 — Rendezvous and docking

**Goal:** meet and dock with a ship or an asteroid.

- `orbital/approach.ts`: closest approach in a frame local to the pair (bracket on `r_rel · v_rel`, refine with Brent). Pair pruning: same SOI, overlapping windows, at least one object with a plan or target.
- Closest-approach markers with distance, relative speed and time, and whether the docking criteria are met. Optional ghost of the target at arrival.
- `planning/rendezvous.ts`: Match velocity at closest approach, Fine-tune closest approach, Intercept target.
- `sim/proximity.ts`: docking scheduled as an event ahead of time (< 500 m, < 2 m/s), resolved exactly even at high warp. Stacks propagate as one body with summed mass; nested entries in the sidebar. Anchoring to a minor body. Undock with a small separation impulse.

**Done when:** tests show closest-approach accuracy at docking scale between ships millions of kilometres from the Sun, and a docking planned at ×10⁷ warp happens at the predicted time.

## Sprint 10 — Saves, performance and milestone close

**Goal:** a sandbox that can be kept and that holds up at scale.

- Saves: `{ version, seed, scenarioParams, world }` in IndexedDB, with the full world including bodies; save, load, and a save list. Saves from another version are refused.
- Performance pass with ~100 ships and several hundred minor bodies at ×10⁷: per-frame sim and render cost, trajectory cache hit rate. Decide from the numbers whether trajectory batches or the whole sim should move to the worker.
- Unit switching (km / AU, m/s / km/s, kg / t), keyboard shortcuts for the frequent actions, and the look-and-feel pass from [interface.md](../docs/interface.md#look-and-feel).
- A milestone review: update [milestones.md](milestones.md) and [decisions.md](../docs/decisions.md) with what changed during the build.

**Done when:** a saved game reloads to an identical state (same trajectories and event times), and the stress scene holds frame rate at maximum warp.

## Questions raised by this breakdown

These belong in [decisions.md](../docs/decisions.md) if they aren't answered here.

1. **Where do milestone 1 ships come from?** This plan assumes preset designs from a minimal content pipeline (backbones, engines, tanks), plus a "spawn ship" sandbox action, with the designer arriving in milestone 2.
2. **Is a minimal ship inspector enough for milestone 1?** Power, heat, shielding, cargo and crew are left out until their systems exist.
3. **Should saves come earlier?** They are in sprint 10, but moving them to sprint 6 would make longer test sessions easier and check the snapshot format sooner.
