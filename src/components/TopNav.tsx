import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useL } from '../i18n/LocalizationProvider';
import { useNotifications } from '../data/workflow';
import { useAccountAlerts } from '../data/accounts';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { useCommsDraft } from '../data/commsStore';
import { GenerateCommsModal } from './GenerateCommsModal';
import { AiAssistantPanel } from './AiAssistantPanel';

export function TopNav() {
  const l = useL();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const acctAlerts = useAccountAlerts();
  const selectedVoyage = useSelectedVoyage();
  const commsDraft = useCommsDraft();
  const [notifOpen, setNotifOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [commsOpen, setCommsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const createRef = useRef<HTMLDivElement | null>(null);
  const t = (key: string, fallback: string) => { const value = l(key); return value === key ? fallback : value; };

  useEffect(() => { if (commsDraft) setCommsOpen(true); }, [commsDraft]);
  useEffect(() => {
    if (!createOpen) return;
    const onDocument = (event: MouseEvent) => { if (createRef.current && !createRef.current.contains(event.target as Node)) setCreateOpen(false); };
    document.addEventListener('mousedown', onDocument);
    return () => document.removeEventListener('mousedown', onDocument);
  }, [createOpen]);
  useEffect(() => {
    if (!notifOpen) return;
    const onDocument = (event: MouseEvent) => { if (notifRef.current && !notifRef.current.contains(event.target as Node)) setNotifOpen(false); };
    document.addEventListener('mousedown', onDocument);
    return () => document.removeEventListener('mousedown', onDocument);
  }, [notifOpen]);

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

  return (
    <div className="fv-topnav" role="navigation" aria-label="Top">
      <div className="fv-topnav__left"><span className="fv-topnav__logo"><i className="fas fa-ship" aria-hidden="true" /> ODAS</span></div>
      <div className="fv-topnav__right">
        <div className="fv-topnav__notif" ref={notifRef}>
          <button type="button" className="fv-topnav__icon-button" title={t('notifications', 'Notifications')} aria-label={t('notifications', 'Notifications')} onClick={() => setNotifOpen((value) => !value)}><i className="fas fa-bell" aria-hidden="true" />{(notifications.length + acctAlerts.length) > 0 && <span className="fv-topnav__notif-dot">{notifications.length + acctAlerts.length}</span>}</button>
          {notifOpen && <div className="fv-topnav__notif-panel"><div className="fv-topnav__notif-head">Notifications</div>{notifications.length === 0 && acctAlerts.length === 0 ? <div className="fv-topnav__notif-empty">No notifications.</div> : <ul>{acctAlerts.map((alert) => <li key={alert.id} className={`fv-topnav__notif-acct fv-topnav__notif-acct--${alert.tone}`}><i className={`fas ${alert.icon}`} aria-hidden="true" /><div><span>{alert.text}</span><small>{alert.sub}</small></div></li>)}{notifications.map((notification) => <li key={notification.id}><i className="fas fa-bullhorn" aria-hidden="true" /><div><span>{notification.text}</span><small>{notification.module} · {notification.at}</small></div></li>)}</ul>}</div>}
        </div>
        <button type="button" className="fv-topnav__icon-button" title={t('sendSystemEmail', 'Generate comms')} aria-label={t('sendSystemEmail', 'Generate comms')} onClick={() => setCommsOpen(true)}><i className="fas fa-envelope" aria-hidden="true" /></button>
        <button type="button" className="fv-topnav__icon-button fv-topnav__icon-button--ai" title="Voyage AI Assistant" aria-label="Voyage AI Assistant" onClick={() => setAiOpen(true)}><i className="fas fa-robot" aria-hidden="true" /></button>
        <div className="fv-topnav__create" ref={createRef}><button type="button" className="fv-topnav__action-button fv-topnav__action-button--primary" aria-haspopup="menu" aria-expanded={createOpen} onClick={() => setCreateOpen((value) => !value)}><i className="fas fa-plus" aria-hidden="true" /><span>{t('createNew', 'Create New')}</span><i className="fas fa-chevron-down fv-topnav__create-caret" aria-hidden="true" /></button>{createOpen && <div className="fv-topnav__create-menu" role="menu">{([['estimation', 'fa-file-signature', 'createEstimation', 'Estimation'], ['operations', 'fa-clipboard-list', 'createOperations', 'Operations'], ['performance', 'fa-gauge-high', 'createPerformance', 'Performance'], ['bunker', 'fa-gas-pump', 'createBunker', 'Bunker'], ['postfix', 'fa-file-signature', 'createPostfix', 'Postfix'], ['emissions', 'fa-leaf', 'createEmissions', 'Emissions'], ['accounts', 'fa-building-columns', 'createAccounts', 'Accounts']] as const).map(([type, icon, key, label]) => <button key={type} type="button" role="menuitem" onClick={() => startCreate(type)}><i className={`fas ${icon}`} aria-hidden="true" /><span>{t(key, label)}</span></button>)}</div>}</div>
      </div>
      {commsOpen && <GenerateCommsModal voyage={selectedVoyage} onClose={() => setCommsOpen(false)} />}
      {aiOpen && <AiAssistantPanel onClose={() => setAiOpen(false)} />}
    </div>
  );
}
