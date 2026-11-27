/**
 * Scalar Kepler math: Stumpff functions, Kepler's equation for each conic, conversions between
 * anomalies, and the universal-variable Kepler equation (decision S1-12). No vectors here.
 *
 * Near-parabolic orbits lose precision to cancellation in `E − e sin E` and `e sinh H − H`, so
 * those are evaluated as `(1 − e) sin E + (E − sin E)` and `(e − 1) sinh H + (sinh H − H)`, with
 * series for the bracketed differences at small arguments.
 */

import { brent } from '../math/roots';
import { wrapPi } from '../math/units';

// ---- Stumpff functions ----------------------------------------------------------------------

/** Below this |ψ|, the Stumpff functions use their series. */
const STUMPFF_SERIES_LIMIT = 1e-3;

/** c₂(ψ) = (1 − cos √ψ)/ψ, continued through ψ = 0 (½) and to ψ < 0 with cosh. */
export function stumpffC2(psi: number): number {
  if (psi > STUMPFF_SERIES_LIMIT) {
    // 1 − cos x = 2 sin²(x/2), which avoids the cancellation.
    const s = Math.sin(0.5 * Math.sqrt(psi));
    return (2 * s * s) / psi;
  }
  if (psi < -STUMPFF_SERIES_LIMIT) {
    const s = Math.sinh(0.5 * Math.sqrt(-psi));
    return (2 * s * s) / -psi;
  }
  return 1 / 2 - psi * (1 / 24 - psi * (1 / 720 - psi * (1 / 40_320 - psi / 3_628_800)));
}

/** c₃(ψ) = (√ψ − sin √ψ)/ψ^{3/2}, continued through ψ = 0 (⅙) and to ψ < 0 with sinh. */
export function stumpffC3(psi: number): number {
  if (psi > STUMPFF_SERIES_LIMIT) {
    const x = Math.sqrt(psi);
    return (x - Math.sin(x)) / (psi * x);
  }
  if (psi < -STUMPFF_SERIES_LIMIT) {
    const x = Math.sqrt(-psi);
    return (Math.sinh(x) - x) / (-psi * x);
  }
  return 1 / 6 - psi * (1 / 120 - psi * (1 / 5040 - psi * (1 / 362_880 - psi / 39_916_800)));
}

// ---- Cancellation-free building blocks ------------------------------------------------------

/** x − sin x, accurate for small x. */
function xMinusSin(x: number): number {
  if (Math.abs(x) > 0.5) return x - Math.sin(x);
  // x³/3! − x⁵/5! + …; at |x| = 0.5 the 8th term is below 1e-20 of the first.
  const x2 = x * x;
  let term = (x * x2) / 6;
  let sum = term;
  for (let k = 4; k <= 18; k += 2) {
    term *= -x2 / (k * (k + 1));
    sum += term;
  }
  return sum;
}

/** sinh x − x, accurate for small x. */
function sinhMinusX(x: number): number {
  if (Math.abs(x) > 0.5) return Math.sinh(x) - x;
  const x2 = x * x;
  let term = (x * x2) / 6;
  let sum = term;
  for (let k = 4; k <= 18; k += 2) {
    term *= x2 / (k * (k + 1));
    sum += term;
  }
  return sum;
}

// ---- Kepler's equation ----------------------------------------------------------------------

const EPS = Number.EPSILON;
const MAX_KEPLER_ITER = 100;

export interface KeplerSolution {
  /** The anomaly found: E (elliptic) or H (hyperbolic). */
  x: number;
  iterations: number;
}

/**
 * Newton's method from a point right of the root of an increasing function that is convex
 * there, so the iterates decrease monotonically and never overshoot. Stops when the step
 * stops shrinking or is down to rounding.
 */
