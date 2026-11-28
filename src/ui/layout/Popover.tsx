import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import styles from './Popover.module.css';

export interface PopoverProps {
  /** The button's content, e.g. "Pause on ▾". */
  label: ReactNode;
  /** The button's accessible name, when its content isn't enough. */
  ariaLabel?: string | undefined;
  title?: string | undefined;
  disabled?: boolean | undefined;
  /** Classes for the wrapper, the button and the panel. */
  className?: string | undefined;
  buttonClassName?: string | undefined;
  panelClassName?: string | undefined;
  /** Called whenever the panel closes, however it closed. */
  onClose?: (() => void) | undefined;
  /** The panel's content; `close` closes it (call it after a menu item is chosen). */
  children: (close: () => void) => ReactNode;
}

type Side = { v: 'below' | 'above'; h: 'start' | 'end' };

/**
 * A button and the panel it opens (S5b-21 in planning/sprint-5b.md), shared by Pause on ▾,
 * Add node ▾ and Frame ▾. The panel closes on a press outside it, on Esc (which is consumed,
 * so it doesn't also end a preview or clear the selection), and when its content calls
 * `close`. It opens on whichever side of the button has more room.
 */
export function Popover(props: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<Side>({ v: 'below', h: 'start' });
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const { onClose } = props;
  const close = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close();
    };
    // Capture on the window: this runs before every other key listener.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, close]);

  useLayoutEffect(() => {
    if (!open || !root.current || !panel.current) return;
    const b = root.current.getBoundingClientRect();
    const p = panel.current.getBoundingClientRect();
    const below = window.innerHeight - b.bottom;
    const above = b.top;
    const right = window.innerWidth - b.left;
    setSide({
      v: below >= p.height || below >= above ? 'below' : 'above',
      h: right >= p.width || right >= b.right ? 'start' : 'end',
    });
  }, [open]);

  return (
    <div ref={root} className={`${styles['popover']} ${props.className ?? ''}`}>
      <button
        type="button"
        className={props.buttonClassName}
        aria-label={props.ariaLabel}
        title={props.title}
        disabled={props.disabled}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => (open ? close() : setOpen(true))}
      >
        {props.label}
      </button>
      {open && (
        <div
          ref={panel}
          className={`${styles['panel']} ${props.panelClassName ?? ''}`}
          data-side={side.v}
          data-align={side.h}
        >
          {props.children(close)}
        </div>
      )}
    </div>
  );
}
