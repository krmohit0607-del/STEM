/**
 * Generic live-data grid cache + interpolation, independent of which
 * `WeatherProvider` actually supplies the data (see `registry.ts`) — works
 * unchanged for Open-Meteo, a future backend provider, or both at once.
 *
 * The map paints a field at viewport resolution, far too many points to
 * query directly. Instead we fetch one coarse grid per whole forecast hour
 * over the current view, cache it, and let `sampleLiveField()` bilinearly
 * interpolate in space and — for fractional hours, e.g. while a simulation
 * plays — linearly blend between the two surrounding hourly grids in time,
 * so playback moves continuously instead of jumping once per whole hour.
 * Falls back to the synthetic field (`weatherField.ts`) while a grid is
 * loading or unavailable.
 */

import type { FieldSample } from '../weatherField';
import type { LatLngBounds, WeatherGrid, WeatherProvider } from './types';
import { MAX_FORECAST_HOURS, MIN_FORECAST_HOURS } from './types';
import { providerFor } from './registry';
import { backendGridProvider } from './backendGridProvider';
import { pruneExpiredGrids, readGrid, writeGrid } from './gridDb';

const cache = new Map<string, WeatherGrid>();
const pending = new Map<string, Promise<WeatherGrid | null>>();

// One-time, fire-and-forget cleanup of stale cross-session entries.
void pruneExpiredGrids();

/** Live/forecast data (hour >= 0) still goes through the normal provider
 *  registry; past dates (hour < 0) have no forecast to serve, so they're
 *  routed to the persistent backend tile cache instead. */
function resolveProvider(factorId: string, hour: number): WeatherProvider | undefined {
  if (hour < 0) return backendGridProvider;
  return providerFor(factorId);
}

function keyFor(providerId: string, factorId: string, b: LatLngBounds, hour: number): string {
  const r = (n: number) => Math.round(n * 2) / 2; // 0.5° buckets
  return `${providerId}:${factorId}:${hour}:${r(b.south)},${r(b.west)},${r(b.north)},${r(b.east)}`;
}

/** Fetch (or reuse an in-flight fetch for) a single whole-hour grid — first
 *  checking the cross-session IndexedDB cache so reopening the app doesn't
 *  re-fetch viewport/hour combos it already has on disk. */
function ensureHourGrid(factorId: string, b: LatLngBounds, hour: number, onReady: () => void): void {
  const provider = resolveProvider(factorId, hour);
  if (!provider) return;
  const key = keyFor(provider.id, factorId, b, hour);
  if (cache.has(key) || pending.has(key)) return;
  const p = readGrid(key)
    .then((stored) => {
      if (stored) {
        cache.set(key, stored);
        return stored;
      }
      return provider.fetchGrid(factorId, b, hour).then((g) => {
        if (g) {
          cache.set(key, g);
          void writeGrid(key, g, hour < 0);
        }
        return g;
      });
    })
    .catch(() => null)
    .finally(() => {
      pending.delete(key);
      onReady();
    });
  pending.set(key, p);
}


/**
 * Kick off (or reuse) a fetch of the grid covering `b` for the factor. `hour`
 * may be fractional (the simulator scrubs continuously) — both the floor and
 * ceiling integer hour are fetched so `sampleLiveField` can blend between
 * them.
 */
export function ensureLiveData(factorId: string, b: LatLngBounds, hour: number, onReady: () => void): void {
  if (!resolveProvider(factorId, hour)) return;
  const h0 = Math.max(MIN_FORECAST_HOURS, Math.min(MAX_FORECAST_HOURS, Math.floor(hour)));
  const h1 = Math.min(MAX_FORECAST_HOURS, h0 + 1);
  ensureHourGrid(factorId, b, h0, onReady);
  if (h1 !== h0) ensureHourGrid(factorId, b, h1, onReady);
}

/** Bilinear sample of a single cached grid at a lat/lon. */
function sampleGrid(g: WeatherGrid, lat: number, lon: number): FieldSample {
  const { north, south, west, east } = g.bounds;
  const fy = ((north - lat) / (north - south || 1)) * (g.rows - 1);
  const fx = ((lon - west) / (east - west || 1)) * (g.cols - 1);
  const r0 = Math.max(0, Math.min(g.rows - 1, Math.floor(fy)));
  const c0 = Math.max(0, Math.min(g.cols - 1, Math.floor(fx)));
  const r1 = Math.min(g.rows - 1, r0 + 1);
  const c1 = Math.min(g.cols - 1, c0 + 1);
  const ty = fy - r0;
  const tx = fx - c0;
  const at = (r: number, c: number) => g.mag[r * g.cols + c];
  const magnitude =
    at(r0, c0) * (1 - tx) * (1 - ty) +
    at(r0, c1) * tx * (1 - ty) +
    at(r1, c0) * (1 - tx) * ty +
    at(r1, c1) * tx * ty;
  return { magnitude, directionDeg: g.dir[r0 * g.cols + c0] };
}

/** Shortest-path interpolation between two compass bearings (degrees). */
function lerpAngle(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
}

/**
 * Sample the live grid(s) at a lat/lon, or `null` if not loaded yet. `hour`
 * may be fractional: the two surrounding whole-hour grids are each sampled
 * and blended, so scrubbing/playback moves the forecast continuously rather
 * than snapping between hourly steps.
 */
export function sampleLiveField(
  lat: number,
  lon: number,
  factorId: string,
  b: LatLngBounds,
  hour: number,
): FieldSample | null {
  const provider = resolveProvider(factorId, hour);
  if (!provider) return null;
  const h0 = Math.max(MIN_FORECAST_HOURS, Math.min(MAX_FORECAST_HOURS, Math.floor(hour)));
  const g0 = cache.get(keyFor(provider.id, factorId, b, h0));
  if (!g0) return null;
  const t = Math.max(0, Math.min(1, hour - h0));
  const h1 = Math.min(MAX_FORECAST_HOURS, h0 + 1);
  if (t <= 0 || h1 === h0) return sampleGrid(g0, lat, lon);
  const g1 = cache.get(keyFor(provider.id, factorId, b, h1));
  if (!g1) return sampleGrid(g0, lat, lon);
  const s0 = sampleGrid(g0, lat, lon);
  const s1 = sampleGrid(g1, lat, lon);
  return {
    magnitude: s0.magnitude * (1 - t) + s1.magnitude * t,
    directionDeg: lerpAngle(s0.directionDeg, s1.directionDeg, t),
  };
}

/**
 * ISO timestamp (UTC) the cached grid represents for the given factor/bounds,
 * or `null` if the grid isn't loaded yet or reported no time.
 */
export function getLiveDataTime(factorId: string, b: LatLngBounds, hour: number): string | null {
  const provider = resolveProvider(factorId, hour);
  if (!provider) return null;
  const h0 = Math.max(MIN_FORECAST_HOURS, Math.min(MAX_FORECAST_HOURS, Math.floor(hour)));
  return cache.get(keyFor(provider.id, factorId, b, h0))?.time ?? null;
}
