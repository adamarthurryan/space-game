/**
 * The sprint 6 "done when" (planning/sprint-6.md), on the synthetic system: a fleet alarm covers a
 * ship added later, a node alarm survives the node being edited, and a once alarm on an SOI entry
 * follows the entry after an earlier node is added.
 */
import { describe, expect, it } from 'vitest';
import {
  addTestShip,
  alarmWorld,
  encounterPhase,
  escape,
  leo,
  node,
  runUntilPaused,
  transfer,
} from './alarmTestKit';
import { addAlarm, alarmSchedule } from './alarms';
import { assignShip, createFleet } from './fleet';
import { upcomingEvents } from './upcoming';
import { refreshShip } from './world';

describe('alarms: the sprint 6 "done when"', () => {
  it('a fleet-wide SOI change alarm fires for a ship added to the fleet after it was set', () => {
    const w = alarmWorld([
      { orbit: leo },
      { orbit: leo },
      { orbit: leo },
      { orbit: leo },
      { orbit: leo },
      { orbit: leo },
    ]);
    const fleets = [createFleet(w, 'A'), createFleet(w, 'B'), createFleet(w, 'C')];
    for (let i = 0; i < 6; i++) assignShip(w, `ship-${i + 1}`, fleets[i % 3]!);
    addAlarm(w, {
      scope: { kind: 'fleet', fleetId: fleets[1]! },
      trigger: { kind: 'event-type', type: 'soi-change' },
      leadTime: 0,
      action: 'pause',
      enabled: true,
    });
    expect(alarmSchedule(w)).toEqual([]);
    const late = addTestShip(w, { ...escape, t: 0 });
    assignShip(w, late, fleets[1]!);
    const exit = upcomingEvents(w, late).events.find((e) => e.kind === 'soi-exit')!;
    runUntilPaused(w);
    expect(w.clock.t).toBe(exit.t);
    expect(w.notifications.map((n) => n.shipId)).toEqual([late]);
    expect(w.notifications[0]!.text).toBe(`B · S7: Planet SOI exit now`);
  });

  it('an alarm on one node survives the node being edited, and follows its new time', () => {
    const w = alarmWorld([{ orbit: leo, plan: [node('node-1', 5000, 0.01)] }]);
    w.clock.pauseOn.node = false;
    const id = addAlarm(w, {
      scope: { kind: 'ship', shipId: 'ship-1' },
      trigger: { kind: 'plan-item', itemId: 'node-1' },
      leadTime: 600,
      action: 'pause',
      enabled: true,
    });
    const n = w.ships['ship-1']!.plan[0]!;
    n.t = 9000;
    n.dv = { prograde: 0.02, normal: 0.001, radial: 0 };
    refreshShip(w, 'ship-1');
    expect(w.alarms[id]).toBeDefined();
    runUntilPaused(w);
    expect(w.clock.t).toBe(9000 - 600);
    expect(w.notifications).toHaveLength(1);
  });

  it('a "next SOI entry into the moon" alarm still fires after an earlier node is added', () => {
    const w = alarmWorld([{ orbit: transfer }], encounterPhase());
    w.clock.pauseOn.node = false;
    const before = upcomingEvents(w, 'ship-1').events.find((e) => e.kind === 'soi-enter')!;
    expect(before.bodyId).toBe('moon');
    const id = addAlarm(w, {
      scope: { kind: 'ship', shipId: 'ship-1' },
      trigger: { kind: 'event-type', type: 'soi-enter', targetId: 'moon', once: true },
      leadTime: 3600,
      action: 'pause',
      enabled: true,
    });
    w.ships['ship-1']!.plan = [node('node-1', 600, 0.0005)];
    refreshShip(w, 'ship-1');
    const after = upcomingEvents(w, 'ship-1').events.find((e) => e.kind === 'soi-enter')!;
    expect(after.bodyId).toBe('moon');
    expect(after.t).not.toBe(before.t);
    runUntilPaused(w);
    expect(w.clock.t).toBe(after.t - 3600);
    expect(w.notifications[0]!.text).toBe('S1: Moon SOI entry in 1 h 0 min');
    expect(w.alarms[id]).toBeUndefined();
  });
});
