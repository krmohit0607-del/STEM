/**
 * Cross-component "selected for Comparison" set. Combines two independently
 * maintained slots so a single "Comparison" link can mix a route currently
 * checked in the Route Simulator's own list with one explicitly picked in
 * the "All Routes" history tab:
 *
 *   - `publishSimulatorSelection` — called declaratively (from a `useEffect`
 *     keyed on the Route Simulator's already-checked rows) every time that
 *     checked set changes, so it can never drift out of sync with what's
 *     actually ticked there.
 *   - `setHistoryCandidate` — toggled explicitly from new checkboxes added
 *     to the "All Routes" tab (history entries have no pre-existing
 *     checked/visible state to piggyback on, so these default to
 *     unchecked).
 *
 * The "Comparison" button (next to the "All Routes" tab) reads the combined
 * set to decide whether to show itself and what to build the shareable,
 * locked-weather snapshot link from.
 */

import { useSyncExternalStore } from 'react';

export interface ComparisonCandidate {
  /** Unique across both sources (e.g. `sim-<simRouteId>` / `hist-<entryId>`). */
  key: string;
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

let fromSimulator: ComparisonCandidate[] = [];
let fromHistory = new Map<string, ComparisonCandidate>();
let cachedSnapshot: ComparisonCandidate[] = [];
const listeners = new Set<() => void>();

function recompute(): void {
  cachedSnapshot = [...fromSimulator, ...fromHistory.values()];
  listeners.forEach((l) => l());
}

/** Replace the Route Simulator's contribution wholesale — call from a
 *  `useEffect` keyed on its checked rows, not from the checkbox's onChange,
 *  so this can never go stale relative to what's actually ticked there. */
export function publishSimulatorSelection(candidates: ComparisonCandidate[]): void {
  fromSimulator = candidates;
  recompute();
}

/** Toggle one "All Routes" history entry's inclusion. */
export function setHistoryCandidate(candidate: ComparisonCandidate, included: boolean): void {
  if (included) fromHistory.set(candidate.key, candidate);
  else fromHistory.delete(candidate.key);
  recompute();
}

export function isHistoryCandidateSelected(key: string): boolean {
  return fromHistory.has(key);
}

/** Clear everything — call after a Comparison link is created, so the next
 *  selection starts fresh. */
export function clearComparisonSelection(): void {
  fromHistory = new Map();
  recompute();
}

export function getComparisonSelection(): ComparisonCandidate[] {
  return cachedSnapshot;
}

export function useComparisonSelection(): ComparisonCandidate[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => cachedSnapshot,
  );
}
