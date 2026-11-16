import { api } from './client';

/** Mirrors the backend's `WeatherGridDto` (see WeatherController.cs). */
export interface WeatherGridApiDto {
  south: number;
  west: number;
  north: number;
  east: number;
  cols: number;
  rows: number;
  mag: number[];
  dir: number[];
  time: string | null;
  /** True once every cell came from a live/current forecast. */
  live: boolean;
  /** True once every cell has real sampled data — live, or a historical/
   *  modelled fallback for dates outside the live window; false only when
   *  no data exists at all (both live and historical lookups failed), in
   *  which case `mag`/`dir` are meaningless all-zero filler, not "calm
   *  weather" — callers must treat that case as "no data", not render it. */
  hasData: boolean;
}

/**
 * Fetch a weather grid for `factorId` at `timestampIso` over `bounds`, via
 * the backend's persistent tile cache (see `WeatherDataService.cs`) —
 * transparently fetches-and-caches from Open-Meteo on a cache miss, so
 * repeat requests for the same hour/tile (from any user) are instant.
 */
export function fetchWeatherGrid(
  factorId: string,
  timestampIso: string,
  bounds: { south: number; west: number; north: number; east: number },
  cols: number,
  rows: number,
): Promise<WeatherGridApiDto> {
  const params = new URLSearchParams({
    factorId,
    timestamp: timestampIso,
    south: String(bounds.south),
    west: String(bounds.west),
    north: String(bounds.north),
    east: String(bounds.east),
    cols: String(cols),
    rows: String(rows),
  });
  return api.get<WeatherGridApiDto>(`/api/weather/grid?${params.toString()}`);
}
