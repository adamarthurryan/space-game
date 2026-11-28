import { describe, expect, it } from 'vitest';
import { presetOrbit } from '../gen/sandboxShips';
import { createSandboxWorld, DEFAULT_IMPACT_LEAD } from '../gen/scenario';
import { alarmSchedule, MAX_LEAD_TIME } from '../sim/alarms';
import { upcomingEvents } from '../sim/upcoming';
import type { World } from '../sim/world';
import {
  addAlarm,
  addNode,
  createFleet,
  deleteAlarm,
  deleteNode,
  dismissAllNotifications,
  dismissNotification,
  editAlarm,
  setAlarmForEvent,
  spawnShip,
  warpToNextEvent,
  type AlarmParams,
} from './actions';

function withShip(preset: Parameters<typeof presetOrbit>[1] = 'leo'): { w: World; id: string } {
  const w = createSandboxWorld();
  const r = spawnShip(w, { designId: 'starship', orbit: presetOrbit(w.system, preset, 0) });
  return { w, id: r.ok ? r.value : '' };
}

const params = (over: Partial<AlarmParams> = {}): AlarmParams => ({
  scope: { kind: 'global' },
  trigger: { kind: 'event-type', type: 'soi-change' },
  leadTime: 600,
  action: 'pause',
  ...over,
});

