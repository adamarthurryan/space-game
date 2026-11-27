# System Architecture

Status: draft proposal. Items marked **[Decision]** need sign-off; **[Open]** are unresolved.

## Goals and constraints

- Purely client-side, browser-based. TypeScript, Three.js, React Three Fiber (R3F).
- The simulation must be **deterministic**: same seed + same player inputs ⇒ same outcome. This enables save/load as (seed, input log), replays, and reproducible bugs.
- The physics core must be **independent of rendering**, so it can be unit-tested headlessly and moved to a Web Worker if needed.
- Physically plausible: two-body "on-rails" orbits for celestial bodies, patched conics for ships, realistic propulsion (see [worldbuilding.md](worldbuilding.md)).

## Layered structure

```
┌──────────────────────────────────────────────────────────┐
│ ui/        React DOM: panels, inspectors, timeline, menus │
│ render/    R3F scene: bodies, orbits, trajectories, nodes │
├──────────────────────────────────────────────────────────┤
│ store/     App state (zustand): selection, camera, filters│
│            + bridge to sim (current time, game state)     │
├──────────────────────────────────────────────────────────┤
│ game/      Roguelike rules: missions, resources, events,  │
│            fog of war, win/lose                           │
│ gen/       Seeded scenario & system generation            │
├──────────────────────────────────────────────────────────┤
│ sim/       Simulation: clock, bodies, ships, trajectories,│
│            maneuver nodes, event detection                │
│ orbital/   Pure math: Kepler, state vectors, SOI, Lambert │
│ math/      Vec3 (float64), units, root finding, PRNG      │
└──────────────────────────────────────────────────────────┘
```

Dependency rule: each layer imports only from layers below it. `math`, `orbital`, `sim`, `gen` and `game` must not import React or Three.js.

Proposed source layout:

```
src/
  math/       vec3.ts, units.ts, roots.ts, rng.ts
  orbital/    elements.ts, kepler.ts, propagate.ts, soi.ts, lambert.ts, frames.ts
  sim/        clock.ts, body.ts, ship.ts, trajectory.ts, maneuver.ts, events.ts, world.ts
  gen/        realSystem.ts, fictionalSystem.ts, scenario.ts
  game/       resources.ts, missions.ts, survey.ts, rules.ts
  store/      useWorld.ts, useView.ts
  render/     Scene.tsx, BodyMesh.tsx, OrbitLine.tsx, TrajectoryLine.tsx, NodeGizmo.tsx, camera/
  ui/         layout/, panels/, timeline/, planner/
```

## Units, precision and scale

- **Internal units:** SI-derived, `km`, `s`, `kg`, `km/s`. Time is seconds from the scenario epoch, as a float64 `number`.
- **Precision:** a solar system spans ~10¹⁰ km, but a docking approach is meters. Float64 on the CPU is enough (~15–16 significant digits). The GPU is float32, so:
  - **Camera-relative rendering:** every frame, compute object positions minus the camera focus position in float64, *then* convert to float32 for Three.js. The focused object always sits near the render origin.
  - Orbit/trajectory polylines are generated in the focus body's frame and re-based when focus changes.
- **Display scale:** bodies are drawn at true size when close, with a minimum screen-space size (icons/markers) so they stay visible at system scale. Zoom is logarithmic.

## Celestial bodies (on rails)

- A **body tree**: star → planets → moons (and asteroids/stations as leaves). Each non-root body has Keplerian elements relative to its parent, plus `mu` (GM), radius, and SOI radius (Laplace: `a·(m/M)^(2/5)`).
- Position at time `t` is analytic: mean anomaly → solve Kepler's equation (Newton's method) → state vector in the parent frame. World position = sum up the tree.
- No n-body perturbation. Orbits are fixed ellipses, which is cheap, exact and deterministic.
- Real solar system: approximate elements from the JPL "Keplerian Elements for Approximate Positions of the Major Planets" table, with secular rates optionally ignored. Major moons from published mean elements.

## Ships and trajectories (patched conics)

**Ship state:** at a reference time, `{ parentBodyId, r, v }` in the parent frame, plus mass, propellant, and engine parameters.

**Trajectory** = an ordered list of **conic segments**:

```ts
interface ConicSegment {
  parentId: BodyId;
  elements: OrbitalElements;   // or epoch state vector, for hyperbolic/near-parabolic robustness
  tStart: number;
  tEnd: number;                // Infinity for a closed orbit with no further events
  endEvent: 'soi-exit' | 'soi-enter' | 'maneuver' | 'impact' | 'horizon';
  endTargetId?: BodyId;
}
```

**Propagation algorithm** (`sim/trajectory.ts`):
1. Start from the ship state. Propagate analytically with universal-variable Kepler propagation, which handles elliptic, parabolic and hyperbolic orbits in one formulation.
2. Find the earliest of these events within the planning horizon:
   - the next maneuver node,
   - SOI exit (`|r| > parent SOI`),
   - SOI entry into a child body (closest approach to each child of the current parent; bracket and refine with root finding),
   - impact (`|r| < parent radius`, or the atmosphere boundary).
3. At the event, transform the state into the new frame (or apply the Δv), and start a new segment.
4. Stop at a segment cap or at the time horizon (e.g. N orbits or T years).

Trajectories are **computed lazily and cached**, keyed by (ship state, maneuver list). Editing a node invalidates that ship's trajectory from that node onward. If interactive node dragging becomes too slow, move propagation into a Web Worker. This is possible because `sim/` is pure.

