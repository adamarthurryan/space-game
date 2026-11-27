# Milestones

Open questions about milestones are tracked in [decisions.md](../docs/decisions.md). Each milestone builds on the one before and is playable on its own. Features are described in [features.md](../docs/features.md).

## 1. Orbital sandbox

- The 3D map, bodies on rails (real solar system).
- Impulsive maneuver nodes, patched-conic trajectories.
- Planning tools (orbit, plane, transfer, rendezvous), and the porkchop planner.
- Fleets, the active ship, alarms, timeline and preview scrubbing.
- Rendezvous and automatic docking.

Trajectory segments carry a `kind` discriminant and are always handled with exhaustive switches, so that adding thrust segments in milestone 3 doesn't mean reworking trajectories.

Sprint breakdown: [milestone-1-sprints.md](milestone-1-sprints.md).

## 2. Discovery (gameplay phase 1)

- The generation ship and survey probes.
- The true/known world split: detection, orbit determination, assays.
- Minor bodies, composition, the fictional system generator.
- The radiation environment and crew dose.
- Ship design and construction.

## 3. Exploitation (gameplay phase 2)

- Thrust arcs and finite burns: electric drives (nuclear electric, or solar electric if it is included).
- Stockpiles, facilities, and the event-driven economy solver.
- Mining by docking with minor bodies, and cargo transfer.
- Depots, logistics routes (route programs), life support.


## 4. Expansion and advanced manufacturing (gameplay phases 3–4)

- Construction, stations and habitats, towing.
- Nuclear engines (solid-core, gas-core, nuclear electric) and any candidate drives, shielding strategies.
- Resource-gated unlocks, ecosystem health and population, scenario goals and failure states.

## Other Features

- Equipment failure, irrational crew actions, ecosystem issues, and other random issues.
- Landing mechanism for large moons and planets, and atmospheric flight (abstract, gated by ship capability).
- 3D models for ship designs.
- VR (WebXR).
