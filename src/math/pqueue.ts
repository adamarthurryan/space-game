/**
 * A priority queue: a binary min-heap on (key, seq), kept in a plain object (decision S0-6).
 * The basis of the sim event queue (sprint 3).
 *
 * Entries with equal keys come out in insertion order, so simultaneous events are ordered
 * deterministically. The queue is plain data if its values are.
 */

export interface PQEntry<T> {
  key: number;
  /** Insertion number: the tie-breaker for equal keys, and the handle for `remove`. */
  seq: number;
  value: T;
}

/** Binary min-heap on (key, seq). Plain data if T is. */
export interface PQueue<T> {
  heap: PQEntry<T>[];
  nextSeq: number;
}

export function createPQueue<T>(): PQueue<T> {
  return { heap: [], nextSeq: 0 };
}

function less<T>(x: PQEntry<T>, y: PQEntry<T>): boolean {
  return x.key < y.key || (x.key === y.key && x.seq < y.seq);
}

function at<T>(heap: PQEntry<T>[], i: number): PQEntry<T> {
  return heap[i] as PQEntry<T>;
}

function siftUp<T>(heap: PQEntry<T>[], i: number): void {
  const entry = at(heap, i);
  while (i > 0) {
    const parent = (i - 1) >> 1;
    const p = at(heap, parent);
    if (!less(entry, p)) break;
    heap[i] = p;
    i = parent;
  }
  heap[i] = entry;
}

function siftDown<T>(heap: PQEntry<T>[], i: number): void {
  const n = heap.length;
  const entry = at(heap, i);
  for (;;) {
    const left = 2 * i + 1;
    if (left >= n) break;
    const right = left + 1;
    const child = right < n && less(at(heap, right), at(heap, left)) ? right : left;
    const c = at(heap, child);
    if (!less(c, entry)) break;
    heap[i] = c;
    i = child;
  }
  heap[i] = entry;
}

/** Removes the entry at index i and restores the heap. */
function removeAt<T>(heap: PQEntry<T>[], i: number): PQEntry<T> {
  const removed = at(heap, i);
  const last = heap.pop() as PQEntry<T>;
  if (i < heap.length) {
    heap[i] = last;
    // The moved entry may belong above or below its new position.
    if (i > 0 && less(last, at(heap, (i - 1) >> 1))) siftUp(heap, i);
    else siftDown(heap, i);
  }
  return removed;
}

/** Adds a value and returns its seq, the handle for `remove`. Throws on a non-finite key. */
export function push<T>(q: PQueue<T>, key: number, value: T): number {
  if (!Number.isFinite(key)) throw new RangeError(`pqueue key must be finite, got ${key}`);
  const seq = q.nextSeq++;
  q.heap.push({ key, seq, value });
  siftUp(q.heap, q.heap.length - 1);
  return seq;
}

/** The entry with the smallest (key, seq), without removing it. */
export function peek<T>(q: PQueue<T>): PQEntry<T> | undefined {
  return q.heap[0];
}

/** Removes and returns the entry with the smallest (key, seq). */
export function pop<T>(q: PQueue<T>): PQEntry<T> | undefined {
  if (q.heap.length === 0) return undefined;
  return removeAt(q.heap, 0);
}

export function size<T>(q: PQueue<T>): number {
  return q.heap.length;
}

/** Removes the entry with this seq. O(n) to find it, O(log n) to repair the heap. */
export function remove<T>(q: PQueue<T>, seq: number): boolean {
  const i = q.heap.findIndex((e) => e.seq === seq);
  if (i < 0) return false;
  removeAt(q.heap, i);
  return true;
}

/** Removes every entry whose value matches, and returns how many. O(n). */
export function removeWhere<T>(q: PQueue<T>, pred: (value: T) => boolean): number {
  const before = q.heap.length;
  const kept = q.heap.filter((e) => !pred(e.value));
  const removed = before - kept.length;
  if (removed === 0) return 0;
  q.heap = kept;
  for (let i = (kept.length >> 1) - 1; i >= 0; i--) siftDown(kept, i);
  return removed;
}

/** Removes every entry. Handles are not reused afterwards. */
export function clear<T>(q: PQueue<T>): void {
  q.heap.length = 0;
}
