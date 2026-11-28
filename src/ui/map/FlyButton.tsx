import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { flyState } from './flyState';
import styles from './MapToolbar.module.css';

/** The map toolbar's Fly button (S5b-6, S5b-7): flies the selected ship, and shows the active one. */
export function FlyButton() {
  const world = useWorld((s) => s.world);
  useWorld((s) => s.version);
  const selected = useView((s) => s.selected);
  const activeShipId = useView((s) => s.activeShipId);
  const { activate } = useView.getState();
  const st = flyState(world, selected, activeShipId);

  if (st.kind === 'fly') {
    return (
      <button
        type="button"
        className={`${styles['button']} ${styles['fly']}`}
        data-fly="fly"
        aria-label={`Fly ${st.name} (A)`}
        title={`Fly ${st.name}: plan and warp with it (A)`}
        onClick={() => activate(st.shipId)}
      >
        Fly {st.name}
        <span className={styles['key']}>A</span>
      </button>
    );
  }
  const name = st.name === null ? 'No active ship' : `★ ${st.name}`;
  return (
    <button
      type="button"
      className={`${styles['button']} ${styles['flown']}`}
      data-fly={st.kind}
      aria-label={name}
      aria-pressed={st.kind === 'active'}
      disabled={st.kind === 'idle'}
      title={
        st.kind === 'active'
          ? `${st.name} is the active ship`
          : st.name === null
            ? 'Select a ship and press A to fly it'
            : `${st.name} is the active ship. Select another ship to fly it`
      }
    >
      {name}
    </button>
  );
}
