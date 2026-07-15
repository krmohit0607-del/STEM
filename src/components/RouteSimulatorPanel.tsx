import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

import { useL } from '../i18n/LocalizationProvider';
import { sampleEnvironment } from '../data/routeOptimizer';
import {
  ensureLiveData,
  sampleLiveField,
  getLiveDataTime,
  MAX_FORECAST_HOURS,
  type LatLngBounds,
} from '../data/openMeteo';
import {
  setMapCompareRoutes,
  setMapShipMarkers,
  setMapPlannedColor,
  setMapRouteWaypoints,
  setSimWeatherHour,
  requestRouteEdit,
  useActiveSimRoute,
  useEditCompareRoute,
  useRouteEditActive,
} from '../data/routeSimulatorStore';
import { useSavedRoutesVersion, useOptimizationResults, useOptimizationRun, removeOptimizationResult, followOptimizedRoute } from '../data/optimizationStore';
import { computeRouteMetrics, DEFAULT_MARKET_FACTORS, type RouteMetrics } from '../data/routeMetrics';
import { openScenarioReport } from '../data/optimizationReport';

/**
 * Route Simulator panel — multi-route comparison + playback, styled after the
 * fleet weather-routing console: a live weather read-out and compass on the
 * left, a large weather-along-voyage chart in the middle, and a routes table
 * (ETA / distance / cost to go) below.
 *
 * The route currently drawn on the Route Explorer map is pulled in from the
 * shared store (`useActiveSimRoute`) and shown as the "Active" route, and the
 * saved routes the user compares here are pushed back to the store
 * (`setMapCompareRoutes`) so the map overlays them too.
 */

// --- Persisted saved-route shape (mirrors RouteExplorerPage) -----------------

interface SavedWaypoint {
  lat: string;
  lon: string;
}

interface SavedRoute {
  id: string;
  name: string;
  savedAt: string;
  waypoints: SavedWaypoint[];
}

const SAVED_ROUTES_KEY = 'fv.savedRoutes';
const ACTIVE_ROUTE_KEY = 'fv.activeRouteId';

function readActiveRouteId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_ROUTE_KEY);
  } catch {
    return null;
  }
}

function writeActiveRouteId(id: string | null): void {
  try {
    if (id == null) window.localStorage.removeItem(ACTIVE_ROUTE_KEY);
    else window.localStorage.setItem(ACTIVE_ROUTE_KEY, id);
  } catch {
    /* ignore */
  }
}

function readSavedRoutes(): SavedRoute[] {
  try {
    const raw = window.localStorage.getItem(SAVED_ROUTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedRoute[]) : [];
  } catch {
    return [];
  }
}

function writeSavedRoutes(routes: SavedRoute[]): void {
  try {
    window.localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(routes));
  } catch {
    /* storage unavailable — ignore */
  }
}

// --- Geometry / formatting helpers -------------------------------------------

const SERVICE_SPEED_KN = 12;

/** Palette used to colour compared saved routes. */
const SAVED_SIM_COLORS = [
  '#f778ba',
  '#a371f7',
  '#3fb950',
  '#d29922',
  '#39c5cf',
  '#ff7b72',
];

/** Colour of the active route (black). */
const ACTIVE_ROUTE_COLOR = '#000000';

/** Parse a `01° 16.0' N` style string back to decimal degrees. */
function dmToDec(raw: string): number {
  if (!raw) return NaN;
  const hemiMatch = raw.match(/[NSEW]/i);
  const hemi = hemiMatch ? hemiMatch[0].toUpperCase() : '';
  const nums = raw.match(/[\d.]+/g)?.map(Number) ?? [];
  if (nums.length === 0) return NaN;
  const deg = nums[0] ?? 0;
  const min = nums[1] ?? 0;
  const sec = nums[2] ?? 0;
  let dec = deg + min / 60 + sec / 3600;
  if (hemi === 'S' || hemi === 'W') dec = -dec;
  return dec;
}

/** Decimal degrees → `33° 51.2' N` style string. */
function decToDM(value: number, isLat: boolean): string {
  const hemi = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  const pad = isLat ? 2 : 3;
  return `${String(deg).padStart(pad, '0')}° ${min.toFixed(1)}' ${hemi}`;
}

