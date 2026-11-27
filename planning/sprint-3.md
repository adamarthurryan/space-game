# Sprint 3 — Ships and trajectories: detailed plan

This expands [sprint 3](milestone-1-sprints.md#sprint-3--ships-and-trajectories) of milestone 1. Module paths follow the source layout in [architecture.md](../docs/architecture.md#layered-structure), and the rendering follows its [rendering conventions](../docs/architecture.md#units-precision-and-rendering-scale), as changed by decision 90.

**Goal:** ships on patched-conic trajectories. By the end of the sprint, `render/` runs on plain three.js. The sandbox starts with three ships in Earth and lunar orbits, and more can be spawned from a form. Each ship coasts along a trajectory of conic segments that ends at SOI changes, impacts or the horizon. The trajectory is drawn in the focus body's frame, with SOI, Pe/Ap and impact markers. The sim clock stops exactly at each ship event and handles it, at any warp. Ships come from preset designs made of content modules (backbones, chemical engines, tanks), with mass, propellant and Δv derived from them.

**Out of scope:** maneuver nodes, plan execution, trajectory caching by plan and dashed planned paths (sprint 4); the timeline strip, "warp to next event", warp drops at events and preview scrubbing (sprint 5); fleets, the active ship, the full ship inspector, alarms, status icons and the Filters panel (sprint 6); targets, closest approach and AN/DN markers (sprints 7 and 9); finite burns and thrust segments (milestone 3); saves (sprint 10; this sprint only keeps the derived data rebuildable); ships around minor bodies (they have no SOI, decision 61).

## Decisions made for this sprint

| #     | Topic                     | Decision |
| ----- | ------------------------- | -------- |
| S3-1  | Plain three.js            | `render/MapRenderer.ts` owns the `WebGLRenderer` (log depth, antialias), the scene, a `PerspectiveCamera` (50°, near 1e-3, far 1e12), a `ResizeObserver` (CSS size and device pixel ratio), and the `requestAnimationFrame` loop. Each frame runs the stages in the fixed order of `STAGES` (S3-2). Layers are classes in `render/layers/`. Map input is two DOM listener modules in `render/input/` (camera and pointer), attached to the canvas by the renderer. `Scene.tsx` is the only React component in `render/` apart from the label overlay. It creates the renderer in an effect and disposes it on unmount. `@react-three/fiber` is removed and three.js is unpinned to the latest release (decision 48 lifted). This is the first step of the sprint. The sprint 2 unit tests and `npm run smoke` must pass unchanged before step 2 starts. |
| S3-2  | Frame stages              | `STAGES` replaces the R3F priorities: **clock, bodies, ships, camera, projection, layers, labels**. "Ships" is new: every ship's world position at the new `t`, needed before the camera because a ship can be the focus. The clock stage runs `advanceWorld` (S3-9), not `advanceClock`. The `MapFrame` stays a plain object, allocated once per body system. Its ship arrays are reallocated only when the set of ships changes. |
| S3-3  | Content model             | As in [architecture.md](../docs/architecture.md#content-files): typed data with `satisfies`, one file per module type, and no imports in `content/` (open question 6 is still open). Units are SI-ish and fixed by convention: mass in kg, volume in m³, thrust in N, Isp in s. `sim/` converts thrust to kN·km where needed. A module's family is the **`category`** discriminant (`'backbone' \| 'engine' \| 'tank'`), so `Engine.kind` stays the engine type (`'chemical'` only this sprint). Resources this sprint: oxygen, methane and structural metals. Values are based on **Starship V3** (S3-23). |
| S3-4  | Preset designs            | `content/designs.ts` holds the preset `ShipDesign`s (backbone, modules with counts, and an inert **payload mass**). This sprint there is one, **Starship**, with a 100 t payload (S3-23). They are content until the designer (milestone 2) adds a design library to the world. A ship **copies** the backbone ID, module list and payload mass from its design when it is created, starts with full tanks, and also keeps the design ID for display only. Changing a design never changes existing ships. |
| S3-5  | Mass and Δv               | Dry mass = backbone + Σ modules + payload. Wet mass = dry + propellant. **All engines fire together** (Starship has two engine types): the combined thrust is `ΣF`, the combined Isp is `ΣF / Σ(F/Isp)`, and the combined mixture is each engine's mixture weighted by its mass flow `F/Isp`. **Usable propellant** is the most the engines can burn at that mixture: `min over r of stock[r] / fraction[r]`. Δv = `Isp·g0·ln(m_wet / (m_wet − usable))`, with `g0` in km/s² (`G0`). Acceleration = combined thrust / wet mass. Per-engine thrust and Isp are listed too. Choosing which engines to fire waits for maneuver nodes (sprint 4) or later. Results are computed on demand and not stored. |
| S3-6  | Ship model                | A ship is plain data: identity, backbone and modules, a propellant stock per resource, a `status` (`'coasting' \| 'destroyed'`), and its **`orbit`**: `{ parentId, t, r, v }`, the state at the **start of its current segment**. The orbit is re-based at every SOI event (S3-10), so **the ship's current segment is always segment 0 of its trajectory**. Position at `t` = universal-variable propagation from `orbit` by `t − orbit.t`. A ship's parent must be a **major** body. IDs are `ship-<n>` from a counter in the world, so they are deterministic. |
| S3-7  | Trajectory horizon        | **By patch count:** a trajectory is at most **`MAX_SEGMENTS = 5`** conic segments, with a safety cap of **`HORIZON_CAP = 10 years`** from the trajectory's start. A segment that reaches the cap ends with `endEvent: 'horizon'`. The fifth segment ends at its own event if it has one within the cap, and otherwise at `'horizon'`. Nothing after it is computed. Re-basing at every SOI event (S3-6) recomputes the trajectory, so up to five patches are always shown ahead. |
| S3-8  | Event search per segment  | The earliest of these: **impact** (`|r| = radius + atmosphereHeight`, inbound) and **SOI exit** (`|r| = soiRadius`, outbound), solved analytically from the conic (`orbital/soi.ts`). **SOI entry** into a major child of the parent, searched only for children whose radial band `[q_c − R_soi, Q_c + R_soi]` overlaps the ship's `[r_p, r_a]`. The search uses **conservative advancement** on `f(t) = |r_ship − r_child| − R_soi`: step `f / v_rel,max` (where `v_rel,max` = the ship's speed at periapsis + the child's at periapsis), never less than `R_soi / (100·v_rel,max)`, then Brent on the first sign change. Entry can't be stepped over. A graze shallower than about 1% of the SOI radius may be missed, which is accepted. Ties go to the impact, then the exit, then the entry. A segment never ends less than 1 s after it starts at the boundary it just crossed. Entry into the child just left is ignored while `f` is increasing. |
| S3-9  | Event queue and clock     | `sim/events.ts`: a `PQueue<SimEvent>` keyed by sim time. Each ship has **at most one pending event**, the end of its current segment. Handlers are registered by event type in an `EventRegistry` object that is passed to `advanceWorld`, so `sim/` never imports higher layers and no module-level state is shared between tests. `advanceWorld(world, dtWall, registry)` computes the frame's target time (`t + min(dtWall, 0.25 s) × warp`). Then, while the next event is due by that target, it sets `t` to the event's time **exactly**, pops the event and dispatches it. Handlers may queue new events, which are processed in the same frame if they are due. At most `MAX_EVENTS_PER_FRAME = 256` events are handled per frame. If there are more, `t` stays at the last one and time runs slower, rather than skipping events. A handler may return `{ pause: true }`, but no sprint 3 handler does (warp drops are sprint 5). |
| S3-10 | Ship event handlers       | **`soi-change`:** re-base `ship.orbit` to segment 1's start state, recompute the trajectory, and queue its next event. **`impact`:** `status = 'destroyed'`, with `destroyedAt: { t, bodyId }`; the trajectory is cleared and no event is queued. The ship stays in the list, greyed out, and isn't drawn. **`horizon`:** re-base to the propagated state at `t` and recompute. A frame in which any event was handled bumps the store version, so panels update. |
| S3-11 | Derived data              | Trajectories and the event queue are **derived**: they live in `world.derived` and are recomputed from the ships by `rebuildDerived(world)` (decision 44: the queue isn't saved). The sprint 10 save strips `derived` and rebuilds it. This sprint's test checks that a rebuild gives the same segments and event times as incremental updates. |
| S3-12 | Player actions            | `game/actions.ts` is the entry point for every player action, starting with `togglePause`, `warpUp`, `warpDown`, `setWarpIndex` and `spawnShip`. Each is a function `(world, …args) → ActionResult`, where `ActionResult = { ok: true, value } \| { ok: false, error }`. The store calls them and bumps the version on success. Clock functions in `sim/clock.ts` stay as the mechanism, and actions add the rules. `spawnShip` refuses an unknown design or body, a minor-body parent, or a start outside the parent's SOI. |
| S3-13 | Sandbox ships and presets | The sandbox starts with three ships, from `gen/sandboxShips.ts`: three Starships: **Kestrel**, in a 400 km circular orbit at 51.6° to Earth's equator; **Tern**, in a 300 × 35,786 km orbit at 28.5°; **Heron**, in a 100 km circular orbit around the Moon. None has an event within the horizon (one `'horizon'` segment each). Spawn presets in the same file compute an `OrbitState` from the system at `t`: **LEO** (400 km), **Low lunar orbit** (100 km), **Earth escape** (hyperbolic, Pe 300 km, v∞ 3 km/s), **To the Moon** (from a 200 km periapsis, apoapsis aimed by fixed-point iteration at the Moon's position at arrival, offset in-plane so the lunar periapsis is above the surface), and **Suborbital** (Pe −100 km, Ap 400 km: impacts Earth within one orbit). |
| S3-14 | Spawn form                | In the Fleets tab: design, parent body (major bodies only), and the orbit as periapsis altitude, eccentricity (≥ 1 allowed), inclination, Ω, ω and true anomaly. Angles are relative to the parent's **equator** (its IAU pole) when it has one, otherwise the ecliptic, with a toggle to the ecliptic. There is also a preset menu that fills the fields (or, for "To the Moon", computes the state at the current `t`), and an optional name (default `<Design> <n>`). Spawned ships start with full tanks. |
| S3-15 | Map objects               | `MapObjectRef` gains `{ kind: 'ship'; id: ShipId }`. Selection, hover and focus all accept ships. **Focus on a ship:** the origin is the ship. The framing distance is 2.5 × the ship's distance from its parent, capped at the parent's framing distance. The minimum distance is 0.05 km. **P** snaps to the selected ship's current orbital plane (`r × v`, evaluated once at the snap). The camera controller's `focusId` becomes `focus: MapObjectRef`. |
| S3-16 | Trajectory frame          | Trajectories are drawn relative to the **focus body**, or to **the focused ship's current parent** when a ship is focused. Each point is expressed in that frame **at the point's own time**: `p_k = r_k + bodyStateIn(parent, frameBody, t_k).r`, through the lowest common ancestor. So a lunar flyby looks like a hyperbola around the Moon in the Moon's frame, and like the real geocentric path in Earth's. Per frame, the vertices are written as `float32(frameBodyWorld(t) + p_k − origin)` (decision 77). There is no inspector frame selector this sprint. |
| S3-17 | Trajectory sampling       | Each segment is sampled in **anomaly**, not time: in E for ellipses, H for hyperbolas, `D = tan(ν/2)` for parabolas. That gives **128 points per segment**, dense at periapsis. Each point stores its time, from Kepler's equation, without a solve. Drawing **starts at the ship's current position** (the past isn't drawn). A closed segment is drawn for **its first revolution** from the ship. If it lasts longer than one period and ends at an event (not at the horizon), its **last revolution**, from `max(t + P, tEnd − P)` to `tEnd`, is drawn too, in the future-revolution style (S3-18), so the line reaches the encounter or impact. Revolutions in between aren't drawn. In the parent's own frame the last revolution retraces the loop, so it is drawn only from the event's anomaly back to the ship's. A closed segment in its own parent's frame is redrawn every frame from the ship's current E, like a body orbit (no cache). Every other segment is cached in the frame body's frame, with times, and trimmed to `t_k > t` each frame. A closed segment drawn in another frame is rebuilt after a quarter period, and its last revolution is cached separately. Caches are keyed by (trajectory version, frame body). |
| S3-18 | Trajectory style          | One `THREE.Line` per segment, on `LineBasicMaterial` with RGBA vertex colours, like the orbit lines. Lines don't write depth. Colour per ship from an 8-colour palette chosen to differ from the body colours, by `ship.seq % 8`. Selected, hovered or focused ships are drawn at alpha 1 and brightened 35%; other ships at 0.45. There is no distance fade (trajectories are few and are the point of the map). Every line is solid: dashed planned paths arrive with nodes (sprint 4). **Future revolutions** (S3-17) are drawn faded: 0.35 × the ship's alpha, with no brightening. Faded rather than dashed keeps dashes for planned paths. |
| S3-19 | Trajectory markers        | A DOM overlay of small glyphs with text, from a pooled set of spans, positioned every frame. **SOI change** (`▲ Moon SOI`, `▲ Sun SOI` on exit) and **impact** (`✕ Impact`) for every drawn trajectory. When the event is past the segment's first revolution, the text says so: `▲ Moon SOI (rev 4)`. **Pe** and **Ap** (`Pe 230 km`) only for the selected, hovered and focused ships (sprint 6 decides how the active ship relates to the selection), at the next periapsis or apoapsis passage within each segment's drawn window (Ap for ellipses only). Glyphs are always shown, and their text goes through the label declutter below the body labels. Markers aren't clickable this sprint (alarms on them are sprint 6). |
| S3-20 | Ships on screen           | A ship is a **7 px triangle** marker in its colour (a `shape` attribute on the marker shader), with a label. A ship within 6 px of its parent's centre on screen **merges**: no marker and no label, as bodies do (decision 79). The focused or selected ship never merges. **Picking order:** a ship marker within 8 px that isn't behind a nearer disc comes first, then a disc, then a label, then a body marker. Ships come first because they are tiny and sit in front of their parent's disc. **Label priority:** focus > selection > hover > star > planet > dwarf planet > **ship** > moon, then by radius (bodies) or by `seq` (ships). |
| S3-21 | Ship UI                   | **Fleets tab:** a flat list of ships (fleets are sprint 6), in spawn order, with the name, design, current SOI and Δv. Destroyed ships are greyed out with "impacted Moon". Click selects, double-click focuses, and Up/Down move and select, as in the System tab. The "Spawn ship…" button opens the form (S3-14). **Ship inspector** (minimal): name, design, status; dry and wet mass, propellant per resource, Δv, engines (thrust, Isp), acceleration; the current SOI and orbit (Pe, Ap, e, i, period, or "escape" for e ≥ 1); and the upcoming events from the trajectory (`Moon SOI in 2 d 22 h`, `Impact (Earth) in 41 min`). |
| S3-22 | Debug handle              | The dev-only `window.__spaceGame` gains read-only probes: `ship(id)` (its projection and merge flags, as `body(id)` gives), `trajectory(id)` (segments as `{ parentId, tStart, tEnd, endEvent, endTargetId }`, plus `status`), `trajectoryVertices(id)` (the number of drawn vertices per segment), and `ships()` (IDs and names). Ships are spawned in the smoke test through the form, so the form is tested too. |
| S3-23 | Starship values           | The content numbers are based on **Starship V3**, with a 100 t payload and full tanks. They are round figures in the right range, not a spec: published V3 numbers vary by source, and accuracy is not a goal (decision 70). **Raptor 3** (×3): 2.45 MN, Isp 350 s in vacuum, 1,525 kg. **Raptor 3 Vacuum** (×3): 2.70 MN, Isp 380 s, about 2,000 kg. Both burn O₂ and CH₄ at O/F 3.6 (fractions 0.783 and 0.217). Tanks: 1,253 t of O₂ and 347 t of CH₄ (1,600 t in all). Dry mass about 100 t without payload. This gives about 1,800 t wet, a combined Isp of about 365 s, **Δv of about 7.9 km/s** and an acceleration of about 8.6 m/s² at full load. |

These are copied into [decisions.md](../docs/decisions.md) as decisions 91 onward, with the implementation choices made during the sprint.

## Files to create

```
src/
  content/
    types.ts                                  ModuleBase, Backbone, Engine, Tank, ShipDesign, ModuleInstance
    resources.ts                              resources (defines ResourceId)
    registry.ts                               lookups by ID and category; validateContent()
    designs.ts                                preset ShipDesigns (S3-4)
    content.test.ts                           uniqueness, cross-references, sanity, the type-check case
    modules/
      backbones.ts
      engines.ts
      tanks.ts
  orbital/
    (soi.ts extended)  soi.test.ts           timeToRadius, findSphereEntry
  sim/
    ship.ts            ship.test.ts          Ship, OrbitState, createShip, shipStats, shipStateAt
    trajectory.ts      trajectory.test.ts    Segment, computeTrajectory, segmentStateAt, assertNever
    events.ts          events.test.ts        SimEvent, EventRegistry, queue helpers
    (world.ts extended) world.test.ts        ships, derived, advanceWorld, rebuildDerived
  gen/
    sandboxShips.ts    sandboxShips.test.ts  sandbox ships, spawn presets (S3-13), real-system trajectory cases
  game/
    actions.ts         actions.test.ts       player actions (S3-12)
  render/
    MapRenderer.ts                           renderer, loop, resize, stages (S3-1, S3-2)
    stages.ts          stages.test.ts        STAGES order and the stage functions that aren't layers
    shipStyle.ts       shipStyle.test.ts     ship palette and highlight colours
    trajectoryGeometry.ts trajectoryGeometry.test.ts  segment sampling, frame transform, trimming (S3-16, S3-17)
    trajectoryMarkers.ts  trajectoryMarkers.test.ts   SOI, impact, Pe, Ap marker positions and texts (S3-19)
    layers/
      BodyLayer.ts                           spheres and the Sun's light (from Bodies.tsx, BodyMesh.tsx)
      OrbitLayer.ts                          body orbit lines (from OrbitLines.tsx, OrbitLine.tsx)
      MarkerLayer.ts                         body and ship markers, one THREE.Points (from BodyMarkers.tsx)
      TrajectoryLayer.ts                     trajectory lines (S3-18)
    input/
      cameraInput.ts                         wheel and drag → controller (from CameraRig.tsx)
      pointerInput.ts                        hover, click, double-click → picking → view (from useMapPointer.ts)
    overlays/
      TrajectoryMarkerOverlay.tsx            pooled glyph spans for trajectory markers
  ui/
    panels/
      FleetList.tsx    FleetList.test.tsx    the Fleets tab list (S3-21)
      SpawnShipForm.tsx SpawnShipForm.test.tsx  the spawn form (S3-14)
      shipDetails.ts   shipDetails.test.ts   derived inspector values (pure)
      ShipInspector.tsx ShipInspector.test.tsx
test/smoke/
  ships.mjs                                  the ship and trajectory checks
```

Removed: `render/FrameLoop.tsx`, `Bodies.tsx`, `BodyMesh.tsx`, `BodyMarkers.tsx`, `OrbitLines.tsx`, `OrbitLine.tsx`, `useMapPointer.ts` and `camera/CameraRig.tsx`. Their logic moves to the layers, the input modules and `stages.ts`. `LabelStage` leaves `LabelOverlay.tsx`; the labels stage calls `labelLayout.ts` directly.

Also change:

- `package.json`: remove `@react-three/fiber`, update `three` and `@types/three` to the latest release, and add `ships.mjs` to the `smoke` script.
- `render/mapFrame.ts`: drop the React context and `useMapFrame`; replace the priorities in `STAGE` with `STAGES` (S3-2); add the ship arrays.
- `render/Scene.tsx`: plain three.js host (S3-1).
- `render/projection.ts`, `picking.ts`, `overlays/declutter.ts`, `overlays/labelLayout.ts`, `overlays/LabelOverlay.tsx`, `markerMaterial.ts`: ships (S3-20).
- `render/camera/controller.ts` and `framing.ts`: `focus: MapObjectRef`, ship framing (S3-15). `render/debugHandle.ts`: the new probes (S3-22).
- `sim/clock.ts`: `clockTarget`, used by `advanceWorld`. `sim/world.ts`: ships and derived data.
- `gen/scenario.ts`: the sandbox ships.
- `store/useWorld.ts`: actions through `game/actions.ts`, the event registry, `bumpVersion`. `store/useView.ts`: `MapObjectRef` with ships; `spawnFormOpen`.
- `ui/layout/LeftSidebar.tsx` (the Fleets tab), `Inspector.tsx` (body or ship), `ui/map/MapToolbar.tsx` (P enabled for a selected ship), `ui/useMapKeys.ts` (F and P with ships), `ui/format.ts` (`formatCountdown`).
- `test/lint/layers.test.ts`: the new cases (see [Lint rules](#lint-rules)). `eslint.config.js`: drop `@react-three/*` from the framework list only if nothing else needs it there. Keeping it is harmless, since it still forbids the import below `store/`.
- [architecture.md](../docs/architecture.md): Trajectories (the horizon and event search), Clock and event queue (one pending event per ship, the registry, derived data), Content files (`category`), and the rendering conventions (remove the "until sprint 3" note). [decisions.md](../docs/decisions.md): decision 48 superseded, plus the S3 decisions. [CLAUDE.md](../CLAUDE.md): the current status and tech stack.

## Interfaces and data models

Units as before: `km`, `s`, `kg`, `km/s`, radians, except inside `content/` (S3-3).

### `content/`

```ts
// resources.ts
export interface Resource { name: string; kind: 'raw' | 'refined' }
export const resources = {
  oxygen: { name: 'Oxygen', kind: 'refined' },
  methane: { name: 'Methane', kind: 'refined' },
  'structural-metals': { name: 'Structural metals', kind: 'raw' },
} as const satisfies Record<string, Resource>;
export type ResourceId = keyof typeof resources;

// types.ts
export type ModuleId = string;
export type DesignId = string;
export interface ModuleBase {
  id: ModuleId; // unique across all module files
  name: string;
  mass: number; // kg, dry
  volume: number; // m³
  materials: Partial<Record<ResourceId, number>>; // build cost, kg
}
export interface Backbone extends ModuleBase { category: 'backbone'; maxMass: number; maxVolume: number }
export interface Engine extends ModuleBase {
  category: 'engine';
  kind: 'chemical'; // milestone 3–4 add the others
  thrust: number; // N
  isp: number; // s
  propellant: Partial<Record<ResourceId, number>>; // mass fraction of each, summing to 1
}
export interface Tank extends ModuleBase { category: 'tank'; resource: ResourceId; capacity: number /* kg */ }
export type Module = Backbone | Engine | Tank;
export interface ModuleInstance { moduleId: ModuleId; count: number }
export interface ShipDesign {
  id: DesignId;
  name: string;
  backboneId: ModuleId;
  modules: ModuleInstance[];
  payload: number; // kg of inert mass (no cargo modules until milestone 3)
}

// registry.ts
export const registry: {
  modules: readonly Module[];
  backbones: readonly Backbone[]; engines: readonly Engine[]; tanks: readonly Tank[];
  designs: readonly ShipDesign[];
  byId(id: ModuleId): Module | undefined;
  design(id: DesignId): ShipDesign | undefined;
};
/** Problems in a content set; [] if valid. The content test runs it on the real content and on broken copies. */
export function validateContent(modules: readonly Module[], designs: readonly ShipDesign[]): string[];
```

Content (S3-23), all approximate: backbone `starship-v3-structure` (about 72 t; up to 1,900 t and 2,000 m³); engines `raptor-3` and `raptor-3-vac`; tanks `starship-lox-tank` (1,253 t of oxygen, about 12 t, 1,100 m³) and `starship-ch4-tank` (347 t of methane, about 6 t, 830 m³). One design, **Starship**: the structure, 3 × `raptor-3`, 3 × `raptor-3-vac`, both tanks, and a 100 t payload. More designs (a tanker, smaller craft) can be added as data later. The content test's broken copies and `sim/` tests use small synthetic designs, so they don't depend on these numbers.

`validateContent` checks the following: IDs are unique across modules and across designs; every design's `backboneId` names a backbone and every `moduleId` names a non-backbone module; counts are positive integers; mass, volume, thrust, Isp and capacity are positive; an engine's propellant is non-empty and its fractions sum to 1 within 1e-9; a design at full load, payload included, fits its backbone's mass and volume (the payload counts against mass only); and every propellant of every engine in a design has a tank in it.

### `orbital/soi.ts` (additions)

```ts
/**
 * Time from state s until |r| first equals `radius` while moving outward ('outbound') or inward
 * ('inbound'), from the conic in closed form; null if the conic never does (for example, an
 * ellipse with apoapsis < radius, or 'inbound' on an escape past its periapsis).
 */
export function timeToRadius(mu: number, s: StateVector, radius: number, crossing: 'outbound' | 'inbound'): number | null;

/**
 * The first t in (t0, t1] where f crosses from > 0 to ≤ 0, by conservative advancement
 * (step = max(f/vMax, minStep)), then Brent; null if none. f(t) = |r_rel(t)| − R must change
 * by at most vMax per second (S3-8).
 */
export function findSphereEntry(f: (t: number) => number, t0: number, t1: number, vMax: number, minStep: number): number | null;
```

### `sim/ship.ts`

```ts
export type ShipId = string;
/** A state relative to a body at a time (S3-6). */
export interface OrbitState { parentId: BodyId; t: number; r: Vec3; v: Vec3 }
export interface Ship {
  id: ShipId;
  seq: number; // creation number: palette, ordering
  name: string;
  designId: DesignId; // display only (S3-4)
  backboneId: ModuleId;
  modules: ModuleInstance[];
  payload: number; // kg, copied from the design
  propellant: Partial<Record<ResourceId, number>>; // kg
  status: 'coasting' | 'destroyed';
  destroyedAt?: { t: number; bodyId: BodyId };
  orbit: OrbitState; // start of the current segment
}
export function createShip(id: ShipId, seq: number, name: string, design: ShipDesign, orbit: OrbitState): Ship; // full tanks
export interface EngineStats { moduleId: ModuleId; count: number; thrust: number /* N, total for the count */; isp: number }
export interface ShipStats { payload: number; dryMass: number; propellantMass: number; wetMass: number; maxMass: number; volume: number; maxVolume: number; engines: EngineStats[]; thrust: number /* N, all engines */; isp: number /* combined */; usablePropellant: number; dv: number; acceleration: number /* km/s² */ }
export function shipStats(ship: Ship): ShipStats; // S3-5
/** The ship's state relative to orbit.parentId at t (propagated from its orbit). */
export function shipStateAt(sys: BodySystem, ship: Ship, t: number, out?: StateVector): StateVector;
```

### `sim/trajectory.ts`

```ts
export type Segment = ConicSegment; // milestone 3 adds ThrustSegment
export type SegmentEnd = 'soi-exit' | 'soi-enter' | 'impact' | 'horizon'; // sprint 4 adds 'maneuver'
export interface ConicSegment {
  kind: 'conic';
  parentId: BodyId;
  r0: Vec3; v0: Vec3; // at tStart, parent frame
  tStart: number;
  tEnd: number;
  endEvent: SegmentEnd;
  endTargetId?: BodyId; // the body entered, exited to, or impacted
}
export interface Trajectory { segments: Segment[]; version: number /* bumped on every recompute */ }

export const MAX_SEGMENTS = 5; // S3-7
export const HORIZON_CAP = 10 * SECONDS_PER_JULIAN_YEAR;

/** Patched-conic coasting from `start` (S3-7, S3-8). Deterministic; plain data out. */
export function computeTrajectory(sys: BodySystem, start: OrbitState, opts?: { maxSegments?: number; horizonCap?: number }): Segment[];
/** State in the segment's parent frame at t ∈ [tStart, tEnd]. */
export function segmentStateAt(sys: BodySystem, seg: Segment, t: number, out?: StateVector): StateVector;
/** The segment's end state, moved into the next segment's frame (the next segment's start). */
export function transitionState(sys: BodySystem, seg: Segment): OrbitState | null; // null after impact or horizon
export function assertNever(x: never): never;
```

Every consumer of `Segment` switches on `kind` with an `assertNever` default, so adding `ThrustSegment` lists every place that must handle it.

### `sim/events.ts` and `sim/world.ts`

```ts
// events.ts
export type SimEvent =
  | { type: 'soi-change'; shipId: ShipId; trajectoryVersion: number }
  | { type: 'impact'; shipId: ShipId; trajectoryVersion: number }
  | { type: 'trajectory-horizon'; shipId: ShipId; trajectoryVersion: number };
export type SimEventType = SimEvent['type'];
export interface EventOutcome { pause?: boolean }
export type EventHandler<E extends SimEvent = SimEvent> = (world: World, event: E) => EventOutcome | void;
export interface EventRegistry { handlers: Partial<Record<SimEventType, EventHandler[]>> }
export function createEventRegistry(): EventRegistry;
export function on<T extends SimEventType>(reg: EventRegistry, type: T, h: EventHandler<Extract<SimEvent, { type: T }>>): void;
export function dispatch(reg: EventRegistry, world: World, e: SimEvent): EventOutcome;
/** Replaces the ship's pending event with the end of its current segment (none if destroyed). */
export function queueShipEvent(world: World, shipId: ShipId): void;
/** The ship handlers of S3-10. */
export function registerShipHandlers(reg: EventRegistry): void;

// world.ts
export interface World {
  system: BodySystem;
  clock: Clock;
  ships: Record<ShipId, Ship>; // insertion order = seq order
  nextShipSeq: number;
  /** Rebuildable from the rest; not saved (S3-11). */
  derived: { trajectories: Record<ShipId, Trajectory>; events: PQueue<SimEvent> };
}
export const MAX_EVENTS_PER_FRAME = 256;
export function createWorld(system: BodySystem, t?: number): World;
/** Adds a ship, computes its trajectory and queues its event. */
export function addShip(world: World, ship: Ship): void;
/** Recomputes one ship's trajectory from its orbit, bumps its version, and re-queues its event. */
export function refreshShip(world: World, shipId: ShipId): void;
export function rebuildDerived(world: World): void;
/** The clock stage (S3-9). Returns the number of events handled and whether any handler asked to pause. */
export function advanceWorld(world: World, dtWall: number, reg: EventRegistry): { events: number; pause: boolean };

// clock.ts
/** The time this frame aims for: t + min(dtWall, MAX_FRAME_DT) × warp (S2-3). */
export function clockTarget(c: Clock, dtWall: number): number;
```

An event carries the `trajectoryVersion` it was queued for. A handler ignores a stale event, as a second guard after `queueShipEvent` removes the old one.

### `game/actions.ts` and `gen/sandboxShips.ts`

```ts
// game/actions.ts
export type ActionResult<T = void> = { ok: true; value: T } | { ok: false; error: string };
export function togglePause(world: World): ActionResult;
export function warpUp(world: World): ActionResult;
export function warpDown(world: World): ActionResult;
export function setWarpIndex(world: World, i: number): ActionResult;
export interface SpawnShipParams { designId: DesignId; name?: string; orbit: OrbitState }
export function spawnShip(world: World, p: SpawnShipParams): ActionResult<ShipId>;

// gen/sandboxShips.ts
export type SpawnPreset = 'leo' | 'low-lunar' | 'earth-escape' | 'to-the-moon' | 'suborbital';
export interface OrbitInput {
  parentId: BodyId;
  periapsisAltitude: number; // km above the mean radius
  e: number; // ≥ 1 for escape orbits
  i: number; lan: number; argp: number; nu: number; // rad
  plane: 'equator' | 'ecliptic'; // S3-14
}
/** The state of an orbit given as the form's fields, at t. */
export function orbitFromInput(sys: BodySystem, input: OrbitInput, t: number): OrbitState;
export function presetOrbit(sys: BodySystem, preset: SpawnPreset, t: number): OrbitState;
/** Kestrel, Tern and Heron (S3-13). */
export function sandboxShips(sys: BodySystem): { designId: DesignId; name: string; orbit: OrbitState }[];
```

`gen/scenario.ts`'s `createSandboxWorld()` adds the three ships through `addShip`. `store/useWorld.ts` creates one `EventRegistry` with `registerShipHandlers`, and its actions call `game/actions.ts` and bump the version. The map's clock stage calls `advanceWorld` and then `bumpVersion()` if any events were handled.

### `render/MapRenderer.ts`, `stages.ts` and layers

```ts
// stages.ts
export const STAGES = ['clock', 'bodies', 'ships', 'camera', 'projection', 'layers', 'labels'] as const;
export type StageName = (typeof STAGES)[number];

// layers: one interface, one class per kind of object
export interface MapLayer {
  update(frame: MapFrame, view: ViewSnapshot): void;
  /** Called when the store version changes: rebuild objects if the set of entities changed. */
  sync?(world: World): void;
  dispose(): void;
}
export interface ViewSnapshot { focus: MapObjectRef; selected: MapObjectRef | null; hovered: MapObjectRef | null; frameBodyId: BodyId /* S3-16 */ }

// MapRenderer.ts
export class MapRenderer {
  readonly frame: MapFrame;
  constructor(container: HTMLElement, labels: LabelRegistry, markers: TrajectoryMarkerRegistry);
  /** Starts the loop. Called once by Scene's effect. */
  start(): void;
  /** Stops the loop, detaches input, disposes every layer, the renderer and its canvas. */
  dispose(): void;
}
```

The renderer's loop (one `requestAnimationFrame` callback) computes `dtWall` from the rAF timestamp, and only the renderer reads the wall clock. It then runs the stages in `STAGES` order and calls `renderer.render`. The layers are `BodyLayer`, `OrbitLayer`, `TrajectoryLayer` and `MarkerLayer`, in that order, so markers draw last. The camera stage owns the controller, as `CameraRig` did. The `ResizeObserver` sets the drawing buffer size to CSS size × `devicePixelRatio` and updates the camera's aspect. `frame.camera` gets the CSS size, as before.

### `render/mapFrame.ts` (ship additions)

```ts
export interface MapFrame {
  // …sprint 2 fields
  ships: {
    ids: ShipId[]; // drawn ships (coasting), seq order
    indexOf: Record<ShipId, number>;
    parentIndex: Int32Array; // body index of each ship's current parent
    world: Float64Array; // 3m, ships stage
    screenX: Float32Array; screenY: Float32Array; depth: Float32Array;
    markerShown: Uint8Array; merged: Uint8Array;
  };
}
/** Reallocates the ship arrays if the drawn ship set changed. */
export function syncFrameShips(frame: MapFrame, world: World): void;
/** Ships stage: each ship's world position at frame.t. */
export function updateFrameShips(frame: MapFrame, world: World): void;
```

### `render/trajectoryGeometry.ts` and `trajectoryMarkers.ts`

```ts
export const SEGMENT_POINTS = 128; // S3-17
/** A segment sampled in anomaly, relative to the frame body, float64, with a time per point. */
export interface SegmentPolyline { points: Float64Array /* 3·n */; times: Float64Array /* n */; count: number; closedLoop: boolean; builtAt: number }
export function sampleSegmentInto(sys: BodySystem, seg: Segment, frameBodyId: BodyId, tFrom: number, out: SegmentPolyline): SegmentPolyline;
/**
 * Writes float32(frameBodyWorld + p − origin) for the points after t, preceded by the ship's
 * current position; returns the vertex count for the draw range.
 */
export function writeTrajectoryVertices(out: Float32Array, line: SegmentPolyline, t: number, shipRel: Vec3 | null, frameBodyWorld: Vec3, origin: Vec3): number;

export type TrajectoryMarkerKind = 'soi-enter' | 'soi-exit' | 'impact' | 'periapsis' | 'apoapsis';
export interface TrajectoryMarker { shipId: ShipId; kind: TrajectoryMarkerKind; t: number; pos: Vec3 /* frame-body relative */; text: string }
/** Markers for one trajectory after t (S3-19); Pe/Ap only if `withApsides`. */
export function trajectoryMarkers(sys: BodySystem, traj: Trajectory, t: number, frameBodyId: BodyId, withApsides: boolean, fmt: (km: number) => string): TrajectoryMarker[];
```

`fmt` is passed in because `render/` may not import `ui/format.ts`. The overlay component passes `formatDistance`.

### `store/useView.ts` and `ui/panels/shipDetails.ts`

```ts
export type MapObjectRef = { kind: 'body'; id: BodyId } | { kind: 'ship'; id: ShipId };
// ViewState additions:
spawnFormOpen: boolean;
setSpawnFormOpen(open: boolean): void;

// shipDetails.ts
export interface ShipDetails {
  name: string; designName: string; status: 'coasting' | 'destroyed';
  destroyed?: { t: number; bodyName: string };
  stats: ShipStats;
  propellant: { resource: ResourceId; name: string; mass: number; capacity: number }[];
  orbit?: { parentId: BodyId; periapsis: number; apoapsis?: number; e: number; i: number; period?: number; escape: boolean };
  events: { kind: SegmentEnd; targetName?: string; t: number }[]; // excludes 'horizon'
}
export function shipDetails(world: World, id: ShipId, t: number): ShipDetails;
```

The orbit's inclination is measured from the parent's equator when the parent has a pole, as for moons in sprint 2.

## Tests

Pure modules use the node environment. Components use jsdom with the scene stubbed. Tests with real bodies go in `gen/` (sprint 2 note: `orbital/` and `sim/` tests may not import `gen/`), and the `sim/` tests use a synthetic star–planet–moon system with Earth-like values.

### `content/content.test.ts`

- `validateContent(real content)` returns `[]`.
- Broken copies each give one matching error: a duplicate module ID, a design naming a missing module, a design naming an engine as its backbone, propellant fractions summing to 0.9, a design over its backbone's mass at full load, and an engine without a tank for one of its propellants.
- **Type check:** a `satisfies Engine` object with `propellant: { methan: 1 }` under `// @ts-expect-error`. `npm run build` (`tsc -b`, which includes test files) fails if the misspelling ever stops being an error.
- The registry finds every module by ID and lists each category.
- The Starship design's stats are in range (S3-23): wet mass 1,750–1,850 t, Δv 7.5–8.3 km/s, acceleration 8–9.5 m/s².

### `orbital/soi.test.ts` (additions)

- `timeToRadius`, ellipse: from periapsis, the outbound time to `r = (r_p + r_a)/2` matches Kepler's equation to 1e-9 relative, and propagating by it gives `|r|` = radius to 1e-9 relative. Inbound gives the mirror time. An ellipse with apoapsis below the radius gives null outbound.
- Hyperbola: outbound from periapsis to 10 × r_p matches the hyperbolic Kepler equation. Inbound after periapsis gives null. A parabola (e = 1 exactly) works.
- Already outside, moving in: inbound to a smaller radius is positive, and outbound is null for an escape orbit.
- `findSphereEntry` on synthetic functions: the first of two dips is found; a dip of 2% below zero between huge steps is found; a function that stays ≥ 0 gives null; the entry time is accurate to 1e-6 s.

### `sim/ship.test.ts`

- `shipStats`: the masses sum by hand for a test design with a payload; with two engine types, the combined Isp is `ΣF / Σ(F/Isp)` and Δv equals `Isp·g0·ln(m0/m1)` to 1e-12 relative; with one propellant at half its mixture share, usable propellant is limited by it; with no propellant, Δv is 0.
- `shipStateAt` equals `propagate` from the orbit state, for `t` before and after `orbit.t`.
- A ship survives a JSON round trip unchanged.

### `sim/trajectory.test.ts` (synthetic system)

- **Closed orbit, no events:** a circular orbit around the planet well inside the moon's band gives one segment, `'horizon'`, at `tStart + HORIZON_CAP`.
- **Escape:** a hyperbola from low orbit ends at `'soi-exit'` with `endTargetId` = the star, at `|r|` = SOI radius to 1e-9 relative. Segment 2's parent is the star. The world position and velocity are continuous across the change (1e-6 km and 1e-12 km/s, relative to their magnitudes).
- **Encounter:** a transfer aimed at the moon ends at `'soi-enter'` with the moon, `|r_rel|` = the moon's SOI radius to 1e-9 relative. The next segment is moon-relative and hyperbolic, and ends at `'soi-exit'` back to the planet (or at impact, for an aimed impact).
- **Impact:** periapsis below `radius + atmosphereHeight` ends at `'impact'` at exactly that radius, inbound, and nothing follows. A start already moving outward from below that radius (a launch) doesn't impact at t = 0.
- **Grazes:** the closest approach to the moon at 1.05 × its SOI radius gives no entry; at 0.95 ×, an entry.
- **No zero-length segments:** after an entry, segment 2 doesn't exit within 1 s; after an exit, the moon just left isn't re-entered at once.
- **Cap:** a chain of planet ↔ moon crossings stops at `MAX_SEGMENTS`, and the last segment ends at its own event or `'horizon'`.
- **Root parent:** a hyperbolic orbit around the star ends at `'horizon'` (no exit from the root).
- Determinism: two computations are deep-equal; a JSON round trip of the segments is unchanged.

### `sim/events.test.ts` and `sim/world.test.ts`

- `dispatch` calls the handlers registered for the event's type, in order, and none for other types; two registries don't share handlers.
- `advanceWorld` with an event at t = 5 and a frame target of 10: the handler sees `world.clock.t === 5` exactly, and `t` ends at 10. Events at equal times run in insertion order. An event queued by a handler for t = 7 runs in the same frame. An event exactly at the target runs. Nothing runs while paused.
- With 300 events due in one frame, 256 run and `t` stops at the 256th.
- Ship handlers: `soi-change` re-bases the orbit to segment 1's start, so segment 0 is now the old segment 1 and the new event is its end; `impact` sets `destroyed`, clears the trajectory and queues nothing; a stale event (old `trajectoryVersion`) does nothing.
- **High warp:** an escape ship at ×10⁷, advanced in 1/60 s frames for 60 sim days, ends with the star as its parent. Its world position equals the one computed from the original trajectory to 1e-6 relative. Each SOI change was handled at its exact `tEnd`.
- `rebuildDerived` after a run gives deep-equal trajectories (apart from `version`) and the same queued event times as the incremental updates.
- The world, without `derived`, survives a JSON round trip.

### `gen/sandboxShips.test.ts` (real system)

- The three sandbox ships validate, have one `'horizon'` segment each, and their orbits match the requested Pe, Ap and inclination to the parent's equator (1 km, 1e-9 rad).
- **Earth escape:** leaves Earth's SOI after 2–6 days into a heliocentric segment, with continuity as in the synthetic test.
- **To the Moon:** enters the Moon's SOI within 2–6 days; the lunar segment's periapsis is between the Moon's radius + 50 km and its SOI radius; the trajectory then leaves the Moon's SOI or impacts, and in either case says which.
- **Suborbital:** impacts Earth within one period of its initial orbit, at `|r|` = Earth's radius.
- `orbitFromInput` round trip: elements in → `elementsFromState` out, for the equator and ecliptic planes, Earth and Jupiter.

### `game/actions.test.ts`

- `spawnShip` adds `ship-4` to the sandbox world with a trajectory and one queued event. It refuses an unknown design, an unknown body, Phobos (minor), and a start outside the parent's SOI, each with an error naming the problem and no change to the world.
- The clock actions do what the store's did, and return `ok`.

### Render tests

- `stages.test.ts`: `STAGES` order (clock < bodies < ships < camera < projection < layers < labels).
- `trajectoryGeometry.test.ts`: every sampled point lies on the conic (in the segment's frame); with the frame body = parent and a closed segment, the first written vertex is the ship and the loop closes after one revolution; for a lunar segment drawn in Earth's frame, each point equals `changeFrame` at its own time to 1e-6 km; trimming drops exactly the points with `t_k ≤ t`; a closed segment that ends at an encounter on its fifth revolution, drawn in another frame, gives a first-revolution polyline and a faded last-revolution polyline that ends at the segment's end state; one ending at the horizon gives no last revolution; a hyperbolic segment is sampled in H, denser at periapsis.
- `trajectoryMarkers.test.ts`: SOI and impact markers sit at the segment ends; an SOI marker past the first revolution says which revolution (`rev 4`); Pe/Ap appear only with `withApsides`, only for passages after `t` within the drawn window, and Ap only for ellipses.
- `projection.test.ts`, `picking.test.ts`, `declutter.test.ts` (additions): ships project like points; a ship in front of its parent's disc is picked before the disc, and one behind it isn't picked; a ship within 6 px of its parent merges unless focused or selected; ship labels rank below planets and above moons.
- `controller.test.ts` and `framing.test.ts` (additions): refocus from Earth to a LEO ship keeps the origin continuous and ends on the ship; ship framing is 2.5 × its distance, capped; a snap to a ship's orbit pole ends with `forward = −h/|h|`.
- `shipStyle.test.ts`: 8 distinct colours, none closer than a set distance to any body colour; highlight is lighter.

### Component tests (jsdom)

- **`FleetList.test.tsx`:** lists Kestrel, Tern and Heron in order with their SOI; click selects; double-click focuses (`focusSeq` bumps); Up/Down move and select; a destroyed ship shows greyed with "impacted Earth".
- **`SpawnShipForm.test.tsx`:** spawning with defaults adds a ship and selects it; choosing the "Earth escape" preset fills e > 1; a periapsis outside the SOI shows the action's error and adds nothing; the parent list has no minor bodies.
- **`ShipInspector.test.tsx`:** selecting Kestrel shows its design, Δv, Earth as its SOI and its orbit; an escape ship lists "Sun SOI in …"; a destroyed ship shows its impact.
- **`AppShell.test.tsx`:** the Fleets tab shows the list instead of "No ships yet."; the inspector switches between body and ship.

### `test/smoke/ships.mjs` (`npm run smoke`)

`shell.mjs` and `map.mjs` run unchanged first. **They are the gate for step 1.**

1. The Fleets tab lists the three sandbox ships. Each drawn ship has a projection, and its trajectory has drawn vertices.
2. Spawn "Earth escape" through the form: the inspector lists a Sun SOI event. At ×10⁶, within 10 s, `trajectory(id)` shows the Sun as segment 0's parent and the inspector's SOI reads "Sun". No console errors.
3. Spawn "To the Moon": `trajectory(id)` has a `'soi-enter'` into the Moon followed by a Moon-centred segment. Focus the Moon: that segment is still drawn (vertex count > 0) and an `▲ Moon SOI` marker is placed.
4. Spawn "Suborbital": the trajectory ends with `'impact'`. After warping past it, the ship is greyed out in the list and has no marker or trajectory.
5. Double-click Kestrel in the list: the camera focuses it within 1.5 s. At ×10³ for 2 s, its projected position stays within 0.5 px of the canvas centre (no jitter at a ship focus).
6. Hover Kestrel's marker for a pointer cursor; click it to select. Its Pe and Ap markers are placed.
7. No console errors, warnings or failed requests. Screenshots of the Moon flyby (Earth focus and Moon focus) go to `test/smoke/out/`.

### Lint rules

Added to `test/lint/layers.test.ts`:

| File path given       | Code                                                       | Expected                          |
| --------------------- | ---------------------------------------------------------- | --------------------------------- |
| `src/content/bad.ts`  | `import { G0 } from '../math/units'`                       | layer error (content imports none) |
| `src/sim/bad.ts`      | `import { spawnShip } from '../game/actions'`              | layer error (sim → game)          |
| `src/game/bad.ts`     | `import { useWorld } from '../store/useWorld'`             | layer error (game → store)        |
| `src/game/bad.ts`     | `Date.now()`                                               | determinism error                 |
| `src/sim/ok.ts`       | `import { registry } from '../content/registry'`           | no errors                         |
| `src/store/ok.ts`     | `import { spawnShip } from '../game/actions'`              | no errors                         |

That R3F is gone is checked by acceptance criterion 1, not by a lint case: once the package is removed, `tsc` fails on any import of it.

## Acceptance criteria

Sprint 3 is done when all of these hold:

1. **No R3F:** `package.json` has no `@react-three/*` dependency, `src/` has no import of it, three.js is unpinned, and the sprint 2 unit tests, `shell.mjs` and `map.mjs` passed unchanged at the end of step 1, and still pass.
2. **Checks:** `npm test`, `npm run lint`, `npm run build`, `npm run format:check` and `npm run smoke` pass, with no lint warnings and no console errors or warnings in the smoke run.
3. **Earth escape:** a ship spawned on an Earth-escape orbit shows a trajectory that crosses into the Sun's frame. Its position and velocity are continuous across the change (unit test), and the clock re-bases it into the Sun's frame at the exact event time, even at ×10⁷ (unit test and smoke check 2).
4. **Lunar flyby:** a ship aimed at the Moon shows the SOI entry marker and the lunar segment, drawn correctly in both Earth's and the Moon's frames (smoke check 3 and the geometry tests). An encounter several revolutions ahead is drawn, with its last revolution faded and the revolution named on the marker.
5. **Impact:** an impact ends the trajectory with an impact marker, and the ship is destroyed when the clock reaches it (smoke check 4).
6. **Content:** a misspelt resource ID in content fails type checking (`npm run build`), and a duplicate module ID fails the content test. Ship mass, propellant and Δv come from the modules, and the Starship preset has about 7.9 km/s with a 100 t payload.
7. **Events:** `sim/events.ts` dispatches through registered handlers; the clock never passes a ship event without handling it; `rebuildDerived` reproduces the incremental event times.
8. **Actions:** the clock controls and spawning go through `game/actions.ts`, and the store has no clock logic of its own.
9. **UI:** the Fleets tab lists ships; select, focus, and P-snap work on ships; the spawn form and ship inspector work as tested; focusing a ship doesn't jitter (smoke check 5).
10. **Conventions:** every `Segment` switch is exhaustive with `assertNever`; trajectory vertices are written through the float64 → float32 path; layers rebuild objects only when the set of ships or segments changes.
11. **Docs:** decisions S3-1 to S3-23, and the implementation choices, are logged in decisions.md (decision 48 marked superseded). architecture.md's Trajectories, Clock and event queue, Content and rendering sections are updated. CLAUDE.md shows sprint 3 as complete and drops the R3F notes.

## Suggested order of work

1. **Switch to plain three.js** (S3-1, S3-2): `MapRenderer`, `stages.ts`, the three layers, the input modules, the new `Scene.tsx`; remove R3F and unpin three.js. **Gate:** the sprint 2 tests and `shell.mjs` and `map.mjs` pass unchanged. Commit this step on its own.
2. Content: types, resources, modules, designs, registry, `validateContent`, and the content test.
3. `orbital/soi.ts` additions; `sim/ship.ts`; `sim/trajectory.ts` with the synthetic tests.
4. `sim/events.ts`, the world's ships and derived data, `advanceWorld`, and the ship handlers, with their tests.
5. `game/actions.ts`, the store wiring, `gen/sandboxShips.ts` and the sandbox ships, with the real-system tests.
6. Ships on the map: frame arrays, the ships stage, projection, markers, picking, labels, `MapObjectRef` with ships, and focus and snap on ships.
7. `TrajectoryLayer`, `trajectoryGeometry.ts`, the trajectory markers and their overlay.
8. The Fleets list, the ship inspector and the spawn form.
9. `ships.mjs`, the lint cases, and the docs.

## Implementation notes

Choices made while building, beyond the decisions above. They are logged in [decisions.md](../docs/decisions.md) with decisions 91–113.

1. **Step 1 gate.** The sprint 2 unit tests, `shell.mjs` and `map.mjs` passed after the switch with one change: `mapFrame.test.ts`'s check of the `STAGE` priorities moved to `stages.test.ts` as a check of `STAGES`, since `STAGE` no longer exists. three.js is 0.187. The renderer keeps R3F's defaults that affect the look: ACES filmic tone mapping and a pixel ratio capped at 2.
2. **Renderer signature.** `MapRenderer` takes `(container, frame, labels, markers)`: `Scene` owns the `MapFrame` (created per body system) because the label overlay needs its body order. A new system gives a new renderer. `FrameCamera` gained `pixelRatio`, which the marker layer reads.
3. **Content.** A backbone's own volume doesn't count against its limit; every module's volume is positive. The Starship stats check (S3-23) is in `sim/ship.test.ts`, because content tests may not import `sim/`. Starship comes out at 1,800.6 t wet, 365 s, 7.84 km/s and 8.6 m/s².
4. **Event search details.** `timeToRadius` works from the true anomaly measured from periapsis, also for near-circular orbits, where `elementsFromState` reports the argument of latitude. The 1 s rule clamps an exit after an entry; the child just left can't be re-entered at once because `findSphereEntry` only reports crossings from > 0 to ≤ 0. The impact tests check `|r| = radius + atmosphereHeight` (S3-8), not the bare radius.
5. **Horizon after a re-base.** The 10-year cap counts from the re-based start, so after an SOI change a trailing horizon segment ends later than before. The world test compares the re-based segment with the old segment 1 apart from that end time.
6. **No import cycle.** `refreshShipDerived` and `emptyDerived` live in `sim/events.ts`, and `sim/world.ts` imports them, so `events.ts` needs only types from `world.ts`.
7. **To the Moon.** An angular lead of the apoapsis barely changes the lunar periapsis, because the approach relative to the Moon is nearly radial. The preset offsets the apoapsis radius instead, scanning ±20,000 km in 500 km steps for the lunar periapsis nearest 1,000 km (about 70 ms). Its flyby leaves the Moon's SOI and then Earth's: a slingshot to the Sun.
8. **Tern** starts at Ω = 40°, so it isn't drawn on top of Kestrel (both start at the node, at periapsis).
9. **Trajectory pieces.** Each segment has two `THREE.Line`s, the first revolution (or the whole open conic) and the faded last revolution, rebuilt only when the trajectory's version changes. Lines take their colour from the material (colour and opacity), as each has one colour. In the parent's own frame, the last revolution runs from the last time the ship is at its current anomaly to the event.
10. **Markers.** `trajectoryMarkers` takes the ship ID, since a `Trajectory` doesn't carry it. Marker texts are placed after the labels and hidden where they would overlap one, rather than going through `declutter` (they aren't pickable). Markers more than 50 px off screen aren't placed.
11. **Projection with the view.** `projectFrame` takes the focus and selection as an optional argument, for the merge exemption of focused and selected ships; the sprint 2 projection tests call it without.
12. **Test helpers.** `sim/testSystem.ts` (the synthetic star–planet–moon system with the moon in the planet's xy plane) and `ui/panels/testStores.ts` (store resets) are test-only modules in `src/`.
13. **Smoke check 6.** A focused ship on the far side of its parent is hidden by the parent's disc, because a refocus keeps the camera's direction. `ships.mjs` snaps to Kestrel's orbit (P) and zooms out two notches before hovering it, so the ship and both of its apsides are on screen. Whether focusing a ship should choose a better viewpoint is open question 9.

## Questions settled before the sprint

1. **Content values:** based on the current Starship (V3), with a 100 t payload and full tanks (S3-23). Sources for the figures: [Teslarati on the V3 upgrades](https://www.teslarati.com/spacex-unveils-sweeping-starship-v3-upgrades-ahead-may-19-launch/), [Wikipedia: SpaceX Starship (spacecraft)](https://en.wikipedia.org/wiki/SpaceX_Starship_(spacecraft)). They disagree on details, and the V3 propellant and dry masses aren't confirmed there, so the numbers are round estimates.
2. **Pe/Ap markers for other ships:** they show for the selected, hovered and focused ships. "Active ship" and "selected ship" may turn out to be the same thing; sprint 6 settles that, and this rule follows it.
3. **Encounters several revolutions ahead:** drawn. The last revolution before the event is drawn faded, and the SOI marker names the revolution (S3-17 to S3-19).

## Open questions

None at present.
