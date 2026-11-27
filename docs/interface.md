The principle interface is a 3d map of a solar system, with a filterable view of planets, moons, and other bodies, ships, trajectories, and maneuvering nodes.

The interface allows for easy editing of maneuver nodes for each ship, as well as plotting the trajectory of each ship.

Planets and solar system bodies follow simplified two-body orbital paths around the central sun. Ship trajectories use the patched conic approximation.

---

# Interface Design (draft proposal)

See [architecture.md](architecture.md) for the simulation model behind this.

## Screen layout

```
┌──────────────────────────────────────────────────────────────────┐
│ [≡] Scenario name        Mission objectives ▾       Resources ▾  │ top bar
├────────────┬─────────────────────────────────────┬───────────────┤
│ OUTLINER   │                                     │ INSPECTOR     │
│ ▾ Sun      │                                     │ Selected:     │
│   ▾ Earth  │          3D SYSTEM MAP              │  Probe-2      │
│     Moon   │                                     │ Orbit: Mars   │
│   ▸ Mars   │                                     │ Pe 412 km     │
│ ▾ Ships    │                                     │ Ap 3 900 km   │
│   Mother   │                                     │ Δv left 1.8   │
│   Probe-2  │                                     │ Nodes (2) ... │
│ ─────────  │                                     │               │
│ Filters ▾  │                                     │               │
├────────────┴─────────────────────────────────────┴───────────────┤
│ ◀◀ ⏸ ▶ ▶▶  ×1000   |──●────◆──────▲───────────────|  Y2 D143 06:12│ timeline
└──────────────────────────────────────────────────────────────────┘
   ● now   ◆ maneuver node   ▲ SOI change / encounter
```

Both side panels can be collapsed, so the map can fill the screen.

## 3D system map

**Camera**
- Orbit-style controls around a **focus object** (body or ship). Double-click an object, or click it in the outliner, to focus it. The camera animates smoothly to the new focus.
- Logarithmic zoom covers the range from low orbit to the whole system in a few scroll steps.
- Optional "top-down" snap to the ecliptic or to the focus body's orbital plane, because most planning is easier in 2D.

**Rendering of objects**
- Bodies are drawn at true scale when close. When far away they appear as a fixed-size icon with a label. Labels are decluttered by priority (the focus and selection first, then larger bodies).
- **Orbits** of bodies are thin lines, faded by distance from the focus. Moons' orbits are hidden at system zoom.
- **Ship trajectories** are drawn segment by segment, with a colour per ship. Line style shows state:
  - solid: current committed path,
  - dashed: the planned path after maneuver nodes,
  - a marker at each SOI transition
- **Reference frame:** trajectories are drawn relative to the **focus body**. A transfer to the Moon looks different in Earth-centred and Moon-centred frames. A frame selector in the inspector overrides this.
- **Markers** on trajectories: periapsis/apoapsis (Pe/Ap), ascending/descending node, SOI enter/exit, closest approach to the target (with distance), and impact.
- **Ghost positions:** when the timeline is scrubbed to a future time, every object is drawn at its position at that time. Optional "ghost" markers show where the target will be when the ship arrives.

**Filters** (outliner panel)
- Toggle by category: planets, dwarf planets, moons, asteroids, stations, ships, probes.
- Toggle layers: body orbits, ship trajectories (all / selected only / none), maneuver nodes, labels, SOI spheres, and survey uncertainty bands.
- Filter by ship or fleet group.

## Maneuver node editing

The core interaction should be quick, direct, and precise.

**Create:** with a ship selected, hover over its trajectory. A ghost node follows the cursor along the path, showing the time and orbital position. Click to place it. Nodes can also be added from the inspector: "at next Pe", "at next Ap", "at AN/DN", or "at time T".

**Edit in 3D:** the selected node shows a gizmo with six handles (prograde/retrograde, normal/anti-normal, radial in/out). Dragging a handle changes that Δv component with **nonlinear sensitivity**: small drags give fine adjustments and large drags give coarse ones. Modifier keys switch to fine or coarse mode. Dragging the node itself along the trajectory changes its time.

**Edit numerically:** the inspector shows the node's time and Δv components as editable fields. They accept scroll-wheel nudges and typed values, with units.

**Live feedback while editing** (the trajectory recomputes as you drag):
- Total Δv of the node, and the ship's remaining Δv budget, which turns red when it is over budget.
- Burn duration estimate, with a warning when it is long relative to the orbital period.
- The resulting orbit: Pe, Ap, inclination, period, or the encounter it produces ("Mars encounter, Pe 230 km, in 212 d").

**Other node actions:** delete, disable (keep the node but ignore it), "warp to node", and snap to the nearest Pe/Ap.

## Timeline and time control

- Play/pause, warp rate steps (×1 … ×10⁷), "warp to next event", and "warp to selected node".
- The timeline strip shows upcoming events for selected ships (nodes, SOI changes, arrivals, game events), coloured per ship. Hovering shows details; clicking jumps the *preview* to that time.
- Clicking an event in the timeline strip allows setting an alarm for that event.
- **Preview scrubbing:** dragging the playhead forward lets you look at the future. It does not commit time. A clear visual mode (a tinted border and a "PREVIEW" badge) shows when the map is not at "now". Release or press Esc to return.
- Warp automatically drops at alarms and every event that needs a decision.


## Inspector panel

The content depends on the selection:
- **Body:** physical data, orbital elements, SOI radius, survey status, known resources, and "plan transfer here".
- **Ship:** mass, propellant, Δv remaining, engine (thrust, Isp), current orbit, node list, and mission assignment.
- **Node:** Δv editor, timing, and resulting orbit (see above).

## Transfer planner

A dialog opened from "plan transfer" (with a ship and a target):
- A **porkchop plot** of total Δv by departure date and time of flight, computed with the Lambert solver. Clicking a cell previews that transfer on the map. "Apply" creates the departure node, and optionally a capture node.
- A quick Hohmann estimate and the phase angle / next window, shown as a list for players who don't want to read a porkchop plot.

## Look and feel

- A dark, low-clutter "mission control" style. Thin lines and monospaced numeric readouts. A restrained colour palette, with colour reserved for meaning (ship identity, warnings).
- Every number has units, and the units can be switched (km / AU, m/s / km/s).
- Keyboard first for frequent actions, such as cycling focus, adding a node, warp steps, and toggling panels.

## Open questions

1. Are 2D planning views (a top-down orthographic view) enough for most play, with 3D as a showcase, or is 3D primary? 
  > The map view is always 3D, but it can be easily snapped to the plane of the elliptic or orbital plane of selected body.

2. How much hand-holding? A "suggest maneuver" assistant (for example "circularise at Ap") is easy to build and lowers the barrier a lot, but it may undercut the core mechanic.
  > Maneuver planning tools are available, similar to KSP MechJeb 2. However they will not be suggested to the player.

3. Fleet management UI: if the player controls many probes, they will need a fleet list and per-ship alerts (for example "Probe-4 arrives at Titan in 3 d").
  > Fleet management is important and will be part of the outline sidebar panel or another sidebar. Ships can be grouped into fleets. Alarms can be set fleet wide, or on selected ships. The timeline will show events for selected ships or fleets.