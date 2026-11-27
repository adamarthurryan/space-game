import { useView } from '../../store/useView';
import { BodyInspector } from '../panels/BodyInspector';
import { ShipInspector } from '../panels/ShipInspector';
import styles from './Inspector.module.css';

/** Details of the current selection: a body or a ship. */
export function Inspector() {
  const selected = useView((s) => s.selected);
  return (
    <aside className={styles['inspector']} aria-label="Inspector" id="inspector">
      <h2 className={styles['heading']}>Inspector</h2>
      {selected?.kind === 'ship' ? (
        <ShipInspector id={selected.id} />
      ) : selected?.kind === 'node' ? (
        <ShipInspector id={selected.shipId} />
      ) : (
        <BodyInspector />
      )}
    </aside>
  );
}
