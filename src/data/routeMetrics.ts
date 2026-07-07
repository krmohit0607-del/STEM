/**
 * Shared voyage/route metrics used by the Route Simulator and the
 * Optimization tab so both show the same decision figures (ETAs, duration,
 * ECA time/distance, average speed, fuel/hire/EUA costs, etc.), plus the
 * optimization scenarios and a synthesizer that derives a scenario-specific
 * optimized route from a base route.
 */

export type LatLon = [number, number];

export interface MarketFactors {
  /** Vessel hire rate, USD/day. */
  hirePerDay: number;
  /** VLSFO price, USD/ton. */
  foCost: number;
  /** LSMGO (ECA) price, USD/ton. */
  goCost: number;
  /** EUA price, USD per tonne CO₂ allowance. */
  euaCost: number;
}

export const DEFAULT_MARKET_FACTORS: MarketFactors = {
  hirePerDay: 12000,
  foCost: 650,
  goCost: 950,
  euaCost: 75,
};

export interface LegEta {
  name: string;
  eta: Date;
  distanceNm: number;
}

export interface RouteMetrics {
  distanceNm: number;
  ecaDistanceNm: number;
  speedKn: number;
  durationH: number;
  ecaDurationH: number;
  fuelTons: number;
  ecaFuelTons: number;
  fuelCost: number;
  hireCost: number;
  co2Tons: number;
  euaAllowanceTons: number;
  euaCost: number;
  totalCost: number;
  etd: Date;
  eta: Date;
  legEtas: LegEta[];
}

// CO₂ emission factors (t CO₂ per t fuel).
const CO2_FACTOR_VLSFO = 3.114;
const CO2_FACTOR_LSMGO = 3.206;
// EU ETS 2026 phase-in (70%) applied to 50% of a typical to/from-EU voyage.
const EU_ETS_SCOPE = 0.5;
const EU_ETS_PHASE_IN = 0.7;

