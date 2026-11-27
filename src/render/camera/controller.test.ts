import { describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../../gen/scenario';
import { DEG } from '../../math/units';
import { angleBetween, cross, dot, norm, sub, vec3, type Vec3 } from '../../math/vec3';
import { meanOrbitNormal } from '../../orbital/propagate';
import { bodyPole, bodyWorldState, getBody } from '../../sim/body';
import {
  beginRefocus,
  beginSnap,
  controllerOriginInto,
  controllerPose,
  createController,
  orbitBy,
  poleBasis,
  REFOCUS_DURATION,
  stepController,
  wheelNotches,
  zoomBy,
  type CameraController,
} from './controller';
import type { FocusRef } from '../../store/useView';
import { shipStateAt } from '../../sim/ship';
import { orbitPoleOf } from './CameraStage';
import {
  framingDistance,
  framingDistanceOf,
  MAX_DISTANCE,
  minDistance,
  minDistanceOf,
} from './framing';

const sys = createSandboxWorld().system;
const body = (id: string): FocusRef => ({ kind: 'body', id });

function earthController(): CameraController {
  return createController(body('earth'), framingDistance(sys, 'earth'), minDistance(sys, 'earth'));
}

/** Steps until the animations settle. */
function settle(c: CameraController, seconds = 2) {
  for (let i = 0; i < seconds * 60; i++) stepController(c, 1 / 60);
}

function expectOrthonormal(p: { forward: Vec3; up: Vec3 }) {
  expect(norm(p.forward)).toBeCloseTo(1, 12);
  expect(norm(p.up)).toBeCloseTo(1, 12);
  expect(dot(p.forward, p.up)).toBeCloseTo(0, 12);
}

describe('zoom', () => {
  it('one notch doubles the target distance', () => {
    const c = earthController();
    const before = 10 ** c.target.logDistance;
    zoomBy(c, 1);
    expect(10 ** c.target.logDistance).toBeCloseTo(2 * before, 3);
    settle(c);
    expect(10 ** c.logDistance).toBeCloseTo(2 * before, 3);
  });

  it('is mostly done in 150 ms', () => {
    const c = earthController();
    const from = c.logDistance;
    zoomBy(c, 1);
    for (let i = 0; i < 9; i++) stepController(c, 1 / 60);
    expect((c.logDistance - from) / (c.target.logDistance - from)).toBeGreaterThan(0.9);
  });

  it('clamps at both limits', () => {
    const c = earthController();
    zoomBy(c, -100);
    expect(10 ** c.target.logDistance).toBeCloseTo(minDistance(sys, 'earth'), 6);
    zoomBy(c, 1000);
    expect(10 ** c.target.logDistance).toBeCloseTo(MAX_DISTANCE, -3);
  });

  it("21 notches out from Earth's minimum distance fit Neptune's orbit in 50°", () => {
    const c = earthController();
    zoomBy(c, -100);
    settle(c);
    zoomBy(c, 21);
    settle(c);
    const d = 10 ** c.logDistance;
    const neptune = getBody(sys, 'neptune').orbit!;
    // The Sun is ~1 AU from Earth; Neptune's orbit extends its apoapsis beyond it.
    const r = neptune.a * (1 + neptune.e) + 1.5e8;
    expect(Math.atan(r / d)).toBeLessThan(25 * DEG);
    expect(d).toBeGreaterThan(9e9);
  });
});

describe('wheelNotches', () => {
  it('reads pixel, line and page deltas, scaling trackpad deltas', () => {
    expect(wheelNotches({ deltaY: 100, deltaMode: 0 })).toBe(1);
    expect(wheelNotches({ deltaY: -100, deltaMode: 0 })).toBe(-1);
    expect(wheelNotches({ deltaY: 12, deltaMode: 0 })).toBeCloseTo(0.12, 12);
    expect(wheelNotches({ deltaY: 3, deltaMode: 1 })).toBe(1);
    expect(wheelNotches({ deltaY: 1, deltaMode: 2 })).toBe(1);
  });
});

describe('orbit', () => {
  it('clamps pitch to ±90°, with a finite orthonormal pose there', () => {
    const c = earthController();
    orbitBy(c, 0, 1e6);
    expect(c.pitch).toBe(Math.PI / 2);
    let p = controllerPose(c);
    expectOrthonormal(p);
    expect(norm(sub(p.forward, vec3(0, 0, -1)))).toBeLessThan(1e-12);

    orbitBy(c, 37, -1e6);
    expect(c.pitch).toBe(-Math.PI / 2);
    p = controllerPose(c);
    expectOrthonormal(p);
    expect(norm(sub(p.forward, vec3(0, 0, 1)))).toBeLessThan(1e-12);
  });

  it('forward points from the camera at the origin', () => {
    const c = earthController();
    orbitBy(c, 123, -45);
    const p = controllerPose(c);
    expectOrthonormal(p);
    const back = vec3(-p.offset.x, -p.offset.y, -p.offset.z);
    expect(angleBetween(back, p.forward)).toBeLessThan(1e-12);
    expect(norm(p.offset)).toBeCloseTo(10 ** c.logDistance, 3);
  });
});

describe('poleBasis', () => {
  const poles: Record<string, Vec3> = {
    ecliptic: vec3(0, 0, 1),
    south: vec3(0, 0, -1),
    moonOrbit: meanOrbitNormal(getBody(sys, 'moon').orbit!, 0),
    uranusSpin: bodyPole(getBody(sys, 'uranus'))!,
  };
  for (const [name, pole] of Object.entries(poles)) {
    it(`is orthonormal and right-handed for ${name}`, () => {
      const { u, v, w } = poleBasis(pole);
      for (const a of [u, v, w]) expect(norm(a)).toBeCloseTo(1, 12);
      expect(dot(u, v)).toBeCloseTo(0, 12);
      expect(dot(u, w)).toBeCloseTo(0, 12);
      expect(norm(sub(cross(u, v), w))).toBeLessThan(1e-12);
      expect(u.z).toBeCloseTo(0, 12); // the ascending node lies in the ecliptic
    });
  }
});

describe('snap', () => {
  const moonPole = meanOrbitNormal(getBody(sys, 'moon').orbit!, 0);

  it('ends looking straight down the pole', () => {
    const c = earthController();
    orbitBy(c, 200, 80);
    beginSnap(c, moonPole);
    settle(c);
    const p = controllerPose(c);
    expect(norm(sub(p.forward, vec3(-moonPole.x, -moonPole.y, -moonPole.z)))).toBeLessThan(1e-9);
  });

  it('does not jump at the first step', () => {
    const c = earthController();
    orbitBy(c, 200, 80);
    const before = controllerPose(c).forward;
    beginSnap(c, moonPole);
    expect(angleBetween(controllerPose(c).forward, before)).toBeLessThan(1e-12);
    stepController(c, 1 / 60);
    // One frame into a 0.5 s eased animation moves the view only slightly.
    expect(angleBetween(controllerPose(c).forward, before)).toBeLessThan(0.01);
  });

  it('keeps the new pole for orbiting, and a drag cancels the animation', () => {
    const c = earthController();
    beginSnap(c, moonPole);
    stepController(c, 0.1);
    orbitBy(c, 10, 0);
    expect(c.snap).toBeNull();
    expect(norm(sub(c.pole, moonPole))).toBeLessThan(1e-15);
  });
});

describe('refocus', () => {
  const warp = 1e6;
  const focusWorld = (t: () => number) => (ref: FocusRef, out: Vec3) => {
    const r = bodyWorldState(sys, ref.id, t()).r;
    out.x = r.x;
    out.y = r.y;
    out.z = r.z;
    return out;
  };

  it('moves the origin continuously from Earth to Mars while both move, ending exactly at Mars', () => {
    let t = 0;
    const world = focusWorld(() => t);
    const c = earthController();
    const origin = vec3(0, 0, 0);
    controllerOriginInto(c, world, origin);
    beginRefocus(c, body('mars'), framingDistance(sys, 'mars'), minDistance(sys, 'mars'));
    let last = { ...controllerOriginInto(c, world, origin) };
    expect(norm(sub(last, bodyWorldState(sys, 'earth', 0).r))).toBe(0);

    const dt = 1 / 60;
    const gap = norm(sub(bodyWorldState(sys, 'mars', 0).r, bodyWorldState(sys, 'earth', 0).r));
    // The blend moves at most max(ease') = 3 × gap × dt / duration per step, plus the bodies'
    // own motion (< 30 km/s × warp × dt).
    const bound = (3 * gap * dt) / REFOCUS_DURATION + 30 * warp * dt * 1.1;
    for (let i = 0; i < 60; i++) {
      t += warp * dt;
      stepController(c, dt);
      const now = controllerOriginInto(c, world, origin);
      expect(norm(sub(now, last))).toBeLessThan(bound);
      last = { ...now };
    }
    expect(c.refocus).toBeNull();
    expect(last).toEqual(bodyWorldState(sys, 'mars', t).r);
    expect(10 ** c.logDistance).toBeCloseTo(framingDistance(sys, 'mars'), 3);
  });

  it('applies the new minimum distance', () => {
    const c = earthController();
    beginRefocus(c, body('phobos'), framingDistance(sys, 'phobos'), minDistance(sys, 'phobos'));
    zoomBy(c, -100);
    expect(10 ** c.target.logDistance).toBeCloseTo(minDistance(sys, 'phobos'), 6);
  });
});

describe('ships', () => {
  const world = createSandboxWorld();
  const kestrel: FocusRef = { kind: 'ship', id: 'ship-1' };
  /** Earth or Kestrel, world positions at t. */
  const at = (t: number) => (ref: FocusRef, out: Vec3) => {
    const earth = bodyWorldState(world.system, 'earth', t).r;
    const r =
      ref.kind === 'ship'
        ? (() => {
            const s = shipStateAt(world.system, world.ships[ref.id]!, t).r;
            return vec3(earth.x + s.x, earth.y + s.y, earth.z + s.z);
          })()
        : bodyWorldState(world.system, ref.id, t).r;
    out.x = r.x;
    out.y = r.y;
    out.z = r.z;
    return out;
  };

  it('a refocus from Earth to a LEO ship keeps the origin continuous and ends on the ship', () => {
    const c = earthController();
    const origin = vec3(0, 0, 0);
    let t = 0;
    controllerOriginInto(c, at(t), origin);
    beginRefocus(c, kestrel, framingDistanceOf(world, kestrel), minDistanceOf(world, kestrel));
    let last = { ...controllerOriginInto(c, at(t), origin) };
    const dt = 1 / 60;
    // 6771 km apart; the blend moves at most 3 × gap × dt / duration, plus 8 km/s of orbit.
    const bound = (3 * 6800 * dt) / REFOCUS_DURATION + 40 * dt;
    for (let i = 0; i < 60; i++) {
      t += dt;
      stepController(c, dt);
      const now = controllerOriginInto(c, at(t), origin);
      expect(norm(sub(now, last))).toBeLessThan(bound);
      last = { ...now };
    }
    expect(c.refocus).toBeNull();
    expect(c.focus).toEqual(kestrel);
    expect(norm(sub(last, at(t)(kestrel, vec3(0, 0, 0))))).toBe(0);
  });

  it("a snap to a ship's orbit pole looks down −h/|h|", () => {
    const c = earthController();
    const pole = orbitPoleOf(world, kestrel)!;
    const s = shipStateAt(world.system, world.ships['ship-1']!, world.clock.t);
    const h = cross(s.r, s.v);
    expect(angleBetween(pole, h)).toBeLessThan(1e-12);
    beginSnap(c, pole);
    settle(c);
    const f = controllerPose(c).forward;
    expect(norm(sub(f, vec3(-h.x / norm(h), -h.y / norm(h), -h.z / norm(h))))).toBeLessThan(1e-9);
  });
});
