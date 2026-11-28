# Sprint 5 — Timeline, time control and preview scrubbing: detailed plan

This expands [sprint 5](milestone-1-sprints.md#sprint-5--timeline-time-control-and-preview-scrubbing) of milestone 1. Module paths follow the source layout in [architecture.md](../docs/architecture.md#layered-structure), and the rendering follows its [rendering conventions](../docs/architecture.md#units-precision-and-rendering-scale).

**Goal:** time is controlled from the timeline, and the future can be inspected. By the end of the sprint, the timeline strip shows the active ship's upcoming events (nodes, SOI changes, impact) on a logarithmic axis from now, with hover details. "Warp to next event" and "warp to node" fly the clock there at high warp, easing in, and pause just before a node or just after any other event. Dragging the playhead previews the future: the whole map (bodies, ships, orbit lines, trajectories) is drawn at the preview time, with a tinted border and a "PREVIEW" badge, and releasing returns to now. Clicking an event keeps the preview at that event until Esc or "Now". The sim is never changed by a preview.

**Out of scope:** warp drops at events (removed from the sprint at the user's request: no event needs the player's intervention yet; Pause on ▾ stays the only automatic stop, and alarms bring "drop warp" in sprint 6); the timeline "Show" selector, fleets, alarms and ⏰ markers (sprint 6); closest approaches and docking on the strip (sprint 9); thrust arcs as bars (milestone 3); keyboard shortcuts for warp-to (sprint 10's keyboard pass); an inspector that shows values at the preview time (deferred to sprint 7 at the user's request; until then the inspector always shows now).

## Decisions made for this sprint

| #     | Topic                     | Decision |
| ----- | ------------------------- | -------- |
| S5-1  | No warp drops             | The user's choice: the "warp drops at events that need a decision" item is dropped from sprint 5. The event-driven clock already stops `t` at every event exactly (decision 99), and Pause on ▾ (decision 120) is the only automatic stop. This sprint adds tests proving the "done when" at ×10⁶ and ×10⁷, but no new clock behaviour for it. Alarms (sprint 6) add `action: 'drop-warp'`. |
| S5-2  | Upcoming events           | A pure sim function, **`upcomingEvents(world, shipId)`** (`sim/upcoming.ts`), lists a ship's future events from its trajectory, in time order: one per segment end that is `'maneuver'` (a **node**), `'soi-enter'` / `'soi-exit'` (an **SOI change**, with the body entered or exited to) or `'impact'`; plus every **disabled node** of the plan whose time falls inside the trajectory (shown greyed, never executed). `'horizon'` ends aren't events: the trajectory's end is returned separately as `horizon`. Events at or before `world.clock.t` are dropped. The list is recomputed from the trajectory, so it is cached by nothing more than the store version. |
| S5-3  | Warp-to                   | **`Clock.warpTo: { t: number; kind: WarpToKind } \| null`**, in the world's clock like `pauseOn`, because `advanceWorld` reads it. While it is set, the frame's target is `min(t + dt·rate, warpTo.t)`, with the **eased rate** `rate = clamp((warpTo.t − t) / WARP_TO_EASE, WARP_TO_MIN_RATE, 10⁷)`, `WARP_TO_EASE = 0.1 s` and `WARP_TO_MIN_RATE = 100`. From ×10⁷ the ease takes about 1.2 s of wall time, and a year-long warp about 4.5 s. The chosen warp step (`warpIndex`) is untouched, so it is back when warp-to ends. Events on the way are handled as usual, and a Pause-on event pauses there and **cancels** the warp-to. When `t` reaches `warpTo.t` (after handling the events due at it), the clock is **paused**, `warpTo` is cleared, and `advanceWorld` returns `arrived: true`. Play/pause, warp up/down and `setWarpIndex` cancel a warp-to. Starting one while paused unpauses. |
| S5-4  | Warp to node              | The user's choice: stop **`WARP_TO_NODE_LEAD = 60 s`** before the node, paused, so it can still be edited. The node is the **selected node** if it belongs to the active ship, otherwise the active ship's **next enabled, reached node**. `game/actions.warpToNode` refuses: no active ship or node; a disabled or unreached node; a node less than `WARP_TO_NODE_LEAD + 1 s` away ("The node is less than a minute away"). |
| S5-5  | Warp to next event        | The next event in `upcomingEvents` of the **active ship**, or, with no active ship, the earliest such event of any coasting ship. A **node** stops `WARP_TO_NODE_LEAD` before it (as S5-4). **Any other event** (SOI change, impact) stops **exactly at it, just after it is handled**, so the map shows the new frame (or the impact). Disabled nodes are skipped, and so is any event whose stop time is not at least 1 s after now (a node within its lead), so pressing the button again always moves on. `warpToNextEvent` refuses when nothing is left ("No upcoming events"). The Timeline shows a ⏩ label while a warp-to runs: "→ Moon SOI · 3 d 4 h", with the eased rate in the warp readout. |
| S5-6  | Strip scale               | The user's choice: **logarithmic**, from now at the left edge to the span's end at the right. `x(Δt) = log(1 + Δt/T0) / log(1 + span/T0)`, with `T0 = 60 s`, and its inverse for dragging. The **span** is the active ship's trajectory end minus now, clamped to **[1 d, 10 yr]**; with no active ship, 1 yr. Ticks at 1 min, 10 min, 1 h, 6 h, 1 d, 10 d, 1 mo, 1 yr, 10 yr, each drawn only if inside the span and at least 40 px from its neighbours. The span is computed in the component from the store version and `useSimTime`, so the strip slides as time passes. |
| S5-7  | Strip glyphs              | Each event is a glyph at its `x`, in the ship's palette colour (`shipColor`): **◆ node** (hollow ◇ and faded if disabled), **▲ SOI change** (▼ for an exit), **✕ impact**, and a thin tick for the trajectory's horizon. Glyphs closer than 6 px are stacked upwards (two rows, then a "+n"). The **now** marker is a line at the left edge; the **playhead** (preview time) is a vertical line with a handle, shown only in preview. The selected node's glyph is larger. |
| S5-8  | Hover details             | Hovering a glyph shows a tooltip: what it is, its date, the countdown, and specifics: "Node · 2031-04-02 06:12:00 · in 3 h 12 min · Δv 3,131 m/s", "Moon SOI entry · … · in 3 d 4 h", "Earth SOI exit", "Moon impact". Texts are built by a pure `ui/timeline/eventText.ts`, reusing `formatDate`, `formatCountdown` and `formatSpeed`. |
| S5-9  | Preview model             | The user's choice. **`useView.preview: { t: number; sticky: boolean } \| null`** is view state only; **`viewTime = preview?.t ?? world.clock.t`**. **Pressing on the strip** (not on a glyph) starts a **transient** preview at that point, and dragging moves it; **release** ends it. **Clicking a glyph** (press and release within 4 px) starts a **sticky** preview at the event's time, which lasts until **Esc**, the badge's **"Now"** button, or a click on the now marker. Dragging the playhead of a sticky preview moves it and keeps it sticky. The preview time is clamped to `[now, now + span]`. The **clock keeps running**; when `clock.t` reaches the preview time, the preview ends. Replacing the world or a `warpTo` arrival does not end it. |
| S5-10 | The map at `viewTime`     | Everything the map draws uses `frame.t = viewTime`: body positions, orbit lines, ship positions, camera following, plane snapping and framing. **Ships** are placed from their **trajectory** at `viewTime`, not from `ship.orbit`: the new `trajectoryStateAt` finds the segment containing the time and evaluates it with `segmentStateAt`, so a ship previewed after a node or an SOI change is on the right conic, around the right parent. A ship whose trajectory doesn't reach `viewTime` (it ended at an impact, or at its segment or 10-year cap) **isn't drawn**. A focused ship's frame body is its segment's parent at `viewTime`. **Trajectories** are drawn from `viewTime` on as usual: each segment from `max(viewTime, tStart)`, generalising sprint 3's rule for segment 0. The **route flown during the preview** (from `clock.t` to `viewTime`) is drawn too, for context (S5-16). Node glyphs before `viewTime` are hidden. Nothing in `world` is read differently or written: the sim never sees `viewTime`. |
| S5-11 | Editing in preview        | Map editing is **off** while previewing: the gizmo and the ghost node are hidden, and node glyphs can be clicked (to select) but not dragged. Selection, focus and the camera work as usual. The inspector still shows now, and its node editor still works; the preview shows the edited trajectory at once. |
| S5-12 | Preview look              | The map gets an **amber inset border** (2 px, `--preview` colour in `theme.css`) and a **"PREVIEW" badge** at the top centre: "PREVIEW · 2031-04-05 10:24:00 · T+3 d 4 h" and a **Now (Esc)** button. The timeline's date readout keeps showing now; the playhead's date is in the badge. |
| S5-13 | Keys                      | **Esc** ends a preview first; if there is none, it clears the selection as before. A release of the strip drag ends a transient preview even if the pointer left the strip (pointer capture). |
| S5-14 | Store version             | The clock stage bumps the store version when events were handled **or a warp-to arrived**, so the Timeline's play button and ⏩ label update. `clockStage` returns that combined flag. |
| S5-15 | Debug handle              | `window.__spaceGame` gains `timeline()` (the strip's span, and each glyph's kind, `t`, ship and screen position), `preview()` (`viewTime` and `sticky`, or null), `clock()` (`t`, `paused`, `warpIndex`, `warpTo`), and `shipWorld(id)` / `bodyWorld(id)` (the positions the map drew this frame, or null if not drawn). |
| S5-16 | Elapsed route in preview  | The user's choice: in preview, the part of each trajectory between **now** (`clock.t`) and `viewTime` is drawn as an **elapsed** piece: solid (never dashed, even after a node), in the ship's colour at **35%** of its normal alpha, so the route to the previewed position stays visible. Each segment gets a fourth piece, `elapsed`, sampled over `[max(clock.t, tStart), min(viewTime, tEnd)]` in the frame body's frame like the other pieces, and hidden outside preview. The route flown **before now** is never drawn, in preview or not. `MapFrame` gains `now` (the clock's `t`), set by the bodies stage beside `frame.t`. |

