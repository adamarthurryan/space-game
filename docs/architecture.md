# System Architecture

This document covers how the game is built. What the game does is in [features.md](features.md), the build order is in [milestones.md](milestones.md), and open questions and decisions are in [decisions.md](decisions.md).

## Technical constraints

- Purely client-side, browser-based. TypeScript, Three.js, React Three Fiber (R3F). Desktop browsers, with mouse and keyboard.
- **Determinism:** same seed + same player inputs ⇒ same outcome on the same browser engine. Inputs are timestamped in sim time, not wall time. `Math.sin`, `Math.exp` and similar functions are not guaranteed to give bit-identical results across JS engines, so saves store full world snapshots and don't rely on replaying inputs.
- **The simulation is independent of rendering.** It can be unit-tested headlessly, and it runs in a Web Worker.
- **Scale:** the late game has hundreds of bodies, tens to hundreds of ships, and dozens of stations, at time warps up to ×10⁷. Anything that runs per object per frame must be cheap. Ongoing processes (production, consumption, dose) are solved analytically between events, not stepped every tick.

## Layered structure

```
┌──────────────────────────────────────────────────────────────┐
│ ui/         React DOM: panels, inspectors, timeline, screens  │
│ render/     R3F scene: bodies, orbits, trajectories, overlays │
├──────────────────────────────────────────────────────────────┤
│ store/      App state (zustand) + bridge to the sim worker    │
├──────────────────────────────────────────────────────────────┤
│ game/       Scenario rules, progression & unlocks, win/lose   │
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
  content/    Structured text files, one per module type (engines,
              energy sources, …) plus resources, recipes, structures
```

