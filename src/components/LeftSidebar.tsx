import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';
import { useTheme } from '../theme';
import { SettingsModal } from './SettingsModal';

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
    labelKey: 'dashboardAndTools',
    labelFallback: 'Dashboard & Tools',
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
    planned: [],
  },
  {
    id: 'limits',
    icon: 'fa-sliders',
    labelKey: 'limitsConstraints',
    labelFallback: 'Limits & Constraints',
    route: '/limits',
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
    route: '/area-constraints',
    planned: [
      { label: 'View all on map', route: '/area-constraints' },
      { label: 'Limited-passage zones', route: '/area-constraints' },
      { label: 'No-go zones', route: '/area-constraints' },
      { label: 'Speed-control zones', route: '/area-constraints' },
      { label: 'ECA zones', route: '/area-constraints' },
    ],
  },
  {
    id: 'reports',
    icon: 'fa-file-invoice',
    labelKey: 'reportsCalculations',
    labelFallback: 'Reports',
    route: '/reports/order-confirmation',
    planned: [
      { label: 'Order Confirmation', route: '/reports/order-confirmation' },
      { label: 'Reporting Instructions', route: '/reports/instructions' },
      { label: 'Route Recommendation', route: '/reports/route-recommendation' },
      { label: 'Voyage Plan', route: '/reports/voyage-plan' },
      { label: 'Forecast', route: '/reports/forecast' },
      { label: 'Performance Report', route: '/reports/performance' },
    ],
  },
  {
    id: 'history',
    icon: 'fa-clock-rotate-left',
    labelKey: 'configurationHistory',
    labelFallback: 'Configuration History',
    route: '/configuration-history',
    planned: ['Configuration change log', 'Voyage configuration revisions'],
  },
];

const ACTIVE_TAB_KEY = 'fv.leftSidebar.activeTab';

function readActiveTab(): TabId {
  try {
    const v = window.localStorage.getItem(ACTIVE_TAB_KEY);
    if (v && TABS.some((tab) => tab.id === v)) return v as TabId;
  } catch {
    /* ignore */
  }
  return 'dashboard';
}

export function LeftSidebar(_props: { iconOnly?: boolean } = {}) {
  const l = useL();
  const navigate = useNavigate();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const [collapsed] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>(() => readActiveTab());
  const [theme, toggleTheme] = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
                  // Clicking an icon selects that tab and navigates to its
                  // page (or the dashboard map when none is defined).
                  setActiveTab(tab.id);
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
              <button
                type="button"
                className="fv-left-sidebar__profile-item"
                role="menuitem"
                onClick={() => {
                  setProfileOpen(false);
                  setSettingsOpen(true);
                }}
              >
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
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </aside>
  );
}
