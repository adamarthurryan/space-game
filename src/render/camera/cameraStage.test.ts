import { PerspectiveCamera } from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../../gen/scenario';
import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { createMapFrame, type MapFrame } from '../mapFrame';
import { bodiesStage, shipsStage } from '../stages';
import { CameraStage, onScreen } from './CameraStage';
import { START_PITCH, zoomBy } from './controller';
import { framingDistance, FOV_DEG, minDistance } from './framing';

const initialView = useView.getState();
let stage: CameraStage;
let frame: MapFrame;

/** Runs the stages the camera needs, for one frame of `dt` wall seconds. */
function step(dt = 1 / 60) {
  const world = useWorld.getState().world;
  bodiesStage(frame, world, world.clock.t);
  shipsStage(frame, world);
  stage.update(frame, dt, 1000, 800, 1);
}
const settle = () => {
  for (let i = 0; i < 120; i++) step();
};

beforeEach(() => {
  useView.setState(initialView, true);
  useWorld.setState({ world: createSandboxWorld(), version: 0 });
  const world = useWorld.getState().world;
  world.clock.paused = true;
  frame = createMapFrame(world.system);
  stage = new CameraStage(new PerspectiveCamera(FOV_DEG, 1000 / 800, 1e-3, 1e12), frame);
  step(0);
});
afterEach(() => stage.dispose());

describe('CameraStage', () => {
  it("starts at Earth's framing, looking straight down on the ecliptic (S5b-10)", () => {
    const c = stage.controller;
    expect(c.pitch).toBe(START_PITCH);
    expect(c.pole).toEqual({ x: 0, y: 0, z: 1 });
    expect(10 ** c.logDistance).toBeCloseTo(
      framingDistance(useWorld.getState().world.system, 'earth'),
      3,
    );
    expect(frame.camera.forward.z).toBeCloseTo(-1, 12);
  });

  it('refocusing an object on screen keeps the distance, yaw, pitch and pole (S5b-5)', () => {
    const c = stage.controller;
    // The Moon is on screen at Earth's framing.
    expect(onScreen(frame, useWorld.getState().world, { kind: 'body', id: 'moon' })).toBe(true);
    const before = { d: c.target.logDistance, yaw: c.yaw, pitch: c.pitch, pole: c.pole };
    useView.getState().focusOn({ kind: 'body', id: 'moon' });
    settle();
    expect(c.focus).toEqual({ kind: 'body', id: 'moon' });
    expect(c.logDistance).toBeCloseTo(before.d, 12);
    expect(c.yaw).toBe(before.yaw);
    expect(c.pitch).toBe(before.pitch);
    expect(c.pole).toBe(before.pole);
  });

  it('an object off screen gets its framing distance', () => {
    const world = useWorld.getState().world;
    expect(onScreen(frame, world, { kind: 'body', id: 'mars' })).toBe(false);
    useView.getState().focusOn({ kind: 'body', id: 'mars' });
    settle();
    expect(10 ** stage.controller.logDistance).toBeCloseTo(
      framingDistance(world.system, 'mars'),
      3,
    );
  });

  it("an on-screen refocus is clamped to the new focus's minimum distance", () => {
    const world = useWorld.getState().world;
    // Zoom in close to the Moon, then focus Earth, which is still on screen behind it.
    useView.getState().focusOn({ kind: 'body', id: 'moon' });
    settle();
    zoomBy(stage.controller, -100);
    settle();
    const moonMin = minDistance(world.system, 'moon');
    expect(10 ** stage.controller.logDistance).toBeCloseTo(moonMin, 3);
    useView.getState().snapTo('ecliptic');
    settle();
    // Earth is far off screen from here: framed. Put it on screen by looking from far away.
    zoomBy(stage.controller, 40);
    settle();
    expect(onScreen(frame, world, { kind: 'body', id: 'earth' })).toBe(true);
    zoomBy(stage.controller, -100);
    // Not settled: the target is the Moon's minimum, below Earth's.
    useView.getState().focusOn({ kind: 'body', id: 'earth' });
    expect(10 ** stage.controller.target.logDistance).toBeCloseTo(
      minDistance(world.system, 'earth'),
      3,
    );
  });
});
