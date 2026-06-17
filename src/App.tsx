import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';

import { FleetViewProvider } from './context/FleetViewContext';
import { LocalizationProvider } from './i18n/LocalizationProvider';
import { Layout } from './components/Layout';
import { FleetListPage } from './components/FleetListPage';
import { InterimDashboardPage } from './components/InterimDashboardPage';
import { VoyageDetailsPage } from './components/VoyageDetailsPage';
import { CreateVoyagePage } from './components/CreateVoyagePage';
import { RouteExplorerPage } from './components/RouteExplorerPage';
import { RouteSimulatorPage } from './components/RouteSimulatorPage';
import { VoyageOverviewMap } from './components/VoyageOverviewMap';
import { PageShell } from './components/PageShell';

/**
 * Home route. When opened with `?voyage=<id>` (e.g. from the Fleet
 * List View's clickable Voyage ID link) it shows the live
 * voyage-tracking view. Otherwise it redirects to `/main`, which is
 * the application's startup page.
 */
function HomeRoute() {
  const [params] = useSearchParams();
  const voyageId = params.get('voyage');
  if (voyageId) {
    return (
      <Layout>
        <VoyageOverviewMap voyageId={voyageId} />
      </Layout>
    );
  }
  return <Navigate to="/main" replace />;
}

export function App() {
  return (
    <FleetViewProvider>
      <LocalizationProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomeRoute />} />
            <Route
              path="/main"
              element={
                <PageShell>
                  <FleetListPage />
                </PageShell>
              }
            />
            <Route
              path="/interim"
              element={
                <Layout>
                  <InterimDashboardPage />
                </Layout>
              }
            />
            <Route
              path="/voyage/new"
              element={
                <Layout>
                  <CreateVoyagePage />
                </Layout>
              }
            />
            <Route
              path="/voyage"
              element={
                <Layout>
                  <VoyageDetailsPage />
                </Layout>
              }
            />
            <Route
              path="/route-explorer"
              element={
                <Layout>
                  <RouteExplorerPage />
                </Layout>
              }
            />
            <Route
              path="/route-simulator"
              element={
                <Layout>
                  <RouteSimulatorPage />
                </Layout>
              }
            />
            {/* Unknown paths fall back to the Fleet List View. */}
            <Route path="*" element={<Navigate to="/main" replace />} />
          </Routes>
        </BrowserRouter>
      </LocalizationProvider>
    </FleetViewProvider>
  );
}
