import { useView } from '../../store/useView';
import styles from './TopBar.module.css';

/**
 * Title, menu, panel toggles, and warning and alarm counts. The phase, reserves and stockpile
 * summary from the interface.md mock-up arrive in milestone 3 and later.
 */
export function TopBar() {
  const leftPanelOpen = useView((s) => s.leftPanelOpen);
  const rightPanelOpen = useView((s) => s.rightPanelOpen);
  const toggleLeftPanel = useView((s) => s.toggleLeftPanel);
  const toggleRightPanel = useView((s) => s.toggleRightPanel);

  return (
    <header className={styles['bar']}>
      <button type="button" className={styles['button']} aria-label="Menu" disabled>
        ≡
      </button>
      <h1 className={styles['title']}>Sandbox</h1>
      <div className={styles['spacer']} />
      <div className={styles['counts']}>
        <span title="Warnings">
          <span aria-hidden="true">⚠ </span>0<span className={styles['srOnly']}> warnings</span>
        </span>
        <span title="Alarms">
          <span aria-hidden="true">⏰ </span>0<span className={styles['srOnly']}> alarms</span>
        </span>
      </div>
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
