import { useMemo, type KeyboardEvent } from 'react';
import { registry } from '../../content/registry';
import { shipColor } from '../../render/shipStyle';
import { getBody } from '../../sim/body';
import { shipStats } from '../../sim/ship';
import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { formatSpeed } from '../format';
import styles from './FleetList.module.css';
import { SpawnShipForm } from './SpawnShipForm';

interface Row {
  id: string;
  name: string;
  design: string;
  soi: string;
  dv: string;
  destroyed: string | null;
  color: string;
}

/**
 * The Fleets tab (S3-21): a flat list of ships in spawn order (fleets are sprint 6), with the
 * name, design, current SOI and Δv. Destroyed ships are greyed out. Click selects, double-click
 * or Enter focuses, Up/Down move and select. "Spawn ship…" opens the spawn form.
 */
export function FleetList() {
  const world = useWorld((s) => s.world);
  const version = useWorld((s) => s.version);
  const selected = useView((s) => s.selected);
  const formOpen = useView((s) => s.spawnFormOpen);
  const { select, focusOn, setSpawnFormOpen } = useView.getState();

  const rows: Row[] = useMemo(
    () =>
      Object.values(world.ships)
        .sort((a, b) => a.seq - b.seq)
        .map((s) => ({
          id: s.id,
          name: s.name,
          design: registry.design(s.designId)?.name ?? s.designId,
          soi: getBody(world.system, s.orbit.parentId).name,
          dv: formatSpeed(shipStats(s).dv),
          destroyed: s.destroyedAt
            ? `impacted ${getBody(world.system, s.destroyedAt.bodyId).name}`
            : null,
          color: shipColor(s.seq),
        })),
    // The world is mutated in place; `version` says when its ships changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, version],
  );
  const selectedId = selected?.kind === 'ship' ? selected.id : null;

  function onKeyDown(e: KeyboardEvent) {
    const i = rows.findIndex((r) => r.id === selectedId);
    let next: Row | undefined;
    switch (e.key) {
      case 'ArrowDown':
        next = rows[Math.min(i + 1, rows.length - 1)];
        break;
      case 'ArrowUp':
        next = rows[Math.max(i - 1, 0)];
        break;
      case 'Enter':
        if (selectedId) focusOn({ kind: 'ship', id: selectedId });
        e.preventDefault();
        return;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (next) select({ kind: 'ship', id: next.id });
  }

  return (
    <div className={styles['panel']}>
      {formOpen ? (
        <SpawnShipForm />
      ) : (
        <button type="button" className={styles['spawn']} onClick={() => setSpawnFormOpen(true)}>
          Spawn ship…
        </button>
      )}
      {rows.length === 0 ? (
        <p className={styles['empty']}>No ships yet.</p>
      ) : (
        <ul
          role="listbox"
          aria-label="Ships"
          className={styles['list']}
          tabIndex={0}
          onKeyDown={onKeyDown}
          aria-activedescendant={selectedId ? `ship-row-${selectedId}` : undefined}
        >
          {rows.map((r) => (
            <li
              key={r.id}
              id={`ship-row-${r.id}`}
              role="option"
              aria-label={r.name}
              aria-selected={r.id === selectedId}
              data-ship={r.id}
              className={`${styles['row']} ${r.destroyed ? styles['destroyed'] : ''}`}
              onClick={() => select({ kind: 'ship', id: r.id })}
              onDoubleClick={() => focusOn({ kind: 'ship', id: r.id })}
            >
              <span className={styles['swatch']} style={{ color: r.color }} aria-hidden="true">
                ▲
              </span>
              <span className={styles['name']}>{r.name}</span>
              <span className={styles['dv']}>{r.destroyed ? '' : r.dv}</span>
              <span className={styles['meta']}>
                {r.design} · {r.destroyed ?? r.soi}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
