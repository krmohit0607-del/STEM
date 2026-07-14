import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import {
  fromDateInput,
  fromDateTimeInput,
  toDateInput,
  toDateTimeInput,
} from '../../data/dateFields';

/** Shared presentational primitives used by the voyage section components. */

interface CardProps {
  number?: number;
  title: string;
  editing?: boolean;
  onToggleEdit?: () => void;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
  /** Anchor id so the card can be linked to (and auto-expanded) via URL hash. */
  id?: string;
  /** Extra hash ids (e.g. nested anchors) that should also expand this card. */
  extraIds?: string[];
  /** Controlled collapsed state. When provided, the card no longer manages its own. */
  collapsed?: boolean;
  /** Toggle handler for the controlled collapsed state. */
  onToggleCollapse?: () => void;
}

export function Card({
  number,
  title,
  editing,
  onToggleEdit,
  defaultCollapsed = true,
  children,
  id,
  extraIds,
  collapsed,
  onToggleCollapse,
}: CardProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const controlled = collapsed !== undefined;
  const isCollapsed = controlled ? collapsed : internalCollapsed;
  const location = useLocation();
  const hashId = location.hash.replace('#', '');
  const matches = !!hashId && (hashId === id || !!extraIds?.includes(hashId));

  useEffect(() => {
    if (controlled) return;
    if (!matches) return;
    setInternalCollapsed(false);
    // Wait for the body to render after expanding, then scroll to the anchor.
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(hashId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(raf);
  }, [matches, hashId, controlled]);

  const toggle = () => {
    if (controlled) onToggleCollapse?.();
    else setInternalCollapsed((c) => !c);
  };

  return (
    <section
      id={id}
      className={`fv-voyage__card${isCollapsed ? ' fv-voyage__card--collapsed' : ''}`}
    >
      <header className="fv-voyage__card-head">
        <h2 className="fv-voyage__card-title">
          {number != null && <span className="fv-voyage__card-num">{number}.</span>}
          {title}
        </h2>
        <div className="fv-voyage__card-actions">
          {onToggleEdit && (
            <button
              type="button"
              className={`fv-voyage__edit-btn${editing ? ' fv-voyage__edit-btn--active' : ''}`}
              onClick={onToggleEdit}
            >
              <i className={`fas ${editing ? 'fa-check' : 'fa-pen'}`} aria-hidden="true" />{' '}
              {editing ? 'Done' : 'Edit'}
            </button>
          )}
          {!controlled && (
            <button
              type="button"
              className="fv-voyage__collapse-btn"
              onClick={toggle}
              aria-expanded={!isCollapsed}
              title={isCollapsed ? 'Expand' : 'Minimize'}
            >
              <i
                className={`fas ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`}
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      </header>
      {!isCollapsed && <div className="fv-voyage__card-body">{children}</div>}
    </section>
  );
}

interface InfoProps {
  label: string;
  value: React.ReactNode;
}

export function Info({ label, value }: InfoProps) {
  return (
    <div className="fv-voyage__info">
      <span className="fv-voyage__info-label">{label}</span>
      <span className="fv-voyage__info-value">{value || '—'}</span>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
  inline?: boolean;
  display?: React.ReactNode;
  /** When provided, the field renders as a dropdown while editing. */
  options?: string[];
  /** When set, the field renders a native date / datetime / numeric input. */
  type?: 'date' | 'datetime' | 'number';
}

export function Field({ label, value, editing, onChange, inline, display, options, type }: FieldProps) {
  return (
    <div className={`fv-voyage__info${inline ? ' fv-voyage__info--inline' : ''}`}>
      <span className="fv-voyage__info-label">{label}</span>
      {editing ? (
        options ? (
          <select
            className="fv-voyage__input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">—</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : type === 'number' ? (
          <input
            className="fv-voyage__input"
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : type ? (
          <input
            className="fv-voyage__input"
            type={type === 'date' ? 'date' : 'datetime-local'}
            value={type === 'date' ? toDateInput(value) : toDateTimeInput(value)}
            onChange={(e) =>
              onChange(
                type === 'date'
                  ? fromDateInput(e.target.value)
                  : fromDateTimeInput(e.target.value),
              )
            }
          />
        ) : (
          <input
            className="fv-voyage__input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      ) : (
        <span className="fv-voyage__info-value">{display ?? (value || '—')}</span>
      )}
    </div>
  );
}

interface BoolFieldProps {
  label: string;
  value: boolean;
  editing: boolean;
  onChange: (value: boolean) => void;
}

export function BoolField({ label, value, editing, onChange }: BoolFieldProps) {
  return (
    <div className="fv-voyage__info">
      <span className="fv-voyage__info-label">{label}</span>
      {editing ? (
        <select
          className="fv-voyage__input"
          value={value ? 'Yes' : 'No'}
          onChange={(e) => onChange(e.target.value === 'Yes')}
        >
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      ) : (
        <YesNo on={value} />
      )}
    </div>
  );
}

interface CellProps {
  editing: boolean;
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  /** When set, the cell renders a native date / datetime / numeric input. */
  type?: 'date' | 'datetime' | 'number';
}

export function Cell({ editing, value, onChange, options, type }: CellProps) {
  if (!editing) return <>{value || '—'}</>;
  if (options) {
    return (
      <select
        className="fv-voyage__cell-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  if (type === 'number') {
    return (
      <input
        className="fv-voyage__cell-input"
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (type) {
    return (
      <input
        className="fv-voyage__cell-input"
        type={type === 'date' ? 'date' : 'datetime-local'}
        value={type === 'date' ? toDateInput(value) : toDateTimeInput(value)}
        onChange={(e) =>
          onChange(
            type === 'date'
              ? fromDateInput(e.target.value)
              : fromDateTimeInput(e.target.value),
          )
        }
      />
    );
  }
  return (
    <input
      className="fv-voyage__cell-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function YesNo({ on }: { on: boolean }) {
  return (
    <span className={`fv-voyage__pill ${on ? 'fv-voyage__pill--on' : 'fv-voyage__pill--off'}`}>
      <i className={`fas ${on ? 'fa-check' : 'fa-xmark'}`} aria-hidden="true" />
      {on ? 'Yes' : 'No'}
    </span>
  );
}

export function Badge({
  tone,
  children,
}: {
  tone: 'active' | 'planned' | 'ok';
  children: React.ReactNode;
}) {
  return <span className={`fv-voyage__badge fv-voyage__badge--${tone}`}>{children}</span>;
}
