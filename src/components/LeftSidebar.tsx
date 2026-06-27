import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';
import { useTheme } from '../theme';

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
    labelKey: 'voyageDetails',
    labelFallback: 'Voyage Details',
    route: '/voyage',
    planned: [
      { label: 'Order details', route: '/voyage#order' },
      { label: 'Vessel profile', route: '/voyage#vessel' },
      { label: 'CP & leg details', route: '/voyage#legs' },
      { label: 'Notes', route: '/voyage#voyageNotes' },
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

export function LeftSidebar({ iconOnly = false }: { iconOnly?: boolean } = {}) {
  const l = useL();
  const navigate = useNavigate();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const [collapsed, setCollapsed] = useState(() =>
    iconOnly ? true : readBool(COLLAPSED_KEY, false),
  );
  const [activeTab, setActiveTab] = useState<TabId>(() => readActiveTab());
  const [theme, toggleTheme] = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (iconOnly) return;
    try {
      window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed, iconOnly]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
    } catch {
      /* ignore */
    }
  }, [activeTab]);

  // Close the profile menu on any outside click.
  useEffect(() => {
    if (!profileOpen) return;
    const onDocClick = () => setProfileOpen(false);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [profileOpen]);

  const active = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

  return (
    <aside
      id="fv-left-sidebar"
      className={`fv-left-sidebar${collapsed ? ' fv-left-sidebar--collapsed' : ''}${
        theme === 'light' ? ' fv-left-sidebar--light' : ''
      }`}
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
                  if (iconOnly) {
                    // Focused views keep the rail icon-only; clicking an
                    // icon just navigates to that feature's page.
                    navigate(tab.route ?? '/');
                    return;
                  }
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
            {active.id === 'dashboard' ? (
              <p className="fv-left-tab-panel__hint">
                {t('useSectionTabs', 'Use the section tabs on the page to open each section.')}
              </p>
            ) : (
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
            )}
          </div>
        )}
      </div>

      <div className="fv-left-sidebar__footer">
        <button
          type="button"
          className="fv-left-sidebar__foot-btn"
          onClick={toggleTheme}
          aria-pressed={theme === 'light'}
          title={
            theme === 'dark'
              ? t('switchToLight', 'Switch to Light Mode')
              : t('switchToDark', 'Switch to Dark Mode')
          }
        >
          <i
            className={`fas ${theme === 'dark' ? 'fa-moon' : 'fa-sun'}`}
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          className="fv-left-sidebar__foot-btn"
          title={t('settings', 'Settings')}
        >
          <i className="fas fa-gear" aria-hidden="true" />
        </button>

        <div className="fv-left-sidebar__profile" onMouseDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="fv-left-sidebar__foot-btn"
            aria-label={t('profileSettings', 'Profile Settings')}
            title={t('profileSettings', 'Profile Settings')}
            aria-expanded={profileOpen}
            onClick={(e) => {
              e.stopPropagation();
              setProfileOpen((prev) => !prev);
            }}
          >
            <i className="fas fa-user-gear" aria-hidden="true" />
          </button>
          {profileOpen && (
            <div className="fv-left-sidebar__profile-menu" role="menu">
              <div className="fv-left-sidebar__profile-head">
                <span className="fv-left-sidebar__profile-avatar" aria-hidden="true">
                  <i className="fas fa-user" />
                </span>
                <div className="fv-left-sidebar__profile-id">
                  <span className="fv-left-sidebar__profile-name">Amit Sharma</span>
                  <span className="fv-left-sidebar__profile-role">
                    {t('role', 'Role')}: Fleet Operator
                  </span>
                </div>
              </div>
              <button type="button" className="fv-left-sidebar__profile-item" role="menuitem">
                <i className="fas fa-id-badge" aria-hidden="true" />
                <span>{t('accountDetails', 'Account Details')}</span>
              </button>
              <button type="button" className="fv-left-sidebar__profile-item" role="menuitem">
                <i className="fas fa-gear" aria-hidden="true" />
                <span>{t('settings', 'Settings')}</span>
              </button>
              <div className="fv-left-sidebar__profile-divider" />
              <button type="button" className="fv-left-sidebar__profile-logout" role="menuitem">
                <i className="fas fa-right-from-bracket" aria-hidden="true" />
                <span>{t('logout', 'Logout')}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
