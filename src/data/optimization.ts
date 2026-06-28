/**
 * Optimization Studio data model and loader.
 *
 * Every field consumed by `OptimizationStudioPage` comes from the
 * `OptimizationData` object returned by `getOptimizationData()`. The
 * loader currently resolves a stub payload after a short delay to mimic
 * a network round-trip, but the page never reads hard-coded values
 * directly — so wiring a real backend is a one-line change: replace the
 * body of `getOptimizationData()` with a `fetch(...)` (or API client)
 * call that returns the same `OptimizationData` shape.
 */

export type WeatherRisk = 'Very Low' | 'Low' | 'Medium' | 'High';

export interface VoyageDetails {
  fromName: string;
  fromCode: string;
  toName: string;
  toCode: string;
  departureUtc: string;
  currentPositionUtc: string;
  livePosition: boolean;
  distanceNm: string;
  draft: string;
  displacement: string;
}

export interface SelectOption {
  id: string;
  label: string;
}

export interface AdvancedCriteriaGroup {
  id: string;
  label: string;
}

export interface EtaConstraints {
  requiredArrivalLocal: string;
  timeWindow: string;
  priority: string;
  priorityOptions: SelectOption[];
  timeWindowOptions: SelectOption[];
}

export interface FuelRobSettings {
  fuelPrices: { fo: string; mgo: string; bio: string };
  robAtDeparture: { fo: string; mgo: string; reservePct: string };
}

export interface WeatherLayer {
  id: string;
  label: string;
  on: boolean;
}

export interface LegendEntry {
  id: string;
  label: string;
  color: string;
  dashed?: boolean;
}

export interface RouteOption {
  id: string;
  name: string;
  recommended?: boolean;
  selected?: boolean;
  score: number;
  scoreColor: string;
  etaLocal: string;
  totalCost: string;
  fuel: string;
  weatherRisk: WeatherRisk;
  co2: string;
  distance: string;
  /** Colour used for the route polyline and legend swatch. */
  color: string;
  dashed?: boolean;
  /** Geographic waypoints [lat, lon] drawn on the map. */
  path: Array<[number, number]>;
}

export interface EtaTableRow {
  wf: string;
  avgSpeed: string;
  ttg: string;
  etaUtc: string;
  etaLocal: string;
  delayVsCp: string;
  delayTone: 'pos' | 'neg' | 'neutral';
}

export interface SpeedFuelPoint {
  speed: number;
  fuelMt: number;
  costK: number;
}

export interface KeySummary {
  totalDistance: string;
  totalTime: string;
  avgSpeed: string;
  totalFuelFo: string;
  totalFuelMgo: string;
  totalCost: string;
  co2Emissions: string;
  weatherRisk: WeatherRisk;
}

export interface AiRecommendation {
  objectiveLabel: string;
  routeName: string;
  headline: string;
  bullets: string[];
  confidence: number;
}

export interface TimelineState {
  startUtc: string;
  endUtc: string;
  currentUtc: string;
  speedMultiplier: number;
}

export interface OptimizationData {
  title: string;
  subtitle: string;
  voyage: VoyageDetails;
  objectives: SelectOption[];
  selectedObjectiveId: string;
  weightingLabel: string;
  advancedCriteria: AdvancedCriteriaGroup[];
  etaConstraints: EtaConstraints;
  fuelRob: FuelRobSettings;
  speedStrategies: SelectOption[];
  selectedSpeedStrategyId: string;
  weatherLayers: WeatherLayer[];
  legend: LegendEntry[];
  routeOptions: RouteOption[];
  sortOptions: SelectOption[];
  selectedSortId: string;
  etaTable: EtaTableRow[];
  speedFuelCurve: SpeedFuelPoint[];
  keySummary: KeySummary;
  aiRecommendation: AiRecommendation;
  timeline: TimelineState;
}

/** Build a Singapore → Santos style path, offset per route for variety. */
function buildPath(latOffset: number, lonOffset: number): Array<[number, number]> {
  const base: Array<[number, number]> = [
    [1.3, 103.8],
    [-4, 96],
    [-14, 84],
    [-24, 70],
    [-31, 52],
    [-35, 33],
    [-35.5, 18],
    [-33, 2],
    [-30, -16],
    [-27, -32],
    [-24.5, -42],
    [-23.96, -46.33],
  ];
  return base.map(([lat, lon], i) => {
    // Taper the offset toward the fixed endpoints.
    const t = Math.sin((i / (base.length - 1)) * Math.PI);
    return [lat + latOffset * t, lon + lonOffset * t];
  });
}