/** Great-circle distance in nautical miles. */
export function haversineNM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3440.065;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function pathDistanceNm(path: LatLon[]): number {
  let d = 0;
  for (let i = 1; i < path.length; i += 1) {
    d += haversineNM(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
  }
  return d;
}

export interface ComputeMetricsOpts {
  path: LatLon[];
  /** Override the path distance (else computed from the path). */
  distanceNm?: number;
  speedKn: number;
  etd: Date;
  market: MarketFactors;
  /** Daily VLSFO consumption at this speed (t/day). */
  consPerDay: number;
  /** Fraction of the voyage transiting ECA zones (0–1). */
  ecaFraction?: number;
}

/** Compute the full-voyage decision metrics for a route. */
export function computeRouteMetrics(o: ComputeMetricsOpts): RouteMetrics {
  const distanceNm = o.distanceNm ?? pathDistanceNm(o.path);
  const speedKn = Math.max(1, o.speedKn);
  const ecaFraction = o.ecaFraction ?? 0.08;
  const durationH = distanceNm / speedKn;
  const ecaDistanceNm = distanceNm * ecaFraction;
  const ecaDurationH = durationH * ecaFraction;

  const days = durationH / 24;
  const fuelTons = o.consPerDay * days;
  const ecaFuelTons = o.consPerDay * (ecaDurationH / 24);
  const nonEcaFuel = Math.max(0, fuelTons - ecaFuelTons);

  const fuelCost = nonEcaFuel * o.market.foCost + ecaFuelTons * o.market.goCost;
  const hireCost = days * o.market.hirePerDay;
  const co2Tons = nonEcaFuel * CO2_FACTOR_VLSFO + ecaFuelTons * CO2_FACTOR_LSMGO;
  const euaAllowanceTons = co2Tons * EU_ETS_SCOPE * EU_ETS_PHASE_IN;
  const euaCost = euaAllowanceTons * o.market.euaCost;
  const totalCost = fuelCost + hireCost + euaCost;

  const etd = o.etd;
  const eta = new Date(etd.getTime() + durationH * 3600_000);

  // Per-waypoint ETAs from cumulative distance.
  const legEtas: LegEta[] = [];
  let cum = 0;
  for (let i = 0; i < o.path.length; i += 1) {
    if (i > 0) {
      cum += haversineNM(o.path[i - 1][0], o.path[i - 1][1], o.path[i][0], o.path[i][1]);
    }
    const name = i === 0 ? 'Departure' : i === o.path.length - 1 ? 'Arrival' : `WP${i}`;
    legEtas.push({ name, distanceNm: cum, eta: new Date(etd.getTime() + (cum / speedKn) * 3600_000) });
  }

  return {
    distanceNm,
    ecaDistanceNm,
    speedKn,
    durationH,
    ecaDurationH,
    fuelTons,
    ecaFuelTons,
    fuelCost,
    hireCost,
    co2Tons,
    euaAllowanceTons,
    euaCost,
    totalCost,
    etd,
    eta,
    legEtas,
  };
}

// --- Optimization scenarios --------------------------------------------------

export interface OptimizationScenario {
  id: string;
  label: string;
  icon: string;
  description: string;
}

export const OPTIMIZATION_SCENARIOS: OptimizationScenario[] = [
  { id: 'earliest-eta', label: 'Earliest ETA', icon: 'fa-gauge-high', description: 'Minimise arrival time (higher speed).' },
  { id: 'lowest-fuel', label: 'Lowest Fuel Consumption', icon: 'fa-gas-pump', description: 'Slow steaming to cut fuel burn.' },
  { id: 'lowest-cost', label: 'Lowest Voyage Cost', icon: 'fa-sack-dollar', description: 'Best hire vs fuel vs EUA trade-off.' },
  { id: 'lowest-co2', label: 'Lowest CO₂ Emissions', icon: 'fa-leaf', description: 'Minimise emissions and EUA exposure.' },
  { id: 'safest', label: 'Safest Route', icon: 'fa-shield-halved', description: 'Route around heavy weather.' },
  { id: 'balanced', label: 'Balanced Optimization', icon: 'fa-scale-balanced', description: 'Best overall balance.' },
  { id: 'maintain-cp', label: 'Maintain CP Speed', icon: 'fa-arrows-left-right-to-line', description: 'Keep CP speed, optimise waypoints only.' },
  { id: 'specific-eta', label: 'Specific ETA Arrival', icon: 'fa-calendar-check', description: 'Adjust speed to hit a target ETA.' },
];

export const SCENARIO_BY_ID: Record<string, OptimizationScenario> = Object.fromEntries(
  OPTIMIZATION_SCENARIOS.map((s) => [s.id, s]),
);

const SCENARIO_COLORS: Record<string, string> = {
  'earliest-eta': '#ff7b72',
  'lowest-fuel': '#3fb950',
  'lowest-cost': '#d29922',
  'lowest-co2': '#2ea043',
  safest: '#58a6ff',
  balanced: '#a371f7',
  'maintain-cp': '#39c5cf',
  'specific-eta': '#f778ba',
};

export function scenarioColor(id: string): string {
  return SCENARIO_COLORS[id] ?? '#58a6ff';
}

/** Per-scenario speed offset from CP speed and lateral path bulge (degrees). */
function scenarioShape(id: string): { speedDelta: number; offsetDeg: number } {
  switch (id) {
    case 'earliest-eta':
      return { speedDelta: +2, offsetDeg: 0.15 };
    case 'lowest-fuel':
      return { speedDelta: -2, offsetDeg: 0.5 };
    case 'lowest-cost':
      return { speedDelta: -1, offsetDeg: 0.6 };
    case 'lowest-co2':
      return { speedDelta: -2.5, offsetDeg: 0.4 };
    case 'safest':
      return { speedDelta: -1, offsetDeg: 1.1 };
    case 'balanced':
      return { speedDelta: 0, offsetDeg: 0.35 };
    case 'maintain-cp':
      return { speedDelta: 0, offsetDeg: 0.2 };
    case 'specific-eta':
    default:
      return { speedDelta: 0, offsetDeg: 0.25 };
  }
}

/** Densify a 2+ point path so a lateral bulge produces a visibly curved route. */
function densify(path: LatLon[], minPoints = 9): LatLon[] {
  if (path.length >= minPoints) return path.map((p) => [p[0], p[1]] as LatLon);
  const total = pathDistanceNm(path);
  if (total === 0) return path.map((p) => [p[0], p[1]] as LatLon);
  const out: LatLon[] = [];
  const segs = minPoints - 1;
  // Walk the polyline at even fractions.
  const cum: number[] = [0];
  for (let i = 1; i < path.length; i += 1) {
    cum.push(cum[i - 1] + haversineNM(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]));
  }
  for (let s = 0; s <= segs; s += 1) {
    const target = (total * s) / segs;
    let k = 1;
    while (k < cum.length && cum[k] < target) k += 1;
    const k0 = Math.max(1, k) - 1;
    const k1 = Math.min(path.length - 1, k0 + 1);
    const span = cum[k1] - cum[k0] || 1;
    const f = (target - cum[k0]) / span;
    out.push([
      path[k0][0] + (path[k1][0] - path[k0][0]) * f,
      path[k0][1] + (path[k1][1] - path[k0][1]) * f,
    ]);
  }
  return out;
}

