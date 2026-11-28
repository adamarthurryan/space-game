import { focusRefOf, useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { FlyButton } from './FlyButton';
import { FrameMenu } from './FrameMenu';
import styles from './MapToolbar.module.css';

/**
 * The map toolbar: snap and focus buttons (S2-12, S2-20), with their keys; Frame ▾ (S5b-4) and
 * Fly (S5b-7).
 */
export function MapToolbar() {
  const selected = useView((s) => s.selected);
  const world = useWorld((s) => s.world);
  // Ships change status as the sim runs; the version says when.
  useWorld((s) => s.version);
  const { snapTo, focusOn } = useView.getState();
  // A selected node stands for its ship (S4-10).
  const ref = selected ? focusRefOf(selected) : null;
  const ship = ref?.kind === 'ship' ? world.ships[ref.id] : undefined;
  const body = ref?.kind === 'body' ? world.system.bodies[ref.id] : undefined;
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
      <FrameMenu />
      <FlyButton />
    </div>
  );
}
