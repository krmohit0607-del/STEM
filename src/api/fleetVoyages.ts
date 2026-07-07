/**
 * Typed client for the FleetView voyage backend (ASP.NET Core Web API).
 *
 * Mirrors the DTOs exposed by the `FleetView.Api` project:
 *   VoyageOrder ─< Voyage ─< Passage ─< PassageLeg
 * with the active-passage flag carried on each voyage (`activePassageId`).
 *
 * The backend runs as a separate service (default http://localhost:5063) and
 * has CORS configured for the Vite dev origin. Override the base URL with the
 * `VITE_FLEETVIEW_API_URL` env var, or set it to '' to use same-origin
 * requests when the SPA is hosted by the backend.
 */

import { api } from './client';

const BASE = import.meta.env.VITE_FLEETVIEW_API_URL ?? 'http://localhost:5063';

/** Operational priority (matches the backend `Priority` enum ordinals). */
export enum Priority {
  Low = 0,
  Medium = 1,
  High = 2,
}

// --- Read models -----------------------------------------------------------

export interface PassageLegDto {
  id: number;
  passageId: number;
  sequence: number;
  type: string | null;
  fromPort: string;
  toPort: string;
  etd: string | null;
  eta: string | null;
  distanceNm: number | null;
  speed: number | null;
  status: string;
}

export interface PassageDto {
  id: number;
  voyageId: number;
  name: string;
  routeRef: string | null;
  interimPort: string | null;
  totalDistanceNm: number | null;
  status: string;
  /** True when this passage is the voyage's active (selected) passage. */
  isActive: boolean;
  createdOn: string;
  legs: PassageLegDto[];
}

export interface VoyageDto {
  id: number;
  voyageOrderId: number;
  vessel: string;
  imo: string | null;
  vesselType: string | null;
  flag: string | null;
  portFrom: string;
  portTo: string;
  status: string;
  etd: string | null;
  eta: string | null;
  cpSpeed: number | null;
  cpConsumption: number | null;
  /** Id of the active passage among `passages`, or null if none chosen. */
  activePassageId: number | null;
  passages: PassageDto[];
}

export interface VoyageOrderDto {
  id: number;
  orderNumber: string;
  client: string;
  clientEmail: string | null;
  service: string;
  priority: Priority;
  status: string;
  notes: string | null;
  createdOn: string;
  lastUpdated: string;
  voyages: VoyageDto[];
}

export interface VoyageOrderSummaryDto {
  id: number;
  orderNumber: string;
  client: string;
  service: string;
  priority: Priority;
  status: string;
  voyageCount: number;
  lastUpdated: string;
}

// --- Write models ----------------------------------------------------------

export interface CreateVoyageOrderRequest {
  orderNumber: string;
  client?: string;
  clientEmail?: string | null;
  service?: string;
  priority?: Priority;
  status?: string;
  notes?: string | null;
}

export type UpdateVoyageOrderRequest = Omit<CreateVoyageOrderRequest, 'orderNumber'>;

export interface CreateVoyageRequest {
  vessel: string;
  imo?: string | null;
  vesselType?: string | null;
  flag?: string | null;
  portFrom?: string;
  portTo?: string;
  status?: string;
  etd?: string | null;
  eta?: string | null;
  cpSpeed?: number | null;
  cpConsumption?: number | null;
}

export type UpdateVoyageRequest = CreateVoyageRequest;

export interface CreatePassageLegRequest {
  sequence: number;
  type?: string | null;
  fromPort: string;
  toPort: string;
  etd?: string | null;
  eta?: string | null;
  distanceNm?: number | null;
  speed?: number | null;
  status?: string;
}

export interface CreatePassageRequest {
  name: string;
  routeRef?: string | null;
  interimPort?: string | null;
  totalDistanceNm?: number | null;
  status?: string;
  /** When true, this passage becomes the voyage's active passage on create. */
  setAsActive?: boolean;
  legs?: CreatePassageLegRequest[];
}

export interface UpdatePassageRequest {
  name: string;
  routeRef?: string | null;
  interimPort?: string | null;
  totalDistanceNm?: number | null;
  status?: string;
}

// --- Endpoints -------------------------------------------------------------

const u = (path: string) => `${BASE}${path}`;

/** Voyage orders (top of the hierarchy). */
export const voyageOrders = {
  list: () => api.get<VoyageOrderSummaryDto[]>(u('/api/voyage-orders')),
  get: (id: number) => api.get<VoyageOrderDto>(u(`/api/voyage-orders/${id}`)),
  create: (body: CreateVoyageOrderRequest) =>
    api.post<VoyageOrderDto>(u('/api/voyage-orders'), body),
  update: (id: number, body: UpdateVoyageOrderRequest) =>
    api.put<VoyageOrderDto>(u(`/api/voyage-orders/${id}`), body),
  remove: (id: number) => api.delete<void>(u(`/api/voyage-orders/${id}`)),

  listVoyages: (orderId: number) =>
    api.get<VoyageDto[]>(u(`/api/voyage-orders/${orderId}/voyages`)),
  /** Add a voyage to an order. Throws ApiError(409) if the order already has 4. */
  addVoyage: (orderId: number, body: CreateVoyageRequest) =>
    api.post<VoyageDto>(u(`/api/voyage-orders/${orderId}/voyages`), body),
};

/** Individual voyages and their candidate passages. */
export const voyages = {
  get: (id: number) => api.get<VoyageDto>(u(`/api/voyages/${id}`)),
  update: (id: number, body: UpdateVoyageRequest) =>
    api.put<VoyageDto>(u(`/api/voyages/${id}`), body),
  remove: (id: number) => api.delete<void>(u(`/api/voyages/${id}`)),
  /** Choose which passage is active for the voyage. */
  setActivePassage: (id: number, passageId: number) =>
    api.put<VoyageDto>(u(`/api/voyages/${id}/active-passage`), { passageId }),

  listPassages: (voyageId: number) =>
    api.get<PassageDto[]>(u(`/api/voyages/${voyageId}/passages`)),
  addPassage: (voyageId: number, body: CreatePassageRequest) =>
    api.post<PassageDto>(u(`/api/voyages/${voyageId}/passages`), body),
};

/** Individual passages. */
export const passages = {
  get: (id: number) => api.get<PassageDto>(u(`/api/passages/${id}`)),
  update: (id: number, body: UpdatePassageRequest) =>
    api.put<PassageDto>(u(`/api/passages/${id}`), body),
  remove: (id: number) => api.delete<void>(u(`/api/passages/${id}`)),
};

export const fleetVoyagesApi = { voyageOrders, voyages, passages };
