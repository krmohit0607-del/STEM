import { useEffect, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getVoyageById, type Voyage } from './voyages';

/**
 * Cross-page "selected voyage" plumbing.
 *
 * Selection is carried two ways so it survives every navigation path:
 *   - URL query param `?voyage=<id>` — used when a vessel is opened from
 *     the Fleet List View, so the link is shareable / deep-linkable.
 *   - a small reactive store mirrored into `localStorage` (`fv.selectedVoyage`)
 *     — the fallback used when the user moves between pages via the left
 *     sidebar (Interim Dashboard, Route Explorer, etc.) where no query param
 *     is present.
 *
 * A page calls `useSelectedVoyage()` to resolve the active `Voyage`. When
 * the URL carries a `?voyage=` it is mirrored into the store so the next
 * param-less page keeps showing the same vessel. Because the store is
 * reactive, clearing or changing the selection live-updates every mounted
 * consumer within the session (e.g. when switching modules).
 */

const STORAGE_KEY = 'fv.selectedVoyage';

let current: string | undefined = read();
const listeners = new Set<() => void>();

function read(): string | undefined {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function readSelectedVoyageId(): string | undefined {
  return current;
}

export function getSelectedVoyageId(): string | undefined {
  return current;
}

export function writeSelectedVoyageId(id: string): void {
  if (current === id) return;
  current = id;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  listeners.forEach((listener) => listener());
}

/** Clear the active selection so detail pages fall back to their blank state. */
export function clearSelectedVoyageId(): void {
  if (current === undefined) return;
  current = undefined;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Resolve the active voyage id from the URL (preferred) or the reactive
 * store. Mirrors any URL selection into the store as a side effect.
 */
export function useSelectedVoyageId(): string | undefined {
  const [params] = useSearchParams();
  const fromUrl = params.get('voyage') ?? undefined;
  const fromStore = useSyncExternalStore(subscribe, getSelectedVoyageId, getSelectedVoyageId);

  useEffect(() => {
    if (fromUrl) writeSelectedVoyageId(fromUrl);
  }, [fromUrl]);

  return fromUrl ?? fromStore;
}

/** Resolve the active `Voyage` object (undefined when nothing matches). */
export function useSelectedVoyage(): Voyage | undefined {
  const id = useSelectedVoyageId();
  return getVoyageById(id);
}
