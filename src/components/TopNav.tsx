import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useL } from '../i18n/LocalizationProvider';
import { useNotifications } from '../data/workflow';
import { useAccountAlerts } from '../data/accounts';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { useCommsDraft } from '../data/commsStore';
import { useAuth } from '../context/AuthContext';
import { GenerateCommsModal } from './GenerateCommsModal';
import { AiAssistantPanel } from './AiAssistantPanel';

export function TopNav() {
  const l = useL();
  const navigate = useNavigate();
  const { user, role, companyName, logout } = useAuth();
  const notifications = useNotifications();
  const acctAlerts = useAccountAlerts();
  const selectedVoyage = useSelectedVoyage();
  const commsDraft = useCommsDraft();
  const [notifOpen, setNotifOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [commsOpen, setCommsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const createRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
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
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDocument = (event: MouseEvent) => { if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setUserMenuOpen(false); };
    document.addEventListener('mousedown', onDocument);
    return () => document.removeEventListener('mousedown', onDocument);
  }, [userMenuOpen]);

  const handleLogout = async () => {
    setUserMenuOpen(false);
    await logout();
    try {
      window.localStorage.removeItem('odas.auth');
      window.sessionStorage.removeItem('odas.auth');
    } catch {
      /* ignore */
    }
    navigate('/login', { replace: true });
  };

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
      <div className="fv-topnav__left">
        <button
          type="button"
          onClick={() => navigate('/main')}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}
        >
          <span className="fv-topnav__logo"><i className="fas fa-ship" aria-hidden="true" /> <span>ODAS</span></span>
        </button>

        {role === 'SuperAdmin' && (
          <button
            type="button"
            onClick={() => navigate('/superadmin')}
            style={{
              marginLeft: '1rem',
              background: 'rgba(225, 29, 72, 0.2)',
              color: '#fda4af',
              border: '1px solid #e11d48',
              borderRadius: '4px',
              padding: '0.25rem 0.6rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <i className="fas fa-crown" /> SuperAdmin Portal
          </button>
        )}

        {role === 'Employee' && (
          <button
            type="button"
            onClick={() => navigate('/my-modules')}
            style={{
              marginLeft: '1rem',
              background: 'rgba(5, 150, 105, 0.2)',
              color: '#6ee7b7',
              border: '1px solid #059669',
              borderRadius: '4px',
              padding: '0.25rem 0.6rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <i className="fas fa-cubes" /> My Modules
          </button>
        )}

        {role === 'VesselMaster' && (
          <button
            type="button"
            onClick={() => navigate('/vessel-master')}
            style={{
              marginLeft: '1rem',
              background: 'rgba(2, 132, 199, 0.2)',
              color: '#7dd3fc',
              border: '1px solid #0284c7',
              borderRadius: '4px',
              padding: '0.25rem 0.6rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <i className="fas fa-ship" /> Vessel Performance
          </button>
        )}
      </div>

      <div className="fv-topnav__right">
        <div className="fv-topnav__notif" ref={notifRef}>
          <button type="button" className="fv-topnav__icon-button" title={t('notifications', 'Notifications')} aria-label={t('notifications', 'Notifications')} onClick={() => setNotifOpen((value) => !value)}><i className="fas fa-bell" aria-hidden="true" />{(notifications.length + acctAlerts.length) > 0 && <span className="fv-topnav__notif-dot">{notifications.length + acctAlerts.length}</span>}</button>
          {notifOpen && <div className="fv-topnav__notif-panel"><div className="fv-topnav__notif-head">Notifications</div>{notifications.length === 0 && acctAlerts.length === 0 ? <div className="fv-topnav__notif-empty">No notifications.</div> : <ul>{acctAlerts.map((alert) => <li key={alert.id} className={`fv-topnav__notif-acct fv-topnav__notif-acct--${alert.tone}`}><i className={`fas ${alert.icon}`} aria-hidden="true" /><div><span>{alert.text}</span><small>{alert.sub}</small></div></li>)}{notifications.map((notification) => <li key={notification.id}><i className="fas fa-bullhorn" aria-hidden="true" /><div><span>{notification.text}</span><small>{notification.module} · {notification.at}</small></div></li>)}</ul>}</div>}
        </div>
        <button type="button" className="fv-topnav__icon-button" title={t('sendSystemEmail', 'Generate comms')} aria-label={t('sendSystemEmail', 'Generate comms')} onClick={() => setCommsOpen(true)}><i className="fas fa-envelope" aria-hidden="true" /></button>
        <button type="button" className="fv-topnav__icon-button fv-topnav__icon-button--ai" title="Voyage AI Assistant" aria-label="Voyage AI Assistant" onClick={() => setAiOpen(true)}><i className="fas fa-robot" aria-hidden="true" /></button>
        
        <div className="fv-topnav__create" ref={createRef}>
          <button type="button" className="fv-topnav__action-button fv-topnav__action-button--primary" aria-haspopup="menu" aria-expanded={createOpen} onClick={() => setCreateOpen((value) => !value)}>
            <i className="fas fa-plus" aria-hidden="true" /><span>{t('createNew', 'Create New')}</span><i className="fas fa-chevron-down fv-topnav__create-caret" aria-hidden="true" />
          </button>
          {createOpen && <div className="fv-topnav__create-menu" role="menu">{([['estimation', 'fa-file-signature', 'createEstimation', 'Estimation'], ['operations', 'fa-clipboard-list', 'createOperations', 'Operations'], ['performance', 'fa-gauge-high', 'createPerformance', 'Performance'], ['bunker', 'fa-gas-pump', 'createBunker', 'Bunker'], ['postfix', 'fa-file-signature', 'createPostfix', 'Postfix'], ['emissions', 'fa-leaf', 'createEmissions', 'Emissions'], ['accounts', 'fa-building-columns', 'createAccounts', 'Accounts']] as const).map(([type, icon, key, label]) => <button key={type} type="button" role="menuitem" onClick={() => startCreate(type)}><i className={`fas ${icon}`} aria-hidden="true" /><span>{t(key, label)}</span></button>)}</div>}
        </div>

        {/* User Profile & Role Indicator */}
        <div style={{ position: 'relative' }} ref={userMenuRef}>
          <button
            type="button"
            className="fv-topnav__icon-button"
            aria-label="Profile menu"
            title="Profile menu"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            onClick={() => setUserMenuOpen((v) => !v)}
          >
            <i className="fas fa-circle-user" aria-hidden="true" />
          </button>

          {userMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '0.5rem',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '0.75rem',
                minWidth: '220px',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)',
                zIndex: 1000,
              }}
            >
              <div style={{ borderBottom: '1px solid #334155', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem' }}>{user?.fullName}</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{user?.email}</div>
                {companyName && (
                  <div style={{ fontSize: '0.75rem', color: '#38bdf8', marginTop: '0.2rem' }}>
                    <i className="fas fa-building" style={{ marginRight: '4px' }} /> {companyName}
                  </div>
                )}
              </div>

              {role === 'SuperAdmin' && (
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate('/superadmin');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    width: '100%',
                    padding: '0.4rem 0.5rem',
                    background: 'none',
                    border: 'none',
                    color: '#f8fafc',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                  }}
                >
                  <i className="fas fa-crown" style={{ color: '#e11d48' }} /> SuperAdmin Console
                </button>
              )}

              {role === 'SuperAdmin' && (
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate('/admin-management');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    width: '100%',
                    padding: '0.4rem 0.5rem',
                    background: 'none',
                    border: 'none',
                    color: '#f8fafc',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                  }}
                >
                  <i className="fas fa-users-gear" style={{ color: '#38bdf8' }} /> Team &amp; Permissions
                </button>
              )}

              {role === 'VesselMaster' && (
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate('/vessel-master');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    width: '100%',
                    padding: '0.4rem 0.5rem',
                    background: 'none',
                    border: 'none',
                    color: '#f8fafc',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                  }}
                >
                  <i className="fas fa-ship" style={{ color: '#38bdf8' }} /> Vessel Performance
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  navigate('/my-modules');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  width: '100%',
                  padding: '0.4rem 0.5rem',
                  background: 'none',
                  border: 'none',
                  color: '#f8fafc',
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                }}
              >
                <i className="fas fa-cubes" style={{ color: '#10b981' }} /> My Assigned Modules
              </button>

              <button
                type="button"
                onClick={handleLogout}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  width: '100%',
                  padding: '0.4rem 0.5rem',
                  marginTop: '0.5rem',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                <i className="fas fa-arrow-right-from-bracket" /> Sign Out
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
