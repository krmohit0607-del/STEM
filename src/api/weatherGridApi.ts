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
  live: boolean;
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
