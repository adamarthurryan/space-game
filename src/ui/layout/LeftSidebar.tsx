import { useRef, type KeyboardEvent } from 'react';
import { useView, type LeftTab } from '../../store/useView';
import { FleetList } from '../panels/FleetList';
import { SystemTree } from '../panels/SystemTree';
import styles from './LeftSidebar.module.css';

const TABS: { id: LeftTab; label: string; empty: string }[] = [
  { id: 'system', label: 'System', empty: '' },
  { id: 'fleets', label: 'Fleets', empty: 'No ships yet.' },
  { id: 'stations', label: 'Stations', empty: 'No stations yet.' },
  { id: 'routes', label: 'Routes', empty: 'No routes yet.' },
];

/** Tabs for the System, Fleets, Stations and Routes lists, and the map filters. */
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
        {active.id === 'system' ? (
          <SystemTree />
        ) : active.id === 'fleets' ? (
          <FleetList />
        ) : (
          <p className={styles['empty']}>{active.empty}</p>
        )}
      </div>
      <details className={styles['filters']}>
        <summary>Filters</summary>
        <p className={styles['empty']}>No filters yet.</p>
      </details>
    </nav>
  );
}
