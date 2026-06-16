import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { FleetViewProvider } from './context/FleetViewContext';
import { LocalizationProvider } from './i18n/LocalizationProvider';
import { Layout } from './components/Layout';
import { FleetListPage } from './components/FleetListPage';
import { InterimDashboardPage } from './components/InterimDashboardPage';
import { VoyageDetailsPage } from './components/VoyageDetailsPage';
import { RouteExplorerPage } from './components/RouteExplorerPage';
import { RouteSimulatorPage } from './components/RouteSimulatorPage';
import { PageShell } from './components/PageShell';

export function App() {
  return (
    <FleetViewProvider>
      <LocalizationProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />} />
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
            {/* Unknown paths fall back to the dashboard. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </LocalizationProvider>
    </FleetViewProvider>
  );
}
