import { describe, expect, it } from 'vitest';
import {
  chance,
  createRng,
  fork,
  int,
  next,
  nextUint32,
  normal,
  pick,
  range,
  shuffle,
  type Rng,
} from './rng';

function draw(rng: Rng, n: number): number[] {
  return Array.from({ length: n }, () => nextUint32(rng));
}

/**
 * sfc32 as written in PractRand (Chris Doty-Humphrey), using Uint32Array arithmetic so that it
 * shares no code or tricks with rng.ts:
 *   tmp = a + b + counter++; a = b ^ (b >> 9); b = c + (c << 3); c = rotl(c, 21) + tmp;
 */
function referenceSfc32(a: number, b: number, c: number, counter: number): () => number {
  const s = new Uint32Array([a, b, c, counter]);
  const t = new Uint32Array(1);
  return () => {
    t[0] = s[0]! + s[1]! + s[3]!;
    s[3] = s[3]! + 1;
    s[0] = s[1]! ^ (s[1]! >>> 9);
    s[1] = s[2]! + (s[2]! << 3);
    s[2] = ((s[2]! << 21) | (s[2]! >>> 11)) + t[0]!;
    return t[0]!;
  };
}

describe('generator', () => {
  it('produces the pinned golden values for seed "sprint-0"', () => {
    // Captured from the first implementation. If this fails, every seed has been reshuffled.
    expect(draw(createRng('sprint-0'), 10)).toEqual([
      3256049542, 4158412280, 1013019386, 3717636507, 689568389, 4044629923, 2788534572, 727953075,
      2978511553, 3157501593,
    ]);
  });

  it('matches a reference sfc32 started from the same state', () => {
    for (const rng of [createRng('sprint-0'), createRng('x'), fork(createRng(12345), 'planets')]) {
      const ref = referenceSfc32(rng.a, rng.b, rng.c, rng.d);
      expect(draw(rng, 1000)).toEqual(Array.from({ length: 1000 }, ref));
    }
  });

  it('keeps its state as uint32s', () => {
    const rng = createRng('sprint-0');
    draw(rng, 100);
    for (const w of [rng.a, rng.b, rng.c, rng.d]) {
      expect(Number.isInteger(w) && w >= 0 && w < 2 ** 32).toBe(true);
    }
  });
});

describe('determinism', () => {
  it('gives identical sequences for the same seed', () => {
    expect(draw(createRng('abc'), 1000)).toEqual(draw(createRng('abc'), 1000));
    expect(draw(createRng(42), 10)).toEqual(draw(createRng('42'), 10));
  });

  it('gives different sequences for different seeds', () => {
    expect(draw(createRng('abc'), 10)).not.toEqual(draw(createRng('abd'), 10));
    expect(draw(createRng(1), 10)).not.toEqual(draw(createRng(2), 10));
  });

  it('resumes identically after a JSON round trip', () => {
    const rng = createRng('save-test');
    draw(rng, 500);
    const restored = JSON.parse(JSON.stringify(rng)) as Rng;
    expect(draw(restored, 500)).toEqual(draw(rng, 500));
  });
});

describe('fork', () => {
  it('does not depend on how many numbers the parent has drawn', () => {
    const r = createRng(7);
    const before = draw(fork(r, 'planets'), 50);
    draw(r, 100);
    const after = draw(fork(r, 'planets'), 50);
    expect(after).toEqual(before);
  });

  it('gives streams distinct from each other and from the parent', () => {
    const r = createRng(7);
    const parent = draw(createRng(7), 20);
    const a = draw(fork(r, 'a'), 20);
    const b = draw(fork(r, 'b'), 20);
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(parent);
    expect(b).not.toEqual(parent);
  });

  it('extends the path', () => {
    expect(fork(fork(createRng(42), 'planets'), 'moons').path).toBe('42/planets/moons');
  });

  it('rejects labels and seeds that would make paths ambiguous', () => {
    const r = createRng(1);
    expect(() => fork(r, '')).toThrow(RangeError);
    expect(() => fork(r, 'a/b')).toThrow(RangeError);
    expect(() => createRng('1/a')).toThrow(RangeError);
    expect(() => createRng('')).toThrow(RangeError);
  });
});

