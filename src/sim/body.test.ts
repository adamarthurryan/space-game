import { describe, expect, it } from 'vitest';
import { DEG, G, SECONDS_PER_DAY } from '../math/units';
import { norm, scale, sub, vec3 } from '../math/vec3';
import type { MeanElements, StateVector } from '../orbital/elements';
import { addState } from '../orbital/frames';
import {
  ancestors,
  bodyLocalState,
  bodyMass,
  bodyOrder,
  bodyWorldPositionsInto,
  bodyPole,
  bodyStateIn,
  bodyWorldState,
  buildBodySystem,
  changeFrame,
  commonAncestor,
  getBody,
  majorChildren,
  MAJOR_MASS_THRESHOLD_KG,
  rotationAngle,
  soiRadiusOf,
  validateBodySystem,
  type BodyInput,
  type BodySystem,
} from './body';

const J2000 = 2_451_545;
const MU_STAR = 1.327_124_400_18e11;

/** Mean elements with n from Kepler's third law around a parent of GM `muParent`. */
function orbit(
  muParent: number,
  a: number,
  e: number,
  extra: Partial<MeanElements> = {},
): MeanElements {
  return {
    a,
    e,
    i: 0.02,
    lan: 1.1,
    argp: 2.2,
    meanAnomaly: 0.7,
    meanMotion: Math.sqrt(muParent / a ** 3),
    ...extra,
  };
}

/**
 * A star, two planets, three moons and one minor moon. Europa is listed before Io, so that
 * `childIds` has to be sorted.
 */
function inputs(): BodyInput[] {
  const muTerra = 398_600.4418;
  const muJove = 126_686_534;
  return [
    {
      id: 'star',
      name: 'Star',
      class: 'star',
      parentId: null,
      mu: MU_STAR,
      radius: 695_700,
      atmosphereHeight: 0,
      rotation: {
        pole: { poleRa: 286.13 * DEG, poleDec: 63.87 * DEG },
        w0: 84.176 * DEG,
        wRate: (14.1844 * DEG) / SECONDS_PER_DAY,
      },
    },
    {
      id: 'jove',
      name: 'Jove',
      class: 'planet',
      parentId: 'star',
      mu: muJove,
      radius: 69_911,
      atmosphereHeight: 1000,
      orbit: orbit(MU_STAR, 7.785e8, 0.0489, { i: 1.3 * DEG }),
    },
    {
      id: 'terra',
      name: 'Terra',
      class: 'planet',
      parentId: 'star',
      mu: muTerra,
      radius: 6371,
      atmosphereHeight: 100,
      orbit: orbit(MU_STAR, 1.496e8, 0.0167, { i: 0 }),
      rotation: {
        pole: { poleRa: 0, poleDec: 90 * DEG },
        w0: 190.147 * DEG,
        wRate: (360.985_623_5 * DEG) / SECONDS_PER_DAY,
      },
    },
    {
      id: 'luna',
      name: 'Luna',
      class: 'moon',
      parentId: 'terra',
      mu: 4902.8,
      radius: 1737.4,
      atmosphereHeight: 0,
      orbit: orbit(muTerra, 384_400, 0.0549, {
        i: 5.1 * DEG,
        rates: { lan: -1.07e-8, argp: 2.25e-8 },
      }),
    },
    {
      id: 'europa',
      name: 'Europa',
      class: 'moon',
      parentId: 'jove',
      mu: 3202.7,
      radius: 1560.8,
      atmosphereHeight: 0,
      orbit: orbit(muJove, 671_100, 0.009, { plane: { poleRa: 268 * DEG, poleDec: 64.5 * DEG } }),
    },
    {
      id: 'io',
      name: 'Io',
      class: 'moon',
      parentId: 'jove',
      mu: 5959.9,
      radius: 1821.6,
      atmosphereHeight: 0,
      orbit: orbit(muJove, 421_800, 0.004, { plane: { poleRa: 268 * DEG, poleDec: 64.5 * DEG } }),
    },
    {
      id: 'pebble',
      name: 'Pebble',
      class: 'moon',
      parentId: 'jove',
      mu: 1e-4, // 1.5e15 kg: minor
      radius: 80,
      atmosphereHeight: 0,
      orbit: orbit(muJove, 181_000, 0.003),
    },
  ];
}

