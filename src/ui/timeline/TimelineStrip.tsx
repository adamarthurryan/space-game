import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { shipColor } from '../../render/shipStyle';
import { upcomingEvents, type UpcomingEvent } from '../../sim/upcoming';
import { resolveActiveShip, useView } from '../../store/useView';
import { useSimTime, useWorld } from '../../store/useWorld';
import { eventTooltip } from './eventText';
import { dtOf, stripScale, stripTicks, xOf, type StripScale } from './scale';
import { stripGlyphs } from './stripLayout';
import styles from './TimelineStrip.module.css';

/** Used when the strip can't be measured (jsdom). */
const FALLBACK_WIDTH = 600;
/** A press this close to a sticky preview's playhead drags it, keeping it sticky (S5-9). */
const PLAYHEAD_GRAB_PX = 8;

/** The strip's width, kept up to date with a ResizeObserver. */
function useWidth(el: HTMLElement | null): number {
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useEffect(() => {
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || FALLBACK_WIDTH);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return width;
}

/**
 * The timeline strip (decisions S5-6 to S5-9 in planning/sprint-5.md): the active ship's upcoming
 * events on a logarithmic axis from now, with hover details. Pressing on the strip previews the
 * time under the pointer until release; clicking an event keeps the preview there until Esc or
 * Now. The axis spans a fixed 10 years, so its ticks never move, and the time past the active
 * ship's prediction is shaded (S5b-23, S5b-24 in planning/sprint-5b.md).
 */
export function TimelineStrip() {
  useWorld((s) => s.version);
  const world = useWorld((s) => s.world);
  const now = useSimTime();
  const activeShipId = useView((s) => s.activeShipId);
  const selected = useView((s) => s.selected);
  const preview = useView((s) => s.preview);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const width = useWidth(el);
  const [hover, setHover] = useState<{ key: string; event: UpcomingEvent; x: number } | null>(null);
  const drag = useRef<{ pointerId: number; sticky: boolean } | null>(null);

  const shipId = resolveActiveShip(world, activeShipId);
  const upcoming = shipId ? upcomingEvents(world, shipId) : { events: [], horizon: null };
  const scale: StripScale = stripScale(width);
  const selectedNodeId = selected?.kind === 'node' ? selected.id : null;
  const colorOf = (id: string) => shipColor(world.ships[id]?.seq ?? 0);
  const { glyphs, overflow } = stripGlyphs(upcoming.events, scale, now, colorOf, selectedNodeId);
  const ticks = stripTicks(scale);
  const horizonDt = upcoming.horizon === null ? null : upcoming.horizon - now;

  /** The sim time under a pointer, from the clock's current t. */
  const timeAt = (e: ReactPointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    const clockT = useWorld.getState().world.clock.t;
    return clockT + dtOf({ span: scale.span, width }, e.clientX - r.left);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const view = useView.getState();
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const p = view.preview;
    const clockT = useWorld.getState().world.clock.t;
    const grab = p?.sticky && Math.abs(xOf(scale, p.t - clockT) - x) <= PLAYHEAD_GRAB_PX;
    drag.current = { pointerId: e.pointerId, sticky: !!grab };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (grab) view.movePreview(timeAt(e));
    else view.startPreview(timeAt(e), false);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== e.pointerId) return;
    useView.getState().movePreview(timeAt(e));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d?.pointerId !== e.pointerId) return;
    drag.current = null;
    // A transient preview ends on release (S5-9, S5-13).
    if (!d.sticky) useView.getState().endPreview();
  };

  return (
    <div
      ref={setEl}
      className={styles['strip']}
      role="group"
      aria-label="Timeline strip"
      data-span={scale.span}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {ticks.map((t) => (
        <span key={t.label} className={styles['tick']} style={{ left: t.x }} data-tick={t.label}>
          <span className={styles['tickLabel']}>{t.label}</span>
        </span>
      ))}
      <span className={styles['now']} aria-hidden="true" />
      {horizonDt !== null && horizonDt <= scale.span && (
        <>
          <span
            className={styles['beyond']}
            style={{ left: xOf(scale, horizonDt) }}
            data-testid="beyond-prediction"
            aria-hidden="true"
          />
          <span
            className={styles['horizon']}
            style={{ left: xOf(scale, horizonDt) }}
            title="End of prediction"
          />
        </>
      )}
      {glyphs.map((g) => {
        const label = eventTooltip(world.system, g.event, now);
        return (
          <button
            key={g.key}
            type="button"
            className={`${styles['glyph']} ${g.selected ? styles['selected'] : ''} ${
              g.event.enabled ? '' : styles['disabled']
            }`}
            style={{ left: g.x, color: g.color }}
            data-row={g.row}
            data-strip-glyph={g.event.kind}
            data-t={g.event.t}
            data-ship={g.event.shipId}
            aria-label={label}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerEnter={() => setHover({ key: g.key, event: g.event, x: g.x })}
            onPointerLeave={() => setHover((h) => (h?.key === g.key ? null : h))}
            onClick={() => useView.getState().startPreview(g.event.t, true)}
          >
            {g.glyph}
          </button>
        );
      })}
      {overflow.map((o) => (
        <span key={o.x} className={styles['overflow']} style={{ left: o.x }}>
          +{o.count}
        </span>
      ))}
      {preview && (
        <span
          className={styles['playhead']}
          style={{ left: xOf(scale, preview.t - now) }}
          data-sticky={preview.sticky}
          aria-hidden="true"
        />
      )}
      {hover && (
        <span
          role="tooltip"
          className={styles['tooltip']}
          style={{ left: Math.min(hover.x, Math.max(width - 260, 0)) }}
        >
          {eventTooltip(world.system, hover.event, now)}
        </span>
      )}
    </div>
  );
}