function newtonFromRight(
  f: (x: number) => number,
  df: (x: number) => number,
  x0: number,
): KeplerSolution {
  let x = x0;
  let lastStep = Infinity;
  for (let i = 1; i <= MAX_KEPLER_ITER; i++) {
    const fx = f(x);
    if (fx === 0) return { x, iterations: i };
    const step = fx / df(x);
    // From the right of the root the steps are positive and shrinking; anything else is
    // rounding noise around the root.
    if (!(step > 0) || step >= lastStep) return { x, iterations: i };
    x -= step;
    if (step <= 4 * EPS * Math.abs(x)) return { x, iterations: i };
    lastStep = step;
  }
  return { x, iterations: MAX_KEPLER_ITER };
}

/** As `solveKeplerElliptic`, also reporting the iteration count (for tests). */
export function solveKeplerEllipticDetailed(M: number, e: number): KeplerSolution {
  if (!(e >= 0 && e < 1)) throw new RangeError(`elliptic Kepler needs 0 ≤ e < 1, got ${e}`);
  // Solve for M in (−π, π], then restore the whole revolutions.
  const m = wrapPi(M);
  const revs = M - m;
  if (m === 0 || e === 0) return { x: M, iterations: 0 };
  const am = Math.abs(m);
  // On [0, π], f(E) = E − e sin E − m is increasing and convex, so Newton from an upper bound
  // converges monotonically. Upper bounds: E ≤ π; E ≤ m + e (as E = m + e sin E);
  // E ≤ m/(1 − e) (as E − e sin E ≥ (1 − e)E); E ≤ ∛(6m/0.506) (as E − sin E ≥ 0.506 E³/6 on
  // [0, π]), which is the tight one as e → 1 and m → 0.
  const hi = Math.min(Math.PI, am + e, am / (1 - e), Math.cbrt((6 * am) / 0.506));
  const oneMinusE = 1 - e;
  const sol = newtonFromRight(
    (E) => oneMinusE * Math.sin(E) + xMinusSin(E) - am,
    // 1 − e cos E without the cancellation near e = 1 and E = 0.
    (E) => oneMinusE * Math.cos(E) + 2 * Math.sin(E / 2) ** 2,
    hi,
  );
  return { x: revs + Math.sign(m) * sol.x, iterations: sol.iterations };
}

/** Kepler's equation M = E − e sin E, 0 ≤ e < 1. Newton's method; see the Detailed variant. */
export function solveKeplerElliptic(M: number, e: number): number {
  return solveKeplerEllipticDetailed(M, e).x;
}

/** As `solveKeplerHyperbolic`, also reporting the iteration count (for tests). */
export function solveKeplerHyperbolicDetailed(M: number, e: number): KeplerSolution {
  if (!(e > 1)) throw new RangeError(`hyperbolic Kepler needs e > 1, got ${e}`);
  if (M === 0) return { x: 0, iterations: 0 };
  const am = Math.abs(M);
  // f(H) = e sinh H − H − M is increasing and convex for H > 0. Upper bounds:
  // H ≤ asinh(M/(e − 1)) (as e sinh H − H ≥ (e − 1) sinh H) and H ≤ ∛(6M/e).
  const hi = Math.min(Math.asinh(am / (e - 1)), Math.cbrt((6 * am) / e));
  const eMinusOne = e - 1;
  const sol = newtonFromRight(
    (H) => eMinusOne * Math.sinh(H) + sinhMinusX(H) - am,
    // e cosh H − 1 without the cancellation.
    (H) => eMinusOne * Math.cosh(H) + 2 * Math.sinh(H / 2) ** 2,
    hi,
  );
  return { x: Math.sign(M) * sol.x, iterations: sol.iterations };
}

/** Kepler's equation for a hyperbola, M = e sinh H − H, e > 1. */
export function solveKeplerHyperbolic(M: number, e: number): number {
  return solveKeplerHyperbolicDetailed(M, e).x;
}

// ---- Anomalies ------------------------------------------------------------------------------

/** For E in (−π, π], ν is in (−π, π]. */
export function trueFromEccentric(E: number, e: number): number {
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
}

export function eccentricFromTrue(nu: number, e: number): number {
  return 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
}

export function meanFromEccentric(E: number, e: number): number {
  return (1 - e) * Math.sin(E) + xMinusSin(E);
}

