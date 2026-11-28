import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createSandboxWorld } from '../gen/scenario';
import * as actions from '../game/actions';
import type { ActionResult, NodeEdit, SpawnShipParams } from '../game/actions';
import type { LocalDv } from '../orbital/frames';
import type { PassageKind } from '../orbital/passages';
import type { PausableEvent } from '../sim/clock';
import type { NodeId } from '../sim/maneuver';
import { createEventRegistry, registerShipHandlers, type EventRegistry } from '../sim/events';
import type { ShipId } from '../sim/ship';
import type { World } from '../sim/world';

/**
 * The world and its version (decisions S2-17 and S3-12).
 *
 * The world is mutated in place: the clock stage advances it every frame without touching the
 * store. Player actions go through `game/actions.ts`; the store calls them and bumps `version`
 * on success, and panels subscribe to `version`. The clock stage bumps it too when it handled
 * events. Readouts that follow `t` use `useSimTime` instead.
 */
interface WorldState {
  /** Mutated in place by the clock; never replaced except on reset. */
  world: World;
  /** Bumped by every successful action, and by frames that handled events. */
  version: number;
  /** The sim event handlers (S3-9). */
  events: EventRegistry;
  bumpVersion(): void;
  togglePause(): ActionResult;
  warpUp(): ActionResult;
  warpDown(): ActionResult;
  setWarpIndex(i: number): ActionResult;
  spawnShip(p: SpawnShipParams): ActionResult<ShipId>;
  addNode(shipId: ShipId, p: { t: number; dv?: LocalDv }): ActionResult<NodeId>;
  addNodeAt(shipId: ShipId, at: PassageKind | { t: number }): ActionResult<NodeId>;
  editNode(shipId: ShipId, nodeId: NodeId, edit: NodeEdit): ActionResult;
  deleteNode(shipId: ShipId, nodeId: NodeId): ActionResult;
  snapNode(shipId: ShipId, nodeId: NodeId, to: 'periapsis' | 'apoapsis'): ActionResult;
  setPauseOn(type: PausableEvent | 'all', on: boolean): ActionResult;
}

function createRegistry(): EventRegistry {
  const reg = createEventRegistry();
  registerShipHandlers(reg);
  return reg;
}

export const useWorld = create<WorldState>()((set, get) => {
  /** Runs an action on the world, and bumps the version if it succeeded. */
  const act = <T>(f: (w: World) => ActionResult<T>): ActionResult<T> => {
    const result = f(get().world);
    if (result.ok) set((s) => ({ version: s.version + 1 }));
    return result;
  };
  return {
    world: createSandboxWorld(),
    version: 0,
    events: createRegistry(),
    bumpVersion: () => set((s) => ({ version: s.version + 1 })),
    togglePause: () => act(actions.togglePause),
    warpUp: () => act(actions.warpUp),
    warpDown: () => act(actions.warpDown),
    setWarpIndex: (i) => act((w) => actions.setWarpIndex(w, i)),
    spawnShip: (p) => act((w) => actions.spawnShip(w, p)),
    addNode: (id, p) => act((w) => actions.addNode(w, id, p)),
    addNodeAt: (id, at) => act((w) => actions.addNodeAt(w, id, at)),
    editNode: (id, nodeId, edit) => act((w) => actions.editNode(w, id, nodeId, edit)),
    deleteNode: (id, nodeId) => act((w) => actions.deleteNode(w, id, nodeId)),
    snapNode: (id, nodeId, to) => act((w) => actions.snapNode(w, id, nodeId, to)),
    setPauseOn: (type, on) => act((w) => actions.setPauseOn(w, type, on)),
  };
});

/** Sim time, re-rendering the caller at most `hz` times a second (S2-17). */
export function useSimTime(hz = 10): number {
  const world = useWorld((s) => s.world);
  const [t, setT] = useState(world.clock.t);
  useEffect(() => {
    // Picks up the current time at once (the world may have been replaced), then polls.
    const update = () => setT(world.clock.t);
    update();
    const id = setInterval(update, 1000 / hz);
    return () => clearInterval(id);
  }, [world, hz]);
  return t;
}
