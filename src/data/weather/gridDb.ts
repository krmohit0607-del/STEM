/**
 * IndexedDB-backed persistence for fetched weather grids, so reopening the
 * app (or just reloading the page) doesn't re-fetch the same
 * viewport/hour/factor combos that were already pulled down this session —
 * sitting in front of the in-memory `cache` in `liveGrid.ts`, not replacing
 * it (that Map stays the synchronous hot path; this is the cold-start
 * fallback). Past/historical grids (`hour < 0`, served by the backend tile
 * cache) never go stale and are kept indefinitely; live/forecast grids
 * (`hour >= 0`) are tagged with a TTL since the upstream forecast model
 * itself updates periodically — an expired entry is treated as a miss and
 * silently overwritten by the next fresh fetch.
 */

import type { WeatherGrid } from './types';

const DB_NAME = 'fv-weather-grid-cache';
const STORE = 'grids';
const DB_VERSION = 1;

/** Live/forecast grids are considered fresh for this long before being
 *  treated as a cache miss (and re-fetched/overwritten). */
const LIVE_TTL_MS = 45 * 60_000;

interface StoredGrid {
  grid: WeatherGrid;
  storedAt: number;
  historical: boolean;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null); // IndexedDB unavailable/blocked — caller falls back to a network fetch
  });
}

function getDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

/** Read a previously-stored grid, or `undefined` if missing/expired/unavailable. */
export async function readGrid(key: string): Promise<WeatherGrid | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  try {
    const stored = await new Promise<StoredGrid | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as StoredGrid | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!stored) return undefined;
    if (!stored.historical && Date.now() - stored.storedAt > LIVE_TTL_MS) return undefined;
    return stored.grid;
  } catch {
    return undefined;
  }
}

/** Persist a fetched grid for future sessions. Best-effort — failures (quota,
 *  blocked, unsupported) are swallowed since the in-memory cache already
 *  serves the current session regardless. */
export async function writeGrid(key: string, grid: WeatherGrid, historical: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    const stored: StoredGrid = { grid, storedAt: Date.now(), historical };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(stored, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

/** One-time sweep (call once at startup) that drops expired live/forecast
 *  entries so the store doesn't grow forever with stale forecasts; historical
 *  entries are left untouched since they never expire. */
export async function pruneExpiredGrids(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const stored = cursor.value as StoredGrid;
        if (!stored.historical && Date.now() - stored.storedAt > LIVE_TTL_MS) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}
