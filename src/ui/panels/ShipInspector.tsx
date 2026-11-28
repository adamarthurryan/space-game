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
import { ModulesSection } from './ModulesSection';
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
  `${(kg / 1000).toLocaleString('en-US', { maximumFractionDigits: 1, useGrouping: false })} t`;

/**
 * The selected ship, or the ship of the selected node (S6-9 in planning/sprint-6.md): design and
 * status, Fly and Focus; its fleet; the plan, with the selected node's editor inline (S5b-17),
 * editable only while active; its modules; mass, propellant, Δv, engines and acceleration; the
 * current SOI and orbit; and the upcoming events. Updated at 10 Hz.
 */
export function ShipInspector({ id }: { id: string }) {
  const world = useWorld((s) => s.world);
  useWorld((s) => s.version);
  const t = useSimTime();
  const activeShipId = useView((s) => s.activeShipId);
  const { focusOn, activate } = useView.getState();
  const ship = world.ships[id];
  if (!ship) return <p className={styles['empty']}>Nothing selected</p>;
  const d = shipDetails(world, id, t);
  const active = resolveActiveShip(world, activeShipId) === id;
  const fleets = Object.values(world.fleets).sort((a, b) => a.seq - b.seq);
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
  const engines: [string, string][] = s.engines.map((e) => {
    const def = registry.byId(e.moduleId);
    const kind = def?.category === 'engine' ? ` (${def.kind})` : '';
    return [
      `${e.count} × ${def?.name ?? e.moduleId}${kind}`,
      `${(e.thrust / 1e6).toFixed(2)} MN · ${e.isp} s`,
    ];
  });

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
        <div className={styles['header']}>
          <button
            type="button"
            className={styles['action']}
            aria-pressed={active}
            onClick={() => activate(id)}
            title={active ? 'The active ship' : 'Make this the active ship (A)'}
          >
            {active ? `★ ${d.name}` : 'Fly (A)'}
          </button>
          <button
            type="button"
            className={styles['action']}
            onClick={() => focusOn({ kind: 'ship', id })}
          >
            Focus
          </button>
        </div>
      )}
      <label className={styles['section']} htmlFor={`fleet-of-${id}`}>
        Fleet
      </label>
      <select
        id={`fleet-of-${id}`}
        className={styles['select']}
        value={ship.fleetId ?? ''}
        onChange={(e) => useWorld.getState().assignShip(id, e.target.value || null)}
      >
        <option value="">Unassigned</option>
        {fleets.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      {!d.destroyed && <PlanSection shipId={id} readOnly={!active} />}
      <ModulesSection ship={ship} stats={s} />
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
