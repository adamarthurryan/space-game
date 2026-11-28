import { describe, expect, it } from 'vitest';
import { push, size } from '../math/pqueue';
import { buildBodySystem } from './body';
import { setPaused } from './clock';
import { createEventRegistry, dispatch, on, type SimEvent } from './events';
import { advanceWorld, createWorld, MAX_EVENTS_PER_FRAME, type World } from './world';

const system = buildBodySystem(2_451_545, [
  {
    id: 'sun',
    name: 'Sun',
    class: 'star',
    parentId: null,
    mu: 1.327_124_400_18e11,
    radius: 695_700,
    atmosphereHeight: 0,
  },
]);

const ev = (
  shipId: string,
  type: Exclude<SimEvent['type'], 'node' | 'alarm'> = 'soi-change',
): SimEvent => ({
  type,
  shipId,
  trajectoryVersion: 1,
});

/** A world at t = 0 whose frames aim 10 s ahead (×100 for 0.1 s). */
function world(): World {
  const w = createWorld(system, 0);
  w.clock.warpIndex = 2;
  return w;
}

describe('dispatch', () => {
  it('calls the handlers for the event type, in order, and none for other types', () => {
    const reg = createEventRegistry();
    const calls: string[] = [];
    on(reg, 'soi-change', () => void calls.push('a'));
    on(reg, 'soi-change', () => void calls.push('b'));
    on(reg, 'impact', () => void calls.push('impact'));
    dispatch(reg, world(), ev('s'));
    expect(calls).toEqual(['a', 'b']);
  });

  it('keeps registries apart', () => {
    const a = createEventRegistry();
    const b = createEventRegistry();
    let n = 0;
    on(a, 'impact', () => void n++);
    dispatch(b, world(), ev('s', 'impact'));
    expect(n).toBe(0);
  });

  it('pauses if any handler asks to', () => {
    const reg = createEventRegistry();
    on(reg, 'impact', () => ({ pause: true }));
    on(reg, 'impact', () => undefined);
    expect(dispatch(reg, world(), ev('s', 'impact')).pause).toBe(true);
  });
});

describe('advanceWorld', () => {
  it('sets t to the event time exactly, then to the frame target', () => {
    const w = world();
    const reg = createEventRegistry();
    const seen: number[] = [];
    on(reg, 'soi-change', (wd) => void seen.push(wd.clock.t));
    push(w.derived.events, 5, ev('a'));
    const r = advanceWorld(w, 0.1, reg);
    expect(seen).toEqual([5]);
    expect(w.clock.t).toBe(10);
    expect(r).toEqual({ events: 1, pause: false, arrived: false });
  });

  it('runs events at equal times in insertion order, and one exactly at the target', () => {
    const w = world();
    const reg = createEventRegistry();
    const seen: string[] = [];
    on(reg, 'soi-change', (_, e) => void seen.push(e.shipId));
    push(w.derived.events, 10, ev('c'));
    push(w.derived.events, 3, ev('a'));
    push(w.derived.events, 3, ev('b'));
    push(w.derived.events, 10.5, ev('late'));
    advanceWorld(w, 0.1, reg);
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(size(w.derived.events)).toBe(1);
  });

  it('runs an event queued by a handler in the same frame if it is due', () => {
    const w = world();
    const reg = createEventRegistry();
    const seen: [string, number][] = [];
    on(reg, 'soi-change', (wd, e) => {
      seen.push([e.shipId, wd.clock.t]);
      if (e.shipId === 'first') push(wd.derived.events, 7, ev('second'));
    });
    push(w.derived.events, 5, ev('first'));
    advanceWorld(w, 0.1, reg);
    expect(seen).toEqual([
      ['first', 5],
      ['second', 7],
    ]);
  });

  it('runs nothing while paused', () => {
    const w = world();
    setPaused(w.clock, true);
    const reg = createEventRegistry();
    let n = 0;
    on(reg, 'soi-change', () => void n++);
    push(w.derived.events, 0, ev('a'));
    advanceWorld(w, 0.1, reg);
    expect(n).toBe(0);
    expect(w.clock.t).toBe(0);
  });

  it(`handles at most ${MAX_EVENTS_PER_FRAME} events a frame, and stops t at the last`, () => {
    const w = world();
    const reg = createEventRegistry();
    on(reg, 'soi-change', () => undefined);
    for (let i = 1; i <= 300; i++) push(w.derived.events, i * 0.01, ev(`s${i}`));
    const r = advanceWorld(w, 0.1, reg);
    expect(r.events).toBe(MAX_EVENTS_PER_FRAME);
    expect(w.clock.t).toBe(MAX_EVENTS_PER_FRAME * 0.01);
    expect(size(w.derived.events)).toBe(300 - MAX_EVENTS_PER_FRAME);
  });
});
