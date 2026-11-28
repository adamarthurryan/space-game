import { create } from 'zustand';
import type { BodyId } from '../sim/body';
import type { NodeId } from '../sim/maneuver';
import type { ShipId } from '../sim/ship';
import { shipBodyAt } from '../sim/world';
import { useWorld } from './useWorld';

/** Something the camera can focus (S3-15): a body or a ship. */
export type FocusRef = { kind: 'body'; id: BodyId } | { kind: 'ship'; id: ShipId };
/** Something on the map that can be selected or hovered: also a ship's node (S4-10). */
export type MapObjectRef = FocusRef | { kind: 'node'; shipId: ShipId; id: NodeId };

/** The object a ref focuses: a node focuses its ship (S4-10). */
export const focusRefOf = (ref: MapObjectRef): FocusRef =>
  ref.kind === 'node' ? { kind: 'ship', id: ref.shipId } : ref;

/** The ship a ref names: a ship, or a node's ship. */
export const shipOf = (ref: MapObjectRef | null): ShipId | null =>
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

/**
 * The reference frame (S5b-1 to S5b-3 in planning/sprint-5b.md): the body ship trajectories are
 * drawn relative to. A fixed body, or the active ship's parent, followed as it changes SOI.
 */
export type FrameRef = { kind: 'body'; id: BodyId } | { kind: 'ship-parent'; shipId: ShipId };

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

/** How long a flash lasts, wall ms (S5b-11). */
export const FLASH_MS = 2000;

/** An object that flashes on the map until `until` (performance.now() ms, S5b-11). */
export interface Flash {
  ref: MapObjectRef;
  until: number;
}

/** Tabs of the left sidebar. */
export type LeftTab = 'system' | 'fleets';

interface ViewState {
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  leftTab: LeftTab;
  /** Drives the inspector and the tree highlight (S2-13). */
  selected: MapObjectRef | null;
  hovered: MapObjectRef | null;
  /** The camera's centre (S2-13, S5b-5). */
  focus: FocusRef;
  /** The body trajectories are drawn relative to (S5b-1); set by focusing and activating (decision 183). */
  frame: FrameRef;
  /** The ship flown: map editing, the strip, warp-to. Set only by `activate` (S5b-6). */
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
  /** The object flashing on the map, e.g. a ship just spawned (S5b-11). */
  flash: Flash | null;
  toggleLeftPanel(): void;
  toggleRightPanel(): void;
  setLeftTab(tab: LeftTab): void;
  /** Selects. It never changes the focus, the frame or the active ship (decision 183). */
  select(ref: MapObjectRef | null): void;
  setHovered(ref: MapObjectRef | null): void;
  /** Focuses and selects, and sets the frame (decision 183); a node focuses its ship. */
  focusOn(ref: MapObjectRef): void;
  /** Makes a coasting ship active, and the frame follows it (S5b-3, S5b-6). */
  activate(id: ShipId): void;
  /** A fixed body frame (Frame ▾, S5b-4): stops following. */
  setFrame(id: BodyId): void;
  /** Flashes an object for FLASH_MS of wall time (S5b-11). */
  flashObject(ref: MapObjectRef): void;
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

/** The time the view is drawn at: the preview time, or now. */
function viewTimeOf(preview: Preview | null): number {
  return preview?.t ?? useWorld.getState().world.clock.t;
}

/**
 * The frame a focus sets (decision 183, revising S5b-2): a body is itself; the active ship (or
 * its node) is followed; any other ship (or its node) gives its parent at the view time, as a
 * fixed body.
 */
function frameForFocus(
  ref: MapObjectRef,
  activeShipId: ShipId | null,
  preview: Preview | null,
): FrameRef {
  if (ref.kind === 'body') return { kind: 'body', id: ref.id };
  const shipId = ref.kind === 'ship' ? ref.id : ref.shipId;
  if (shipId === activeShipId) return { kind: 'ship-parent', shipId };
  return { kind: 'body', id: shipBodyAt(useWorld.getState().world, shipId, viewTimeOf(preview)) };
}

/**
 * View state: panels, selection, hover, focus, frame, the active ship and snap requests. The camera's animated state
 * is not here: it lives in the camera controller, which reacts to the requests (S2-17).
 */
export const useView = create<ViewState>()((set) => ({
  leftPanelOpen: true,
  rightPanelOpen: true,
  leftTab: 'system',
  selected: null,
  hovered: null,
  focus: { kind: 'body', id: 'earth' },
  frame: { kind: 'body', id: 'earth' },
  activeShipId: null,
  focusSeq: 0,
  snapRequest: null,
  expanded: { sun: true },
  spawnFormOpen: false,
  preview: null,
  flash: null,
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setLeftTab: (tab) => set({ leftTab: tab }),
  select: (ref) => set({ selected: ref }),
  activate: (id) =>
    set((s) =>
      useWorld.getState().world.ships[id]?.status === 'coasting'
        ? { activeShipId: id, frame: { kind: 'ship-parent', shipId: id } }
        : s,
    ),
  setFrame: (id) => set({ frame: { kind: 'body', id } }),
  flashObject: (ref) => set({ flash: { ref, until: performance.now() + FLASH_MS } }),
  setHovered: (ref) => set({ hovered: ref }),
  focusOn: (ref) =>
    set((s) => ({
      focus: focusRefOf(ref),
      selected: ref,
      frame: frameForFocus(ref, s.activeShipId, s.preview),
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
