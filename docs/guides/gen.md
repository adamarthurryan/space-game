# Guide to the `gen/` layer

`src/gen/` builds the starting world. Today that means the real solar system at any epoch from 3000 BC to 3000 AD, from transcribed JPL data, and the milestone 1 sandbox scenario with its three ships and the spawn presets. Seeded fictional systems and scenario generation will come here in later milestones. It imports `math/`, `orbital/`, `sim/` and `content/`. `store/useWorld.ts` calls `createSandboxWorld()` to make the initial world.

This guide describes the code as it stands after milestone 1, sprint 5b. The data and frames are discussed in [architecture.md](../architecture.md) and [scenarios.md](../scenarios.md); the code cites decisions as `S<sprint>-<n>` (S1-3 is decision 3 of `planning/sprint-1.md`).

## 1. Architecture

| File | What it is |
|---|---|
| `realSystem.ts` | `generateRealSystem(epochJd)`: the 31 bodies of the real solar system as a `BodySystem` |
| `data/jplPlanets.ts` | JPL Tables 2a and 2b (approximate planet positions), verbatim |
| `data/satellites.ts` | JPL planetary satellite mean elements, verbatim |
| `data/physical.ts` | GM, radius, atmosphere height and IAU rotation for every body, verbatim |
| `fixtures/horizons.ts` | JPL Horizons state vectors pinned for tests (no network in tests) |
| `fixtures/table2Errors.ts` | The tables' published error bounds, for the tests |
| `fixtures/fetch_horizons.py` | The one-off script that captured the fixture |
| `scenario.ts` | `createSandboxWorld()` and `SANDBOX_EPOCH_JD` |
| `sandboxShips.ts` | The sandbox ships, the spawn presets, and `orbitFromInput` (the spawn form's orbit) |
| `lunarMission.ts` | `findTli` and `SMOKE_TLI`: a scanned trans-lunar injection, for tests only |

The flow at startup is:

```
store/useWorld ─▶ createSandboxWorld()
                    ├─ generateRealSystem(SANDBOX_EPOCH_JD)   2030-01-01 00:00 TDB
                    │     ├─ planetMeanElements(row, epoch)     × 9 (Mercury … Pluto)
                    │     ├─ satelliteMeanElements(row, epoch)  × 21 moons
                    │     └─ buildBodySystem(epoch, inputs)     sim/body.ts
                    ├─ createWorld(system, 0)
                    └─ addShip(createShip(…)) for Kestrel, Tern and Heron
```

### The real system

- **Bodies.** The Sun; Mercury to Neptune and Pluto; and 21 moons: the Moon, Phobos and Deimos, the four Galileans, Mimas to Iapetus, Miranda to Oberon, Triton and Charon. Phobos and Deimos are under the 1e19 kg threshold, so they are minor (no SOI, no ships). Every other body is major.
- **Planets (S1-3, S1-4).** Each Table 2a/2b row is evaluated at the epoch and stored as the elements at t = 0 plus linear rates. The table's extra terms for the outer planets are linearised at the epoch, which is good near it (the tests measure how good). Earth sits on the Earth–Moon barycentre's orbit, and Pluto on its system barycentre's.
- **Moons (S1-18).** The satellite rows are read as given: P is the sidereal period (of the mean longitude), so n = 2π/P − ω̇ − Ω̇. The apse advances and the node regresses at their fitted periods. Each row has a reference plane (the ecliptic, the planet's equator, or a Laplace plane by its pole). The planet's equator uses the pole the planet spins about, so the Uranian moons come out prograde. The elements are propagated from J2000 to the scenario epoch.
- **Physical data and spin (S1-9, S1-16).** GM is the body's own (not its system's). Rotation keeps the IAU pole's constant terms and the linear prime meridian, W = W₀ + Ẇ·d, evaluated at the epoch.

## 2. Common patterns

- **Data verbatim, conversion in code (S1-15).** Every file in `data/` is a transcription in the source's own units (au, degrees, days, deg per century), with its URL and retrieval date in the header. Every unit conversion happens in `realSystem.ts`. To check or update a number, compare it with the source directly.
- **Deterministic.** The same epoch gives a deep-equal `BodySystem`, and `createSandboxWorld()` gives the same world every time. The sandbox epoch is fixed so screenshots and smoke checks are reproducible (S2-1). When random generation arrives, it will use `math/rng.ts` streams.
- **Pinned fixtures, no network.** Tests compare against Horizons vectors stored in `fixtures/horizons.ts`. The Python script that captured them is kept for reference and never run by the test suite.
- **Generators produce plain inputs.** Generators build `BodyInput[]` and `OrbitState`s, then hand over to `sim/` (`buildBodySystem`, `createShip`, `addShip`). Validation is `sim/`'s: `buildBodySystem` throws listing every problem.
- **Test-only modules are marked.** `lunarMission.ts` (like `sim/testSystem.ts`) is used by tests and the smoke test only. It is not a planning tool; those come in later sprints.

## 3. Key files and core functions

### `realSystem.ts`

- `REAL_SYSTEM_RANGE_JD`: 3000 BC Jan 1 to 3000 AD Dec 31, the tables' validity.
- **`generateRealSystem(epochJd)`**: throws `RangeError` outside the range.
- `planetMeanElements(row, epochJd)` and `satelliteMeanElements(row, epochJd)`: the two conversions, exported for tests.

### `scenario.ts`

- `SANDBOX_EPOCH_JD` = 2 462 502.5 (2030-01-01 00:00 TDB).
- **`createSandboxWorld()`**: the real system at that epoch, the clock at 0, and the sandbox ships as `ship-1` to `ship-3`.

### `sandboxShips.ts`

- **`sandboxShips(sys)`**: Kestrel (400 km circular, 51.6°, Earth), Tern (300 × 35 786 km, 28.5°, Earth) and Heron (100 km circular lunar orbit). All are Starships, at t = 0 (S3-13).
- `OrbitInput`: an orbit as the spawn form's fields: parent, periapsis altitude, e, i, Ω, ω, ν, and the reference plane (`'equator'` or `'ecliptic'`).
- **`orbitFromInput(sys, input, t)`**: turns those fields into an `OrbitState`, rotating from the parent's equator into ecliptic axes when asked.
- Spawn presets (S3-14): `SPAWN_PRESETS` lists LEO (400 km), LEO (lunar plane), low lunar orbit (100 km), Earth escape (v∞ 3 km/s), To the Moon, and Suborbital (impacts within one orbit). `presetInput(sys, preset)` gives the form's fields for the fixed ones. The two computed presets depend on where the Moon is at `t`, so `presetOrbit(sys, preset, t)` computes them as a state:
  - `'to-the-moon'`: a transfer from a 200 km periapsis in the Moon's plane, its apoapsis aimed at the Moon's position at arrival by fixed-point iteration, then offset to give a lunar flyby near 1000 km;
  - `'leo-lunar-plane'`: a 200 km circular orbit in the Moon's plane under the Moon, the parking orbit for a trans-lunar injection by hand (S4-19).
  `isComputedPreset(p)` tells the two kinds apart.

### `lunarMission.ts`

- `findTli(sys, start, opts)`: scans departure times over one orbit and prograde Δv over a range, bisects each bracket of lunar periapsis altitude around 200 km, and returns the cheapest `Tli { dt, dv, lunarPeriapsisAltitude, tEnter }` in the 100 to 300 km band. Times are rounded to seconds and Δv to 1 mm/s, so the smoke test can type them.
- `tliNode(start, tli)` makes the node; `lunarArrival(sys, start, node)` evaluates a single-node plan.
- `SMOKE_TLI` is the result for the lunar-plane preset at the sandbox epoch, which the smoke test types into the node editor.

## 4. Testing

`realSystem.test.ts` is the main check of the whole orbital stack against reality:

- the 31 bodies, their parents and classes, and which are major;
- validity at 20 epochs across the range, and refusal outside it;
- each planet within the tables' published error of Horizons at five epochs from 1000 BC to 2950, and Earth on the Earth–Moon barycentre;
- the linearisation error over spans of years;
- each moon's distance (and angle, where the fit allows) from its parent against Horizons at J2000 and 2025;
- sanity checks: periods against Kepler's third law, the Moon's regressing node and advancing perigee, spin rates and poles (Venus and Uranus backwards, Earth's sidereal day);
- the body tree's exact sums, velocities against finite differences, and JSON round trips on the real data.

`sandboxShips.test.ts` checks each ship's orbit and each preset's outcome (Earth escape in 2 to 6 days, To the Moon entering the Moon's SOI and flying by above the surface, Suborbital impacting within a period), and round trips of `orbitFromInput`. `lunarMission.test.ts` checks that `findTli` finds a low lunar periapsis and that `SMOKE_TLI` still gives a Moon encounter.

## 5. Recipes

**Updating a data row:** change the transcription in `data/` to match the source exactly, in the source's units, and update the header's retrieval date. Run `npm test`: the Horizons comparisons will show whether the result still fits.

**A new real body:** add its physical row to `data/physical.ts` and its elements to `data/satellites.ts` (or the planet table), with sources. The contents test counts the bodies, so update it too.

**A new spawn preset:** add its ID to `SpawnPreset` and `SPAWN_PRESETS`. A fixed orbit gets a case in `presetInput`; one that depends on time gets a function called from `presetOrbit` and an entry in `ComputedPreset`. Add an outcome test in `sandboxShips.test.ts`.

**A new scenario:** add a `create…World()` beside `createSandboxWorld` that builds a system, a world and its ships the same way. Rules that run during the scenario (goals, failure) belong in `game/`, not here.
