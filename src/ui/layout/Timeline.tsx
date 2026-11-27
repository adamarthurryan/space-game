import { calendarFromJd, jdFromSimTime } from '../../math/time';
import { WARP_STEPS, warpStep } from '../../sim/clock';
import { useSimTime, useWorld } from '../../store/useWorld';
import { formatDate, formatWarp } from '../format';
import { PauseOnMenu } from './PauseOnMenu';
import styles from './Timeline.module.css';

/** Time controls, the event strip (sprint 5) and the date. */
export function Timeline() {
  // Subscribing to the version re-renders the controls after every clock action.
  useWorld((s) => s.version);
  const world = useWorld((s) => s.world);
  const { togglePause, warpUp, warpDown } = useWorld.getState();
  const clock = world.clock;
  const t = useSimTime();

  const date = formatDate(calendarFromJd(jdFromSimTime(world.system.epochJd, t)));
  const atMin = clock.warpIndex <= 0;
  const atMax = clock.warpIndex >= WARP_STEPS.length - 1;

  return (
    <footer className={styles['timeline']}>
      <div className={styles['controls']} role="group" aria-label="Time controls">
        <button
          type="button"
          className={styles['button']}
          aria-label="Slower"
          disabled={atMin}
          onClick={warpDown}
        >
          ◀◀
        </button>
        <button
          type="button"
          className={styles['button']}
          aria-label={clock.paused ? 'Play' : 'Pause'}
          onClick={togglePause}
        >
          {clock.paused ? '▶' : '⏸'}
        </button>
        <button
          type="button"
          className={styles['button']}
          aria-label="Faster"
          disabled={atMax}
          onClick={warpUp}
        >
          ▶▶
        </button>
      </div>
      <output
        className={`${styles['readout']} ${styles['warp']} ${clock.paused ? styles['paused'] : ''}`}
        aria-label="Warp rate"
      >
        {formatWarp(warpStep(clock))}
      </output>
      <PauseOnMenu />
      <div className={styles['strip']} />
      <output className={styles['readout']} aria-label="Date">
        {date}
      </output>
    </footer>
  );
}
