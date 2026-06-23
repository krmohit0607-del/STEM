import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getVoyageById, type Voyage } from './voyages';

/**
 * Cross-page "selected voyage" plumbing.
 *
 * Selection is carried two ways so it survives every navigation path:
 *   - URL query param `?voyage=<id>` — used when a vessel is opened from
 *     the Fleet List View, so the link is shareable / deep-linkable.
 *   - `localStorage` (`fv.selectedVoyage`) — the fallback used when the
 *     user moves between pages via the left sidebar (Interim Dashboard,
 *     Route Explorer, etc.) where no query param is present.
 *
 * A page calls `useSelectedVoyage()` to resolve the active `Voyage`. When
 * the URL carries a `?voyage=` it is mirrored into localStorage so the
 * next param-less page keeps showing the same vessel.
 */

const STORAGE_KEY = 'fv.selectedVoyage';

export function readSelectedVoyageId(): string | undefined {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeSelectedVoyageId(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

/**
 * Resolve the active voyage id from the URL (preferred) or localStorage.
 * Mirrors any URL selection into localStorage as a side effect.
 */
export function useSelectedVoyageId(): string | undefined {
  const [params] = useSearchParams();
  const fromUrl = params.get('voyage') ?? undefined;

  useEffect(() => {
    if (fromUrl) writeSelectedVoyageId(fromUrl);
  }, [fromUrl]);

  return fromUrl ?? readSelectedVoyageId();
}

/** Resolve the active `Voyage` object (undefined when nothing matches). */
export function useSelectedVoyage(): Voyage | undefined {
  const id = useSelectedVoyageId();
  return getVoyageById(id);
}
