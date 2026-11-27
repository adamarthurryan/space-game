import { describe, expect, it } from 'vitest';
import { SANDBOX_EPOCH_JD } from '../gen/scenario';
import { generateRealSystem } from '../gen/realSystem';
import { add, norm, normalize, scale, sub, vec3, type Vec3 } from '../math/vec3';
import { bodyWorldState } from '../sim/body';
import { setObjectPosition, setObjectPositionAt, toOriginRelativeInto } from './precision';

const sys = generateRealSystem(SANDBOX_EPOCH_JD);
const t = 1e9;
const earth = bodyWorldState(sys, 'earth', t).r;
// A ship in low Earth orbit, 6,771 km from Earth's centre.
const offset = scale(normalize(vec3(4200, -3900, 3700)), 6771);
const leo = add(earth, offset);

/** A stand-in for a three.js object, storing the position as float32, as the GPU will. */
function fakeObject() {
  const position = new Float32Array(3);
  return {
    position: {
      set(x: number, y: number, z: number) {
        position.set([x, y, z]);
      },
    },
    get value(): Vec3 {
      return vec3(position[0]!, position[1]!, position[2]!);
    },
  };
}

describe('precision', () => {
  it('keeps a LEO point within 1e-3 km of the float64 difference, origin at Earth', () => {
    const world = new Float64Array([leo.x, leo.y, leo.z]);
    const out = toOriginRelativeInto(new Float32Array(3), world, earth);
    const exact = sub(leo, earth);
    expect(norm(sub(vec3(out[0]!, out[1]!, out[2]!), exact))).toBeLessThan(1e-3);
  });

  it('shows why: float32 world positions, then subtracted, are off by more than 1 km', () => {
    const f32 = new Float32Array([leo.x, leo.y, leo.z, earth.x, earth.y, earth.z]);
    const naive = vec3(f32[0]! - f32[3]!, f32[1]! - f32[4]!, f32[2]! - f32[5]!);
    expect(norm(sub(naive, offset))).toBeGreaterThan(1);
  });

  it('picks points by index', () => {
    const world = new Float64Array([1, 2, 3, 10, 20, 30, 100, 200, 300]);
    const out = toOriginRelativeInto(new Float32Array(6), world, vec3(1, 1, 1), [2, 0]);
    expect([...out]).toEqual([99, 199, 299, 0, 1, 2]);
  });

  it('setObjectPosition and setObjectPositionAt agree with toOriginRelativeInto', () => {
    const world = new Float64Array([leo.x, leo.y, leo.z]);
    const out = toOriginRelativeInto(new Float32Array(3), world, earth);
    const a = fakeObject();
    setObjectPosition(a, leo, earth);
    const b = fakeObject();
    setObjectPositionAt(b, world, 0, earth);
    expect(a.value).toEqual(vec3(out[0]!, out[1]!, out[2]!));
    expect(b.value).toEqual(a.value);
  });
});
