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

export interface OptimizationOperatingProfileApiDto {
  mode: string;
  isCpDefault: boolean;
  loadCondition: 'Ballast' | 'Laden';
  speedKn: number;
  rpm?: number | null;
  powerKw?: number | null;
  mcrPercent?: number | null;
  fuelType1: string;
  dailyCons1Mt: number;
  fuelType2: string;
  dailyCons2Mt: number;
  fuelType3: string;
  dailyCons3Mt: number;
}

export interface OptimizationRequestApiDto {
  voyageId: string;
  vesselImo: string;
  /** Used to find the vessel when the IMO is empty or not registered. */
  vesselName?: string;
  /** The voyage's own DWT; lets the run proceed when the vessel is not in the vessel master. */
  deadweightMt?: number;
  scenarios: string[];
  etdUtc: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  /** WGS84 GeoJSON positions in [longitude, latitude] order. */
  routeCoordinates: [number, number][];
  loadCondition: 'Ballast' | 'Laden';
  /** ACTUAL (server default) uses observed noon-report performance; CP uses the configured Speed & Cons rows. */
  performanceBasis?: 'ACTUAL' | 'CP';
  operatingProfiles: OptimizationOperatingProfileApiDto[];
  hireRatePerDayUsd: number;
  foPriceUsdPerMt: number;
  goPriceUsdPerMt: number;
  euaPriceUsdPerTonneCo2: number;
  arrivalRule: 'ON' | 'BETWEEN' | 'BEFORE' | 'AFTER';
  targetEtaUtc?: string | null;
  arrivalWindowEndUtc?: string | null;
  customWeightTime?: number | null;
  customWeightFuel?: number | null;
  customWeightEmission?: number | null;
  customRpmMin?: number | null;
  customRpmMax?: number | null;
  customMcrMin?: number | null;
  customMcrMax?: number | null;
  /** Custom Simulation hydrostatic inputs (draft only feeds the roll-period estimate; displacement scales power and fuel). */
  customDraftM?: number | null;
  customDisplacementMt?: number | null;
  customGmM?: number | null;
  /** Custom Simulation required time of arrival (UTC ISO). */
  customRtaUtc?: string | null;
  rollPeriodSec?: number | null;
  /** The voyage's weather margin (%); the latest ETA uses average speed x (1 - WM%). */
  weatherMarginPct?: number | null;
  minReserveVlsfoMt?: number | null;
  minReserveLsmgoMt?: number | null;
  robVlsfoMt?: number | null;
  robLsmgoMt?: number | null;
  rankingWeights?: { time: number; fuel: number; cost: number; emissions: number; weather: number } | null;
  maxDeviationNm?: number | null;
  /** Wall-clock budget per scenario for the detailed search; the best coarse-stage route is returned when it is reached. */
  solverTimeLimitSeconds?: number | null;
  /** Re-sail each chosen route over wind ensemble members for a partial ETA/fuel/cost distribution. */
  includeEnsemble?: boolean;
  restrictedAreas?: OptimizationRestrictedAreaDto[];
}

export interface RouteWaypointApiDto {
  lat: number;
  lng: number;
  etaUtc: string;
  /** Speed over ground on the leg ending at this waypoint. */
  speedKn: number;
  cumulativeDistanceNm: number;
  rpm?: number | null;
  powerKw?: number | null;
  fuelRateMtPerDay?: number | null;
  robVlsfoMt?: number | null;
  robLsmgoMt?: number | null;
}

export interface BunkerPortOptionApiDto {
  port: string;
  country: string;
  lat: number;
  lng: number;
  distanceOffRouteNm: number;
  extraDistanceNm: number;
  extraHours: number;
  extraFuelMt: number;
  extraCostUsd: number;
  alongRouteNm: number;
  etaAtClosestPointUtc: string;
  robVlsfoAtPointMt?: number | null;
  robLsmgoAtPointMt?: number | null;
  hasBookedSupply: boolean;
}

