import { describe, expect, it } from 'vitest';
import { addAlarm } from './alarms';
import { alarmWorld, escape, leo, node } from './alarmTestKit';
import { assignShip, createFleet } from './fleet';
import { LOW_PROPELLANT_FRACTION, propellantFraction, shipStatus } from './shipStatus';
import { PLANET_RADIUS } from './testSystem';
import { vec3 } from '../math/vec3';
import { refreshShip } from './world';

const common = { leadTime: 0, action: 'pause' as const, enabled: true };

describe('shipStatus (S6-3)', () => {
  it('is idle without an enabled, reached node ahead', () => {
    const w = alarmWorld([
      { orbit: leo },
      { orbit: leo, plan: [node('node-1', 100, 0.001, false)] },
      { orbit: leo, plan: [node('node-2', 100, 0.001)] },
    ]);
    expect(shipStatus(w, 'ship-1').idle).toBe(true);
    expect(shipStatus(w, 'ship-2').idle).toBe(true);
    expect(shipStatus(w, 'ship-3').idle).toBe(false);
    expect(shipStatus(w, 'ship-3').next?.nodeId).toBe('node-2');
  });

  it('flags low propellant at the threshold', () => {
    const w = alarmWorld([{ orbit: leo }]);
    const ship = w.ships['ship-1']!;
    const full = { ...ship.propellant };
    const scale = (f: number) => {
      for (const k of Object.keys(full) as (keyof typeof full)[]) ship.propellant[k] = full[k]! * f;
    };
    scale(LOW_PROPELLANT_FRACTION * 1.01);
    expect(shipStatus(w, 'ship-1').lowPropellant).toBe(false);
    scale(LOW_PROPELLANT_FRACTION * 0.99);
    expect(propellantFraction(ship)).toBeCloseTo(LOW_PROPELLANT_FRACTION * 0.99, 9);
    refreshShip(w, 'ship-1');
    expect(shipStatus(w, 'ship-1')).toMatchObject({ lowPropellant: true, inTrouble: true });
  });

  it('flags a predicted impact and an over-budget plan', () => {
    const suborbital = { ...leo, r: vec3(PLANET_RADIUS + 200, 0, 0), v: vec3(0, 6, 0) };
    const w = alarmWorld([
      { orbit: suborbital },
      { orbit: escape, plan: [node('node-1', 100, 30)] },
      { orbit: escape },
    ]);
    expect(shipStatus(w, 'ship-1')).toMatchObject({ impactPredicted: true, inTrouble: true });
    expect(shipStatus(w, 'ship-2')).toMatchObject({ overBudget: true, inTrouble: true });
    expect(shipStatus(w, 'ship-3').inTrouble).toBe(false);
    w.ships['ship-3']!.status = 'destroyed';
    expect(shipStatus(w, 'ship-3')).toMatchObject({ idle: false, next: null });
  });

  it('is alarmed by ship, fleet and plan-item alarms, not global ones', () => {
    const w = alarmWorld([
      { orbit: leo },
      { orbit: leo },
      { orbit: leo, plan: [node('node-1', 100, 0.001)] },
      { orbit: leo },
    ]);
    const f = createFleet(w, 'A');
    assignShip(w, 'ship-2', f);
    const trigger = { kind: 'event-type' as const, type: 'node' as const };
    addAlarm(w, { ...common, trigger, scope: { kind: 'global' } });
    addAlarm(w, { ...common, trigger, scope: { kind: 'ship', shipId: 'ship-1' } });
    addAlarm(w, { ...common, trigger, scope: { kind: 'fleet', fleetId: f } });
    addAlarm(w, {
      ...common,
      trigger: { kind: 'plan-item', itemId: 'node-1' },
      scope: { kind: 'ship', shipId: 'ship-3' },
    });
    expect(['ship-1', 'ship-2', 'ship-3', 'ship-4'].map((id) => shipStatus(w, id).alarmed)).toEqual(
      [true, true, true, false],
    );
  });
});
