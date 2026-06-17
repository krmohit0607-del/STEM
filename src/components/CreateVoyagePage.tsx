import { VoyageDetailsPage } from './VoyageDetailsPage';

/**
 * Create New Voyage page — `/voyage/new`.
 *
 * Thin wrapper that reuses the Voyage Details form in "create" mode so
 * every field starts blank. Replace the placeholder save behaviour in
 * `VoyageDetailsPage` with the real `/api/voyage` POST when the
 * endpoint is wired up.
 */
export function CreateVoyagePage() {
  return <VoyageDetailsPage mode="create" />;
}
