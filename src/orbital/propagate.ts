/**
 * Propagation: two-body propagation of any conic with universal variables (decision S1-12),
 * and the state of an orbit on rails from its mean elements (S1-5).
 */

import { TWO_PI, wrapPi, wrapTwoPi } from '../math/units';
import { addScaled, cross, rotateX, rotateZ, type Vec3 } from '../math/vec3';
import { stateFromElements, type MeanElements, type StateVector } from './elements';
import { planeToEcliptic } from './frames';
import { solveKeplerElliptic, solveUniversal, trueFromEccentric } from './kepler';

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

// ---- Orbits on rails ------------------------------------------------------------------------

/**
 * The elements of a mean-element orbit at t: the rates applied linearly, M = M₀ + n·t, and the
 * angles Ω, ω and M wrapped to [0, 2π). The result describes the orbit at t, but keeps the
 * input's rates, n and plane.
 */
export function meanElementsAt(m: MeanElements, t: number): MeanElements {
  const rates = m.rates;
  const out: MeanElements = {
    a: m.a + (rates?.a ?? 0) * t,
    e: m.e + (rates?.e ?? 0) * t,
    i: m.i + (rates?.i ?? 0) * t,
    lan: wrapTwoPi(m.lan + (rates?.lan ?? 0) * t),
    argp: wrapTwoPi(m.argp + (rates?.argp ?? 0) * t),
    meanAnomaly: wrapTwoPi(m.meanAnomaly + m.meanMotion * t),
    meanMotion: m.meanMotion,
  };
  if (rates) out.rates = rates;
  if (m.plane) out.plane = m.plane;
  return out;
}

/**
 * State at t relative to the parent, in world (ecliptic) axes, with the plane rotation applied.
 *
 * The Keplerian part of the velocity uses μ_eff = n²a³, so it matches the motion in M. The
 * rates' contributions are added to it, so that the velocity is the derivative of the position:
 * the rotation of the orbit by Ω̇, i̇ and ω̇ (for the Moon, about 1% of its orbital speed), and
 * the change of shape by ȧ and ė at fixed M (for Jupiter, ė is 3e-6 of its speed).
 *
 * n may be negative: M then decreases and the body moves backwards along the ellipse, so the
 * Keplerian velocity is reversed. This happens when a fitted apsidal rate exceeds the mean
 * longitude rate, as for Tethys in JPL's table (S1-18).
 */
export function stateFromMeanElements(m: MeanElements, t: number): StateVector {
  const el = meanElementsAt(m, t);
  const { a, e, i, lan, argp } = el;
  const muEff = m.meanMotion * m.meanMotion * a * a * a;
  const E = wrapPi(solveKeplerElliptic(el.meanAnomaly, e));
  const nu = wrapPi(trueFromEccentric(E, e));
  const s = stateFromElements(muEff, { p: a * (1 - e * e), e, i, lan, argp, nu });
  if (m.meanMotion < 0) s.v = { x: -s.v.x, y: -s.v.y, z: -s.v.z };

  const rates = m.rates;
  if (rates && (rates.a || rates.e)) {
    // dr/dt from the change of shape at fixed M. In the perifocal frame
    // r = (a(cos E − e), a√(1 − e²) sin E), with ∂E/∂e = sin E / (1 − e cos E).
    const sinE = Math.sin(E);
    const cosE = Math.cos(E);
    const root = Math.sqrt(1 - e * e);
    const dEde = sinE / (1 - e * cosE);
    const drde: Vec3 = {
      x: a * (-sinE * dEde - 1),
      y: a * ((-e / root) * sinE + root * cosE * dEde),
      z: 0,
    };
    let v = addScaled(s.v, s.r, (rates.a ?? 0) / a);
    if (rates.e) v = addScaled(v, rotateZ(rotateX(rotateZ(drde, argp), i), lan), rates.e);
    s.v = v;
  }
  if (rates && (rates.lan || rates.i || rates.argp)) {
    // dr/dt from rotating the orbit: Ω̇ about the plane's pole, i̇ about the node line and
    // ω̇ about the orbit normal.
    const sinI = Math.sin(i);
    const pole: Vec3 = { x: 0, y: 0, z: 1 };
    const node: Vec3 = { x: Math.cos(lan), y: Math.sin(lan), z: 0 };
    const normal: Vec3 = { x: sinI * Math.sin(lan), y: -sinI * Math.cos(lan), z: Math.cos(i) };
    let v = s.v;
    if (rates.lan) v = addScaled(v, cross(pole, s.r), rates.lan);
    if (rates.i) v = addScaled(v, cross(node, s.r), rates.i);
    if (rates.argp) v = addScaled(v, cross(normal, s.r), rates.argp);
    s.v = v;
  }

  if (!m.plane) return s;
  return { r: planeToEcliptic(m.plane, s.r), v: planeToEcliptic(m.plane, s.v) };
}
