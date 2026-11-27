import { describe, expect, it } from 'vitest';
import { AU_KM } from '../math/units';
import { laplaceSoiRadius } from './soi';

// GM in km³/s² (JPL DE440: the bodies' own GM, not their systems') and semi-major axes in km.
const MU_SUN = 1.327_124_400_18e11;
const MU_EARTH = 398_600.435;
const MU_MOON = 4902.8;
const MU_MARS = 42_828.37;
const MU_JUPITER = 126_686_531.9;
const MU_NEPTUNE = 6_835_100;
const MU_PHOBOS = 7.087e-4;

function expectWithin(actual: number, expected: number, rel: number) {
  expect(Math.abs(actual / expected - 1)).toBeLessThan(rel);
}

describe('laplaceSoiRadius', () => {
  it('matches the published SOI radii to 2%', () => {
    expectWithin(laplaceSoiRadius(1.000_001 * AU_KM, MU_EARTH, MU_SUN), 9.25e5, 0.02);
    expectWithin(laplaceSoiRadius(384_400, MU_MOON, MU_EARTH), 6.6e4, 0.02);
    expectWithin(laplaceSoiRadius(1.523_71 * AU_KM, MU_MARS, MU_SUN), 5.8e5, 0.02);
    expectWithin(laplaceSoiRadius(5.202_89 * AU_KM, MU_JUPITER, MU_SUN), 4.82e7, 0.02);
    expectWithin(laplaceSoiRadius(30.069_92 * AU_KM, MU_NEPTUNE, MU_SUN), 8.7e7, 0.02);
  });

  it('puts Phobos’s SOI inside its 11 km radius', () => {
    expect(laplaceSoiRadius(9376, MU_PHOBOS, MU_MARS)).toBeLessThan(11.08);
  });
});
