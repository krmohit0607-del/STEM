/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Storm Glass marine weather API key (optional, dev only). */
  readonly VITE_STORMGLASS_API_KEY?: string;
  /**
   * Base URL of the FleetView voyage backend (ASP.NET Core Web API).
   * Defaults to http://localhost:5063 in development. Leave empty to use
   * same-origin relative requests (when the SPA is served by the backend).
   */
  readonly VITE_FLEETVIEW_API_URL?: string;
  /**
   * Absolute origin of the main MultiTenantSaaS backend API (e.g. the deployed
   * Azure App Service URL). Leave unset in development to use the Vite proxy
   * and same-origin relative `/api/...` requests.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