describe('alarm actions (S6-12)', () => {
  it('adds, edits and deletes alarms', () => {
    const { w } = withShip();
    const r = addAlarm(w, params());
    expect(r.ok).toBe(true);
    const id = r.ok ? r.value : '';
    expect(editAlarm(w, id, { leadTime: 60, action: 'drop-warp', enabled: false }).ok).toBe(true);
    expect(w.alarms[id]).toMatchObject({ leadTime: 60, action: 'drop-warp', enabled: false });
    expect(deleteAlarm(w, id).ok).toBe(true);
    expect(deleteAlarm(w, id).ok).toBe(false);
    expect(editAlarm(w, id, { leadTime: 1 }).ok).toBe(false);
  });

  it('refuses bad scopes, triggers and lead times', () => {
    const { w, id } = withShip();
    const err = (p: AlarmParams) => {
      const r = addAlarm(w, p);
      return r.ok ? null : r.error;
    };
    expect(err(params({ scope: { kind: 'ship', shipId: 'ship-99' } }))).toBe(
      'Unknown ship: ship-99',
    );
    expect(err(params({ scope: { kind: 'fleet', fleetId: 'fleet-9' } }))).toBe(
      'Unknown fleet: fleet-9',
    );
    expect(err(params({ leadTime: -1 }))).toBe('The lead time must be 0 or more');
    expect(err(params({ leadTime: MAX_LEAD_TIME + 1 }))).toBe(
      'The lead time is longer than 10 years',
    );
    expect(err(params({ trigger: { kind: 'plan-item', itemId: 'node-1' } }))).toBe(
      'A node alarm needs a ship',
    );
    expect(
      err(
        params({
          scope: { kind: 'ship', shipId: id },
          trigger: { kind: 'plan-item', itemId: 'node-9' },
        }),
      ),
    ).toBe('Unknown node: node-9');
    expect(
      err(params({ trigger: { kind: 'time', t: 100 }, scope: { kind: 'ship', shipId: id } })),
    ).toBe('A time alarm covers every ship');
    expect(err(params({ trigger: { kind: 'time', t: 0 } }))).toBe('The time has passed');
    expect(
      err(params({ trigger: { kind: 'event-type', type: 'impact', targetId: 'pluto-x' } })),
    ).toBe('Unknown body: pluto-x');
    expect(err(params({ trigger: { kind: 'event-type', type: 'node', targetId: 'moon' } }))).toBe(
      'A node alarm has no body',
    );
  });

  it('deleting a node deletes its alarm', () => {
    const { w, id } = withShip();
    const n = addNode(w, id, { t: 5000 });
    const nodeId = n.ok ? n.value : '';
    const a = addAlarm(
      w,
      params({
        scope: { kind: 'ship', shipId: id },
        trigger: { kind: 'plan-item', itemId: nodeId },
      }),
    );
    expect(a.ok).toBe(true);
    deleteNode(w, id, nodeId);
    expect(Object.keys(w.alarms)).toEqual(['alarm-1']); // only the default
  });

  it('setAlarmForEvent: a plan item for a node, else a once alarm on the event and its body', () => {
    const { w, id } = withShip('to-the-moon');
    addNode(w, id, { t: 3000, dv: { prograde: 0, normal: 0, radial: 0.0001 } });
    const events = upcomingEvents(w, id).events;
    const node = events.find((e) => e.kind === 'node')!;
    const enter = events.find((e) => e.kind === 'soi-enter')!;
    const a = setAlarmForEvent(w, node, 60);
    const b = setAlarmForEvent(w, enter, 3600);
    expect(a.ok && w.alarms[a.value]!.trigger).toEqual({ kind: 'plan-item', itemId: node.nodeId });
    expect(b.ok && w.alarms[b.value]).toMatchObject({
      scope: { kind: 'ship', shipId: id },
      trigger: { kind: 'event-type', type: 'soi-enter', targetId: 'moon', once: true },
      leadTime: 3600,
      action: 'pause',
    });
    w.clock.t = enter.t;
    expect(setAlarmForEvent(w, enter, 0)).toEqual({ ok: false, error: 'The event has passed' });
  });

  it('setAlarmForEvent on an exit narrows to the body left', () => {
    const { w, id } = withShip('earth-escape');
    const exit = upcomingEvents(w, id).events.find((e) => e.kind === 'soi-exit')!;
    const r = setAlarmForEvent(w, exit, 0);
    expect(r.ok && w.alarms[r.value]!.trigger).toEqual({
      kind: 'event-type',
      type: 'soi-exit',
      targetId: 'earth',
      once: true,
    });
  });

  it('dismisses notifications', () => {
    const { w } = withShip();
    w.notifications.push(
      {
        id: 'note-1',
        alarmId: 'a',
        shipId: null,
        t: 0,
        eventT: 0,
        text: '',
        action: 'pause',
        dismissed: false,
      },
      {
        id: 'note-2',
        alarmId: 'a',
        shipId: null,
        t: 0,
        eventT: 0,
        text: '',
        action: 'pause',
        dismissed: false,
      },
    );
    expect(dismissNotification(w, 'note-1').ok).toBe(true);
    expect(w.notifications.map((n) => n.dismissed)).toEqual([true, false]);
    expect(dismissNotification(w, 'note-9').ok).toBe(false);
    dismissAllNotifications(w);
    expect(w.notifications.every((n) => n.dismissed)).toBe(true);
  });

  it('warps to the earliest next event of several ships', () => {
    const w = createSandboxWorld();
    const a = spawnShip(w, { designId: 'starship', orbit: presetOrbit(w.system, 'leo', 0) });
    const b = spawnShip(w, {
      designId: 'starship',
      orbit: presetOrbit(w.system, 'earth-escape', 0),
    });
    const ids = [a, b].map((r) => (r.ok ? r.value : ''));
    addNode(w, ids[0]!, { t: 1e7 });
    const r = warpToNextEvent(w, ids);
    expect(r.ok && r.value.shipId).toBe(ids[1]);
    expect(createFleet(w).ok).toBe(true);
  });
});

describe('the default impact alarm (S6-23)', () => {
  it('covers a ship spawned later, an hour before its impact', () => {
    const { w, id } = withShip('suborbital');
    const impact = upcomingEvents(w, id).events.find((e) => e.kind === 'impact')!;
    expect(alarmSchedule(w)).toContainEqual({
      alarmId: 'alarm-1',
      shipId: id,
      fireT: Math.max(impact.t - DEFAULT_IMPACT_LEAD, 0),
      occurrence: impact.t,
    });
  });
});