S5-16 was added after review, from the user's answer to an open question.

These are copied into [decisions.md](../docs/decisions.md) as decisions 136 onward, with the implementation choices made during the sprint.

## Files to create

```
src/
  sim/
    upcoming.ts            upcoming.test.ts       UpcomingEvent, upcomingEvents, nextWarpStop (S5-2, S5-4, S5-5)
    (trajectory.ts extended) trajectory.test.ts   trajectoryStateAt (S5-10)
    (clock.ts extended)    clock.test.ts          warpTo, warpToRate (S5-3)
    (world.ts extended)    world.test.ts          warpTo in advanceWorld, arrived flag (S5-3)
    timeControl.test.ts                           the "done when" clock checks at ×10⁶ and ×10⁷ (S5-1)
  game/
    (actions.ts extended)  timeActions.test.ts    warpToNode, warpToNextEvent, cancel rules (S5-3 to S5-5)
  render/
    (mapFrame.ts extended) mapFrame.test.ts       ships from trajectories at frame.t; undrawn ships (S5-10)
    previewTime.ts         previewTime.test.ts    viewTime, preview end when now catches up (S5-9)
  store/
    (useView.ts extended)  useView.test.ts        preview, startPreview / movePreview / endPreview (S5-9)
  ui/
    timeline/
      scale.ts             scale.test.ts          log scale, inverse, span, ticks (S5-6)
      stripLayout.ts       stripLayout.test.ts    glyph positions and stacking (S5-7)
      eventText.ts         eventText.test.ts      hover texts (S5-8)
      TimelineStrip.tsx    TimelineStrip.test.tsx the strip: glyphs, ticks, hover, drag, click (S5-6 to S5-9)
      WarpToButtons.tsx    WarpToButtons.test.tsx ⏭ next event, ◆⏭ warp to node, ⏩ label (S5-4, S5-5)
    layout/
      PreviewBadge.tsx     PreviewBadge.test.tsx  badge and Now button (S5-12)
test/smoke/
  timeline.mjs                                    the strip, warp-to and preview checks
```

