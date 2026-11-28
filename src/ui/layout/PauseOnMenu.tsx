import { PAUSABLE_EVENTS, type PausableEvent } from '../../sim/clock';
import { useWorld } from '../../store/useWorld';
import { Popover } from './Popover';
import styles from './Timeline.module.css';

const LABELS: Record<PausableEvent, string> = {
  node: 'Node execution',
  'soi-change': 'SOI change',
  impact: 'Impact',
};

/** "Pause on ▾" (S4-7): which events pause the clock, one by one or all together. */
export function PauseOnMenu() {
  useWorld((s) => s.version);
  const world = useWorld((s) => s.world);
  const { setPauseOn } = useWorld.getState();
  const pauseOn = world.clock.pauseOn;
  const all = PAUSABLE_EVENTS.every((k) => pauseOn[k]);
  const some = PAUSABLE_EVENTS.some((k) => pauseOn[k]);

  return (
    <Popover
      label="Pause on ▾"
      className={styles['pauseOn']}
      buttonClassName={styles['button']}
      panelClassName={styles['pauseMenu']}
    >
      {() => (
        <fieldset className={styles['pauseFields']} aria-label="Pause on">
          {PAUSABLE_EVENTS.map((k) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={pauseOn[k]}
                onChange={(e) => setPauseOn(k, e.target.checked)}
              />
              {LABELS[k]}
            </label>
          ))}
          <label>
            <input
              type="checkbox"
              checked={all}
              ref={(el) => {
                if (el) el.indeterminate = some && !all;
              }}
              onChange={(e) => setPauseOn('all', e.target.checked)}
            />
            All events
          </label>
        </fieldset>
      )}
    </Popover>
  );
}
