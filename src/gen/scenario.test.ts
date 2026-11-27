import { describe, expect, it } from 'vitest';
import { jdFromCalendar } from '../math/time';
import { validateBodySystem } from '../sim/body';
import { createSandboxWorld, SANDBOX_EPOCH_JD } from './scenario';

describe('sandbox scenario', () => {
  it('starts at 2030-01-01 00:00 TDB', () => {
    expect(SANDBOX_EPOCH_JD).toBe(
      jdFromCalendar({ year: 2030, month: 1, day: 1, hour: 0, minute: 0, second: 0 }),
    );
  });

  it('builds a valid real system with the clock at 0', () => {
    const w = createSandboxWorld();
    expect(w.system.epochJd).toBe(SANDBOX_EPOCH_JD);
    expect(validateBodySystem(w.system)).toEqual([]);
    expect(w.clock).toEqual({ t: 0, warpIndex: 0, paused: false });
    expect(Object.keys(w.system.bodies)).toHaveLength(31);
  });

  it('is deterministic', () => {
    expect(createSandboxWorld()).toEqual(createSandboxWorld());
  });
});
