import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';

import { FleetViewProvider } from './context/FleetViewContext';
import { WeatherProvider } from './context/WeatherContext';
import { LocalizationProvider } from './i18n/LocalizationProvider';
import { Layout } from './components/Layout';
import { FleetListPage } from './components/FleetListPage';
import { InterimDashboardPage } from './components/InterimDashboardPage';
import { OptimizationDetailsPage } from './components/OptimizationDetailsPage';
import { VoyageDetailsPage } from './components/VoyageDetailsPage';
import { VesselDetailsPage } from './components/VesselDetailsPage';
import { ClientDetailsPage } from './components/ClientDetailsPage';
import { EmailDetailsPage } from './components/EmailDetailsPage';
import { PassageDetailsPage } from './components/PassageDetailsPage';
import { CreateVoyagePage } from './components/CreateVoyagePage';
import { RouteExplorerPage } from './components/RouteExplorerPage';
import { RouteEditorPage } from './components/RouteEditorPage';
import { PlotRoutePage } from './components/PlotRoutePage';
import { RouteSimulatorPage } from './components/RouteSimulatorPage';
import { VoyageOverviewMap } from './components/VoyageOverviewMap';
import { VesselRoutePage } from './components/VesselRoutePage';
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
        <WeatherProvider>
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
              path="/optimization"
              element={
                <Layout>
                  <OptimizationDetailsPage />
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
              path="/vessel"
              element={
                <Layout>
                  <VesselDetailsPage />
                </Layout>
              }
            />
            <Route
              path="/client"
              element={
                <Layout>
                  <ClientDetailsPage />
                </Layout>
              }
            />
            <Route
              path="/email"
              element={
                <Layout>
                  <EmailDetailsPage />
                </Layout>
              }
            />
            <Route
              path="/passage"
              element={
                <Layout>
                  <PassageDetailsPage />
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
              path="/route-editor"
              element={
                <Layout>
                  <RouteEditorPage />
                </Layout>
              }
            />
            <Route
              path="/plot-route"
              element={
                <Layout>
                  <PlotRoutePage />
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
            <Route path="/vessel-route" element={<VesselRoutePage />} />
            {/* Unknown paths fall back to the Fleet List View. */}
            <Route path="*" element={<Navigate to="/main" replace />} />
          </Routes>
        </BrowserRouter>
        </WeatherProvider>
      </LocalizationProvider>
    </FleetViewProvider>
  );
}
