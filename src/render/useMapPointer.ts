import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { DRAG_THRESHOLD_PX } from './camera/controller';
import type { MapFrame } from './mapFrame';
import { pick } from './picking';
import { useView, type MapObjectRef } from '../store/useView';

const sameRef = (a: MapObjectRef | null, b: MapObjectRef | null) =>
  a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);

/**
 * Map pointer input (S2-13, S2-14): hover with a pointer cursor, click to select, double-click
 * to focus. A press that moves 4 px or more is a drag, which the camera rig handles; a click on
 * empty space changes nothing.
 */
export function useMapPointer(frame: MapFrame): void {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const el = gl.domElement;
    let press: { id: number; x: number; y: number; moved: boolean } | null = null;

    const at = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      return pick(frame, e.clientX - r.left, e.clientY - r.top);
    };
    const onMove = (e: PointerEvent) => {
      if (press && e.pointerId === press.id) {
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) >= DRAG_THRESHOLD_PX) {
          press.moved = true;
        }
        return;
      }
      if (e.buttons !== 0) return;
      const hit = at(e);
      const view = useView.getState();
      if (!sameRef(view.hovered, hit)) view.setHovered(hit);
      el.style.cursor = hit ? 'pointer' : '';
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 0) press = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    };
    const onUp = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      const click = !press.moved;
      press = null;
      if (!click) return;
      const hit = at(e);
      if (hit) useView.getState().select(hit);
    };
    const onDouble = (e: MouseEvent) => {
      const hit = at(e);
      if (hit) useView.getState().focusOn(hit);
    };
    const onLeave = () => {
      if (useView.getState().hovered) useView.getState().setHovered(null);
      el.style.cursor = '';
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('dblclick', onDouble);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('dblclick', onDouble);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [gl, frame]);
}
