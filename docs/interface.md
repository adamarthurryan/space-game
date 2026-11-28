The principle interface is a 3d map of a solar system, with a filterable view of planets, moons, and other bodies, ships, trajectories, and maneuvering nodes.

The interface allows for easy editing of maneuver nodes for each ship, as well as plotting the trajectory of each ship.

Planets and solar system bodies follow simplified two-body orbital paths around the central sun. Ship trajectories use the patched conic approximation.

---

# Interface Design (draft)

See [features.md](features.md) for the game systems, [architecture.md](architecture.md) for the simulation model, and [gameplay-outline.md](gameplay-outline.md) for the vision. Open questions and decisions are in [decisions.md](decisions.md). The interface targets desktop browsers with mouse and keyboard.

## Principles

- **The map is home.** Every activity is reached from the map, and the player returns to it in one keypress. Logistics is spatial, so the map is never more than one step away.
- **Show consequences, not advice.** Every plan shows its Δv, propellant, transit time, crew dose and effect on stockpiles. The game never says what to do.
- **Scale.** The late game has hundreds of bodies, ships and stations, so every list is searchable and filterable, and the map can be filtered by layer.

## Screen layout

```
┌───────────────────────────────────────────────────────────────────────┐
│ [≡] Phase 2: Exploitation  │ Gen-ship reserves ▓▓▓▓░░ 412 d │ Fe Vol U Pt ▾│ ⚠2 ⏰5 │
├────────────┬──────────────────────────────────────────┬───────────────┤
│[Sys][Flt]  │                                          │ INSPECTOR     │
│[Stn][Rte]  │                                          │ ★ Barge-4 (ion)│
│ ▾ Survey   │                                          │ Orbit: Ceres  │
│  ★Barge-4⏰ │            3D SYSTEM MAP                 │ Δv left 6.2   │
│   Probe-3  │                                          │ Cargo 40/60 t │
│ ▸ Haulers  │                                          │ Dose 12 mSv   │
│ ▸ Mother   │                                          │ Power 180/200 │
│            │                                          │ Route: C→Gen  │
│ Filters ▾  │                                          │ [Plan ▾]      │
├────────────┴──────────────────────────────────────────┴───────────────┤
│ Show: [Haulers ▾] ◀◀ ⏸ ▶ ▶▶ ×1000 |─●──◆══▶──⏰──☀──▲───| Y2 D143 06:12 │
└───────────────────────────────────────────────────────────────────────┘
 ★ active ship  ● now  ◆ node  ══▶ thrust arc  ▲ SOI/encounter  ⏰ alarm  ☀ solar storm
```

- **Top bar:**
  - the current phase;
  - the generation ship's remaining reserves, with time to depletion (this is the run's main clock early on);
  - a summary of system-wide stockpiles by resource category, which opens the Economy screen;
  - counts of warnings and alarms.
- **Left sidebar tabs:**
  - **System:** body tree, including detected minor bodies;
  - **Fleets:** ships;
  - **Stations:** stations and habitats;
  - **Routes:** logistics routes.
- **Right sidebar:** the inspector for the current selection.
- **Bottom:** the timeline and time controls.

Both side panels can be collapsed, so the map can fill the screen.

## Screens

The map is the main view. The other screens are **full-screen views where that suits them** (Economy, Construction and Ship designer all benefit from the space). Each has a keyboard shortcut, and the same key or Esc returns to the map. Clicking a location or object in a screen jumps to it on the map.

| Screen        | Purpose                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Map           | Navigation, planning, survey, the overview of everything                                                         |
| Economy       | Stockpiles by location, production and consumption rates, time to depletion or capacity, flows between locations |
| Construction  | Blueprints (locked and unlocked) and build queues per shipyard or site                                           |
| Ship designer | Configure a new ship design (or refit a docked one) from modules, with live derived stats                        |
| Survey        | Survey campaigns, the detection log, and assay results                                                           |

## 3D system map

The map is always 3D. There is no separate 2D planning view.

**Camera**

