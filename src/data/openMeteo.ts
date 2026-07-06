/**
 * Live weather/forecast source for the map overlay, backed by the free
 * Open-Meteo APIs (no API key required):
 *   - https://api.open-meteo.com/v1/forecast        (atmosphere)
 *   - https://marine-api.open-meteo.com/v1/marine    (ocean)
 *
 * The map paints a field at viewport resolution every frame, far too many
 * points to query directly. Instead we fetch a coarse grid over the current
 * view (`COLS × ROWS` points), cache it, and let `sampleLiveField()` do a
 * fast bilinear interpolation. The layer falls back to the synthetic field
 * while a grid is loading or if a request fails.
 */

import type { FieldSample } from './weatherField';

export interface LatLngBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

const COLS = 7;
const ROWS = 7;
const KMH_TO_KT = 0.539957;
/** How many hours ahead the forecast slider can reach. */
export const MAX_FORECAST_HOURS = 120;

interface FactorQuery {
  /** 'forecast' atmosphere API or 'marine' ocean API. */
  api: 'forecast' | 'marine';
  /** Magnitude variable on the Open-Meteo `current` block. */
  magVar: string;
  /** Optional direction variable (deg) for vector factors. */
  dirVar?: string;
  /** Convert raw magnitude into the factor's display unit. */
  scale?: (v: number) => number;
}

const FACTOR_QUERY: Record<string, FactorQuery> = {
  wind: { api: 'forecast', magVar: 'wind_speed_10m', dirVar: 'wind_direction_10m' },
  gusts: { api: 'forecast', magVar: 'wind_gusts_10m', dirVar: 'wind_direction_10m' },
  pressure: { api: 'forecast', magVar: 'surface_pressure' },
  precipitation: { api: 'forecast', magVar: 'precipitation' },
  airTemp: { api: 'forecast', magVar: 'temperature_2m' },
  waves: { api: 'marine', magVar: 'wave_height', dirVar: 'wave_direction' },
  swell: { api: 'marine', magVar: 'swell_wave_height', dirVar: 'swell_wave_direction' },
  seaTemp: { api: 'marine', magVar: 'sea_surface_temperature' },
  currents: {
    api: 'marine',
    magVar: 'ocean_current_velocity',
    dirVar: 'ocean_current_direction',
    scale: (v) => v * KMH_TO_KT,
  },
};

/** Whether a factor can be served by Open-Meteo. */
export function hasLiveSource(factorId: string): boolean {
  return factorId in FACTOR_QUERY;
}

interface Grid {
  bounds: LatLngBounds;
  cols: number;
  rows: number;
  mag: number[];
  dir: number[];
  /** ISO timestamp (UTC) of the sampled forecast hour, if reported. */
  time: string | null;
}

const cache = new Map<string, Grid>();
const pending = new Map<string, Promise<Grid | null>>();

function keyFor(factorId: string, b: LatLngBounds, hour: number): string {
  const r = (n: number) => Math.round(n * 2) / 2; // 0.5° buckets
  return `${factorId}:${hour}:${r(b.south)},${r(b.west)},${r(b.north)},${r(b.east)}`;
}

function buildGridPoints(b: LatLngBounds): { lats: number[]; lons: number[] } {
  const lats: number[] = [];
  const lons: number[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const fy = r / (ROWS - 1);
      const fx = c / (COLS - 1);
      lats.push(b.north + (b.south - b.north) * fy);
      lons.push(b.west + (b.east - b.west) * fx);
    }
  }
  return { lats, lons };
}

