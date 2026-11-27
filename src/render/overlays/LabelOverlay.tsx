import { getBody } from '../../sim/body';
import { useWorld } from '../../store/useWorld';
import styles from './LabelOverlay.module.css';
import type { LabelRegistry } from './labelLayout';

/**
 * The DOM label layer over the canvas (S2-15): one span per body, with `pointer-events: none`.
 * The labels stage (stages.ts) positions the spans every frame.
 */
export function LabelOverlay({ registry, order }: { registry: LabelRegistry; order: string[] }) {
  const system = useWorld((s) => s.world.system);
  return (
    <div className={styles['overlay']} aria-hidden="true" data-testid="label-overlay">
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
    </div>
  );
}
