import styles from './Inspector.module.css';

/** Details of the current selection. Selection arrives in sprint 2. */
export function Inspector() {
  return (
    <aside className={styles['inspector']} aria-label="Inspector" id="inspector">
      <h2 className={styles['heading']}>Inspector</h2>
      <p className={styles['empty']}>Nothing selected</p>
    </aside>
  );
}
