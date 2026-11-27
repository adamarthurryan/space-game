import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ancestors, getBody, type BodyClass, type BodyId, type BodySystem } from '../../sim/body';
import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import styles from './SystemTree.module.css';

const GLYPH: Record<BodyClass, string> = {
  star: '☉',
  planet: '●',
  'dwarf-planet': '◐',
  moon: '○',
};

/** The bodies whose rows are visible, in display order. */
function visibleRows(sys: BodySystem, expanded: Record<BodyId, boolean>): BodyId[] {
  const out: BodyId[] = [];
  const visit = (id: BodyId) => {
    out.push(id);
    if (expanded[id]) for (const c of getBody(sys, id).childIds) visit(c);
  };
  visit(sys.rootId);
  return out;
}

/**
 * The System tab (S2-13): an ARIA tree of the bodies, nested by parent. Click selects,
 * double-click or Enter focuses; Up/Down move (and select), Right/Left expand and collapse or
 * move to the child or parent.
 */
export function SystemTree() {
  const system = useWorld((s) => s.world.system);
  const expanded = useView((s) => s.expanded);
  const selected = useView((s) => s.selected);
  const { select, focusOn, setExpanded, toggleExpanded, expand } = useView.getState();
  const rows = useMemo(() => visibleRows(system, expanded), [system, expanded]);
  const [active, setActive] = useState<BodyId>(system.rootId);
  const items = useRef(new Map<BodyId, HTMLLIElement>());
  const selectedId = selected?.kind === 'body' ? selected.id : null;
  const current = rows.includes(active) ? active : (selectedId ?? system.rootId);

  // A new selection (from the map or the tree) becomes the tree's active row.
  const [lastSelected, setLastSelected] = useState(selectedId);
  if (selectedId !== lastSelected) {
    setLastSelected(selectedId);
    if (selectedId) setActive(selectedId);
  }
  // …and is revealed: its ancestors expand, and its row scrolls into view.
  useEffect(() => {
    if (selectedId && system.bodies[selectedId]) expand(ancestors(system, selectedId));
  }, [selectedId, system, expand]);
  useEffect(() => {
    if (selectedId) items.current.get(selectedId)?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedId, rows]);

  const moveTo = (id: BodyId) => {
    setActive(id);
    select({ kind: 'body', id });
    items.current.get(id)?.focus();
  };

  function onKeyDown(e: KeyboardEvent) {
    const i = rows.indexOf(current);
    const body = getBody(system, current);
    const hasChildren = body.childIds.length > 0;
    switch (e.key) {
      case 'ArrowDown':
        if (i < rows.length - 1) moveTo(rows[i + 1]!);
        break;
      case 'ArrowUp':
        if (i > 0) moveTo(rows[i - 1]!);
        break;
      case 'ArrowRight':
        if (hasChildren && !expanded[current]) setExpanded(current, true);
        else if (hasChildren) moveTo(body.childIds[0]!);
        break;
      case 'ArrowLeft':
        if (hasChildren && expanded[current]) setExpanded(current, false);
        else if (body.parentId !== null) moveTo(body.parentId);
        break;
      case 'Enter':
        focusOn({ kind: 'body', id: current });
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  const renderItem = (id: BodyId, level: number) => {
    const body = getBody(system, id);
    const hasChildren = body.childIds.length > 0;
    const isExpanded = hasChildren && !!expanded[id];
    return (
      <li
        key={id}
        ref={(el) => {
          if (el) items.current.set(id, el);
          else items.current.delete(id);
        }}
        role="treeitem"
        aria-label={body.name}
        aria-level={level}
        aria-selected={id === selectedId}
        aria-expanded={hasChildren ? isExpanded : undefined}
        tabIndex={id === current ? 0 : -1}
        className={styles['item']}
        data-body={id}
      >
        <div
          className={styles['row']}
          onClick={() => {
            setActive(id);
            select({ kind: 'body', id });
          }}
          onDoubleClick={() => focusOn({ kind: 'body', id })}
        >
          <span
            className={styles['twisty']}
            aria-hidden="true"
            onClick={(e) => {
              if (!hasChildren) return;
              e.stopPropagation();
              toggleExpanded(id);
            }}
          >
            {hasChildren ? (isExpanded ? '▾' : '▸') : ''}
          </span>
          <span className={styles['glyph']} aria-hidden="true" title={body.class}>
            {GLYPH[body.class]}
          </span>
          <span className={styles['name']}>{body.name}</span>
          {!body.major && <span className={styles['minor']}>minor</span>}
        </div>
        {isExpanded && (
          <ul role="group" className={styles['group']}>
            {body.childIds.map((c) => renderItem(c, level + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <ul role="tree" aria-label="System" className={styles['tree']} onKeyDown={onKeyDown}>
      {renderItem(system.rootId, 1)}
    </ul>
  );
}
