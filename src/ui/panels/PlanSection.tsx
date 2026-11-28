import { useState } from 'react';
import type { PassageKind } from '../../orbital/passages';
import { useView } from '../../store/useView';
import { useSimTime, useWorld } from '../../store/useWorld';
import { formatCountdown, formatSpeed } from '../format';
import { Popover } from '../layout/Popover';
import { parseDuration } from '../parse';
import styles from './Plan.module.css';
import { planDetails } from './planDetails';

const ADD: { at: PassageKind; label: string }[] = [
  { at: 'periapsis', label: 'At next Pe' },
  { at: 'apoapsis', label: 'At next Ap' },
  { at: 'ascending-node', label: 'At next AN' },
  { at: 'descending-node', label: 'At next DN' },
];

/** The ship's plan (S4-16, S4-17): the node list, the totals and "Add node ▾". */
export function PlanSection({ shipId }: { shipId: string }) {
  const world = useWorld((s) => s.world);
  useWorld((s) => s.version);
  const now = useSimTime();
  const selected = useView((s) => s.selected);
  const [atTime, setAtTime] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      {d.nodes.length === 0 ? (
        <p className={styles['empty']}>No nodes</p>
      ) : (
        <ul className={styles['nodes']} aria-label="Nodes">
          {d.nodes.map((n, i) => (
            <li key={n.nodeId}>
              <button
                type="button"
                className={styles['nodeRow']}
                aria-current={
                  selected?.kind === 'node' && selected.id === n.nodeId ? 'true' : undefined
                }
                onClick={() => select({ kind: 'node', shipId, id: n.nodeId })}
              >
                <span>◆ Node {i + 1}</span>
                <span className={styles['mono']}>in {formatCountdown(n.countdown)}</span>
                <span className={`${styles['mono']} ${n.overBudget ? styles['danger'] : ''}`}>
                  {formatSpeed(n.dvRequested)}
                </span>
                {(!n.enabled || !n.reached) && (
                  <span className={styles['dim']}>{!n.enabled ? 'disabled' : 'not reached'}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <dl className={styles['list']}>
        <dt>Δv planned</dt>
        <dd>{formatSpeed(d.dvPlanned)}</dd>
        <dt>Δv left after plan</dt>
        <dd className={d.overBudget ? styles['danger'] : ''} aria-label="Δv left after plan">
          {d.overBudget ? '−' : ''}
          {formatSpeed(Math.abs(d.dvLeft))}
        </dd>
      </dl>
      <Popover
        label="Add node ▾"
        className={styles['menu']}
        buttonClassName={styles['action']}
        panelClassName={styles['popover']}
        onClose={() => setAtTime(null)}
      >
        {(close) => (
          <div role="menu" aria-label="Add node" className={styles['menuItems']}>
            {ADD.map((a) => (
              <button key={a.at} type="button" role="menuitem" onClick={() => addAt(a.at, close)}>
                {a.label}
              </button>
            ))}
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
