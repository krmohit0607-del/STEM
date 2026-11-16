import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';

import { useL } from '../i18n/LocalizationProvider';
import { mergeVoyageShared } from '../data/voyageOverrides';
import { sampleWeatherField } from '../data/weatherField';
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
    clearActiveSimRoute,
  setSimWeatherHour,
  requestRouteEdit,
  requestMapFit,
  useActiveSimRoute,
  useRouteEditActive,
  useWeatherScrubHour,
  useRoutesToolbarSlot,
  type WaypointEngineOverride,
} from '../data/routeSimulatorStore';
import { useSavedRoutesVersion, useOptimizationResults, useOptimizationRun, removeOptimizationResult, followOptimizedRoute, bumpSavedRoutes } from '../data/optimizationStore';
import { OptimizationInsightsPanel } from './OptimizationInsightsPanel';
import {
  readSavedRoutesRaw,
  writeSavedRoutesRaw,
  readSavedRoutesForVoyage,
  tagRouteWithVoyage,
  readActiveRouteId,
  writeActiveRouteId,
} from '../data/savedRoutesStore';
import { computeRouteMetrics, DEFAULT_MARKET_FACTORS, type RouteMetrics } from '../data/routeMetrics';
import { openScenarioReport } from '../data/optimizationReport';
import { loadSavedPassages, saveSavedPassages, type SavedPassage } from '../data/savedPassages';
import { unwrapRouteCoordinates, antimeridianAwareBoundsBox } from '../data/antimeridian';
import { parseRouteTable, parseRouteText, type ImportedRoute } from '../data/routeImport';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { useRouteReportMarkers, type RouteReportMarker } from '../data/routeReportMarkers';
import { reportsForLeg } from './RouteEditorMap';
import { buildGuidanceEmail, downloadGuidancePdfFile, type GuidanceReportData } from '../data/guidanceReport';
import {
  readAisPositionsForVoyage,
  deleteAisPosition,
  useAisPositionsVersion,
  hydrateAisPositionsFromBackend,
  type AisPosition,
} from '../data/aisPositionsStore';
import {
  publishSimulatorSelection,
  type ComparisonCandidate,
} from '../data/comparisonSelectionStore';
import { markRouteUsed, getLastUsed, clearRouteUsage, isRouteStale } from '../data/routeUsageStore';
import { appendRouteHistory, type RouteHistoryEntry } from '../data/routeHistoryStore';
import { ReportEmailComposer } from './ReportEmailComposer';
import * as XLSX from 'xlsx';

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
  name?: string;
  /** Planned SOG (kt) departing this waypoint — mirrors `Waypoint.speed` in
   *  RouteExplorerPage.tsx; needed here (not just for display) to compute a
   *  drift-aware timing profile, so simulated playback actually sails each
   *  leg at its own planned speed instead of one constant average for the
   *  whole route. */
  speed?: number;
  /** ETA/ETD at this waypoint (ISO local string) — mirrors `Waypoint.eta`;
   *  needed alongside `driftUntil` below to compute how long the vessel
   *  should visibly hold position here during playback. */
  eta?: string;
  rpmMin?: number;
  rpmMax?: number;
  mcrMin?: number;
  mcrMax?: number;
  drift?: boolean;
  driftUntil?: string;
}

interface SavedRoute {
  id: string;
  name: string;
  savedAt: string;
  waypoints: SavedWaypoint[];
  /** The voyage this route was created for (absent on legacy routes). */
  voyageId?: string;
}

function readSavedRoutes(voyageId: string | undefined): SavedRoute[] {
  return readSavedRoutesForVoyage(voyageId) as SavedRoute[];
}

/** Used only to recognize the `storage` event for cross-tab refresh. */
const SAVED_ROUTES_KEY = 'fv.savedRoutes';