/** ν from H; |ν| is below the asymptote angle acos(−1/e). */
export function trueFromHyperbolic(H: number, e: number): number {
  return 2 * Math.atan(Math.sqrt((e + 1) / (e - 1)) * Math.tanh(H / 2));
}

/** H from ν; ν must be inside the asymptotes, |ν| < acos(−1/e). */
export function hyperbolicFromTrue(nu: number, e: number): number {
  return 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
}

export function meanFromHyperbolic(H: number, e: number): number {
  return (e - 1) * Math.sinh(H) + sinhMinusX(H);
}

/** Below this |e − 1|, an orbit is treated as a parabola (matches `conicKind`). */
export const PARABOLIC_TOLERANCE = 1e-12;

/**
 * ν from M, dispatching on e. Elliptic M is E − e sin E (ν is returned in (−π, π]); hyperbolic
 * M is e sinh H − H; parabolic M is Barker's D + D³/3 with D = tan(ν/2).
 */
export function trueFromMean(M: number, e: number): number {
  if (Math.abs(e - 1) < PARABOLIC_TOLERANCE) {
    // D³ + 3D − 3M = 0 has the single real root D = 2 sinh(asinh(3M/2)/3).
    const D = 2 * Math.sinh(Math.asinh(1.5 * M) / 3);
    return 2 * Math.atan(D);
  }
  if (e < 1) return trueFromEccentric(wrapPi(solveKeplerElliptic(M, e)), e);
  return trueFromHyperbolic(solveKeplerHyperbolic(M, e), e);
}

/** M from ν; the inverse of `trueFromMean`. Elliptic M is in (−π, π]. */
export function meanFromTrue(nu: number, e: number): number {
  if (Math.abs(e - 1) < PARABOLIC_TOLERANCE) {
    const D = Math.tan(nu / 2);
    return D + (D * D * D) / 3;
  }
  if (e < 1) return meanFromEccentric(eccentricFromTrue(wrapPi(nu), e), e);
  return meanFromHyperbolic(hyperbolicFromTrue(nu, e), e);
}

// ---- Universal variables --------------------------------------------------------------------

export interface UniversalSolution {
  /** Universal anomaly, km^½. */
  chi: number;
  /** α·χ². */
  psi: number;
  c2: number;
  c3: number;
  /** |r| at dt, km. */
  r: number;
  iterations: number;
}

const MAX_NEWTON_ITER = 50;

/**
 * Solves the universal Kepler equation for χ at time dt:
 *
 *   √μ·dt = χ³c₃ + σ₀χ²c₂ + r₀χ(1 − ψc₃),  ψ = αχ²
 *
 * r0 = |r₀|, sigma0 = r₀·v₀/√μ, alpha = 1/a = 2/r₀ − v₀²/μ (0 for a parabola). The right side
 * increases with χ (its derivative is r > 0), so a bracket always exists. Newton's method from
 * Vallado's starting guesses, kept inside the bracket found so far; if it hasn't converged after
 * `maxNewton` iterations, Brent's method on the bracket. For elliptic orbits the caller should
 * reduce dt modulo the period first (`propagate` does).
 */
