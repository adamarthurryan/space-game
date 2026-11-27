# Decisions and Open Questions

This is the single place for unresolved questions and settled decisions, for all the design docs. Answer open questions inline. When one is settled, move it to the decision log and update the doc it affects.

## Open questions

1. **Population and ecosystem health** (features). Population dynamics are linked to a simulation of ecosystem health, and generation-ship ecosystem failure is a failure state. What does ecosystem health measure (for example: biomass, nutrient-cycle balance, atmosphere quality, genetic diversity)? What degrades and restores it? How does it drive population growth or decline?

> TBD.

2. **Propulsion resource gates** (features). The engine types are now set (decision 19). Which resources gate each type, and in what order are they unlocked? Are solar-electric propulsion and realistic low-thrust fusion (decision 8) still in the list, as "other current or future technologies"?

> Yes, solar-electric and realistic low-thrust fusion can be added to the engine types.

3. **Construction in milestone 2 vs. milestone 4** (milestones). Milestone 2 now includes "ship design and construction", and milestone 4 still lists "construction, stations and habitats". Is the split ship construction (at the generation ship) in milestone 2, and station and habitat construction in milestone 4?

> Yes, basic ship design and construction is introduced in milestone 2.

4. **Station control** (interface). Should stations be edited through the inspector at any time (recommended), or use an "active station" model like ships? *TBD.*

5. **Flows visualisation** (interface). Should resource flows be drawn on the map (route lines sized by throughput), on a diagram in the Economy screen, or both? *TBD.*

## Decision log

| # | Area | Question | Decision |
|---|------|----------|----------|
| 1 | Physics | Finite or impulsive burns in v1? | Impulsive in v1. Finite-thrust burns later (see decision 18). |
| 2 | Game loop | Real time or turns? | Real time with pause. |
| 3 | Control | Fleet or single ship? | The player manages a fleet, but controls one ship at a time. Plans are per ship. |
| 4 | Docking | Ship–ship interactions? | Rendezvous on the map, helped by planning tools. Automatic docking below 500 m and 2 m/s. |
| 5 | Scope | Landings and atmospheres? | Purely orbital in the main milestones. An abstract landing and atmospheric-flight mechanism comes in later milestones (decision 21). |
| 6 | Platform | Mobile and touch? | Not a goal. VR is a possible future goal. |
| 7 | Physics | Undocking | An explicit action, with a small separation impulse. |
| 8 | Propulsion | Fusion performance | Realistic low-thrust fusion, if fusion is included (open question 2). |
| 9 | Economy | Mining without landing | Minor bodies are mined by docking. Large moons and planets are exploited with the landing mechanism (decision 21). |
| 10 | Logistics | Automation level | Repeatable routes, created from a manual plan, possibly programmed as a sequence of planning-tool steps. |
| 11 | Ships | Ship design | A free-form modular designer. No hull classes, and no 3D arrangement. A structural backbone is required (decision 22). |
| 12 | Survey | Uncertain orbits | Transfer planning requires a sufficiently known orbit. |
| 13 | Roguelike | Run structure | No meta-progression. The failure states are generation-ship ecosystem failure and colony collapse. |
| 14 | Economy | Population | Superseded: population dynamics are open (open question 1). |
| 15 | Interface | 2D planning view or 3D? | The map is always 3D, and can be snapped to the ecliptic or to the selected body's orbital plane. |
| 16 | Interface | How much hand-holding? | MechJeb-style planning tools are available on demand, but the game never suggests them. |
| 17 | Interface | Fleet management UI | A Fleets tab in the sidebar. Ships can be grouped into fleets. Alarms per ship or fleet-wide. The timeline shows the selected ships or fleets. |
| 18 | Milestones | Low-thrust timing | Impulsive only in milestones 1–2. Thrust arcs in milestone 3. (Recorded from the question being removed.) |
| 19 | Propulsion | Engine types | Chemical (e.g. LOX/LH2), solid-core nuclear thermal, gas-core nuclear thermal, nuclear electric, and possibly other current or future technologies. |
| 20 | Content | Data format | All part types (and other content) are defined in structured text files, for easy editing. |
| 21 | Scope | Landing mechanism | Abstract, in later milestones. A ship must meet capability criteria to land: a suitable backbone, landing gear, and no landing-incompatible modules. Atmospheric flight needs an aerodynamic envelope. Resource cost is calculated from the ship's properties. |
| 22 | Ships | Structural backbone | Every design has a backbone, which limits the design's total mass and volume. |
| 23 | Docking | Cargo transfer while docked | Runs at a rate set by pumps and cranes, not instantly. |
| 24 | Interface | Screens vs. map overlays | The Economy, Construction, Designer and Survey screens can be full-screen views, where that suits them. |
| 25 | Scope | Atmospheric flight vs. the gameplay outline | The outline is updated: core gameplay is orbital, and abstract landing and atmospheric flight are later additions, mainly for resource extraction. |
| 26 | Content | Content file format | Typed TypeScript data files (`satisfies`), not YAML. Refines decision 20: content is still data, separate from code. Type checking replaces the YAML loader and runtime schemas; a content test checks ID uniqueness and cross-references. |
| 27 | Architecture | Threads | The sim runs on the main thread. A Web Worker runs heavy pure jobs (porkchop grid, Lambert sweeps). World state is plain data, so the whole sim can move to a worker later if profiling shows the need. |
| 28 | Architecture | Determinism | Only reproducible generation and reproducible recomputation from a snapshot are required. Input replay is not a goal. |
| 29 | Persistence | Saves | Saves hold the full world, bodies included; nothing is regenerated from the seed. Saves from another version are refused, not migrated, while the game is in development. |
| 30 | Architecture | Known world | The known world is a display selector, not a separate copy of the world. Displayed orbits are true orbits offset by seeded noise scaled by the uncertainty. |
| 31 | Alarms | Alarm triggers | Triggers are a plan item, an event type (optionally narrowed to a target, optionally once), or a time. Individual predicted events are not tracked across replans. |
| 32 | Economy | Economy solver | Fixed sim-time steps (proposed 1 h), so ecosystem and population models can be non-linear. The analytic between-events solver is kept as an optimisation if needed. |
| 33 | Architecture | Cross-layer rules | Rules that need higher layers (such as target knowledge for transfers) are checked in `game/actions.ts`. Route programs live in `economy/routes.ts`, not `planning/`. |
