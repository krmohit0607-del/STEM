/**
 * Permanent, voyage-scoped "All Routes" history: every candidate route ever
 * produced by an Optimization run is recorded here automatically (not just
 * the one the user chooses to keep), so a past run's options are never lost
 * — the user can look back at exactly what was generated, with what
 * criteria, and reactivate one later even if the current Route Simulator
 * list has since moved on.
 *
 * Persisted via the generic Settings API (same mechanism as
 * `savedRoutesStore.ts`), so history survives a browser data wipe and
 * follows the user across devices/browsers once the backend is reachable.
 * This is an append-only log — entries are never deleted from here.
 */

import { settingsApi } from '../api/settingsApi';
import type { MarketFactors } from './routeMetrics';
import { readSavedRoutesRaw, writeSavedRoutesRaw, writeActiveRouteId } from './savedRoutesStore';
import { bumpSavedRoutes, requestPanelView } from './optimizationStore';
import { mergeVoyageShared } from './voyageOverrides';
import { buildFrozenWeatherSnapshot, type FrozenWeatherFactor } from './routeWeatherSnapshot';
import { saveRouteSnapshot, generateSnapshotId, type SnapshotRouteItem } from './routeSnapshotsStore';

const ROUTE_HISTORY_KEY = 'fv.routeHistory';
export const ROUTE_HISTORY_SETTING = 'routes.routeHistory';

/** A compact, JSON-safe snapshot of the criteria/constraints a route was
 *  generated with — enough to tell, later, "why" this route exists. */
export interface RouteHistoryCriteria {
  scenarioId: string;
  market: MarketFactors;
  /** ISO date-time. */
  etd: string;
  /** ISO date-time, for the "specific ETA" scenario. */
  targetEta?: string | null;
  /** Just-In-Time arrival rule and, for BETWEEN, the ISO window end. */
  arrivalRule?: 'ON' | 'BETWEEN' | 'BEFORE' | 'AFTER';
  arrivalWindowEnd?: string | null;
  customSimulation?: {
    speedKn: number;
    consumptionPerDay: number;
    rta?: string | null;
    rpmMin?: string;
    rpmMax?: string;
    mcrMin?: string;
    mcrMax?: string;
    draft?: string;
    displacement?: string;
    gm?: string;
    ecaFractionPct?: number;
  } | null;
}

/** A compact summary of a route's headline figures — enough for the history
 *  list without needing to carry the full `RouteMetrics` (which holds `Date`
 *  objects and isn't directly JSON-safe). */
export interface RouteHistorySummary {
  distanceNm: number;
  durationH: number;
  speedKn: number;
  ecaDistanceNm: number;
  ecaDurationH: number;
  fuelTons: number;
  ecaFuelTons: number;
  fuelCost: number;
  hireCost: number;
  euaCost: number;
  totalCost: number;
  co2Tons: number;
  /** ISO date-time. */
  etdIso: string;
  /** ISO date-time. */
  etaIso: string;
}

export interface RouteHistoryEntry {
  id: string;
  voyageId?: string;
  /** The base route this was generated from (for context in the list). */
  baseRouteName: string;
  name: string;
  /** Present for optimizer-generated entries; absent for a manually saved/
   *  edited route archived here after going unused (see `source`). */
  scenarioId?: string;
  generatedAt: string;
  path: Array<[number, number]>;
  summary: RouteHistorySummary;
  /** Present for optimizer-generated entries; absent for a manually saved/
   *  edited route (nothing to summarize — it wasn't generated under a
   *  scenario/market/ETD). */
  criteria?: RouteHistoryCriteria;
  /** Weather along the route, locked at the moment it was generated — what
   *  the "View" link shows, instead of re-sampling current/live weather. */
  weather?: FrozenWeatherFactor[];
  /** `'manual'` for a route the user plotted/edited/saved directly (not
   *  from an Optimization run) that was archived here after going unused in
   *  the Route Simulator; absent (optimizer-generated) otherwise. */
  source?: 'manual';
}

export function readRouteHistoryRaw(): RouteHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(ROUTE_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
function pushRouteHistory(entries: RouteHistoryEntry[]): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    settingsApi.put(ROUTE_HISTORY_SETTING, entries).catch(() => {
      /* offline — the local copy is already saved */
    });
  }, 800);
}

