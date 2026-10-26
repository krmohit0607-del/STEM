/**
 * AIS-reported-position storage — a voyage-scoped list of actual vessel
 * positions (lat/lon/timestamp) that, once a real AIS feed/API is wired in,
 * will be pushed here automatically. Rendered on the map/Route Simulator as
 * a separate "AIS Reported Route" so the actual track sailed can be compared
 * against the planned/reported route. Each position can be removed
 * individually (e.g. to drop a bad fix), without affecting the planned
 * route.
 *
 * Persisted via the generic Settings API (same mechanism as
 * `savedRoutesStore.ts`), so it survives a browser data wipe and follows the
 * user across devices/browsers once the backend is reachable.
 */

import { useSyncExternalStore } from 'react';
import { settingsApi } from '../api/settingsApi';

const AIS_POSITIONS_KEY = 'fv.aisPositions';
export const AIS_POSITIONS_SETTING = 'routes.aisPositions';

export interface AisPosition {
  id: string;
  voyageId?: string;
  lat: number;
  lon: number;
  /** ISO date-time the position was reported/recorded. */
  timestampIso: string;
  /** Where this position came from — 'ais-feed' once the real feed exists,
   *  'manual' for anything entered/imported by a user in the meantime. */
  source?: string;
}

let listeners: Set<() => void> = new Set();
let version = 0;
function emit(): void {
  version += 1;
  listeners.forEach((l) => l());
}

export function readAisPositionsRaw(): AisPosition[] {
  try {
    const raw = window.localStorage.getItem(AIS_POSITIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
function pushAisPositions(positions: AisPosition[]): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    settingsApi.put(AIS_POSITIONS_SETTING, positions).catch(() => {
      /* offline — the local copy is already saved */
    });
  }, 800);
}

function writeAisPositionsRaw(positions: AisPosition[]): void {
  try {
    window.localStorage.setItem(AIS_POSITIONS_KEY, JSON.stringify(positions));
  } catch {
    /* storage unavailable — ignore */
  }
  pushAisPositions(positions);
  emit();
}

/** Positions relevant to one voyage, sorted oldest → newest (the order a
 *  track line should be drawn in). */
export function readAisPositionsForVoyage(voyageId: string | undefined): AisPosition[] {
  const all = readAisPositionsRaw();
  const filtered = voyageId ? all.filter((p) => p.voyageId === voyageId) : all;
  return [...filtered].sort(
    (a, b) => new Date(a.timestampIso).getTime() - new Date(b.timestampIso).getTime(),
  );
}

/** Append new AIS positions — the entry point the future live feed/API will
 *  call as new fixes come in. */
export function addAisPositions(positions: AisPosition[]): void {
  if (positions.length === 0) return;
  writeAisPositionsRaw([...readAisPositionsRaw(), ...positions]);
}

/** Remove a single reported position (e.g. a bad/erroneous fix). */
export function deleteAisPosition(id: string): void {
  writeAisPositionsRaw(readAisPositionsRaw().filter((p) => p.id !== id));
}

/** Remove every stored position for a voyage. */
export function clearAisPositionsForVoyage(voyageId: string | undefined): void {
  const all = readAisPositionsRaw();
  writeAisPositionsRaw(voyageId ? all.filter((p) => p.voyageId !== voyageId) : []);
}

export function useAisPositionsVersion(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
}

/** Pull the backend copy of AIS positions down into `localStorage` — call
 *  once per session. Returns `true` when local data changed. */
export async function hydrateAisPositionsFromBackend(): Promise<boolean> {
  try {
    const res = await settingsApi.get(AIS_POSITIONS_SETTING);
    if (!res?.valueJson) return false;
    const parsed = JSON.parse(res.valueJson);
    if (!Array.isArray(parsed)) return false;
    const localRaw = window.localStorage.getItem(AIS_POSITIONS_KEY);
    const nextRaw = JSON.stringify(parsed);
    if (localRaw === nextRaw) return false;
    window.localStorage.setItem(AIS_POSITIONS_KEY, nextRaw);
    emit();
    return true;
  } catch {
    return false;
  }
}
