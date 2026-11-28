/** A LEO (lunar plane) ship with the smoke test's TLI node, made active. Test-only. */

import { act } from '@testing-library/react';
import { SMOKE_TLI } from '../../gen/lunarMission';
import { presetOrbit } from '../../gen/sandboxShips';
import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';

export function setUpLunar(): { shipId: string; nodeId: string } {
  const s = useWorld.getState();
  const r = s.spawnShip({
    designId: 'starship',
    orbit: presetOrbit(s.world.system, 'leo-lunar-plane', 0),
  });
  if (!r.ok) throw new Error(r.error);
  const n = useWorld.getState().addNode(r.value, {
    t: SMOKE_TLI.dt,
    dv: { prograde: SMOKE_TLI.dv, normal: 0, radial: 0 },
  });
  if (!n.ok) throw new Error(n.error);
  act(() => useView.getState().select({ kind: 'ship', id: r.value }));
  return { shipId: r.value, nodeId: n.value };
}
