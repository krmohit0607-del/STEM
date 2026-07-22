import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';

import { FleetViewProvider } from './context/FleetViewContext';
import { LocalizationProvider } from './i18n/LocalizationProvider';
import { Layout } from './components/Layout';
import { FleetListPage } from './components/FleetListPage';
import { InterimDashboardPage } from './components/InterimDashboardPage';
import { OptimizationDetailsPage } from './components/OptimizationDetailsPage';
import { RobCalculationPage } from './components/RobCalculationPage';
import { VoyageEstimationPage } from './components/VoyageEstimationPage';
import { ChateringEstimationPage } from './components/ChateringEstimationPage';
import { OperationsPage } from './components/OperationsPage';
import { WeatherMarginsPage } from './components/WeatherMarginsPage';
import { VoyageDetailsPage } from './components/VoyageDetailsPage';
import { ConfigHistoryPage } from './components/ConfigHistoryPage';
import { AreaConstraintsPage } from './components/AreaConstraintsPage';
import { VesselDetailsPage } from './components/VesselDetailsPage';
import { ClientDetailsPage } from './components/ClientDetailsPage';
import { EmailDetailsPage } from './components/EmailDetailsPage';
import { PassageDetailsPage } from './components/PassageDetailsPage';
import { CreateVoyagePage } from './components/CreateVoyagePage';
import { RouteExplorerPage } from './components/RouteExplorerPage';
import { LimitsConstraintsPage } from './components/LimitsConstraintsPage';
import { OrderConfirmationPage } from './components/OrderConfirmationPage';
import { ReportingInstructionsPage } from './components/ReportingInstructionsPage';
import { RouteRecommendationPage } from './components/RouteRecommendationPage';
import { VoyagePlanPage } from './components/VoyagePlanPage';
import { ForecastPage } from './components/ForecastPage';
import { PerformanceReportPage } from './components/PerformanceReportPage';

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
              path="/optimization"
              element={
                <Layout>
                  <OptimizationDetailsPage />
                </Layout>
              }
            />
            <Route
              path="/rob-calculation"
              element={
                <Layout>
                  <RobCalculationPage />
                </Layout>
              }
            />
            <Route
              path="/voyage-estimation"
              element={
                <Layout>
                  <VoyageEstimationPage />
                </Layout>
              }
            />
            <Route
              path="/chartering"
              element={
                <Layout showModuleChrome={false}>
                  <ChateringEstimationPage />
                </Layout>
              }
            />
            <Route
              path="/operations"
              element={
                <Layout showModuleChrome={false}>
                  <OperationsPage />
                </Layout>
              }
            />
            <Route
              path="/weather-margins"
              element={
                <Layout>
                  <WeatherMarginsPage />
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
              path="/configuration-history"
              element={
                <Layout>
                  <ConfigHistoryPage />
                </Layout>
              }
            />
            <Route
              path="/area-constraints"
              element={
                <Layout>
                  <AreaConstraintsPage />
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
              path="/limits"
              element={
                <Layout>
                  <LimitsConstraintsPage />
                </Layout>
              }
            />
            <Route
              path="/reports/order-confirmation"
              element={
                <Layout>
                  <OrderConfirmationPage />
                </Layout>
              }
            />
            <Route
              path="/reports/instructions"
              element={
                <Layout>
                  <ReportingInstructionsPage />
                </Layout>
              }
            />
            <Route
              path="/reports/route-recommendation"
              element={
                <Layout>
                  <RouteRecommendationPage />
                </Layout>
              }
            />
            <Route
              path="/reports/voyage-plan"
              element={
                <Layout>
                  <VoyagePlanPage />
                </Layout>
              }
            />
            <Route
              path="/reports/forecast"
              element={
                <Layout>
                  <ForecastPage />
                </Layout>
              }
            />
            <Route
              path="/reports/performance"
              element={
                <Layout>
                  <PerformanceReportPage />
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
