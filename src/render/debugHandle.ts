/**
 * The dev-only debug handle (decision S2-21 in planning/sprint-2.md): `window.__spaceGame`
 * exposes read-only probes for the smoke test. In production builds `import.meta.env.DEV` is
 * false, `registerDebug` returns at once, and the probes are dropped as dead code.
 */

import { meanOrbitNormal } from '../orbital/propagate';
import { bodyWorldState } from '../sim/body';
import { shipPointAt } from '../sim/world';
import { useView } from '../store/useView';
import { useWorld } from '../store/useWorld';
import { controllerPose, type CameraController } from './camera/controller';
import type { TrajectoryLayer } from './layers/TrajectoryLayer';
import { resolveFrameBody, type MapFrame } from './mapFrame';
import { viewTime } from './previewTime';
import type { TrajectoryMarkerRegistry } from './overlays/trajectoryMarkerLayout';

interface DebugSources {
  frame?: MapFrame;
  controller?: CameraController;
  trajectories?: TrajectoryLayer;
  markers?: TrajectoryMarkerRegistry;
  /** The node gizmo on screen (S4-20). */
  gizmo?: () => unknown;
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
      return frame().labels.map((l) => ({
        id: l.ref.id,
        kind: l.ref.kind,
        ...l.rect,
        // The names of a merged label, on its first part (S5b-16).
        ...(l.parts ? { parts: l.parts.map((p) => p.id) } : {}),
      }));
    },
    /** The reference frame and the body it resolves to at the view time (S5b-1). */
    frame() {
      const { world } = useWorld.getState();
      const v = useView.getState();
      return {
        ref: v.frame,
        bodyId: resolveFrameBody(world, v.frame, viewTime(world.clock.t, v.preview)),
      };
    },
    /** The object flashing, and the wall ms left, or null (S5b-11). */
    flash() {
      const f = useView.getState().flash;
      const left = f ? f.until - performance.now() : 0;
      return f && left > 0 ? { ref: f.ref, left } : null;
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
    /** A ship's trajectory segments and status (S3-22). */
    trajectory(id: string) {
      const world = useWorld.getState().world;
      const ship = world.ships[id];
      if (!ship) throw new Error(`unknown ship ${id}`);
      const traj = world.derived.trajectories[id];
      return {
        status: ship.status,
        segments: (traj?.segments ?? []).map((s) => ({
          parentId: s.parentId,
          tStart: s.tStart,
          tEnd: s.tEnd,
          endEvent: s.endEvent,
          endTargetId: s.endTargetId ?? null,
          endNodeId: s.endNodeId ?? null,
          dvApplied: s.dvApplied ?? null,
        })),
      };
    },
    /** A ship's plan (S4-20): each node, whether it is reached, and the Δv applied there. */
    plan(id: string) {
      const world = useWorld.getState().world;
      const ship = world.ships[id];
      if (!ship) throw new Error(`unknown ship ${id}`);
      const segs = world.derived.trajectories[id]?.segments ?? [];
      return ship.plan.map((n) => {
        const seg = segs.find((s) => s.endNodeId === n.id);
        return { ...n, dv: { ...n.dv }, reached: !!seg, dvApplied: seg?.dvApplied ?? 0 };
      });
    },
    /** A node glyph's screen position this frame, or null (S4-20). */
    nodeScreen(nodeId: string) {
      const n = frame().nodes.find((x) => x.nodeId === nodeId);
      return n ? { x: n.x, y: n.y } : null;
    },
    /** The ghost node under the pointer, or null (S4-20). */
    ghost() {
      const g = frame().ghost;
      return g ? { ...g } : null;
    },
    /** The active ship's drawn, projected path pieces: screen points and times (S4-20). */
    activePath() {
      return frame().paths.map((p) => ({
        shipId: p.shipId,
        segmentIndex: p.segmentIndex,
        points: Array.from({ length: p.count }, (_, k) => ({
          x: p.screen[2 * k]!,
          y: p.screen[2 * k + 1]!,
          t: p.times[k]!,
        })),
      }));
    },
    /** The gizmo: its node and each handle's screen position and axis, or null (S4-20). */
    gizmo() {
      return sources.gizmo?.() ?? null;
    },
    /** The active ship's ID, as the view has it (S4-20). */
    activeShip() {
      return useView.getState().activeShipId;
    },
    /** A ship's trajectory key and version, and the cache counters (S4-20). */
    trajectoryKey(id: string) {
      const d = useWorld.getState().world.derived;
      const t = d.trajectories[id];
      return { key: t?.key ?? null, version: t?.version ?? 0, cache: { ...d.cacheStats } };
    },
    /** The vertices drawn per segment of a ship's trajectory this frame. */
    trajectoryVertices(id: string) {
      return sources.trajectories?.vertexCounts.get(id) ?? [];
    },
    /** The vertices drawn per segment of a ship's elapsed route in a preview (S5-16). */
    elapsedVertices(id: string) {
      return sources.trajectories?.elapsedCounts.get(id) ?? [];
    },
    /** The timeline strip: its span and box, and each glyph's event and centre (S5-15). */
    timeline() {
      const strip = document.querySelector<HTMLElement>('[aria-label="Timeline strip"]');
      if (!strip) return null;
      const box = strip.getBoundingClientRect();
      const glyphs = Array.from(strip.querySelectorAll<HTMLElement>('[data-strip-glyph]')).map(
        (el) => {
          const r = el.getBoundingClientRect();
          return {
            kind: el.dataset['stripGlyph'],
            t: Number(el.dataset['t']),
            shipId: el.dataset['ship'],
            x: r.left + r.width / 2,
            y: r.top + r.height / 2,
          };
        },
      );
      return {
        span: Number(strip.dataset['span']),
        box: { left: box.left, top: box.top, width: box.width, height: box.height },
        glyphs,
      };
    },
    /** The preview and the time the map is drawn at, or null (S5-15). */
    preview() {
      const p = useView.getState().preview;
      return p ? { viewTime: p.t, sticky: p.sticky, frameT: frame().t } : null;
    },
    /** The clock, with any warp-to (S5-15). */
    clock() {
      const c = useWorld.getState().world.clock;
      return { t: c.t, paused: c.paused, warpIndex: c.warpIndex, warpTo: c.warpTo };
    },
    /** A ship's world position as drawn this frame, or null if it isn't drawn (S5-15). */
    shipWorld(id: string) {
      const f = frame();
      const k = f.ships.indexOf[id];
      if (k === undefined) return null;
      const w = f.ships.world;
      return { x: w[3 * k]!, y: w[3 * k + 1]!, z: w[3 * k + 2]!, t: f.t };
    },
    /** A ship's world position at t predicted by its trajectory, or null (S5-15). */
    shipPredicted(id: string, t: number) {
      const w = useWorld.getState().world;
      const p = shipPointAt(w, id, t);
      if (!p) return null;
      const b = bodyWorldState(w.system, p.parentId, t).r;
      return {
        x: b.x + p.state.r.x,
        y: b.y + p.state.r.y,
        z: b.z + p.state.r.z,
        parentId: p.parentId,
      };
    },
    /** A body's world position as drawn this frame (S5-15). */
    bodyWorld(id: string) {
      const f = frame();
      const i = f.indexOf[id];
      if (i === undefined) return null;
      return { x: f.world[3 * i]!, y: f.world[3 * i + 1]!, z: f.world[3 * i + 2]!, t: f.t };
    },
    /** The trajectory markers placed this frame. */
    trajectoryMarkers() {
      return sources.markers?.placed ?? [];
    },
    /** Every ship's ID, name and status. */
    ships() {
      return Object.values(useWorld.getState().world.ships).map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
      }));
    },
    /** A body's orbit normal at the time the map is drawn at. */
    orbitNormal(id: string) {
      const { system, clock } = useWorld.getState().world;
      const orbit = system.bodies[id]?.orbit;
      return orbit ? meanOrbitNormal(orbit, viewTime(clock.t, useView.getState().preview)) : null;
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
