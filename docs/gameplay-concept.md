# Space Exploration & Orbital Colonization Game — Design Outline

## 1. High-Concept & Setting
- **Core Premise**: A hard-science-leaning space exploration and colonization game set aboard a **generation ship** arriving in an uncharted star system.
- **Orbital Focus**: Core gameplay takes place in vacuum and orbital space, keeping the engineering focus on delta-v budgets, orbital mechanics, thermal management, and mass efficiency. Later additions bring an **abstract** landing and atmospheric-flight mechanism: there are no piloted descents, and a ship qualifies by its design (a landing-rated backbone, landing gear, an aerodynamic envelope for atmospheres). It opens large moons and planets to resource extraction.
- **From Ship to System**: Players transition from maintaining a closed-loop generation ship upon arrival to building a self-sustaining, system-wide orbital civilization.
- **Real-Time Fleet Command**: Play runs in real time with pause and time warp. The player manages a growing fleet but flies one ship at a time, planning its maneuvers on the system map. Repetitive hauls can be automated as logistics routes once they have been planned by hand.
- **Roguelike Runs**: Each run is a randomly generated scenario, in the real solar system or a fictional one. A run fails if the generation ship's ecosystem fails or the colony collapses. There is no meta-progression between runs.
- **Resource-Gated Progression**: Rather than an abstract "research" or tech-tree system, technological capability is **strictly resource-gated**. Acquiring, refining, and delivering specific materials (e.g., fissiles, precious metals, hydrogen-rich feedstocks) in sufficient quantities directly unlocks higher-tier structures, shielding, and propulsion.

---

## 2. Orbital Infrastructure Focus
Instead of surface bases, population growth, agriculture, and heavy industry are anchored in rotating orbital habitats and modular megastructures. (Surface operations, when added, serve resource extraction, not settlement.)

- **O'Neill Cylinders**: Large-scale, twin counter-rotating cylindrical habitats providing Earth-like spin gravity, expansive agricultural zones, and high population capacity for late-game expansion. These would be the end goal of a colonization-focused scenario.
- **Bernal Spheres**: Compact, spherical rotating habitats suited for late-game colonization hubs, research/industrial outposts, and high-efficiency shielding geometries.
- **Zero-G Industrial & Logistics Nodes**:
  - Orbital shipyards, drydocks, and refineries positioned outside spin-gravity zones to simplify heavy assembly.
  - Fuel depots and volatile transfer stations positioned along key orbital transfer corridors.
  - Modular station architecture allowing habitats to be expanded as structural metal and volatile reserves grow.

---

## 3. Resource Classification (Abundance & Function)
Resources are categorized by their **cosmic abundance** and **functional role** in the orbital economy, creating natural logistical bottlenecks and strategic trade-offs:

| Category | Examples | Cosmic Abundance | Primary Functions | Strategic Role |
| :--- | :--- | :--- | :--- | :--- |
| **Structural Metals** | Iron, Nickel | High | Hulls, trusses, habitat shells, bulkheads, drydocks | Backbone of all physical expansion and megastructure framing |
| **Volatiles** | Water, Ammonia | Moderate–High | Life support (O2, hydration, agriculture), propellant/reaction mass, water-jacket shielding | Dual-use survival and logistics bottleneck; sustains crew and fuels engines |
| **Fissile Materials** | Uranium, Plutonium | Low (Localized) | High-output reactors, nuclear thermal and nuclear electric propulsion, high-stress emergency power | Gates mid-to-late-game energy density and rapid crewed transit |
| **Precious Metals** | Platinum-group metals, Gold, Silver | Very Low (Rare) | Precision electronics, catalysts, sensors, superconductors, magnetic and advanced reactor components | Gates advanced manufacturing, automation, and top-tier systems |

---

## 4. Propulsion Suite
Ship and tug design revolves around balancing **thrust**, **efficiency (specific impulse)**, and **material/power cost** across a set of realistic engine types. No torch drives: every engine is plausible under current physics. Each engine is a part defined in a content file. The resource gates for each engine are still to be set.

| Propulsion Type | Thrust | Efficiency (Isp) | Resource & Cost Profile | Primary Gameplay Role |
| :--- | :--- | :--- | :--- | :--- |
| **Chemical** (e.g. LOX/LH2) | High | Low | Low upfront material cost; high volatile/propellant mass fraction | Escaping deep gravity wells from low orbit, urgent course corrections, short-range shuttles |
| **Solid-Core Nuclear Thermal** | Medium–High | Medium | Fissile-gated; hydrogen propellant; reactor shielding and radiators | Crewed inter-orbital transit, mid-range heavy freight, tug operations |
| **Gas-Core Nuclear Thermal** | Medium–High | High | Heavily fissile-gated; very large radiators and shielding | Fast crewed transit and high-value freight across the system |
| **Nuclear Electric** (ion / Hall / MPD) | Very Low | Very High | Reactor plus large radiators; precious-metal electronics; minimal propellant mass | Long-haul automated cargo, patient orbital transfers, slow megastructure towing |
| *Candidate:* **Solar Electric** | Very Low | Very High | Solar arrays; thrust falls with distance from the star | Early, cheap inner-system cargo hauling |
| *Candidate:* **Fusion** (realistic) | Low | Extremely High | Precious metals, superconductors, specialized volatile isotopes | Deep-system reach and heavy towing at milli-g acceleration |

