import { registry } from '../../content/registry';
import { getBody } from '../../sim/body';
import { resolveActiveShip, useView } from '../../store/useView';
import { useSimTime, useWorld } from '../../store/useWorld';
import {
  formatAngle,
  formatCountdown,
  formatDistance,
  formatDuration,
  formatSpeed,
} from '../format';
import styles from './BodyInspector.module.css';
import { PlanSection } from './PlanSection';
import { eventLabel, shipDetails } from './shipDetails';

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className={styles['list']}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const tonnes = (kg: number) =>
  `${(kg / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} t`;

/**
 * The selected ship, or the ship of the selected node (S3-21, minimal): design and status; the
 * plan, with the selected node's editor inline (S5b-17); mass, propellant, Δv, engines and
 * acceleration; the current SOI and orbit; and the upcoming events. Updated at 10 Hz.
 */
export function ShipInspector({ id }: { id: string }) {
  const world = useWorld((s) => s.world);
  useWorld((s) => s.version);
  const t = useSimTime();
  const activeShipId = useView((s) => s.activeShipId);
  const { focusOn } = useView.getState();
  if (!world.ships[id]) return <p className={styles['empty']}>Nothing selected</p>;
  const d = shipDetails(world, id, t);
  const s = d.stats;

  const mass: [string, string][] = [
    ['Dry mass', tonnes(s.dryMass)],
    ['Payload', tonnes(s.payload)],
    ['Wet mass', tonnes(s.wetMass)],
    ...d.propellant.map((p): [string, string] => [
      p.name,
      `${tonnes(p.mass)} / ${tonnes(p.capacity)}`,
    ]),
    ['Δv', formatSpeed(s.dv)],
    ['Acceleration', `${(s.acceleration * 1000).toFixed(2)} m/s²`],
  ];
  const engines: [string, string][] = s.engines.map((e) => [
    `${e.count} × ${registry.byId(e.moduleId)?.name ?? e.moduleId}`,
    `${(e.thrust / 1e6).toFixed(2)} MN · ${e.isp} s`,
  ]);

  let orbit: [string, string][] | null = null;
  if (d.orbit) {
    const o = d.orbit;
    const parent = getBody(world.system, o.parentId);
    orbit = [
      ['SOI', parent.name],
      ['Periapsis alt.', formatDistance(o.periapsis - parent.radius)],
      [
        'Apoapsis alt.',
        o.apoapsis === undefined ? 'escape' : formatDistance(o.apoapsis - parent.radius),
      ],
      ['Eccentricity', o.e.toFixed(4)],
      [
        o.inclinationPlane === 'equator'
          ? `Inclination (${parent.name}'s equator)`
          : 'Inclination (ecliptic)',
        formatAngle(o.i),
      ],
      ['Period', o.period === undefined ? 'escape' : formatDuration(o.period)],
      ['Distance', formatDistance(o.distance)],
      ['Speed', formatSpeed(o.speed)],
    ];
  }

  return (
    <section aria-label={`${d.name} details`}>
      <h3 className={styles['name']}>{d.name}</h3>
      <p className={styles['subtitle']}>
        {d.designName} · {d.destroyed ? `destroyed: impacted ${d.destroyed.bodyName}` : 'coasting'}
      </p>
      {!d.destroyed && (
        <button
          type="button"
          className={styles['action']}
          onClick={() => focusOn({ kind: 'ship', id })}
        >
          Focus
        </button>
      )}
      {!d.destroyed && (
        <PlanSection shipId={id} readOnly={resolveActiveShip(world, activeShipId) !== id} />
      )}
      <h4 className={styles['section']}>Mass and propellant</h4>
      <Rows rows={mass} />
      <h4 className={styles['section']}>Engines</h4>
      <Rows rows={engines} />
      {orbit && (
        <>
          <h4 className={styles['section']}>Orbit</h4>
          <Rows rows={orbit} />
        </>
      )}
      {!d.destroyed && (
        <>
          <h4 className={styles['section']}>Upcoming events</h4>
          {d.events.length === 0 ? (
            <p className={styles['empty']}>None within the horizon</p>
          ) : (
            <ul className={styles['events']} aria-label="Upcoming events">
              {d.events.map((e) => (
                <li key={`${e.kind}-${e.t}`}>
                  {eventLabel(e)} in {formatCountdown(e.t - t)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
