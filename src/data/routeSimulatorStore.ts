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

/** The route currently drawn on the map, for the simulator to play back. */
export function useActiveSimRoute(): ActiveSimRoute | null {
  return useSyncExternalStore(subscribe, () => activeRoute);
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
