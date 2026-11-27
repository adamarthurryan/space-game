# System Architecture

This document covers how the game is built. What the game does is in [features.md](features.md), the build order is in [milestones.md](../planning/milestones.md), and open questions and decisions are in [decisions.md](decisions.md).

## Technical constraints

- Purely client-side, browser-based. TypeScript, plain three.js for the map, React for the UI panels. Desktop browsers, with mouse and keyboard. React Three Fiber (R3F) hosted the map up to milestone 1 sprint 2 and was replaced with plain three.js at the start of sprint 3 (decision 90).
- **The simulation is independent of rendering.** Everything below `store/` is plain TypeScript with no React or Three.js, and can be unit-tested headlessly.
- **World state is plain data:** objects, arrays and typed arrays keyed by ID, with no class instances and no functions. Sim code is functions over that data. This makes saves a straight serialisation, and keeps the option of moving the sim into a Web Worker later (see [Threads](#threads)).
- **Reproducibility:** generation is seeded, so the same seed and generator version give the same system. Sim code uses no `Math.random` and no wall-clock time, so a world loaded from a save recomputes the same trajectories and event times on the same browser engine. Input replay is not a goal: saves store full world snapshots.
- **Scale:** the late game has hundreds of bodies, tens to hundreds of ships, and dozens of stations, at time warps up to ×10⁷. Anything that runs per object per frame must be cheap.

## Layered structure

```
┌──────────────────────────────────────────────────────────────┐
│ ui/         React DOM: panels, inspectors, timeline, screens  │
│ render/     three.js: bodies, orbits, trajectories, overlays  │
├──────────────────────────────────────────────────────────────┤
│ store/      View state (zustand), world access, job worker    │
├──────────────────────────────────────────────────────────────┤
│ game/       Player actions & their rules, scenario,           │
│             progression & unlocks, win/lose                   │
│ gen/        Seeded system & scenario generation               │
├──────────────────────────────────────────────────────────────┤
│ economy/    Stockpiles, facilities, production, construction, │
│             crew, ecosystem & population, logistics routes    │
│ knowledge/  Survey: detection, orbit determination, assays    │
├──────────────────────────────────────────────────────────────┤
│ planning/   Maneuver planning tools (impulsive & low-thrust)  │
│ sim/        Clock, event queue, bodies, ships, stations,      │
│             trajectories, nodes, thrust arcs, environment     │
│ orbital/    Pure math: Kepler, SOI, Lambert, integrators      │
│ math/       Vec3 (float64), units, root finding, PRNG         │
└──────────────────────────────────────────────────────────────┘
  content/    Game data as typed TypeScript: module types, resources,
              recipes, structures. Importable from any layer.
```

- **Dependency rule:** each layer imports only from layers below it, plus `content/`. Everything except `ui/`, `render/` and `store/` must not import React or Three.js. ESLint import rules enforce this.
- **Rules that span layers live in `game/actions.ts`.** Every player action (`addNode`, `runTool`, `setAlarm`, `assignRoute`, `queueConstruction`, …) goes through it. It checks the rules that need knowledge of higher layers (for example, a transfer target's orbit must be known well enough), then calls into `planning/`, `sim/` or `economy/`. Lower layers never check those rules themselves.
- **Content as data:** ship module types and other game content are typed data files, separate from code that uses them (see [Content files](#content-files)).

Source layout:

```
src/
  math/       vec3.ts, units.ts, roots.ts, rng.ts, pqueue.ts
  orbital/    elements.ts, kepler.ts, propagate.ts, soi.ts, lambert.ts, frames.ts,
              approach.ts, integrate.ts, lagrange.ts
  sim/        clock.ts, events.ts, body.ts, ship.ts, station.ts, fleet.ts,
              trajectory.ts, maneuver.ts, thrustArc.ts, proximity.ts, alarms.ts,
              environment/ (radiation.ts, solar.ts), world.ts
  planning/   basic.ts, plane.ts, transfer.ts, rendezvous.ts, lowThrust.ts
  knowledge/  detection.ts, orbitDetermination.ts, assay.ts, display.ts
  economy/    stockpile.ts, facility.ts, rates.ts, construction.ts, crew.ts, routes.ts
  game/       actions.ts, progression.ts, scenario.ts, rules.ts
  gen/        realSystem.ts, fictionalSystem.ts, composition.ts, scenario.ts
  content/    types.ts, registry.ts, resources.ts, designs.ts, recipes.ts, structures.ts,
              modules/ (one file per module type)
  store/      useWorld.ts, useView.ts, jobs.ts, jobWorker.ts
  render/     Scene.tsx (React host), MapRenderer.ts, stages.ts, mapFrame.ts, projection.ts,
              precision.ts, picking.ts, trajectoryGeometry.ts, trajectoryMarkers.ts, NodeGizmo.ts,
              layers/ (bodies, orbits, trajectories, markers, minor bodies), input/ (camera,
              pointer), overlays/ (labels, declutter, trajectory markers), camera/ (controller,
              framing, camera stage)
  ui/         layout/, panels/, fleet/, timeline/, planner/, economy/, construction/, designer/
```

`gen/scenario.ts` builds the starting world for a scenario; `game/scenario.ts` holds the rules that run during it (goals, failure checks).

## Threads

- **The sim runs on the main thread.** The world is a single plain object. The clock advances it once per frame, before rendering. The renderer's frame stages read positions from it directly; React panels re-render from a world version counter (see [State management and persistence](#state-management-and-persistence)). Interactive work, such as recomputing the active ship's trajectory while a node is dragged, is a direct function call with no thread round trip.
- **Heavy, pure computations run as jobs in a Web Worker.** `store/jobs.ts` sends a named job and its plain-data arguments to `store/jobWorker.ts`, which calls the matching pure function from `orbital/` or `planning/`, and returns the result as a promise. Large jobs are split into chunks so they can report progress and be cancelled. Jobs:
  - the porkchop grid (one Lambert solve per cell);
  - batch Lambert sweeps for transfer windows;
  - later, if profiling shows the need: batch trajectory recomputation and closest-approach searches.
- **Moving the whole sim to a worker** stays possible, because world state is plain data and the sim has no rendering dependencies. Do it only if profiling at scale (milestone 1, sprint 10, and again with the economy in milestone 3) shows frame drops from sim work.

## Content files

Ship module types, and the other content the game reads, are **typed TypeScript data files** in `src/content/`. There is **one file per module type**. Each file exports an array of definitions, checked against its type with `satisfies`. TypeScript then checks the fields and the cross-references in the editor and at build time, with no parser or runtime schema library.

```
src/content/
  types.ts                # ModuleBase and one type per module kind
  registry.ts             # lookup by ID and by kind
  resources.ts            # raw and refined resources; defines ResourceId
  recipes.ts              # facility inputs → outputs
  structures.ts           # habitats and megastructures (Bernal sphere, O'Neill segment, …)
  modules/
    backbones.ts          # structural backbones: mass and volume limits, capability flags
    engines.ts            # chemical, solid-core NTR, gas-core NTR, nuclear electric, …
    energy-sources.ts     # solar arrays, fission reactors, (fusion cores), batteries
    radiators.ts          # heat rejection capacity
    tanks.ts              # propellant and volatile storage, by stored resource
    cargo.ts              # holds for bulk and packaged goods
    crew.ts               # crew compartments, life support, storm cellars
    shielding.ts          # water jackets, HDP liners, magnetic deflection
    tools.ts              # survey instruments, mining rigs, harvesters, tug clamps
    facilities.ts         # station modules: refineries, factories, shipyards, docks, habitats
```

**Types:**

- Resource IDs are the keys of the `resources` object, so a misspelt resource in a recipe, propellant or material list is a type error.
- Every module type extends a **shared base type**, and adds only the fields its kind needs. Fields are added when the system that reads them is built (for example, landing capability flags arrive with landing).
- A module's family is its **`category`** discriminant (`'backbone' | 'engine' | 'tank'` so far), so `Engine.kind` stays the engine type. Units inside `content/` are fixed by convention: mass in kg, volume in m³, thrust in N, Isp in s; `sim/` converts where needed (decision 93).
- **Preset designs** (`content/designs.ts`) name a backbone, modules with counts, and an inert payload mass. A ship copies them when it is created, so changing a design never changes existing ships (decision 94).

```ts
// resources.ts
export const resources = {
  hydrogen: { name: 'Hydrogen', kind: 'refined' },
  'structural-metals': { name: 'Structural metals', kind: 'raw' },
  // …
} as const satisfies Record<string, Resource>;
export type ResourceId = keyof typeof resources;

// types.ts
interface ModuleBase {
  id: string; // unique across all module files
  name: string;
  mass: number; // kg, dry
  volume: number; // m³, counted against the backbone's limit
  materials: Partial<Record<ResourceId, number>>; // build cost, kg
  unlock?: UnlockCondition; // resource-gated unlock (see features.md)
  power?: number; // kW; negative = consumes (electric drives draw here)
  heat?: number; // kW of waste heat
  crewRequired?: number;
}

interface Engine extends ModuleBase {
  category: 'engine';
  kind: 'chemical' | 'ntr-solid' | 'ntr-gas' | 'electric'; // 'chemical' only so far
  thrust: number; // N
  isp: number; // s
  propellant: Partial<Record<ResourceId, number>>; // mass fraction of each propellant, summing to 1
}
```

Whether an engine's burns are treated as impulsive, as a finite burn or as a thrust arc is not stored: it follows from the burn duration, which depends on thrust and the ship's mass. Whether a drive needs external power follows from its `power` field.

Example entry in `modules/engines.ts`:

```ts
export const engines = [
  {
    id: 'ntr-solid-small',
    name: 'Solid-core NTR (25 kN)',
    category: 'engine',
    kind: 'ntr-solid',
    mass: 2300,
    volume: 9,
    thrust: 25000,
    isp: 900,
    propellant: { hydrogen: 1.0 },
    heat: 1200,
    materials: { 'structural-metals': 1800, fissiles: 40, 'precious-metals': 5 },
    unlock: { delivered: { fissiles: 2000 } },
  },
] as const satisfies readonly Engine[];
```

**Checks:**

- Type checking covers field names and types, and resource-ID references.
- A Vitest content test covers what types can't: IDs unique across all files, module-ID references in structures and unlocks, and sanity checks (positive mass and volume, non-empty propellant for engines that need it). It runs with the rest of the test suite.
- Content edits hot-reload in dev like any other module.
- `registry.ts` builds the read-only lookups: `registry.engines`, `registry.byId(id)`, and so on.

**Adding a module type:** add a file in `modules/`, a type extending `ModuleBase`, and a registry entry. Code that reads module stats should use the shared base fields where it can, so a new type often needs no other code changes. That code includes design validation, derived stats, the power and heat balance, and the designer UI.

**Saves** store module IDs, not copies of the definitions. So a balance change to a content file applies to existing saves.

## Units, precision and rendering scale

- **Units:** `km`, `s`, `kg`, `km/s`, `kW`, `mSv`. Time is seconds from the scenario epoch, as a float64 `number`.
- **Precision:** a solar system spans ~10¹⁰ km, but docking happens at a few hundred metres. Float64 is enough, as long as relative positions between ships are computed in a frame local to the pair and not from heliocentric positions.
- **Camera-relative rendering:** the GPU is float32. The scene's axes are the world axes in km, and its **origin is the camera focus point**: every frame, positions minus the origin are computed in float64, _then_ converted to float32 (`render/precision.ts`), so nothing on the GPU holds a world position. During a refocus the origin moves between the two bodies, both evaluated at the current `t` (decision 77).
- **Depth:** a logarithmic depth buffer with fixed near (1e-3 km) and far (1e12 km) planes; every custom shader includes three's `logdepthbuf` chunks (decision 78).
- **Orbit lines:** a body's orbit is drawn around its parent, resampled from its mean elements at `t` every frame in float64 and starting at the body, so the body always sits on its line (decision 80). Ship trajectories are drawn relative to the focus body (or a focused ship's parent), each point expressed in that frame at its own time, and written through the same float64 → float32 path (decisions 106, 107).
- **Display scale:** bodies are drawn at true size when close, with a minimum screen-space size. Zoom is logarithmic. Minor bodies use instanced rendering, and their orbit lines are only drawn on demand.

**Rendering conventions** (plain three.js; decision 90):

- **One renderer, one loop.** `render/MapRenderer.ts` owns the `WebGLRenderer`, the scene, the camera, a `ResizeObserver`, the map input listeners (`render/input/`) and the `requestAnimationFrame` loop; it is the only place in `render/` that reads the wall clock. `render/Scene.tsx` is the only React component apart from the DOM overlays: it creates the renderer in an effect, disposes it on unmount, and renders the label and trajectory-marker overlays (decision 91).
- **Frame stages** run in the order of `STAGES` (`render/stages.ts`) and share a per-scene `MapFrame` of plain arrays (`render/mapFrame.ts`), allocated once per body system: the clock, body world positions, ship world positions, the camera (which sets the origin, and may follow a ship), the projection of every body and ship to the screen, the scene layers, then the labels and trajectory markers (decisions 84, 92). The clock stage runs `advanceWorld`, which handles sim events, before all render updates. The ship arrays are reallocated only when the set of drawn ships changes.
- **Layers** are classes (`render/layers/`: bodies, orbits, trajectories, markers, drawn in that order) with `update(frame, view)`, an optional `sync(world)` called when the store version changes, and `dispose()`. One layer per kind of object (all bodies, all orbits, all trajectories), iterating the world, rather than one object per entity. A layer rebuilds its three.js objects only when the set of entities changes, never per frame.
- **Logic stays out of three.js:** projection, picking, decluttering, fades, framing and the camera controller are pure TypeScript modules, tested headlessly; the layers and the renderer only apply their results to three.js objects.
- **Picking is screen-space** (`render/picking.ts`): from the projection stage, the nearest ship marker within reach that isn't behind a nearer disc, then the nearest disc under the cursor, then a label, then the nearest body marker within a pixel radius (decisions 82, 110). Map input uses DOM listeners on the canvas. Real meshes that need exact hits, such as the node gizmo's handles (sprint 4), use a `Raycaster` from the same listeners.
- **Bodies on screen:** true-size spheres, a fixed-size marker below 3 px of disc radius, and a body within 6 px of its parent's centre merges into it (decision 79). **Ships** are 7 px triangles in their palette colour; a ship near its parent's centre merges the same way unless it is focused or selected (decision 110).
- **Labels are a custom DOM overlay** with priority decluttering, positioned every frame by the labels stage (decision 83). Ship labels rank below dwarf planets and above moons. Trajectory marker texts are placed after the labels and give way to them (decision 109).

## Celestial bodies

- **World frame:** heliocentric, ecliptic and mean equinox of J2000 (the frame Horizons calls "ecliptic"). The Sun is the root, fixed at the origin. Every body frame is non-rotating and parallel to the world frame, so changing frame is a translation of position and velocity (decision 54).
- **Time:** sim time `t` is TDB seconds from the scenario epoch, which is stored as a Julian date (`epochJd`). There is no UTC (decision 55).
- A **body tree**: star → planets → moons (`sim/body.ts`). A body stores `mu` (GM, not mass), its mean radius, an atmosphere height, its orbit relative to its parent, and its spin pole and prime meridian. `buildBodySystem` derives `major`, `soiRadius` (Laplace: `a·(m/M)^(2/5)`) and `childIds` once and stores them, so a `BodySystem` is plain, self-contained data (decisions 62, 63, 69).
- **Major vs. minor:** a body under 10¹⁹ kg is **minor**. Minor bodies have no SOI, so patched-conic frame switches never involve them. They are treated as rendezvous targets, like ships. This keeps SOI checks cheap with hundreds of asteroids (decision 61).
- **Orbits on rails:** a body's orbit is a set of **mean elements**: elliptic elements at `t = 0`, a mean motion `n` and optional linear rates for `a`, `e`, `i`, `Ω` and `ω`, relative to a reference plane given by its pole (the ecliptic if absent). The state at `t` comes from the elements at `t` through Kepler's equation (Newton's method). Its velocity uses `μ_eff = n²a³` plus the rates' contributions, so it is the derivative of the position (decisions 58, 59).
- **Position at `t`:** world position = the sum up the tree. A state is moved between body frames through their **lowest common ancestor**, so Earth ↔ Moon never touches heliocentric magnitudes. There is no n-body perturbation (decision 64).
- **Ship orbits** are propagated with universal variables, for any conic (decision 65). `orbital/elements.ts` converts between state vectors and elements that use the semi-latus rectum and the true anomaly, so one type covers ellipses, parabolas and hyperbolas (decision 66).
- **Lagrange points** (`orbital/lagrange.ts`) are computed geometrically per star–planet and planet–moon pair. An object "at an L-point" is placed on rails at that position, with station-keeping assumed. Patched conics can't reproduce the dynamics of Lagrange points.
- **Real-system data** (`gen/realSystem.ts`, for epochs from 3000 BC to 3000 AD): the planets from JPL's "Keplerian Elements for Approximate Positions of the Major Planets", Tables 2a/2b, evaluated at the epoch (decision 56). Earth sits on the Earth–Moon barycentre's orbit, about 4,700 km from the true Earth, and the Moon orbits Earth (decision 57). Moons come from JPL's planetary satellite mean elements, used as given (decision 71). Physical data and spin come from JPL, DE440 and the IAU (decisions 62, 69). The source tables are typed data files in `gen/data/`, transcribed verbatim in their own units (decision 68). A sample of numbered asteroids arrives in sprint 8.
- **Accuracy is not a goal:** the game needs a plausible solar system, not an ephemeris. Comparisons with Horizons catch implementation errors, and some moons drift from their real positions (decisions 60, 70, 71).

## Ships, stations and stacks

- A ship or station is **one backbone plus a set of module instances**, each referencing a content definition by ID, plus stockpiles, crew and (for ships) a trajectory plan.
- **Design validation:** total module mass and volume must fit within the backbone's limits. Later, capability flags (landing-rated backbone, landing gear, landing-incompatible modules, aerodynamic envelope) decide whether a design can land or fly in an atmosphere.
- **Derived stats** are computed from the modules and the current stockpiles, and cached until either changes:
  - mass and volume used vs. backbone limits, thrust and Isp per engine, Δv;
  - power and heat balance;
  - shielding factor.
- **Stacks:** docked objects form a stack that propagates as one body with summed mass. Towing is just a stack flown by a tug's engines. Stations are stacks with no engines, held on rails.

## Trajectories

A trajectory is an ordered list of segments. Every segment has a `kind` discriminant, and every consumer switches on it exhaustively (with a `never` check), so adding a segment kind makes the compiler list every place that must handle it.

```ts
type Segment = ConicSegment; // milestone 3 adds ThrustSegment

interface ConicSegment {
  // coasting, analytic
  kind: 'conic';
  parentId: BodyId;
  r0: Vec3;
  v0: Vec3; // state at tStart, in the parent frame
  tStart: number;
  tEnd: number;
  endEvent: 'soi-exit' | 'soi-enter' | 'impact' | 'horizon'; // sprint 4 adds 'maneuver'
  endTargetId?: BodyId; // the body entered, exited to, or impacted
}
```

A conic segment stores its starting state vector, because universal-variable propagation works from it directly and stays robust for hyperbolic and near-parabolic orbits. Orbital elements (Pe, Ap, inclination, …) are derived from it for display.

**Coasting propagation** (`sim/trajectory.ts`, decisions 97, 98):

1. Universal-variable Kepler propagation, which handles elliptic, parabolic and hyperbolic orbits in one formulation.
2. Find the earliest of these events: the next node or arc (sprint 4), impact (`|r| = radius + atmosphere height`, inbound) and SOI exit (`|r| = soiRadius`, outbound), both solved in closed form from the conic (`orbital/soi.ts`, `timeToRadius`), and SOI entry into a major child body whose radial band overlaps the ship's. Entry is found by **conservative advancement** on `f(t) = |r_ship − r_child| − R_soi`, stepping `f / v_rel,max` (never less than `R_soi / (100·v_rel,max)`), then Brent on the first sign change, so an entry can't be stepped over (a graze shallower than about 1% of the SOI may be missed). Ties go to impact, then exit, then entry. A segment that starts on an SOI boundary never ends less than 1 s later.
3. At the event: transform the state to the new frame, apply the Δv, or start a thrust segment.
4. Stop after **5 segments** or at the **10-year horizon** from the trajectory's start.

A ship's `orbit` is the state at the start of its **current** segment: it is re-based at every SOI event and at the horizon, so the current segment is always segment 0, and up to five patches are always computed ahead (decision 96).

**Thrust segments** (milestone 3):

```ts
interface ThrustSegment {
  // engine on, numerically integrated
  kind: 'thrust';
  parentId: BodyId;
  samples: Float64Array; // [t, x, y, z, vx, vy, vz, m] per integrator step
  tStart: number;
  tEnd: number;
  endEvent: 'thrust-end' | 'soi-exit' | 'soi-enter' | 'propellant-out' | 'impact';
}
```

- Two-body gravity, plus thrust, plus the change in mass. Integrated with Dormand–Prince RK45 (`orbital/integrate.ts`).
- The SOI radius is checked at every step, and the crossing is refined with root finding.
- `F = throttle × F_max(power available)`. Solar-electric `F_max` scales with the solar flux, ∝ 1/r². `mdot = F / (Isp·g0)`.
- Coasting segments then also end at `'thrust-start'`.

**Plan representations:**

```ts
interface ManeuverNode {
  // impulsive (planning abstraction)
  id: NodeId;
  shipId: ShipId;
  t: number;
  enabled: boolean;
  dv: { prograde: number; normal: number; radial: number }; // km/s, local orbital frame
  execution: 'impulsive' | 'finite'; // 'finite' (milestone 3) = burn centred on t
}

interface ThrustArc {
  // explicit low-thrust burn (milestone 3)
  id: ArcId;
  shipId: ShipId;
  enabled: boolean;
  tStart: number;
  duration: number;
  steering: SteeringMode;
  throttle: number; // 0–1
  engineId: ModuleId;
}
```

A node with `execution: 'finite'` is converted to a thrust segment of the same Δv when the trajectory is computed. The burn duration of a node (from thrust and mass) is always shown, and a node whose burn is long compared with the orbit period is flagged.

**Caching:** trajectories are computed lazily, and cached by ship state plus plan. Only the active ship's plan can be edited, so interactive recomputation only ever affects one ship. While a handle is being dragged, thrust arcs are integrated with a coarser tolerance; the full-accuracy result replaces it when the drag ends.

## Closest approach and docking detection

- **Closest approach** (`orbital/approach.ts`): for each overlapping time window, express both states in the parent frame of one of the two objects. Bracket on the sign change of `r_rel · v_rel`, and refine with Brent's method. Relative state is computed in that local frame.
- **Scheduled docking:** every predicted approach that meets the docking criteria is put on the event queue ahead of time. Docking is then resolved exactly at that time, even at high warp, and never by checking each frame.
- **Pair pruning:** only pairs in the same SOI, with overlapping time windows, where at least one object has a plan or a target, are tested. This avoids testing every pair, which is O(n²).

## Planning tools

Each tool in `planning/` is a pure function `(world, shipId, params) → (ManeuverNode | ThrustArc)[]`. The outputs are ordinary plan items. Tools don't check game rules such as target knowledge: `game/actions.ts` does that before calling them. Supporting math lives in `orbital/`: a Lambert solver (Izzo's algorithm), Hohmann and phase-angle calculations, and Edelbaum estimates.

## Environment

- Every model is analytic in position and time, so it can be evaluated cheaply at any warp:
  - background radiation is a function of distance from the star;
  - radiation belts are tori per body;
  - solar storms are expanding shells, with seeded onset times;
  - solar flux ∝ 1/r².
- **Dose** = ∫ (rate × shielding factor) dt along a trajectory. It is computed by quadrature per segment and cached with the trajectory.
- **Power and heat** are a static balance per stack, re-solved when modules, stockpiles or solar flux change enough to matter. Shortfalls throttle consumers in a fixed priority order.

## Knowledge (true vs. known world)

The world holds the **true** state. Each body also has a knowledge record. The UI and the map read bodies through a known-world selector (`knowledge/display.ts`), which hides undetected bodies and shows estimates in place of true values. This is a presentation rule, not a security boundary: it is a single-player game.

```ts
interface BodyKnowledge {
  orbitSigma: number; // position uncertainty, km; Infinity = undetected
  composition: 'unknown' | 'spectral-estimate' | 'assayed';
  compositionEstimate?: Record<ResourceId, [low: number, high: number]>;
  radiationBeltsMapped: boolean;
}
```

- Survey campaigns produce observations at deterministic times, as events. Each observation updates the knowledge record.
- **Displayed orbit:** the true elements, offset by seeded noise scaled by `orbitSigma`, computed on demand and drawn with an uncertainty band. Nothing extra is stored, and the estimate converges on the true orbit as sigma shrinks.
- **Planning uses true elements.** `game/actions.ts` refuses transfer targets whose `orbitSigma` is above a threshold, so predicted encounters never drift as estimates improve.

## Economy

Ship and station stockpiles, facilities, crew and construction are advanced in **fixed sim-time steps** (proposed: 1 hour of sim time). In each step, the economy:

1. resolves the rates at each location, limited by inputs, power, crew and storage, with facilities served in priority order;
2. applies those rates for the step;
3. raises events when a stockpile empties or fills, construction completes, or a threshold is crossed. These are accurate to one step.

- At ×10⁷ warp this is about 2,800 steps per real second. Each step is a small amount of arithmetic per location, which is cheap for dozens of stations.
- Fixed steps put no constraint on the shape of the models, so the ecosystem and population model (still open) can be non-linear.
- **Forecasts** ("water runs out in 41 d", alarm lead times) extrapolate from the current rates, and are recomputed when rates change.
- Docked transfers are rates with a completion event, like construction.
- **If profiling shows the steps are too costly,** stretches where every rate is constant can be solved analytically between events instead. The rate resolution code is the same either way.

## Logistics routes

`economy/routes.ts` runs a route as a **program of steps**. Planning steps ("Hohmann to B", "match velocity") call the planning tools, each evaluated against the predicted state at the end of the step before it. Economy steps ("unload volatiles") act on stockpiles. A step that fails (no window, too little propellant, destination full) stops the ship and raises an alarm.

## Clock and event queue

- `clock` holds `t`, the warp step and `paused`. Each frame, `advanceWorld` (`sim/world.ts`) aims for `t + min(dt_wall, 0.25 s) × warp`; while the next event in the **priority queue** is due by then, it sets `t` to the event's time exactly and dispatches it. Handlers may queue events, which run in the same frame if due. At most 256 events run per frame; past that, `t` stays at the last one and time runs slower rather than skipping events (decision 99). Economy steps run for the sim time that passes.
- Each ship has **at most one pending event**: the end of its current segment (`soi-change`, `impact` or `trajectory-horizon`). An event carries the trajectory version it was queued for, and a handler ignores a stale one (decisions 99, 100).
- **Derived data:** the trajectories and the event queue live in `world.derived`, and `rebuildDerived(world)` recomputes them from the ships. Saves strip `derived` and rebuild it, so the queue is never saved (decision 101).
- Event sources:
  - plans: nodes, the start and end of arcs;
  - trajectories: SOI changes, closest approaches, docking, impact;
  - the economy: stockpile limits, construction completion, ecosystem and population thresholds;
  - knowledge: survey results;
  - the environment: storm warning and onset;
  - alarms, and scenario events.
- Handlers are registered by event type in an `EventRegistry` object passed to `advanceWorld` (`sim/events.ts`), so the queue doesn't import higher layers and no module-level state is shared. The store creates the registry with the ship handlers.
- At each event, the handler decides whether to pause, drop warp, or continue.
- Physical state changes only at events: plan execution, docking, undocking, construction completion. **Preview time** is view state only. Rendering reads `viewTime`; the sim only advances `t`.

## Alarms

```ts
interface Alarm {
  id: AlarmId;
  scope:
    | { kind: 'ship'; shipId: ShipId }
    | { kind: 'fleet'; fleetId: FleetId }
    | { kind: 'station'; stationId: StationId }
    | { kind: 'global' };
  trigger:
    | { kind: 'plan-item'; itemId: NodeId | ArcId } // a node, or an arc's start
    | { kind: 'event-type'; type: SimEventType; targetId?: ObjectId; once?: boolean }
    | { kind: 'time'; t: number };
  leadTime: number; // seconds before the event
  action: 'pause' | 'drop-warp';
}
```

- Every trigger is keyed by something that stays stable when the player replans: a plan item's ID, an event type (optionally narrowed to a target), or a time. There is no matching of individual predicted events across replans.
- Setting an alarm "on this event" from the timeline creates a `plan-item` trigger for a node or arc. For any other event, it creates an `event-type` trigger for that ship, narrowed to the event's target, with `once: true` (for example, "next SOI entry into the Moon").
- An alarm on a deleted plan item is deleted with it.
- Fleet scope is resolved when the alarm is evaluated, so it covers ships added to the fleet later.

## Generation pipeline

- A seeded PRNG (e.g. `sfc32`) with **one sub-stream per subsystem** (`rng.fork('planets')`), so that adding a feature doesn't reshuffle existing seeds.
- **Fictional system:**
  1. Star → frost line.
  2. Planets: count and spacing (stability check of ≥ ~10 mutual Hill radii), then mass and type by distance.
  3. Moons inside each planet's Hill sphere.
  4. Minor bodies (belts, comets).
  5. Radiation belts.
  6. Composition (`gen/composition.ts`).
  7. A reachability check that guarantees a minimum reachable amount of each resource.
- **Real system:** a fixed catalog. The seed varies the epoch, the scenario, resource details and storm timing.

## State management and persistence

- **The world** is the plain-data object described above. `store/useWorld.ts` holds it and a version counter, which is bumped after each frame in which the world changed and after each player action. React panels subscribe to the counter, through selectors, and re-render when it changes.
- **Player actions** (`addNode`, `editArc`, `setAlarm`, `assignRoute`, `queueConstruction`, …) are calls into `game/actions.ts`.
- **`view`** (zustand): active ship, selection, target, camera, filters, preview time, and the open screens. It is not saved.
- The renderer reads positions from the world every frame, not through React state. Panels that show changing values use `useSimTime` (10 Hz).
- **Saves:** `{ version, seed, scenarioParams, world }` in IndexedDB. The snapshot holds the full true world, including the bodies. Nothing is regenerated from the seed on load, so changes to the generators don't break saves. While the game is in development, a save with a different `version` is refused, not migrated.

## Tooling and testing

- **Vite** (with worker bundling, for the job worker), **Vitest**, ESLint import rules.
- **Physics tests:**
  - Kepler textbook cases, Earth→Mars Hohmann Δv, Lambert test cases;
  - planet positions at a reference epoch;
  - closest-approach accuracy at docking scale;
  - integrator energy drift, and low-thrust spirals against Edelbaum estimates.
- **Content tests:** ID uniqueness, module-ID cross-references, value sanity (see [Content files](#content-files)).
- **Economy tests:** conservation of mass; results stable as the step size is reduced.
- **Save tests:** a saved and reloaded world gives the same trajectories and event times.

## Later features

- **Landing and atmospheric flight:** an abstract action, not a flight simulation. A planning-tool-like function checks the ship's capability flags, then computes the resource and Δv cost from its mass and the body's gravity (and atmosphere). The result is executed as an event that moves the ship between orbit and a surface location. A surface location is a stockpile location attached to the body, so the economy needs no special case.
- **VR:** three.js supports WebXR through `renderer.xr`. Map picking is screen-space today; VR would add ray-based picking from a controller, alongside the raycasting the node gizmo already uses. Keep map interactions in the 3D scene where practical, so that they can work with a controller ray.
