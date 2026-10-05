import { api } from './client';

export interface BackendVoyageDto {
  id: string;
  voyageCode: string;
  voyageOrderId?: string | null;
  vesselName: string;
  imo?: string | null;
  vesselType?: string | null;
  flag?: string | null;
  dwt?: string | null;
  built: number;
  loa?: string | null;
  beam?: string | null;
  enginePower?: string | null;
  portFrom: string;
  portTo: string;
  status: string;
  priority: string;
  etd?: string | null;
  eta?: string | null;
  etdDisplay?: string | null;
  etaDisplay?: string | null;
  lastNoon?: string | null;
  routeRef?: string | null;
  interimPort?: string | null;
  pic?: string | null;
  client?: string | null;
  clientEmail?: string | null;
  service?: string | null;
  cpSpeed?: number | null;
  cpCons?: number | null;
  instSpeed?: number | null;
  instCons?: number | null;
  health: number;
  remaining?: string | null;
  dueLt: number;
  dueUtc: number;
  openTasks: number;
  tags?: string | null;
  aiAlert?: string | null;
  handoverNote?: string | null;
  openStatus: string;
  price?: number | null;
  pricingBasis?: string | null;
  costPerDay?: number | null;
  foCost?: number | null;
  goCost?: number | null;
  euaCost?: number | null;
  activePassageId?: string | null;
}

export interface CreateBackendVoyageDto {
  voyageCode?: string;
  vesselName: string;
  imo?: string;
  vesselType?: string;
  flag?: string;
  portFrom?: string;
  portTo?: string;
  status?: string;
  priority?: string;
  etdDisplay?: string;
  etaDisplay?: string;
  client?: string;
  service?: string;
  cpSpeed?: number;
  cpCons?: number;
  instSpeed?: number;
  instCons?: number;
  handoverNote?: string;
  tags?: string;
  aiAlert?: string;
  health?: number;
}

export const voyagesApi = {
  list: () => api.get<BackendVoyageDto[]>('/api/voyages'),
  get: (idOrCode: string) => api.get<BackendVoyageDto>(`/api/voyages/${encodeURIComponent(idOrCode)}`),
  create: (dto: CreateBackendVoyageDto) => api.post<BackendVoyageDto>('/api/voyages', dto),
  update: (id: string, dto: Partial<BackendVoyageDto>) => api.put<BackendVoyageDto>(`/api/voyages/${id}`, dto),
  delete: (id: string) => api.delete(`/api/voyages/${id}`),
  deleteAll: () => api.delete('/api/voyages/admin/delete-all'),
};
