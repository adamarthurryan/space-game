import { BodyInspector } from '../panels/BodyInspector';
import styles from './Inspector.module.css';

/** Details of the current selection. */
export function Inspector() {
  return (
    <aside className={styles['inspector']} aria-label="Inspector" id="inspector">
      <h2 className={styles['heading']}>Inspector</h2>
      <BodyInspector />
    </aside>
  );
}