async function fetchGrid(factorId: string, b: LatLngBounds, hour: number): Promise<Grid | null> {
  const q = FACTOR_QUERY[factorId];
  if (!q) return null;
  const { lats, lons } = buildGridPoints(b);
  const vars = [q.magVar, q.dirVar].filter(Boolean).join(',');
  const base =
    q.api === 'forecast'
      ? 'https://api.open-meteo.com/v1/forecast'
      : 'https://marine-api.open-meteo.com/v1/marine';
  const url =
    `${base}?latitude=${lats.join(',')}&longitude=${lons.join(',')}` +
    `&hourly=${vars}&wind_speed_unit=kn&timezone=UTC&forecast_days=6`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const json = (await res.json()) as unknown;
  const list = Array.isArray(json) ? json : [json];

  const mag: number[] = [];
  const dir: number[] = [];
  let time: string | null = null;
  for (const cell of list) {
    const hr = (cell as { hourly?: Record<string, number[] | string[]> }).hourly ?? {};
    const magArr = hr[q.magVar] as number[] | undefined;
    const idx = Math.min(hour, (magArr?.length ?? 1) - 1);
    const raw = Number(magArr?.[idx]);
    mag.push(q.scale ? q.scale(raw || 0) : raw || 0);
    const dirArr = q.dirVar ? (hr[q.dirVar] as number[] | undefined) : undefined;
    dir.push(q.dirVar ? Number(dirArr?.[idx]) || 0 : 0);
    if (time == null) {
      const timeArr = hr.time as string[] | undefined;
      if (timeArr?.[idx]) time = timeArr[idx];
    }
  }
  return { bounds: b, cols: COLS, rows: ROWS, mag, dir, time };
}

/** Kick off (or reuse) a fetch of the grid covering `b` for the factor. */
export function ensureLiveData(
  factorId: string,
  b: LatLngBounds,
  hour: number,
  onReady: () => void,
): void {
  if (!hasLiveSource(factorId)) return;
  const key = keyFor(factorId, b, hour);
  if (cache.has(key) || pending.has(key)) return;
  const p = fetchGrid(factorId, b, hour)
    .then((g) => {
      if (g) cache.set(key, g);
      return g;
    })
    .catch(() => null)
    .finally(() => {
      pending.delete(key);
      onReady();
    });
  pending.set(key, p);
}

/** Bilinear sample of the cached grid, or `null` if not loaded yet. */
export function sampleLiveField(
  lat: number,
  lon: number,
  factorId: string,
  b: LatLngBounds,
  hour: number,
): FieldSample | null {
  const g = cache.get(keyFor(factorId, b, hour));
  if (!g) return null;
  const { north, south, west, east } = g.bounds;
  const fy = ((north - lat) / (north - south || 1)) * (g.rows - 1);
  const fx = ((lon - west) / (east - west || 1)) * (g.cols - 1);
  const r0 = Math.max(0, Math.min(g.rows - 1, Math.floor(fy)));
  const c0 = Math.max(0, Math.min(g.cols - 1, Math.floor(fx)));
  const r1 = Math.min(g.rows - 1, r0 + 1);
  const c1 = Math.min(g.cols - 1, c0 + 1);
  const ty = fy - r0;
  const tx = fx - c0;
  const at = (r: number, c: number) => g.mag[r * g.cols + c];
  const magnitude =
    at(r0, c0) * (1 - tx) * (1 - ty) +
    at(r0, c1) * tx * (1 - ty) +
    at(r1, c0) * (1 - tx) * ty +
    at(r1, c1) * tx * ty;
  return { magnitude, directionDeg: g.dir[r0 * g.cols + c0] };
}

/**
 * ISO timestamp (UTC) the cached grid represents for the given factor/bounds,
 * or `null` if the grid isn't loaded yet or reported no time.
 */
export function getLiveDataTime(
  factorId: string,
  b: LatLngBounds,
  hour: number,
): string | null {
  return cache.get(keyFor(factorId, b, hour))?.time ?? null;
}

/** Live value of a single weather factor at one point. */
export interface PointFactor {
  id: string;
  /** Magnitude in the factor's display unit. */
  magnitude: number;
  /** Compass bearing (deg) for vector factors, or `null`. */
  directionDeg: number | null;
}

