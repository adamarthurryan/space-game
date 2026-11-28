import { describe, expect, it } from 'vitest';
import { addTestShip, alarmWorld, escape, leo, node, reg, runUntilPaused } from './alarmTestKit';
import {
  addAlarm,
  alarmSchedule,
  deleteAlarm,
  fireTime,
  MAX_NOTIFICATIONS,
  nextOccurrence,
  triggerMatches,
  updateAlarm,
  type Alarm,
  type AlarmTrigger,
} from './alarms';
import { setWarpIndex, startWarpTo } from './clock';
import { assignShip, createFleet } from './fleet';
import { upcomingEvents, type UpcomingEvent } from './upcoming';
import { advanceWorld, refreshShip } from './world';

const ev = (over: Partial<UpcomingEvent>): UpcomingEvent => ({
  shipId: 'ship-1',
  kind: 'node',
  t: 100,
  segmentIndex: 0,
  enabled: true,
  parentId: 'planet',
  ...over,
});

const base = (trigger: AlarmTrigger, over: Partial<Alarm> = {}) => ({
  scope: { kind: 'global' as const },
  trigger,
  leadTime: 0,
  action: 'pause' as const,
  enabled: true,
  ...over,
});

describe('triggerMatches (S6-13)', () => {
  const enter = ev({ kind: 'soi-enter', bodyId: 'moon' });
  const exit = ev({ kind: 'soi-exit', parentId: 'planet', bodyId: 'star' });
  const impact = ev({ kind: 'impact', bodyId: 'moon' });
  const t = (
    type: 'node' | 'soi-change' | 'soi-enter' | 'soi-exit' | 'impact',
    targetId?: string,
  ) => ({ kind: 'event-type', type, ...(targetId ? { targetId } : {}) }) as AlarmTrigger;

  it('matches each event type, with and without a target', () => {
    expect(triggerMatches(t('node'), ev({}))).toBe(true);
    expect(triggerMatches(t('node'), ev({ enabled: false }))).toBe(false);
    expect(triggerMatches(t('soi-enter', 'moon'), enter)).toBe(true);
    expect(triggerMatches(t('soi-enter', 'planet'), enter)).toBe(false);
    // An exit's target is the body left.
    expect(triggerMatches(t('soi-exit', 'planet'), exit)).toBe(true);
    expect(triggerMatches(t('soi-exit', 'star'), exit)).toBe(false);
    expect(triggerMatches(t('soi-change'), enter)).toBe(true);
    expect(triggerMatches(t('soi-change', 'planet'), exit)).toBe(true);
    expect(triggerMatches(t('soi-change', 'moon'), exit)).toBe(false);
    expect(triggerMatches(t('impact', 'moon'), impact)).toBe(true);
    expect(triggerMatches(t('impact'), enter)).toBe(false);
  });

  it('matches a plan item only on its enabled node, and never a time', () => {
    const p: AlarmTrigger = { kind: 'plan-item', itemId: 'node-1' };
    expect(triggerMatches(p, ev({ nodeId: 'node-1' }))).toBe(true);
    expect(triggerMatches(p, ev({ nodeId: 'node-2' }))).toBe(false);
    expect(triggerMatches(p, ev({ nodeId: 'node-1', enabled: false }))).toBe(false);
    expect(triggerMatches({ kind: 'time', t: 100 }, ev({}))).toBe(false);
  });
});