export interface SegmentAuditApiDto {
  index: number;
  kind: 'Sail' | 'Wait';
  startUtc: string;
  endUtc: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  distanceNm: number;
  hours: number;
  stwKn: number;
  sogKn: number;
  setting: string;
  powerMode: string;
  rpm?: number | null;
  powerKw?: number | null;
  loadPct?: number | null;
  mainEngineFuelMt: number;
  mainEngineGrade: string;
  auxFuelMt: number;
  auxGrade: string;
  co2Mt: number;
  chargeableCo2Mt: number;
  windKn: number;
  windFromDeg: number;
  waveM: number;
  waveFromDeg: number;
  currentKn: number;
  currentToDeg: number;
  inEca: boolean;
  exposureScore: number;
  exceedsVesselWeatherLimit: boolean;
  robVlsfoEndMt?: number | null;
  robLsmgoEndMt?: number | null;
}

export interface FuelGradeTotalApiDto {
  grade: string;
  mt: number;
  co2Mt: number;
  costUsd: number;
  emissionFactor: number;
}

export interface EmissionsChargeApiDto {
  totalCo2Mt: number;
  chargeableCo2Mt: number;
  voyageClassification: string;
  coveragePct: number;
  phaseIn: string;
  basis: string;
}

export interface SavingsApiDto {
  baseline: string;
  baselineEtaUtc: string;
  baselineTimeHours: number;
  baselineFuelMt: number;
  baselineCostUsd: number;
  baselineCo2Mt: number;
  fuelSavedMt: number;
  costSavedUsd: number;
  timeSavedHours: number;
  co2SavedMt: number;
}

export interface SolverStatusApiDto {
  status: 'Completed' | 'TimeLimitReached' | 'Infeasible';
  method: string;
  timeLimitSeconds: number;
  elapsedMs: number;
  stage1ElapsedMs: number;
  stage2ElapsedMs: number;
  segmentEvaluations: number;
  stage1Settings: number;
  stage2Settings: number;
  stage2Nodes: number;
  waitingStepsInRoute: number;
  notes: string[];
}

export interface UncertaintyApiDto {
  source: string;
  members: number;
  partial: boolean;
  etaP10Utc?: string | null;
  etaP50Utc?: string | null;
  etaP90Utc?: string | null;
  fuelP10Mt: number;
  fuelP50Mt: number;
  fuelP90Mt: number;
  costP10Usd: number;
  costP50Usd: number;
  costP90Usd: number;
  probabilityMissTargetEta?: number | null;
  probabilityReserveShortfall?: number | null;
  notes: string[];
}

export interface EtsPolicyApiDto {
  intraEuCoveragePct: number;
  extraEuCoveragePct: number;
  unknownCoveragePct: number;
  phaseIn: { year: number; pct: number }[];
  isConfigured: boolean;
}

export interface PerformanceCalibrationApiDto {
  id: string;
  vesselImo: string;
  loadCondition: string;
  modelVersion: string;
  fittedAtUtc: string;
  sampleCount: number;
  usedSampleCount: number;
  windowFromUtc?: string | null;
  windowToUtc?: string | null;
  fuelFactor: number;
  spreadPct: number;
  trendPctPerMonth?: number | null;
  quality: 'Good' | 'Limited' | 'Insufficient';
  status: 'Proposed' | 'Approved' | 'Rejected' | 'Superseded';
  notes: string[];
  monthly: { month: string; samples: number; factor: number }[];
  reviewedAtUtc?: string | null;
}

export interface OptimizationAnalysisApiDto {
  performanceBasis: string;
  modelVersion: string;
  /** Which speed-power model produced the result, with its valid range and validation status. */
  performanceModel: string;
  forecastSource: string;
  forecastValidFromUtc?: string | null;
  forecastValidToUtc?: string | null;
  forecastFetchedAtUtc?: string | null;
  weatherDelayHours: number;
  etaEarliestUtc?: string | null;
  etaLatestUtc?: string | null;
  etaRangeBasis?: string | null;
  maxEngineLoadPct?: number | null;
  hoursOverVesselWeatherLimit: number;
  hoursSynchronousRollRisk: number;
  hoursParametricRollRisk: number;
  hoursPitchResonanceRisk: number;
  hoursPowerBoosted: number;
  weatherExposureScore: number;
  totalFuelMt: number;
  startRobVlsfoMt?: number | null;
  startRobLsmgoMt?: number | null;
  arrivalRobVlsfoMt?: number | null;
  arrivalRobLsmgoMt?: number | null;
  reserveSatisfied?: boolean | null;
  suppliesApplied: string[];
  suppliesNotCounted: string[];
  bunkerPortOptions: BunkerPortOptionApiDto[];
  bunkerPortBasis?: string | null;
  paretoRank: number;
  isParetoOptimal: boolean;
  rankingScore?: number | null;
  rankingExplanation?: string | null;
  solver: SolverStatusApiDto;
  savings?: SavingsApiDto | null;
  emissions?: EmissionsChargeApiDto | null;
  fuelByGrade: FuelGradeTotalApiDto[];
  uncertainty?: UncertaintyApiDto | null;
  calibrationApplied?: string | null;
  segments: SegmentAuditApiDto[];
}

