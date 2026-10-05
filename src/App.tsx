import { BrowserRouter, Navigate, Route, Routes, useSearchParams, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { AuthProvider, useAuth } from './context/AuthContext';
import { FleetViewProvider } from './context/FleetViewContext';
import { LocalizationProvider } from './i18n/LocalizationProvider';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginPage } from './components/LoginPage';
import { SuperAdminPage } from './components/SuperAdminPage';
import { AdminManagementPage } from './components/AdminManagementPage';
import { EmployeeModulesPage } from './components/EmployeeModulesPage';
import { VesselMasterPerformancePage } from './components/VesselMasterPerformancePage';
import { FleetListPage } from './components/FleetListPage';
import { InterimDashboardPage } from './components/InterimDashboardPage';
import { OptimizationDetailsPage } from './components/OptimizationDetailsPage';
import { RobCalculationPage } from './components/RobCalculationPage';
import { VoyageEstimationPage } from './components/VoyageEstimationPage';
import { ChateringEstimationPage } from './components/ChateringEstimationPage';
import { CharteringBooksPage } from './components/CharteringBooksPage';
import { OperationsPage } from './components/OperationsPage';
import { EmissionsPage } from './components/EmissionsPage';
import { BunkerManagementPage } from './components/BunkerManagementPage';
import { AccountsPage } from './components/AccountsPage';
import { SettingsPage } from './components/SettingsPage';
import { PostfixPage } from './components/PostfixPage';
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
import { RouteExplorerSearchPage } from './components/RouteExplorerSearchPage';
import { LimitsConstraintsPage } from './components/LimitsConstraintsPage';
import { OrderConfirmationPage } from './components/OrderConfirmationPage';
import { ReportingInstructionsPage } from './components/ReportingInstructionsPage';
import { RouteRecommendationPage } from './components/RouteRecommendationPage';
import { VoyagePlanPage } from './components/VoyagePlanPage';
import { ForecastPage } from './components/ForecastPage';
import { PerformanceReportPage } from './components/PerformanceReportPage';
import { VesselReportsPage } from './components/VesselReportsPage';
import { OfflineVesselReportsPage } from './components/OfflineVesselReportsPage';

import { VoyageOverviewMap } from './components/VoyageOverviewMap';
import { PageShell } from './components/PageShell';
import type { UserRole } from './types/auth';

/**
 * Home route. When opened with `?voyage=<id>` (e.g. from the Fleet
 * List View's clickable Voyage ID link) it shows the live
 * voyage-tracking view. Otherwise it sends the user to the login
 * screen (the default landing page) or straight to `/main` once
 * they are signed in.
 */
function HomeRoute() {
  const { isAuthenticated, isLoading, role } = useAuth();
  const [params] = useSearchParams();
  const voyageId = params.get('voyage');

  if (voyageId) {
    return (
      <Layout>
        <VoyageOverviewMap voyageId={voyageId} />
      </Layout>
    );
  }

  if (isLoading) {
    return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#94a3b8' }}>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (role === 'SuperAdmin') {
    return <Navigate to="/superadmin" replace />;
  }

  if (role === 'Admin') {
    return <Navigate to="/main" replace />;
  }

  if (role === 'VesselMaster') {
    return <Navigate to="/vessel-master" replace />;
  }

  if (role === 'Employee') {
    return <Navigate to="/my-modules" replace />;
  }

  return <Navigate to="/main" replace />;
}

function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: ReactNode;
  allowedRoles?: UserRole[];
}) {
  const { isAuthenticated, isLoading, role } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#94a3b8' }}>
        <i className="fas fa-spinner fa-spin fa-2x" style={{ marginRight: '0.75rem' }} /> Loading user session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    if (role === 'SuperAdmin') return <Navigate to="/superadmin" replace />;
    if (role === 'Admin') return <Navigate to="/main" replace />;
    if (role === 'VesselMaster') return <Navigate to="/vessel-master" replace />;
    return <Navigate to="/my-modules" replace />;
  }

  return <>{children}</>;
}

function CharteringRoute() {
  const [params] = useSearchParams();
  return params.get('book') === 'cargo' || params.get('book') === 'tonnage'
    ? <CharteringBooksPage />
    : <ChateringEstimationPage />;
}

