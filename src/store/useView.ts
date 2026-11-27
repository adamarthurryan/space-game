import { create } from 'zustand';
import type { BodyId } from '../sim/body';

/** Something on the map that can be selected, hovered or focused. Sprint 3 adds ships. */
export type MapObjectRef = { kind: 'body'; id: BodyId };

/** Planes the camera can snap to (S2-12). */
export type SnapPlane = 'ecliptic' | 'selected-orbit';

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
  focus: MapObjectRef;
  /** Bumped by every focusOn, so refocusing the same body re-frames it. */
  focusSeq: number;
  /** The latest snap request; the camera rig reacts to a new seq. */
  snapRequest: { plane: SnapPlane; seq: number } | null;
  /** System tab tree state. */
  expanded: Record<BodyId, boolean>;
  toggleLeftPanel(): void;
  toggleRightPanel(): void;
  setLeftTab(tab: LeftTab): void;
  select(ref: MapObjectRef | null): void;
  setHovered(ref: MapObjectRef | null): void;
  /** Focuses and selects. */
  focusOn(ref: MapObjectRef): void;
  snapTo(plane: SnapPlane): void;
  toggleExpanded(id: BodyId): void;
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
  focusSeq: 0,
  snapRequest: null,
  expanded: { sun: true },
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setLeftTab: (tab) => set({ leftTab: tab }),
  select: (ref) => set({ selected: ref }),
  setHovered: (ref) => set({ hovered: ref }),
  focusOn: (ref) => set((s) => ({ focus: ref, selected: ref, focusSeq: s.focusSeq + 1 })),
  snapTo: (plane) => set((s) => ({ snapRequest: { plane, seq: (s.snapRequest?.seq ?? 0) + 1 } })),
  toggleExpanded: (id) => set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } })),
}));
