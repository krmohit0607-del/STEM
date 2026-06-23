import { useEffect, useMemo, useState } from 'react';

import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage } from '../data/selectedVoyage';
import type { Voyage } from '../data/voyages';

/**
 * Voyage Details page — `/voyage`.
 *
 * Operational dashboard mirroring the production "Voyage Details"
 * layout: a voyage summary header plus eleven numbered information
 * sections (Order & Client, Vessel Profile, Engine & Operating Limits,
 * Telegraph & M/E, Speed & Consumption, Optimization, Routing, Market
 * Factors, Voyage / Legs, Reporting & Automation and AI Settings).
 *
 * Behaviour:
 *  - Every field is seeded with per-vessel dynamic data derived from the
 *    currently selected voyage (deterministic from its `seed`), so each
 *    vessel shows a distinct, self-consistent profile.
 *  - Each card has an Edit toggle; while a card is in edit mode its
 *    fields turn into inputs. The header "Edit Voyage" enables editing
 *    on every card and "Save Voyage" turns it back off.
 *  - In "create" mode every field starts blank and editable.
 */

interface LegRow {
  no: string;
  type: string;
  from: string;
  to: string;
  etd: string;
  draft: string;
  displacement: string;
  gm: string;
  rollPeriod: string;
  maxSwh: string;
  maxWind: string;
  status: string;
}

interface SpeedRow {
  mode: string;
  speed: string;
  fuelType: string;
  dailyCons: string;
  ecaFuel: string;
  ecaDaily: string;
  altFuel: string;
  thirdDaily: string;
}

interface TeleRow {
  label: string;
  rpm: string;
}

interface WeatherRow {
  label: string;
  ballast: string;
  laden: string;
}

interface VoyageView {
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
  pricingBasis: string;
  price: string;
  team: string;
  clientEmailList: string;
  dailyFleetSummaryEmail: string;
  vesselEmail: string;
  operationsContact: string;
  emergencyContact: string;
  forecastDeliveryTime: string;
  clientNotes: string;

  // 2. Vessel profile
  mmsi: string;
  nrt: string;
  vesselType: string;
  flag: string;
  builtYear: string;
  dwt: string;
  gt: string;
  scrubber: string;
  owner: string;
  manager: string;
  ecdisModel: string;
  egcsType: string;
  ciiRating: string;
  etsApplicable: boolean;
  fuelEuApplicable: boolean;
  aisProvider: string;

  // 3. Engine & operating limits
  meType: string;
  meMode: string;
  minRpm: string;
  maxRpm: string;
  minMcr: string;
  maxMcr: string;
  minSpeed: string;
  maxSpeed: string;
  minPowerFraction: string;
  maxPowerFraction: string;
  nominalPowerFraction: string;
  criticalRpmRange: string;
  blowerRpmRange: string;
  weatherLimits: WeatherRow[];
  safetyMaxSwh: string;
  safetyMaxWind: string;

  // 4. Telegraph & M/E
  telegraph: TeleRow[];
  beams: string;
  ballastDraft: string;
  ladenDraft: string;
  summerDraft: string;
  summerDisplacement: string;
  seaTrimHeight: string;
  gm: string;
  rollPeriod: string;

  // 5. Speed & consumption
  speedRows: SpeedRow[];
  speedMargin: string;
  weatherMargin: string;
  performanceMargin: string;

  // 6. Optimization
  optimizationObjective: string;
  fuelSavingPriority: string;
  etaPriority: string;
  emissionPriority: string;
  safetyPriority: string;
  speedTolerance: string;

  // 7. Routing
  autoRouting: boolean;
  useExactRouteMatch: boolean;
  piracyAvoidance: boolean;
  iceAvoidance: boolean;
  ecaAvoidance: boolean;
  currentsConsidered: boolean;
  routeDeviationLimit: string;
  oceanCrossingMethod: string;
  routeUpdateFrequency: string;
  canalAllowed: boolean;

  // 8. Market factors
  dailyHireRate: string;
  foCost: string;
  doCost: string;
  euaCost: string;
  portCostEstimate: string;
  canalCostEstimate: string;
  brokerage: string;
  othersMisc: string;

  // 9. Legs
  legs: LegRow[];

  // 10. Reporting & automation
  dailyForecastRequired: boolean;
  interimReportRequired: boolean;
  eovReportRequired: boolean;
  arrivalReportRequired: boolean;
  departureReportRequired: boolean;
  noonMonitoringRequired: boolean;
  autoEmailReports: boolean;
  includeAttachments: boolean;
  reportsTimeZone: string;
  forecastTime: string;
  noonDeadline: string;

  // 11. AI settings
  enableAiRouting: boolean;
  enableAiEtaPrediction: boolean;
  enableAiNoonAnalysis: boolean;
  aiModel: string;
  enableAiFuelAnalysis: boolean;
  enableAiAlerts: boolean;
  enableAiEmailDrafting: boolean;
  alertSensitivity: string;
}

const CARD_IDS = [
  'order',
  'vessel',
  'engine',
  'telegraph',
  'speed',
  'optimization',
  'routing',
  'market',
  'legs',
  'reporting',
  'ai',
] as const;

const TABS = [
  { label: 'Voyage Details', icon: 'fa-route', active: true },
  { label: 'Weather Routing', icon: 'fa-cloud-sun-rain', active: false },
  { label: 'Noon Reports', icon: 'fa-clipboard-list', active: false },
  { label: 'Documents', icon: 'fa-folder-open', active: false },
  { label: 'Email Log', icon: 'fa-envelope', active: false },
  { label: 'Reports', icon: 'fa-chart-line', active: false },
  { label: 'Configuration History', icon: 'fa-clock-rotate-left', active: false },
];

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const OWNERS = [
  'Oceanic Shipping', 'Trident Marine', 'Polaris Bulk', 'Meridian Tankers',
  'Cobalt Carriers', 'Aurora Lines', 'Vanguard Maritime',
];
const MANAGERS = [
  'ABC Ship Management', 'Bernhard Schulte', 'Anglo-Eastern', 'Wallem Group',
  'Synergy Marine', 'V.Group', 'Thome Ship Management',
];
const AIS_PROVIDERS = ['MarineTraffic', 'Spire', 'exactEarth', 'ORBCOMM', 'VesselFinder'];
const ME_TYPES = [
  'MAN B&W 6S60ME-C8.2', 'MAN B&W 7S50ME-C9.5', 'Wärtsilä RT-flex58T-E',
  'MAN B&W 6G70ME-C9.5', 'WinGD W7X72', 'MAN B&W 5S60ME-C8.5',
];
const ME_MODES = ['Tier II', 'Tier III'];
const OBJECTIVES = ['Balanced', 'Fuel Saving', 'Time Critical', 'Emission Optimal'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Highest'];
const CROSSING_METHODS = ['Shortest Distance', 'Great Circle', 'Rhumb Line', 'Least Time'];
const FREQUENCIES = ['6-Hourly', '12-Hourly', 'Daily', 'On Demand'];
const SENSITIVITIES = ['Low', 'Medium', 'High'];
const TIME_ZONES = ['Vessel Local Time', 'UTC', 'Charterer Local Time'];
const AI_MODELS = ['OptiFrt AI v2.0', 'OptiFrt AI v1.8', 'NeptuneNet v3', 'Helm AI v2.1'];

/** Mulberry32 deterministic PRNG seeded by an integer. */
function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length];
}

function numFmt(n: number): string {
  return Math.round(n).toLocaleString();
}

