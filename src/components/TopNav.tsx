import { useNavigate } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';

/**
 * Universal top navigation bar (shared across all modules).
 *
 * The vessel search + leg selector were moved out of here into the module's
 * own content area (see `ModuleBar`), because that voyage context belongs to
 * the current app (Performance module), not every module. This header keeps
 * only the brand and the app-level actions.
 */

function todoHandler(label: string) {
  return () => {
    // eslint-disable-next-line no-console
    console.warn(`[FleetView WebApp] '${label}' not ported yet — see MIGRATION.md.`);
  };
}

export function TopNav() {
  const l = useL();
  const navigate = useNavigate();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  return (
    <div className="fv-topnav" role="navigation" aria-label="Top">
      <div className="fv-topnav__left">
        <span className="fv-topnav__logo">
          <i className="fas fa-ship" aria-hidden="true" />
          STEM
        </span>
      </div>

      <div className="fv-topnav__right">
        <button
          type="button"
          className="fv-topnav__icon-button"
          title={t('sendSystemEmail', 'Send system email')}
          aria-label={t('sendSystemEmail', 'Send system email')}
          onClick={todoHandler('System email dialog')}
        >
          <i className="fas fa-envelope" aria-hidden="true" />
        </button>

        <button
          type="button"
          className="fv-topnav__action-button fv-topnav__action-button--primary"
          onClick={() => navigate('/voyage/new')}
        >
          <i className="fas fa-plus" aria-hidden="true" />
          <span>{t('createNewVoyage', 'New voyage')}</span>
        </button>
      </div>
    </div>
  );
}
