import { useMemo, useState, type FormEvent } from 'react';
import { registry } from '../../content/registry';
import {
  orbitFromInput,
  isComputedPreset,
  presetInput,
  presetOrbit,
  SPAWN_PRESETS,
  type OrbitInput,
  type SpawnPreset,
} from '../../gen/sandboxShips';
import { DEG } from '../../math/units';
import { elementsFromState, periapsis } from '../../orbital/elements';
import { eclipticToPlane } from '../../orbital/frames';
import { bodyOrder, getBody } from '../../sim/body';
import type { OrbitState } from '../../sim/ship';
import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import styles from './SpawnShipForm.module.css';

/** The form's fields, as typed: angles in degrees. */
interface Fields {
  designId: string;
  name: string;
  parentId: string;
  periapsisAltitude: string;
  e: string;
  i: string;
  lan: string;
  argp: string;
  nu: string;
  plane: 'equator' | 'ecliptic';
}

const DEFAULTS: Fields = {
  designId: 'starship',
  name: '',
  parentId: 'earth',
  periapsisAltitude: '400',
  e: '0',
  i: '0',
  lan: '0',
  argp: '0',
  nu: '0',
  plane: 'equator',
};

const ANGLES = ['i', 'lan', 'argp', 'nu'] as const;
const round = (x: number, digits: number) => String(Number(x.toFixed(digits)));

function fieldsFromInput(f: Fields, input: OrbitInput): Fields {
  return {
    ...f,
    parentId: input.parentId,
    periapsisAltitude: round(input.periapsisAltitude, 3),
    e: round(input.e, 6),
    i: round(input.i / DEG, 4),
    lan: round(input.lan / DEG, 4),
    argp: round(input.argp / DEG, 4),
    nu: round(input.nu / DEG, 4),
    plane: input.plane,
  };
}

/**
 * The spawn form (S3-14): design, parent (major bodies only), and the orbit as periapsis
 * altitude, eccentricity (≥ 1 allowed), inclination, Ω, ω and true anomaly, relative to the
 * parent's equator (or the ecliptic). A preset menu fills the fields; "To the Moon" computes
 * its state at the current time. Spawning goes through `game/actions.ts`.
 */
