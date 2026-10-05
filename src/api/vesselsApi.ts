import { api } from './client';

export interface VesselHistoryDto {
  id: string;
  fieldName: string;
  fromValue?: string | null;
  toValue?: string | null;
  changedBy: string;
  changedAt: string;
}

export interface BackendVesselDto {
  id: string;
  name: string;
  shortName?: string | null;
  imo: string;
  mmsi?: string | null;
  email?: string | null;
  iceClass?: string | null;
  statcode5?: string | null;
  statcode5Desc?: string | null;
  vesselType?: string | null;
  builderName?: string | null;
  builderCountry?: string | null;
  builderCode?: string | null;
  builderTown?: string | null;
  builtYear?: string | null;
  standardDesign?: string | null;
  gt?: string | null;
  lengthBp?: string | null;
  lengthOverall?: string | null;
  depth?: string | null;
  breadthMoulded?: string | null;
  deadweight?: string | null;
  displacement?: string | null;
  draught?: string | null;
  hullType?: string | null;
  holds?: string | null;
  teu?: string | null;
  gasCapacity?: string | null;
  sternLoading?: string | null;
  inertGasSystem?: string | null;
  keelLaid?: string | null;
  keelToMastHeight?: string | null;
  linesPerSide?: string | null;
  parallelBodyLength?: string | null;
  roroLanesLength?: string | null;
  engineBuilder?: string | null;
  engineDesign?: string | null;
  engineModel?: string | null;
  enginesRpm?: string | null;
  totalKwMainEng?: string | null;
  fuelConsMainEng?: string | null;
  auxEngineTotalKw?: string | null;
  generatorsKw?: string | null;
  thrustersTotalKw?: string | null;
  serviceSpeed?: string | null;
  flag?: string | null;
  owner?: string | null;
  operator?: string | null;
  classSociety?: string | null;
  isActive: boolean;
  createdAt: string;
  history: VesselHistoryDto[];

  // --- Performance profile (Vessel Profile tab) ---
  ecdisModel?: string | null;
  autoSendForecast?: string | null;
  autoSendForecastTime?: string | null;
  weather4x?: string | null;
  weather4xDuration?: string | null;
  autoSendReports?: string | null;
  scrubber?: string | null;
  scrubberType?: string | null;
  meType?: string | null;
  defaultBallastDraft?: string | null;
  defaultLadenDraft?: string | null;
  summerDraft?: string | null;
  minRpm?: string | null;
  maxRpm?: string | null;
  minMcr?: string | null;
  maxMcr?: string | null;
  minSpeed?: string | null;
  maxSpeed?: string | null;
  minPowerFraction?: string | null;
  maxPowerFraction?: string | null;
  nominalPowerFraction?: string | null;
  blowerBallastMin?: string | null;
  blowerBallastMax?: string | null;
  blowerLadenMin?: string | null;
  blowerLadenMax?: string | null;
  criticalRpmMin?: string | null;
  criticalRpmMax?: string | null;
  deadSlowRpm?: string | null;
  slowAheadRpm?: string | null;
  halfAheadRpm?: string | null;
  fullAheadRpm?: string | null;
  deadSlowSpeedBallast?: string | null;
  deadSlowSpeedLaden?: string | null;
  slowAheadSpeedBallast?: string | null;
  slowAheadSpeedLaden?: string | null;
  halfAheadSpeedBallast?: string | null;
  halfAheadSpeedLaden?: string | null;
  fullAheadSpeedBallast?: string | null;
  fullAheadSpeedLaden?: string | null;
  wslMaxSwhBallast?: string | null;
  wslMaxSwhLaden?: string | null;
  wslMaxWindsBallast?: string | null;
  wslMaxWindsLaden?: string | null;
  wslMaxSeaStateBallast?: string | null;
  wslMaxSeaStateLaden?: string | null;
}

export type CreateVesselDto = Omit<BackendVesselDto, 'id' | 'isActive' | 'createdAt' | 'history'>;
export type UpdateVesselDto = CreateVesselDto & { isActive?: boolean };

export const vesselsApi = {
  list: () => api.get<BackendVesselDto[]>('/api/vessels'),
  get: (idOrImo: string) => api.get<BackendVesselDto>(`/api/vessels/${encodeURIComponent(idOrImo)}`),
  create: (dto: CreateVesselDto) => api.post<BackendVesselDto>('/api/vessels', dto),
  update: (id: string, dto: UpdateVesselDto) => api.put<BackendVesselDto>(`/api/vessels/${id}`, dto),
  delete: (id: string) => api.delete<void>(`/api/vessels/${id}`),
};
