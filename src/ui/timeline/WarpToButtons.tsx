import { useState } from 'react';
import { warpRate } from '../../sim/clock';
import { mapSelection, resolveActiveShip, useView } from '../../store/useView';
import { useSimTime, useWorld } from '../../store/useWorld';
import { formatCountdown, formatWarp } from '../format';
import styles from '../layout/Timeline.module.css';
import { shownWarpStep, warpNodeTarget } from './warpTo';

/**
 * "Warp to next event" and "Warp to node" (decisions S5-3 to S5-5 in planning/sprint-5.md), and
 * the ⏩ readout while a warp-to runs. A refused action's error is the button's title.
 */
export function WarpToButtons() {
  useWorld((s) => s.version);
  const world = useWorld((s) => s.world);
  const t = useSimTime();
  const activeShipId = useView((s) => s.activeShipId);
  const selected = useView((s) => s.selected);
  const [error, setError] = useState<{ which: 'event' | 'node'; text: string } | null>(null);

  const shipId = resolveActiveShip(world, activeShipId);
  const nodeTarget = warpNodeTarget(world, activeShipId, mapSelection(selected));
  const warpTo = world.clock.warpTo;

  const nextEvent = () => {
    const r = useWorld.getState().warpToNextEvent(shipId);
    setError(r.ok ? null : { which: 'event', text: r.error });
  };
  const toNode = () => {
    if (!nodeTarget) return;
    const r = useWorld.getState().warpToNode(nodeTarget.shipId, nodeTarget.nodeId);
    setError(r.ok ? null : { which: 'node', text: r.error });
  };

  return (
    <>
      <div className={styles['controls']} role="group" aria-label="Warp to">
        <button
          type="button"
          className={styles['button']}
          aria-label="Warp to next event"
          title={error?.which === 'event' ? error.text : 'Warp to next event'}
          onClick={nextEvent}
        >
          ⏭
        </button>
        <button
          type="button"
          className={styles['button']}
          aria-label="Warp to node"
          title={error?.which === 'node' ? error.text : 'Warp to node (1 min before)'}
          disabled={!nodeTarget}
          onClick={toNode}
        >
          ◆⏭
        </button>
      </div>
      {warpTo && (
        <output className={styles['readout']} aria-label="Warping to">
          ⏩ {warpTo.label} · {formatCountdown(warpTo.t - t)} ·{' '}
          {formatWarp(shownWarpStep(warpRate(world.clock)))}
        </output>
      )}
    </>
  );
}
