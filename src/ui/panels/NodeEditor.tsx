import { useState } from 'react';
import { snapRefusal } from '../../game/actions';
import { calendarFromJd, jdFromSimTime } from '../../math/time';
import type { LocalDv } from '../../orbital/frames';
import { useView } from '../../store/useView';
import { useSimTime, useWorld } from '../../store/useWorld';
import { QuantityField } from '../fields/QuantityField';
import { formatDate, formatDuration, formatDv } from '../format';
import { parseDate, parseDuration, parseSpeed } from '../parse';
import styles from './Plan.module.css';
import { planDetails, resultText, type NodeDetails } from './planDetails';

const kg = (m: number) =>
  m >= 1000
    ? `${(m / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 })} t`
    : `${m.toFixed(0)} kg`;
const AXES: { key: keyof LocalDv; label: string }[] = [
  { key: 'prograde', label: 'Prograde' },
  { key: 'normal', label: 'Normal' },
  { key: 'radial', label: 'Radial (out)' },
];
const DV_NUDGE = { step: 0.001, fine: 0.0001, coarse: 0.01 };
const T_NUDGE = { step: 10, fine: 1, coarse: 600 };

/** `T+1 h 23 min`; parsed back by stripping the `T`. */
const formatRelative = (s: number) => `T${s < 0 ? '−' : '+'}${formatDuration(Math.abs(s))}`;
const parseRelative = (text: string) => parseDuration(text.trim().replace(/^T/i, ''));

/** The feedback lines of one node (S4-17). */
export function NodeFeedback({ n }: { n: NodeDetails }) {
  const rows: [string, string, string?][] = [
    ['Δv', formatDv(n.dvRequested)],
    ...n.propellant.map((p): [string, string] => [p.name, kg(p.mass)]),
    ['Burn duration', formatDuration(n.burnDuration)],
  ];
  return (
    <>
      <dl className={styles['list']}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {n.overBudget && (
        <p className={styles['danger']} role="alert">
          Over budget: {formatDv(n.dvApplied)} of {formatDv(n.dvRequested)}
        </p>
      )}
      {n.longBurn && n.prePeriod !== undefined && (
        <p className={styles['warning']}>
          Long burn: {Math.round((100 * n.burnDuration) / n.prePeriod)}% of the orbit period
        </p>
      )}
      {!n.reached && <p className={styles['warning']}>Not reached: the trajectory ends first</p>}
      <p className={styles['result']} aria-label="Result">
        {resultText(n.result)}
      </p>
    </>
  );
}

/**
 * The selected node (S4-15): time, Δv, the feedback, and its actions. It is the body of the
 * node's expanded row in the ship's Plan list (S5b-17). A non-active ship's node is read-only:
 * every control is disabled (S5b-8).
 */
export function NodeEditor({
  shipId,
  nodeId,
  readOnly = false,
}: {
  shipId: string;
  nodeId: string;
  readOnly?: boolean;
}) {
  const world = useWorld((s) => s.world);
  useWorld((s) => s.version);
  const now = useSimTime();
  const store = useWorld.getState();
  const { select } = useView.getState();
  const [warpError, setWarpError] = useState<string | null>(null);
  const ship = world.ships[shipId];
  const node = ship?.plan.find((n) => n.id === nodeId);
  if (!ship || !node) return <p className={styles['empty']}>The node no longer exists</p>;
  const d = planDetails(world, shipId, now).nodes.find((n) => n.nodeId === nodeId)!;
  const epoch = world.system.epochJd;
  const err = (r: { ok: boolean; error?: string }) => (r.ok ? null : (r.error ?? 'Refused'));
  const edit = (e: Parameters<typeof store.editNode>[2]) => err(store.editNode(shipId, nodeId, e));
  // Snap is disabled on a circular orbit, with the reason (S5b-20).
  const circular = snapRefusal(world, shipId, nodeId);

  return (
    <section aria-label="Node editor" className={styles['editor']}>
      <QuantityField
        label="Time"
        value={node.t}
        format={(t) => formatDate(calendarFromJd(jdFromSimTime(epoch, t)))}
        parse={(text) => parseDate(text, epoch)}
        invalidText="Use YYYY-MM-DD hh:mm:ss"
        nudge={T_NUDGE}
        disabled={readOnly}
        onCommit={(t) => edit({ t })}
      />
      <QuantityField
        label="From now"
        value={node.t - now}
        format={formatRelative}
        parse={parseRelative}
        invalidText="Use a duration such as 1d 2h 30m"
        nudge={T_NUDGE}
        disabled={readOnly}
        onCommit={(dt) => edit({ t: now + dt })}
      />
      {AXES.map((a) => (
        <QuantityField
          key={a.key}
          label={a.label}
          value={node.dv[a.key]}
          format={formatDv}
          parse={parseSpeed}
          invalidText="Use a speed such as 12 m/s or 3.1 km/s"
          nudge={DV_NUDGE}
          disabled={readOnly}
          onCommit={(v) => edit({ dv: { [a.key]: v } })}
        />
      ))}
      <NodeFeedback n={d} />
      <div className={styles['actions']}>
        <label className={styles['check']}>
          <input
            type="checkbox"
            checked={node.enabled}
            disabled={readOnly}
            onChange={(e) => edit({ enabled: e.target.checked })}
          />
          Enabled
        </label>
        <button
          type="button"
          className={styles['action']}
          disabled={readOnly || circular !== null}
          title={circular ?? undefined}
          onClick={() => store.snapNode(shipId, nodeId, 'periapsis')}
        >
          Snap to Pe
        </button>
        <button
          type="button"
          className={styles['action']}
          disabled={readOnly || circular !== null}
          title={circular ?? undefined}
          onClick={() => store.snapNode(shipId, nodeId, 'apoapsis')}
        >
          Snap to Ap
        </button>
        <button
          type="button"
          className={styles['action']}
          disabled={readOnly}
          onClick={() => {
            if (store.deleteNode(shipId, nodeId).ok) select({ kind: 'ship', id: shipId });
          }}
        >
          Delete
        </button>
        <button
          type="button"
          className={styles['action']}
          disabled={readOnly}
          title="Warp to 1 min before the node, paused"
          onClick={() => setWarpError(err(store.warpToNode(shipId, nodeId)))}
        >
          Warp to node
        </button>
      </div>
      {warpError && (
        <p role="alert" className={styles['error']}>
          {warpError}
        </p>
      )}
    </section>
  );
}
