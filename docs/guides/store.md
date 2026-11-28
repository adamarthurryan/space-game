# Guide to the `store/` layer

`src/store/` holds the two zustand stores that join the simulation to the presentation: `useWorld`, which owns the `World` and routes every player action through `game/actions.ts`, and `useView`, which holds view state that is never saved (selection, focus, the reference frame, the active ship, the preview, panels). It is the lowest layer allowed to use a framework (zustand and React hooks). It imports everything below it, and `render/` and `ui/` import it.

This guide describes the code as it stands after milestone 1, sprint 5b. The rules behind it are in [architecture.md](../architecture.md) ("State management and persistence"). The code cites decisions as `S<sprint>-<n>` (S2-17 is decision 17 of `planning/sprint-2.md`) and the decision log's numbers ("decision 183"). How `render/` and `ui/` use the stores is in [render.md](render.md) and [ui.md](ui.md).

## 1. Architecture

```
                 ┌──────────── store/ ─────────────┐
                 │ useWorld: world (mutated in      │ ◀── actions from ui/ and render/input
                 │   place), version, events,       │
                 │   action wrappers, useSimTime    │
                 │ useView: selection, focus,       │ ◀── clicks, keys, tree, map picking
                 │   frame, active ship, preview,   │
                 │   flash, panels, requests        │
                 └──────────────────────────────────┘
                                 │
                     game/actions.ts ─▶ sim/, orbital/, …
```

`architecture.md` also plans `store/jobs.ts` and `jobWorker.ts` (a worker for long planning jobs) for later sprints. They don't exist yet.

## 2. `useWorld.ts`

- **`world`**: the whole sim state as plain data. It is **mutated in place**. The clock stage in `render/` advances it every frame without telling zustand. The object is replaced only on reset, so `useWorld(s => s.world)` alone does not re-render on change. It starts as `createSandboxWorld()`.
- **`version`**: a counter, bumped by every successful action and, through `bumpVersion()`, by any frame in which the clock handled sim events or a warp-to arrived. **Components subscribe to `version` to learn that the world has changed.** The usual idiom is:

  ```tsx
  const world = useWorld((s) => s.world);
  useWorld((s) => s.version); // re-render when the world changes
  ```

- **Action wrappers**: `togglePause`, `warpUp`, `warpDown`, `setWarpIndex`, `spawnShip`, `addNode`, `addNodeAt`, `editNode`, `deleteNode`, `snapNode`, `setPauseOn`, `warpToNode`, `warpToNextEvent` and `cancelWarpTo`. Each is `act(w => actions.X(w, …))`: it calls the matching function in `game/actions.ts` and bumps `version` if the result is `ok`. Every player action goes this way. Neither `ui/` nor `render/` mutates the world itself.
- **`events`**: the sim's `EventRegistry`, created once with `registerShipHandlers`. The clock stage passes it to `advanceWorld`.
- **`useSimTime(hz = 10)`**: polls `world.clock.t` and re-renders the caller at most `hz` times a second. Use it for any readout that follows time: dates, countdowns, the current orbit.

Actions return an `ActionResult` (`{ ok: true, value }` or `{ ok: false, error }`). The UI shows `error` where it makes sense.

### Why two update signals

The clock moves `t` sixty times a second at any warp. Re-rendering every panel on every frame would be wasteful, so time-following readouts poll at 10 Hz with `useSimTime`. Structural changes (a node added, an SOI crossed, a ship destroyed) are rarer and must show at once, so they bump `version`. The map (`render/`) needs neither: it reads the world directly every frame.

## 3. `useView.ts`

This store holds view state that is not saved.

