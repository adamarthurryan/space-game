# Guide to the `render/` layer

`src/render/` is the map: the three.js scene of bodies, orbits, ship trajectories, markers, labels and the maneuver node gizmo, its camera and its pointer input. It is plain three.js with no React Three Fiber (decision 90); React appears only in `Scene.tsx`, which hosts the renderer, and in the two DOM overlays. It imports `store/` and every layer below it, but **not `ui/`**. `ui/layout/MapView.tsx` mounts it.

This guide describes the code as it stands after milestone 1, sprint 5b. It is a map of the code for someone about to change it. The rules behind it are in [architecture.md](../architecture.md) (see "Units, precision and rendering scale" and "State management and persistence"), the design in [interface.md](../interface.md), and the reasons in [decisions.md](../decisions.md) and the sprint plans, which the code cites as `S<sprint>-<n>` (S3-2 is decision 2 of `planning/sprint-3.md`). The stores it reads are described in [store.md](store.md), and the panels around it in [ui.md](ui.md).

## 1. Architecture

```
ui/layout/MapView ─▶ render/Scene.tsx ─┬─ MapRenderer (plain three.js, rAF loop)
                                       │    ├─ CameraStage            camera/
                                       │    ├─ layers                 layers/, NodeGizmo.ts
                                       │    ├─ pointer + camera input input/
                                       │    └─ STAGES over one MapFrame each frame
                                       ├─ TrajectoryMarkerOverlay     overlays/ (DOM)
                                       └─ LabelOverlay                overlays/ (DOM)
```

- `render/` may import `store/` and everything below it, but **not `ui/`**. When the map needs a UI-side helper, `ui/` passes it in. The trajectory marker texts use `formatDistance` and `formatCountdown` from `ui/format.ts`, which `MapView` hands to `<Scene>` as props.
- It reads the world directly, every frame (`useWorld.getState().world`), and changes it only through the store's action wrappers (pointer input adding a node, the gizmo editing one).

### How the map updates

Unlike the React panels, the map is driven by a `requestAnimationFrame` loop in `MapRenderer`:

| | `render/` (the map) | `ui/` (the panels) |
|---|---|---|
| Driven by | A `requestAnimationFrame` loop in `MapRenderer` | React re-renders |
| Reads the world | Every frame, directly: `useWorld.getState().world` | Through store selectors, when `version` changes, or at 10 Hz via `useSimTime` |
| Reads the view | Once per frame, into a `ViewSnapshot` | `useView(selector)` hooks |
| Allocation | None per frame: shared typed arrays in `MapFrame` | Normal React |
| Changes the world | Pointer input and the gizmo call store actions | Buttons and fields call store actions |

The render loop is also where the sim advances: the first frame stage calls `sim/world.ts`'s `advanceWorld`. **`MapRenderer` is the only place in the code that reads the wall clock for the sim.**

## 2. Key files and core functions

### 2.1 Lifecycle: `Scene.tsx` and `MapRenderer.ts`

`Scene.tsx` is the only React component on the map apart from the two DOM overlays. It:

1. builds a `MapFrame` for the current body system (`createMapFrame`, memoised on `world.system`);
2. builds the label registry and the trajectory marker registry;
3. in an effect, creates a `MapRenderer` on a host `<div>`, calls `start()`, and calls `dispose()` on cleanup;
4. renders `<TrajectoryMarkerOverlay>` and `<LabelOverlay>` over the canvas.

A new body system means a new frame, and so a new renderer. Everything else lives inside `MapRenderer`.

`MapRenderer` owns the `WebGLRenderer` (with a logarithmic depth buffer, ACES tone mapping, and a pixel ratio capped at 2), the `Scene`, a `PerspectiveCamera` with fixed near and far planes (1e-3 km and 1e12 km), a `ResizeObserver`, the input listeners, the layers and the animation loop. **It is the only place in `render/` that reads the wall clock.** The loop gets `dtWall` from the rAF timestamp and passes it down.

The constructor:

- creates `CameraStage` and the layers, in draw order: `BodyLayer`, `OrbitLayer`, `TrajectoryLayer`, `EncounterGhostLayer`, `MarkerLayer`, `NodeGizmo`;
- attaches **pointer input first**, then camera input, so that pointer input can claim gizmo and node drags before the camera sees the event;
- subscribes to `useWorld` and calls `layer.sync(world)` on every layer when `version` or `world` changes;
- registers debug sources (see §2.10).

`renderFrame()` is the frame:

```ts
this.gizmo.flush();                         // apply the queued node edit (at most one per frame)
for (const stage of STAGES) this.runStage(stage);
this.renderer.render(this.scene, this.camera);
```

### 2.2 Frame stages (`stages.ts`)

```ts
STAGES = ['clock', 'bodies', 'ships', 'camera', 'projection', 'layers', 'labels']
```

| Stage | Function | Writes |
|---|---|---|
| clock | `clockStage(world, dtWall, events)`, which calls `advanceWorld`. If any events were handled or a warp-to arrived, `MapRenderer` bumps `version`. | the world |
| bodies | `bodiesStage(frame, world, viewTime)`, which calls `updateFrameBodies`. `MapRenderer` reads the view time first, and ends a preview that now has caught up. | `frame.t` (the view time), `frame.now` (the clock), `frame.world` (body positions, float64) |
| ships | `shipsStage`: `syncFrameShips` (reallocates the ship arrays only if the drawn set changed), then `updateFrameShips`, both from each ship's **trajectory** at `frame.t` (`shipPointAt`) | `frame.ships.*`; also takes the frame's `ViewSnapshot` |
| camera | `CameraStage.update` | `frame.origin`, `frame.camera`, the three.js camera |
| projection | `projectionStage`, which calls `projectFrame` | screen positions, depth, disc sizes, marker and merge flags |
| layers | `layer.update(frame, view)` for each layer | three.js objects; `frame.paths` |
| labels | `labelsStage`: label candidates, declutter, then trajectory markers | DOM spans; `frame.labels`, `frame.nodes` |

The order matters. The sim advances before anything reads positions. Ships come before the camera, because the camera may follow a ship. Projection comes before the layers, because layers need this frame's disc sizes and merge flags. Labels come last, because they give way to everything else on screen.

`ViewSnapshot` (`focus`, `selected`, `hovered`, `frameBodyId`, `activeShipId`, `previewing`) is read from `useView` **once per frame**, so every stage sees the same view.

**Preview time.** Every stage after the clock uses `frame.t`, which is the preview time during a preview and `world.clock.t` otherwise. Use `frame.t` for anything drawn, and never `world.clock.t`. Ships are placed from their trajectory at `frame.t`, so a previewed ship is past its nodes and SOI changes, around the right parent. A ship whose trajectory doesn't reach `frame.t` isn't in `frame.ships`. `frame.now` is the clock's time, which the trajectory layer uses to draw the route flown during a preview. While `previewing` is true, map editing is off: the gizmo and the ghost node are hidden, and node glyphs can't be dragged.

### 2.3 `MapFrame` (`mapFrame.ts`)

`MapFrame` is the shared per-frame state: plain typed arrays, allocated once per body system, so the stages allocate nothing per frame. Per-body arrays are indexed in `frame.order` (`bodyOrder(system)`, parents before children), and `frame.indexOf[id]` maps a body ID to its index. Positions are packed: body `i` is at `world[3i..3i+2]`.