describe('scheduling (S6-14)', () => {
  it('queues one event per covered ship, at the lead before the occurrence', () => {
    const w = alarmWorld([{ orbit: escape }, { orbit: escape }, { orbit: leo }]);
    const id = addAlarm(w, base({ kind: 'event-type', type: 'soi-exit' }, { leadTime: 600 }));
    const exit = upcomingEvents(w, 'ship-1').events[0]!;
    const sched = alarmSchedule(w);
    expect(sched.map((s) => s.shipId).sort()).toEqual(['ship-1', 'ship-2']);
    expect(sched[0]).toMatchObject({ alarmId: id, fireT: exit.t - 600, occurrence: exit.t });
  });

  it('fires now for an occurrence already inside its lead', () => {
    const w = alarmWorld([{ orbit: leo, plan: [node('node-1', 100, 0.01)] }]);
    const id = addAlarm(
      w,
      base(
        { kind: 'plan-item', itemId: 'node-1' },
        { leadTime: 600, scope: { kind: 'ship', shipId: 'ship-1' } },
      ),
    );
    expect(fireTime(w, w.alarms[id]!, 100)).toBe(0);
    expect(alarmSchedule(w)[0]!.fireT).toBe(0);
  });

  it('skips disabled alarms, destroyed and out-of-scope ships', () => {
    const w = alarmWorld([{ orbit: escape }, { orbit: escape }]);
    const f = createFleet(w, 'A');
    assignShip(w, 'ship-2', f);
    const id = addAlarm(
      w,
      base({ kind: 'event-type', type: 'soi-exit' }, { scope: { kind: 'fleet', fleetId: f } }),
    );
    expect(alarmSchedule(w).map((s) => s.shipId)).toEqual(['ship-2']);
    w.ships['ship-2']!.status = 'destroyed';
    expect(nextOccurrence(w, w.alarms[id]!, 'ship-2')).toBeNull();
    w.ships['ship-2']!.status = 'coasting';
    updateAlarm(w, id, { enabled: false });
    expect(alarmSchedule(w)).toEqual([]);
  });

  it('covers ships added later, and follows fleet membership', () => {
    const w = alarmWorld([]);
    const f = createFleet(w, 'A');
    addAlarm(
      w,
      base({ kind: 'event-type', type: 'soi-change' }, { scope: { kind: 'fleet', fleetId: f } }),
    );
    addAlarm(w, base({ kind: 'event-type', type: 'soi-exit' }));
    const s = addTestShip(w, escape);
    expect(alarmSchedule(w).map((x) => x.alarmId)).toEqual(['alarm-2']);
    assignShip(w, s, f);
    expect(
      alarmSchedule(w)
        .map((x) => x.alarmId)
        .sort(),
    ).toEqual(['alarm-1', 'alarm-2']);
    assignShip(w, s, null);
    expect(alarmSchedule(w).map((x) => x.alarmId)).toEqual(['alarm-2']);
  });

  it('refreshing a ship replaces only its alarm events, and keeps its ship event', () => {
    const w = alarmWorld([{ orbit: escape }, { orbit: escape }]);
    addAlarm(w, base({ kind: 'event-type', type: 'soi-exit' }));
    w.ships['ship-1']!.plan = [node('node-1', 100, 0.05)];
    refreshShip(w, 'ship-1');
    const types = w.derived.events.heap.map((e) => `${e.value.type}:${e.value.shipId}`).sort();
    expect(types).toEqual(['alarm:ship-1', 'alarm:ship-2', 'node:ship-1', 'soi-change:ship-2']);
  });
});

