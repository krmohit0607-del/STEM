import { useFleetView } from '../context/FleetViewContext';
import { LeftSidebar } from './LeftSidebar';
import { MapView } from './MapView';
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
 */
export function Layout() {
  const { isLoading, error, user, isStubbed } = useFleetView();

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
      {isStubbed && (
        <div className="fv-dev-banner">
          DEV MODE — backend at <code>https://localhost:5001</code> is unreachable
          or you are not signed in. Showing a stub user so the layout renders.
          API calls from individual components will still fail.
        </div>
      )}
      <div id="dynamicStuff">
        <div id="HiddenMap" />
        <div id="TestImage" />
      </div>

      <TopNav />

      <div id="main-wrapper">
        <LeftSidebar />
        <div id="portal" className="portal-container">
          <MapView />
          <BottomPanel />
        </div>
      </div>
    </div>
  );
}