- `t` (the view time), `now` (the clock's time), `order`, `indexOf`, `world` (Float64Array, km), `origin`, `camera` (`FrameCamera`: position relative to the origin, `forward`, `up`, `right`, `fovRad`, `width`, `height`, `pixelRatio`)
- Projection: `screenX`, `screenY`, `depth` (Infinity when behind the camera), `discPx`, `sphereShown`, `markerShown`, `merged`
- `ships: FrameShips`: the same arrays for coasting ships in `seq` order, plus `parentIndex`. They are reallocated only when the set changes, and layers detect that by **identity** (`this.ships?.ids !== fs.ids`).
- `labels`, `nodes`, `paths` and `ghost`: results from later stages that picking and input read.

Its core helpers:

- `frameWorldInto(frame, i, out)` gives a body's world position.
- `mapObjectWorldInto(frame, world, ref, out)` gives a body's or ship's world position. A ship that isn't drawn falls back to the body it is drawn around (`shipBodyAt`): the body it hit, or will hit at a previewed time.
- `frameBodyOf(world, focus, t)` gives the body that trajectories are drawn relative to at `t`: the focused body, or a focused ship's parent then.

### 2.4 Precision: camera-relative rendering (`precision.ts`)

The GPU works in float32, and the solar system spans about 10¹⁰ km. **The scene origin is the camera focus.** Every position written to three.js is `world − origin`, with the subtraction done in float64 before the float32 write. Nothing on the GPU holds a world position.

- `toOriginRelativeInto(out, world, origin, indices?)` handles packed arrays (markers).
- `setObjectPosition(obj, world, origin)` and `setObjectPositionAt(obj, world, i, origin)` handle single objects (body meshes, the Sun's light).

Lines (orbits, trajectories) follow the same rule: a sample relative to a parent or frame body is offset by `parentWorld − origin` in float64 (`writeOrbitLine`, `writeTrajectoryVertices`). Because vertices are rewritten each frame, line objects set `frustumCulled = false`.

### 2.5 The camera (`camera/`)

- **`controller.ts`**: pure TypeScript, with no three.js. A `CameraController` orbits the origin at `yaw` and `pitch` about a reference `pole`, at `logDistance` (log10 km). Its functions are `createController`, `zoomBy` (×2 per wheel notch, eased), `orbitBy`, `beginRefocus` (an eased 0.8 s move of origin and distance), `beginSnap` (look straight down a pole), `stepController(c, dtWall)`, `controllerOriginInto` (the origin, blended between the old and new focus during a refocus) and `controllerPose` (offset, forward and up, built from the pole basis so that pitch ±90° is not degenerate). The input helpers `wheelNotches` and `DRAG_THRESHOLD_PX` (4 px separates a click from a drag) are here too.
- **`framing.ts`**: how far a refocus moves to. `framingDistance` is 3 × the apoapsis of the outermost major moon, or 8 × the body's radius if it has none; for the root it is 2 × the largest planet's apoapsis. `minDistance` is 1.05 × the radius. For ships, `pathFramingDistance` fits the ship's drawn path (to its segment's end or one revolution) around the ship, at least 3 × the parent's radius and at most the parent's framing. `FOV_DEG` (50°) lives here.
- **`CameraStage.ts`**: the three.js side. It subscribes to `useView` for `focusSeq` and `snapRequest`, steps the controller each frame, writes `frame.origin`, applies the pose to the three.js camera through a basis matrix (not `lookAt`), and fills `frame.camera` with `setFrameCamera`. A new focus that is `onScreen` in the last frame keeps the distance, yaw, pitch and pole (only the centre moves); one off screen gets its framing distance. It starts looking straight down the ecliptic (`START_PITCH`). `orbitPoleOf(world, ref)` gives the pole for the "Orbit plane" snap.

### 2.6 Projection and picking

- **`projection.ts`**: `projectFrame(frame, system, view)` does the screen math on the CPU, in float64, from `frame.camera`. For each body it computes the screen position, the depth, and the disc radius in px (angular radius over half the field of view). Thresholds: under 0.5 px the sphere is hidden; under 3 px a fixed-size marker is drawn; a body within 6 px of its parent's centre is `merged` and gets no marker or label. Ships merge the same way unless they are focused, selected or flashing. Other code uses this result rather than projecting again.
- **`occlusion.ts`**: `occludedAt(frame, x, y, depth)` and `sceneOccluded(frame, sx, sy, sz)`: whether a point is behind a nearer drawn disc. Labels, ship picking, trajectory markers, node glyphs and gizmo handles all use it.
- **`picking.ts`**: `pick(frame, x, y)` does screen-space picking over `MapFrame`, with no raycasting. Priority: node glyph > ship marker (unless behind a nearer disc) > the nearest disc under the cursor > label > the nearest body marker within 8 px.
- **`pathPicking.ts`**: `nearestOnPath(paths, x, y)` finds the nearest point on the active ship's projected trajectory, interpolating its time. `TrajectoryLayer` fills `frame.paths` each frame, and the ghost node and node time drags use it.
- **`screenDash.ts`**: `projectScenePoint` and `projectVerticesInto` project origin-relative scene points, and `screenLineDistances` gives the cumulative screen length used for dashes.

### 2.7 Layers (`layers/`, `NodeGizmo.ts`)

Every layer implements `MapLayer`:

```ts
interface MapLayer {
  update(frame: MapFrame, view: ViewSnapshot): void; // every frame
  sync?(world: World): void;                          // when the store version changes
  dispose(): void;
}
```

The rules are:

- **One layer per kind of object**, iterating the world. There is no three.js object per entity class.
- **Rebuild three.js objects only when the set of entities changes**: the system, the drawn ship set (by array identity), or a trajectory's `version`. Never rebuild per frame. Per frame, only write buffer contents and set `needsUpdate`.
- **Keep the logic in pure modules.** Each layer pairs with a pure, tested module and applies its results to three.js.

| Layer | Draws | Pure helpers |
|---|---|---|
| `BodyLayer` | One true-radius sphere per body (unlit for the star, Lambert shading for the rest), a point light at the Sun and a faint ambient light | `bodyStyle.ts` |
| `OrbitLayer` | One `Line` per orbiting body, resampled from its mean elements at `t` every frame (256 segments) and starting at the body. Alpha = base × screen-size fade × per-vertex distance fade; brighter when focused, selected or hovered | `orbitFade.ts`, `orbitLineObject.ts` |
| `TrajectoryLayer` | Each ship's trajectory segments. Each segment has three pieces: `main`; `last`, the faded final revolution before the segment's end; and `rest`, the rest of the current orbit after a node, for the active ship only. The pieces are drawn relative to `view.frameBodyId`, and the planned path after the first node is dashed | `trajectoryGeometry.ts`, `trajectoryMaterial.ts`, `screenDash.ts` |
| `MarkerLayer` | One `THREE.Points` for body markers and one for ship triangles, with sizes in device px (0 = hidden) | `markerMaterial.ts`, `shipStyle.ts` |
| `EncounterGhostLayer` | For each SOI entry on the selected, hovered, focused or active ship's path, a camera-facing ring of the entered body's SOI radius where the body will be at the entry; fills `frame.encounters` for the marker overlay | `encounterGhosts.ts` |
| `NodeGizmo` | Six Δv handles on the active ship's selected node, kept 60 px long on screen and drawn on top; sized by the planned path after the node (`conicScreenSize`, `gizmoArmPx`: 60 px arms at 150 px across, down to 20 px at 37.5 px, hidden below), and handles behind a disc are dimmed and not hittable | `nodeGizmoMath.ts`, `nodeMarkers.ts` |

**`trajectoryGeometry.ts`** is the core of the trajectory drawing:

- `conicGeometry(sys, seg)` gives a segment's closed-form conic (perifocal `P`, `Q`, `e`, `p`, mean motion, period, `tPeri`).
- `sampleSegmentInto` and `samplePieceInto` sample in **anomaly**, not time (E, H, or D = tan(ν/2)), so points are dense at periapsis. Each point's time comes from Kepler's equation without a solve, and each point is expressed relative to the frame body *at its own time*. A lunar flyby is therefore a hyperbola in the Moon's frame and the true geocentric path in Earth's.
- `writeTrajectoryVertices` writes the float32 vertices: the ship's current position first, then the points after `t`.
- `firstNodeSegment`, `lastRevolutionWindow` and `currentOrbitRestWindow` decide which pieces are drawn and which are dashed.

`TrajectoryLayer` resamples the `main` piece every frame for a live ellipse in the frame body's own frame. Otherwise it caches the sample and rebuilds it after a quarter period, or when the frame body changes. Dashes are computed in screen space: per-vertex `lineDistance` in px on the CPU, then `DASH_PX` and `GAP_PX` in the shader.

**Custom shaders** (`trajectoryMaterial.ts`, `markerMaterial.ts`) must include three's `logdepthbuf` chunks, or they will depth-fight with the log depth buffer. The trajectory material also includes the tone-mapping and colour-space chunks, so it looks like the built-in materials.

**`NodeGizmo`** is a layer that also takes input. The handle cones are real meshes, hit with a `Raycaster` against invisible spheres (`hitHandle`). Handle drags (`beginHandleDrag`, `dragTo`) project the pointer motion onto the handle's screen axis, with a cubic sensitivity (Shift for fine, Alt for coarse). A modifier change re-anchors the drag so the value doesn't jump. Time drags (`beginTimeDrag`) sample the path *without* the node (`pathWithout` from `game/actions.ts`) and slide the node along it. **Edits are queued in `pending` and applied by `flush()` at the start of the next frame**, so a fast drag costs one trajectory recompute per frame, not one per pointer event.

### 2.8 Input (`input/`)

Both input modules attach DOM listeners to the canvas and return a detach function.

- **`cameraInput.ts`**: the wheel zooms (non-passive, so it can `preventDefault`), and a left-button drag of 4 px or more orbits the camera, with pointer capture.
- **`pointerInput.ts`**: hover sets `useView.hovered` and the cursor (`pointer`, `copy` over the ghost, `grab` over a handle). A click selects. A double-click calls `focusOn`. Over empty space, the active ship's path shows a **ghost node** (`frame.ghost`), and clicking there calls `addNode` and selects the new node. Presses on a gizmo handle, or on one of the active ship's nodes, are **claimed**: `stopImmediatePropagation()` keeps the camera listener (attached second) from seeing them. A claimed node press that doesn't move selects the node; one that moves becomes a time drag. Only the active ship's nodes can be claimed, and not when they are behind a disc or their gizmo is hidden at small scale; clicking another ship's node just selects it. Escape, F, Delete and the other map keys are in `ui/useMapKeys.ts`, not here.

### 2.9 DOM overlays (`overlays/`)

Labels and trajectory markers are DOM, not WebGL, for crisp text and easy styling. **React creates the spans; the labels stage positions them every frame by writing to the DOM directly**, through a registry, with no React re-render.

- **`LabelOverlay.tsx`** renders one span per body and per coasting ship, and registers them in the `LabelRegistry` (`spans[i]`, `shipSpans`). It re-renders on `version` to pick up new ships.
- **`labelLayout.ts`**: `measureLabels` (reads each span's size once, the first time it is laid out), `updateLabelCandidates` and `updateShipLabelCandidates` (anchors from the projection; hidden when merged, off screen or occluded), and `placeLabels`, which first merges ship labels into their parent's (`mergeGroups`: a ship label overlapping its parent's, or a flashing ship), then runs `declutter` and writes `transform` and visibility to the spans. A merged label is the parent's span followed by the ship spans (separators are CSS `::before`) and a pooled "+N" span; `frame.labels` gets one entry per name, for picking, the first with `parts`.
- **`declutter.ts`**: greedy placement by priority. The order is focus > selection > hover > star > planet > dwarf planet > ship > moon, then by radius. The focus and the selection are always placed.
- **`TrajectoryMarkerOverlay.tsx`** and **`trajectoryMarkerLayout.ts`** manage a pool of spans for the encounter ghosts' ○ "Moon at entry", SOI enter and exit, impact, Pe and Ap (`trajectoryMarkers.ts`, only where `hasApsides`), node glyphs (`nodeMarkers.ts`) and the ghost node. Glyphs are always shown, dimmed with no text behind a disc. Texts are placed after the labels and hidden where they would overlap one. `frame.nodes` is filled here for picking, with `occluded`.

### 2.10 Debug handle (`debugHandle.ts`)

In dev builds, `window.__spaceGame` exposes read-only probes: `camera()`, `body(id)`, `labels()`, `ship(id)` and `ships()`, `trajectory(id)` and `trajectoryVertices(id)`, `plan(id)`, `nodeScreen(nodeId)`, `ghost()`, `activePath()`, `gizmo()`, `trajectoryMarkers()`, `simTime()`, from sprint 5 `timeline()`, `preview()`, `clock()`, `shipWorld(id)`, `shipPredicted(id, t)`, `bodyWorld(id)` and `elapsedVertices(id)`, from sprint 5b `frame()`, `flash()`, `fly()` and `encounterGhosts()`, and the two stores (`view`, `world`). `MapRenderer` registers its sources with `registerDebug(key, value)`. In production, `import.meta.env.DEV` is false and the probes are removed as dead code. The smoke tests in `test/smoke/*.mjs` drive the app through this handle. When you add something visible, add a probe for it and a smoke check.

## 3. Common patterns

### Writing map code

- Put the logic in a pure module that reads and writes `MapFrame` or plain data, and test it headlessly. The three.js class only applies the result.
- No per-frame allocation in stages and layers. Use module-level scratch vectors (`const scratch = vec3(0,0,0)`), preallocated typed arrays, and `…Into(out)` functions.
- Write positions to the GPU only as `world − origin`, subtracted in float64.
- Use `frame.t` (the view time) for anything drawn, never `world.clock.t`.
- Read the view from the `ViewSnapshot` passed to `update`, not from `useView` directly.
- Rebuild objects only in response to `sync` or a change in identity or version. Dispose every geometry and material you create.
- Name three.js objects (`orbit:earth`, `trajectory:<id>:<i>`), which helps when debugging.

### Naming conventions

- `…Into(…, out)` writes into a preallocated output and returns it.
- `…Stage` functions are frame stages; `…Layer` classes are map layers.
- `create…`, `begin…`/`end…`, and `sync`/`update`/`dispose` are used consistently.
- Doc comments cite decision IDs (`S4-14`). Keep them when you edit the code, and add new ones when a sprint plan records a new decision.

## 4. Testing

- **Pure modules** (`projection`, `picking`, `pathPicking`, `occlusion`, `precision`, `mapFrame`, `trajectoryGeometry`, `trajectoryMarkers`, `orbitFade`, `encounterGhosts`, `nodeGizmoMath`, `nodeMarkers`, `screenDash`, `overlays/declutter`, `overlays/labelLayout`, `overlays/trajectoryMarkerLayout`, `camera/controller`, `camera/framing`, and the styles) have `*.test.ts` files that run in Vitest's default `node` environment. `preview.test.ts` checks that ships are placed from their trajectories at a preview time.
- **`CameraStage`** is tested headlessly against a bare `PerspectiveCamera` (`camera/cameraStage.test.ts`): focusing on and off screen, framing distances and the start view.
- **The other three.js classes** (`MapRenderer`, the layers, `NodeGizmo`) are not unit tested. They are covered by `npm run smoke`, which runs Chrome headless against the dev server and uses `window.__spaceGame` (scripts in `test/smoke/`; see the `run-app` skill). When you add something visible, add a debug probe for it and a smoke check.

## 5. Recipes

**A new kind of object on the map:** add any per-frame position or projection arrays it needs to `MapFrame` (allocated on create or on set change), a pure module for its geometry or placement, and a `MapLayer` class in `layers/`. Add the class to the `layers` array in `MapRenderer` (the position sets draw order). If it is pickable, add it to `pick()` at the right priority. If it has a label, add candidates in `labelLayout.ts` and a priority tier in `declutter.ts`. Add a debug probe and a smoke check.

**A new camera reaction:** add a request counter to `useView` and a subscription in `CameraStage`, following `snapRequest`.

**A new view input to the map:** add it to `ViewSnapshot` in `stages.ts` and fill it in `MapRenderer.readView`.

## 6. Notes and loose ends

- The `--color-map-bg` comment in `ui/theme.css` says to keep it in step with `render/Scene.tsx`, but the colour now lives in `MapRenderer.ts` (`BACKGROUND`).
- `render/input/pointerInput.ts` defines its own `sameRef`, which duplicates the one exported from `store/useView.ts`.
- `architecture.md`'s source layout lists a minor-body layer in `render/layers/`. It is planned, not missing.
