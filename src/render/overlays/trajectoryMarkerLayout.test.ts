// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createSandboxWorld } from '../../gen/scenario';
import { cross, normalize, scale, vec3 } from '../../math/vec3';
import { createMapFrame, frameWorldInto } from '../mapFrame';
import { projectFrame, setFrameCamera } from '../projection';
import { bodiesStage, shipsStage, type ViewSnapshot } from '../stages';
import { trajectoryMarkers } from '../trajectoryMarkers';
import { createTrajectoryMarkerRegistry, placeTrajectoryMarkers } from './trajectoryMarkerLayout';

describe('trajectory markers behind a disc (S5b-14)', () => {
  it("dims Tern's periapsis behind Earth, with no text; its apoapsis in front is unchanged", () => {
    const world = createSandboxWorld();
    const f = createMapFrame(world.system);
    bodiesStage(f, world, 0);
    shipsStage(f, world);
    // Origin at Earth. Put the camera on the line from Tern's periapsis through Earth's centre,
    // beyond it, so that the periapsis is behind Earth and the apoapsis in front.
    frameWorldInto(f, f.indexOf['earth']!, f.origin);
    const fmt = (km: number) => `${Math.round(km)} km`;
    const traj = world.derived.trajectories['ship-2']!;
    const ms = trajectoryMarkers(world.system, 'ship-2', traj, 0, 'earth', true, fmt);
    const pe = ms.find((m) => m.kind === 'periapsis')!.pos;
    const back = normalize(scale(pe, -1));
    const up = normalize(cross(back, Math.abs(back.z) < 0.9 ? vec3(0, 0, 1) : vec3(1, 0, 0)));
    setFrameCamera(
      f,
      { offset: scale(back, 2e5), forward: scale(back, -1), up },
      (50 * Math.PI) / 180,
      800,
      600,
    );
    projectFrame(f, world.system);
    const reg = createTrajectoryMarkerRegistry(fmt);
    reg.attach(document.createElement('div'));
    const view: ViewSnapshot = {
      focus: { kind: 'body', id: 'earth' },
      selected: { kind: 'ship', id: 'ship-2' },
      hovered: null,
      frameBodyId: 'earth',
      activeShipId: null,
      previewing: false,
      flash: null,
    };
    placeTrajectoryMarkers(reg, f, world, view);
    const placed = (kind: string) =>
      reg.placed.find((m) => m.shipId === 'ship-2' && m.kind === kind)!;
    expect(placed('periapsis').dimmed).toBe(true);
    expect(placed('periapsis').textShown).toBe(false);
    expect(placed('apoapsis').dimmed).toBe(false);
    expect(placed('apoapsis').textShown).toBe(true);
  });
});
