import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';
import { useNotifications } from '../data/workflow';
import { useAccountAlerts } from '../data/accounts';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { useCommsDraft } from '../data/commsStore';
import { GenerateCommsModal } from './GenerateCommsModal';
import { AiAssistantPanel } from './AiAssistantPanel';

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
  const acctAlerts = useAccountAlerts();
  const selectedVoyage = useSelectedVoyage();
  const [notifOpen, setNotifOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [commsOpen, setCommsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const commsDraft = useCommsDraft();

  // Auto-open Comms modal when a forecast draft is queued
  useEffect(() => {
    if (commsDraft) setCommsOpen(true);
  }, [commsDraft]);
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

  const startCreate = (type: 'estimation' | 'operations' | 'performance' | 'bunker' | 'postfix' | 'emissions' | 'accounts') => {
    setCreateOpen(false);
    if (type === 'estimation') navigate('/chartering?new=1', { state: { fleetMenuModule: 'Chartering' } });
    else if (type === 'operations') navigate('/operations?new=1', { state: { fleetMenuModule: 'Operations' } });
    else if (type === 'performance') navigate('/voyage/new?type=performance', { state: { fleetMenuModule: 'Performance' } });
    else if (type === 'bunker') navigate('/bunker?new=1', { state: { fleetMenuModule: 'Bunker' } });
    else if (type === 'postfix') navigate('/postfix?new=1', { state: { fleetMenuModule: 'Postfix' } });
    else if (type === 'emissions') navigate('/emissions?new=1', { state: { fleetMenuModule: 'Emissions' } });
    else navigate('/accounts?new=1', { state: { fleetMenuModule: 'Accounts' } });
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
            {(notifications.length + acctAlerts.length) > 0 && <span className="fv-topnav__notif-dot">{notifications.length + acctAlerts.length}</span>}
          </button>
          {notifOpen && (
            <div className="fv-topnav__notif-panel">
              <div className="fv-topnav__notif-head">Notifications</div>
              {notifications.length === 0 && acctAlerts.length === 0 ? (
                <div className="fv-topnav__notif-empty">No notifications.</div>
              ) : (
                <ul>
                  {acctAlerts.map((a) => (
                    <li key={a.id} className={`fv-topnav__notif-acct fv-topnav__notif-acct--${a.tone}`}>
                      <i className={`fas ${a.icon}`} aria-hidden="true" />
                      <div><span>{a.text}</span><small>{a.sub}</small></div>
                    </li>
                  ))}
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
        <button
          type="button"
          className="fv-topnav__icon-button fv-topnav__icon-button--ai"
          title="Voyage AI Assistant"
          aria-label="Voyage AI Assistant"
          onClick={() => setAiOpen(true)}
        >
          <i className="fas fa-robot" aria-hidden="true" />
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
                <span>{t('createOperations', 'Operations')}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => startCreate('performance')}>
                <i className="fas fa-gauge-high" aria-hidden="true" />
                <span>{t('createPerformance', 'Performance')}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => startCreate('bunker')}>
                <i className="fas fa-gas-pump" aria-hidden="true" />
                <span>{t('createBunker', 'Bunker')}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => startCreate('postfix')}>
                <i className="fas fa-file-signature" aria-hidden="true" />
                <span>{t('createPostfix', 'Postfix')}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => startCreate('emissions')}>
                <i className="fas fa-leaf" aria-hidden="true" />
                <span>{t('createEmissions', 'Emissions')}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => startCreate('accounts')}>
                <i className="fas fa-building-columns" aria-hidden="true" />
                <span>{t('createAccounts', 'Accounts')}</span>
              </button>
            </div>
          )}
        </div>
      </div>
      {commsOpen && <GenerateCommsModal voyage={selectedVoyage} onClose={() => setCommsOpen(false)} />}
      {aiOpen && <AiAssistantPanel onClose={() => setAiOpen(false)} />}
    </div>
  );
}
