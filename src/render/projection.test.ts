import { describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../gen/scenario';
import { vec3 } from '../math/vec3';
import { createMapFrame, frameWorldInto, updateFrameBodies, type MapFrame } from './mapFrame';
import { projectFrame, setFrameCamera } from './projection';

const { system } = createSandboxWorld();
const FOV = (50 * Math.PI) / 180;
const W = 800;
const H = 600;

/** A frame focused on `focusId`, camera on +Z (ecliptic north) at `distance`, looking down. */
function frameLookingDown(focusId: string, distance: number): MapFrame {
  const f = createMapFrame(system);
  updateFrameBodies(f, system, 0);
  frameWorldInto(f, f.indexOf[focusId]!, f.origin);
  setFrameCamera(
    f,
    { offset: vec3(0, 0, distance), forward: vec3(0, 0, -1), up: vec3(0, 1, 0) },
    FOV,
    W,
    H,
  );
  projectFrame(f, system);
  return f;
}

describe('projectFrame', () => {
  it('puts the focus at the centre with the right disc size', () => {
    const f = frameLookingDown('earth', 1e5);
    const i = f.indexOf['earth']!;
    expect(f.screenX[i]).toBeCloseTo(W / 2, 3);
    expect(f.screenY[i]).toBeCloseTo(H / 2, 3);
    expect(f.depth[i]).toBeCloseTo(1e5, 0);
    const expected = (Math.asin(6371.0084 / 1e5) / (FOV / 2)) * (H / 2);
    expect(f.discPx[i]).toBeCloseTo(expected, 2);
    expect(f.sphereShown[i]).toBe(1);
    expect(f.markerShown[i]).toBe(0);
  });

  it('maps +x right and +y up on screen', () => {
    const f = frameLookingDown('sun', 1e9);
    const i = f.indexOf['earth']!;
    const e = frameWorldInto(f, i, vec3(0, 0, 0));
    expect(Math.sign(f.screenX[i]! - W / 2)).toBe(Math.sign(e.x));
    expect(Math.sign(H / 2 - f.screenY[i]!)).toBe(Math.sign(e.y));
  });

  it('draws markers for small discs, hides tiny spheres, and merges moons at system zoom', () => {
    const f = frameLookingDown('sun', 9e9);
    const sun = f.indexOf['sun']!;
    const jupiter = f.indexOf['jupiter']!;
    const io = f.indexOf['io']!;
    expect(f.discPx[sun]).toBeLessThan(0.5);
    expect(f.sphereShown[sun]).toBe(0);
    expect(f.markerShown[sun]).toBe(1);
    expect(f.markerShown[jupiter]).toBe(1);
    expect(f.merged[io]).toBe(1);
    expect(f.markerShown[io]).toBe(0);
  });

  it("separates Jupiter's moons when Jupiter is framed", () => {
    const f = frameLookingDown('jupiter', 5.7e6);
    for (const id of ['io', 'europa', 'ganymede', 'callisto']) {
      const i = f.indexOf[id]!;
      expect(f.merged[i], id).toBe(0);
      expect(f.markerShown[i], id).toBe(1);
    }
  });

  it('gives bodies behind the camera infinite depth and no marker', () => {
    const f = createMapFrame(system);
    updateFrameBodies(f, system, 0);
    frameWorldInto(f, f.indexOf['earth']!, f.origin);
    // Looking away from the Sun.
    const e = frameWorldInto(f, f.indexOf['earth']!, vec3(0, 0, 0));
    const away = vec3(e.x / Math.hypot(e.x, e.y), e.y / Math.hypot(e.x, e.y), 0);
    setFrameCamera(f, { offset: vec3(0, 0, 0), forward: away, up: vec3(0, 0, 1) }, FOV, W, H);
    projectFrame(f, system);
    const sun = f.indexOf['sun']!;
    expect(f.depth[sun]).toBe(Infinity);
    expect(f.markerShown[sun]).toBe(0);
  });
});
