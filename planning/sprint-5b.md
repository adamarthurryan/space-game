# Sprint 5b — Interface and usability review: detailed plan (draft)

This sprint sits between [sprint 5](sprint-5.md) and sprint 6 of [milestone 1](milestone-1-sprints.md). Its job is to review the interface built in sprints 2 to 5, and to improve it before fleets, alarms and the planning tools (sprints 6 to 9) add more on top.

**Status:** step 1 of the planning, the inventory below. The review findings, goals, scope, decisions and steps come next.

## 1. Inventory: what the interface is today

This lists the UI concepts, abstractions and decisions already built (sprints 2 to 4) or fully planned (sprint 5). Decision numbers refer to [decisions.md](../docs/decisions.md); `S5-n` refers to [sprint-5.md](sprint-5.md). The target design is in [interface.md](../docs/interface.md); this section describes what was actually built, which is smaller.

### 1.1 Principles carried from interface.md

- **The map is home.** One 3D map is the main view, and there are no other screens yet (decisions 15, 24).
- **Show consequences, not advice.** Plans show Δv, propellant, burn time and the resulting orbit or encounter, and the game never suggests a maneuver (decision 16).
- **Desktop, mouse and keyboard only** (decision 6).

### 1.2 Screen layout

`ui/layout/AppShell.tsx` is a CSS grid with five regions:

| Region         | Component         | Contents today |
| -------------- | ----------------- | -------------- |
| Top bar        | `TopBar.tsx`      | A disabled ≡ menu, the title "Sandbox", ⚠ and ⏰ counts (always 0, placeholders), and the ◧ ◨ toggles for the side panels. |
| Left sidebar   | `LeftSidebar.tsx` | The System, Fleets, Stations and Routes tabs (Stations and Routes are empty), and a Filters `<details>` ("No filters yet"). |
| Map            | `MapView.tsx`     | The three.js canvas (`render/Scene.tsx`), the DOM overlays for labels and trajectory markers, and the map toolbar (Ecliptic E, Orbit plane P, Focus F). |
| Right sidebar  | `Inspector.tsx`   | The inspector for the selection: body, ship or node. |
| Bottom         | `Timeline.tsx`    | ◀◀ ⏸/▶ ▶▶, the warp readout, Pause on ▾, an empty strip (filled in sprint 5), and the date. |

Either side panel can be closed, and the map then takes its space. The panel widths, the bar heights and the colours are CSS custom properties in `ui/theme.css`. Each component has its own CSS Module (decision 36). The theme is a dark palette with an accent, warning and danger colour, and a monospace font for figures. Its header comment says the look-and-feel pass is in sprint 10.

### 1.3 Core view-state abstractions (`store/useView.ts`)

These are the concepts the whole UI hangs on.

- **`MapObjectRef`**: a body, a ship, or a node (`{ kind: 'node', shipId, id }`). Selection and hover use it (decisions 82, 105, 123).
- **`FocusRef`**: a body or a ship. A node focuses its ship (`focusRefOf`).
- **Three separate pointers**:
  - **selection** (`selected`) drives the inspector and the list highlights;
  - **focus** (`focus`) drives the camera: the camera's origin, its framing, and the trajectory frame;
  - **the active ship** (`activeShipId`) is the last ship selected, through its row, its marker or one of its nodes. Selecting a body keeps it, and a destroyed ship is never active. Only the active ship's plan can be edited (decision 122).
- **Click selects, double-click selects and focuses**, a click on empty space changes nothing, and Esc clears the selection (decision 82). The lists use the same rule, with Enter to focus.
- **Requests, not state, for the camera.** `focusSeq` and `snapRequest` are bumped requests; the camera's animated state lives in the controller, not in zustand (decision 85).
- **Hover** is a `MapObjectRef` that the map, labels and orbit lines use to highlight an object.
- Panel state: `leftPanelOpen`, `rightPanelOpen`, `leftTab`, the tree's `expanded` map, `spawnFormOpen`.
- Planned in sprint 5: **`preview: { t, sticky } | null`** and **`viewTime = preview?.t ?? clock.t`** (S5-9).

### 1.4 World ↔ UI plumbing (`store/useWorld.ts`)

- The world is plain data mutated in place. The store bumps a **`version`** on every player action, and whenever the clock stage handled events, and panels subscribe to it (decisions 85, 92).
- **`useSimTime`** gives readouts that follow `t` at 10 Hz.
- All player actions go through **`game/actions.ts`**, which returns `ActionResult` (`ok`, or an `error` string). The UI shows the error inline and never changes the world itself (decisions 102, 131).

### 1.5 The map

**Camera** (decision 81, `render/camera/controller.ts`)