function build(): BodySystem {
  return buildBodySystem(J2000, inputs());
}

function withChanges(change: (list: BodyInput[]) => void): BodyInput[] {
  const list = inputs();
  change(list);
  return list;
}

function input(list: BodyInput[], id: string): BodyInput {
  const b = list.find((x) => x.id === id);
  if (!b) throw new Error(id);
  return b;
}

const TIMES = [0, 1e6, -3.3e8, 2.5e9];

describe('build', () => {
  it('orders childIds by semi-major axis', () => {
    const sys = build();
    expect(getBody(sys, 'jove').childIds).toEqual(['pebble', 'io', 'europa']);
    expect(getBody(sys, 'star').childIds).toEqual(['terra', 'jove']);
    expect(getBody(sys, 'luna').childIds).toEqual([]);
  });

  it('derives major from the mass threshold', () => {
    const sys = build();
    expect(MAJOR_MASS_THRESHOLD_KG).toBe(1e19);
    expect(getBody(sys, 'pebble').major).toBe(false);
    for (const id of ['star', 'terra', 'luna', 'jove', 'io', 'europa']) {
      expect(getBody(sys, id).major).toBe(true);
    }
    expect(bodyMass(getBody(sys, 'terra'))).toBeCloseTo(398_600.4418 / G, -15);
  });

  it('gives SOIs to major non-root bodies only', () => {
    const sys = build();
    expect(getBody(sys, 'star').soiRadius).toBeUndefined();
    expect(getBody(sys, 'pebble').soiRadius).toBeUndefined();
    expect(soiRadiusOf(getBody(sys, 'star'))).toBe(Infinity);
    expect(soiRadiusOf(getBody(sys, 'pebble'))).toBe(0);
    expect(soiRadiusOf(getBody(sys, 'terra'))).toBeCloseTo(9.24e5, -4);
    expect(majorChildren(sys, 'jove').map((b) => b.id)).toEqual(['io', 'europa']);
  });

  it('does not share objects with its inputs', () => {
    const list = inputs();
    const sys = buildBodySystem(J2000, list);
    input(list, 'luna').orbit!.a = 1;
    expect(getBody(sys, 'luna').orbit!.a).toBe(384_400);
  });
});

describe('validation', () => {
  it('accepts the hand-built system', () => {
    expect(validateBodySystem(build())).toEqual([]);
  });

  const cases: [string, () => BodyInput[], RegExp][] = [
    [
      'two roots',
      () =>
        withChanges((l) => {
          const terra = input(l, 'terra');
          terra.parentId = null;
          delete terra.orbit;
          terra.class = 'star';
        }),
      /exactly one root/,
    ],
    [
      'a missing parent',
      () => withChanges((l) => (input(l, 'luna').parentId = 'nowhere')),
      /parent nowhere does not exist/,
    ],
    ['e ≥ 1', () => withChanges((l) => (input(l, 'io').orbit!.e = 1)), /io: e must be in \[0, 1\)/],
    [
      'an apoapsis outside the parent’s SOI',
      () => withChanges((l) => (input(l, 'luna').orbit!.a = 2e6)),
      /luna: apoapsis .* outside the SOI of terra/,
    ],
    [
      'a periapsis inside the parent',
      () => withChanges((l) => (input(l, 'pebble').orbit!.a = 70_000)),
      /pebble: periapsis .* inside jove/,
    ],
    [
      'an SOI smaller than the body (a unit mistake)',
      () => withChanges((l) => (input(l, 'luna').radius = 1_737_400)), // metres, not km
      /luna: SOI radius/,
    ],
  ];
  for (const [name, make, pattern] of cases) {
    it(`rejects ${name}`, () => {
      expect(() => buildBodySystem(J2000, make())).toThrow(pattern);
    });
  }

  it('rejects a cycle', () => {
    const sys = build();
    getBody(sys, 'jove').parentId = 'io';
    expect(validateBodySystem(sys).join('\n')).toMatch(/cycle/);
  });

  it('rejects a key that does not match the ID', () => {
    const sys = build();
    sys.bodies['moon'] = getBody(sys, 'luna');
    delete sys.bodies['luna'];
    expect(validateBodySystem(sys).join('\n')).toMatch(/key moon holds body luna/);
  });

  it('rejects childIds that do not match the parent links', () => {
    const sys = build();
    getBody(sys, 'jove').childIds.pop();
    expect(validateBodySystem(sys).join('\n')).toMatch(/jove: childIds/);
  });

  it('lists every error when building', () => {
    const list = withChanges((l) => {
      input(l, 'io').orbit!.e = 1.5;
      input(l, 'luna').parentId = 'nowhere';
    });
    expect(() => buildBodySystem(J2000, list)).toThrow(/io: e must be/);
    expect(() => buildBodySystem(J2000, list)).toThrow(/luna: parent nowhere/);
  });
});

