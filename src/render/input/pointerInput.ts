import { useView, type MapObjectRef } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { DRAG_THRESHOLD_PX } from '../camera/controller';
import type { MapFrame } from '../mapFrame';
import { nearestOnPath } from '../pathPicking';
import { pick } from '../picking';

const sameRef = (a: MapObjectRef | null, b: MapObjectRef | null) =>
  a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);

/**
 * Map pointer input (S2-13, S2-14, S4-12): hover with a pointer cursor, click to select,
 * double-click to focus. Where nothing else is under the pointer, the active ship's path shows a
 * ghost node, and a click there creates a node and selects it. A press that moves 4 px or more is
 * a drag, which the camera input handles; a click on empty space changes nothing. Returns a
 * function that detaches the listeners.
 */
export function attachPointerInput(el: HTMLElement, frame: MapFrame): () => void {
  let press: { id: number; x: number; y: number; moved: boolean } | null = null;

  const local = (e: MouseEvent) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const at = (e: MouseEvent) => {
    const p = local(e);
    return pick(frame, p.x, p.y);
  };
  /** The ghost under the pointer, when nothing else is (S4-12). */
  const updateGhost = (e: MouseEvent, hit: MapObjectRef | null) => {
    const p = local(e);
    const h = hit ? null : nearestOnPath(frame.paths, p.x, p.y);
    frame.ghost = h
      ? { shipId: h.shipId, segmentIndex: h.segmentIndex, t: h.t, x: h.screenX, y: h.screenY }
      : null;
  };
  const onMove = (e: PointerEvent) => {
    if (press && e.pointerId === press.id) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) >= DRAG_THRESHOLD_PX) {
        press.moved = true;
        frame.ghost = null;
      }
      return;
    }
    if (e.buttons !== 0) return;
    const hit = at(e);
    const view = useView.getState();
    if (!sameRef(view.hovered, hit)) view.setHovered(hit);
    updateGhost(e, hit);
    el.style.cursor = hit ? 'pointer' : frame.ghost ? 'copy' : '';
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
    if (hit) {
      useView.getState().select(hit);
      return;
    }
    // A click on the active ship's path creates a node there (S4-12).
    updateGhost(e, null);
    const g = frame.ghost;
    if (!g) return;
    const r = useWorld.getState().addNode(g.shipId, { t: g.t });
    if (r.ok) useView.getState().select({ kind: 'node', shipId: g.shipId, id: r.value });
    frame.ghost = null;
  };
  const onDouble = (e: MouseEvent) => {
    const hit = at(e);
    if (hit) useView.getState().focusOn(hit);
  };
  const onLeave = () => {
    if (useView.getState().hovered) useView.getState().setHovered(null);
    frame.ghost = null;
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
}
