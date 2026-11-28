import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineLoop,
  type Scene,
} from 'three';
import type { World } from '../../sim/world';
import { encounterGhosts, encounterShips } from '../encounterGhosts';
import type { MapFrame } from '../mapFrame';
import { hexToRgb, shipColor } from '../shipStyle';
import type { MapLayer, ViewSnapshot } from '../stages';

/** Points of a ghost's SOI ring. */
const RING_POINTS = 96;
const RING_OPACITY = 0.55;

type Ring = LineLoop<BufferGeometry, LineBasicMaterial>;

/**
 * Encounter ghosts (S5b-13 in planning/sprint-5b.md): for each SOI entry on the selected,
 * hovered, focused or active ship's path, a ring of the entered body's SOI radius, facing the
 * camera, where the body will be at the entry time. Their hollow markers and "Moon at entry"
 * labels are in the trajectory marker overlay, from `frame.encounters`, which this layer fills.
 * In a preview, only entries after the preview time. Not pickable.
 */
export class EncounterGhostLayer implements MapLayer {
  private readonly rings: Ring[] = [];
  private world: World | null = null;
  private readonly scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  sync(world: World): void {
    this.world = world;
  }

  update(frame: MapFrame, view: ViewSnapshot): void {
    const world = this.world;
    frame.encounters =
      world && frame.indexOf[view.frameBodyId] !== undefined
        ? encounterGhosts(world, encounterShips(frame.ships.ids, view), view.frameBodyId, frame.t)
        : [];
    const { origin, camera: cam } = frame;
    frame.encounters.forEach((g, i) => {
      const ring = this.ringAt(i);
      const seq = world?.ships[g.shipId]?.seq ?? 1;
      ring.material.color.copy(new Color().setRGB(...hexToRgb(shipColor(seq)), 'srgb'));
      const pos = ring.geometry.attributes['position'] as BufferAttribute;
      const a = pos.array as Float32Array;
      const cx = g.world.x - origin.x;
      const cy = g.world.y - origin.y;
      const cz = g.world.z - origin.z;
      for (let k = 0; k < RING_POINTS; k++) {
        const th = (2 * Math.PI * k) / RING_POINTS;
        const c = g.soiRadius * Math.cos(th);
        const s = g.soiRadius * Math.sin(th);
        a[3 * k] = cx + c * cam.right.x + s * cam.up.x;
        a[3 * k + 1] = cy + c * cam.right.y + s * cam.up.y;
        a[3 * k + 2] = cz + c * cam.right.z + s * cam.up.z;
      }
      pos.needsUpdate = true;
      ring.visible = true;
    });
    for (let i = frame.encounters.length; i < this.rings.length; i++)
      this.rings[i]!.visible = false;
  }

  private ringAt(i: number): Ring {
    const existing = this.rings[i];
    if (existing) return existing;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(3 * RING_POINTS), 3));
    const ring: Ring = new LineLoop(
      geometry,
      new LineBasicMaterial({ transparent: true, opacity: RING_OPACITY, depthWrite: false }),
    );
    ring.frustumCulled = false;
    ring.name = `encounter-ghost:${i}`;
    this.scene.add(ring);
    this.rings.push(ring);
    return ring;
  }

  dispose(): void {
    for (const r of this.rings) {
      this.scene.remove(r);
      r.geometry.dispose();
      r.material.dispose();
    }
    this.rings.length = 0;
  }
}
