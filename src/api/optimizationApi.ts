import { api } from './client';

/** Mirrors the backend's `RestrictedAreaDto` (OptimizationController). */
export interface OptimizationRestrictedAreaDto {
  id: string;
  zoneType: string;
  rings: [number, number][][];
  rpmMin?: number | null;
  rpmMax?: number | null;
  speedMaxKn?: number | null;
}

export interface OptimizationRequestApiDto {
  voyageId: string;
  vesselImo: string;
  scenarios: string[];
  etdUtc: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  loadCondition: 'Ballast' | 'Laden';
  hireRatePerDayUsd: number;
  foPriceUsdPerMt: number;
  goPriceUsdPerMt: number;
  euaPriceUsdPerTonneCo2: number;
  targetEtaUtc?: string | null;
  customWeightTime?: number | null;
  customWeightFuel?: number | null;
  customWeightEmission?: number | null;
  maxDeviationNm?: number | null;
  restrictedAreas?: OptimizationRestrictedAreaDto[];
}

export interface RouteWaypointApiDto {
  lat: number;
  lng: number;
  etaUtc: string;
  speedKn: number;
  cumulativeDistanceNm: number;
}

export interface OptimizationScenarioResultApiDto {
  scenario: string;
  isFeasible: boolean;
  infeasibleReason?: string | null;
  wasConstrainedByZones: boolean;
  waypoints: RouteWaypointApiDto[];
  etdUtc: string;
  etaUtc: string;
  distanceNm: number;
  averageSpeedKn: number;
  timeToGoHours: number;
  ecaDistanceNm: number;
  ecaTimeToGoHours: number;
  meFuelRequiredToGoMt: number;
  ecaFuelRequiredToGoMt: number;
  totalCostToGoUsd: number;
  fuelCostToGoUsd: number;
  timeCostToGoUsd: number;
  emissionsCostToGoUsd: number;
  meCo2EmissionsToGoMt: number;
}

export interface OptimizationRunResultApiDto {
  optimizationRunId: string;
  requestedAtUtc: string;
  scenarios: OptimizationScenarioResultApiDto[];
}

export interface OptimizationRunSummaryApiDto {
  optimizationRunId: string;
  requestedAtUtc: string;
  etdUtc: string;
  scenariosRequestedJson: string;
}

/**
 * Client for the native route-optimization engine (see
 * `RouteOptimizationEngine`/`OptimizationController` on the backend) — the
 * real weather/zone-aware Dijkstra-over-DAG solver that replaces the
 * client-side synthetic `generateOptimizedRoute()` for every scenario it
 * supports (all except Custom Simulation, which stays client-side since its
 * RPM/MCR/draft/GM sliders aren't modelled server-side yet).
 */
export const optimizationApi = {
  async run(request: OptimizationRequestApiDto): Promise<OptimizationRunResultApiDto> {
    return api.post<OptimizationRunResultApiDto>('/api/optimization/run', request);
  },

  async getRuns(voyageId: string): Promise<OptimizationRunSummaryApiDto[]> {
    return api.get<OptimizationRunSummaryApiDto[]>(`/api/optimization/runs?voyageId=${encodeURIComponent(voyageId)}`);
  },

  async getRun(runId: string): Promise<OptimizationRunResultApiDto> {
    return api.get<OptimizationRunResultApiDto>(`/api/optimization/runs/${encodeURIComponent(runId)}`);
  },
};
