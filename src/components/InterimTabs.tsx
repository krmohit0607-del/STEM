import { Link } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage } from '../data/selectedVoyage';

/**
 * Shared tab bar for the Interim Dashboard section pages (Interim Dashboard,
 * ETA Calculation, ROB Calculation, Voyage Estimation, Weather Margins).
 *
 * Pass the `active` tab id; links preserve the selected voyage via the
 * `?voyage=` query param.
 */

export type InterimTabId =
  | 'interim'
  | 'eta'
  | 'rob'
  | 'estimation'
  | 'weather';

interface TabDef {
  id: InterimTabId;
  path: string;
  icon: string;
  labelKey: string;
  labelFallback: string;
}

const TABS: TabDef[] = [
  { id: 'interim', path: '/interim', icon: 'fa-bolt', labelKey: 'interimDashboard', labelFallback: 'Interim Dashboard' },
  { id: 'eta', path: '/optimization', icon: 'fa-calculator', labelKey: 'etaCalculation', labelFallback: 'ETA Calculation' },
  { id: 'rob', path: '/rob-calculation', icon: 'fa-gas-pump', labelKey: 'robCalculation', labelFallback: 'ROB Calculation' },
  { id: 'estimation', path: '/voyage-estimation', icon: 'fa-chart-line', labelKey: 'voyageEstimation', labelFallback: 'Voyage Estimation' },
  { id: 'weather', path: '/weather-margins', icon: 'fa-cloud-sun-rain', labelKey: 'weatherMargins', labelFallback: 'Weather Margins' },
];

export function InterimTabs({ active }: { active: InterimTabId }) {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const voyage = useSelectedVoyage();
  const q = voyage ? `?voyage=${encodeURIComponent(voyage.id)}` : '';

  return (
    <nav className="fv-voyage__tabs" aria-label="Interim sections">
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
