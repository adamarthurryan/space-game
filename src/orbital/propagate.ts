/**
 * Two-body propagation of any conic with universal variables (decision S1-12).
 *
 * `meanElementsAt` and `stateFromMeanElements` (orbits on rails) are added with the reference
 * planes, in step 3 of sprint 1.
 */

import { TWO_PI } from '../math/units';
import type { StateVector } from './elements';
import { solveUniversal } from './kepler';

/** Universal-variable propagation of any conic, for any sign of dt. */
export function propagate(mu: number, s0: StateVector, dt: number): StateVector {
  return propagateInto({ r: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 } }, mu, s0, dt);
}

/** As `propagate`, writing into `out` (for hot loops). `out` may alias `s0`. */
export function propagateInto(
  out: StateVector,
  mu: number,
  s0: StateVector,
  dt: number,
): StateVector {
  const rx = s0.r.x;
  const ry = s0.r.y;
  const rz = s0.r.z;
  const vx = s0.v.x;
  const vy = s0.v.y;
  const vz = s0.v.z;

  if (dt !== 0) {
    const sqrtMu = Math.sqrt(mu);
    const r0 = Math.sqrt(rx * rx + ry * ry + rz * rz);
    const v0Sq = vx * vx + vy * vy + vz * vz;
    const sigma0 = (rx * vx + ry * vy + rz * vz) / sqrtMu;
    const alpha = 2 / r0 - v0Sq / mu;

    // An ellipse repeats: reduce dt to within half a period, for accuracy and a good guess.
    let dtRed = dt;
    if (alpha > 0) {
      const p = TWO_PI / (sqrtMu * alpha * Math.sqrt(alpha));
      if (Math.abs(dt) > 0.5 * p) dtRed = dt - p * Math.round(dt / p);
    }

    const { chi, psi, c2, c3, r } = solveUniversal(mu, r0, sigma0, alpha, dtRed);
    const chi2 = chi * chi;
    // Lagrange coefficients. g is written without the cancellation in dt − χ³c₃/√μ.
    const f = 1 - (chi2 * c2) / r0;
    const g = (r0 * chi * (1 - psi * c3) + sigma0 * chi2 * c2) / sqrtMu;
    const fDot = (sqrtMu * chi * (psi * c3 - 1)) / (r * r0);
    const gDot = 1 - (chi2 * c2) / r;

    out.r.x = f * rx + g * vx;
    out.r.y = f * ry + g * vy;
    out.r.z = f * rz + g * vz;
    out.v.x = fDot * rx + gDot * vx;
    out.v.y = fDot * ry + gDot * vy;
    out.v.z = fDot * rz + gDot * vz;
    return out;
  }

  out.r.x = rx;
  out.r.y = ry;
  out.r.z = rz;
  out.v.x = vx;
  out.v.y = vy;
  out.v.z = vz;
  return out;
}
