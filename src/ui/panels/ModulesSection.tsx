import { registry } from '../../content/registry';
import type { Ship, ShipStats } from '../../sim/ship';
import styles from './BodyInspector.module.css';

const tonnes = (kg: number) =>
  `${(kg / 1000).toLocaleString('en-US', { maximumFractionDigits: 1, useGrouping: false })} t`;

/** A used-of-limit bar: "1800.6 t / 5000 t". */
function Bar({
  label,
  used,
  max,
  text,
}: {
  label: string;
  used: number;
  max: number;
  text: string;
}) {
  const f = max > 0 ? Math.min(used / max, 1) : 0;
  return (
    <div className={styles['bar']}>
      <span className={styles['barLabel']}>{label}</span>
      <span
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={used}
        className={`${styles['barTrack']} ${used > max ? styles['barOver'] : ''}`}
      >
        <span className={styles['barFill']} style={{ width: `${f * 100}%` }} />
      </span>
      <span className={styles['barText']}>{text}</span>
    </div>
  );
}

/**
 * The ship's modules (S6-9 in planning/sprint-6.md): the backbone, each module × count with its
 * dry mass, then mass (wet, against the backbone's limit) and module volume, as bars.
 */
export function ModulesSection({ ship, stats }: { ship: Ship; stats: ShipStats }) {
  const backbone = registry.byId(ship.backboneId);
  return (
    <>
      <h4 className={styles['section']}>Modules</h4>
      <dl className={styles['list']} aria-label="Modules">
        <dt>{backbone?.name ?? ship.backboneId}</dt>
        <dd>{tonnes(backbone?.mass ?? 0)}</dd>
        {ship.modules.map((m) => {
          const def = registry.byId(m.moduleId);
          const label = `${m.count} × ${def?.name ?? m.moduleId}`;
          return (
            <div key={m.moduleId} style={{ display: 'contents' }}>
              <dt>{label}</dt>
              <dd>{tonnes((def?.mass ?? 0) * m.count)}</dd>
            </div>
          );
        })}
      </dl>
      <Bar
        label="Mass"
        used={stats.wetMass}
        max={stats.maxMass}
        text={`${tonnes(stats.wetMass)} / ${tonnes(stats.maxMass)}`}
      />
      <Bar
        label="Volume"
        used={stats.volume}
        max={stats.maxVolume}
        text={`${Math.round(stats.volume)} / ${Math.round(stats.maxVolume)} m³`}
      />
    </>
  );
}
