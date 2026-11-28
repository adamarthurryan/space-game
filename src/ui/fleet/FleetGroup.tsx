import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { FleetId } from '../../sim/fleet';
import { sameRef, useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import styles from './FleetsTab.module.css';
import { SHIP_DRAG_TYPE, ShipRow } from './ShipRow';
import type { FleetGroupData } from './shipRows';

/** An inline name field: Enter or blur applies, Esc reverts (S6-10). */
export function RenameField({
  id,
  initial,
  onDone,
  className,
}: {
  id: FleetId;
  initial: string;
  onDone(): void;
  className?: string | undefined;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const apply = () => {
    if (done.current) return;
    const r = useWorld.getState().renameFleet(id, value);
    if (!r.ok) {
      setError(r.error);
      ref.current?.focus();
      return;
    }
    done.current = true;
    onDone();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') apply();
    else if (e.key === 'Escape') {
      done.current = true;
      onDone();
    }
  };
  return (
    <>
      <input
        ref={ref}
        aria-label="Fleet name"
        className={className}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => (error ? onDone() : apply())}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      />
      {error && (
        <span role="alert" className={styles['error']}>
          {error}
        </span>
      )}
    </>
  );
}

/**
 * A fleet (or Unassigned) in the Fleets tab (S6-4): its header (collapse, name, count, ⏰),
 * which selects the fleet, is renamed by double-click, and takes dropped ships (S6-6); then its
 * rows.
 */
export function FleetGroup({
  group,
  renaming,
  setRenaming,
  dragging,
  onDragState,
}: {
  group: FleetGroupData;
  renaming: boolean;
  setRenaming(id: FleetId | null): void;
  dragging: boolean;
  onDragState(dragging: boolean): void;
}) {
  const selected = useView((s) => s.selected);
  const collapsed = useView((s) => !!s.collapsedFleets[group.id ?? 'unassigned']);
  const { select, toggleFleetCollapsed } = useView.getState();
  const [over, setOver] = useState(false);
  const key = group.id ?? 'unassigned';
  const headerId = `fleet-header-${key}`;
  const fleetRef = group.id ? ({ kind: 'fleet', id: group.id } as const) : null;

  const accepts = (e: DragEvent) => dragging || e.dataTransfer.types.includes(SHIP_DRAG_TYPE);
  const onDragOver = (e: DragEvent) => {
    if (!accepts(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOver(true);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    onDragState(false);
    const shipId = e.dataTransfer.getData(SHIP_DRAG_TYPE);
    if (shipId) useWorld.getState().assignShip(shipId, group.id);
  };

  return (
    <div className={styles['group']} role="group" aria-labelledby={headerId} data-fleet={key}>
      <div
        id={headerId}
        className={`${styles['header']} ${over ? styles['dropTarget'] : ''}`}
        aria-selected={fleetRef ? sameRef(selected, fleetRef) : false}
        data-fleet-header={key}
        onClick={() => fleetRef && select(fleetRef)}
        onDoubleClick={() => group.id && setRenaming(group.id)}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <button
          type="button"
          className={styles['collapse']}
          aria-label={collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
          aria-expanded={!collapsed}
          onClick={(e) => {
            e.stopPropagation();
            toggleFleetCollapsed(key);
          }}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        {renaming && group.id ? (
          <RenameField
            id={group.id}
            initial={group.name}
            className={styles['rename']}
            onDone={() => setRenaming(null)}
          />
        ) : (
          <span className={styles['groupName']} title={group.id ? 'Double-click to rename' : ''}>
            {group.name}
          </span>
        )}
        {group.alarmed && (
          <span role="img" aria-label="Fleet alarm set" title="Fleet alarm set">
            ⏰
          </span>
        )}
        <span className={styles['count']}>{group.count}</span>
      </div>
      {!collapsed &&
        group.rows.map((r) => (
          <ShipRow
            key={r.id}
            row={r}
            selected={selected?.kind === 'ship' && selected.id === r.id}
            onDragState={onDragState}
          />
        ))}
    </div>
  );
}
