# Guide to the `orbital/` layer

`src/orbital/` is the pure orbital mechanics: state vectors and elements, Kepler's equation, two-body propagation, orbits on rails, reference frames, spheres of influence and passage times. It works on numbers and `Vec3`s only. It knows nothing about bodies by ID, ships or the world, which live in `sim/`. It imports only `math/`.

This guide describes the code as it stands after milestone 1, sprint 5b. The physics and conventions are set out in [architecture.md](../architecture.md); the code cites decisions as `S<sprint>-<n>` (S1-12 is decision 12 of `planning/sprint-1.md`).

## 1. Architecture

| File | What it is |
|---|---|
| `elements.ts` | `StateVector`, `ConicElements`, `MeanElements`, state ↔ elements, derived values |
| `kepler.ts` | Stumpff functions, Kepler's equation for each conic, anomaly conversions, the universal-variable solver |
| `propagate.ts` | Universal-variable propagation of any conic; mean-element orbits on rails; orbit geometry |
| `frames.ts` | The world frame, reference planes, frame translation, the local orbital frame of a burn |
| `soi.ts` | Laplace SOI radius, closed-form time to a radius, SOI entry search |
| `passages.ts` | Time to the next periapsis, apoapsis or node; `hasApsides` |
| `sample.ts` | Polylines around a mean-element orbit for the map |

The dependencies run `kepler → elements → frames → propagate`, with `soi`, `passages` and `sample` on top.

### Two kinds of orbit

The layer handles two kinds of orbit, and it helps to keep them apart:

- **Ships and other free objects** are a `StateVector` (`r` in km, `v` in km/s) relative to a parent with gravitational parameter `mu`. They follow any conic (ellipse, parabola or hyperbola) through `propagate`.
- **Bodies are on rails** (S1-5): a `MeanElements` set relative to the parent, elliptic only, with optional linear secular rates (`rates.a`, `.e`, `.i`, `.lan`, `.argp`) and an optional reference `plane`. `stateFromMeanElements(m, t)` evaluates it at any `t` with one Kepler solve. No integration and no history.

### Frames

The world frame is heliocentric ecliptic, mean equinox of J2000 (S1-1). **Every body frame is non-rotating and parallel to it**, so a change of frame is a translation: `addState` and `subState`. The tree walk that chooses the translation (through the lowest common ancestor) is in `sim/body.ts`.

A `ReferencePlane` is a pole's RA and Dec in ICRF. Orbits given against a planet's equator or a Laplace plane carry one, and `planeToEcliptic` rotates them into world axes. The node is measured from the plane's ascending node on the ICRF equator (S1-6).

## 2. Common patterns

- **One element type for every conic (S1-13).** `ConicElements` uses the semi-latus rectum `p` and the true anomaly `nu`, which are finite for parabolas, rather than `a` and `M`. Singular cases have fixed conventions: a circular orbit (e < `CIRCULAR_E` = 1e-11) has ω = 0 and ν is the argument of latitude; an equatorial orbit has Ω = 0. A radial state gives non-finite elements.
- **Derived values return `Infinity` where undefined** (`apoapsis` and `period` of an open orbit, `semiMajorAxis` of a parabola). They are for display and planning and are never stored.
- **Cancellation-free forms.** Near-parabolic orbits lose precision in `E − e sin E` and `e sinh H − H`, so `kepler.ts` writes them as `(1 − e) sin E + (E − sin E)` with series for the bracketed differences. Stumpff functions switch to series below |ψ| = 1e-3. Keep that style when adding formulas near e = 1.
- **Closed form before search.** SOI exit, impact and passage times come from the conic in closed form (`timeToRadius`, `timeToPassage`). Only SOI entry into a moving child needs a search.
- **`…Into` and in-place variants for per-frame use:** `propagateInto`, `meanPositionInto`, `meanOrbitGeometryInto`, `planeToEclipticInPlace`, `sampleMeanOrbitInto`, `localOrbitalBasis(…, out)`. They allocate nothing; the map's per-frame loops use them.

## 3. Key files and core functions

### `elements.ts`

- Types: `StateVector { r, v }`, `ConicElements { p, e, i, lan, argp, nu }`, `ReferencePlane { poleRa, poleDec }`, `MeanElements { a, e, i, lan, argp, meanAnomaly, meanMotion, rates?, plane? }`.
- `elementsFromState(mu, s)` and `stateFromElements(mu, el)`: the two conversions (perifocal frame, then Rz(Ω)·Rx(i)·Rz(ω)).
- `conicKind(e)`: `'parabolic'` when |e − 1| < `PARABOLIC_TOLERANCE` (1e-12).
- Derived: `semiMajorAxis` (negative for hyperbolas), `periapsis`, `apoapsis`, `period`, `specificEnergy`, `angularMomentum`.

### `kepler.ts`