- **Dependency rule:** each layer imports only from layers below it. Everything except `ui/`, `render/` and `store/` must not import React or Three.js. ESLint import rules enforce this.
- **Content as data:** ship module types and other game content are defined in structured text files, one file per type, so they can be edited without touching code (see [Content files](#content-files)).

Source layout:

```
src/
  math/       vec3.ts, units.ts, roots.ts, rng.ts, pqueue.ts
  orbital/    elements.ts, kepler.ts, propagate.ts, soi.ts, lambert.ts, frames.ts,
              approach.ts, integrate.ts, lagrange.ts
  sim/        clock.ts, events.ts, body.ts, ship.ts, station.ts, fleet.ts,
              trajectory.ts, maneuver.ts, thrustArc.ts, proximity.ts, alarms.ts,
              environment/ (radiation.ts, solar.ts), world.ts
  planning/   basic.ts, plane.ts, transfer.ts, rendezvous.ts, lowThrust.ts, program.ts
  knowledge/  detection.ts, orbitDetermination.ts, assay.ts
  economy/    stockpile.ts, facility.ts, rates.ts, construction.ts, crew.ts, routes.ts
  game/       progression.ts, unlocks.ts, scenario.ts, rules.ts
  gen/        realSystem.ts, fictionalSystem.ts, composition.ts, scenario.ts
  content/    loader.ts, registry.ts, schemas/ (one schema per content file)
  store/      useWorld.ts, useView.ts, simWorker.ts
  render/     Scene.tsx, BodyMesh.tsx, MinorBodies.tsx, OrbitLine.tsx, TrajectoryLine.tsx,
              NodeGizmo.tsx, overlays/, camera/
  ui/         layout/, panels/, fleet/, timeline/, planner/, economy/, construction/, designer/
```

**Worker split:** the layers from `sim/` up to `game/` run in a **Web Worker**. The main thread keeps a read-only mirror of the world, updated by diffs, and sends player actions to the worker as messages. The main thread evaluates positions needed every frame (bodies on rails, coasting conics) itself, from the mirrored elements.

## Content files

Ship module types, and the other content the game reads, live in **structured text files** in a top-level `/content` folder. There is **one file per module type**. Proposed format: YAML. Each file is a list of definitions of that type.

```
content/
  modules/
    backbones.yaml        # structural backbones: mass and volume limits, capability flags
    engines.yaml          # chemical, solid-core NTR, gas-core NTR, nuclear electric, …
    energy-sources.yaml   # solar arrays, fission reactors, (fusion cores), batteries
    radiators.yaml        # heat rejection capacity
    tanks.yaml            # propellant and volatile storage, by stored resource
    cargo.yaml            # holds for bulk and packaged goods
    crew.yaml             # crew compartments, life support, storm cellars
    shielding.yaml        # water jackets, HDP liners, magnetic deflection
    tools.yaml            # survey instruments, mining rigs, harvesters, tug clamps
    facilities.yaml       # station modules: refineries, factories, shipyards, docks, habitats
    landing.yaml          # (later) landing gear, aerodynamic envelopes
  resources.yaml          # raw and refined resources
  recipes.yaml            # facility inputs → outputs
  structures.yaml         # habitats and megastructures (Bernal sphere, O'Neill segment, …)
```

**Schemas:**
- Each file has its own schema in `src/content/schemas/`, written with a runtime-validating library (for example, zod) so that the TypeScript types and the validation come from one source.
- Every module type extends a **shared base schema**. Each file then adds only the fields its type needs.

```ts
const ModuleBase = z.object({
  id: z.string(),                       // unique across all module files
  name: z.string(),
  mass: z.number(),                     // kg, dry
  volume: z.number(),                   // m³, counted against the backbone's limit
  materials: z.record(ResourceId, z.number()),  // build cost, kg
  unlock: UnlockCondition.optional(),   // resource-gated unlock (see features.md)
  power: z.number().default(0),         // kW; negative = consumes
  heat: z.number().default(0),          // kW of waste heat
  crewRequired: z.number().default(0),
  landingCompatible: z.boolean().default(true),
});

const Engine = ModuleBase.extend({
  kind: z.enum(['chemical', 'ntr-solid', 'ntr-gas', 'electric']),
  thrust: z.number(),                   // N
  isp: z.number(),                      // s
  propellant: z.record(ResourceId, z.number()),  // mass ratio of each propellant consumed
  burnModel: z.enum(['impulsive', 'finite', 'arc']),
  powerSource: z.enum(['self', 'external']),     // electric drives draw from energy sources
});
```

Example entry in `engines.yaml`:

```yaml
- id: ntr-solid-small
  name: Solid-core NTR (25 kN)
  kind: ntr-solid
  mass: 2300
  volume: 9
  thrust: 25000
  isp: 900
  propellant: { hydrogen: 1.0 }
  burnModel: finite
  powerSource: self
  heat: 1200
  materials: { structural-metals: 1800, fissiles: 40, precious-metals: 5 }
  unlock: { delivered: { fissiles: 2000 } }
```

**Loading and validation:**
- The loader (`src/content/loader.ts`) imports every file at build time through Vite, and validates it against its schema.
- It then checks **cross-references**: resource IDs in materials, propellants and recipes, and module IDs in structures and unlocks. It also checks that IDs are unique across all files. Any error fails the build, and in dev it shows as an overlay naming the file and the entry.
- Content changes in dev are hot-reloaded.
- The result is a read-only **registry** (`src/content/registry.ts`) that any layer may import: `registry.engines`, `registry.byId(id)`, and so on.

**Adding a module type:** add a YAML file, a schema extending `ModuleBase`, and a registry entry. Code that reads module stats should use the shared base fields where it can, so a new type often needs no other code changes. That code includes design validation, derived stats, the power and heat balance, and the designer UI.

**Saves** store module IDs, not copies of the definitions. So a balance change to a content file applies to existing saves. The save `version` covers content schema changes.

## Units, precision and rendering scale

- **Units:** `km`, `s`, `kg`, `km/s`, `kW`, `mSv`. Time is seconds from the scenario epoch, as a float64 `number`.
- **Precision:** a solar system spans ~10¹⁰ km, but docking happens at a few hundred metres. Float64 is enough, as long as relative positions between ships are computed in a frame local to the pair and not from heliocentric positions.
- **Camera-relative rendering:** the GPU is float32. So every frame, positions minus the camera focus position are computed in float64, *then* converted to float32. Orbit and trajectory polylines are generated in the focus body's frame and re-based when focus changes.
- **Display scale:** bodies are drawn at true size when close, with a minimum screen-space size. Zoom is logarithmic. Minor bodies use instanced rendering, and their orbit lines are only drawn on demand.

## Celestial bodies

- A **body tree**: star → planets → moons. Each non-root body has Keplerian elements relative to its parent, plus `mu`, radius, and SOI radius (Laplace: `a·(m/M)^(2/5)`).
- **Major vs. minor:** a body below a mass threshold is **minor**. Minor bodies have no SOI, so patched-conic frame switches never involve them. They are treated as rendezvous targets, like ships. This keeps SOI checks cheap with hundreds of asteroids.
- **Position at `t`:** mean anomaly → Kepler's equation (Newton's method) → state vector in the parent frame. World position = the sum up the tree. There is no n-body perturbation.
- **Lagrange points** (`orbital/lagrange.ts`) are computed geometrically per star–planet and planet–moon pair. An object "at an L-point" is placed on rails at that position, with station-keeping assumed. Patched conics can't reproduce the dynamics of Lagrange points.
- **Real-system data:** the JPL "Keplerian Elements for Approximate Positions of the Major Planets" table, published mean elements for major moons, and a sample of numbered asteroids.

## Ships, stations and stacks

- A ship or station is **one backbone plus a set of module instances**, each referencing a content definition by ID, plus stockpiles, crew and (for ships) a trajectory plan.
- **Design validation:** total module mass and volume must fit within the backbone's limits. Later, capability flags (landing-rated backbone, landing gear, landing-incompatible modules, aerodynamic envelope) decide whether a design can land or fly in an atmosphere.
- **Derived stats** are computed from the modules and the current stockpiles, and cached until either changes:
  - mass and volume used vs. backbone limits, thrust and Isp per engine, Δv;
  - power and heat balance;
  - shielding factor.
- **Stacks:** docked objects form a stack that propagates as one body with summed mass. Towing is just a stack flown by a tug's engines. Stations are stacks with no engines, held on rails.

## Trajectories

A trajectory is an ordered list of segments:

```ts
type Segment = ConicSegment | ThrustSegment;

interface ConicSegment {           // coasting, analytic
  kind: 'conic';
  parentId: BodyId;
  elements: OrbitalElements;       // or epoch state vector, for hyperbolic/near-parabolic robustness
  tStart: number; tEnd: number;
  endEvent: 'soi-exit' | 'soi-enter' | 'maneuver' | 'thrust-start' | 'impact' | 'horizon';
  endTargetId?: BodyId;
}

interface ThrustSegment {          // engine on, numerically integrated
  kind: 'thrust';
  parentId: BodyId;
  samples: Float64Array;           // [t, x, y, z, vx, vy, vz, m] per integrator step
  tStart: number; tEnd: number;
  endEvent: 'thrust-end' | 'soi-exit' | 'soi-enter' | 'propellant-out' | 'impact';
}
```

Consumers switch on `kind`. The union exists from the first milestone, even before thrust segments are implemented.

**Coasting propagation:**
1. Universal-variable Kepler propagation, which handles elliptic, parabolic and hyperbolic orbits in one formulation.
2. Find the earliest of these events: the next node or arc, SOI exit, SOI entry into a major child body (bracket and refine with root finding), or impact (`|r| < radius + atmosphere height`).
3. At the event: transform the state to the new frame, apply the Δv, or start a thrust segment.
4. Stop at a segment cap or at the time horizon.

**Thrusting propagation** (`orbital/integrate.ts`):
- Two-body gravity, plus thrust, plus the change in mass. Integrated with Dormand–Prince RK45 with **deterministic step control**.
- The SOI radius is checked at every step, and the crossing is refined with root finding.
- `F = throttle × F_max(power available)`. Solar-electric `F_max` scales with the solar flux, ∝ 1/r². `mdot = F / (Isp·g0)`.

**Plan representations:**

```ts
interface ManeuverNode {           // impulsive (planning abstraction)
  id: NodeId; shipId: ShipId; t: number; enabled: boolean;
  dv: { prograde: number; normal: number; radial: number };   // km/s, local orbital frame
  execution: 'impulsive' | 'finite';                         // 'finite' = burn centred on t
}

interface ThrustArc {              // explicit low-thrust burn
  id: ArcId; shipId: ShipId; enabled: boolean;
  tStart: number; duration: number;
  steering: SteeringMode; throttle: number;                   // 0–1
  engineId: ModuleId;
}
```

A node with `execution: 'finite'` is converted to a thrust segment of the same Δv when the trajectory is computed.

**Caching:** trajectories are computed lazily in the worker, and cached by ship state plus plan. Only the active ship's plan can be edited, so interactive recomputation only ever affects one ship. While a handle is being dragged, thrust arcs are integrated with a coarser tolerance; the full-accuracy result replaces it when the drag ends.

## Closest approach and docking detection

- **Closest approach** (`orbital/approach.ts`): for each overlapping time window, express both states in the parent frame of one of the two objects. Bracket on the sign change of `r_rel · v_rel`, and refine with Brent's method. Relative state is computed in that local frame.
- **Scheduled docking:** every predicted approach that meets the docking criteria is put on the event queue ahead of time. Docking is then resolved exactly at that time, even at high warp, and never by checking each frame.
- **Pair pruning:** only pairs in the same SOI, with overlapping time windows, where at least one object has a plan or a target, are tested. This avoids testing every pair, which is O(n²).

## Planning tools

Each tool in `planning/` is a pure function `(world, shipId, params) → (ManeuverNode | ThrustArc)[]`. The outputs are ordinary plan items. `planning/program.ts` runs a **sequence of tool steps** (the representation of a logistics route) by evaluating each step against the predicted state at the end of the step before it. Supporting math lives in `orbital/`: a Lambert solver (Izzo's algorithm), Hohmann and phase-angle calculations, and Edelbaum estimates.

## Environment

- Every model is analytic in position and time, so it can be evaluated cheaply at any warp:
  - background radiation is a function of distance from the star;
  - radiation belts are tori per body;
  - solar storms are expanding shells, with seeded onset times;
  - solar flux ∝ 1/r².
- **Dose** = ∫ (rate × shielding factor) dt along a trajectory. It is computed by quadrature per segment and cached with the trajectory.
- **Power and heat** are a static balance per stack, re-solved at events. Shortfalls throttle consumers in a fixed priority order.

## Knowledge (true vs. known world)

The worker holds the **true** world. Each body also has a knowledge record, and only the **known** world is sent to the main thread.

```ts
interface BodyKnowledge {
  detected: boolean;
  orbitSigma: number;              // position uncertainty, km; ∞ until detected
  estimatedElements?: OrbitalElements;
  composition: 'unknown' | 'spectral-estimate' | 'assayed';
  compositionEstimate?: Record<ResourceId, [low: number, high: number]>;
  radiationBeltsMapped: boolean;
}
```

- Survey campaigns produce observations at deterministic times, as events. Each observation updates the knowledge record.
- The transfer planner refuses targets whose `orbitSigma` is above a threshold. So all planning uses true elements, and predicted encounters never drift as estimates improve.

## Economy solver

The economy is **event-driven**, with no per-tick stepping. Between events, all rates are constant, so every stockpile changes linearly with time. At each event, the solver:
1. resolves the rates at each location, limited by inputs, power, crew and storage, with facilities served in priority order;
2. computes analytically the next time any stockpile reaches zero or its capacity;
3. schedules that time as an event.

Stockpile values between events are interpolated. Construction and docked transfers are modelled as rates with completion events. Ecosystem health and population will plug into the same solver as rate-driven quantities with threshold events; their model is still open.

## Clock and event queue

- `clock` holds `t`, `warpRate` and `paused`. Each frame: `t += dt_wall × warpRate`, clamped so that it never passes the next event in the **priority queue**.
- Event sources:
  - plans: nodes, the start and end of arcs;
  - trajectories: SOI changes, closest approaches, docking, impact;
  - the economy: stockpile limits, construction completion, ecosystem and population thresholds;
  - knowledge: survey results;
  - the environment: storm warning and onset;
  - alarms, and scenario events.
- At each event, the handler decides whether to pause, drop warp, or continue.
- Physical state changes only at events: plan execution, docking, undocking, construction completion. **Preview time** is view state only. Rendering reads `viewTime`; the sim only advances `t`.

## Alarms

```ts
interface Alarm {
  id: AlarmId;
  scope: { kind: 'ship'; shipId: ShipId } | { kind: 'fleet'; fleetId: FleetId }
       | { kind: 'station'; stationId: StationId } | { kind: 'global' };
  trigger:
    | { kind: 'event'; eventKey: EventKey }               // one specific predicted event
    | { kind: 'event-type'; type: SimEventType }          // e.g. every SOI change for the scope
    | { kind: 'time'; t: number };
  leadTime: number;                                       // seconds before the event
  action: 'pause' | 'drop-warp';
}
```

- Fleet scope is resolved when the alarm is evaluated, so it covers ships added to the fleet later.
- `EventKey` = object + event type + target + sequence number. It is stable across replanning. When its event disappears, the alarm is dropped and the player is notified.

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

- **zustand**, on the main thread:
  - `world`: a read-only mirror of the known world. Player actions (`addNode`, `editArc`, `setAlarm`, `assignRoute`, `queueConstruction`, …) are sent to the worker as messages.
  - `view`: active ship, selection, target, camera, filters, preview time, and the open screens. It is not saved.
- Render components read positions every frame via `useFrame`, not through React state.
- **Saves:** `{ version, seed, scenarioParams, worldSnapshot }` in IndexedDB. The snapshot holds the full true world. Body orbits are regenerated from the seed.

## Tooling and testing

- **Vite** (with worker bundling), **Vitest**, ESLint import rules.
- **Physics tests:**
  - Kepler textbook cases, Earth→Mars Hohmann Δv, Lambert test cases;
  - planet positions at a reference epoch;
  - closest-approach accuracy at docking scale;
  - integrator energy drift, and low-thrust spirals against Edelbaum estimates.
- **Economy tests:** conservation of mass, and stockpile-limit timing checked against brute-force stepping.

## Extension points

- **VR:** R3F supports WebXR via `@react-three/xr`. Scene and camera logic must not depend on DOM overlays, and map interactions go through an input abstraction that a controller ray could also drive.
- **Ship 3D models:** the module list is the full ship definition, so visual models can be added later without changing the sim.
- **Landing and atmospheric flight** (later milestones): an abstract action, not a flight simulation. A planning-tool-like function checks the ship's capability flags, then computes the resource and Δv cost from its mass and the body's gravity (and atmosphere). The result is executed as an event that moves the ship between orbit and a surface location. A surface location is a stockpile location attached to the body, so the economy needs no special case.
