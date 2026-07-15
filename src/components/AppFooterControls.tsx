import { useEffect, useState } from 'react';

import { useL } from '../i18n/LocalizationProvider';
import { useTheme } from '../theme';
import { SettingsModal } from './SettingsModal';

/**
 * Theme toggle + profile/settings controls. Shown as a small horizontal bar at
 * the bottom of the fleet menu (moved out of the left icon sidebar). The
 * profile dropdown opens upward and reuses the existing sidebar-profile styles.
 */
export function AppFooterControls() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const [theme, toggleTheme] = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Close the profile menu on any outside click.
  useEffect(() => {
    if (!profileOpen) return;
    const onDocClick = () => setProfileOpen(false);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [profileOpen]);

  return (
    <div className="fv-appctrls">
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

      <div
        className="fv-left-sidebar__profile"
        onMouseDown={(e) => e.stopPropagation()}
      >
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
            <button
              type="button"
              className="fv-left-sidebar__profile-item"
              role="menuitem"
            >
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
            <button
              type="button"
              className="fv-left-sidebar__profile-logout"
              role="menuitem"
            >
              <i className="fas fa-right-from-bracket" aria-hidden="true" />
              <span>{t('logout', 'Logout')}</span>
            </button>
          </div>
        )}
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
