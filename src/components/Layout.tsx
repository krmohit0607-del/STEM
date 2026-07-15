import type { ReactNode } from 'react';

import { useFleetView } from '../context/FleetViewContext';
import { FleetMenu } from './FleetMenu';
import { LeftSidebar } from './LeftSidebar';
import { MapView } from './MapView';
import { ModuleBar } from './ModuleBar';
import { TopNav } from './TopNav';
import { BottomPanel } from './BottomPanel';

/**
 * Top-level layout. Mirrors the structure of the legacy `Index.cshtml`:
 *
 *   #page-wrapper > #main-wrapper >
 *     .sidenav (#menu-sidenav)
 *     .portal-container (#portal)
 *
 * In Phase 1 the sidenav is fully React; the portal area shows a portal
 * selector + the map. Per-portal grids (Voyages, Vessels, Clients...) are
 * not yet ported.
 *
 * Pages can swap the default map view by passing `children`. The shell
 * (TopNav, LeftSidebar, BottomPanel) stays the same so the user can keep
 * navigating between pages without losing their dashboard chrome.
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
  const { isLoading, error, user } = useFleetView();

  if (isLoading) {
    return <div className="fv-loading">Loading FleetView…</div>;
  }

  if (error || !user) {
    return (
      <div className="fv-unauthenticated">
        <h1>Not signed in</h1>
        <p>
          Please <a href="/Account/Login">sign in</a> to continue. The React
          dev server proxies authentication to the .NET backend.
        </p>
      </div>
    );
  }

  return (
    <div id="page-wrapper">
      <div id="dynamicStuff">
        <div id="HiddenMap" />
        <div id="TestImage" />
      </div>

      <TopNav />

      <div id="main-wrapper">
        <FleetMenu />
        {showModuleChrome && <LeftSidebar />}
        <div id="portal" className="portal-container">
          {showModuleChrome && <ModuleBar />}
          {children ?? <MapView />}
          {showModuleChrome && <BottomPanel />}
        </div>
      </div>
    </div>
  );
}
