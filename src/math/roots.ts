/**
 * Root finding on a bracketing interval.
 *
 * A missing sign change is a programming error (the caller should have bracketed the root), so
 * it throws. Running out of iterations is reported through `converged: false`.
 */

export interface RootOptions {
  /** Absolute tolerance on x; default 1e-12. Both methods also allow 4·ε·|x|. */
  xtol?: number;
  /** Default 200. */
  maxIter?: number;
}

export interface RootResult {
  /** Best estimate of the root. */
  x: number;
  /** f(x) */
  fx: number;
  /** Evaluations of f after the two endpoints. */
  iterations: number;
  /** False if maxIter was reached. */
  converged: boolean;
}

const EPS = Number.EPSILON;
const DEFAULT_XTOL = 1e-12;
const DEFAULT_MAX_ITER = 200;

interface Bracket {
  lo: number;
  hi: number;
  flo: number;
  fhi: number;
}

/**
 * Orders the interval and evaluates its endpoints. Returns a result instead if an endpoint is
 * already a root, and throws RangeError if f is not finite there or doesn't change sign.
 */
function setUp(f: (x: number) => number, a: number, b: number): Bracket | RootResult {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const flo = f(lo);
  const fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi)) {
    throw new RangeError(
      `f is not finite at the interval ends: f(${lo}) = ${flo}, f(${hi}) = ${fhi}`,
    );
  }
  if (flo === 0) return { x: lo, fx: flo, iterations: 0, converged: true };
  if (fhi === 0) return { x: hi, fx: fhi, iterations: 0, converged: true };
  if (Math.sign(flo) === Math.sign(fhi)) {
    throw new RangeError(`No sign change on [${lo}, ${hi}]: f = ${flo}, ${fhi}`);
  }
  return { lo, hi, flo, fhi };
}

/** Half the bracket width at which x is considered converged: (4ε|x| + xtol) / 2. */
function halfTol(x: number, xtol: number): number {
  return 2 * EPS * Math.abs(x) + 0.5 * xtol;
}

/** Bisection. Requires f(a) and f(b) of opposite sign (or one of them zero), else throws RangeError. */
export function bisect(
  f: (x: number) => number,
  a: number,
  b: number,
  opts: RootOptions = {},
): RootResult {
  const xtol = opts.xtol ?? DEFAULT_XTOL;
  const maxIter = opts.maxIter ?? DEFAULT_MAX_ITER;
  const s = setUp(f, a, b);
  if ('x' in s) return s;

  let { lo, hi, flo } = s;
  let mid = lo;
  let fmid = flo;
  for (let i = 1; i <= maxIter; i++) {
    mid = lo + (hi - lo) / 2;
    fmid = f(mid);
    if (fmid === 0 || (hi - lo) / 2 <= halfTol(mid, xtol)) {
      return { x: mid, fx: fmid, iterations: i, converged: true };
    }
    if (Math.sign(fmid) === Math.sign(flo)) {
      lo = mid;
      flo = fmid;
    } else {
      hi = mid;
    }
  }
  return { x: mid, fx: fmid, iterations: maxIter, converged: false };
}

/**
 * Brent's method: inverse quadratic interpolation and the secant method, falling back to
 * bisection when they don't make enough progress. This is Brent's `zeroin` as given by
 * Forsythe, Malcolm and Moler (1977). Same contract as `bisect`.
 */
export function brent(
  f: (x: number) => number,
  a0: number,
  b0: number,
  opts: RootOptions = {},
): RootResult {
  const xtol = opts.xtol ?? DEFAULT_XTOL;
  const maxIter = opts.maxIter ?? DEFAULT_MAX_ITER;
  const s = setUp(f, a0, b0);
  if ('x' in s) return s;

  // b is the best estimate, a the previous one, and the root lies between b and c.
  let a = s.lo;
  let fa = s.flo;
  let b = s.hi;
  let fb = s.fhi;
  let c = a;
  let fc = fa;
  let d = b - a; // the last step
  let e = d; // the step before last

  for (let i = 0; ; i++) {
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol1 = halfTol(b, xtol);
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) {
      return { x: b, fx: fb, iterations: i, converged: true };
    }
    if (i >= maxIter) return { x: b, fx: fb, iterations: i, converged: false };

    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      // Try interpolation: linear (secant) if only two distinct points, else inverse quadratic.
      const sr = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        p = 2 * xm * sr;
        q = 1 - sr;
      } else {
        const qr = fa / fc;
        const r = fb / fc;
        p = sr * (2 * xm * qr * (qr - r) - (b - a) * (r - 1));
        q = (qr - 1) * (r - 1) * (sr - 1);
      }
      if (p > 0) q = -q;
      else p = -p;
      // Accept the step only if it stays in the bracket and shrinks faster than bisection.
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = xm;
        e = d;
      }
    } else {
      d = xm;
      e = d;
    }

    a = b;
    fa = fb;
    b += Math.abs(d) > tol1 ? d : xm > 0 ? tol1 : -tol1;
    fb = f(b);
    if (Math.sign(fb) === Math.sign(fc)) {
      // The root is now between a and b: restart the bracket from a.
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
  }
}

/**
 * Samples f at `steps` equal intervals over [a, b] and returns the first interval with a sign
 * change (or a sample exactly at zero), or null. Non-finite samples never form a bracket.
 * Used for SOI entry and closest approach (sprints 3 and 9).
 */
export function findFirstBracket(
  f: (x: number) => number,
  a: number,
  b: number,
  steps: number,
): [lo: number, hi: number] | null {
  if (!Number.isInteger(steps) || steps < 1) {
    throw new RangeError(`steps must be a positive integer, got ${steps}`);
  }
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  let x0 = lo;
  let f0 = f(x0);
  for (let i = 1; i <= steps; i++) {
    const x1 = i === steps ? hi : lo + ((hi - lo) * i) / steps;
    const f1 = f(x1);
    if (
      Number.isFinite(f0) &&
      Number.isFinite(f1) &&
      (f0 === 0 || f1 === 0 || Math.sign(f0) !== Math.sign(f1))
    ) {
      return [x0, x1];
    }
    x0 = x1;
    f0 = f1;
  }
  return null;
}
