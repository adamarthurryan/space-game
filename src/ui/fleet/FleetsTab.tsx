import { useMemo, useState, type KeyboardEvent } from 'react';
import type { FleetId } from '../../sim/fleet';
import { resolveActiveShip, useView, type FleetsFilter } from '../../store/useView';
import { useSimTime, useWorld } from '../../store/useWorld';
import { SpawnShipForm } from '../panels/SpawnShipForm';
import { FleetGroup } from './FleetGroup';
import styles from './FleetsTab.module.css';
import { fleetGroups } from './shipRows';

const FILTERS: { id: FleetsFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'idle', label: 'Idle' },
  { id: 'trouble', label: 'In trouble' },
];

/**
 * The Fleets tab (S6-4 to S6-6 in planning/sprint-6.md): Spawn ship…, + New fleet and the status
 * filter, then each fleet and Unassigned with their ships. Ships are dragged between groups.
 * Up/Down move through the visible rows; Enter focuses.
 */
export function FleetsTab() {
  const world = useWorld((s) => s.world);
  const version = useWorld((s) => s.version);
  const now = useSimTime();
  const selected = useView((s) => s.selected);
  const activeId = resolveActiveShip(
    world,
    useView((s) => s.activeShipId),
  );
  const formOpen = useView((s) => s.spawnFormOpen);
  const filter = useView((s) => s.fleetsFilter);
  const collapsed = useView((s) => s.collapsedFleets);
  const { select, focusOn, setSpawnFormOpen, setFleetsFilter } = useView.getState();
  const [renaming, setRenaming] = useState<FleetId | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(
    () => {
      const g = fleetGroups(world, now, activeId, filter);
      // While a ship is dragged, Unassigned is a drop target even when empty (S6-4).
      if (dragging && !g.some((x) => x.id === null)) {
        g.push({ id: null, name: 'Unassigned', count: 0, alarmed: false, rows: [] });
      }
      return g;
    },
    // The world is mutated in place; `version` says when its ships changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, version, now, activeId, filter, dragging],
  );
  const visibleRows = groups.flatMap((g) => (collapsed[g.id ?? 'unassigned'] ? [] : g.rows));
  const selectedId = selected?.kind === 'ship' ? selected.id : null;

  function onKeyDown(e: KeyboardEvent) {
    const i = visibleRows.findIndex((r) => r.id === selectedId);
    let next;
    switch (e.key) {
      case 'ArrowDown':
        next = visibleRows[Math.min(i + 1, visibleRows.length - 1)];
        break;
      case 'ArrowUp':
        next = visibleRows[Math.max(i - 1, 0)];
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

  const newFleet = () => {
    const r = useWorld.getState().createFleet();
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setRenaming(r.value);
  };

  const total = Object.keys(world.ships).length;
  return (
    <div className={styles['panel']}>
      {formOpen ? (
        <SpawnShipForm />
      ) : (
        <button type="button" className={styles['spawn']} onClick={() => setSpawnFormOpen(true)}>
          Spawn ship…
        </button>
      )}
      <div className={styles['toolbar']}>
        <button type="button" className={styles['spawn']} onClick={newFleet}>
          + New fleet
        </button>
        <div className={styles['filter']} role="radiogroup" aria-label="Show ships">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={filter === f.id}
              onClick={() => setFleetsFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p role="alert" className={styles['error']}>
          {error}
        </p>
      )}
      {total === 0 ? (
        <p className={styles['empty']}>No ships yet.</p>
      ) : (
        <div
          role="listbox"
          aria-label="Ships"
          className={styles['list']}
          tabIndex={0}
          onKeyDown={onKeyDown}
          aria-activedescendant={selectedId ? `ship-row-${selectedId}` : undefined}
        >
          {groups.length === 0 && <p className={styles['empty']}>No ships match.</p>}
          {groups.map((g) => (
            <FleetGroup
              key={g.id ?? 'unassigned'}
              group={g}
              renaming={renaming !== null && renaming === g.id}
              setRenaming={setRenaming}
              dragging={dragging}
              onDragState={setDragging}
            />
          ))}
        </div>
      )}
    </div>
  );
}
