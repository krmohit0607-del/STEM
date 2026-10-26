/**
 * Storage for "View"/"Comparison" route snapshots — a read-only, point-in-
 * time capture of one or more routes' geometry, headline metrics, and
 * locked weather, addressable by a single shareable id
 * (`/route-view/:id`). Unlike the saved-routes/route-history stores (one
 * big array under one settings key), each snapshot is stored under its own
 * per-id Settings key, since there's no need to ever list them — only to
 * resolve one by id when its link is opened (possibly on a different
 * device/by a different user, so this always checks the backend, not just
 * `localStorage`).
 */

import { settingsApi } from '../api/settingsApi';
import type { FrozenWeatherFactor, FrozenWeatherGrid, WeatherFactorId } from './routeWeatherSnapshot';

export interface SnapshotRouteItem {
  id: string;
  label: string;
  color: string;
  path: Array<[number, number]>;
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

export interface RouteSnapshot {
  id: string;
  kind: 'view' | 'comparison';
  createdAt: string;
  voyageId?: string;
  title: string;
  routes: SnapshotRouteItem[];
  weather: FrozenWeatherFactor[];
  /** The map's full weather-overlay field, locked at creation time, per
   *  factor — optional so older snapshots (saved before this existed)
   *  still resolve, just without a map weather layer to replay. Inlined
   *  directly for "comparison" snapshots (one-off, bounded size); "view"
   *  snapshots instead set `gridSourceId` and fetch it lazily via
   *  `fetchHistoryWeatherGrids`, so the permanent "All Routes" history log
   *  this is generated from doesn't carry this heavier data forever. */
  weatherGrids?: Record<WeatherFactorId, FrozenWeatherGrid>;
  /** For "view" snapshots: the originating history entry's id, to lazily
   *  fetch its weather grids (saved separately — see above). */
  gridSourceId?: string;
}

function localKey(id: string): string {
  return `fv.routeSnapshot.${id}`;
}

function settingKey(id: string): string {
  return `routes.snapshot.${id}`;
}

function historyGridLocalKey(entryId: string): string {
  return `fv.historyWeatherGrids.${entryId}`;
}

function historyGridSettingKey(entryId: string): string {
  return `routes.historyGrid.${entryId}`;
}

export function generateSnapshotId(): string {
  return `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Persist a route-history entry's weather grids under their own key (not
 *  inlined into the permanent, ever-growing "All Routes" history blob) —
 *  fire-and-forget, called right after the entry is recorded. */
export function saveHistoryWeatherGrids(
  entryId: string,
  grids: Record<WeatherFactorId, FrozenWeatherGrid>,
): void {
  try {
    window.localStorage.setItem(historyGridLocalKey(entryId), JSON.stringify(grids));
  } catch {
    /* ignore */
  }
  settingsApi.put(historyGridSettingKey(entryId), grids).catch(() => {
    /* offline — the local copy is already saved */
  });
}

/** Lazily fetch a history entry's weather grids (saved above) — called by
 *  the view page itself, not the "View" button, so opening the new tab
 *  stays a synchronous user gesture (popup blockers only allow
 *  `window.open` called directly from a click handler, not after an
 *  `await`). */
export async function fetchHistoryWeatherGrids(
  entryId: string,
): Promise<Record<WeatherFactorId, FrozenWeatherGrid> | null> {
  try {
    const raw = window.localStorage.getItem(historyGridLocalKey(entryId));
    if (raw) return JSON.parse(raw) as Record<WeatherFactorId, FrozenWeatherGrid>;
  } catch {
    /* fall through to the backend */
  }
  try {
    const res = await settingsApi.get(historyGridSettingKey(entryId));
    if (!res?.valueJson) return null;
    return JSON.parse(res.valueJson) as Record<WeatherFactorId, FrozenWeatherGrid>;
  } catch {
    return null;
  }
}

/** Save a snapshot — `localStorage` immediately (for instant same-device
 *  reopen) and the backend (so the link resolves from any device/user). */
export function saveRouteSnapshot(snapshot: RouteSnapshot): void {
  try {
    window.localStorage.setItem(localKey(snapshot.id), JSON.stringify(snapshot));
  } catch {
    /* storage unavailable — ignore, the backend copy still saves below */
  }
  settingsApi.put(settingKey(snapshot.id), snapshot).catch(() => {
    /* offline — the local copy is already saved; same-device opens still work */
  });
}

/** Resolve a snapshot by id — `localStorage` first, then the backend
 *  (needed for links opened on a different device/by a different user). */
export async function fetchRouteSnapshot(id: string): Promise<RouteSnapshot | null> {
  try {
    const raw = window.localStorage.getItem(localKey(id));
    if (raw) return JSON.parse(raw) as RouteSnapshot;
  } catch {
    /* fall through to the backend */
  }
  try {
    const res = await settingsApi.get(settingKey(id));
    if (!res?.valueJson) return null;
    const parsed = JSON.parse(res.valueJson) as RouteSnapshot;
    try {
      window.localStorage.setItem(localKey(id), JSON.stringify(parsed));
    } catch {
      /* ignore */
    }
    return parsed;
  } catch {
    return null;
  }
}
