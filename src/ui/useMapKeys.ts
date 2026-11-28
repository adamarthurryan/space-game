import { useEffect } from 'react';
import { focusRefOf, shipOf, useView } from '../store/useView';
import { useWorld } from '../store/useWorld';

/**
 * Whether the selection has an orbital plane to snap to: a body other than the root, or a
 * coasting ship (S3-15).
 */
export function canSnapToSelectedOrbit(): boolean {
  const selected = useView.getState().selected;
  if (!selected) return false;
  const world = useWorld.getState().world;
  const ref = focusRefOf(selected);
  if (ref.kind === 'ship') return world.ships[ref.id]?.status === 'coasting';
  return !!world.system.bodies[ref.id]?.orbit;
}
/** Text fields keep every key; buttons, tabs and tree rows keep Space and Enter. */
function ignoredFor(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('input, textarea, select')) return true;
  if (key === ' ' && target.closest('button, a, [role="treeitem"], [role="tab"]')) return true;
  return false;
}

/**
 * Map shortcuts (S2-20): Space play/pause, `,` and `.` warp down and up, F focus the selection,
 * A fly (activate) the selected ship, E and P snap to the ecliptic and the selected body's or
 * ship's orbit, Esc end a preview or clear the selection, Delete remove the selected node (F on
 * a node focuses its ship). Ignored
 * while a text field has focus, and with Ctrl, Alt or Meta held.
 */
export function useMapKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;
      if (ignoredFor(e.target, e.key)) return;
      const world = useWorld.getState();
      const view = useView.getState();
      switch (e.key) {
        case ' ':
          world.togglePause();
          break;
        case ',':
          world.warpDown();
          break;
        case '.':
          world.warpUp();
          break;
        case 'f':
        case 'F':
          if (!view.selected) return;
          view.focusOn(view.selected);
          break;
        case 'a':
        case 'A': {
          // Flies the selected ship, or the selected node's ship (S5b-6).
          const id = shipOf(view.selected);
          if (id === null || world.world.ships[id]?.status !== 'coasting') return;
          view.activate(id);
          break;
        }
        case 'e':
        case 'E':
          view.snapTo('ecliptic');
          break;
        case 'p':
        case 'P':
          if (!canSnapToSelectedOrbit()) return;
          view.snapTo('selected-orbit');
          break;
        case 'Escape':
          // A preview ends first (S5-13); then the selection is cleared.
          if (view.preview) view.endPreview();
          else if (view.selected) view.select(null);
          else return;
          break;
        case 'Delete':
        case 'Backspace': {
          // Deletes the selected node and selects its ship (S4-10).
          const sel = view.selected;
          if (sel?.kind !== 'node') return;
          if (world.deleteNode(sel.shipId, sel.id).ok)
            view.select({ kind: 'ship', id: sel.shipId });
          break;
        }
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
