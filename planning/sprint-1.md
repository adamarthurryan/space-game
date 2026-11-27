# Sprint 1 — Orbital math and the real solar system (headless): detailed plan

This expands [sprint 1](milestone-1-sprints.md#sprint-1--orbital-math-and-the-real-solar-system-headless) of milestone 1. Module paths follow the source layout in [architecture.md](../docs/architecture.md#layered-structure).

**Goal:** correct positions of every major body at any time in the scenario range, tested without rendering. By the end of the sprint, `orbital/` can convert between state vectors and elements and propagate any conic. `sim/body.ts` can place every body and move states between body frames. `gen/realSystem.ts` builds the real solar system for any epoch from 3000 BC to 3000 AD.

**Out of scope:** anything visible (the map is sprint 2, so `src/render/` and `src/ui/` don't change); `sim/world.ts`, the clock and the event queue (sprint 3); ship trajectories and SOI crossing detection (sprint 3); asteroids and Ceres (sprint 8); Lagrange points and Lambert (sprint 8); showing equator-relative inclinations (sprint 2's inspector) and using them in tools (sprint 7), though the pole data they need arrives now (S1-16); n-body perturbations and light-time correction (never: bodies are on rails).

## Decisions made for this sprint

| #     | Topic                     | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1-1  | World frame               | **Heliocentric ecliptic and mean equinox of J2000** (the frame Horizons calls "ecliptic", obliquity 84381.448″). The Sun is the root, fixed at the origin, because the JPL table is heliocentric. Every body frame is non-rotating, with axes parallel to the world frame, so a change of frame is a translation in position and velocity, with no rotation.                                                                                                                                            |
| S1-2  | Time scale                | Sim time `t` is TDB seconds from the scenario epoch. The epoch is stored as a Julian date (TDB), `epochJd`. There is no UTC and there are no leap seconds. Sprint 2 shows dates as if they were UTC, which is about 69 s off and below the display precision.                                                                                                                                                                                                                                           |
| S1-3  | Planet source             | **JPL Table 2a only** (valid 3000 BC–3000 AD), with the Table 2b extra terms (`b`, `c`, `s`, `f`) for Jupiter–Pluto. The generator evaluates the table at the scenario epoch and stores the elements at `t = 0` plus linear rates (the derivative at the epoch, extra terms included). An epoch outside the table's range is refused with `RangeError`.                                                                                                                                                 |
| S1-4  | Earth and the barycentre  | The table gives the Earth–Moon barycentre (EMB). **Earth is placed on the EMB's orbit**, about 4,700 km from the true Earth, and the Moon orbits Earth. The offset is smaller than the table's own stated error for the EMB, and it keeps the body tree a plain tree. There are no barycentre nodes.                                                                                                                                                                                                                 |
| S1-5  | Orbits on rails           | A body's orbit is a set of **mean elements**: elliptic elements at `t = 0`, an explicit mean motion `n`, and optional linear secular rates for `a`, `e`, `i`, `Ω` and `ω`. `M(t) = M₀ + n·t`. The state at `t` comes from the elements at `t`. Its velocity uses `μ_eff = n²a³`, so it is consistent with the motion (for the Moon, this is effectively `G(M⊕ + M☾)`). The contribution of the rates to velocity is ignored; it is several orders of magnitude below the orbital velocity.                          |
| S1-6  | Reference planes          | Elements are given relative to a reference plane, defined by its pole's RA and Dec in ICRF. The node is measured from the plane's ascending node on the ICRF equator, which is the convention of the JPL satellite mean elements. If no plane is given, the elements are ecliptic. (The ecliptic itself, with its pole at RA 270°, Dec 90° − ε, gives the identity rotation, and the tests check this.) Planets use the ecliptic. The Moon uses the ecliptic. The other moons use their Laplace planes from the JPL satellite table. |
| S1-7  | Moon accuracy             | Moons use mean elements with apsidal and nodal precession, and nothing else. Solar perturbations (evection, variation) are not modelled, so the Moon is off by up to about 2–3°. This is accepted: the game needs a plausible Moon, not an ephemeris.                                                                                                                                                                                                                                                                       |
| S1-8  | Major / minor threshold   | **10¹⁹ kg.** Minor bodies have no SOI. Phobos and Deimos are the only minor bodies this sprint. (Phobos's Laplace SOI is about 7 km, inside its own 11 km radius.)                                                                                                                                                                                                                                                                                                                                      |
| S1-9  | GM, not mass              | Bodies store `mu` (GM, km³/s²), because GM is known far more precisely than mass. Mass is derived as `mu / G`, for the threshold and for display.                                                                                                                                                                                                                                                                                                                                                     |
| S1-10 | Derived body fields       | `major`, `soiRadius` and `childIds` are computed once by `buildBodySystem` and stored as plain data. They are not recomputed per frame, and a saved system is self-contained.                                                                                                                                                                                                                                                                                                                          |
| S1-11 | Frame transforms          | A state is moved between body frames through the **lowest common ancestor**, never through the Sun unless the frames' common ancestor is the Sun. So Earth ↔ Moon never touches heliocentric magnitudes, which keeps docking-scale precision (see the precision note in [architecture.md](../docs/architecture.md#units-precision-and-rendering-scale)).                                                                                                                                                 |
| S1-12 | Propagation               | Ship states are propagated with **universal variables** (Vallado's algorithm). For elliptic orbits, `dt` is first reduced modulo the period. χ is solved by Newton's method, with a Brent fallback: `t(χ)` is monotonic, so a bracket always exists. Body positions use the elliptic Kepler equation directly (Newton's method), as in the architecture.                                                                                                                                               |
| S1-13 | General elements          | `ConicElements` uses the **semi-latus rectum `p`** and the **true anomaly `ν`**, so that one type covers ellipses, parabolas and hyperbolas. `a`, Pe, Ap and the period are derived. Singular cases: circular (`e < 1e-11`) → `ω = 0` and `ν` is the argument of latitude. Equatorial (`i < 1e-11` or `π − i < 1e-11`) → `Ω = 0` and `ω` is the longitude of periapsis. Circular and equatorial → `ν` is the true longitude.                                                                       |
| S1-14 | Calendar                  | `math/time.ts` converts between Julian date and calendar date with Meeus's algorithm: Gregorian from 1582-10-15, Julian before that, with astronomical year numbering (year 0 = 1 BC). It doesn't use `Date`, which the determinism lint forbids anyway.                                                                                                                                                                                                                                                              |
| S1-15 | Catalogue data location   | The source tables are typed data files in `gen/data/`, transcribed **verbatim** in the source's units (AU, degrees, per century, deg/day), so they can be diffed against JPL's pages. All conversion is done in code. They are generator inputs, not game content, so they live in `gen/` and not in `content/`.                                                                                                                                                                                              |

| S1-16 | Spin poles and rotation   | Every body that has IAU rotation elements stores its **north pole** (RA and Dec at J2000, ICRF) and its **prime meridian** (`W` at `t = 0` and the rotation rate). The values come from the IAU WGCCRE report. Only the constant and linear terms are kept: pole precession and the periodic terms for moons are dropped (S1-17). The IAU's pole conventions are kept as given: for planets, the north pole is on the north side of the invariable plane, and retrograde rotators (Venus, Uranus) have a negative rate. Equator-relative inclination (for example, the ISS at 51.6°) is computed from the pole in sprint 2. |
| S1-17 | Accuracy is not a goal    | The game needs a plausible solar system, not an ephemeris. The Horizons comparisons exist to **catch implementation errors** (units, frame conventions, the signs of rates), not to certify accuracy. So their bounds are set generously, above the model's known error. A model is improved only when an error is visible in play. Far from J2000, the moons' phases are plausible but unchecked, and that is accepted. |

These should be copied into [decisions.md](../docs/decisions.md) at the end of the sprint.

## Files to create

```
src/
  math/
    time.ts           time.test.ts          Julian date, calendar, J2000
  orbital/
    kepler.ts         kepler.test.ts        scalar: Stumpff, Kepler's equation, anomalies, universal χ
    elements.ts       elements.test.ts      StateVector, ConicElements, MeanElements, conversions
    propagate.ts      propagate.test.ts     state propagation; state from mean elements at t
    frames.ts         frames.test.ts        ecliptic/equatorial, reference-plane rotations, translations
    soi.ts            soi.test.ts           Laplace SOI radius
  sim/
    body.ts           body.test.ts          Body, BodySystem, tree, positions, frame changes
  gen/
    realSystem.ts     realSystem.test.ts    generateRealSystem(epochJd)
    data/
      jplPlanets.ts                         Tables 2a and 2b, verbatim
      satellites.ts                         JPL satellite mean elements, verbatim
      physical.ts                           GM, mean radius, atmosphere height, name, class, pole and rotation
    fixtures/
      horizons.ts                           pinned Horizons state vectors, with the query used
```

Also update:

- `test/lint/layers.test.ts`: the cases deferred from sprint 0 (see [Lint rules](#lint-rules)).
- [CLAUDE.md](../CLAUDE.md): the current status.
- [architecture.md](../docs/architecture.md): the [Celestial bodies](../docs/architecture.md#celestial-bodies) section, with the frame convention (S1-1), mean elements (S1-5) and the stored body fields (S1-10). Also correct "JPL table" to "Tables 2a/2b", and note that Earth sits at the EMB (S1-4).

## Interfaces and data models

Units: `km`, `s`, `kg`, `km/s`, angles in radians, unless a data file says otherwise. All modules are pure TypeScript.

### `math/time.ts`

```ts
export const J2000_JD = 2_451_545.0; // 2000-01-01 12:00 TDB
export const DAYS_PER_JULIAN_CENTURY = 36_525;
export const SECONDS_PER_JULIAN_CENTURY = 3_155_760_000;

export interface CalendarDate {
  year: number; // astronomical: 0 = 1 BC, −1 = 2 BC
  month: number; // 1–12
  day: number; // 1–31
  hour: number;
  minute: number;
  second: number; // may be fractional
}

export function jdFromCalendar(d: CalendarDate): number; // Julian before 1582-10-15, Gregorian after
export function calendarFromJd(jd: number): CalendarDate;
export function jdFromSimTime(epochJd: number, t: number): number;
export function simTimeFromJd(epochJd: number, jd: number): number;
export function centuriesSinceJ2000(jd: number): number; // the table's T
```

A JD near 2.46 × 10⁶ has a float64 resolution of about 40 µs, which is fine for epochs and display. Sim time itself stays in seconds from the epoch, and never round-trips through JD in the sim.

### `orbital/kepler.ts` (scalar math, no vectors)

```ts
export function stumpffC2(psi: number): number; // series for |ψ| < 1e-3, closed forms otherwise
export function stumpffC3(psi: number): number;

/** Kepler's equation M = E − e sin E, 0 ≤ e < 1. Newton's method, with a starting guess that converges for e → 1. */
export function solveKeplerElliptic(M: number, e: number): number;
/** M = e sinh H − H, e > 1. */
export function solveKeplerHyperbolic(M: number, e: number): number;

export function trueFromEccentric(E: number, e: number): number;
export function eccentricFromTrue(nu: number, e: number): number;
export function meanFromEccentric(E: number, e: number): number;
export function trueFromHyperbolic(H: number, e: number): number;
export function hyperbolicFromTrue(nu: number, e: number): number;
export function meanFromHyperbolic(H: number, e: number): number;

/** Dispatch on e: elliptic, parabolic (Barker: M = D + D³/3, D = tan(ν/2)) or hyperbolic. */
export function trueFromMean(M: number, e: number): number;
export function meanFromTrue(nu: number, e: number): number;

export interface UniversalSolution {
  chi: number; // universal anomaly, km^½
  psi: number; // α·χ²
  c2: number;
  c3: number;
  r: number; // |r| at dt, km
  iterations: number;
}

/**
 * Solves the universal Kepler equation for χ at time dt.
 * r0 = |r₀|, sigma0 = r₀·v₀ / √μ, alpha = 1/a = 2/r₀ − v₀²/μ (0 for a parabola).
 * Newton's method; if it hasn't converged after 50 iterations, falls back to Brent's method on a bracket.
 */
export function solveUniversal(
  mu: number,
  r0: number,
  sigma0: number,
  alpha: number,
  dt: number,
): UniversalSolution;
```

Kepler's equation lives here rather than in `math/roots.ts` because it's specific to this equation (sprint 0 plan). The Brent fallback imports `math/roots.ts`.

### `orbital/elements.ts`

```ts
import type { Vec3 } from '../math/vec3';

/** Position and velocity relative to some body, in world-parallel axes. Plain data. */
export interface StateVector {
  r: Vec3; // km
  v: Vec3; // km/s
}

/** Osculating elements of any conic. */
export interface ConicElements {
  p: number; // semi-latus rectum, km (h²/μ)
  e: number;
  i: number; // [0, π]
  lan: number; // Ω, [0, 2π)
  argp: number; // ω, [0, 2π)
  nu: number; // true anomaly, (−π, π]
}

/** Reference plane by its pole in ICRF; the node is measured from its ascending node on the ICRF equator (S1-6). */
export interface ReferencePlane {
  poleRa: number;
  poleDec: number;
}

/** A body's orbit on rails (S1-5). Elliptic only. Plain data. */
export interface MeanElements {
  a: number;
  e: number;
  i: number;
  lan: number;
  argp: number;
  meanAnomaly: number; // M₀, at t = 0
  meanMotion: number; // n, rad/s
  rates?: { a?: number; e?: number; i?: number; lan?: number; argp?: number }; // per second
  plane?: ReferencePlane; // absent = ecliptic
}

export const CIRCULAR_E = 1e-11;
export const EQUATORIAL_I = 1e-11;

export function elementsFromState(mu: number, s: StateVector): ConicElements;
export function stateFromElements(mu: number, el: ConicElements): StateVector;

export type ConicKind = 'elliptic' | 'parabolic' | 'hyperbolic';
export function conicKind(e: number): ConicKind; // parabolic when |e − 1| < 1e-12

// Derived values, for display and planning. Infinity where undefined (never stored).
export function semiMajorAxis(el: ConicElements): number; // negative for hyperbolas, Infinity for a parabola
export function periapsis(el: ConicElements): number;
export function apoapsis(el: ConicElements): number; // Infinity for e ≥ 1
export function period(mu: number, el: ConicElements): number; // Infinity for e ≥ 1
export function specificEnergy(mu: number, s: StateVector): number;
export function angularMomentum(s: StateVector): Vec3;
```

### `orbital/propagate.ts`

```ts
/** Universal-variable propagation of any conic, for any sign of dt (S1-12). */
export function propagate(mu: number, s0: StateVector, dt: number): StateVector;

/** As propagate, writing into out (for sprint 3's hot loops). out may alias s0. */
export function propagateInto(out: StateVector, mu: number, s0: StateVector, dt: number): StateVector;

/** The elements of a mean-element orbit at t (rates applied, angles wrapped). */
export function meanElementsAt(m: MeanElements, t: number): MeanElements;

/** State at t relative to the parent, in world axes (plane rotation applied). */
export function stateFromMeanElements(m: MeanElements, t: number): StateVector;
```

### `orbital/frames.ts`

```ts
export const OBLIQUITY_J2000: number; // 84381.448″ in rad; matches Horizons' ecliptic frame

export function equatorialToEcliptic(v: Vec3): Vec3;
export function eclipticToEquatorial(v: Vec3): Vec3;

/** Rotation from a reference plane's axes (x = its node on the ICRF equator, z = its pole) to ecliptic axes. */
export function planeToEcliptic(plane: ReferencePlane, v: Vec3): Vec3;
export function eclipticToPlane(plane: ReferencePlane, v: Vec3): Vec3;
export function planePole(plane: ReferencePlane): Vec3; // unit vector, ecliptic axes

/** Translation between parallel frames: s relative to the origin's frame → s relative to the outer frame. */
export function addState(s: StateVector, origin: StateVector): StateVector;
export function subState(s: StateVector, origin: StateVector): StateVector;
```

`planeToEcliptic` is `Rx(−ε) · Rz(α + π/2) · Rx(π/2 − δ)`, built from `vec3.rotateX` and `rotateZ`, with no matrix type. Tree walks are in `sim/body.ts`, because `orbital/` can't import the body tree.

### `orbital/soi.ts`

```ts
/** Laplace SOI radius a·(m/M)^(2/5), with the mass ratio taken as the GM ratio. */
export function laplaceSoiRadius(a: number, muBody: number, muParent: number): number;
```

### `sim/body.ts`

```ts
export type BodyId = string; // 'sun', 'earth', 'moon', …
export type BodyClass = 'star' | 'planet' | 'dwarf-planet' | 'moon'; // sprint 8 adds 'asteroid'

/** Spin axis and prime meridian (S1-16). Plain data. */
export interface BodyRotation {
  pole: ReferencePlane; // the equator's pole: RA and Dec at J2000, ICRF; the equator is the plane
  w0: number; // prime meridian angle W at t = 0, rad
  wRate: number; // rad/s; negative for retrograde rotators
}

/** The inputs a generator supplies. */
export interface BodyInput {
  id: BodyId;
  name: string;
  class: BodyClass;
  parentId: BodyId | null; // null only for the root
  mu: number; // km³/s²
  radius: number; // mean radius, km
  atmosphereHeight: number; // km above radius at which an impact happens (sprint 3); 0 if none
  orbit?: MeanElements; // relative to the parent; absent only for the root
  rotation?: BodyRotation; // absent if the IAU gives no rotation elements
}

/** A body in the system. Plain data. */
export interface Body extends BodyInput {
  // Derived by buildBodySystem (S1-10):
  major: boolean; // mass ≥ MAJOR_MASS_THRESHOLD_KG; the root is always major
  soiRadius?: number; // major non-root bodies only
  childIds: BodyId[]; // ordered by semi-major axis
}

export interface BodySystem {
  epochJd: number; // TDB Julian date of t = 0 (S1-2)
  rootId: BodyId;
  bodies: Record<BodyId, Body>;
}

export const MAJOR_MASS_THRESHOLD_KG = 1e19;

/** Derives major, soiRadius and childIds, then validates. Throws with every validation error listed. */
export function buildBodySystem(epochJd: number, inputs: readonly BodyInput[]): BodySystem;
/** Returns the problems found; [] if valid. */
export function validateBodySystem(sys: BodySystem): string[];

export function getBody(sys: BodySystem, id: BodyId): Body; // throws on an unknown ID
export function bodyMass(b: Body): number; // kg
export function soiRadiusOf(b: Body): number; // Infinity for the root, 0 for a minor body
export function majorChildren(sys: BodySystem, id: BodyId): Body[];
export function ancestors(sys: BodySystem, id: BodyId): BodyId[]; // parent first, root last
export function commonAncestor(sys: BodySystem, a: BodyId, b: BodyId): BodyId; // a body counts as its own ancestor

export function bodyLocalState(sys: BodySystem, id: BodyId, t: number): StateVector; // relative to its parent
export function bodyWorldState(sys: BodySystem, id: BodyId, t: number): StateVector; // heliocentric, summed up the tree
export function bodyPole(b: Body): Vec3 | undefined; // unit north pole, ecliptic axes (via frames.planePole)
export function rotationAngle(b: Body, t: number): number | undefined; // W at t, wrapped to [0, 2π)
/** The state of body `id` relative to body `frameId`, through the common ancestor (S1-11). */
export function bodyStateIn(sys: BodySystem, id: BodyId, frameId: BodyId, t: number): StateVector;
/** Moves a state relative to `fromId` into the frame of `toId`, through the common ancestor. */
export function changeFrame(
  sys: BodySystem,
  s: StateVector,
  fromId: BodyId,
  toId: BodyId,
  t: number,
): StateVector;
```

**Validation** (`validateBodySystem`): exactly one root, of class `star`. Every key equals its body's `id`. Every `parentId` exists, and every body reaches the root (no cycles). An orbit is present exactly when the body is not the root. `mu > 0`, `radius > 0`, `0 ≤ e < 1`, `a > 0`, `n > 0`. Each `childIds` entry matches the parent links. For each orbit: periapsis > parent radius + parent atmosphere height, and apoapsis < parent SOI (for non-root parents). For each major non-root body: `soiRadius > radius`. The last two are sanity checks that catch unit mistakes (a moon's `a` in AU, a GM in m³/s²).

`BodySystem` becomes a field of the world in sprint 3 (`world.ts`). Allocation-free variants (`bodyWorldStateInto`) are added in sprint 2, if the render loop needs them.

### `gen/realSystem.ts` and its data

```ts
export const REAL_SYSTEM_RANGE_JD: readonly [min: number, max: number]; // 3000 BC Jan 1 – 3000 AD Dec 31
/** Throws RangeError outside REAL_SYSTEM_RANGE_JD. Deterministic: same epoch → deep-equal result. */
export function generateRealSystem(epochJd: number): BodySystem;

/** Exported for tests: a Table 2a/2b row evaluated at epochJd, as mean elements with rates (S1-3). */
export function planetMeanElements(row: PlanetRow, epochJd: number): MeanElements;
/** Exported for tests: a satellite row propagated from its epoch (J2000) to epochJd. */
export function satelliteMeanElements(row: SatelliteRow, epochJd: number): MeanElements;
```

**`gen/data/jplPlanets.ts`**: from [JPL Approximate Positions of the Planets](https://ssd.jpl.nasa.gov/planets/approx_pos.html), Tables 2a and 2b.

```ts
export interface PlanetRow {
  id: 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto';
  a: number; e: number; I: number; L: number; varpi: number; node: number;               // AU, deg
  aDot: number; eDot: number; IDot: number; LDot: number; varpiDot: number; nodeDot: number; // per century
  extra?: { b: number; c: number; s: number; f: number }; // Table 2b, Jupiter–Pluto
}
```

The evaluation follows JPL's recipe. `ω = ϖ − Ω`, and `M = L − ϖ + bT² + c·cos(fT) + s·sin(fT)`. `n` is `dM/dt` at the epoch, and the other rates are the table's rates converted to per second. Linearising the extra terms is accurate to well inside the table's error over a century (tested below).

**`gen/data/satellites.ts`**: from [JPL Planetary Satellite Mean Elements](https://ssd.jpl.nasa.gov/sats/elem/), epoch J2000.

```ts
export interface SatelliteRow {
  id: BodyId; parentId: BodyId;
  a: number; e: number; argp: number; M: number; i: number; node: number; // km, deg
  n: number;      // deg/day
  Pw: number;     // apsidal precession period, years
  Pnode: number;  // nodal precession period, years
  plane: 'ecliptic' | { ra: number; dec: number }; // Laplace pole, deg, ICRF
}
```

Check the signs of the precession rates against JPL's notes. A prograde moon has a regressing node and an advancing apse, and the test pins this for the Moon (`Ω̇ < 0`, `ω̇ > 0`).

**`gen/data/physical.ts`**: name, class, GM (JPL planetary and satellite physical parameters), mean radius (IAU), and atmosphere height. GM is the body's own GM, not that of the planet's system. Atmosphere heights are game values for sprint 3's impact check. They are listed with a comment, for example Earth 100 km, Venus 250 km, Mars 125 km, Titan 600 km, gas giants 1,000 km above the 1-bar radius, and 0 for airless bodies and Pluto. Pole and rotation come from the [IAU WGCCRE report](https://astrogeology.usgs.gov/groups/iau-wgccre) (Archinal et al.), as `α₀`, `δ₀` (deg), `W₀` (deg) and `Ẇ` (deg/day), with only the constant and linear terms (S1-16). The generator converts `W` to its value at the scenario epoch, in rad and rad/s, as it does for the orbits.

**Bodies (31):**

| Parent  | Bodies                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------- |
| Sun     | Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto (`dwarf-planet`)              |
| Earth   | Moon                                                                                              |
| Mars    | Phobos, Deimos (minor)                                                                            |
| Jupiter | Io, Europa, Ganymede, Callisto                                                                    |
| Saturn  | Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus                                             |
| Uranus  | Miranda, Ariel, Umbriel, Titania, Oberon                                                          |
| Neptune | Triton (retrograde)                                                                               |
| Pluto   | Charon                                                                                            |

### `gen/fixtures/horizons.ts`

Reference state vectors from the [Horizons API](https://ssd.jpl.nasa.gov/api/horizons.api). The settings are `EPHEM_TYPE=VECTORS`, `REF_PLANE=ECLIPTIC`, `REF_SYSTEM=ICRF`, `OUT_UNITS=KM-S`, `TIME_TYPE=TDB` and `VEC_TABLE=2`. Each entry records its target, centre and JD, and the file header records the query URL and the date it was captured. The values are pinned in the file, so the tests never use the network.

- **Planets:** targets 199, 299, 3 (EMB), 499, 599, 699, 799, 899, 999, centred on the Sun (`500@10`). Five epochs: 1000 BC Jan 1, J2000, 2050 Jan 1, 2500 Jan 1 and 2950 Jan 1. They are spread across the scenario range, because Table 2a's error varies along it.
- **Earth:** target 399 at J2000, for the EMB offset check (S1-4).
- **Moons:** every moon in the table above, centred on its parent (`500@399`, `500@599`, …), at J2000 and at 2025 Jan 1.

## Tests

All tests use Vitest's node environment. Randomised tests are driven by `math/rng.ts` with a fixed seed. Tolerances follow decision 51: about 3e-8 km of float64 resolution at 1 AU.

### `math/time.test.ts`

- `jdFromCalendar` matches Meeus's worked examples. J2000 (2000-01-01 12:00) → 2451545.0. 1957-10-04.81 → 2436116.31. 333-01-27 12:00 (Julian calendar) → 1842713.0. −4712-01-01 12:00 → 0.
- The Gregorian switch: 1582-10-04 and 1582-10-15 are consecutive days.
- `calendarFromJd ∘ jdFromCalendar` round-trips 10,000 random dates across 3000 BC–3000 AD, to within 1 ms.
- `centuriesSinceJ2000(J2000_JD) = 0`. Converting sim time to JD and back round-trips.

### `orbital/kepler.test.ts`

- **Textbook cases:** Vallado (*Fundamentals of Astrodynamics and Applications*) Example 2-1 (elliptic Kepler's equation), Curtis (*Orbital Mechanics for Engineering Students*) Examples 3.1 and 3.2 (elliptic), 3.5 (hyperbolic) and the parabolic example. The values are transcribed into the test, with the edition noted.
- **Elliptic solver:** for 10,000 random `(M, e)` with `e ∈ [0, 0.999999]` and `M ∈ [−π, π]`, the residual `|E − e sin E − M|` is below 1e-13 and the solver converges in fewer than 30 iterations. `e = 0` gives `E = M`.
- **Hyperbolic solver:** residual below 1e-12 (relative to `|M|`) for `e ∈ (1, 100]` and `|M|` up to 1e4.
- **Anomalies:** true ↔ eccentric ↔ mean round trips for elliptic and hyperbolic orbits. `trueFromMean` and `meanFromTrue` are inverses, including at `e = 1` (Barker) and near it.
- **Stumpff:** `c2` and `c3` are continuous across the switch to the series (|ψ| = 1e-3) and at ψ = 0 (`½`, `⅙`), and they are finite for large negative ψ.
- **Universal χ:** `solveUniversal` agrees with the anomaly-based solution for elliptic, parabolic and hyperbolic cases. Forcing the fallback path (a hard case at 1 iteration) gives the same χ.

### `orbital/elements.test.ts`

- **Textbook cases:** Curtis Example 4.3 (state → elements) and Example 4.7 (elements → state, hyperbolic), and Vallado Examples 2-5 and 2-6.
- **Round trips:** 10,000 random states (elliptic, hyperbolic, near-parabolic, prograde and retrograde), `stateFromElements(elementsFromState(s))` ≈ `s` to 1e-10 relative.
- **Singular cases:** circular, equatorial, circular-equatorial, retrograde equatorial (`i = π`) and exactly parabolic (`e = 1`) states round-trip, and follow the conventions of S1-13. Elements are finite (no `NaN`) for every case.
- **Derived values:** Pe, Ap, `a` and the period for a known orbit. `a < 0` for a hyperbola. Ap and the period are `Infinity` for `e ≥ 1`.

### `orbital/propagate.test.ts`

- **Textbook case:** Vallado Example 2-4 (universal-variable propagation of an Earth orbit by 40 minutes), and Curtis Example 3.7.
- **Invariants,** for random elliptic, hyperbolic and near-parabolic states: energy and angular momentum are conserved to 1e-12 relative. Propagating forward then back returns the start. `propagate(dt₁ + dt₂)` equals `propagate(dt₁)` then `propagate(dt₂)`. `dt = 0` is the identity.
- **Long times:** a LEO state propagated by 1e9 s (about 30 years, 175,000 orbits) matches the analytic position from the mean anomaly to 1e-6 km. An elliptic orbit propagated by exactly `N` periods returns to the start.
- **Parabolic:** an exactly parabolic state agrees with Barker's equation. States with `e = 1 ± 1e-9` give positions within metres of the parabolic one after a day, so there's no blow-up at the boundary.
- **Hyperbolic:** agrees with the hyperbolic Kepler's equation. A heliocentric escape propagated by 1e9 s gives finite results with no overflow.
- **Radial trajectory** (`h = 0`): no `NaN`, and energy is conserved until near the singularity.
- `propagateInto` matches `propagate`, including when `out` aliases `s0`.
- **Mean elements:** with no rates, `stateFromMeanElements` is periodic with `2π/n`. At `t = 0`, it agrees with `stateFromElements` for the same elements. With rates, `meanElementsAt` applies them linearly and wraps the angles. The velocity matches the central difference of the position (`h = 1 s`) to 1e-6 relative.

### `orbital/frames.test.ts`

- Equatorial ↔ ecliptic are inverses. The equinox (`x`) is unchanged. The angle between the poles is `OBLIQUITY_J2000`.
- The ecliptic as a reference plane (RA 270°, Dec 90° − ε) gives the identity rotation, to 1e-15.
- A plane with its pole at Dec 90° (the ICRF equator) gives the same result as `equatorialToEcliptic`.
- `planePole(plane)` is the image of `z`. The rotations preserve the norm, and `eclipticToPlane` inverts `planeToEcliptic`.
- `addState` and `subState` are inverses.

### `orbital/soi.test.ts`

Using the real GMs and semi-major axes: Earth (around the Sun) ≈ 9.25e5 km, Moon ≈ 6.6e4 km, Mars ≈ 5.8e5 km, Jupiter ≈ 4.82e7 km, Neptune ≈ 8.7e7 km, each within 2%. Phobos's SOI is smaller than its radius.

### `sim/body.test.ts`

Tested on a small hand-built system (a star, two planets and two moons) and on the real system.

- **Build:** `childIds` are ordered by `a`. `major` follows the threshold. The root and minor bodies have no `soiRadius`, `soiRadiusOf(root)` is `Infinity`, and a minor body is not in `majorChildren`.
- **Validation:** each rule has a failing case: two roots, a missing parent, a cycle, `e ≥ 1`, a key that doesn't match the ID, a moon whose apoapsis is outside its parent's SOI, and a moon whose periapsis is inside its parent. `buildBodySystem` throws, and lists every error.
- **Tree sums:** `bodyWorldState(moon)` is exactly `bodyWorldState(earth) + bodyLocalState(moon)`.
- **Common-ancestor path (S1-11):** `bodyStateIn(sys, 'moon', 'earth', t)` is **bitwise** equal to `bodyLocalState(sys, 'moon', t)`. `bodyStateIn(io, europa)` is exactly `local(io) − local(europa)`. `commonAncestor` covers sibling, ancestor, self and cross-tree cases.
- **Frame changes:** `changeFrame` from Moon to Sun and back returns the state to 1e-6 km. A changeFrame between siblings equals the explicit sum.
- **Plain data:** a JSON round trip of the system deep-equals it, and gives identical positions.
- **Velocity:** for each body, the world velocity matches the central difference of the world position.
- **Rotation:** `rotationAngle` is `w0` at `t = 0`, advances by `wRate·t` and is wrapped. A body without rotation data gives `undefined`. `bodyPole` is a unit vector.

### `gen/realSystem.test.ts`

- **Contents:** the 31 IDs of the body table, with the right parents and classes. Phobos and Deimos are minor, and every other body is major. Pluto is a `dwarf-planet` with Charon as its moon.
- **Determinism:** two calls with the same epoch deep-equal each other.
- **Range:** epochs just outside `REAL_SYSTEM_RANGE_JD` throw `RangeError`. `validateBodySystem` returns `[]` at 20 epochs spread across the range.
- **Planets against Horizons:** at each of the five fixture epochs, each planet's heliocentric position (the EMB for Earth) is within the table's stated maximum error. The angular separation must be within 1.5 × the larger of its RA and Dec errors, and the distance within 1.5 × its `r` error. The factor covers comparing angles in the ecliptic rather than in RA/Dec. The tolerances are transcribed from the JPL page, beside the fixture. The measured errors are logged in a test comment, so regressions are visible.
- **Earth offset:** at J2000, Horizons' Earth (399) is within 5,000 km of the generated Earth (S1-4).
- **Linearisation (S1-3):** a system generated at epoch E and evaluated at E + 100 years agrees with a system generated at E + 100 years, for every planet, to within ¼ of the table's error. This is checked at three epochs, including one where Jupiter's and Saturn's extra terms are near their steepest.
- **Moons against Horizons** (J2000 and 2025): the angle and distance from the parent are within these bounds: the Moon 3° and 6%; the Galilean moons 1° and 1%; the Saturnian and Uranian moons, Triton and Charon 2° and 2%; Phobos and Deimos 5° and 2%. These bounds are for catching bugs (S1-17). A moon that misses its bound most likely has a convention or unit error, so find that error before loosening the bound. A wrong reference-plane convention (S1-6) shows up here as errors of tens of degrees.
- **Moon sanity:** for every moon, the period from `n` agrees with Kepler's third law for the parent's GM to within 1% (this catches unit errors in GM or `a`). The Moon's node regresses and its perigee advances.
- **Spin data sanity:** every body has rotation data, except where the IAU gives none (S1-16), and the exceptions are listed in the test. Earth's pole is within 0.1° of the ICRF pole. The angle between Earth's pole and the ecliptic pole is 23.44° ± 0.1°. Venus and Uranus have `wRate < 0`. The sidereal day from `wRate` is 86,164 s ± 1 s for Earth, and within 1% of the published rotation period for the other planets. Each synchronous moon (the Moon, the Galilean moons, Titan) rotates once per orbit, to within 1%.

### Lint rules

These rows are added to `test/lint/layers.test.ts`, now that the target files exist (deferred from sprint 0):

| File path given        | Code                                             | Expected                  |
| ---------------------- | ------------------------------------------------ | ------------------------- |
| `src/orbital/bad.ts`   | `import { getBody } from '../sim/body'`          | layer error (orbital → sim) |
| `src/sim/bad.ts`       | `import { generateRealSystem } from '../gen/realSystem'` | layer error (sim → gen) |
| `src/orbital/bad.ts`   | `Math.random()`                                  | determinism error         |
| `src/sim/ok.ts`        | `import { propagate } from '../orbital/propagate'` | no errors               |
| `src/gen/ok.ts`        | `import { buildBodySystem } from '../sim/body'`  | no errors                 |
| `src/orbital/ok.ts`    | `import { brent } from '../math/roots'`          | no errors                 |

`sim → planning` and `content → sim` stay deferred until `planning/` and `content/` have files (sprints 7 and 3).

## Acceptance criteria

Sprint 1 is done when all of these hold:

1. **Checks:** `npm test`, `npm run lint`, `npm run build` and `npm run format:check` pass, with no lint warnings. The app is unchanged, and `npm run smoke` still passes.
2. **Kepler textbook cases:** every textbook case above passes, for Kepler's equation, state → elements, elements → state and propagation.
3. **Round trips:** state ↔ elements round trips pass for random and singular cases, with no `NaN`.
4. **All conics:** propagation passes its invariant, parabolic, near-parabolic, hyperbolic and long-time tests.
5. **Planets:** positions agree with Horizons within the stated accuracy of Table 2a at all five epochs, from 1000 BC to 2950 AD.
6. **Moons:** every moon is within its bound at J2000 and 2025, and the measured errors are recorded.
7. **Headless:** none of the new modules imports React, three.js or zustand (lint passes), and every new test runs in the node environment.
8. **Layering:** the new lint cases pass.
9. **Docs:** decisions S1-1 to S1-17 are logged in decisions.md, together with any implementation choices made during the sprint. architecture.md's Celestial bodies section is updated. CLAUDE.md shows sprint 1 as complete.

## Suggested order of work

1. `math/time.ts`.
2. `orbital/kepler.ts` (scalar), then `elements.ts`, then `propagate.ts` (universal variables), each with its tests.
3. `orbital/frames.ts` and `soi.ts`, then `meanElementsAt` and `stateFromMeanElements` in `propagate.ts`.
4. `sim/body.ts`, tested on the hand-built system.
5. Data transcription: `gen/data/*.ts` from the JPL pages, and the Horizons fixture from the API. This step needs network access. Record the query URLs and the capture date in the fixture.
6. `gen/realSystem.ts` and its tests. Investigate any Horizons misses here; they're most likely to come from the reference-plane convention or the precession signs.
7. The lint cases, the docs updates and the acceptance check.

## Open questions

None at present. Both questions raised in review are settled: spin poles are transcribed now (S1-16), and accuracy is not a goal (S1-17).
