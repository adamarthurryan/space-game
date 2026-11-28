import { useMemo } from 'react';
import { getBody } from '../../sim/body';
import { useWorld } from '../../store/useWorld';
import { shipColor } from '../shipStyle';
import styles from './LabelOverlay.module.css';
import { attachLabelContainer, type LabelRegistry } from './labelLayout';

/**
 * The DOM label layer over the canvas (S2-15, S3-20): one span per body and per drawn ship, with
 * `pointer-events: none`. The labels stage (stages.ts) positions the spans every frame.
 */
export function LabelOverlay({ registry, order }: { registry: LabelRegistry; order: string[] }) {
  const system = useWorld((s) => s.world.system);
  const version = useWorld((s) => s.version);
  const world = useWorld((s) => s.world);
  const ships = useMemo(
    () =>
      Object.values(world.ships)
        .filter((s) => s.status === 'coasting')
        .map((s) => ({ id: s.id, name: s.name, color: shipColor(s.seq) })),
    // The world is mutated in place; `version` says when its ships may have changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, version],
  );
  return (
    <div
      className={styles['overlay']}
      aria-hidden="true"
      data-testid="label-overlay"
      ref={(el) => attachLabelContainer(registry, el)}
    >
      {order.map((id, i) => (
        <span
          key={id}
          className={styles['label']}
          data-body={id}
          ref={(el) => {
            registry.spans[i] = el;
          }}
        >
          {getBody(system, id).name}
        </span>
      ))}
      {ships.map((s) => (
        <span
          key={s.id}
          className={styles['label']}
          data-ship={s.id}
          style={{ color: s.color }}
          ref={(el) => {
            if (el) registry.shipSpans.set(s.id, el);
            else registry.shipSpans.delete(s.id);
          }}
        >
          {s.name}
        </span>
      ))}
    </div>
  );
}
