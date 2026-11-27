import {
  AmbientLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PointLight,
  SphereGeometry,
  type Material,
  type Scene,
} from 'three';
import { getBody, type BodySystem } from '../../sim/body';
import { bodyStyle } from '../bodyStyle';
import type { MapFrame } from '../mapFrame';
import { setObjectPositionAt } from '../precision';
import type { MapLayer } from '../stages';

/** Light from the Sun, with no distance decay (S2-6). */
const SUN_INTENSITY = 3;
/** A faint ambient, so night sides are visible. */
const AMBIENT_INTENSITY = 0.12;

/**
 * The body layer: one sphere of true radius per body (S2-6) and the Sun's light, positioned
 * relative to the scene origin every frame. A sphere under 0.5 px is hidden (S2-7). Built for
 * one body system; the renderer is rebuilt when the system changes.
 */
export class BodyLayer implements MapLayer {
  private readonly group = new Group();
  private readonly geometry = new SphereGeometry(1, 48, 24);
  private readonly meshes: Mesh<SphereGeometry, Material>[];
  private readonly light = new PointLight(0xffffff, SUN_INTENSITY, 0, 0);
  private readonly sunIndex: number;

  private readonly scene: Scene;

  constructor(scene: Scene, frame: MapFrame, system: BodySystem) {
    this.scene = scene;
    this.group.name = 'bodies';
    this.group.add(new AmbientLight(0xffffff, AMBIENT_INTENSITY), this.light);
    this.meshes = frame.order.map((id) => {
      const body = getBody(system, id);
      const { color } = bodyStyle(body);
      const material =
        body.class === 'star'
          ? new MeshBasicMaterial({ color })
          : new MeshLambertMaterial({ color });
      const mesh = new Mesh<SphereGeometry, Material>(this.geometry, material);
      mesh.scale.setScalar(body.radius);
      mesh.name = id;
      this.group.add(mesh);
      return mesh;
    });
    this.sunIndex = frame.indexOf[system.rootId] ?? 0;
    scene.add(this.group);
  }

  update(frame: MapFrame): void {
    const { world, origin } = frame;
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i]!;
      mesh.visible = frame.sphereShown[i] === 1;
      if (mesh.visible) setObjectPositionAt(mesh, world, i, origin);
    }
    setObjectPositionAt(this.light, world, this.sunIndex, origin);
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.geometry.dispose();
    for (const m of this.meshes) m.material.dispose();
  }
}
