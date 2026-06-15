import { useState, type MouseEvent } from 'react';

import { useFleetView } from '../context/FleetViewContext';
import { useL } from '../i18n/LocalizationProvider';

/**
 * React port of the top side-nav from `Index.cshtml` + `MainMenu.js` +
 * `UserMenu.js`. IDs are kept identical to the legacy markup so any
 * remaining global JS or stylesheet selectors continue to match while we
 * migrate the rest of the page.
 *
 * Click handlers replicate the legacy MainMenu behavior:
 *  - search-menu: opens `/Search/AdvancedSearch` in a new tab.
 *  - api-menu: opens `/swagger/index.html` in a new tab.
 *  - support-menu: TODO — old impl opens an EmailDialog or BRTDialog.
 *  - notification / status / list-notification: TODO — wired to bubbles
 *    that come from SignalR; SignalR client is not connected in Phase 1.
 *  - user-menu: shows the legacy user submenu (logout, account info).
 *
 * Items marked TODO are left as no-ops with a console message rather
 * than calling stubs that pretend to work.
 */
export function SideNav() {
  const { user } = useFleetView();
  const l = useL();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const todo = (feature: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    // Phase 1 stub — feature still lives in the legacy app.
    // eslint-disable-next-line no-console
    console.warn(`[FleetView WebApp] '${feature}' not ported yet.`);
  };

  const openExternal = (url: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const fullName = user?.fullName ?? user?.name ?? '';

  return (
    <div id="menu-sidenav" className="sidenav">
      <div id="notifications-header">
        <nav id="nav">
          <ul>
            <li id="user-menu">
              <a
                id="current-user-menu"
                className="fas fa-user"
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setUserMenuOpen((v) => !v);
                }}
                aria-label="User menu"
              />
              <div
                id="notification-impersonate"
                className="notify-bubble notify-bubble-impersonate"
              />
              {userMenuOpen && (
                <ul id="user-submenu">
                  <li>
                    <span
                      style={{ color: 'white', marginRight: '1em' }}
                      className="fas fa-user"
                    />
                    <span style={{ color: 'white', textTransform: 'uppercase' }}>
                      {fullName}
                    </span>
                  </li>
                  <li>
                    <hr />
                  </li>
                  <li>
                    <a id="profile-menu" href="#" onClick={todo('Account Info dialog')}>
                      {l('accountInfo')}
                    </a>
                  </li>
                  <li>
                    <a href="/Account/Logout">{l('logout')}</a>
                  </li>
                </ul>
              )}
            </li>

            <li>
              <a
                id="search-menu"
                className="fas fa-search"
                href="#"
                title={l('search')}
                onClick={openExternal('/Search/AdvancedSearch')}
              />
            </li>

            <li className="notification-container">
              <a
                id="notification-main-menu"
                className="fas fa-exclamation-triangle"
                href="#"
                title="Task(s) & Alert(s)"
                onClick={todo('Notification menu')}
              />
              <div id="notification-counter" className="notify-bubble notify-bubble-counter" />
            </li>

            <li>
              <a
                id="support-menu"
                className="far fa-question-circle"
                href="#"
                title="IT Support"
                onClick={todo('Support menu')}
                style={{ display: 'none' }}
              />
            </li>

            <li>
              <a
                id="api-menu"
                className="far fa-cog"
                href="#"
                title="API Doc"
                onClick={openExternal('/swagger/index.html')}
              />
            </li>

            <li className="status-container">
              <a
                id="status-menu"
                className="fas fa-circle-info"
                href="#"
                title="System Status"
                onClick={todo('Status menu')}
              />
              <div id="notification-status" className="notify-bubble notify-bubble-status" />
            </li>

            <li className="notification-container">
              <a
                id="Listnotification-main-menu"
                className="fa fa-list-alt"
                href="#"
                title="To do list (Notification)"
                onClick={todo('To-do list menu')}
              />
              <div
                id="notification-Listnotification"
                className="notify-bubble notify-bubble-Listnotification"
              />
            </li>
          </ul>
        </nav>
      </div>
      <div id="notifications-menu" />
      <div id="notifications-content" />
      <div id="notifications-footer" />
    </div>
  );
}
