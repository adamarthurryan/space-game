import { describe, expect, it } from 'vitest';
import { DEG } from '../math/units';
import { add, norm, sub } from '../math/vec3';
import {
  apoapsis,
  elementsFromState,
  periapsis,
  period,
  type StateVector,
} from '../orbital/elements';
import { eclipticToPlane } from '../orbital/frames';
import { bodyWorldState, getBody, type BodySystem } from '../sim/body';
import { computeTrajectory, segmentStateAt, type Segment } from '../sim/trajectory';
import { generateRealSystem } from './realSystem';
import { orbitFromInput, presetOrbit, sandboxShips, type OrbitInput } from './sandboxShips';
import { createSandboxWorld, SANDBOX_EPOCH_JD } from './scenario';

const sys = generateRealSystem(SANDBOX_EPOCH_JD);
const DAY = 86_400;

/** Elements of a state relative to the parent's equator. */
function equatorialElements(s: BodySystem, parentId: string, st: StateVector) {
  const body = getBody(s, parentId);
  const pole = body.rotation!.pole;
  return elementsFromState(body.mu, {
    r: eclipticToPlane(pole, st.r),
    v: eclipticToPlane(pole, st.v),
  });
}

function worldAt(seg: Segment, t: number) {
  const s = segmentStateAt(sys, seg, t);
  const b = bodyWorldState(sys, seg.parentId, t);
  return { r: add(s.r, b.r), v: add(s.v, b.v) };
}

describe('sandbox ships', () => {
  const ships = sandboxShips(sys);
  const R = getBody(sys, 'earth').radius;
  const cases = [
    { name: 'Kestrel', parent: 'earth', pe: R + 400, ap: R + 400, i: 51.6 * DEG },
    { name: 'Tern', parent: 'earth', pe: R + 300, ap: R + 35_786, i: 28.5 * DEG },
    {
      name: 'Heron',
      parent: 'moon',
      pe: getBody(sys, 'moon').radius + 100,
      ap: getBody(sys, 'moon').radius + 100,
      i: 0,
    },
  ];

  it('are Kestrel, Tern and Heron, in that order', () => {
    expect(ships.map((s) => s.name)).toEqual(['Kestrel', 'Tern', 'Heron']);
  });

  for (const c of cases) {
    it(`${c.name}: the requested orbit, and one horizon segment`, () => {
      const s = ships.find((x) => x.name === c.name)!;
      expect(s.orbit.parentId).toBe(c.parent);
      const el = equatorialElements(sys, c.parent, s.orbit);
      expect(Math.abs(periapsis(el) - c.pe)).toBeLessThan(1);
      expect(Math.abs(apoapsis(el) - c.ap)).toBeLessThan(1);
      expect(Math.abs(el.i - c.i)).toBeLessThan(1e-9);
      const segs = computeTrajectory(sys, s.orbit);
      expect(segs).toHaveLength(1);
      expect(segs[0]!.endEvent).toBe('horizon');
    });
  }

  it('are in the sandbox world as ship-1 to ship-3', () => {
    const w = createSandboxWorld();
    expect(Object.values(w.ships).map((s) => [s.id, s.name, s.designId])).toEqual([
      ['ship-1', 'Kestrel', 'starship'],
      ['ship-2', 'Tern', 'starship'],
      ['ship-3', 'Heron', 'starship'],
    ]);
  });
});

describe('spawn presets', () => {
  it('Earth escape leaves Earth after 2–6 days, continuously', () => {
    const segs = computeTrajectory(sys, presetOrbit(sys, 'earth-escape', 0));
    const [s0, s1] = segs;
    expect(s0!.endEvent).toBe('soi-exit');
    expect(s0!.endTargetId).toBe('sun');
    expect(s0!.tEnd / DAY).toBeGreaterThan(2);
    expect(s0!.tEnd / DAY).toBeLessThan(6);
    expect(s1!.parentId).toBe('sun');
    const a = worldAt(s0!, s0!.tEnd);
    const b = worldAt(s1!, s1!.tStart);
    expect(norm(sub(a.r, b.r)) / norm(a.r)).toBeLessThan(1e-6);
    expect(norm(sub(a.v, b.v)) / norm(a.v)).toBeLessThan(1e-12);
  });

  it('To the Moon enters the Moon SOI in 2–6 days, flies by above the surface, and says what next', () => {
    const t = 1e5;
    const start = presetOrbit(sys, 'to-the-moon', t);
    const segs = computeTrajectory(sys, start);
    const [s0, s1] = segs;
    expect(s0!.endEvent).toBe('soi-enter');
    expect(s0!.endTargetId).toBe('moon');
    expect((s0!.tEnd - t) / DAY).toBeGreaterThan(2);
    expect((s0!.tEnd - t) / DAY).toBeLessThan(6);
    const moon = getBody(sys, 'moon');
    const pe = periapsis(elementsFromState(moon.mu, { r: s1!.r0, v: s1!.v0 }));
    expect(pe).toBeGreaterThan(moon.radius + 50);
    expect(pe).toBeLessThan(moon.soiRadius!);
    expect(['soi-exit', 'impact']).toContain(s1!.endEvent);
    expect(s1!.endTargetId).toBe(s1!.endEvent === 'soi-exit' ? 'earth' : 'moon');
  });

  it('Suborbital impacts Earth within one period, at the impact radius', () => {
    const start = presetOrbit(sys, 'suborbital', 0);
    const earth = getBody(sys, 'earth');
    const P = period(earth.mu, elementsFromState(earth.mu, start));
    const segs = computeTrajectory(sys, start);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.endEvent).toBe('impact');
    expect(segs[0]!.tEnd).toBeLessThan(P);
    const r = norm(segmentStateAt(sys, segs[0]!, segs[0]!.tEnd).r);
    expect(Math.abs(r - (earth.radius + earth.atmosphereHeight))).toBeLessThan(1e-6);
  });
});

describe('orbitFromInput', () => {
  const inputs: OrbitInput[] = [
    {
      parentId: 'earth',
      periapsisAltitude: 500,
      e: 0.3,
      i: 0.7,
      lan: 1.2,
      argp: 2.1,
      nu: 0.4,
      plane: 'equator',
    },
    {
      parentId: 'earth',
      periapsisAltitude: 500,
      e: 0.3,
      i: 0.7,
      lan: 1.2,
      argp: 2.1,
      nu: 0.4,
      plane: 'ecliptic',
    },
    {
      parentId: 'jupiter',
      periapsisAltitude: 1e5,
      e: 1.5,
      i: 0.2,
      lan: 4,
      argp: 0.5,
      nu: -0.6,
      plane: 'equator',
    },
    {
      parentId: 'jupiter',
      periapsisAltitude: 1e5,
      e: 1.5,
      i: 0.2,
      lan: 4,
      argp: 0.5,
      nu: -0.6,
      plane: 'ecliptic',
    },
  ];
  for (const input of inputs) {
    it(`round-trips ${input.parentId}, ${input.plane}`, () => {
      const o = orbitFromInput(sys, input, 42);
      expect(o.t).toBe(42);
      const body = getBody(sys, input.parentId);
      const el =
        input.plane === 'equator'
          ? equatorialElements(sys, input.parentId, o)
          : elementsFromState(body.mu, o);
      const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1);
      expect(rel(periapsis(el), body.radius + input.periapsisAltitude)).toBeLessThan(1e-12);
      for (const k of ['e', 'i', 'lan', 'argp', 'nu'] as const) {
        expect(Math.abs(el[k] - input[k])).toBeLessThan(1e-9);
      }
    });
  }
});
