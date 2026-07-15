import { useSyncExternalStore } from 'react';

/**
 * Cross-component bridge between the Route Explorer map and the Route
 * Simulator panel (which lives in the global bottom drawer).
 *
 *   - The Route Explorer page publishes the route currently drawn on the
 *     map (`activeRoute`) so the simulator can play it back.
 *   - The simulator publishes the saved routes the user is comparing
 *     (`mapCompareRoutes`) so the map can overlay them, just like before
 *     the simulator moved into the drawer.
 *
 * A tiny `useSyncExternalStore`-based store keeps both in sync within the
 * tab without threading props through unrelated layout components.
 */

export interface SimRouteGeometry {
  id: string;
  color: string;
  path: Array<[number, number]>;
}

export interface ActiveSimRoute extends SimRouteGeometry {
  label: string;
  distanceNm: number;
  /**
   * Cumulative voyage time (hours from ETD) to each vertex of `path`, derived
   * from the per-waypoint planned speeds. Same length as `path`. When present,
   * the simulator advances the vessel by time (so each leg is sailed at its own
   * speed) instead of at a single constant service speed.
   */
  timeHours?: number[];
  /** ISO departure time (ETD) the simulation timeline should start from. */
  etdIso?: string;
}

/** A vessel marker at its current simulated position along a route. */
export interface SimShipMarker {
  id: string;
  color: string;
  pos: [number, number];
  label: string;
  sublabel?: string;
  active?: boolean;
  heading?: number;
}

/** A route waypoint vertex to draw on the map, coloured by its route. */
export interface SimWaypointDot {
  pos: [number, number];
  color: string;
}

let activeRoute: ActiveSimRoute | null = null;
let mapCompareRoutes: SimRouteGeometry[] = [];
let mapShipMarkers: SimShipMarker[] = [];
let mapPlannedColor = '#58a6ff';
let mapRouteWaypoints: SimWaypointDot[] = [];
// The pre-edit original route, published while a route edit is in progress so
// the simulator table can show it as a separate row for comparison.
let editCompareRoute: ActiveSimRoute | null = null;
// Forecast hour (hours ahead of now) the map weather layers should show while a
// simulation is playing; null hands control back to the manual weather slider.
let simWeatherHour: number | null = null;

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

/** Publish (or clear) the route currently drawn on the Route Explorer map. */
export function setActiveSimRoute(route: ActiveSimRoute | null): void {
  activeRoute = route;
  emit();
}

/** Publish (or clear) the pre-edit original route shown as a comparison row. */
export function setEditCompareRoute(route: ActiveSimRoute | null): void {
  editCompareRoute = route;
  emit();
}

/** Publish the saved routes being compared so the map can overlay them. */
export function setMapCompareRoutes(routes: SimRouteGeometry[]): void {
  mapCompareRoutes = routes;
  emit();
}

/** Publish the vessels' current simulated positions for the map to render. */
export function setMapShipMarkers(markers: SimShipMarker[]): void {
  mapShipMarkers = markers;
  emit();
}

/** Publish the colour the planned route should use on the map. */
export function setMapPlannedColor(color: string): void {
  mapPlannedColor = color;
  emit();
}

/** Publish the route waypoint vertices to show on the map. */
export function setMapRouteWaypoints(waypoints: SimWaypointDot[]): void {
  mapRouteWaypoints = waypoints;
  emit();
}

/**
 * Publish the forecast hour the map weather layers should display while the
 * simulation plays (hours ahead of now), or `null` to release control back to
 * the manual weather time slider.
 */
export function setSimWeatherHour(hour: number | null): void {
  simWeatherHour = hour;
  emit();
}

// --- Route edit-mode bridge --------------------------------------------------
// The "Duplicate & Edit" control lives in the Route Simulator panel, but the
// editable route is owned by the Route Explorer map. The panel issues commands;
// the map reports whether an edit is in progress so the panel can swap the
// button for Activate / Discard.
type RouteEditAction = 'start' | 'activate' | 'discard';
let routeEditActive = false;
let routeEditCommand: { action: RouteEditAction; nonce: number } | null = null;

/** The map reports whether a route edit is currently in progress. */
export function setRouteEditActive(active: boolean): void {
  if (routeEditActive === active) return;
  routeEditActive = active;
  emit();
}

/** The panel requests the map to start, activate or discard a route edit. */
export function requestRouteEdit(action: RouteEditAction): void {
  routeEditCommand = { action, nonce: (routeEditCommand?.nonce ?? 0) + 1 };
  emit();
}

/** The route currently drawn on the map, for the simulator to play back. */
export function useActiveSimRoute(): ActiveSimRoute | null {
  return useSyncExternalStore(subscribe, () => activeRoute);
}

/** The pre-edit original route shown as a comparison row while editing. */
export function useEditCompareRoute(): ActiveSimRoute | null {
  return useSyncExternalStore(subscribe, () => editCompareRoute);
}

/** The compared routes the map should overlay. */
export function useMapCompareRoutes(): SimRouteGeometry[] {
  return useSyncExternalStore(subscribe, () => mapCompareRoutes);
}

/** The vessels' current simulated positions to render on the map. */
export function useMapShipMarkers(): SimShipMarker[] {
  return useSyncExternalStore(subscribe, () => mapShipMarkers);
}

/** The colour the planned route should use on the map. */
export function useMapPlannedColor(): string {
  return useSyncExternalStore(subscribe, () => mapPlannedColor);
}

/** The route waypoint vertices to render on the map. */
export function useMapRouteWaypoints(): SimWaypointDot[] {
  return useSyncExternalStore(subscribe, () => mapRouteWaypoints);
}

/** Forecast hour driven by the simulation, or null when it is idle. */
export function useSimWeatherHour(): number | null {
  return useSyncExternalStore(subscribe, () => simWeatherHour);
}

/** Whether the Route Explorer map currently has a route edit in progress. */
export function useRouteEditActive(): boolean {
  return useSyncExternalStore(subscribe, () => routeEditActive);
}

/** The latest route-edit command from the panel (null until one is issued). */
export function useRouteEditCommand(): { action: RouteEditAction; nonce: number } | null {
  return useSyncExternalStore(subscribe, () => routeEditCommand);
}
