/**
 * Storm Glass Marine Weather API client.
 *
 * Fetches live marine weather for individual points via the
 * `weather/point` endpoint (https://docs.stormglass.io/). The free tier
 * is heavily rate-limited (≈10 requests/day), so every lookup is cached
 * in `localStorage` with a TTL and coordinates are rounded so nearby
 * points share a cache entry. This keeps the live overlays on every map
 * usable without burning through the quota on each pan/zoom.
 *
 * The API key is supplied by the user (stored in `localStorage` via the
 * weather context) or, for local development, from the
 * `VITE_STORMGLASS_API_KEY` environment variable.
 */

const ENDPOINT = 'https://api.stormglass.io/v2/weather/point';

/** localStorage key for the cached point responses. */
const CACHE_KEY = 'fv.weather.cache.v1';

/** How long a cached point reading stays fresh (3 hours). */
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;

/**
 * Coordinates are rounded to this many decimal places before being used
 * as a cache key (~0.1° ≈ 11 km). Nearby sample points therefore reuse a
 * single API call.
 */
const CACHE_PRECISION = 1;

/**
 * Order in which Storm Glass data sources are preferred when a parameter
 * is reported by more than one model. `sg` is Storm Glass's own blended
 * best estimate.
 */
const SOURCE_PRIORITY = ['sg', 'noaa', 'icon', 'meteo', 'dwd', 'meto', 'fcoo', 'fmi'];

/** Definition of a single weather factor that can be shown on the map. */
export interface WeatherFactor {
  /** Stable id used in state + as the Storm Glass `params` value. */
  id: string;
  /** Full human label shown in the factor picker. */
  label: string;
  /** Compact label shown on the map labels. */
  short: string;
  /** Font Awesome icon class (without the `fa-` family prefix). */
  icon: string;
  /** Unit suffix appended to the formatted value. */
  unit: string;
  /** Decimal places for the displayed value. */
  decimals: number;
  /** True when the value is a compass bearing (rendered with an arrow). */
  directional?: boolean;
  /** Optional transform applied to the raw API value (e.g. m/s → kn). */
  transform?: (raw: number) => number;
}

const MS_TO_KN = 1.943_844_49;

/**
 * The marine weather factors that can be overlaid on a map. The `id`
 * matches the Storm Glass parameter name so it can be sent directly in
 * the `params` query string.
 */
export const WEATHER_FACTORS: WeatherFactor[] = [
  { id: 'waveHeight', label: 'Significant wave height', short: 'Wave', icon: 'fa-water', unit: ' m', decimals: 1 },
  { id: 'windSpeed', label: 'Wind speed', short: 'Wind', icon: 'fa-wind', unit: ' kn', decimals: 0, transform: (v) => v * MS_TO_KN },
  { id: 'windDirection', label: 'Wind direction', short: 'Wind dir', icon: 'fa-location-arrow', unit: '°', decimals: 0, directional: true },
  { id: 'gust', label: 'Wind gust', short: 'Gust', icon: 'fa-wind', unit: ' kn', decimals: 0, transform: (v) => v * MS_TO_KN },
  { id: 'swellHeight', label: 'Swell height', short: 'Swell', icon: 'fa-water', unit: ' m', decimals: 1 },
  { id: 'swellPeriod', label: 'Swell period', short: 'Swell T', icon: 'fa-stopwatch', unit: ' s', decimals: 0 },
  { id: 'wavePeriod', label: 'Wave period', short: 'Wave T', icon: 'fa-stopwatch', unit: ' s', decimals: 0 },
  { id: 'currentSpeed', label: 'Current speed', short: 'Current', icon: 'fa-arrows-turn-right', unit: ' kn', decimals: 1, transform: (v) => v * MS_TO_KN },
  { id: 'currentDirection', label: 'Current direction', short: 'Cur dir', icon: 'fa-location-arrow', unit: '°', decimals: 0, directional: true },
  { id: 'waterTemperature', label: 'Sea temperature', short: 'Sea', icon: 'fa-temperature-half', unit: '°C', decimals: 1 },
  { id: 'airTemperature', label: 'Air temperature', short: 'Air', icon: 'fa-temperature-half', unit: '°C', decimals: 1 },
  { id: 'pressure', label: 'Surface pressure', short: 'Press', icon: 'fa-gauge', unit: ' hPa', decimals: 0 },
  { id: 'visibility', label: 'Visibility', short: 'Vis', icon: 'fa-eye', unit: ' km', decimals: 0 },
  { id: 'cloudCover', label: 'Cloud cover', short: 'Cloud', icon: 'fa-cloud', unit: '%', decimals: 0 },
  { id: 'precipitation', label: 'Precipitation', short: 'Precip', icon: 'fa-cloud-rain', unit: ' mm/h', decimals: 1 },
  { id: 'humidity', label: 'Humidity', short: 'Humid', icon: 'fa-droplet', unit: '%', decimals: 0 },
];

const FACTOR_BY_ID = new Map(WEATHER_FACTORS.map((f) => [f.id, f]));

export function getFactor(id: string): WeatherFactor | undefined {
  return FACTOR_BY_ID.get(id);
}

