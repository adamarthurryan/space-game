import { describe, expect, it } from 'vitest';
import { bisect, brent, findFirstBracket } from './roots';

const methods = { bisect, brent };

describe.each(Object.entries(methods))('%s', (_name, solve) => {
  it('finds √2 from x² − 2 on [0, 2] to 1e-12', () => {
    const r = solve((x) => x * x - 2, 0, 2);
    expect(r.converged).toBe(true);
    expect(Math.abs(r.x - Math.SQRT2)).toBeLessThan(1e-12);
    expect(r.fx).toBe(r.x * r.x - 2);
  });

  it('finds the root of cos x − x on [0, 1]', () => {
    const r = solve((x) => Math.cos(x) - x, 0, 1);
    expect(Math.abs(r.x - 0.7390851332151607)).toBeLessThan(1e-12);
  });

  it('returns a root at an endpoint with 0 iterations', () => {
    expect(solve((x) => x - 1, 1, 3)).toEqual({ x: 1, fx: 0, iterations: 0, converged: true });
    expect(solve((x) => x - 3, 1, 3)).toEqual({ x: 3, fx: 0, iterations: 0, converged: true });
  });

  it('accepts a reversed interval', () => {
    const r = solve((x) => x * x - 2, 2, 0);
    expect(Math.abs(r.x - Math.SQRT2)).toBeLessThan(1e-12);
  });

  it('converges to the discontinuity of a step function', () => {
    const r = solve((x) => (x < 0.3 ? -1 : 1), 0, 1);
    expect(r.converged).toBe(true);
    expect(Math.abs(r.x - 0.3)).toBeLessThan(1e-11);
  });

  it('keeps 1e-6 s precision at 30 years of sim time', () => {
    const root = 1e9 + 0.123;
    const r = solve((t) => t - root, 0, 2e9);
    expect(r.converged).toBe(true);
    expect(Math.abs(r.x - root)).toBeLessThan(1e-6);
  });

  it('throws RangeError without a sign change', () => {
    expect(() => solve((x) => x * x + 1, -1, 1)).toThrow(RangeError);
  });

  it('throws RangeError when f is NaN at an endpoint', () => {
    expect(() => solve((x) => (x === 0 ? NaN : x), 0, 1)).toThrow(RangeError);
    expect(() => solve(() => Infinity, 0, 1)).toThrow(RangeError);
  });
});

describe('brent', () => {
  it("solves Kepler's equation for e = 0.9 with a residual below 1e-12", () => {
    const e = 0.9;
    for (const M of [1e-6, 0.01, 0.1, 0.5, 1, 2, Math.PI, 4, 6, 2 * Math.PI - 1e-6]) {
      const kepler = (E: number) => E - e * Math.sin(E) - M;
      const r = brent(kepler, 0, 2 * Math.PI);
      expect(r.converged).toBe(true);
      expect(Math.abs(kepler(r.x))).toBeLessThan(1e-12);
    }
  });

  it('takes fewer iterations than bisection on a smooth problem', () => {
    const f = (x: number) => Math.cos(x) - x;
    const nBrent = brent(f, 0, 1).iterations;
    const nBisect = bisect(f, 0, 1).iterations;
    expect(nBrent).toBeLessThan(10);
    expect(nBrent).toBeLessThan(nBisect / 3);
  });

  it('reports converged: false when maxIter is reached, instead of throwing', () => {
    // A root at the end of a long flat stretch defeats interpolation for a while.
    const f = (x: number) => Math.pow(x - 0.9, 9);
    const r = brent(f, 0, 1, { maxIter: 3 });
    expect(r.converged).toBe(false);
    expect(r.iterations).toBe(3);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x).toBeLessThanOrEqual(1);
  });

  it('respects a looser xtol', () => {
    const loose = brent((x) => Math.cos(x) - x, 0, 1, { xtol: 1e-3 });
    expect(Math.abs(loose.x - 0.7390851332151607)).toBeLessThan(1e-3);
  });
});

describe('bisect', () => {
  it('reports converged: false when maxIter is reached', () => {
    const r = bisect((x) => x * x - 2, 0, 2, { maxIter: 3 });
    expect(r).toMatchObject({ converged: false, iterations: 3 });
  });
});

describe('findFirstBracket', () => {
  it('returns the first of several sign changes', () => {
    // Roots of sin at π, 2π and 3π.
    const br = findFirstBracket(Math.sin, 1, 10, 90);
    expect(br).not.toBeNull();
    const [lo, hi] = br!;
    expect(lo).toBeLessThan(Math.PI);
    expect(hi).toBeGreaterThan(Math.PI);
    expect(hi - lo).toBeCloseTo(0.1, 12);
  });

  it('returns null when there is no sign change', () => {
    expect(findFirstBracket((x) => x * x + 1, -5, 5, 100)).toBeNull();
  });

  it('can miss a pair of roots inside one interval, by design', () => {
    expect(findFirstBracket((x) => x * x - 0.01, -1, 1, 1)).toBeNull();
  });

  it('treats a reversed interval as [b, a]', () => {
    expect(findFirstBracket((x) => x - 0.6, 1, 0, 4)).toEqual([0.5, 0.75]);
    // A sample exactly at the root ends the interval that leads up to it.
    expect(findFirstBracket((x) => x - 0.5, 1, 0, 4)).toEqual([0.25, 0.5]);
  });

  it('feeds brent', () => {
    const f = (x: number) => Math.sin(x);
    const [lo, hi] = findFirstBracket(f, 4, 20, 50)!;
    expect(Math.abs(brent(f, lo, hi).x - 2 * Math.PI)).toBeLessThan(1e-12);
  });

  it('throws on a bad step count', () => {
    expect(() => findFirstBracket(Math.sin, 0, 1, 0)).toThrow(RangeError);
    expect(() => findFirstBracket(Math.sin, 0, 1, 2.5)).toThrow(RangeError);
  });
});
