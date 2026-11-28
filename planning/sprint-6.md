# Sprint 6 — Fleets, the active ship and alarms: detailed plan

This expands [sprint 6](milestone-1-sprints.md#sprint-6--fleets-the-active-ship-and-alarms) of milestone 1. Module paths follow the source layout in [architecture.md](../docs/architecture.md#layered-structure), and the rendering follows its [rendering conventions](../docs/architecture.md#units-precision-and-rendering-scale). It builds on the pointer model of [sprint 5b](sprint-5b.md#41-the-pointer-model): selection, focus, the reference frame and the active ship are separate, and only A or Fly activates a ship.

**Goal:** manage several ships, and let alarms run the clock. By the end of the sprint, the Fleets tab groups ships into named fleets that the player creates, renames, deletes and drags ships between, with an "Unassigned" group. Each ship row shows its SOI, a countdown to its next event, its Δv and status icons, and the list can be filtered to idle ships or ships in trouble. The active ship can be cycled with `[` `]`, `{` `}` and `I`. The ship inspector is complete for milestone 1, and a fleet can be selected and inspected. The timeline's **Show ▾** picks whose events the strip shows. Alarms (`sim/alarms.ts`) are sim state: set on a node, an event type or a time, for a ship, a fleet or everything, with a lead time, pausing or dropping warp. They are scheduled on the event queue from the ships' predictions, so they fire exactly, follow replanning, and cover ships added to a fleet later. A fired alarm leaves a notification with "Go to". Alarms are set from right-click context menus (strip events, trajectory markers, nodes, ships and fleets) and listed in a ⏰ popover. A default impact alarm pauses an hour before any predicted impact. The Filters panel toggles map layers and body and ship categories, and its search box narrows both the lists and the map.

**Out of scope:** snooze (deferred at the user's request); station-scoped alarms and the storm, stockpile, dose and route alerts (their systems don't exist yet); the "docked", "on route" and "thrusting" status filters (sprints 9 and milestone 3; hidden until then, as S5b-22 did for placeholder chrome); multi-selection of ships (the user's choice: a fleet is selected through its header instead); setting a target (sprint 7); the inspector at the preview time (sprint 7); minor-body, station and composition filters (sprint 8 and milestone 2); saving fleets and alarms (sprint 10, but they are world state from the start, so saves get them for free); ship renaming and deletion.

## Decisions made for this sprint

### Fleets and ship status

| #     | Topic                  | Decision |
| ----- | ---------------------- | -------- |
| S6-1  | Fleets are sim state   | **`world.fleets: Record<FleetId, Fleet>`** with `Fleet { id: 'fleet-<n>'; seq; name }`, and **`Ship.fleetId: FleetId \| null`** (null = Unassigned). Fleets live in the world, not in `useView`, because alarms resolve fleet scope inside `sim/` (S6-12) and fleets must be saved. Fleets are listed in `seq` (creation) order, ships within a fleet in ship `seq` order, and Unassigned last. There is no manual reordering. |
| S6-2  | Fleet rules            | `game/actions.ts` gains `createFleet(name?)` (default "Fleet <n>"), `renameFleet`, `deleteFleet` and `assignShip(shipId, fleetId \| null)`. A name is trimmed, 1–40 characters, and unique among fleets ignoring case ("A fleet named Haulers already exists"). Deleting a fleet moves its ships to Unassigned and **deletes its fleet-scoped alarms**; the UI confirms first when it has ships or alarms ("Delete Haulers? 3 ships move to Unassigned. 1 alarm is deleted."). A destroyed ship can still be moved (it is listed greyed in its fleet). |
| S6-3  | Ship status flags      | A pure **`shipStatus(world, shipId)`** (`sim/shipStatus.ts`) gives `{ idle, lowPropellant, impactPredicted, overBudget, alarmed, inTrouble, next }`. **Idle**: coasting with no enabled, reached node ahead. **Low propellant**: under 10% of tank capacity (`LOW_PROPELLANT_FRACTION`). **Impact predicted**: the trajectory ends in `'impact'`. **Over budget**: some planned node gets less Δv than it asks for. **In trouble** = low propellant or impact predicted or over budget, coasting only. **Alarmed**: an enabled alarm with ship or fleet scope covers it, or a plan-item alarm is on one of its nodes (global alarms don't count, or every ship would show ⏰ for the default impact alarm). **`next`**: its next enabled upcoming event (from `upcomingEvents`), for the row's countdown. |
| S6-4  | Fleets tab             | `ui/fleet/FleetsTab.tsx` replaces `ui/panels/FleetList.tsx`. From the top: **Spawn ship…** (the form gains a **Fleet** select, defaulting to the selected fleet, or to the selected ship's fleet, else Unassigned), **+ New fleet**, the **status filter** (All · Idle · In trouble, as a segmented control), then one **group** per fleet and Unassigned. A group header shows ▾/▸ (collapse, view state), the name, the ship count and ⏰ if a fleet alarm is set. Unassigned is hidden when empty and nothing is being dragged. With a status filter on, empty groups are hidden. |
| S6-5  | Ship rows              | Each row: ★ if active, the colour swatch, the name, the engine type ("chemical"), the **SOI** ("Earth"), the **next-event countdown** ("Moon SOI in 3 d 4 h", "Node in 2 h 10 min", nothing when idle), the **Δv** (`formatSpeed`, the ship's current Δv), and **status icons**: ⏰ alarmed, ⛽ low propellant, ✕ impact predicted, ⚠ over budget, each with a tooltip. The countdown follows `useSimTime`. Destroyed ships stay greyed ("impacted Moon"), with no icons. Click selects, double-click or Enter focuses, Up/Down move through visible rows across groups (as now). |
| S6-6  | Dragging ships         | Rows are HTML5 `draggable`; a group header (Unassigned included) is a drop target, highlighted while a ship is dragged over it. Dropping calls `assignShip`. Keyboard and non-drag routes: the row's context menu **Move to ▸** (S6-19) and the inspector's **Fleet** select (S6-9). |
| S6-7  | Selecting a fleet      | Selection widens from `MapObjectRef` to **`SelectionRef = MapObjectRef \| { kind: 'fleet'; id: FleetId }`**. Clicking a fleet header selects the fleet; its inspector is `FleetInspector` (S6-10). A fleet isn't on the map: it can't be focused, hovered on the map or flown, so `focusRefOf`, `shipOf`, F, A, P and the Frame ▾ lookups treat it as "nothing". Selecting a fleet also sets **Show ▾ to that fleet** (S6-22), as interface.md says; nothing becomes active. Deleting the selected fleet clears the selection. |

### The active ship and the inspector

| #     | Topic                  | Decision |
| ----- | ---------------------- | -------- |
| S6-8  | Cycling the active ship | The user's choice of keys: **`]` / `[`** next / previous ship, **`}` / `{`** (Shift) next / previous in the active ship's fleet (or in Unassigned), **`I`** next idle ship. The order is the Fleets tab's (fleets by seq, Unassigned last, ships by seq), over **coasting** ships only, wrapping; the status filter doesn't change it. With no active ship, `]` and `I` start at the first ship and `[` at the last. Cycling **activates, selects and focuses** the ship (`activate`, then `focusOn`, so the frame follows it, decision 183). `I` with no idle ship shows nothing and does nothing. The pure order lives in `ui/fleet/cycle.ts`. |
| S6-9  | The full ship inspector | The milestone 1 ship inspector, top to bottom: the **header** (name, design, status, **Fly / ★** as the toolbar's Fly button, Focus); **Fleet** (a select of the fleets and Unassigned, calling `assignShip`); **Plan** (as built, read-only unless active, decision 160); **Alarms** (S6-21); **Modules** (the backbone, then each module × count with its mass, then mass used / backbone limit and volume used / limit as bars); **Mass and propellant**; **Engines** (each engine's kind, count, thrust, Isp); **Orbit**; **Upcoming events** (each with ⏰ if an alarm will fire for it, and the event context menu on right-click). Alarms and fleet membership don't need the ship to be active: activation gates **plan editing** only (it settles part of open question 10: the non-maneuver controls added so far work on any ship). |
| S6-10 | Fleet inspector        | Name (an inline rename field; Enter or blur applies, Esc reverts), the ship count with a compact list of its ships (click selects, double-click focuses), the fleet's **Alarms** with **Add alarm…**, **Show on timeline** (sets Show ▾), and **Delete fleet…** (S6-2's confirmation). |
| S6-11 | Other ships' plans     | Unchanged from sprint 5b: other ships' nodes are small markers, clicking one selects it, read-only (decision 160). This sprint adds only the **Nodes** layer toggle (S6-25) and the node context menu (S6-19). |

### Alarms

| #     | Topic                  | Decision |
| ----- | ---------------------- | -------- |
| S6-12 | The alarm model        | **`world.alarms: Record<AlarmId, Alarm>`** (`alarm-<n>`), plain data, saved with the world. `Alarm { id; seq; scope; trigger; leadTime; action; enabled; fired; isDefault? }`. **Scope**: `{ kind: 'ship', shipId } \| { kind: 'fleet', fleetId } \| { kind: 'global' }` (station scope arrives with stations). **Trigger**: `{ kind: 'plan-item', itemId: NodeId }` (ship scope only), `{ kind: 'event-type', type: AlarmEventType, targetId?: BodyId, once?: boolean }`, or `{ kind: 'time', t }` (global scope only). **`leadTime`**: seconds before the event, 0 to 10 years. **`action`**: `'pause' \| 'drop-warp'`. **`fired: Record<ShipId, number>`**: per ship, the time of the last occurrence it fired for, so a repeating alarm never fires twice for one occurrence. |
| S6-13 | Event types            | **`AlarmEventType = 'node' \| 'soi-change' \| 'soi-enter' \| 'soi-exit' \| 'impact'`**, matched against `upcomingEvents`: `'soi-change'` matches entries and exits. The optional **target** is matched against the body entered (`soi-enter`), the body left (`soi-exit`; its `parentId`), either (`soi-change`), or the body hit (`impact`); a node has no target. Only **enabled, reached** nodes match, since only they execute. This revises architecture.md's `type: SimEventType`: sim event types are about the queue (`'trajectory-horizon'` is one), not about what the player cares for. |
| S6-14 | Scheduling             | Alarms are fired by the event queue, not checked each frame. For each enabled alarm and each **coasting ship in its scope** (resolved now: the fleet's current members, or every ship for global), the **next occurrence** is the first matching upcoming event with `t > fired[shipId]`; its **fire time** is `max(t − leadTime, now)`, so an event already inside its lead fires at once. One **`alarm` sim event** per (alarm, ship) is queued at the fire time: `{ type: 'alarm'; alarmId; shipId; occurrence }`. A time alarm queues one event with `shipId: null`. Schedules are rebuilt by removal and re-queueing, never patched, so no alarm event is ever stale: **`scheduleShipAlarms(world, shipId)`** runs when the ship's trajectory version changes (`refreshShipDerived`) and when it changes fleet; **`scheduleAlarm(world, alarmId)`** when an alarm is added, edited, enabled or deleted, and after it fires; `rebuildDerived` schedules everything. `queueShipEvent` now removes only the ship's own event, not its alarm events. |
| S6-15 | Alarms before the event | An alarm with lead 0 is due at the same time as the event it is for. It must run **first**: if the node executed first, its plan-item alarm would be removed with the node unfired. `math/pqueue.ts` gains an optional **rank** tie-breaker, comparing `(key, rank, seq)`; alarm events have rank −1, ship events 0. So a lead-0 pausing alarm pauses with `t` at the node's time and the node not yet executed; resuming executes it (and Pause on node, if ticked, then pauses again at the same `t`). |
| S6-16 | Firing                 | `registerAlarmHandlers(reg)` (`sim/alarms.ts`), added by the store next to the ship handlers. The `alarm` handler: records `fired[shipId] = occurrence`, appends a **notification** (S6-17), and then: **pause** asks `advanceWorld` to pause (as Pause on does, cancelling a warp-to); **drop-warp** (the user's choice) sets the warp step to **×1** and cancels a warp-to, with the clock still running, so a 10-minute lead plays out in 10 minutes of wall time. To keep the rest of the frame from running on at the old rate, `EventOutcome` gains **`stop: true`**: `advanceWorld` ends the frame at that event's time without pausing. A **once** alarm, a **time** alarm and a **plan-item** alarm are deleted after firing; a repeating event-type alarm is re-scheduled for its next occurrence. |
| S6-17 | Notifications          | **`world.notifications: AlarmNotification[]`**, newest last, capped at 50 (the oldest dismissed ones go first). `{ id; alarmId; shipId \| null; t (fired at); eventT; text; action; dismissed }`. The **text is built when it fires** (`alarmNotificationText`, in `sim/alarms.ts` beside `eventLabel`), so it reads the same after the ship or plan changes: "Kestrel: Moon SOI entry in 10 min", "Kestrel: Node now", "Haulers · Tern: Earth SOI exit in 1 h", "Alarm: 2030-03-01 00:00". `dismissNotification(id)` and `dismissAllNotifications()` are actions. They are in the world because the sim produces them, and saving them is harmless. |
| S6-18 | Cleanup                | `game/actions.deleteNode` and the node handler (after execution) delete plan-item alarms on that node; a ship's destruction deletes its ship-scoped and plan-item alarms; `deleteFleet` deletes its fleet alarms. A plan-item alarm on a node that is **disabled** or **not reached** stays, but has no occurrence until the node is enabled or reached again. Editing a node's time or Δv keeps its alarm, which is re-scheduled with the trajectory (the "done when"). |
| S6-19 | Context menus          | The user's choice: **right-click** opens a context menu (`ui/layout/ContextMenu.tsx`, on `Popover`'s behaviour: Esc and a click outside close it, at the pointer). Left-click keeps its sprint 5 meaning everywhere (a strip glyph still starts a sticky preview). Menus: **strip event** and **trajectory marker** (SOI change, impact, node): *Set alarm ▸* (At the event · 1 min before · 10 min before · 1 h before · Custom…), *Preview*, *Warp to*; a **node** (strip, map glyph, Plan row) adds *Warp to node*; a **ship** (row, map marker, label): *Fly (A)*, *Focus (F)*, *Add alarm…*, *Move to ▸*; a **fleet header**: *Add alarm…*, *Rename*, *Show on timeline*, *Delete…*; a **body**: *Focus (F)*. On the map, the pointer input picks under the cursor (`pick`, then trajectory markers within 8 px, `pickTrajectoryMarker`) and puts `{ x, y, target }` in **`useView.contextMenu`**; the DOM lists set it directly. The browser's own menu is suppressed only over those targets. |
| S6-20 | Setting from an event  | As architecture.md says: *Set alarm* on a **node** creates a ship-scoped `plan-item` alarm; on any **other event**, a ship-scoped `event-type` alarm of its kind, narrowed to its target, with `once: true` ("next SOI entry into the Moon"). Action **pause**. `game/actions.setAlarmForEvent(world, event, leadTime)` builds it from an `UpcomingEvent`; it refuses an event whose time has passed. |
| S6-21 | The alarm form         | **Add alarm…** (ship or fleet) and **Custom…** open `ui/alarms/AlarmForm.tsx` in a popover: **When** (Node · SOI change · SOI entry · SOI exit · Impact · At time; plan-item when opened from a node), **Body** (any major body, or "Any"; for SOI and impact types), **Only the next one** (once), **Lead time** (a duration `QuantityField`: `10 min`, `1h 30m`), **Then** (Pause · Drop to ×1). The scope is fixed by where it was opened. Errors from `addAlarm` / `editAlarm` show inline. The ship and fleet inspectors' **Alarms** sections list the alarms covering them (own and, for a ship, its fleet's, marked "fleet"), each with its next fire countdown, an enabled checkbox, Edit and Delete. |
| S6-22 | Alarm list             | The top bar's **⏰ n** (hidden since S5b-22) returns, counting enabled alarms; it opens `ui/alarms/AlarmList.tsx` in a popover: every alarm with scope, trigger, lead, action and next fire ("in 3 d 4 h", or "no occurrence"), an enabled checkbox, Edit (the form) and Delete. Default alarms are marked "default" and can be disabled or deleted like any other. |
| S6-23 | Default impact alarm   | The user's choice: an ordinary alarm. `gen/scenario.ts` adds it to the sandbox world: **global, event-type `impact`, lead 1 h, pause**, `isDefault: true`. It covers every ship, including ships spawned later, and fires at most once per predicted impact (`fired`). |
| S6-24 | Notifications on screen | `ui/alarms/Notifications.tsx`, at the map's top right below the toolbar: the undismissed notifications, newest first, at most 4 with "+n more": "⏰ Kestrel: Moon SOI entry in 10 min", with **Go to** (activates, selects and focuses the ship, as cycling does; absent for a time alarm or a destroyed ship) and **×**, plus **Dismiss all**. A new one is announced (`role="status"`). They stay until dismissed. The top bar's **⚠ n** (also back) counts ships in trouble; clicking it opens the Fleets tab with the In trouble filter. |

### The timeline and the Filters panel

| #     | Topic                  | Decision |
| ----- | ---------------------- | -------- |
| S6-25 | Show ▾                 | **`useView.show: { kind: 'active' } \| { kind: 'selection' } \| { kind: 'fleet'; id } \| { kind: 'all' }`**, default active. `ui/timeline/ShowMenu.tsx`, a popover at the strip's left: "Show: ★ Kestrel ▾", "Show: Selection (Tern) ▾", "Show: Haulers ▾", "Show: All ships ▾". **Selection** shows the selected ship (or node's ship), or the selected fleet's ships. `shownShips(world, view)` (in `store/`) resolves it to coasting ship IDs. The strip draws the glyphs of every shown ship in its colour (stacking as now), the shading starts after the **latest** horizon among them, and **⏭ next event** warps to the earliest stop among them (`nextWarpStop` takes a list). The strip also shows **⏰** above each scheduled alarm's fire time for the shown ships and for time alarms (`alarmSchedule(world)`), with the alarm in its tooltip. Deleting a shown fleet falls back to Active. |
| S6-26 | Map layers             | **`useView.filters.layers`**: **Orbits** (body orbit lines), **Trajectories** (All · Shown · Active ship · None; "Shown" = the ships Show ▾ shows, which covers the sprint list's "fleet" option: select a fleet's header or pick it in Show ▾), **Nodes** (other ships' node glyphs; the active ship's always show, since editing needs them), **Labels** (body and ship labels, except the focus, the selection and the hovered object), **SOI spheres** (off by default). With Trajectories on None, the active ship's path, its markers and the ghost node are hidden too; a selected node's gizmo still shows. Trajectory marker texts follow their trajectory. |
| S6-27 | SOI spheres            | `render/layers/SoiLayer.ts`: for each visible major non-root body, a thin camera-facing ring of its SOI radius at the body, in the body's colour at low alpha, faded by `orbitFade` like its orbit line and hidden when under 4 px across. The ring is the `EncounterGhostLayer` ring, shared (`render/ringObject.ts`). Not pickable. |
| S6-28 | Categories and search  | **`filters.categories`**: Planets, Dwarf planets, Moons, Ships, and one toggle per fleet plus Unassigned (shown under Ships). **`filters.search`**: case-insensitive substring of a body or ship name. The user's choice: search narrows **the lists and the map**. One pure rule, `visibleSet(world, filters, keep)` (`store/mapFilters.ts`), gives the visible bodies and ships: a body is visible if its class is on and (no search, or it or a descendant matches, or a ship in its SOI matches); a ship if Ships and its fleet are on and (no search, or it matches). **Always visible**: the star, the focus and its ancestors, the active ship, and the selection. On the map a hidden object has no mesh or marker, label, orbit line, SOI ring or trajectory, and can't be picked; its children can still be visible. The System tree shows visible bodies (with ancestors, expanded while a search is on), and the Fleets tab visible ships. Enter in the search box selects and focuses the first match. Filters are view state, not saved; the Filters panel (hidden since S5b-22) returns as a collapsible section at the bottom of the left sidebar, with a **Reset** link. |
| S6-29 | Debug handle           | `window.__spaceGame` gains `fleets()` (each fleet and Unassigned with its ship IDs), `shipStatus(id)`, `alarms()`, `alarmSchedule()` (alarm, ship, fire time, occurrence), `notifications()`, `show()` (the resolved ship IDs), `filters()`, `visible()` (the drawn body and ship IDs this frame), `soiRings()` and `contextMenu()` (target and items, or null). |

These are copied into [decisions.md](../docs/decisions.md) as decisions 184 onward, with the implementation choices made during the sprint.

## Files to create and change

```
src/
  math/
    (pqueue.ts extended)    pqueue.test.ts          optional rank tie-breaker (S6-15)
  sim/
    fleet.ts                fleet.test.ts           Fleet, create/rename/delete/assign, fleetShips, groupOrder (S6-1, S6-2)
    alarms.ts               alarms.test.ts          Alarm model, occurrences, scheduling, the handler,
                                                    notification texts, cleanup (S6-12 to S6-18)
    shipStatus.ts           shipStatus.test.ts      shipStatus flags (S6-3)
    (world.ts extended)     world.test.ts           fleets, alarms, notifications, nextFleetSeq, nextAlarmSeq;
                                                    the `stop` outcome in advanceWorld (S6-16)
    (events.ts extended)    events.test.ts          'alarm' SimEvent, rank, queueShipEvent keeps alarm events,
                                                    alarm scheduling on refresh, cleanup on node and impact
    (ship.ts extended)                              Ship.fleetId
    (upcoming.ts extended)  upcoming.test.ts        nextWarpStop over a list of ships
    alarmFlow.test.ts                               the "done when" scenarios on the test system
  game/
    (actions.ts extended)   fleetActions.test.ts    createFleet, renameFleet, deleteFleet, assignShip
                            alarmActions.test.ts    addAlarm, editAlarm, deleteAlarm, setAlarmForEvent,
                                                    dismissNotification(s); validation
    alarms.done.test.ts                             the "done when" on the real system (lunar flight)
  gen/
    (scenario.ts extended)  scenario.test.ts        the default impact alarm (S6-23)
  store/
    (useView.ts extended)   useView.test.ts         SelectionRef, show, filters, contextMenu, collapsed groups
    (useWorld.ts extended)                          the fleet, alarm and notification actions; alarm handlers
    mapFilters.ts           mapFilters.test.ts      MapFilters, defaults, matchesSearch, visibleSet (S6-26, S6-28)
    shown.ts                shown.test.ts           shownShips (S6-25)
  render/
    ringObject.ts                                   the shared camera-facing ring (S6-27)
    layers/SoiLayer.ts      soiLayer.test.ts        SOI rings: visibility, fade, min size (S6-27)
    (mapFrame.ts extended)  mapFrame.test.ts        frame.bodyVisible / shipVisible from visibleSet
    (picking.ts extended)   picking.test.ts         hidden objects not picked; pickTrajectoryMarker (S6-19)
    (layers/*, overlays/*)                          visibility, the layer toggles, trajectories filter (S6-26)
    (input/pointerInput.ts)                         contextmenu → useView.contextMenu (S6-19)
    (debugHandle.ts)                                S6-29
  ui/
    fleet/
      FleetsTab.tsx         FleetsTab.test.tsx      groups, rows, filter, drag and drop, new fleet (S6-4 to S6-6)
      FleetGroup.tsx                                a header and its rows
      ShipRow.tsx
      shipRows.ts           shipRows.test.ts        row texts, icons, group order, status filtering (pure)
      cycle.ts              cycle.test.ts           cycling order: next / previous / in fleet / idle (S6-8)
    alarms/
      AlarmForm.tsx         AlarmForm.test.tsx      fields, validation, add and edit (S6-21)
      AlarmList.tsx         AlarmList.test.tsx      the ⏰ popover (S6-22)
      AlarmsSection.tsx                             the inspectors' Alarms section (S6-21)
      Notifications.tsx     Notifications.test.tsx  stack, Go to, dismiss (S6-24)
      alarmText.ts          alarmText.test.ts       "SOI entry into Moon · 10 min before · pause" (pure)
    filters/
      FiltersPanel.tsx      FiltersPanel.test.tsx   layers, categories, search, reset (S6-26, S6-28)
    layout/
      ContextMenu.tsx       ContextMenu.test.tsx    placement, items, Esc / outside (S6-19)
      contextItems.ts       contextItems.test.ts    the items for each target kind (pure, S6-19)
    panels/
      FleetInspector.tsx    FleetInspector.test.tsx rename, ships, alarms, delete (S6-10)
      ModulesSection.tsx                            modules, mass and volume bars (S6-9)
    timeline/
      ShowMenu.tsx          ShowMenu.test.tsx       Show ▾ (S6-25)
test/smoke/
  fleets.mjs                                        fleets, cycling, alarms, notifications, Show ▾, filters
```

Also change:

- `sim/events.ts`: the `'alarm'` event (rank −1), `EventOutcome.stop`; `queueShipEvent` removes only `type !== 'alarm'` events of the ship; `refreshShipDerived` calls `scheduleShipAlarms` when the version changes; the node handler and the impact handler call the S6-18 cleanup.
- `sim/world.ts`: `World` gains `fleets`, `nextFleetSeq`, `alarms`, `nextAlarmSeq`, `notifications`; `createWorld` initialises them; `rebuildDerived` schedules all alarms; `advanceWorld` honours `stop`.
- `sim/ship.ts`: `createShip` sets `fleetId: null`.
- `game/actions.ts`: `spawnShip` takes an optional `fleetId`; `deleteNode` deletes the node's plan-item alarms; the fleet, alarm and notification actions; `warpToNextEvent` takes `ShipId[] | null`.
- `store/useView.ts`: `selected: SelectionRef | null`; `show`, `filters` (with `setLayer`, `setCategory`, `setSearch`, `resetFilters`), `contextMenu` (`openContextMenu`, `closeContextMenu`), `collapsedFleets`, `fleetsFilter` (`'all' | 'idle' | 'trouble'`); `select` of a fleet sets `show`; `focusRefOf` / `shipOf` accept a fleet and return null.
- `render/`: `MapRenderer` computes visibility on sync (store version, filters, focus, selection, active ship, show) into `MapFrame`; `BodyLayer`, `OrbitLayer`, `MarkerLayer`, `TrajectoryLayer`, `EncounterGhostLayer`, the label and trajectory-marker overlays and `pick` skip hidden objects and apply the layer toggles; `TrajectoryLayer` draws the trajectories filter's set; `EncounterGhostLayer` uses `ringObject.ts`; `SoiLayer` is added to `STAGES`' layers after the orbits.
- `ui/layout/LeftSidebar.tsx`: `FleetsTab`, and `FiltersPanel` at the bottom. `ui/layout/TopBar.tsx`: ⏰ and ⚠ buttons. `ui/layout/Inspector.tsx`: `FleetInspector`. `ui/layout/MapView.tsx`: `Notifications`, `ContextMenu`. `ui/layout/Timeline.tsx`: `ShowMenu`. `ui/timeline/TimelineStrip.tsx` and `stripLayout.ts`: several ships, ⏰ markers, right-click. `ui/timeline/WarpToButtons.tsx`: the shown ships. `ui/panels/ShipInspector.tsx`: S6-9's sections. `ui/panels/PlanSection.tsx`: ⏰ on node rows and the node context menu. `ui/panels/SpawnShipForm.tsx`: the Fleet select. `ui/panels/SystemTree.tsx`: visible bodies only, search expansion. `ui/useMapKeys.ts`: `[ ] { } I`, and F, A, P ignoring a fleet selection. `ui/map/FrameMenu.tsx`, `ui/map/flyState.ts`: a fleet selection is nothing.
- Remove `ui/panels/FleetList.tsx` (+ css, test), replaced by `ui/fleet/`.
- `package.json`: add `fleets.mjs` to the `smoke` script. Earlier smoke files change only where they read the Fleets list's markup (`[data-ship]` rows keep their attribute, so ideally not at all).
- `test/lint/layers.test.ts`: the new cases (see [Lint rules](#lint-rules)).
- Docs, at the end: [architecture.md](../docs/architecture.md) (source layout: `sim/fleet.ts`, `sim/alarms.ts`, `sim/shipStatus.ts`, `store/mapFilters.ts`, `store/shown.ts`, `ui/fleet/`, `ui/alarms/`, `ui/filters/`; Alarms: the final model, scheduling and ranks, `AlarmEventType`; Clock and event queue: the `alarm` event and `stop`; World: fleets, alarms, notifications); [interface.md](../docs/interface.md) (Fleet management: rows, filters, cycling keys; Alarms and alerts: context menus, the form, notifications, drop to ×1, no snooze yet; Map layers and Filters: the trajectories options, search hiding on the map; Timeline: Show ▾ and ⏰); [features.md](../docs/features.md) (Alarms: the default impact alarm's lead); [decisions.md](../docs/decisions.md): the S6 decisions, and open question 10 updated with S6-9; [guides/ui-and-render.md](../docs/guides/ui-and-render.md): visibility, context menus; [milestone-1-sprints.md](milestone-1-sprints.md): sprint 6's outcome; [CLAUDE.md](../CLAUDE.md): the current status.

## Interfaces and data models

Units as before: `km`, `s`, `kg`, `km/s`. Times are sim seconds from the epoch.

### `math/pqueue.ts` (change)

```ts
export interface PQEntry<T> { key: number; rank: number; seq: number; value: T }
/** Inserts with an optional rank: equal keys come out by (rank, seq). Default rank 0. */
export function push<T>(q: PQueue<T>, key: number, value: T, rank?: number): number;
```

### `sim/fleet.ts`

```ts
export type FleetId = string; // `fleet-<n>`
export interface Fleet { id: FleetId; seq: number; name: string }

export const FLEET_NAME_MAX = 40;
/** The trimmed name, or an error ("Name is empty", "A fleet named X already exists"). */
export function checkFleetName(world: World, name: string, exceptId?: FleetId): { ok: true; name: string } | { ok: false; error: string };
export function createFleet(world: World, name: string): FleetId;
export function renameFleet(world: World, id: FleetId, name: string): void;
/** Moves its ships to Unassigned and deletes its fleet alarms (S6-2). */
export function deleteFleet(world: World, id: FleetId): void;
/** Sets ship.fleetId and re-schedules the ship's alarms (S6-14). */
export function assignShip(world: World, shipId: ShipId, fleetId: FleetId | null): void;
/** Fleets in seq order, then null (Unassigned). */
export function groupOrder(world: World): (FleetId | null)[];
/** The fleet's ships (or Unassigned's) in seq order, destroyed included. */
export function fleetShips(world: World, fleetId: FleetId | null): ShipId[];
```

The `sim/` functions assume valid input; `game/actions.ts` validates and returns `ActionResult`, as for nodes.

### `sim/alarms.ts`

```ts
export type AlarmId = string; // `alarm-<n>`
export type AlarmScope = { kind: 'ship'; shipId: ShipId } | { kind: 'fleet'; fleetId: FleetId } | { kind: 'global' };
export type AlarmEventType = 'node' | 'soi-change' | 'soi-enter' | 'soi-exit' | 'impact';
export type AlarmTrigger =
  | { kind: 'plan-item'; itemId: NodeId } // ship scope only; ArcId in milestone 3
  | { kind: 'event-type'; type: AlarmEventType; targetId?: BodyId; once?: boolean }
  | { kind: 'time'; t: number }; // global scope only
export type AlarmAction = 'pause' | 'drop-warp';

export interface Alarm {
  id: AlarmId;
  seq: number;
  scope: AlarmScope;
  trigger: AlarmTrigger;
  leadTime: number; // s, ≥ 0
  action: AlarmAction;
  enabled: boolean;
  /** Per ship, the time of the last occurrence fired for (S6-12). */
  fired: Record<ShipId, number>;
  isDefault?: boolean;
}

export interface AlarmNotification {
  id: string; // `note-<n>`
  alarmId: AlarmId;
  shipId: ShipId | null;
  t: number; // fired at
  eventT: number; // the occurrence's time
  text: string; // built when fired (S6-17)
  action: AlarmAction;
  dismissed: boolean;
}

export const MAX_LEAD_TIME = 10 * 365.25 * 86_400;
export const MAX_NOTIFICATIONS = 50;
export const ALARM_RANK = -1;

/** Whether the alarm's scope covers the ship now (fleet resolved at call time). */
export function alarmCovers(world: World, alarm: Alarm, shipId: ShipId): boolean;
/** Whether an upcoming event matches an event-type or plan-item trigger (S6-13). */
export function triggerMatches(trigger: AlarmTrigger, e: UpcomingEvent): boolean;
/** The next occurrence for the ship after `fired[shipId]`, or null (S6-14). */
export function nextOccurrence(world: World, alarm: Alarm, shipId: ShipId): UpcomingEvent | null;
/** max(occurrence − leadTime, now). */
export function fireTime(world: World, alarm: Alarm, occurrence: number): number;
export function scheduleShipAlarms(world: World, shipId: ShipId): void;
export function scheduleAlarm(world: World, alarmId: AlarmId): void;
export function scheduleAllAlarms(world: World): void;
/** The queued alarm events: what fires when, for the strip, the lists and the debug handle. */
export interface ScheduledAlarm { alarmId: AlarmId; shipId: ShipId | null; fireT: number; occurrence: number }
export function alarmSchedule(world: World): ScheduledAlarm[];
export function addAlarm(world: World, a: Omit<Alarm, 'id' | 'seq' | 'fired'>): AlarmId;
export function updateAlarm(world: World, id: AlarmId, patch: Partial<Pick<Alarm, 'trigger' | 'leadTime' | 'action' | 'enabled'>>): void;
export function deleteAlarm(world: World, id: AlarmId): void;
/** S6-18: plan-item alarms on a node, a ship's alarms, a fleet's alarms. */
export function deleteNodeAlarms(world: World, shipId: ShipId, nodeId: NodeId): void;
export function deleteShipAlarms(world: World, shipId: ShipId): void;
export function deleteFleetAlarms(world: World, fleetId: FleetId): void;
/** "Kestrel: Moon SOI entry in 10 min" (S6-17). */
export function alarmNotificationText(world: World, alarm: Alarm, shipId: ShipId | null, occurrence: number): string;
export function registerAlarmHandlers(reg: EventRegistry): void;
```

### `sim/events.ts` and `sim/world.ts` (changes)

```ts
export type SimEvent =
  | /* …sprint 3–5 events */
  | { type: 'alarm'; alarmId: AlarmId; shipId: ShipId | null; occurrence: number };
export interface EventOutcome { pause?: boolean; stop?: boolean } // stop: end the frame here (S6-16)

// World additions
fleets: Record<FleetId, Fleet>;
nextFleetSeq: number;
alarms: Record<AlarmId, Alarm>;
nextAlarmSeq: number;
notifications: AlarmNotification[];
nextNotificationSeq: number;
```

`advanceWorld`: after dispatching an event whose outcome has `stop` (and not `pause`), it sets `clock.t` to that event's time and returns, handling nothing more that frame. Alarm events are `SimEvent`s like the rest, so `MAX_EVENTS_PER_FRAME` covers them.

### `sim/shipStatus.ts`

```ts
export const LOW_PROPELLANT_FRACTION = 0.1;
export interface ShipStatusFlags {
  idle: boolean;
  lowPropellant: boolean;
  impactPredicted: boolean;
  overBudget: boolean;
  /** A ship, fleet or plan-item alarm covers it; global alarms don't count (S6-3). */
  alarmed: boolean;
  inTrouble: boolean;
  /** Its next enabled upcoming event, for the countdown. */
  next: UpcomingEvent | null;
}
export function shipStatus(world: World, shipId: ShipId): ShipStatusFlags;
```

### `game/actions.ts` (additions)

```ts
export function createFleet(world: World, name?: string): ActionResult<FleetId>;
export function renameFleet(world: World, id: FleetId, name: string): ActionResult;
export function deleteFleet(world: World, id: FleetId): ActionResult;
export function assignShip(world: World, shipId: ShipId, fleetId: FleetId | null): ActionResult;

export interface AlarmParams {
  scope: AlarmScope;
  trigger: AlarmTrigger;
  leadTime: number;
  action: AlarmAction;
}
/** Validates (S6-12): scope exists; plan-item ⇒ ship scope and the node is in its plan;
 *  time ⇒ global and t > now; target is a major body; 0 ≤ lead ≤ MAX_LEAD_TIME. */
export function addAlarm(world: World, p: AlarmParams): ActionResult<AlarmId>;
export function editAlarm(world: World, id: AlarmId, p: Partial<AlarmParams> & { enabled?: boolean }): ActionResult;
export function deleteAlarm(world: World, id: AlarmId): ActionResult;
/** S6-20: plan-item for a node, else a once event-type alarm on the event's kind and target. */
export function setAlarmForEvent(world: World, e: UpcomingEvent, leadTime: number): ActionResult<AlarmId>;
export function dismissNotification(world: World, id: string): ActionResult;
export function dismissAllNotifications(world: World): ActionResult;
```

Every one goes through `useWorld`'s `act`, which bumps the version.

### `store/useView.ts` (changes)

```ts
export type SelectionRef = MapObjectRef | { kind: 'fleet'; id: FleetId };
export type ShowRef = { kind: 'active' } | { kind: 'selection' } | { kind: 'fleet'; id: FleetId } | { kind: 'all' };
export type ContextTarget =
  | MapObjectRef
  | { kind: 'fleet'; id: FleetId }
  | { kind: 'event'; event: UpcomingEvent }; // a strip glyph, an upcoming-events row, a trajectory marker
// ViewState additions / changes:
selected: SelectionRef | null;
show: ShowRef;
filters: MapFilters;
contextMenu: { x: number; y: number; target: ContextTarget } | null;
collapsedFleets: Record<string, boolean>; // FleetId, or 'unassigned'
fleetsFilter: 'all' | 'idle' | 'trouble';
setShow(s: ShowRef): void;
setLayer<K extends keyof MapLayers>(k: K, v: MapLayers[K]): void;
setCategory(k: string, on: boolean): void; // a class key, 'ships', a FleetId or 'unassigned'
setSearch(q: string): void;
resetFilters(): void;
openContextMenu(x: number, y: number, target: ContextTarget): void;
closeContextMenu(): void;
toggleFleetCollapsed(id: FleetId | 'unassigned'): void;
setFleetsFilter(f: 'all' | 'idle' | 'trouble'): void;
```

`select({ kind: 'fleet', id })` also sets `show` to that fleet (S6-7). `focusOn` and `activate` are unchanged and never take a fleet.

### `store/mapFilters.ts` and `store/shown.ts`

```ts
export interface MapLayers {
  orbits: boolean;
  trajectories: 'all' | 'shown' | 'active' | 'none';
  nodes: boolean;
  labels: boolean;
  soiSpheres: boolean;
}
export interface MapFilters {
  layers: MapLayers;
  /** Body classes ('planet', 'dwarf-planet', 'moon'), 'ships', FleetIds and 'unassigned'; absent = on. */
  hidden: Record<string, true>;
  search: string;
}
export const DEFAULT_FILTERS: MapFilters;
export function matchesSearch(name: string, q: string): boolean;
/** What is always kept visible (S6-28). */
export interface Keep { focus: FocusRef; selected: SelectionRef | null; activeShipId: ShipId | null }
export interface VisibleSet { bodies: Set<BodyId>; ships: Set<ShipId> }
export function visibleSet(world: World, f: MapFilters, keep: Keep): VisibleSet;

// shown.ts
export function shownShips(world: World, show: ShowRef, selected: SelectionRef | null, activeShipId: ShipId | null): ShipId[];
```

`store/` may import `sim/` but not `render/` or `ui/`, so both the renderer and the panels use these.

### `render/` (changes)

```ts
// mapFrame.ts
bodyVisible: Uint8Array; // per body index, from visibleSet on sync
shipVisible: Uint8Array; // per drawn ship index
// stages.ts: ViewSnapshot gains
layers: MapLayers;
trajectoryShips: ReadonlySet<ShipId> | 'all'; // the trajectories filter resolved (S6-26)

// picking.ts
export function pickTrajectoryMarker(frame: MapFrame, x: number, y: number, radiusPx?: number): TrajectoryMarker | null;

// layers/SoiLayer.ts
export class SoiLayer { constructor(scene: Scene, frame: MapFrame, system: BodySystem); update(frame: MapFrame, view: ViewSnapshot): void; dispose(): void }
```

Visibility is recomputed only when one of its inputs changes (store version, filters, focus, selection, active ship, show), never per frame, as for the ship arrays.

### `ui/` (pure modules)

```ts
// fleet/shipRows.ts
export interface ShipRowData {
  id: ShipId; name: string; color: string; engine: string; soi: string;
  next: string | null; // "Moon SOI in 3 d 4 h"
  dv: string; icons: { glyph: '⏰' | '⛽' | '✕' | '⚠'; title: string }[];
  destroyed: string | null; active: boolean;
}
export interface FleetGroupData { id: FleetId | null; name: string; count: number; alarmed: boolean; rows: ShipRowData[] }
export function fleetGroups(world: World, now: number, activeId: ShipId | null, filter: 'all' | 'idle' | 'trouble', visible: ReadonlySet<ShipId>): FleetGroupData[];

// fleet/cycle.ts
export type CycleMode = 'next' | 'previous' | 'next-in-fleet' | 'previous-in-fleet' | 'next-idle';
export function cycleShip(world: World, activeId: ShipId | null, mode: CycleMode): ShipId | null;

// alarms/alarmText.ts
export function alarmSummary(world: World, a: Alarm): string; // "SOI entry into Moon · once · 10 min before · pause"
export function scopeText(world: World, a: Alarm): string; // "Kestrel", "Haulers (fleet)", "All ships"

// layout/contextItems.ts
export interface ContextItem { label: string; key?: string; disabled?: string; run?: () => void; submenu?: ContextItem[] }
export function contextItems(target: ContextTarget, deps: ContextDeps): ContextItem[]; // S6-19
```

`ContextDeps` passes the store actions and the world, so the item lists are tested without React.

## Tests

As before: pure modules use the node environment, components use jsdom with the scene stubbed, and `sim/` tests use `sim/testSystem.ts`; real-body tests go in `gen/` or `game/`.

### `math/pqueue.test.ts` (addition)

- Equal keys come out by rank, then insertion order; rank defaults to 0; `remove` and `removeWhere` keep the heap valid with ranks.

### `sim/fleet.test.ts`

- `createFleet` numbers fleets `fleet-1`, `fleet-2`; `groupOrder` is fleets by seq then null; `fleetShips` is in ship seq order and includes destroyed ships.
- `checkFleetName`: trims; refuses empty, over 40 characters and a case-insensitive duplicate; allows renaming a fleet to its own name.
- `deleteFleet` moves its ships to Unassigned and deletes its fleet alarms, but not ship alarms of its ships.
- `assignShip` re-schedules the ship's alarms (a fleet alarm's event appears in `alarmSchedule` after assignment and disappears after unassignment).

### `sim/alarms.test.ts`

- `triggerMatches`: each `AlarmEventType` against node, SOI entry, SOI exit and impact events, with and without a target (an exit's target is the body left); disabled nodes never match; plan-item matches only its node.
- `nextOccurrence` skips occurrences at or before `fired[shipId]`; `fireTime` is `t − lead`, or now when inside the lead.
- Scheduling: one queued alarm event per (alarm, covered ship); none for a disabled alarm, a destroyed ship or a ship out of scope; a global alarm covers a ship added after it was set.
- Refreshing a ship's trajectory replaces its alarm events and leaves other ships' alone; `queueShipEvent` no longer removes alarm events.
- Firing: `fired` is updated, a notification is appended with the expected text, a repeating alarm is re-scheduled for the next occurrence, and once, time and plan-item alarms are deleted.
- **Pause**: the clock pauses at the fire time exactly, cancelling a warp-to. **Drop warp**: the warp step becomes ×1, a warp-to is cancelled, the clock keeps running, and nothing past the fire time runs in that frame (`stop`).
- **Rank**: a lead-0 plan-item alarm fires before its node executes, at the same `t`; the node executes on the next frame; the alarm is then gone.
- Cleanup: deleting a node, executing it and destroying the ship delete the right alarms; disabling a node removes its occurrence but keeps the alarm.
- Notifications are capped at 50, dropping the oldest dismissed first.

### `sim/shipStatus.test.ts`

- Idle with an empty plan, or only disabled or unreached nodes; not idle with an enabled reached node.
- Low propellant just under and just over 10%; impact predicted from an impact-ending trajectory; over budget when a node's `dvApplied` is below its asked Δv; in trouble from each; a destroyed ship has no flags.
- Alarmed by a ship alarm, a fleet alarm and a plan-item alarm; not by a global alarm. `next` is the next enabled event.

### `sim/alarmFlow.test.ts` (the "done when", synthetic system)

On `sim/testSystem.ts` (planet with a moon), three fleets of two ships:

1. A fleet-wide `soi-change` alarm is set on fleet B. A ship spawned **after** the alarm, on an escape orbit, is assigned to fleet B. Advancing the world at ×10⁷ pauses exactly at that ship's SOI exit minus the lead, with a notification naming it.
2. A `plan-item` alarm on a node (lead 10 min). The node's time is moved later and its Δv changed. The alarm still exists, and fires exactly 10 min before the node's **new** time.
3. A ship's prediction enters the moon's SOI. `setAlarmForEvent` on that entry (lead 1 h) creates a once `soi-enter` alarm for the moon. A node is then added **earlier** in the plan that keeps an encounter but moves it. The alarm fires 1 h before the **new** entry time, and is then deleted.

### `game/fleetActions.test.ts` and `game/alarmActions.test.ts`

- Each action's refusals: unknown fleet, ship or alarm; bad names; plan-item on a non-ship scope or a node of another ship; a time alarm in the past or with a non-global scope; a minor or unknown target body; negative or too-long leads.
- `setAlarmForEvent` on a node, an SOI entry, an SOI exit and an impact gives the expected trigger, scope and `once`; it refuses a past event.
- `deleteNode` deletes the node's alarm; `spawnShip` with a `fleetId` assigns the ship; `warpToNextEvent` over a list of ships picks the earliest stop.

### `game/alarms.done.test.ts` (real system)

- The sprint's "done when" on the hand-flown lunar flight (`gen/lunarMission.ts`): a "next SOI entry into the Moon" alarm set from the TLI's upcoming entry still fires, 1 h before the entry, after a small correction node is added before the TLI. Uses the real system, so it lives in `game/`.

### `gen/scenario.test.ts` (addition)

- The sandbox world has exactly one alarm: global, impact, 1 h, pause, default. A ship spawned on an impact trajectory gets an alarm event at its impact time minus 1 h.

### `store/` tests

- `mapFilters.test.ts`: `matchesSearch`; `visibleSet` with each class off, Ships off, a fleet off; search "io" keeps Io, Jupiter (an ancestor) and the Sun, drops Mars; a search matching a ship keeps the ship's parent body chain; the focus, the active ship and the selection are kept even when filtered out.
- `shown.test.ts`: active, selection (a ship, a node's ship, a fleet, nothing, a body), a fleet, all; destroyed ships excluded.
- `useView.test.ts`: selecting a fleet sets `show`; `focusRefOf` and `shipOf` of a fleet are null; `resetFilters`; the context menu opens and closes.

### Render tests

- `mapFrame.test.ts`: `bodyVisible` and `shipVisible` follow `visibleSet` and are rebuilt only when an input changes.
- `picking.test.ts`: a hidden body or ship is never picked, and neither is its label; `pickTrajectoryMarker` finds an SOI marker within 8 px.
- `soiLayer.test.ts`: rings only for visible major non-root bodies with the toggle on; faded with distance like the orbit line; hidden under 4 px.
- The trajectory layer draws exactly the filter's set: all, the shown ships, the active ship, none.

### `ui/` pure and component tests (jsdom)

- `shipRows.test.ts`: row texts ("Moon SOI in 3 d 4 h", engine, SOI, Δv); icons with titles; groups in order; the idle and in-trouble filters; hidden ships (search) left out; empty groups hidden under a filter.
- `cycle.test.ts`: next and previous wrap across groups; in-fleet stays in the fleet (and in Unassigned); next idle skips busy ships and returns null when none is idle; destroyed ships are skipped; with no active ship, the first or last.
- `FleetsTab.test.tsx`: + New fleet adds a group with an editable name; dragging a row onto a header calls `assignShip`, and onto Unassigned unassigns it; the filter control; clicking a header selects the fleet and sets Show; the row context menu's Move to ▸.
- `AlarmForm.test.tsx`: each When option shows the right fields; a lead of `10 min` is 600 s; errors from the action show inline; editing keeps the alarm's ID.
- `AlarmList.test.tsx`, `Notifications.test.tsx`: the list's rows and next-fire countdowns; the enabled checkbox; Go to activates, selects and focuses; × and Dismiss all; "+n more".
- `ContextMenu.test.tsx`, `contextItems.test.ts`: items per target; Set alarm ▸ 10 min before calls `setAlarmForEvent` with 600; disabled items with a reason (Warp to node on a node within a minute); Esc and an outside press close it.
- `FiltersPanel.test.tsx`: the toggles write `useView.filters`; typing in search narrows the System tree (ancestors kept, expanded) and the Fleets tab; Enter focuses the first match; Reset.
- `ShowMenu.test.tsx`, `TimelineStrip.test.tsx`: glyphs from several ships in their colours; ⏰ markers at fire times; shading after the latest horizon; right-click on a glyph opens the event menu, left-click still previews.
- `ShipInspector.test.tsx`, `FleetInspector.test.tsx`: the sections of S6-9 and S6-10, in order; the Fleet select; a non-active ship can add alarms while its plan stays read-only; rename and delete with confirmation.
- `TopBar` / `AppShell.test.tsx`: ⏰ n and ⚠ n counts; ⚠ opens the Fleets tab filtered.

### `test/smoke/fleets.mjs` (`npm run smoke`)

The earlier smoke files run unchanged first.

1. **Fleets:** create "Survey", "Haulers" and "Reserve" with + New fleet; drag the three sandbox ships into them (real HTML5 drag in Chrome); `fleets()` matches. Rename "Reserve" to "Spare" with a double-click. Right-click a row: Move to ▸ Unassigned works.
2. **Rows:** a ship with a TLI node (added through the store, as `timeline.mjs` does) shows "Node in …" and, after the clock passes the node, "Moon SOI in …".
3. **Cycling:** `]` makes the next ship active, selected and focused (`activeShip()`, `camera()`); `}` stays in the fleet; `I` picks an idle ship.
4. **Done when, fleet alarm:** right-click the Haulers header → Add alarm… → SOI change, lead 0, pause. Spawn a ship on an Earth escape orbit into Haulers **after** that. Play at ×10⁷: the clock pauses exactly at its SOI exit (`clock().t` equals the exit time), and `notifications()` names it. Go to makes it active and focuses it.
5. **Done when, node alarm:** right-click the TLI node's glyph on the strip → Set alarm ▸ 10 min before. Drag its prograde handle a little (its time is unchanged, its Δv changes), then type a later time in the node editor. `alarmSchedule()` shows the fire time at the new node time − 600 s, and warping there pauses exactly at it.
6. **Done when, once alarm:** on a fresh lunar ship, right-click the ▲ Moon SOI entry glyph → Set alarm ▸ 1 h before. Add a node before the TLI ("At time T", small prograde). The alarm still exists, its fire time follows the new entry, and ⏭ warps to it and pauses there with "Moon SOI entry in 1 h" in the notification.
7. **Default alarm:** a ship spawned on a retrograde-burn impact path pauses 1 h before impact.
8. **Show ▾:** "All ships" puts glyphs from several ship colours on the strip; selecting a fleet header switches Show to it; ⏰ markers appear at the alarm fire times.
9. **Filters:** Moons off hides the Moon's marker, label and orbit (`visible()`), except while it is the focus; SOI spheres on gives `soiRings()` with Earth's ring; Trajectories "Active ship" leaves one trajectory; searching "mars" leaves Mars and the Sun on the map and in the System tree, and Enter focuses Mars; Reset restores everything.
10. No console errors, warnings or failed requests. Screenshots of the Fleets tab with three fleets and icons, a notification with the context menu open, and the map with SOI spheres and a search, go to `test/smoke/out/`.

### Lint rules

Added to `test/lint/layers.test.ts`:

| File path given      | Code                                                   | Expected                     |
| -------------------- | ------------------------------------------------------ | ---------------------------- |
| `src/sim/bad.ts`     | `import { addAlarm } from '../game/actions'`           | layer error (sim → game)     |
| `src/store/bad.ts`   | `import { SoiLayer } from '../render/layers/SoiLayer'` | layer error (store → render) |
| `src/render/ok.ts`   | `import { visibleSet } from '../store/mapFilters'`     | no errors                    |
| `src/ui/ok.ts`       | `import { shipStatus } from '../sim/shipStatus'`       | no errors                    |

Fleets, alarms and notifications are sim state; the selection, Show ▾, the filters and the context menu are view state and never reach `sim/` or `game/` (the sprint 5b `game → store` case already covers it).

## Acceptance criteria

Sprint 6 is done when all of these hold:

1. **Checks:** `npm test`, `npm run lint`, `npm run build`, `npm run format:check` and `npm run smoke` pass, with no lint warnings and no console errors or warnings in the smoke run. Earlier tests change only where they enumerate the world's or a ship's fields, or `PQEntry`'s.
2. **Done when (fleet scope):** with three fleets of ships, a fleet-wide SOI change alarm fires for a ship added to the fleet after the alarm was set (`alarmFlow.test.ts` 1, smoke 4).
3. **Done when (plan item):** an alarm on one node survives that node being edited, and fires relative to its new time (`alarmFlow.test.ts` 2, smoke 5).
4. **Done when (once, from the timeline):** a "next SOI entry into the Moon" alarm set from the timeline still fires after a node earlier in the plan is added (`alarmFlow.test.ts` 3, `alarms.done.test.ts`, smoke 6).
5. **Exact firing:** alarms fire at their fire time exactly at any warp, through the event queue, before an event at the same time; pause stops the clock there; drop warp sets ×1 and keeps running; both cancel a warp-to.
6. **Fleets:** create, rename, delete (with confirmation) and drag ships between fleets and Unassigned; rows show SOI, next-event countdown, Δv and the four status icons; the idle and in-trouble filters work.
7. **Active ship:** `[ ] { } I` cycle as S6-8; only the active ship's plan is editable; the ship inspector has S6-9's sections; a fleet can be selected and inspected.
8. **Alarms UI:** context menus on strip events, trajectory markers, nodes, ships and fleets; the alarm form; the ⏰ list with enable, edit and delete; notifications with Go to and dismiss; the default impact alarm.
9. **Timeline:** Show ▾ with active, selection, a fleet and all; several ships' events on the strip; ⏰ markers; ⏭ over the shown ships.
10. **Filters:** the layer toggles (orbits; trajectories all / shown / active / none; nodes; labels; SOI spheres), the category toggles, and search narrowing the lists and the map, with the focus, selection and active ship always visible.
11. **Conventions:** alarms and fleets change only through `game/actions.ts`; alarm events are never stale (schedules are rebuilt, not patched); `AlarmEventType`, `AlarmTrigger`, `AlarmScope` and `SimEvent` switches are exhaustive; view state never reaches `sim/` or `game/`.
12. **Docs:** decisions S6-1 to S6-29, and the implementation choices, are logged in decisions.md; architecture.md, interface.md, features.md, the guide, milestone-1-sprints.md and CLAUDE.md are updated.

## Suggested order of work

1. **Fleets in the sim:** `Ship.fleetId`, `sim/fleet.ts`, the world fields, the fleet actions and their tests.
2. **The rank in `pqueue`**, then `sim/alarms.ts`: the model, matching, occurrences, scheduling (with `queueShipEvent` and `refreshShipDerived` changed), the handler with `pause` and `stop`, notifications and cleanup. `alarmFlow.test.ts`. Every sprint 5 clock test must still pass here.
3. **Alarm actions**, the default alarm in the sandbox, `alarms.done.test.ts`, and the store wiring (handlers, actions).
4. **`sim/shipStatus.ts`**, then the Fleets tab: `shipRows`, groups, rows, the filter, drag and drop, the spawn form's Fleet select. Fleet selection (`SelectionRef`) and the fleet inspector.
5. **Cycling keys**, and the full ship inspector.
6. **Context menus** (`ContextMenu`, `contextItems`, the map's `contextmenu`, `pickTrajectoryMarker`), the alarm form, the Alarms sections, the ⏰ list, notifications and the ⚠ count.
7. **Show ▾**, the multi-ship strip, ⏰ markers and ⏭ over shown ships.
8. **Filters:** `store/mapFilters.ts`, visibility in the frame, the layers, overlays and picking; the trajectories filter; `SoiLayer`; the Filters panel and the lists' search.
9. **Wrap-up:** the debug probes, `fleets.mjs` in the `smoke` script, the lint cases, the docs, and a short walkthrough with screenshots.

## Questions settled before the sprint

1. **Default impact alarm:** an ordinary global alarm, 1 h before any predicted impact, pausing (S6-23).
2. **Setting an alarm from the strip:** by right-click context menu; left-click keeps previewing. The same menus serve ship rows, fleet headers, trajectory markers and map objects (S6-19).
3. **Show ▾:** no multi-selection of ships; Show offers the active ship, the selection (a ship or a fleet), any fleet, or all ships (S6-7, S6-25).
4. **Search:** narrows the sidebar lists **and hides non-matching objects on the map**, keeping ancestors, the focus, the selection and the active ship (S6-28).
5. **Drop warp:** to ×1, with the clock running and any warp-to cancelled (S6-16).
6. **Snooze:** deferred.
7. **Cycling keys:** `]` `[` next and previous, `}` `{` within the fleet, `I` next idle; cycling activates, selects and focuses (S6-8).

## Open questions

1. **Trajectories "fleet" option.** The sprint list's trajectories filter is "all / active / fleet / none". This plan makes the third option **Shown** (the ships Show ▾ shows), so a fleet's trajectories are reached by selecting its header or choosing it in Show ▾, and the two filters can't disagree (S6-26). If a separate "Fleet ▾" choice is wanted in the Filters panel, it is a small addition.
2. **Double pauses at a node.** A lead-0 node alarm pauses before the node executes, and Pause on node (on by default) pauses again just after, at the same `t` (S6-15). Should an alarm pause suppress a Pause-on pause at the same time for the same ship? The plan leaves them independent.
