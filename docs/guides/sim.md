# Guide to the `sim/` layer

`src/sim/` is the simulation: the body tree, ships, maneuver nodes, patched-conic trajectories, the sim clock, the event queue, and the `World` that holds them all. It turns the pure math of `orbital/` into things with IDs and a time line. It imports `math/`, `orbital/` and `content/`, and nothing above. Player rules are not here: `game/actions.ts` checks them and then calls into `sim/`.

This guide describes the code as it stands after milestone 1, sprint 5b. The design is in [architecture.md](../architecture.md) (see "Simulation core") and the rules in [features.md](../features.md). The code cites decisions as `S<sprint>-<n>` (S3-9 is decision 9 of `planning/sprint-3.md`).

## 1. Architecture

```
World ─┬─ system: BodySystem          bodies on rails (body.ts)
       ├─ clock: Clock                t, warp, pause, Pause on, warp-to (clock.ts)
       ├─ ships: Record<ShipId, Ship> orbit state, modules, propellant, plan (ship.ts, maneuver.ts)
       ├─ nextShipSeq, nextNodeSeq    ID counters
       └─ derived: Derived            rebuildable, not saved
            ├─ trajectories           ShipId → { segments, version, key }   (trajectory.ts)
            ├─ events                 PQueue<SimEvent>, one pending event per ship (events.ts)
            ├─ trajectoryCache        the last few trajectories per ship, by key
            └─ cacheStats
```

| File | What it is |
|---|---|
| `body.ts` | `BodySystem` and `Body`: the tree, derived fields, validation, states, frame changes, per-frame positions |
| `ship.ts` | `Ship`, `OrbitState`, `createShip`, `shipStats` (mass, Isp, Δv), `shipStateAt` |
| `maneuver.ts` | `ManeuverNode`, the burn frame, `planBudget`, `burnPropellant` |
| `trajectory.ts` | `Segment`, `computeTrajectory` (patched conics through a plan), `trajectoryStateAt`, `trajectoryKey` |
| `events.ts` | `SimEvent`, the `EventRegistry`, `refreshShipDerived`, the ship event handlers |
| `clock.ts` | `Clock`: warp steps, pausing, Pause on, warp-to easing |
| `world.ts` | `World`, `createWorld`, `addShip`, `advanceWorld` (the frame's sim step), `shipPointAt`, `shipBodyAt` |
| `upcoming.ts` | A ship's upcoming events from its trajectory, and warp-to stop times |
| `testSystem.ts` | A synthetic star, planet and moon for tests (`sim/` tests may not import `gen/`) |

### How time moves

The sim is **event driven, not stepped**. Between events everything is analytic: bodies from their mean elements, ships from the conic of their current segment. Once per frame, `render/stages.ts`'s clock stage calls `advanceWorld(world, dtWall, registry)`:

1. `clockTarget(clock, dtWall)` gives the time to aim for: `t + min(dtWall, 0.25 s) × rate`, capped at a warp-to's stop.
2. Every event due before the target is popped in `(time, seq)` order. `clock.t` is set **exactly** to the event's time and the event is dispatched. Handlers may queue new events, which run in the same frame if due.
3. If a handler asks to pause (Pause on), the clock pauses at that event's time and the frame ends.
4. Otherwise `t` moves to the target. A warp-to that reached its stop pauses the clock.

At most `MAX_EVENTS_PER_FRAME` (256) events run per frame. Because positions are closed-form, a frame at ×10⁷ costs the same as a frame at ×1, and the clock lands on each node and SOI crossing exactly.

### How a ship moves

A ship stores only `orbit: OrbitState`: its state relative to a parent at the start of its current segment (S3-6). From that, its plan and its Δv, `computeTrajectory` predicts its whole path as a list of segments, up to `MAX_SEGMENTS` (5) coasting segments or `HORIZON_CAP` (10 years). Each segment is a conic around one parent, and ends at the earliest of:

- `'impact'`: inbound at the parent's radius plus atmosphere height (closed form);
- `'soi-exit'`: outbound at the parent's SOI radius (closed form);
- `'soi-enter'`: into a major child's SOI (searched with `findSphereEntry`, only for children whose radial band overlaps the ship's);
- `'maneuver'`: an enabled node's time (ties with an SOI change or impact go to the node);
- `'horizon'`: the cap.