- A left-button drag orbits (yaw and pitch about a reference pole), and the wheel zooms logarithmically (one notch ×2, eased). There is no pan: the camera always orbits its focus.
- Refocusing animates the origin over 0.8 s and frames the new focus by a rule (3 × the outermost major moon's apoapsis; ships at 2.5 × their distance from the parent).
- **Snaps**: E for the ecliptic, P for the selected body's or ship's orbital plane. A snap re-expresses the view about the new pole, then eases the pitch to look straight down.

**Drawing** (decisions 79, 80, 83, 108, 110, 124)

- Bodies are true-size spheres, which become fixed-size markers when small on screen. A body merges into its parent within 6 px, and then has no marker and no label.
- Body orbit lines fade by their size on screen and their distance from the camera. The focused, selected and hovered orbits are brighter.
- Ships are 7 px triangles, with one of 8 palette colours by spawn order (`seq % 8`).
- Trajectories are drawn relative to the focus body, or a focused ship's parent. The current path is solid and the planned path after the first node is dashed. Selected, hovered, focused or active ships are drawn at full strength, others at 45%.
- Labels are a DOM overlay, decluttered greedily by priority: focus, selection, hover, then by body class, then by radius.
- Trajectory markers are a DOM overlay: ▲ SOI and ✕ impact on every trajectory, and Pe and Ap on the selected, hovered or focused ship. They can't be clicked (decision 109).

**Picking** (decisions 82, 110, 126; `render/picking.ts`, `render/input/pointerInput.ts`)

- Picking is in screen space, in this order: gizmo handles, node glyphs (8 px), ship markers, body discs, labels, body markers, then the ghost node on the active ship's path.
- A press that moves less than 4 px is a click. A larger move is a camera drag, unless the press began on a handle or a node, which the map input claims first.

**Node editing on the map** (decisions 125, 127, 135)

- **Ghost node**: hovering within 8 px of the active ship's path shows ◇ with `T+… · altitude`. A click creates a zero-Δv node there and selects it.
- **Gizmo**: six cone handles on the selected node of the active ship (prograde yellow, normal magenta, radial cyan). Dragging a handle changes that component with nonlinear sensitivity; Shift is finer and Alt coarser. A handle pointing at the camera is hidden.
- **Node drag**: dragging the node glyph moves the node's time along the path.
- Other ships' nodes are drawn as smaller markers, and clicking one makes its ship active.

### 1.6 Lists (left sidebar)

- **System tab** (`SystemTree.tsx`): an ARIA tree of the bodies with class glyphs (☉ ● ◐ ○). Up/Down move and select, Right/Left expand or collapse, and Enter or a double-click focuses. Selecting a body on the map expands its ancestors and scrolls its row into view.
- **Fleets tab** (`FleetList.tsx`): a flat listbox of ships in spawn order. Each row shows the colour swatch, ★ if it is the active ship, the name, Δv, and the design and SOI. Destroyed ships are greyed, with what they hit. The tab also holds the **Spawn ship…** button, which shows the spawn form in place of the button.
- **Spawn form** (`SpawnShipForm.tsx`, decision 104): design, name, parent, and raw orbital elements (periapsis altitude, e, i, Ω, ω, ν, in degrees, against the equator or the ecliptic), plus a preset menu. It is a sandbox and developer tool.

### 1.7 Inspector (right sidebar)

`Inspector.tsx` switches on `selected.kind`:

- **Body** (decision 86): physical data, the orbit from its mean elements at `t`, and the SOI radius. It has no actions.
- **Ship** (decision 111, `ShipInspector.tsx`): name, design and status, a **Focus** button, then the **Plan** section, then mass and propellant, engines, the orbit, and the upcoming events with countdowns.
- **Plan section** (decisions 129, 130, `PlanSection.tsx`): the node list (number, countdown, Δv, and "disabled" or "not reached"); Δv planned and Δv left after the plan, in red when over budget; and **Add node ▾** (at the next Pe, Ap, AN or DN, or "At time T…" with an inline T+ field).
- **Node editor** (decisions 128, 130, `NodeEditor.tsx`): a "← ship" link back, the time as a date and as T+, the prograde, normal and radial Δv, and the feedback (Δv, propellant, burn duration, Over budget, Long burn, Not reached, and the result: an encounter or the resulting orbit). Its actions are Enabled, Snap to Pe, Snap to Ap and Delete. A selected node *replaces* the ship inspector; it isn't shown inside it.
- Planned for sprint 7: the inspector shows values at the preview time. Until then it always shows now (sprint 5's out-of-scope list).

### 1.8 Fields and formatting

- **`QuantityField`** (`ui/fields/`): a text field with units. Enter or blur commits, Escape reverts, the wheel nudges a focused field (Shift finer, Alt coarser), and an error from parsing or from the action is shown under the field.
- **Parsing** (`ui/parse.ts`): speeds with units (`12 m/s`, `3.1 km/s`), durations (`1d 2h 30m`), and dates (`YYYY-MM-DD hh:mm:ss`).
- **Formatting** (`ui/format.ts`): dates as `YYYY-MM-DD hh:mm:ss`, as if UTC (decision 87); distances in km, switching to AU at 1e7 km; speeds in m/s below 1 km/s and km/s above; durations and countdowns to their two leading units; warp as `×10⁶`. Unit switching is in sprint 10.

### 1.9 Time control

- Warp steps from ×1 to ×10⁷ with `,` and `.` or ◀◀ ▶▶, and play/pause with Space or the button. Pausing keeps the warp step (decision 76).
- **Pause on ▾** (decision 120): a popover with a checkbox per event type (node execution, SOI change, impact) and an "All events" checkbox that can show a mixed state. By default the clock pauses on node execution.
- Planned in sprint 5:
  - **The strip**: a log time axis from now, with event glyphs (◆ node, ▲/▼ SOI, ✕ impact) in the ship's colour, stacking, ticks, and hover tooltips (S5-6 to S5-8).
  - **Warp-to**: "next event" and "to node", with the eased rate and the ⏩ label. They stop 60 s before a node, or just after any other event (S5-3 to S5-5).
  - **Preview scrubbing**: pressing on the strip starts a transient preview, and clicking a glyph starts a sticky one. The map is drawn at `viewTime`, with an amber border, a PREVIEW badge with Now (Esc), and the elapsed route faded. Map editing is off during a preview (S5-9 to S5-13, S5-16).

### 1.10 Keyboard

| Key                | Action |
| ------------------ | ------ |
| Space              | Play / pause |
| `,` `.`            | Warp down / up |
| F                  | Focus the selection (a node focuses its ship) |
| E / P              | Snap to the ecliptic / the selection's orbital plane |
| Esc                | Clear the selection (sprint 5: end a preview first) |
| Delete / Backspace | Delete the selected node, and select its ship |
| Up / Down          | Move through the System tree or the Fleets list |
| Right / Left       | Expand / collapse in the tree; switch sidebar tabs |
| Enter              | Focus the row's object |

Keys are ignored in text fields and with Ctrl, Alt or Meta held, and Space is left to a focused button (decision 87). The only places keys are listed are the toolbar's key hints and its tooltips. The full keyboard pass is in sprint 10.

### 1.11 Accessibility and testing conventions

- ARIA patterns throughout: tabs with arrow keys, a tree, a listbox with `aria-activedescendant`, `role="alert"` for errors, `aria-pressed` and `aria-expanded` on toggles, and labelled `output` readouts.
- In dev builds, a debug handle (`window.__spaceGame`, decisions 88, 112, 133, S5-15) exposes what the map drew. The smoke tests (`test/smoke/*.mjs`) drive the real UI with it, including a full lunar flight through the node editor.

### 1.12 Seams noticed while taking the inventory

These are observations to feed the review, not decisions.

- **Placeholder chrome**: the ≡ menu is disabled, the ⚠ and ⏰ counts are always 0, the Stations and Routes tabs are empty, and the Filters panel has nothing in it. All of these take space and promise things that don't exist yet.
- **Three pointers**: selection, focus and the active ship are separate, and the UI shows only some of them (★ in the list, highlighting on the map). Esc clears the selection but not the active ship, and selecting a body keeps the active ship, so it isn't always clear which ship the ghost node and the gizmo belong to.
- **Inconsistent units**: the node editor shows Δv as `3131.0 m/s`, while every other place uses `formatSpeed` (`3.13 km/s`). Masses are `t` in the ship inspector and `kg`/`t` in the node feedback, from separate local helpers. `Rows` is copied in two inspectors.
- **Inconsistent actions**: the ship inspector has a Focus button and the body inspector has none. The body inspector has no actions at all, and "set as target" arrives in sprint 7.
- **Node editor navigation**: a selected node replaces the whole ship inspector, so the plan totals and the other nodes can't be seen while editing one. Getting back is the "← ship" link or Delete.
- **Popovers**: Pause on ▾ and Add node ▾ open and close only through their own button. A click outside or Esc doesn't close them.
- **Camera**: there is no pan, and no way to look at a point other than an object's centre. Trajectory markers (Pe, Ap, SOI, impact) can't be clicked.
- **Discoverability**: the ghost node, the node drag and the gizmo's modifier keys aren't explained anywhere in the UI. Keys are listed only on the toolbar.
- **Spawn form**: the only way to get a ship is a form of raw orbital elements, which suits testing more than play.
- **Ship identity**: the colour by `seq % 8` repeats after eight ships, and the same colour is used for the swatch, the marker, the trajectory and (sprint 5) the strip glyphs.

## 2. Review findings

_To do: walk through the app after sprint 5 (the run-app skill, screenshots), and list the usability problems with their severity._

## 3. Goals and scope

_To do._

## 4. Decisions made for this sprint

_To do._

## 5. Steps

_To do._
