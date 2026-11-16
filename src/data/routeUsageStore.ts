/**
 * Tracks when each non-active route in the Route Simulator (a saved route,
 * or an optimizer scenario result) was last "used" — explicitly made
 * Active, selected/viewed in the routes table, or shown on the chart/map
 * via its row checkbox. Backs the auto-archive policy in
 * `RouteSimulatorPanel`: a route that's gone unused for longer than
 * `STALE_AFTER_MS` is quietly moved out to "All Routes" (saved routes) or
 * dropped from the active optimizer list (optimizer results, which are
 * already permanently recorded in "All Routes" from the moment they were
 * generated), instead of cluttering the Route Simulator's primary list
 * forever.
 *
 * Session-local bookkeeping only (localStorage, no backend sync) — this is
 * UI housekeeping about what's been looked at recently, not voyage data
 * worth following the user across devices.
 */

const KEY = 'fv.routeLastUsed';

/** `voyageId -> routeId -> ISO timestamp last used`. */
type UsageMap = Record<string, Record<string, string>>;

/** How long a non-active route can go unused before it's archived. */
export const ROUTE_STALE_AFTER_MS = 6 * 60 * 60_000;

function readAll(): UsageMap {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: UsageMap): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Stamp a route as used right now (call on activation, selection, or
 *  becoming visible on the chart/map). */
export function markRouteUsed(voyageId: string | undefined, routeId: string): void {
  if (!voyageId) return;
  const map = readAll();
  map[voyageId] = { ...(map[voyageId] ?? {}), [routeId]: new Date().toISOString() };
  writeAll(map);
}

/** Last-used ISO timestamp for a route, or `null` if never explicitly used. */
export function getLastUsed(voyageId: string | undefined, routeId: string): string | null {
  if (!voyageId) return null;
  return readAll()[voyageId]?.[routeId] ?? null;
}

/** Drop a route's usage record (call once it's archived/deleted so stale
 *  entries don't accumulate forever). */
export function clearRouteUsage(voyageId: string | undefined, routeId: string): void {
  if (!voyageId) return;
  const map = readAll();
  if (!map[voyageId] || !(routeId in map[voyageId])) return;
  const { [routeId]: _removed, ...rest } = map[voyageId];
  map[voyageId] = rest;
  writeAll(map);
}

/** Whether a route — last used at `lastUsedIso`, or never (fall back to
 *  `fallbackIso`, e.g. when it was created/saved) — has gone stale. */
export function isRouteStale(lastUsedIso: string | null, fallbackIso: string | undefined): boolean {
  const reference = lastUsedIso ?? fallbackIso;
  if (!reference) return false;
  const t = new Date(reference).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t > ROUTE_STALE_AFTER_MS;
}
