import { useSyncExternalStore } from 'react';

import type { MarketFactors, OptimizedRoute } from './routeMetrics';

/**
 * Cross-component store for the Optimization feature.
 *
 *   - The map's Optimization popup publishes the generated optimized routes
 *     and the run context here; the Optimization panel (bottom drawer)
 *     renders them.
 *   - "Follow route" writes the chosen optimized route into the saved-routes
 *     store, activates it, and asks the drawer to switch to the Route
 *     Simulator so the route shows on the map for the voyage.
 *   - `requestPanelView` lets the map ask the bottom drawer to open a tab.
 */

export interface OptimizationRun {
  baseRouteName: string;
  scenarioId: string;
  market: MarketFactors;
  etd: string;
  targetEta?: string | null;
}

export type PanelViewRequest = 'tracksheet' | 'simulator' | 'optimization' | null;

let results: OptimizedRoute[] = [];
let run: OptimizationRun | null = null;
let panelRequest: PanelViewRequest = null;
let savedRoutesVersion = 0;

const listeners = new Set<() => void>();
function emit(): void {
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// --- Optimization results ----------------------------------------------------

/** Append newly generated optimized routes (newest first) + run context. */
export function addOptimizationResults(newRoutes: OptimizedRoute[], context: OptimizationRun): void {
  results = [...newRoutes, ...results];
  run = context;
  emit();
}

export function clearOptimizationResults(): void {
  results = [];
  run = null;
  emit();
}

export function removeOptimizationResult(id: string): void {
  results = results.filter((r) => r.id !== id);
  emit();
}

export function useOptimizationResults(): OptimizedRoute[] {
  return useSyncExternalStore(subscribe, () => results);
}

export function useOptimizationRun(): OptimizationRun | null {
  return useSyncExternalStore(subscribe, () => run);
}

// --- Bottom-drawer view request ----------------------------------------------

export function requestPanelView(view: PanelViewRequest): void {
  panelRequest = view;
  emit();
}

export function clearPanelViewRequest(): void {
  panelRequest = null;
}

export function useRequestedPanelView(): PanelViewRequest {
  return useSyncExternalStore(subscribe, () => panelRequest);
}

// --- Saved-routes change signal (so the simulator re-reads localStorage) ------

export function bumpSavedRoutes(): void {
  savedRoutesVersion += 1;
  emit();
}

export function useSavedRoutesVersion(): number {
  return useSyncExternalStore(subscribe, () => savedRoutesVersion);
}

// --- "Follow route" bridge into the Route Simulator --------------------------

const SAVED_ROUTES_KEY = 'fv.savedRoutes';
const ACTIVE_ROUTE_KEY = 'fv.activeRouteId';

interface SavedWaypoint {
  lat: string;
  lon: string;
}
interface SavedRoute {
  id: string;
  name: string;
  savedAt: string;
  waypoints: SavedWaypoint[];
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

/**
 * Save an optimized route as a normal saved route, mark it active, and ask
 * the drawer to open the Route Simulator (which draws the active route on
 * the map for the voyage).
 */
export function followOptimizedRoute(route: OptimizedRoute): void {
  let saved: SavedRoute[] = [];
  try {
    const raw = window.localStorage.getItem(SAVED_ROUTES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) saved = parsed as SavedRoute[];
    }
  } catch {
    /* ignore */
  }

  const id = `opt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const newRoute: SavedRoute = {
    id,
    name: route.name,
    savedAt: new Date().toISOString(),
    waypoints: route.path.map(([lat, lon]) => ({
      lat: decToDM(lat, true),
      lon: decToDM(lon, false),
    })),
  };

  try {
    window.localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify([...saved, newRoute]));
    // The simulator's SimRoute id for a saved route is `saved-<id>`.
    window.localStorage.setItem(ACTIVE_ROUTE_KEY, `saved-${id}`);
  } catch {
    /* ignore */
  }

  bumpSavedRoutes();
  requestPanelView('simulator');
}
