import { api } from './client';

export interface EmissionsRecordDto {
  id: string;
  voyageCode: string;
  vesselName: string;
  complianceYear: string;
  trade?: string | null;
  euaPriceEur: string;
  co2AdjustmentT: string;
  complianceJson?: string | null;
  adjustmentsJson?: string | null;
  approvedBy?: string | null;
  approvedDate?: string | null;
  metricsJson?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface SaveEmissionsRecordDto {
  voyageCode: string;
  vesselName?: string;
  complianceYear?: string;
  trade?: string;
  euaPriceEur?: string;
  co2AdjustmentT?: string;
  complianceJson?: string;
  adjustmentsJson?: string;
  approvedBy?: string;
  approvedDate?: string;
  metricsJson?: string;
}

export interface EmissionsScenarioDto {
  id: string;
  voyageCode: string;
  name: string;
  inputsJson?: string | null;
  metricsJson?: string | null;
  notes?: string | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface SaveEmissionsScenarioDto {
  voyageCode: string;
  name: string;
  inputsJson?: string;
  metricsJson?: string;
  notes?: string;
  createdByName?: string;
}

export const emissionsApi = {
  list: () => api.get<EmissionsRecordDto[]>('/api/emissions'),
  getByVoyage: (voyageCode: string) => api.get<EmissionsRecordDto>(`/api/emissions/${encodeURIComponent(voyageCode)}`),
  save: (dto: SaveEmissionsRecordDto) => api.post<EmissionsRecordDto>('/api/emissions', dto),
  listScenarios: (voyageCode: string) => api.get<EmissionsScenarioDto[]>(`/api/emissions/scenarios/${encodeURIComponent(voyageCode)}`),
  createScenario: (dto: SaveEmissionsScenarioDto) => api.post<EmissionsScenarioDto>('/api/emissions/scenarios', dto),
  updateScenario: (id: string, dto: SaveEmissionsScenarioDto) => api.put<EmissionsScenarioDto>(`/api/emissions/scenarios/${id}`, dto),
  deleteScenario: (id: string) => api.delete<void>(`/api/emissions/scenarios/${id}`),
};