/**
 * Fetch the current value of every supported weather factor at a single
 * lat/lon. Issues one request to the atmosphere API and one to the ocean
 * API (each covering several factors) and merges the results, keyed by
 * factor id. Factors whose request fails are simply omitted.
 */
export async function fetchPointWeather(
  lat: number,
  lon: number,
): Promise<Record<string, PointFactor>> {
  // Collect the `current` variables needed per API.
  const varsByApi: Record<'forecast' | 'marine', Set<string>> = {
    forecast: new Set(),
    marine: new Set(),
  };
  for (const q of Object.values(FACTOR_QUERY)) {
    varsByApi[q.api].add(q.magVar);
    if (q.dirVar) varsByApi[q.api].add(q.dirVar);
  }

  const bases: Record<'forecast' | 'marine', string> = {
    forecast: 'https://api.open-meteo.com/v1/forecast',
    marine: 'https://marine-api.open-meteo.com/v1/marine',
  };

  const currents: Partial<Record<'forecast' | 'marine', Record<string, number>>> = {};
  await Promise.all(
    (['forecast', 'marine'] as const).map(async (api) => {
      const vars = [...varsByApi[api]];
      if (!vars.length) return;
      const url =
        `${bases[api]}?latitude=${lat}&longitude=${lon}` +
        `&current=${vars.join(',')}&wind_speed_unit=kn&timezone=UTC`;
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const json = (await res.json()) as { current?: Record<string, number> };
        currents[api] = json.current ?? {};
      } catch {
        /* ignore — factor simply omitted below */
      }
    }),
  );

  const out: Record<string, PointFactor> = {};
  for (const [id, q] of Object.entries(FACTOR_QUERY)) {
    const cur = currents[q.api];
    if (!cur) continue;
    const rawMag = Number(cur[q.magVar]);
    if (!Number.isFinite(rawMag)) continue;
    const dir = q.dirVar ? Number(cur[q.dirVar]) : NaN;
    out[id] = {
      id,
      magnitude: q.scale ? q.scale(rawMag) : rawMag,
      directionDeg: Number.isFinite(dir) ? dir : null,
    };
  }
  return out;
}

/** One hour of the forecast at a point: a timestamp plus each factor's value. */
export interface ForecastRow {
  /** ISO timestamp (UTC). */
  time: string;
  values: Record<string, PointFactor>;
}

/**
 * Fetch the multi-day hourly forecast of every supported factor at a single
 * lat/lon. Issues one request to the atmosphere API and one to the ocean API
 * and merges their hourly series by index into per-hour rows suitable for
 * export (e.g. CSV download).
 */
