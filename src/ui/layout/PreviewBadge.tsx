import { calendarFromJd, jdFromSimTime } from '../../math/time';
import { useView } from '../../store/useView';
import { useSimTime, useWorld } from '../../store/useWorld';
import { formatCountdown, formatDate } from '../format';
import styles from './PreviewBadge.module.css';

/**
 * The preview's look (decision S5-12 in planning/sprint-5.md): an amber border around the map and
 * a badge with the preview's date, its time from now, and a Now (Esc) button.
 */
export function PreviewBadge() {
  const preview = useView((s) => s.preview);
  const world = useWorld((s) => s.world);
  const now = useSimTime();
  if (!preview) return null;
  const date = formatDate(calendarFromJd(jdFromSimTime(world.system.epochJd, preview.t)));
  return (
    <>
      <div className={styles['border']} aria-hidden="true" />
      <div className={styles['badge']} role="status" aria-label="Preview">
        <strong>PREVIEW</strong>
        <span>{date}</span>
        <span>T+{formatCountdown(preview.t - now)}</span>
        <button
          type="button"
          className={styles['now']}
          onClick={() => useView.getState().endPreview()}
        >
          Now (Esc)
        </button>
      </div>
    </>
  );
}