export function App() {
  return (
    <AuthProvider>
      <FleetViewProvider>
        <LocalizationProvider>
          <BrowserRouter>
            <RoutedErrorBoundary>
            <Routes>
              <Route path="/" element={<HomeRoute />} />
              <Route path="/login" element={<LoginPage />} />

              {/* Multi-Tenant SaaS Specific Control Panels */}
              <Route
                path="/superadmin"
                element={
                  <ProtectedRoute allowedRoles={['SuperAdmin']}>
                    <Layout showModuleChrome={false}>
                      <SuperAdminPage />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin-management"
                element={
                  <ProtectedRoute allowedRoles={['SuperAdmin']}>
                    <Layout showModuleChrome={false}>
                      <AdminManagementPage />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/my-modules"
                element={
                  <ProtectedRoute>
                    <Layout showModuleChrome={false}>
                      <EmployeeModulesPage />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vessel-master"
                element={
                  <ProtectedRoute allowedRoles={['VesselMaster', 'Admin', 'SuperAdmin']}>
                    <Layout showModuleChrome={false}>
                      <VesselMasterPerformancePage />
                    </Layout>
                  </ProtectedRoute>
                }
              />

              {/* Main Routing & Fleet Operation Modules */}
              <Route
              path="/main"
              element={
                <ProtectedRoute>
                  <PageShell>
                    <FleetListPage />
                  </PageShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/interim"
              element={
                <ProtectedRoute>
                  <Layout>
                    <InterimDashboardPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/optimization"
              element={
                <ProtectedRoute>
                  <Layout>
                    <OptimizationDetailsPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/rob-calculation"
              element={
                <ProtectedRoute>
                  <Layout>
                    <RobCalculationPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/voyage-estimation"
              element={
                <ProtectedRoute>
                  <Layout>
                    <VoyageEstimationPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/chartering"
              element={
                <ProtectedRoute>
                  <Layout showModuleChrome={false}>
                    <CharteringRoute />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/operations"
              element={
                <ProtectedRoute>
                  <Layout showModuleChrome={false}>
                    <OperationsPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/bunker"
              element={
                <ProtectedRoute>
                  <Layout showModuleChrome={false}>
                    <BunkerManagementPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounts"
              element={
                <ProtectedRoute>
                  <Layout showModuleChrome={false}>
                    <AccountsPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Layout showModuleChrome={false}>
                    <SettingsPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/postfix"
              element={
                <ProtectedRoute>
                  <Layout showModuleChrome={false}>
                    <PostfixPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/emissions"
              element={
                <ProtectedRoute>
                  <Layout showModuleChrome={false}>
                    <EmissionsPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/weather-margins"
              element={
                <ProtectedRoute>
                  <Layout>
                    <WeatherMarginsPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/voyage/new"
              element={
                <ProtectedRoute>
                  <Layout>
                    <CreateVoyagePage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/voyage"
              element={
                <ProtectedRoute>
                  <Layout>
                    <VoyageDetailsPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/configuration-history"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ConfigHistoryPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/area-constraints"
              element={
                <ProtectedRoute>
                  <Layout>
                    <AreaConstraintsPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/vessel"
              element={
                <ProtectedRoute>
                  <Layout>
                    <VesselDetailsPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/client"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ClientDetailsPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/email"
              element={
                <ProtectedRoute>
                  <Layout>
                    <EmailDetailsPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/passage"
              element={
                <ProtectedRoute>
                  <Layout>
                    <PassageDetailsPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/route-explorer"
              element={
                <ProtectedRoute>
                  <Layout>
                    <RouteExplorerSearchPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/route-simulator"
              element={
                <ProtectedRoute>
                  <Layout>
                    <RouteExplorerPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/limits"
              element={
                <ProtectedRoute>
                  <Layout>
                    <LimitsConstraintsPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/order-confirmation"
              element={
                <ProtectedRoute>
                  <Layout>
                    <OrderConfirmationPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/instructions"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ReportingInstructionsPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/route-recommendation"
              element={
                <ProtectedRoute>
                  <Layout>
                    <RouteRecommendationPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/voyage-plan"
              element={
                <ProtectedRoute>
                  <Layout>
                    <VoyagePlanPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/forecast"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ForecastPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/performance"
              element={
                <ProtectedRoute>
                  <Layout>
                    <PerformanceReportPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/vessel-reports"
              element={
                <ProtectedRoute>
                  <Layout>
                    <VesselReportsPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/vessel-reports/offline"
              element={
                <OfflineVesselReportsPage />
              }
            />
            {/* Unknown paths fall back to HomeRoute */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
            </RoutedErrorBoundary>
        </BrowserRouter>
      </LocalizationProvider>
      </FleetViewProvider>
    </AuthProvider>
  );
}

/** Wraps the routed content so a page error shows a fallback (not a blank
 *  screen) and resets automatically when the route changes. */
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>;
}
