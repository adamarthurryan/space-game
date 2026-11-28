import { describe, expect, it } from 'vitest';
import {
  clear,
  createPQueue,
  peek,
  pop,
  push,
  remove,
  removeWhere,
  size,
  type PQEntry,
  type PQueue,
} from './pqueue';
import { chance, createRng, int, next } from './rng';

function drain<T>(q: PQueue<T>): PQEntry<T>[] {
  const out: PQEntry<T>[] = [];
  for (let e = pop(q); e; e = pop(q)) out.push(e);
  return out;
}

/** True if every parent is ≤ its children in (key, seq). */
function isValidHeap<T>(q: PQueue<T>): boolean {
  const h = q.heap;
  for (let i = 1; i < h.length; i++) {
    const p = h[(i - 1) >> 1]!;
    const c = h[i]!;
    if (
      c.key < p.key ||
      (c.key === p.key && (c.rank < p.rank || (c.rank === p.rank && c.seq < p.seq)))
    )
      return false;
  }
  return true;
}

describe('ordering', () => {
  it('pops in key order after random insertion', () => {
    const rng = createRng('pq-order');
    const q = createPQueue<number>();
    const keys = Array.from({ length: 500 }, () => next(rng) * 1000);
    for (const k of keys) push(q, k, k);
    expect(drain(q).map((e) => e.key)).toEqual(keys.slice().sort((a, b) => a - b));
  });

  it('pops equal keys in insertion order', () => {
    const q = createPQueue<string>();
    for (const v of ['a', 'b', 'c', 'd', 'e']) push(q, 5, v);
    push(q, 1, 'first');
    push(q, 9, 'last');
    expect(drain(q).map((e) => e.value)).toEqual(['first', 'a', 'b', 'c', 'd', 'e', 'last']);
  });
});

describe('peek, pop, size and push', () => {
  it('peek does not change the size', () => {
    const q = createPQueue<string>();
    push(q, 2, 'b');
    push(q, 1, 'a');
    expect(peek(q)?.value).toBe('a');
    expect(size(q)).toBe(2);
  });

  it('pop and peek on an empty queue return undefined', () => {
    const q = createPQueue<number>();
    expect(pop(q)).toBeUndefined();
    expect(peek(q)).toBeUndefined();
    expect(size(q)).toBe(0);
  });

  it('push returns increasing seqs, and rejects non-finite keys', () => {
    const q = createPQueue<null>();
    expect(push(q, 0, null)).toBe(0);
    expect(push(q, -1, null)).toBe(1);
    expect(() => push(q, NaN, null)).toThrow(RangeError);
    expect(() => push(q, Infinity, null)).toThrow(RangeError);
    expect(() => push(q, -Infinity, null)).toThrow(RangeError);
    expect(size(q)).toBe(2);
  });

  it('clear empties the queue without reusing handles', () => {
    const q = createPQueue<number>();
    push(q, 1, 1);
    push(q, 2, 2);
    clear(q);
    expect(size(q)).toBe(0);
    expect(push(q, 3, 3)).toBe(2);
  });
});

describe('remove and removeWhere', () => {
  function filled(n: number): { q: PQueue<number>; seqs: number[] } {
    const q = createPQueue<number>();
    const seqs: number[] = [];
    // Keys in a scrambled order, so the heap has real structure.
    for (let i = 0; i < n; i++) seqs.push(push(q, (i * 37) % n, i));
    return { q, seqs };
  }

  it('removes exactly the entry from the root, a leaf or the middle', () => {
    const n = 31;
    for (const position of ['root', 'leaf', 'middle'] as const) {
      const { q } = filled(n);
      const index = position === 'root' ? 0 : position === 'leaf' ? n - 1 : 5;
      const target = q.heap[index]!;
      expect(remove(q, target.seq)).toBe(true);
      expect(size(q)).toBe(n - 1);
      expect(isValidHeap(q)).toBe(true);
      const rest = drain(q);
      expect(rest.some((e) => e.seq === target.seq)).toBe(false);
      expect(rest.map((e) => e.key)).toEqual(rest.map((e) => e.key).sort((a, b) => a - b));
    }
  });

  it('removes every entry, one handle at a time', () => {
    const { q, seqs } = filled(20);
    for (const s of seqs) {
      expect(remove(q, s)).toBe(true);
      expect(isValidHeap(q)).toBe(true);
    }
    expect(size(q)).toBe(0);
  });

  it('returns false for an unknown or already removed handle', () => {
    const { q, seqs } = filled(5);
    expect(remove(q, 999)).toBe(false);
    expect(remove(q, seqs[2]!)).toBe(true);
    expect(remove(q, seqs[2]!)).toBe(false);
    expect(size(q)).toBe(4);
  });

  it('removeWhere returns the count and leaves a valid heap', () => {
    const { q } = filled(50);
    expect(removeWhere(q, (v) => v % 3 === 0)).toBe(17);
    expect(size(q)).toBe(33);
    expect(isValidHeap(q)).toBe(true);
    const values = drain(q).map((e) => e.value);
    expect(values.every((v) => v % 3 !== 0)).toBe(true);
    expect(removeWhere(q, () => true)).toBe(0);
  });
});