- Orbit-style controls around a **focus object** (body, ship or station). Double-click an object, double-click or Enter on a sidebar row, or F, to focus it. Focusing an object that is on screen moves only the centre, smoothly, keeping the zoom and the view direction; an object off screen is also framed (a ship by the extent of its path, so a low orbit is seen whole).
- The app starts looking straight down on the Earth–Moon system, with nothing selected (a stopgap until scenarios choose their own start).
- Logarithmic zoom covers the range from low orbit to the whole system in a few scroll steps.
- **Plane snapping:** one keypress or button snaps the camera to look straight down on the plane of the ecliptic, or on the orbital plane of the selected body or ship. The view stays a 3D perspective camera, and orbiting the camera again leaves the snapped view.

**Rendering of objects**

- Bodies are drawn at true scale when close. When far away they appear as a fixed-size icon with a label. Labels are decluttered by priority (the focus and selection first, then larger bodies). A ship's label that would overlap its parent's merges into it: "Earth · Kestrel, Tern +2", each name clickable. A new ship flashes for two seconds, with its label shown.
- **Minor bodies** (asteroids, comets) are drawn as instanced points, coloured by known composition when the resource layer is on. Their orbit lines are only drawn when they are selected, targeted, or part of an active route.
- **Undetected bodies are not drawn.** Detected bodies whose orbits are not yet well known are drawn as a fuzzy band or arc along the uncertain part of the orbit, instead of a dot.
- **Orbits** of bodies are thin lines, faded by distance from the focus. Moons' orbits are hidden at system zoom.
- **Ship trajectories** are drawn segment by segment, with a colour per ship. The active ship's trajectory is drawn at full strength, and other ships' trajectories more faintly. Line style shows state:
  - solid: current committed path,
  - dashed: the planned path after maneuver nodes,
  - **thick and glowing: thrust arcs** (the engine on), with small direction ticks showing the steering,
  - a marker at each SOI transition
- Markers, nodes and the gizmo behind a body's disc are drawn faint, without text. The node gizmo shrinks as the planned path after the node gets small on screen (from 60 px arms at 150 px across to 20 px at 37.5 px), and hides below that; zoom in to drag it.
- **Stations** are drawn as icons, with a type glyph (habitat, refinery, depot, shipyard), on their fixed orbits or at their L-points.
- **Reference frame:** trajectories are drawn relative to a **reference frame body**, separate from the camera's focus. A transfer to the Moon looks different in Earth-centred and Moon-centred frames. Focusing a body sets the frame to it, and focusing a ship sets it to the ship's parent; for the active ship (focused or just flown) the frame **follows** it into each new SOI. Selecting alone never changes the frame. **Frame ▾** in the map toolbar lists the focus body and its parents, and the selected body, and sets a fixed frame.
- **Markers** on trajectories: periapsis/apoapsis (Pe/Ap), ascending/descending node, SOI enter/exit, closest approach to the target (with distance and relative speed), entering or leaving a radiation belt, and impact.
- **Ghost positions:** when the timeline is scrubbed to a future time, every object is drawn at its position at that time. At each SOI entry on the selected or active ship's path, the body entered is drawn where it will be then ("Moon at entry", with its SOI ring). Optional "ghost" markers show where the target will be when the ship arrives.

**Map layers** (toggled in the Filters panel):

- body orbits; ship trajectories (all / active ship / active fleet / none); maneuver nodes and arcs; labels; SOI spheres;
- **Lagrange points** (markers for L1–L5 of the selected body pair, or of all major pairs);
- **radiation:** discovered radiation belts as translucent tori, coloured by dose rate. Active solar storms as an expanding shell from the star, with its arrival time at the active ship;
- **resources:** body icons tinted by known composition, with a confidence indicator;
- **survey:** sky regions covered so far, plus orbit-uncertainty bands;
- **logistics:** active routes as lines between origin and destination, with cargo ships along them;
- **infrastructure:** stations, depots and shipyards.

**Filters**

- Toggle by category: planets, moons, minor bodies (by composition or size), stations (by type), ships (by role or fleet).
- A search box (by name, or by composition such as "fissile").

## Fleet management

The player manages a fleet of ships but **controls one ship at a time**, the **active ship** (marked ★).

**Fleet list** (the Fleets tab):

