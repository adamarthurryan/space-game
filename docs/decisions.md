# Decisions and Open Questions

This is the single place for unresolved questions and settled decisions, for all the design docs. Answer open questions inline. When one is settled, move it to the decision log and update the doc it affects.

## Open questions


2. **Propulsion overhaul** (features). Fusion is now realistic low-thrust (decision 8), and the propulsion list needs an overhaul. Which engine types, how many tiers, and how do they map to the resource gates?

> Basic engine types are: chemical (eg. LOX/LH2), solid core nuclear thermal, gas core nuclear thermal, nuclear electric, possible other current or future technologies. All part types will be defined in structured text files for easy editing.

3. **Landing mechanism vs. "never land"** (features). Decision 5 says the game is purely orbital, permanently. But decision 9 says large moons and planets are exploited with a separate "landing" mechanism. How do the two fit? For example: no piloted landings, but an abstract action (drop a lander or harvester from orbit, with a Δv and mass cost) that unlocks extraction from a large body. If it is abstract, what does it cost, and is a lander lost or reusable?

> Later milestones will have an abstract landing mechanism. Ships will have to fulfill certain criteria to be capable of landing and/or atmospheric flight. Eg. landing will require certain structural backbones & modules. (Some modules are not compatible with landing, landing gear is required.) Resource consumption will be calculated from the ship properties. Atmospheric flight requires an aerodynamic envelope, etc.

4. **Structural backbone classes** (features). Should designs need a backbone module that limits the total mass or module count, or are designs entirely unconstrained?

> Backbone selection will constrain mass and volume.

5. **Population interpretation** (features). The answer was recorded as: population stays constant unless the player plans growth; planned growth is perfectly efficient but takes time. Is that right? Does "stasis" also mean colonists are kept in cryo stasis aboard the generation ship, ready to be woken?

> Population dynamics are open question. Connected to simulation of ecosystem health.

6. **Cargo transfer while docked** (features). Proposal: transfers run at a rate set by pumps and cranes, not instantly. Accept?

> Accept.

7. **Screens vs. map overlays** (interface). Should the Economy, Construction, Designer and Survey screens be partial overlays that keep the map visible (as proposed), or full-screen views?

> These can be full-screen views as appropriate.

8. **Station control** (interface). Should stations be edited through the inspector at any time (recommended), or use an "active station" model like ships?

> TBD.

9. **Flows visualisation** (interface). Should resource flows be drawn on the map (route lines sized by throughput), on a diagram in the Economy screen, or both?

> TBD.

## Decision log

| # | Area | Question | Decision |
|---|------|----------|----------|
| 1 | Physics | Finite or impulsive burns in milestone 1? | Impulsive in milestone 1. Finite-thrust burns later. |
| 2 | Game loop | Real time or turns? | Real time with pause. |
| 3 | Control | Fleet or single ship? | The player manages a fleet, but controls one ship at a time. Plans are per ship. |
| 4 | Docking | Ship–ship interactions? | Rendezvous on the map, helped by planning tools. Automatic docking below 500 m and 2 m/s. |
| 5 | Scope | Landings and atmospheres? | Early milestones are purely orbital, with no atmospheric flight. Atmospheric flight and landing are later features. |
| 6 | Platform | Mobile and touch? | Not a goal. VR is a possible goal. |
| 7 | Physics | Undocking | An explicit action, with a small separation impulse. |
| 8 | Propulsion | Fusion performance | Realistic low-thrust fusion. The propulsion list needs an overhaul (open question 2). |
| 9 | Economy | Mining without landing | Minor bodies are mined by docking. Large moons and planets need a separate "landing" mechanism. |
| 10 | Logistics | Automation level | Repeatable routes, created from a manual plan, possibly programmed as a sequence of planning-tool steps. |
| 11 | Ships | Ship design | A free-form modular designer. No hull classes, and no 3D arrangement. Backbone classes possible (open question 4). |
| 12 | Survey | Uncertain orbits | Transfer planning requires a sufficiently known orbit. |
| 13 | Roguelike | Run structure | No meta-progression. The failure states are generation-ship ecosystem failure and colony collapse. |
| 14 | Economy | Population | Planned growth is perfectly efficient but takes time. The default is stasis. (Interpretation: open question 5.) |
| 15 | Interface | 2D planning view or 3D? | The map is always 3D, and can be snapped to the ecliptic or to the selected body's orbital plane. |
| 16 | Interface | How much hand-holding? | MechJeb-style planning tools are available on demand, but the game never suggests them. |
| 17 | Interface | Fleet management UI | A Fleets tab in the sidebar. Ships can be grouped into fleets. Alarms per ship or fleet-wide. The timeline shows the selected ships or fleets. |