### Key Propulsion Trade-Offs
- **Mass vs. Time**: Chemical burns finish quickly at steep propellant cost. Electric drives save mass, but need long transit windows and continuous power.
- **Crew Exposure**: Low-thrust electric trajectories prolong crew exposure to cosmic radiation. They suit automated cargo hulls, while crewed vessels rely on nuclear thermal engines.
- **Infrastructure Coupling**: Advanced engines demand matching power, radiator capacity, and specialized fuel supply chains.

---

## 5. Radiation Shielding Strategies
Operating purely in space without a planetary magnetosphere or atmosphere makes radiation management a central engineering constraint for both habitats and ships:

| Strategy | Mechanism | Primary Protection | Resource Dependency | Key Trade-Offs |
| :--- | :--- | :--- | :--- | :--- |
| **Water Jackets** | Bulk volatile layer integrated into hull walls and tanks | Galactic cosmic rays (GCRs) & solar particle events (SPEs) | Volatiles (Water) | Dual-purpose mass (shielding + reserve life support/propellant), but adds significant structural inertia |
| **Storm Cellars** | Heavily armored, compact central shelter compartments | Acute solar flares and high-radiation transit zones | Structural Metals + Volatiles | Mass-efficient for small ships; forces crew to halt normal operations and shelter during storms |
| **HDP Liners** | High-density polyethylene interior hull linings | Secondary neutrons and high-energy charged particles | Volatiles / organic feedstocks | Lightweight compared to metal plating; mitigates secondary radiation spallation inside living spaces |
| **Active Magnetic Deflection** | Powered superconducting coils generating a localized magnetic field | Charged solar and cosmic particles | Precious Metals (superconductors) + High Power (reactor) | Eliminates massive passive hull weight, but creates continuous power draw and catastrophic vulnerability if power fails |

---

## 6. Four-Phase Gameplay Progression Loop
Progression is structured into four sequential yet overlapping phases, each gated by the player's physical resource extraction and orbital manufacturing capacity:

### Phase 1: Discovery & Mapping
- **Objective**: Survey the newly reached star system from the generation ship and identify viable resource targets and safe orbital corridors.
- **Core Activities**:
  - Launch long-range optical/radar surveys and low-cost probes.
  - Map orbital mechanics, gravity wells, Lagrange points, and radiation belts.
  - Assay asteroids, comets, and moons for structural metals, volatiles, fissiles, and precious metals.
- **Gate to Phase 2**: Verified orbital targets (orbits known well enough to plan transfers) and initial delta-v transfer plans within chemical reach.

### Phase 2: Resource Exploitation
- **Objective**: Break dependence on the generation ship's finite starting reserves, and relieve its closed-loop ecosystem, by establishing raw extraction and basic refining.
- **Core Activities**:
  - Dock mining rigs and volatile harvesters to near-system asteroids, comets, and moonlets.
  - Set up chemical shuttles for rapid local hops and electric barges for slow, mass-efficient bulk hauling, and automate repeat hauls as logistics routes.
  - Stabilize water, oxygen, and propellant stockpiles; establish basic radiation storm cellars and water-jacketed work pods.
- **Gate to Phase 3**: Surplus structural metals and volatiles sufficient to fabricate rotating habitat frames and sustain larger workforces.

### Phase 3: Expansion
- **Objective**: Build permanent orbital population and industrial centers beyond the generation ship.
- **Core Activities**:
  - Construct Bernal spheres and initial O'Neill cylinder segments alongside zero-G drydocks.
  - Secure fissile deposits to transition from chemical/solar constraints to fission reactors, solid-core nuclear thermal propulsion, and nuclear electric power.
  - Implement HDP liners and bulk water-jacket shielding on permanent habitats to support growing populations.
- **Gate to Phase 4**: Stable multi-habitat logistics, surplus fissile power, and initial access to rare precious-metal deposits.

### Phase 4: Advanced Manufacturing
- **Objective**: Close high-tech industrial loops to achieve full system-wide mastery and megastructure scale.
- **Core Activities**:
  - Refine precious metals into precision electronics, superconductors, and advanced catalysts.
  - Deploy active magnetic deflection shields on flagship vessels and large O'Neill cylinders.
  - Commission advanced drives (gas-core nuclear thermal, and fusion if included) for fast system-wide transit and heavy towing, and build automated mega-shipyards.
- **Endgame State**: A self-sustaining, interconnected orbital civilization capable of constructing full-scale O'Neill cylinders and launching future generation ships.
