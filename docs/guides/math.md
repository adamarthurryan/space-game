# Guide to the `math/` layer

`src/math/` is the bottom of the layer stack. It holds the general numerical tools every other layer uses: float64 vectors, units and constants, calendar and sim time, root finding, a seeded random number generator and a priority queue. Nothing here knows about orbits, bodies or ships. It imports nothing outside itself (only `time.ts` imports `units.ts`).

This guide describes the code as it stands after milestone 1, sprint 5b. The rules behind it are in [architecture.md](../architecture.md); decisions are cited in the code as `S<sprint>-<n>` (S0-2 is decision 2 of `planning/sprint-0.md`).

## 1. Architecture

| File | What it is |
|---|---|
| `vec3.ts` | `Vec3`, a plain `{ x, y, z }` float64 vector, and its operations |
| `units.ts` | Internal units, physical constants, angle wrapping, unit conversions |
| `time.ts` | Julian dates, calendar dates and sim time (TDB, no UTC) |
| `roots.ts` | Bisection, Brent's method, and a scan for the first bracket |
| `rng.ts` | sfc32 seeded generator with forkable named streams |
| `pqueue.ts` | Binary min-heap on (key, seq), the base of the sim event queue |

Three properties hold for every module, and the rest of the code base relies on them:

- **Plain data.** `Vec3`, `Rng` and `PQueue` are plain objects with no class, prototype or closure. They can be stored in the world, cloned with `structuredClone`, and saved as JSON, and a JSON round trip resumes them exactly (S0-6).
- **Deterministic.** The lint bans `Math.random`, `Date`, `Date.now`, `performance.now` and `crypto.getRandomValues` in this layer and in every layer below `store/`. Randomness comes from `rng.ts` and time from the sim clock.
- **No frameworks.** No React, three.js or zustand. That rule also covers every layer below `store/`.

## 2. Common patterns

- **Pure functions, plus `…Into` variants for hot loops.** `add(a, b)` returns a new vector. `addInto(out, a, b)` writes into `out` and returns it, and `out` may alias an input. Per-frame code in `orbital/`, `sim/` and `render/` uses the `…Into` forms with module-level scratch vectors, so it allocates nothing.
- **Internal units everywhere (S0-9):** km, s, kg, km/s and radians. Conversions to display units happen only at the edges: `units.ts` has `toKm`/`fromKm` and their siblings, and display formatting lives in `ui/format.ts`.
- **Errors split by kind.** Programming errors (no sign change in a bracket, a non-finite key, bad `int` bounds) throw `RangeError`. Expected outcomes, such as running out of iterations, are reported in the result (`converged: false`).

## 3. Key files and core functions

### `vec3.ts`

- `Vec3`, `vec3(x, y, z)`, `clone`, and frozen constants `ZERO`, `X_AXIS`, `Y_AXIS`, `Z_AXIS`.
- Pure: `add`, `sub`, `scale`, `addScaled` (a + b·s), `negate`, `lerp`, `cross`, `normalize` (zero stays zero), `rotateX`, `rotateZ`.
- Scalars: `dot`, `norm`, `normSq`, `distance`, `angleBetween` (atan2 of |a×b| and a·b, accurate near 0 and π), `equalsApprox`.
- Hot loop: `addInto`, `subInto`, `scaleInto`, `addScaledInto`.

### `units.ts`

- Constants: `M_PER_KM`, `AU_KM` (IAU 2012), `SECONDS_PER_MINUTE/HOUR/DAY`, `SECONDS_PER_JULIAN_YEAR`, `G` (km³ kg⁻¹ s⁻²), `G0` (standard gravity in km/s², for the rocket equation), `DEG`, `TWO_PI`.
- `wrapTwoPi(angle)` to [0, 2π) and `wrapPi(angle)` to (−π, π]. Both avoid rounding traps: −0 becomes +0, a tiny negative angle doesn't wrap to exactly 2π, and an angle already in (−π, π] is returned as is.
- `toKm`/`fromKm`, `toKmPerS`/`fromKmPerS`, `toKg`/`fromKg`, `toSeconds`/`fromSeconds` with unit types `DistanceUnit`, `SpeedUnit`, `MassUnit` and `DurationUnit`. Conversions to the smaller unit divide rather than multiply by the reciprocal, so m ↔ km round trips are exact.

