# Sprint 5b — Interface and usability review: detailed plan

This sprint sits between [sprint 5](sprint-5.md) and sprint 6 of [milestone 1](milestone-1-sprints.md). Its job is to review the interface built in sprints 2 to 5, and to improve it before fleets, alarms and the planning tools (sprints 6 to 9) add more on top.

**Status:** done. The inventory (§1) and the walkthrough findings (§2) are the inputs. §3 to §10 are the plan, and the [implementation notes](#implementation-notes) record what was built. Three questions are still open (end of document; decisions.md open questions 10 to 12).

## 1. Inventory: what the interface is today

This lists the UI concepts, abstractions and decisions built in sprints 2 to 5. Decision numbers refer to [decisions.md](../docs/decisions.md). The developer's guide to the code is [ui-and-render.md](../docs/guides/ui-and-render.md). The target design is in [interface.md](../docs/interface.md); this section describes what was actually built, which is smaller.

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
| Bottom         | `Timeline.tsx`    | ◀◀ ⏸/▶ ▶▶, the warp readout, Pause on ▾, the warp-to buttons (⏭ next event, ◆⏭ node), the event strip, and the date. |

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
- **`preview: { t, sticky } | null`**: view state only. The map draws at the preview time, or at now when there is no preview (decision 144).

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
- The node editor also has **Warp to node** (decision 139).
- The inspector always shows now, even during a preview. Showing values at the preview time is planned for sprint 7.

### 1.8 Fields and formatting

- **`QuantityField`** (`ui/fields/`): a text field with units. Enter or blur commits, Escape reverts, the wheel nudges a focused field (Shift finer, Alt coarser), and an error from parsing or from the action is shown under the field.
- **Parsing** (`ui/parse.ts`): speeds with units (`12 m/s`, `3.1 km/s`), durations (`1d 2h 30m`), and dates (`YYYY-MM-DD hh:mm:ss`).
- **Formatting** (`ui/format.ts`): dates as `YYYY-MM-DD hh:mm:ss`, as if UTC (decision 87); distances in km, switching to AU at 1e7 km; speeds in m/s below 1 km/s and km/s above; durations and countdowns to their two leading units; warp as `×10⁶`. Unit switching is in sprint 10.

### 1.9 Time control

- Warp steps from ×1 to ×10⁷ with `,` and `.` or ◀◀ ▶▶, and play/pause with Space or the button. Pausing keeps the warp step (decision 76).
- **Pause on ▾** (decision 120): a popover with a checkbox per event type (node execution, SOI change, impact) and an "All events" checkbox that can show a mixed state. By default the clock pauses on node execution.
- **The strip** (decisions 141 to 143): a logarithmic time axis from now (left edge) to the end of the active ship's prediction, clamped to [1 d, 10 yr]. It shows the active ship's events only: ◆ node, ▲/▼ SOI entry and exit, ✕ impact, in the ship's colour, stacked when close. Hovering a glyph shows a tooltip with the event, date and countdown.
- **Warp-to** (decisions 138 to 140, 152): ⏭ goes to the next event and ◆⏭ to the node. Both ease in from up to ×10⁷ and stop paused, 60 s before a node or just after any other event. A ⏩ readout shows the progress. A refused warp-to puts its reason in the button's tooltip.
- **Preview** (decisions 144 to 148, 151): pressing on the strip starts a transient preview that follows the pointer and ends on release. Clicking a glyph starts a sticky one that lasts until Esc, Now, or the clock catching up. The whole map is drawn at the preview time, and the route flown until then is faded. It has an amber border and a PREVIEW badge with Now (Esc). Map editing is off during a preview.

### 1.10 Keyboard

| Key                | Action |
| ------------------ | ------ |
| Space              | Play / pause |
| `,` `.`            | Warp down / up |
| F                  | Focus the selection (a node focuses its ship) |
| E / P              | Snap to the ecliptic / the selection's orbital plane |
| Esc                | End a preview; otherwise clear the selection |
| Delete / Backspace | Delete the selected node, and select its ship |
| Up / Down          | Move through the System tree or the Fleets list |
| Right / Left       | Expand / collapse in the tree; switch sidebar tabs |
| Enter              | Focus the row's object |

Keys are ignored in text fields and with Ctrl, Alt or Meta held, and Space is left to a focused button (decision 87). The only places keys are listed are the toolbar's key hints and its tooltips. The full keyboard pass is in sprint 10.

### 1.11 Accessibility and testing conventions

- ARIA patterns throughout: tabs with arrow keys, a tree, a listbox with `aria-activedescendant`, `role="alert"` for errors, `aria-pressed` and `aria-expanded` on toggles, and labelled `output` readouts.
- In dev builds, a debug handle (`window.__spaceGame`, decisions 88, 112, 133, 150) exposes what the map drew. The smoke tests (`test/smoke/*.mjs`) drive the real UI with it, including a full lunar flight through the node editor.

### 1.12 Seams noticed while taking the inventory

These were noted from the code before the walkthrough. Most are confirmed in §2.

- **Placeholder chrome**: the ≡ menu is disabled, the ⚠ and ⏰ counts are always 0, the Stations and Routes tabs are empty, and the Filters panel has nothing in it. All of these take space and promise things that don't exist yet.
- **Three pointers**: selection, focus and the active ship are separate, and the UI shows only some of them (★ in the list, highlighting on the map). Esc clears the selection but not the active ship, and selecting a body keeps the active ship, so it isn't always clear which ship the ghost node and the gizmo belong to.
- **Inconsistent units**: the node editor shows Δv as `3131.0 m/s`, while every other place uses `formatSpeed` (`3.13 km/s`). Masses are `t` in the ship inspector and `kg`/`t` in the node feedback, from separate local helpers. `Rows` is copied in two inspectors.
- **Inconsistent actions**: the ship inspector has a Focus button and the body inspector has none. The body inspector has no actions at all, and "set as target" arrives in sprint 7.
- **Node editor navigation**: a selected node replaces the whole ship inspector, so the plan totals and the other nodes can't be seen while editing one. Getting back is the "← ship" link or Delete.
- **Popovers**: Pause on ▾ and Add node ▾ open and close only through their own button. A click outside or Esc doesn't close them.
- **Camera**: there is no pan, and no way to look at a point other than an object's centre. Trajectory markers (Pe, Ap, SOI, impact) can't be clicked.
- **Discoverability**: the ghost node, the node drag and the gizmo's modifier keys aren't explained anywhere in the UI. Keys are listed only on the toolbar.
- **Spawn form**: the only way to get a ship is a form of raw orbital elements, which suits testing more than play.
- **Ship identity**: the colour by `seq % 8` repeats after eight ships, and the same colour is used for the swatch, the marker, the trajectory and the strip glyphs.
- **Warp-to errors**: a refused warp-to from the timeline shows its reason only in the button's tooltip.

## 2. Review findings

From a walkthrough of the running app after sprint 5, at 1400 × 800, in headless Chrome. The walkthrough went: first load; select Earth; open Fleets; spawn "LEO (lunar plane)"; focus the ship; Add node ▾; set a 3,131 m/s prograde node at T+1 h; hover and click the strip; zoom out; drag a preview; warp to the next event; open Pause on ▾. The script is not in the repo.

Severity: **high** means it blocks or misleads a player on the core loop (plan a burn, see where it goes, fly it). **Medium** means friction or confusion that a player would work around. **Low** means polish.

### 2.1 Orientation: where am I, where is my ship

| #    | Sev.   | Finding |
| ---- | ------ | ------- |
| F1   | high   | **The first view gives no foothold.** Nothing is selected, and the clock is running. The camera looks obliquely at Earth, and Earth's orbit around the Sun crosses the map as a nearly straight line. The three sandbox ships are at Earth and the Moon but can't be seen: at this zoom they merge into Earth's marker. Nothing points to the Fleets tab. |
| F2   | medium | **Spawning doesn't show the ship.** The new ship is selected and made active, but the camera doesn't move. At the default zoom the ship merges into Earth, and its label takes Earth's place. |
| F3   | medium | **Focusing a ship in low orbit frames it far too close for planning.** The camera sits at about 16,000 km from a 200 km orbit, so Earth fills the map and most of the orbit is behind it. Six wheel notches out are needed to see a trans-lunar trajectory and the Moon together. |
| F4   | low    | **A preview keeps the current zoom.** Previewing the Moon SOI entry from a view of the low orbit shows the ship and little else. Nothing frames what is being previewed. |

### 2.2 Map legibility

| #    | Sev.   | Finding |
| ---- | ------ | ------- |
| F5   | high   | **An encounter looks like a miss.** The trans-lunar trajectory ends at a "▲ Moon SOI" marker in empty space, a quarter of an orbit away from the Moon. The Moon is drawn where it is now, and nothing shows where it will be at arrival. A preview shows it, but only for a player who knows to scrub. The ghost of the target at arrival is planned for sprint 9. |
| F6   | medium | **Overlays aren't hidden behind bodies.** The "Ap 200 km" marker and the node with its gizmo are drawn over Earth's disc when they are on the far side. Front and back can't be told apart. |
| F7   | medium | **The gizmo keeps its size at every zoom.** It always has 60 px arms. Zoomed out to the Earth–Moon system, it covers the ship, Earth, the Moon and their labels, and it stays as long as the node is selected. |
| F8   | medium | **Labels collide.** With Earth selected and the active ship in orbit, "Earth" and "Starship 4" are drawn on top of each other. Zoomed out, "Moon" sits over the ship marker. Both labels are always placed, so the declutter can't separate them. |

### 2.3 Timeline strip and time control

| #    | Sev.   | Finding |
| ---- | ------ | ------- |
| F9   | medium | **The far end of the strip is crowded.** For a 4-day trajectory, everything after 1 d shares about 150 px. The ▲ SOI and ✕ impact glyphs sit at the right edge, and the ✕ touches the date readout. Those are the events a player most wants to see. |
| F10  | medium | **The axis moves under the player.** The axis starts at now, so every glyph and tick slides left as time passes. After a warp-to, the node glyph jumped from the "1 h" tick to the "1 min" tick. There is no fixed reference to read against. |
| F11  | low    | **The warp-to buttons are hard to read.** ⏭ and ◆⏭ are small glyphs that look alike. A refused warp-to only changes the button's tooltip, so the click appears to do nothing. |
| F12  | low    | **Paused is shown faintly**: a struck-through `×1` and the ▶ icon. A warp-to that arrives and pauses looks the same as one that never started. |
| F13  | low    | **The strip shows only the active ship**, even when another ship or a body is selected. This is by design until sprint 6's Show selector, but nothing on the strip says whose events it shows. |

### 2.4 Inspector and plan editing

| #    | Sev.   | Finding |
| ---- | ------ | ------- |
| F14  | high   | **The node editor hides the plan.** Selecting a node replaces the ship inspector, so while tuning a burn the player can't see the ship's Δv, the plan totals, the other nodes or the upcoming events. Δv left after the plan, the main "can I afford it" figure, is one click away. |
| F15  | medium | **Δv is shown two ways side by side**: the fields show `3131.0 m/s`, and the feedback just below says `Δv 3.13 km/s`. |
| F16  | medium | **The Time field is too narrow** for its value: `2030-01-01 01:(` is cut off. |
| F17  | medium | **"At next Ap" on a circular orbit is refused** ("No apoapsis ahead on the path"), while the map shows an "Ap 200 km" marker on the same orbit. The menu stays open, with the warning below it. |
| F18  | low    | **Menus don't close the usual ways.** Pause on ▾ and Add node ▾ close only through their own button: not on a click outside, not on Esc. Pause on ▾ opens over the Filters panel. |
| F19  | low    | **Actions differ between inspectors.** The body inspector has no Focus button (the ship inspector has one), and it has no actions or links at all: nothing goes from Earth to the ships orbiting it. |

### 2.5 Concepts and chrome

| #    | Sev.   | Finding |
| ---- | ------ | ------- |
| F20  | medium | **The active ship is nearly invisible as a concept.** It is shown only by a ★ in the Fleets list, which may be on a hidden tab. Selecting Earth removes the gizmo but keeps the ship's trajectory highlighted, its events on the strip, and its path the target of the ghost node. Nothing on screen says "active: Starship 4". |
| F21  | medium | **Placeholder chrome promises missing features**: the disabled ≡ menu, ⚠ 0 and ⏰ 0, the empty Stations and Routes tabs, and the empty Filters panel. |
| F22  | low    | **Getting a ship is a developer form.** The spawn form takes raw orbital elements in degrees. Its presets are the usable path, but they sit in a "Choose…" dropdown at the top. New ships are named "Starship 4". |
| F23  | low    | **Fleet rows look alike.** Every sandbox ship shows "7.84 km/s · Starship · Earth": nothing tells what each one is doing, such as its orbit or next event. Sprint 6 plans the next-event countdown and status icons. |

### 2.6 Already planned in later sprints

Some findings are covered by later sprints. Sprint 5b can leave them there, or bring forward a small part of them:

- F5, the target's ghost at arrival: sprint 9 (closest approach). A smaller step would be to show each SOI-entry body's position at the entry time.
- F13 and F23, the Show selector and richer fleet rows: sprint 6.
- F21, the Filters panel: sprint 6. Alarms will give ⏰ a meaning in sprint 6.
- F15 and F12, unit switching and the look-and-feel pass: sprint 10.
- The inspector at the preview time: sprint 7.

## 3. Goals and scope

**Goal:** a player who opens the app can find a ship, see where it is, plan a burn while seeing what it costs, and read where it goes, without the interface hiding or misreporting anything. By the end of the sprint:

- the view keeps separate pointers: selection, focus, reference frame and active ship (§4.1);
- the first view and a new ship are easy to find;
- the map's overlays read correctly at every zoom: what is in front, what is behind, which label is which, and where an encounter happens;
- the node editor shows the plan it belongs to;
- the strip has a fixed 10-year scale, so its ticks stay in place.

**In scope**, by finding (§2):

| Finding | Topic |
| ------- | ----- |
| F1, F2, F3 | The first view, finding a new ship, and ship framing |
| F5 (part) | Where the encounter body is at the SOI entry; the full target ghost stays in sprint 9 |
| F6, F7, F8 | Occlusion of overlays, gizmo size, label collisions |
| F9, F10 | The strip: a fixed 10-year logarithmic scale |
| F14 to F18 | The node editor and the plan; Δv units; the Time field; Pe/Ap on circular orbits; menus |
| F20 | The active ship made visible: the pointer model and the Fly button (§4.1) |
| F21 | Placeholder chrome |

**Out of scope:**
- F4: framing the previewed object.
- F11 and F12: the warp-to buttons and the paused state; sprint 10's look-and-feel pass.
- F13 and F23: whose events the strip shows, and the fleet rows; sprint 6.
- F19: body inspector actions; sprint 7, with targets.
- F22: the spawn form.
- Unit switching and the keyboard pass; sprint 10.

## 4. Decisions made for this sprint

### 4.1 The pointer model

The view keeps separate pointers, each with one job. This replaces the model of decisions 82, 105, 106, 122 and 123, where focus also chose the trajectory frame and selecting a ship made it active.

| Pointer        | Where              | What it drives | How it changes |
| -------------- | ------------------ | -------------- | -------------- |
| Selection      | `useView.selected` | The inspector and the list highlights. | Click, list rows, Esc (unchanged). |
| Hover          | `useView.hovered`  | Highlights. | The pointer (unchanged). |
| Focus          | `useView.focus`    | The camera's centre only. | Double-click, F, a list row's double-click or Enter. |
| Reference frame | `useView.frame` (new) | The body that trajectories are drawn relative to. | Selecting, activating, and the toolbar's Frame ▾. |
| Active ship    | `useView.activeShipId` | The ship flown: map editing, the strip, warp-to. | **A** or the toolbar's Fly button only. |
| Target         | `Ship.target` (sim, later) | The ship's target for planning tools and closest approach. | Sprint 7. |

| #      | Topic                       | Decision |
| ------ | --------------------------- | -------- |
| S5b-1  | Frame separate from focus   | **`useView.frame`** names the body that ship trajectories (and their markers and the preview's elapsed route) are drawn relative to, in place of decision 106's "the focus body, or a focused ship's parent". The camera still centres on the focus. Body orbit lines are unchanged: each one is drawn around its parent (decision 80). At start, the frame is the initial focus body (Earth). |
| S5b-2  | Selection sets the frame    | Selecting a **body** sets the frame to that body. Selecting a **ship** sets it to the ship's current parent (its parent at the preview time during a preview, through `shipBodyAt`). Selecting a **node** sets it as for the node's ship. Clearing the selection (Esc) leaves the frame alone. A **non-active ship's frame is a snapshot**: the frame doesn't change when that ship later changes SOI. |
| S5b-3  | The frame follows the active ship | When the frame is set from the **active** ship (by selecting it, or by activating it), it **follows** that ship: it is the ship's parent at the view time, and it changes when the ship changes SOI, or at a previewed time after an SOI change. It stops following when the frame is set any other way (another selection, Frame ▾), or when another ship is activated. The model: `frame: { kind: 'body', id } \| { kind: 'ship-parent', shipId }`, resolved each frame. |
| S5b-4  | Frame ▾ in the map toolbar  | A dropdown, "Frame: Earth ▾", lists the **focus body** (a focused ship's parent) **and each of its parents** up to the root, plus the **selected body** (a selected ship's or node's parent) if it isn't already listed. Choosing one sets a fixed body frame (no following). A following frame is shown as "Frame: Moon (Kestrel) ▾". |
| S5b-5  | Focus moves only the centre | Focusing an object that is **on screen** (its projected centre is inside the map and in front of the camera) moves the view centre to it over the usual 0.8 s, and **keeps the distance, yaw, pitch and snap pole**. The distance is clamped only to the new focus's minimum (1.05 × radius). Focusing an **off-screen** object keeps decision 81's refocus, with the framing distance. |
| S5b-6  | Manual activation           | A ship becomes active **only** through the **A** key or the map toolbar's **Fly** button, which act on the selected ship (or the selected node's ship). Selecting a ship, clicking another ship's node on the map, or spawning a ship (the user's choice: **never**) doesn't change the active ship. Activating the selected ship also sets the frame to follow it (S5b-3). There is no "deactivate": activating another ship replaces it, and a destroyed ship stops being active (unchanged). |
| S5b-7  | The Fly button              | It sits in the map toolbar with the other view controls. With a coasting ship selected that isn't active: **"Fly Kestrel (A)"**. With the active ship (or its node) selected, it shows **"★ Kestrel"** as pressed. With anything else selected, it shows the active ship's name, or "No active ship", disabled. This makes the active ship visible at all times (F20). |
| S5b-8  | Non-active ships are read-only | The user's choice, for now (see open question 1): a non-active ship's plan can be **viewed but not edited**. Its node glyphs can be clicked to select a node, and the inspector shows the node and the Plan section read-only, with a line "Read-only: fly this ship to edit (A)". Add node ▾, the node fields, Snap, Delete, Enabled and Warp to node are disabled. Map editing (ghost node, gizmo, node drag) stays active-ship only (unchanged). |
| S5b-9  | Ship targets (later)        | A ship's **target** is sim state, **`Ship.target: { kind: 'body' \| 'ship'; id } \| null`**. It is saved with the world, because planning tools and closest-approach pruning (sprints 7 and 9) read it. It isn't view state. It is added with its first use in sprint 7, so sprint 5b adds no field and no UI. The target shown and used is the **active ship's** target. |

### 4.2 Decisions by finding

Each one was chosen by the user from the options for its finding (§2).

| #      | Finding | Topic                    | Decision |
| ------ | ------- | ------------------------ | -------- |
| S5b-10 | F1      | Start view (provisional) | The app starts **snapped to the ecliptic**, looking down, **framed on the Earth–Moon system** (Earth's framing, decision 81) instead of the oblique view. Nothing else changes: nothing is selected, and the clock starts as before. This is provisional: see open question 3. |
| S5b-11 | F2      | Spawning flashes the ship | Spawning **selects** the new ship (so the frame becomes its parent, S5b-2) and doesn't move the camera or activate it (S5b-6). The ship then **flashes** for about 2 s of wall time: its marker and label pulse, and its label is **forced to show**, even when the ship is merged into its parent. `useView` gains `flash: { ref, until } \| null`. |
| S5b-12 | F3      | Ship framing             | A ship is framed by the **bounding sphere of its drawn path**, from the ship up to its first segment end or one revolution, whichever comes first. The floor is **3 × the parent's radius**, and the cap is the parent's framing, as now. A 200 km Earth orbit shows its whole orbit around a small Earth, and a trans-lunar path shows out to the Moon. It applies wherever a ship is framed: focusing it off screen (S5b-5), and reframing (open question 2). |
| S5b-13 | F5      | The body at SOI entry    | For each **SOI-entry** marker on the selected, hovered, focused or active ship's path, the map draws a **ghost of the body entered**: a hollow marker, and a ring of its SOI radius facing the camera, where the body will be **at the entry time**, labelled "Moon at entry". It is placed in the reference frame like the trajectory points: `frameBodyWorld + (body(t_entry) − frameBody(t_entry)) − origin`. It isn't pickable. During a preview it is drawn only for entries after the preview time. The full target ghost stays in sprint 9. |
| S5b-14 | F6      | Overlays behind bodies   | Trajectory markers, node glyphs, the ghost node and S5b-13's ghosts that are **behind a nearer body's disc** (the label test of decision 83) are drawn at **30% opacity, with their texts hidden**. A gizmo handle behind a disc is dimmed and can't be picked. A node behind a disc can be selected but not dragged. |
| S5b-15 | F7      | Gizmo at small scale     | The gizmo is shown only while the selected node's **conic** (the segment the node is on, before the burn) is **at least 150 px across on screen**: the projected major axis for an ellipse, and the drawn piece's screen extent for an open conic. Below that, only the node glyph is drawn, with a tooltip "Zoom in to drag the node". The inspector fields still edit it. |
| S5b-16 | F8      | Merged labels            | When a ship's label would overlap its parent's label, the two **merge into one**: "Earth · Starship 4". With more ships it reads "Earth · Kestrel, Tern +2", listing first the selected, active and focused ships, then by spawn order. Each name in a merged label is its own pick target. This replaces "always placed, may overlap" for the labels of a ship and its parent. Other collisions are decluttered as before. |
| S5b-17 | F14     | Node editor inline       | Selecting a node keeps the **ship inspector**. In its **Plan** list, the selected node's row **expands in place** into the node editor (fields, feedback, actions), with the totals and the other nodes above and below it. The row scrolls into view. Clicking the expanded row's header selects the ship, which collapses it. The "← ship" link goes. Read-only rules: S5b-8. |
| S5b-18 | F15     | Δv in plans              | A new **`formatDv`**: m/s with a thousands separator and one decimal, `3,131.0 m/s`. It is used for **every plan figure**: the node fields, the node feedback, the node rows, Δv planned, Δv left after the plan, and "Over budget". A ship's own Δv and orbital speeds keep `formatSpeed`. Typed input still accepts `km/s`. |
| S5b-19 | F16     | Field layout             | `QuantityField` puts its **label on a line above a full-width input**, everywhere it is used, so a full date fits in the 300 px inspector. |
| S5b-20 | F17     | Circular orbits          | **One predicate**, `hasApsides(conic)`, which is false below **e = 1e-4** (and Ap needs a closed orbit), is used by the map's Pe/Ap markers, Add node ▾'s "At next Pe/Ap", and Snap to Pe/Ap. Below the threshold, the markers aren't drawn, and the menu items and buttons are **disabled with "Circular orbit"**. The step also finds why the passage search refused an apoapsis that the marker code placed, and checks it agrees with the predicate for e just above 1e-4. |
| S5b-21 | F18     | Popovers                 | A shared **`Popover`** for Pause on ▾, Add node ▾, Frame ▾ and later menus. It closes on a click outside, on **Esc** (which is then consumed, so it doesn't also end a preview or clear the selection), and after a menu item is chosen. It opens on whichever side of its button has room. |
| S5b-22 | F21     | Placeholder chrome       | **Hidden until built**: the ≡ menu (saves, sprint 10), ⚠ (when warnings exist) and ⏰ (alarms, sprint 6), the Stations and Routes tabs (their milestones), and the Filters panel (sprint 6). The top bar keeps the title and the panel toggles. |
| S5b-23 | F9, F10 | Fixed strip scale        | The strip's span is **fixed at 10 years**, whether or not a ship is active. The knee is **`T0 = 10 min`**: `x = log(1 + Δt/T0) / log(1 + 10 yr/T0)`. That puts 1 h at 15%, 1 d at 38%, 4 d at 48%, 1 mo at 64% and 1 yr at 83%. The **ticks never move**. Glyphs still slide toward now as time passes, because the axis starts at now. The tick set and the 40 px rule are unchanged, and a preview is clamped to [now, now + 10 yr]. This supersedes the span of decision 141. |
| S5b-24 | F9      | Past the prediction      | The strip is **shaded** after the active ship's trajectory end (its horizon or impact). A preview there still works, and the ship isn't drawn, as now. The horizon tick stays. |

### 4.3 Docs these change

- [interface.md](../docs/interface.md): Camera (focus keeps the view on screen), Reference frame (Frame ▾ in the map toolbar, not the inspector), Fleet management (selecting no longer activates; A and Fly), and "Only the active ship's nodes and arcs are shown as editable" (read-only plans).
- [interface.md](../docs/interface.md), also: the label rule (S5b-16), the node editor in the inspector (S5b-17), and the strip's scale (S5b-23, S5b-24).
- [decisions.md](../docs/decisions.md): S5b-1 to S5b-9 supersede parts of decisions 82, 105, 106, 122, 123 and 126 (clicking another ship's node makes it active). S5b-12 changes decision 105's ship framing, S5b-16 changes decision 83, S5b-17 changes decision 128, and S5b-23 changes decision 141.

## 5. Files to create and change

```
src/
  orbital/
    (passages.ts extended)   passages.test.ts          CIRCULAR_E, hasApsides; the circular apoapsis bug (S5b-20)
  store/
    (useView.ts extended)    useView.test.ts           frame, activate, flash; select no longer activates (S5b-1 to S5b-6, S5b-11)
  render/
    (mapFrame.ts extended)   mapFrame.test.ts          FrameRef, resolveFrameBody (S5b-1 to S5b-3)
    occlusion.ts             occlusion.test.ts         occludedAt, moved from labelLayout and shared (S5b-14)
    encounterGhosts.ts       encounterGhosts.test.ts   bodies at SOI entry, placed in the frame (S5b-13)
    layers/EncounterGhostLayer.ts                      hollow markers and SOI rings (S5b-13)
    (camera/framing.ts)      framing.test.ts           pathFramingDistance (S5b-12)
    (camera/CameraStage.ts)  cameraStage.test.ts       on-screen refocus keeps distance and orientation; start view (S5b-5, S5b-10)
    (NodeGizmo.ts)           nodeGizmoMath.test.ts     conicScreenSize, the 150 px rule (S5b-15)
    (overlays/labelLayout.ts) labelLayout.test.ts      merged ship/parent labels, forced flash labels (S5b-11, S5b-16)
  ui/
    (format.ts)              format.test.ts            formatDv (S5b-18)
    layout/
      Popover.tsx            Popover.test.tsx          outside click, Esc, item choice, side with room (S5b-21)
    map/
      frameOptions.ts        frameOptions.test.ts      the Frame ▾ list (S5b-4)
      FrameMenu.tsx          FrameMenu.test.tsx        Frame ▾ (S5b-4)
      FlyButton.tsx          FlyButton.test.tsx        Fly / ★ (S5b-6, S5b-7)
    timeline/
      (scale.ts)             scale.test.ts             fixed 10-year span, T0 = 10 min (S5b-23)
      (TimelineStrip.tsx)    TimelineStrip.test.tsx    shading past the horizon (S5b-24)
test/smoke/
  usability.mjs                                        the sprint's acceptance checks
```

Also change:

- `game/actions.ts`: `addNodeAt` and `snapNode` use `hasApsides`, and refuse with "Circular orbit". Read-only plans are a UI rule (S5b-8), so the actions don't check activation.
- `render/MapRenderer.ts`: `ViewSnapshot.frameBodyId` from `resolveFrameBody` instead of `frameBodyOf` (focus). `render/input/pointerInput.ts`: the frame body from the frame, not the focus. A click on another ship's node only selects it (decision 126). Nodes behind a disc can't be dragged. `render/layers/TrajectoryLayer.ts`, `render/trajectoryMarkers.ts`: `hasApsides`, and the dimmed state behind discs. `render/overlays/TrajectoryMarkerOverlay.tsx`: dimmed markers without text. `render/layers/MarkerLayer.ts`: the flash pulse. `render/debugHandle.ts`: the probes in §6.
- `ui/useMapKeys.ts`: **A** activates the selected ship. Esc is left to an open popover first. `ui/map/MapToolbar.tsx`: Frame ▾ and Fly. `ui/layout/TopBar.tsx`, `LeftSidebar.tsx`: the hidden chrome (S5b-22). `ui/layout/Inspector.tsx`: a selected node shows the ship inspector. `ui/panels/ShipInspector.tsx`, `PlanSection.tsx`, `NodeEditor.tsx`: the inline editor and the read-only state. `NodeEditor` becomes the body of the expanded row, without the "← ship" link. `ui/fields/QuantityField.tsx` (+ css): the label above. `ui/layout/PauseOnMenu.tsx`: uses `Popover`. `ui/panels/SpawnShipForm.tsx`: select and flash, don't activate. `ui/timeline/WarpToButtons.tsx`: unchanged. It already uses the active ship, which is now set only by A or Fly.
- `test/smoke/maneuvers.mjs`, `timeline.mjs`, `ships.mjs`, `map.mjs`: change only what relies on behaviour this sprint changes. That is: selecting or spawning a ship making it active (press A), the oblique start view, ship framing distances, and the strip's span.
- `test/lint/layers.test.ts`: the new cases (§7).
- Docs, at the end: §4.3. Also [architecture.md](../docs/architecture.md) (rendering conventions: trajectories in the reference frame, not the focus frame); [guides/ui-and-render.md](../docs/guides/ui-and-render.md) (the pointers, `Popover`, `formatDv`); [milestone-1-sprints.md](milestone-1-sprints.md) (the outcome); [CLAUDE.md](../CLAUDE.md) (the current status).

## 6. Interfaces and data models

### `store/useView.ts` (changes)

```ts
/** The reference frame (S5b-1 to S5b-3): a fixed body, or the active ship's parent, followed. */
export type FrameRef = { kind: 'body'; id: BodyId } | { kind: 'ship-parent'; shipId: ShipId };

// ViewState additions:
frame: FrameRef;                                   // initially { kind: 'body', id: 'earth' }
flash: { ref: MapObjectRef; until: number } | null; // until: performance.now() ms (S5b-11)
setFrame(id: BodyId): void;                        // Frame ▾: a fixed body frame
activate(id: ShipId): void;                        // A / Fly: active ship, frame follows it (S5b-6)
flashObject(ref: MapObjectRef): void;              // 2 s
```

`select(ref)` no longer changes `activeShipId`. It sets the frame (S5b-2):
- a body: that body;
- the active ship, or its node: `{ kind: 'ship-parent', shipId }`;
- any other ship, or its node: its parent at the view time, as a fixed body, read through `useWorld` and `shipBodyAt`.

`focusOn` selects as `select` does, and moves the focus. `activate` refuses a ship that isn't coasting.

### `render/mapFrame.ts` and `render/occlusion.ts`

```ts
/** The body trajectories are drawn relative to at time t (S5b-1, S5b-3). A followed ship that
 *  was destroyed resolves to the body it hit (shipBodyAt). */
export function resolveFrameBody(world: World, frame: FrameRef, t: number): BodyId;

/** Whether a screen point at a depth is behind a nearer drawn disc (moved from labelLayout). */
export function occludedAt(frame: MapFrame, x: number, y: number, depth: number, self?: number): boolean;
```

`frameBodyOf` stays for the camera: what a focused ship is framed around.

### `render/encounterGhosts.ts`

```ts
export interface EncounterGhost {
  shipId: ShipId;
  bodyId: BodyId;     // the body entered
  t: number;          // the entry time
  world: Vec3;        // frameBodyWorld(viewTime) + (body(t) − frameBody(t)), km
  soiRadius: number;  // km
}
/** Ghosts for the given ships' SOI entries after `from` (S5b-13). */
export function encounterGhosts(world: World, shipIds: readonly ShipId[], frameBodyId: BodyId,
                                viewTime: number): EncounterGhost[];
```

### `render/camera/` (changes)

```ts
/** Distance to frame a ship (S5b-12): the bounding sphere of its path from t to its first
 *  segment end or one revolution, at least 3 × the parent's radius, at most the parent's framing. */
export function pathFramingDistance(world: World, shipId: ShipId, t: number): number;
/** Whether a ref's centre projects inside the map viewport, in front of the camera (S5b-5). */
export function onScreen(frame: MapFrame, ref: FocusRef): boolean;
```

On a new `focusSeq`:
- **on screen:** `beginRefocus` with the current distance, clamped to `[minDistanceOf, MAX_DISTANCE]`, and the yaw, pitch and pole unchanged;
- **off screen:** as before, with `framingDistanceOf`, which uses `pathFramingDistance` for ships.

On a new world, the camera starts at Earth's framing, snapped to the ecliptic, with the pitch at 90° from the first frame and no easing (S5b-10).

### `orbital/passages.ts` (additions)

```ts
export const CIRCULAR_E = 1e-4;
/** Whether an orbit has the apsis (S5b-20): e ≥ CIRCULAR_E, and a closed orbit for Ap. */
export function hasApsides(e: number, kind: 'periapsis' | 'apoapsis'): boolean;
```

### `ui/` (pure modules)

```ts
// format.ts
/** Plan Δv (S5b-18): `3,131.0 m/s`, `0.4 m/s`, `−12.0 m/s`. */
export function formatDv(kmps: number): string;

// map/frameOptions.ts
/** Frame ▾ (S5b-4): the focus body (a focused ship's parent) and its parents to the root,
 *  then the selected body (a selected ship's or node's parent), if not already listed. */
export function frameOptions(world: World, focus: FocusRef, selected: MapObjectRef | null,
                             t: number): BodyId[];

// timeline/scale.ts
export const STRIP_T0 = 600;                          // 10 min (S5b-23)
export const STRIP_SPAN = 10 * SECONDS_PER_JULIAN_YEAR;
// stripSpan, SPAN_MIN and SPAN_DEFAULT are removed; StripScale keeps its shape with span fixed.
```

### Debug handle (`window.__spaceGame`)

These are added:
- `frame()`: the `FrameRef` and the resolved body;
- `encounterGhosts()`: each ghost's body, `t`, world and screen position;
- `flash()`;
- `fly()`: the Fly button's label and state.

`gizmo()` gains `visible` and `conicPx`. `labels()` gains each label's `parts`, the names in a merged label. `trajectoryMarkers()` gains `dimmed`.

## 7. Tests

### Unit tests

- **`passages.test.ts`:** `hasApsides` at e = 0, 0.99e-4, 1e-4 and 0.5, and with a hyperbola for Ap. The case that refused an apoapsis on a circular orbit, reproduced first as a failing test.
- **`useView.test.ts`:**
  - selecting a ship or a node leaves `activeShipId` unchanged;
  - selecting a body, a non-active ship or the active ship sets the frame by the S5b-2 and S5b-3 rules;
  - `activate` sets the following frame;
  - `setFrame` stops following;
  - Esc's `select(null)` leaves the frame alone.
- **`mapFrame.test.ts`:** `resolveFrameBody` for a followed ship before and after its Moon SOI entry, at now and at a preview time, and after an impact.
- **`framing.test.ts`:**
  - `pathFramingDistance` for a 200 km Earth orbit: the whole orbit fits, and the distance is at least 3 × Earth's radius;
  - for a TLI, the distance reaches past the Moon's distance and is capped by Earth's framing.
- **`cameraStage.test.ts`:**
  - refocusing an on-screen object keeps the distance, yaw, pitch and pole;
  - an off-screen object gets its framing distance;
  - the clamp to the minimum distance;
  - the start view.
- **`occlusion.test.ts`, `trajectoryMarkers` and the overlay:** a marker behind Earth's disc is dimmed and has no text; one in front is unchanged.
- **`nodeGizmoMath.test.ts`:** `conicScreenSize` for an ellipse and an open conic; the gizmo hidden under 150 px.
- **`labelLayout.test.ts`:**
  - a ship whose label overlaps its parent's merges: "Earth · Kestrel, Tern +2", in the S5b-16 order;
  - each part has its own pick rectangle;
  - a flashing ship's label is placed even when the ship is merged.
- **`encounterGhosts.test.ts`:**
  - for the S4-19 TLI, one Moon ghost at the entry time, whose world position matches the Moon's at that time in the frame (1e-9 relative);
  - none during a preview after the entry.
- **`format.test.ts`:** `formatDv` values, signs and the thousands separator.
- **`frameOptions.test.ts`:** focus on a Moon-orbiting ship with Mars selected gives Moon, Earth, Sun, Mars; duplicates aren't repeated.
- **`scale.test.ts`:**
  - fixed tick positions for any `now`;
  - 1 h, 1 d, 1 mo and 1 yr at 15%, 38%, 64% and 83% (±0.5%);
  - `dtOf` inverts `xOf`.

### Component tests (jsdom)

- **`Popover.test.tsx`:**
  - closes on a click outside, on Esc and after an item is chosen;
  - Esc is consumed, so a keydown listener on the window doesn't see it.
- **`FlyButton.test.tsx`:** the three states of S5b-7; A and the button activate the selected ship.
- **`FrameMenu.test.tsx`:** the options; choosing one calls `setFrame`; a following frame reads "Moon (Kestrel)".
- **`PlanSection` / `ShipInspector` / `NodeEditor` tests:**
  - a selected node expands its row in the ship inspector, with the totals still shown;
  - a non-active ship's plan is read-only, with every editing control disabled;
  - "At next Pe/Ap" are disabled with "Circular orbit" for e = 0.
- **`QuantityField.test.tsx`:** the label is above the input.
- **`AppShell.test.tsx`:** no ≡, ⚠, ⏰, Stations, Routes or Filters.
- **`TimelineStrip.test.tsx`:** the shaded region starts at the horizon's x.

### `test/smoke/usability.mjs` (`npm run smoke`)

The other smoke files run first, with the updates in §5.

1. **Start view:** nothing selected; the camera is focused on Earth at its framing, with pitch 90° about the ecliptic pole. The chrome of S5b-22 is absent.
2. **Spawn:** spawn "LEO (lunar plane)".
   - It is selected, `activeShip()` is null, and Fly reads "Fly Starship 4 (A)".
   - `flash()` is set, and the label shows as "Earth · Starship 4".
   - The camera's distance is unchanged.
3. **Activate:** press A. `activeShip()` is the ship, Fly shows ★, and `frame()` follows it with Earth.
4. **Focus on screen:** press F. The origin moves to the ship, and the distance, yaw and pitch are unchanged.
5. **Circular:** Add node ▾ shows "At next Ap" disabled with "Circular orbit", and there are no Pe/Ap markers. The popover closes on Esc, and the ship stays selected.
6. **Plan:** type the S4-19 TLI node through "At time T…" and its fields.
   - The node's row is expanded inside the ship inspector, and "Δv left after plan" is visible.
   - The Prograde field reads "3,130.5 m/s", and the Time input shows its whole value (`scrollWidth ≤ clientWidth`).
7. **Encounter:** `encounterGhosts()` has one Moon ghost at the SOI-entry time, labelled "Moon at entry", at the Moon's predicted position (1e-6 relative).
8. **Gizmo:** zoom out until the conic is under 150 px: `gizmo().visible` is false. Zoom back in: it is true.
9. **Frame:** select the Moon in the System tab. `frame()` is the Moon (fixed). Frame ▾ lists Earth, Sun and Moon. Choose Earth: `frame()` is Earth.
10. **Read-only:** select Kestrel. `activeShip()` is unchanged, Kestrel's Add node ▾ is disabled, and the read-only line shows.
11. **Strip:** record the tick positions, then add a node and warp to the next event. The ticks haven't moved, and the shading starts at the horizon glyph.
12. **Follow:** activate the TLI ship and warp to the Moon SOI entry. `frame()` now resolves to the Moon.
13. No console errors, warnings or failed requests. Screenshots go to `test/smoke/out/`: the start view, the merged label, the inline node editor, the encounter ghost, and the strip.

### Lint rules

Added to `test/lint/layers.test.ts`:

| File path given     | Code                                                       | Expected                       |
| ------------------- | ---------------------------------------------------------- | ------------------------------ |
| `src/render/ok.ts`  | `import { hasApsides } from '../orbital/passages'`          | no errors                      |
| `src/game/ok.ts`    | `import { hasApsides } from '../orbital/passages'`          | no errors                      |
| `src/render/bad.ts` | `import { formatDv } from '../ui/format'`                   | layer error (render → ui)      |
| `src/game/bad.ts`   | `import { useView } from '../store/useView'`                | layer error (game → store)     |

The reference frame and the active ship are view state. They must not reach `sim/` or `game/`, which the last case checks. The ship's target (S5b-9) is the exception: it will be sim state.

## 8. Acceptance criteria

Sprint 5b is done when all of these hold:

1. **Checks:** `npm test`, `npm run lint`, `npm run build`, `npm run format:check` and `npm run smoke` pass, with no lint warnings and no console errors or warnings in the smoke run. The earlier smoke files change only as §5 allows.
2. **Pointers:** selection, focus, reference frame and active ship are separate (§4.1). Selecting never activates a ship. A and Fly do. The frame follows the active ship only. Frame ▾ lists the right bodies.
3. **Focus:** focusing an on-screen object moves only the centre. An off-screen ship is framed to its path.
4. **Orientation:** the app starts looking down on the Earth–Moon system, and a spawned ship flashes, with its label shown.
5. **Map legibility:**
   - overlays behind bodies are dimmed, with no text;
   - the gizmo hides below 150 px;
   - a ship's label merges with its parent's;
   - the body entered is drawn where it will be at the entry.
6. **Plan editing:** the node editor sits inside the ship inspector's Plan list; plan Δv is in m/s everywhere; the Time field shows its whole value; a circular orbit has no Pe/Ap on the map or in the menus; popovers close on a click outside and on Esc.
7. **Strip:** a fixed 10-year scale with T0 = 10 min, ticks that never move, and shading past the prediction.
8. **Chrome:** no placeholders for missing features.
9. **The F17 bug:** its cause is found, covered by a test, and fixed.
10. **Docs:** decisions S5b-1 to S5b-24, and the implementation choices, are logged in decisions.md. interface.md, architecture.md, the guide, milestone-1-sprints.md and CLAUDE.md are updated (§4.3, §5).

## 9. Steps (suggested order of work)

1. **Pointer model in the store:**
   - `FrameRef`, `frame`, `activate`, `setFrame`, `flash`, with `select` no longer activating;
   - `resolveFrameBody`, and the renderer and input using the frame instead of the focus for trajectories;
   - the earlier smoke files updated to press A.

   Everything else still behaves as before, so the sprint 5 checks must pass here.
2. **`Popover`**, then the map toolbar's **Fly** and **Frame ▾**, the A key, and Pause on ▾ moved to `Popover`.
3. **Camera:** on-screen refocus (S5b-5), `pathFramingDistance` (S5b-12), and the start view (S5b-10).
4. **Inspector:**
   - `formatDv` and the `QuantityField` layout (S5b-18, S5b-19);
   - the inline node editor (S5b-17);
   - read-only plans (S5b-8).
5. **Circular orbits:** reproduce the F17 refusal in a test, find its cause, then `hasApsides` in the markers, the menu and the actions (S5b-20).
6. **Map overlays:**
   - `occlusion.ts` and the dimmed markers (S5b-14);
   - the gizmo threshold (S5b-15);
   - merged labels and the spawn flash (S5b-11, S5b-16);
   - encounter ghosts (S5b-13).
7. **Strip:** the fixed scale and the shading (S5b-23, S5b-24).
8. **Chrome:** hide the placeholders (S5b-22).
9. **Wrap-up:** the debug probes, `usability.mjs` added to the `smoke` script, the lint cases, the docs, and a walkthrough like §2's with fresh screenshots, to confirm each finding in scope.

If open question 2 is settled before step 3 (F on the already-focused object reframes it), it goes into step 3.

## 10. Questions settled before the sprint

1. **Scope:** the high-severity findings, the cheap mediums, part of F5, the placeholder chrome, and strip rescaling (§3).
2. **Pointers:** the frame is separate from the focus. Ships are activated only with A or Fly. Selection sets the frame. The frame follows the active ship only. Frame ▾ lists the focus body, its parents and the selected body. Spawning never activates. A ship's target is a separate pointer, for sprint 7 (§4.1).
3. **Each finding:** chosen from options, one decision each (§4.2).
4. **Strip:** a fixed 10-year span, so the ticks stay in place, with T0 = 10 min and shading past the prediction.

## Open questions

1. **Does editing a plan need the ship to be active?** For now, a non-active ship is read-only (S5b-8). The question is whether maneuver editing, and the other ship controls that later sprints add (targets, planning tools, docking actions), should all need activation, or whether the inspector should edit any ship and only the map tools need it.
2. **Getting the framed view back.** With S5b-5, focusing something on screen no longer zooms to frame it. Should F on the object that is already focused reframe it (decision 81's framing distance)?
3. **The start view.** S5b-10 starts on the Earth–Moon system, looking down on the ecliptic, as a stopgap for the sandbox. Later scenarios may start focused on the mothership (the generation ship). What should the start view be once scenarios exist, and should it depend on the scenario?

## Implementation notes

Choices made while building, beyond the decisions above. They are logged in [decisions.md](../docs/decisions.md) as decisions 153–180; S5b-1 to S5b-24 are decisions 153–176.

1. **The F17 cause.** `trajectoryMarkers` placed Pe and Ap on every conic: `conicGeometry` falls back to r₀ as the periapsis direction below e = 1e-10, so a circular orbit got an "Ap" opposite the ship. The passage search refused below `elements.ts`'s `CIRCULAR_E` (1e-11). Both now use `hasApsides`. The new threshold is named `APSIDES_MIN_E` rather than `CIRCULAR_E`, which `elements.ts` already exports with another meaning (the convention for ω and ν).
2. **"Circular orbit" refusals.** `game/actions.ts` gained `addApsisRefusal` (the path is circular where "Add node ▾" searches from, and no passage is found) and `snapRefusal` (the segment the node sits on is circular, read from the current trajectory so the inspector needn't recompute the path without the node). The actions use them too, so the menu and the actions agree.
3. **Path framing** is the distance at which the path's farthest point from the ship, × 1.1, fills half the view's height (`FOV_DEG` moved to `framing.ts`). A LEO ship is framed at about 31,000 km; a ship just after a TLI out past the Moon.
4. **On screen** means in the last frame drawn. The refocus clamps the kept distance to the new focus's minimum. Because focusing an on-screen ship keeps the distance, the earlier smoke tests that framed a ship by focusing it now zoom by wheel (`map.mjs` zooms in before double-clicking Jupiter, `maneuvers.mjs` zooms in on the low orbit and picks a path point clear of Earth's disc).
5. **The gizmo size** uses the larger projected axis of an ellipse (decision 177). While it is hidden, the selected node can't be dragged either, so the tooltip "Zoom in to drag the node" holds. **Revised after testing (decision 181):** S5b-15 made the gizmo hard to use, so its size now follows the planned path after the node rather than the conic before it, it shrinks from 60 px to 20 px arms between 150 px and 37.5 px across, and it hides only below 37.5 px.
6. **Merged labels** are laid out from the existing spans: the parent's, then each ship's, with the separators as CSS `::before` in the gap between them (`MERGE_GAP_PX`), so the measured widths stay valid; "+N" is a pooled span. A flashing ship is kept from merging into its parent on screen (decision 178), so with the spawned ship selected the merge comes from its label overlapping Earth's.
7. **Encounter ghosts** are computed once per frame by `EncounterGhostLayer` into `frame.encounters`, which the marker overlay reads for the ○ markers and their texts; those are placed first, so "Moon at entry" wins over "Moon SOI" (decision 179).
8. **Read-only** is enforced in the UI, including the Delete key, which now only deletes the active ship's node. The actions don't check activation (S5b-8).
9. **Popover Esc** is caught on the window in the capture phase and stops propagation, so neither `useMapKeys` nor the field's own Escape sees it.
10. **The smoke test.** `usability.mjs` follows §7's thirteen checks. For the strip's shading it adds a retrograde node before the TLI, so the prediction ends at an impact within 10 years, then deletes it. For the frame following the ship it runs the clock through the TLI node, then warps to the Moon SOI entry. Its TLI constant is checked by `constants.test.ts` with the others.

