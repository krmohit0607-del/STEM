import { useL } from '../i18n/LocalizationProvider';

/**
 * Global module menu — the top-most horizontal bar of the shell.
 *
 * Holds the product-level modules. The first one, "Routing", contains all
 * the functionality that currently exists (fleet, voyages, route editing,
 * optimization, etc.). The remaining modules are placeholders for future
 * areas of the app and are disabled until they are built out.
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
  { id: 'routing', labelKey: 'moduleRouting', labelFallback: 'Routing', icon: 'fa-route', active: true },
  { id: 'chartering', labelKey: 'moduleChartering', labelFallback: 'Chartering', icon: 'fa-file-signature' },
  { id: 'operations', labelKey: 'moduleOperations', labelFallback: 'Operations', icon: 'fa-ship' },
  { id: 'accounts', labelKey: 'moduleAccounts', labelFallback: 'Accounts', icon: 'fa-file-invoice-dollar' },
];

export function GlobalNav() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  return (
    <nav className="fv-globalnav" aria-label="Modules">
      <ul className="fv-globalnav__menu">
        {MODULES.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className={`fv-globalnav__item${m.active ? ' fv-globalnav__item--active' : ''}`}
              aria-current={m.active ? 'page' : undefined}
              disabled={!m.active}
              title={m.active ? undefined : t('comingSoon', 'Coming soon')}
            >
              <i className={`fas ${m.icon}`} aria-hidden="true" /> {t(m.labelKey, m.labelFallback)}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