describe('distributions', () => {
  const N = 100_000;

  it('next is in [0, 1) with mean ≈ 0.5', () => {
    const rng = createRng('next');
    let sum = 0;
    let outside = 0;
    for (let i = 0; i < N; i++) {
      const x = next(rng);
      if (!(x >= 0 && x < 1)) outside++;
      sum += x;
    }
    expect(outside).toBe(0);
    expect(Math.abs(sum / N - 0.5)).toBeLessThan(0.005);
  });

  it('range is in [min, max)', () => {
    const rng = createRng('range');
    let outside = 0;
    for (let i = 0; i < 10_000; i++) {
      const x = range(rng, -3, 5);
      if (!(x >= -3 && x < 5)) outside++;
    }
    expect(outside).toBe(0);
  });

  it('int(1, 6) hits every face, never 0 or 7, each within 2% of ⅙', () => {
    const rng = createRng('dice');
    const counts = new Map<number, number>();
    for (let i = 0; i < N; i++) {
      const x = int(rng, 1, 6);
      counts.set(x, (counts.get(x) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    for (const c of counts.values()) {
      expect(Math.abs(c / N - 1 / 6)).toBeLessThan(0.02 / 6);
    }
  });

  it('int handles single-value and full 32-bit ranges, and rejects bad bounds', () => {
    const rng = createRng('int');
    expect(int(rng, 5, 5)).toBe(5);
    const x = int(rng, 0, 2 ** 32 - 1);
    expect(Number.isInteger(x) && x >= 0 && x < 2 ** 32).toBe(true);
    expect(() => int(rng, 3, 2)).toThrow(RangeError);
    expect(() => int(rng, 0, 1.5)).toThrow(RangeError);
    expect(() => int(rng, 0, 2 ** 32)).toThrow(RangeError);
  });

  it('chance respects its probability', () => {
    const rng = createRng('chance');
    let hits = 0;
    for (let i = 0; i < N; i++) if (chance(rng, 0.3)) hits++;
    expect(Math.abs(hits / N - 0.3)).toBeLessThan(0.01);
    expect(chance(rng, 0)).toBe(false);
    expect(chance(rng, 1)).toBe(true);
  });

  it('normal has mean ≈ 0 and SD ≈ 1', () => {
    const rng = createRng('normal');
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < N; i++) {
      const x = normal(rng);
      sum += x;
      sumSq += x * x;
    }
    expect(Number.isFinite(sum) && Number.isFinite(sumSq)).toBe(true);
    const mean = sum / N;
    const sd = Math.sqrt(sumSq / N - mean * mean);
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(Math.abs(sd - 1)).toBeLessThan(0.02);
  });

  it('normal applies mean and sd', () => {
    const a = normal(createRng('n'), 10, 2);
    const b = normal(createRng('n'));
    expect(a).toBeCloseTo(10 + 2 * b, 12);
  });
});

describe('pick and shuffle', () => {
  it('pick throws on an empty array and returns members otherwise', () => {
    const rng = createRng('pick');
    expect(() => pick(rng, [])).toThrow(RangeError);
    const items = ['a', 'b', 'c'] as const;
    const seen = new Set(Array.from({ length: 100 }, () => pick(rng, items)));
    expect([...seen].sort()).toEqual(['a', 'b', 'c']);
  });

  it('shuffle returns a permutation and leaves its input unchanged', () => {
    const rng = createRng('shuffle');
    const input = Array.from({ length: 50 }, (_, i) => i);
    const copy = input.slice();
    const out = shuffle(rng, input);
    expect(input).toEqual(copy);
    expect(out).not.toBe(input);
    expect(out).not.toEqual(input);
    expect(out.slice().sort((x, y) => x - y)).toEqual(input);
  });
});
