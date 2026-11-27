import { useEffect, useMemo, useRef } from 'react';
import { useWorld } from '../store/useWorld';
import { createMapFrame } from './mapFrame';
import { MapRenderer } from './MapRenderer';
import { createLabelRegistry } from './overlays/labelLayout';
import { LabelOverlay } from './overlays/LabelOverlay';
import { createTrajectoryMarkerRegistry } from './overlays/trajectoryMarkerLayout';
import { TrajectoryMarkerOverlay } from './overlays/TrajectoryMarkerOverlay';
import styles from './Scene.module.css';

/**
 * The 3D map and its label overlay (S3-1). Scene axes are ecliptic J2000 in km; the origin is
 * the camera focus (S2-4). The map itself is plain three.js: this component only creates the
 * `MapRenderer` in an effect, disposes it on unmount, and renders the DOM overlays. Pe/Ap
 * marker texts use `formatDistance`, which `ui/` passes in (render/ may not import ui/). A new body
 * system gets a new frame, and so a new renderer.
 */
export function Scene({ formatDistance }: { formatDistance?: (km: number) => string }) {
  const system = useWorld((s) => s.world.system);
  const frame = useMemo(() => createMapFrame(system), [system]);
  const labels = useMemo(() => createLabelRegistry(frame), [frame]);
  const markers = useMemo(() => createTrajectoryMarkerRegistry(formatDistance), [formatDistance]);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const renderer = new MapRenderer(host.current, frame, labels, markers);
    renderer.start();
    return () => renderer.dispose();
  }, [frame, labels, markers]);

  return (
    <div className={styles['scene']}>
      <div ref={host} className={styles['canvas']} />
      <TrajectoryMarkerOverlay registry={markers} />
      <LabelOverlay registry={labels} order={frame.order} />
    </div>
  );
}
