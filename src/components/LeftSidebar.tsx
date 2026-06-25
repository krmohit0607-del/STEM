import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';

/**
 * Collapsible left sidebar (icon-tab edition).
 *
 * Eight tabs map to future feature areas; clicking one shows a placeholder
 * describing the planned contents. Real grids / dialogs / editors are not
 * ported yet. Active tab and collapsed state persist in `localStorage`.
 */

type TabId =
  | 'dashboard'
  | 'interim'
  | 'route'
  | 'limits'
  | 'area'
  | 'simulator'
  | 'history'
  | 'reports';

interface PlannedItem {
  label: string;
  /** Optional in-app route. When set, the bullet renders as a clickable link. */
  route?: string;
}

interface TabDef {
  id: TabId;
  /** FontAwesome class (no leading "fa-"). */
  icon: string;
  /** i18n key. */
  labelKey: string;
  /** Fallback label when the dictionary is missing the key. */
  labelFallback: string;
  /** Bullet list of planned contents for this tab. */
  planned: (string | PlannedItem)[];
  /** Optional route to navigate to when the icon-tab is clicked. */
  route?: string;
}

const TABS: TabDef[] = [
  {
    id: 'dashboard',
    icon: 'fa-gauge-high',
    labelKey: 'dashboard',
    labelFallback: 'Dashboard',
    route: '/voyage',
    planned: [
      { label: 'Create new voyage', route: '/voyage/new' },
      { label: 'Voyage details', route: '/voyage' },
      { label: 'Vessel details', route: '/vessel' },
      { label: 'Client details', route: '/client' },
      { label: 'Email details', route: '/email' },
      { label: 'Passage details', route: '/passage' },
      'OC',
    ],
  },
  {
    id: 'interim',
    icon: 'fa-bolt',
    labelKey: 'interimDashboard',
    labelFallback: 'Interim Dashboard',
    route: '/interim',
    planned: [
      { label: 'Interim dashboard', route: '/interim' },
      { label: 'Optimization details', route: '/optimization' },
    ],
  },
  {
    id: 'route',
    icon: 'fa-route',
    labelKey: 'routeEditing',
    labelFallback: 'Route Editing',
    route: '/route-explorer',
    planned: [
      { label: 'Open route editor', route: '/route-explorer' },
      { label: 'Plot route on map', route: '/plot-route' },
      { label: 'Import / export', route: '/route-editor#import-export' },
      { label: 'Add leg', route: '/route-editor#add-leg' },
      { label: 'Update leg', route: '/route-editor#update-leg' },
      { label: 'Split leg', route: '/route-editor#split-leg' },
      { label: 'Merge leg', route: '/route-editor#merge-leg' },
      {
        label: 'Waypoint details: lat/lon, course, speed, distance from last waypoint',
        route: '/route-editor#waypoint-details',
      },
      { label: 'Toggle: drift until / sail', route: '/route-editor#toggle-drift' },
    ],
  },
  {
    id: 'limits',
    icon: 'fa-sliders',
    labelKey: 'limitsConstraints',
    labelFallback: 'Limits & Constraints',
    planned: [
      'Clients → optimization',
      'Masters → weather limits',
      'Vessel limits / constraints',
    ],
  },
  {
    id: 'area',
    icon: 'fa-draw-polygon',
    labelKey: 'areaConstraints',
    labelFallback: 'Area Constraints',
    planned: ['ECA zones', 'Speed control zones', 'Block / no-go zones'],
  },
  {
    id: 'simulator',
    icon: 'fa-compass-drafting',
    labelKey: 'routeExplorer',
    labelFallback: 'Route Explorer / Simulator',
    route: '/route-explorer',
    planned: [
      { label: 'Route explorer', route: '/route-explorer' },
      { label: 'Route simulator', route: '/route-simulator' },
    ],
  },
  {
    id: 'history',
    icon: 'fa-clock-rotate-left',
    labelKey: 'configurationHistory',
    labelFallback: 'Configuration History',
    planned: ['Configuration change log', 'Voyage configuration revisions'],
  },
  {
    id: 'reports',
    icon: 'fa-file-invoice',
    labelKey: 'reportsCalculations',
    labelFallback: 'Reports & Calculations',
    planned: [
      'Reports',
      'Bunker calculation',
      'ETA calculation',
      'Deviation calculation',
      'Emission calculation',
    ],
  },
];

const COLLAPSED_KEY = 'fv.leftSidebar.collapsed';
const ACTIVE_TAB_KEY = 'fv.leftSidebar.activeTab';

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function readActiveTab(): TabId {
  try {
    const v = window.localStorage.getItem(ACTIVE_TAB_KEY);
    if (v && TABS.some((tab) => tab.id === v)) return v as TabId;
  } catch {
    /* ignore */
  }
  return 'dashboard';
}

export function LeftSidebar() {
  const l = useL();
  const navigate = useNavigate();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const [collapsed, setCollapsed] = useState(() => readBool(COLLAPSED_KEY, false));
  const [activeTab, setActiveTab] = useState<TabId>(() => readActiveTab());

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
    } catch {
      /* ignore */
    }
  }, [activeTab]);

  const active = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

  return (
    <aside
      id="fv-left-sidebar"
      className={`fv-left-sidebar${collapsed ? ' fv-left-sidebar--collapsed' : ''}`}
      aria-label="Tools"
    >
      <div id="fv-left-sidebar-body" className="fv-left-sidebar__body">
        <ul className="fv-left-tabs" role="tablist" aria-orientation="vertical">
          {TABS.map((tab) => (
            <li key={tab.id}>
              <button
                type="button"
                role="tab"
                aria-selected={!collapsed && tab.id === activeTab}
                className={`fv-left-tab${
                  !collapsed && tab.id === activeTab ? ' fv-left-tab--active' : ''
                }`}
                onClick={() => {
                  // Clicking an icon while collapsed expands the panel and
                  // selects that tab. Clicking the active tab while open
                  // collapses again (so the icon strip becomes a quick toggle).
                  if (collapsed) {
                    setActiveTab(tab.id);
                    setCollapsed(false);
                  } else if (tab.id === activeTab) {
                    setCollapsed(true);
                  } else {
                    setActiveTab(tab.id);
                  }
                  // Tabs with a dedicated page navigate to it; every other
                  // tab returns to the dashboard map so the user always
                  // ends up on a real page.
                  navigate(tab.route ?? '/');
                }}
                title={t(tab.labelKey, tab.labelFallback)}
              >
                <i className={`fas ${tab.icon}`} aria-hidden="true" />
                <span className="fv-left-tab__label">
                  {t(tab.labelKey, tab.labelFallback)}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {!collapsed && (
          <div className="fv-left-tab-panel">
            <button
              type="button"
              className="fv-left-sidebar__toggle"
              onClick={() => setCollapsed(true)}
              aria-expanded={true}
              aria-controls="fv-left-sidebar-body"
              title={t('collapse', 'Collapse')}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <h3 className="fv-left-tab-panel__title">
              {t(active.labelKey, active.labelFallback)}
            </h3>
            <ul className="fv-left-tab-panel__list">
              {active.planned.map((item) => {
                const entry: PlannedItem =
                  typeof item === 'string' ? { label: item } : item;
                return (
                  <li key={entry.label}>
                    {entry.route ? (
                      <button
                        type="button"
                        className="fv-left-tab-panel__link"
                        onClick={() => navigate(entry.route!)}
                      >
                        {entry.label}
                      </button>
                    ) : (
                      entry.label
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}
