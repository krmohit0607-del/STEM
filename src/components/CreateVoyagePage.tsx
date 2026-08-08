import { Navigate, useSearchParams } from 'react-router-dom';

import { VoyageDetailsPage } from './VoyageDetailsPage';

/**
 * Create New entry point (`/voyage/new?type=…`).
 *
 * Estimation and Operations open their own module pages blank via `?new=1`.
 * Bunker / Postfix / Emissions / Accounts also open blank module pages via `?new=1`.
 * Performance (and any default) uses the original Voyage Details create form.
 */
export function CreateVoyagePage() {
  const [params] = useSearchParams();
  const type = params.get('type');
  if (type === 'estimation') return <Navigate to="/chartering?new=1" replace />;
  if (type === 'operations') return <Navigate to="/operations?new=1" replace />;
  if (type === 'bunker') return <Navigate to="/bunker?new=1" replace />;
  if (type === 'postfix') return <Navigate to="/postfix?new=1" replace />;
  if (type === 'emissions') return <Navigate to="/emissions?new=1" replace />;
  if (type === 'accounts') return <Navigate to="/accounts?new=1" replace />;
  return <VoyageDetailsPage mode="create" />;
}
