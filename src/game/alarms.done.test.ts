/**
 * The sprint 6 "done when" on the real system (planning/sprint-6.md): a "next SOI entry into the
 * Moon" alarm, set from the TLI's predicted entry, still fires an hour before the entry after a
 * small correction node is added earlier in the plan.
 */
import { describe, expect, it } from 'vitest';
import { SMOKE_TLI } from '../gen/lunarMission';
import { presetOrbit } from '../gen/sandboxShips';
import { createSandboxWorld } from '../gen/scenario';
import { registerAlarmHandlers } from '../sim/alarms';
import { setWarpIndex } from '../sim/clock';
import { createEventRegistry, registerShipHandlers } from '../sim/events';
import { upcomingEvents } from '../sim/upcoming';
import { advanceWorld } from '../sim/world';
import { addNode, setAlarmForEvent, setPauseOn, spawnShip } from './actions';

describe('a once alarm on the Moon SOI entry (done when)', () => {
  it('fires an hour before the entry after an earlier node is added', () => {
    const w = createSandboxWorld();
    const r = spawnShip(w, {
      designId: 'starship',
      orbit: presetOrbit(w.system, 'leo-lunar-plane', 0),
    });
    const id = r.ok ? r.value : '';
    addNode(w, id, { t: SMOKE_TLI.dt, dv: { prograde: SMOKE_TLI.dv, normal: 0, radial: 0 } });
    const entry = upcomingEvents(w, id).events.find((e) => e.kind === 'soi-enter')!;
    expect(entry.bodyId).toBe('moon');
    const a = setAlarmForEvent(w, entry, 3600);
    expect(a.ok).toBe(true);

    // A small correction before the TLI moves the entry, but keeps it.
    expect(addNode(w, id, { t: 1200, dv: { prograde: 0.002, normal: 0, radial: 0 } }).ok).toBe(
      true,
    );
    const moved = upcomingEvents(w, id).events.find((e) => e.kind === 'soi-enter')!;
    expect(moved.bodyId).toBe('moon');
    expect(moved.t).not.toBe(entry.t);

    setPauseOn(w, 'all', false);
    setWarpIndex(w.clock, 7);
    const reg = createEventRegistry();
    registerShipHandlers(reg);
    registerAlarmHandlers(reg);
    for (let i = 0; i < 1e5 && !w.clock.paused; i++) advanceWorld(w, 1 / 60, reg);
    expect(w.clock.t).toBe(moved.t - 3600);
    expect(w.notifications.at(-1)!.text).toMatch(/: Moon SOI entry in 1 h 0 min$/);
    expect(a.ok && w.alarms[a.value]).toBeUndefined();
  });
});
