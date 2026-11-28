import { resolveFrameBody } from '../../render/mapFrame';
import { viewTime } from '../../render/previewTime';
import { mapSelection, useView } from '../../store/useView';
import { useSimTime, useWorld } from '../../store/useWorld';
import { Popover } from '../layout/Popover';
import { frameOptions } from './frameOptions';
import styles from './MapToolbar.module.css';

/**
 * Frame ▾ (S5b-4 in planning/sprint-5b.md): the body trajectories are drawn relative to. It lists
 * the focus body and its parents, and the selected body; choosing one sets a fixed frame. A frame
 * that follows the active ship reads "Frame: Moon (Kestrel)".
 */
export function FrameMenu() {
  const world = useWorld((s) => s.world);
  useWorld((s) => s.version);
  const now = useSimTime();
  const frame = useView((s) => s.frame);
  const focus = useView((s) => s.focus);
  const selected = useView((s) => s.selected);
  const preview = useView((s) => s.preview);
  const { setFrame } = useView.getState();
  const t = viewTime(now, preview);
  const bodyName = (id: string) => world.system.bodies[id]?.name ?? id;
  const current = resolveFrameBody(world, frame, t);
  const following = frame.kind === 'ship-parent' ? world.ships[frame.shipId] : undefined;
  const label = following ? `${bodyName(current)} (${following.name})` : bodyName(current);

  return (
    <Popover
      label={`Frame: ${label} ▾`}
      title="The body trajectories are drawn relative to"
      buttonClassName={styles['button']}
    >
      {(close) => (
        <div role="menu" aria-label="Frame" className={styles['menu']}>
          {frameOptions(world, focus, mapSelection(selected), t).map((id) => (
            <button
              key={id}
              type="button"
              role="menuitemradio"
              aria-checked={frame.kind === 'body' && frame.id === id}
              className={styles['menuItem']}
              onClick={() => {
                setFrame(id);
                close();
              }}
            >
              {bodyName(id)}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
