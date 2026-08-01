import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';
import { useNotifications } from '../data/workflow';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { GenerateCommsModal } from './GenerateCommsModal';

/**
 * Universal top navigation bar (shared across all modules).
 *
 * The vessel search + leg selector were moved out of here into the module's
 * own content area (see `ModuleBar`), because that voyage context belongs to
 * the current app (Performance module), not every module. This header keeps
 * only the brand and the app-level actions.
 */

export function TopNav() {
  const l = useL();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const selectedVoyage = useSelectedVoyage();
  const [notifOpen, setNotifOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [commsOpen, setCommsOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const createRef = useRef<HTMLDivElement | null>(null);
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  useEffect(() => {
    if (!createOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (createRef.current && !createRef.current.contains(e.target as Node)) setCreateOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [createOpen]);

  const startCreate = (type: 'estimation' | 'operations' | 'performance') => {
    setCreateOpen(false);
    if (type === 'estimation') navigate('/chartering?new=1');
    else if (type === 'operations') navigate('/operations?new=1');
    else navigate('/voyage/new?type=performance');
  };

  useEffect(() => {
    if (!notifOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [notifOpen]);

  return (
    <div className="fv-topnav" role="navigation" aria-label="Top">
      <div className="fv-topnav__left">
        <span className="fv-topnav__logo">
          <i className="fas fa-ship" aria-hidden="true" />
          ODAS
        </span>
      </div>

      <div className="fv-topnav__right">
        <div className="fv-topnav__notif" ref={notifRef}>
          <button
            type="button"
            className="fv-topnav__icon-button"
            title={t('notifications', 'Notifications')}
            aria-label={t('notifications', 'Notifications')}
            onClick={() => setNotifOpen((v) => !v)}
          >
            <i className="fas fa-bell" aria-hidden="true" />
            {notifications.length > 0 && <span className="fv-topnav__notif-dot">{notifications.length}</span>}
          </button>
          {notifOpen && (
            <div className="fv-topnav__notif-panel">
              <div className="fv-topnav__notif-head">Notifications</div>
              {notifications.length === 0 ? (
                <div className="fv-topnav__notif-empty">No notifications.</div>
              ) : (
                <ul>
                  {notifications.map((n) => (
                    <li key={n.id}>
                      <i className="fas fa-bullhorn" aria-hidden="true" />
                      <div><span>{n.text}</span><small>{n.module} · {n.at}</small></div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          className="fv-topnav__icon-button"
          title={t('sendSystemEmail', 'Generate comms')}
          aria-label={t('sendSystemEmail', 'Generate comms')}
          onClick={() => setCommsOpen(true)}
        >
          <i className="fas fa-envelope" aria-hidden="true" />
        </button>

        <div className="fv-topnav__create" ref={createRef}>
          <button
            type="button"
            className="fv-topnav__action-button fv-topnav__action-button--primary"
            aria-haspopup="menu"
            aria-expanded={createOpen}
            onClick={() => setCreateOpen((v) => !v)}
          >
            <i className="fas fa-plus" aria-hidden="true" />
            <span>{t('createNew', 'Create New')}</span>
            <i className="fas fa-chevron-down fv-topnav__create-caret" aria-hidden="true" />
          </button>
          {createOpen && (
            <div className="fv-topnav__create-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => startCreate('estimation')}>
                <i className="fas fa-file-signature" aria-hidden="true" />
                <span>{t('createEstimation', 'Estimation')}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => startCreate('operations')}>
                <i className="fas fa-clipboard-list" aria-hidden="true" />
                <span>{t('createOperations', 'Under Operations')}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => startCreate('performance')}>
                <i className="fas fa-gauge-high" aria-hidden="true" />
                <span>{t('createPerformance', 'Performance')}</span>
              </button>
            </div>
          )}
        </div>
      </div>
      {commsOpen && <GenerateCommsModal voyage={selectedVoyage} onClose={() => setCommsOpen(false)} />}
    </div>
  );
}