- **Refs.** `FocusRef` is `{ kind: 'body' | 'ship', id }`. `MapObjectRef` adds `{ kind: 'node', shipId, id }`. Helpers: `sameRef(a, b)`, `focusRefOf(ref)` (a node focuses its ship), `shipOf(ref)` (the ship of a ship or node ref).
- **Four pointers, one job each** (sprint 5b):
  - `selected` (and `hovered`) drives the inspector and the highlights. `select(ref)` never changes the focus, the frame or the active ship (decision 183).
  - `focus` is a `FocusRef` and drives only the camera's centre. `focusOn(ref)` focuses and selects in one call, sets the frame, and bumps `focusSeq`.
  - `frame` is the **reference frame**, `FrameRef = { kind: 'body', id } | { kind: 'ship-parent', shipId }`: the body trajectories are drawn relative to. `focusOn` sets it (a body: itself; the active ship or its node: follow its parent; another ship: its parent at the view time, fixed). `activate` makes it follow. `setFrame(id)` (Frame ▾) fixes it. `render/mapFrame.ts`'s `resolveFrameBody(world, frame, t)` turns it into a body.
  - `activeShipId` is the ship being flown: map editing, the timeline strip, warp-to. **Only `activate(id)` sets it** (the A key, or the Fly button), and only for a coasting ship. Read it through `resolveActiveShip(world, id)`, which drops destroyed or missing ships.
- **`flash`** is `{ ref, until } | null`. `flashObject(ref)` makes a new ship pulse and its label show for `FLASH_MS` (2 s of wall time). `performance.now()` is allowed here because `store/` is above the determinism rule; it is wall time for the view, never sim time.
- **Requests as counters.** `focusSeq` and `snapRequest: { plane, seq }` (`snapTo('ecliptic' | 'selected-orbit')`) exist so that a repeated request (refocusing the same body, snapping again) still triggers. `render/camera/CameraStage.ts` subscribes and reacts when a seq changes. The camera's animated state is *not* in the store; it lives in the camera controller.
- **Preview** (sprint 5): `preview` is `{ t, sticky } | null`. The map is drawn at `preview.t` instead of now. `startPreview(t, sticky)`, `movePreview(t)` (keeps `sticky`) and `endPreview()` change it. It is view state only: nothing below `store/` ever sees it. `render/previewTime.ts` has `viewTime(clockT, preview)`.
- **Panels**: `leftPanelOpen`, `rightPanelOpen` (and their toggles), `leftTab` (`'system' | 'fleets'`), `expanded` (the System tree; `toggleExpanded`, `setExpanded`, `expand(ids)`) and `spawnFormOpen`.

`useView` reads `useWorld.getState()` where it needs the world (`activate`, and the frame for a non-active ship). That is a call within the same layer.

## 4. Common patterns

- **Subscribe narrowly; read actions with `getState()`.** `useView((s) => s.selected)` re-renders on selection only. Actions don't change, so `const { focusOn } = useView.getState()` needs no subscription.
- **No-op updates return the same state.** `endPreview`, `movePreview` and `expand` return `s` unchanged when there is nothing to do, so subscribers don't re-render.
- **The store never computes game logic.** Rules are in `game/`, derivations in pure `ui/…Details.ts` modules or `render/` helpers. The store only holds state and forwards actions.

## 5. Testing

`useView.test.ts` checks the four pointers: that `select` leaves the focus, frame and active ship alone, the frame each `focusOn` sets, `activate` refusing a destroyed ship, and so on. Component tests reset both stores with `resetStores()` from `ui/panels/testStores.ts` (a fresh sandbox world and the initial view) in `beforeEach`. The action wrappers are covered by the `game/` tests and the component tests that click through them.

## 6. Recipes

**A new player action:** write it in `game/actions.ts` (see [game.md](game.md)), add a field to `WorldState` and a wrapper `X: (…) => act((w) => actions.X(w, …))`, and call that from `ui/` or `render/`.

**A new camera reaction** (a new snap, say): add a request counter to `useView` and an action that bumps it, then subscribe in `CameraStage`, following `snapRequest`.

**New view state:** add it to `ViewState` with its initial value and actions. If the map needs it, add it to `ViewSnapshot` in `render/stages.ts` and read it in `MapRenderer.readView`, so every stage sees the same value in a frame.
