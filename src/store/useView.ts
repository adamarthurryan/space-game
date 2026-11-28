import { create } from 'zustand';
import type { BodyId } from '../sim/body';
import type { NodeId } from '../sim/maneuver';
import type { ShipId } from '../sim/ship';

/** Something the camera can focus (S3-15): a body or a ship. */
export type FocusRef = { kind: 'body'; id: BodyId } | { kind: 'ship'; id: ShipId };
/** Something on the map that can be selected or hovered: also a ship's node (S4-10). */
export type MapObjectRef = FocusRef | { kind: 'node'; shipId: ShipId; id: NodeId };

/** The object a ref focuses: a node focuses its ship (S4-10). */
export const focusRefOf = (ref: MapObjectRef): FocusRef =>
  ref.kind === 'node' ? { kind: 'ship', id: ref.shipId } : ref;

/** The ship a ref makes active, if any (S4-9). */
const shipOf = (ref: MapObjectRef | null): ShipId | null =>
  ref?.kind === 'ship' ? ref.id : ref?.kind === 'node' ? ref.shipId : null;

/** The active ship, if it still exists and isn't destroyed (S4-9). */
export function resolveActiveShip(
  world: { ships: Record<ShipId, { status: string }> },
  id: ShipId | null,
): ShipId | null {
  return id !== null && world.ships[id]?.status === 'coasting' ? id : null;
}

/** Whether two refs name the same object. */
export const sameRef = (a: MapObjectRef | null, b: MapObjectRef | null): boolean =>
  a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);

/** Planes the camera can snap to (S2-12). */
export type SnapPlane = 'ecliptic' | 'selected-orbit';

/**
 * A look at the future (S5-9 in planning/sprint-5.md): the map is drawn at `t`. A transient
 * preview follows a drag of the timeline and ends on release; a sticky one stays until Esc,
 * Now, or the clock catching up.
 */
export interface Preview {
  t: number;
  sticky: boolean;
}

/** Tabs of the left sidebar. */
export type LeftTab = 'system' | 'fleets' | 'stations' | 'routes';

interface ViewState {
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  leftTab: LeftTab;
  /** Drives the inspector and the tree highlight (S2-13). */
  selected: MapObjectRef | null;
  hovered: MapObjectRef | null;
  /** Drives the camera (S2-13). */
  focus: FocusRef;
  /** The ship whose plan can be edited: the last selected ship (S4-9). */
  activeShipId: ShipId | null;
  /** Bumped by every focusOn, so refocusing the same body re-frames it. */
  focusSeq: number;
  /** The latest snap request; the camera rig reacts to a new seq. */
  snapRequest: { plane: SnapPlane; seq: number } | null;
  /** System tab tree state. */
  expanded: Record<BodyId, boolean>;
  /** Whether the Fleets tab shows the spawn form (S3-14). */
  spawnFormOpen: boolean;
  /** The preview, or null when the map shows now (S5-9). */
  preview: Preview | null;
  toggleLeftPanel(): void;
  toggleRightPanel(): void;
  setLeftTab(tab: LeftTab): void;
  select(ref: MapObjectRef | null): void;
  setHovered(ref: MapObjectRef | null): void;
  /** Focuses and selects; a node focuses its ship and selects the node. */
  focusOn(ref: MapObjectRef): void;
  setActiveShip(id: ShipId | null): void;
  snapTo(plane: SnapPlane): void;
  toggleExpanded(id: BodyId): void;
  setSpawnFormOpen(open: boolean): void;
  setExpanded(id: BodyId, expanded: boolean): void;
  startPreview(t: number, sticky: boolean): void;
  /** Moves the preview, keeping whether it is sticky; does nothing without one. */
  movePreview(t: number): void;
  endPreview(): void;
  /** Expands every listed body (no change, and no update, if all are expanded). */
  expand(ids: readonly BodyId[]): void;
}

/**
 * View state: panels, selection, hover, focus and snap requests. The camera's animated state
 * is not here: it lives in the camera controller, which reacts to the requests (S2-17).
 */
export const useView = create<ViewState>()((set) => ({
  leftPanelOpen: true,
  rightPanelOpen: true,
  leftTab: 'system',
  selected: null,
  hovered: null,
  focus: { kind: 'body', id: 'earth' },
  activeShipId: null,
  focusSeq: 0,
  snapRequest: null,
  expanded: { sun: true },
  spawnFormOpen: false,
  preview: null,
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setLeftTab: (tab) => set({ leftTab: tab }),
  select: (ref) => set((s) => ({ selected: ref, activeShipId: shipOf(ref) ?? s.activeShipId })),
  setActiveShip: (id) => set({ activeShipId: id }),
  setHovered: (ref) => set({ hovered: ref }),
  focusOn: (ref) =>
    set((s) => ({
      focus: focusRefOf(ref),
      selected: ref,
      activeShipId: shipOf(ref) ?? s.activeShipId,
      focusSeq: s.focusSeq + 1,
    })),
  snapTo: (plane) => set((s) => ({ snapRequest: { plane, seq: (s.snapRequest?.seq ?? 0) + 1 } })),
  setSpawnFormOpen: (open) => set({ spawnFormOpen: open }),
  startPreview: (t, sticky) => set({ preview: { t, sticky } }),
  movePreview: (t) => set((s) => (s.preview ? { preview: { t, sticky: s.preview.sticky } } : s)),
  endPreview: () => set((s) => (s.preview ? { preview: null } : s)),
  toggleExpanded: (id) => set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } })),
  setExpanded: (id, value) => set((s) => ({ expanded: { ...s.expanded, [id]: value } })),
  expand: (ids) =>
    set((s) => {
      if (ids.every((id) => s.expanded[id])) return s;
      const expanded = { ...s.expanded };
      for (const id of ids) expanded[id] = true;
      return { expanded };
    }),
}));
