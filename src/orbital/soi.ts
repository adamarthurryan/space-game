/**
 * Sphere of influence.
 */

/** Laplace SOI radius a·(m/M)^(2/5), with the mass ratio taken as the GM ratio (km). */
export function laplaceSoiRadius(a: number, muBody: number, muParent: number): number {
  return a * Math.pow(muBody / muParent, 0.4);
}
