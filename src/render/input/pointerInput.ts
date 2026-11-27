import { useView, type MapObjectRef } from '../../store/useView';
import { useWorld } from '../../store/useWorld';
import { DRAG_THRESHOLD_PX } from '../camera/controller';
import { frameBodyOf, type MapFrame } from '../mapFrame';
import type { NodeGizmo } from '../NodeGizmo';
import { nearestOnPath } from '../pathPicking';
import { pick } from '../picking';

const sameRef = (a: MapObjectRef | null, b: MapObjectRef | null) =>
  a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);

/** A press that the map input owns, rather than the camera (S4-14). */
type Claim =
  | { kind: 'handle'; id: number }
  | {
      kind: 'node';
      id: number;
      x: number;
      y: number;
      moved: boolean;
      ref: Extract<MapObjectRef, { kind: 'node' }>;
    };

/**
 * Map pointer input (S2-13, S2-14, S4-12 to S4-14): hover with a pointer cursor, click to
 * select, double-click to focus. Where nothing else is under the pointer, the active ship's path
 * shows a ghost node, and a click there creates a node and selects it. A press on a gizmo handle
 * drags it; a press on one of the active ship's nodes drags it along its path (or selects it, if
 * it doesn't move). Those presses are claimed before the camera input sees them
 * (`stopImmediatePropagation`; these listeners are attached first). Any other press that moves
 * 4 px or more is a camera drag; a click on empty space changes nothing. Returns a function that
 * detaches the listeners.
 */
export function attachPointerInput(el: HTMLElement, frame: MapFrame, gizmo: NodeGizmo): () => void {
  let press: { id: number; x: number; y: number; moved: boolean } | null = null;
  let claim: Claim | null = null;

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
  const take = (e: PointerEvent) => {
    e.stopImmediatePropagation();
    el.setPointerCapture(e.pointerId);
  };
  const release = (e: PointerEvent) => {
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };

  const onMove = (e: PointerEvent) => {
    if (claim && e.pointerId === claim.id) {
      e.stopImmediatePropagation();
      const p = local(e);
      if (claim.kind === 'node' && !claim.moved) {
        if (Math.hypot(p.x - claim.x, p.y - claim.y) < DRAG_THRESHOLD_PX) return;
        claim.moved = true;
        const view = useView.getState();
        view.select(claim.ref);
        const fb = frameBodyOf(useWorld.getState().world, view.focus);
        if (!gizmo.beginTimeDrag(claim.ref.shipId, claim.ref.id, fb, frame.t)) return;
      }
      gizmo.dragTo(p.x, p.y, frame, e);
      return;
    }
    if (press && e.pointerId === press.id) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) >= DRAG_THRESHOLD_PX) {
        press.moved = true;
        frame.ghost = null;
      }
      return;
    }
    if (e.buttons !== 0) return;
    const p = local(e);
    const handle = gizmo.hitHandle(p.x, p.y, frame);
    gizmo.setHovered(handle);
    if (handle) {
      frame.ghost = null;
      el.style.cursor = 'grab';
      el.title = gizmo.tooltip(handle);
      return;
    }
    el.title = '';
    const hit = at(e);
    const view = useView.getState();
    if (!sameRef(view.hovered, hit)) view.setHovered(hit);
    updateGhost(e, hit);
    el.style.cursor = hit ? 'pointer' : frame.ghost ? 'copy' : '';
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const p = local(e);
    frame.ghost = null;
    const handle = gizmo.hitHandle(p.x, p.y, frame);
    if (handle && gizmo.beginHandleDrag(handle, p.x, p.y, frame, e)) {
      take(e);
      claim = { kind: 'handle', id: e.pointerId };
      el.style.cursor = 'grabbing';
      return;
    }
    const hit = pick(frame, p.x, p.y);
    const active = useView.getState().activeShipId;
    if (hit?.kind === 'node' && hit.shipId === active) {
      take(e);
      claim = { kind: 'node', id: e.pointerId, x: p.x, y: p.y, moved: false, ref: hit };
      return;
    }
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  };

  const onUp = (e: PointerEvent) => {
    if (claim && e.pointerId === claim.id) {
      e.stopImmediatePropagation();
      release(e);
      const c = claim;
      claim = null;
      if (c.kind === 'node' && !c.moved) useView.getState().select(c.ref);
      else gizmo.endDrag();
      el.style.cursor = '';
      return;
    }
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
  const onCancel = (e: PointerEvent) => {
    if (claim && e.pointerId === claim.id) {
      claim = null;
      gizmo.endDrag();
    }
  };
  const onDouble = (e: MouseEvent) => {
    const hit = at(e);
    if (hit) useView.getState().focusOn(hit);
  };
  const onLeave = () => {
    if (useView.getState().hovered) useView.getState().setHovered(null);
    gizmo.setHovered(null);
    frame.ghost = null;
    el.style.cursor = '';
  };

  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('dblclick', onDouble);
  el.addEventListener('pointerleave', onLeave);
  return () => {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onCancel);
    el.removeEventListener('dblclick', onDouble);
    el.removeEventListener('pointerleave', onLeave);
  };
}
