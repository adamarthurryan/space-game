import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import styles from './MapToolbar.module.css';

/** Snap and focus buttons over the map (S2-12, S2-20), with their keys. */
export function MapToolbar() {
  const selected = useView((s) => s.selected);
  const system = useWorld((s) => s.world.system);
  const { snapTo, focusOn } = useView.getState();
  const body = selected ? system.bodies[selected.id] : undefined;
  const hasOrbit = !!body?.orbit;

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
        title={
          hasOrbit ? `Look down on ${body!.name}'s orbit (P)` : 'Select a body with an orbit first'
        }
      >
        Orbit plane<span className={styles['key']}>P</span>
      </button>
      <button
        type="button"
        className={styles['button']}
        disabled={!selected}
        onClick={() => selected && focusOn(selected)}
        title={body ? `Focus ${body.name} (F)` : 'Select a body first'}
      >
        Focus<span className={styles['key']}>F</span>
      </button>
    </div>
  );
}