describe('tree', () => {
  it('ancestors and commonAncestor', () => {
    const sys = build();
    expect(ancestors(sys, 'io')).toEqual(['jove', 'star']);
    expect(ancestors(sys, 'star')).toEqual([]);
    expect(commonAncestor(sys, 'io', 'europa')).toBe('jove'); // siblings
    expect(commonAncestor(sys, 'io', 'jove')).toBe('jove'); // ancestor
    expect(commonAncestor(sys, 'jove', 'io')).toBe('jove');
    expect(commonAncestor(sys, 'luna', 'luna')).toBe('luna'); // self
    expect(commonAncestor(sys, 'luna', 'io')).toBe('star'); // across the tree
  });
});

describe('states', () => {
  it('the root is at rest at the origin', () => {
    const s = bodyWorldState(build(), 'star', 1e7);
    expect(s).toEqual({ r: vec3(0, 0, 0), v: vec3(0, 0, 0) });
  });

  it('sums up the tree exactly', () => {
    const sys = build();
    for (const t of TIMES) {
      expect(bodyWorldState(sys, 'luna', t)).toEqual(
        addState(bodyLocalState(sys, 'luna', t), bodyWorldState(sys, 'terra', t)),
      );
      expect(bodyWorldState(sys, 'terra', t)).toEqual(bodyLocalState(sys, 'terra', t));
    }
  });

  it('goes through the common ancestor, bitwise (S1-11)', () => {
    const sys = build();
    for (const t of TIMES) {
      const luna = bodyLocalState(sys, 'luna', t);
      expect(bodyStateIn(sys, 'luna', 'terra', t)).toEqual(luna);
      const io = bodyLocalState(sys, 'io', t);
      const europa = bodyLocalState(sys, 'europa', t);
      expect(bodyStateIn(sys, 'io', 'europa', t)).toEqual({
        r: sub(io.r, europa.r),
        v: sub(io.v, europa.v),
      });
    }
  });

  it('changeFrame from a moon to the root and back returns the state', () => {
    const sys = build();
    const s: StateVector = { r: vec3(1800, -20, 5), v: vec3(0.01, 1.6, 0.2) };
    for (const t of TIMES) {
      const out = changeFrame(sys, s, 'luna', 'star', t);
      const back = changeFrame(sys, out, 'star', 'luna', t);
      expect(norm(sub(back.r, s.r))).toBeLessThan(1e-6);
      expect(norm(sub(back.v, s.v))).toBeLessThan(1e-12);
    }
  });

  it('changeFrame between siblings equals the explicit sum', () => {
    const sys = build();
    const s: StateVector = { r: vec3(2000, 300, -100), v: vec3(0.2, 1.8, 0) };
    const t = 4.2e7;
    const viaJove = addState(s, bodyLocalState(sys, 'io', t));
    const europa = bodyLocalState(sys, 'europa', t);
    const expected = { r: sub(viaJove.r, europa.r), v: sub(viaJove.v, europa.v) };
    const actual = changeFrame(sys, s, 'io', 'europa', t);
    expect(norm(sub(actual.r, expected.r))).toBeLessThan(1e-9);
    expect(norm(sub(actual.v, expected.v))).toBeLessThan(1e-14);
  });

  it('each world velocity matches the central difference of the world position', () => {
    const sys = build();
    for (const id of Object.keys(sys.bodies)) {
      if (id === 'star') continue;
      for (const t of TIMES) {
        const ahead = bodyWorldState(sys, id, t + 1).r;
        const behind = bodyWorldState(sys, id, t - 1).r;
        const numeric = scale(sub(ahead, behind), 0.5);
        const v = bodyWorldState(sys, id, t).v;
        expect(norm(sub(v, numeric)) / norm(v)).toBeLessThan(1e-6);
      }
    }
  });
});

