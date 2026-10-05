/**
 * Open-Meteo-backed `WeatherProvider` (no API key required):
 *   - https://api.open-meteo.com/v1/forecast        (atmosphere)
 *   - https://marine-api.open-meteo.com/v1/marine    (ocean)
 *
 * Also exposes a few single-point helpers (`fetchPointWeather` etc.) used by
 * the point weather read-out / CSV export features. Those talk to the same
 * REST APIs directly rather than through the grid/provider abstraction,
 * since they're one-off single-point reads rather than a map layer source —
 * if a future backend needs to serve those too, give it its own equivalents.
 */

import type { LatLngBounds, WeatherGrid, WeatherProvider } from './types';

const COLS = 7;
const ROWS = 7;
const KMH_TO_KT = 0.539957;

interface FactorQuery {
  /** 'forecast' atmosphere API or 'marine' ocean API. */
  api: 'forecast' | 'marine';
  /** Magnitude variable on the Open-Meteo `current`/`hourly` block. */
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

const BASES: Record<'forecast' | 'marine', string> = {
  forecast: 'https://api.open-meteo.com/v1/forecast',
  marine: 'https://marine-api.open-meteo.com/v1/marine',
};

function buildGridPoints(b: LatLngBounds): { lats: number[]; lons: number[] } {
  const lats: number[] = [];
  const lons: number[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const fy = r / (ROWS - 1);
      const fx = c / (COLS - 1);
      const lat = b.north + (b.south - b.north) * fy;
      const lon = b.west + (b.east - b.west) * fx;
      // Clamp to valid coordinates before querying — a world-copy-jump view
      // can report bounds past ±180° longitude, which Open-Meteo rejects,
      // silently failing the whole grid and falling back to the synthetic
      // field. The row/col indexing above still matches the real bounds, so
      // clamping here only fixes the query, not the interpolation.
      lats.push(Math.max(-85, Math.min(85, lat)));
      lons.push(((lon + 540) % 360) - 180);
    }
  }
  return { lats, lons };
}

async function fetchGrid(factorId: string, b: LatLngBounds, hour: number): Promise<WeatherGrid | null> {
  const q = FACTOR_QUERY[factorId];
  if (!q) return null;
  const { lats, lons } = buildGridPoints(b);
  const vars = [q.magVar, q.dirVar].filter(Boolean).join(',');
  const url =
    `${BASES[q.api]}?latitude=${lats.join(',')}&longitude=${lons.join(',')}` +
    `&hourly=${vars}&wind_speed_unit=kn&timezone=UTC&forecast_days=10`;

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

/** Open-Meteo as a `WeatherProvider` — serves every factor in `FACTOR_QUERY`. */
export const openMeteoProvider: WeatherProvider = {
  id: 'open-meteo',
  supports: (factorId) => factorId in FACTOR_QUERY,
  fetchGrid,
};

// --- Single-point helpers (point read-out / CSV export) --------------------
// These bypass the grid cache/provider registry and query Open-Meteo
// directly for one lat/lon at a time.

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
  const varsByApi: Record<'forecast' | 'marine', Set<string>> = {
    forecast: new Set(),
    marine: new Set(),
  };
  for (const q of Object.values(FACTOR_QUERY)) {
    varsByApi[q.api].add(q.magVar);
    if (q.dirVar) varsByApi[q.api].add(q.dirVar);
  }

  const currents: Partial<Record<'forecast' | 'marine', Record<string, number>>> = {};
  await Promise.all(
    (['forecast', 'marine'] as const).map(async (api) => {
      const vars = [...varsByApi[api]];
      if (!vars.length) return;
      const url =
        `${BASES[api]}?latitude=${lat}&longitude=${lon}` +
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

  const hourlyByApi: Partial<
    Record<'forecast' | 'marine', Record<string, Array<number | string>>>
  > = {};
  await Promise.all(
    (['forecast', 'marine'] as const).map(async (api) => {
      const vars = [...varsByApi[api]];
      if (!vars.length) return;
      const url =
        `${BASES[api]}?latitude=${lat}&longitude=${lon}` +
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
        `${BASES[api]}?latitude=${lat}&longitude=${lon}` +
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