- Ships are grouped into named fleets. The player creates, renames and deletes fleets, and moves ships between them by dragging. Ships with no fleet appear under "Unassigned".
- Each ship row shows:
  - its name, colour and engine type;
  - its current SOI, and a countdown to its next event ("Mars SOI in 3 d 4 h");
  - remaining Δv, cargo fill, and crew dose;
  - its route, if it has one;
  - status icons: alarms set, low propellant, an impact predicted on its trajectory, a dose limit approaching, unsheltered crew during a storm warning.
- Status filters: **idle**, on route, thrusting, docked, in trouble. These help the player find a ship in a long list.
- Clicking a ship, in the list or on the map, selects it; double-clicking also focuses the camera on it. Selecting never changes the active ship: **A**, or the map toolbar's **Fly** button, makes the selected ship active ("Fly Kestrel (A)", then "★ Kestrel"). The Fly button always shows the active ship. Cycling ships with keyboard shortcuts (next/previous ship, next ship in fleet, next idle ship) comes later. A new ship is selected, not flown.
- Clicking a fleet header selects the whole fleet. That sets the timeline and trajectory filters to that fleet, but no ship becomes active.

**Only the active ship's nodes and arcs are shown as editable.** Other ships' plans are drawn as small markers. Clicking one selects it, and the inspector shows that ship's plan **read-only** ("fly this ship to edit (A)"). Whether the inspector should edit any ship is open (decisions.md, open question 10).

## Maneuver node and thrust arc editing

The core interaction should be quick, direct, and precise. It always applies to the active ship. Which tools the editor offers depends on the selected engine: **nodes** for high-thrust engines, **thrust arcs** for low-thrust ones. A ship with both kinds of engine can use both.

**Nodes (impulsive)**

