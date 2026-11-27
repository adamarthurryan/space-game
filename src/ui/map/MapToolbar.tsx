import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import styles from './MapToolbar.module.css';

/** Snap and focus buttons over the map (S2-12, S2-20), with their keys. */
export function MapToolbar() {
  const selected = useView((s) => s.selected);
  const world = useWorld((s) => s.world);
  // Ships change status as the sim runs; the version says when.
  useWorld((s) => s.version);
  const { snapTo, focusOn } = useView.getState();
  const ship = selected?.kind === 'ship' ? world.ships[selected.id] : undefined;
  const body = selected?.kind === 'body' ? world.system.bodies[selected.id] : undefined;
  const name = ship?.name ?? body?.name;
  const hasOrbit = ship ? ship.status === 'coasting' : !!body?.orbit;

  return (
    <div className={styles['toolbar']} role="toolbar" aria-label="Map">
      <button
        type="button"
        className={styles['button']}
        onClick={() => snapTo('ecliptic')}
        title="Look down on the ecliptic (E)"
      >
        Ecliptic<span className={styles['key']}>E</span>
      </button>
      <button
        type="button"
        className={styles['button']}
        disabled={!hasOrbit}
        onClick={() => snapTo('selected-orbit')}
        title={hasOrbit ? `Look down on ${name}'s orbit (P)` : 'Select a body with an orbit first'}
      >
        Orbit plane<span className={styles['key']}>P</span>
      </button>
      <button
        type="button"
        className={styles['button']}
        disabled={!selected}
        onClick={() => selected && focusOn(selected)}
        title={name ? `Focus ${name} (F)` : 'Select a body first'}
      >
        Focus<span className={styles['key']}>F</span>
      </button>
    </div>
  );
}