export function solveUniversal(
  mu: number,
  r0: number,
  sigma0: number,
  alpha: number,
  dt: number,
  maxNewton = MAX_NEWTON_ITER,
): UniversalSolution {
  const sqrtMu = Math.sqrt(mu);
  const target = sqrtMu * dt;
  if (dt === 0) return { chi: 0, psi: 0, c2: 0.5, c3: 1 / 6, r: r0, iterations: 0 };

  const evaluate = (chi: number) => {
    const chi2 = chi * chi;
    const psi = alpha * chi2;
    const c2 = stumpffC2(psi);
    const c3 = stumpffC3(psi);
    const t = chi2 * chi * c3 + sigma0 * chi2 * c2 + r0 * chi * (1 - psi * c3);
    const r = chi2 * c2 + sigma0 * chi * (1 - psi * c3) + r0 * (1 - psi * c2);
    return { psi, c2, c3, t, r };
  };

  // The bracket: χ = 0 gives t = 0, so the root is on the side of 0 that dt is on.
  let lo = dt > 0 ? 0 : -Infinity;
  let hi = dt > 0 ? Infinity : 0;

  let chi = initialGuess(mu, r0, sigma0, alpha, dt);
  if (!Number.isFinite(chi) || chi === 0 || Math.sign(chi) !== Math.sign(dt)) {
    chi = target / r0;
  }

  for (let i = 1; i <= maxNewton; i++) {
    const ev = evaluate(chi);
    const residual = ev.t - target;
    if (residual === 0) return { chi, ...pick(ev), iterations: i };
    if (residual < 0) lo = Math.max(lo, chi);
    else hi = Math.min(hi, chi);

    let next = chi - residual / ev.r;
    if (!Number.isFinite(next) || !(ev.r > 0) || next <= lo || next >= hi) {
      // Leave Newton's path: bisect a finite bracket, or grow towards the open end.
      if (Number.isFinite(lo) && Number.isFinite(hi)) next = 0.5 * (lo + hi);
      else if (Number.isFinite(lo)) next = lo === 0 ? Math.abs(chi) : 2 * lo;
      else next = hi === 0 ? -Math.abs(chi) : 2 * hi;
    }
    const step = Math.abs(next - chi);
    chi = next;
    if (step <= 1e-14 * Math.max(Math.abs(chi), 1)) {
      return { chi, ...pick(evaluate(chi)), iterations: i };
    }
  }

  // Fallback: Brent on the bracket, closing the open end first.
  const f = (x: number) => evaluate(x).t - target;
  if (!Number.isFinite(lo)) lo = expandBracket(f, hi, -1);
  if (!Number.isFinite(hi)) hi = expandBracket(f, lo, 1);
  const res = brent(f, lo, hi, { xtol: 0, maxIter: 400 });
  return { chi: res.x, ...pick(evaluate(res.x)), iterations: maxNewton + res.iterations };
}

function pick(ev: { psi: number; c2: number; c3: number; r: number }) {
  return { psi: ev.psi, c2: ev.c2, c3: ev.c3, r: ev.r };
}

/** Doubles away from `from` in direction `dir` until f changes sign there. */
function expandBracket(f: (x: number) => number, from: number, dir: 1 | -1): number {
  let x = from === 0 ? dir : from + dir * Math.abs(from);
  for (let k = 0; k < 2000 && Math.sign(f(x)) !== dir; k++) x = from + 2 * (x - from);
  return x;
}

/** Vallado's starting guesses for χ (Algorithm 8). May be non-finite; the caller checks. */
function initialGuess(mu: number, r0: number, sigma0: number, alpha: number, dt: number): number {
  const sqrtMu = Math.sqrt(mu);
  const rDotV = sigma0 * sqrtMu; // σ₀ = r₀·v₀/√μ
  const scaled = alpha * r0; // dimensionless: > 0 elliptic, < 0 hyperbolic
  if (scaled > 1e-6) return sqrtMu * dt * alpha;
  if (scaled < -1e-6) {
    const a = 1 / alpha;
    const s = Math.sign(dt);
    return (
      s *
      Math.sqrt(-a) *
      Math.log((-2 * mu * alpha * dt) / (rDotV + s * Math.sqrt(-mu * a) * (1 - r0 * alpha)))
    );
  }
  // Near-parabolic: Barker's equation for the semi-latus rectum p = h²/μ.
  // h² = r₀²v₀² − (r₀·v₀)², with v₀² = μ(2/r₀ − α).
  const h2 = r0 * r0 * mu * (2 / r0 - alpha) - rDotV * rDotV;
  if (!(h2 > 0)) return NaN;
  const p = h2 / mu;
  const s = 0.5 * Math.atan(1 / (3 * Math.sqrt(mu / (p * p * p)) * dt)); // ½ acot(…)
  const w = Math.atan(Math.cbrt(Math.tan(s)));
  return (Math.sqrt(p) * 2) / Math.tan(2 * w);
}
