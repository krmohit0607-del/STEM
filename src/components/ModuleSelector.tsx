import { useEffect, useMemo, useRef, useState } from 'react';

import { useL } from '../i18n/LocalizationProvider';

/**
 * Module selector — a small dropdown that lets the user pick which product
 * module to work in (Chartering, Operations, Postfix, Routing, Accounts).
 *
 * It is rendered next to the "STEM" brand in the application headers. Only
 * the "Routing" module is currently wired up; the rest are placeholders and
 * are disabled until they are built out.
 */

interface ModuleItem {
  id: string;
  labelKey: string;
  labelFallback: string;
  icon: string;
  /** Only the active module is currently wired up. */
  active?: boolean;
}

const MODULES: ModuleItem[] = [
  { id: 'chartering', labelKey: 'moduleChartering', labelFallback: 'Chartering', icon: 'fa-file-signature' },
  { id: 'operations', labelKey: 'moduleOperations', labelFallback: 'Operations', icon: 'fa-ship' },
  { id: 'postfix', labelKey: 'modulePostfix', labelFallback: 'Postfix', icon: 'fa-clipboard-check' },
  { id: 'routing', labelKey: 'moduleRouting', labelFallback: 'Routing', icon: 'fa-route', active: true },
  { id: 'accounts', labelKey: 'moduleAccounts', labelFallback: 'Accounts', icon: 'fa-file-invoice-dollar' },
];

export function ModuleSelector() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const [open, setOpen] = useState(false);
  const [moduleId, setModuleId] = useState<string>('routing');
  const ref = useRef<HTMLDivElement | null>(null);

  const activeModule = useMemo(
    () => MODULES.find((m) => m.id === moduleId) ?? MODULES.find((m) => m.active) ?? MODULES[0],
    [moduleId],
  );

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className="fv-module-selector" ref={ref}>
      <button
        type="button"
        className="fv-module-selector__button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <i className={`fas ${activeModule.icon}`} aria-hidden="true" />
        <span>{t(activeModule.labelKey, activeModule.labelFallback)}</span>
        <span className="fv-module-selector__caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <ul className="fv-module-selector__list" role="listbox">
          {MODULES.map((m) => (
            <li
              key={m.id}
              role="option"
              aria-selected={m.id === activeModule.id}
              aria-disabled={!m.active}
              className={`fv-module-selector__item${
                m.id === activeModule.id ? ' fv-module-selector__item--active' : ''
              }${m.active ? '' : ' fv-module-selector__item--disabled'}`}
              title={m.active ? undefined : t('comingSoon', 'Coming soon')}
              onClick={() => {
                if (!m.active) return;
                setModuleId(m.id);
                setOpen(false);
              }}
            >
              <i className={`fas ${m.icon}`} aria-hidden="true" />{' '}
              {t(m.labelKey, m.labelFallback)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