- `stumpffC2(psi)`, `stumpffC3(psi)`, continuous through ψ = 0 and into ψ < 0.
- `solveKeplerElliptic(M, e)` and `solveKeplerHyperbolic(M, e)`: Newton's method from an upper bound on a convex increasing function, so iterates decrease monotonically and never overshoot. The `…Detailed` variants also return the iteration count, for tests.
- Anomalies: `trueFromEccentric`, `eccentricFromTrue`, `meanFromEccentric`, `trueFromHyperbolic`, `hyperbolicFromTrue`, `meanFromHyperbolic`, and the dispatching pair `trueFromMean(M, e)` and `meanFromTrue(nu, e)`, which also handle the parabola (Barker's equation).
- `solveUniversal(mu, r0, sigma0, alpha, dt)`: the universal Kepler equation for χ (S1-12). Newton from Vallado's starting guesses, kept inside the bracket found so far, then Brent if Newton hasn't converged.

### `propagate.ts`

- **`propagate(mu, s0, dt)`** and **`propagateInto(out, mu, s0, dt)`**: universal-variable propagation of any conic, for any sign of `dt`. Elliptic `dt` is reduced modulo the period first. This is the function behind every ship position in the game.
- **`stateFromMeanElements(m, t)`**: a body's state relative to its parent at `t`. The velocity includes the secular rates' contributions (the rotation of the orbit, and the change of shape), so it is the true derivative of the position. `meanMotion` may be negative (S1-18: Tethys), which runs the body backwards along the ellipse.
- `meanElementsAt(m, t)`: the elements with rates applied and angles wrapped.
- `meanOrbitGeometryInto(m, t, out)`: the ellipse's `a`, `e`, `b`, the body's `E` at `t`, and perifocal axes `P`, `Q`, `W` in ecliptic axes. A point at anomaly E is `a(cos E − e)·P + b sin E·Q`. `createMeanOrbitGeometry()` makes the output.
- `meanPositionInto(m, t, out)`: the position only, without allocating. `sim/body.ts`'s `bodyWorldPositionsInto` calls it once per body per frame.
- `meanOrbitNormal(m, t)`: the unit normal on the side of the body's actual motion.

### `frames.ts`

- `OBLIQUITY_J2000`, `equatorialToEcliptic`, `eclipticToEquatorial`.
- `planeToEcliptic(plane, v)`, `eclipticToPlane`, `planeToEclipticInPlace`, `planePole(plane)`.
- `addState(s, origin)` and `subState(s, origin)`: translation between parallel frames.
- **The local orbital frame of a burn (S4-2):** `OrbitalBasis { prograde, normal, radial }` and `LocalDv { prograde, normal, radial }` (km/s). `localOrbitalBasis(s, fallbackPole, out?)` gives prograde = v̂, normal = ĥ, radial = prograde × normal; for a radial state the normal falls back to the given pole. `dvToVector(basis, dv)` and `vectorToDv(basis, v)` convert between local components and a world vector. Maneuver nodes store `LocalDv`.

### `soi.ts`

- `laplaceSoiRadius(a, muBody, muParent)`: a·(m/M)^(2/5).
- `timeToRadius(mu, s, radius, 'outbound' | 'inbound')`: the time until |r| first equals `radius` in that direction, in closed form, or `null` if the conic never gets there (S3-8). Used for SOI exit (outbound at the SOI radius) and impact (inbound at the top of the atmosphere).
- `findSphereEntry(f, t0, t1, vMax, minStep)`: the first time `f(t) = |r_ship − r_child| − R` crosses zero, by conservative advancement (step = |f|/vMax, at least `minStep`) and then Brent. Because `f` changes by at most `vMax` per second, a crossing can't be stepped over except by a graze shorter than `minStep`.

### `passages.ts`

- `timeToPassage(mu, s, kind, pole, minDt?)`: time to the next `'periapsis' | 'apoapsis' | 'ascending-node' | 'descending-node'`, after `minDt`, in closed form (S4-16). `null` if there is none: apoapsis on an open orbit, periapsis already passed on a hyperbola, a node on an orbit in the reference plane.
- `nearestPassage(mu, s, 'periapsis' | 'apoapsis')`: the nearest one, earlier (negative) or later. Used to snap a node.
- `APSIDES_MIN_E` (1e-4) and `hasApsides(e, kind)` (S5b-20): below that eccentricity an orbit is treated as circular for its apsides. It has no Pe or Ap marker, passage or snap. This threshold is much coarser than `CIRCULAR_E`, which only picks the element conventions.

### `sample.ts`

- `sampleMeanOrbitInto(m, t, count, out, density?)`: `count + 1` float64 points around a body's orbit at `t`, relative to the parent, starting and ending at the body. The spacing (`orbitSpacing`) is dense near the body, so the line passes through it accurately at any zoom (S2-8). `render/layers/OrbitLayer.ts` calls it every frame.

## 4. Testing

The tests in this layer are the numerical backbone of the project:

- **textbook cases** from Curtis and Vallado for every module (state ↔ elements, Kepler's equation, propagation);
- **round trips** over thousands of random cases: state → elements → state, ν → M → ν, including the singular conventions (circular, equatorial, both) and e at and near 1;
- **solver bounds**: residuals and iteration counts of the Kepler solvers over random (M, e), and the universal solver forced onto its Brent fallback;
- **invariants** of propagation: energy and angular momentum conserved, reversible and composable, whole periods returning to the start, 1e9 s of LEO against the mean anomaly;
- **frames**: the obliquity, the reference plane rotations and their inverses, and the local orbital basis;
- **passages and SOI times** against Kepler's equation, including the cases that must return `null`.

The real-system tests against JPL Horizons live in `gen/realSystem.test.ts`, because they need the data.

## 5. Recipes

**A new closed-form event on a conic** (for example, a true anomaly or an altitude): find its true anomaly from the elements, then use `meanFromTrue` differences divided by the mean motion, as `timeToRadius` and `timeToPassage` do. Wrap by the period for ellipses, and return `null` for anomalies outside a hyperbola's asymptotes.

**Code that needs a body's position every frame:** use `meanPositionInto` with a scratch vector, not `stateFromMeanElements`, which allocates and also computes the velocity.

**A new orbit solver** (`orbital/lambert.ts` is planned for sprint 8 in `planning/milestone-1-sprints.md`): it belongs here as a new file. It takes `mu` and states, not body IDs.
