import { useView } from '../../store/useView';
import { BodyInspector } from '../panels/BodyInspector';
import { FleetInspector } from '../panels/FleetInspector';
import { ShipInspector } from '../panels/ShipInspector';
import styles from './Inspector.module.css';

/**
 * Details of the current selection: a body, a ship (a selected node shows its ship, S5b-17), or a
 * fleet (S6-10).
 */
export function Inspector() {
  const selected = useView((s) => s.selected);
  return (
    <aside className={styles['inspector']} aria-label="Inspector" id="inspector">
      <h2 className={styles['heading']}>Inspector</h2>
      {selected?.kind === 'ship' ? (
        <ShipInspector id={selected.id} />
      ) : selected?.kind === 'node' ? (
        <ShipInspector id={selected.shipId} />
      ) : selected?.kind === 'fleet' ? (
        <FleetInspector id={selected.id} />
      ) : (
        <BodyInspector />
      )}
    </aside>
  );
}