export async function fetchPointForecast(
  lat: number,
  lon: number,
): Promise<ForecastRow[]> {
  const varsByApi: Record<'forecast' | 'marine', Set<string>> = {
    forecast: new Set(),
    marine: new Set(),
  };
  for (const q of Object.values(FACTOR_QUERY)) {
    varsByApi[q.api].add(q.magVar);
    if (q.dirVar) varsByApi[q.api].add(q.dirVar);
  }

  const bases: Record<'forecast' | 'marine', string> = {
    forecast: 'https://api.open-meteo.com/v1/forecast',
    marine: 'https://marine-api.open-meteo.com/v1/marine',
  };

  const hourlyByApi: Partial<
    Record<'forecast' | 'marine', Record<string, Array<number | string>>>
  > = {};
  await Promise.all(
    (['forecast', 'marine'] as const).map(async (api) => {
      const vars = [...varsByApi[api]];
      if (!vars.length) return;
      const url =
        `${bases[api]}?latitude=${lat}&longitude=${lon}` +
        `&hourly=${vars.join(',')}&wind_speed_unit=kn&timezone=UTC&forecast_days=7`;
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const json = (await res.json()) as {
          hourly?: Record<string, Array<number | string>>;
        };
        hourlyByApi[api] = json.hourly ?? {};
      } catch {
        /* ignore — factor simply omitted below */
      }
    }),
  );

  // Both APIs return hourly series on the same UTC clock, so we can index them
  // together. Prefer the atmosphere time axis, falling back to the ocean one.
  const times =
    (hourlyByApi.forecast?.time as string[] | undefined) ??
    (hourlyByApi.marine?.time as string[] | undefined) ??
    [];

  return times.map((time, idx) => {
    const values: Record<string, PointFactor> = {};
    for (const [id, q] of Object.entries(FACTOR_QUERY)) {
      const h = hourlyByApi[q.api];
      if (!h) continue;
      const rawMag = Number((h[q.magVar] as number[] | undefined)?.[idx]);
      if (!Number.isFinite(rawMag)) continue;
      const dir = q.dirVar ? Number((h[q.dirVar] as number[] | undefined)?.[idx]) : NaN;
      values[id] = {
        id,
        magnitude: q.scale ? q.scale(rawMag) : rawMag,
        directionDeg: Number.isFinite(dir) ? dir : null,
      };
    }
    return { time: String(time), values };
  });
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Fetch the supported factors (wind / waves / currents) at a single lat/lon
 * for a specific UTC date-time. Picks the matching hour from the hourly
 * series. Best-effort: factors whose request fails are omitted, and dates
 * outside the API's available range simply return nothing.
 */
export async function fetchPointWeatherAt(
  lat: number,
  lon: number,
  when: Date,
): Promise<Record<string, PointFactor>> {
  const date = `${when.getUTCFullYear()}-${pad2(when.getUTCMonth() + 1)}-${pad2(
    when.getUTCDate(),
  )}`;
  const hour = when.getUTCHours();
  const out: Record<string, PointFactor> = {};

  const bases: Record<'forecast' | 'marine', string> = {
    forecast: 'https://api.open-meteo.com/v1/forecast',
    marine: 'https://marine-api.open-meteo.com/v1/marine',
  };

  const groups: Array<{ api: 'forecast' | 'marine'; ids: string[] }> = [
    { api: 'forecast', ids: ['wind'] },
    { api: 'marine', ids: ['waves', 'currents'] },
  ];

  await Promise.all(
    groups.map(async ({ api, ids }) => {
      const queries = ids.map((id) => ({ id, q: FACTOR_QUERY[id] }));
      const vars = new Set<string>();
      for (const { q } of queries) {
        vars.add(q.magVar);
        if (q.dirVar) vars.add(q.dirVar);
      }
      const url =
        `${bases[api]}?latitude=${lat}&longitude=${lon}` +
        `&hourly=${[...vars].join(',')}&wind_speed_unit=kn&timezone=UTC` +
        `&start_date=${date}&end_date=${date}`;
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const json = (await res.json()) as {
          hourly?: Record<string, Array<number | string>>;
        };
        const hr = json.hourly ?? {};
        const times = (hr.time as string[] | undefined) ?? [];
        let idx = times.findIndex((t) => t.startsWith(`${date}T${pad2(hour)}`));
        if (idx < 0) {
          const anyArr = hr[queries[0].q.magVar] as number[] | undefined;
          idx = Math.min(hour, (anyArr?.length ?? 1) - 1);
        }
        for (const { id, q } of queries) {
          const rawMag = Number((hr[q.magVar] as number[] | undefined)?.[idx]);
          if (!Number.isFinite(rawMag)) continue;
          const dir = q.dirVar
            ? Number((hr[q.dirVar] as number[] | undefined)?.[idx])
            : NaN;
          out[id] = {
            id,
            magnitude: q.scale ? q.scale(rawMag) : rawMag,
            directionDeg: Number.isFinite(dir) ? dir : null,
          };
        }
      } catch {
        /* ignore — factor omitted */
      }
    }),
  );

  return out;
}
