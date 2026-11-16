/**
 * Backend-synced I/O for the Route Explorer / Route Simulator's saved-routes
 * storage (`fv.savedRoutes` in `localStorage`).
 *
 * Several pages/components read and write this same `localStorage` array,
 * each with their own locally-typed `SavedRoute`/`SavedWaypoint` shape
 * (`RouteExplorerPage`, `RouteSimulatorPanel`, `PlotRoutePage`,
 * `RouteExplorerSearchPage`, `OptimizationRunDialog`, `optimizationStore`).
 * This module centralizes the actual storage I/O so all of them transparently
 * get write-through-to-backend + hydrate-on-login, without each file needing
 * its own copy of that logic. Callers keep their own TypeScript shape for the
 * route/waypoint objects — this module only moves the raw JSON array.
 *
 * Persisted via the generic Settings API (same mechanism already used for
 * `data/voyageOverrides.ts`), so saved routes survive a browser data wipe and
 * follow the user across devices/browsers once the backend is reachable.
 */

import { settingsApi } from '../api/settingsApi';

const SAVED_ROUTES_KEY = 'fv.savedRoutes';
export const SAVED_ROUTES_SETTING = 'routes.savedRoutes';

/** Some saved routes may share an `id` — an id-collision bug from `Date.now()`-
 *  only id generation under rapid actions, now fixed at the source (every
 *  caller uses a `Date.now()` + random/counter suffix instead — see
 *  `RouteExplorerPage.tsx`'s `uniqueId` helper), but already-saved data from
 *  before that fix can still have duplicates sitting in storage. Two routes
 *  sharing an id render as two overlapping lines wherever that id is used as
 *  a list key (e.g. the Route Simulator's weather chart, or a voyage/route
 *  list), so re-key every repeat with a freshly-generated unique id here
 *  instead of trusting storage — heals existing corrupted data on read. */
function dedupeRouteIds(routes: unknown[]): { routes: unknown[]; changed: boolean } {
  const seen = new Set<string>();
  let changed = false;
  const result = routes.map((r) => {
    const id = (r as { id?: string } | null)?.id;
    if (typeof id !== 'string' || !seen.has(id)) {
      if (typeof id === 'string') seen.add(id);
      return r;
    }
    changed = true;
    let newId = `route-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    while (seen.has(newId)) newId = `route-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    seen.add(newId);
    return { ...(r as object), id: newId };
  });
  return { routes: result, changed };
}

/** Read the raw saved-routes array (whatever shape each caller expects). */
export function readSavedRoutesRaw(): unknown[] {
  try {
    const raw = window.localStorage.getItem(SAVED_ROUTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const { routes, changed } = dedupeRouteIds(parsed);
    if (changed) writeSavedRoutesRaw(routes);
    return routes;
  } catch {
    return [];
  }
}

// Debounced write-through to the backend database (Settings key-value API),
// matching the pattern in `data/voyageOverrides.ts`.
let pushTimer: ReturnType<typeof setTimeout> | null = null;
function pushSavedRoutes(routes: unknown[]): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    settingsApi.put(SAVED_ROUTES_SETTING, routes).catch(() => {
      /* offline — the local copy is already saved */
    });
  }, 800);
}

/** Write the raw saved-routes array — `localStorage` immediately, backend
 *  debounced (so rapid edits don't spam the API). */
export function writeSavedRoutesRaw(routes: unknown[]): void {
  try {
    window.localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(routes));
  } catch {
    /* storage unavailable — ignore */
  }
  pushSavedRoutes(routes);
}

/** Pull the backend copy of saved routes down into `localStorage` — call
 *  once per session, e.g. when the Route Explorer page mounts, so routes
 *  saved from another device/browser are available locally too. Returns
 *  `true` when local data changed, so the caller can notify readers (e.g.
 *  via `bumpSavedRoutes()` from `data/optimizationStore.ts`). */