describe('plain data', () => {
  it('pops the same sequence after a JSON round trip', () => {
    const rng = createRng('pq-save');
    const q = createPQueue<{ ship: string }>();
    for (let i = 0; i < 100; i++) push(q, int(rng, 0, 20), { ship: `s${i}` });
    for (let i = 0; i < 30; i++) pop(q);
    const restored = JSON.parse(JSON.stringify(q)) as PQueue<{ ship: string }>;
    push(q, 5, { ship: 'late' });
    push(restored, 5, { ship: 'late' });
    expect(drain(restored)).toEqual(drain(q));
  });
});

describe('randomised check against a sorted-array model', () => {
  it('agrees with the model over 10,000 operations', () => {
    const rng = createRng('pq-model');
    const q = createPQueue<number>();
    let model: PQEntry<number>[] = [];
    const byKeySeq = (a: PQEntry<number>, b: PQEntry<number>) => a.key - b.key || a.seq - b.seq;
    let mismatches = 0;

    for (let step = 0; step < 10_000; step++) {
      const r = next(rng);
      if (r < 0.5) {
        // Few distinct keys, so ties are common.
        const key = int(rng, 0, 40);
        const seq = push(q, key, step);
        model.push({ key, rank: 0, seq, value: step });
        model.sort(byKeySeq);
      } else if (r < 0.8) {
        const got = pop(q);
        const want = model.shift();
        if (JSON.stringify(got) !== JSON.stringify(want)) mismatches++;
      } else if (model.length > 0 && chance(rng, 0.8)) {
        const victim = model[int(rng, 0, model.length - 1)]!;
        if (!remove(q, victim.seq)) mismatches++;
        model = model.filter((e) => e.seq !== victim.seq);
      } else {
        if (remove(q, -1 - step)) mismatches++; // unknown handle
      }
      if (size(q) !== model.length || peek(q)?.seq !== model[0]?.seq) mismatches++;
    }

    expect(mismatches).toBe(0);
    expect(isValidHeap(q)).toBe(true);
  });
});

describe('rank', () => {
  it('orders equal keys by rank, then insertion order', () => {
    const q = createPQueue<string>();
    push(q, 5, 'a');
    push(q, 5, 'b', -1);
    push(q, 4, 'c', 3);
    push(q, 5, 'd', -1);
    push(q, 5, 'e');
    expect(drain(q).map((e) => e.value)).toEqual(['c', 'b', 'd', 'a', 'e']);
  });

  it('keeps the heap valid through removals with ranks', () => {
    const rng = createRng(7);
    const q = createPQueue<number>();
    for (let i = 0; i < 200; i++) push(q, int(rng, 0, 10), i, chance(rng, 0.5) ? -1 : 0);
    removeWhere(q, (v) => v % 3 === 0);
    expect(isValidHeap(q)).toBe(true);
    remove(q, 4);
    expect(isValidHeap(q)).toBe(true);
    const out = drain(q);
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1]!;
      const b = out[i]!;
      expect(a.key < b.key || (a.key === b.key && a.rank <= b.rank)).toBe(true);
    }
  });
});