/** Great-circle distance in nautical miles. */
function haversineNM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3440.065;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial true course from point 1 to point 2 (deg). */
function bearingDeg(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/** Estimated transit time (in hours) for a distance at service speed. */
function transitHours(distanceNm: number): number {
  return distanceNm / SERVICE_SPEED_KN;
}

/** Format a transit duration as a compact "Xd Yh" string. */
function formatDuration(hours: number): string {
  const d = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

/** Round a value up to a tidy axis maximum that keeps the trace in view. */
function niceCeil(v: number): number {
  if (v <= 1) return Math.ceil(v * 4) / 4; // 0.25 steps
  if (v <= 3) return Math.ceil(v * 2) / 2; // 0.5 steps
  if (v <= 6) return Math.ceil(v); // 1 steps
  if (v <= 12) return Math.ceil(v / 2) * 2; // 2 steps
  return Math.ceil(v / 5) * 5; // 5 steps
}

/** Linearly interpolate a `[lat, lon]` polyline at fractional `progress`. */
function samplePath(
  path: Array<[number, number]>,
  progress: number,
): [number, number] {
  const last = path.length - 1;
  if (last < 0) return [0, 0];
  const p = Math.max(0, Math.min(last, progress));
  const i0 = Math.floor(p);
  const i1 = Math.min(last, i0 + 1);
  const t = p - i0;
  const [lat0, lon0] = path[i0];
  const [lat1, lon1] = path[i1];
  return [lat0 * (1 - t) + lat1 * t, lon0 * (1 - t) + lon1 * t];
}

/**
 * Position along `path` at a given elapsed voyage time, using a parallel
 * cumulative-hours array (`timeHours`). This advances the vessel by time so
 * each leg is sailed at its own planned speed. Falls back to `null` when no
 * timing profile is available (caller then interpolates by path fraction).
 */
function positionAtHours(
  path: Array<[number, number]>,
  timeHours: number[] | undefined,
  hours: number,
): [number, number] | null {
  const n = path.length;
  if (!timeHours || timeHours.length !== n || n === 0) return null;
  const total = timeHours[n - 1];
  if (hours <= 0) return path[0];
  if (hours >= total) return path[n - 1];
  let i = 0;
  while (i < n - 1 && timeHours[i + 1] < hours) i += 1;
  const t0 = timeHours[i];
  const t1 = timeHours[i + 1];
  const f = t1 > t0 ? (hours - t0) / (t1 - t0) : 0;
  const [lat0, lon0] = path[i];
  const [lat1, lon1] = path[i + 1];
  return [lat0 * (1 - f) + lat1 * f, lon0 * (1 - f) + lon1 * f];
}

/** Clamp an hour offset into the live-forecast window as a whole number. */
function clampHour(hours: number): number {
  return Math.max(0, Math.min(MAX_FORECAST_HOURS, Math.round(hours)));
}

// --- Compass / units ---------------------------------------------------------

const COMPASS8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function dirLetter(deg: number | null): string {
  if (deg == null || !Number.isFinite(deg)) return '--';
  return COMPASS8[Math.round(deg / 45) % 8];
}

/** Beaufort force number from a wind speed in knots. */
function beaufort(kt: number): number {
  const lower = [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64];
  let bf = 0;
  for (let i = 0; i < lower.length; i += 1) if (kt >= lower[i]) bf = i + 1;
  return bf;
}

// --- Weather factors ---------------------------------------------------------

const SIM_PLAY_DURATION_MS = 12000;
const SIM_WEATHER_SAMPLES = 48;

type WeatherFactorId = 'waves' | 'swell' | 'wind' | 'current';

interface WeatherFactorDef {
  id: WeatherFactorId;
  label: string;
  icon: string;
  unit: string;
  /** Matching Open-Meteo factor id used for live data. */
  liveId: string;
  /** Advisory threshold drawn as a red dashed line on the chart. */
  limit: number;
}

const WEATHER_FACTORS: WeatherFactorDef[] = [
  { id: 'waves', label: 'Significant Wave Height', icon: 'fa-water', unit: 'm', liveId: 'waves', limit: 4.5 },
  { id: 'swell', label: 'Swell Height', icon: 'fa-wave-square', unit: 'm', liveId: 'swell', limit: 4 },
  { id: 'wind', label: 'Wind Speed', icon: 'fa-wind', unit: 'kn', liveId: 'wind', limit: 34 },
  { id: 'current', label: 'Current', icon: 'fa-arrows-turn-right', unit: 'kn', liveId: 'currents', limit: 3 },
];

const WEATHER_FACTOR_BY_ID: Record<WeatherFactorId, WeatherFactorDef> =
  Object.fromEntries(WEATHER_FACTORS.map((f) => [f.id, f])) as Record<
    WeatherFactorId,
    WeatherFactorDef
  >;

/** Synthetic magnitude of a factor at a point (fallback while live loads). */
function factorMagnitudeSynthetic(
  lat: number,
  lon: number,
  factor: WeatherFactorId,
): number {
  const env = sampleEnvironment(lat, lon);
  switch (factor) {
    case 'waves':
      return env.waveHeight;
    case 'swell':
      return Math.max(0, env.waveHeight * 0.6 + 1.1 * Math.sin(lat * 0.12 - lon * 0.09));
    case 'wind':
      return env.windSpeed;
    case 'current':
      return Math.max(
        0,
        0.9 + 0.8 * Math.sin(lon * 0.14 + lat * 0.1) + 0.5 * Math.cos(lat * 0.07),
      );
    default:
      return 0;
  }
}

/** Weather magnitude at a fractional position along a route. */
function weatherAt(
  path: Array<[number, number]>,
  frac: number,
  factor: WeatherFactorDef,
  bounds: LatLngBounds | null,
  hour: number,
): number {
  const lastIdx = path.length - 1;
  const clamped = Math.max(0, Math.min(1, frac));
  const [lat, lon] = samplePath(path, clamped * lastIdx);
  if (bounds) {
    const live = sampleLiveField(lat, lon, factor.liveId, bounds, hour);
    if (live && Number.isFinite(live.magnitude)) return Math.max(0, live.magnitude);
  }
  return factorMagnitudeSynthetic(lat, lon, factor.id);
}

/** Magnitude + direction at a geographic point for a read-out row. */
function readoutAt(
  pos: [number, number],
  factor: WeatherFactorDef,
  bounds: LatLngBounds | null,
  hour = 0,
): { mag: number; dir: number | null } {
  if (bounds) {
    const live = sampleLiveField(pos[0], pos[1], factor.liveId, bounds, hour);
    if (live && Number.isFinite(live.magnitude)) {
      return { mag: Math.max(0, live.magnitude), dir: live.directionDeg };
    }
  }
  return { mag: factorMagnitudeSynthetic(pos[0], pos[1], factor.id), dir: null };
}

/** Whether the live grid for a factor has loaded over the given bounds. */
function isLiveLoaded(bounds: LatLngBounds | null, liveId: string): boolean {
  if (!bounds) return false;
  const cLat = (bounds.north + bounds.south) / 2;
  const cLon = (bounds.west + bounds.east) / 2;
  return sampleLiveField(cLat, cLon, liveId, bounds, 0) != null;
}

// --- Cost model (rough estimates — no ECA/cost feed is wired yet) -------------

const FUEL_PRICE_PER_TON = 650;
const HIRE_PER_DAY = 12000;
/** Approx. fuel burn per NM at service speed (t/NM). */
const FUEL_TONS_PER_NM = 0.055;

const usd = (v: number) =>
  `US$${Math.round(v).toLocaleString('en-US')}`;

// --- Date helpers ------------------------------------------------------------

const dayFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const timeFmt = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

function fmtDay(d: Date): string {
  return dayFmt.format(d);
}
function fmtCursor(d: Date): string {
  return `${dayFmt.format(d)} ${timeFmt.format(d)}Z`;
}
function fmtEta(d: Date): string {
  return `${dayFmt.format(d)}, ${timeFmt.format(d)}Z`;
}

// --- Compass rose ------------------------------------------------------------

/** Point on the rose circle for a compass bearing (0 = up, clockwise). */
function rosePoint(deg: number, r: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [50 + r * Math.sin(rad), 50 - r * Math.cos(rad)];
}

function CompassRose({
  windDir,
  currentDir,
  heading,
}: {
  windDir: number | null;
  currentDir: number | null;
  heading: number | null;
}) {
  const arrow = (deg: number, color: string, key: string) => {
    // Meteorological wind blows *towards* deg+180; currents flow *towards* deg.
    const [tx, ty] = rosePoint(deg, 34);
    const [bx, by] = rosePoint(deg + 180, 24);
    return (
      <g key={key}>
        <line x1={bx} y1={by} x2={tx} y2={ty} stroke={color} strokeWidth={3} strokeLinecap="round" />
        <circle cx={tx} cy={ty} r={3.4} fill={color} />
      </g>
    );
  };
  return (
    <svg className="fv-sim2__rose-svg" viewBox="0 0 100 100" role="img" aria-label="Wind and current rose">
      <circle cx={50} cy={50} r={44} className="fv-sim2__rose-ring" />
      <circle cx={50} cy={50} r={30} className="fv-sim2__rose-ring fv-sim2__rose-ring--inner" />
      {[0, 90, 180, 270].map((d) => {
        const [x1, y1] = rosePoint(d, 44);
        const [x2, y2] = rosePoint(d, 38);
        return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} className="fv-sim2__rose-tick" />;
      })}
      <text x={50} y={12} className="fv-sim2__rose-label">N</text>
      <text x={91} y={53} className="fv-sim2__rose-label">E</text>
      <text x={50} y={95} className="fv-sim2__rose-label">S</text>
      <text x={9} y={53} className="fv-sim2__rose-label">W</text>
      {windDir != null && arrow(windDir, '#8b98a5', 'wind')}
      {currentDir != null && arrow(currentDir, '#2ea043', 'current')}
      {heading != null && (
        <g transform={`rotate(${heading} 50 50)`}>
          <polygon points="50,32 45,60 50,54 55,60" className="fv-sim2__rose-ship" />
        </g>
      )}
    </svg>
  );
}

// --- Route export formats ----------------------------------------------------

type ExportFormatId = 'rtz' | 'jrc' | 'tokimec' | 'furuno' | 'nacos' | 'totem';

interface ExportFormatDef {
  id: ExportFormatId;
  label: string;
  ext: string;
  mime: string;
}

const EXPORT_FORMATS: ExportFormatDef[] = [
  { id: 'rtz', label: 'RTZ XML', ext: 'rtz', mime: 'application/xml' },
  { id: 'jrc', label: 'JRC CSV', ext: 'csv', mime: 'text/csv' },
  { id: 'tokimec', label: 'Tokimec CSV', ext: 'csv', mime: 'text/csv' },
  { id: 'furuno', label: 'Furuno Simple', ext: 'txt', mime: 'text/plain' },
  { id: 'nacos', label: 'Nacos 1100 CSV', ext: 'csv', mime: 'text/csv' },
  { id: 'totem', label: 'Totem CSV', ext: 'csv', mime: 'text/csv' },
];

const EXPORT_FORMAT_BY_ID: Record<ExportFormatId, ExportFormatDef> =
  Object.fromEntries(EXPORT_FORMATS.map((f) => [f.id, f])) as Record<
    ExportFormatId,
    ExportFormatDef
  >;

interface ExportRoute {
  name: string;
  path: Array<[number, number]>;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Furuno-style `ddmm.mmmH` position component. */
function toDdmm(value: number, isLat: boolean): string {
  const hemi = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  const pad = isLat ? 2 : 3;
  return `${String(deg).padStart(pad, '0')}${min.toFixed(3).padStart(6, '0')}${hemi}`;
}

/** Build the file contents for a set of routes in the requested format. */
function buildRouteExport(format: ExportFormatId, routes: ExportRoute[]): string {
  switch (format) {
    case 'rtz': {
      const routeXml = routes
        .map((r) => {
          const wps = r.path
            .map(
              ([lat, lon], i) =>
                `      <waypoint id="${i + 1}" name="WP${i + 1}">` +
                `<position lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"/></waypoint>`,
            )
            .join('\n');
          return (
            `  <route version="1.1" xmlns="http://www.cirm.org/RTZ/1/1">\n` +
            `    <routeInfo routeName="${xmlEscape(r.name)}"/>\n` +
            `    <waypoints>\n${wps}\n    </waypoints>\n` +
            `  </route>`
          );
        })
        .join('\n');
      return `<?xml version="1.0" encoding="UTF-8"?>\n<routes>\n${routeXml}\n</routes>\n`;
    }
    case 'jrc': {
      const lines = ['Route,No,Latitude,Longitude'];
      routes.forEach((r) =>
        r.path.forEach(([lat, lon], i) =>
          lines.push(`${r.name},${i + 1},${lat.toFixed(6)},${lon.toFixed(6)}`),
        ),
      );
      return `${lines.join('\r\n')}\r\n`;
    }
    case 'tokimec': {
      const lines = ['WPT,LAT,LON,SPD'];
      routes.forEach((r) =>
        r.path.forEach(([lat, lon], i) =>
          lines.push(
            `${i + 1},${decToDM(lat, true)},${decToDM(lon, false)},${SERVICE_SPEED_KN}`,
          ),
        ),
      );
      return `${lines.join('\r\n')}\r\n`;
    }
    case 'furuno': {
      const lines: string[] = [];
      routes.forEach((r) => {
        lines.push(`$ROUTE,${r.name}`);
        r.path.forEach(([lat, lon], i) =>
          lines.push(`${String(i + 1).padStart(2, '0')},${toDdmm(lat, true)},${toDdmm(lon, false)}`),
        );
      });
      return `${lines.join('\r\n')}\r\n`;
    }
    case 'nacos': {
      const lines = ['Index,Lat,Lon,Radius,Speed'];
      routes.forEach((r) =>
        r.path.forEach(([lat, lon], i) =>
          lines.push(`${i + 1},${lat.toFixed(6)},${lon.toFixed(6)},0.5,${SERVICE_SPEED_KN}`),
        ),
      );
      return `${lines.join('\r\n')}\r\n`;
    }
    case 'totem':
    default: {
      const lines = ['route,id,lat,lon,name'];
      routes.forEach((r) =>
        r.path.forEach(([lat, lon], i) =>
          lines.push(`${r.name},${i + 1},${lat.toFixed(6)},${lon.toFixed(6)},WP${i + 1}`),
        ),
      );
      return `${lines.join('\r\n')}\r\n`;
    }
  }
}

// --- Component ---------------------------------------------------------------

interface SimRoute {
  id: string;
  savedId: string | null;
  label: string;
  color: string;
  path: Array<[number, number]>;
  distanceNm: number;
  hours: number;
  /** Cumulative hours to each path vertex (per-leg speed); active route only. */
  timeHours?: number[];
  active: boolean;
  sentAt: string | null;
  /** Set for system-generated optimized routes appended after saved routes. */
  optimized?: boolean;
  scenarioId?: string;
  metrics?: RouteMetrics;
}

export function RouteSimulatorPanel() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const activeRoute = useActiveSimRoute();
  const routeEditActive = useRouteEditActive();
  const editCompareRoute = useEditCompareRoute();

  // System-generated optimized routes (from the route editor's Optimize run),
  // appended after the saved routes in the table + chart + map.
  const optimizedResults = useOptimizationResults();
  const optimizationRun = useOptimizationRun();

  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>(() => readSavedRoutes());
  // The single "active" (primary) route for the vessel — shown black.
  const [activeRouteId, setActiveRouteId] = useState<string | null>(() => readActiveRouteId());
  // Routes hidden from the chart/map via the row checkbox.
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  useEffect(() => {
    const refresh = () => setSavedRoutes(readSavedRoutes());
    const onStorage = (e: StorageEvent) => {
      if (e.key === SAVED_ROUTES_KEY || e.key === null) refresh();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Re-read saved routes + active route when the Optimization "Follow route"
  // action (or any in-tab change) bumps the shared version.
  const savedRoutesVersion = useSavedRoutesVersion();
  useEffect(() => {
    setSavedRoutes(readSavedRoutes());
    setActiveRouteId(readActiveRouteId());
  }, [savedRoutesVersion]);

  // --- Playback state --------------------------------------------------------
  const [simClock, setSimClock] = useState(0);
  const [simPlaying, setSimPlaying] = useState(false);
  const simRafRef = useRef<number | null>(null);
  const simLastTsRef = useRef<number | null>(null);
  const [simFactor, setSimFactor] = useState<WeatherFactorId>('waves');
  const [liveVersion, setLiveVersion] = useState(0);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const simFactorDef = WEATHER_FACTOR_BY_ID[simFactor];

  // --- Playable routes: active route (from map) + every saved route ----------
  const simRoutes = useMemo<SimRoute[]>(() => {
    const base: Array<Omit<SimRoute, 'color' | 'active'>> = [];
    if (activeRoute && activeRoute.path.length >= 2) {
      const profile = activeRoute.timeHours;
      const plannedHours =
        profile && profile.length > 0
          ? profile[profile.length - 1]
          : transitHours(activeRoute.distanceNm);
      base.push({
        id: activeRoute.id,
        savedId: null,
        label: activeRoute.label,
        path: activeRoute.path,
        distanceNm: activeRoute.distanceNm,
        hours: plannedHours,
        timeHours: profile,
        sentAt: null,
      });
    }
    // While editing, the pre-edit original is shown as its own comparison row.
    if (editCompareRoute && editCompareRoute.path.length >= 2) {
      const oProfile = editCompareRoute.timeHours;
      const oHours =
        oProfile && oProfile.length > 0
          ? oProfile[oProfile.length - 1]
          : transitHours(editCompareRoute.distanceNm);
      base.push({
        id: editCompareRoute.id,
        savedId: null,
        label: editCompareRoute.label,
        path: editCompareRoute.path,
        distanceNm: editCompareRoute.distanceNm,
        hours: oHours,
        timeHours: oProfile,
        sentAt: null,
      });
    }
    savedRoutes.forEach((r) => {
      const path = r.waypoints
        .map((wp) => [dmToDec(wp.lat), dmToDec(wp.lon)] as [number, number])
        .filter(([lat, lon]) => !Number.isNaN(lat) && !Number.isNaN(lon));
      if (path.length < 2) return;
      let dist = 0;
      for (let k = 1; k < path.length; k += 1) {
        dist += haversineNM(path[k - 1][0], path[k - 1][1], path[k][0], path[k][1]);
      }
      base.push({
        id: `saved-${r.id}`,
        savedId: r.id,
        label: r.name,
        path,
        distanceNm: Math.round(dist),
        hours: transitHours(dist),
        sentAt: r.savedAt,
      });
    });
    // The active route is black; the rest take distinct palette colours.
    let ci = 0;
    const mapped: SimRoute[] = base.map((r) => {
      const isActive = r.id === activeRouteId;
      return {
        ...r,
        active: isActive,
        color: isActive
          ? ACTIVE_ROUTE_COLOR
          : SAVED_SIM_COLORS[ci++ % SAVED_SIM_COLORS.length],
      };
    });
    // Append the system-generated optimized routes (in their scenario colours).
    const optimized: SimRoute[] = optimizedResults
      .filter((o) => o.path.length >= 2)
      .map((o) => ({
        id: o.id,
        savedId: null,
        label: o.name,
        color: o.color,
        path: o.path,
        distanceNm: Math.round(o.metrics.distanceNm),
        hours: o.metrics.durationH,
        active: false,
        sentAt: null,
        optimized: true,
        scenarioId: o.scenarioId,
        metrics: o.metrics,
      }));
    return [...mapped, ...optimized];
  }, [activeRoute, editCompareRoute, savedRoutes, activeRouteId, optimizedResults]);

  const hasRoutes = simRoutes.length > 0;

  /** Routes actually drawn on the chart/map (row checkbox toggles visibility). */
  const visibleRoutes = useMemo(
    () => simRoutes.filter((r) => !hiddenIds.includes(r.id)),
    [simRoutes, hiddenIds],
  );

  /** The single active route (always shown on the map, even if unchecked). */
  const activeSimRoute = useMemo(
    () => simRoutes.find((r) => r.active) ?? null,
    [simRoutes],
  );

  /** Routes shown on the map: every visible route plus the active route. */
  const mapRoutes = useMemo(() => {
    const list = [...visibleRoutes];
    if (activeSimRoute && !list.some((r) => r.id === activeSimRoute.id)) {
      list.push(activeSimRoute);
    }
    return list;
  }, [visibleRoutes, activeSimRoute]);

  // Publish the saved + optimized route lines shown on the map (visible + active).
  useEffect(() => {
    setMapCompareRoutes(
      mapRoutes
        .filter((r) => r.savedId != null || r.optimized)
        .map((r) => ({ id: r.id, color: r.color, path: r.path })),
    );
  }, [mapRoutes]);

  useEffect(() => () => setMapCompareRoutes([]), []);

  // Mirror the planned route's colour (black when it's the active route) onto
  // the map, and draw waypoints for the active route only.
  const plannedColor =
    simRoutes.find((r) => r.id === 'active-planned')?.color ?? '#58a6ff';
  useEffect(() => {
    setMapPlannedColor(plannedColor);
    return () => setMapPlannedColor('#58a6ff');
  }, [plannedColor]);

  const activeWaypoints = useMemo<Array<{ pos: [number, number]; color: string }>>(() => {
    // Only the active route shows its waypoints; the planned route's waypoints
    // are already drawn by the map editor.
    if (!activeSimRoute || !activeSimRoute.savedId) return [];
    const saved = savedRoutes.find((s) => s.id === activeSimRoute.savedId);
    if (!saved) return [];
    const out: Array<{ pos: [number, number]; color: string }> = [];
    saved.waypoints.forEach((wp) => {
      const lat = dmToDec(wp.lat);
      const lon = dmToDec(wp.lon);
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
        out.push({ pos: [lat, lon], color: activeSimRoute.color });
      }
    });
    return out;
  }, [activeSimRoute, savedRoutes]);

  useEffect(() => {
    setMapRouteWaypoints(activeWaypoints);
  }, [activeWaypoints]);

  useEffect(() => () => setMapRouteWaypoints([]), []);

  const simMaxHours = useMemo(
    () => visibleRoutes.reduce((m, r) => Math.max(m, r.hours), 0),
    [visibleRoutes],
  );

  const simBounds = useMemo<LatLngBounds | null>(() => {
    let south = Infinity;
    let north = -Infinity;
    let west = Infinity;
    let east = -Infinity;
    visibleRoutes.forEach((r) =>
      r.path.forEach(([lat, lon]) => {
        if (lat < south) south = lat;
        if (lat > north) north = lat;
        if (lon < west) west = lon;
        if (lon > east) east = lon;
      }),
    );
    if (!Number.isFinite(south)) return null;
    const padLat = Math.max(0.5, (north - south) * 0.08);
    const padLon = Math.max(0.5, (east - west) * 0.08);
    return {
      south: south - padLat,
      north: north + padLat,
      west: west - padLon,
      east: east + padLon,
    };
  }, [visibleRoutes]);

  // Load the live grid for every read-out factor over the routes' bounds.
  useEffect(() => {
    if (!simBounds) return;
    ['waves', 'swell', 'wind', 'currents'].forEach((fid) =>
      ensureLiveData(fid, simBounds, 0, () => setLiveVersion((v) => v + 1)),
    );
  }, [simBounds]);

  const simLiveActive = isLiveLoaded(simBounds, simFactorDef.liveId);

  const simBaseDate = useMemo(() => {
    void liveVersion;
    // Prefer the voyage's ETD so the timeline starts when the vessel departs.
    if (activeRoute?.etdIso) {
      const d = new Date(activeRoute.etdIso);
      if (!Number.isNaN(d.getTime())) return d;
    }
    if (simBounds) {
      const iso = getLiveDataTime(simFactorDef.liveId, simBounds, 0);
      if (iso) {
        const d = new Date(`${iso}Z`);
        if (!Number.isNaN(d.getTime())) return d;
      }
    }
    // Fall back to the current whole hour so the axis still shows real dates.
    const now = new Date();
    now.setUTCMinutes(0, 0, 0);
    return now;
  }, [activeRoute?.etdIso, simBounds, simFactorDef.liveId, liveVersion]);

  const simWeather = useMemo(() => {
    const series = visibleRoutes.map((r) => {
      const points: Array<{ t: number; w: number }> = [];
      for (let i = 0; i <= SIM_WEATHER_SAMPLES; i += 1) {
        const f = i / SIM_WEATHER_SAMPLES;
        points.push({
          t: f * r.hours,
          // Forecast the vessel will actually meet at that point: sampled at the
          // time the vessel reaches it (fraction of its own transit time).
          w: weatherAt(r.path, f, simFactorDef, simBounds, clampHour(f * r.hours)),
        });
      }
      return { id: r.id, color: r.color, points };
    });
    let dataMax = 0;
    let dataMin = Infinity;
    series.forEach((s) => s.points.forEach((p) => {
      if (p.w > dataMax) dataMax = p.w;
      if (p.w < dataMin) dataMin = p.w;
    }));
    if (!Number.isFinite(dataMin)) dataMin = 0;
    // Scale the axis to enclose the data and the safety threshold with a
    // little headroom, so the trace always fits the fixed chart height.
    const maxW = niceCeil(Math.max(dataMax, simFactorDef.limit) * 1.1);
    return { series, maxW, dataMax, dataMin };
  }, [visibleRoutes, simFactorDef, simBounds, liveVersion]);

  useEffect(() => {
    setSimPlaying(false);
    setSimClock(0);
  }, [savedRoutes, activeRoute?.id]);

  useEffect(() => {
    setSelectedRouteId((prev) =>
      prev && simRoutes.some((r) => r.id === prev) ? prev : (simRoutes[0]?.id ?? null),
    );
  }, [simRoutes]);

  useEffect(() => {
    if (!simPlaying) {
      if (simRafRef.current != null) {
        window.cancelAnimationFrame(simRafRef.current);
        simRafRef.current = null;
      }
      simLastTsRef.current = null;
      return;
    }
    const speed = 1 / SIM_PLAY_DURATION_MS;
    const tick = (ts: number) => {
      if (simLastTsRef.current == null) simLastTsRef.current = ts;
      const dt = ts - simLastTsRef.current;
      simLastTsRef.current = ts;
      setSimClock((prev) => {
        const next = prev + dt * speed;
        if (next >= 1) {
          setSimPlaying(false);
          return 1;
        }
        return next;
      });
      simRafRef.current = window.requestAnimationFrame(tick);
    };
    simRafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (simRafRef.current != null) {
        window.cancelAnimationFrame(simRafRef.current);
        simRafRef.current = null;
      }
      simLastTsRef.current = null;
    };
  }, [simPlaying]);

  const simElapsedHours = simClock * simMaxHours;
  const cursorDate = new Date(simBaseDate.getTime() + simElapsedHours * 3600_000);

  /**
   * Vessel position on a route after `hours` of sailing. Uses the per-leg
   * timing profile (so each leg is sailed at its planned speed) when available,
   * otherwise falls back to constant-speed interpolation by path fraction.
   */
  const posAtHours = (r: SimRoute, hours: number): [number, number] => {
    const byTime = positionAtHours(r.path, r.timeHours, hours);
    if (byTime) return byTime;
    const frac = r.hours > 0 ? Math.min(1, hours / r.hours) : 0;
    return samplePath(r.path, frac * (r.path.length - 1));
  };

  /** Per-route fraction sailed + current-cursor weather on the chart factor. */
  const simLive = useMemo(() => {
    const byId: Record<string, { frac: number; weather: number }> = {};
    simRoutes.forEach((r) => {
      const frac = r.hours > 0 ? Math.min(1, simElapsedHours / r.hours) : 0;
      const elapsed = Math.min(simElapsedHours, r.hours);
      byId[r.id] = {
        frac,
        weather: weatherAt(r.path, frac, simFactorDef, simBounds, clampHour(elapsed)),
      };
    });
    return byId;
  }, [simRoutes, simElapsedHours, simFactorDef, simBounds, liveVersion]);

  const selectedRoute = simRoutes.find((r) => r.id === selectedRouteId) ?? simRoutes[0] ?? null;

  /** Live weather read-out at the selected vessel's current position. */
  const readout = useMemo(() => {
    void liveVersion;
    if (!selectedRoute) return null;
    const elapsed = Math.min(simElapsedHours, selectedRoute.hours);
    const pos = posAtHours(selectedRoute, elapsed);
    const heading = bearingDeg(
      posAtHours(selectedRoute, Math.max(0, elapsed - 0.5)),
      posAtHours(selectedRoute, Math.min(selectedRoute.hours, elapsed + 0.5)),
    );
    const get = (id: WeatherFactorId) =>
      readoutAt(pos, WEATHER_FACTOR_BY_ID[id], simBounds, clampHour(elapsed));
    return {
      pos,
      heading,
      waves: get('waves'),
      swell: get('swell'),
      wind: get('wind'),
      current: get('current'),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoute, simLive, simElapsedHours, simBounds, liveVersion]);

  // Vessel markers at each route's current simulated position, mirrored onto
  // the Route Explorer map so the live position is visible while simulating.
  const shipMarkers = useMemo(
    () =>
      mapRoutes.map((r) => {
        const frac = simLive[r.id]?.frac ?? 0;
        const elapsed = Math.min(simElapsedHours, r.hours);
        return {
          id: r.id,
          color: r.color,
          pos: posAtHours(r, elapsed),
          heading: bearingDeg(
            posAtHours(r, Math.max(0, elapsed - 0.5)),
            posAtHours(r, Math.min(r.hours, elapsed + 0.5)),
          ),
          label: r.label,
          sublabel: `${Math.round(frac * 100)}%`,
          active: r.id === selectedRouteId,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapRoutes, simLive, simElapsedHours, selectedRouteId],
  );

  useEffect(() => {
    setMapShipMarkers(shipMarkers);
  }, [shipMarkers]);

  useEffect(() => () => setMapShipMarkers([]), []);

  // Drive the map weather layers from the simulation time while playing (or
  // scrubbing), so the on-map weather advances in step with the vessel; hand
  // control back to the manual weather slider when the simulation is idle.
  const lastSimHourRef = useRef<number | null>(null);
  useEffect(() => {
    const active = simPlaying || simClock > 0;
    const next = active ? clampHour(simElapsedHours) : null;
    if (next !== lastSimHourRef.current) {
      lastSimHourRef.current = next;
      setSimWeatherHour(next);
    }
  }, [simPlaying, simClock, simElapsedHours]);

  useEffect(() => () => setSimWeatherHour(null), []);

  // --- Drag-to-scrub the blue time cursor on the chart -----------------------
  const plotAreaRef = useRef<HTMLDivElement>(null);
  const scrubToClientX = (clientX: number) => {
    const el = plotAreaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setSimClock(frac);
  };
  const onPlotPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setSimPlaying(false);
    scrubToClientX(e.clientX);
    const onMove = (ev: PointerEvent) => scrubToClientX(ev.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // --- Saved-routes handlers -------------------------------------------------
  const deleteSavedRoute = (savedId: string) => {
    const next = savedRoutes.filter((r) => r.id !== savedId);
    setSavedRoutes(next);
    writeSavedRoutes(next);
    setActiveRouteId((prev) => {
      if (prev !== `saved-${savedId}`) return prev;
      writeActiveRouteId(null);
      return null;
    });
  };

  /** Mark a route as the single active (primary) route for the vessel. */
  const setRouteActive = (routeId: string) => {
    setActiveRouteId(routeId);
    writeActiveRouteId(routeId);
  };

  /** Toggle whether a route is drawn on the chart / map. */
  const toggleRouteVisible = (routeId: string) => {
    setHiddenIds((prev) =>
      prev.includes(routeId) ? prev.filter((x) => x !== routeId) : [...prev, routeId],
    );
  };

  /** Rename a saved route. */
  const renameSavedRoute = (savedId: string, currentName: string) => {
    const name = window.prompt(t('renameRoutePrompt', 'Rename route'), currentName);
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = savedRoutes.map((r) => (r.id === savedId ? { ...r, name: trimmed } : r));
    setSavedRoutes(next);
    writeSavedRoutes(next);
  };

  // --- Import / export / merge / split ---------------------------------------
  const importInputRef = useRef<HTMLInputElement>(null);

  // Export preferences modal.
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSelIds, setExportSelIds] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState<ExportFormatId | null>(null);

  /** Open the export-preferences modal (choose routes + format). */
  const exportRoutes = () => {
    if (simRoutes.length === 0) return;
    setExportSelIds([]);
    setExportFormat(null);
    setExportOpen(true);
  };

  const toggleExportRoute = (id: string) => {
    setExportSelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const allExportSelected =
    simRoutes.length > 0 && exportSelIds.length === simRoutes.length;

  const toggleAllExportRoutes = () => {
    setExportSelIds(allExportSelected ? [] : simRoutes.map((r) => r.id));
  };

  /** Build and download the selected routes in the chosen format. */
  const confirmExport = () => {
    if (exportFormat == null || exportSelIds.length === 0) return;
    const routes: ExportRoute[] = simRoutes
      .filter((r) => exportSelIds.includes(r.id))
      .map((r) => ({ name: r.label, path: r.path }));
    if (routes.length === 0) return;
    const def = EXPORT_FORMAT_BY_ID[exportFormat];
    const text = buildRouteExport(exportFormat, routes);
    const blob = new Blob([text], { type: def.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `routes-${new Date().toISOString().slice(0, 10)}.${def.ext}`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  /** Open the file picker to import saved routes from a JSON file. */
  const importRoutes = () => importInputRef.current?.click();

  const onImportFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const incoming: SavedRoute[] = Array.isArray(parsed) ? parsed : [parsed];
        const now = Date.now();
        const cleaned = incoming
          .filter((r) => r && Array.isArray(r.waypoints))
          .map((r, i) => ({
            ...r,
            id: `route-${now}-${i}`,
            name: r.name || `${t('imported', 'Imported')} ${i + 1}`,
            savedAt: r.savedAt || new Date().toISOString(),
          }));
        if (cleaned.length === 0) return;
        const next = [...savedRoutes, ...cleaned];
        setSavedRoutes(next);
        writeSavedRoutes(next);
      } catch {
        window.alert(t('importRoutesError', 'Could not import routes: invalid file.'));
      }
    };
    reader.readAsText(file);
  };

  /** Merge the currently visible saved routes into a single new route. */
  const mergeVisibleRoutes = () => {
    const toMerge = savedRoutes.filter((r) => !hiddenIds.includes(`saved-${r.id}`));
    if (toMerge.length < 2) return;
    const merged: SavedRoute = {
      id: `route-${Date.now()}`,
      name: `${t('merged', 'Merged')} ${savedRoutes.length + 1}`,
      savedAt: new Date().toISOString(),
      waypoints: toMerge.flatMap((r) => r.waypoints),
    };
    const next = [...savedRoutes, merged];
    setSavedRoutes(next);
    writeSavedRoutes(next);
  };

  /** Split the selected saved route into two halves at its midpoint. */
  const splitSelectedRoute = () => {
    const sim = simRoutes.find((r) => r.id === selectedRouteId);
    if (!sim?.savedId) return;
    const src = savedRoutes.find((r) => r.id === sim.savedId);
    if (!src || src.waypoints.length < 4) return;
    const mid = Math.ceil(src.waypoints.length / 2);
    const now = Date.now();
    const partA: SavedRoute = {
      id: `route-${now}-a`,
      name: `${src.name} (A)`,
      savedAt: new Date().toISOString(),
      waypoints: src.waypoints.slice(0, mid),
    };
    const partB: SavedRoute = {
      id: `route-${now}-b`,
      name: `${src.name} (B)`,
      savedAt: new Date().toISOString(),
      waypoints: src.waypoints.slice(mid - 1),
    };
    const next = savedRoutes.flatMap((r) => (r.id === src.id ? [partA, partB] : [r]));
    setSavedRoutes(next);
    writeSavedRoutes(next);
  };

  const mergeableCount = savedRoutes.filter(
    (r) => !hiddenIds.includes(`saved-${r.id}`),
  ).length;
  const selectedSavedId = simRoutes.find((r) => r.id === selectedRouteId)?.savedId ?? null;
  const canSplit =
    selectedSavedId != null &&
    (savedRoutes.find((r) => r.id === selectedSavedId)?.waypoints.length ?? 0) >= 4;

  const factorLabelFull = `${t(`weatherFactor.${simFactor}`, simFactorDef.label)} (${simFactorDef.unit})`;

  // Y-axis + threshold positions.
  const yFor = (w: number) => 100 - (w / simWeather.maxW) * 100;
  const yTicks = [simWeather.maxW, simWeather.maxW / 2];

  // X-axis date ticks (aim for ~6 evenly spaced labels).
  const xTicks = useMemo(() => {
    if (simMaxHours <= 0) return [];
    const stepH = Math.max(6, Math.ceil(simMaxHours / 6 / 12) * 12);
    const ticks: Array<{ x: number; label: string }> = [];
    for (let h = 0; h <= simMaxHours + 0.1; h += stepH) {
      ticks.push({
        x: (h / simMaxHours) * 100,
        label: fmtDay(new Date(simBaseDate.getTime() + h * 3600_000)),
      });
    }
    return ticks;
  }, [simMaxHours, simBaseDate]);

  const cursorX = simMaxHours > 0 ? simClock * 100 : 0;

  return (
    <div className="fv-sim2">
      {!hasRoutes ? (
        <div className="fv-sim2__empty">
          <i className="fas fa-route" aria-hidden="true" />
          <p>
            {t(
              'simSelectHint2',
              'Plot or open a route on the Route Explorer, or save routes there, to simulate them here.',
            )}
          </p>
        </div>
      ) : (
        <>
          <div className="fv-sim2__top">
          {/* Weather read-out + compass + controls (left column) --------- */}
          <div className="fv-sim2__side">
            <div className="fv-sim2__info">
              <div className="fv-sim2__readout">
                <ReadoutRow icon="fa-water" label={t('sigWaveHt', 'Sig. Wave Ht.')}
                  value={readout ? `${readout.waves.mag.toFixed(1)} m, ${dirLetter(readout.waves.dir)}` : '--'} />
                <ReadoutRow icon="fa-play" label={t('seas', 'Seas')}
                  value={readout ? `${readout.waves.mag.toFixed(1)} m, ${dirLetter(readout.waves.dir)}` : '--'} />
                <ReadoutRow icon="fa-angle-right" label={t('swell', 'Swell')}
                  value={readout ? `${readout.swell.mag.toFixed(1)} m, ${dirLetter(readout.swell.dir)}` : '--'} />
                <ReadoutRow icon="fa-location-arrow" iconColor="#2ea043" label={t('currents', 'Currents')}
                  value={readout ? `${readout.current.mag.toFixed(1)} kt, ${dirLetter(readout.current.dir)}` : '--'} />
                <ReadoutRow icon="fa-wind" label={t('wind', 'Wind')}
                  value={readout ? `${Math.round(readout.wind.mag)} kt, BF ${beaufort(readout.wind.mag)}, ${dirLetter(readout.wind.dir)}` : '--'} />
                <ReadoutRow icon="fa-ship" label={t('vesselSog', 'Vessel SOG')}
                  value={readout ? `${SERVICE_SPEED_KN.toFixed(1)}kt, ${Math.round(readout.heading)}°` : '--'} />
              </div>
              <div className="fv-sim2__rose">
                <CompassRose
                  windDir={readout?.wind.dir ?? null}
                  currentDir={readout?.current.dir ?? null}
                  heading={readout?.heading ?? null}
                />
              </div>
            </div>
            <div className="fv-sim2__controls">
                <span className="fv-sim2__coords">
                  {readout ? `${decToDM(readout.pos[0], true)}, ${decToDM(readout.pos[1], false)}` : '--'}
                </span>
                <div className="fv-sim2__buttons">
                  <button type="button" onClick={() => { setSimPlaying(false); setSimClock(0); }}
                    title={t('restart', 'Restart')} aria-label={t('restart', 'Restart')}>
                    <i className="fas fa-backward-fast" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => { setSimPlaying(false); setSimClock((c) => Math.max(0, c - 0.05)); }}
                    title={t('stepBack', 'Step back')} aria-label={t('stepBack', 'Step back')}>
                    <i className="fas fa-backward-step" aria-hidden="true" />
                  </button>
                  <button type="button" className="fv-sim2__play"
                    onClick={() => { if (!simPlaying && simClock >= 1) setSimClock(0); setSimPlaying((p) => !p); }}
                    title={simPlaying ? t('pause', 'Pause') : t('play', 'Play')}
                    aria-label={simPlaying ? t('pause', 'Pause') : t('play', 'Play')}>
                    <i className={simPlaying ? 'fas fa-pause' : 'fas fa-play'} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => { setSimPlaying(false); setSimClock((c) => Math.min(1, c + 0.05)); }}
                    title={t('stepForward', 'Step forward')} aria-label={t('stepForward', 'Step forward')}>
                    <i className="fas fa-forward-step" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => { setSimPlaying(false); setSimClock(1); }}
                    title={t('skipToEnd', 'Skip to end')} aria-label={t('skipToEnd', 'Skip to end')}>
                    <i className="fas fa-forward-fast" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

            {/* Chart -------------------------------------------------------- */}
            <div className="fv-sim2__chart">
              <div className="fv-sim2__chart-head">
                <label className="fv-sim2__factor-select">
                  <select value={simFactor} onChange={(e) => setSimFactor(e.target.value as WeatherFactorId)}>
                    {WEATHER_FACTORS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {t(`weatherFactor.${f.id}`, f.label)} ({f.unit})
                      </option>
                    ))}
                  </select>
                  <i className="fas fa-chevron-down" aria-hidden="true" />
                </label>
                <span className={`fv-sim2__live${simLiveActive ? ' fv-sim2__live--on' : ''}`}>
                  <i className={`fas ${simLiveActive ? 'fa-satellite-dish' : 'fa-flask'}`} aria-hidden="true" />{' '}
                  {simLiveActive ? t('live', 'Live') : t('sampleData', 'Sample')}
                </span>
              </div>
              <div className="fv-sim2__plot">
                <div className="fv-sim2__yaxis">
                  {yTicks.map((v) => (
                    <span key={v} style={{ top: `${yFor(v)}%` }}>{v.toFixed(1)}</span>
                  ))}
                  <span style={{ top: '100%' }}>0</span>
                </div>
                <div
                  className="fv-sim2__plot-area"
                  ref={plotAreaRef}
                  onPointerDown={onPlotPointerDown}
                >
                  {cursorX >= 0 && (
                    <>
                      <div className="fv-sim2__cursor" style={{ left: `${cursorX}%` }}>
                        <span className="fv-sim2__cursor-grip" />
                      </div>
                      <div
                        className={`fv-sim2__tooltip${cursorX > 55 ? ' fv-sim2__tooltip--left' : ''}`}
                        style={{ left: `${cursorX}%` }}
                      >
                        <div className="fv-sim2__tt-time">{fmtCursor(cursorDate)}</div>
                        <div className="fv-sim2__tt-body">
                          {simRoutes.map((r) => (
                            <div key={r.id} className="fv-sim2__tt-row">
                              <span className="fv-sim2__tt-dot" style={{ background: r.color }} />
                              <span>{(simLive[r.id]?.weather ?? 0).toFixed(2)} {simFactorDef.unit}</span>
                            </div>
                          ))}
                          <div className="fv-sim2__tt-thresh">
                            {t('safetyThresholds', 'Safety Threshold(s)')}
                          </div>
                          <div className="fv-sim2__tt-row">
                            <span className="fv-sim2__tt-dot fv-sim2__tt-dot--limit" />
                            <span>{t('maxLabel', 'Max')}: {simFactorDef.limit} {simFactorDef.unit}</span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  <svg className="fv-sim2__svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img"
                    aria-label={factorLabelFull}>
                    <line x1="0" y1={yFor(simFactorDef.limit)} x2="100" y2={yFor(simFactorDef.limit)}
                      className="fv-sim2__limit" vectorEffect="non-scaling-stroke" />
                    {simWeather.series.map((s) => {
                      const pts = s.points
                        .map((p) => {
                          const x = simMaxHours > 0 ? (p.t / simMaxHours) * 100 : 0;
                          return `${x.toFixed(2)},${yFor(p.w).toFixed(2)}`;
                        })
                        .join(' ');
                      const isActive = s.id === activeRouteId;
                      const dim = selectedRouteId && selectedRouteId !== s.id;
                      const w = s.id === selectedRouteId ? 2.6 : 1.7;
                      return (
                        <g key={s.id} strokeOpacity={dim ? 0.35 : 1}>
                          {/* Light casing so the black active line stays visible. */}
                          {isActive && (
                            <polyline points={pts} fill="none" stroke="#ffffff"
                              strokeOpacity={0.65} strokeWidth={w + 2}
                              strokeLinejoin="round" strokeLinecap="round"
                              vectorEffect="non-scaling-stroke" />
                          )}
                          <polyline points={pts} fill="none" stroke={s.color}
                            strokeWidth={w} strokeLinejoin="round" strokeLinecap="round"
                            vectorEffect="non-scaling-stroke" />
                        </g>
                      );
                    })}
                  </svg>
                  <div className="fv-sim2__xaxis">
                    {xTicks.map((tk, i) => (
                      <span key={i} style={{ left: `${tk.x}%` }}>{tk.label}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Routes table (full width) ----------------------------------- */}
          <div className="fv-sim2__routes">
            <div className="fv-sim2__routes-head">
              <span className="fv-sim2__routes-count">
                {simRoutes.length} {t('routes', 'Routes')}
              </span>
              {optimizedResults.length > 0 && (
                <button
                  type="button"
                  className="fv-sim2__routes-btn"
                  onClick={() => {
                    const visible = optimizedResults.filter((o) => !hiddenIds.includes(o.id));
                    openScenarioReport(
                      visible.map((o) => ({ name: o.name, metrics: o.metrics })),
                      optimizationRun,
                      t('nmUnit', 'NM'),
                    );
                  }}
                  title={t('optimizationReport', 'Optimization report')}
                >
                  <i className="fas fa-file-lines" aria-hidden="true" />{' '}
                  {t('optimizationReport', 'Optimization report')}
                </button>
              )}
            </div>
            <div className="fv-sim2__table-wrap">
              <table className="fv-sim2__table">
                <thead>
                  <tr>
                    <th className="fv-sim2__col-check" aria-label={t('show', 'Show')} />
                    <th className="fv-sim2__col-name">
                      <span className="fv-sim2__col-name-label">{t('route', 'Route')}</span>
                      <span className="fv-sim2__routes-tools">
                        <button type="button" className="fv-sim2__routes-btn"
                          onClick={importRoutes}
                          title={t('importRoutes', 'Import routes')}
                          aria-label={t('importRoutes', 'Import routes')}>
                          <i className="fas fa-file-import" aria-hidden="true" />
                        </button>
                        <button type="button" className="fv-sim2__routes-btn"
                          onClick={exportRoutes}
                          disabled={simRoutes.length === 0}
                          title={t('exportRoutes', 'Export routes')}
                          aria-label={t('exportRoutes', 'Export routes')}>
                          <i className="fas fa-file-export" aria-hidden="true" />
                        </button>
                        <button type="button" className="fv-sim2__routes-btn"
                          onClick={mergeVisibleRoutes}
                          disabled={mergeableCount < 2}
                          title={t('mergeRoutes', 'Merge routes')}
                          aria-label={t('mergeRoutes', 'Merge routes')}>
                          <i className="fas fa-code-merge" aria-hidden="true" />
                        </button>
                        <button type="button" className="fv-sim2__routes-btn"
                          onClick={splitSelectedRoute}
                          disabled={!canSplit}
                          title={t('splitRoute', 'Split route')}
                          aria-label={t('splitRoute', 'Split route')}>
                          <i className="fas fa-scissors" aria-hidden="true" />
                        </button>
                        {routeEditActive ? (
                          <>
                            <button type="button" className="fv-sim2__routes-btn fv-sim2__routes-btn--on"
                              onClick={() => requestRouteEdit('activate')}
                              title={t('activateEditHint', 'Keep this edited route')}
                              aria-label={t('activate', 'Activate')}>
                              <i className="fas fa-circle-check" aria-hidden="true" />
                            </button>
                            <button type="button" className="fv-sim2__routes-btn"
                              onClick={() => requestRouteEdit('discard')}
                              title={t('discardEditHint', 'Discard edits and restore the original route')}
                              aria-label={t('discard', 'Discard')}>
                              <i className="fas fa-rotate-left" aria-hidden="true" />
                            </button>
                          </>
                        ) : (
                          <button type="button" className="fv-sim2__routes-btn"
                            onClick={() => requestRouteEdit('start')}
                            title={t('editRouteHint', 'Duplicate the route and edit the copy')}
                            aria-label={t('duplicateEdit', 'Duplicate & Edit')}>
                            <i className="fas fa-pen-to-square" aria-hidden="true" />
                          </button>
                        )}
                        <input
                          ref={importInputRef}
                          type="file"
                          accept="application/json,.json"
                          onChange={onImportFile}
                          hidden
                        />
                      </span>
                    </th>
                    <th>{t('eta', 'ETA')}</th>
                    <th>{t('durationToGo', 'Duration to go')}</th>
                    <th>{t('ecaTimeToGo', 'ECA time to go')}</th>
                    <th>{t('distanceToGo', 'Distance to go')}</th>
                    <th>{t('ecaDistanceToGo', 'ECA distance to go')}</th>
                    <th>{t('avgSpeed', 'Avg speed')}</th>
                    <th>{t('totalCostToGo', 'Total cost to go')}</th>
                    <th>{t('fuelCostToGo', 'Fuel cost to go')}</th>
                    <th>{t('hireCost', 'Hire cost')}</th>
                    <th>{t('fuelReq', 'Fuel req.')}</th>
                    <th>{t('ecaFuelReq', 'ECA fuel req.')}</th>
                    <th>{t('euaCost', 'EUA cost')}</th>
                    <th>{t('euaAllowance', 'EUA allow.')}</th>
                  </tr>
                </thead>
                <tbody>
                  {simRoutes.map((r) => {
                    const frac = simLive[r.id]?.frac ?? 0;
                    const remain = 1 - frac;
                    const distToGo = r.distanceNm * remain;
                    const hoursToGo = r.hours * remain;
                    const etaDate = new Date(simBaseDate.getTime() + r.hours * 3600_000);
                    const fuelTons = r.distanceNm * FUEL_TONS_PER_NM * remain;
                    const fuelCost = fuelTons * FUEL_PRICE_PER_TON;
                    const hireCost = (hoursToGo / 24) * HIRE_PER_DAY;
                    const isSel = r.id === selectedRouteId;
                    // Full-voyage decision metrics (fuel required, EUA, etc.).
                    // Optimized routes carry their own scenario-specific metrics.
                    const m =
                      r.optimized && r.metrics
                        ? r.metrics
                        : computeRouteMetrics({
                            path: r.path,
                            distanceNm: r.distanceNm,
                            speedKn: SERVICE_SPEED_KN,
                            etd: simBaseDate,
                            market: DEFAULT_MARKET_FACTORS,
                            consPerDay: SERVICE_SPEED_KN * FUEL_TONS_PER_NM * 24,
                          });
                    return (
                      <tr key={r.id} className={isSel ? 'fv-sim2__trow--sel' : undefined}
                        onClick={() => setSelectedRouteId(r.id)}>
                        <td className="fv-sim2__col-check" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={!hiddenIds.includes(r.id)}
                            onChange={() => toggleRouteVisible(r.id)}
                            aria-label={t('showRoute', 'Show route')}
                          />
                        </td>
                        <td className="fv-sim2__col-name">
                          <span className="fv-sim2__swatch" style={{ background: r.color }} aria-hidden="true" />
                          <span className="fv-sim2__route-meta">
                            <span className="fv-sim2__route-name">{r.label}</span>
                            <span className="fv-sim2__route-sub">
                              {r.optimized ? (
                                <span className="fv-sim2__badge">{t('optimized', 'Optimized')}</span>
                              ) : r.active ? (
                                <span className="fv-sim2__badge fv-sim2__badge--active">{t('active', 'Active')}</span>
                              ) : (
                                r.sentAt && `${t('saved', 'Saved')}: ${fmtDay(new Date(r.sentAt))}`
                              )}
                            </span>
                          </span>
                          <span className="fv-sim2__row-actions" onClick={(e) => e.stopPropagation()}>
                            {r.optimized ? (
                              <>
                                <button type="button" className="fv-sim2__follow-btn"
                                  onClick={() => {
                                    const o = optimizedResults.find((x) => x.id === r.id);
                                    if (o) followOptimizedRoute(o);
                                  }}
                                  title={t('followRoute', 'Follow route')}>
                                  <i className="fas fa-circle-check" aria-hidden="true" /> {t('follow', 'Follow')}
                                </button>
                                <button type="button" className="fv-sim2__row-btn fv-sim2__row-btn--danger"
                                  onClick={() => removeOptimizationResult(r.id)}
                                  title={t('remove', 'Remove')}
                                  aria-label={t('remove', 'Remove')}>
                                  <i className="fas fa-trash" aria-hidden="true" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button type="button" className="fv-sim2__row-btn"
                                  title={t('assignVoyage', 'Assign to voyage')}
                                  aria-label={t('assignVoyage', 'Assign to voyage')}>
                                  <i className="fas fa-suitcase" aria-hidden="true" />
                                </button>
                                {r.savedId && (
                                  <button type="button" className="fv-sim2__row-btn"
                                    onClick={() => renameSavedRoute(r.savedId!, r.label)}
                                    title={t('renameRoute', 'Rename route')}
                                    aria-label={t('renameRoute', 'Rename route')}>
                                    <i className="fas fa-pen" aria-hidden="true" />
                                  </button>
                                )}
                                <button type="button"
                                  className={`fv-sim2__row-btn fv-sim2__row-active${r.active ? ' fv-sim2__row-active--on' : ''}`}
                                  onClick={() => setRouteActive(r.id)}
                                  disabled={r.active}
                                  title={r.active ? t('activeRoute', 'Active route') : t('setActive', 'Set as active')}
                                  aria-label={r.active ? t('activeRoute', 'Active route') : t('setActive', 'Set as active')}>
                                  <i className="fas fa-circle-check" aria-hidden="true" />
                                </button>
                                {r.savedId && (
                                  <button type="button" className="fv-sim2__row-btn fv-sim2__row-btn--danger"
                                    onClick={() => deleteSavedRoute(r.savedId!)}
                                    title={t('deleteRoute', 'Delete route')}
                                    aria-label={t('deleteRoute', 'Delete route')}>
                                    <i className="fas fa-trash" aria-hidden="true" />
                                  </button>
                                )}
                              </>
                            )}
                          </span>
                        </td>
                        <td>{fmtEta(etaDate)}</td>
                        <td>{formatDuration(hoursToGo)}</td>
                        <td>{formatDuration(hoursToGo * 0.06)}</td>
                        <td>{Math.round(distToGo).toLocaleString()} {t('nmUnit', 'NM')}</td>
                        <td>{Math.round(distToGo * 0.07).toLocaleString()} {t('nmUnit', 'NM')}</td>
                        <td>{m.speedKn.toFixed(1)} kn</td>
                        <td>{usd(fuelCost + hireCost)}</td>
                        <td>{usd(fuelCost)}</td>
                        <td>{usd(m.hireCost)}</td>
                        <td>{Math.round(m.fuelTons).toLocaleString()} t</td>
                        <td>{Math.round(m.ecaFuelTons).toLocaleString()} t</td>
                        <td>{usd(m.euaCost)}</td>
                        <td>{Math.round(m.euaAllowanceTons).toLocaleString()} t</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {exportOpen && (
        <div
          className="fv-sim2__export-overlay"
          role="presentation"
          onClick={() => setExportOpen(false)}
        >
          <div
            className="fv-sim2__export"
            role="dialog"
            aria-modal="true"
            aria-label={t('exportRoutesTitle', 'Export routes')}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="fv-sim2__export-head">
              <h3>
                {t(
                  'exportPrefsHint',
                  'Please select your route export preferences below',
                )}
              </h3>
            </header>

            <div className="fv-sim2__export-body">
              <section className="fv-sim2__export-sec">
                <span className="fv-sim2__export-sec-title">{t('routes', 'Routes')}</span>
                <label className="fv-sim2__export-opt">
                  <input
                    type="checkbox"
                    checked={allExportSelected}
                    onChange={toggleAllExportRoutes}
                  />
                  <span className="fv-sim2__export-opt-label">
                    {t('allRoutes', 'All routes')}
                  </span>
                </label>
                {simRoutes.map((r) => (
                  <label key={r.id} className="fv-sim2__export-opt">
                    <input
                      type="checkbox"
                      checked={exportSelIds.includes(r.id)}
                      onChange={() => toggleExportRoute(r.id)}
                    />
                    {r.active ? (
                      <span className="fv-sim2__badge fv-sim2__badge--active">
                        {t('active', 'Active')}
                      </span>
                    ) : (
                      <span
                        className="fv-sim2__export-dot"
                        style={{ background: r.color }}
                        aria-hidden="true"
                      />
                    )}
                    <span className="fv-sim2__export-opt-label">
                      {r.sentAt
                        ? `${t('sent', 'Sent')}: ${fmtEta(new Date(r.sentAt))}`
                        : r.label}
                    </span>
                  </label>
                ))}
              </section>

              <section className="fv-sim2__export-sec">
                <span className="fv-sim2__export-sec-title">{t('format', 'Format')}</span>
                {EXPORT_FORMATS.map((f) => (
                  <label key={f.id} className="fv-sim2__export-opt">
                    <input
                      type="checkbox"
                      checked={exportFormat === f.id}
                      onChange={() =>
                        setExportFormat((prev) => (prev === f.id ? null : f.id))
                      }
                    />
                    <span className="fv-sim2__export-opt-label">{f.label}</span>
                  </label>
                ))}
              </section>
            </div>

            <footer className="fv-sim2__export-foot">
              <button
                type="button"
                className="fv-sim2__export-btn"
                onClick={() => setExportOpen(false)}
              >
                {t('cancel', 'Cancel')}
              </button>
              <button
                type="button"
                className="fv-sim2__export-btn fv-sim2__export-btn--primary"
                onClick={confirmExport}
                disabled={exportFormat == null || exportSelIds.length === 0}
              >
                {t('export', 'Export')}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Small presentational helpers -------------------------------------------

function ReadoutRow({
  icon,
  iconColor,
  label,
  value,
}: {
  icon: string;
  iconColor?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="fv-sim2__ro">
      <i className={`fas ${icon}`} style={iconColor ? { color: iconColor } : undefined} aria-hidden="true" />
      <span className="fv-sim2__ro-label">{label}</span>
      <span className="fv-sim2__ro-value">{value}</span>
    </div>
  );
}
