import { describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../gen/scenario';
import { vec3 } from '../math/vec3';
import {
  createMapFrame,
  frameWorldInto,
  syncFrameShips,
  updateFrameBodies,
  updateFrameShips,
  type MapFrame,
} from './mapFrame';
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

describe('projectFrame: ships', () => {
  const world = createSandboxWorld();

  /** Kestrel's frame, with the camera `distance` above Earth looking down (Kestrel is in LEO). */
  function shipFrame(distance: number, view?: Parameters<typeof projectFrame>[2]) {
    const f = createMapFrame(world.system);
    updateFrameBodies(f, world.system, 0);
    syncFrameShips(f, world);
    updateFrameShips(f, world);
    frameWorldInto(f, f.indexOf['earth']!, f.origin);
    setFrameCamera(
      f,
      { offset: vec3(0, 0, distance), forward: vec3(0, 0, -1), up: vec3(0, 1, 0) },
      FOV,
      W,
      H,
    );
    projectFrame(f, world.system, view);
    return f;
  }

  it('projects ships like points', () => {
    const f = shipFrame(1e5);
    const k = f.ships.indexOf['ship-1']!;
    const p = vec3(f.ships.world[3 * k]!, f.ships.world[3 * k + 1]!, f.ships.world[3 * k + 2]!);
    const rx = p.x - f.origin.x;
    const ry = p.y - f.origin.y;
    const rz = p.z - f.origin.z - 1e5;
    const tanHalf = Math.tan(FOV / 2);
    expect(f.ships.screenX[k]).toBeCloseTo((1 + rx / (-rz * tanHalf * (W / H))) * (W / 2), 3);
    expect(f.ships.screenY[k]).toBeCloseTo((1 - ry / (-rz * tanHalf)) * (H / 2), 3);
    expect(f.ships.depth[k]).toBeCloseTo(Math.hypot(rx, ry, rz), 0);
    expect(f.ships.markerShown[k]).toBe(1);
  });

  it('merges a ship within 6 px of its parent, unless focused or selected', () => {
    const far = shipFrame(1e8);
    const k = far.ships.indexOf['ship-1']!;
    expect(far.ships.merged[k]).toBe(1);
    expect(far.ships.markerShown[k]).toBe(0);
    const ship = { kind: 'ship', id: 'ship-1' } as const;
    const earth = { kind: 'body', id: 'earth' } as const;
    expect(shipFrame(1e8, { focus: ship, selected: null }).ships.merged[k]).toBe(0);
    expect(shipFrame(1e8, { focus: earth, selected: ship }).ships.markerShown[k]).toBe(1);
  });
});
