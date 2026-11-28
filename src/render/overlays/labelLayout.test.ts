import { describe, expect, it } from 'vitest';
import { presetOrbit } from '../../gen/sandboxShips';
import { createSandboxWorld } from '../../gen/scenario';
import { spawnShip } from '../../game/actions';
import { createMapFrame, syncFrameShips } from '../mapFrame';
import { pick } from '../picking';
import type { ViewSnapshot } from '../stages';
import { FORCED } from './declutter';
import { createLabelRegistry, MERGE_GAP_PX, placeLabels } from './labelLayout';

type View = Pick<ViewSnapshot, 'focus' | 'selected' | 'activeShipId' | 'flash'>;
const view = (v: Partial<View> = {}): View => ({
  focus: { kind: 'body', id: 'earth' },
  selected: null,
  activeShipId: null,
  flash: null,
  ...v,
});

/**
 * Four ships at Earth (Kestrel, Tern and two spawned), Earth's label at (100, 100), and each
 * ship's label just right of it, overlapping it, unless `apart`.
 */
function setUp(apart: string[] = []) {
  const world = createSandboxWorld();
  for (const name of ['Plover', 'Wren']) {
    spawnShip(world, { designId: 'starship', name, orbit: presetOrbit(world.system, 'leo', 0) });
  }
  const f = createMapFrame(world.system);
  f.camera = { ...f.camera, width: 800, height: 600 };
  syncFrameShips(f, world);
  const reg = createLabelRegistry(f);
  const e = f.indexOf['earth']!;
  Object.assign(reg.candidates[e]!, {
    anchorX: 100,
    anchorY: 100,
    width: 40,
    height: 14,
    priority: 4e7,
    hidden: false,
  });
  reg.shipCandidates = f.ships.ids.map((id, k) => {
    f.ships.parentIndex[k] = world.ships[id]!.orbit.parentId === 'moon' ? f.indexOf['moon']! : e;
    f.ships.depth[k] = 1e5;
    reg.shipSizes.set(id, [50, 14]);
    const far = apart.includes(id) || world.ships[id]!.orbit.parentId === 'moon';
    return {
      ref: { kind: 'ship', id },
      anchorX: far ? 400 + 60 * k : 110,
      anchorY: far ? 300 : 102,
      width: 50,
      height: 14,
      priority: 2e7 - k,
      hidden: false,
    };
  });
  reg.shipCandidatesFor = f.ships.ids;
  return { world, f, reg };
}

const names = (world: ReturnType<typeof setUp>['world'], ids: string[]) =>
  ids.map((id) => world.ships[id]?.name ?? world.system.bodies[id]?.name);

describe('merged labels (S5b-16)', () => {
  it('merges ships whose labels overlap their parent’s: selected, active, focused, then by seq', () => {
    const { world, f, reg } = setUp();
    const ids = f.ships.ids; // Kestrel, Tern, Heron, Plover, Wren
    placeLabels(
      reg,
      f,
      world,
      view({ selected: { kind: 'ship', id: ids[4]! }, activeShipId: ids[1]! }),
    );
    const earth = f.labels.find((l) => l.ref.id === 'earth')!;
    expect(
      names(
        world,
        earth.parts!.map((p) => p.id),
      ),
    ).toEqual(['Earth', 'Wren', 'Tern']);
    // The other two are counted in "+2", and get no label of their own.
    expect(f.labels.some((l) => l.ref.id === ids[0])).toBe(false);
    expect(f.labels.some((l) => l.ref.id === ids[3])).toBe(false);
    // Heron, at the Moon, keeps its own label.
    expect(f.labels.some((l) => l.ref.id === ids[2])).toBe(true);
  });

  it('gives each name its own pick rectangle, side by side', () => {
    const { world, f, reg } = setUp();
    const ids = f.ships.ids;
    placeLabels(reg, f, world, view({ selected: { kind: 'ship', id: ids[1]! } }));
    const earth = f.labels.find((l) => l.ref.id === 'earth')!;
    const tern = f.labels.find((l) => l.ref.id === ids[1])!;
    expect(earth.rect.w).toBe(40);
    expect(tern.rect.x).toBe(earth.rect.x + 40 + MERGE_GAP_PX);
    expect(pick(f, earth.rect.x + 5, 100)).toEqual({ kind: 'body', id: 'earth' });
    expect(pick(f, tern.rect.x + 5, 100)).toEqual({ kind: 'ship', id: ids[1] });
  });

  it("doesn't merge a ship whose label is clear of its parent's", () => {
    const { world, f, reg } = setUp(['ship-1', 'ship-2', 'ship-4', 'ship-5']);
    placeLabels(reg, f, world, view());
    expect(f.labels.find((l) => l.ref.id === 'earth')!.parts).toBeUndefined();
    expect(f.labels.filter((l) => l.ref.kind === 'ship')).toHaveLength(5);
  });

  it("places a flashing ship's label even when the ship is merged into its parent (S5b-11)", () => {
    const { world, f, reg } = setUp(['ship-1', 'ship-2', 'ship-4']);
    // Wren is merged on screen: its own candidate is hidden.
    const k = f.ships.indexOf['ship-5']!;
    reg.shipCandidates[k]!.hidden = true;
    placeLabels(reg, f, world, view());
    expect(f.labels.some((l) => l.ref.id === 'ship-5')).toBe(false);
    placeLabels(
      reg,
      f,
      world,
      view({ flash: { ref: { kind: 'ship', id: 'ship-5' }, elapsed: 0.1 } }),
    );
    const earth = f.labels.find((l) => l.ref.id === 'earth')!;
    expect(earth.parts!.map((p) => p.id)).toEqual(['earth', 'ship-5']);
    expect(FORCED).toBeGreaterThan(4e7);
  });
});