- **Create:** hover over the active ship's trajectory. A ghost node (◇) follows the cursor along the path, showing the time from now and the altitude. Click to place it. Nodes can also be added from the inspector's **Plan** section ("Add node ▾"): "at next Pe", "at next Ap", "at next AN/DN" (against the parent's equator until targets exist), or "at time T". "Next" means after the plan's last node, so nodes chain: after a trans-lunar injection, "next Pe" is the lunar periapsis.
- **Edit in 3D:** the selected node shows a gizmo with six handles (prograde/retrograde in yellow, normal/anti-normal in magenta, radial in/out in cyan). Dragging a handle changes that Δv component with **nonlinear sensitivity**: small drags give fine adjustments and large drags give coarse ones (10 px ≈ 0.1 m/s, 100 px = 100 m/s, 300 px ≈ 2.7 km/s). Shift switches to fine (×0.1) and Alt to coarse (×10). Handles that point at the camera are hidden. Dragging the node itself along the trajectory changes its time.
- **Edit numerically:** the inspector shows the node's time (as a date, and as "T+" from now) and Δv components as editable fields. They accept scroll-wheel nudges (Δv 1 m/s, time 10 s; Shift finer, Alt coarser) and typed values, with units (`12 m/s`, `3.1 km/s`, `1d 2h 30m`). Plan Δv is always shown in m/s (`3131.0 m/s`). No number anywhere is shown with a thousands separator, so any value shown can be typed back. Delete removes the selected node. The editor opens inside the ship's Plan list, in the selected node's row, so the plan's totals stay in view. "At next Pe/Ap" and Snap to Pe/Ap are unavailable on a circular orbit, which has no Pe/Ap markers either.
- **Finite execution:** a toggle executes the node as a real burn centred on the node time. When it is on, the actual path is drawn next to the impulsive prediction, so the player can see the difference.

**Thrust arcs (low-thrust)**

- **Create:** with a low-thrust engine selected, click-drag along the trajectory to sweep out a burn window. The resulting trajectory updates as the window grows.
- **Edit:** drag the start and end handles of the arc along the trajectory. The inspector holds the start time, duration, throttle, and **steering mode** (prograde, retrograde, normal, anti-normal, radial, fixed inertial, toward target).
- Arcs can be chained: for example, a long prograde spiral, a coast, then a retrograde capture spiral.

**Live feedback while editing** (the trajectory recomputes as you drag; long arcs show a coarse preview first, then refine when the drag ends):

- Δv used and the ship's remaining Δv. The remaining Δv turns red when the plan is over budget.
- Propellant used, by tank type.
- Burn duration (for nodes), with a warning when it is long relative to the orbital period.
- Transit time, and **the crew's predicted dose** for the planned path. A dose warning appears when the path crosses a radiation belt, or when an unsheltered crew would be exposed during a forecast storm.
- Power: for solar-electric arcs, the available thrust falls with distance from the star, and the arc shows this.
- The resulting orbit: Pe, Ap, inclination, period, or the encounter it produces ("Mars encounter, Pe 230 km, in 212 d").
- With a target set: the closest approach to the target (distance, relative speed, time), and whether it meets the docking criteria.

**Other actions:** delete, disable (keep the node or arc but ignore it), "warp to node/arc", and snap to the nearest Pe/Ap.

## Maneuver planning tools

The active ship has a **Plan ▾** menu in the inspector, which works much like MechJeb's maneuver planner. Each tool asks for a few parameters, shows a preview of the result on the map, and adds ordinary, editable nodes or arcs when the player confirms.

| Group      | Tools                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Orbit      | Change Pe · Change Ap · Circularise (at Pe / Ap / after time) · Change inclination · Change LAN                                   |
| Plane      | Match planes with target (at AN/DN)                                                                                               |
| Transfer   | Hohmann to target · Bi-elliptic · Intercept at time (Lambert) · Return from moon · Transfer to L-point · Porkchop planner (below) |
| Rendezvous | Match velocity at closest approach · Fine-tune closest approach · Intercept target                                                |
| Low-thrust | Spiral out to escape · Spiral in to capture · Raise/lower orbit · Edelbaum transfer estimate                                      |

**The game does not suggest tools.** It shows no hints like "you could circularise here", raises no tool prompts on events, and does nothing automatically. The tools stay in the menu until the player opens it. Working out which maneuver to make is the game; the tools only save the player from the arithmetic.

## Rendezvous, docking and towing

- **Target:** set a target from the context menu of a body, minor body, ship or station, or with a key over the hovered object. The inspector then shows the target's name, distance, and relative velocity, and the trajectory shows closest-approach markers.
- **Rendezvous** is done entirely on the map, using nodes, arcs and the rendezvous tools. There is no close-range docking view. When the active ship and its target are close, the camera can focus on the pair.
- **Docking is automatic** when the separation is < 500 m and the relative speed is < 2 m/s. This includes anchoring to an asteroid or comet for mining. A notification appears, and the docked objects are shown as one stack in the sidebar, with nested entries.
- **Docked actions** (in the inspector of a docked stack):
  - **Undock**, with a small separation impulse.
  - **Transfer cargo:** a two-column panel lists both sides' stockpiles. The player sets quantities to move, and sees the transfer time from the pump or crane rate.
  - **Refit**, at a shipyard: opens the ship designer for this ship.
  - **Start or stop mining**, when anchored to a minor body: deploys the rig.
- **Towing:** a tug docked to a station, a habitat segment or an asteroid flies the combined stack. Its inspector shows the stack's total mass and the resulting Δv and acceleration, so the cost of moving something big is visible before planning.

## Logistics routes

Routes are repeatable programs created from a manual plan (see [features.md](features.md#logistics-routes)).

- **Create a route** from a plan: with the active ship's plan going from A to B, choose "Save as route…". The plan becomes a list of planning-tool steps (for example: wait for window → Hohmann to B → match velocity → dock → unload → return). Steps can be reordered, edited, added or removed. Then set:
  - cargo rules, such as "load all volatiles above 20 t at A, unload everything at B";
  - repeat mode: return trip, loop, or one-way;
  - departure rule: next launch window, or when the cargo threshold is reached.
- **The Routes tab** lists routes with their ships, throughput (t/year), next departure, and status. A route can be clicked to highlight it on the map.
- **Assign ships** by dragging them onto a route. Ships on a route fly automatically. They show a route badge, and their plans are read-only until the ship is taken off the route.
- Problems stop the ship and raise an alarm: a missed window, not enough propellant, the destination full, a storm forecast along the path.

## Economy screen

- **Locations table:** each station, depot, ship hold and the generation ship, with stockpiles by resource, net rates (+/− per day), and **time to empty / time to full**. Rows that will run out are highlighted.
- **Flows view:** a diagram of production chains and of routes between locations, for spotting bottlenecks. (Possibly drawn on the map as the logistics layer instead.)
- **Crew & life support:** crew and population by location, consumption of O₂, water and food, habitat capacity, and dose levels.
- **Power:** generation vs. demand per location, and what is cut first if there is a shortfall.
- Clicking a location focuses it on the map.

## Construction screen

- **Blueprints**, grouped by category: backbones, ship modules, engines, shielding, station modules, habitats (work pods → Bernal sphere → O'Neill cylinder segments).
  - Locked blueprints show their **unlock condition as a progress bar** (for example, "Fission drive: refined fissiles 1.2 / 2.0 t"). The resource gating is then visible, and is what the player plans toward.
  - Unlocked blueprints show their material bill, build time and required facility.
- **Build queues** per shipyard or construction site: projects, the materials delivered so far against what is needed, the current build rate, and the estimated completion time. A project that is waiting for deliveries shows what is missing, and which routes are supplying it.

## Ship designer

The designer is free-form, with no hull classes and no 3D layout (see [features.md](features.md#ships-and-ship-design)).

- Choose a **backbone**, then add modules (engines, tanks, cargo, crew, power, radiators, shielding and tools), each with a count and settings. Start from scratch, or clone a saved design.
- **Mass and volume bars** show what is used against the backbone's limits. A module that doesn't fit is flagged before it is added.
- **Live stats:**
  - dry and wet mass;
  - Δv when empty and when fully loaded;
  - thrust-to-weight, acceleration, Isp;
  - power balance, heat vs. radiator capacity;
  - shielding factor and the expected dose per month;
  - the material bill.
- Problems are flagged inline: "radiators insufficient for reactor", "no storm shelter for crew", and so on.
- Later milestones: **capability badges** ("can land", "atmospheric flight"). Each one lists what is missing (for example, "needs landing gear" or "solar array not landing-compatible").
- Designs are saved to a design library, which shipyards then build from.

## Survey screen

- **Survey campaigns:** assign an instrument (on the generation ship, or a survey probe) to a sky region or a target, and see the expected detection limit and the time the campaign will take.
- **Detection log:** newly detected bodies, newly refined orbits, assay results, and newly mapped radiation belts.
- **Body knowledge** is also shown in the body inspector:
  - detection state, and orbit uncertainty (with a bar showing the threshold needed for transfer planning);
  - composition: unknown, a spectral estimate (shown as ranges), or assayed (exact).

## Timeline and time control

- Play/pause, warp rate steps (×1 … ×10⁷), "warp to next event", and "warp to selected node". A warp-to runs at up to ×10⁷, slows into its stop, and pauses there: **1 minute before a node** (so it can still be edited), or **just after any other event** (so the map shows the new frame). Playing, pausing or changing the warp cancels it.
- The timeline strip shows upcoming events for **the selected ships, fleets or stations**, as set by the "Show" selector, which defaults to the active ship. Events shown:
  - nodes, and thrust arcs (drawn as bars);
  - SOI changes, closest approaches, docking, arrivals;
  - stockpile limits, construction completion, survey results;
  - solar storms, game events.

  Events are coloured per object. Alarms show as ⏰ markers. Hovering shows details; clicking jumps the _preview_ to that time.

  The strip's time axis is **logarithmic** and **fixed**: from now at the left edge to 10 years ahead, with its knee at 10 minutes, so a node in 20 minutes and an arrival in 200 days fit together and the ticks never move (1 h at 15%, 1 d at 38%, 1 yr at 83%). The time past the end of the active ship's prediction is shaded. Close events stack, then fold into a "+n".

- Clicking an event in the timeline strip allows setting an alarm for that event.
- **Preview scrubbing:** dragging on the strip looks at the future: the whole map is drawn at that time, with the route each ship flies until then drawn faded. It does not commit time, and the clock keeps running. A clear visual mode (a tinted border and a "PREVIEW" badge with a "Now" button) shows when the map is not at "now". Release to return. Clicking an event keeps the preview at that event until Esc, "Now", or the clock catching up. Map editing (the gizmo and placing nodes) is off during a preview. The inspector still shows now; showing it at the preview time comes with targets (milestone 1, sprint 7).
- Warp automatically drops at alarms (sprint 6). No event drops it otherwise: the clock already stops at every event exactly, and Pause on is the only automatic stop.
- **Pause on ▾:** a popover beside the time controls with a checkbox per event type (node execution, SOI change, impact) and "All events". When an event of a ticked type happens, the clock pauses exactly at it. By default it pauses on node execution only. Alarms (per event, with lead times) build on this later.

## Alarms and alerts

- **Setting alarms:**
  - On a single event: click an event in the timeline strip, or on a trajectory marker, and choose "Set alarm".
  - On a ship, fleet or station: from its context menu, choose "Add alarm…", then pick the event type (maneuver node, arc start, SOI change, closest approach, docking, low propellant, stockpile empty, construction complete, …) and a lead time (for example, 10 min before).
- A fleet-wide alarm also applies to ships added to the fleet later.
- **Default alerts**, on unless turned off: solar storm warnings (listing the crewed ships and stations that are not sheltered), a stockpile about to run out, crew dose near its limit, a predicted impact, and a route stopped.
- When an alarm fires, time pauses (or warp drops, depending on the alarm's setting). A notification names the object and event, and offers "Go to", which makes that ship active, or selects the station, and focuses the camera on it.
- **Storm response:** a storm warning offers "Shelter all crew in affected region". Sheltered crew don't work, so the facilities they run drop in output until the storm passes.
- An **alarm list** (a popover from the top bar) shows every alarm. Each alarm can be edited, deleted or snoozed from there.

## Inspector panel

The content depends on the selection:

- **Body:**
  - physical data, orbital elements and their uncertainty, SOI radius;
  - knowledge state, composition (estimate or assay), radiation belts;
  - Lagrange points;
  - actions: "set as target", "plan transfer here".
- **Ship:**
  - modules, mass, propellant, Δv remaining, backbone (mass and volume used), engines (type, thrust, Isp);
  - power and heat balance, cargo, crew and dose;
  - current orbit, fleet, route, target;
  - node and arc list, alarms;
  - the **Plan ▾** menu, and docked actions.
- **Station:**
  - modules and facilities (each with its status and rates), stockpiles, crew and population;
  - power, shielding;
  - docked ships, build queue, alarms.
- **Node / arc:** the editor, timing, and resulting orbit (see above), inline in its ship's Plan list.

## Transfer planner

The porkchop planner is the most detailed of the transfer tools. It opens as a dialog, from "plan transfer" or from the Plan ▾ menu, for the active ship and a target:

- A **porkchop plot** of total Δv by departure date and time of flight, computed with the Lambert solver. Clicking a cell previews that transfer on the map. "Apply" creates the departure node, and optionally a capture node.
- **Dose overlay:** a toggle colours the plot by crew dose (time of flight × environment) instead of Δv. This shows the trade-off between a cheap, slow transfer and a fast, expensive one.
- A quick Hohmann estimate and the phase angle / next window, shown as a list for players who don't want to read a porkchop plot.
- For low-thrust ships, the dialog shows an Edelbaum Δv and time estimate instead of a porkchop plot.

## Look and feel

- A dark, low-clutter "mission control" style. Thin lines and monospaced numeric readouts. A restrained colour palette, with colour reserved for meaning:
  - ship identity;
  - the four resource categories (each with a consistent colour and glyph everywhere it appears);
  - warnings.
- Every number has units, and the units can be switched (km / AU, m/s / km/s, kg / t).
- Keyboard first for frequent actions:
  - flying the selected ship (A), cycling the active ship, and jumping to the next idle ship;
  - cycling focus, setting a target;
  - adding a node or arc;
  - warp steps, plane snapping;
  - opening screens, toggling panels and layers.

## Open questions and decisions

Interface questions and decisions are tracked in [decisions.md](decisions.md).
