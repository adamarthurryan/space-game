import { useRef, type KeyboardEvent } from 'react';
import { useView, type LeftTab } from '../../store/useView';
import { FleetList } from '../panels/FleetList';
import { SystemTree } from '../panels/SystemTree';
import styles from './LeftSidebar.module.css';

const TABS: { id: LeftTab; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'fleets', label: 'Fleets' },
];

/**
 * Tabs for the System and Fleets lists. The Stations and Routes tabs and the Filters panel are
 * hidden until they are built (S5b-22 in planning/sprint-5b.md).
 */
export function LeftSidebar() {
  const leftTab = useView((s) => s.leftTab);
  const setLeftTab = useView((s) => s.setLeftTab);
  const tabRefs = useRef(new Map<LeftTab, HTMLButtonElement>());
  const active = TABS.find((t) => t.id === leftTab) ?? TABS[0]!;

  // Arrow keys move between tabs (the ARIA tabs pattern, with automatic activation).
  function onKeyDown(e: KeyboardEvent) {
    const i = TABS.findIndex((t) => t.id === leftTab);
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const nextTab = TABS[(i + step + TABS.length) % TABS.length]!;
    setLeftTab(nextTab.id);
    tabRefs.current.get(nextTab.id)?.focus();
  }

  return (
    <nav className={styles['sidebar']} aria-label="Sidebar" id="left-sidebar">
      <div className={styles['tabs']} role="tablist" aria-label="Lists" onKeyDown={onKeyDown}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) tabRefs.current.set(tab.id, el);
              else tabRefs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            id={`left-tab-${tab.id}`}
            aria-selected={tab.id === leftTab}
            aria-controls="left-tabpanel"
            tabIndex={tab.id === leftTab ? 0 : -1}
            className={styles['tab']}
            onClick={() => setLeftTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className={styles['panel']}
        role="tabpanel"
        id="left-tabpanel"
        aria-labelledby={`left-tab-${active.id}`}
      >
        {active.id === 'system' ? <SystemTree /> : <FleetList />}
      </div>
    </nav>
  );
}
