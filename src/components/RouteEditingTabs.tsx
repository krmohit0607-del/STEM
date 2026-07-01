import { Link, useLocation } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';

/**
 * Horizontal tab strip for the Route Editing pages — mirrors the tab UI
 * used on Voyage Details and the Interim Dashboard. Highlights the tab
 * matching the current route.
 */
export function RouteEditingTabs() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };
  const { pathname } = useLocation();

  const tabs = [
    { to: '/route-explorer', icon: 'fa-pen-ruler', label: t('openRouteEditor', 'Open route editor') },
  ];

  return (
    <nav className="fv-voyage__tabs" aria-label="Route editing sections">
      {tabs.map((tab) => {
        const path = tab.to.split('#')[0];
        const active = pathname === path;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={`fv-voyage__tab${active ? ' fv-voyage__tab--active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <i className={`fas ${tab.icon}`} aria-hidden="true" /> {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
