import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  type Scene,
  type ShaderMaterial,
} from 'three';
import { getBody, type BodySystem } from '../../sim/body';
import { bodyStyle } from '../bodyStyle';
import type { MapFrame } from '../mapFrame';
import { createMarkerMaterial } from '../markerMaterial';
import { toOriginRelativeInto } from '../precision';
import type { MapLayer } from '../stages';

/** One THREE.Points for every body's marker (S2-7). Drawn last, so markers sit on top. */
export class MarkerLayer implements MapLayer {
  private readonly points: Points<BufferGeometry, ShaderMaterial>;
  private readonly positions: Float32Array;
  private readonly sizes: Float32Array;
  private readonly markerPx: Float32Array;

  private readonly scene: Scene;

  constructor(scene: Scene, frame: MapFrame, system: BodySystem) {
    this.scene = scene;
    const n = frame.order.length;
    this.positions = new Float32Array(3 * n);
    this.sizes = new Float32Array(n);
    this.markerPx = new Float32Array(n);
    const colors = new Float32Array(3 * n);
    const radii = new Float32Array(n);
    frame.order.forEach((id, i) => {
      const body = getBody(system, id);
      const style = bodyStyle(body);
      const c = new Color(style.color);
      colors.set([c.r, c.g, c.b], 3 * i);
      radii[i] = body.radius;
      this.markerPx[i] = style.markerPx;
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('size', new BufferAttribute(this.sizes, 1));
    geometry.setAttribute('markerColor', new BufferAttribute(colors, 3));
    geometry.setAttribute('radius', new BufferAttribute(radii, 1));
    this.points = new Points(geometry, createMarkerMaterial());
    this.points.frustumCulled = false;
    this.points.name = 'markers';
    scene.add(this.points);
  }

  /** Marker positions relative to the origin, and sizes in device px (0 = hidden). */
  update(frame: MapFrame): void {
    toOriginRelativeInto(this.positions, frame.world, frame.origin);
    const dpr = frame.camera.pixelRatio;
    for (let i = 0; i < frame.order.length; i++) {
      this.sizes[i] = frame.markerShown[i] ? this.markerPx[i]! * dpr : 0;
    }
    const { position, size } = this.points.geometry.attributes;
    if (position) position.needsUpdate = true;
    if (size) size.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
