import { api } from './client';

export interface VesselReportDto {
  id: string;
  reportNo: string;
  reportType: string;
  reportSubtype?: string | null;
  vesselName: string;
  imo: string;
  voyageCode?: string | null;
  reportDateTime: string;
  latitude?: string | null;
  longitude?: string | null;
  currentPort?: string | null;
  nextPort?: string | null;
  etaNextPort?: string | null;
  steamingHours?: number | null;
  distanceObserved?: number | null;
  distanceEngine?: number | null;
  speedObserved?: number | null;
  speedEngine?: number | null;
  slipPercent?: number | null;
  course?: number | null;
  windDirection?: string | null;
  windForce?: number | null;
  seaState?: string | null;
  swell?: string | null;
  barometer?: number | null;
  airTemp?: number | null;
  seaTemp?: number | null;
  vlsfoCons?: number | null;
  vlsfoRob?: number | null;
  lsmgoCons?: number | null;
  lsmgoRob?: number | null;
  hfoCons?: number | null;
  hfoRob?: number | null;
  mgoCons?: number | null;
  mgoRob?: number | null;
  rpm?: number | null;
  engineKw?: number | null;
  draftFwd?: string | null;
  draftAft?: string | null;
  remarks?: string | null;
  formValuesJson?: string | null;
  formattedReportText?: string | null;
  status: string;
  createdAt: string;
}

export interface SubmitVesselReportDto {
  reportNo?: string;
  reportType?: string;
  reportSubtype?: string;
  vesselName: string;
  imo: string;
  voyageCode?: string;
  reportDateTime?: string;
  latitude?: string;
  longitude?: string;
  currentPort?: string;
  nextPort?: string;
  etaNextPort?: string;
  steamingHours?: number;
  distanceObserved?: number;
  distanceEngine?: number;
  speedObserved?: number;
  speedEngine?: number;
  slipPercent?: number;
  course?: number;
  windDirection?: string;
  windForce?: number;
  seaState?: string;
  swell?: string;
  barometer?: number;
  airTemp?: number;
  seaTemp?: number;
  vlsfoCons?: number;
  vlsfoRob?: number;
  lsmgoCons?: number;
  lsmgoRob?: number;
  hfoCons?: number;
  hfoRob?: number;
  mgoCons?: number;
  mgoRob?: number;
  rpm?: number;
  engineKw?: number;
  draftFwd?: string;
  draftAft?: string;
  remarks?: string;
  formValuesJson?: string;
  formattedReportText?: string;
  status?: string;
}

export interface VoyageProgressDto {
  voyageCode?: string | null;
  imo?: string | null;
  vesselName?: string | null;
  hasReports: boolean;
  latestReportNo?: string | null;
  reportType?: string | null;
  reportDateTime?: string | null;
  currentPort?: string | null;
  nextPort?: string | null;
  etaNextPort?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  atSea: boolean;
  stage?: string | null;
}

export const vesselReportsApi = {
  getReports: (imo?: string, voyageCode?: string) => {
    const params = new URLSearchParams();
    if (imo) params.set('imo', imo);
    if (voyageCode) params.set('voyageCode', voyageCode);
    const qs = params.toString();
    return api.get<VesselReportDto[]>(`/api/vessel-reports${qs ? `?${qs}` : ''}`);
  },
  getReport: (idOrNo: string) => api.get<VesselReportDto>(`/api/vessel-reports/${encodeURIComponent(idOrNo)}`),
  getVoyageProgress: (imo?: string, voyageCode?: string) => {
    const params = new URLSearchParams();
    if (imo) params.set('imo', imo);
    if (voyageCode) params.set('voyageCode', voyageCode);
    const qs = params.toString();
    return api.get<VoyageProgressDto>(`/api/vessel-reports/progress${qs ? `?${qs}` : ''}`);
  },
  submitReport: (dto: SubmitVesselReportDto) => api.post<VesselReportDto>('/api/vessel-reports', dto),
};
