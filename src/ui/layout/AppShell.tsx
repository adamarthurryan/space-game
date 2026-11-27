import { useView } from '../../store/useView';
import styles from './AppShell.module.css';
import { Inspector } from './Inspector';
import { LeftSidebar } from './LeftSidebar';
import { MapView } from './MapView';
import { Timeline } from './Timeline';
import { TopBar } from './TopBar';

/**
 * The screen layout of docs/interface.md: top bar, left sidebar, map, inspector and timeline.
 * A closed side panel is not rendered, and its grid column shrinks to 0 so the map takes the space.
 */
export function AppShell() {
  const leftPanelOpen = useView((s) => s.leftPanelOpen);
  const rightPanelOpen = useView((s) => s.rightPanelOpen);

  return (
    <div
      className={styles['shell']}
      data-left={leftPanelOpen ? 'open' : 'closed'}
      data-right={rightPanelOpen ? 'open' : 'closed'}
    >
      <TopBar />
      {leftPanelOpen && <LeftSidebar />}
      <MapView />
      {rightPanelOpen && <Inspector />}
      <Timeline />
    </div>
  );
}
