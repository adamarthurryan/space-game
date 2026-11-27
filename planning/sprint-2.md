# Sprint 2 — The map: detailed plan

This expands [sprint 2](milestone-1-sprints.md#sprint-2--the-map) of milestone 1. Module paths follow the source layout in [architecture.md](../docs/architecture.md#layered-structure), and the rendering follows its [rendering conventions](../docs/architecture.md#units-precision-and-rendering-scale) (decision 53).

**Goal:** watch the solar system move. By the end of the sprint, the map shows the 31 bodies of sprint 1 at their positions for the sim time, with their orbits. The camera orbits a focus body, zooms logarithmically from low orbit to the whole system, refocuses smoothly and snaps to a plane. A simple clock runs time from ×1 to ×10⁷. The System tab lists the body tree, and the inspector shows the selected body.

**Out of scope:** ships, trajectories, `game/actions.ts` and the event queue (sprint 3); the timeline strip, "warp to next event" and preview scrubbing (sprint 5); the Filters panel, layer toggles and search (sprint 6); targets and the context menu (sprint 7); minor-body instancing and asteroids (sprint 8); SOI spheres and Lagrange points (later layers); textures, rings, visible spin and atmospheres (the look-and-feel pass, sprint 10); unit switching and the full keyboard pass (sprint 10); R3F pointer events (no gizmos until sprint 4).

## Decisions made for this sprint

| #     | Topic                     | Decision |
| ----- | ------------------------- | -------- |
| S2-1  | Sandbox epoch             | **Fixed: 2030-01-01 00:00 TDB** (JD 2462502.5), as `SANDBOX_EPOCH_JD` in `gen/scenario.ts`. Screenshots and smoke checks are reproducible, and nothing reads the wall clock for the date. |
| S2-2  | Clock and world location  | The clock and a minimal world live in `sim/` now: `sim/clock.ts` (`t`, warp step, paused, `advanceClock`) and `sim/world.ts` (`{ system, clock }`). Sprint 3 adds event clamping to the clock and ships to the world, without moving either. The clock is plain data, mutated in place once per frame. |
| S2-3  | Warp steps                | Powers of ten, **×1 … ×10⁷** (8 steps). The clock starts running at ×1. Pausing keeps the warp step. Wall `dt` per frame is clamped to 0.25 s, so a frame after a stall (tab in the background, debugger) jumps at most 0.25 s × warp. Bodies are on rails, so a large jump is harmless anyway; sprint 3's event clamping makes it safe for ships. |
| S2-4  | Scene frame and origin    | Scene axes are the world axes (ecliptic J2000, +Z = ecliptic north), in **km**. The **scene origin is the camera focus point**: every position is computed in float64 as `world − origin` and only then written to float32. Objects carry no float32 world positions anywhere. `camera.up` is the controls' reference pole (S2-9). |
| S2-5  | Depth                     | **Logarithmic depth buffer** (`gl.logarithmicDepthBuffer`), with a fixed near plane of 1e-3 km and far plane of 1e12 km. It works on every WebGL2 device, unlike reversed-Z, which needs `EXT_clip_control`. Every custom shader includes three's `logdepthbuf` chunks. |
| S2-6  | Body appearance           | **Flat colours:** a shaded sphere per body with one colour from `render/bodyStyle.ts`, lit by a point light at the Sun with no distance decay, plus a faint ambient light so night sides are visible. The Sun is unlit and emissive. No textures, rings or visible spin this sprint. |
| S2-7  | Minimum screen size       | Spheres are drawn at true size. When a body's disc is under **3 px** in radius, a **6 px marker** (4 px for minor bodies) is drawn instead, and the sphere is hidden once the disc is under 0.5 px, to avoid sub-pixel flicker. A moon's marker (and its label) is hidden when it falls within 6 px of its parent's centre, which is how moons disappear at system zoom. |
| S2-8  | Orbit lines               | A body's orbit is drawn **around its parent**, from its mean elements at the current `t`. It is **recomputed every frame in float64** and then written to float32 relative to the origin: 31 orbits × 257 points is cheap. Points are sampled in eccentric anomaly **starting at the body's current position**, so the body is always exactly on its line, and they are **denser near the body**, where a chord would visibly miss the orbit at close zoom. The focus-frame rule in architecture.md applies to ship trajectories (sprint 3), not to body orbits. |
| S2-9  | Orbit line fading         | Each line's opacity is the product of two factors. A **screen-size fade:** 0 when the orbit's projected diameter is under 15 px, 1 above 40 px; this hides moon orbits at system zoom. A **distance fade** per vertex: 1 within 10× the camera distance from the camera, falling log-linearly to a floor of 0.2 at 1000×, so distant outer orbits stay as faint context. The focused, selected and hovered bodies' orbits are drawn at full strength and brighter. The thresholds are constants in `render/OrbitLines.tsx`, to be tuned by eye. |
| S2-10 | Camera controls           | A **custom controller**, not drei's `OrbitControls`: yaw and pitch about a reference pole, and `log10(distance)`. **One wheel notch = ×2** (trackpad deltas scale proportionally), animated over 150 ms. Left-drag orbits (0.005 rad/px). Pitch is in [−90°, 90°]: the camera's orientation is built from the pole's basis, not with `lookAt`, so looking straight down is not degenerate. Distance is clamped to [1.05 × the focus's radius, 5e10 km]. LEO (≈ 6,800 km from Earth's centre) to framing Neptune's orbit (≈ 1e10 km) is about 21 notches. |
| S2-11 | Refocus                   | Double-click (on the map or in the tree), or **F** for the selected body, refocuses. Over 0.8 s, eased, the origin moves from the old focus to the new one, **both evaluated at the current `t` every frame**, so moving bodies are tracked during the animation. The distance moves in log space to the new body's framing distance: 3 × the apoapsis of its outermost major moon, or 8 × its radius if it has none; for the Sun, 2 × Neptune's apoapsis. |
| S2-12 | Plane snapping            | Two snaps: **ecliptic** (**E**) and **the selected body's orbital plane** (**P**; disabled when the Sun or nothing is selected). A snap sets the controls' reference pole and animates pitch to 90° over 0.5 s. The pole is converted at the moment of the snap so the view doesn't jump, then the new pole **persists** for orbiting until the next snap. An orbital pole is evaluated once, at the time of the snap, and then kept fixed, so precession at high warp doesn't turn the view. |
| S2-13 | Selection and focus       | Separate: **selection** drives the inspector and the tree highlight; **focus** drives the camera. Click selects, double-click selects and focuses, and a click on empty space changes nothing. **Esc** clears the selection. Both are a `MapObjectRef` (`{ kind: 'body', id }`), a union that sprint 3 extends with ships. |
| S2-14 | Picking                   | **Screen-space, one path** for discs, markers and labels (`render/picking.ts`). Priority: a disc under the cursor (the nearest one) > a label under the cursor > the nearest marker within 8 px. A press that moves under 4 px is a click; more is a drag (orbit). R3F pointer events aren't used this sprint. |
| S2-15 | Labels                    | A **DOM overlay** of absolutely positioned spans over the canvas, with `pointer-events: none`, positioned every frame through refs. **Greedy decluttering:** labels are placed in priority order (focus, selection, hover, then star > planet > dwarf planet > moon, then by radius), and a label that overlaps a placed one is hidden. A label is also hidden when its body is behind the camera, or behind a nearer body's disc. DOM spans are fine for 31 labels; the sprint 10 performance pass decides whether hundreds of minor-body labels need a canvas. |
| S2-16 | Frame order               | One `useFrame` per stage, ordered by negative priority (R3F sorts callbacks by priority, and only a positive priority takes over rendering): **clock −4, body positions −3, camera −2, scene layers −1, projection and labels 0.** Priorities must stay ≤ 0. The stages share a per-scene `MapFrame` scratch object (plain arrays), so no stage allocates per frame. |
| S2-17 | World and React           | The world object is mutated in place. `store/useWorld.ts` bumps a **version** when an action changes it (pause, warp); React panels subscribe to the version. Readouts that change with `t` (the date, the inspector's current distance) use **`useSimTime(10 Hz)`**, so panels don't re-render every frame. Clock controls are store actions for now; sprint 3 decides whether they go through `game/actions.ts`. |
| S2-18 | Body inspector            | **Physical:** mass, GM, mean radius, surface gravity, escape speed, sidereal rotation period, axial tilt (pole vs. orbit normal). **Orbit** (from the mean elements at `t`): parent, `a`, `e`, inclination to the ecliptic **and to the parent's equator** (deferred here by S1-16), Ω and ω (labelled with their reference plane: ecliptic or Laplace plane), period, Pe and Ap distances, current distance from the parent and speed. **SOI radius**, "none (minor body)", or "—" for the Sun. Distances are shown in km below 1e7 km and in AU above; unit switching is sprint 10. |
| S2-19 | Date display              | `YYYY-MM-DD hh:mm:ss`, shown as if UTC (S1-2), with astronomical year numbering and a sign for years ≤ 0 (`−0999-01-01`). Seconds are shown at every warp. |
| S2-20 | Keyboard                  | **Space** play/pause, **,** / **.** warp down/up, **F** focus the selection, **E** / **P** snap, **Esc** clear the selection. Ignored while a text field has focus. The rest of the shortcut set is sprint 10. |
| S2-21 | Debug handle              | In dev builds only, `window.__spaceGame` exposes read-only probes for the smoke test: the camera state, a body's projected screen position and disc radius, the placed labels, and the view and world stores. It is not compiled into production builds. |

These should be copied into [decisions.md](../docs/decisions.md) at the end of the sprint.

## Files to create

```
src/
  sim/
    clock.ts           clock.test.ts         Clock, warp steps, advance
    world.ts           world.test.ts         World = { system, clock } (sprint 3 extends)
  gen/
    scenario.ts        scenario.test.ts      SANDBOX_EPOCH_JD, createSandboxWorld()
  orbital/
    sample.ts          sample.test.ts        orbit polyline sampling in float64
  store/
    useWorld.ts                              the world, its version, clock actions, useSimTime
  render/
    mapFrame.ts                              MapFrame: per-frame shared scratch, and its context
    precision.ts       precision.test.ts     float64 → origin-relative float32
    bodyStyle.ts       bodyStyle.test.ts     colour and marker size per body
    FrameLoop.tsx                            the clock and body-position stages
    Bodies.tsx                               body layer: one useFrame for all bodies
    BodyMesh.tsx                             one sphere, positioned through a ref
    BodyMarkers.tsx                          one THREE.Points for all markers
    OrbitLines.tsx                           orbit layer: one useFrame for all lines
    OrbitLine.tsx                            one line object, buffers written through a ref
    picking.ts         picking.test.ts       screen-space pick
    useMapPointer.ts                         hover, click, double-click, drag → picking and view
    debugHandle.ts                           window.__spaceGame (dev only)
    camera/
      controller.ts    controller.test.ts    pure camera state and its updates
      framing.ts       framing.test.ts       framing and minimum distances
      CameraRig.tsx                          wheel and drag input, applies the controller each frame
    overlays/
      declutter.ts     declutter.test.ts     greedy label placement
      LabelOverlay.tsx                       DOM label layer
  ui/
    format.ts          format.test.ts        distance, speed, duration, angle, mass, date
    useMapKeys.ts                            keyboard shortcuts (S2-20)
    panels/
      SystemTree.tsx   SystemTree.test.tsx   the System tab
      bodyDetails.ts   bodyDetails.test.ts   derived inspector values (pure)
      BodyInspector.tsx BodyInspector.test.tsx
    map/
      MapToolbar.tsx                         snap buttons over the map
test/smoke/
  lib.mjs                                    server and browser helpers, from shell.mjs
  map.mjs                                    the map checks
```

Also change:

- `sim/body.ts`: `bodyOrder` and `bodyWorldPositionsInto` (the allocation-free variant sprint 1 deferred here).
- `orbital/propagate.ts`: `meanOrbitNormal`.
- `render/Scene.tsx`: the canvas settings, the layers and the overlay.
- `store/useView.ts`: selection, hover, focus and snap requests.
- `ui/layout/LeftSidebar.tsx` (the System tab), `Inspector.tsx`, `Timeline.tsx` (live controls and date), `MapView.tsx` (toolbar and keys).
- `ui/layout/AppShell.test.tsx`: the System tab is no longer empty.
- `test/smoke/shell.mjs` (uses `lib.mjs`), and the `smoke` script in `package.json`, which runs both files.
- `test/lint/layers.test.ts`: the new cases (see [Lint rules](#lint-rules)).
- [architecture.md](../docs/architecture.md): the rendering section (scene origin, log depth, body orbit lines around the parent, frame stages) and the R3F review outcome. [CLAUDE.md](../CLAUDE.md): the current status.

## Interfaces and data models

Units as in sprint 1: `km`, `s`, `kg`, `km/s`, radians. Screen values are CSS pixels.

### `sim/clock.ts`

```ts
export const WARP_STEPS = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7] as const;
export const MAX_FRAME_DT = 0.25; // s of wall time per frame (S2-3)

/** Plain data. Sprint 3 adds the next-event clamp. */
export interface Clock {
  t: number; // sim seconds from the epoch
  warpIndex: number; // index into WARP_STEPS
  paused: boolean;
}

export function createClock(t?: number): Clock; // running, ×1
export function warpRate(c: Clock): number; // 0 when paused
/** t += min(dtWall, MAX_FRAME_DT) × warp, unless paused. Mutates c. Returns the sim time advanced. */
export function advanceClock(c: Clock, dtWall: number): number;
export function setWarpIndex(c: Clock, i: number): void; // clamped to the steps
export function warpUp(c: Clock): void;
export function warpDown(c: Clock): void; // stops at ×1; does not pause
export function setPaused(c: Clock, paused: boolean): void;
```

### `sim/world.ts` and `gen/scenario.ts`

```ts
export interface World {
  system: BodySystem;
  clock: Clock;
  // sprint 3: ships, fleets, plans, …
}
export function createWorld(system: BodySystem, t?: number): World;

// gen/scenario.ts
export const SANDBOX_EPOCH_JD = 2_462_502.5; // 2030-01-01 00:00 TDB (S2-1)
export function createSandboxWorld(): World; // generateRealSystem(SANDBOX_EPOCH_JD), clock at 0
```

### Additions to `sim/body.ts` and `orbital/`

```ts
// sim/body.ts
/** Every body, parents before children, children by semi-major axis. The index order of per-frame buffers. */
export function bodyOrder(sys: BodySystem): BodyId[];
/**
 * World positions of every body at t, 3 floats per body in `order`, into out.
 * Each body's local state is computed once and parents are reused, so this is one Kepler solve per body.
 */
export function bodyWorldPositionsInto(
  sys: BodySystem,
  order: readonly BodyId[],
  t: number,
  out: Float64Array,
): Float64Array;

// orbital/propagate.ts
/** Unit orbit normal (direction of h) at t, in ecliptic axes, plane rotation applied. */
export function meanOrbitNormal(m: MeanElements, t: number): Vec3;

// orbital/sample.ts
/**
 * Points around a mean-element orbit at t, relative to the parent, in ecliptic axes, float64.
 * Point 0 and point `count` are the body's position at t; the loop is closed (S2-8).
 * Spacing in eccentric anomaly follows ΔE = 2π·(u − k·sin(2πu)/(2π)), u ∈ [0, 1], so points
 * near the body are 1/(1 − k) times denser. Writes 3·(count + 1) values; returns out.
 */
export function sampleMeanOrbitInto(
  m: MeanElements,
  t: number,
  count: number,
  out: Float64Array,
  density?: number, // k, default 0.9
): Float64Array;
```

`sampleMeanOrbitInto` builds the perifocal basis vectors P and Q once per call (through ω, i, Ω and the reference plane), then each point is `a(cos E − e)·P + b·sin E·Q`. The same formula must give the body's position at `t` that `stateFromMeanElements` gives, and the test checks this.

### `store/useWorld.ts` and `store/useView.ts`

```ts
// useWorld.ts
interface WorldState {
  world: World; // mutated in place by the clock; never replaced except on reset
  version: number; // bumped by actions (S2-17)
  togglePause(): void;
  warpUp(): void;
  warpDown(): void;
  setWarpIndex(i: number): void;
}
export const useWorld: UseBoundStore<StoreApi<WorldState>>;
/** Sim time, re-rendering the caller at most `hz` times a second. */
export function useSimTime(hz?: number): number; // default 10

// useView.ts (added to the sprint 0 state)
export type MapObjectRef = { kind: 'body'; id: BodyId }; // sprint 3 adds ships
export type SnapPlane = 'ecliptic' | 'selected-orbit';

interface ViewState {
  // …sprint 0 fields
  selected: MapObjectRef | null;
  hovered: MapObjectRef | null;
  focus: MapObjectRef; // initially Earth
  focusSeq: number; // bumped by every focusOn, so refocusing the same body re-frames it
  snapRequest: { plane: SnapPlane; seq: number } | null;
  expanded: Record<BodyId, boolean>; // System tab tree state
  select(ref: MapObjectRef | null): void;
  setHovered(ref: MapObjectRef | null): void;
  focusOn(ref: MapObjectRef): void; // also selects
  snapTo(plane: SnapPlane): void;
  toggleExpanded(id: BodyId): void;
}
```

The camera's per-frame animated state (current yaw, pitch, distance, origin) is not in zustand: it lives in the controller (S2-17). The view store holds the requests (focus, snap), and the rig reacts to them.

### `render/mapFrame.ts`

```ts
/** Per-scene scratch shared by the frame stages (S2-16). Plain arrays, allocated once. */
export interface MapFrame {
  t: number;
  order: BodyId[]; // bodyOrder(system)
  indexOf: Record<BodyId, number>;
  world: Float64Array; // 3n world positions at t (stage −3)
  origin: Vec3; // world position of the scene origin (stage −2)
  // stage 0: projection
  screenX: Float32Array; // n, CSS px from the canvas's top left
  screenY: Float32Array;
  depth: Float32Array; // distance from the camera, km; Infinity if behind it
  discPx: Float32Array; // projected radius in px
  markerShown: Uint8Array;
  labels: PlacedLabel[]; // from the declutter pass, for picking
}
export const MapFrameContext: React.Context<MapFrame | null>;
```

### `render/precision.ts`

```ts
/** out[3i..3i+2] = float32(world[3j..] − origin), for j = indices[i] (or all). The only float64 → float32 path. */
export function toOriginRelativeInto(out: Float32Array, world: Float64Array, origin: Vec3, indices?: ArrayLike<number>): Float32Array;
export function setObjectPosition(obj: { position: { set(x: number, y: number, z: number): void } }, world: Vec3, origin: Vec3): void;
```

### `render/camera/controller.ts` and `framing.ts`

```ts
export interface CameraController {
  focusId: BodyId;
  pole: Vec3; // reference pole, unit, ecliptic axes (S2-12)
  yaw: number; // about the pole, from the pole's reference axis
  pitch: number; // [−π/2, π/2]
  logDistance: number; // log10 km
  target: { yaw: number; pitch: number; logDistance: number };
  refocus: { fromId: BodyId; elapsed: number; duration: number; fromLogDistance: number } | null;
  snap: { fromPole: Vec3; elapsed: number; duration: number } | null;
  limits: { minLogDistance: number; maxLogDistance: number };
}

/** The pole's in-plane basis: u = its ascending node on the ecliptic (X if the pole is ±Z), v = pole × u. */
export function poleBasis(pole: Vec3): { u: Vec3; v: Vec3; w: Vec3 };
export function createController(focusId: BodyId, framing: number, minDistance: number): CameraController;
export function zoomBy(c: CameraController, notches: number): void; // ×2 per notch (S2-10), clamped
export function orbitBy(c: CameraController, dxPx: number, dyPx: number): void;
export function beginRefocus(c: CameraController, toId: BodyId, framing: number, minDistance: number): void;
export function beginSnap(c: CameraController, pole: Vec3): void; // re-expresses yaw/pitch in the new basis first
/** Advances the zoom, orbit, refocus and snap animations by dtWall. */
export function stepController(c: CameraController, dtWall: number): void;
/** Scene origin: the focus, or the eased blend of the old and new focus during a refocus. focusWorld(id) gives a body's world position at the current t. */
export function controllerOrigin(c: CameraController, focusWorld: (id: BodyId) => Vec3): Vec3;
/** Camera position relative to the origin, and its orientation as a basis (forward, up). */
export function controllerPose(c: CameraController): { offset: Vec3; forward: Vec3; up: Vec3 };

// framing.ts
export function framingDistance(sys: BodySystem, id: BodyId): number; // S2-11
export function minDistance(sys: BodySystem, id: BodyId): number; // 1.05 × radius
export const MAX_DISTANCE = 5e10;
```

Pure TypeScript, no three.js, so it's tested headlessly. `CameraRig.tsx` owns one controller, listens for `wheel` and pointer drags on the canvas element, reacts to `focusSeq` and `snapRequest`, and in stage −2 calls `stepController`, writes `frame.origin`, and sets the three.js camera's position and quaternion from `controllerPose`.

### `render/picking.ts` and `render/overlays/declutter.ts`

```ts
export interface Rect { x: number; y: number; w: number; h: number }
export interface PlacedLabel { ref: MapObjectRef; rect: Rect }

/** S2-14. Reads the projection arrays of the frame. Returns null if nothing is within reach. */
export function pick(frame: MapFrame, x: number, y: number, radiusPx?: number): MapObjectRef | null;

export interface LabelCandidate {
  ref: MapObjectRef;
  anchorX: number; anchorY: number; // label goes right of the marker or disc
  width: number; height: number; // measured once per label text
  priority: number; // higher first (S2-15)
  hidden: boolean; // behind the camera, occluded, or a moon too close to its parent
}
/** Greedy placement: highest priority first; skips labels overlapping an earlier one. Stable for equal priority. */
export function declutter(cands: readonly LabelCandidate[], viewport: Rect): PlacedLabel[];
export function labelPriority(body: Body, ref: MapObjectRef, view: { focus: MapObjectRef; selected: MapObjectRef | null; hovered: MapObjectRef | null }): number;
```

### `render/bodyStyle.ts`

```ts
export interface BodyStyle { color: string; markerPx: number }
/** By ID for the real system, then by class (stars, planets, moons), so a fictional system needs no entries. */
export function bodyStyle(body: Body): BodyStyle;
```

### `ui/format.ts` and `ui/panels/bodyDetails.ts`

```ts
export function formatDistance(km: number): string; // "6,771 km", "1.524 AU"; switch at 1e7 km
export function formatSpeed(kmps: number): string; // "7.67 km/s", "340 m/s" below 1 km/s
export function formatDuration(s: number): string; // "23 h 56 min", "1.881 yr"
export function formatAngle(rad: number): string; // "23.44°"
export function formatMass(kg: number): string; // "5.972 × 10²⁴ kg"
export function formatDate(d: CalendarDate): string; // S2-19

export interface BodyDetails {
  physical: { mass: number; mu: number; radius: number; surfaceGravity: number; escapeSpeed: number; siderealDay?: number; axialTilt?: number };
  orbit?: {
    parentId: BodyId; a: number; e: number; inclinationEcliptic: number; inclinationParentEquator?: number;
    lan: number; argp: number; referencePlane: 'ecliptic' | 'laplace';
    period: number; periapsis: number; apoapsis: number; distance: number; speed: number;
  };
  soi: { kind: 'radius'; radius: number } | { kind: 'minor' } | { kind: 'root' };
}
export function bodyDetails(sys: BodySystem, id: BodyId, t: number): BodyDetails;
```

`bodyDetails` is pure TypeScript in `ui/`, so it can import `sim/` and `orbital/`, and it's tested in the node environment.

### `ui/panels/SystemTree.tsx`

An ARIA `tree`: one `treeitem` per body, nested by parent, with `aria-expanded` on bodies that have children. The Sun starts expanded and the planets collapsed. Each row shows the name, a class glyph, and "minor" for minor bodies. Click selects, double-click focuses, Up/Down move, Right/Left expand/collapse or move to the child/parent, Enter focuses. The selected body's ancestors are expanded when it's selected from the map, and its row scrolls into view.

## Tests

Pure modules use the node environment; components use jsdom with the scene stubbed, as `AppShell.test.tsx` does.

### `sim/clock.test.ts`, `sim/world.test.ts`, `gen/scenario.test.ts`

- `advanceClock` adds `dtWall × warp`; adds nothing while paused; clamps `dtWall` to `MAX_FRAME_DT`; returns the sim time advanced.
- Warp up and down stop at ×1 and ×10⁷; `warpDown` at ×1 doesn't pause; pausing keeps the step.
- At ×10⁷, 3.156 s of 1/60 s frames advance one Julian year to within 1e-9 relative.
- The clock and the world survive a JSON round trip unchanged.
- `SANDBOX_EPOCH_JD` equals `jdFromCalendar(2030-01-01 00:00)`. `createSandboxWorld()` validates and is deterministic (deep-equal across calls).

### Additions to `sim/body.test.ts` and `orbital/propagate.test.ts`

- `bodyOrder` lists every body once, with each parent before its children.
- `bodyWorldPositionsInto` matches `bodyWorldState(…).r` for every body, to 1e-6 km, at 10 times across the range.
- `meanOrbitNormal` (no rates) equals the normalised `r × v` from `stateFromMeanElements` to 1e-12, and the Moon's is about 5.1° from the ecliptic pole.

### `orbital/sample.test.ts`

- Point 0 and the last point equal `stateFromMeanElements(m, t).r` to 1e-9 relative, for planets, the Moon (with rates) and a retrograde moon (Triton) and a negative-`n` moon (Tethys).
- Every point lies on the ellipse: its distance from the parent is `a(1 − e cos E)` and it lies in the orbit plane (normal component < 1e-9 a), for `e = 0`, Earth, Pluto and `e = 0.95`.
- Spacing: the two segments next to the body are shorter than the middle segments by about `1 − k`; with `k = 0`, spacing in E is uniform.
- At close zoom, the polyline's distance from the true orbit within 1e5 km of the body is under 1 km for Earth's orbit (256 segments).

### `render/precision.test.ts`

- With the origin at Earth at `t = 1e9 s`, a point 6,771 km from Earth comes out of `toOriginRelativeInto` within 1e-3 km of the float64 difference. The naive path (float32 world positions, then subtracted) is off by more than 1 km for the same point, so the test also shows why the rule exists.
- `setObjectPosition` agrees with `toOriginRelativeInto`.

### `render/camera/controller.test.ts` and `framing.test.ts`

- `zoomBy(1)` doubles the target distance; zoom clamps at both limits.
- From Earth's minimum distance (1.05 × 6,371 km), 21 notches out reach a distance from which Neptune's whole orbit fits a 50° field of view.
- `orbitBy` clamps pitch to ±90°, and `controllerPose` is finite and orthonormal at exactly ±90° (no `lookAt` degeneracy).
- **Snap:** after `beginSnap(pole)` and enough steps, `forward = −pole` to 1e-9. At the first step after the snap, the camera's direction is unchanged from before it (no jump).
- **Refocus:** the origin starts at the old focus and ends at the new one; with moving bodies (Earth → Mars over 0.8 s at ×10⁶), the origin is continuous between steps (no jump larger than the bodies' own motion), and at the end it equals the new focus's position exactly.
- `poleBasis` is orthonormal for the ecliptic pole, the Moon's orbit pole and Uranus's.
- `framingDistance`: Jupiter's frames Callisto's orbit; Earth's frames the Moon's; a moonless body gives 8 × radius; the Sun gives 2 × Neptune's apoapsis.

### `render/picking.test.ts` and `render/overlays/declutter.test.ts`

Built on synthetic `MapFrame` arrays.

- A cursor inside two discs picks the nearer one. A cursor on a label picks its body even far from the marker. A cursor 7 px from a marker picks it; at 9 px, nothing. Behind-camera bodies are never picked.
- `declutter` never returns overlapping rects; the focus and the selection are always placed if on screen; a higher-priority label wins an overlap; equal priorities keep input order; hidden candidates are never placed.
- `labelPriority` orders focus > selection > hover > star > planet > dwarf planet > moon, then by radius.

### `ui/format.test.ts` and `ui/panels/bodyDetails.test.ts`

- Formatting: the km/AU switch, thousands separators, durations across s…yr, negative years in dates, `formatDate` at the epoch gives `2030-01-01 00:00:00`.
- **Earth:** surface gravity 9.80 m/s² ± 0.05, escape speed 11.19 km/s ± 0.02, sidereal day 23 h 56 min, axial tilt 23.44° ± 0.1, period 365.25 d ± 0.1, SOI ≈ 9.25e5 km.
- **Moon:** inclination to the ecliptic 5.1° ± 0.2; to Earth's equator between 18.2° and 28.7°; reference plane `ecliptic`.
- **Io:** reference plane `laplace`; inclination to Jupiter's equator under 0.1°.
- **Sun:** no orbit, `soi.kind === 'root'`. **Phobos:** `soi.kind === 'minor'`.

### Component tests (jsdom)

- **`SystemTree.test.tsx`:** the tree shows the Sun and nine children; expanding Jupiter shows its four moons in order of `a`; click selects (view store); double-click focuses (`focusSeq` bumps); keyboard: Down/Up move, Right expands, Left collapses and moves to the parent, Enter focuses; minor bodies are marked.
- **`BodyInspector.test.tsx`:** "Nothing selected" with no selection; selecting Jupiter shows its name, class, physical data, orbit and SOI radius; selecting the Sun shows no orbit section.
- **`Timeline.test.tsx`:** Play/Pause toggles the clock; Faster and Slower step the warp, and are disabled at ×10⁷ and ×1; the warp readout shows `×10⁶` style; the date readout shows `2030-01-01 00:00:00` at start.
- **`AppShell.test.tsx`:** the System tab shows the tree instead of "No bodies yet."; the other tabs are unchanged.

### `test/smoke/map.mjs` (`npm run smoke`)

Uses the dev-only debug handle (S2-21). Each check is a PASS/FAIL line, as in `shell.mjs`.

1. The System tab lists the Sun and its nine children; the canvas is not blank (the Sun's pixels are bright at system zoom).
2. Clicking "Jupiter" in the tree selects it: the inspector's heading is "Jupiter" and it shows an SOI radius.
3. Double-clicking Jupiter refocuses within 1.5 s; the labels of Io, Europa, Ganymede and Callisto are all placed, and their markers or discs are at least 6 px apart.
4. **E** snaps to the ecliptic: pitch reaches 90° within 1 s. Selecting the Moon and pressing **P** makes the camera's forward vector antiparallel to the Moon's orbit normal to within 0.1°.
5. **Zoom:** focused on Earth at its minimum distance, 21 wheel notches out give a distance of at least 9e9 km, with Neptune's label placed.
6. **No jitter:** focused on Earth at its minimum distance, at ×10⁵ for 2 s, Earth's projected centre stays within 0.5 px of the canvas centre and its disc radius varies by under 0.5 px. The same for the Moon.
7. **Warp:** at ×10⁷ for 3 s of wall time, the sim time advances by 10⁷ × the measured wall time to within 10% (frame clamping at 0.25 s is allowed for), and the date readout shows the later year.
8. Hovering Mars's label shows a pointer cursor, and clicking it selects Mars.
9. No console errors, warnings or failed requests, as in `shell.mjs`. Screenshots at system zoom and Jupiter focus go to `test/smoke/out/`.

### Lint rules

Added to `test/lint/layers.test.ts`:

| File path given         | Code                                                  | Expected                      |
| ----------------------- | ----------------------------------------------------- | ----------------------------- |
| `src/sim/bad.ts`        | `import { useWorld } from '../store/useWorld'`        | layer error (sim → store)     |
| `src/render/bad.ts`     | `import { formatDistance } from '../ui/format'`       | layer error (render → ui)     |
| `src/sim/bad.ts`        | `performance.now()`                                   | determinism error             |
| `src/store/ok.ts`       | `import { createSandboxWorld } from '../gen/scenario'` | no errors                    |
| `src/render/ok.ts`      | `import { bodyOrder } from '../sim/body'`             | no errors                     |
| `src/ui/ok.ts`          | `import { pick } from '../render/picking'`            | no errors                     |

## Acceptance criteria

Sprint 2 is done when all of these hold:

1. **Checks:** `npm test`, `npm run lint`, `npm run build`, `npm run format:check` and `npm run smoke` pass, with no lint warnings and no console errors or warnings in the smoke run.
2. **Zoom:** from low Earth orbit (Earth's minimum distance), 21 wheel notches show the whole system, with Neptune's orbit and label on screen (smoke check 5).
3. **No jitter:** the focused body stays within 0.5 px of the centre while time runs at ×10⁵, at Earth's and the Moon's minimum distances (smoke check 6), and the float32 precision test passes.
4. **Jupiter's moons:** double-clicking Jupiter frames its system, with all four Galilean moons labelled and separately visible (smoke check 3).
5. **Plane snap:** **E** and **P** look straight down on the ecliptic and on the selected body's orbital plane (smoke check 4).
6. **Warp:** a year passes in about 3 s at ×10⁷ (smoke check 7), and the date readout follows.
7. **Map rules:** at system zoom moon orbits are hidden and moon markers merge into their planets; at close zoom bodies are true-size spheres lit from the Sun; each body sits on its own orbit line at every zoom.
8. **Panels:** the System tab tree, selection from the map or the tree, double-click focus, and the body inspector (including the inclination to the parent's equator) work as tested.
9. **Conventions:** JSX in `render/` only decides which objects exist; per-frame state is set in one `useFrame` per stage, in the order of S2-16; no float32 world positions exist anywhere.
10. **R3F review** (decision 53) is written up as a section of this file, with a recommendation for sprint 3, and summarised in decisions.md.
11. **Docs:** decisions S2-1 to S2-21 and any implementation choices are logged in decisions.md; architecture.md's rendering section is updated; CLAUDE.md shows sprint 2 as complete.

## Suggested order of work

1. `sim/clock.ts`, `sim/world.ts`, `gen/scenario.ts` and `store/useWorld.ts`, then the live Timeline controls and date. Time runs before anything is drawn.
2. `bodyOrder`, `bodyWorldPositionsInto`, `meanOrbitNormal` and `orbital/sample.ts`, with their tests.
3. The scene skeleton: `MapFrame`, the frame stages (S2-16), the log depth buffer, `precision.ts`, and the bodies as lit flat-colour spheres around a fixed origin.
4. The camera controller and rig: zoom and orbit first, then refocus and snapping.
5. Orbit lines and their fading.
6. Markers, projection into `MapFrame`, picking, the label overlay and decluttering.
7. `useView` selection and focus, the System tab, the body inspector, the map toolbar and the keys.
8. The smoke test, then the R3F review, the lint cases and the docs.

## Implementation notes

Choices made while building, to be logged in decisions.md with S2-1 to S2-21.

- **Step 1.** The frame-stage priorities are `STAGE` in `render/mapFrame.ts`, not in `FrameLoop.tsx` (fast refresh needs component files to export only components). Play and Pause are one toggle button. `ui/format.ts` starts with `formatDate` and `formatWarp` only.
- **Step 2, orbit spacing.** The spacing `u − k·sin(2πu)/(2π)` from the interface above can't pass its own accuracy test: for Earth's orbit in 256 segments it misses the true orbit by about 85 km within 1e5 km of Earth at k = 0.9, and by 1.8 km even at k = 1 (the error near the body is quadratic). `orbitSpacing` in `orbital/sample.ts` blends uniform spacing (k = 0) with a spacing whose density is ∝ (1 − cos 2πu)² (k = 1, the default), which grows as u⁴ away from the body: 0.53 km in the same test. Its widest chord, opposite the body, is 8/3 of the uniform one (about 80,000 km off for Earth's orbit, 0.2 px when that orbit fills the view). Next to the body the spacing is still about (1 − k) of uniform.
- **Step 2, orbit normal.** `meanOrbitNormal` is the ellipse's normal turned to the side of the body's actual motion (the sign of `W · (r × v)` with rates). Tethys has n < 0, but its apsidal rate carries it prograde (S1-18), so the sign of n alone would point its normal the wrong way.
- **Step 2, shared geometry.** `orbital/propagate.ts` has `meanOrbitGeometryInto` (a, b, e, E at t and the perifocal axes P, Q, W in ecliptic axes) and `meanPositionInto`, which `bodyWorldPositionsInto` and `sampleMeanOrbitInto` use. `frames.ts` has `planeToEclipticInPlace`. Apart from the Kepler solve's small result object, nothing allocates per frame.
- **Step 2, tests.** Tests with real bodies (the Moon, Triton, Tethys, and every body for `bodyWorldPositionsInto`) are in `gen/realSystem.test.ts`, since `orbital/` and `sim/` tests may not import `gen/`. The `orbital/` tests use synthetic elements in the same roles. Positions match `bodyWorldState` to max(1e-6 km, 1e-15·|r|): an ulp at Uranus is 5e-7 km.

## R3F review

To be written at the end of the sprint (decision 53): count what in `render/` uses JSX for more than deciding which objects exist, and what is refs and imperative code. If it is mostly imperative, plan the switch to plain three.js for sprint 3.

## Open questions

None at present. Four were settled before the sprint: the fixed sandbox epoch (S2-1), flat colours (S2-6), the clock and world in `sim/` now (S2-2), and ×2 per wheel notch (S2-10).
