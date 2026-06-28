/** Shared types for the Voyage Details page and its section components. */

export interface SpeedConsRow {
  description: string;
  speed: string;
  fuelType1: string;
  dailyCons1: string;
  fuelType2: string;
  dailyCons2: string;
  fuelType3: string;
  dailyCons3: string;
}

/** A row in the vessel-level Speed & Cons profile (per load condition). */
export interface EngineSpeedConsRow {
  condition: string;
  speed: string;
  consME: string;
  consAE: string;
  rpm: string;
  mcrPercent: string;
  powerKw: string;
  eplLimit: string;
}

/**
 * A sub-segment / intermediate port within a main leg. The `from` port is
 * always derived from the previous segment's `to` (chained automatically).
 */
export interface SubLeg {
  type: string;
  from: string;
  to: string;
  etd: string;
  autoRoute: boolean;
  // CP details / good-weather criteria (per sub-leg / intermediate port).
  cpWinds: string;
  cpDss: string;
  cpSwh: string;
  cpMinHours: string;
  cpCurrents: string;
  cpGoodWeatherSelection: string;
}

export interface LegRow {
  no: string;
  name: string;
  type: string;
  from: string;
  to: string;
  etd: string;
  status: string;
  etdLocalTime: boolean;
  autoRoute: boolean;
  draft: string;
  displacement: string;
  gm: string;
  rollPeriod: string;
  // Optional sub-legs / intermediate ports within this main leg.
  subLegs: SubLeg[];
  // Weather safety limits
  maxSwh: string;
  maxWind: string;
  maxSeaState: string;
  // CP details — good weather details
  cpWinds: string;
  cpDss: string;
  cpSwh: string;
  cpMinHours: string;
  cpCurrents: string;
  cpAllowableFuelMethod: string;
  cpGoodWeatherSelection: string;
  cpAboutSpeed: string;
  cpTimeGain: string;
  cpTimeLoss: string;
  // Speed & cons profile (per leg)
  speedCons: SpeedConsRow[];
}

/** A single audit-log entry recording one change made to the voyage. */
export interface ChangeRecord {
  /** User who made the change. */
  user: string;
  /** Date & time the change was made. */
  timestamp: string;
  /** Description of the information that was changed. */
  change: string;
  /** Value before the change. */
  before: string;
  /** Value after the change. */
  after: string;
}

export interface VoyageView {
  // Summary / header
  vesselName: string;
  imo: string;
  client: string;
  serviceType: string;
  pic: string;
  status: string;
  duration: string;
  createdOn: string;
  lastUpdated: string;

  // 1. Order & client
  clientType: string;
  emissionReportRequired: boolean;
  pricingBasis: string;
  price: string;
  clientEmailList: string;
  dailyFleetSummaryEmail: string;
  clientNotes: string;

  // 2. Vessel profile
  vesselType: string;
  flag: string;
  vesselEmail: string;
  ecdisModel: string;
  autoSendForecast: boolean;
  autoSendForecastTime: string;
  weather4x: boolean;
  weather4xDuration: string;
  autoSendReports: boolean;

  // 2a. Engine & limits (speed & cons profile)
  minRpm: string;
  maxRpm: string;
  minMcr: string;
  maxMcr: string;
  minSpeed: string;
  maxSpeed: string;
  minPowerFraction: string;
  maxPowerFraction: string;
  nominalPowerFraction: string;
  // Blower on-off RPM range (min/max per load condition)
  blowerBallastMin: string;
  blowerBallastMax: string;
  blowerLadenMin: string;
  blowerLadenMax: string;
  // Critical RPM range
  criticalRpmMin: string;
  criticalRpmMax: string;
  // Scrubber
  scrubber: boolean;
  scrubberType: string;

  // 2b. Telegraph table
  deadSlowRpm: string;
  slowAheadRpm: string;
  halfAheadRpm: string;
  fullAheadRpm: string;

  // 2c. M/E & dimensions
  meType: string;
  meModel: string;
  loa: string;
  beam: string;
  defaultBallastDraft: string;
  defaultLadenDraft: string;
  summerDraft: string;
  summerDisplacement: string;
  summerDeadweight: string;

  // 2d. Vessel-level speed & cons profile
  engineSpeedCons: EngineSpeedConsRow[];

  // 2e. Weather safety limits (ballast / laden)
  wslMaxSwhBallast: string;
  wslMaxSwhLaden: string;
  wslMaxWindsBallast: string;
  wslMaxWindsLaden: string;
  wslMaxSeaStateBallast: string;
  wslMaxSeaStateLaden: string;

  // 4. Optimization
  optMode: string;
  optObjective: string;
  optTargetEta: string;
  optTargetSpeed: string;
  optMinSpeed: string;
  optMaxSpeed: string;
  optWeatherRouting: boolean;
  optAvoidEca: boolean;
  optFuelPriceVlsfo: string;
  optFuelPriceLsmgo: string;
  optCiiTarget: string;

  // 5. Notes
  operationalNotes: string;
  masterRemarks: string;
  internalNotes: string;

  // 6. Configuration history (audit log of every change to the voyage)
  changeHistory: ChangeRecord[];

  // 9. Legs
  legs: LegRow[];
}

/** Card ids that drive the per-section edit toggles. */
export const CARD_IDS = ['order', 'vessel', 'legs', 'voyageNotes'] as const;

/** Excel-defined dropdown option lists. */
export const SERVICE_TYPE_OPTIONS = [
  'RPM',
  'PMO',
  'Weather Only',
  'WP Only Guidance',
  'Optimization',
  'Shadow Monitoring',
  'Emissions',
];
export const CLIENT_TYPE_OPTIONS = ['Owner', 'Charter'];
export const PRICING_BASIS_OPTIONS = ['Per Day', 'Per Voyage', 'Per Month', 'As Agreed'];
export const VESSEL_TYPE_OPTIONS = [
  'Bulk Carrier',
  'Oil/Chemical Tanker',
  'Container',
  'Ro-Ro',
  'Passenger',
  'Navy',
  'Tug',
];
export const LEG_VOYAGE_TYPE_OPTIONS = ['Delivery', 'Ballast', 'Laden', 'Redelivery'];
export const LEG_STATUS_OPTIONS = ['Planning', 'Active', 'Complete'];
export const OPTIMIZATION_MODE_OPTIONS = [
  'Min Fuel',
  'Min Time',
  'Min Cost',
  'Constant Speed',
  'Constant Power',
  'ECO',
];
export const FUEL_TYPE_OPTIONS = ['VLSFO', 'LSMGO', 'HSFO', 'MDO', 'MGO', 'LNG', 'Biogas', 'Methanol'];
export const SCRUBBER_TYPE_OPTIONS = ['Open Loop', 'Closed Loop'];
export const ME_TYPE_OPTIONS = ['2-Stroke', '4-Stroke'];
