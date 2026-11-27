import { Scene } from '../../render/Scene';
import styles from './MapView.module.css';

/** Hosts the 3D map, filling its grid cell. */
export function MapView() {
  return (
    <main className={styles['map']} aria-label="System map">
      <Scene />
    </main>
  );
}
