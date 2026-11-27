/**
 * Seeded random numbers: the sfc32 generator, with its state in a plain object (decision S0-6).
 *
 * An Rng is plain, JSON-serialisable data, so it can live in the world and survive a save.
 * The functions that draw numbers advance (mutate) its state in place.
 *
 * Streams are identified by a path such as "42/planets/moons". `fork` derives a child stream
 * from the parent's path alone, not from its state, so drawing more numbers in one subsystem
 * never changes another subsystem's stream (decision S0-7).
 */

/** sfc32 state. Plain data: a JSON round trip resumes the same sequence. */
export interface Rng {
  /** Identity, e.g. "42/planets/moons". Forks hash this. */
  path: string;
  a: number;
  b: number;
  c: number;
  /** The counter word. */
  d: number;
}

const TWO_POW_32 = 0x1_0000_0000;

/**
 * cyrb128, a fast 128-bit string hash by bryc (public domain). Used only for seeding: it spreads
 * similar paths ("…/a", "…/b") into unrelated states.
 */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function fromPath(path: string): Rng {
  const [a, b, c, d] = cyrb128(path);
  const rng: Rng = { path, a, b, c, d };
  for (let i = 0; i < 15; i++) nextUint32(rng);
  return rng;
}

function checkSegment(kind: string, s: string): void {
  if (s === '' || s.includes('/')) {
    throw new RangeError(`An rng ${kind} must be non-empty and must not contain "/", got "${s}"`);
  }
}

/** A new stream. `createRng(42)` and `createRng("42")` are the same stream. */
export function createRng(seed: string | number): Rng {
  const path = String(seed);
  checkSegment('seed', path);
  return fromPath(path);
}

/**
 * A child stream with path `${rng.path}/${label}`. Depends only on the parent's path and the
 * label, never on how many numbers the parent has drawn. The label must be non-empty and must
 * not contain "/", so that every path names one stream.
 */
export function fork(rng: Rng, label: string): Rng {
  checkSegment('label', label);
  return fromPath(`${rng.path}/${label}`);
}

/** A uniform integer in [0, 2³²). */
export function nextUint32(rng: Rng): number {
  const { a, b, c, d } = rng;
  const t = (((a + b) | 0) + d) | 0;
  rng.d = (d + 1) >>> 0;
  rng.a = (b ^ (b >>> 9)) >>> 0;
  rng.b = (c + (c << 3)) >>> 0;
  rng.c = (((c << 21) | (c >>> 11)) + t) >>> 0;
  return t >>> 0;
}

/** A uniform float in [0, 1), with 32 bits of randomness. */
export function next(rng: Rng): number {
  return nextUint32(rng) / TWO_POW_32;
}

/** A uniform float in [min, max). */
export function range(rng: Rng, min: number, max: number): number {
  return min + next(rng) * (max - min);
}

/**
 * A uniform integer in [min, maxInclusive]. Uses rejection sampling, so there is no modulo
 * bias. The bounds must be integers spanning at most 2³² values.
 */
export function int(rng: Rng, min: number, maxInclusive: number): number {
  const span = maxInclusive - min + 1;
  if (
    !Number.isSafeInteger(min) ||
    !Number.isSafeInteger(maxInclusive) ||
    span < 1 ||
    span > TWO_POW_32
  ) {
    throw new RangeError(`int: bad bounds [${min}, ${maxInclusive}]`);
  }
  // The largest multiple of span that fits in 2³²: draws at or above it are rejected.
  const limit = TWO_POW_32 - (TWO_POW_32 % span);
  let x = nextUint32(rng);
  while (x >= limit) x = nextUint32(rng);
  return min + (x % span);
}

/** True with probability p. */
export function chance(rng: Rng, p: number): boolean {
  return next(rng) < p;
}

/** A uniformly chosen item. Throws on an empty array. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('pick: empty array');
  return items[int(rng, 0, items.length - 1)] as T;
}

/** A shuffled copy (Fisher–Yates). The input is not changed. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = int(rng, 0, i);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

/**
 * A normally distributed number (Box–Muller). Draws two uniforms for each call and discards
 * the second result, so that the state stays four integers and nothing else.
 */
export function normal(rng: Rng, mean = 0, sd = 1): number {
  const u1 = 1 - next(rng); // (0, 1], so the log is finite
  const u2 = next(rng);
  return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
