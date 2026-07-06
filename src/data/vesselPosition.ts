import { useSyncExternalStore } from 'react';

/**
 * Shared "last reported vessel position", derived from the last row of the
 * tracksheet (its lat/lng). The tracksheet (bottom panel) publishes it here
 * and the route editor map subscribes to draw a vessel icon at that spot.
 */

export interface VesselPosition {
  lat: number;
  lon: number;
  label?: string;
}

let current: VesselPosition | null = null;
const listeners = new Set<() => void>();

function sameAsCurrent(pos: VesselPosition | null): boolean {
  if (pos === current) return true;
  if (!pos || !current) return false;
  return pos.lat === current.lat && pos.lon === current.lon && pos.label === current.label;
}

export function setVesselPosition(pos: VesselPosition | null): void {
  if (sameAsCurrent(pos)) return;
  current = pos;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useVesselPosition(): VesselPosition | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}
