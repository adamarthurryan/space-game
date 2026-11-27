import styles from './TrajectoryMarkerOverlay.module.css';
import type { TrajectoryMarkerRegistry } from './trajectoryMarkerLayout';

/**
 * The DOM layer of trajectory markers (S3-19): a container whose pooled spans the labels stage
 * creates and positions every frame, without React re-rendering.
 */
export function TrajectoryMarkerOverlay({ registry }: { registry: TrajectoryMarkerRegistry }) {
  return (
    <div
      className={styles['overlay']}
      aria-hidden="true"
      data-testid="trajectory-marker-overlay"
      ref={(el) => registry.attach(el)}
    />
  );
}
