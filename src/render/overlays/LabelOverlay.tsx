import { useFrame } from '@react-three/fiber';
import { getBody } from '../../sim/body';
import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { STAGE, useMapFrame } from '../mapFrame';
import styles from './LabelOverlay.module.css';
import {
  measureLabels,
  placeLabels,
  updateLabelCandidates,
  type LabelRegistry,
} from './labelLayout';

/**
 * The DOM label layer over the canvas (S2-15): one span per body, with `pointer-events: none`.
 * Rendered outside the canvas; `LabelStage` positions the spans every frame.
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

/** The labels stage (0), inside the canvas: candidates, declutter, and the span positions. */
export function LabelStage({ registry }: { registry: LabelRegistry }) {
  const frame = useMapFrame();
  useFrame(() => {
    const { system } = useWorld.getState().world;
    measureLabels(registry);
    updateLabelCandidates(registry, frame, system, useView.getState());
    placeLabels(registry, frame);
  }, STAGE.labels);
  return null;
}
