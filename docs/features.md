# Game Features

This document covers what the game does: its systems and rules. The vision behind it is in [gameplay-outline.md](gameplay-outline.md). How it is built is in [architecture.md](architecture.md), and how it is presented to the player is in [interface.md](interface.md). Unresolved items are marked **[Open]** and tracked in [decisions.md](decisions.md).

## Scope

- **Orbital gameplay.** No atmospheric flight. Ships never land. Large moons and planets may be exploited through a separate, abstract "landing" mechanism **[Open]**.
- **Real time with pause**, with time warp up to ×10⁷. There are no turns.
- The player manages a **fleet**, but controls **one ship at a time** (the active ship). Plans are per ship.
- **Physics:** bodies are on rails, coasting ships follow patched conics, and thrusting ships follow integrated thrust arcs. Propulsion is realistic, with no Epstein-style drives (see [worldbuilding.md](worldbuilding.md)).

## Ships and ship design

- **Free-form modular design.** A ship design is a selection of modules and their settings. There are no hull classes, and no 3D arrangement or connection of the modules. Designs can be saved and cloned, and shipyards build from them.
- **Module categories:**
  - engines, propellant tanks, cargo holds, crew compartments;
  - power (solar arrays, fission reactor, fusion core), radiators, shielding;
  - tools (survey instruments, mining rigs, tug clamps).
- **[Open]** Structural backbone classes: a backbone module that limits the total mass or module count a design can carry.
- **Derived stats** shown for every design and ship:
  - dry and wet mass, thrust and Isp per engine, Δv for the current load, acceleration;
  - power balance, heat vs. radiator capacity;
  - shielding factor.
- A ship can be refitted while docked at a shipyard.

## Propulsion

**[Open]** The propulsion list needs an overhaul. The tiers below are a placeholder until that is done. Fusion is a realistic low-thrust drive (very high Isp, milli-g acceleration), not a torch ship.

| Tier | Engine | Isp (s) | Thrust | Burn model | Power/heat |
|------|--------|---------|--------|------------|------------|
| 1 | Chemical | 300–460 | High (kN–MN) | Node, or a short finite burn | None |
| 2 | Ion / Hall (electric) | 1 500–5 000 | Very low (N) | Thrust arc (days to months) | Large power draw; solar-electric thrust ∝ 1/r² |
| 3 | Fission (nuclear-thermal) | 800–1 000 | Medium–high (kN–100 kN) | Finite burn (minutes to hours) | Reactor waste heat |
| 4 | Fusion | 10⁴–10⁵ | Low (milli-g) | Thrust arc | Very high heat; reactor needs superconductors |

## Maneuvering

- **Maneuver nodes** are for high-thrust engines. A node is an impulsive Δv (prograde, normal, radial) at a set time. A node can be executed as a **finite burn** centred on its time. The game then shows how the real path differs from the impulsive prediction.
- **Thrust arcs** are for low-thrust engines. An arc is a burn window (start, duration), with a throttle and a **steering mode**: prograde, retrograde, normal, anti-normal, radial in/out, fixed inertial, or toward target. Arcs can be chained.
- **Every plan shows:** Δv, propellant, transit time, the resulting orbit or encounter, and the crew's predicted radiation dose.

## Planning tools

The tools are MechJeb-style helpers. **The game never suggests them**: they run only when the player picks one, and their output is ordinary, editable nodes and arcs.

| Group | Tools |
|-------|-------|
| Orbit | Change Pe · Change Ap · Circularise · Change inclination · Change LAN |
| Plane | Match planes with target |
| Transfer | Hohmann · Bi-elliptic · Lambert intercept / porkchop · Return from moon · Transfer to L-point |
| Rendezvous | Match velocity at closest approach · Fine-tune closest approach · Intercept target |
| Low-thrust | Spiral out / in · Raise or lower orbit · Edelbaum estimate (an estimate only, not an optimised trajectory) |