export async function hydrateSavedRoutesFromBackend(): Promise<boolean> {
  try {
    const res = await settingsApi.get(SAVED_ROUTES_SETTING);
    if (!res?.valueJson) return false;
    const parsed = JSON.parse(res.valueJson);
    if (!Array.isArray(parsed)) return false;
    const localRaw = window.localStorage.getItem(SAVED_ROUTES_KEY);
    const nextRaw = JSON.stringify(parsed);
    if (localRaw === nextRaw) return false;
    window.localStorage.setItem(SAVED_ROUTES_KEY, nextRaw);
    return true;
  } catch {
    /* offline / not found — keep whatever is already local */
    return false;
  }
}

// --- Per-voyage scoping -------------------------------------------------------
//
// Saved routes are tagged with an optional `voyageId` (added going forward;
// pre-existing routes saved before this had no such field). A route with no
// `voyageId` is treated as "unassigned/legacy" and stays visible to every
// voyage, so nothing already saved silently disappears — but any route
// created from now on is tagged with the voyage it was created for.

/** Saved routes relevant to one voyage: its own tagged routes, plus any
 *  legacy routes that predate voyage-tagging. */
export function readSavedRoutesForVoyage(voyageId: string | undefined): unknown[] {
  const all = readSavedRoutesRaw();
  if (!voyageId) return all;
  return all.filter((r) => {
    const tag = (r as { voyageId?: string } | null)?.voyageId;
    return tag == null || tag === voyageId;
  });
}

/** Tag a route object with the voyage it belongs to (spread it into a new
 *  route literal before saving, e.g. `{ ...tagRouteWithVoyage(voyageId), id, name, ... }`). */
export function tagRouteWithVoyage<T extends object>(route: T, voyageId: string | undefined): T & { voyageId?: string } {
  return voyageId ? { ...route, voyageId } : route;
}

const ACTIVE_ROUTE_KEY = 'fv.activeRouteId';
const ROUTE_EDITOR_ROUTE_KEY = 'fv.routeEditorRouteId';
/** Key used for the pre-voyage-scoping value (a plain route-id string, not a
 *  per-voyage map), so it still resolves for whichever voyage looks it up
 *  until that voyage saves its own route id. */
const LEGACY_ENTRY = '__legacy__';

function readRouteIdMap(storageKey: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    // Pre-voyage-scoping data was a plain route-id string, not a JSON map.
    if (!raw.trim().startsWith('{')) return { [LEGACY_ENTRY]: raw };
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeRouteIdMap(storageKey: string, map: Record<string, string>): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    /* storage unavailable — ignore */
  }
}

/** The active (primary) route id for a voyage, falling back to the legacy
 *  global value (pre-voyage-scoping) until this voyage sets its own. */
export function readActiveRouteId(voyageId: string | undefined): string | null {
  const map = readRouteIdMap(ACTIVE_ROUTE_KEY);
  if (voyageId && map[voyageId] != null) return map[voyageId];
  return map[LEGACY_ENTRY] ?? null;
}

export function writeActiveRouteId(voyageId: string | undefined, id: string | null): void {
  if (!voyageId) return;
  const map = readRouteIdMap(ACTIVE_ROUTE_KEY);
  if (id == null) delete map[voyageId];
  else map[voyageId] = id;
  writeRouteIdMap(ACTIVE_ROUTE_KEY, map);
}

/** The route currently loaded in the Route Explorer's editor for a voyage. */
export function readRouteEditorRouteId(voyageId: string | undefined): string | null {
  const map = readRouteIdMap(ROUTE_EDITOR_ROUTE_KEY);
  if (voyageId && map[voyageId] != null) return map[voyageId];
  return map[LEGACY_ENTRY] ?? null;
}

export function writeRouteEditorRouteId(voyageId: string | undefined, id: string | null): void {
  if (!voyageId) return;
  const map = readRouteIdMap(ROUTE_EDITOR_ROUTE_KEY);
  if (id == null) delete map[voyageId];
  else map[voyageId] = id;
  writeRouteIdMap(ROUTE_EDITOR_ROUTE_KEY, map);
}
