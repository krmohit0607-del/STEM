import { useSyncExternalStore } from 'react';

export interface RouteReportMarker {
  id: string;
  pos: [number, number];
  reportCode: string;
  reportType: string;
  dateTimeIso?: string;
  dateTimeText?: string;
  speedKts?: number | null;
  distanceNm?: number | null;
  /** True for validated in-between breakup points (e.g. 6-hour rows). */
  isInterpolated?: boolean;
  /** Marker colour used on the map. */
  color?: string;
  /** User-selected speed profile for this report marker. */
  selectedSpeedLabel?: string;
  selectedSpeedKts?: number;
  /** User-selected fuel type from this report position onward. */
  selectedFuelType?: string;
}

let markers: RouteReportMarker[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Replace all report markers shown on the active-route map. */
export function setRouteReportMarkers(next: RouteReportMarker[]): void {
  // Preserve any user-selected criteria (speed/fuel) keyed by marker id.
  const prevById = new Map(markers.map((m) => [m.id, m]));
  markers = next.map((m) => {
    const prev = prevById.get(m.id);
    if (!prev) return m;
    return {
      ...m,
      selectedSpeedLabel: prev.selectedSpeedLabel,
      selectedSpeedKts: prev.selectedSpeedKts,
      selectedFuelType: prev.selectedFuelType,
    };
  });
  emit();
}

/** Update the chosen speed profile for one report marker. */
export function setRouteReportSpeedSelection(
  markerId: string,
  label: string,
  speedKts: number,
): void {
  markers = markers.map((m) =>
    m.id === markerId ? { ...m, selectedSpeedLabel: label, selectedSpeedKts: speedKts } : m,
  );
  emit();
}

/** Update the chosen fuel type for one report marker. */
export function setRouteReportFuelSelection(markerId: string, fuelType: string): void {
  markers = markers.map((m) =>
    m.id === markerId ? { ...m, selectedFuelType: fuelType } : m,
  );
  emit();
}

/** Report markers published from Tracksheet and rendered on the map. */
export function useRouteReportMarkers(): RouteReportMarker[] {
  return useSyncExternalStore(subscribe, () => markers, () => markers);
}
