import { useEffect, type ReactNode } from 'react';
import { useLocation, Navigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { useFleetView } from '../context/FleetViewContext';
import { syncVesselsFromBackend } from '../data/vessels';
import { syncClientsFromBackend } from '../data/clients';
import { FleetMenu } from './FleetMenu';
import { LeftSidebar } from './LeftSidebar';
import { MapView } from './MapView';
import { ModuleBar } from './ModuleBar';
import { TopNav } from './TopNav';
import { BottomPanel } from './BottomPanel';
import { VoyageTagsStrip } from './VoyageTagsStrip';

// Guards the one-time-per-page-load backend pull below (Layout can mount/unmount across route
// changes; there's no need to re-fetch on every navigation within the same session).
let masterDataSynced = false;

/**
 * Top-level layout. Mirrors the structure of the legacy `Index.cshtml`:
 *
 *   #page-wrapper > #main-wrapper >
 *     .sidenav (#menu-sidenav)
 *     .portal-container (#portal)
 */
export function Layout({
  children,
  showModuleChrome = true,
}: {
  children?: ReactNode;
  /** When false, hides the Performance-module chrome (icon sidebar, module bar,
   *  bottom panel) — used by other modules like Chartering. */
  showModuleChrome?: boolean;
}) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isLoading: fvLoading } = useFleetView();
  const { pathname } = useLocation();
  const isSettingsPage =
    pathname === '/settings' ||
    pathname.startsWith('/settings/') ||
    pathname === '/admin-management' ||
    pathname === '/superadmin';

  // Pull the tenant's Vessels/Accounts master data as soon as the user is signed in, so name
  // fields (vessel/owners/charterers/brokers) show the current backend list everywhere — not
  // just after the user happens to visit Settings first.
  useEffect(() => {
    if (!isAuthenticated || masterDataSynced) return;
    masterDataSynced = true;
    void syncVesselsFromBackend();
    void syncClientsFromBackend();
  }, [isAuthenticated]);

  if (authLoading || fvLoading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#94a3b8' }}>
        <i className="fas fa-spinner fa-spin fa-2x" style={{ marginRight: '0.75rem' }} /> Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }


  return (
    <div id="page-wrapper">
      <div id="dynamicStuff">
        <div id="HiddenMap" />
        <div id="TestImage" />
      </div>

      <TopNav />

      <div id="main-wrapper">
        {!isSettingsPage && <FleetMenu />}
        {showModuleChrome && <LeftSidebar />}
        <div id="portal" className="portal-container">
          {showModuleChrome && <ModuleBar />}
          {showModuleChrome && <VoyageTagsStrip />}
          {children ?? <MapView />}
          {showModuleChrome && <BottomPanel />}
        </div>
      </div>
    </div>
  );
}