/** Bulge a path laterally (endpoints fixed) to create a distinct route line. */
function perturbPath(path: LatLon[], offsetDeg: number, sign: number): LatLon[] {
  const dense = densify(path);
  const n = dense.length;
  if (n < 3 || offsetDeg === 0) return dense;
  const out = dense.map((p) => [p[0], p[1]] as LatLon);
  for (let i = 1; i < n - 1; i += 1) {
    const [alat, alon] = dense[i - 1];
    const [blat, blon] = dense[i + 1];
    let dlat = blat - alat;
    let dlon = blon - alon;
    const len = Math.hypot(dlat, dlon) || 1;
    dlat /= len;
    dlon /= len;
    // Perpendicular to local direction.
    const plat = -dlon;
    const plon = dlat;
    const bulge = Math.sin((Math.PI * i) / (n - 1)) * offsetDeg * sign;
    out[i] = [dense[i][0] + plat * bulge, dense[i][1] + plon * bulge];
  }
  return out;
}

export interface OptimizedRoute {
  id: string;
  scenarioId: string;
  name: string;
  color: string;
  path: LatLon[];
  metrics: RouteMetrics;
}

export interface GenerateOpts {
  basePath: LatLon[];
  baseName: string;
  scenarioId: string;
  market: MarketFactors;
  etd: Date;
  cpSpeedKn: number;
  cpConsPerDay: number;
  /** Required for the 'specific-eta' scenario. */
  targetEta?: Date | null;
  /** Index used to alternate the bulge direction between runs. */
  index?: number;
}

/** Synthesize a scenario-specific optimized route + its metrics. */
export function generateOptimizedRoute(o: GenerateOpts): OptimizedRoute {
  const scenario = SCENARIO_BY_ID[o.scenarioId] ?? OPTIMIZATION_SCENARIOS[5];
  const shape = scenarioShape(o.scenarioId);
  const sign = (o.index ?? 0) % 2 === 0 ? 1 : -1;
  const path = perturbPath(o.basePath, shape.offsetDeg, sign);
  const distanceNm = pathDistanceNm(path);

  let speedKn = Math.max(6, o.cpSpeedKn + shape.speedDelta);
  if (o.scenarioId === 'specific-eta' && o.targetEta) {
    const hours = Math.max(1, (o.targetEta.getTime() - o.etd.getTime()) / 3600_000);
    speedKn = Math.min(24, Math.max(6, distanceNm / hours));
  }

  // Fuel consumption scales ~ with the cube of speed relative to CP.
  const consPerDay =
    o.cpConsPerDay * Math.pow(speedKn / Math.max(1, o.cpSpeedKn), 3);

  const metrics = computeRouteMetrics({
    path,
    distanceNm,
    speedKn,
    etd: o.etd,
    market: o.market,
    consPerDay,
  });

  return {
    id: `opt-${o.scenarioId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    scenarioId: o.scenarioId,
    name: scenario.label,
    color: scenarioColor(o.scenarioId),
    path,
    metrics,
  };
}

// --- Formatting helpers (shared) ---------------------------------------------

const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });

export function fmtEtaUtc(d: Date): string {
  return `${dayFmt.format(d)}, ${timeFmt.format(d)}Z`;
}

export function fmtDurationH(hours: number): string {
  const d = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

export function usd(v: number): string {
  return `US$${Math.round(v).toLocaleString('en-US')}`;
}