function writeRouteHistoryRaw(entries: RouteHistoryEntry[]): void {
  try {
    window.localStorage.setItem(ROUTE_HISTORY_KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable — ignore */
  }
  pushRouteHistory(entries);
}

/** Append new history entries (newest first) — not automatically removed by
 *  anything in this app, so past candidates/criteria are never silently
 *  lost; see `deleteRouteHistoryEntries` below for the user-initiated
 *  removal path (e.g. "All Routes" panel's own Delete action). */
export function appendRouteHistory(entries: RouteHistoryEntry[]): void {
  if (entries.length === 0) return;
  const all = readRouteHistoryRaw();
  writeRouteHistoryRaw([...entries, ...all]);
  // Reuse the cross-component "something route-related changed" signal so
  // the "All Routes" panel (and anything else reading this store) re-reads.
  bumpSavedRoutes();
}

/** Remove specific history entries by id — a deliberate user action (e.g.
 *  the "All Routes" panel's own Delete button for checked rows), distinct
 *  from the automatic append-only recording above. */
export function deleteRouteHistoryEntries(ids: string[]): void {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  const all = readRouteHistoryRaw();
  const next = all.filter((e) => !idSet.has(e.id));
  if (next.length === all.length) return;
  writeRouteHistoryRaw(next);
  bumpSavedRoutes();
}

/** History entries relevant to one voyage (its own + any untagged legacy
 *  ones), newest first. */
export function readRouteHistoryForVoyage(voyageId: string | undefined): RouteHistoryEntry[] {
  const all = readRouteHistoryRaw();
  if (!voyageId) return all;
  return all.filter((e) => e.voyageId == null || e.voyageId === voyageId);
}

/** Pull the backend copy of route history down into `localStorage` — call
 *  once per session. Merges rather than replaces: this store is append-only
 *  (an entry already written locally — e.g. seconds ago, before its own
 *  debounced backend push has even landed — must never be dropped just
 *  because this GET's response was still the pre-push backend snapshot).
 *  Returns `true` when local data changed. */
export async function hydrateRouteHistoryFromBackend(): Promise<boolean> {
  try {
    const res = await settingsApi.get(ROUTE_HISTORY_SETTING);
    if (!res?.valueJson) return false;
    const parsed = JSON.parse(res.valueJson);
    if (!Array.isArray(parsed)) return false;
    const local = readRouteHistoryRaw();
    const localIds = new Set(local.map((e) => e.id));
    const merged = [...local, ...parsed.filter((e) => e && typeof e === 'object' && !localIds.has(e.id))];
    const localRaw = window.localStorage.getItem(ROUTE_HISTORY_KEY);
    const nextRaw = JSON.stringify(merged);
    if (localRaw === nextRaw) return false;
    window.localStorage.setItem(ROUTE_HISTORY_KEY, nextRaw);
    return true;
  } catch {
    return false;
  }
}

/** Decimal degrees → `33° 51.2' N` style string (matches the simulator). */
function decToDM(value: number, isLat: boolean): string {
  const hemi = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  const pad = isLat ? 2 : 3;
  return `${String(deg).padStart(pad, '0')}° ${min.toFixed(1)}' ${hemi}`;
}

interface SavedWaypoint {
  lat: string;
  lon: string;
}
interface SavedRoute {
  id: string;
  name: string;
  savedAt: string;
  waypoints: SavedWaypoint[];
  voyageId?: string;
}

/**
 * Reactivate a past "All Routes" history entry: save it as a normal saved
 * route (tagged with the voyage), mark it active, and switch the drawer to
 * the Route Simulator — the same effect as "Follow route" / "Set as active"
 * elsewhere, so a route picked from history behaves identically to one
 * picked from a fresh Optimize run.
 */
export function activateRouteHistoryEntry(entry: RouteHistoryEntry, voyageId: string | undefined): void {
  const saved = readSavedRoutesRaw() as SavedRoute[];
  const id = `hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const newRoute: SavedRoute = {
    id,
    name: entry.name,
    savedAt: new Date().toISOString(),
    waypoints: entry.path.map(([lat, lon]) => ({
      lat: decToDM(lat, true),
      lon: decToDM(lon, false),
    })),
    ...(voyageId ? { voyageId } : {}),
  };
  writeSavedRoutesRaw([...saved, newRoute]);
  writeActiveRouteId(voyageId, `saved-${id}`);
  if (voyageId) mergeVoyageShared(voyageId, { leg1AutoRoute: false });
  bumpSavedRoutes();
  requestPanelView('simulator');
}

/**
 * Build (and persist) a shareable, read-only snapshot for a single "All
 * Routes" history entry, reusing the weather it was locked with at
 * generation time — falls back to sampling current weather only for
 * entries recorded before this existed. Returns the snapshot id to open
 * (`/route-view/<id>`).
 */
export function createViewSnapshotFromHistoryEntry(entry: RouteHistoryEntry): string {
  const id = generateSnapshotId();
  const routeItem: SnapshotRouteItem = {
    id: entry.id,
    label: entry.name,
    color: '#1f6feb',
    path: entry.path,
    distanceNm: entry.summary.distanceNm ?? 0,
    durationH: entry.summary.durationH ?? 0,
    // Older entries (recorded before these fields existed) may be missing
    // them — fall back to 0 rather than letting `undefined` reach a
    // `.toFixed()` call on the view page.
    speedKn: entry.summary.speedKn ?? 0,
    ecaDistanceNm: entry.summary.ecaDistanceNm ?? 0,
    ecaDurationH: entry.summary.ecaDurationH ?? 0,
    fuelTons: entry.summary.fuelTons ?? 0,
    ecaFuelTons: entry.summary.ecaFuelTons ?? 0,
    fuelCost: entry.summary.fuelCost ?? 0,
    hireCost: entry.summary.hireCost ?? 0,
    euaCost: entry.summary.euaCost ?? 0,
    totalCost: entry.summary.totalCost ?? 0,
    co2Tons: entry.summary.co2Tons ?? 0,
    etdIso: entry.summary.etdIso,
    etaIso: entry.summary.etaIso,
  };
  const weather =
    entry.weather ??
    buildFrozenWeatherSnapshot([
      { id: entry.id, label: entry.name, color: routeItem.color, path: entry.path, hours: entry.summary.durationH },
    ]);
  saveRouteSnapshot({
    id,
    kind: 'view',
    createdAt: new Date().toISOString(),
    voyageId: entry.voyageId,
    title: entry.name,
    routes: [routeItem],
    weather,
    // The map weather-overlay grid is saved separately (see
    // `saveHistoryWeatherGrids`) keyed by this history entry's own id —
    // the view page fetches it lazily by this pointer instead of it being
    // inlined into every snapshot (or worse, into the permanent history
    // entry itself).
    gridSourceId: entry.id,
  });
  return id;
}
