import {
  DRAG_THRESHOLD_PX,
  orbitBy,
  wheelNotches,
  zoomBy,
  type CameraController,
} from '../camera/controller';

/**
 * Camera input on the canvas (S2-10): the wheel zooms, and a left-button drag of 4 px or more
 * orbits. Returns a function that detaches the listeners.
 */
export function attachCameraInput(el: HTMLElement, controller: CameraController): () => void {
  let press: { id: number; x: number; y: number; dragging: boolean } | null = null;

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    zoomBy(controller, wheelNotches(e));
  };
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || press) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false };
  };
  const onMove = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.id) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (!press.dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      press.dragging = true;
      el.setPointerCapture(e.pointerId);
    }
    orbitBy(controller, dx, dy);
    press.x = e.clientX;
    press.y = e.clientY;
  };
  const onUp = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.id) return;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    press = null;
  };

  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  return () => {
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
  };
}
