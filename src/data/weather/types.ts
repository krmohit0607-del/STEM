/**
 * Shared types for the pluggable weather data layer. Any source (Open-Meteo,
 * a commercial vendor, or your own backend) implements `WeatherProvider` and
 * is registered via `registerWeatherProvider()` in `registry.ts` — nothing
 * else in the app (grid cache, interpolation, map rendering) needs to change
 * to add or swap a source. See `backendProviderExample.ts` for a template.
 */

export interface LatLngBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** One forecast-hour grid of samples over a lat/lng bounding box. */
export interface WeatherGrid {
  bounds: LatLngBounds;
  cols: number;
  rows: number;
  /** Magnitude in the factor's display unit, row-major (`row * cols + col`). */
  mag: number[];
  /** Compass bearing (deg), row-major, 0 for non-directional factors. */
  dir: number[];
  /** ISO timestamp (UTC) the grid represents, if the source reports one. */
  time: string | null;
}

export interface WeatherProvider {
  /** Unique id, used for cache keys and debugging. */
  id: string;
  /** Whether this provider can serve the given factor id (e.g. 'wind'). */
  supports(factorId: string): boolean;
  /** Fetch one forecast-hour grid of samples over `bounds` for `factorId`. */
  fetchGrid(factorId: string, bounds: LatLngBounds, hour: number): Promise<WeatherGrid | null>;
}

/** How many hours ahead the forecast slider/simulator can reach. */
export const MAX_FORECAST_HOURS = 240;

/** How many hours into the past the historical date-range viewer can reach
 *  (negative hour = that many hours before now) — one year, so users can
 *  jump to a month- or year-old date via the timeline's date picker. Served
 *  by `backendGridProvider` (the persistent tile cache), not the
 *  live/forecast `openMeteoProvider`. Actual data availability for very old
 *  dates depends on what Open-Meteo's history window still serves and/or
 *  what's already been cached in the database. */
export const MIN_FORECAST_HOURS = -8784;
