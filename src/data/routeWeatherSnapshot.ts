/**
 * Shared "frozen weather" snapshot builder — samples the same along-route
 * weather magnitude used by the Route Simulator's weather chart/read-outs
 * (live grid where loaded, falling back to the synthetic model otherwise),
 * but captures it as a one-off, JSON-safe array instead of a live,
 * continuously-resampled value. Used by:
 *
 *   - `OptimizationRunDialog` — locks the weather at the moment a route is
 *     generated, stored on its "All Routes" history entry, so the "View"
 *     link later shows the weather *as it was when the route was run*.
 *   - `RouteSimulatorPanel` — locks the weather at the moment a
 *     "Comparison" link is created across several selected routes.
 *
 * Both feed the same read-only `RouteSnapshotViewPage`.
 */

import { ensureLiveData, sampleLiveField, MAX_FORECAST_HOURS, type LatLngBounds } from './openMeteo';
import { sampleWeatherField } from './weatherField';
import { unwrapRouteCoordinates } from './antimeridian';

export type WeatherFactorId = 'waves' | 'swell' | 'wind' | 'current';

export interface WeatherFactorMeta {
  id: WeatherFactorId;
  label: string;
  unit: string;
  /** Matching Open-Meteo factor id used for live data. */
  liveId: string;
  /** Advisory threshold drawn as a red dashed line on the chart. */
  limit: number;
}

export const WEATHER_SNAPSHOT_FACTORS: WeatherFactorMeta[] = [
  { id: 'waves', label: 'Significant Wave Height', unit: 'm', liveId: 'waves', limit: 4.5 },
  { id: 'swell', label: 'Swell Height', unit: 'm', liveId: 'swell', limit: 4 },
  { id: 'wind', label: 'Wind Speed', unit: 'kn', liveId: 'wind', limit: 34 },
  { id: 'current', label: 'Current', unit: 'kn', liveId: 'currents', limit: 3 },
];

export interface FrozenWeatherPoint {
  /** Elapsed voyage hours at this sample. */
  t: number;
  w: number;
}

export interface FrozenWeatherSeries {
  id: string;
  label: string;
  color: string;
  points: FrozenWeatherPoint[];
}

export interface FrozenWeatherFactor {
  factorId: WeatherFactorId;
  label: string;
  unit: string;
  limit: number;
  series: FrozenWeatherSeries[];
}

/** A route's identity + geometry, enough to sample weather along it. */
export interface SnapshotRouteInput {
  id: string;
  label: string;
  color: string;
  path: Array<[number, number]>;
  /** Total transit hours, used to space out the time samples. */
  hours: number;
}

const SNAPSHOT_SAMPLES = 24;

