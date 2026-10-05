/**
 * Backward-compatible facade over the pluggable weather data layer in
 * `./weather/`. Re-exports the same public API this module always had, so
 * existing imports (`from '../data/openMeteo'`) keep working unchanged.
 *
 * New code — and any future weather data source (your own backend, a
 * vendor API, etc.) — should register through `./weather/registry.ts`
 * (`registerWeatherProvider`) instead of editing this file. See
 * `./weather/backendProviderExample.ts` for a template.
 */

export type { LatLngBounds } from './weather/types';
export { MAX_FORECAST_HOURS, MIN_FORECAST_HOURS } from './weather/types';
export { hasLiveSource } from './weather/registry';
export { ensureLiveData, sampleLiveField, getLiveDataTime } from './weather/liveGrid';
export {
  fetchPointWeather,
  fetchPointForecast,
  fetchPointWeatherAt,
  type PointFactor,
  type ForecastRow,
} from './weather/openMeteoProvider';