The first segment's end is queued as the ship's one pending event. When it fires, the handler moves the ship's `orbit` to the next segment's start (`transitionState`: a frame change at an SOI event, or Δv added at a node) and recomputes. **The prediction and the execution use the same numbers**, so a node executes exactly as drawn.

## 2. Common patterns

- **Plain data in the world.** Every type in `World` except `derived` is plain, JSON-safe data (S2-2), and the tests check round trips. No classes, no functions, no `Map`s. `derived` is rebuildable from the rest with `rebuildDerived` (S3-11) and is not saved.
- **Derived, not stored.** Mass, Δv, Isp and thrust come from `shipStats(ship)` on demand (S3-5). `Body.major`, `soiRadius` and `childIds` are derived once by `buildBodySystem` and then stored (S1-10).
- **Refresh after every change.** Any code that changes a ship's orbit, plan, propellant or status must call `refreshShip(world, id)` (or `refreshShipDerived`). That recomputes the trajectory if its key changed, bumps the trajectory's `version`, and re-queues the ship's event.
- **Versioned events.** Each `SimEvent` carries the `trajectoryVersion` it was queued for. Handlers check it with `current(world, e)` and ignore stale events, so replacing a plan never needs to find and cancel old events by hand.
- **A trajectory cache keyed by inputs (S4-8).** `trajectoryKey(ship, dv)` writes the status, orbit, enabled nodes and Δv exactly as a string. Same key, no recompute. The last `TRAJECTORY_CACHE_SIZE` (4) results per ship are kept, so dragging a node back to where it was is free.
- **Frames through the common ancestor (S1-11).** `bodyStateIn` and `changeFrame` move a state from one body's frame to another through their lowest common ancestor, never through the Sun unless that is the ancestor. A Moon-to-Earth change never adds and subtracts 1.5 × 10⁸ km.
- **Exhaustive switches on segment kinds.** Every consumer of `Segment` switches on `kind` (and of `SegmentEnd` on the end) with an `assertNever` default. Milestone 3's thrust segments will then fail to compile everywhere they need handling.
- **Handlers are registered, not imported.** `sim/` dispatches events through an `EventRegistry` passed into `advanceWorld`, so it never imports a higher layer, and there is no module-level state. `store/useWorld.ts` creates the registry and calls `registerShipHandlers`.
- **Content as a default parameter.** `createShip`, `shipStats`, `planBudget` and `burnPropellant` take a `Registry` that defaults to the game content, so tests can pass a synthetic one.

## 3. Key files and core functions

### `body.ts`

