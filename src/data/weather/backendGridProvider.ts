/**
 * Backend-backed `WeatherProvider` — the sole data source for the live map
 * overlay, route simulator, and historical/date-range viewer alike (see
 * `liveGrid.ts`). Routes through the backend's persistent, geographically
 * fixed tile cache (`WeatherController`/`WeatherDataService`) instead of
 * querying an upstream API directly from the browser per-viewport, so:
 *   - repeat requests for the same hour/tile — from any user — are served
 *     from the database instead of re-hitting the upstream API, and
 *   - the same geographic point always samples the same underlying tile
 *     data regardless of the caller's exact viewport, so panning/zooming
 *     (including across the antimeridian) renders a continuous field
 *     instead of jumping between differently-sampled grids.
 */
import { fetchWeatherGrid } from '../../api/weatherGridApi';
import type { LatLngBounds, WeatherGrid, WeatherProvider } from './types';

/** Resolution requested per fetch — the backend resamples from its own
 *  fixed-geography tiles into this shape, so these just control
 *  interpolation smoothness, not the underlying data's stability. */
const COLS = 40;
const ROWS = 24;

export const backendGridProvider: WeatherProvider = {
  id: 'backend-grid',
  supports: () => true,
  async fetchGrid(factorId: string, bounds: LatLngBounds, hour: number): Promise<WeatherGrid | null> {
    try {
      const timestamp = new Date(Date.now() + hour * 3600_000).toISOString();
      const dto = await fetchWeatherGrid(factorId, timestamp, bounds, COLS, ROWS);
      // `hasData: false` means every cell is meaningless all-zero filler (the
      // backend couldn't find live OR historical data for this tile/hour) —
      // treating that as a normal result would cache and display flat "0
      // magnitude, 0° direction" everywhere (a uniformly-north arrow grid
      // with no colour field, since 0 sits below the lowest contour
      // threshold), which looks like real calm weather but isn't. Report it
      // as a failed fetch instead, same as a network error: the caller
      // (`liveGrid.ts`) then leaves the gap to the synthetic fallback field
      // and retries after its own cooldown, rather than caching and showing
      // this indefinitely.
      if (!dto.hasData) return null;
      return { bounds, cols: dto.cols, rows: dto.rows, mag: dto.mag, dir: dto.dir, time: dto.time };
    } catch {
      return null;
    }
  },
};