/** Strip a trailing unit (e.g. "180,000 MT" -> "180000"). */
function toNumber(value: string): number {
  const m = value.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

function buildEmptyView(): VoyageView {
  return {
    vesselName: '',
    imo: '',
    client: '',
    serviceType: '',
    pic: '',
    status: '',
    duration: '',
    createdOn: '',
    lastUpdated: '',

    clientType: '',
    pricingBasis: '',
    price: '',
    team: '',
    clientEmailList: '',
    dailyFleetSummaryEmail: '',
    vesselEmail: '',
    operationsContact: '',
    emergencyContact: '',
    forecastDeliveryTime: '',
    clientNotes: '',

    mmsi: '',
    nrt: '',
    vesselType: '',
    flag: '',
    builtYear: '',
    dwt: '',
    gt: '',
    scrubber: '',
    owner: '',
    manager: '',
    ecdisModel: '',
    egcsType: '',
    ciiRating: '',
    etsApplicable: false,
    fuelEuApplicable: false,
    aisProvider: '',

    meType: '',
    meMode: '',
    minRpm: '',
    maxRpm: '',
    minMcr: '',
    maxMcr: '',
    minSpeed: '',
    maxSpeed: '',
    minPowerFraction: '',
    maxPowerFraction: '',
    nominalPowerFraction: '',
    criticalRpmRange: '',
    blowerRpmRange: '',
    weatherLimits: [
      { label: 'Max SWH (m)', ballast: '', laden: '' },
      { label: 'Max Wind (BF)', ballast: '', laden: '' },
      { label: 'Max Sea (DSS)', ballast: '', laden: '' },
    ],
    safetyMaxSwh: '',
    safetyMaxWind: '',

    telegraph: [
      { label: 'Beam Anchor RPM', rpm: '' },
      { label: 'Slow Ahead RPM', rpm: '' },
      { label: 'Half Ahead RPM', rpm: '' },
      { label: 'Full Ahead RPM', rpm: '' },
    ],
    beams: '',
    ballastDraft: '',
    ladenDraft: '',
    summerDraft: '',
    summerDisplacement: '',
    seaTrimHeight: '',
    gm: '',
    rollPeriod: '',

    speedRows: [
      { mode: 'ECO', speed: '', fuelType: '', dailyCons: '', ecaFuel: '', ecaDaily: '', altFuel: '', thirdDaily: '' },
      { mode: 'FULL', speed: '', fuelType: '', dailyCons: '', ecaFuel: '', ecaDaily: '', altFuel: '', thirdDaily: '' },
      { mode: 'CUSTOM', speed: '', fuelType: '', dailyCons: '', ecaFuel: '', ecaDaily: '', altFuel: '', thirdDaily: '' },
    ],
    speedMargin: '',
    weatherMargin: '',
    performanceMargin: '',

    optimizationObjective: '',
    fuelSavingPriority: '',
    etaPriority: '',
    emissionPriority: '',
    safetyPriority: '',
    speedTolerance: '',

    autoRouting: false,
    useExactRouteMatch: false,
    piracyAvoidance: false,
    iceAvoidance: false,
    ecaAvoidance: false,
    currentsConsidered: false,
    routeDeviationLimit: '',
    oceanCrossingMethod: '',
    routeUpdateFrequency: '',
    canalAllowed: false,

    dailyHireRate: '',
    foCost: '',
    doCost: '',
    euaCost: '',
    portCostEstimate: '',
    canalCostEstimate: '',
    brokerage: '',
    othersMisc: '',

    legs: [
      {
        no: 'LEG-1',
        type: '',
        from: '',
        to: '',
        etd: '',
        draft: '',
        displacement: '',
        gm: '',
        rollPeriod: '',
        maxSwh: '',
        maxWind: '',
        status: 'Planned',
      },
    ],

    dailyForecastRequired: false,
    interimReportRequired: false,
    eovReportRequired: false,
    arrivalReportRequired: false,
    departureReportRequired: false,
    noonMonitoringRequired: false,
    autoEmailReports: false,
    includeAttachments: false,
    reportsTimeZone: '',
    forecastTime: '',
    noonDeadline: '',

    enableAiRouting: false,
    enableAiEtaPrediction: false,
    enableAiNoonAnalysis: false,
    aiModel: '',
    enableAiFuelAnalysis: false,
    enableAiAlerts: false,
    enableAiEmailDrafting: false,
    alertSensitivity: '',
  };
}

/** Build a full, per-vessel dynamic view from the selected voyage. */
function buildView(v: Voyage): VoyageView {
  const rng = makeRng(v.seed * 101 + v.imo.length);
  const r: number[] = Array.from({ length: 48 }, () => rng());

  const dwtNum = toNumber(v.dwt);
  const gt = Math.round(dwtNum * (0.55 + r[0] * 0.1));
  const nrt = Math.round(gt * (0.32 + r[1] * 0.08));
  const maxRpm = toNumber(v.enginePower.replace(/.*@\s*/, '')) || Math.round(72 + r[2] * 10);
  const minRpm = Math.round(maxRpm * (0.38 + r[3] * 0.05));
  const slowAhead = Math.round(maxRpm * 0.47);
  const halfAhead = Math.round(maxRpm * 0.74);
  const beamAnchor = Math.round(maxRpm * 0.29);
  const critLo = Math.round(maxRpm * 0.46);
  const critHi = critLo + 4;
  const blowLo = Math.round(maxRpm * 0.55);
  const blowHi = Math.round(maxRpm * 0.72);
  const ladenDraft = 14 + r[4] * 7;
  const ballastDraft = ladenDraft * (0.45 + r[5] * 0.05);
  const summerDraft = ladenDraft + 0.3 + r[6] * 0.4;
  const summerDisp = Math.round(dwtNum * (1.12 + r[7] * 0.06));
  const gm = (3.6 + r[8] * 1.4).toFixed(1);
  const roll = (9 + r[9] * 4).toFixed(1);
  const ecoSpeed = v.cpSpeed;
  const ecoCons = v.cpCons;
  const fullSpeed = v.cpSpeed + 1.5 + r[10];
  const fullCons = v.cpCons + 5 + r[11] * 3;
  const customSpeed = v.instSpeed;
  const customCons = v.instCons;
  const portCost = Math.round((35_000 + r[12] * 40_000) / 1000) * 1000;
  const canalCost = Math.round((180_000 + r[13] * 260_000) / 5000) * 5000;
  const brokerage = (1 + r[14] * 2).toFixed(2);
  const othersMisc = Math.round((5_000 + r[15] * 15_000) / 1000) * 1000;
  const durationDays = (38 + r[16] * 52).toFixed(1);
  const createdDay = 1 + Math.floor(r[17] * 27);
  const createdMon = pick(MONTHS, r[18]);
  const updatedHour = String(Math.floor(r[19] * 24)).padStart(2, '0');
  const updatedMin = String(Math.floor(r[20] * 60)).padStart(2, '0');
  const mmsi = String(200_000_000 + Math.floor(r[21] * 99_000_000));
  const phone1 = `+65 9${Math.floor(100 + r[22] * 899)} ${Math.floor(1000 + r[23] * 8999)}`;
  const phone2 = `+65 9${Math.floor(100 + r[24] * 899)} ${Math.floor(1000 + r[25] * 8999)}`;
  const opsNames = ['John Smith', 'Maria Chen', 'David Okoro', 'Priya Nair', 'Lars Holm'];

  const interim = v.interimPort || v.portTo;
  const legs: LegRow[] = [
    {
      no: 'LEG-1',
      type: 'Delivery',
      from: v.portFrom,
      to: interim,
      etd: v.etdDisplay,
      draft: ballastDraft.toFixed(1),
      displacement: numFmt(summerDisp * 0.46),
      gm,
      rollPeriod: roll,
      maxSwh: '4',
      maxWind: '7',
      status: 'Active',
    },
    {
      no: 'LEG-2',
      type: 'Ballast',
      from: interim,
      to: v.portFrom,
      etd: 'TBD',
      draft: ballastDraft.toFixed(1),
      displacement: numFmt(summerDisp * 0.46),
      gm,
      rollPeriod: roll,
      maxSwh: '4',
      maxWind: '7',
      status: 'Planned',
    },
    {
      no: 'LEG-3',
      type: 'Laden',
      from: v.portFrom,
      to: v.portTo,
      etd: 'TBD',
      draft: ladenDraft.toFixed(1),
      displacement: numFmt(summerDisp),
      gm,
      rollPeriod: roll,
      maxSwh: '3.5',
      maxWind: '6',
      status: 'Planned',
    },
    {
      no: 'LEG-4',
      type: 'Redelivery',
      from: v.portTo,
      to: v.portFrom,
      etd: 'TBD',
      draft: ballastDraft.toFixed(1),
      displacement: numFmt(summerDisp * 0.46),
      gm,
      rollPeriod: roll,
      maxSwh: '4',
      maxWind: '7',
      status: 'Planned',
    },
  ];

  const opsName = pick(opsNames, r[26]);

  return {
    vesselName: v.vessel,
    imo: v.imo,
    client: v.client,
    serviceType: v.service,
    pic: v.pic,
    status: v.status,
    duration: `${durationDays} days`,
    createdOn: `${String(createdDay).padStart(2, '0')}-${createdMon}-2025`,
    lastUpdated: `${String(createdDay).padStart(2, '0')}-${createdMon}-2025 ${updatedHour}:${updatedMin} UTC`,

    clientType: r[27] > 0.5 ? 'Owner' : 'Charter',
    pricingBasis: v.pricingBasis,
    price: `${v.price.toLocaleString()} USD`,
    team: pick(['Weather Routing', 'Performance', 'Operations', 'Voyage Desk'], r[28]),
    clientEmailList: v.clientEmail,
    dailyFleetSummaryEmail: `reports@${v.clientEmail.split('@')[1] ?? 'client.example.com'}`,
    vesselEmail: `master.${v.id.toLowerCase()}@vessel.example.com`,
    operationsContact: `${opsName} · ${phone1}`,
    emergencyContact: phone2,
    forecastDeliveryTime: pick(['09:00 / 12:30', '08:00 / 12:00', '06:00 / 18:00'], r[29]),
    clientNotes: v.handoverNote ||
      'Master to send daily noon report by 12:30 LT. Use ECO speed unless instructed otherwise.',

    mmsi,
    nrt: numFmt(nrt),
    vesselType: v.vesselType,
    flag: v.flag,
    builtYear: String(v.built),
    dwt: numFmt(dwtNum),
    gt: numFmt(gt),
    scrubber: r[30] > 0.35 ? 'Yes' : 'No',
    owner: pick(OWNERS, r[31]),
    manager: pick(MANAGERS, r[32]),
    ecdisModel: v.ecdisModel,
    egcsType: pick(['Closed', 'Open', 'Hybrid'], r[33]),
    ciiRating: pick(['A', 'B', 'C', 'D'], r[34]),
    etsApplicable: r[35] > 0.3,
    fuelEuApplicable: r[36] > 0.3,
    aisProvider: pick(AIS_PROVIDERS, r[37]),

    meType: pick(ME_TYPES, r[38]),
    meMode: pick(ME_MODES, r[39]),
    minRpm: String(minRpm),
    maxRpm: String(maxRpm),
    minMcr: String(Math.round(22 + r[40] * 8)),
    maxMcr: String(Math.round(88 + r[41] * 7)),
    minSpeed: (8.5 + r[42] * 1.5).toFixed(1),
    maxSpeed: (14 + r[43] * 2).toFixed(1),
    minPowerFraction: (0.22 + r[44] * 0.08).toFixed(2),
    maxPowerFraction: (0.88 + r[45] * 0.08).toFixed(2),
    nominalPowerFraction: (0.7 + r[46] * 0.1).toFixed(2),
    criticalRpmRange: `${critLo} - ${critHi}`,
    blowerRpmRange: `${blowLo} - ${blowHi}`,
    weatherLimits: [
      { label: 'Max SWH (m)', ballast: '4', laden: '3.5' },
      { label: 'Max Wind (BF)', ballast: '7', laden: '6' },
      { label: 'Max Sea (DSS)', ballast: '5', laden: '4' },
    ],
    safetyMaxSwh: (5.5 + r[47] * 1.5).toFixed(1),
    safetyMaxWind: String(Math.round(8 + r[0] * 2)),

    telegraph: [
      { label: 'Beam Anchor RPM', rpm: String(beamAnchor) },
      { label: 'Slow Ahead RPM', rpm: String(slowAhead) },
      { label: 'Half Ahead RPM', rpm: String(halfAhead) },
      { label: 'Full Ahead RPM', rpm: String(maxRpm) },
    ],
    beams: String(Math.round(38 + r[1] * 12)),
    ballastDraft: ballastDraft.toFixed(1),
    ladenDraft: ladenDraft.toFixed(1),
    summerDraft: summerDraft.toFixed(1),
    summerDisplacement: numFmt(summerDisp),
    seaTrimHeight: (1.8 + r[2] * 1.2).toFixed(1),
    gm,
    rollPeriod: roll,

    speedRows: [
      {
        mode: 'ECO',
        speed: ecoSpeed.toFixed(1),
        fuelType: 'VLSFO',
        dailyCons: ecoCons.toFixed(1),
        ecaFuel: 'MGO',
        ecaDaily: '0.3',
        altFuel: 'BIOFUEL',
        thirdDaily: '0.1',
      },
      {
        mode: 'FULL',
        speed: fullSpeed.toFixed(1),
        fuelType: 'VLSFO',
        dailyCons: fullCons.toFixed(1),
        ecaFuel: 'MGO',
        ecaDaily: '0.3',
        altFuel: 'BIOFUEL',
        thirdDaily: '0.1',
      },
      {
        mode: 'CUSTOM',
        speed: customSpeed.toFixed(1),
        fuelType: 'VLSFO',
        dailyCons: customCons.toFixed(1),
        ecaFuel: '—',
        ecaDaily: '—',
        altFuel: '—',
        thirdDaily: '—',
      },
    ],
    speedMargin: `${Math.round(3 + r[3] * 4)} %`,
    weatherMargin: `${Math.round(8 + r[4] * 6)} %`,
    performanceMargin: `${Math.round(3 + r[5] * 4)} %`,

    optimizationObjective: pick(OBJECTIVES, r[6]),
    fuelSavingPriority: pick(PRIORITIES, r[7]),
    etaPriority: pick(PRIORITIES, r[8]),
    emissionPriority: pick(PRIORITIES, r[9]),
    safetyPriority: pick(PRIORITIES, r[10]),
    speedTolerance: (0.3 + r[11] * 0.7).toFixed(1),

    autoRouting: r[12] > 0.2,
    useExactRouteMatch: r[13] > 0.4,
    piracyAvoidance: r[14] > 0.3,
    iceAvoidance: r[15] > 0.5,
    ecaAvoidance: r[16] > 0.6,
    currentsConsidered: r[17] > 0.25,
    routeDeviationLimit: String(Math.round(15 + r[18] * 25)),
    oceanCrossingMethod: pick(CROSSING_METHODS, r[19]),
    routeUpdateFrequency: pick(FREQUENCIES, r[20]),
    canalAllowed: r[21] > 0.3,

    dailyHireRate: v.price.toLocaleString(),
    foCost: v.foCost.toLocaleString(),
    doCost: v.goCost.toLocaleString(),
    euaCost: String(v.euaCost),
    portCostEstimate: numFmt(portCost),
    canalCostEstimate: numFmt(canalCost),
    brokerage,
    othersMisc: numFmt(othersMisc),

    legs,

    dailyForecastRequired: r[22] > 0.2,
    interimReportRequired: r[23] > 0.3,
    eovReportRequired: r[24] > 0.3,
    arrivalReportRequired: r[25] > 0.2,
    departureReportRequired: r[26] > 0.2,
    noonMonitoringRequired: r[27] > 0.25,
    autoEmailReports: r[28] > 0.3,
    includeAttachments: r[29] > 0.4,
    reportsTimeZone: pick(TIME_ZONES, r[30]),
    forecastTime: pick(['09:00', '08:00', '06:00'], r[31]),
    noonDeadline: pick(['12:30', '12:00', '13:00'], r[32]),

    enableAiRouting: r[33] > 0.2,
    enableAiEtaPrediction: r[34] > 0.25,
    enableAiNoonAnalysis: r[35] > 0.3,
    aiModel: pick(AI_MODELS, r[36]),
    enableAiFuelAnalysis: r[37] > 0.3,
    enableAiAlerts: r[38] > 0.2,
    enableAiEmailDrafting: r[39] > 0.5,
    alertSensitivity: pick(SENSITIVITIES, r[40]),
  };
}

interface VoyageDetailsPageProps {
  /** "edit" shows the selected voyage; "create" starts with a blank form. */
  mode?: 'edit' | 'create';
}

export function VoyageDetailsPage({ mode = 'edit' }: VoyageDetailsPageProps = {}) {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const isCreate = mode === 'create';
  const selectedVoyage = useSelectedVoyage();
  const selectedId = selectedVoyage?.id;

  const initialView = useMemo(
    () => (isCreate || !selectedVoyage ? buildEmptyView() : buildView(selectedVoyage)),
    [isCreate, selectedVoyage],
  );

  const [view, setView] = useState<VoyageView>(initialView);
  const [editing, setEditing] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CARD_IDS.map((id) => [id, isCreate])),
  );

  // Re-seed the form whenever the selected voyage (or mode) changes.
  useEffect(() => {
    setView(isCreate || !selectedVoyage ? buildEmptyView() : buildView(selectedVoyage));
    setEditing(Object.fromEntries(CARD_IDS.map((id) => [id, isCreate])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, isCreate]);

  const ed = (id: string) => !!editing[id];
  const toggleEdit = (id: string) =>
    setEditing((prev) => ({ ...prev, [id]: !prev[id] }));
  const setAllEditing = (val: boolean) =>
    setEditing(Object.fromEntries(CARD_IDS.map((id) => [id, val])));

  const set = <K extends keyof VoyageView>(key: K, value: VoyageView[K]) =>
    setView((prev) => ({ ...prev, [key]: value }));

  const setLeg = (i: number, key: keyof LegRow, value: string) =>
    setView((prev) => ({
      ...prev,
      legs: prev.legs.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)),
    }));
  const setSpeed = (i: number, key: keyof SpeedRow, value: string) =>
    setView((prev) => ({
      ...prev,
      speedRows: prev.speedRows.map((row, idx) =>
        idx === i ? { ...row, [key]: value } : row,
      ),
    }));
  const setTele = (i: number, value: string) =>
    setView((prev) => ({
      ...prev,
      telegraph: prev.telegraph.map((row, idx) =>
        idx === i ? { ...row, rpm: value } : row,
      ),
    }));
  const setWeather = (i: number, key: 'ballast' | 'laden', value: string) =>
    setView((prev) => ({
      ...prev,
      weatherLimits: prev.weatherLimits.map((row, idx) =>
        idx === i ? { ...row, [key]: value } : row,
      ),
    }));

  const addLeg = () =>
    setView((prev) => ({
      ...prev,
      legs: [
        ...prev.legs,
        {
          no: `LEG-${prev.legs.length + 1}`,
          type: '',
          from: '',
          to: '',
          etd: '',
          draft: '',
          displacement: '',
          gm: '',
          rollPeriod: '',
          maxSwh: '',
          maxWind: '',
          status: 'Planned',
        },
      ],
    }));
  const deleteLeg = () =>
    setView((prev) =>
      prev.legs.length > 1
        ? { ...prev, legs: prev.legs.slice(0, -1) }
        : prev,
    );

  const handleSave = () => setAllEditing(false);

  return (
    <div className="fv-voyage">
      <header className="fv-voyage__header">
        <div className="fv-voyage__heading">
          <span className="fv-voyage__heading-icon" aria-hidden="true">
            <i className="fas fa-ship" />
          </span>
          <div>
            <h1>
              {isCreate
                ? t('createNewVoyage', 'New Voyage')
                : t('voyageDetails', 'Voyage Details')}
            </h1>
            <p className="fv-voyage__sub">
              {view.vesselName || '—'} · IMO {view.imo || '—'} · {view.legs.length} legs ·{' '}
              {view.duration || '—'} · Daily hire {view.dailyHireRate || '—'}
            </p>
          </div>
        </div>
        <div className="fv-voyage__header-actions">
          <button type="button" className="fv-voyage__btn" onClick={() => setAllEditing(true)}>
            <i className="fas fa-pen" aria-hidden="true" /> {t('editVoyage', 'Edit Voyage')}
          </button>
          <button type="button" className="fv-voyage__btn">
            <i className="fas fa-clone" aria-hidden="true" /> {t('cloneVoyage', 'Clone Voyage')}
          </button>
          <button type="button" className="fv-voyage__btn">
            <i className="fas fa-clock-rotate-left" aria-hidden="true" />{' '}
            {t('configurationHistory', 'Configuration History')}
          </button>
          <button type="button" className="fv-voyage__btn fv-voyage__btn--danger">
            <i className="fas fa-box-archive" aria-hidden="true" /> {t('archive', 'Archive')}
          </button>
        </div>
      </header>

      <nav className="fv-voyage__tabs" aria-label="Voyage sections">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            className={`fv-voyage__tab${tab.active ? ' fv-voyage__tab--active' : ''}`}
            aria-current={tab.active ? 'page' : undefined}
          >
            <i className={`fas ${tab.icon}`} aria-hidden="true" /> {tab.label}
          </button>
        ))}
      </nav>

      {/* VOYAGE SUMMARY (read-only roll-up) ------------------------- */}
      <Card title={t('voyageSummary', 'VOYAGE SUMMARY')} defaultCollapsed={false}>
        <div className="fv-voyage__summary">
          <Field label="Vessel Name" value={view.vesselName} editing={isCreate} onChange={(x) => set('vesselName', x)} />
          <Field label="IMO" value={view.imo} editing={isCreate} onChange={(x) => set('imo', x)} />
          <Field label="Client" value={view.client} editing={isCreate} onChange={(x) => set('client', x)} />
          <Field label="Service Type" value={view.serviceType} editing={isCreate} onChange={(x) => set('serviceType', x)} />
          <Field label="PIC" value={view.pic} editing={isCreate} onChange={(x) => set('pic', x)} />
          <Field
            label="Status"
            value={view.status}
            editing={isCreate}
            onChange={(x) => set('status', x)}
            display={view.status ? <Badge tone="active">{view.status}</Badge> : '—'}
          />
          <Info label="Voyage Duration" value={view.duration} />
          <Info label="No. of Legs" value={String(view.legs.length)} />
          <Info label="Created On" value={view.createdOn} />
          <Info label="Last Updated" value={view.lastUpdated} />
        </div>
      </Card>

      {/* 1. ORDER & CLIENT INFORMATION ------------------------------ */}
      <Card
        number={1}
        title={t('orderClientInformation', 'ORDER & CLIENT INFORMATION')}
        editing={ed('order')}
        onToggleEdit={() => toggleEdit('order')}
      >
        <div className="fv-voyage__cols fv-voyage__cols--3">
          <div className="fv-voyage__col">
            <Field label="Service Type" value={view.serviceType} editing={ed('order')} onChange={(x) => set('serviceType', x)} />
            <Field label="Client Name" value={view.client} editing={ed('order')} onChange={(x) => set('client', x)} />
            <Field label="Client Type" value={view.clientType} editing={ed('order')} onChange={(x) => set('clientType', x)} />
            <Field label="Pricing Basis" value={view.pricingBasis} editing={ed('order')} onChange={(x) => set('pricingBasis', x)} />
            <Field label="Price" value={view.price} editing={ed('order')} onChange={(x) => set('price', x)} />
            <Field label="PIC" value={view.pic} editing={ed('order')} onChange={(x) => set('pic', x)} />
            <Field label="Team" value={view.team} editing={ed('order')} onChange={(x) => set('team', x)} />
            <Field
              label="Status"
              value={view.status}
              editing={ed('order')}
              onChange={(x) => set('status', x)}
              display={view.status ? <Badge tone="active">{view.status}</Badge> : '—'}
            />
          </div>
          <div className="fv-voyage__col">
            <Field label="Client Email List" value={view.clientEmailList} editing={ed('order')} onChange={(x) => set('clientEmailList', x)} />
            <Field label="Daily Fleet Summary Email" value={view.dailyFleetSummaryEmail} editing={ed('order')} onChange={(x) => set('dailyFleetSummaryEmail', x)} />
            <Field label="Vessel Email" value={view.vesselEmail} editing={ed('order')} onChange={(x) => set('vesselEmail', x)} />
            <Field label="Operations Contact" value={view.operationsContact} editing={ed('order')} onChange={(x) => set('operationsContact', x)} />
            <Field label="Emergency Contact" value={view.emergencyContact} editing={ed('order')} onChange={(x) => set('emergencyContact', x)} />
            <Field label="Forecast Delivery Time (LT)" value={view.forecastDeliveryTime} editing={ed('order')} onChange={(x) => set('forecastDeliveryTime', x)} />
          </div>
          <div className="fv-voyage__col">
            <span className="fv-voyage__info-label">Client Notes / Instructions</span>
            {ed('order') ? (
              <textarea
                className="fv-voyage__textarea"
                rows={5}
                value={view.clientNotes}
                onChange={(e) => set('clientNotes', e.target.value)}
              />
            ) : (
              <p className="fv-voyage__notes">{view.clientNotes || '—'}</p>
            )}
          </div>
        </div>
      </Card>

      {/* 2. VESSEL PROFILE ----------------------------------------- */}
      <Card
        number={2}
        title={t('vesselProfile', 'VESSEL PROFILE')}
        editing={ed('vessel')}
        onToggleEdit={() => toggleEdit('vessel')}
      >
        <div className="fv-voyage__cols fv-voyage__cols--4">
          <div className="fv-voyage__col">
            <Field label="Vessel Name" value={view.vesselName} editing={ed('vessel')} onChange={(x) => set('vesselName', x)} />
            <Field label="IMO" value={view.imo} editing={ed('vessel')} onChange={(x) => set('imo', x)} />
            <Field label="MMSI" value={view.mmsi} editing={ed('vessel')} onChange={(x) => set('mmsi', x)} />
            <Field label="NRT" value={view.nrt} editing={ed('vessel')} onChange={(x) => set('nrt', x)} />
            <Field label="Vessel Type" value={view.vesselType} editing={ed('vessel')} onChange={(x) => set('vesselType', x)} />
            <Field label="Flag" value={view.flag} editing={ed('vessel')} onChange={(x) => set('flag', x)} />
            <Field label="Built Year" value={view.builtYear} editing={ed('vessel')} onChange={(x) => set('builtYear', x)} />
          </div>
          <div className="fv-voyage__col">
            <Field label="DWT (MT)" value={view.dwt} editing={ed('vessel')} onChange={(x) => set('dwt', x)} />
            <Field label="GT" value={view.gt} editing={ed('vessel')} onChange={(x) => set('gt', x)} />
            <Field label="Scrubber" value={view.scrubber} editing={ed('vessel')} onChange={(x) => set('scrubber', x)} />
            <Field label="Owner" value={view.owner} editing={ed('vessel')} onChange={(x) => set('owner', x)} />
            <Field label="Manager" value={view.manager} editing={ed('vessel')} onChange={(x) => set('manager', x)} />
          </div>
          <div className="fv-voyage__col">
            <Field label="ECDIS Model" value={view.ecdisModel} editing={ed('vessel')} onChange={(x) => set('ecdisModel', x)} />
            <Field label="Vessel Email" value={view.vesselEmail} editing={ed('vessel')} onChange={(x) => set('vesselEmail', x)} />
            <Field label="EGCS Type" value={view.egcsType} editing={ed('vessel')} onChange={(x) => set('egcsType', x)} />
            <Field
              label="CII Rating"
              value={view.ciiRating}
              editing={ed('vessel')}
              onChange={(x) => set('ciiRating', x)}
              display={view.ciiRating ? <Badge tone="ok">{view.ciiRating}</Badge> : '—'}
            />
          </div>
          <div className="fv-voyage__col">
            <BoolField label="ETS Applicable" value={view.etsApplicable} editing={ed('vessel')} onChange={(b) => set('etsApplicable', b)} />
            <BoolField label="FuelEU Applicable" value={view.fuelEuApplicable} editing={ed('vessel')} onChange={(b) => set('fuelEuApplicable', b)} />
            <Field label="AIS Provider" value={view.aisProvider} editing={ed('vessel')} onChange={(x) => set('aisProvider', x)} />
          </div>
        </div>
      </Card>

      {/* 3. ENGINE & OPERATING LIMITS ------------------------------ */}
      <Card
        number={3}
        title={t('engineOperatingLimits', 'ENGINE & OPERATING LIMITS')}
        editing={ed('engine')}
        onToggleEdit={() => toggleEdit('engine')}
      >
        <div className="fv-voyage__cols fv-voyage__cols--3">
          <div className="fv-voyage__col">
            <h4 className="fv-voyage__subhead">Engine Limits</h4>
            <Field label="M/E Type" value={view.meType} editing={ed('engine')} onChange={(x) => set('meType', x)} />
            <Field label="M/E Mode" value={view.meMode} editing={ed('engine')} onChange={(x) => set('meMode', x)} />
            <Field label="Min RPM" value={view.minRpm} editing={ed('engine')} onChange={(x) => set('minRpm', x)} />
            <Field label="Max RPM" value={view.maxRpm} editing={ed('engine')} onChange={(x) => set('maxRpm', x)} />
            <Field label="Min MCR (%)" value={view.minMcr} editing={ed('engine')} onChange={(x) => set('minMcr', x)} />
            <Field label="Max MCR (%)" value={view.maxMcr} editing={ed('engine')} onChange={(x) => set('maxMcr', x)} />
            <Field label="Min Speed (kt)" value={view.minSpeed} editing={ed('engine')} onChange={(x) => set('minSpeed', x)} />
            <Field label="Max Speed (kt)" value={view.maxSpeed} editing={ed('engine')} onChange={(x) => set('maxSpeed', x)} />
          </div>
          <div className="fv-voyage__col">
            <h4 className="fv-voyage__subhead">&nbsp;</h4>
            <Field label="Min Power Fraction" value={view.minPowerFraction} editing={ed('engine')} onChange={(x) => set('minPowerFraction', x)} />
            <Field label="Max Power Fraction" value={view.maxPowerFraction} editing={ed('engine')} onChange={(x) => set('maxPowerFraction', x)} />
            <Field label="Nominal Power Fraction" value={view.nominalPowerFraction} editing={ed('engine')} onChange={(x) => set('nominalPowerFraction', x)} />
            <Field label="Critical RPM Range" value={view.criticalRpmRange} editing={ed('engine')} onChange={(x) => set('criticalRpmRange', x)} />
            <Field label="Blower RPM Range" value={view.blowerRpmRange} editing={ed('engine')} onChange={(x) => set('blowerRpmRange', x)} />
            <Field label="Scrubber" value={view.scrubber} editing={ed('engine')} onChange={(x) => set('scrubber', x)} />
            <Field label="EGCS Type" value={view.egcsType} editing={ed('engine')} onChange={(x) => set('egcsType', x)} />
          </div>
          <div className="fv-voyage__col">
            <h4 className="fv-voyage__subhead">Weather Limits</h4>
            <table className="fv-voyage__dtable">
              <thead>
                <tr>
                  <th>Condition</th>
                  <th>Ballast</th>
                  <th>Laden</th>
                </tr>
              </thead>
              <tbody>
                {view.weatherLimits.map((row, i) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>
                      <Cell editing={ed('engine')} value={row.ballast} onChange={(x) => setWeather(i, 'ballast', x)} />
                    </td>
                    <td>
                      <Cell editing={ed('engine')} value={row.laden} onChange={(x) => setWeather(i, 'laden', x)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h4 className="fv-voyage__subhead">Safety Limits</h4>
            <Field label="Max SWH (m)" value={view.safetyMaxSwh} editing={ed('engine')} onChange={(x) => set('safetyMaxSwh', x)} />
            <Field label="Max Wind Speed (BF)" value={view.safetyMaxWind} editing={ed('engine')} onChange={(x) => set('safetyMaxWind', x)} />
          </div>
        </div>
      </Card>

      {/* 4. TELEGRAPH TABLE & M/E DETAILS -------------------------- */}
      <Card
        number={4}
        title={t('telegraphMeDetails', 'TELEGRAPH TABLE & M/E DETAILS')}
        editing={ed('telegraph')}
        onToggleEdit={() => toggleEdit('telegraph')}
      >
        <div className="fv-voyage__cols fv-voyage__cols--3">
          <div className="fv-voyage__col">
            <h4 className="fv-voyage__subhead">Telegraph Table</h4>
            <table className="fv-voyage__dtable">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>RPM</th>
                </tr>
              </thead>
              <tbody>
                {view.telegraph.map((row, i) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>
                      <Cell editing={ed('telegraph')} value={row.rpm} onChange={(x) => setTele(i, x)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="fv-voyage__col">
            <h4 className="fv-voyage__subhead">M/E Details</h4>
            <Field label="M/E Type" value={view.meType} editing={ed('telegraph')} onChange={(x) => set('meType', x)} />
            <Field label="M/E Mode" value={view.meMode} editing={ed('telegraph')} onChange={(x) => set('meMode', x)} />
            <Field label="Beams (m)" value={view.beams} editing={ed('telegraph')} onChange={(x) => set('beams', x)} />
            <Field label="Ballast Draft (m)" value={view.ballastDraft} editing={ed('telegraph')} onChange={(x) => set('ballastDraft', x)} />
          </div>
          <div className="fv-voyage__col">
            <h4 className="fv-voyage__subhead">&nbsp;</h4>
            <Field label="Laden Draft (m)" value={view.ladenDraft} editing={ed('telegraph')} onChange={(x) => set('ladenDraft', x)} />
            <Field label="Summer Draft (m)" value={view.summerDraft} editing={ed('telegraph')} onChange={(x) => set('summerDraft', x)} />
            <Field label="Summer Displacement (MT)" value={view.summerDisplacement} editing={ed('telegraph')} onChange={(x) => set('summerDisplacement', x)} />
            <Field label="Sea Trim Height (m)" value={view.seaTrimHeight} editing={ed('telegraph')} onChange={(x) => set('seaTrimHeight', x)} />
            <Field label="GM (m)" value={view.gm} editing={ed('telegraph')} onChange={(x) => set('gm', x)} />
            <Field label="Roll Period (s)" value={view.rollPeriod} editing={ed('telegraph')} onChange={(x) => set('rollPeriod', x)} />
          </div>
        </div>
      </Card>

      {/* 5. SPEED & CONSUMPTION MATRIX ----------------------------- */}
      <Card
        number={5}
        title={t('speedConsumptionMatrix', 'SPEED & CONSUMPTION MATRIX')}
        editing={ed('speed')}
        onToggleEdit={() => toggleEdit('speed')}
      >
        <div className="fv-voyage__table-scroll">
          <table className="fv-voyage__dtable fv-voyage__dtable--wide">
            <thead>
              <tr>
                <th>Mode</th>
                <th>Speed (kt)</th>
                <th>Fuel Type</th>
                <th>Daily Cons (MT)</th>
                <th>ECA Fuel</th>
                <th>ECA Daily (MT)</th>
                <th>Alt Fuel</th>
                <th>3rd Daily (MT)</th>
              </tr>
            </thead>
            <tbody>
              {view.speedRows.map((row, i) => (
                <tr key={row.mode}>
                  <td>{row.mode}</td>
                  <td><Cell editing={ed('speed')} value={row.speed} onChange={(x) => setSpeed(i, 'speed', x)} /></td>
                  <td><Cell editing={ed('speed')} value={row.fuelType} onChange={(x) => setSpeed(i, 'fuelType', x)} /></td>
                  <td><Cell editing={ed('speed')} value={row.dailyCons} onChange={(x) => setSpeed(i, 'dailyCons', x)} /></td>
                  <td><Cell editing={ed('speed')} value={row.ecaFuel} onChange={(x) => setSpeed(i, 'ecaFuel', x)} /></td>
                  <td><Cell editing={ed('speed')} value={row.ecaDaily} onChange={(x) => setSpeed(i, 'ecaDaily', x)} /></td>
                  <td><Cell editing={ed('speed')} value={row.altFuel} onChange={(x) => setSpeed(i, 'altFuel', x)} /></td>
                  <td><Cell editing={ed('speed')} value={row.thirdDaily} onChange={(x) => setSpeed(i, 'thirdDaily', x)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="fv-voyage__margins">
          <Field label="Speed Margin" value={view.speedMargin} editing={ed('speed')} onChange={(x) => set('speedMargin', x)} inline />
          <Field label="Weather Margin" value={view.weatherMargin} editing={ed('speed')} onChange={(x) => set('weatherMargin', x)} inline />
          <Field label="Performance Margin" value={view.performanceMargin} editing={ed('speed')} onChange={(x) => set('performanceMargin', x)} inline />
        </div>
      </Card>

      {/* 6. OPTIMIZATION SETTINGS ---------------------------------- */}
      <Card
        number={6}
        title={t('optimizationSettings', 'OPTIMIZATION SETTINGS')}
        editing={ed('optimization')}
        onToggleEdit={() => toggleEdit('optimization')}
      >
        <div className="fv-voyage__cols fv-voyage__cols--2">
          <div className="fv-voyage__col">
            <Field label="Optimization Objective" value={view.optimizationObjective} editing={ed('optimization')} onChange={(x) => set('optimizationObjective', x)} />
            <Field label="Fuel Saving Priority" value={view.fuelSavingPriority} editing={ed('optimization')} onChange={(x) => set('fuelSavingPriority', x)} />
            <Field label="ETA Priority" value={view.etaPriority} editing={ed('optimization')} onChange={(x) => set('etaPriority', x)} />
          </div>
          <div className="fv-voyage__col">
            <Field label="Emission Priority" value={view.emissionPriority} editing={ed('optimization')} onChange={(x) => set('emissionPriority', x)} />
            <Field label="Safety Priority" value={view.safetyPriority} editing={ed('optimization')} onChange={(x) => set('safetyPriority', x)} />
            <Field label="Speed Tolerance (+/- kt)" value={view.speedTolerance} editing={ed('optimization')} onChange={(x) => set('speedTolerance', x)} />
          </div>
        </div>
      </Card>

      {/* 7. ROUTING SETTINGS --------------------------------------- */}
      <Card
        number={7}
        title={t('routingSettings', 'ROUTING SETTINGS')}
        editing={ed('routing')}
        onToggleEdit={() => toggleEdit('routing')}
      >
        <div className="fv-voyage__cols fv-voyage__cols--2">
          <div className="fv-voyage__col">
            <BoolField label="Auto Routing" value={view.autoRouting} editing={ed('routing')} onChange={(b) => set('autoRouting', b)} />
            <BoolField label="Use Exact Route Match" value={view.useExactRouteMatch} editing={ed('routing')} onChange={(b) => set('useExactRouteMatch', b)} />
            <BoolField label="Piracy Avoidance" value={view.piracyAvoidance} editing={ed('routing')} onChange={(b) => set('piracyAvoidance', b)} />
            <BoolField label="Ice Avoidance" value={view.iceAvoidance} editing={ed('routing')} onChange={(b) => set('iceAvoidance', b)} />
            <BoolField label="ECA Avoidance" value={view.ecaAvoidance} editing={ed('routing')} onChange={(b) => set('ecaAvoidance', b)} />
          </div>
          <div className="fv-voyage__col">
            <BoolField label="Currents Considered" value={view.currentsConsidered} editing={ed('routing')} onChange={(b) => set('currentsConsidered', b)} />
            <Field label="Route Deviation Limit (nm)" value={view.routeDeviationLimit} editing={ed('routing')} onChange={(x) => set('routeDeviationLimit', x)} />
            <Field label="Ocean Crossing Method" value={view.oceanCrossingMethod} editing={ed('routing')} onChange={(x) => set('oceanCrossingMethod', x)} />
            <Field label="Route Update Frequency" value={view.routeUpdateFrequency} editing={ed('routing')} onChange={(x) => set('routeUpdateFrequency', x)} />
            <BoolField label="Canal Allowed" value={view.canalAllowed} editing={ed('routing')} onChange={(b) => set('canalAllowed', b)} />
          </div>
        </div>
      </Card>

      {/* 8. MARKET FACTORS ----------------------------------------- */}
      <Card
        number={8}
        title={t('marketFactors', 'MARKET FACTORS')}
        editing={ed('market')}
        onToggleEdit={() => toggleEdit('market')}
      >
        <div className="fv-voyage__cols fv-voyage__cols--2">
          <div className="fv-voyage__col">
            <Field label="Daily Hire Rate (USD)" value={view.dailyHireRate} editing={ed('market')} onChange={(x) => set('dailyHireRate', x)} />
            <Field label="FO Cost (USD/MT)" value={view.foCost} editing={ed('market')} onChange={(x) => set('foCost', x)} />
            <Field label="DO Cost (USD/MT)" value={view.doCost} editing={ed('market')} onChange={(x) => set('doCost', x)} />
            <Field label="EUA Cost (USD/MT CO₂)" value={view.euaCost} editing={ed('market')} onChange={(x) => set('euaCost', x)} />
          </div>
          <div className="fv-voyage__col">
            <Field label="Port Cost Estimate (USD)" value={view.portCostEstimate} editing={ed('market')} onChange={(x) => set('portCostEstimate', x)} />
            <Field label="Canal Cost Estimate (USD)" value={view.canalCostEstimate} editing={ed('market')} onChange={(x) => set('canalCostEstimate', x)} />
            <Field label="Brokerage (%)" value={view.brokerage} editing={ed('market')} onChange={(x) => set('brokerage', x)} />
            <Field label="Others / Misc. (USD)" value={view.othersMisc} editing={ed('market')} onChange={(x) => set('othersMisc', x)} />
          </div>
        </div>
      </Card>

      {/* 9. VOYAGE / LEGS ------------------------------------------ */}
      <Card
        number={9}
        title={t('voyageLegs', 'VOYAGE / LEGS')}
        editing={ed('legs')}
        onToggleEdit={() => toggleEdit('legs')}
      >
        <div className="fv-voyage__table-scroll">
          <table className="fv-voyage__dtable fv-voyage__dtable--wide">
            <thead>
              <tr>
                <th>Leg</th>
                <th>Type</th>
                <th>Port From</th>
                <th>Port To</th>
                <th>ETD (Local Time)</th>
                <th>Draft (m)</th>
                <th>Displacement (MT)</th>
                <th>GM (m)</th>
                <th>Roll Period (s)</th>
                <th>Max SWH (m)</th>
                <th>Max Wind (BF)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {view.legs.map((leg, i) => (
                <tr key={leg.no}>
                  <td>{leg.no}</td>
                  <td><Cell editing={ed('legs')} value={leg.type} onChange={(x) => setLeg(i, 'type', x)} /></td>
                  <td><Cell editing={ed('legs')} value={leg.from} onChange={(x) => setLeg(i, 'from', x)} /></td>
                  <td><Cell editing={ed('legs')} value={leg.to} onChange={(x) => setLeg(i, 'to', x)} /></td>
                  <td><Cell editing={ed('legs')} value={leg.etd} onChange={(x) => setLeg(i, 'etd', x)} /></td>
                  <td><Cell editing={ed('legs')} value={leg.draft} onChange={(x) => setLeg(i, 'draft', x)} /></td>
                  <td><Cell editing={ed('legs')} value={leg.displacement} onChange={(x) => setLeg(i, 'displacement', x)} /></td>
                  <td><Cell editing={ed('legs')} value={leg.gm} onChange={(x) => setLeg(i, 'gm', x)} /></td>
                  <td><Cell editing={ed('legs')} value={leg.rollPeriod} onChange={(x) => setLeg(i, 'rollPeriod', x)} /></td>
                  <td><Cell editing={ed('legs')} value={leg.maxSwh} onChange={(x) => setLeg(i, 'maxSwh', x)} /></td>
                  <td><Cell editing={ed('legs')} value={leg.maxWind} onChange={(x) => setLeg(i, 'maxWind', x)} /></td>
                  <td>
                    {ed('legs') ? (
                      <Cell editing value={leg.status} onChange={(x) => setLeg(i, 'status', x)} />
                    ) : (
                      <Badge tone={leg.status === 'Active' ? 'active' : 'planned'}>
                        {leg.status}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="fv-voyage__leg-actions">
          <button type="button" className="fv-voyage__btn" onClick={addLeg}>
            <i className="fas fa-plus" aria-hidden="true" /> Add Leg
          </button>
          <button type="button" className="fv-voyage__btn">
            <i className="fas fa-compress-arrows-alt" aria-hidden="true" /> Merge Selected
          </button>
          <button type="button" className="fv-voyage__btn">
            <i className="fas fa-code-branch" aria-hidden="true" /> Split Selected
          </button>
          <button type="button" className="fv-voyage__btn fv-voyage__btn--danger" onClick={deleteLeg}>
            <i className="fas fa-trash" aria-hidden="true" /> Delete Leg
          </button>
        </div>
      </Card>

      {/* 10. REPORTING & AUTOMATION -------------------------------- */}
      <Card
        number={10}
        title={t('reportingAutomation', 'REPORTING & AUTOMATION')}
        editing={ed('reporting')}
        onToggleEdit={() => toggleEdit('reporting')}
      >
        <div className="fv-voyage__cols fv-voyage__cols--2">
          <div className="fv-voyage__col">
            <BoolField label="Daily Forecast Required" value={view.dailyForecastRequired} editing={ed('reporting')} onChange={(b) => set('dailyForecastRequired', b)} />
            <BoolField label="Interim Report Required" value={view.interimReportRequired} editing={ed('reporting')} onChange={(b) => set('interimReportRequired', b)} />
            <BoolField label="EOV Report Required" value={view.eovReportRequired} editing={ed('reporting')} onChange={(b) => set('eovReportRequired', b)} />
            <BoolField label="Arrival Report Required" value={view.arrivalReportRequired} editing={ed('reporting')} onChange={(b) => set('arrivalReportRequired', b)} />
            <BoolField label="Departure Report Required" value={view.departureReportRequired} editing={ed('reporting')} onChange={(b) => set('departureReportRequired', b)} />
          </div>
          <div className="fv-voyage__col">
            <BoolField label="Noon Monitoring Required" value={view.noonMonitoringRequired} editing={ed('reporting')} onChange={(b) => set('noonMonitoringRequired', b)} />
            <BoolField label="Auto Email Reports" value={view.autoEmailReports} editing={ed('reporting')} onChange={(b) => set('autoEmailReports', b)} />
            <BoolField label="Include Attachments" value={view.includeAttachments} editing={ed('reporting')} onChange={(b) => set('includeAttachments', b)} />
            <Field label="Reports Time Zone" value={view.reportsTimeZone} editing={ed('reporting')} onChange={(x) => set('reportsTimeZone', x)} />
            <Field label="Forecast Time (LT)" value={view.forecastTime} editing={ed('reporting')} onChange={(x) => set('forecastTime', x)} />
            <Field label="Noon Deadline (LT)" value={view.noonDeadline} editing={ed('reporting')} onChange={(x) => set('noonDeadline', x)} />
          </div>
        </div>
      </Card>

      {/* 11. AI SETTINGS ------------------------------------------- */}
      <Card
        number={11}
        title={t('aiSettings', 'AI SETTINGS')}
        editing={ed('ai')}
        onToggleEdit={() => toggleEdit('ai')}
      >
        <div className="fv-voyage__cols fv-voyage__cols--2">
          <div className="fv-voyage__col">
            <BoolField label="Enable AI Routing" value={view.enableAiRouting} editing={ed('ai')} onChange={(b) => set('enableAiRouting', b)} />
            <BoolField label="Enable AI ETA Prediction" value={view.enableAiEtaPrediction} editing={ed('ai')} onChange={(b) => set('enableAiEtaPrediction', b)} />
            <BoolField label="Enable AI Noon Analysis" value={view.enableAiNoonAnalysis} editing={ed('ai')} onChange={(b) => set('enableAiNoonAnalysis', b)} />
            <Field label="AI Model" value={view.aiModel} editing={ed('ai')} onChange={(x) => set('aiModel', x)} />
          </div>
          <div className="fv-voyage__col">
            <BoolField label="Enable AI Fuel Analysis" value={view.enableAiFuelAnalysis} editing={ed('ai')} onChange={(b) => set('enableAiFuelAnalysis', b)} />
            <BoolField label="Enable AI Alerts" value={view.enableAiAlerts} editing={ed('ai')} onChange={(b) => set('enableAiAlerts', b)} />
            <BoolField label="Enable AI Email Drafting" value={view.enableAiEmailDrafting} editing={ed('ai')} onChange={(b) => set('enableAiEmailDrafting', b)} />
            <Field label="Alert Sensitivity" value={view.alertSensitivity} editing={ed('ai')} onChange={(x) => set('alertSensitivity', x)} />
          </div>
        </div>
      </Card>

      <footer className="fv-voyage__footer">
        <button
          type="button"
          className="fv-voyage__btn fv-voyage__btn--primary"
          onClick={handleSave}
        >
          <i className="fas fa-save" aria-hidden="true" /> {t('saveVoyage', 'Save Voyage')}
        </button>
      </footer>
    </div>
  );
}

interface CardProps {
  number?: number;
  title: string;
  editing?: boolean;
  onToggleEdit?: () => void;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}

function Card({
  number,
  title,
  editing,
  onToggleEdit,
  defaultCollapsed = true,
  children,
}: CardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <section className={`fv-voyage__card${collapsed ? ' fv-voyage__card--collapsed' : ''}`}>
      <header className="fv-voyage__card-head">
        <h2 className="fv-voyage__card-title">
          {number != null && <span className="fv-voyage__card-num">{number}.</span>}
          {title}
        </h2>
        <div className="fv-voyage__card-actions">
          {onToggleEdit && (
            <button
              type="button"
              className={`fv-voyage__edit-btn${editing ? ' fv-voyage__edit-btn--active' : ''}`}
              onClick={onToggleEdit}
            >
              <i className={`fas ${editing ? 'fa-check' : 'fa-pen'}`} aria-hidden="true" />{' '}
              {editing ? 'Done' : 'Edit'}
            </button>
          )}
          <button
            type="button"
            className="fv-voyage__collapse-btn"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand' : 'Minimize'}
          >
            <i
              className={`fas ${collapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </header>
      {!collapsed && <div className="fv-voyage__card-body">{children}</div>}
    </section>
  );
}

interface InfoProps {
  label: string;
  value: React.ReactNode;
}

function Info({ label, value }: InfoProps) {
  return (
    <div className="fv-voyage__info">
      <span className="fv-voyage__info-label">{label}</span>
      <span className="fv-voyage__info-value">{value || '—'}</span>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
  inline?: boolean;
  display?: React.ReactNode;
}

function Field({ label, value, editing, onChange, inline, display }: FieldProps) {
  return (
    <div className={`fv-voyage__info${inline ? ' fv-voyage__info--inline' : ''}`}>
      <span className="fv-voyage__info-label">{label}</span>
      {editing ? (
        <input
          className="fv-voyage__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <span className="fv-voyage__info-value">{display ?? (value || '—')}</span>
      )}
    </div>
  );
}

interface BoolFieldProps {
  label: string;
  value: boolean;
  editing: boolean;
  onChange: (value: boolean) => void;
}

function BoolField({ label, value, editing, onChange }: BoolFieldProps) {
  return (
    <div className="fv-voyage__info">
      <span className="fv-voyage__info-label">{label}</span>
      {editing ? (
        <select
          className="fv-voyage__input"
          value={value ? 'Yes' : 'No'}
          onChange={(e) => onChange(e.target.value === 'Yes')}
        >
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      ) : (
        <YesNo on={value} />
      )}
    </div>
  );
}

interface CellProps {
  editing: boolean;
  value: string;
  onChange: (value: string) => void;
}

function Cell({ editing, value, onChange }: CellProps) {
  if (!editing) return <>{value || '—'}</>;
  return (
    <input
      className="fv-voyage__cell-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function YesNo({ on }: { on: boolean }) {
  return (
    <span className={`fv-voyage__pill ${on ? 'fv-voyage__pill--on' : 'fv-voyage__pill--off'}`}>
      <i className={`fas ${on ? 'fa-check' : 'fa-xmark'}`} aria-hidden="true" />
      {on ? 'Yes' : 'No'}
    </span>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: 'active' | 'planned' | 'ok';
  children: React.ReactNode;
}) {
  return <span className={`fv-voyage__badge fv-voyage__badge--${tone}`}>{children}</span>;
}