/** Live weather reading for a single point (one value per parameter). */
export interface PointWeather {
  lat: number;
  lon: number;
  /** ISO timestamp of the hour the values describe. */
  time: string;
  /** Raw API values keyed by Storm Glass parameter name. */
  values: Record<string, number>;
}

export class WeatherError extends Error {
  constructor(
    message: string,
    /** HTTP status (0 for network failures). */
    readonly status: number,
  ) {
    super(message);
    this.name = 'WeatherError';
  }
}

/** Read the default key baked in at build time, if any. */
export function envApiKey(): string {
  return (import.meta.env.VITE_STORMGLASS_API_KEY as string | undefined)?.trim() ?? '';
}

interface CacheEntry {
  time: string;
  values: Record<string, number>;
  fetchedAt: number;
}

function roundCoord(n: number): number {
  const f = 10 ** CACHE_PRECISION;
  return Math.round(n * f) / f;
}

function cacheKeyFor(lat: number, lon: number): string {
  return `${roundCoord(lat)},${roundCoord(lon)}`;
}

function readCache(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, CacheEntry>;
  } catch {
    /* ignore malformed cache */
  }
  return {};
}

function writeCache(cache: Record<string, CacheEntry>): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full / unavailable — ignore */
  }
}

/** Picks the best available source value for a Storm Glass parameter cell. */
function pickValue(cell: unknown): number | undefined {
  if (cell == null || typeof cell !== 'object') return undefined;
  const obj = cell as Record<string, number>;
  for (const source of SOURCE_PRIORITY) {
    if (typeof obj[source] === 'number') return obj[source];
  }
  const first = Object.values(obj).find((v) => typeof v === 'number');
  return first;
}

/**
 * Fetches the current-hour marine weather for a single point, using the
 * cache when a fresh entry exists. Throws {@link WeatherError} on auth /
 * quota / network failures.
 */
export async function fetchPointWeather(
  lat: number,
  lon: number,
  params: string[],
  apiKey: string,
): Promise<PointWeather> {
  if (!apiKey) throw new WeatherError('Missing Storm Glass API key.', 401);

  const key = cacheKeyFor(lat, lon);
  const cache = readCache();
  const cached = cache[key];
  const now = Date.now();

  // Reuse the cache when it is still fresh and already holds every param
  // we were asked for.
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    const hasAll = params.every((p) => p in cached.values);
    if (hasAll) {
      return { lat, lon, time: cached.time, values: cached.values };
    }
  }

  const start = Math.floor(now / 1000);
  const url =
    `${ENDPOINT}?lat=${roundCoord(lat)}&lng=${roundCoord(lon)}` +
    `&params=${encodeURIComponent(params.join(','))}` +
    `&start=${start}&end=${start}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: apiKey } });
  } catch (err) {
    throw new WeatherError(
      `Network error contacting Storm Glass: ${(err as Error).message}`,
      0,
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new WeatherError('Invalid Storm Glass API key.', res.status);
  }
  if (res.status === 402 || res.status === 429) {
    throw new WeatherError('Storm Glass daily request quota exceeded.', res.status);
  }
  if (!res.ok) {
    throw new WeatherError(`Storm Glass request failed (HTTP ${res.status}).`, res.status);
  }

  const body = (await res.json()) as {
    hours?: Array<Record<string, unknown> & { time: string }>;
  };
  const hour = body.hours?.[0];
  if (!hour) {
    throw new WeatherError('Storm Glass returned no data for this point.', res.status);
  }

  const values: Record<string, number> = { ...(cached?.values ?? {}) };
  for (const p of params) {
    const v = pickValue(hour[p]);
    if (typeof v === 'number') values[p] = v;
  }

  const time = typeof hour.time === 'string' ? hour.time : new Date(now).toISOString();
  cache[key] = { time, values, fetchedAt: now };
  writeCache(cache);

  return { lat, lon, time, values };
}

export interface ManyResult {
  points: PointWeather[];
  error?: WeatherError;
}

/**
 * Fetches weather for several points sequentially (to respect the API
 * rate limit). Stops early and returns whatever succeeded if a fatal
 * error (auth/quota) is hit, surfacing it via `error`.
 */
export async function fetchManyPointWeather(
  coords: Array<[number, number]>,
  params: string[],
  apiKey: string,
): Promise<ManyResult> {
  const points: PointWeather[] = [];
  for (const [lat, lon] of coords) {
    try {
      points.push(await fetchPointWeather(lat, lon, params, apiKey));
    } catch (err) {
      if (err instanceof WeatherError) {
        // Auth / quota errors apply to every request — stop trying.
        if (err.status === 401 || err.status === 403 || err.status === 402 || err.status === 429) {
          return { points, error: err };
        }
        // Otherwise skip this point and continue with the rest.
        continue;
      }
      throw err;
    }
  }
  return { points };
}

/** Formats a raw API value for a factor (applying its transform + unit). */
export function formatFactorValue(factor: WeatherFactor, raw: number): string {
  const v = factor.transform ? factor.transform(raw) : raw;
  return `${v.toFixed(factor.decimals)}${factor.unit}`;
}
