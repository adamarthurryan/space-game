# Sprint 4 — Maneuver nodes: detailed plan

This expands [sprint 4](milestone-1-sprints.md#sprint-4--maneuver-nodes) of milestone 1. Module paths follow the source layout in [architecture.md](../docs/architecture.md#layered-structure), and the rendering follows its [rendering conventions](../docs/architecture.md#units-precision-and-rendering-scale).

**Goal:** fly to the Moon by hand. By the end of the sprint, the active ship can have a plan of impulsive maneuver nodes. Nodes are placed by clicking the ship's trajectory or from the inspector. They are edited with a six-handle gizmo on the map, or with typed and scroll-nudged fields. The trajectory is recomputed through the plan as nodes are edited, with the path after the first node dashed. The editor shows the Δv used and left, propellant, burn duration and the resulting orbit or encounter. When the clock reaches a node, the node is executed exactly at its time: the Δv is applied in the local orbital frame and the propellant is deducted. The clock can pause there, by a per-event "pause on" setting. The orbit that results matches the prediction.

**Out of scope:** the timeline strip, "warp to next event", "warp to node", warp drops and preview scrubbing (sprint 5; this sprint only adds the "pause on" setting); fleets, keyboard cycling of the active ship, the full ship inspector and alarms (sprint 6); targets, target-relative AN/DN, the Plan ▾ menu and planning tools (sprint 7); finite execution, thrust arcs and choosing which engines fire (milestone 3); undo; saves (sprint 10; plans are plain data on the ship, so they will be saved with it).

## Decisions made for this sprint

| #     | Topic                     | Decision |
| ----- | ------------------------- | -------- |
| S4-1  | Node model                | `ManeuverNode` is as in [architecture.md](../docs/architecture.md#trajectories): `{ id, t, enabled, dv: { prograde, normal, radial }, execution: 'impulsive' }`, with Δv in km/s. Nodes live on the ship as **`ship.plan: ManeuverNode[]`**, sorted by `t` (plans are per ship, decision 3). The architecture's `shipId` field isn't stored, because the ship holds its plan. IDs are `node-<n>` from `world.nextNodeSeq`, so they are deterministic and unique across ships (alarms in sprint 6 key on them). At most **`MAX_NODES = 16`** per ship. A node executes once and is then **removed** from the plan. |
| S4-2  | Local orbital frame       | Δv is applied in the frame of the **pre-burn state** at `t`, relative to the parent of the segment that contains `t`. **Prograde** = `v̂`. **Normal** = `ĥ = (r × v)/|r × v|`. **Radial (out)** = `v̂ × ĥ`: in the orbit plane, perpendicular to the velocity, pointing away from the parent on a prograde orbit (KSP's convention). For a degenerate state (`|r × v|` < 1e-12 relative), the normal falls back to the parent's pole, or the ecliptic pole if it has none. `orbital/frames.ts` gains `localOrbitalBasis` and the conversions both ways. |
| S4-3  | Trajectory through a plan | `computeTrajectory` takes the plan's **enabled** nodes and the Δv available. A coasting segment also ends at the next node with `t ∈ (tStart, tEnd]`, with `endEvent: 'maneuver'` and `endNodeId`. The next segment starts at the same `t`, in the same frame, with `v += Δv`. **Ties** (a node at the same time as an SOI change or impact) go to the node. Segments that end at `'maneuver'` **don't count towards `MAX_SEGMENTS`**, so up to five patches are computed after the last node. The 10-year cap still counts from the trajectory's start. A node after the trajectory ends (past an impact, the cap, or the segment limit) is **not reached**. It stays in the plan, flagged in the UI, isn't drawn on the path, and isn't executed. A disabled node is ignored by the trajectory, but drawn greyed at its time if it's reached. |
| S4-4  | Δv budget                 | Every engine fires together at the combined Isp (S3-5), so Δv adds up along the plan. The trajectory gets `dvAvailable` (the ship's Δv now) and spends it node by node. A node asking for more than is left gets **what's left**, in its own direction (the player's choice: "burn what's left"). The segment that ends at a node records **`dvApplied`** (km/s, the magnitude really applied). The prediction therefore already shows the short burn, and execution matches it. `planBudget` (sim/maneuver.ts) gives each node its mass before the burn, propellant used per resource, Δv requested and applied, burn duration, and an over-budget flag. |
| S4-5  | Execution                 | When segment 0 ends at `'maneuver'`, the ship's one pending event is **`{ type: 'node', shipId, nodeId, trajectoryVersion }`** at the node's `t` (one pending event per ship, decision 99). The handler takes the pre-burn state from segment 0 at `t` (the same `segmentStateAt` the prediction used). It applies `dvApplied` along the node's direction in the S4-2 frame, deducts the propellant (S4-6), removes the node, re-bases `ship.orbit` to the post-burn state at `t`, and refreshes the ship. As usual, a stale event is ignored. |
| S4-6  | Propellant deduction      | `m1 = m0·exp(−Δv / (Isp·g0))`. The mass `m0 − m1` is taken from the tanks at the engines' combined mixture (S3-5), so the limiting propellant is used up exactly when Δv runs out. Burn duration = `(m0 − m1) / ṁ`, with `ṁ = ΣF / (Isp·g0)` in kg/s (F in N, g0 in m/s²). A propellant that drops below 1e-9 kg is set to 0. |
| S4-7  | Pause on events           | The player's choice: a control decides whether the clock pauses at events. `Clock` gains **`pauseOn: Record<PausableEvent, boolean>`**, with `PausableEvent = 'node' \| 'soi-change' \| 'impact'`. By default it pauses on `node` only. When an event of a ticked type is handled, or a handler returns `{ pause: true }`, `advanceWorld` sets `clock.paused`, leaves `t` at the event's time exactly, and handles nothing more that frame. (Today the flag is returned and ignored.) The Timeline gets a **"Pause on ▾"** popover with a checkbox per type, plus "All events", which ticks or clears them all. It is changed through `game/actions.setPauseOn`. It lives in the world's clock, like the warp, because the sim reads it. Sprint 5's warp drops and sprint 6's alarms build on it. |
| S4-8  | Caching                   | A trajectory carries a **`key`**: a string built from the orbit state, the enabled nodes (`id`, `t`, `dv`) and `dvAvailable`, with numbers written exactly (`toString` of the float64). `refreshShipDerived` skips the computation when the key is unchanged, and doesn't bump the version. Each ship keeps a small cache of its last **4** trajectories by key in `world.derived.trajectoryCache` (not saved), so dragging a handle back, or toggling a node off and on, is a hit. Edits change only one ship, so only that ship is recomputed. While a gizmo handle is dragged, edits are **coalesced to one per animation frame**: pointer moves store the pending edit, and the renderer applies it before the clock stage. |
| S4-9  | Active ship               | The player's choice: **the last selected ship**. `useView` gains `activeShipId`. Selecting a ship (in the list, on the map, or through one of its nodes) makes it active. Selecting a body doesn't change it. A destroyed ship stops being active. The active ship is marked ★ in the Fleets list. **Only the active ship's nodes can be edited:** it has the ghost node and the gizmo. Other ships' nodes are drawn as small ◆ markers. Clicking one makes its ship active and selects the node (interface.md). Sprint 6 adds cycling and fleets on top of this. |
| S4-10 | Node selection            | `MapObjectRef` gains `{ kind: 'node'; shipId; id }`. Selecting a node shows the **node editor** in the inspector (S4-14), with a link back to its ship. A node can't be focused: F and double-click on a node focus its ship. Esc clears the selection, as before. Deleting the selected node selects its ship. |
| S4-11 | Planned path style        | Everything after the first enabled, reached node is the **planned path**: drawn **dashed**, at the ship's colour and alpha (S3-18). The dashes are **8 px on, 6 px off in screen space**. A per-vertex `lineDistance` attribute holds the cumulative screen length, computed on the CPU each frame from the projected vertices, and a small `ShaderMaterial` (with the `logdepthbuf` chunks) discards the gaps. Before the first node, the path is solid as before. For the **active ship**, when segment 0 is closed and ends at a node, the rest of its current orbit after the node (up to one revolution from the ship) is drawn in the future-revolution fade (S3-18). That way the parking orbit stays visible after a TLI node is placed. |
| S4-12 | Ghost node and creation   | Hovering within **8 px** of the active ship's drawn path (main pieces only, after `t`) shows a hollow **◇ ghost** at the nearest point, with the time from now and the altitude above that segment's parent ("T+1 h 23 min · 412 km"). The nearest point is found in screen space (`render/pathPicking.ts`): on the projected polyline, with `t` interpolated linearly between the two neighbouring samples. A click (not a drag) **creates a node** there with zero Δv, and selects it. The ghost has the lowest pick priority (S4-13), and it is hidden while a gizmo drag is in progress. |
| S4-13 | Picking order             | **Gizmo handles** (a `Raycaster` against the handle meshes, called from `pointerInput`), then **node glyphs** within 8 px (any ship's), then the sprint 3 order (ship marker, disc, label, body marker), then the **ghost** on the active ship's path. Node glyphs come before ship markers because a node often sits next to its ship. |
| S4-14 | Gizmo                     | `render/NodeGizmo.ts` is drawn at the **selected node of the active ship**: a group at the node's position (camera-relative, float64 → float32), scaled each frame so the arms are **60 px** long. It has six handles (cones on thin arms): prograde/retrograde **yellow**, normal/anti-normal **magenta**, radial in/out **cyan**. It is drawn on top (`depthTest: false`, high `renderOrder`), oriented by the S4-2 basis. **Dragging a handle** projects the pointer's displacement since the press onto the handle's screen-space axis, giving `d` px. The component becomes `start ± S·sgn(d)·(|d|/100)³`, with `S = 0.1 km/s` (so 10 px ≈ 0.1 m/s, 100 px = 100 m/s, 300 px = 2.7 km/s). **Shift** multiplies by 0.1 (fine) and **Alt** by 10 (coarse). Changing modifier mid-drag re-anchors the start, so the value doesn't jump. **Dragging the node's centre** slides its time along the path. It uses the trajectory computed **without this node**, frozen at the press, so the path doesn't move under the cursor. The time is clamped to `(now + 1 s, horizon)`. Hover lights the handle and shows a tooltip with the component's value. |
| S4-15 | Inspector node editor     | **Time**, as a date (`YYYY-MM-DD hh:mm:ss`) and as "T+" from now. Either field accepts typed input: a date, or a duration like `1d 2h 30m`, `+90s`, `45 min`. **Prograde, normal, radial** in m/s, with a total. Typed values accept `m/s` or `km/s` (m/s if no unit). **Scroll nudges** over a focused field: Δv fields ±1 m/s (Shift 0.1, Alt 10); time ±10 s (Shift 1 s, Alt 10 min). Buttons: **Enabled** toggle, **Delete**, **Snap to Pe**, **Snap to Ap**. A snap moves the node to the nearest Pe or Ap passage, earlier or later, of the path it sits on (the trajectory without the node); Ap is for ellipses only. An invalid typed value shows the action's error under the field and keeps the old value. |
| S4-16 | Adding nodes from the inspector | The ship inspector gets a **Plan** section: the node list (time, Δv, "disabled" or "not reached") and **Add node ▾**: at next **Pe**, **Ap**, **AN**, **DN**, or **at time T…**. "Next" is searched on the **planned trajectory after the last enabled node** (or after now, if the plan is empty), so nodes chain: after a TLI node, "next Pe" is the lunar periapsis. AN/DN are measured against the **segment parent's equator** (its IAU pole), or the ecliptic if it has none, the same reference as the inclination shown in the inspector. Target-relative AN/DN arrive with targets (sprint 7). The passage times come from the conic in closed form (`orbital/passages.ts`). |
| S4-17 | Live feedback             | Shown in the node editor and in the Plan section, recomputed from the trajectory and `planBudget` whenever the store version changes. **Per node:** Δv; propellant used per resource; burn duration; **"Long burn"** when the duration is over **10% of the pre-burn orbit's period** (elliptic orbits only); and, in red, **"Over budget: 2.1 of 3.1 km/s"**. **Plan totals:** Δv planned and **Δv left after the plan**, red when the plan is over budget. **Result after a node:** the first encounter after it, as **"Moon encounter, Pe 230 km, in 3 d"** (Pe = periapsis altitude of the segment that enters; "Moon impact in 3 d" if that segment impacts). Otherwise the resulting orbit: Pe, Ap, i, period, or "escape". Countdowns are from now, and use `formatCountdown`. |
| S4-18 | Node rules (actions)      | `game/actions.ts` gains `addNode`, `addNodeAt`, `editNode`, `deleteNode`, `snapNode` and `setPauseOn`. They refuse, with an error and no change: an unknown or destroyed ship; a node time not at least **1 s after now**; a time after the ship's trajectory ends (impact or cap, for a new node); another node of the same ship within **1 ms**; a non-finite Δv, or a component over **50 km/s**; more than `MAX_NODES`; editing a node in the past (it is about to execute). Edits may reorder nodes; the plan is re-sorted. |
| S4-19 | Lunar test geometry       | The "done when" is proved by a real-system test and by the smoke test. They share a new spawn preset, **"LEO (lunar plane)"**: 200 km circular in the Moon's current orbital plane around Earth. A test helper scans the TLI time and prograde Δv for a lunar periapsis of 100–300 km. Its result at the sandbox epoch is written into the smoke test as constants (a node at T+X with Δv Y), and the unit test asserts that those constants still give a Moon encounter, so they don't silently rot. The scan is a test helper, not a planning tool: tools are sprint 7. |
| S4-20 | Debug handle              | `window.__spaceGame` gains `plan(shipId)` (nodes, plus each node's reached flag and `dvApplied`), `nodeScreen(nodeId)` (glyph position), `gizmo()` (the selected node, and each handle's screen position and axis), `ghost()` (whether it's shown, and its screen position and `t`), `activeShip()`, and `trajectoryKey(shipId)` with a cache hit counter. |

These are copied into [decisions.md](../docs/decisions.md) as decisions 114 onward, with the implementation choices made during the sprint.

## Files to create

```
src/
  orbital/
    (frames.ts extended)   frames.test.ts        localOrbitalBasis, dvToVector, vectorToDv (S4-2)
    passages.ts            passages.test.ts      next Pe / Ap / AN / DN passage time on a conic (S4-16)
  sim/
    maneuver.ts            maneuver.test.ts      ManeuverNode, applyNode, planBudget, burnPropellant (S4-1, S4-4, S4-6)
    (trajectory.ts extended) trajectory.test.ts  plan option, 'maneuver' ends, dvApplied, cap rule (S4-3)
    (ship.ts extended)     ship.test.ts          plan field
    (events.ts extended)   events.test.ts        'node' event and handler, trajectory key and cache (S4-5, S4-8)
    (world.ts extended)    world.test.ts         nextNodeSeq, pauseOn in advanceWorld (S4-7)
    (clock.ts extended)    clock.test.ts         pauseOn
  game/
    (actions.ts extended)  actions.test.ts       node actions, setPauseOn (S4-18)
  gen/
    (sandboxShips.ts extended)                   'leo-lunar-plane' preset (S4-19)
    lunarMission.ts                              test helper: scan for a TLI (S4-19); test-only, like sim/testSystem.ts
    lunarMission.test.ts                         TLI + LOI by plan, executed = predicted (acceptance 3)
  render/
    NodeGizmo.ts                                 the gizmo object, handles, raycast, hover (S4-14)
    nodeGizmoMath.ts       nodeGizmoMath.test.ts sensitivity curve, screen axis, constant screen scale (S4-14)
    pathPicking.ts         pathPicking.test.ts   nearest point on a projected polyline, with t (S4-12)
    screenDash.ts          screenDash.test.ts    per-vertex screen-space line distances (S4-11)
    dashMaterial.ts                              dashed line ShaderMaterial with logdepthbuf (S4-11)
    nodeMarkers.ts         nodeMarkers.test.ts   node glyph positions and texts, reached/disabled (S4-9)
  ui/
    parse.ts               parse.test.ts         parseDuration, parseSpeed, parseDate (S4-15)
    fields/
      QuantityField.tsx    QuantityField.test.tsx  typed value with units, scroll nudges, error text
    panels/
      planDetails.ts       planDetails.test.ts   per-node feedback, totals, result text (S4-17)
      NodeEditor.tsx       NodeEditor.test.tsx   (S4-15)
      PlanSection.tsx      PlanSection.test.tsx  node list and Add node ▾ (S4-16)
    layout/
      PauseOnMenu.tsx      PauseOnMenu.test.tsx  the "Pause on ▾" popover (S4-7)
test/smoke/
  maneuvers.mjs                                  the node, gizmo and lunar flight checks
```

Also change:

- `sim/trajectory.ts`: `SegmentEnd` gains `'maneuver'`; `ConicSegment` gains `endNodeId?` and `dvApplied?`; `Trajectory` gains `key`. Every `SegmentEnd` switch (`events.ts`, `shipDetails.ts`, `trajectoryMarkers.ts`, …) handles `'maneuver'`. The compiler lists them through `assertNever`.
- `sim/ship.ts`: `Ship.plan`, `createShip` with an empty plan.
- `sim/world.ts`: `nextNodeSeq`; `advanceWorld` stops and pauses at a pausing event (S4-7).
- `gen/sandboxShips.ts`: the new preset; the sandbox ships start with empty plans.
- `store/useWorld.ts`: the node actions and `setPauseOn`. `store/useView.ts`: `activeShipId`, `MapObjectRef` with nodes, and `select` setting the active ship.
- `render/MapRenderer.ts`: owns the `NodeGizmo` and applies the coalesced pending edit before the clock stage (S4-8). `render/input/pointerInput.ts`: gizmo raycast, handle and time drags, node glyph picking, the ghost and click-to-create. `render/picking.ts`: nodes (S4-13). `render/layers/TrajectoryLayer.ts`: dashed planned pieces, the current-orbit continuation, and keeping the projected polylines for `pathPicking`. `render/trajectoryMarkers.ts` and `overlays/TrajectoryMarkerOverlay.tsx`: ◆ node and ◇ ghost glyphs. `render/debugHandle.ts`: S4-20.
- `ui/layout/Inspector.tsx`: node, ship or body. `ui/panels/ShipInspector.tsx`: the Plan section. `ui/panels/shipDetails.ts`: `'maneuver'` events ("Burn 3.1 km/s in 20 min"). `ui/panels/FleetList.tsx`: ★ for the active ship. `ui/layout/Timeline.tsx`: the Pause on ▾ menu. `ui/useMapKeys.ts`: Delete removes the selected node; F on a node focuses its ship.
- `package.json`: add `maneuvers.mjs` to the `smoke` script.
- `test/lint/layers.test.ts`: the new cases (see [Lint rules](#lint-rules)).
- [architecture.md](../docs/architecture.md): Trajectories (the `'maneuver'` end, the cap rule, `dvApplied`, plan representation stored on the ship), Caching (the key and per-ship cache), Clock and event queue (`node` events, `pauseOn`), rendering conventions (dashed planned paths, the gizmo, picking order). [decisions.md](../docs/decisions.md): the S4 decisions. [interface.md](../docs/interface.md): the "Pause on" control. [CLAUDE.md](../CLAUDE.md): the current status.

## Interfaces and data models

Units as before: `km`, `s`, `kg`, `km/s`, radians. The UI shows Δv in m/s.

### `orbital/frames.ts` (additions) and `orbital/passages.ts`

```ts
// frames.ts
/** Unit vectors of the local orbital frame of s (S4-2). `fallbackPole` is used when r ∥ v. */
export interface OrbitalBasis { prograde: Vec3; normal: Vec3; radial: Vec3 }
export function localOrbitalBasis(s: StateVector, fallbackPole: Vec3, out?: OrbitalBasis): OrbitalBasis;
export interface LocalDv { prograde: number; normal: number; radial: number } // km/s
export function dvToVector(b: OrbitalBasis, dv: LocalDv, out?: Vec3): Vec3;
export function vectorToDv(b: OrbitalBasis, v: Vec3): LocalDv;

// passages.ts
export type PassageKind = 'periapsis' | 'apoapsis' | 'ascending-node' | 'descending-node';
/**
 * Time from s to the next passage of the given kind (> minDt), from the conic in closed form;
 * null if there is none (apoapsis on an open orbit, periapsis already passed on a hyperbola,
 * a node on an orbit in the reference plane). Nodes are against the plane with pole `pole`.
 */
export function timeToPassage(mu: number, s: StateVector, kind: PassageKind, pole: Vec3, minDt?: number): number | null;
/** The nearest passage of `kind`, before or after (for snapping, S4-15); null as above. */
export function nearestPassage(mu: number, s: StateVector, kind: 'periapsis' | 'apoapsis'): number | null;
```

### `sim/maneuver.ts`

```ts
export type NodeId = string;
export interface ManeuverNode {
  id: NodeId;
  t: number;
  enabled: boolean;
  dv: LocalDv; // km/s, local orbital frame (S4-2)
  execution: 'impulsive'; // 'finite' in milestone 3
}
export const MAX_NODES = 16;
export const MIN_NODE_LEAD = 1; // s after now (S4-18)

/** The post-burn state: Δv along the node's direction, magnitude `dvApplied`. */
export function applyNode(sys: BodySystem, parentId: BodyId, pre: StateVector, node: ManeuverNode, dvApplied: number, out?: StateVector): StateVector;
export const dvMagnitude: (dv: LocalDv) => number;

export interface NodeBudget {
  nodeId: NodeId;
  reached: boolean;
  dvRequested: number; // km/s
  dvApplied: number; // km/s; < requested when over budget
  overBudget: boolean;
  massBefore: number; // kg
  propellantUsed: Partial<Record<ResourceId, number>>; // kg
  burnDuration: number; // s, at full combined thrust (S4-6)
}
export interface PlanBudget { nodes: NodeBudget[]; dvPlanned: number; dvAvailable: number; dvLeft: number /* < 0 if over budget */ }
/** Per-node budget along the plan, from the ship's stats and the trajectory's dvApplied (S4-4). */
export function planBudget(ship: Ship, traj: Trajectory, reg?: Registry): PlanBudget;
/** Deducts the propellant for `dv` from the ship's tanks at the engine mixture (S4-6). Returns the kg used. */
export function burnPropellant(ship: Ship, dv: number, reg?: Registry): Partial<Record<ResourceId, number>>;
```

### `sim/trajectory.ts`, `ship.ts`, `events.ts`, `clock.ts`, `world.ts` (changes)

```ts
// trajectory.ts
export type SegmentEnd = 'soi-exit' | 'soi-enter' | 'impact' | 'horizon' | 'maneuver';
export interface ConicSegment {
  // …sprint 3 fields
  endNodeId?: NodeId; // when endEvent === 'maneuver'
  dvApplied?: number; // km/s, when endEvent === 'maneuver' (S4-4)
}
export interface Trajectory { segments: Segment[]; version: number; key: string /* S4-8 */ }
export interface TrajectoryOptions {
  maxSegments?: number; horizonCap?: number;
  plan?: readonly ManeuverNode[]; // enabled nodes are used, in t order
  dvAvailable?: number; // default Infinity
}
export function computeTrajectory(sys: BodySystem, start: OrbitState, opts?: TrajectoryOptions): Segment[];
/** The cache key of a ship's trajectory inputs (S4-8). */
export function trajectoryKey(ship: Ship, dvAvailable: number): string;

// ship.ts
export interface Ship { /* …sprint 3 fields */ plan: ManeuverNode[] /* sorted by t */ }

// events.ts
export type SimEvent =
  | { type: 'soi-change'; shipId: ShipId; trajectoryVersion: number }
  | { type: 'impact'; shipId: ShipId; trajectoryVersion: number }
  | { type: 'trajectory-horizon'; shipId: ShipId; trajectoryVersion: number }
  | { type: 'node'; shipId: ShipId; nodeId: NodeId; trajectoryVersion: number };
// registerShipHandlers adds the 'node' handler (S4-5).

// clock.ts
export type PausableEvent = 'node' | 'soi-change' | 'impact';
export interface Clock { t: number; warpIndex: number; paused: boolean; pauseOn: Record<PausableEvent, boolean> }
export const DEFAULT_PAUSE_ON: Record<PausableEvent, boolean>; // { node: true, 'soi-change': false, impact: false }

// world.ts
export interface World {
  // …sprint 3 fields
  nextNodeSeq: number;
  derived: {
    trajectories: Record<ShipId, Trajectory>;
    events: PQueue<SimEvent>;
    /** Last 4 trajectories per ship, by key (S4-8); not saved. */
    trajectoryCache: Record<ShipId, { key: string; segments: Segment[] }[]>;
    cacheStats: { hits: number; misses: number };
  };
}
/** Returns { events, pause }; on a pausing event, t stays at its time and the clock is paused (S4-7). */
export function advanceWorld(world: World, dtWall: number, reg: EventRegistry): { events: number; pause: boolean };
```

`refreshShipDerived` builds the key from the ship's orbit, enabled plan and `shipStats(ship).dv`. It returns early if the key equals the current one, uses the cache on a hit, and otherwise computes. It queues the end of segment 0: a `'maneuver'` end queues a `node` event with the segment's `endNodeId`.

### `game/actions.ts` (additions)

```ts
export interface NodeEdit { t?: number; dv?: Partial<LocalDv>; enabled?: boolean }
export function addNode(world: World, shipId: ShipId, p: { t: number; dv?: LocalDv }): ActionResult<NodeId>;
/** At the next passage on the planned path after the last enabled node, or the given time (S4-16). */
export function addNodeAt(world: World, shipId: ShipId, at: PassageKind | { t: number }): ActionResult<NodeId>;
export function editNode(world: World, shipId: ShipId, nodeId: NodeId, edit: NodeEdit): ActionResult;
export function deleteNode(world: World, shipId: ShipId, nodeId: NodeId): ActionResult;
export function snapNode(world: World, shipId: ShipId, nodeId: NodeId, to: 'periapsis' | 'apoapsis'): ActionResult;
export function setPauseOn(world: World, type: PausableEvent | 'all', on: boolean): ActionResult;
```

Each refreshes only the ship it changes (S4-8) and checks the S4-18 rules.

### `store/useView.ts` (changes)

```ts
export type MapObjectRef =
  | { kind: 'body'; id: BodyId }
  | { kind: 'ship'; id: ShipId }
  | { kind: 'node'; shipId: ShipId; id: NodeId };
// ViewState additions:
activeShipId: ShipId | null; // S4-9: set by select() of a ship or node; kept when a body is selected
setActiveShip(id: ShipId | null): void;
```

### `render/` (pure modules)

```ts
// pathPicking.ts
export interface PathHit { shipId: ShipId; segmentIndex: number; t: number; screenX: number; screenY: number; distancePx: number }
/** Nearest point within radiusPx of the projected polylines, with t interpolated (S4-12). */
export function nearestOnPath(lines: readonly ProjectedPolyline[], x: number, y: number, radiusPx: number): PathHit | null;
export interface ProjectedPolyline { shipId: ShipId; segmentIndex: number; screen: Float32Array /* 2n */; times: Float64Array; count: number }

// nodeGizmoMath.ts
export const GIZMO_ARM_PX = 60;
export const DRAG_SCALE = 0.1; // km/s at 100 px (S4-14)
export type GizmoHandle = 'prograde' | 'retrograde' | 'normal' | 'anti-normal' | 'radial-out' | 'radial-in';
/** Δ of the handle's component for a displacement of d px along its screen axis. */
export function dragDelta(dPx: number, mode: 'fine' | 'normal' | 'coarse'): number;
/** World-units scale that makes GIZMO_ARM_PX on screen at distance `dist` (km) from the camera. */
export function gizmoScale(dist: number, cam: FrameCamera): number;
/** The handle axis projected to the screen, as a unit 2D vector (null if it points at the camera). */
export function screenAxis(cam: FrameCamera, nodeScene: Vec3, axis: Vec3): { x: number; y: number } | null;
export function handleEdit(h: GizmoHandle, start: LocalDv, delta: number): LocalDv;

// screenDash.ts
/** Cumulative screen-space length per vertex, px, for dashing (S4-11). */
export function screenLineDistances(cam: FrameCamera, positions: Float32Array, count: number, out: Float32Array): void;

// nodeMarkers.ts
export interface NodeMarker { shipId: ShipId; nodeId: NodeId; pos: Vec3 /* frame-body relative */; state: 'enabled' | 'disabled'; editable: boolean }
export function nodeMarkers(sys: BodySystem, world: World, frameBodyId: BodyId, activeShipId: ShipId | null): NodeMarker[];
```

### `ui/` (pure modules)

```ts
// parse.ts
export function parseSpeed(text: string): number | null; // km/s; "12", "12 m/s", "3.1 km/s"
export function parseDuration(text: string): number | null; // s; "1d 2h 30m", "+90s", "45 min"
export function parseDate(text: string, epochJd: number): number | null; // sim t from "YYYY-MM-DD hh:mm:ss"

// planDetails.ts
export interface NodeDetails {
  nodeId: NodeId; t: number; countdown: number; reached: boolean; enabled: boolean;
  dv: LocalDv; dvRequested: number; dvApplied: number; overBudget: boolean;
  propellant: { resource: ResourceId; name: string; mass: number }[];
  burnDuration: number; longBurn: boolean; // S4-17
  result:
    | { kind: 'encounter'; bodyName: string; periapsisAlt: number; in: number; impact: boolean }
    | { kind: 'orbit'; parentName: string; periapsisAlt: number; apoapsisAlt?: number; i: number; period?: number; escape: boolean }
    | { kind: 'none' }; // not reached
}
export interface PlanDetails { nodes: NodeDetails[]; dvPlanned: number; dvAvailable: number; dvLeft: number; overBudget: boolean }
export function planDetails(world: World, shipId: ShipId, t: number): PlanDetails;
export function resultText(r: NodeDetails['result']): string; // "Moon encounter, Pe 230 km, in 3 d"
```

## Tests

Pure modules use the node environment, components use jsdom with the scene stubbed, and real-body tests go in `gen/` (the `sim/` tests use `sim/testSystem.ts`), as in sprint 3.

### `orbital/frames.test.ts` and `passages.test.ts`

- The basis is orthonormal and right-handed (`radial = prograde × normal`) for circular, eccentric, hyperbolic and retrograde states. On a circular orbit, radial is `r̂`. `vectorToDv(dvToVector(dv)) = dv` to 1e-15. A radial-only state (r ∥ v) uses the fallback pole and stays orthonormal.
- `timeToPassage`: periapsis and apoapsis times match Kepler's equation (1e-9 relative), and propagating by them gives `|r| = r_p` or `r_a`. Ap on a hyperbola is null. Pe on a hyperbola after its periapsis is null. AN/DN against an inclined plane: the propagated state has `z = 0` in that plane, with `v_z > 0` at AN. An equatorial orbit gives null. `minDt` skips a passage at the current state.
- `nearestPassage` picks the earlier passage when it is closer.

### `sim/maneuver.test.ts`

- `applyNode`: a pure prograde Δv on a circular orbit raises the opposite apsis by the vis-viva amount; normal Δv changes the inclination by `2·asin(Δv/2v)`; radial changes neither the energy to first order, nor the plane. `dvApplied` less than the request scales the vector and keeps its direction.
- `burnPropellant`: the propellant used equals `m0(1 − e^{−Δv/ve})` to 1e-12 relative. It is split at the mixture fractions. Burning the ship's whole Δv empties the limiting tank exactly (0, not −1e-10), and Δv afterwards is 0.
- `planBudget`: two nodes of 1 and 2 km/s on a ship with 2.5 km/s give `dvApplied` 1 and 1.5, the second over budget, and `dvLeft = −0.5`. The masses before each burn chain, and Δv adds up (`Σ dvApplied` equals the Δv between the first and last mass). The burn duration matches `(m0 − m1)/ṁ`. Unreached and disabled nodes have `dvApplied` 0.

### `sim/trajectory.test.ts` (additions, synthetic system)

- A prograde node on a circular orbit ends segment 0 at `'maneuver'` at the node's `t` exactly. Segment 1 starts there, in the same frame, with `r` equal and `v` = pre + Δv (1e-12). The rest matches `computeTrajectory` from that state with no plan (deep-equal).
- A node exactly at an SOI exit is applied first (ties go to the node).
- Five SOI patches after two nodes are all computed: `'maneuver'` segments don't count towards the cap.
- A node after an impact, and one past the cap, are not reached: no segment ends at them.
- A disabled node is ignored. Toggling it changes the key.
- The over-budget node's segment records the clamped `dvApplied`.
- Determinism and JSON round trip, with a plan.

### `sim/events.test.ts` and `sim/world.test.ts` (additions)

- A ship with a node queues a `node` event at the node's `t`. When it is handled, the plan loses the node, the propellant drops by `planBudget`'s amount, `ship.orbit` is the post-burn state at `t`, and the new trajectory's segments equal the old prediction's segments after the node (1e-9 relative on states and times; the trailing horizon moves, as in implementation note 5 of sprint 3).
- **Executed = predicted at high warp:** a two-node plan advanced at ×10⁷ in 1/60 s frames (with `pauseOn` cleared) executes both nodes at their exact times. The ship's world position 10 days later equals the original prediction's to 1e-9 relative.
- `pauseOn.node` (default): `advanceWorld` pauses at the node, `t` equals the node's time exactly, and a second event due in the same frame waits for the next unpaused frame. With `pauseOn` cleared, it runs through. `soi-change` and `impact` pause when ticked.
- A stale `node` event (the plan was edited after it was queued) does nothing.
- **Cache:** an unchanged ship doesn't recompute (version unchanged). Editing a node and then restoring it is a cache hit. Editing one ship's plan doesn't touch another's trajectory version. `rebuildDerived` gives the same segments and event times.

### `gen/lunarMission.test.ts` (real system)

- `findTli` from the "LEO (lunar plane)" preset gives a Moon SOI entry with a lunar periapsis of 100–300 km, within 2–6 days, for a Δv of 3.0–3.3 km/s.
- Plan: TLI at that time, then `addNodeAt('periapsis')` gives a node in the Moon's SOI at the lunar periapsis. A retrograde Δv that circularises there (computed in the test from vis-viva) gives a closed Moon-centred segment after it, with e < 0.05.
- Run the world at ×10⁶ with `pauseOn` cleared: both nodes execute. The ship ends with the Moon as its parent. Its orbit's Pe and Ap match the pre-execution prediction to 1 km, and its Δv left matches `planBudget`'s `dvLeft` to 1e-9 km/s.
- **The smoke constants** (S4-19), applied to a fresh sandbox world, still give a Moon encounter.

### `game/actions.test.ts` (additions)

- `addNode` returns `node-1`, then `node-2`, and keeps the plan sorted. Each S4-18 refusal gives an error naming the problem and leaves the world deep-equal to before.
- `editNode` changing `t` past another node re-sorts the plan. `deleteNode` removes it and re-queues the ship's event.
- `addNodeAt('apoapsis')` on a circular-ish LEO uses the next apoapsis. After a TLI node it searches after that node. On a hyperbola, Ap is refused.
- `snapNode` moves to the nearest Pe or Ap of the path without the node.
- `setPauseOn('all', false)` clears every type.

### Render tests

- `nodeGizmoMath.test.ts`: `dragDelta(10)` ≈ 1e-4 km/s, `(100)` = 0.1, `(−100)` = −0.1, fine is ×0.1, coarse ×10. The curve is monotonic and odd. `gizmoScale` gives 60 px at several distances. `screenAxis` of an axis pointing at the camera is null. Retrograde handles subtract from prograde.
- `pathPicking.test.ts`: the nearest of two polylines is chosen; `t` interpolates between samples; a point more than 8 px away gives null; a vertex outside the screen or behind the camera is skipped.
- `screenDash.test.ts`: distances are cumulative and non-decreasing, and equal the sum of projected segment lengths in px.
- `nodeMarkers.test.ts`: a marker sits on the trajectory at the node's `t` (in the frame body's frame at that time, as S3-16); unreached nodes give none; disabled ones are marked; only the active ship's markers are editable.
- `picking.test.ts` (additions): a node glyph beats the ship marker beside it; the ghost is returned only when nothing else is hit.
- `trajectoryGeometry.test.ts` (additions): the planned pieces are flagged dashed from the first reached node on; the current-orbit continuation is a closed loop's remainder after the node.

### Component tests (jsdom)

- **`QuantityField.test.tsx`:** typing `3.1 km/s` commits 3.1 km/s; `abc` shows an error and keeps the value; the wheel over a focused field nudges by 1 m/s, Shift 0.1, Alt 10; Enter commits and Escape reverts.
- **`NodeEditor.test.tsx`:** for a TLI-like node it shows the Δv, the burn duration, and the result "Moon encounter, Pe … km, in …". Editing prograde recomputes the result. Over budget shows the red text. Delete selects the ship. Disable greys the node and the result says so. Snap to Ap moves the time.
- **`PlanSection.test.tsx`:** lists nodes in time order, with "not reached" flags; "Add node ▾ → at next Pe" adds and selects a node; Δv left turns red over budget.
- **`PauseOnMenu.test.tsx`:** the defaults are node only; "All events" ticks all three; changes go through `setPauseOn`.
- **`FleetList.test.tsx`, `AppShell.test.tsx`** (additions): selecting a ship marks it ★ and keeps it when a body is selected; the inspector shows the node editor for a selected node.
- `parse.test.ts` and `planDetails.test.ts`: every accepted and rejected format; the result texts for encounter, impact, orbit and escape; the 10% long-burn threshold.

### `test/smoke/maneuvers.mjs` (`npm run smoke`)

`shell.mjs`, `map.mjs` and `ships.mjs` run unchanged first.

1. Spawn "LEO (lunar plane)" through the form. It becomes active (★). Snap to its orbit (P).
2. **Ghost and create:** hover a point on its path: `ghost()` is shown within 8 px. Click: `plan(id)` has one node at about the ghost's `t`, and the node editor is shown.
3. **Gizmo:** `gizmo()` lists six handles on screen. Drag the prograde handle 100 px along its axis: prograde is 0.1 km/s ± 5%. With Shift held, 100 px adds 0.01 km/s. The trajectory's version changed, and its planned part is drawn (vertices > 0).
4. **Typed values:** type the S4-19 TLI time and Δv in the editor. The result reads "Moon encounter, Pe …". `trajectory(id)` has `'maneuver'` then `'soi-enter'` into the Moon.
5. **Chain:** "Add node ▾ → at next Pe" adds a node in the Moon's SOI. Type the retrograde Δv from the unit test. The result reads an orbit around the Moon.
6. **Execute:** warp to ×10⁵. The clock pauses at the first node (`pauseOn.node`), with sim `t` equal to the node's time. Play: it pauses again at the second. After it, the ship's SOI is the Moon, its orbit matches the prediction read at step 5 within 1 km, and the plan is empty.
7. **Pause on:** clear "node" in Pause on ▾, then add a node and warp past it: the clock doesn't pause.
8. Over budget: a 20 km/s node shows Δv left in red.
9. No console errors, warnings or failed requests. Screenshots of the TLI plan (Earth focus) and the lunar orbit (Moon focus) go to `test/smoke/out/`.

### Lint rules

Added to `test/lint/layers.test.ts`:

| File path given        | Code                                                    | Expected                  |
| ---------------------- | ------------------------------------------------------- | ------------------------- |
| `src/orbital/bad.ts`   | `import { applyNode } from '../sim/maneuver'`           | layer error (orbital → sim) |
| `src/sim/bad.ts`       | `import { useView } from '../store/useView'`            | layer error (sim → store) |
| `src/sim/bad.ts`       | `import { Raycaster } from 'three'`                     | framework error           |
| `src/game/ok.ts`       | `import { planBudget } from '../sim/maneuver'`          | no errors                 |
| `src/render/ok.ts`     | `import { useWorld } from '../store/useWorld'`          | no errors                 |

`render/` may import `game/` under the layer rule, but the gizmo and ghost call node actions **through `store/useWorld.ts`**, as `ui/` does, so every edit bumps the store version. This is a convention checked in review, not a lint rule.

## Acceptance criteria

Sprint 4 is done when all of these hold:

1. **Checks:** `npm test`, `npm run lint`, `npm run build`, `npm run format:check` and `npm run smoke` pass, with no lint warnings and no console errors or warnings in the smoke run. The sprint 3 tests and smoke checks pass unchanged, except for the new `plan` field and the `'maneuver'` case where they enumerate.
2. **Lunar flight by hand:** in the browser, a trans-lunar injection and a lunar orbit insertion can be planned by placing nodes on the path, dragging gizmo handles and typing values, and then executed (smoke checks 2–6).
3. **Executed = predicted:** after execution, the ship's orbit matches the orbit predicted before it, to 1 km in Pe and Ap and 1e-9 relative in position (the real-system test, the high-warp world test and smoke check 6). The propellant and Δv left match `planBudget`.
4. **Execution:** nodes execute exactly at their time at any warp, apply Δv in the S4-2 frame, deduct propellant by the rocket equation, burn what's left when over budget, and are removed. Disabled and unreached nodes don't execute.
5. **Pause on:** the clock pauses at node execution by default, and the Pause on ▾ control turns pausing on or off for node, SOI change and impact events, separately or all together.
6. **Editing:** ghost and click-to-create; a six-handle gizmo with the S4-14 sensitivity and Shift/Alt modes; dragging a node along the path; typed fields with units and scroll nudges; Add at next Pe/Ap/AN/DN/time; snap to Pe/Ap; enable, disable and delete. Only the active ship's nodes are editable, and clicking another ship's node makes it active.
7. **Feedback:** Δv used and left (red when over budget), propellant per resource, burn duration with the long-burn warning, and the resulting orbit or encounter text update as a node is edited.
8. **Caching:** an unchanged ship isn't recomputed; edits recompute only the edited ship, at most once per animation frame while dragging; a restored edit is a cache hit (unit tests and `trajectoryKey` in the debug handle).
9. **Rendering:** the planned path is dashed in screen space, the parking orbit stays visible faded after a node, node glyphs and the gizmo use the float64 → float32 path, and the gizmo is picked with a `Raycaster` from the renderer's pointer listeners.
10. **Conventions:** every `SegmentEnd` and `SimEvent` switch is exhaustive; plans are plain data on the ship and survive a JSON round trip; all node actions go through `game/actions.ts`.
11. **Docs:** decisions S4-1 to S4-20, and the implementation choices, are logged in decisions.md. architecture.md (Trajectories, Caching, Clock and event queue, rendering conventions) and interface.md (Pause on) are updated, and CLAUDE.md shows sprint 4 as complete.

## Suggested order of work

1. `orbital/frames.ts` basis and `orbital/passages.ts`, with tests.
2. `sim/maneuver.ts`; the plan in `computeTrajectory` (`'maneuver'` ends, `dvApplied`, the cap rule); `Ship.plan`. Fix every switch the compiler lists.
3. The `node` event and handler, `burnPropellant`, `pauseOn` in the clock and `advanceWorld`, and the trajectory key and cache, with the synthetic and high-warp tests.
4. `game/actions.ts` node actions; the store wiring; `activeShipId` and node refs in the view.
5. The "LEO (lunar plane)" preset, `gen/lunarMission.ts` and its test. Fix the smoke constants here.
6. The inspector: `parse.ts`, `QuantityField`, `planDetails`, `NodeEditor`, `PlanSection`, the Pause on ▾ menu, the ★ in the Fleets list. The lunar flight can now be flown with typed values alone, before any map editing.
7. The map: node glyphs and picking, dashed planned paths and the current-orbit continuation, `pathPicking` with the ghost and click-to-create.
8. `NodeGizmo` and `nodeGizmoMath`: handles, raycast, drag sensitivity, the time drag, and the per-frame edit coalescing.
9. `maneuvers.mjs`, the debug probes, the lint cases, and the docs.

## Implementation notes

Choices made while building, beyond the decisions above. They are logged in [decisions.md](../docs/decisions.md) with decisions 114–135.

1. **Radial sign.** The plan first wrote radial out as `ĥ × v̂`, which points inward (`(r × v) × v = −v²r + (r·v)v`). It is `v̂ × ĥ`, fixed in S4-2.
2. **Execution equals prediction.** A `'maneuver'` segment stores the Δv vector it applied (`dvVector`) as well as its magnitude. The node handler moves the ship with `transitionState`, the same code the prediction used, so the executed orbit is bitwise the predicted one (the smoke test sees 0 km difference).
3. **Nodes on an SOI boundary.** A node exactly at an SOI exit (ties go to the node) left the post-burn state numerically just inside the SOI, where `timeToRadius` finds no outbound crossing. A start within 1e-9 of the SOI radius moving outward now exits at once (decision 134).
4. **Pausing.** Handlers decide: one that acts returns `{ pause: true }` when its type is ticked in `pauseOn`, so a stale event never pauses. `advanceWorld` then stops at that event (it used to return the flag and carry on). An impact also clears the ship's plan.
5. **Focus vs. selection.** `MapObjectRef` gained nodes, but the camera can't focus one, so `focus` is a narrower `FocusRef` (body or ship), and `focusRefOf` maps a node to its ship. The compiler then listed every camera and label path to update.
6. **The TLI scan.** A grid of departure times and Δv missed the narrow band of lunar periapses, and the first hit was an encounter 23 days out, after several loops. `findTli` brackets the lunar periapsis against 200 km in Δv for each departure time, bisects, requires SOI entry within 6 days, and keeps the cheapest; it takes about 1 s. Its result is rounded to whole seconds and 1 mm/s for typing: **T+3,600 s, 3.130535 km/s** (lunar Pe 201 km, entry after 3.5 days).
7. **Where the tests live.** The full lunar flight goes through the actions, so it is `game/lunarFlight.test.ts` (`gen/` may not import `game/`). The check that `maneuvers.mjs` types the same TLI as `SMOKE_TLI` is `test/smoke/constants.test.ts`, which compares the two files' text, because `src/` tests have no Node types and the `test/` config can't import `src/` modules.
8. **"Next" passages.** `addNodeAt` searches the planned path after the last enabled, reached node, segment by segment; on an escape trajectory "next Ap" is the aphelion in the Sun's frame. Kestrel's orbit is exactly circular, so it has no periapsis: the action says so.
9. **Field nudges** have explicit steps: Δv 1 m/s (Shift 0.1, Alt 10), time 10 s (Shift 1 s, Alt 10 min). `nudgeStep` lives in `ui/fields/nudge.ts`, apart from the component, for fast refresh. The field keeps the latest props in a ref updated in a layout effect (not during render), for its non-passive wheel listener.
10. **The active ship is highlighted.** Its trajectory is drawn at full strength and its Pe/Ap markers are shown, as for the selected ship (interface.md: "The active ship's trajectory is drawn at full strength").
11. **One line material.** Every trajectory piece uses the dash-capable `ShaderMaterial`; `lineDistance` is computed only for dashed pieces, and the projection only for those and the active ship's main pieces (for the ghost). Each segment has a third piece, `rest`, for the current orbit after a node.
12. **Node glyphs** are part of the trajectory marker overlay (◆ in the ship's colour; the selected node larger, other ships' smaller, disabled ones faded), placed in the labels stage, which records their screen positions in `frame.nodes` for picking. The ghost's text uses `formatCountdown`, passed into `Scene` like `formatDistance`.
13. **The ghost click.** A click creates the node where the ghost was when the button went down, not where a later frame's path puts it (a 0.06 s difference in the smoke test before the fix).
14. **The gizmo.** Its hit spheres are invisible (`colorWrite: false`) but raycastable. Seen down the orbit pole, the normal handles projected onto the node's centre and swallowed node drags: handles under 35% of their arm length on screen are hidden, and a press within 10 px of the centre drags the node (decision 135). The handle tooltip is the canvas's `title`. Edits are flushed at the start of each frame, before the clock stage. The time drag samples the first revolution of each segment of the path without the node, and keeps the node at least 1.5 s after now.
15. **Toolbar and keys.** Orbit plane, Focus, F and P treat a selected node as its ship; Delete or Backspace deletes the selected node and selects its ship.
16. **Debug handle.** Besides S4-20, `activePath()` returns the active ship's projected path pieces, which the smoke test hovers.

## Questions settled before the sprint

1. **Active ship:** the last selected ship. It stays active when a body is selected (S4-9).
2. **Over budget:** a node burns what's left, in its direction. The prediction already shows the short burn (S4-4).
3. **Clock at execution:** a "Pause on ▾" control with a checkbox per event type (node, SOI change, impact) and "All events". By default it pauses on nodes (S4-7).

## Open questions

1. **Executed nodes.** They are removed from the plan (S4-1). If a burn history turns out to be wanted, for the inspector or for alarms, it could be kept as `ship.log` later.
