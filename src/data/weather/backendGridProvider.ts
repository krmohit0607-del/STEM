/**
 * Backend-backed `WeatherProvider` — used ONLY for past dates (negative
 * forecast hours), where Open-Meteo's own forecast/marine endpoints don't
 * apply. Routes through the backend's persistent tile cache
 * (`WeatherController`/`WeatherDataService`) instead of calling an upstream
 * API directly from the browser, so repeat requests for the same hour/tile
 * — from any user — are served from the database.
 *
 * Deliberately NOT registered in `registry.ts` alongside the live/forecast
 * `openMeteoProvider` — the live forward-looking pipeline (hour >= 0) is
 * untouched; `liveGrid.ts` picks this provider instead of `providerFor()`
 * specifically when `hour < 0`. See `MIN_FORECAST_HOURS` in `types.ts`.
 */
import { fetchWeatherGrid } from '../../api/weatherGridApi';
import type { LatLngBounds, WeatherGrid, WeatherProvider } from './types';

/** Coarser than the live field's viewport-resolution grid — appropriate for
 *  browsing historical conditions, not high-fidelity "now" rendering. */
const COLS = 40;
const ROWS = 24;

export const backendGridProvider: WeatherProvider = {
  id: 'backend-grid',
  supports: () => true,
  async fetchGrid(factorId: string, bounds: LatLngBounds, hour: number): Promise<WeatherGrid | null> {
    try {
      const timestamp = new Date(Date.now() + hour * 3600_000).toISOString();
      const dto = await fetchWeatherGrid(factorId, timestamp, bounds, COLS, ROWS);
      return { bounds, cols: dto.cols, rows: dto.rows, mag: dto.mag, dir: dto.dir, time: dto.time };
    } catch {
      return null;
    }
  },
};