- Types: `BodyId`, `BodyClass` (`'star' | 'planet' | 'dwarf-planet' | 'moon'`), `BodyRotation` (pole, `w0`, `wRate`), `BodyInput` (what a generator supplies: `mu`, `radius`, `atmosphereHeight`, `orbit?`, `rotation?`), `Body` (adds `major`, `soiRadius?`, `childIds`), `BodySystem { epochJd, rootId, bodies }`.
- **`buildBodySystem(epochJd, inputs)`**: derives `major` (mass ≥ `MAJOR_MASS_THRESHOLD_KG`, 1e19 kg, or the root), the Laplace `soiRadius` of major bodies and `childIds` (by semi-major axis), then validates and throws listing every error. `validateBodySystem` returns the errors instead: one star root, positive `mu` and radius, no cycles, periapsis above the parent and apoapsis inside its SOI, and `childIds` matching the parent links.
- Queries: `getBody` (throws on an unknown ID), `bodyMass`, `soiRadiusOf` (Infinity for the root, 0 for a minor body), `majorChildren`, `ancestors`, `commonAncestor`.
- States: `bodyLocalState(sys, id, t)` (relative to the parent), `bodyWorldState` (heliocentric), **`bodyStateIn(sys, id, frameId, t)`** and **`changeFrame(sys, s, fromId, toId, t)`**.
- Per frame: `bodyOrder(sys)` (depth first, parents before children: the index order of the map's buffers) and **`bodyWorldPositionsInto(sys, order, t, out)`**, one Kepler solve per body and no allocation.
- Rotation: `bodyPole(b)` and `rotationAngle(b, t)`.

### `ship.ts`

- `OrbitState { parentId, t, r, v }`. The parent must be a major body.
- `Ship`: `id`, `seq` (creation order, palette), `name`, `designId` (display only), `backboneId`, `modules` (copied from the design), `payload`, `propellant` (kg per resource), `status` (`'coasting' | 'destroyed'`), `destroyedAt?`, `orbit`, and `plan` (nodes sorted by time).
- `createShip(id, seq, name, design, orbit, reg?)`: copies the design and fills the tanks.
- **`shipStats(ship, reg?)`**: dry, propellant and wet mass, limits, the engines, combined thrust, combined Isp (ΣF / Σ(F/Isp)), the propellant `mixture`, the usable propellant (limited by the scarcest resource at that mixture), Δv by the rocket equation, and acceleration. Every engine fires together (S3-5).
- `shipStateAt(sys, ship, t)`: propagates `ship.orbit` to `t`, ignoring segments. Most code wants `shipPointAt` instead (below).

### `maneuver.ts`

- `ManeuverNode { id, t, enabled, dv: LocalDv, execution: 'impulsive' }`. Δv is in the local orbital frame of the pre-burn state (S4-2). Node IDs are `node-<n>`, unique across ships, from `world.nextNodeSeq`. `MAX_NODES` is 16 and `MIN_NODE_LEAD` 1 s.
- `nodeBasis(sys, parentId, pre)` gives the burn frame; `fallbackPole` is the parent's spin pole or the ecliptic's, for a radial state.
- `nodeDvVector(sys, parentId, pre, dv, dvApplied)` gives the world Δv vector scaled to the applied magnitude. `applyNode` gives the post-burn state.
- **Over budget (S4-4):** the trajectory spends the ship's Δv node by node, and a node asking for more than is left gets what is left. The segment ending at the node records `dvApplied` and `dvVector`.
- **`planBudget(ship, traj)`**: for each node, whether it is reached, Δv requested and applied, `overBudget`, mass before, propellant used and burn duration at full thrust; and the plan's totals (`dvPlanned`, `dvAvailable`, `dvLeft`). The inspector's Plan section shows it.
- `burnPropellant(ship, dv)`: deducts the propellant for a burn at the engines' mixture, never more than is usable. The node handler calls it.

### `trajectory.ts`

- `ConicSegment { kind: 'conic', parentId, r0, v0, tStart, tEnd, endEvent, endTargetId?, endNodeId?, dvApplied?, dvVector? }`; `Segment` is `ConicSegment` for now. `Trajectory { segments, version, key }`.
- **`computeTrajectory(sys, start, { plan, dvAvailable, maxSegments, horizonCap })`**: the patched-conic prediction described above. Segments ending at a node don't count towards `maxSegments`. Deterministic.
- `segmentStateAt(sys, seg, t)`: the state in the segment's parent frame.
- **`trajectoryStateAt(sys, segments, t)`** gives a `TrajectoryPoint { segmentIndex, parentId, state }`: the state at any `t` on the path, from the right segment (the later one at a boundary, so a node's time gives the post-burn state). `null` outside the path.
- `transitionState(sys, seg)`: the next segment's start state, or `null` after an impact or the horizon.
- `trajectoryKey(ship, dv)`: the cache key.

### `events.ts`

- `SimEvent`: `'soi-change' | 'impact' | 'trajectory-horizon' | 'node'`, each with `shipId` and `trajectoryVersion` (and `nodeId` for nodes).
- `createEventRegistry()`, `on(reg, type, handler)`, `dispatch(reg, world, e)`. A handler returns `{ pause: true }` to pause the clock.
- **`refreshShipDerived(world, shipId)`**: the single place a trajectory is (re)computed: compare the key, take the cache or compute, bump the version, and `queueShipEvent`.
- **`registerShipHandlers(reg)`**: the four handlers. SOI change moves the orbit into the next frame. Impact marks the ship destroyed and clears its plan. Node burns the propellant, removes the node and moves the orbit to the post-burn state. Horizon restarts the trajectory from the current state, so a long coast is predicted ten years at a time. Each pauses according to `clock.pauseOn`.

### `clock.ts`

- `Clock { t, warpIndex, paused, pauseOn, warpTo }`. `WARP_STEPS` are ×1 to ×10⁷ in powers of ten. `MAX_FRAME_DT` is 0.25 s of wall time.
- `PausableEvent` (`'node' | 'soi-change' | 'impact'`) and `DEFAULT_PAUSE_ON` (nodes only) (S4-7).
- **Warp-to (S5-3):** a `WarpTo { t, kind, shipId, label }` overrides the rate with `warpToRate(remaining)`, which eases into the stop over `WARP_TO_EASE` (0.1 s of wall time) and never drops below ×100. `WARP_TO_NODE_LEAD` is 60 s. `startWarpTo` unpauses; changing warp, pausing or playing cancels a warp-to.
- Functions: `createClock`, `warpStep`, `warpRate`, `clockTarget`, `advanceClock`, `setWarpIndex`, `warpUp`, `warpDown`, `setPaused`, `startWarpTo`, `cancelWarpTo`. They mutate the clock in place.

### `world.ts`

- `World` and `Derived` (above); `createWorld(system, t)`, `addShip(world, ship)`, `refreshShip`, `rebuildDerived`.
- **`advanceWorld(world, dtWall, reg)`** returns `{ events, pause, arrived }`. The render layer bumps the store version when anything happened.
- **`shipPointAt(world, shipId, t, out?)`**: a coasting ship's state at any `t` from its trajectory (S5-10), with the right parent after nodes and SOI changes. This is how the map places ships, both now and in a preview. `null` if the path doesn't reach `t`.
- `shipBodyAt(world, shipId, t)`: the body a ship is drawn around at `t`, including the body it hit or will hit.

### `upcoming.ts`

- **`upcomingEvents(world, shipId)`** gives `{ events, horizon }`: the segment ends after now (nodes, SOI entries and exits, impacts) plus disabled nodes inside the path, in time order (S5-2). The timeline strip and the ship inspector show them.
- `warpStopTime(e)` (a node's time minus the lead, else the event's time), `nextWarpStop(world, shipId | null)` (the earliest stop at least `MIN_WARP_TO` away, for one ship or all), and `eventLabel(sys, e)` ("Moon SOI entry").

## 4. Testing

`sim/` tests use `testSystem.ts`'s `syntheticSystem()`: a star, an Earth-like planet and a circular moon in the planet's plane, so tests can aim at the moon in closed form. They cover:

- the body tree: building, every validation error, exact sums up the tree, frame changes through the common ancestor (bitwise), velocities against finite differences, and JSON round trips;
- ship stats by hand, mixed engines, and the scarcer-propellant limit;
- trajectories: one horizon segment for a closed orbit, escapes, a moon transfer and flyby, continuity at every boundary, and plans with nodes;
- events: exact event times, insertion order at equal times, events queued by handlers, the per-frame cap;
- node execution matching the prediction (including at ×10⁷), pausing, stale events, and the trajectory cache;
- time control: the clock stopping exactly at a node at every warp, and warp-to easing.

The real-system flights (a hand-flown lunar mission) are in `game/lunarFlight.test.ts` and `gen/lunarMission.test.ts`.

## 5. Recipes

**A new ship mechanism that changes its orbit or plan:** change the plain data, then call `refreshShip(world, id)`. Don't edit `world.derived` by hand.

**A new segment end:** add it to `SegmentEnd`, find it in `findSegmentEnd`, and follow the compiler through the `assertNever` switches: `nextParent`, `eventTypeFor` in `events.ts`, `kindOf` in `upcoming.ts`, and the render and UI code that switches on ends.

**A new event type:** add it to `SimEvent`, map a segment end to it in `eventTypeFor`, and register a handler (in `registerShipHandlers`, or a new `register…` function that `store/useWorld.ts` calls). Check `current(world, e)` first, and refresh the ship at the end. If the player can pause on it, add it to `PausableEvent`.

**A new piece of world state:** keep it plain data, add it to `createWorld`, and decide whether it is saved or derived. Derived data goes in `Derived` and must be rebuildable by `rebuildDerived`.
