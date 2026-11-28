/**
 * The map at a preview time (decisions S5-9, S5-10 and S5-16 in planning/sprint-5.md): bodies
 * and ships at viewTime, ships placed from their trajectories, and the sim left alone.
 */
import { describe, expect, it } from 'vitest';
import { SMOKE_TLI } from '../gen/lunarMission';
import { presetOrbit } from '../gen/sandboxShips';
import { createSandboxWorld } from '../gen/scenario';
import { addNode, spawnShip } from '../game/actions';
import { add, norm, sub, vec3 } from '../math/vec3';
import { bodyWorldState } from '../sim/body';
import { trajectoryStateAt } from '../sim/trajectory';
import { upcomingEvents } from '../sim/upcoming';
import type { World } from '../sim/world';
import {
  frameBodyOf,
  createMapFrame,
  frameWorldInto,
  mapObjectWorldInto,
  resolveFrameBody,
} from './mapFrame';
import { previewCaughtUp, viewTime } from './previewTime';
import { bodiesStage, shipsStage } from './stages';
import { conicGeometry, elapsedWindow, segmentIndexAt } from './trajectoryGeometry';

function lunarWorld(): { w: World; id: string } {
  const w = createSandboxWorld();
  const r = spawnShip(w, {
    designId: 'starship',
    orbit: presetOrbit(w.system, 'leo-lunar-plane', 0),
  });
  const id = r.ok ? r.value : '';
  addNode(w, id, { t: SMOKE_TLI.dt, dv: { prograde: SMOKE_TLI.dv, normal: 0, radial: 0 } });
  return { w, id };
}

const shipAt = (w: World, id: string, t: number) => {
  const p = trajectoryStateAt(w.system, w.derived.trajectories[id]!.segments, t)!;
  return { parentId: p.parentId, r: add(bodyWorldState(w.system, p.parentId, t).r, p.state.r) };
};

const snapshot = (w: World) => {
  const { derived, ...rest } = w;
  return JSON.stringify({ rest, traj: derived.trajectories, events: derived.events });
};

describe('previewTime (S5-9)', () => {
  it('is the preview time, or now; a preview ends when now catches up', () => {
    expect(viewTime(10, null)).toBe(10);
    expect(viewTime(10, { t: 50, sticky: true })).toBe(50);
    expect(previewCaughtUp(10, null)).toBe(false);
    expect(previewCaughtUp(10, { t: 50, sticky: false })).toBe(false);
    expect(previewCaughtUp(50, { t: 50, sticky: false })).toBe(true);
  });
});

describe('the map at a preview time (S5-10)', () => {
  it('draws the ship and the Moon at the lunar arrival, as predicted, without changing the sim', () => {
    const { w, id } = lunarWorld();
    w.clock.paused = true;
    const before = snapshot(w);
    const entry = upcomingEvents(w, id).events.find((e) => e.kind === 'soi-enter')!;
    const f = createMapFrame(w.system);
    bodiesStage(f, w, entry.t);
    shipsStage(f, w);
    expect(f.t).toBe(entry.t);
    expect(f.now).toBe(w.clock.t);
    const k = f.ships.indexOf[id]!;
    expect(f.ships.parentIndex[k]).toBe(f.indexOf['moon']);
    const got = mapObjectWorldInto(f, w, { kind: 'ship', id }, vec3(0, 0, 0));
    const want = shipAt(w, id, entry.t).r;
    expect(norm(sub(got, want)) / norm(want)).toBeLessThan(1e-9);
    const moon = frameWorldInto(f, f.indexOf['moon']!, vec3(0, 0, 0));
    expect(norm(sub(moon, bodyWorldState(w.system, 'moon', entry.t).r))).toBeLessThan(1e-6);
    expect(frameBodyOf(w, { kind: 'ship', id }, entry.t)).toBe('moon');
    expect(snapshot(w)).toBe(before);

    // Back at now, the ship is around Earth again.
    bodiesStage(f, w, w.clock.t);
    shipsStage(f, w);
    expect(f.ships.parentIndex[f.ships.indexOf[id]!]).toBe(f.indexOf['earth']);
  });

  it('places the ship on its post-burn conic after a node', () => {
    const { w, id } = lunarWorld();
    const f = createMapFrame(w.system);
    const t = SMOKE_TLI.dt + 3600;
    bodiesStage(f, w, t);
    shipsStage(f, w);
    const got = mapObjectWorldInto(f, w, { kind: 'ship', id }, vec3(0, 0, 0));
    expect(norm(sub(got, shipAt(w, id, t).r))).toBeLessThan(1e-6);
  });

  it("doesn't draw a ship whose trajectory doesn't reach the time, and frames on the body it hits", () => {
    const { w, id } = lunarWorld();
    const end = w.derived.trajectories[id]!.segments.at(-1)!;
    const f = createMapFrame(w.system);
    bodiesStage(f, w, end.tEnd + 10);
    shipsStage(f, w);
    expect(f.ships.ids).not.toContain(id);
    if (end.endEvent === 'impact') {
      expect(frameBodyOf(w, { kind: 'ship', id }, end.tEnd + 10)).toBe(end.endTargetId);
    }
    bodiesStage(f, w, w.clock.t);
    shipsStage(f, w);
    expect(f.ships.ids).toContain(id);
  });
});