describe('firing (S6-16)', () => {
  it('pauses exactly at the fire time, notifies, and re-schedules a repeating alarm', () => {
    const w = alarmWorld([
      { orbit: leo, plan: [node('node-1', 1000, 0.01), node('node-2', 5000, 0.01)] },
    ]);
    w.clock.pauseOn.node = false;
    addAlarm(w, base({ kind: 'event-type', type: 'node' }, { leadTime: 60 }));
    runUntilPaused(w);
    expect(w.clock.t).toBe(940);
    expect(w.notifications).toHaveLength(1);
    expect(w.notifications[0]).toMatchObject({
      shipId: 'ship-1',
      eventT: 1000,
      text: 'S1: Node in 1 min',
    });
    expect(alarmSchedule(w)[0]).toMatchObject({ occurrence: 5000, fireT: 4940 });
    runUntilPaused(w);
    expect(w.clock.t).toBe(4940);
  });

  it('cancels a warp-to when it pauses', () => {
    const w = alarmWorld([{ orbit: escape }]);
    addAlarm(w, base({ kind: 'event-type', type: 'soi-exit' }));
    const exit = upcomingEvents(w, 'ship-1').events[0]!.t;
    startWarpTo(w.clock, { t: exit + 1e6, kind: 'event', shipId: null, label: 'x' });
    for (let i = 0; i < 1e5 && !w.clock.paused; i++) advanceWorld(w, 1 / 60, reg);
    expect(w.clock.t).toBe(exit);
    expect(w.clock.warpTo).toBeNull();
  });

  it('drop warp sets ×1, cancels a warp-to, keeps running, and ends the frame there', () => {
    const w = alarmWorld([{ orbit: leo, plan: [node('node-1', 1e6, 0.01)] }]);
    addAlarm(
      w,
      base({ kind: 'event-type', type: 'node' }, { leadTime: 3600, action: 'drop-warp' }),
    );
    setWarpIndex(w.clock, 7);
    startWarpTo(w.clock, { t: 2e6, kind: 'event', shipId: null, label: 'x' });
    let fired = false;
    for (let i = 0; i < 1e4 && !fired; i++) {
      advanceWorld(w, 1 / 60, reg);
      fired = w.notifications.length > 0;
    }
    expect(w.clock.t).toBe(1e6 - 3600);
    expect(w.clock.warpIndex).toBe(0);
    expect(w.clock.warpTo).toBeNull();
    expect(w.clock.paused).toBe(false);
    advanceWorld(w, 0.1, reg);
    expect(w.clock.t).toBeCloseTo(1e6 - 3600 + 0.1, 6);
  });

  it('a lead-0 plan-item alarm fires before its node executes (S6-15), then is gone', () => {
    const w = alarmWorld([{ orbit: leo, plan: [node('node-1', 1000, 0.01)] }]);
    const id = addAlarm(
      w,
      base({ kind: 'plan-item', itemId: 'node-1' }, { scope: { kind: 'ship', shipId: 'ship-1' } }),
    );
    runUntilPaused(w);
    expect(w.clock.t).toBe(1000);
    expect(w.ships['ship-1']!.plan.map((n) => n.id)).toEqual(['node-1']);
    expect(w.notifications[0]!.text).toBe('S1: Node now');
    expect(w.alarms[id]).toBeUndefined();
    runUntilPaused(w); // Pause on node: executes, then pauses at the same t.
    expect(w.clock.t).toBe(1000);
    expect(w.ships['ship-1']!.plan).toEqual([]);
  });

  it('deletes once and time alarms after firing', () => {
    const w = alarmWorld([{ orbit: escape }]);
    const once = addAlarm(w, base({ kind: 'event-type', type: 'soi-exit', once: true }));
    runUntilPaused(w);
    expect(w.alarms[once]).toBeUndefined();
    const t0 = w.clock.t;
    const time = addAlarm(w, base({ kind: 'time', t: t0 + 500 }));
    runUntilPaused(w);
    expect(w.clock.t).toBe(t0 + 500);
    expect(w.alarms[time]).toBeUndefined();
    expect(w.notifications.at(-1)!.text).toMatch(/^Alarm: \d{4}-\d\d-\d\d/);
  });

  it('caps notifications, dropping the oldest dismissed first', () => {
    const w = alarmWorld([{ orbit: leo }]);
    const t = w.clock.t;
    for (let i = 0; i < MAX_NOTIFICATIONS; i++) addAlarm(w, base({ kind: 'time', t: t + 10 + i }));
    for (let i = 0; i < MAX_NOTIFICATIONS; i++) runUntilPaused(w);
    expect(w.notifications).toHaveLength(MAX_NOTIFICATIONS);
    w.notifications[5]!.dismissed = true;
    const dropped = w.notifications[5]!.id;
    addAlarm(w, base({ kind: 'time', t: w.clock.t + 10 }));
    runUntilPaused(w);
    expect(w.notifications).toHaveLength(MAX_NOTIFICATIONS);
    expect(w.notifications.some((n) => n.id === dropped)).toBe(false);
    expect(w.notifications[0]!.id).toBe('note-1');
  });
});

describe('cleanup (S6-18)', () => {
  it('executing a node deletes its alarm; disabling it keeps the alarm with no occurrence', () => {
    const w = alarmWorld([
      { orbit: leo, plan: [node('node-1', 1000, 0.01), node('node-2', 2000, 0.01)] },
    ]);
    const scope = { kind: 'ship' as const, shipId: 'ship-1' };
    const a1 = addAlarm(
      w,
      base({ kind: 'plan-item', itemId: 'node-1' }, { scope, enabled: false }),
    );
    const a2 = addAlarm(w, base({ kind: 'plan-item', itemId: 'node-2' }, { scope }));
    w.ships['ship-1']!.plan[1]!.enabled = false;
    refreshShip(w, 'ship-1');
    expect(nextOccurrence(w, w.alarms[a2]!, 'ship-1')).toBeNull();
    expect(w.alarms[a2]).toBeDefined();
    runUntilPaused(w);
    expect(w.clock.t).toBe(1000);
    expect(w.alarms[a1]).toBeUndefined();
  });

  it("an impact deletes the ship's alarms", () => {
    const w = alarmWorld([{ orbit: leo, plan: [node('node-1', 100, -2)] }]);
    w.clock.pauseOn.node = false;
    const id = addAlarm(
      w,
      base(
        { kind: 'event-type', type: 'soi-change' },
        { scope: { kind: 'ship', shipId: 'ship-1' } },
      ),
    );
    w.clock.pauseOn.impact = true;
    runUntilPaused(w);
    expect(w.ships['ship-1']!.status).toBe('destroyed');
    expect(w.alarms[id]).toBeUndefined();
  });

  it('deleteAlarm removes its events', () => {
    const w = alarmWorld([{ orbit: escape }]);
    const id = addAlarm(w, base({ kind: 'event-type', type: 'soi-exit' }));
    deleteAlarm(w, id);
    expect(alarmSchedule(w)).toEqual([]);
  });
});
