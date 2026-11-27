import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createSandboxWorld } from '../gen/scenario';
import { setPaused, setWarpIndex, warpDown, warpUp } from '../sim/clock';
import type { World } from '../sim/world';

/**
 * The world and its version (decision S2-17 in planning/sprint-2.md).
 *
 * The world is mutated in place: the clock stage advances `world.clock.t` every frame without
 * touching the store. Actions that change the world bump `version`, and panels subscribe to
 * `version`. Readouts that follow `t` use `useSimTime` instead. Sprint 3 decides whether these
 * actions go through `game/actions.ts`.
 */
interface WorldState {
  /** Mutated in place by the clock; never replaced except on reset. */
  world: World;
  /** Bumped by every action. */
  version: number;
  togglePause(): void;
  warpUp(): void;
  warpDown(): void;
  setWarpIndex(i: number): void;
}

export const useWorld = create<WorldState>()((set, get) => {
  /** Applies a mutation to the world and bumps the version. */
  const act = (f: (w: World) => void) => {
    f(get().world);
    set((s) => ({ version: s.version + 1 }));
  };
  return {
    world: createSandboxWorld(),
    version: 0,
    togglePause: () => act((w) => setPaused(w.clock, !w.clock.paused)),
    warpUp: () => act((w) => warpUp(w.clock)),
    warpDown: () => act((w) => warpDown(w.clock)),
    setWarpIndex: (i) => act((w) => setWarpIndex(w.clock, i)),
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
