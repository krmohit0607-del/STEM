/**
 * Saved ports store — the ports "in our system".
 *
 * Ports are managed in Settings → Port Details and persisted to
 * localStorage (no backend API). The same store feeds the map's port
 * overlay so saved ports appear when the port icon is toggled on.
 */

import { useSyncExternalStore } from 'react';

export interface SavedPort {
  id: string;
  name: string;
  lat: number;
  lon: number;
  unlocode: string;
  country: string;
}

const STORAGE_KEY = 'fv.savedPorts';

let cache: SavedPort[] | null = null;
const listeners = new Set<() => void>();

function read(): SavedPort[] {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        cache = parsed.filter(isSavedPort);
        return cache;
      }
    }
  } catch {
    /* ignore */
  }
  cache = [];
  return cache;
}

function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache ?? []));
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Current saved ports (sorted by name). */
export function getSavedPorts(): SavedPort[] {
  return read();
}

/** Replace the saved ports, persist, and notify subscribers (e.g. the map). */
export function setSavedPorts(list: SavedPort[]): void {
  cache = [...list].sort((a, b) => a.name.localeCompare(b.name));
  persist();
  listeners.forEach((fn) => fn());
}

export function newSavedPortId(): string {
  return `port-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** React hook: the live list of saved ports (updates when Settings edits them). */
export function useSavedPorts(): SavedPort[] {
  return useSyncExternalStore(subscribe, read, read);
}

function isSavedPort(v: unknown): v is SavedPort {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as SavedPort).name === 'string' &&
    typeof (v as SavedPort).lat === 'number' &&
    typeof (v as SavedPort).lon === 'number'
  );
}
