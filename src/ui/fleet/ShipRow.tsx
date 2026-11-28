import type { DragEvent } from 'react';
import { useView } from '../../store/useView';
import styles from './FleetsTab.module.css';
import type { ShipRowData } from './shipRows';

/** The drag data type of a ship row (S6-6). */
export const SHIP_DRAG_TYPE = 'application/x-space-game-ship';

/**
 * One ship in the Fleets tab (S6-5): ★, swatch, name, status icons and Δv, then the design and
 * engine, SOI and next-event countdown. Click selects, double-click focuses; draggable onto a
 * fleet header (S6-6).
 */
export function ShipRow({
  row,
  selected,
  onDragState,
}: {
  row: ShipRowData;
  selected: boolean;
  onDragState(dragging: boolean): void;
}) {
  const { select, focusOn } = useView.getState();
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(SHIP_DRAG_TYPE, row.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragState(true);
  };
  return (
    <div
      id={`ship-row-${row.id}`}
      role="option"
      aria-label={row.name}
      aria-selected={selected}
      data-ship={row.id}
      draggable
      onDragStart={onDragStart}
      onDragEnd={() => onDragState(false)}
      className={`${styles['row']} ${row.destroyed ? styles['destroyed'] : ''}`}
      onClick={() => select({ kind: 'ship', id: row.id })}
      onDoubleClick={() => focusOn({ kind: 'ship', id: row.id })}
    >
      <span className={styles['swatch']} style={{ color: row.color }} aria-hidden="true">
        ▲
      </span>
      <span className={styles['name']}>
        {row.active && (
          <span className={styles['active']} aria-label="active ship" title="Active ship">
            ★{' '}
          </span>
        )}
        {row.name}
        {row.icons.length > 0 && (
          <span className={styles['icons']}>
            {row.icons.map((i) => (
              <span key={i.glyph} title={i.title} aria-label={i.title} role="img">
                {i.glyph}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className={styles['dv']}>{row.destroyed ? '' : row.dv}</span>
      <span className={styles['meta']}>
        {row.design} ({row.engine}) · {row.destroyed ?? row.soi}
        {!row.destroyed && row.next ? ` · ${row.next}` : ''}
      </span>
    </div>
  );
}