### `time.ts`

Sim time `t` is TDB seconds from the scenario epoch. The epoch is a TDB Julian date (`BodySystem.epochJd`). There is no UTC and there are no leap seconds (S1-2, S1-14).

- `J2000_JD`, `DAYS_PER_JULIAN_CENTURY`, `SECONDS_PER_JULIAN_CENTURY`.
- `jdFromCalendar(d)` and `calendarFromJd(jd)`: Meeus's algorithm, with the Julian calendar before 1582-10-15, the Gregorian after, and astronomical year numbering (year 0 = 1 BC). `calendarFromJd` rounds to the millisecond so 12:00:00 doesn't print as 11:59:59.999.
- `jdFromSimTime(epochJd, t)` and `simTimeFromJd(epochJd, jd)`. These are for display and for setting up epochs. The sim never round-trips `t` through a JD, which would cost precision (about 40 µs at JD 2.46 × 10⁶).
- `centuriesSinceJ2000(jd)`: the `T` of JPL's tables.

### `roots.ts`

- `bisect(f, a, b, opts)` and `brent(f, a, b, opts)` return a `RootResult` (`x`, `fx`, `iterations`, `converged`). The bracket must change sign, or they throw. `xtol` defaults to 1e-12 and `maxIter` to 200. `brent` is Forsythe, Malcolm and Moler's `zeroin`.
- `findFirstBracket(f, a, b, steps)` samples at equal steps and returns the first interval with a sign change, or `null`. Non-finite samples never form a bracket. Nothing calls it yet: the SOI entry search in `orbital/soi.ts` uses its own conservative stepping instead.

`orbital/kepler.ts` falls back to `brent` in the universal-variable solver, and `orbital/soi.ts` uses it to refine SOI entries.

### `rng.ts`

An `Rng` is `{ path, a, b, c, d }`: an sfc32 state plus the path that names its stream (S0-6, S0-7).

- `createRng(seed)`: `createRng(42)` and `createRng('42')` are the same stream.
- `fork(rng, label)` gives the child stream `${path}/${label}`. It is seeded from the path alone, never from how many numbers the parent has drawn, so drawing more in one subsystem never changes another's stream. Labels must be non-empty and must not contain `/`.
- Draws (these advance the state in place): `nextUint32`, `next` ([0, 1)), `range(min, max)`, `int(min, maxInclusive)` (rejection sampling, no modulo bias), `chance(p)`, `pick(items)`, `shuffle(items)` (returns a copy), `normal(mean, sd)` (Box–Muller, one result per call).

Nothing uses the generator yet. It is there for the fictional systems and scenario generation of later milestones. When you add random generation, fork a stream per subsystem (`fork(rng, 'moons')`), and keep the `Rng` in the world if it must survive a save.

### `pqueue.ts`

A `PQueue<T>` is `{ heap, nextSeq }`, a binary min-heap ordered by `(key, seq)`. Equal keys come out in insertion order, which keeps simultaneous sim events deterministic.

- `createPQueue`, `push(q, key, value)` (returns the `seq`, a handle; throws on a non-finite key), `peek`, `pop`, `size`.
- `remove(q, seq)` removes by handle; `removeWhere(q, pred)` removes every match and re-heapifies; `clear(q)`. Handles are never reused.

`sim/events.ts` keeps the event queue as a `PQueue<SimEvent>` keyed by sim time, and uses `removeWhere` to replace a ship's pending event.

## 4. Testing

Each module has a `*.test.ts` next to it, run by Vitest in the node environment. The tests check round trips (calendar ↔ JD, unit conversions), heap invariants after random operations, rng reproducibility and fork independence, and root finding on hard cases. A new function needs a test of the same kind.

## 5. Recipes

**A new vector operation:** add the pure form, and an `…Into` form if a per-frame loop needs it. Keep `out` safe to alias.

**A new unit:** add it to the unit type and its `…_PER` table in `units.ts`, and a matching parser and formatter in `ui/parse.ts` and `ui/format.ts` if players will type or read it.

**Random generation in a new subsystem:** take an `Rng`, `fork` it with a fixed label, and draw only from the fork.
