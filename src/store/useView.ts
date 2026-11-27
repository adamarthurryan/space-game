import { create } from 'zustand';

import type { BodyId } from '../sim/body';

/** Something on the map that can be selected, hovered or focused. Sprint 3 adds ships. */
export type MapObjectRef = { kind: 'body'; id: BodyId };

/** Tabs of the left sidebar. */
export type LeftTab = 'system' | 'fleets' | 'stations' | 'routes';

interface ViewState {
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  leftTab: LeftTab;
  toggleLeftPanel(): void;
  toggleRightPanel(): void;
  setLeftTab(tab: LeftTab): void;
}

/** View state: panel visibility and the left tab. Sprint 2 adds selection, camera and focus. */
export const useView = create<ViewState>()((set) => ({
  leftPanelOpen: true,
  rightPanelOpen: true,
  leftTab: 'system',
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setLeftTab: (tab) => set({ leftTab: tab }),
}));
