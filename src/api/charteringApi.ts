import { api } from './client';

export interface VoyageEstimateDto {
  id: string;
  estimateNo: string;
  vesselName: string;
  fixType: string;
  status: string;
  profit: number;
  tce: number;
  commodity?: string | null;
  loadPort?: string | null;
  dischargePort?: string | null;
  quantity: number;
  freightRate: number;
  dataJson?: string | null;
  createdAt: string;
}

export interface CreateVoyageEstimateDto {
  id?: string;
  estimateNo?: string;
  vesselName: string;
  fixType?: string;
  status?: string;
  profit?: number;
  tce?: number;
  commodity?: string;
  loadPort?: string;
  dischargePort?: string;
  quantity?: number;
  freightRate?: number;
  dataJson?: string;
  bookRef?: string; // Reference to cargo or tonnage book entry
}

export interface VoyageEstimateCalculationDto {
  freight: number;
  addComm: number;
  brokerage: number;
  freightTax: number;
  linerTermTotal: number;
  seaDays: number;
  ecaDays: number;
  ladenDays: number;
  ballastDays: number;
  idleTotal: number;
  workTotal: number;
  portDays: number;
  voyageDays: number;
  distanceTotal: number;
  ecaDistanceTotal: number;
  portCharge: number;
  demTotal: number;
  desTotal: number;
  demDes: number;
  vlsfoCons: number;
  ulsfoCons: number;
  mgoCons: number;
  vlsfoExp: number;
  ulsfoExp: number;
  mgoExp: number;
  bunkerExpense: number;
  bodValue: number;
  borValue: number;
  bunkerAdj: number;
  opExpense: number;
  revenue: number;
  opProfit: number;
  netHire: number;
  totalHire: number;
  totalExpense: number;
  profit: number;
  profitPct: number;
  tce: number;
  startStr?: string;
  endStr?: string;
  perLeg: LegCalculationDto[];
}

export interface LegCalculationDto {
  sea: number;
  eca: number;
  work: number;
  dem: number;
  des: number;
  arrival?: string;
  departure?: string;
}

export interface LoadableQuantityDto {
  summerDwt: number;
  lightship: number;
  densityAtPort: number;
  deadweightAvailable: number;
  vlsfoTons: number;
  mgoTons: number;
  freshWaterTons: number;
  constantsTons: number;
  totalDeductions: number;
  loadableQuantity: number;
  constrainingPoint?: string;
  calculatedAt?: string;
}

export interface CargoBookDto {
  id: string;
  cargoCode: string;
  commodity: string;
  cargoType: string;
  quantity: string;
  tolerance: string;
  loadPort: string;
  dischargePort: string;
  loadRate?: string | null;
  dischargeRate?: string | null;
  terms?: string | null;
  laycanStart?: string | null;
  laycanEnd?: string | null;
  voyageType: string;
  openDate?: string | null;
  nominationDeadline?: string | null;
  cargoStatus: string;
  commercialStatus: string;
  pic?: string | null;
  estimationStatus: string;
  account?: string | null;
  remarks?: string | null;
  estimateId?: string | null;
  createdAt: string;
}

export interface TonnageBookDto {
  id: string;
  tonnageCode: string;
  vesselName: string;
  imo?: string | null;
  vesselType?: string | null;
  dwt?: string | null;
  flag?: string | null;
  openArea?: string | null;
  openPort?: string | null;
  openDate?: string | null;
  earliestOpen?: string | null;
  latestOpen?: string | null;
  voyageType: string;
  source: string;
  commercialStatus: string;
  pic?: string | null;
  estimationStatus: string;
  owner?: string | null;
  remarks?: string | null;
  estimateId?: string | null;
  createdAt: string;
}

// ===== Validation & Enhanced Calculation DTOs =====

export interface EstimationValidationResultDto {
  issues: ValidationIssueDto[];
}

export interface ValidationIssueDto {
  field: string;
  message: string;
  level: 'Error' | 'Warning';
}

export interface BunkerRobCalculationResultDto {
  initialFOROB: number;
  initialDOROB: number;
  finalFOROB: number;
  finalDOROB: number;
  foRobProgression: RobLegDetailDto[];
  doRobProgression: RobLegDetailDto[];
  negativeRobWarnings: string[];
  hasNegativeROB: boolean;
}

export interface RobLegDetailDto {
  legNumber: number;
  portName: string;
  openingROB: number;
  consumption: number;
  supply: number;
  closingROB: number;
  hasWarning: boolean;
}

export interface CalculationDetailResultDto {
  legDetails: LegCalculationDetailDto[];
  summary: CalculationSummaryDetailDto;
}

export interface LegCalculationDetailDto {
  legNumber: number;
  portName: string;
  portType: string;
  distance: number;
  speed: number;
  weatherFactor: number;
  effectiveSpeed: number;
  calculatedSeaDays: number;
  ecaDays: number;
  normalDays: number;
  consumptionRate: number;
  consumptionRateUnit: string;
  calculatedConsumption: number;
  fuelPrice: number;
  fuelPriceUnit: string;
  bunkerCost: number;
  portIdleDays: number;
  portWorkDays: number;
  demurrage: number;
  despatch: number;
  portCharge: number;
}

export interface CalculationSummaryDetailDto {
  totalSeaDays: number;
  ecaDays: number;
  ballastDays: number;
  ladenDays: number;
  portDays: number;
  voyageDays: number;
  totalDistance: number;
  ecaDistance: number;
  vlsfoCons: number;
  ulsfoCons: number;
  mgoCons: number;
  vlsfoPrice: number;
  ulsfoPrice: number;
  mgoPrice: number;
  vlsfoExp: number;
  ulsfoExp: number;
  mgoExp: number;
  totalBunkerExp: number;
  freight: number;
  addComm: number;
  brokerage: number;
  freightTax: number;
  totalOpExpense: number;
  revenue: number;
  opProfit: number;
  netHire: number;
  totalExpense: number;
  profit: number;
  profitPerDay: number;
  tce: number;
}

export const charteringApi = {
  getEstimates: () => api.get<VoyageEstimateDto[]>('/api/chartering/estimates'),
  upsertEstimate: (dto: CreateVoyageEstimateDto) => api.post<VoyageEstimateDto>('/api/chartering/estimates', dto),
  autoSaveEstimate: (dto: CreateVoyageEstimateDto) => api.post<VoyageEstimateDto>('/api/chartering/estimates/auto-save', dto),
  calculateEstimate: (dataJson: string) => api.post<VoyageEstimateCalculationDto>('/api/chartering/calculate', dataJson),
  calculateLoadableQuantity: (estimateDataJson: string, lqDataJson: string) =>
    api.post<LoadableQuantityDto>('/api/chartering/calculate-loadable-quantity', { estimateDataJson, lqDataJson }),
  deleteEstimate: (id: string) => api.delete<void>(`/api/chartering/estimates/${id}`),
  getCargoBook: () => api.get<CargoBookDto[]>('/api/chartering/books/cargo'),
  getTonnageBook: () => api.get<TonnageBookDto[]>('/api/chartering/books/tonnage'),
  
  // Validation & Enhanced Calculation
  validateEstimate: (dataJson: string) => api.post<EstimationValidationResultDto>('/api/chartering/validate', dataJson),
  calculateBunkerROB: (dataJson: string) => api.post<BunkerRobCalculationResultDto>('/api/chartering/calculate-rob', { dataJson }),
  getCalculationDetails: (dataJson: string) => api.post<CalculationDetailResultDto>('/api/chartering/calculate-details', dataJson),
};

