import { useState } from 'react';
import { fleetShips, type FleetId } from '../../sim/fleet';
import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { RenameField } from '../fleet/FleetGroup';
import { deleteFleetText } from '../fleet/shipRows';
import styles from './BodyInspector.module.css';

/**
 * The selected fleet (S6-10 in planning/sprint-6.md): its name (renamed in place), its ships,
 * Show on timeline, and Delete fleet… with a confirmation when it has ships or alarms. Its alarms
 * are listed with the alarm sections (S6-21).
 */
export function FleetInspector({ id }: { id: FleetId }) {
  const world = useWorld((s) => s.world);
  useWorld((s) => s.version);
  const { select, focusOn, setShow } = useView.getState();
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const fleet = world.fleets[id];
  if (!fleet) return <p className={styles['empty']}>Nothing selected</p>;
  const ships = fleetShips(world, id);
  const alarms = Object.values(world.alarms).filter(
    (a) => a.scope.kind === 'fleet' && a.scope.fleetId === id,
  ).length;

  const doDelete = () => {
    if (useWorld.getState().deleteFleet(id).ok) select(null);
  };
  const askDelete = () => {
    if (ships.length === 0 && alarms === 0) doDelete();
    else setConfirming(true);
  };

  return (
    <section aria-label={`${fleet.name} details`}>
      {renaming ? (
        <RenameField id={id} initial={fleet.name} onDone={() => setRenaming(false)} />
      ) : (
        <h3 className={styles['name']}>{fleet.name}</h3>
      )}
      <p className={styles['subtitle']}>
        Fleet · {ships.length} {ships.length === 1 ? 'ship' : 'ships'}
      </p>
      <button type="button" className={styles['action']} onClick={() => setRenaming(true)}>
        Rename
      </button>{' '}
      <button
        type="button"
        className={styles['action']}
        onClick={() => setShow({ kind: 'fleet', id })}
      >
        Show on timeline
      </button>
      <h4 className={styles['section']}>Ships</h4>
      {ships.length === 0 ? (
        <p className={styles['empty']}>No ships: drag ships here from the list.</p>
      ) : (
        <ul className={styles['events']} aria-label="Fleet ships">
          {ships.map((s) => (
            <li key={s}>
              <button
                type="button"
                className={styles['link']}
                onClick={() => select({ kind: 'ship', id: s })}
                onDoubleClick={() => focusOn({ kind: 'ship', id: s })}
              >
                {world.ships[s]!.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <h4 className={styles['section']}>Delete</h4>
      {confirming ? (
        <div role="alertdialog" aria-label={`Delete ${fleet.name}?`}>
          <p className={styles['subtitle']}>
            Delete {fleet.name}? {deleteFleetText(ships.length, alarms)}
          </p>
          <button type="button" className={styles['action']} onClick={doDelete}>
            Delete
          </button>{' '}
          <button type="button" className={styles['action']} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className={styles['action']} onClick={askDelete}>
          Delete fleet…
        </button>
      )}
    </section>
  );
}
