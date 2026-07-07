/**
 * Typed client for the FleetView backend's reference/master data endpoints
 * (ports, clients, area constraints, and the generic dataset passthrough).
 *
 * Pairs with `fleetVoyages.ts`. The backend runs as a separate service
 * (default http://localhost:5063); override with `VITE_FLEETVIEW_API_URL`.
 */

import { api } from './client';

const BASE = import.meta.env.VITE_FLEETVIEW_API_URL ?? 'http://localhost:5063';
const u = (path: string) => `${BASE}${path}`;

// --- Clients ---------------------------------------------------------------

export interface ClientDto {
  id: string;
  name: string;
  location: string;
  email: string;
  contactName: string;
  phone: string;
  username: string;
  password: string;
  role: string;
  active: boolean;
}

export const clients = {
  list: () => api.get<ClientDto[]>(u('/api/clients')),
  get: (id: string) => api.get<ClientDto>(u(`/api/clients/${encodeURIComponent(id)}`)),
};

// --- Area constraints ------------------------------------------------------

export interface AreaConstraintDto {
  id: string;
  name: string;
  rawName: string;
  zoneType: string;
  geomType: string;
  rpmMin: string;
  rpmMax: string;
  speedMin: string;
  speedMax: string;
  /** One or more polygon rings, each an ordered list of [lat, lon] vertices. */
  rings: [number, number][][];
  voyageId?: string | null;
}

export const areaConstraints = {
  list: (opts?: { zoneType?: string; voyageId?: string }) => {
    const q = new URLSearchParams();
    if (opts?.zoneType) q.set('zoneType', opts.zoneType);
    if (opts?.voyageId) q.set('voyageId', opts.voyageId);
    const qs = q.toString();
    return api.get<AreaConstraintDto[]>(u(`/api/area-constraints${qs ? `?${qs}` : ''}`));
  },
};

// --- Generic reference datasets --------------------------------------------

/** Known dataset keys served verbatim from the frontend export. */
export type DatasetKey =
  | 'fleet'
  | 'fleetTasks'
  | 'voyages'
  | 'tracksheet'
  | 'emailTemplates'
  | 'emailTemplateCategories'
  | 'weatherMarginRoutes'
  | 'clientRoles'
  | 'limitsDefaults';

export const data = {
  /** List the available dataset keys. */
  keys: () => api.get<string[]>(u('/api/data')),
  /** Fetch a dataset's payload (typed by the caller). */
  get: <T>(key: DatasetKey | string) => api.get<T>(u(`/api/data/${key}`)),
};

export const fleetDataApi = { clients, areaConstraints, data };
