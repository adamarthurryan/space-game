/**
 * Orbit polylines for the map (decision S2-8 in planning/sprint-2.md): points around a
 * mean-element orbit in float64, starting and ending at the body, denser near it.
 */

import { TWO_PI } from '../math/units';
import type { MeanElements } from './elements';
import { createMeanOrbitGeometry, meanOrbitGeometryInto } from './propagate';

/**
 * The fraction of the way round the orbit at parameter u ∈ [0, 1], for a given density k.
 *
 * k = 0 is uniform in E. k = 1 has dΔE/du ∝ (1 − cos 2πu)², so the spacing grows as u⁴ away
 * from the body: chords near the body are tiny, and the widest chord, opposite the body, is 8/3
 * of the uniform one. In between, the two are blended, and the spacing next to the body is about
 * (1 − k) of the uniform spacing.
 *
 * The plan's spacing, u − k·sin(2πu)/(2π), has a quadratic error near the body: for Earth's
 * orbit in 256 segments it misses the true orbit by about 85 km within 1e5 km of Earth at
 * k = 0.9, and by 1.8 km even at k = 1, where this one stays under 1 km.
 */
export function orbitSpacing(u: number, k: number): number {
  const x = TWO_PI * u;
  const dense = u - ((2 / 3) * Math.sin(x)) / Math.PI + Math.sin(2 * x) / (12 * Math.PI);
  return (1 - k) * u + k * dense;
}

const geometry = createMeanOrbitGeometry();

/**
 * Points around a mean-element orbit at t, relative to the parent, in ecliptic axes, float64.
 * Point 0 and point `count` are the body's position at t; the loop is closed. Points go forward
 * in E from the body, spaced by `orbitSpacing(j / count, density)`. Writes 3·(count + 1)
 * values; returns out.
 */
export function sampleMeanOrbitInto(
  m: MeanElements,
  t: number,
  count: number,
  out: Float64Array,
  density = 1,
): Float64Array {
  if (out.length < 3 * (count + 1)) {
    throw new RangeError(`sampleMeanOrbitInto needs ${3 * (count + 1)} values, got ${out.length}`);
  }
  const { a, e, b, E: E0, P, Q } = meanOrbitGeometryInto(m, t, geometry);
  for (let j = 0; j < count; j++) {
    const E = E0 + TWO_PI * orbitSpacing(j / count, density);
    const x = a * (Math.cos(E) - e);
    const y = b * Math.sin(E);
    out[3 * j] = x * P.x + y * Q.x;
    out[3 * j + 1] = x * P.y + y * Q.y;
    out[3 * j + 2] = x * P.z + y * Q.z;
  }
  // Close the loop exactly.
  out[3 * count] = out[0]!;
  out[3 * count + 1] = out[1]!;
  out[3 * count + 2] = out[2]!;
  return out;
}
