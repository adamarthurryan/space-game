import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  type Scene,
  type ShaderMaterial,
} from 'three';
import { getBody, type BodySystem } from '../../sim/body';
import type { ShipId } from '../../sim/ship';
import type { World } from '../../sim/world';
import { bodyStyle } from '../bodyStyle';
import type { MapFrame } from '../mapFrame';
import { createMarkerMaterial } from '../markerMaterial';
import { toOriginRelativeInto } from '../precision';
import { hexToRgb, SHIP_MARKER_PX, shipColor } from '../shipStyle';
import type { MapLayer } from '../stages';

/** The ship markers: one THREE.Points, rebuilt when the set of drawn ships changes. */
interface ShipPoints {
  ids: readonly ShipId[];
  points: Points<BufferGeometry, ShaderMaterial>;
  positions: Float32Array;
  sizes: Float32Array;
}

/**
 * One THREE.Points for every body's marker (S2-7), and one for the ships' triangles (S3-20).
 * Drawn last, so markers sit on top.
 */
export class MarkerLayer implements MapLayer {
  private ships: ShipPoints | null = null;
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
    geometry.setAttribute('shape', new BufferAttribute(new Float32Array(n), 1));
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
    this.updateShips(frame);
  }

  /** Ship markers: rebuilt if the frame's ship set changed, then positioned like the bodies. */
  private updateShips(frame: MapFrame): void {
    const fs = frame.ships;
    if (this.ships?.ids !== fs.ids) this.rebuildShips(fs.ids);
    const sp = this.ships;
    if (!sp) return;
    toOriginRelativeInto(sp.positions, fs.world, frame.origin);
    const px = SHIP_MARKER_PX * frame.camera.pixelRatio;
    for (let k = 0; k < fs.ids.length; k++) sp.sizes[k] = fs.markerShown[k] ? px : 0;
    const { position, size } = sp.points.geometry.attributes;
    if (position) position.needsUpdate = true;
    if (size) size.needsUpdate = true;
  }

  /** The ship colours come from the world; the set of IDs from the frame. */
  private world: World | null = null;

  sync(world: World): void {
    this.world = world;
  }

  private rebuildShips(ids: readonly ShipId[]): void {
    this.disposeShips();
    const m = ids.length;
    const positions = new Float32Array(3 * m);
    const sizes = new Float32Array(m);
    const colors = new Float32Array(3 * m);
    ids.forEach((id, k) => {
      const seq = this.world?.ships[id]?.seq ?? k + 1;
      // Linear, like the body colours through THREE.Color.
      const c = new Color().setRGB(...hexToRgb(shipColor(seq)), 'srgb');
      colors.set([c.r, c.g, c.b], 3 * k);
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('size', new BufferAttribute(sizes, 1));
    geometry.setAttribute('markerColor', new BufferAttribute(colors, 3));
    geometry.setAttribute('radius', new BufferAttribute(new Float32Array(m), 1));
    geometry.setAttribute('shape', new BufferAttribute(new Float32Array(m).fill(1), 1));
    const points = new Points(geometry, createMarkerMaterial());
    points.frustumCulled = false;
    points.name = 'ship-markers';
    // After the body markers, so ships draw on top of them.
    points.renderOrder = 1;
    this.scene.add(points);
    this.ships = { ids, points, positions, sizes };
  }

  private disposeShips(): void {
    if (!this.ships) return;
    this.scene.remove(this.ships.points);
    this.ships.points.geometry.dispose();
    this.ships.points.material.dispose();
    this.ships = null;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.disposeShips();
  }
}
