import { getBody, type BodyClass } from '../../sim/body';
import { useView } from '../../store/useView';
import { useSimTime, useWorld } from '../../store/useWorld';
import {
  formatAngle,
  formatDistance,
  formatDuration,
  formatMass,
  formatScientific,
  formatSpeed,
} from '../format';
import { bodyDetails } from './bodyDetails';
import styles from './BodyInspector.module.css';

const CLASS_NAME: Record<BodyClass, string> = {
  star: 'Star',
  planet: 'Planet',
  'dwarf-planet': 'Dwarf planet',
  moon: 'Moon',
};

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

/** The selected body's physical data, orbit and SOI (S2-18), updated at 10 Hz. */
export function BodyInspector() {
  const selected = useView((s) => s.selected);
  const system = useWorld((s) => s.world.system);
  const t = useSimTime();
  if (!selected || !system.bodies[selected.id]) {
    return <p className={styles['empty']}>Nothing selected</p>;
  }

  const body = getBody(system, selected.id);
  const d = bodyDetails(system, body.id, t);
  const p = d.physical;

  const physical: [string, string][] = [
    ['Mass', formatMass(p.mass)],
    ['GM', formatScientific(p.mu, 'km³/s²')],
    ['Radius', formatDistance(p.radius)],
    ['Surface gravity', `${(p.surfaceGravity * 1000).toFixed(2)} m/s²`],
    ['Escape speed', formatSpeed(p.escapeSpeed)],
  ];
  if (p.siderealDay !== undefined) physical.push(['Sidereal day', formatDuration(p.siderealDay)]);
  if (p.axialTilt !== undefined) physical.push(['Axial tilt', formatAngle(p.axialTilt)]);

  let orbit: [string, string][] | null = null;
  if (d.orbit) {
    const o = d.orbit;
    const plane = o.referencePlane === 'ecliptic' ? 'ecliptic' : 'Laplace plane';
    orbit = [
      ['Parent', getBody(system, o.parentId).name],
      ['Semi-major axis', formatDistance(o.a)],
      ['Eccentricity', o.e.toFixed(4)],
      ['Inclination (ecliptic)', formatAngle(o.inclinationEcliptic)],
    ];
    if (o.inclinationParentEquator !== undefined) {
      orbit.push([
        `Inclination (${getBody(system, o.parentId).name}'s equator)`,
        formatAngle(o.inclinationParentEquator),
      ]);
    }
    orbit.push(
      [`Ω (${plane})`, formatAngle(o.lan)],
      [`ω (${plane})`, formatAngle(o.argp)],
      ['Period', formatDuration(o.period)],
      ['Periapsis', formatDistance(o.periapsis)],
      ['Apoapsis', formatDistance(o.apoapsis)],
      ['Distance', formatDistance(o.distance)],
      ['Speed', formatSpeed(o.speed)],
    );
  }

  const soi =
    d.soi.kind === 'radius'
      ? formatDistance(d.soi.radius)
      : d.soi.kind === 'minor'
        ? 'none (minor body)'
        : '—';

  return (
    <section aria-label={`${body.name} details`}>
      <h3 className={styles['name']}>{body.name}</h3>
      <p className={styles['subtitle']}>
        {CLASS_NAME[body.class]}
        {body.major ? '' : ' · minor'}
      </p>
      <h4 className={styles['section']}>Physical</h4>
      <Rows rows={physical} />
      {orbit && (
        <>
          <h4 className={styles['section']}>Orbit</h4>
          <Rows rows={orbit} />
        </>
      )}
      <h4 className={styles['section']}>Sphere of influence</h4>
      <Rows rows={[['SOI radius', soi]]} />
    </section>
  );
}
