import { useView } from '../../store/useView';
import styles from './TopBar.module.css';

/**
 * The title and the panel toggles. The menu (saves, sprint 10), the warning and alarm counts
 * (sprint 6 and later), and the phase, reserves and stockpile summary from the interface.md
 * mock-up are hidden until they are built (S5b-22 in planning/sprint-5b.md).
 */
export function TopBar() {
  const leftPanelOpen = useView((s) => s.leftPanelOpen);
  const rightPanelOpen = useView((s) => s.rightPanelOpen);
  const toggleLeftPanel = useView((s) => s.toggleLeftPanel);
  const toggleRightPanel = useView((s) => s.toggleRightPanel);

  return (
    <header className={styles['bar']}>
      <h1 className={styles['title']}>Sandbox</h1>
      <div className={styles['spacer']} />
      <button
        type="button"
        className={styles['button']}
        aria-label="Sidebar"
        aria-pressed={leftPanelOpen}
        title="Toggle sidebar"
        onClick={toggleLeftPanel}
      >
        ◧
      </button>
      <button
        type="button"
        className={styles['button']}
        aria-label="Inspector"
        aria-pressed={rightPanelOpen}
        title="Toggle inspector"
        onClick={toggleRightPanel}
      >
        ◨
      </button>
    </header>
  );
}