**Maneuver nodes:**

```ts
interface ManeuverNode {
  id: NodeId;
  shipId: ShipId;
  t: number;                    // execution time
  dv: { prograde: number; normal: number; radial: number }; // km/s, in the local orbital frame
}
```

- Start with **impulsive burns** (instantaneous Δv). Burn duration from the thrust and the rocket equation is computed and displayed, as a warning when long burns make the impulsive approximation inaccurate.
- **[Open]** Finite or low-thrust burns (ion, fusion torch at plausible levels) can't be done with analytic conics. Options: (a) impulsive only; (b) numerically integrate during burns only (RK4/RK45 over the burn arc, then resume conics). Recommendation: (a) for v1, design the segment type so that (b) can add a `'burn'` segment later.
- Propellant is spent with the Tsiolkovsky equation: `Δm = m·(1 − e^(−Δv / (Isp·g0)))`.

**Planning helpers** (`orbital/`):
- **Lambert solver** (Izzo's algorithm) for transfer planning and porkchop plots.
- Closest-approach and encounter detection between a ship trajectory and a target body or ship.
- Hohmann transfer and phase-angle calculators, since those are the main transfers in this setting.

## Simulation clock and game loop

- **Sim time** is separate from wall time. `clock` holds `t`, `warpRate`, and `paused`.
- Each frame: `t += dt_wall × warpRate`, clamped so that it never passes the next **scheduled event** (maneuver execution, SOI change, arrival, game event). At an event the clock stops, or drops to a safe warp, and the event is resolved.
- Executing a maneuver node replaces the ship's reference state with the post-burn state and removes the node. This is the only point where ship state actually changes, so the committed history is a simple list of executed nodes.
- **Preview time** (UI only): the player can scrub a timeline to view the system at a future time without advancing sim time. Rendering reads `viewTime` (preview, or else sim time); the game only advances on sim time.

## Game layer (roguelike)

The mechanics are still to be designed. The architecture needs these hooks:
- **World state:** bodies (with a "surveyed" or knowledge level), ships, resources, missions, and the event log.
- **Resources:** propellant and Δv budget per ship, consumables or crew time, mission time.
- **Fog of war / survey [proposal]:** unsurveyed bodies have uncertain orbits, drawn as fuzzy bands. Survey probes refine the elements and reveal composition and resources. This fits the generation-ship scenario in [scenarios.md](scenarios.md) and makes exploration part of the mechanics, not just the theme.
- **Events** are generated by the seeded RNG at deterministic sim times, or triggered by state (arrival at a body).
- Turn structure: real-time with pause and warp, interrupted at events, like a "plan, then commit time" loop. **[Decision]**

## Generation (`gen/`)

- Seeded PRNG (e.g. `sfc32` or `mulberry32`) with **one sub-stream per subsystem** (`rng.fork('planets')`), so that adding a feature doesn't reshuffle every existing seed.
- **Real system:** a fixed body catalog. Randomness applies only to start epoch, scenario, and ship placement.
- **Fictional system:** star mass and luminosity → frost line → planet count and spacing (loose Titius–Bode-like spacing, with a stability check of ≥ ~10 mutual Hill radii between neighbors) → mass and type by distance → moons inside the Hill sphere → asteroid belts. All of it is parameterised so that difficulty can tune it.

## State management and persistence

- **zustand** stores. Two kinds:
  - `world`: simulation and game state. It is serializable, with no Three.js objects, and changes only through explicit actions (`addNode`, `editNode`, `commitTime`, …).
  - `view`: selection, camera focus, filters, preview time, and panel state. It is not saved with the game, or is saved separately.
- Render components read positions every frame from the sim (via `useFrame`), not through React state. This avoids re-rendering React at 60 Hz.
- **Saves:** `{ version, seed, scenarioParams, worldSnapshot }` in IndexedDB. Snapshots are small because bodies are regenerated from the seed.

## Tooling

- **Vite** for dev and build, **Vitest** for unit tests.
- The physics core is tested against known values: textbook Kepler problems, Hohmann Δv for Earth→Mars, Lambert test cases, and known planet positions at a reference epoch.
- ESLint import rules enforce the layer dependency rule.

## Open questions

1. Are finite or low-thrust burns needed in v1, or are impulsive burns enough? 
 > Impulsive burns are good for v1, later versions will add more realistic finite-thrust burns.

2. Real-time with pause, or discrete turns?
 > Real-time with pause. 

3. Does the player control many ships at once (fleet), or mainly one ship at a time? This affects UI density and how many trajectories need to be recomputed.
 > Control (eg. maneuver nodes) is per-ship. The player will manage and control a fleet of ships, but only a single ship at a time.

4. Are there ship-to-ship interactions, such as rendezvous, docking, and refuelling? Rendezvous needs relative-motion tools and finer precision. 
 > Rendevous is accomplished from the map screen. Maneuver planning tools assist with rendevous (ie. match target velocity). Docking is automatic when ships are in proximity (eg. < 500 m separation, < 2 m/s relative velocity).

5. Are surface landings or atmospheres modeled, or is everything orbital?
 > Surface landings and atmospheric flight are not modeled in v1. Later iterations may include surface landing and atmospheric flight, but these will be highly simplified.

6. Is mobile or touch support a goal?
 > Mobile support is not a goal. VR support is a possible future goal.