Also change:

- `sim/clock.ts`: `warpTo`, `WarpToKind`, `warpToRate`, the constants; `createClock` with `warpTo: null`; `setPaused`, `warpUp`, `warpDown`, `setWarpIndex` clear `warpTo`.
- `sim/world.ts`: `advanceWorld` uses the warp-to target and rate, and returns `arrived`.
- `game/actions.ts`: `warpToNode`, `warpToNextEvent`, `cancelWarpTo`; the clock actions cancel a warp-to (through `sim/clock.ts`).
- `store/useWorld.ts`: the warp-to actions. `store/useView.ts`: `preview` and its setters.
- `render/stages.ts`: `bodiesStage` takes `viewTime`; `clockStage` returns `events > 0 || arrived`. `render/MapRenderer.ts`: reads `viewTime` once per frame (after the clock stage), ends a caught-up preview, passes `previewing` in the `ViewSnapshot`. `render/mapFrame.ts`: `updateFrameShips` and `syncFrameShips` from trajectories at `frame.t`; `frameBodyOf` at `frame.t`. `render/mapFrame.ts`: `frame.now`. `render/layers/TrajectoryLayer.ts`: every segment drawn from `max(frame.t, tStart)`, and the faded `elapsed` piece from `frame.now` to `frame.t` in preview (S5-16); `render/trajectoryGeometry.ts`: the elapsed piece's time range. `render/camera/CameraStage.ts`, `camera/framing.ts`: `frame.t` instead of `clock.t`. `render/NodeGizmo.ts`, `render/input/pointerInput.ts`: no gizmo, ghost or node drag while previewing. `render/debugHandle.ts`: S5-15.
- `ui/layout/Timeline.tsx`: the strip in place of the empty `strip` div, the warp-to buttons, the ⏩ label and eased rate. `ui/layout/MapView.tsx` (+ css): the preview border and badge. `ui/panels/NodeEditor.tsx`: a **Warp to node** button. `ui/useMapKeys.ts`: Esc ends a preview first. `ui/theme.css`: `--preview`.
- `package.json`: add `timeline.mjs` to the `smoke` script.
- `test/lint/layers.test.ts`: the new cases (see [Lint rules](#lint-rules)).
- Docs, at the end: [architecture.md](../docs/architecture.md) (Clock and event queue: `warpTo`; rendering conventions: the map at `viewTime`, ships from trajectories); [interface.md](../docs/interface.md) (Timeline: the log strip, warp-to stops, preview behaviour; the "warp automatically drops at … every event that needs a decision" line becomes "at alarms", per S5-1); [decisions.md](../docs/decisions.md): the S5 decisions; [CLAUDE.md](../CLAUDE.md): the current status.

## Interfaces and data models

Units as before: `km`, `s`, `kg`, `km/s`. Times are sim seconds from the epoch.

### `sim/upcoming.ts`

```ts
export type UpcomingKind = 'node' | 'soi-enter' | 'soi-exit' | 'impact';
export interface UpcomingEvent {
  shipId: ShipId;
  kind: UpcomingKind;
  t: number;
  /** The segment that ends here (for disabled nodes: the segment containing t). */
  segmentIndex: number;
  nodeId?: NodeId; // kind 'node'
  enabled: boolean; // false only for a disabled node, which never executes
  bodyId?: BodyId; // the body entered, exited to, or impacted
  dvApplied?: number; // km/s, enabled nodes
}
export interface ShipUpcoming {
  events: UpcomingEvent[]; // t > world.clock.t, in time order
  horizon: number; // the trajectory's end time
}
export function upcomingEvents(world: World, shipId: ShipId): ShipUpcoming;

/** Where a warp-to for this event stops: node.t − WARP_TO_NODE_LEAD for nodes, else event.t. */
export function warpStopTime(e: UpcomingEvent): number;
/** The next event worth warping to (S5-5): enabled, with a stop ≥ now + 1 s; all ships if shipId is null. */
export function nextWarpStop(world: World, shipId: ShipId | null): UpcomingEvent | null;
```

### `sim/clock.ts` and `sim/world.ts` (changes)

```ts
export type WarpToKind = 'node' | 'event';
export interface WarpTo {
  t: number; // where the clock stops, paused
  kind: WarpToKind;
  shipId: ShipId | null;
  label: string; // "Moon SOI entry", "Node": for the ⏩ readout
}
export interface Clock {
  // …sprint 4 fields
  warpTo: WarpTo | null; // S5-3
}
export const WARP_TO_EASE = 0.1; // s of wall time
export const WARP_TO_MIN_RATE = 100;
export const WARP_TO_NODE_LEAD = 60; // s (S5-4)
/** The eased warp-to rate for the time left (S5-3). */
export function warpToRate(remaining: number): number;
/** The sim seconds per wall second this frame: the warp-to rate, the warp step, or 0 when paused. */
export function warpRate(c: Clock): number; // now warp-to aware
export function startWarpTo(c: Clock, w: WarpTo): void; // sets warpTo and unpauses
export function cancelWarpTo(c: Clock): void;

// world.ts
export interface AdvanceResult { events: number; pause: boolean; arrived: boolean }
export function advanceWorld(world: World, dtWall: number, reg: EventRegistry): AdvanceResult;
```

`advanceWorld` with a warp-to: `target = min(clockTarget(clock, dtWall), warpTo.t)`; events with `key ≤ target` are handled as before (a pausing one clears `warpTo`). If `t` then equals `warpTo.t`, the clock is paused, `warpTo` cleared, and `arrived` is true.

### `sim/trajectory.ts` (addition)

```ts
export interface TrajectoryPoint { segmentIndex: number; parentId: BodyId; state: StateVector }
/**
 * The ship's state at t from its trajectory (S5-10): the segment with tStart ≤ t ≤ tEnd (the
 * later segment at a boundary), evaluated in its parent's frame. Null if t is outside the
 * trajectory (before its start, or after its end).
 */
export function trajectoryStateAt(sys: BodySystem, segments: readonly Segment[], t: number, out?: StateVector): TrajectoryPoint | null;
```

### `game/actions.ts` (additions)

```ts
/** Warps to WARP_TO_NODE_LEAD before the node (S5-4). */
export function warpToNode(world: World, shipId: ShipId, nodeId: NodeId): ActionResult;
/** Warps to the next event of the ship, or of any ship if null (S5-5). */
export function warpToNextEvent(world: World, shipId: ShipId | null): ActionResult<UpcomingEvent>;
export function cancelWarpTo(world: World): ActionResult;
```

`togglePause`, `warpUp`, `warpDown` and `setWarpIndex` cancel a warp-to through the clock functions.

### `store/useView.ts` (changes)

```ts
export interface Preview { t: number; sticky: boolean }
// ViewState additions:
preview: Preview | null;
startPreview(t: number, sticky: boolean): void;
movePreview(t: number): void; // keeps `sticky`
endPreview(): void;
```

### `render/previewTime.ts`

```ts
/** The time the map is drawn at (S5-9). */
export function viewTime(clockT: number, preview: Preview | null): number;
/** Whether the preview has been caught up by now and should end. */
export function previewCaughtUp(clockT: number, preview: Preview | null): boolean;
```

`ViewSnapshot` gains `previewing: boolean`. `MapRenderer` reads the view after the clock stage, calls `endPreview()` when `previewCaughtUp`, and passes `viewTime` to `bodiesStage` (which sets `frame.t`).

### `render/mapFrame.ts` (changes)

```ts
/** The drawn ships: coasting, with a trajectory that reaches frame.t (S5-10), in seq order. */
function drawnShipIds(world: World, t: number): ShipId[];
export function syncFrameShips(frame: MapFrame, world: World): boolean; // uses frame.t
/** Parent index and world position from trajectoryStateAt at frame.t. */
export function updateFrameShips(frame: MapFrame, world: World): void;
export function frameBodyOf(world: World, focus: FocusRef, t: number): BodyId;
```

### `ui/timeline/` (pure modules)

```ts
// scale.ts
export const STRIP_T0 = 60; // s
export const SPAN_MIN = 86_400; // 1 d
export const SPAN_MAX = 10 * 365.25 * 86_400; // 10 yr
export interface StripScale { span: number; width: number } // s, px
export function stripSpan(horizon: number | null, now: number): number; // S5-6
export function xOf(s: StripScale, dt: number): number; // px from the left edge
export function dtOf(s: StripScale, x: number): number; // the inverse, clamped to [0, span]
export interface Tick { dt: number; x: number; label: string } // "1 h", "1 d", "1 mo", …
export function stripTicks(s: StripScale): Tick[];

// stripLayout.ts
export interface StripGlyph {
  key: string; // stable: `${shipId}:${kind}:${nodeId ?? t}`
  event: UpcomingEvent;
  x: number;
  row: number; // 0, 1; overflow folds into a "+n" glyph
  glyph: '◆' | '◇' | '▲' | '▼' | '✕';
  color: string;
  selected: boolean;
}
export function stripGlyphs(events: readonly UpcomingEvent[], s: StripScale, now: number, colorOf: (id: ShipId) => string, selectedNodeId: NodeId | null): { glyphs: StripGlyph[]; overflow: { x: number; count: number }[] };

// eventText.ts
export function eventTitle(e: UpcomingEvent, bodyName: (id: BodyId) => string): string; // "Moon SOI entry"
export function eventTooltip(e: UpcomingEvent, now: number, epochJd: number, bodyName: (id: BodyId) => string): string;
```

## Tests

As in sprint 4: pure modules use the node environment, components use jsdom with the scene stubbed, and real-body tests go in `gen/` or `game/` (the `sim/` tests use `sim/testSystem.ts`).

### `sim/upcoming.test.ts`

- A ship with two nodes and an SOI exit lists `node, node, soi-exit` in time order, with node IDs, `dvApplied` and the exit's target body. The horizon equals the last segment's `tEnd`.
- A disabled node inside the trajectory is listed with `enabled: false`; one past the trajectory's end is not.
- An impact is listed with its body; a `'horizon'` end is not an event.
- Events at or before `clock.t` are dropped.
- `warpStopTime` of a node is `t − 60`; of an SOI change, `t`.
- `nextWarpStop`: skips disabled nodes and a node within its lead; with `null`, picks the earliest across ships; with no events, null.

### `sim/trajectory.test.ts` (addition)

- `trajectoryStateAt` at a time inside segment 2 equals `segmentStateAt` of segment 2, and its `parentId` is segment 2's. At a boundary it gives the later segment (the post-burn state at a node). Before the start or after the end it is null. At `clock.t` it equals `shipStateAt`.

### `sim/clock.test.ts` and `sim/world.test.ts` (additions)

- `warpToRate`: ×10⁷ far away, `remaining / 0.1` in the ease, 100 at the floor; monotonic in `remaining`.
- A warp-to a month ahead, advanced in 1/60 s frames, arrives with `t === warpTo.t` exactly, paused, `warpTo` null, `arrived` true on exactly one frame; the warp step is unchanged. It takes 2–4 s of simulated wall time (pins the feel).
- Events on the way are handled at their exact times. A Pause-on event on the way pauses there and clears `warpTo`.
- An event exactly at `warpTo.t` is handled in the arrival frame, before the pause.
- `togglePause`, `warpUp`, `warpDown` and `setWarpIndex` clear `warpTo`; starting one while paused unpauses.

### `sim/timeControl.test.ts` (the "done when", synthetic system)

- **At ×10⁶ and ×10⁷**, in 1/60 s frames, with `pauseOn.node` on, a ship with a node an hour, a day and a month away: the clock pauses with `t` equal to the node's time exactly (`===`), the node has executed, and no frame passed it. With `pauseOn` cleared, the post-burn orbit is the predicted one (as in sprint 4), and `t` never skipped the event.

### `game/timeActions.test.ts`

- `warpToNode` on the selected node sets `warpTo.t = node.t − 60` and unpauses; refused for a disabled node, an unreached node, a node 30 s away, an unknown ship; refusals leave the world deep-equal.
- `warpToNextEvent` steps through a TLI plan from "LEO (lunar plane)" with the S4-19 smoke constants (real system): 60 s before the TLI node, then (after play through the node) the Moon SOI entry exactly, just after it is handled (the ship's parent is the Moon). With no active ship it picks the earliest ship's event. With nothing left it refuses.
- **The "done when", real system:** after warping to the Moon SOI entry, the ship's world position and the Moon's equal what `trajectoryStateAt` and `bodyWorldPosition` predicted at that time before the warp (1e-9 relative).

### Render tests

- `previewTime.test.ts`: `viewTime` with and without a preview; `previewCaughtUp` when `clock.t ≥ preview.t`.
- `mapFrame.test.ts` (additions): with `frame.t` after a node, the ship's world position is the post-burn conic's, and its parent index is the segment's parent; after an SOI entry, the parent is the Moon; past an impact the ship isn't in `frame.ships.ids`, and it is back when `frame.t` returns to now. `frameBodyOf` a focused ship at a previewed time gives the segment's parent.
- **Preview leaves the sim unchanged:** running the bodies, ships, projection and labels stages with a preview a week ahead leaves `JSON.stringify(world)` (minus `derived.cacheStats`) unchanged.
- `trajectoryGeometry.test.ts` / `TrajectoryLayer` helpers: a segment that contains `frame.t` is drawn from `frame.t`; segments ending before it are hidden. In preview, the elapsed piece covers `[now, viewTime]` across segments (a segment wholly inside gets a full elapsed piece, the one containing `viewTime` is split there), is solid even after a node, and has 35% alpha; outside preview there is no elapsed piece; nothing before `now` is drawn.
- `stages.test.ts`: `clockStage` reports a warp-to arrival as a change.

### `ui/timeline/` tests

- `scale.test.ts`: `xOf(0) = 0`, `xOf(span) = width`, monotonic; `dtOf(xOf(dt)) = dt` to 1e-9 relative; `stripSpan` clamps to 1 d and 10 yr and gives 1 yr with no ship; ticks are inside the span, ordered, at least 40 px apart.
- `stripLayout.test.ts`: glyph per event with the S5-7 symbols and ship colours; two events 3 px apart go to rows 0 and 1; a third folds into "+1"; the selected node is flagged.
- `eventText.test.ts`: the S5-8 texts for a node (with Δv), SOI entry and exit, impact, a disabled node ("Node (disabled)").

### Component tests (jsdom)

- **`TimelineStrip.test.tsx`:** renders a glyph per upcoming event of the active ship and none with no active ship; hovering shows the tooltip; pressing on empty strip starts a transient preview at `dtOf(x)`, moving updates it, release ends it; clicking a glyph starts a sticky preview at the event's time, and release doesn't end it; the playhead is shown only in preview.
- **`WarpToButtons.test.tsx`:** "Next event" calls `warpToNextEvent` with the active ship; "Warp to node" uses the selected node, else the next node, and is disabled with none; an action error is shown as the button's title; the ⏩ label shows while `warpTo` is set.
- **`PreviewBadge.test.tsx`:** hidden without a preview; shows the date and "T+" of the preview; Now ends it.
- **`Timeline.test.tsx`** (additions): pausing during a warp-to cancels it. **`NodeEditor.test.tsx`** (addition): "Warp to node" calls the action for this node. **`AppShell.test.tsx`** (addition): Esc ends a sticky preview, and a second Esc clears the selection.
- `useView.test.ts`: `startPreview`, `movePreview` keeps `sticky`, `endPreview`.

### `test/smoke/timeline.mjs` (`npm run smoke`)

`shell.mjs`, `map.mjs`, `ships.mjs` and `maneuvers.mjs` run unchanged first.

1. Spawn "LEO (lunar plane)" and type the S4-19 TLI node (as `maneuvers.mjs` does). `timeline()` lists a ◆ node and a ▲ Moon SOI entry, in that order left to right, inside the strip.
2. **Hover:** hovering the ▲ shows a tooltip containing "Moon SOI entry".
3. **Done when, part 1:** set ×10⁶ and play. The clock pauses at the node: `clock().t` equals the node's time exactly, and `plan(id)` is empty.
4. **Warp to next event:** click ⏭. The ⏩ label shows; within 10 s `clock()` is paused at the Moon SOI entry time, and `ship(id)` has the Moon as its parent.
5. **Warp to node:** add a node at the next Pe and click ◆⏭. The clock stops paused 60 s before it (± 1e-6 s).
6. **Done when, part 2 (preview):** from a fresh ship with the TLI node, record `clock()` and the trajectory version, then click the ▲ glyph. `preview()` is sticky at the entry time; the map has the badge and the border; `shipWorld(id)` and `bodyWorld('moon')` equal the trajectory's prediction at that time (1e-6 relative). `trajectoryVertices(id)` shows an elapsed piece with vertices > 0, and none before the preview. The sim is unchanged: `clock().t` (paused), the plan and the trajectory version are as recorded. Esc ends the preview, and `shipWorld(id)` is back at now.
7. **Drag:** press on the strip's middle and drag right: `preview()` is transient and moves; the gizmo and ghost are hidden; release ends it.
8. **Catch-up:** a sticky preview 1 min ahead at ×10³ ends by itself.
9. No console errors, warnings or failed requests. Screenshots of the strip with hover, and of the preview at the lunar arrival (Earth focus), go to `test/smoke/out/`.

### Lint rules

Added to `test/lint/layers.test.ts`:

| File path given       | Code                                                  | Expected                    |
| --------------------- | ----------------------------------------------------- | --------------------------- |
| `src/sim/bad.ts`      | `import { useView } from '../store/useView'`           | layer error (sim → store)   |
| `src/sim/bad.ts`      | `import { warpToNode } from '../game/actions'`         | layer error (sim → game)    |
| `src/game/ok.ts`      | `import { nextWarpStop } from '../sim/upcoming'`       | no errors                   |
| `src/ui/ok.ts`        | `import { upcomingEvents } from '../sim/upcoming'`     | no errors                   |

`viewTime` must never reach `sim/` or `game/`: it lives in `useView` and is read only by `render/` and `ui/`. This is a convention checked in review; the layer rule already stops `sim/` importing the store.

## Acceptance criteria

Sprint 5 is done when all of these hold:

1. **Checks:** `npm test`, `npm run lint`, `npm run build`, `npm run format:check` and `npm run smoke` pass, with no lint warnings and no console errors or warnings in the smoke run. The sprint 4 tests and smoke checks pass unchanged, except where they enumerate the clock's fields (`warpTo`).
2. **Done when (clock):** at ×10⁶ (and ×10⁷), the clock stops exactly at a node instead of passing it (`timeControl.test.ts`, smoke check 3).
3. **Done when (preview):** scrubbing to the lunar arrival time shows the ship and the Moon at their arrival positions, as predicted, without changing the sim (render test, smoke check 6).
4. **Strip:** the active ship's nodes, SOI changes and impact are shown on a logarithmic strip from now to its trajectory's end (1 d to 10 yr), in the ship's colour, with ticks, stacking and hover details.
5. **Warp-to:** "warp to next event" and "warp to node" fly at up to ×10⁷, ease in, and pause 60 s before a node or just after any other event, exactly; they are cancelled by play/pause or a warp change, and stop early at a Pause-on event. The chosen warp step is unchanged afterwards.
6. **Preview:** a transient preview while dragging, ended by release; a sticky one from clicking an event, ended by Esc, Now or the clock catching up. The tinted border and the PREVIEW badge show whenever the map isn't at now. Map editing is off in preview.
7. **The map at `viewTime`:** bodies, orbit lines, ships (from their trajectories, around the right parent), trajectories (from `viewTime` on, with the route from now to `viewTime` drawn faded), node glyphs, the camera and snapping all use the preview time; ships whose trajectory doesn't reach it aren't drawn.
8. **No warp drops:** nothing besides Pause on ▾ and warp-to stops or slows the clock (S5-1).
9. **Conventions:** `viewTime` is view state only and never reaches `sim/` or `game/`; warp-to goes through `game/actions.ts`; `UpcomingKind` and `SegmentEnd` switches are exhaustive.
10. **Docs:** decisions S5-1 to S5-16, and the implementation choices, are logged in decisions.md; architecture.md (Clock and event queue, rendering conventions) and interface.md (Timeline and time control) are updated; CLAUDE.md shows sprint 5 as complete.

## Suggested order of work

1. `trajectoryStateAt` and `sim/upcoming.ts`, with tests.
2. `warpTo` in the clock and `advanceWorld`, the `arrived` flag, and `timeControl.test.ts`.
3. The warp-to actions and the store wiring, with `timeActions.test.ts` (real system).
4. The map at `frame.t`: ships from trajectories, `frameBodyOf`, the trajectory layer from `frame.t`, the camera and framing. Still driven by `clock.t`, so every sprint 4 smoke check must pass unchanged here.
5. `useView.preview`, `previewTime.ts`, the renderer reading `viewTime`, editing off in preview, the badge and border, Esc.
6. `ui/timeline/`: `scale`, `stripLayout`, `eventText`, `TimelineStrip` (glyphs, ticks, hover, drag, click), `WarpToButtons`, the ⏩ label; Warp to node in the node editor.
7. The debug probes, `timeline.mjs`, the lint cases, and the docs.

## Implementation notes

Choices made while building, beyond the decisions above. They are logged in [decisions.md](../docs/decisions.md) with decisions 136–152.

1. **Event names live in `sim/`.** The warp-to readout needs "Moon SOI entry" in `game/actions.ts`, which can't import `ui/`, so `eventLabel` is in `sim/upcoming.ts` and `ui/timeline/eventText.ts` reuses it. `UpcomingEvent` gained `parentId` (the segment's parent), because an exit is named after the body it leaves, while `bodyId` is the body exited to.
2. **Ships at a time.** `sim/world.ts` gained `shipPointAt(world, id, t)` (the trajectory's state and parent at `t`) and `shipBodyAt` (the body a ship is drawn around then, including the body it will hit, after a predicted impact). `frameBodyOf`, `framingDistanceOf`, `minDistanceOf` and `orbitPoleOf` take the time explicitly.
3. **Where the tests live.** The warp-to clock tests are in `sim/warpTo.test.ts`, and the map-at-preview tests (including "the sim is unchanged") in `render/preview.test.ts`, rather than spread over the existing files. Existing tests that enumerate the clock's fields or `advanceWorld`'s result gained `warpTo: null` and `arrived: false`.
4. **The warp readout** keeps the chosen warp step; the ⏩ label shows the warp-to's progress, with the largest step at or below the eased rate (decision 152).
5. **The elapsed route** is drawn for every coasting ship, including one not drawn at the preview time because it impacts before then. Main pieces are re-sampled when a preview moves back before their sampling.
6. **The badge** sits below the map toolbar (40 px from the top): centred at the top, it covered the Focus button.
7. **A loaded machine.** `gen/lunarMission.test.ts`'s TLI scan (about 1 s) timed out at Vitest's 5 s default with the load average near 10, on master as well; it now has a 20 s timeout.
8. **The smoke test** adds the TLI node through the store rather than by typing (`maneuvers.mjs` already covers typing), and compares the drawn positions with a new `shipPredicted(id, t)` probe. `test/smoke/constants.test.ts` checks both smoke files' TLI constants. The sim → store lint case already existed from sprint 4, so it isn't repeated.

## Questions settled before the sprint

1. **Warp drops:** none. Pause on ▾ stays the only automatic stop; no event needs the player's intervention yet (S5-1).
2. **Warp-to:** fast warp easing in, stopping paused 60 s before a node, or just after any other event (S5-3 to S5-5).
3. **Preview:** transient while dragging, sticky when an event is clicked; the sim keeps running; map editing is off (S5-9, S5-11).
4. **Strip scale:** logarithmic from now (S5-6).
5. **Elapsed route in preview:** the route flown between now and the preview time is drawn faded for context; the route flown before now is not drawn (S5-16).
6. **Inspector in preview:** the inspector should show values at the preview time too. Deferred to sprint 7 (added to its list in [milestone-1-sprints.md](milestone-1-sprints.md)); until then it shows now.

## Open questions

None.
