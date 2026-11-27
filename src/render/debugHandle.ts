/**
 * The dev-only debug handle (decision S2-21 in planning/sprint-2.md): `window.__spaceGame`
 * exposes read-only probes for the smoke test. In production builds `import.meta.env.DEV` is
 * false, `registerDebug` returns at once, and the probes are dropped as dead code.
 */

import { meanOrbitNormal } from '../orbital/propagate';
import { useView } from '../store/useView';
import { useWorld } from '../store/useWorld';
import { controllerPose, type CameraController } from './camera/controller';
import type { MapFrame } from './mapFrame';

interface DebugSources {
  frame?: MapFrame;
  controller?: CameraController;
}

const sources: DebugSources = {};

function createProbes() {
  const frame = () => {
    if (!sources.frame) throw new Error('no map frame yet');
    return sources.frame;
  };
  return {
    /** The camera controller's state, with its pose. */
    camera() {
      const c = sources.controller;
      if (!c) throw new Error('no camera yet');
      const pose = controllerPose(c);
      return {
        focusId: c.focus.id,
        focusKind: c.focus.kind,
        yaw: c.yaw,
        pitch: c.pitch,
        distance: 10 ** c.logDistance,
        targetDistance: 10 ** c.target.logDistance,
        pole: { ...c.pole },
        forward: pose.forward,
        up: pose.up,
        animating: c.refocus !== null || c.snap !== null,
      };
    },
    /** A body's projection: CSS px from the canvas's top left, disc radius px, depth km. */
    body(id: string) {
      const f = frame();
      const i = f.indexOf[id];
      if (i === undefined) throw new Error(`unknown body ${id}`);
      return {
        x: f.screenX[i]!,
        y: f.screenY[i]!,
        disc: f.discPx[i]!,
        depth: f.depth[i]!,
        marker: f.markerShown[i] === 1,
        sphere: f.sphereShown[i] === 1,
        merged: f.merged[i] === 1,
      };
    },
    /** The labels placed this frame. */
    labels() {
      return frame().labels.map((l) => ({ id: l.ref.id, kind: l.ref.kind, ...l.rect }));
    },
    /** A drawn ship's projection (S3-22); null if it isn't drawn (destroyed). */
    ship(id: string) {
      const fs = frame().ships;
      const k = fs.indexOf[id];
      if (k === undefined) return null;
      return {
        x: fs.screenX[k]!,
        y: fs.screenY[k]!,
        depth: fs.depth[k]!,
        marker: fs.markerShown[k] === 1,
        merged: fs.merged[k] === 1,
      };
    },
    /** Every ship's ID, name and status. */
    ships() {
      return Object.values(useWorld.getState().world.ships).map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
      }));
    },
    /** A body's orbit normal at the current sim time. */
    orbitNormal(id: string) {
      const { system, clock } = useWorld.getState().world;
      const orbit = system.bodies[id]?.orbit;
      return orbit ? meanOrbitNormal(orbit, clock.t) : null;
    },
    /** Sim time, s. */
    simTime() {
      return useWorld.getState().world.clock.t;
    },
    view: useView,
    world: useWorld,
  };
}

declare global {
  interface Window {
    __spaceGame?: ReturnType<typeof createProbes>;
  }
}

/** Registers a source for the probes, and installs the handle (dev builds only). */
export function registerDebug<K extends keyof DebugSources>(key: K, value: DebugSources[K]): void {
  if (!import.meta.env.DEV) return;
  sources[key] = value;
  if (typeof window !== 'undefined' && !window.__spaceGame) window.__spaceGame = createProbes();
}