export function SpawnShipForm() {
  const system = useWorld((s) => s.world.system);
  const { setSpawnFormOpen, select, flashObject } = useView.getState();
  const [fields, setFields] = useState<Fields>(DEFAULTS);
  /** A computed state from the "To the Moon" preset, used until a field is edited. */
  const [override, setOverride] = useState<OrbitState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const parents = useMemo(
    () =>
      bodyOrder(system)
        .map((id) => getBody(system, id))
        .filter((b) => b.major),
    [system],
  );
  const parent = system.bodies[fields.parentId];
  const hasPole = !!parent?.rotation;

  const set = (patch: Partial<Fields>) => {
    setFields((f) => ({ ...f, ...patch }));
    setOverride(null);
    setError(null);
  };

  function applyPreset(preset: SpawnPreset) {
    setError(null);
    const world = useWorld.getState().world;
    if (!isComputedPreset(preset)) {
      setFields((f) => fieldsFromInput(f, presetInput(system, preset)));
      setOverride(null);
      return;
    }
    const orbit = presetOrbit(system, preset, world.clock.t);
    const body = getBody(system, orbit.parentId);
    const pole = body.rotation?.pole;
    const el = elementsFromState(
      body.mu,
      pole ? { r: eclipticToPlane(pole, orbit.r), v: eclipticToPlane(pole, orbit.v) } : orbit,
    );
    setFields((f) =>
      fieldsFromInput(f, {
        parentId: orbit.parentId,
        periapsisAltitude: periapsis(el) - body.radius,
        e: el.e,
        i: el.i,
        lan: el.lan,
        argp: el.argp,
        nu: el.nu,
        plane: pole ? 'equator' : 'ecliptic',
      }),
    );
    setOverride(orbit);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const world = useWorld.getState();
    let orbit = override;
    if (!orbit) {
      const nums = [fields.periapsisAltitude, fields.e, ...ANGLES.map((k) => fields[k])].map(
        Number,
      );
      if (fields.periapsisAltitude.trim() === '' || !nums.every(Number.isFinite)) {
        setError('Every orbit field needs a number');
        return;
      }
      const [alt, ecc, i, lan, argp, nu] = nums as [number, number, number, number, number, number];
      if (ecc < 0) {
        setError('The eccentricity must not be negative');
        return;
      }
      orbit = orbitFromInput(
        system,
        {
          parentId: fields.parentId,
          periapsisAltitude: alt,
          e: ecc,
          i: i * DEG,
          lan: lan * DEG,
          argp: argp * DEG,
          nu: nu * DEG,
          plane: hasPole ? fields.plane : 'ecliptic',
        },
        world.world.clock.t,
      );
    }
    const name = fields.name.trim();
    const result = world.spawnShip({ designId: fields.designId, orbit, ...(name ? { name } : {}) });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Selected and flashed, so it can be found; not focused or flown (S5b-6, S5b-11).
    select({ kind: 'ship', id: result.value });
    flashObject({ kind: 'ship', id: result.value });
    setSpawnFormOpen(false);
  }

  const num = (key: keyof Fields, label: string, step = 'any') => (
    <>
      <label htmlFor={`spawn-${key}`}>{label}</label>
      <input
        id={`spawn-${key}`}
        type="number"
        step={step}
        value={fields[key]}
        onChange={(e) => set({ [key]: e.target.value })}
      />
    </>
  );

  return (
    <form className={styles['form']} aria-label="Spawn ship" onSubmit={onSubmit}>
      <h3>Spawn ship</h3>
      <label htmlFor="spawn-preset">Preset</label>
      <select
        id="spawn-preset"
        value=""
        onChange={(e) => e.target.value && applyPreset(e.target.value as SpawnPreset)}
      >
        <option value="">Choose…</option>
        {SPAWN_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <label htmlFor="spawn-design">Design</label>
      <select
        id="spawn-design"
        value={fields.designId}
        onChange={(e) => set({ designId: e.target.value })}
      >
        {registry.designs.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <label htmlFor="spawn-name">Name</label>
      <input
        id="spawn-name"
        value={fields.name}
        placeholder="(automatic)"
        onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))}
      />
      <label htmlFor="spawn-parent">Parent</label>
      <select
        id="spawn-parent"
        value={fields.parentId}
        onChange={(e) => set({ parentId: e.target.value })}
      >
        {parents.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      {num('periapsisAltitude', 'Periapsis alt. (km)')}
      {num('e', 'Eccentricity')}
      {num('i', 'Inclination (°)')}
      {num('lan', 'Ω (°)')}
      {num('argp', 'ω (°)')}
      {num('nu', 'True anomaly (°)')}
      <fieldset className={styles['plane']} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ display: 'contents' }}>Angles from</legend>
        <label>
          <input
            type="radio"
            name="spawn-plane"
            checked={hasPole && fields.plane === 'equator'}
            disabled={!hasPole}
            onChange={() => set({ plane: 'equator' })}
          />{' '}
          {parent?.name ?? 'parent'}&apos;s equator
        </label>
        <label>
          <input
            type="radio"
            name="spawn-plane"
            checked={!hasPole || fields.plane === 'ecliptic'}
            onChange={() => set({ plane: 'ecliptic' })}
          />{' '}
          ecliptic
        </label>
      </fieldset>
      {error && (
        <p className={styles['error']} role="alert">
          {error}
        </p>
      )}
      <div className={styles['buttons']}>
        <button type="button" onClick={() => setSpawnFormOpen(false)}>
          Cancel
        </button>
        <button type="submit">Spawn</button>
      </div>
    </form>
  );
}
