import { Scene } from '../../render/Scene';
import { formatDistance } from '../format';
import { MapToolbar } from '../map/MapToolbar';
import { useMapKeys } from '../useMapKeys';
import styles from './MapView.module.css';

/** Hosts the 3D map, filling its grid cell, with the map toolbar and keyboard shortcuts. */
export function MapView() {
  useMapKeys();
  return (
    <main className={styles['map']} aria-label="System map">
      <Scene formatDistance={formatDistance} />
      <MapToolbar />
    </main>
  );
}