describe('plain data', () => {
  it('survives a JSON round trip, with identical positions', () => {
    const sys = build();
    const copy = JSON.parse(JSON.stringify(sys)) as BodySystem;
    expect(copy).toEqual(sys);
    for (const id of Object.keys(sys.bodies)) {
      expect(bodyWorldState(copy, id, 1.23e8)).toEqual(bodyWorldState(sys, id, 1.23e8));
    }
  });
});

describe('per-frame positions', () => {
  it('bodyOrder lists every body once, parents before children, children by a', () => {
    const sys = build();
    const order = bodyOrder(sys);
    expect([...order].sort()).toEqual(Object.keys(sys.bodies).sort());
    order.forEach((id, i) => {
      const parentId = getBody(sys, id).parentId;
      if (parentId !== null) expect(order.indexOf(parentId)).toBeLessThan(i);
    });
    expect(order).toEqual(['star', 'terra', 'luna', 'jove', 'pebble', 'io', 'europa']);
  });

  it('bodyWorldPositionsInto matches bodyWorldState at 10 times', () => {
    const sys = build();
    const order = bodyOrder(sys);
    const out = new Float64Array(3 * order.length);
    for (let k = 0; k < 10; k++) {
      const t = -5e9 + k * 1.1e9;
      bodyWorldPositionsInto(sys, order, t, out);
      order.forEach((id, i) => {
        const r = bodyWorldState(sys, id, t).r;
        expect(norm(sub(vec3(out[3 * i]!, out[3 * i + 1]!, out[3 * i + 2]!), r))).toBeLessThan(
          1e-6,
        );
      });
    }
  });

  it('bodyWorldPositionsInto rejects an order with a child before its parent', () => {
    const sys = build();
    const order = [...bodyOrder(sys)].reverse();
    expect(() => bodyWorldPositionsInto(sys, order, 0, new Float64Array(3 * order.length))).toThrow(
      /must come before/,
    );
  });
});

describe('rotation', () => {
  it('rotationAngle is w0 at t = 0, advances by wRate·t and is wrapped', () => {
    const terra = getBody(build(), 'terra');
    const rot = terra.rotation!;
    expect(rotationAngle(terra, 0)).toBeCloseTo(rot.w0, 15);
    const t = 12_345;
    expect(rotationAngle(terra, t)).toBeCloseTo(rot.w0 + rot.wRate * t, 12);
    for (const tt of [1e9, -1e9]) {
      const w = rotationAngle(terra, tt)!;
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThan(2 * Math.PI);
      expect(Math.cos(w - (rot.w0 + rot.wRate * tt))).toBeCloseTo(1, 6);
    }
  });

  it('is undefined without rotation data', () => {
    const jove = getBody(build(), 'jove');
    expect(rotationAngle(jove, 0)).toBeUndefined();
    expect(bodyPole(jove)).toBeUndefined();
  });

  it('bodyPole is a unit vector', () => {
    const sys = build();
    for (const id of ['star', 'terra']) {
      expect(norm(bodyPole(getBody(sys, id))!)).toBeCloseTo(1, 15);
    }
    // A pole at the ICRF pole is the obliquity from the ecliptic pole.
    const pole = bodyPole(getBody(sys, 'terra'))!;
    expect(Math.acos(pole.z) / DEG).toBeCloseTo(23.4393, 4);
  });
});
