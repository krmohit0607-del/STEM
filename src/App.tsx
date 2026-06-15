import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { FleetViewProvider } from './context/FleetViewContext';
import { LocalizationProvider } from './i18n/LocalizationProvider';
import { Layout } from './components/Layout';
import { FleetListPage } from './components/FleetListPage';

export function App() {
  return (
    <FleetViewProvider>
      <LocalizationProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />} />
            <Route path="/main" element={<FleetListPage />} />
            {/* Unknown paths fall back to the dashboard. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </LocalizationProvider>
    </FleetViewProvider>
  );
}