/** Linearly interpolate a `[lat, lon]` polyline at fractional `progress`. */
function samplePath(path: Array<[number, number]>, progress: number): [number, number] {
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

/** Bounding box (with a little padding) covering every route's path. */
export function boundsForRoutes(routes: SnapshotRouteInput[]): LatLngBounds | null {
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  routes.forEach((r) =>
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
  return { south: south - padLat, north: north + padLat, west: west - padLon, east: east + padLon };
}

/** Weather magnitude at a fractional position along a route (live grid
 *  where loaded for that bounds/factor, else the synthetic fallback model —
 *  same behaviour as the live chart, just captured once). */
function weatherAt(
  path: Array<[number, number]>,
  frac: number,
  factor: WeatherFactorMeta,
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
  return sampleWeatherField(lat, lon, factor.liveId, hour).magnitude;
}

/** Kick off loading the live grid for every factor over these routes'
 *  bounds (fire-and-forget — sampling falls back to the synthetic model
 *  for anything not yet loaded, so this is an optimization, not a
 *  requirement). Call a little before `buildFrozenWeatherSnapshot` so
 *  recently-viewed factors are more likely to already be warmed. */
export function warmSnapshotWeather(routes: SnapshotRouteInput[]): void {
  const bounds = boundsForRoutes(routes);
  if (!bounds) return;
  WEATHER_SNAPSHOT_FACTORS.forEach((f) => ensureLiveData(f.liveId, bounds, 0, () => {}));
}

/** Build a frozen, JSON-safe weather snapshot for a set of routes, one
 *  series per factor — the data a `RouteSnapshotViewPage` renders instead
 *  of re-sampling live/current weather. */
export function buildFrozenWeatherSnapshot(routes: SnapshotRouteInput[]): FrozenWeatherFactor[] {
  const bounds = boundsForRoutes(routes);
  return WEATHER_SNAPSHOT_FACTORS.map((factor) => ({
    factorId: factor.id,
    label: factor.label,
    unit: factor.unit,
    limit: factor.limit,
    series: routes
      .filter((r) => r.path.length >= 2)
      .map((r) => {
        const points: FrozenWeatherPoint[] = [];
        for (let i = 0; i <= SNAPSHOT_SAMPLES; i += 1) {
          const f = i / SNAPSHOT_SAMPLES;
          const hour = Math.max(0, Math.min(MAX_FORECAST_HOURS, Math.round(f * r.hours)));
          points.push({ t: f * r.hours, w: weatherAt(r.path, f, factor, bounds, hour) });
        }
        return { id: r.id, label: r.label, color: r.color, points };
      }),
  }));
}

// --- Full map-overlay grid snapshot ------------------------------------------
//
// The along-route series above drives the chart/read-outs; this separate,
// heavier capture replays the *actual map weather field* (the same colour
// contour + direction-glyph overlay `WeatherFieldLayer` draws) as it looked
// at lock time, for every factor — not just along the route.

export interface FrozenWeatherGrid {
  bounds: LatLngBounds;
  rows: number;
  cols: number;
  mag: number[];
  dir: number[];
}

const GRID_RESOLUTION = 30;

/** Sample a lat/lon grid across `bounds` for one factor, right now — a
 *  one-off capture, not a live/continuously-refreshed field. */
function buildFrozenWeatherGrid(bounds: LatLngBounds, liveId: string): FrozenWeatherGrid {
  const rows = GRID_RESOLUTION;
  const cols = GRID_RESOLUTION;
  const mag: number[] = new Array(rows * cols);
  const dir: number[] = new Array(rows * cols);
  for (let r = 0; r < rows; r += 1) {
    const lat = bounds.north - (r / (rows - 1)) * (bounds.north - bounds.south);
    for (let c = 0; c < cols; c += 1) {
      const lon = bounds.west + (c / (cols - 1)) * (bounds.east - bounds.west);
      const live = sampleLiveField(lat, lon, liveId, bounds, 0);
      const s = live ?? sampleWeatherField(lat, lon, liveId, 0);
      mag[r * cols + c] = s.magnitude;
      dir[r * cols + c] = s.directionDeg;
    }
  }
  return { bounds, rows, cols, mag, dir };
}

/** Bilinearly sample a frozen grid at a lat/lon (same maths as the live
 *  grid's own interpolation, just over a one-off captured array). */
export function sampleFrozenGrid(
  grid: FrozenWeatherGrid,
  lat: number,
  lon: number,
): { magnitude: number; directionDeg: number } {
  const { north, south, west, east } = grid.bounds;
  const fy = ((north - lat) / (north - south || 1)) * (grid.rows - 1);
  const fx = ((lon - west) / (east - west || 1)) * (grid.cols - 1);
  const r0 = Math.max(0, Math.min(grid.rows - 1, Math.floor(fy)));
  const c0 = Math.max(0, Math.min(grid.cols - 1, Math.floor(fx)));
  const r1 = Math.min(grid.rows - 1, r0 + 1);
  const c1 = Math.min(grid.cols - 1, c0 + 1);
  const ty = fy - r0;
  const tx = fx - c0;
  const at = (r: number, c: number) => grid.mag[r * grid.cols + c];
  const magnitude =
    at(r0, c0) * (1 - tx) * (1 - ty) +
    at(r0, c1) * tx * (1 - ty) +
    at(r1, c0) * (1 - tx) * ty +
    at(r1, c1) * tx * ty;
  return { magnitude, directionDeg: grid.dir[r0 * grid.cols + c0] };
}

/** Build a frozen map-overlay grid for every factor, over a generous
 *  bounding box around the routes (padded well beyond the routes' own
 *  bounds, so panning/zooming out a little on the locked map still shows
 *  real captured data instead of immediately running off the edge). */
export function buildFrozenWeatherGrids(
  routes: SnapshotRouteInput[],
): Record<WeatherFactorId, FrozenWeatherGrid> {
  const tight = boundsForRoutes(routes);
  const bounds: LatLngBounds = tight
    ? {
        south: tight.south - (tight.north - tight.south) * 0.6 - 2,
        north: tight.north + (tight.north - tight.south) * 0.6 + 2,
        west: tight.west - (tight.east - tight.west) * 0.6 - 2,
        east: tight.east + (tight.east - tight.west) * 0.6 + 2,
      }
    : { south: -60, north: 60, west: -180, east: 180 };
  const entries = WEATHER_SNAPSHOT_FACTORS.map(
    (f) => [f.id, buildFrozenWeatherGrid(bounds, f.liveId)] as const,
  );
  return Object.fromEntries(entries) as Record<WeatherFactorId, FrozenWeatherGrid>;
}
