import styles from './Timeline.module.css';

const CONTROLS = [
  { glyph: '◀◀', label: 'Slower' },
  { glyph: '⏸', label: 'Pause' },
  { glyph: '▶', label: 'Play' },
  { glyph: '▶▶', label: 'Faster' },
];

/** Time controls, the event strip and the date. A placeholder until the clock (sprint 3). */
export function Timeline() {
  return (
    <footer className={styles['timeline']}>
      <div className={styles['controls']} role="group" aria-label="Time controls">
        {CONTROLS.map((c) => (
          <button
            key={c.label}
            type="button"
            className={styles['button']}
            aria-label={c.label}
            disabled
          >
            {c.glyph}
          </button>
        ))}
      </div>
      <output className={`${styles['readout']} ${styles['warp']}`} aria-label="Warp rate">
        ×1
      </output>
      <div className={styles['strip']} />
      <output className={styles['readout']} aria-label="Date">
        —
      </output>
    </footer>
  );
}
