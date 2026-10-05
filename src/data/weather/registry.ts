/**
 * Registry of pluggable weather data sources.
 *
 * Providers are tried in order; the first whose `supports()` returns true
 * for a factor serves it. To source a factor from your own backend (or any
 * other vendor) instead of — or in addition to — Open-Meteo, implement
 * `WeatherProvider` (see `backendProviderExample.ts` for a template) and
 * register it. Nothing else in the app needs to change: the grid cache,
 * time interpolation, and map rendering all go through `providerFor()`.
 *
 *   import { registerWeatherProvider } from './data/weather/registry';
 *   registerWeatherProvider(myBackendProvider);
 */

import type { WeatherProvider } from './types';
import { openMeteoProvider } from './openMeteoProvider';

const providers: WeatherProvider[] = [openMeteoProvider];

/**
 * Register a provider. `order: 'before'` (default) tries it ahead of
 * already-registered providers, so it can override Open-Meteo for the
 * factors it supports; `'after'` only fills gaps Open-Meteo doesn't cover.
 */
export function registerWeatherProvider(provider: WeatherProvider, order: 'before' | 'after' = 'before'): void {
  if (order === 'before') providers.unshift(provider);
  else providers.push(provider);
}

/** The first registered provider that can serve this factor, if any. */
export function providerFor(factorId: string): WeatherProvider | undefined {
  return providers.find((p) => p.supports(factorId));
}

/** Whether any registered provider can serve live data for this factor. */
export function hasLiveSource(factorId: string): boolean {
  return providerFor(factorId) != null;
}
