/**
 * TEMPLATE — not registered by default. Copy/adapt this to wire up your own
 * backend (or any other vendor) as a weather data source for the map layer
 * and route simulator, without changing any other file.
 *
 * Expected grid data: one value per `(factorId, bounds, hour)` request, as a
 * small row-major grid of magnitude + direction samples (see `WeatherGrid`
 * in `./types.ts`). Resolution is up to you — `openMeteoProvider.ts` uses a
 * 7×7 grid and lets `sampleLiveField` bilinearly interpolate the rest.
 *
 * Once your endpoint exists (e.g. a .NET `POST /api/weather/grid`), register
 * the provider once at startup — e.g. in `src/main.tsx`, before the app
 * renders:
 *
 *   import { registerWeatherProvider } from './data/weather/registry';
 *   import { backendWeatherProvider } from './data/weather/backendProviderExample';
 *   registerWeatherProvider(backendWeatherProvider); // tried before Open-Meteo
 *
 * `registerWeatherProvider(provider, 'before')` (the default) tries this
 * provider first and only falls back to Open-Meteo for factors it doesn't
 * `supports()`; pass `'after'` to do the reverse.
 */

import type { LatLngBounds, WeatherGrid, WeatherProvider } from './types';

/** Factor ids this backend can serve — add/remove as your API grows. */
const SUPPORTED_FACTORS = new Set(['wind', 'waves']);

async function fetchGrid(
  factorId: string,
  bounds: LatLngBounds,
  hour: number,
): Promise<WeatherGrid | null> {
  const res = await fetch('/api/weather/grid', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ factorId, bounds, hour }),
  });
  if (!res.ok) return null;
  // Expected response body: { cols, rows, mag: number[], dir: number[], time: string | null }
  const body = (await res.json()) as Omit<WeatherGrid, 'bounds'>;
  return { ...body, bounds };
}

export const backendWeatherProvider: WeatherProvider = {
  id: 'backend',
  supports: (factorId) => SUPPORTED_FACTORS.has(factorId),
  fetchGrid,
};
