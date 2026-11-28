# Guide to the `ui/` layer

`src/ui/` is the React DOM around the map: the app shell, the left sidebar (System and Fleets tabs), the inspector, the map toolbar, the timeline, and shared formatting, parsing and input helpers. It is the top layer and may import every layer. In practice it:

- reads the world and the view through `store/`, and changes the world only through the store's action wrappers;
- uses pure helpers and types from the layers below: `sim/` (ship stats, plan budgets, upcoming events, the clock's constants), `orbital/` (elements, frames and propagation, for the orbit readouts), `math/` (units, calendar dates), `game/` (the refusal queries), `gen/` (the spawn presets and `orbitFromInput`) and `content/` (design and module names);
- imports `render/` to mount the map (`MapView.tsx`), and for three small pure helpers it shares with the map: `shipColor` (`render/shipStyle.ts`, in the fleet list and the strip), and `resolveFrameBody` and `viewTime` (in `FrameMenu`). It is styled with CSS modules and the custom properties in `theme.css`.

This guide describes the code as it stands after milestone 1, sprint 5b. The UI design is in [interface.md](../interface.md), the reasons in [decisions.md](../decisions.md) and the sprint plans, which the code cites as `S<sprint>-<n>` (S4-10 is decision 10 of `planning/sprint-4.md`). The stores are described in [store.md](store.md), and the map in [render.md](render.md).

## 1. Architecture

```
 main.tsx ─▶ ui/layout/AppShell ─┬─ TopBar
                                 ├─ LeftSidebar ─ SystemTree | FleetList (+ SpawnShipForm)
                                 ├─ MapView ─┬─ render/Scene.tsx ─▶ MapRenderer (plain three.js)
                                 │           ├─ MapToolbar (FrameMenu, FlyButton)
                                 │           ├─ PreviewBadge
                                 │           └─ useMapKeys()
                                 ├─ Inspector ─ BodyInspector | ShipInspector (+ PlanSection ─ NodeEditor)
                                 └─ Timeline ─ PauseOnMenu, WarpToButtons, TimelineStrip
```

| Folder | What it holds |
|---|---|
| `layout/` | The shell and its regions, the shared `Popover`, `PauseOnMenu`, `PreviewBadge` |
| `map/` | The map toolbar: `FrameMenu`, `FlyButton`, and their pure parts `frameOptions.ts` and `flyState.ts` |
| `panels/` | Tree, fleet list, spawn form, inspectors, plan section and node editor, with their pure `…Details.ts` modules |
| `timeline/` | Warp-to buttons and the event strip, with their pure scale, layout and text modules |
| `fields/` | `QuantityField` and `nudge.ts` |
| top level | `format.ts`, `parse.ts`, `useMapKeys.ts`, `theme.css` |

`architecture.md` lists further folders (`ui/fleet/`, `ui/planner/`, `ui/economy/`, `ui/construction/`, `ui/designer/`) for later milestones. They are planned, not missing.

### How the panels update

Panels are ordinary React. The world is mutated in place, so a component learns of changes by subscribing to `useWorld`'s `version` (structural changes: actions, sim events) and, for readouts that follow time, by calling `useSimTime()` (10 Hz). See [store.md](store.md) for why there are two signals.

## 2. Key files and core functions

### 2.1 Layout (`ui/layout/`)

- **`AppShell`** is a CSS grid: `TopBar`, `LeftSidebar`, `MapView`, `Inspector` and `Timeline`. A closed side panel is not rendered at all, and the `data-left` and `data-right` attributes shrink its column to 0.
- **`LeftSidebar`** has ARIA tabs (System, Fleets), with arrow-key navigation. Stations, Routes and Filters are hidden until built.
- **`MapView`** mounts `<Scene>` with the formatters, the `MapToolbar` (Ecliptic, Orbit plane and Focus buttons, then `FrameMenu`, "Frame: Earth ▾", and `FlyButton`, "Fly Kestrel (A)" or "★ Kestrel"; their pure parts are `ui/map/frameOptions.ts` and `flyState.ts`), the `PreviewBadge` (the amber border and the "PREVIEW" badge with a Now button, shown during a preview) and `useMapKeys()`. Esc ends a preview before it clears the selection.
- **`Inspector`** switches on `selected.kind`: `ShipInspector` for a ship or a node (the node's ship), or `BodyInspector`, which also shows "Nothing selected".
- **`Popover`** is the shared menu button: `<Popover label="Add node ▾">{(close) => …}</Popover>`. It closes on a press outside, on Esc (consumed in the window's capture phase, so the map keys don't see it), and when the content calls `close`; it opens on the side with room. Pause on ▾, Add node ▾ and Frame ▾ use it.
- **`Timeline`** has play and pause, warp down and up, the warp readout, `PauseOnMenu`, the warp-to buttons, the event strip and the date. The sprint 5 pieces are in `ui/timeline/`:
  - `WarpToButtons`: ⏭ (warp to next event) and ◆⏭ (warp to node), and the ⏩ readout while a warp-to runs. A refused action's error becomes the button's title.
  - `TimelineStrip`: the active ship's upcoming events (`sim/upcoming.ts`) as glyphs on a fixed 10-year logarithmic axis from now (`scale.ts`, knee 10 min, so the ticks never move), shaded past the prediction, stacked by `stripLayout.ts`, with hover tooltips (`eventText.ts`). Pressing on the strip starts a transient preview that ends on release. Clicking a glyph starts a sticky preview at that event.
- **`TopBar`** has the title and the panel toggles.

### 2.2 Panels (`ui/panels/`)

| Component | What it shows | Derived-data module |
|---|---|---|
| `SystemTree` | An ARIA tree of bodies. Click selects; double-click or Enter focuses; arrow keys navigate | — |
| `FleetList` | Ships in spawn order with design, SOI and Δv; destroyed ships greyed out; "Spawn ship…" | `shipDetails.ts` |
| `SpawnShipForm` | Design, parent and orbital elements, with presets | — (calls `spawnShip`) |
| `BodyInspector` | Physical data, orbit and SOI at 10 Hz | `bodyDetails.ts` |
| `ShipInspector` | Mass, propellant, engines, orbit and upcoming events; contains `PlanSection`, read-only unless the ship is active | `shipDetails.ts` |
| `PlanSection` | The node list, Δv totals, and "Add node ▾" (at Pe or Ap, disabled with "Circular orbit" by `addApsisRefusal`, or after a delay). The selected node's row expands into `NodeEditor` | `planDetails.ts` |
| `NodeEditor` | Inside the expanded row: a node's time (absolute and relative), its Δv components, feedback (over budget, long burn, not reached, resulting orbit), and enable, snap (disabled by `snapRefusal`) and delete; every control disabled when `readOnly` | `planDetails.ts` |

### 2.3 Shared helpers

- **`format.ts`**: `formatDate`, `formatWarp`, `formatDistance`, `formatSpeed`, `formatDv` (every plan figure: `3131.0 m/s`; no format groups digits, so a shown value parses back), `formatDuration`, `formatAngle`, `formatScientific`, `formatMass` and `formatCountdown`. All UI text with units goes through these, and `render/` receives some of them as props.
- **`parse.ts`**: `parseSpeed`, `parseDuration` and `parseDate`, the inverses for typed input. They return `null` when the text can't be read.
- **`fields/QuantityField.tsx`**: the editable value with units, its label above a full-width input. It shows `format(value)`. Typing and then Enter or blur calls `parse`, then `onCommit`, which returns an error string or `null`. Escape reverts. The mouse wheel over a focused field nudges by a step (`nudge.ts`: Shift for fine, Alt for coarse); that listener is attached by hand because it must be non-passive. Errors appear under the field and the old value is kept.
- **`useMapKeys.ts`**: the global shortcuts. Space pauses and plays, `,` and `.` change the warp, F focuses, A flies the selected ship, E and P snap, Escape ends a preview or clears the selection (an open popover takes it first), and Delete removes the active ship's selected node. Keys are ignored in text fields, Space is left to buttons, tabs and tree rows, and nothing fires when Ctrl, Alt or Meta is held.
- **`theme.css`**: CSS custom properties for colour, layout sizes and type. Components use CSS modules (`*.module.css`) and look up classes as `styles['name']`.

## 3. Common patterns

### Reading the world in a component

```tsx
export function Thing({ id }: { id: ShipId }) {
  const world = useWorld((s) => s.world);
  useWorld((s) => s.version);        // structural changes: actions, sim events
  const t = useSimTime();            // only if the panel shows values that follow time
  const { focusOn } = useView.getState(); // actions: read once, no subscription
  if (!world.ships[id]) return <p>Nothing selected</p>;
  const d = shipDetails(world, id, t);    // pure derivation in a sibling .ts file
  ...
}
```

- Subscribe to the **narrowest** slice you need. Read actions with `getState()` rather than through a hook.
- **Put the computation in a pure `xxxDetails.ts` module** next to the component, taking `(world, id, t)`. It is tested in the node environment, and the component only lays out the result.
- A `useMemo` over the world must list `version` as a dependency, because the world object doesn't change identity.

### Changing the world

Always go through the store's action wrappers: `useWorld.getState().editNode(...)`. Rules are checked in `game/actions.ts`. To add an action, write it in `game/actions.ts`, add an `act(...)` wrapper to `useWorld`, and call that. Show a refused action's `error` where it makes sense (see `NodeEditor`'s `err()` helper). When an action creates something the user will want to edit next, select it: `addNode` followed by `select({kind:'node', …})`. When a menu item may be unavailable, call the action's refusal query (`addApsisRefusal`, `snapRefusal`) to disable it with the reason as its title.

### Units and text

All text with units goes through `format.ts`, and all typed input through `parse.ts`. Internal units (km, s, km/s) never leak into the UI unformatted. No format groups digits, so any value shown can be typed back.

### Naming conventions

- `…Details` and `…details.ts` are pure derivations for panels.
- `…State` modules in `map/` (`flyState.ts`) and `…Options` (`frameOptions.ts`) are the pure parts of a toolbar control.
- Components use CSS modules (`*.module.css`) and look up classes as `styles['name']`.

## 4. Testing

- **Pure modules** (the `…Details` modules, `format`, `parse`, `timeline/scale`, `timeline/stripLayout`, `timeline/eventText` and `map/frameOptions`) have `*.test.ts` files that run in Vitest's default `node` environment.
- **React components** have `*.test.tsx` files that start with `// @vitest-environment jsdom` and use Testing Library. `ui/panels/testStores.ts` provides `resetStores()`, which gives a fresh sandbox world and the initial view; call it in `beforeEach`.
- Visible changes are also checked end to end by `npm run smoke` (see the `run-app` skill).

## 5. Recipes

**A new inspector section:** write a pure `xxxDetails(world, id, t)` with a test, a component that subscribes to `version` (and `useSimTime` if needed), and a case in `Inspector.tsx` or a section inside the matching inspector.

**A new map shortcut:** add a case to `useMapKeys`. If it needs a camera reaction, add a request counter to `useView` and a subscription in `CameraStage`, following `snapRequest`.

**A new editable quantity:** use `QuantityField` with a formatter from `format.ts`, a parser from `parse.ts`, a nudge step, and an `onCommit` that calls a store action and returns its error.

**A new menu button:** use `Popover` with a render function: `<Popover label="Thing ▾">{(close) => …}</Popover>`.

## 6. Notes and loose ends

- The `--color-map-bg` comment in `ui/theme.css` says to keep it in step with `render/Scene.tsx`, but the colour now lives in `MapRenderer.ts` (`BACKGROUND`).
- The A key and the Fly button check that the ship is coasting in two places (`useMapKeys.ts` and `flyState.ts`) as well as in `activate`.
