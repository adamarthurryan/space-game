import { useEffect, useRef, useState } from 'react';
import { addApsisRefusal } from '../../game/actions';
import type { PassageKind } from '../../orbital/passages';
import { useView } from '../../store/useView';
import { useSimTime, useWorld } from '../../store/useWorld';
import { formatCountdown, formatDv } from '../format';
import { Popover } from '../layout/Popover';
import { parseDuration } from '../parse';
import { NodeEditor } from './NodeEditor';
import styles from './Plan.module.css';
import { planDetails } from './planDetails';

const ADD: { at: PassageKind; label: string }[] = [
  { at: 'periapsis', label: 'At next Pe' },
  { at: 'apoapsis', label: 'At next Ap' },
  { at: 'ascending-node', label: 'At next AN' },
  { at: 'descending-node', label: 'At next DN' },
];

/**
 * The ship's plan (S4-16, S4-17): the node list, the totals and "Add node ▾". The selected
 * node's row expands in place into the node editor (S5b-17); clicking its header selects the
 * ship, which collapses it. A non-active ship's plan is read-only (S5b-8).
 */
export function PlanSection({ shipId, readOnly = false }: { shipId: string; readOnly?: boolean }) {
  const world = useWorld((s) => s.world);
  useWorld((s) => s.version);
  const now = useSimTime();
  const selected = useView((s) => s.selected);
  const [atTime, setAtTime] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const expandedRef = useRef<HTMLLIElement>(null);
  const expandedId = selected?.kind === 'node' && selected.shipId === shipId ? selected.id : null;
  useEffect(() => {
    if (expandedId) expandedRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [expandedId]);
  const ship = world.ships[shipId];
  if (!ship || ship.status !== 'coasting') return null;
  const d = planDetails(world, shipId, now);
  const { select } = useView.getState();

  const added = (
    r: { ok: true; value: string } | { ok: false; error: string },
    close: () => void,
  ) => {
    if (r.ok) {
      close();
      setAtTime(null);
      setError(null);
      select({ kind: 'node', shipId, id: r.value });
    } else {
      setError(r.error);
    }
  };
  const addAt = (at: PassageKind, close: () => void) =>
    added(useWorld.getState().addNodeAt(shipId, at), close);
  const addAtTime = (close: () => void) => {
    const dt = parseDuration(atTime ?? '');
    if (dt === null) return setError('Use a duration such as 1d 2h 30m');
    added(useWorld.getState().addNodeAt(shipId, { t: now + dt }), close);
  };

  return (
    <section aria-label="Plan">
      <h4 className={styles['section']}>Plan</h4>
      {readOnly && (
        <p className={styles['dim']} role="note">
          Read-only: fly this ship to edit (A)
        </p>
      )}
      {d.nodes.length === 0 ? (
        <p className={styles['empty']}>No nodes</p>
      ) : (
        <ul className={styles['nodes']} aria-label="Nodes">
          {d.nodes.map((n, i) => {
            const expanded = n.nodeId === expandedId;
            return (
              <li
                key={n.nodeId}
                ref={expanded ? expandedRef : undefined}
                className={expanded ? styles['expanded'] : undefined}
              >
                <button
                  type="button"
                  className={styles['nodeRow']}
                  aria-current={expanded ? 'true' : undefined}
                  aria-expanded={expanded}
                  onClick={() =>
                    select(
                      expanded
                        ? { kind: 'ship', id: shipId }
                        : { kind: 'node', shipId, id: n.nodeId },
                    )
                  }
                >
                  <span>◆ Node {i + 1}</span>
                  <span className={styles['mono']}>in {formatCountdown(n.countdown)}</span>
                  <span className={`${styles['mono']} ${n.overBudget ? styles['danger'] : ''}`}>
                    {formatDv(n.dvRequested)}
                  </span>
                  {(!n.enabled || !n.reached) && (
                    <span className={styles['dim']}>{!n.enabled ? 'disabled' : 'not reached'}</span>
                  )}
                </button>
                {expanded && <NodeEditor shipId={shipId} nodeId={n.nodeId} readOnly={readOnly} />}
              </li>
            );
          })}
        </ul>
      )}
      <dl className={styles['list']}>
        <dt>Δv planned</dt>
        <dd>{formatDv(d.dvPlanned)}</dd>
        <dt>Δv left after plan</dt>
        <dd className={d.overBudget ? styles['danger'] : ''} aria-label="Δv left after plan">
          {d.overBudget ? '−' : ''}
          {formatDv(Math.abs(d.dvLeft))}
        </dd>
      </dl>
      <Popover
        label="Add node ▾"
        disabled={readOnly}
        title={readOnly ? 'Fly this ship to edit its plan (A)' : undefined}
        className={styles['menu']}
        buttonClassName={styles['action']}
        panelClassName={styles['popover']}
        onClose={() => setAtTime(null)}
      >
        {(close) => (
          <div role="menu" aria-label="Add node" className={styles['menuItems']}>
            {ADD.map((a) => {
              // Pe and Ap are disabled on a circular orbit, with the reason (S5b-20).
              const refusal =
                a.at === 'periapsis' || a.at === 'apoapsis'
                  ? addApsisRefusal(world, shipId, a.at)
                  : null;
              return (
                <button
                  key={a.at}
                  type="button"
                  role="menuitem"
                  aria-label={a.label}
                  disabled={refusal !== null}
                  title={refusal ?? undefined}
                  onClick={() => addAt(a.at, close)}
                >
                  {a.label}
                  {refusal && <span className={styles['reason']}>{refusal}</span>}
                </button>
              );
            })}
            {atTime === null ? (
              <button type="button" role="menuitem" onClick={() => setAtTime('')}>
                At time T…
              </button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addAtTime(close);
                }}
              >
                <label>
                  T+{' '}
                  <input
                    autoFocus
                    value={atTime}
                    placeholder="1h 30m"
                    onChange={(e) => setAtTime(e.target.value)}
                  />
                </label>
                <button type="submit">Add</button>
              </form>
            )}
          </div>
        )}
      </Popover>
      {error && (
        <p className={styles['warning']} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
