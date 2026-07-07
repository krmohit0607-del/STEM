import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage } from '../data/selectedVoyage';

/**
 * Shared tab bar + page shell for the Reports & Calculations section
 * pages (Reporting Instructions, Route Recommendation, Voyage Plan,
 * Forecast, Performance Report).
 *
 * Mirrors the Interim Dashboard tab pattern: pass the `active` tab id;
 * links preserve the selected voyage via the `?voyage=` query param.
 */

export type ReportTabId =
  | 'order'
  | 'instructions'
  | 'route'
  | 'plan'
  | 'forecast'
  | 'performance';

interface TabDef {
  id: ReportTabId;
  path: string;
  icon: string;
  labelKey: string;
  labelFallback: string;
}

const TABS: TabDef[] = [
  { id: 'order', path: '/reports/order-confirmation', icon: 'fa-file-signature', labelKey: 'orderConfirmation', labelFallback: 'Order Confirmation' },
  { id: 'instructions', path: '/reports/instructions', icon: 'fa-file-lines', labelKey: 'reportingInstructions', labelFallback: 'Reporting Instructions' },
  { id: 'route', path: '/reports/route-recommendation', icon: 'fa-route', labelKey: 'routeRecommendation', labelFallback: 'Route Recommendation' },
  { id: 'plan', path: '/reports/voyage-plan', icon: 'fa-map-location-dot', labelKey: 'voyagePlan', labelFallback: 'Voyage Plan' },
  { id: 'forecast', path: '/reports/forecast', icon: 'fa-cloud-sun-rain', labelKey: 'forecast', labelFallback: 'Forecast' },
  { id: 'performance', path: '/reports/performance', icon: 'fa-chart-line', labelKey: 'performanceReport', labelFallback: 'Performance Report' },
];

export function ReportsTabs({ active }: { active: ReportTabId }) {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const voyage = useSelectedVoyage();
  const q = voyage ? `?voyage=${encodeURIComponent(voyage.id)}` : '';

  return (
    <nav className="fv-voyage__tabs" aria-label="Report sections">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          to={`${tab.path}${q}`}
          className={`fv-voyage__tab${tab.id === active ? ' fv-voyage__tab--active' : ''}`}
          aria-current={tab.id === active ? 'page' : undefined}
        >
          <i className={`fas ${tab.icon}`} aria-hidden="true" /> {t(tab.labelKey, tab.labelFallback)}
        </Link>
      ))}
    </nav>
  );
}

interface ShellProps {
  active: ReportTabId;
  icon: string;
  title: string;
  children: ReactNode;
}

/** Header + tab bar wrapper reused by all Reports pages. */
export function ReportsPageShell({ active, icon, title, children }: ShellProps) {
  const voyage = useSelectedVoyage();

  return (
    <div className="fv-voyage">
      <header className="fv-voyage__header">
        <div className="fv-voyage__heading">
          <span className="fv-voyage__heading-icon" aria-hidden="true">
            <i className={`fas ${icon}`} />
          </span>
          <div>
            <h1>{title}</h1>
            <p className="fv-voyage__sub">
              {voyage
                ? `${voyage.vessel} \u00b7 IMO ${voyage.imo} \u00b7 ${voyage.client} \u00b7 ${voyage.portFrom} \u2192 ${voyage.portTo}`
                : 'No voyage selected \u2014 open one from the Fleet List.'}
            </p>
          </div>
        </div>
      </header>

      <ReportsTabs active={active} />

      {children}
    </div>
  );
}
