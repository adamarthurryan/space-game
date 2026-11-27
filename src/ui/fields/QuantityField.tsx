import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { nudgeStep, type Nudge } from './nudge';
import styles from './QuantityField.module.css';

export interface QuantityFieldProps {
  label: string;
  value: number;
  format: (v: number) => string;
  parse: (text: string) => number | null;
  /** Commits a value; returns an error to show, or null. */
  onCommit: (v: number) => string | null;
  nudge?: Nudge;
  /** Shown when the typed text can't be read. */
  invalidText?: string;
  disabled?: boolean;
}

/**
 * A typed value with units (S4-15): shows the formatted value; typing and Enter (or leaving the
 * field) commits, Escape reverts. Over a focused field, the wheel nudges by one step. An error
 * from the parse or the commit is shown under the field, and the old value is kept.
 */
export function QuantityField(p: QuantityFieldProps) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const shown = text ?? p.format(p.value);

  const commit = (raw: string) => {
    const v = p.parse(raw);
    if (v === null) {
      setError(p.invalidText ?? `Can't read “${raw}”`);
      return false;
    }
    const e = p.onCommit(v);
    setError(e);
    if (!e) setText(null);
    return !e;
  };

  // The wheel listener must be non-passive to stop the panel from scrolling.
  const latest = useRef(p);
  useLayoutEffect(() => {
    latest.current = p;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const q = latest.current;
      if (!q.nudge || q.disabled || document.activeElement !== el) return;
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      const err = q.onCommit(q.value + dir * nudgeStep(q.nudge, e));
      setError(err);
      setText(null);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (text !== null) commit(text);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setText(null);
      setError(null);
    }
  };

  return (
    <div className={styles['field']}>
      <label>
        <span className={styles['label']}>{p.label}</span>
        <input
          ref={ref}
          className={styles['input']}
          value={shown}
          disabled={p.disabled}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (text !== null && !commit(text)) setText(null);
          }}
        />
      </label>
      {error && (
        <p className={styles['error']} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