describe('resolveFrameBody (S5b-1, S5b-3)', () => {
  it('follows the ship across its Moon SOI entry, at now and at a preview time, and after impact', () => {
    const { w, id } = lunarWorld();
    const follow = { kind: 'ship-parent', shipId: id } as const;
    const entry = upcomingEvents(w, id).events.find((e) => e.kind === 'soi-enter')!;
    expect(resolveFrameBody(w, follow, w.clock.t)).toBe('earth');
    expect(resolveFrameBody(w, follow, entry.t - 60)).toBe('earth');
    expect(resolveFrameBody(w, follow, entry.t + 60)).toBe('moon');
    const end = w.derived.trajectories[id]!.segments.at(-1)!;
    if (end.endEvent === 'impact') {
      expect(resolveFrameBody(w, follow, end.tEnd + 10)).toBe(end.endTargetId);
    }
  });

  it('is a fixed body itself, whatever the time', () => {
    const { w } = lunarWorld();
    expect(resolveFrameBody(w, { kind: 'body', id: 'mars' }, 1e9)).toBe('mars');
  });
});

describe('trajectory geometry in a preview (S5-10, S5-16)', () => {
  const { w, id } = lunarWorld();
  const segs = w.derived.trajectories[id]!.segments;

  it('finds the segment containing t, the later one at a boundary', () => {
    expect(segmentIndexAt(segs, 0)).toBe(0);
    expect(segmentIndexAt(segs, SMOKE_TLI.dt)).toBe(1);
    expect(segmentIndexAt(segs, segs.at(-1)!.tEnd + 1)).toBe(-1);
  });

  it('gives the elapsed window from now to the preview time, at most a revolution', () => {
    const g0 = conicGeometry(w.system, segs[0]!);
    // Outside a preview (t = now): none.
    expect(elapsedWindow(segs[0]!, g0, 0, 0)).toBeNull();
    // Inside segment 0, under a revolution: from now.
    expect(elapsedWindow(segs[0]!, g0, 0, 1000)).toEqual([0, 1000]);
    // Past segment 0 (the node): the last revolution before the node.
    const P = g0.kind === 'elliptic' ? g0.period : NaN;
    const win = elapsedWindow(segs[0]!, g0, 0, SMOKE_TLI.dt + 5000)!;
    expect(win[1]).toBe(SMOKE_TLI.dt);
    expect(win[0]).toBeCloseTo(Math.max(0, SMOKE_TLI.dt - P), 9);
    // A segment wholly flown in the preview, and the one containing t, split there.
    const g1 = conicGeometry(w.system, segs[1]!);
    const t = segs[1]!.tStart + 1000;
    expect(elapsedWindow(segs[1]!, g1, 0, t)).toEqual([segs[1]!.tStart, t]);
    expect(elapsedWindow(segs[2]!, conicGeometry(w.system, segs[2]!), 0, t)).toBeNull();
    // Nothing before now.
    expect(elapsedWindow(segs[0]!, g0, SMOKE_TLI.dt, SMOKE_TLI.dt + 10)).toBeNull();
  });
});