function writeSavedRoutes(routes: SavedRoute[]): void {
  writeSavedRoutesRaw(routes);
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

/** Colour of the AIS-reported track (actual positions sailed) — a dashed,
 *  muted grey so it reads as "what actually happened" vs. the planned route. */
const AIS_ROUTE_COLOR = '#8b949e';

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

/** Decimal degrees → `33° 51.215' N`: minutes to 3 decimals (about 2 m), so imported waypoints land where the file put them. */
function decToDMPrecise(value: number, isLat: boolean): string {
  const hemi = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  const totalThousandths = Math.round(Math.abs(value) * 60 * 1000);
  const deg = Math.floor(totalThousandths / 60000);
  const min = (totalThousandths - deg * 60000) / 1000;
  const pad = isLat ? 2 : 3;
  return `${String(deg).padStart(pad, '0')}° ${min.toFixed(3)}' ${hemi}`;
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

/** Sum of great-circle leg distances along a path, in nautical miles. */
function pathDistanceNmLocal(path: Array<[number, number]>): number {
  let d = 0;
  for (let i = 1; i < path.length; i += 1) {
    d += haversineNM(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
  }
  return d;
}

/** Parse a `datetime-local` input value (local time) to epoch ms, or null. */
function parseLocalDateTimeLocal(value: string | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Build a drift-aware timing profile for a saved route's waypoints, so
 * simulated playback sails each leg at its own planned speed (not one
 * constant average for the whole route) and visibly holds position at any
 * waypoint with a drift wait set — mirrors the exact same logic
 * RouteExplorerPage.tsx's own "publish to the simulator" effect already
 * uses for the live/currently-edited route; without this, a *saved* route
 * (the common case once an edit is actually saved rather than still being
 * actively edited) silently reverted to naive constant-speed interpolation,
 * so its drift waypoint would never actually appear to stop the vessel
 * during playback — one more leg among equals, sailed straight through.
 * Returns `{ path, timeHours }` — `path` may gain extra (duplicate-position)
 * points for each drift hold, so it must replace the plain geometry path,
 * not just add a parallel timing array to it.
 *
 * `voyageEtdMs` anchors every waypoint's *actual* arrival time (voyage ETD
 * plus this route's own cumulative sailing time so far) — the drift wait is
 * computed as "Drift until" minus that live/fresh arrival time, never a
 * waypoint's own *stored* `eta` field. A saved route's stored per-waypoint
 * ETAs reflect whatever the voyage's ETD happened to be the last time this
 * route was actually edited/saved; if the ETD has since changed (a very
 * normal thing to do — e.g. in CP & Leg Details), those stored values go
 * stale and are never automatically refreshed just by viewing the route.
 * Anchoring to the live, current ETD instead means the drift duration (and
 * everything downstream of it — ETA/time-to-go/average speed) always
 * reflects reality, not a frozen snapshot of some earlier ETD.
 */
function buildDriftAwareProfile(
  waypoints: SavedWaypoint[],
  voyageEtdMs: number,
  reportMarkers?: RouteReportMarker[],
): { path: Array<[number, number]>; timeHours: number[] } {
  const pts = waypoints
    .map((wp) => ({ wp, lat: dmToDec(wp.lat), lon: dmToDec(wp.lon) }))
    .filter((p) => !Number.isNaN(p.lat) && !Number.isNaN(p.lon));
  const path: Array<[number, number]> = [];
  const timeHours: number[] = [];
  if (pts.length === 0) return { path, timeHours };
  let cumHours = 0;
  path.push([pts[0].lat, pts[0].lon]);
  timeHours.push(0);
  const driftWaitHours = (wp: SavedWaypoint, arrivalCumHours: number): number => {
    if (!wp.drift || !wp.driftUntil) return 0;
    const untilMs = parseLocalDateTimeLocal(wp.driftUntil);
    if (untilMs == null) return 0;
    const arrivalMs = voyageEtdMs + arrivalCumHours * 3600_000;
    return Math.max(0, (untilMs - arrivalMs) / 3600_000);
  };
  const waitAtDeparture = driftWaitHours(pts[0].wp, 0);
  if (waitAtDeparture > 0) {
    cumHours += waitAtDeparture;
    path.push([pts[0].lat, pts[0].lon]);
    timeHours.push(cumHours);
  }
  for (let i = 1; i < pts.length; i += 1) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const legSpeed = prev.wp.speed && prev.wp.speed > 0 ? prev.wp.speed : SERVICE_SPEED_KN;
    // Thread this leg through any real reports chronologically between it
    // and the previous waypoint (see `reportsForLeg` in RouteEditorMap.tsx)
    // — keeps this saved-route row's own line/timing consistent with the
    // same leg's rendering on the map (only meaningful for whichever saved
    // route is this voyage's actual active one; `reportMarkers` is only
    // ever passed for that row — see its caller in `simRoutes`).
    if (reportMarkers && reportMarkers.length > 0) {
      const etaMsA = voyageEtdMs + cumHours * 3600_000;
      // Prefer the next waypoint's own (freshly computed) ETA as the upper
      // bracket bound when available — more accurate than a plain
      // distance/speed estimate once earlier legs have already threaded
      // through their own reports or drift waits.
      const estimatedEtaMsB =
        etaMsA + (haversineNM(prev.lat, prev.lon, curr.lat, curr.lon) / legSpeed) * 3600_000;
      const etaMsB = parseLocalDateTimeLocal(curr.wp.eta) ?? estimatedEtaMsB;
      const through = reportsForLeg(reportMarkers, etaMsA, etaMsB);
      for (const r of through) {
        cumHours += haversineNM(path[path.length - 1][0], path[path.length - 1][1], r.pos[0], r.pos[1]) / legSpeed;
        path.push([r.pos[0], r.pos[1]]);
        timeHours.push(cumHours);
      }
    }
    cumHours += haversineNM(path[path.length - 1][0], path[path.length - 1][1], curr.lat, curr.lon) / legSpeed;
    path.push([curr.lat, curr.lon]);
    timeHours.push(cumHours);
    const waitHours = driftWaitHours(curr.wp, cumHours);
    if (waitHours > 0) {
      cumHours += waitHours;
      path.push([curr.lat, curr.lon]);
      timeHours.push(cumHours);
    }
  }
  return { path, timeHours };
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
  const totalHours = Math.round(hours);
  const d = Math.floor(totalHours / 24);
  const h = totalHours % 24;
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

/**
 * Interpolate a point a fraction `t` of the way from `(lat0, lon0)` to
 * `(lat1, lon1)` along the straight line Leaflet actually draws between
 * them — which, on this Mercator map, is a rhumb line (constant bearing),
 * not a straight line in raw lat/lon degrees. Longitude is linear in true
 * lat/lon either way, but latitude is linear in *Mercator* y, not in raw
 * degrees — so a naive `lat0*(1-t) + lat1*t` cuts noticeably inside the
 * rendered line for any leg spanning real latitude (worse at higher
 * latitudes), which is exactly why the simulated vessel/report markers were
 * drifting visibly off the plotted track. `t` is assumed proportional to
 * along-track distance (true here since each leg is sailed at one constant
 * speed), which is also exactly proportional to the Mercator-y delta for a
 * rhumb line, so a plain lerp in Mercator space lands precisely on it.
 */
function lerpOnRenderedLine(
  lat0: number,
  lon0: number,
  lat1: number,
  lon1: number,
  t: number,
): [number, number] {
  const toMercatorY = (latDeg: number) => Math.log(Math.tan(Math.PI / 4 + (latDeg * Math.PI) / 360));
  const fromMercatorY = (y: number) => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90;
  const y0 = toMercatorY(lat0);
  const y1 = toMercatorY(lat1);
  const lat = fromMercatorY(y0 + (y1 - y0) * t);
  const lon = lon0 + (lon1 - lon0) * t;
  return [lat, lon];
}

/** Interpolate a `[lat, lon]` polyline at fractional `progress`, landing
 *  exactly on the straight (rhumb) line Leaflet renders between each pair
 *  of vertices — see `lerpOnRenderedLine`. */
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
  return lerpOnRenderedLine(lat0, lon0, lat1, lon1, t);
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
  return lerpOnRenderedLine(lat0, lon0, lat1, lon1, f);
}

/** Clamp an hour offset into the live-forecast window as a whole number. */
function clampHour(hours: number): number {
  return Math.max(0, Math.min(MAX_FORECAST_HOURS, Math.round(hours)));
}

/** Clamp an hour offset into the live-forecast window, keeping fractions —
 *  used while playback is live so the forecast moves continuously instead
 *  of snapping once per whole hour. */
function clampHourFrac(hours: number): number {
  return Math.max(0, Math.min(MAX_FORECAST_HOURS, hours));
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

const SIM_WEATHER_SAMPLES = 48;

/** Voyage-hours advanced per real second of playback at the Route Simulator's
 *  own Play button — matches the map's weather-timeline "1x" base rate (see
 *  `WeatherFieldControl.tsx`'s `HOURS_PER_SEC`), so both playback controls
 *  move at a consistent, meaningful pace tied to the voyage's actual planned
 *  speed/schedule, instead of the previous fixed "whole voyage in exactly 12
 *  seconds" (which made the ship's on-screen pace completely arbitrary and
 *  inconsistent between a short and a long voyage). */
const SIM_HOURS_PER_SEC = 1000 / 450;

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

/** Synthetic magnitude of a factor at a point (fallback while live loads) —
 *  the same model `WeatherFieldLayer` uses for the map, so the read-outs
 *  and chart never show a different "actual weather value" than the
 *  colours on the map. */
function factorMagnitudeSynthetic(
  lat: number,
  lon: number,
  factor: WeatherFactorId,
  hour: number,
): number {
  return sampleWeatherField(lat, lon, WEATHER_FACTOR_BY_ID[factor].liveId, hour).magnitude;
}

/** Weather magnitude at a fractional position along a route. */
function weatherAt(
  path: Array<[number, number]>,
  frac: number,
  factor: WeatherFactorDef,
  bounds: LatLngBounds | null,
  hour: number,
): number {
  const renderPath = unwrapRouteCoordinates(path);
  const lastIdx = renderPath.length - 1;
  const clamped = Math.max(0, Math.min(1, frac));
  const [lat, lon] = samplePath(renderPath, clamped * lastIdx);
  if (bounds) {
    const live = sampleLiveField(lat, lon, factor.liveId, bounds, hour);
    if (live && Number.isFinite(live.magnitude)) return Math.max(0, live.magnitude);
  }
  return factorMagnitudeSynthetic(lat, lon, factor.id, hour);
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
  return { mag: factorMagnitudeSynthetic(pos[0], pos[1], factor.id, hour), dir: null };
}

/** Whether the live grid for a factor has loaded over the given bounds. */
function isLiveLoaded(bounds: LatLngBounds | null, liveId: string): boolean {
  if (!bounds) return false;
  const cLat = (bounds.north + bounds.south) / 2;
  const cLon = (bounds.west + bounds.east) / 2;
  return sampleLiveField(cLat, cLon, liveId, bounds, 0) != null;
}

// --- Cost model (rough estimates — no ECA/cost feed is wired yet) -------------

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
  // `Intl.DateTimeFormat.format` throws "Invalid time value" on an Invalid
  // Date (unlike `toLocaleString`, which silently returns "Invalid Date") —
  // guard it here as a last line of defense so a bad upstream Date never
  // crashes the whole panel.
  if (Number.isNaN(d.getTime())) return '--';
  return dayFmt.format(d);
}
function fmtCursor(d: Date): string {
  if (Number.isNaN(d.getTime())) return '--';
  return `${dayFmt.format(d)} ${timeFmt.format(d)}Z`;
}
function fmtEta(d: Date): string {
  if (Number.isNaN(d.getTime())) return '--';
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

export type ExportFormatId = 'rtz' | 'jrc' | 'tokimec' | 'furuno' | 'nacos' | 'totem';

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

export interface ExportRoute {
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
export function buildRouteExport(format: ExportFormatId, routes: ExportRoute[]): string {
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
  /** Waypoint-level RPM/MCR and/or drift-until instructions along this route. */
  waypointOverrides?: WaypointEngineOverride[];
  /** Set for the derived "AIS Reported Route" — the actual track sailed,
   *  built from stored AIS positions rather than a planned/saved route. */
  isAis?: boolean;
}

export function RouteSimulatorPanel() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const activeRoute = useActiveSimRoute();
  const routeEditActive = useRouteEditActive();
  const routesToolbarSlot = useRoutesToolbarSlot();
  const voyage = useSelectedVoyage();

  // System-generated optimized routes (from the route editor's Optimize run),
  // appended after the saved routes in the table + chart + map.
  const optimizedResults = useOptimizationResults();
  const optimizationRun = useOptimizationRun();

  // AIS-reported positions — the actual track sailed (once a live feed is
  // wired in), shown as its own comparison route alongside the planned one.
  const aisPositionsVersion = useAisPositionsVersion();
  const [aisManagerOpen, setAisManagerOpen] = useState(false);
  useEffect(() => {
    void hydrateAisPositionsFromBackend();
  }, []);
  const aisPositions = useMemo(
    () => readAisPositionsForVoyage(voyage?.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [voyage?.id, aisPositionsVersion],
  );

  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>(() => readSavedRoutes(voyage?.id));
  // The single "active" (primary) route for the vessel — shown black.
  const [activeRouteId, setActiveRouteId] = useState<string | null>(() => readActiveRouteId(voyage?.id));
  // Routes hidden from the chart/map via the row checkbox.
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  useEffect(() => {
    const refresh = () => setSavedRoutes(readSavedRoutes(voyage?.id));
    const onStorage = (e: StorageEvent) => {
      if (e.key === SAVED_ROUTES_KEY || e.key === null) refresh();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, [voyage?.id]);

  // Re-read saved routes + active route when the Optimization "Follow route"
  // action (or any in-tab change) bumps the shared version, or the selected
  // voyage changes.
  const savedRoutesVersion = useSavedRoutesVersion();
  useEffect(() => {
    setSavedRoutes(readSavedRoutes(voyage?.id));
    setActiveRouteId(readActiveRouteId(voyage?.id));
  }, [savedRoutesVersion, voyage?.id]);

  // Self-healing invariant: a voyage with at least one saved route should
  // always have exactly one of them explicitly marked active. Without this,
  // uploading/plotting/generating a route (which only fills the editor's
  // live, unsaved "Planned route" draft until the user clicks Save) leaves
  // no saved route active — so the draft becomes the sole fallback-protected
  // route forever, and can never be deleted even once real saved routes
  // exist. Auto-picks the most recently saved route the first time this
  // voyage has routes but none active yet.
  useEffect(() => {
    if (activeRouteId || savedRoutes.length === 0) return;
    const mostRecent = [...savedRoutes].sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    )[0];
    if (!mostRecent) return;
    const id = `saved-${mostRecent.id}`;
    setActiveRouteId(id);
    writeActiveRouteId(voyage?.id, id);
  }, [savedRoutes, activeRouteId, voyage?.id]);

  // --- Playback state --------------------------------------------------------
  const [simClock, setSimClock] = useState(0);
  const [simPlaying, setSimPlaying] = useState(false);
  // True once the user has used this panel's own controls (chart cursor drag, step/skip/play): the vessel then follows them instead of the map weather timeline until that timeline is moved again.
  const [simDrives, setSimDrives] = useState(false);
  const simRafRef = useRef<number | null>(null);
  const simLastTsRef = useRef<number | null>(null);
  const [simFactor, setSimFactor] = useState<WeatherFactorId>('waves');
  const [liveVersion, setLiveVersion] = useState(0);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [savedPassageMsg, setSavedPassageMsg] = useState('');
  const simFactorDef = WEATHER_FACTOR_BY_ID[simFactor];
  const reportMarkers = useRouteReportMarkers();

  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'route';

  // --- Playable routes: active route (from map) + every saved route ----------
  /** The voyage's current/live ETD, as an epoch — the anchor every route's
   *  drift-wait math is computed against (see `buildDriftAwareProfile`), not
   *  any waypoint's own potentially-stale stored `eta`. Deliberately
   *  independent of `simBaseDate` below (which additionally falls back to
   *  the live weather data's own timestamp, and itself depends on
   *  `simBounds`, which is only known once `simRoutes` already exists) to
   *  avoid a circular dependency — this narrower anchor only needs the
   *  active route's own ETD, available immediately. */
  const voyageEtdMs = useMemo(() => {
    if (activeRoute?.etdIso) {
      const d = new Date(activeRoute.etdIso).getTime();
      if (!Number.isNaN(d)) return d;
    }
    return Date.now();
  }, [activeRoute?.etdIso]);

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
        waypointOverrides: activeRoute.waypointOverrides,
      });
    }
    savedRoutes.forEach((r) => {
      // Skip a saved entry the live `activeRoute` publish above is already
      // covering (its id is deliberately given the same `saved-{id}` shape
      // when it's backing a real saved route — see RouteExplorerPage.tsx's
      // own publish effect) — otherwise editing an existing route would
      // show both a live, real-time-updating row *and* a second, stale one
      // from this saved entry's last-saved content, which is exactly the
      // kind of duplicate-row bug this file has had to fix more than once.
      if (base.some((b) => b.id === `saved-${r.id}`)) return;
      // Reports represent the vessel's actually-recorded positions, so they
      // only ever matter for whichever saved route is this voyage's real
      // active one — threading them into every other (hypothetical/
      // candidate) saved route would be meaningless. Also keeps this row's
      // line in step with the exact same leg's main rendering on the map
      // (`RouteEditorMap.tsx`'s own per-waypoint polyline), which already
      // threads through reports for whatever's currently loaded/active —
      // without this, the two would visibly diverge into two different
      // lines for what's supposed to be the same route.
      const isActiveSavedRoute = activeRouteId?.replace(/^saved-/, '') === r.id;
      const { path, timeHours } = buildDriftAwareProfile(
        r.waypoints,
        voyageEtdMs,
        isActiveSavedRoute ? reportMarkers : undefined,
      );
      if (path.length < 2) return;
      const dist = pathDistanceNmLocal(path);
      const waypointOverrides = r.waypoints
        .filter(
          (wp) =>
            wp.rpmMin != null ||
            wp.rpmMax != null ||
            wp.mcrMin != null ||
            wp.mcrMax != null ||
            (wp.drift && wp.driftUntil),
        )
        .map((wp) => ({
          pos: [dmToDec(wp.lat), dmToDec(wp.lon)] as [number, number],
          label: wp.name,
          rpmMin: wp.rpmMin,
          rpmMax: wp.rpmMax,
          mcrMin: wp.mcrMin,
          mcrMax: wp.mcrMax,
          driftUntil: wp.drift ? wp.driftUntil : undefined,
        }))
        .filter((o) => !Number.isNaN(o.pos[0]) && !Number.isNaN(o.pos[1]));
      base.push({
        id: `saved-${r.id}`,
        savedId: r.id,
        label: r.name,
        path,
        distanceNm: Math.round(dist),
        hours: timeHours.length > 0 ? timeHours[timeHours.length - 1] : transitHours(dist),
        timeHours,
        sentAt: r.savedAt,
        waypointOverrides: waypointOverrides.length > 0 ? waypointOverrides : undefined,
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
    // Append the AIS-reported track (actual positions sailed), if any exist
    // for this voyage — distinct from every planned/saved/optimized route.
    const aisPath = aisPositions.map((p) => [p.lat, p.lon] as [number, number]);
    const ais: SimRoute[] =
      aisPath.length >= 2
        ? [
            {
              id: 'ais-reported',
              savedId: null,
              // Not run through `t()` here deliberately — this `useMemo`
              // must not depend on the inline `t` translator (a new
              // closure every render), or it recomputes on every render
              // instead of only when the underlying data changes, which
              // cascades into an infinite update loop for any cross-
              // component subscriber of this list (e.g. the Comparison
              // selection). The row itself still renders through `t(...)`.
              label: 'AIS Reported Route',
              color: AIS_ROUTE_COLOR,
              path: aisPath,
              distanceNm: Math.round(pathDistanceNmLocal(aisPath)),
              hours: 0,
              active: false,
              sentAt: aisPositions[aisPositions.length - 1]?.timestampIso ?? null,
              isAis: true,
            },
          ]
        : [];
    return [...mapped, ...optimized, ...ais];
  }, [activeRoute, savedRoutes, activeRouteId, optimizedResults, aisPositions, voyageEtdMs, reportMarkers]);

  /**
   * Only the active route (and, while editing, the live route itself) is
   * shown on the chart/map by default — every other saved/optimized route
   * starts hidden via its own checkbox, requiring a deliberate opt-in to
   * compare. Without this, every saved route for the voyage (there can be
   * several) was visible simultaneously from the moment the page loaded,
   * each drawing its own line on the weather chart — "one route" could
   * easily look like two or more near-identical overlapping lines even
   * outside an active edit session. Tracked via a ref (not reconsidered
   * every render) so a route the user deliberately re-shows via its
   * checkbox stays shown — this only auto-hides each id the *first* time
   * it's ever seen. */
  const autoHiddenOnceRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const keepVisible = new Set([activeRouteId, activeRoute?.id].filter(Boolean) as string[]);
    const toHide = simRoutes
      .map((r) => r.id)
      .filter((id) => !keepVisible.has(id) && !autoHiddenOnceRef.current.has(id));
    if (toHide.length === 0) return;
    toHide.forEach((id) => autoHiddenOnceRef.current.add(id));
    setHiddenIds((prev) => [...prev, ...toHide.filter((id) => !prev.includes(id))]);
  }, [simRoutes, activeRouteId, activeRoute?.id]);

  // Whichever route is active should always actually be visible — e.g.
  // "Activate"-ing a different saved route promotes it to active, but it
  // may have already been auto-hidden above back when it was just one of
  // several non-active saved routes; un-hide it (and the live route, for
  // the same reason) whenever either becomes the relevant one again.
  useEffect(() => {
    const mustShow = [activeRouteId, activeRoute?.id].filter(Boolean) as string[];
    setHiddenIds((prev) => prev.filter((id) => !mustShow.includes(id)));
  }, [activeRouteId, activeRoute?.id]);

  // --- Auto-archive stale, unused, non-active routes to "All Routes" --------
  // A non-active route (a saved route, or an optimizer scenario result)
  // that's gone unused for `ROUTE_STALE_AFTER_MS` is quietly archived
  // instead of cluttering this list forever: a saved route is recorded into
  // the permanent "All Routes" history and dropped from the active
  // saved-routes list; an optimizer result is simply dropped from the
  // active list — it's already permanently recorded in "All Routes" from
  // the moment its run completed (see `OptimizationRunDialog`), so nothing
  // further needs saving. "Used" means made Active, selected/viewed in this
  // table, or shown on the chart via its checkbox (see `routeUsageStore`);
  // the active route itself is never swept. A route with no usage stamp
  // yet gets one seeded immediately (its countdown starts from when it
  // first appeared here) rather than being treated as already stale.
  useEffect(() => {
    const voyageId = voyage?.id;
    if (!voyageId) return;

    const sweep = () => {
      savedRoutes.forEach((r) => {
        const simId = `saved-${r.id}`;
        if (simId === activeRouteId) return;
        const lastUsed = getLastUsed(voyageId, simId);
        if (lastUsed == null) {
          markRouteUsed(voyageId, simId);
          return;
        }
        if (!isRouteStale(lastUsed, undefined)) return;
        const path = r.waypoints
          .map((wp) => [dmToDec(wp.lat), dmToDec(wp.lon)] as [number, number])
          .filter(([lat, lon]) => !Number.isNaN(lat) && !Number.isNaN(lon));
        if (path.length >= 2) {
          let dist = 0;
          for (let k = 1; k < path.length; k += 1) {
            dist += haversineNM(path[k - 1][0], path[k - 1][1], path[k][0], path[k][1]);
          }
          const nowIso = new Date().toISOString();
          const entry: RouteHistoryEntry = {
            id: `archived-${r.id}`,
            voyageId,
            baseRouteName: r.name,
            name: r.name,
            generatedAt: r.savedAt || nowIso,
            path,
            summary: {
              distanceNm: Math.round(dist),
              durationH: transitHours(dist),
              speedKn: SERVICE_SPEED_KN,
              ecaDistanceNm: 0,
              ecaDurationH: 0,
              fuelTons: 0,
              ecaFuelTons: 0,
              fuelCost: 0,
              hireCost: 0,
              euaCost: 0,
              totalCost: 0,
              co2Tons: 0,
              etdIso: nowIso,
              etaIso: nowIso,
            },
            source: 'manual',
          };
          appendRouteHistory([entry]);
        }
        deleteSavedRoute(r.id);
        clearRouteUsage(voyageId, simId);
      });

      optimizedResults.forEach((o) => {
        const lastUsed = getLastUsed(voyageId, o.id);
        if (lastUsed == null) {
          markRouteUsed(voyageId, o.id);
          return;
        }
        if (!isRouteStale(lastUsed, undefined)) return;
        removeOptimizationResult(o.id);
        clearRouteUsage(voyageId, o.id);
      });
    };

    sweep();
    const interval = window.setInterval(sweep, 10 * 60_000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyage?.id, savedRoutes, activeRouteId, optimizedResults]);

  const hasRoutes = simRoutes.length > 0;

  /** Whether `route` should be treated as "the" active route that can't be
   *  deleted — either explicitly marked active, or (when nothing has been
   *  explicitly marked yet) a single fallback row, so there's always exactly
   *  one protected route instead of the list ever reaching zero through
   *  deletion. The fallback prefers a real saved route over the editor's
   *  live, unsaved "Planned route" mirror — the self-healing effect above
   *  normally activates a saved route as soon as one exists, but this still
   *  avoids the draft becoming permanently stuck as the only protected
   *  entry in any brief window before that effect runs. */
  const isEffectivelyActive = (route: SimRoute) => {
    if (route.active) return true;
    if (route.optimized) return false;
    const hasExplicitActive = simRoutes.some((r) => r.active);
    if (hasExplicitActive) return false;
    const firstSaved = simRoutes.find((r) => r.savedId);
    const fallbackId = firstSaved?.id ?? activeRoute?.id ?? simRoutes[0]?.id;
    return route.id === fallbackId;
  };

  /** Routes actually drawn on the chart/map (row checkbox toggles visibility). */
  const visibleRoutes = useMemo(
    () => simRoutes.filter((r) => !hiddenIds.includes(r.id)),
    [simRoutes, hiddenIds],
  );

  const checkedRoutes = useMemo(
    () => simRoutes.filter((r) => !hiddenIds.includes(r.id)),
    [simRoutes, hiddenIds],
  );

  const addCheckedToSavedPassages = () => {
    const current = loadSavedPassages();
    const geomSet = new Set(
      current.map((passage) => passage.points.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join(';')),
    );
    const converted: SavedPassage[] = checkedRoutes
      .filter((route) => route.path.length >= 2)
      .map((route) => ({
        id: `sim-${slug(route.label)}-${route.path.length}`,
        name: route.label,
        source: route.optimized ? 'Route Simulator (optimized)' : 'Route Simulator',
        points: route.path,
      }));
    const accepted = converted.filter((passage) => {
      const geom = passage.points.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join(';');
      if (geomSet.has(geom)) return false;
      geomSet.add(geom);
      return true;
    });
    if (!accepted.length) {
      setSavedPassageMsg('Checked routes are already in Saved Passages.');
      return;
    }
    const next = [...current, ...accepted];
    saveSavedPassages(next);
    setSavedPassageMsg(`${accepted.length} checked route${accepted.length === 1 ? '' : 's'} added to Saved Passages.`);
  };

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

  // Publish the saved + optimized + AIS route lines shown on the map
  // (visible + active).
  useEffect(() => {
    setMapCompareRoutes(
      mapRoutes
        .filter((r) => r.savedId != null || r.optimized || r.isAis)
        .map((r) => ({ id: r.id, color: r.color, path: r.path })),
    );
  }, [mapRoutes]);

  // On unmount (e.g. the bottom drawer collapsing), every *other* compared
  // route may disappear from the map, but the active route must stay drawn —
  // so the cleanup re-publishes just that one route instead of clearing the
  // whole list. A ref tracks the latest active geometry since this mount-only
  // effect's closure would otherwise only see the value from first render.
  const activeCompareRouteRef = useRef<{ id: string; color: string; path: Array<[number, number]> } | null>(null);
  useEffect(() => {
    activeCompareRouteRef.current =
      activeSimRoute && (activeSimRoute.savedId != null || activeSimRoute.optimized || activeSimRoute.isAis)
        ? { id: activeSimRoute.id, color: activeSimRoute.color, path: activeSimRoute.path }
        : null;
  }, [activeSimRoute]);
  useEffect(
    () => () =>
      setMapCompareRoutes(activeCompareRouteRef.current ? [activeCompareRouteRef.current] : []),
    [],
  );

  // Mirror the planned route's colour (black when it's the active route) onto
  // the map, and draw waypoints for the active route only.
  const plannedRow = simRoutes.find((r) => r.id === 'active-planned');
  // The editor's live route is only published as its own `'active-planned'`
  // row when it's showing something genuinely different from this voyage's
  // active saved route (see `RouteExplorerPage`'s publish effect) — the far
  // more common case of simply *viewing* the already-active route has no
  // such row to read a colour from, but the line drawn on the map is still
  // that active route and must still render black, not fall back to blue.
  const plannedColor = plannedRow?.color ?? (activeRouteId ? ACTIVE_ROUTE_COLOR : '#58a6ff');
  const plannedColorRef = useRef(plannedColor);
  plannedColorRef.current = plannedColor;
  useEffect(() => {
    setMapPlannedColor(plannedColor);
  }, [plannedColor]);
  // Keep the planned route's colour (e.g. black when it's also the active
  // route) instead of resetting it to the default blue on unmount.
  useEffect(() => () => setMapPlannedColor(plannedColorRef.current), []);

  const activeWaypoints = useMemo<Array<{ pos: [number, number]; color: string }>>(() => {
    // The active saved route and the saved route selected in the table show their own waypoints,
    // so an imported route can be checked point by point; the planned route's waypoints are
    // already drawn by the map editor.
    const shown = [activeSimRoute, simRoutes.find((r) => r.id === selectedRouteId)]
      .filter((r, index, all): r is SimRoute => !!r && !!r.savedId && all.findIndex((other) => other?.id === r.id) === index);
    const out: Array<{ pos: [number, number]; color: string }> = [];
    shown.forEach((route) => {
      const saved = savedRoutes.find((s) => s.id === route.savedId);
      if (!saved) return;
      saved.waypoints.forEach((wp) => {
        const lat = dmToDec(wp.lat);
        const lon = dmToDec(wp.lon);
        if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
          out.push({ pos: [lat, lon], color: route.color });
        }
      });
    });
    return out;
  }, [activeSimRoute, simRoutes, selectedRouteId, savedRoutes]);

  const activeWaypointsRef = useRef(activeWaypoints);
  activeWaypointsRef.current = activeWaypoints;
  useEffect(() => {
    setMapRouteWaypoints(activeWaypoints);
  }, [activeWaypoints]);
  // Keep the active route's waypoint dots instead of clearing them on unmount.
  useEffect(() => () => setMapRouteWaypoints(activeWaypointsRef.current), []);


  const simMaxHours = useMemo(
    () => visibleRoutes.reduce((m, r) => Math.max(m, r.hours), 0),
    [visibleRoutes],
  );

  const simBounds = useMemo<LatLngBounds | null>(
    () => antimeridianAwareBoundsBox(visibleRoutes.flatMap((r) => r.path)),
    [visibleRoutes],
  );

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

  /** Full-route metrics for a row — the same computation the table uses for
   *  each route, extracted so the Comparison publish effect below can reuse
   *  it without duplicating the fallback logic. */
  const metricsForRoute = (r: SimRoute): RouteMetrics =>
    r.optimized && r.metrics
      ? r.metrics
      : computeRouteMetrics({
          path: r.path,
          distanceNm: r.distanceNm,
          speedKn: r.hours > 0 ? r.distanceNm / r.hours : SERVICE_SPEED_KN,
          etd: simBaseDate,
          market: DEFAULT_MARKET_FACTORS,
          consPerDay:
            (r.hours > 0 ? r.distanceNm / r.hours : SERVICE_SPEED_KN) * FUEL_TONS_PER_NM * 24,
        });

  // Keep the shared Comparison-selection store's "from Route Simulator"
  // contribution in lockstep with whichever rows are currently checked —
  // declaratively, so it can never go stale (e.g. after a voyage switch
  // resets the checked set) the way an imperative per-click update could.
  // Depends on a derived primitive key, not `checkedRoutes` itself — that
  // array (like `simRoutes`) is rebuilt on every render (its `useMemo`
  // depends on the inline `t` translator, a new closure each render), so
  // depending on its reference directly would re-run this effect — and
  // notify the Comparison button's subscription — on every single render,
  // which cascades into an infinite update loop.
  const checkedRoutesKey = checkedRoutes
    .map((r) => `${r.id}:${r.distanceNm.toFixed(1)}:${r.hours.toFixed(2)}`)
    .join('|');
  useEffect(() => {
    publishSimulatorSelection(
      checkedRoutes
        .filter((r) => r.path.length >= 2)
        .map((r) => {
          const m = metricsForRoute(r);
          const candidate: ComparisonCandidate = {
            key: `sim-${r.id}`,
            label: r.label,
            color: r.color,
            path: r.path,
            distanceNm: m.distanceNm,
            durationH: m.durationH,
            speedKn: m.speedKn,
            ecaDistanceNm: m.ecaDistanceNm,
            ecaDurationH: m.ecaDurationH,
            fuelTons: m.fuelTons,
            ecaFuelTons: m.ecaFuelTons,
            fuelCost: m.fuelCost,
            hireCost: m.hireCost,
            euaCost: m.euaCost,
            totalCost: m.totalCost,
            co2Tons: m.co2Tons,
            etdIso: m.etd.toISOString(),
            etaIso: m.eta.toISOString(),
          };
          return candidate;
        }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedRoutesKey, simBaseDate]);
  // Clear this panel's contribution when it unmounts (e.g. the drawer
  // collapses to a different tab's content being the only one left).
  useEffect(() => () => publishSimulatorSelection([]), []);

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

  // The Route Simulator's own Play button starts from "today" — where the
  // vessel would realistically be right now given its ETD and each leg's
  // planned speed — not from the voyage's absolute start, so the first
  // thing you see on load already reflects the real forecast position. Only
  // applies until the user actually interacts with playback themselves
  // (`userTouchedSimRef`); after that, their manual position always wins and
  // is never silently overridden by this.
  const userTouchedSimRef = useRef(false);
  const todayElapsedFraction = (): number => {
    if (simMaxHours <= 0) return 0;
    const base = simBaseDate.getTime();
    if (Number.isNaN(base)) return 0;
    const elapsedHours = Math.max(0, Math.min(simMaxHours, (Date.now() - base) / 3600_000));
    return elapsedHours / simMaxHours;
  };

  useEffect(() => {
    setSimPlaying(false);
    if (!userTouchedSimRef.current) setSimClock(todayElapsedFraction());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedRoutes, activeRoute?.id]);

  // Once the base date/max hours actually resolve (they depend on the
  // weather fetch and the active route's ETD, both async), (re)apply
  // "today" as the starting position — same guard, so a manual seek is
  // never clobbered once the user has touched the controls.
  useEffect(() => {
    if (!userTouchedSimRef.current) setSimClock(todayElapsedFraction());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simBaseDate, simMaxHours]);

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
    const hoursPerMs = SIM_HOURS_PER_SEC / 1000;
    const tick = (ts: number) => {
      if (simLastTsRef.current == null) simLastTsRef.current = ts;
      const dt = ts - simLastTsRef.current;
      simLastTsRef.current = ts;
      setSimClock((prev) => {
        if (simMaxHours <= 0) return prev;
        const next = prev + (dt * hoursPerMs) / simMaxHours;
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
  }, [simPlaying, simMaxHours]);

  const simElapsedHours = simClock * simMaxHours;

  // Mirror image of the weather-hour hookup below: while this panel's own
  // playback is actively *playing*, it drives the vessel; the moment it's
  // paused (even mid-voyage — a lingering `simClock` must not lock this out
  // indefinitely), the manual weather timeline takes back over, so dragging
  // the weather timeline and this panel's own simulation always agree on
  // "now" — never showing two different vessel positions/times at once.
  // Uses `simBaseDate` (not a bare `activeRoute.etdIso` requirement) so this
  // still works even when the voyage has no ETD set yet, matching every
  // other time calculation in this panel (`cursorDate` etc.) that already
  // falls back the same way. Before ETD or after ETA the vessel simply
  // stays in port: `positionAtHours` already clamps out-of-range hours to
  // the first/last waypoint, so only the weather itself keeps moving with
  // the timeline in that case, not the ship.
  const weatherScrubHour = useWeatherScrubHour();
  const simIsActive = simPlaying || simDrives;
  useEffect(() => {
    setSimDrives(false);
    setSimPlaying(false);
    setSimClock(0);
  }, [weatherScrubHour]);
  const weatherDrivenElapsedHours = useMemo(() => {
    if (simIsActive || weatherScrubHour == null || simMaxHours <= 0) return null;
    const base = simBaseDate.getTime();
    if (Number.isNaN(base)) return null;
    const scrubbedRealTime = Date.now() + weatherScrubHour * 3600_000;
    return (scrubbedRealTime - base) / 3600_000;
  }, [simIsActive, weatherScrubHour, simBaseDate, simMaxHours]);
  /** Elapsed voyage hours actually used to render the vessel marker, chart
   *  cursor and weather read-out — the real simulation clock when it's
   *  running, otherwise the weather timeline's position (may be negative or
   *  beyond the voyage total; every position lookup below clamps that to
   *  the first/last waypoint, which is exactly the "stay in port" result
   *  wanted before ETD / after ETA). */
  const effectiveElapsedHours = weatherDrivenElapsedHours ?? simElapsedHours;
  const cursorDate = new Date(simBaseDate.getTime() + effectiveElapsedHours * 3600_000);
  const simWeatherHour = clampHourFrac(effectiveElapsedHours);

  // Fetch the weather slice for the current simulation time so the compass
  // directions follow playback instead of remaining fixed at the initial hour.
  useEffect(() => {
    if (!simBounds) return;
    ['waves', 'swell', 'wind', 'currents'].forEach((factorId) =>
      ensureLiveData(factorId, simBounds, simWeatherHour, () => setLiveVersion((v) => v + 1)),
    );
  }, [simBounds, simWeatherHour]);

  /**
   * Vessel position on a route after `hours` of sailing. Uses the per-leg
   * timing profile (so each leg is sailed at its planned speed) when available,
   * otherwise falls back to constant-speed interpolation by path fraction.
   */
  const posAtHours = (r: SimRoute, hours: number): [number, number] => {
    const renderPath = unwrapRouteCoordinates(r.path);
    const byTime = positionAtHours(renderPath, r.timeHours, hours);
    if (byTime) return byTime;
    const frac = r.hours > 0 ? Math.min(1, hours / r.hours) : 0;
    return samplePath(renderPath, frac * (renderPath.length - 1));
  };

  /**
   * Build the voyage-guidance data (speed/RPM/ETA/weather/expected positions)
   * sent to the vessel from a route row's "Send guidance" action. `remain` is
   * the fraction of the route still ahead (1 - elapsed fraction), matching the
   * "to go" figures already shown in that row.
   */
  const buildGuidanceData = (r: SimRoute, m: RouteMetrics, remain: number): GuidanceReportData => {
    const hoursToGo = Math.max(0, r.hours - simElapsedHours);
    // Rough RPM estimate: scale the vessel's rated RPM (parsed from its engine
    // power particulars) by the route's speed relative to CP speed.
    const rpmMatch = voyage?.enginePower?.match(/([\d.]+)\s*RPM/i);
    const baseRpm = rpmMatch ? Number(rpmMatch[1]) : 90;
    const cpSpeed = voyage?.cpSpeed || SERVICE_SPEED_KN;
    const rpm = Math.round(baseRpm * (m.speedKn / Math.max(1, cpSpeed)));

    // Waypoint-level RPM/MCR + drift-until instructions still ahead of the
    // vessel's current simulated position, so the guidance reflects exactly
    // what was set in the Waypoint details panel.
    const aheadOverrides = (r.waypointOverrides ?? [])
      .map((o) => {
        let bestIdx = 0;
        let bestDist = Number.POSITIVE_INFINITY;
        r.path.forEach((p, idx) => {
          const d = haversineNM(p[0], p[1], o.pos[0], o.pos[1]);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = idx;
          }
        });
        const hoursAt =
          r.timeHours && r.timeHours.length === r.path.length
            ? r.timeHours[bestIdx]
            : r.path.length > 1
              ? (bestIdx / (r.path.length - 1)) * r.hours
              : 0;
        return { o, bestDist, hoursAt };
      })
      .filter(({ bestDist, hoursAt }) => bestDist <= 15 && hoursAt >= simElapsedHours)
      .sort((a, b) => a.hoursAt - b.hoursAt);

    const engineInstructions = aheadOverrides
      .filter(
        ({ o }) => o.rpmMin != null || o.rpmMax != null || o.mcrMin != null || o.mcrMax != null,
      )
      .map(({ o }) => ({
        posLabel: o.label || `${decToDM(o.pos[0], true)} ${decToDM(o.pos[1], false)}`,
        rpmMin: o.rpmMin,
        rpmMax: o.rpmMax,
        mcrMin: o.mcrMin,
        mcrMax: o.mcrMax,
      }));

    const driftAhead = aheadOverrides.find(({ o }) => o.driftUntil);
    const driftNotice = driftAhead
      ? {
          posLabel:
            driftAhead.o.label ||
            `${decToDM(driftAhead.o.pos[0], true)} ${decToDM(driftAhead.o.pos[1], false)}`,
          untilLabel: new Date(driftAhead.o.driftUntil!).toLocaleString(),
        }
      : undefined;

    const intervalH = hoursToGo > 96 ? 24 : hoursToGo > 36 ? 12 : hoursToGo > 12 ? 6 : Math.max(1, hoursToGo);
    const offsets: number[] = [];
    if (hoursToGo <= 0) {
      offsets.push(0);
    } else {
      for (let h = 0; h < hoursToGo; h += intervalH) offsets.push(h);
      if (offsets[offsets.length - 1] !== hoursToGo) offsets.push(hoursToGo);
    }
    const fmtMagDir = (mag: number, unit: string, dir: number | null) =>
      `${mag.toFixed(1)} ${unit}${dir != null ? ` / ${Math.round(dir)}°` : ''}`;
    const points = offsets.slice(0, 15).map((offset) => {
      const t = simElapsedHours + offset;
      const pos = posAtHours(r, t);
      const date = new Date(m.etd.getTime() + t * 3600_000);
      const hourClamped = clampHour(t);
      const wind = readoutAt(pos, WEATHER_FACTOR_BY_ID.wind, simBounds, hourClamped);
      const waves = readoutAt(pos, WEATHER_FACTOR_BY_ID.waves, simBounds, hourClamped);
      const swell = readoutAt(pos, WEATHER_FACTOR_BY_ID.swell, simBounds, hourClamped);
      const current = readoutAt(pos, WEATHER_FACTOR_BY_ID.current, simBounds, hourClamped);
      const distanceToGoNm = Math.max(0, m.distanceNm * (1 - t / Math.max(1e-6, r.hours)));
      return {
        dateTime: fmtEta(date),
        latLon: `${decToDM(pos[0], true)} ${decToDM(pos[1], false)}`,
        speedKn: m.speedKn,
        rpm,
        distanceToGoNm,
        wind: fmtMagDir(wind.mag, 'kt', wind.dir),
        waves: fmtMagDir(waves.mag, 'm', waves.dir),
        swell: fmtMagDir(swell.mag, 'm', swell.dir),
        current: fmtMagDir(current.mag, 'kt', current.dir),
      };
    });

    return {
      vessel: voyage?.vessel ?? r.label,
      imo: voyage?.imo ?? '--',
      client: voyage?.client ?? '--',
      clientEmail: voyage?.clientEmail || 'master@vessel.example.com',
      routeLabel: r.label,
      routeRef: voyage?.routeRef ?? r.id,
      etdLabel: fmtEta(m.etd),
      etaLabel: fmtEta(m.eta),
      speedKn: m.speedKn,
      rpm,
      distanceToGoNm: m.distanceNm * remain,
      durationToGoLabel: formatDuration(hoursToGo),
      ecaDistanceNm: m.ecaDistanceNm * remain,
      ecaDurationLabel: formatDuration(m.ecaDurationH * remain),
      fuelReqToGoMt: m.fuelTons * remain,
      ecaFuelReqToGoMt: m.ecaFuelTons * remain,
      co2ToGoMt: m.co2Tons * remain,
      totalCostToGoUsd: (m.fuelCost + m.hireCost + m.euaCost) * remain,
      fuelCostToGoUsd: m.fuelCost * remain,
      timeCostToGoUsd: m.hireCost * remain,
      emissionsCostToGoUsd: m.euaCost * remain,
      points,
      engineInstructions: engineInstructions.length > 0 ? engineInstructions : undefined,
      driftNotice,
      generatedAtLabel: fmtEta(new Date()),
    };
  };

  // Guidance popup: which route the "Send guidance" (suitcase) button was
  // opened for, snapshotted at click time so the popup acts on the figures
  // the user saw in that row. `guidanceData` is derived once per snapshot so
  // it stays stable while the composer below is open and being edited.
  const [guidanceCtx, setGuidanceCtx] = useState<{ r: SimRoute; m: RouteMetrics; remain: number } | null>(null);
  const [guidanceIncludePdf, setGuidanceIncludePdf] = useState(true);
  const [guidancePdfBusy, setGuidancePdfBusy] = useState(false);
  const [guidancePdfDone, setGuidancePdfDone] = useState(false);

  const guidanceData = useMemo<GuidanceReportData | null>(
    () => (guidanceCtx ? buildGuidanceData(guidanceCtx.r, guidanceCtx.m, guidanceCtx.remain) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [guidanceCtx],
  );

  /** Download the PDF guidance report straight to the browser's downloads folder. */
  const downloadGuidancePdf = async () => {
    if (!guidanceData || guidancePdfBusy) return;
    setGuidancePdfBusy(true);
    try {
      await downloadGuidancePdfFile(guidanceData);
      setGuidancePdfDone(true);
      window.setTimeout(() => setGuidancePdfDone(false), 2500);
    } finally {
      setGuidancePdfBusy(false);
    }
  };

  /** Per-route fraction sailed + current-cursor weather on the chart factor. */
  const simLive = useMemo(() => {
    const byId: Record<string, { frac: number; weather: number }> = {};
    simRoutes.forEach((r) => {
      const frac = r.hours > 0 ? Math.max(0, Math.min(1, effectiveElapsedHours / r.hours)) : 0;
      const elapsed = Math.max(0, Math.min(effectiveElapsedHours, r.hours));
      byId[r.id] = {
        frac,
        weather: weatherAt(r.path, frac, simFactorDef, simBounds, clampHourFrac(elapsed)),
      };
    });
    return byId;
  }, [simRoutes, effectiveElapsedHours, simFactorDef, simBounds, liveVersion]);

  const selectedRoute = simRoutes.find((r) => r.id === selectedRouteId) ?? simRoutes[0] ?? null;

  /** Live weather read-out at the selected vessel's current position. */
  const readout = useMemo(() => {
    void liveVersion;
    if (!selectedRoute) return null;
    const elapsed = Math.max(0, Math.min(effectiveElapsedHours, selectedRoute.hours));
    const pos = posAtHours(selectedRoute, elapsed);
    const heading = bearingDeg(
      posAtHours(selectedRoute, Math.max(0, elapsed - 0.5)),
      posAtHours(selectedRoute, Math.min(selectedRoute.hours, elapsed + 0.5)),
    );
    const get = (id: WeatherFactorId) =>
      readoutAt(pos, WEATHER_FACTOR_BY_ID[id], simBounds, clampHourFrac(elapsed));
    return {
      pos,
      heading,
      waves: get('waves'),
      swell: get('swell'),
      wind: get('wind'),
      current: get('current'),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoute, simLive, effectiveElapsedHours, simBounds, liveVersion]);

  // Vessel markers at each route's current simulated position, mirrored onto
  // the Route Explorer map so the live position is visible while simulating
  // (or while the weather timeline is scrubbed — see `effectiveElapsedHours`
  // above; before ETD / after ETA the vessel simply stays at the departure/
  // arrival waypoint since `elapsed` is clamped to the voyage's own range).
  const shipMarkers = useMemo(
    () =>
      mapRoutes.map((r) => {
        const frac = simLive[r.id]?.frac ?? 0;
        const elapsed = Math.max(0, Math.min(effectiveElapsedHours, r.hours));
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
    [mapRoutes, simLive, effectiveElapsedHours, selectedRouteId],
  );

  useEffect(() => {
    setMapShipMarkers(shipMarkers);
  }, [shipMarkers]);

  useEffect(() => () => setMapShipMarkers([]), []);

  // Drive the map weather layers from the simulation time while playing (or
  // scrubbing), so the on-map weather advances in step with the vessel; hand
  // control back to the manual weather slider when the simulation is idle.
  // Throttled to a wall-clock cadence (not every animation frame) to bound
  // how often the field re-renders — the on-map layer rebuilds real vector
  // contour polygons per update, which is heavier than a plain canvas
  // repaint, so this is deliberately slower than a UI animation frame rate.
  // Weather systems evolve over hours, not seconds, so this cadence still
  // reads as the forecast moving along with the voyage.
  const lastSimHourRef = useRef<number | null>(null);
  const lastSimHourTsRef = useRef(0);
  useEffect(() => {
    const active = simPlaying || simClock > 0;
    if (!active) {
      if (lastSimHourRef.current !== null) {
        lastSimHourRef.current = null;
        setSimWeatherHour(null);
      }
      return;
    }
    const next = Math.max(0, simElapsedHours);
    const now = performance.now();
    const changed = lastSimHourRef.current == null || Math.abs(next - lastSimHourRef.current) > 0.05;
    const due = now - lastSimHourTsRef.current > 200;
    if (changed && due) {
      lastSimHourRef.current = next;
      lastSimHourTsRef.current = now;
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
    userTouchedSimRef.current = true;
    setSimDrives(true);
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
    const nextAll = (readSavedRoutesRaw() as SavedRoute[]).filter((r) => r.id !== savedId);
    writeSavedRoutes(nextAll);
    setSavedRoutes(readSavedRoutes(voyage?.id));
    setActiveRouteId((prev) => {
      if (prev !== `saved-${savedId}`) return prev;
      writeActiveRouteId(voyage?.id, null);
      return null;
    });
  };

  /** Route pending delete confirmation — shown as an in-app modal (not the
   *  browser's native `window.confirm`) so it matches the rest of the UI. */
  const [deleteConfirmRoute, setDeleteConfirmRoute] = useState<SimRoute | null>(null);

  /** Delete a route — blocked for the active route (activate a different one
   *  first), and confirmed via an in-app dialog for any other, so a route is
   *  never lost by accident. */
  const deleteRoute = (route: SimRoute) => {
    if (isEffectivelyActive(route)) return;
    setDeleteConfirmRoute(route);
  };

  const cancelDeleteRoute = () => setDeleteConfirmRoute(null);

  const confirmDeleteRoute = () => {
    const route = deleteConfirmRoute;
    setDeleteConfirmRoute(null);
    if (!route) return;
    if (route.savedId) {
      deleteSavedRoute(route.savedId);
      return;
    }
    if (route.id === 'active-planned') {
      requestRouteEdit('clear');
      return;
    }
    clearActiveSimRoute();
  };

  /** Mark a route as the single active (primary) route for the vessel. This
   *  is a deliberate "activate" action, so it turns off this voyage's "Auto
   *  Route" (CP & Leg Details) immediately — the activated route is now the
   *  one to keep, not something to silently regenerate. */
  const setRouteActive = (routeId: string) => {
    setActiveRouteId(routeId);
    writeActiveRouteId(voyage?.id, routeId);
    if (voyage?.id) mergeVoyageShared(voyage.id, { leg1AutoRoute: false });
    markRouteUsed(voyage?.id, routeId);
  };

  /** Toggle whether a route is drawn on the chart / map. */
  const toggleRouteVisible = (routeId: string) => {
    setHiddenIds((prev) => {
      const nowHidden = prev.includes(routeId);
      // Turning a route *on* (making it visible) counts as using it; turning
      // it off doesn't reset that — it just stops showing on the chart.
      if (nowHidden) markRouteUsed(voyage?.id, routeId);
      return nowHidden ? prev.filter((x) => x !== routeId) : [...prev, routeId];
    });
  };

  /** Rename a saved route. */
  const renameSavedRoute = (savedId: string, currentName: string) => {
    const name = window.prompt(t('renameRoutePrompt', 'Rename route'), currentName);
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const nextAll = (readSavedRoutesRaw() as SavedRoute[]).map((r) =>
      r.id === savedId ? { ...r, name: trimmed } : r,
    );
    writeSavedRoutes(nextAll);
    setSavedRoutes(readSavedRoutes(voyage?.id));
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

  const importedWaypoints = (points: Array<[number, number]>, name: string): SavedRoute => ({
    id: `route-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name || `${t('imported', 'Imported route')}`,
    savedAt: new Date().toISOString(),
    waypoints: points.map(([lat, lon], index) => ({
      id: `wp-import-${Date.now()}-${index}`,
      name: index === 0 ? 'Departure' : index === points.length - 1 ? 'Arrival' : `WP ${index + 1}`,
      lat: decToDMPrecise(lat, true), lon: decToDMPrecise(lon, false), course: 0, speed: SERVICE_SPEED_KN,
      distanceFromPrev: index === 0 ? 0 : haversineNM(points[index - 1][0], points[index - 1][1], lat, lon),
      eta: '', drift: false, isPort: index === 0 || index === points.length - 1, legType: 'rhumb',
    })),
  });

  /** Open the file picker for JSON, GeoJSON, CSV, TXT, RTZ, GPX, KML, or Excel route files. */
  const importRoutes = () => importInputRef.current?.click();

  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const notes: string[] = [];
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'Imported route';
      let found: ImportedRoute[] = [];
      if (extension === 'xlsx' || extension === 'xls') {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        workbook.SheetNames.forEach((sheetName) => {
          const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: '' });
          const label = workbook.SheetNames.length > 1 ? `${baseName} - ${sheetName}` : baseName;
          found.push(...parseRouteTable(rows, label, notes));
        });
      } else {
        const result = parseRouteText(await file.text(), extension, baseName);
        found = result.routes;
        notes.push(...result.notes);
      }
      if (found.length === 0) throw new Error('No route coordinates found');
      const cleaned = found.map((route) => importedWaypoints(route.points, route.name));
      const tagged = cleaned.map((r) => tagRouteWithVoyage(r, voyage?.id));
      writeSavedRoutes([...(readSavedRoutesRaw() as SavedRoute[]), ...tagged]);
      setSavedRoutes(readSavedRoutes(voyage?.id));
      bumpSavedRoutes();

      // Show what was read: select the first imported route, make sure it is drawn, and zoom the map to it.
      const firstSimId = `saved-${tagged[0].id}`;
      const importedIds = tagged.map((r) => `saved-${r.id}`);
      setHiddenIds((prev) => prev.filter((id) => !importedIds.includes(id)));
      setSelectedRouteId(firstSimId);
      requestMapFit(found.flatMap((route) => route.points));
      const describe = (route: ImportedRoute) => {
        const nm = route.points.slice(1).reduce((sum, point, i) => sum + haversineNM(route.points[i][0], route.points[i][1], point[0], point[1]), 0);
        const at = ([lat, lon]: [number, number]) => `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
        return `${route.name} (${route.points.length} waypoints, ${Math.round(nm).toLocaleString()} NM, from ${at(route.points[0])} to ${at(route.points[route.points.length - 1])})`;
      };
      setSavedPassageMsg(`Imported ${found.map(describe).join('; ')}.${notes.length > 0 ? ` ${notes.join(' ')}` : ''}`);
    } catch {
      const detail = notes.length > 0 ? `\n\n${notes.join('\n')}` : '';
      window.alert(`${t('importRoutesError', 'Could not import routes: invalid or unsupported file. Use JSON, GeoJSON, CSV, TXT, RTZ, GPX, KML, XLS, or XLSX.')}${detail}`);
    }
  };

  /** Merge the currently visible saved routes into a single new route. */
  const mergeVisibleRoutes = () => {
    const toMerge = savedRoutes.filter((r) => !hiddenIds.includes(`saved-${r.id}`));
    if (toMerge.length < 2) return;
    const merged: SavedRoute = tagRouteWithVoyage(
      {
        id: `route-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: `${t('merged', 'Merged')} ${savedRoutes.length + 1}`,
        savedAt: new Date().toISOString(),
        waypoints: toMerge.flatMap((r) => r.waypoints),
      },
      voyage?.id,
    );
    writeSavedRoutes([...(readSavedRoutesRaw() as SavedRoute[]), merged]);
    setSavedRoutes(readSavedRoutes(voyage?.id));
  };

  /** Split the selected saved route into two halves at its midpoint. */
  const splitSelectedRoute = () => {
    const sim = simRoutes.find((r) => r.id === selectedRouteId);
    if (!sim?.savedId) return;
    const src = savedRoutes.find((r) => r.id === sim.savedId);
    if (!src || src.waypoints.length < 4) return;
    const mid = Math.ceil(src.waypoints.length / 2);
    const now = Date.now();
    const partA: SavedRoute = tagRouteWithVoyage(
      {
        id: `route-${now}-a`,
        name: `${src.name} (A)`,
        savedAt: new Date().toISOString(),
        waypoints: src.waypoints.slice(0, mid),
      },
      voyage?.id,
    );
    const partB: SavedRoute = tagRouteWithVoyage(
      {
        id: `route-${now}-b`,
        name: `${src.name} (B)`,
        savedAt: new Date().toISOString(),
        waypoints: src.waypoints.slice(mid - 1),
      },
      voyage?.id,
    );
    const nextAll = (readSavedRoutesRaw() as SavedRoute[]).flatMap((r) =>
      r.id === src.id ? [partA, partB] : [r],
    );
    writeSavedRoutes(nextAll);
    setSavedRoutes(readSavedRoutes(voyage?.id));
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

  const cursorX = simMaxHours > 0 ? Math.max(0, Math.min(100, (effectiveElapsedHours / simMaxHours) * 100)) : 0;

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
                  <button type="button" onClick={() => { userTouchedSimRef.current = true; setSimDrives(true); setSimPlaying(false); setSimClock(0); }}
                    title={t('restart', 'Restart')} aria-label={t('restart', 'Restart')}>
                    <i className="fas fa-backward-fast" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => { userTouchedSimRef.current = true; setSimDrives(true); setSimPlaying(false); setSimClock((c) => Math.max(0, c - 0.05)); }}
                    title={t('stepBack', 'Step back')} aria-label={t('stepBack', 'Step back')}>
                    <i className="fas fa-backward-step" aria-hidden="true" />
                  </button>
                  <button type="button" className="fv-sim2__play"
                    onClick={() => { userTouchedSimRef.current = true; setSimDrives(true); if (!simPlaying && simClock >= 1) setSimClock(0); setSimPlaying((p) => !p); }}
                    title={simPlaying ? t('pause', 'Pause') : t('play', 'Play')}
                    aria-label={simPlaying ? t('pause', 'Pause') : t('play', 'Play')}>
                    <i className={simPlaying ? 'fas fa-pause' : 'fas fa-play'} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => { userTouchedSimRef.current = true; setSimDrives(true); setSimPlaying(false); setSimClock((c) => Math.min(1, c + 0.05)); }}
                    title={t('stepForward', 'Step forward')} aria-label={t('stepForward', 'Step forward')}>
                    <i className="fas fa-forward-step" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => { userTouchedSimRef.current = true; setSimDrives(true); setSimPlaying(false); setSimClock(1); }}
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
                      // The pre-edit "original" comparison line (shown
                      // alongside the live edit so the two can be compared)
                      // dashes itself — its path is often still very close
                      // to the edited one right after duplicating, and two
                      // solid near-identical lines read as an accidental
                      // duplicate/glitch rather than a deliberate overlay.
                      const isOriginalCompare = s.id === 'original-compare';
                      return (
                        <g key={s.id} strokeOpacity={dim ? 0.35 : 1}>
                          <polyline points={pts} fill="none" stroke={s.color}
                            strokeWidth={w} strokeLinejoin="round" strokeLinecap="round"
                            strokeDasharray={isOriginalCompare ? '4 3' : undefined}
                            // A single line per route — the active route (pure
                            // black) gets a white glow via this filter instead
                            // of a second, separately-drawn "casing" polyline
                            // underneath, so it stays visible against the dark
                            // chart background without ever actually being two
                            // overlapping lines.
                            style={isActive ? { filter: 'drop-shadow(0 0 1.2px #fff) drop-shadow(0 0 1.2px #fff)' } : undefined}
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
              {/* Portaled up into the Route Explorer page's own header (same
                  row as Save/Discard/Undo/Redo) when that slot is mounted —
                  see `useRoutesToolbarSlot` — falling back to rendering right
                  here otherwise (e.g. briefly on first mount). */}
              {(() => {
                const toolbar = (
                  <>
                    <button
                      type="button"
                      className="fv-sim2__routes-btn fv-sim2__routes-btn--primary"
                      onClick={addCheckedToSavedPassages}
                      disabled={checkedRoutes.length === 0}
                      title={t('addCheckedToSavedPassages', 'Add checked routes to Saved Passages')}
                    >
                      <i className="fas fa-bookmark" aria-hidden="true" />
                    </button>
                    <span className="fv-sim2__routes-tools" aria-label={t('routeTools', 'Route tools')}>
                      <button type="button" className="fv-sim2__routes-btn" onClick={importRoutes} title={t('importRoutes', 'Import routes')} aria-label={t('importRoutes', 'Import routes')}>
                        <i className="fas fa-upload" aria-hidden="true" />
                      </button>
                      <button type="button" className="fv-sim2__routes-btn" onClick={exportRoutes} disabled={simRoutes.length === 0} title={t('exportRoutes', 'Export routes')} aria-label={t('exportRoutes', 'Export routes')}>
                        <i className="fas fa-download" aria-hidden="true" />
                      </button>
                      <button type="button" className="fv-sim2__routes-btn" onClick={mergeVisibleRoutes} disabled={mergeableCount < 2} title={t('mergeRoutes', 'Merge routes')} aria-label={t('mergeRoutes', 'Merge routes')}>
                        <i className="fas fa-object-group" aria-hidden="true" />
                      </button>
                      <button type="button" className="fv-sim2__routes-btn" onClick={splitSelectedRoute} disabled={!canSplit} title={t('splitRoute', 'Split route')} aria-label={t('splitRoute', 'Split route')}>
                        <i className="fas fa-code-branch" aria-hidden="true" />
                      </button>
                      {routeEditActive ? (
                        <>
                          <button type="button" className="fv-sim2__routes-btn fv-sim2__routes-btn--on" onClick={() => requestRouteEdit('activate')} title={t('activateEditHint', 'Keep this edited route')} aria-label={t('activate', 'Activate')}>
                            <i className="fas fa-circle-check" aria-hidden="true" />
                          </button>
                          <button type="button" className="fv-sim2__routes-btn" onClick={() => requestRouteEdit('discard')} title={t('discardEditHint', 'Discard edits and restore the original route')} aria-label={t('discard', 'Discard')}>
                            <i className="fas fa-rotate-left" aria-hidden="true" />
                          </button>
                        </>
                      ) : (
                        <button type="button" className="fv-sim2__routes-btn" onClick={() => requestRouteEdit('start')} title={t('editRouteHint', 'Duplicate the route and edit the copy')} aria-label={t('duplicateEdit', 'Duplicate & Edit')}>
                          <i className="fas fa-pen-to-square" aria-hidden="true" />
                        </button>
                      )}
                      {optimizedResults.length > 0 && (
                        <button type="button" className="fv-sim2__routes-btn" onClick={() => {
                          const visible = optimizedResults.filter((o) => !hiddenIds.includes(o.id));
                          openScenarioReport(
                            visible.map((o) => ({ name: o.name, metrics: o.metrics })),
                            optimizationRun,
                            t('nmUnit', 'NM'),
                          );
                        }} title={t('optimizationReport', 'Optimization report')} aria-label={t('optimizationReport', 'Optimization report')}>
                          <i className="fas fa-file-lines" aria-hidden="true" />
                        </button>
                      )}
                      <OptimizationInsightsPanel voyageId={voyage?.id} route={optimizedResults.find((o) => o.id === selectedRouteId)} />
                      <input ref={importInputRef} type="file" accept=".json,.geojson,.csv,.txt,.rtz,.xml,.gpx,.kml,.xls,.xlsx,application/json,text/csv,text/plain,application/xml,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onImportFile} hidden />
                    </span>
                  </>
                );
                return routesToolbarSlot ? createPortal(toolbar, routesToolbarSlot) : toolbar;
              })()}
              {savedPassageMsg && <span className="fv-sim2__routes-note">{savedPassageMsg}</span>}
            </div>
            <div className="fv-sim2__table-wrap">
              <table className="fv-sim2__table">
                <thead>
                  <tr>
                    <th className="fv-sim2__col-check" aria-label={t('show', 'Show')} />
                    <th className="fv-sim2__col-name">
                      <span className="fv-sim2__col-name-label">{t('route', 'Route')}</span>
                    </th>
                    <th>{t('etd', 'ETD')}</th>
                    <th>{t('eta', 'ETA')}</th>
                    <th>{t('distanceNm', 'Distance (NM)')}</th>
                    <th>{t('averageSpeedKnots', 'Average Speed (knots)')}</th>
                    <th>{t('timeToGo', 'Time to Go')}</th>
                    <th>{t('ecaDistanceNm', 'ECA Distance (NM)')}</th>
                    <th>{t('ecaTimeToGo', 'ECA Time to Go')}</th>
                    <th>{t('meFuelRequiredToGo', 'M/E Fuel Required to Go (MT)')}</th>
                    <th>{t('totalCostToGo', 'Total Cost to Go (USD)')}</th>
                    <th>{t('fuelCostToGo', 'Fuel Cost to Go (USD)')}</th>
                    <th>{t('timeCostToGo', 'Time Cost to Go (USD)')}</th>
                    <th>{t('emissionsCostToGo', 'Emissions Cost to Go (USD)')}</th>
                    <th>{t('ecaFuelRequiredToGo', 'ECA Fuel Required to Go (MT)')}</th>
                    <th>{t('meCo2EmissionsToGo', 'M/E CO2 Emissions to Go (MT)')}</th>
                  </tr>
                </thead>
                <tbody>
                  {simRoutes.map((r) => {
                    const frac = simLive[r.id]?.frac ?? 0;
                    const remain = 1 - frac;
                    const isSel = r.id === selectedRouteId;
                    const m = metricsForRoute(r);
                    const distToGo = m.distanceNm * remain;
                    const hoursToGo = m.durationH * remain;
                    const fuelCostToGo = m.fuelCost * remain;
                    const timeCostToGo = m.hireCost * remain;
                    const emissionsCostToGo = m.euaCost * remain;
                    const totalCostToGo = fuelCostToGo + timeCostToGo + emissionsCostToGo;
                    return (
                      <tr key={r.id} className={isSel ? 'fv-sim2__trow--sel' : undefined}
                        onClick={() => {
                          setSelectedRouteId(r.id);
                          markRouteUsed(voyage?.id, r.id);
                        }}>
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
                            <span className="fv-sim2__route-name">
                              {r.isAis ? t('aisReportedRoute', r.label) : r.label}
                            </span>
                            <span className="fv-sim2__route-sub">
                              {r.isAis ? (
                                <span className="fv-sim2__badge">{t('reported', 'Reported')}</span>
                              ) : r.optimized ? (
                                <span className="fv-sim2__badge">{t('optimized', 'Optimized')}</span>
                              ) : r.active ? (
                                <span className="fv-sim2__badge fv-sim2__badge--active">{t('active', 'Active')}</span>
                              ) : (
                                r.sentAt && `${t('saved', 'Saved')}: ${fmtDay(new Date(r.sentAt))}`
                              )}
                            </span>
                          </span>
                          <span className="fv-sim2__row-actions" onClick={(e) => e.stopPropagation()}>
                            {r.isAis ? (
                              <button type="button" className="fv-sim2__row-btn"
                                onClick={() => setAisManagerOpen(true)}
                                title={t('manageAisPositions', 'Manage AIS positions')}
                                aria-label={t('manageAisPositions', 'Manage AIS positions')}>
                                <i className="fas fa-list-check" aria-hidden="true" />
                              </button>
                            ) : r.optimized ? (
                              <>
                                <button type="button" className="fv-sim2__follow-btn"
                                  onClick={() => {
                                    const o = optimizedResults.find((x) => x.id === r.id);
                                    if (o) followOptimizedRoute(o, voyage?.id);
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
                                  onClick={() => {
                                    setGuidanceIncludePdf(true);
                                    setGuidancePdfDone(false);
                                    setGuidanceCtx({ r, m, remain });
                                  }}
                                  title={t('sendGuidance', 'Send guidance to vessel')}
                                  aria-label={t('sendGuidance', 'Send guidance to vessel')}>
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
                                <button type="button" className="fv-sim2__row-btn fv-sim2__row-btn--danger"
                                  onClick={() => deleteRoute(r)}
                                  disabled={isEffectivelyActive(r)}
                                  title={
                                    isEffectivelyActive(r)
                                      ? t(
                                          'activeRouteCannotDelete',
                                          'The active route can\u2019t be deleted — activate a different route first.',
                                        )
                                      : t('deleteRoute', 'Delete route')
                                  }
                                  aria-label={t('deleteRoute', 'Delete route')}>
                                  <i className="fas fa-trash" aria-hidden="true" />
                                </button>
                              </>
                            )}
                          </span>
                        </td>
                        <td>{fmtEta(m.etd)}</td>
                        <td>{fmtEta(m.eta)}</td>
                        <td>{Math.round(distToGo).toLocaleString()} {t('nmUnit', 'NM')}</td>
                        <td>{m.speedKn.toFixed(1)} kn</td>
                        <td>{formatDuration(hoursToGo)}</td>
                        <td>{Math.round(m.ecaDistanceNm * remain).toLocaleString()} {t('nmUnit', 'NM')}</td>
                        <td>{formatDuration(m.ecaDurationH * remain)}</td>
                        <td>{Math.round(m.fuelTons * remain).toLocaleString()} MT</td>
                        <td>{usd(totalCostToGo)}</td>
                        <td>{usd(fuelCostToGo)}</td>
                        <td>{usd(timeCostToGo)}</td>
                        <td>{usd(emissionsCostToGo)}</td>
                        <td>{Math.round(m.ecaFuelTons * remain).toLocaleString()} MT</td>
                        <td>{Math.round(m.co2Tons * remain).toLocaleString()} MT</td>
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

      {guidanceCtx && (
        <div
          className="fv-sim2__export-overlay"
          role="presentation"
          onClick={() => setGuidanceCtx(null)}
        >
          <div
            className="fv-sim2__export fv-sim2__guidance"
            role="dialog"
            aria-modal="true"
            aria-label={t('sendGuidanceTitle', 'Send guidance to vessel')}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="fv-sim2__export-head">
              <h3>{t('sendGuidanceTitle', 'Send guidance to vessel')}</h3>
              <p className="fv-sim2__guidance-sub">{guidanceCtx.r.label}</p>
            </header>

            {guidanceData && (
              <div className="fv-sim2__export-body fv-sim2__guidance-body">
                <div className="fv-sim2__guidance-toolbar">
                  <label className="fv-sim2__guidance-toggle">
                    <input
                      type="checkbox"
                      checked={guidanceIncludePdf}
                      onChange={() => setGuidanceIncludePdf((prev) => !prev)}
                    />
                    {t('guidanceAttachPdf', 'Attach PDF guidance report to the email')}
                  </label>
                  <button
                    type="button"
                    className="fv-sim2__guidance-download"
                    onClick={() => void downloadGuidancePdf()}
                    disabled={guidancePdfBusy}
                  >
                    <i className={`fas ${guidancePdfBusy ? 'fa-spinner fa-spin' : 'fa-file-arrow-down'}`} aria-hidden="true" />{' '}
                    {guidancePdfDone ? t('downloaded', 'Downloaded') : t('downloadGuidancePdf', 'Download PDF guidance')}
                  </button>
                </div>
                <ReportEmailComposer
                  key={guidanceIncludePdf ? 'guidance-pdf' : 'guidance-nopdf'}
                  build={() => buildGuidanceEmail(guidanceData, guidanceIncludePdf)}
                />
              </div>
            )}

            <footer className="fv-sim2__export-foot">
              <button type="button" className="fv-sim2__export-btn" onClick={() => setGuidanceCtx(null)}>
                {t('close', 'Close')}
              </button>
            </footer>
          </div>
        </div>
      )}

      {deleteConfirmRoute && (
        <div
          className="fv-sim2__export-overlay"
          role="presentation"
          onClick={cancelDeleteRoute}
        >
          <div
            className="fv-sim2__export fv-sim2__confirm"
            role="alertdialog"
            aria-modal="true"
            aria-label={t('confirmDeleteRouteTitle', 'Delete route')}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="fv-sim2__export-head">
              <h3>
                <i className="fas fa-triangle-exclamation" aria-hidden="true" />{' '}
                {t('confirmDeleteRouteTitle', 'Delete route')}
              </h3>
            </header>
            <div className="fv-sim2__export-body">
              <p>
                {t('confirmDeleteRoute', 'Are you sure you want to delete this route?')}
              </p>
              <p className="fv-sim2__confirm-route-name">{deleteConfirmRoute.label}</p>
            </div>
            <footer className="fv-sim2__export-foot">
              <button type="button" className="fv-sim2__export-btn" onClick={cancelDeleteRoute}>
                {t('cancel', 'Cancel')}
              </button>
              <button
                type="button"
                className="fv-sim2__export-btn fv-sim2__export-btn--danger"
                onClick={confirmDeleteRoute}
              >
                <i className="fas fa-trash" aria-hidden="true" /> {t('delete', 'Delete')}
              </button>
            </footer>
          </div>
        </div>
      )}

      {aisManagerOpen && (
        <div
          className="fv-sim2__export-overlay"
          role="presentation"
          onClick={() => setAisManagerOpen(false)}
        >
          <div
            className="fv-sim2__export fv-sim2__ais-manager"
            role="dialog"
            aria-modal="true"
            aria-label={t('manageAisPositions', 'Manage AIS positions')}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="fv-sim2__export-head">
              <h3>
                <i className="fas fa-satellite-dish" aria-hidden="true" />{' '}
                {t('manageAisPositions', 'Manage AIS positions')}
              </h3>
              <p className="fv-sim2__guidance-sub">
                {t(
                  'manageAisPositionsHint',
                  'Positions reported by the vessel\u2019s AIS feed, used to draw the actual track sailed. Remove any that look wrong.',
                )}
              </p>
            </header>
            <div className="fv-sim2__export-body">
              {aisPositions.length === 0 ? (
                <p>{t('noAisPositions', 'No AIS positions recorded for this voyage yet.')}</p>
              ) : (
                <table className="fv-sim2__table">
                  <thead>
                    <tr>
                      <th>{t('dateTime', 'Date/Time')}</th>
                      <th>{t('lat', 'Lat')}</th>
                      <th>{t('lon', 'Lon')}</th>
                      <th>{t('source', 'Source')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {aisPositions.map((p: AisPosition) => (
                      <tr key={p.id}>
                        <td>{fmtDay(new Date(p.timestampIso))}</td>
                        <td>{p.lat.toFixed(4)}</td>
                        <td>{p.lon.toFixed(4)}</td>
                        <td>{p.source ?? '—'}</td>
                        <td>
                          <button
                            type="button"
                            className="fv-sim2__row-btn fv-sim2__row-btn--danger"
                            onClick={() => deleteAisPosition(p.id)}
                            title={t('deletePosition', 'Delete this position')}
                            aria-label={t('deletePosition', 'Delete this position')}
                          >
                            <i className="fas fa-trash" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <footer className="fv-sim2__export-foot">
              <button type="button" className="fv-sim2__export-btn" onClick={() => setAisManagerOpen(false)}>
                {t('close', 'Close')}
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
