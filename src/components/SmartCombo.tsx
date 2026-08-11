import { useEffect, useMemo, useRef, useState } from 'react';

/** A single option; a plain string is shorthand for `{ value }`. */
export interface SmartComboOption {
  value: string;
  /** Primary label shown in the list (defaults to `value`). */
  label?: string;
  /** Secondary muted text (e.g. country / code for ports). */
  meta?: string;
}

interface SmartComboProps {
  value: string;
  onChange: (v: string) => void;
  options: (string | SmartComboOption)[];
  placeholder?: string;
  disabled?: boolean;
  /** Class applied to the text input so it inherits each module's field styling. */
  inputClassName?: string;
  maxResults?: number;
}

/**
 * App-wide themed autocomplete: a free-text input that filters a saved option
 * list (accounts / vessels / ports / cargoes from Settings) as the user types.
 *
 * The dropdown is rendered with fixed positioning computed from the input's
 * bounding box, so it is never clipped by scrollable tables or overflow
 * containers. The field stays plain text, so manual entry and pasted values
 * keep working.
 */
export function SmartCombo({
  value,
  onChange,
  options,
  placeholder = 'Select or type…',
  disabled,
  inputClassName = 'fv-voyage__input',
  maxResults = 50,
}: SmartComboProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  const norm = useMemo<SmartComboOption[]>(
    () => options.map((o) => (typeof o === 'string' ? { value: o } : o)),
    [options],
  );
  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q
      ? norm.filter((o) => `${o.value} ${o.label ?? ''} ${o.meta ?? ''}`.toLowerCase().includes(q))
      : norm;
    return list.slice(0, maxResults);
  }, [value, norm, maxResults]);

  const place = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom + 2, width: Math.max(r.width, 180) });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <span className="fv-smartcombo" ref={wrapRef} style={{ display: 'contents' }}>
      <input
        ref={inputRef}
        className={inputClassName}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); place(); }}
        onFocus={() => { setOpen(true); place(); }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && matches[active]) { e.preventDefault(); choose(matches[active].value); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && !disabled && matches.length > 0 && rect && (
        <ul
          className="fv-port-combo__list"
          style={{ position: 'fixed', left: rect.left, top: rect.top, width: rect.width, right: 'auto' }}
        >
          {matches.map((o, i) => (
            <li
              key={`${o.value}-${i}`}
              className={`fv-port-combo__item${i === active ? ' fv-port-combo__item--active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); choose(o.value); }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="fv-port-combo__name">{o.label ?? o.value}</span>
              {o.meta && <span className="fv-port-combo__meta">{o.meta}</span>}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