const STUB_DATA: OptimizationData = {
  title: 'Voyage Optimization Studio',
  subtitle: 'Weather routing • Optimize, Compare & Decide',
  voyage: {
    fromName: 'Singapore',
    fromCode: 'SGSIN',
    toName: 'Santos, Brazil',
    toCode: 'BRSSZ',
    departureUtc: '24 Jun 2026 23:00',
    currentPositionUtc: '24 Jun 2026 12:00',
    livePosition: true,
    distanceNm: '9,862 NM',
    draft: '11.2 m',
    displacement: '82,000 MT',
  },
  objectives: [
    { id: 'lowest-cost', label: 'Lowest Total Cost' },
    { id: 'fastest-eta', label: 'Fastest ETA' },
    { id: 'lowest-fuel', label: 'Lowest Fuel' },
    { id: 'lowest-emissions', label: 'Lowest Emissions' },
    { id: 'safest', label: 'Safest Route' },
  ],
  selectedObjectiveId: 'lowest-cost',
  weightingLabel: 'Customize Weights',
  advancedCriteria: [
    { id: 'engine-speed', label: 'Engine & Speed' },
    { id: 'weather-sea', label: 'Weather & Sea' },
    { id: 'commercial', label: 'Commercial' },
    { id: 'environmental', label: 'Environmental' },
    { id: 'operational', label: 'Operational' },
  ],
  etaConstraints: {
    requiredArrivalLocal: '30 Jun 2026 10:00',
    timeWindow: '± 3 hours',
    priority: 'High',
    priorityOptions: [
      { id: 'low', label: 'Low' },
      { id: 'medium', label: 'Medium' },
      { id: 'high', label: 'High' },
    ],
    timeWindowOptions: [
      { id: '1h', label: '± 1 hour' },
      { id: '3h', label: '± 3 hours' },
      { id: '6h', label: '± 6 hours' },
      { id: '12h', label: '± 12 hours' },
    ],
  },
  fuelRob: {
    fuelPrices: { fo: '620', mgo: '980', bio: '820' },
    robAtDeparture: { fo: '1,120', mgo: '180', reservePct: '5' },
  },
  speedStrategies: [
    { id: 'full', label: 'Full' },
    { id: 'eco', label: 'ECO' },
    { id: 'cp-speed', label: 'CP Speed' },
    { id: 'variable', label: 'Variable' },
    { id: 'ai-optimized', label: 'AI Optimized' },
  ],
  selectedSpeedStrategyId: 'variable',
  weatherLayers: [
    { id: 'wind', label: 'Wind', on: true },
    { id: 'waves', label: 'Waves', on: true },
    { id: 'swell', label: 'Swell', on: true },
    { id: 'currents', label: 'Currents', on: true },
    { id: 'pressure', label: 'Pressure', on: false },
    { id: 'precipitation', label: 'Precipitation', on: false },
  ],
  legend: [
    { id: 'balanced', label: 'Optimized (Balanced)', color: '#3b82f6' },
    { id: 'fastest', label: 'Fastest ETA', color: '#22c55e' },
    { id: 'lowest-fuel', label: 'Lowest Fuel', color: '#f59e0b' },
    { id: 'safest', label: 'Safest Route', color: '#a855f7' },
    { id: 'actual', label: 'Actual Route', color: '#94a3b8', dashed: true },
  ],
  routeOptions: [
    {
      id: '01',
      name: 'Balanced',
      recommended: true,
      selected: true,
      score: 96,
      scoreColor: '#22c55e',
      etaLocal: '30 Jun 10:05',
      totalCost: '$164,250',
      fuel: '522.4 MT',
      weatherRisk: 'Very Low',
      co2: '1,680 MT',
      distance: '9,862 NM',
      color: '#3b82f6',
      path: buildPath(0, 0),
    },
    {
      id: '02',
      name: 'Fastest ETA',
      score: 89,
      scoreColor: '#eab308',
      etaLocal: '29 Jun 04:30',
      totalCost: '$170,680',
      fuel: '551.7 MT',
      weatherRisk: 'Medium',
      co2: '1,780 MT',
      distance: '9,812 NM',
      color: '#22c55e',
      path: buildPath(5, -3),
    },
    {
      id: '03',
      name: 'Lowest Fuel',
      score: 93,
      scoreColor: '#22c55e',
      etaLocal: '01 Jul 04:15',
      totalCost: '$159,430',
      fuel: '501.2 MT',
      weatherRisk: 'Low',
      co2: '1,620 MT',
      distance: '10,124 NM',
      color: '#f59e0b',
      path: buildPath(-6, 4),
    },
    {
      id: '04',
      name: 'Safest Route',
      score: 91,
      scoreColor: '#22c55e',
      etaLocal: '02 Jul 08:40',
      totalCost: '$167,890',
      fuel: '515.6 MT',
      weatherRisk: 'Very Low',
      co2: '1,650 MT',
      distance: '10,386 NM',
      color: '#a855f7',
      path: buildPath(-11, -2),
    },
    {
      id: '05',
      name: 'CP Speed (ECO)',
      score: 88,
      scoreColor: '#eab308',
      etaLocal: '01 Jul 11:20',
      totalCost: '$160,780',
      fuel: '509.8 MT',
      weatherRisk: 'Low',
      co2: '1,610 MT',
      distance: '9,902 NM',
      color: '#06b6d4',
      path: buildPath(9, 5),
    },
  ],
  sortOptions: [
    { id: 'overall', label: 'Overall Score' },
    { id: 'cost', label: 'Total Cost' },
    { id: 'eta', label: 'ETA' },
    { id: 'fuel', label: 'Fuel' },
  ],
  selectedSortId: 'overall',
  etaTable: [
    {
      wf: '0% (CP Speed)',
      avgSpeed: '14.50',
      ttg: '28d 16h',
      etaUtc: '30 Jun 00:05',
      etaLocal: '30 Jun 10:05',
      delayVsCp: '—',
      delayTone: 'neutral',
    },
    {
      wf: '-5% (Head Sea)',
      avgSpeed: '13.78',
      ttg: '29d 23h',
      etaUtc: '01 Jul 07:20',
      etaLocal: '01 Jul 17:20',
      delayVsCp: '+31h 15m',
      delayTone: 'neg',
    },
    {
      wf: '+5% (Tail Sea)',
      avgSpeed: '15.22',
      ttg: '27d 14h',
      etaUtc: '29 Jun 14:10',
      etaLocal: '29 Jun 24:10',
      delayVsCp: '-19h 55m',
      delayTone: 'pos',
    },
    {
      wf: '+10% (Favorable)',
      avgSpeed: '15.95',
      ttg: '26d 16h',
      etaUtc: '29 Jun 01:05',
      etaLocal: '29 Jun 11:05',
      delayVsCp: '-23h 00m',
      delayTone: 'pos',
    },
  ],
  speedFuelCurve: [
    { speed: 10, fuelMt: 320, costK: 40 },
    { speed: 11, fuelMt: 360, costK: 70 },
    { speed: 12, fuelMt: 410, costK: 100 },
    { speed: 13, fuelMt: 465, costK: 130 },
    { speed: 14, fuelMt: 522, costK: 164 },
    { speed: 15, fuelMt: 590, costK: 195 },
    { speed: 16, fuelMt: 660, costK: 215 },
    { speed: 17, fuelMt: 700, costK: 200 },
    { speed: 18, fuelMt: 690, costK: 175 },
  ],
  keySummary: {
    totalDistance: '9,862 NM',
    totalTime: '28d 16h',
    avgSpeed: '14.50 kts',
    totalFuelFo: '522.4 MT',
    totalFuelMgo: '16.7 MT',
    totalCost: '$164,250',
    co2Emissions: '1,680 MT',
    weatherRisk: 'Very Low',
  },
  aiRecommendation: {
    objectiveLabel: 'Lowest Total Cost',
    routeName: 'Route 01 Balanced',
    headline: 'is recommended',
    bullets: [
      'Best balance between cost, safety & emissions',
      'Avoids severe weather areas (SWH > 5.5 m)',
      'Fuel saving vs Fastest ETA: 29.3 MT',
      'ETA delay vs Fastest ETA: +29h 35m',
    ],
    confidence: 97,
  },
  timeline: {
    startUtc: '24 Jun 2026 00:00',
    endUtc: '02 Jul 2026 12:00',
    currentUtc: '24 Jun 2026 12:00',
    speedMultiplier: 12,
  },
};

/**
 * Resolve the optimization payload. Swap the stub for a real API call
 * when the backend endpoints are available, e.g.:
 *
 *   export async function getOptimizationData(voyageId: string) {
 *     const res = await fetch(`/api/optimization/${voyageId}`);
 *     return (await res.json()) as OptimizationData;
 *   }
 */
export function getOptimizationData(): Promise<OptimizationData> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(STUB_DATA), 150);
  });
}