export interface OptimizationScenarioResultApiDto {
  scenario: string;
  isFeasible: boolean;
  infeasibleReason?: string | null;
  warnings?: string[];
  analysis?: OptimizationAnalysisApiDto;
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

export interface OptimizationJobStatusApiDto {
  jobId: string;
  status: 'Queued' | 'Running' | 'Completed' | 'Failed' | 'Cancelled';
  percent: number;
  stage: string;
  error?: string | null;
  result?: OptimizationRunResultApiDto | null;
}

export interface OptimizationCheckRequestApiDto {
  scenario?: string | null;
  positionLat?: number | null;
  positionLng?: number | null;
  positionTimeUtc?: string | null;
  speedKn?: number | null;
  robVlsfoMt?: number | null;
  robLsmgoMt?: number | null;
  timeDeviationThresholdHours?: number;
  crossTrackThresholdNm?: number;
  robDeviationThresholdPct?: number;
  forecastAgeThresholdHours?: number;
  cooldownMinutes?: number;
}

export interface OptimizationCheckResultApiDto {
  runId: string;
  scenario: string;
  voyageId: string;
  source: string;
  crossTrackNm?: number | null;
  scheduleDeviationHours?: number | null;
  plannedEtaUtc?: string | null;
  projectedEtaUtc?: string | null;
  reasons: string[];
  notes: string[];
  reoptimizeRecommended: boolean;
  recommendationAction: 'none' | 'created' | 'updated' | 'suppressed';
  recommendationId?: string | null;
}

export interface OptimizationRecommendationApiDto {
  id: string;
  runId: string;
  scenario: string;
  voyageId: string;
  status: 'Pending' | 'Confirmed' | 'Dismissed';
  reasons: string[];
  createdAtUtc: string;
  lastEvaluatedAtUtc: string;
  resolvedAtUtc?: string | null;
}

export interface PerformanceComparisonApiDto {
  runId: string;
  scenario: string;
  voyageId: string;
  points: {
    timeUtc: string;
    actualSpeedKn?: number | null;
    predictedSogKn?: number | null;
    actualRpm?: number | null;
    predictedRpm?: number | null;
    actualPowerKw?: number | null;
    predictedPowerKw?: number | null;
    actualFuelMtPerDay?: number | null;
    predictedFuelMtPerDay?: number | null;
    actualRobVlsfoMt?: number | null;
    predictedRobVlsfoMt?: number | null;
  }[];
  speedBiasKn?: number | null;
  speedMeanAbsErrorKn?: number | null;
  rpmBias?: number | null;
  powerBiasKw?: number | null;
  fuelBiasMtPerDay?: number | null;
  fuelBiasPct?: number | null;
  robVlsfoBiasMt?: number | null;
  trend: {
    month: string;
    rpm: number;
    samples: number;
    medianCalmSpeedKn: number;
    medianPowerKw?: number | null;
    medianMainFuelMtPerDay: number;
  }[];
  notes: string[];
}

/**
 * Client for the native route-optimization engine (see
 * `RouteOptimizationEngine`/`OptimizationController` on the backend). Runs are
 * started as background jobs so progress can be shown and a run cancelled.
 */
export const optimizationApi = {
  async run(request: OptimizationRequestApiDto): Promise<OptimizationRunResultApiDto> {
    return api.post<OptimizationRunResultApiDto>('/api/optimization/run', request);
  },

  async startJob(request: OptimizationRequestApiDto): Promise<OptimizationJobStatusApiDto> {
    return api.post<OptimizationJobStatusApiDto>('/api/optimization/jobs', request);
  },

  async getJob(jobId: string): Promise<OptimizationJobStatusApiDto> {
    return api.get<OptimizationJobStatusApiDto>(`/api/optimization/jobs/${encodeURIComponent(jobId)}`);
  },

  async cancelJob(jobId: string): Promise<void> {
    await api.delete<boolean>(`/api/optimization/jobs/${encodeURIComponent(jobId)}`);
  },

  /** Compare the voyage's latest tracksheet report with its latest run; may raise an operator-confirmable suggestion. */
  async checkVoyage(voyageId: string, request: OptimizationCheckRequestApiDto = {}): Promise<OptimizationCheckResultApiDto> {
    return api.post<OptimizationCheckResultApiDto>(`/api/optimization/voyages/${encodeURIComponent(voyageId)}/check`, request);
  },

  async getRecommendations(voyageId: string, status?: string): Promise<OptimizationRecommendationApiDto[]> {
    const suffix = status ? `&status=${encodeURIComponent(status)}` : '';
    return api.get<OptimizationRecommendationApiDto[]>(`/api/optimization/recommendations?voyageId=${encodeURIComponent(voyageId)}${suffix}`);
  },

  async confirmRecommendation(id: string): Promise<OptimizationRecommendationApiDto> {
    return api.post<OptimizationRecommendationApiDto>(`/api/optimization/recommendations/${encodeURIComponent(id)}/confirm`);
  },

  async dismissRecommendation(id: string): Promise<OptimizationRecommendationApiDto> {
    return api.post<OptimizationRecommendationApiDto>(`/api/optimization/recommendations/${encodeURIComponent(id)}/dismiss`);
  },

  async getPerformanceComparison(runId: string, scenario?: string): Promise<PerformanceComparisonApiDto> {
    const suffix = scenario ? `?scenario=${encodeURIComponent(scenario)}` : '';
    return api.get<PerformanceComparisonApiDto>(`/api/optimization/runs/${encodeURIComponent(runId)}/performance-comparison${suffix}`);
  },

  async getEtsPolicy(): Promise<EtsPolicyApiDto> {
    return api.get<EtsPolicyApiDto>('/api/optimization/ets-policy');
  },

  async saveEtsPolicy(policy: EtsPolicyApiDto): Promise<EtsPolicyApiDto> {
    return api.put<EtsPolicyApiDto>('/api/optimization/ets-policy', policy);
  },

  async fitCalibration(request: {
    vesselImo: string;
    loadCondition: 'Ballast' | 'Laden';
    operatingProfiles: OptimizationOperatingProfileApiDto[];
  }): Promise<PerformanceCalibrationApiDto> {
    return api.post<PerformanceCalibrationApiDto>('/api/optimization/calibrations/fit', request);
  },

  async getCalibrations(vesselImo: string, loadCondition?: string): Promise<PerformanceCalibrationApiDto[]> {
    const suffix = loadCondition ? `&loadCondition=${encodeURIComponent(loadCondition)}` : '';
    return api.get<PerformanceCalibrationApiDto[]>(`/api/optimization/calibrations?vesselImo=${encodeURIComponent(vesselImo)}${suffix}`);
  },

  async approveCalibration(id: string): Promise<PerformanceCalibrationApiDto> {
    return api.post<PerformanceCalibrationApiDto>(`/api/optimization/calibrations/${encodeURIComponent(id)}/approve`);
  },

  async rejectCalibration(id: string): Promise<PerformanceCalibrationApiDto> {
    return api.post<PerformanceCalibrationApiDto>(`/api/optimization/calibrations/${encodeURIComponent(id)}/reject`);
  },

  async getRuns(voyageId: string): Promise<OptimizationRunSummaryApiDto[]> {
    return api.get<OptimizationRunSummaryApiDto[]>(`/api/optimization/runs?voyageId=${encodeURIComponent(voyageId)}`);
  },

  async getRun(runId: string): Promise<OptimizationRunResultApiDto> {
    return api.get<OptimizationRunResultApiDto>(`/api/optimization/runs/${encodeURIComponent(runId)}`);
  },
};