**Transfer planning requires known orbits.** A body can only be targeted once its orbit is known well enough (see [Survey and discovery](#survey-and-discovery)).

## Rendezvous, docking and towing

- The active ship can set a target (a body, minor body, ship or station). Its plan then reports closest approaches to that target.
- **Docking is automatic** when separation < 500 m and relative speed < 2 m/s. It works with ships, stations, depots and minor bodies: docking with an asteroid or comet anchors the ship to it.
- **Undocking** is an explicit action, with a small separation impulse.
- **Cargo transfer** while docked runs at a rate set by the pumps or cranes on each side. It is not instant.
- **Towing:** a tug docked to a station, habitat segment or captured asteroid flies the combined stack, so its Δv and acceleration are based on the total mass. Stations have no engines, and only move when towed.

## Stations and habitats

- Stations sit on fixed orbits around a body, or at Lagrange points (with station-keeping assumed).
- **Station modules:** habitat rings, refineries, factories, shipyards and drydocks, depots, docks.
- **Habitat progression:** work pods → Bernal spheres → O'Neill cylinder segments. Each is a structure built in place.

## Environment

- **Radiation:**
  - background cosmic rays everywhere;
  - radiation belts around magnetised bodies (found by survey);
  - solar particle storms, which travel outward from the star, with a warning time that depends on the player's sensors.
- **Crew dose** builds up along every trajectory and at every station. Plans show the predicted dose.
- **Shielding strategies:**
  - **Water jackets:** protection scales with the water carried, which is shared with the life-support and propellant stocks.
  - **Storm cellars:** protect against storms only while the crew are sheltered. Sheltered crew don't work.
  - **HDP liners:** passive protection that is light for what it provides.
  - **Active magnetic deflection:** strong protection that draws power continuously. Protection is lost when power fails.
- **Power:** solar power falls off as 1/r². Fission and fusion power are constant. A shortfall cuts consumers in priority order.
- **Heat:** waste heat must stay within radiator capacity, or the drive or reactor is throttled.

## Survey and discovery

- Bodies are **undetected** until a survey finds them. Optical surveys from the generation ship or from probes sweep regions of sky. Detection depends on the body's size and albedo and its distance from the star and the observer.
- **Orbit knowledge** improves with each observation, and short-range radar improves it sharply. Transfer planning needs the orbit's uncertainty to be below a threshold.
- **Composition:** unknown → a spectral estimate (ranges) from survey data → exact, after a probe flyby, an orbit, or docking.
- Radiation belts and Lagrange points are also mapped as part of discovery.

## Economy

- **Resources:**
  - raw: structural metals, volatiles, fissiles, precious metals;
  - refined: propellants, O₂, water, trusses, reactor fuel, electronics, superconductors, HDP, ….
- **Stockpiles** belong to locations: ship holds, stations, depots, and the generation ship. Goods only move by ship, or by transfer while docked.
- **Facilities** (mining rigs, harvesters, refineries, factories, shipyards, life support) turn inputs into outputs. They need power and crew, and follow recipes.
- **Extraction:**
  - minor bodies (asteroids, comets, small moonlets) are mined by a ship or rig docked to them;
  - large moons and planets need the separate landing mechanism **[Open]**.
- **Crew and life support:** crew consume O₂, water and food, and accumulate dose. Habitats set the population capacity.
- **Population:**
  - Population stays constant ("stasis") unless the player plans growth.
  - Planned growth happens exactly as planned, but takes time.
  - Growth needs habitat capacity and life support.
- **Construction:** a project at a shipyard or construction site consumes delivered materials at a build rate, then completes as a new ship, station or module.

## Logistics routes

- **A route is created from a manual plan:** the player plans a trip once, then saves it as a route.
- A route is a **program: a sequence of planning-tool steps**, for example:
  1. wait for the window to B;
  2. Hohmann to B;
  3. match velocity;
  4. dock;
  5. unload volatiles;
  6. return.

  Each step is re-evaluated on every run, so the route adapts to new launch windows.
- **Cargo rules** decide what is loaded and unloaded at each end.
- Ships assigned to a route fly it without player input. Problems stop the ship and raise an alarm: a missed window, too little propellant, the destination full, or a storm forecast along the path.

## Alarms

- Alarms can be set on a specific event, on an event type, or on a time. Their scope is a ship, a fleet, a station, or global. Each has a lead time, and either pauses or drops warp.
- A fleet alarm also covers ships added to the fleet later. An alarm on a specific event survives replanning.
- **Default alarms**, on unless turned off: storm warnings, a stockpile running out, crew dose near its limit, a predicted impact, a route stopped.

## Progression and scenario

- **Resource-gated unlocks.** There is no tech tree. Each blueprint unlocks once enough specific resources have been refined or delivered, sometimes at a site with a required facility.
- **Phases** are milestones shown to the player, worked out from the game state. They are not modes:
  1. Discovery
  2. Exploitation
  3. Expansion
  4. Advanced manufacturing
- **The generation ship** is the starting hub, with large but finite reserves.
- **Scenario goals:** build a colony (ending in an O'Neill cylinder) or continue the voyage (launch a new generation ship).
- **Failure:** the generation ship's ecosystem fails, or the colony collapses.
- **No meta-progression** between runs.

## World generation

- A real solar system, or a seeded fictional system.
- **Composition by abundance:**
  - structural metals: common, especially in inner and metallic bodies;
  - volatiles: plentiful beyond the frost line, and in comets and icy moons;
  - fissiles: rare and clustered;
  - precious metals: very rare, in metallic asteroids.
- Every seed guarantees a reachable minimum of each resource, so every run can be won.
