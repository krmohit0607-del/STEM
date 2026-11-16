import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { loadVoyageShared, mergeVoyageShared, subscribeVoyageShared } from '../data/voyageOverrides';
import {
  readSavedRoutesRaw,
  writeSavedRoutesRaw,
  hydrateSavedRoutesFromBackend,
  readSavedRoutesForVoyage,
  tagRouteWithVoyage,
  readActiveRouteId,
  writeActiveRouteId,
  readRouteEditorRouteId,
  writeRouteEditorRouteId,
} from '../data/savedRoutesStore';
import { PORT_COORDS } from '../data/fleet';
import { appendRouteHistory, type RouteHistoryEntry } from '../data/routeHistoryStore';
import { normalizeLongitude } from '../data/antimeridian';
import { useWorldPorts, resolveWorldPort, type WorldPort } from '../data/ports';
import { type OptimizedRoute, describeMandatoryHazards } from '../data/routeOptimizer';
import { ROUTE_VARIANTS, type RouteVariantMeta } from '../data/routeVariants';
import {
  setActiveSimRoute,
  setRouteEditActive,
  useMapCompareRoutes,
  useMapShipMarkers,
  useMapPlannedColor,
  useMapRouteWaypoints,
  useRouteEditCommand,
  requestMapFit,
  requestMapCenterOnVessel,
  setRoutesToolbarSlot,
} from '../data/routeSimulatorStore';
import { RouteEditorMap, type EditorPoint, legPositions, reportsForLeg, buildLegPath } from './RouteEditorMap';
import { MapWeatherLegendBar } from './MapWeatherLegendControl';
import { bumpSavedRoutes } from '../data/optimizationStore';
import { OptimizationRunDialog } from './OptimizationRunDialog';
import { PortInput } from './PortInput';
import { useVesselPosition } from '../data/vesselPosition';
import { parseRouteText } from '../data/routeImport';
import { useUndoableState } from '../hooks/useUndoableState';
import {
  setRouteReportFuelSelection,
  setRouteReportSpeedSelection,
  useRouteReportMarkers,
} from '../data/routeReportMarkers';

/**
 * Route Explorer page — `/route-explorer`.
 *
 * Layout:
 *   - Top: full voyage distance, ETD, ETA, expected route summary.
 *   - Waypoint list with lat/lon, course, speed, distance from last
 *     waypoint, drift toggle, and multi-select tools (delete, set
 *     speed, edit ports / ETD).
 *
 * The route simulator (multi-route comparison + playback) lives on
 * its own page at `/route-simulator`.
 *
 * Geometry, real weather, and persistence are not wired — replace
 * the stub data with API responses when the route-explorer endpoints
 * are exposed.
 */

/**
 * Monotonically-increasing counter appended to a `Date.now()`-based id so two
 * created within the same millisecond — a rapid double-click, two routes
 * saved back-to-back, programmatic/automated test clicks, etc. — never
 * collide. This was a real, observed bug: a duplicate id silently produces
 * duplicate rows wherever that id is later used as a React list key or a
 * lookup key — e.g. two "same route" lines overlapping in the weather chart,
 * or a voyage/route appearing twice in a list.
 */
let uniqueIdCounter = 0;
function uniqueId(prefix: string): string {
  uniqueIdCounter += 1;
  return `${prefix}-${Date.now()}-${uniqueIdCounter}`;
}

interface Waypoint {
  id: string;
  name: string;
  lat: string;
  lon: string;
  /** True course at this waypoint (deg). */
  course: number;
  /** Planned SOG departing this waypoint (kt). */
  speed: number;
  /**
   * True once this waypoint's `speed` has been explicitly set — either by
   * hand (waypoint-details form / bulk "Set speed" popup) or by a vessel
   * report's speed/fuel change propagated forward from the map. Waypoints
   * where this is falsy keep dynamically tracking the CP & Leg Details'
   * "Speed & Cons" Default row, so editing that default there updates every
   * waypoint that was never deliberately overridden.
   */
  speedManual?: boolean;
  /** Fuel type in use from this waypoint onward, once set via a vessel
   *  report's fuel selection (propagated forward the same way as speed). */
  fuelType?: string;
  /** Daily consumption (mt/day) associated with the selected speed/cons
   *  profile row, for display only (route-wide cost/fuel totals still use a
   *  single whole-route average — see `computeRouteMetrics`). */
  dailyCons?: number;
  /** Distance from previous waypoint (NM). 0 for the first one. */
  distanceFromPrev: number;
  /** ETA at this waypoint (ISO local string for datetime-local). For the
   *  departure waypoint this is the editable ETD anchor; for every other
   *  waypoint it is computed (distance/speed + any drift wait) and read-only. */
  eta: string;
  /** Drift until / sail toggle. False = sail (default). */
  drift: boolean;
  /** When `drift` is true, the date/time the vessel drifts at this waypoint
   *  until before resuming the voyage (ISO local string for datetime-local). */
  driftUntil?: string;
  /** Whether this waypoint is a port (so it can be edited). */
  isPort: boolean;
  /**
   * How the leg *departing* this waypoint (to the next one) is drawn:
   * `'rhumb'` = constant-bearing straight line, `'greatcircle'` = shortest
   * great-circle arc. Defaults to `'rhumb'` when unset.
   */
  legType?: 'rhumb' | 'greatcircle';
  /**
   * Optional Min/Max RPM and MCR to sail at from this waypoint onward. When
   * set, these take priority over the Limits & Constraints settings for the
   * portion of the route the optimizer re-plans.
   */
  rpmMin?: number;
  rpmMax?: number;
  mcrMin?: number;
  mcrMax?: number;
}

/** Waypoint details fields edited as a local draft (see `waypointDraft` in
 *  `RouteExplorerPage`) until the user explicitly clicks "Save". */
const WAYPOINT_DRAFT_KEYS: (keyof Waypoint)[] = [
  'name',
  'lat',
  'lon',
  'course',
  'speed',
  'eta',
  'drift',
  'driftUntil',
  'legType',
  'rpmMin',
  'rpmMax',
  'mcrMin',
  'mcrMax',
];

interface SpeedProfileOption {
  id: string;
  label: string;
  speedKts: number;
  isDefault?: boolean;
  /** Daily consumption (mt/day) for this profile row, when known from the
   *  CP & Leg Details' "Speed & Cons" table — display-only, for waypoints
   *  this option gets applied to (see `applyReportCriteriaForward`). */
  dailyCons?: number;
  /** Fuel type for this profile row (its own `Fuel Type` column) — applied
   *  automatically alongside the speed/cons when this option is chosen in
   *  the report-marker popup, so fuel type never needs a separate pick. */
  fuelType?: string;
}

const REPORT_FUEL_OPTIONS = ['VLSFO', 'LSMGO', 'HSFO', 'MDO', 'MGO', 'LNG', 'Methanol'];

const REPORT_LOCK_MAX_DIST_NM = 250;

const STUB_WAYPOINTS: Waypoint[] = [
  {
    id: 'wp-1',
    name: 'Singapore (Departure)',
    lat: '01° 16.0\' N',
    lon: '103° 50.0\' E',
    course: 95,
    speed: 12.0,
    distanceFromPrev: 0,
    eta: '2026-06-12T13:30',
    drift: false,
    isPort: true,
  },
  {
    id: 'wp-2',
    name: 'Horsburgh Lt.',
    lat: '01° 19.6\' N',
    lon: '104° 24.5\' E',
    course: 95,
    speed: 12.0,
    distanceFromPrev: 35,
    eta: '2026-06-12T16:30',
    drift: false,
    isPort: false,
  },
  {
    id: 'wp-3',
    name: 'South China Sea WP',
    lat: '04° 05.0\' N',
    lon: '108° 30.0\' E',
    course: 50,
    speed: 12.0,
    distanceFromPrev: 320,
    eta: '2026-06-13T20:30',
    drift: false,
    isPort: false,
  },
  {
    id: 'wp-4',
    name: 'Spratly Bypass',
    lat: '09° 30.0\' N',
    lon: '113° 10.0\' E',
    course: 35,
    speed: 12.0,
    distanceFromPrev: 410,
    eta: '2026-06-15T09:00',
    drift: false,
    isPort: false,
  },
  {
    id: 'wp-5',
    name: 'Luzon Strait',
    lat: '20° 30.0\' N',
    lon: '120° 50.0\' E',
    course: 350,
    speed: 12.0,
    distanceFromPrev: 720,
    eta: '2026-06-17T20:00',
    drift: false,
    isPort: false,
  },
  {
    id: 'wp-6',
    name: 'Drift point (typhoon)',
    lat: '24° 15.0\' N',
    lon: '122° 10.0\' E',
    course: 0,
    speed: 0,
    distanceFromPrev: 240,
    eta: '2026-06-18T15:00',
    drift: true,
    isPort: false,
  },
  {
    id: 'wp-7',
    name: 'Cape of Good Hope WP',
    lat: '34° 21.0\' S',
    lon: '018° 28.0\' E',
    course: 305,
    speed: 12.5,
    distanceFromPrev: 7_400,
    eta: '2026-07-09T08:00',
    drift: false,
    isPort: false,
  },
  {
    id: 'wp-8',
    name: 'Rotterdam (Arrival)',
    lat: '51° 57.0\' N',
    lon: '004° 00.0\' E',
    course: 0,
    speed: 0,
    distanceFromPrev: 5_980,
    eta: '2026-07-23T13:42',
    drift: false,
    isPort: true,
  },
];

/** Decimal degrees → `01° 16.0' N` style string. */
function decToDM(value: number, isLat: boolean): string {
  const hemi = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  const pad = isLat ? 2 : 3;
  return `${String(deg).padStart(pad, '0')}° ${min.toFixed(1)}' ${hemi}`;
}

function canonicalLongitudeLabel(value: string): string {
  const decimal = dmToDec(value);
  return Number.isFinite(decimal) ? decToDM(normalizeLongitude(decimal), false) : value;
}

/** Parse a `01° 16.0' N` / `103 50.0 E` style string back to decimal. */
function dmToDec(raw: string): number {
  if (!raw) return NaN;
  const hemiMatch = raw.match(/[NSEW]/i);
  const hemi = hemiMatch ? hemiMatch[0].toUpperCase() : '';
  const nums = raw.match(/[\d.]+/g)?.map(Number) ?? [];
  if (nums.length === 0) return NaN;
  const deg = nums[0] ?? 0;
  const min = nums[1] ?? 0;
  const sec = nums[2] ?? 0;
  let dec = deg + min / 60 + sec / 3600;
  if (hemi === 'S' || hemi === 'W') dec = -dec;
  return dec;
}

/** Great-circle distance in nautical miles. */
function haversineNM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3440.065; // Earth radius in NM
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial true course from point 1 to point 2 (deg). */
function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return Math.round((((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360);
}

/** Perpendicular (cross-track) distance of a point from the great-circle
 *  path between two other points, in NM — used to detect near-collinear
 *  (i.e. redundant) points when simplifying an uploaded track. */
function crossTrackDistanceNM(
  lat: number,
  lon: number,
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
): number {
  const legLength = haversineNM(startLat, startLon, endLat, endLon);
  if (legLength < 1e-6) return haversineNM(lat, lon, startLat, startLon);
  const toRad = (d: number) => (d * Math.PI) / 180;
  const bearingRad = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    const x =
      Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
    return Math.atan2(y, x);
  };
  const R = 3440.065; // Earth radius in NM
  const d13 = haversineNM(startLat, startLon, lat, lon) / R;
  const θ13 = bearingRad(startLat, startLon, lat, lon);
  const θ12 = bearingRad(startLat, startLon, endLat, endLon);
  return Math.abs(Math.asin(Math.sin(d13) * Math.sin(θ13 - θ12)) * R);
}

/** Recursive Douglas-Peucker simplification over great-circle cross-track
 *  distance, in NM. Keeps the endpoints always; drops any interior point
 *  that lies within `toleranceNm` of the straight line between its
 *  neighbours (e.g. GPS/AIS jitter in an uploaded track). */
function douglasPeucker(
  points: Array<[number, number]>,
  toleranceNm: number,
): Array<[number, number]> {
  if (points.length < 3) return points;
  const [startLat, startLon] = points[0];
  const [endLat, endLon] = points[points.length - 1];
  let maxDist = 0;
  let maxIndex = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const [lat, lon] = points[i];
    const dist = crossTrackDistanceNM(lat, lon, startLat, startLon, endLat, endLon);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }
  if (maxDist > toleranceNm) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), toleranceNm);
    const right = douglasPeucker(points.slice(maxIndex), toleranceNm);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}

/**
 * Clean up a raw list of uploaded points before turning them into waypoints:
 * an uploaded file is often a dense GPS/AIS track (a position logged every
 * few seconds/minutes) rather than a short list of intended route waypoints,
 * which otherwise renders as a jagged line with many waypoints stacked on
 * (or right next to) each other. This first merges consecutive points that
 * are effectively the same position, then simplifies the remaining track
 * with Douglas-Peucker so only the points that actually define the route's
 * shape (course changes) are kept — the straight stretches in between no
 * longer need every noisy intermediate ping.
 */
function dedupeAndSimplifyTrackPoints(points: Array<[number, number]>): Array<[number, number]> {
  if (points.length < 3) return points;
  const DEDUPE_NM = 0.05; // ~90 m — collapses effectively-identical pings.
  const deduped: Array<[number, number]> = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const [lat, lon] = points[i];
    const [prevLat, prevLon] = deduped[deduped.length - 1];
    if (haversineNM(prevLat, prevLon, lat, lon) > DEDUPE_NM) deduped.push([lat, lon]);
  }
  if (deduped.length < 3) return deduped;
  // Simplify with a growing tolerance until the route is a sane size for a
  // waypoint list, in case the file is an especially dense track.
  const MAX_WAYPOINTS = 200;
  let tolerance = 0.3; // NM — flattens GPS/AIS noise, keeps real turns.
  let simplified = douglasPeucker(deduped, tolerance);
  while (simplified.length > MAX_WAYPOINTS && tolerance < 20) {
    tolerance *= 2;
    simplified = douglasPeucker(deduped, tolerance);
  }
  return simplified;
}

/** Rhumb-line (constant-bearing) distance between two points, in NM. */
function rhumbDistanceNM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3440.065; // Earth radius in NM
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const dφ = φ2 - φ1;
  let dλ = toRad(lon2 - lon1);
  if (Math.abs(dλ) > Math.PI) dλ = dλ > 0 ? dλ - 2 * Math.PI : dλ + 2 * Math.PI;
  const dψ = Math.log(
    Math.tan(Math.PI / 4 + φ2 / 2) / Math.tan(Math.PI / 4 + φ1 / 2),
  );
  const q = Math.abs(dψ) > 1e-12 ? dφ / dψ : Math.cos(φ1);
  return Math.sqrt(dφ * dφ + q * q * dλ * dλ) * R;
}

/**
 * Pick the better sailing mode for the leg between two points.
 *
 * A great circle is the shortest track over the globe but curves on the chart
 * and needs continuous course changes, so it is only worthwhile on longer legs
 * where the saving over a rhumb line is meaningful (typically high-latitude,
 * east-west ocean passages). On short legs, or near the equator / on
 * north-south legs, the two are practically identical, so the simpler
 * constant-bearing rhumb line is preferred.
 */
function chooseLegType(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): 'rhumb' | 'greatcircle' {
  const gc = haversineNM(lat1, lon1, lat2, lon2);
  const rl = rhumbDistanceNM(lat1, lon1, lat2, lon2);
  // Use a great circle only when it is long enough to matter and saves a
  // non-trivial distance over the rhumb line (>~0.5%, at least 5 NM).
  const saving = rl - gc;
  return gc > 300 && saving > Math.max(5, gc * 0.005) ? 'greatcircle' : 'rhumb';
}

/** A simple 2-waypoint departure→arrival route — the straight-line (then
 *  land-avoided, see `routeOptimizer.worker.ts`) starting point used by both
 *  the manual "Generate route" button and the automatic default-route
 *  generator for a voyage with none yet. */
function buildStraightLineWaypoints(
  from: { lat: number; lon: number; name: string },
  to: { lat: number; lon: number; name: string },
  defaultSpeed = 12,
): Waypoint[] {
  return [
    {
      id: uniqueId('wp'),
      name: `${from.name} (Departure)`,
      lat: decToDM(from.lat, true),
      lon: decToDM(from.lon, false),
      course: 0,
      speed: defaultSpeed,
      distanceFromPrev: 0,
      eta: '',
      drift: false,
      isPort: true,
      legType: chooseLegType(from.lat, from.lon, to.lat, to.lon),
    },
    {
      id: uniqueId('wp'),
      name: `${to.name} (Arrival)`,
      lat: decToDM(to.lat, true),
      lon: decToDM(to.lon, false),
      course: 0,
      speed: defaultSpeed,
      distanceFromPrev: 0,
      eta: '',
      drift: false,
      isPort: true,
    },
  ];
}

/**
 * Build a full waypoint list from plain lat/lon points (e.g. an uploaded
 *  route file) — the first/last are ports, legs choose rhumb/great-circle. */
function waypointsFromPoints(points: Array<[number, number]>, defaultSpeed = 12): Waypoint[] {
  const last = points.length - 1;
  const stamp = Date.now();
  return points.map(([lat, lon], i) => ({
    id: `wp-${stamp}-${i}`,
    name: i === 0 ? 'Departure' : i === last ? 'Arrival' : `WP ${i + 1}`,
    lat: decToDM(lat, true),
    lon: decToDM(lon, false),
    course: 0,
    speed: defaultSpeed,
    distanceFromPrev: 0,
    eta: '',
    drift: false,
    isPort: i === 0 || i === last,
    legType: i === last ? 'rhumb' : chooseLegType(lat, lon, points[i + 1][0], points[i + 1][1]),
  }));
}

interface SavedRoute {
  id: string;
  name: string;
  savedAt: string;
  waypoints: Waypoint[];
  /** The voyage this route was created for (absent on legacy routes saved
   *  before per-voyage scoping — those stay visible to every voyage). */
  voyageId?: string;
}

/** Saved routes relevant to one voyage (its own + any untagged legacy ones). */
function readSavedRoutes(voyageId: string | undefined): SavedRoute[] {
  return readSavedRoutesForVoyage(voyageId) as SavedRoute[];
}

function writeSavedRoutes(routes: SavedRoute[]): void {
  writeSavedRoutesRaw(routes);
}

/** All saved routes across every voyage (used only where voyage-scoping
 *  doesn't apply, e.g. merging without filtering). */
function readAllSavedRoutes(): SavedRoute[] {
  return readSavedRoutesRaw() as SavedRoute[];
}

/** Resolve a port name or a free "lat, lon" string to decimal coords. */
function resolveLocation(
  raw: string,
  worldPorts: WorldPort[],
): { lat: number; lon: number; name: string } | null {
  const text = raw.trim();
  if (!text) return null;
  const wp = resolveWorldPort(text, worldPorts);
  if (wp) return { lat: wp.lat, lon: wp.lon, name: wp.name };
  const portKey = Object.keys(PORT_COORDS).find(
    (k) => k.toLowerCase() === text.toLowerCase(),
  );
  if (portKey) {
    const [lat, lon] = PORT_COORDS[portKey];
    return { lat, lon, name: portKey };
  }
  const nums = text.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length >= 2 && Math.abs(nums[0]) <= 90 && Math.abs(nums[1]) <= 180) {
    return { lat: nums[0], lon: nums[1], name: text };
  }
  return null;
}

/**
 * Some legacy saved routes (from older schema versions / other save paths)
 * may have waypoints missing an `id`, or — after an id collision from two
 * waypoints created in the same millisecond — sharing one. Either case can
 * make waypoint selection match the wrong row or no row, so re-key every
 * waypoint with a guaranteed-unique id on load instead of trusting storage.
 */
function sanitizeWaypointIds(list: Waypoint[]): Waypoint[] {
  const seen = new Set<string>();
  return list.map((wp) => {
    if (wp.id && !seen.has(wp.id)) {
      seen.add(wp.id);
      return wp;
    }
    const id = uniqueId('wp');
    seen.add(id);
    return { ...wp, id };
  });
}

/**
 * Auto-generated intermediate waypoint names look like "WP 5", with the
 * number meant to match the waypoint's 1-based position counting departure
 * as 1 (so row 16 is "WP 16", not "WP 15"). Routes saved under an older,
 * off-by-one version of the generator — or shifted by a later insert/delete
 * — can have this number drift out of sync with the row it's actually in;
 * recompute it from the live position instead of trusting the stored string
 * whenever the name still has this exact auto-generated shape. Any waypoint
 * the user has renamed to something else no longer matches the pattern and
 * is left untouched.
 */
function renumberAutoWaypointNames(list: Waypoint[]): Waypoint[] {
  return list.map((wp, i) => (/^WP \d+$/.test(wp.name) ? { ...wp, name: `WP ${i + 1}` } : wp));
}

/**
 * Load this voyage's own route into the editor: whichever saved route this
 * voyage currently has open/active, resolved from its own per-voyage route
 * ids. Returns an empty list when the voyage has no route of its own yet
 * (the caller's auto-generation effect decides what, if anything, to fill
 * it with) — never the generic demo waypoints, unless there's no real
 * voyage context at all (standalone/demo usage of this page).
 */
/**
 * Resolve the saved route id this voyage's editor is actually showing right
 * now, following the exact same `editorId` → `activeId` fallback as
 * `loadRouteForVoyage` below — so a caller can tell *which* saved route's
 * content the current `waypoints` state came from, not just which ids were
 * separately stored (those two can disagree, e.g. a fresh session where
 * `editorId` was never set for this voyage but `activeId` still resolves
 * the route via the fallback).
 */
function resolveLoadedRouteId(voyageId: string | undefined): string | null {
  if (!voyageId) return null;
  try {
    const editorId = readRouteEditorRouteId(voyageId);
    const activeId = readActiveRouteId(voyageId)?.replace(/^saved-/, '');
    const all = readSavedRoutesForVoyage(voyageId) as SavedRoute[];
    // `editorId` must win whenever it resolves to a real saved entry — it's
    // the copy this edit session is actually attached to. Only fall back to
    // `activeId` when there's no (or no longer any) editor entry. A plain
    // `route.id === editorId || route.id === activeId` find() would instead
    // return whichever of the two happens to appear first in the stored
    // array — since the original is always saved before its "Edit of X"
    // copy, that silently resolved to the *original* every time, making the
    // live editor publish under (and mislabeled as) the original route.
    const found =
      (editorId && all.find((route) => route.id === editorId)) ||
      (activeId && all.find((route) => route.id === activeId)) ||
      null;
    return found?.id ?? null;
  } catch {
    return null;
  }
}

function loadRouteForVoyage(voyageId: string | undefined): Waypoint[] {
  if (!voyageId) return STUB_WAYPOINTS;
  try {
    const editorId = readRouteEditorRouteId(voyageId);
    const activeId = readActiveRouteId(voyageId)?.replace(/^saved-/, '');
    const all = readSavedRoutesForVoyage(voyageId) as SavedRoute[];
    // Same `editorId`-first preference as `resolveLoadedRouteId` above (see
    // its comment) — otherwise the editor can load the *original* route's
    // content back in whenever it happens to be stored before the "Edit of
    // X" copy, undoing whatever the edit session was actually attached to.
    const saved =
      (editorId && all.find((route) => route.id === editorId)) ||
      (activeId && all.find((route) => route.id === activeId)) ||
      undefined;
    // `recomputeGeometry` re-threads every waypoint's distance/course/ETA
    // from waypoint 0 onward — needed here, not just on edits, because a
    // saved route's stored ETAs can go stale relative to each other: the
    // "keep waypoint 0 mirrored to the voyage's shared ETD" sync effect
    // only fires a full recompute when waypoint 0's own `eta` doesn't
    // already match the shared ETD. If waypoint 0 happens to already be
    // correct (e.g. it was set directly, or the route is simply being
    // reloaded as-is) but a *later* waypoint was last computed under a
    // since-changed ETD, that guard never catches it, and the stale ETA
    // (and any drift-wait math derived from it) would otherwise persist
    // indefinitely. Recomputing unconditionally on load is cheap and makes
    // the whole chain self-healing every time a route becomes live.
    if (saved?.waypoints?.length) {
      return recomputeGeometry(renumberAutoWaypointNames(sanitizeWaypointIds(saved.waypoints)));
    }
  } catch {
    // Fall through to an empty route when saved-route storage is unavailable.
  }
  return [];
}

/** Parse a `datetime-local` input value (local time) to epoch ms, or null. */
function parseLocalDateTime(value: string | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Format an epoch (ms) as a `datetime-local` input value (local time). */
function toLocalDateTimeValue(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Recompute `distanceFromPrev` + `course` for every waypoint from coords, and
 * cascade each waypoint's ETA from the departure (waypoint 0) ETD: distance
 * ÷ the departing waypoint's speed, plus a wait until `driftUntil` for any
 * waypoint with `drift` set. Waypoint 0's `eta` is the (editable) ETD anchor
 * and is left as-is; every other waypoint's `eta` is fully derived here.
 * Also renumbers any auto-generated "WP N" name to match the waypoint's
 * current position (see `renumberAutoWaypointNames`), so inserting/deleting
 * a waypoint elsewhere in the route — which shifts everyone after it —
 * keeps every untouched waypoint's own number in sync with its new row.
 */
function recomputeGeometry(list: Waypoint[]): Waypoint[] {
  const out: Waypoint[] = [];
  // Epoch (ms) the vessel actually departs the previous waypoint — carries
  // forward leg transit time plus any drift wait.
  let departEpoch: number | null = null;

  for (let i = 0; i < list.length; i += 1) {
    const wp = list[i];
    const lat = dmToDec(wp.lat);
    const lon = dmToDec(wp.lon);

    if (i === 0) {
      departEpoch = parseLocalDateTime(wp.eta);
      if (wp.drift && wp.driftUntil) {
        const driftEpoch = parseLocalDateTime(wp.driftUntil);
        if (driftEpoch != null && (departEpoch == null || driftEpoch > departEpoch)) {
          departEpoch = driftEpoch;
        }
      }
      out.push({ ...wp, distanceFromPrev: 0 });
      continue;
    }

    const prev = list[i - 1];
    const plat = dmToDec(prev.lat);
    const plon = dmToDec(prev.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon) || Number.isNaN(plat) || Number.isNaN(plon)) {
      // A malformed Lat/Lon (e.g. a stray manual edit that doesn't parse as
      // a DM string) must still leave this waypoint with a *finite*
      // distance — otherwise `NaN` here poisons every later waypoint's
      // cumulative "distance from departure" too, once summed below, and
      // worse, never clears itself even if this one waypoint is later
      // fixed/deleted, since the NaN was already baked into this object.
      out.push({ ...wp, distanceFromPrev: Number.isFinite(wp.distanceFromPrev) ? wp.distanceFromPrev : 0 });
      continue;
    }

    const distanceFromPrev = Math.round(haversineNM(plat, plon, lat, lon));
    const course = bearingDeg(plat, plon, lat, lon);
    const legSpeed = prev.speed > 0 ? prev.speed : SERVICE_SPEED_KN;

    const arrivalEpoch = departEpoch != null ? departEpoch + (distanceFromPrev / legSpeed) * 3600_000 : null;
    const eta = arrivalEpoch != null ? toLocalDateTimeValue(arrivalEpoch) : wp.eta;

    out.push({ ...wp, distanceFromPrev, course, eta });

    let departAt = arrivalEpoch;
    if (wp.drift && wp.driftUntil) {
      const driftEpoch = parseLocalDateTime(wp.driftUntil);
      if (driftEpoch != null && (departAt == null || driftEpoch > departAt)) {
        departAt = driftEpoch;
      }
    }
    departEpoch = departAt;
  }
  return renumberAutoWaypointNames(out);
}

/**
 * The candidate routes are computed off the main thread in a Web Worker (see
 * `routeOptimizer.worker.ts`) so the UI stays responsive. Each profile follows
 * a genuinely different, land-avoiding corridor and is drawn in its own colour.
 */

/** Assumed service speed used to turn distance into a transit time / ETA. */
const SERVICE_SPEED_KN = 12;

/** A computed candidate route: its profile plus the optimizer result. */
type ComputedRoute = RouteVariantMeta & { info: OptimizedRoute };

/** Estimated transit time (in hours) for a distance at service speed. */
function transitHours(distanceNm: number): number {
  return distanceNm / SERVICE_SPEED_KN;
}

/** Format a transit duration as a compact "Xd Yh" string. */
function formatDuration(hours: number): string {
  const d = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

export function RouteExplorerPage() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const selectedVoyage = useSelectedVoyage();
  const voyageId = selectedVoyage?.id;

  const {
    value: waypoints,
    setValue: setWaypoints,
    setValueSilently: setWaypointsSilently,
    commitValue: commitWaypoints,
    resetValue: resetWaypoints,
    undo: undoWaypoints,
    redo: redoWaypoints,
    canUndo: canUndoWaypoints,
    canRedo: canRedoWaypoints,
  } = useUndoableState<Waypoint[]>(() => loadRouteForVoyage(voyageId));
  // Pull any saved routes from the backend database down into local storage
  // once per visit (e.g. routes saved from another device/browser). This
  // refreshes the Route Simulator's saved-routes list; it intentionally does
  // not retroactively swap out whichever route is already loaded/being
  // edited here, so an active editing session is never disrupted.
  useEffect(() => {
    void hydrateSavedRoutesFromBackend().then((changed) => {
      if (changed) bumpSavedRoutes();
    });
  }, []);

  const [selected, setSelected] = useState<string[]>([]);
  const selectedWaypoint =
    selected.length === 1 ? waypoints.find((w) => w.id === selected[0]) : undefined;

  // Waypoint details is a draft editor: edits only touch this local copy, not
  // the committed `waypoints` (and therefore not the map/simulation/shared
  // ETD), until the user explicitly clicks Save — so an accidental keystroke
  // never silently changes the route.
  const [waypointDraft, setWaypointDraft] = useState<Waypoint | null>(null);
  useEffect(() => {
    setWaypointDraft(selectedWaypoint ? { ...selectedWaypoint } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWaypoint?.id]);

  // The Waypoint details editor expands inline, right after whichever
  // waypoint is actually selected — preserving the list's natural order,
  // not relocated to a fixed spot — so selecting a waypoint far down the
  // route (e.g. by clicking its marker on the map) auto-scrolls the list up
  // to bring that row into view, instead of leaving it off-screen somewhere
  // up or down the list.
  const waypointDetailRef = useRef<HTMLTableRowElement | null>(null);
  // The detail row only renders once `waypointDraft` has synced to the new
  // selection (one render later — see the draft-sync effect just above), so
  // `waypointDetailRef` isn't attached yet on the very first commit after a
  // selection change. Re-running once `waypointDraft` itself updates (not
  // just `selected`) catches it on that follow-up render instead of silently
  // no-op'ing against a still-null ref. Guarded by `lastScrolledWaypointIdRef`
  // so later keystroke edits to the draft (which also change its identity)
  // don't keep re-triggering the scroll.
  const lastScrolledWaypointIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedWaypoint || !waypointDraft) {
      lastScrolledWaypointIdRef.current = null;
      return;
    }
    if (lastScrolledWaypointIdRef.current === selectedWaypoint.id) return;
    lastScrolledWaypointIdRef.current = selectedWaypoint.id;
    waypointDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedWaypoint, waypointDraft]);

  // If the committed waypoint's position (or anything `recomputeGeometry`
  // derives from it, like course/distance) changes under the same selection
  // — e.g. dragging its marker on the map, or picking a leg type, which also
  // applies immediately rather than waiting for Save — keep those draft
  // fields in step so Save/Discard don't look spuriously "dirty" afterwards,
  // without touching any other actually-pending edits.
  useEffect(() => {
    if (!selectedWaypoint) return;
    setWaypointDraft((prev) => {
      if (!prev || prev.id !== selectedWaypoint.id) return prev;
      if (
        prev.lat === selectedWaypoint.lat &&
        prev.lon === selectedWaypoint.lon &&
        prev.course === selectedWaypoint.course &&
        prev.distanceFromPrev === selectedWaypoint.distanceFromPrev &&
        prev.legType === selectedWaypoint.legType
      )
        return prev;
      return {
        ...prev,
        lat: selectedWaypoint.lat,
        lon: selectedWaypoint.lon,
        course: selectedWaypoint.course,
        distanceFromPrev: selectedWaypoint.distanceFromPrev,
        legType: selectedWaypoint.legType,
      };
    });
  }, [
    selectedWaypoint?.id,
    selectedWaypoint?.lat,
    selectedWaypoint?.lon,
    selectedWaypoint?.course,
    selectedWaypoint?.distanceFromPrev,
    selectedWaypoint?.legType,
  ]);

  const setDraftField = <K extends keyof Waypoint>(key: K, value: Waypoint[K]) =>
    setWaypointDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const isWaypointDraftDirty =
    !!waypointDraft &&
    !!selectedWaypoint &&
    WAYPOINT_DRAFT_KEYS.some((key) => waypointDraft[key] !== selectedWaypoint[key]);

  /** How long the vessel will drift at this waypoint — from its ETA/ETD
   *  (arrival, before waiting) to "Drift until" (departure, after waiting) —
   *  shown next to the "Drift until" field as it's typed. */
  const driftDurationLabel = (() => {
    if (!waypointDraft?.drift || !waypointDraft.driftUntil) return null;
    const arriveMs = parseLocalDateTime(waypointDraft.eta);
    const untilMs = parseLocalDateTime(waypointDraft.driftUntil);
    if (arriveMs == null || untilMs == null || untilMs <= arriveMs) return null;
    return formatDuration((untilMs - arriveMs) / 3600_000);
  })();

  /** Set once `saveWaypointDraft` has a reason to re-baseline `originalRoute`
   *  to the route as it stands right now — picked up by the effect below
   *  once `waypoints` has actually finished updating (state updates from
   *  `updateWaypoint` inside `saveWaypointDraft` aren't visible synchronously
   *  within the same function call). */
  const pendingOriginalResyncRef = useRef(false);
  useEffect(() => {
    if (!pendingOriginalResyncRef.current) return;
    pendingOriginalResyncRef.current = false;
    setOriginalRoute(waypoints.map((wp) => ({ ...wp })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints]);

  /**
   * Durably persist the route as it stands right now — the actual "Save"
   * action, independent of "Activate": this voyage keeps whatever route it
   * was already showing active/live in the simulator either way; Save only
   * decides whether the *data* behind the one currently open in the editor
   * is written back to storage, so it survives a reload/voyage switch/
   * logout. Updates the saved-route entry this edit came from in place
   * (resolved the same way `loadRouteForVoyage` resolves it) if there is
   * one; otherwise creates a new saved entry and remembers it for next time,
   * so a route built from scratch also becomes savable from here. Takes the
   * waypoints to save explicitly (rather than reading the `waypoints` state
   * directly) since a draft-field commit just queued via `setWaypoints`
   * isn't reflected in that state until the next render.
   */
  const persistRouteToSavedEntry = (waypointsToSave: Waypoint[]) => {
    if (!voyageId || waypointsToSave.length === 0) return;
    const canonicalWaypoints = waypointsToSave.map((wp) => ({ ...wp, lon: canonicalLongitudeLabel(wp.lon) }));
    const editorId = readRouteEditorRouteId(voyageId);
    const activeId = readActiveRouteId(voyageId)?.replace(/^saved-/, '') ?? null;
    const targetId = editorId ?? activeId;
    const all = readAllSavedRoutes();
    const idx = targetId ? all.findIndex((r) => r.id === targetId) : -1;
    if (idx >= 0) {
      const next = [...all];
      next[idx] = { ...next[idx], waypoints: canonicalWaypoints, savedAt: new Date().toISOString() };
      writeSavedRoutes(next);
      bumpSavedRoutes();
      return;
    }
    const saved = appendSavedRoute({
      id: uniqueId('route'),
      name: routeName.trim() || `Route ${savedRoutes.length + 1}`,
      savedAt: new Date().toISOString(),
      waypoints: canonicalWaypoints,
    });
    writeRouteEditorRouteId(voyageId, saved.id);
    bumpSavedRoutes();
  };

  /** Commit every changed field of the waypoint-details draft into the
   *  actual route (map/simulation/shared ETD), then durably persist the
   *  whole route (see `persistRouteToSavedEntry`) — the explicit "Save"
   *  step for everything made during this edit session (waypoint fields,
   *  dragging, insert/delete, bulk speed/RPM/MCR, leg type, ...), not just
   *  the open waypoint-details form. Also re-baselines `originalRoute` to
   *  the route as it now stands, so Save/Discard correctly go back to
   *  disabled once every pending change has been accounted for. Deliberately
   *  separate from "Activate" — saving and activating are two different
   *  decisions; this one never exits edit mode or changes what's active. */
  const saveWaypointDraft = () => {
    let finalWaypoints = waypoints;
    if (waypointDraft && selectedWaypoint) {
      const changedKeys = WAYPOINT_DRAFT_KEYS.filter((key) => waypointDraft[key] !== selectedWaypoint[key]);
      changedKeys.forEach((key) => {
        updateWaypoint(waypointDraft.id, key, waypointDraft[key] as never);
      });
      // A manually-typed speed stops this waypoint from tracking the CP &
      // Leg Details' Default speed/cons row (see `Waypoint.speedManual`).
      if (changedKeys.includes('speed')) {
        updateWaypoint(waypointDraft.id, 'speedManual', true);
      }
      if (changedKeys.length > 0) {
        // Mirror the same patch synchronously — `updateWaypoint`'s own
        // `setWaypoints` calls above are queued, not yet reflected in the
        // `waypoints` read here, so persisting from that would still save
        // the pre-edit values.
        finalWaypoints = recomputeGeometry(
          waypoints.map((wp) => {
            if (wp.id !== waypointDraft.id) return wp;
            const patched = { ...wp };
            changedKeys.forEach((key) => {
              if ((key === 'lat' || key === 'lon') && isWaypointLocked(wp.id)) return;
              (patched as Record<string, unknown>)[key] = waypointDraft[key];
            });
            if (changedKeys.includes('speed')) patched.speedManual = true;
            return patched;
          }),
        );
      }
    }
    persistRouteToSavedEntry(finalWaypoints);
    if (originalRoute) pendingOriginalResyncRef.current = true;
  };

  /**
   * Discard unsaved edits. If the selected waypoint's own form is what's
   * dirty, only that form is reverted (narrow, as before); otherwise — the
   * change was made some other way (dragging, insert/delete, bulk speed,
   * leg type, ...) — revert the *whole* route back to how it was when this
   * edit session started, the same as the dedicated "Discard edit" action.
   */
  const discardWaypointDraft = () => {
    if (isWaypointDraftDirty) {
      setWaypointDraft(selectedWaypoint ? { ...selectedWaypoint } : null);
      return;
    }
    if (hasRouteChangedSinceEdit && originalRoute) {
      suppressManualRouteMarkRef.current = true; // reverting, not a new edit
      resetWaypoints(originalRoute);
      setSelected([]);
    }
  };

  /**
   * Open the selected vessel's live position on MarineTraffic in a new tab.
   * Deep-links to the vessel details page by IMO (the format MarineTraffic
   * supports directly, e.g. .../ais/details/ships/imo:9074729).
   */
  const viewOnMarineTraffic = () => {
    const imo = selectedVoyage?.imo?.trim();
    const url = imo
      ? `https://www.marinetraffic.com/en/ais/details/ships/imo:${encodeURIComponent(imo)}`
      : 'https://www.marinetraffic.com/';
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // --- Map plotting + saved routes ---------------------------------
  const [plotMode, setPlotMode] = useState(false);
  const [routeName, setRouteName] = useState('');
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>(() => readSavedRoutes(voyageId));

  // The map route is locked by default; "Edit" enters edit mode on a duplicate
  // so the original stays visible for comparison until the edit is activated.
  const [editMode, setEditMode] = useState(false);
  const [originalRoute, setOriginalRoute] = useState<Waypoint[] | null>(null);

  /**
   * Whether anything in this duplicate-edit session has changed, beyond just
   * the waypoint-details form (see `isWaypointDraftDirty` below) —
   * dragging a marker, inserting/deleting a waypoint, the "Set speed/RPM/
   * MCR" bulk action, and the "Leg to next" picker all commit straight to
   * `waypoints` instantly (by design — no accidental-keystroke risk there,
   * unlike free-typed fields), so none of them ever touch `waypointDraft`.
   * Without this, Save/Discard stayed disabled after any of those edits
   * whenever no single waypoint's own form happened to be dirty — e.g.
   * right after duplicating a route and dragging a point, with nothing
   * selected — even though the route had genuinely changed. Compared
   * against `originalRoute`, the snapshot taken the moment this edit
   * session started (see `startEditDuplicate`).
   */
  const hasRouteChangedSinceEdit =
    editMode && originalRoute != null && JSON.stringify(waypoints) !== JSON.stringify(originalRoute);

  // --- Auto sea-route generator ------------------------------------
  const [depInput, setDepInput] = useState(selectedVoyage?.portFrom ?? '');
  const [arrInput, setArrInput] = useState(selectedVoyage?.portTo ?? '');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  // Non-blocking advisories about the just-generated route: minimum charted
  // depth requirement and any International Navigating Limits (INL) zone it
  // touches — the route was already built avoiding every hard-blocked zone,
  // this just reports what was checked (and flags conditional zones, e.g.
  // Bering Sea, that need underwriter permission/specific equipment this
  // engine can't verify).
  const [genWarnings, setGenWarnings] = useState<string[]>([]);
  const worldPorts = useWorldPorts();

  // "Generate Optimized Sea Route" popup, opened from the map "Optimize" button.
  const [genModalOpen, setGenModalOpen] = useState(false);
  // "Run Optimization" dialog (route/scenario/ETD/market factors).
  const [optDialogOpen, setOptDialogOpen] = useState(false);
  // When set, forces the dialog's route selector to this key as soon as it
  // opens — used by "Re-optimize Active Route" so it always targets the
  // active route (re-planning from the vessel's current position forward)
  // rather than whatever route was last picked.
  const [optDialogInitialRouteKey, setOptDialogInitialRouteKey] = useState<string | undefined>(undefined);
  // "Add New Route" popup — offers plotting manually, generating between two
  // ports (opens `genModalOpen`), or uploading a route file. Shown whenever
  // there's no route yet (or the user wants to start a different one).
  const [addRouteModalOpen, setAddRouteModalOpen] = useState(false);
  const [uploadRouteError, setUploadRouteError] = useState('');
  const uploadRouteInputRef = useRef<HTMLInputElement>(null);

  const createRouteManually = () => {
    setEditMode(true);
    setPlotMode(true);
    setSideCollapsed(false);
    setAddRouteModalOpen(false);
  };

  const openPortToPortGenerator = () => {
    setAddRouteModalOpen(false);
    setGenModalOpen(true);
  };

  const openUploadRouteFile = () => {
    setUploadRouteError('');
    uploadRouteInputRef.current?.click();
  };

  const onUploadRouteFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'Imported route';
      const { routes, notes } = parseRouteText(await file.text(), extension, baseName);
      if (routes.length === 0) {
        setUploadRouteError(
          t(
            'uploadRouteError',
            'Could not read that file. Use a JSON, GeoJSON, CSV, TXT, RTZ, GPX or KML file with latitude/longitude positions.',
          ),
        );
        return;
      }
      const cleaned = dedupeAndSimplifyTrackPoints(routes[0].points);
      setWaypoints(recomputeGeometry(waypointsFromPoints(cleaned, cpDefaultSpeedKts ?? 12)));
      setSelected([]);
      setAddRouteModalOpen(false);
      // The map keeps whatever view the user last panned/zoomed to; without this, a route far from that view would import correctly but not be visible.
      requestMapFit(cleaned);
      const extra = routes.length > 1
        ? [`The file has ${routes.length} routes; only "${routes[0].name}" was used. Open it from the Route Simulator panel's Import to bring in the others.`]
        : [];
      setUploadRouteError([...notes, ...extra].join(' '));
    } catch {
      setUploadRouteError(
        t(
          'uploadRouteError',
          'Could not read that file. Use a JSON, GeoJSON, CSV, TXT, RTZ, GPX or KML file with latitude/longitude positions.',
        ),
      );
    }
  };

  // Whether the Waypoint details side panel is collapsed. Minimized by
  // default; it opens automatically while editing the route (plot mode) or
  // when the user intentionally expands it.
  const [sideCollapsed, setSideCollapsed] = useState(true);

  useEffect(() => {
    if (plotMode) setSideCollapsed(false);
  }, [plotMode]);

  // Waypoints checked via the per-row checkbox in the details list.
  const [checkedIds, setCheckedIds] = useState<string[]>([]);

  // "Set speed / RPM / MCR" popup for the checked waypoints.
  const [speedModalOpen, setSpeedModalOpen] = useState(false);
  const [speedInput, setSpeedInput] = useState('12');
  const [rpmMinInput, setRpmMinInput] = useState('');
  const [rpmMaxInput, setRpmMaxInput] = useState('');
  const [mcrMinInput, setMcrMinInput] = useState('');
  const [mcrMaxInput, setMcrMaxInput] = useState('');

  const toggleWaypointChecked = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  /** Check every waypoint, or clear the selection if all are already checked. */
  const toggleAllChecked = () => {
    setCheckedIds((prev) =>
      prev.length === waypoints.length ? [] : waypoints.map((wp) => wp.id),
    );
  };

  // Candidate optimized routes computed in the background after the straight
  // line is drawn. The user picks their preferred one from the list.
  const [routeResults, setRouteResults] = useState<ComputedRoute[] | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const optimizeRunRef = useRef(0);
  const workerRef = useRef<Worker | null>(null);

  // Spin up the routing Web Worker once; it computes the candidate routes off
  // the main thread and streams each land-clean result back as it finishes.
  useEffect(() => {
    const worker = new Worker(
      new URL('../data/routeOptimizer.worker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.onmessage = (
      event: MessageEvent<
        | { type: 'variant'; runId: number; id: string; info: OptimizedRoute }
        | { type: 'done'; runId: number }
      >,
    ) => {
      const msg = event.data;
      if (msg.runId !== optimizeRunRef.current) return; // stale run
      if (msg.type === 'variant') {
        const meta = ROUTE_VARIANTS.find((v) => v.id === msg.id);
        if (!meta) return;
        setRouteResults((prev) => {
          const next = (prev ?? []).filter((r) => r.id !== msg.id);
          next.push({ ...meta, info: msg.info });
          // Keep the display order aligned with ROUTE_VARIANTS.
          next.sort(
            (a, b) =>
              ROUTE_VARIANTS.findIndex((v) => v.id === a.id) -
              ROUTE_VARIANTS.findIndex((v) => v.id === b.id),
          );
          return next;
        });
        setSelectedRouteId((prev) => prev ?? msg.id);
      } else if (msg.type === 'done') {
        setOptimizing(false);
      }
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Reload this voyage's own route (and reset every other per-route UI bit)
  // whenever the selected voyage actually changes — the initial `useState`
  // calls above only cover the very first voyage shown on mount.
  const prevVoyageIdRef = useRef(voyageId);
  useEffect(() => {
    if (prevVoyageIdRef.current === voyageId) return;
    prevVoyageIdRef.current = voyageId;
    suppressManualRouteMarkRef.current = true;
    resetWaypoints(loadRouteForVoyage(voyageId));
    setSelected([]);
    setCheckedIds([]);
    setEditMode(false);
    setOriginalRoute(null);
    setRouteName('');
    setDepInput(selectedVoyage?.portFrom ?? '');
    setArrInput(selectedVoyage?.portTo ?? '');
    optimizeRunRef.current += 1;
    setRouteResults(null);
    setSelectedRouteId(null);
    setOptimizing(false);
    setPlotMode(false);
    setSavedRoutes(readSavedRoutes(voyageId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyageId]);

  // Once the user makes ANY deliberate change to the route — saving waypoint
  // details, deleting/moving/inserting a waypoint, applying a chosen
  // optimizer candidate, etc. — this voyage's "Auto Route" (CP & Leg Details)
  // flips off immediately, so a route the user has taken over is never
  // silently regenerated again. Purely programmatic updates (loading a
  // voyage's existing route, the auto-generator's own writes, discarding an
  // edit, clearing the route) set `suppressManualRouteMarkRef` first so they
  // don't count as an edit here.
  const suppressManualRouteMarkRef = useRef(true); // the very first mount isn't an edit
  useEffect(() => {
    if (suppressManualRouteMarkRef.current) {
      suppressManualRouteMarkRef.current = false;
      return;
    }
    if (voyageId) mergeVoyageShared(voyageId, { leg1AutoRoute: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints]);

  // Voyage context passed to the route generator for the mandatory minimum
  // charted-depth and International Navigating Limits (INL) checks — ETD so
  // seasonal INL windows (e.g. Baltic ice season) use the actual sailing
  // date rather than today, and DWT for the Gulf of Finland's size-gated rule.
  const hazardRequestFields = (): { voyageDateIso?: string; vesselDwt?: number } => {
    const dwt = Number(String(selectedVoyage?.dwt ?? '').replace(/[^0-9.]/g, '')) || undefined;
    return { voyageDateIso: selectedVoyage?.etdIso, vesselDwt: dwt };
  };

  // Builds the non-blocking advisory messages for a just-applied route path
  // (minimum charted-depth requirement + any INL zone touched).
  const buildHazardWarnings = (path: Array<[number, number]>): string[] => {
    const dwt = Number(String(selectedVoyage?.dwt ?? '').replace(/[^0-9.]/g, '')) || undefined;
    const hz = describeMandatoryHazards(path, {
      voyageDate: selectedVoyage?.etdIso ? new Date(selectedVoyage.etdIso) : undefined,
      vesselDwt: dwt,
    });
    const warnings: string[] = [
      `Minimum charted depth requirement: >${hz.minDepthM} m, enforced via charted Depth Mask / Reef / Shoal / Bank zones (not exhaustive bathymetry — unlisted open-ocean areas are assumed deep).`,
    ];
    for (const z of hz.inlZones) {
      warnings.push(
        z.conditional
          ? `INL advisory — route passes through ${z.area}: ${z.label}. ${z.note ?? 'Subject to underwriter permission/conditions.'}`
          : `WARNING — route could not avoid a normally-restricted INL zone: ${z.area}: ${z.label}.`,
      );
    }
    return warnings;
  };

  const generateRoute = async () => {
    setGenError('');
    const from = resolveLocation(depInput, worldPorts);
    const to = resolveLocation(arrInput, worldPorts);
    if (!from || !to) {
      setGenError(
        t(
          'genResolveErr',
          'Enter a known port name or "lat, lon" for both departure and arrival.',
        ),
      );
      return;
    }
    setGenerating(true);
    // Any earlier optimization run is now stale.
    const runId = optimizeRunRef.current + 1;
    optimizeRunRef.current = runId;
    // This run's result is auto-applied (shortest, land-avoiding candidate)
    // the moment it's ready — no "choose a route" prompt, per the user's
    // explicit request for a single shortest route instead of several options.
    pendingManualGenRunIdRef.current = runId;
    setRouteResults(null);
    setSelectedRouteId(null);
    setGenWarnings([]);
    try {
      suppressManualRouteMarkRef.current = true; // preview line, not a committed edit yet
      setWaypointsSilently(recomputeGeometry(buildStraightLineWaypoints(from, to, cpDefaultSpeedKts ?? 12)));
      setSelected([]);
      setPlotMode(false);

      // Kick off the optimizer in the background worker; each land-clean
      // candidate is streamed back and overlaid on the map as it resolves
      // (unless a newer run supersedes it), so the UI never freezes.
      setOptimizing(true);
      workerRef.current?.postMessage({
        runId,
        dep: { lat: from.lat, lon: from.lon },
        arr: { lat: to.lat, lon: to.lon },
        ...hazardRequestFields(),
      });
    } catch (err) {
      setGenError(
        err instanceof Error
          ? err.message
          : t('genFailed', 'Could not generate a route.'),
      );
      setOptimizing(false);
    } finally {
      setGenerating(false);
    }
  };

  // --- Auto default route for a voyage with none yet --------------------
  // Tracks which optimizer run (if any) is the silent auto-generation for a
  // brand-new voyage, as opposed to the user's own manual "Generate route"
  // click — both now auto-apply their result (the shortest, land- and
  // hazard-avoiding candidate) without any "choose a route" prompt; only the
  // auto-default run additionally saves+tags a new route for the voyage.
  const autoGenRunIdRef = useRef<number | null>(null);
  const autoGenVoyageIdRef = useRef<string | null>(null);
  // Set for a manual "Generate route" click; cleared once its result is applied.
  const pendingManualGenRunIdRef = useRef<number | null>(null);
  // Never retries automatically for a voyage once attempted (success or not)
  // — e.g. manually clearing the route afterwards must not re-trigger it.
  const autoGenAttemptedForRef = useRef<string | null>(null);

  const autoGenerateDefaultRoute = (vId: string, portFrom: string, portTo: string) => {
    const from = resolveLocation(portFrom, worldPorts);
    const to = resolveLocation(portTo, worldPorts);
    if (!from || !to) return; // can't resolve either port — leave it for manual input
    setDepInput(portFrom);
    setArrInput(portTo);
    const runId = optimizeRunRef.current + 1;
    optimizeRunRef.current = runId;
    autoGenRunIdRef.current = runId;
    autoGenVoyageIdRef.current = vId;
    setRouteResults(null);
    setSelectedRouteId(null);
    setGenWarnings([]);
    suppressManualRouteMarkRef.current = true; // auto-generating isn't the user editing
    setWaypointsSilently(recomputeGeometry(buildStraightLineWaypoints(from, to, cpDefaultSpeedKts ?? 12)));
    setOptimizing(true);
    workerRef.current?.postMessage({
      runId,
      dep: { lat: from.lat, lon: from.lon },
      arr: { lat: to.lat, lon: to.lon },
      ...hazardRequestFields(),
    });
  };

  // Kick off the auto-generation once per voyage: only for a voyage with no
  // route of its own yet, and only when LEG-1's "Auto Route" toggle (CP &
  // Leg Details) is on — which is the default, matching `buildView.ts`.
  useEffect(() => {
    if (!voyageId || waypoints.length > 0) return;
    if (autoGenAttemptedForRef.current === voyageId) return;
    const autoRouteOn = loadVoyageShared(voyageId)?.leg1AutoRoute ?? true;
    if (!autoRouteOn) return;
    if (!selectedVoyage?.portFrom || !selectedVoyage?.portTo) return;
    autoGenAttemptedForRef.current = voyageId;
    autoGenerateDefaultRoute(voyageId, selectedVoyage.portFrom, selectedVoyage.portTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyageId, waypoints.length]);

  // When the auto-generation's background optimizer run finishes, silently
  // pick the shortest land-avoiding candidate (no "choose a route" prompt —
  // this is a default, not a decision for the user to make), save it as a
  // real saved route tagged with that voyage, and show it immediately if
  // the user hasn't since navigated to a different voyage.
  useEffect(() => {
    if (optimizing) return;
    const runId = autoGenRunIdRef.current;
    const vId = autoGenVoyageIdRef.current;
    autoGenRunIdRef.current = null;
    autoGenVoyageIdRef.current = null;
    if (runId == null || runId !== optimizeRunRef.current || !vId) return;
    if (!routeResults || routeResults.length === 0) return;
    const best = routeResults.reduce((a, b) => (b.info.distanceNm < a.info.distanceNm ? b : a));
    if (best.info.path.length < 2) return;
    setGenWarnings(buildHazardWarnings(best.info.path));
    const built = recomputeGeometry(buildWaypointsFromCandidate(best));
    const canonical = built.map((wp) => ({ ...wp, lon: canonicalLongitudeLabel(wp.lon) }));
    const saved = appendSavedRoute(
      {
        id: uniqueId('route'),
        // Clearly flagged as a rough default — not a reviewed plan — so it's
        // obvious in the Route Simulator's list that this wasn't manually set.
        name: `${depInput || 'Departure'} \u2013 ${arrInput || 'Arrival'} (Auto \u2014 rough, unreviewed)`,
        savedAt: new Date().toISOString(),
        waypoints: canonical,
      },
      vId,
    );
    writeRouteEditorRouteId(vId, saved.id);
    writeActiveRouteId(vId, saved.id);
    bumpSavedRoutes();
    if (voyageId === vId) {
      // Still on the same voyage — show the result immediately.
      suppressManualRouteMarkRef.current = true; // auto-generated, not a user edit
      setWaypointsSilently(built);
      setSelected([]);
      setRouteResults(null);
      setSelectedRouteId(null);
      setSavedRoutes(readSavedRoutes(vId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optimizing]);

  // When a MANUAL "Generate route" click's background run finishes, apply
  // the shortest land- and hazard-avoiding candidate straight to the
  // waypoint editor — same auto-pick as the default-route case above, but
  // without saving it as a named route (the user reviews/saves it like any
  // other manual edit). No "choose a route" prompt either way.
  useEffect(() => {
    if (optimizing) return;
    const runId = pendingManualGenRunIdRef.current;
    pendingManualGenRunIdRef.current = null;
    if (runId == null || runId !== optimizeRunRef.current) return;
    if (!routeResults || routeResults.length === 0) return;
    const best = routeResults.reduce((a, b) => (b.info.distanceNm < a.info.distanceNm ? b : a));
    if (best.info.path.length < 2) return;
    setGenWarnings(buildHazardWarnings(best.info.path));
    setWaypoints(recomputeGeometry(buildWaypointsFromCandidate(best)));
    setSelected([]);
    setPlotMode(false);
    setRouteResults(null);
    setSelectedRouteId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optimizing]);

  /** The candidate the user has currently selected, if any. */
  const selectedRoute =
    routeResults?.find((r) => r.id === selectedRouteId) ?? null;

  /** Candidate optimized routes overlaid on the map, each in its own colour. */
  const mapRoutes = useMemo(
    () =>
      (routeResults ?? [])
        .filter((r) => r.info.path.length >= 2)
        .map((r) => ({ id: r.id, color: r.color, path: r.info.path })),
    [routeResults],
  );

  // Saved routes the user is comparing in the simulator, echoed onto the map.
  const compareRoutes = useMapCompareRoutes();

  // While editing a duplicate, build the pre-edit original's densified path,
  // distance and per-leg timing so it can be drawn faded on the map and shown
  // as its own comparison row in the simulator table.
  const originalSim = useMemo(() => {
    if (!editMode || !originalRoute) return null;
    const pts = originalRoute
      .map((wp) => ({
        id: wp.id,
        lat: dmToDec(wp.lat),
        lon: dmToDec(wp.lon),
        legType: wp.legType ?? 'rhumb',
      }))
      .filter((p) => !Number.isNaN(p.lat) && !Number.isNaN(p.lon));
    if (pts.length < 2) return null;
    const speedById = new Map(originalRoute.map((w) => [w.id, w.speed]));
    const path: Array<[number, number]> = [];
    const timeHours: number[] = [];
    let cum = 0;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const seg = legPositions(
        pts[i] as EditorPoint,
        pts[i + 1] as EditorPoint,
        pts[i].legType,
      ).map((p) => p as [number, number]);
      const raw = speedById.get(pts[i].id) ?? 0;
      const legSpeed = raw > 0 ? raw : SERVICE_SPEED_KN;
      if (i === 0 && seg.length > 0) {
        path.push(seg[0]);
        timeHours.push(0);
      }
      for (let k = 1; k < seg.length; k += 1) {
        const a = seg[k - 1];
        const b = seg[k];
        cum += haversineNM(a[0], a[1], b[0], b[1]) / legSpeed;
        path.push(b);
        timeHours.push(cum);
      }
    }
    const distanceNm = Math.round(
      originalRoute.reduce((s, wp) => s + wp.distanceFromPrev, 0),
    );
    return { path, timeHours, distanceNm };
  }, [editMode, originalRoute]);

  const originalOverlay = useMemo(
    () =>
      originalSim
        ? [{ id: 'original-compare', color: '#8b949e', path: originalSim.path }]
        : [],
    [originalSim],
  );

  // The pre-edit original is still its own real, untouched saved route
  // (its own entry in the Route Simulator's list under its own name, since
  // "Edit" no longer silently leaves it with nothing behind it — see
  // `startEditDuplicate`), so it no longer needs a separate synthetic
  // "comparison" row published into the simulator here — only the faded
  // map overlay below (`originalOverlay`) remains, for a quick visual
  // comparison while actively dragging/editing.

  const overlayRoutes = useMemo(
    () => [...mapRoutes, ...compareRoutes, ...originalOverlay],
    [mapRoutes, compareRoutes, originalOverlay],
  );

  // Vessel positions published by the simulator while it plays back.
  const shipMarkers = useMapShipMarkers();
  const plannedColor = useMapPlannedColor();
  const activeWaypoints = useMapRouteWaypoints();
  const reportMarkers = useRouteReportMarkers();
  const sharedLegSpeedProfiles = useMemo(
    () => loadVoyageShared(selectedVoyage?.id)?.legSpeedProfiles ?? [],
    [selectedVoyage?.id],
  );

  // Received reports (non-interpolated tracksheet rows) anchor the route:
  // while editing, their nearest waypoint cannot be moved/deleted.
  const lockedWaypointIds = useMemo(() => {
    const anchors = reportMarkers.filter((r) => !r.isInterpolated);
    if (anchors.length === 0 || waypoints.length === 0) return new Set<string>();
    const lock = new Set<string>();
    for (const anchor of anchors) {
      let bestId: string | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const wp of waypoints) {
        const lat = dmToDec(wp.lat);
        const lon = dmToDec(wp.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const d = haversineNM(lat, lon, anchor.pos[0], anchor.pos[1]);
        if (d < bestDist) {
          bestDist = d;
          bestId = wp.id;
        }
      }
      if (bestId && bestDist <= REPORT_LOCK_MAX_DIST_NM) lock.add(bestId);
    }
    return lock;
  }, [reportMarkers, waypoints]);

  const activeLegSpeedProfile = useMemo(() => {
    if (sharedLegSpeedProfiles.length === 0) return null;
    return (
      sharedLegSpeedProfiles.find((leg) => /active/i.test(leg.status)) ??
      sharedLegSpeedProfiles[0]
    );
  }, [sharedLegSpeedProfiles]);

  const reportSpeedOptions = useMemo<SpeedProfileOption[]>(() => {
    const legRows = activeLegSpeedProfile?.speedCons
      ?.filter((row) => Number.isFinite(Number(row.speed)) && Number(row.speed) > 0)
      .map((row, idx) => ({
        id: `legspd-${idx}-${row.description || 'profile'}`,
        label: `${row.description || `Profile ${idx + 1}`} (${Number(row.speed).toFixed(1)} kt / ${row.dailyCons1 || '—'} mt/day${row.fuelType1 ? `, ${row.fuelType1}` : ''})`,
        speedKts: Number(row.speed),
        isDefault: !!row.isDefault,
        dailyCons: Number.isFinite(Number(row.dailyCons1)) && Number(row.dailyCons1) > 0 ? Number(row.dailyCons1) : undefined,
        fuelType: row.fuelType1 || undefined,
      }));
    if (legRows && legRows.length > 0) {
      const hasDefault = legRows.some((row) => row.isDefault);
      return legRows.map((row, idx) => ({ ...row, isDefault: hasDefault ? row.isDefault : idx === 0 }));
    }
    const speeds = Array.from(
      new Set(
        waypoints
          .map((wp) => Number(wp.speed))
          .filter((v) => Number.isFinite(v) && v > 0)
          .map((v) => Number(v.toFixed(1))),
      ),
    ).sort((a, b) => a - b);
    const eco = speeds[0] ?? 10;
    const full = speeds[speeds.length - 1] ?? 13;
    const custom = Number(((eco + full) / 2).toFixed(1));
    const base: SpeedProfileOption[] = [
      { id: 'eco', label: `ECO (${eco.toFixed(1)} kt)`, speedKts: eco },
      { id: 'full', label: `FULL (${full.toFixed(1)} kt)`, speedKts: full },
      { id: 'custom', label: `CUSTOM (${custom.toFixed(1)} kt)`, speedKts: custom },
    ];
    const extras = speeds.map((v) => ({
      id: `spd-${v.toFixed(1)}`,
      label: `${v.toFixed(1)} kt`,
      speedKts: v,
    }));
    const seen = new Set<string>();
    return [...base, ...extras].filter((o) => {
      const key = `${o.label}|${o.speedKts}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [activeLegSpeedProfile, waypoints]);

  /** The CP & Leg Details' "Speed & Cons" Default-checked row — the single
   *  source of truth new waypoints and non-manually-overridden waypoints'
   *  speed/fuel dynamically track (see `Waypoint.speedManual`). */
  const cpDefaultSpeedConsRow = useMemo(
    () => activeLegSpeedProfile?.speedCons?.find((row) => !!row.isDefault)
      ?? activeLegSpeedProfile?.speedCons?.[0]
      ?? null,
    [activeLegSpeedProfile],
  );
  const cpDefaultSpeedKts = useMemo(() => {
    const v = Number(cpDefaultSpeedConsRow?.speed);
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [cpDefaultSpeedConsRow]);
  const cpDefaultDailyCons = useMemo(() => {
    const v = Number(cpDefaultSpeedConsRow?.dailyCons1);
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [cpDefaultSpeedConsRow]);

  const defaultReportFuelType = useMemo(
    () => cpDefaultSpeedConsRow?.fuelType1 || REPORT_FUEL_OPTIONS[0],
    [cpDefaultSpeedConsRow],
  );

  // Keep every waypoint that's never been manually/report-overridden
  // (`speedManual` falsy) in sync with the CP's current Default speed/cons
  // row, so editing that default there updates them automatically. Any
  // waypoint after a deliberate override (manual edit or a report's forward-
  // propagated speed/fuel change) is marked `speedManual` and skipped here,
  // so only the portion of the route still "before" such a change tracks it.
  useEffect(() => {
    if (cpDefaultSpeedKts == null) return;
    setWaypoints((prev) => {
      let changed = false;
      const next = prev.map((wp) => {
        if (wp.speedManual) return wp;
        if (wp.speed === cpDefaultSpeedKts && wp.dailyCons === (cpDefaultDailyCons ?? undefined))
          return wp;
        changed = true;
        return { ...wp, speed: cpDefaultSpeedKts, dailyCons: cpDefaultDailyCons ?? undefined };
      });
      if (!changed) return prev;
      return recomputeGeometry(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpDefaultSpeedKts, cpDefaultDailyCons]);

  const onSelectReportSpeed = (reportId: string, opt: SpeedProfileOption) => {
    setRouteReportSpeedSelection(reportId, opt.label, opt.speedKts);
  };

  const onSelectReportFuel = (reportId: string, fuelType: string) => {
    setRouteReportFuelSelection(reportId, fuelType);
  };

  /**
   * Apply a vessel report's chosen speed/cons/fuel-type forward from that
   * report's position to every later waypoint that hasn't already been
   * manually overridden — never touching waypoints before it, nor ones a
   * user (or an earlier report) already set a deliberate speed for. Fuel
   * type comes from the chosen speed/cons profile row itself (`opt.fuelType`,
   * falling back to the CP's own default fuel type) — never a separate pick,
   * since each CP speed/cons row already fixes its own fuel type. Marks
   * every waypoint it does touch `speedManual` so it stops dynamically
   * tracking the CP default from here on, and so a *later* report's own
   * propagation correctly treats it as already-overridden too.
   */
  const applyReportCriteriaForward = (reportPos: [number, number], opt: SpeedProfileOption) => {
    const fuelType = opt.fuelType ?? defaultReportFuelType;
    setWaypoints((prev) => {
      if (prev.length === 0) return prev;
      let bestIdx = -1;
      let bestDist = Number.POSITIVE_INFINITY;
      prev.forEach((wp, i) => {
        const lat = dmToDec(wp.lat);
        const lon = dmToDec(wp.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const d = haversineNM(lat, lon, reportPos[0], reportPos[1]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      });
      if (bestIdx < 0) return prev;
      const next = prev.map((wp, i) => {
        if (i < bestIdx || wp.speedManual) return wp;
        return {
          ...wp,
          speed: opt.speedKts,
          fuelType,
          dailyCons: Number.isFinite(Number(opt.dailyCons)) ? Number(opt.dailyCons) : wp.dailyCons,
          speedManual: true,
        };
      });
      return recomputeGeometry(next);
    });
  };

  const onApplyReportCriteria = (reportPos: [number, number], opt: SpeedProfileOption) => {
    if (!editMode) return;
    applyReportCriteriaForward(reportPos, opt);
  };

  const isWaypointLocked = (id: string) => lockedWaypointIds.has(id);

  // Last reported vessel position (from the tracksheet's last row).
  const vesselPos = useVesselPosition();
  const allShipMarkers = useMemo(
    () =>
      vesselPos
        ? [
            ...shipMarkers,
            {
              id: 'tracksheet-vessel',
              color: '#f0b429',
              pos: [vesselPos.lat, vesselPos.lon] as [number, number],
              label: vesselPos.label ?? 'Vessel',
              sublabel: 'Last reported position',
              active: false,
              heading: 0,
            },
          ]
        : shipMarkers,
    [shipMarkers, vesselPos],
  );

  /** Build the full waypoint list for a chosen optimizer candidate (shared
   *  by the manual "Use this route" button and the automatic default-route
   *  generator). */
  const buildWaypointsFromCandidate = (chosen: ComputedRoute): Waypoint[] => {
    const path = chosen.info.path;
    const last = path.length - 1;
    const stamp = Date.now();
    return path.map((pt, i) => ({
      id: `wp-${stamp}-${i}`,
      name:
        i === 0
          ? `${depInput || 'Departure'} (Departure)`
          : i === last
            ? `${arrInput || 'Arrival'} (Arrival)`
            : `${chosen.label} WP ${i + 1}`,
      lat: decToDM(pt[0], true),
      lon: decToDM(pt[1], false),
      course: 0,
      speed: cpDefaultSpeedKts ?? 12,
      distanceFromPrev: 0,
      eta: '',
      drift: false,
      isPort: i === 0 || i === last,
      legType:
        i === last
          ? 'rhumb'
          : chooseLegType(pt[0], pt[1], path[i + 1][0], path[i + 1][1]),
    }));
  };

  /** Replace the editable waypoints with the selected candidate route. */
  const applySelectedRoute = () => {
    const chosen = selectedRoute;
    if (!chosen || chosen.info.path.length < 2) return;
    setWaypoints(recomputeGeometry(buildWaypointsFromCandidate(chosen)));
    setSelected([]);
    setPlotMode(false);
    // Collapse the chooser and drop the alternative overlays — only the
    // selected route (now the editable waypoints) remains on the map.
    optimizeRunRef.current += 1;
    setRouteResults(null);
    setSelectedRouteId(null);
    setOptimizing(false);
  };

  /** Waypoints with valid coordinates, mapped to decimal for the map. */
  const mapPoints = useMemo<EditorPoint[]>(() => {
    let cumulative = 0;
    return waypoints
      .map((wp) => {
        // Defense-in-depth against any already-saved waypoint whose
        // `distanceFromPrev` is somehow not a finite number (e.g. older data
        // saved before `recomputeGeometry`'s own NaN guard above existed) —
        // without this, a single bad value here would poison every later
        // waypoint's cumulative "distance from departure" too, since
        // `NaN + anything` is always `NaN`.
        const legDist = Number.isFinite(wp.distanceFromPrev) ? wp.distanceFromPrev : 0;
        cumulative += legDist;
        // While this waypoint's details are open for editing, show the
        // live draft name (not yet saved) on the map tooltip too — purely
        // a read-only preview, so typing a note like "Increase speed"
        // appears immediately without needing to click Save first. This
        // doesn't touch the committed route itself (still gated on Save,
        // same as every other draft field).
        const liveName = waypointDraft && selectedWaypoint?.id === wp.id ? waypointDraft.name : wp.name;
        // For the hover tooltip's "Drifting until … (duration)" line — the
        // duration is computed from this waypoint's own `eta` (kept fresh
        // by `recomputeGeometry`, re-threaded from the voyage's current ETD
        // on every edit and on initial load) to "Drift until", never a
        // stale cached value.
        let driftUntilLabel: string | null = null;
        let driftDurationLabel: string | null = null;
        if (wp.drift && wp.driftUntil) {
          const untilMs = parseLocalDateTime(wp.driftUntil);
          if (untilMs != null) {
            driftUntilLabel = new Date(untilMs).toLocaleString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });
            const arriveMs = parseLocalDateTime(wp.eta);
            if (arriveMs != null && untilMs > arriveMs) {
              driftDurationLabel = formatDuration((untilMs - arriveMs) / 3600_000);
            }
          }
        }
        // Pre-formatted ETA/ETD for the tooltip, matching the drift-until
        // label's style — `undefined` (not shown) for a malformed date.
        const etaMs = parseLocalDateTime(wp.eta);
        const etaLabel =
          etaMs != null
            ? new Date(etaMs).toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : undefined;
        return {
          id: wp.id,
          name: liveName,
          lat: dmToDec(wp.lat),
          lon: dmToDec(wp.lon),
          latLng: [dmToDec(wp.lat), dmToDec(wp.lon)] as [number, number],
          isPort: wp.isPort,
          drift: wp.drift,
          legType: wp.legType ?? 'rhumb',
          latLabel: wp.lat,
          lonLabel: wp.lon,
          distFromPrev: Math.round(legDist),
          distFromStart: Math.round(cumulative),
          locked: isWaypointLocked(wp.id),
          driftUntilLabel,
          driftDurationLabel,
          course: wp.course,
          speed: wp.speed,
          rpmMin: wp.rpmMin,
          rpmMax: wp.rpmMax,
          mcrMin: wp.mcrMin,
          mcrMax: wp.mcrMax,
          fuelType: wp.fuelType,
          dailyCons: wp.dailyCons,
          etaLabel,
          etaMs: etaMs ?? undefined,
        };
      })
      .filter((p) => !Number.isNaN(p.lat) && !Number.isNaN(p.lon));
  }, [waypoints, lockedWaypointIds, selectedWaypoint?.id, waypointDraft?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Publish the route currently drawn on the map so the Route Simulator (in
  // the bottom drawer) can play it back as the "Active" route. The path is
  // densified per leg (great-circle arcs) so the animated vessel follows the
  // exact track drawn on the map instead of cutting straight between points.
  useEffect(() => {
    const path: Array<[number, number]> = [];
    // Cumulative voyage hours to each densified vertex, using the planned speed
    // of the waypoint each leg departs from (so the vessel sails every leg at
    // the speed set in the waypoint list).
    const timeHours: number[] = [];
    let cumHours = 0;
    const speedById = new Map(waypoints.map((w) => [w.id, w.speed]));
    // Drift wait (hours) per waypoint id — from its own ETA (arrival, before
    // waiting) to its "Drift until" (departure, after waiting). A duplicate
    // point advances time without moving position, so playback visibly holds
    // the vessel there for the wait instead of sailing straight through.
    const driftWaitByWaypointId = new Map(
      waypoints
        .map((wp) => {
          if (!wp.drift || !wp.driftUntil) return [wp.id, 0] as const;
          const arriveMs = parseLocalDateTime(wp.eta);
          const untilMs = parseLocalDateTime(wp.driftUntil);
          const waitHours =
            arriveMs != null && untilMs != null ? Math.max(0, (untilMs - arriveMs) / 3600_000) : 0;
          return [wp.id, waitHours] as const;
        })
        .filter(([, hours]) => hours > 0),
    );
    for (let i = 0; i < mapPoints.length - 1; i += 1) {
      // Thread the leg through any real reports that fall chronologically
      // between these two waypoints (see `reportsForLeg`/`buildLegPath` in
      // RouteEditorMap.tsx) — keeps this timing/position path consistent
      // with the exact line drawn on the map for the same leg.
      const through = reportsForLeg(reportMarkers, mapPoints[i].etaMs, mapPoints[i + 1].etaMs).map(
        (r) => ({ lat: r.pos[0], lon: r.pos[1] }),
      );
      const seg = buildLegPath(
        mapPoints[i],
        mapPoints[i + 1],
        mapPoints[i].legType ?? 'rhumb',
        through,
      );
      const rawSpeed = speedById.get(mapPoints[i].id) ?? 0;
      const legSpeed = rawSpeed > 0 ? rawSpeed : SERVICE_SPEED_KN;
      if (i === 0 && seg.length > 0) {
        path.push(seg[0]);
        timeHours.push(0);
        const waitAtDeparture = driftWaitByWaypointId.get(mapPoints[0].id);
        if (waitAtDeparture) {
          cumHours += waitAtDeparture;
          path.push(seg[0]);
          timeHours.push(cumHours);
        }
      }
      for (let k = 1; k < seg.length; k += 1) {
        const prev = seg[k - 1];
        const curr = seg[k];
        cumHours += haversineNM(prev[0], prev[1], curr[0], curr[1]) / legSpeed;
        path.push(curr);
        timeHours.push(cumHours);
      }
      // Arrived at mapPoints[i + 1] — hold position there if it has a drift
      // wait, before the next leg's segment starts.
      const waitHours = driftWaitByWaypointId.get(mapPoints[i + 1].id);
      if (waitHours) {
        cumHours += waitHours;
        path.push(path[path.length - 1]);
        timeHours.push(cumHours);
      }
    }
    if (path.length >= 2) {
      // The editor can simply be *viewing* this voyage's already-active
      // saved route (not editing it) — in which case publishing it here too
      // would add a second, pointlessly-duplicate row right next to that
      // same route's own row from the saved-routes list. Only suppress it
      // in that exact case: still show it while the editor has a genuinely
      // different route open (a deliberate preview before activating it) or
      // while actively editing (so the live, unsaved edit reflects in real
      // time) — in both of those cases, though, the id used below matches
      // whichever saved entry the editor is actually backing (`editorId`
      // while editing — the "Edit of X" copy created up front, see
      // `startEditDuplicate` — or otherwise whatever's plainly loaded), so
      // the Route Simulator's own list treats this as an update to that
      // same row instead of a second one; only a route with no saved entry
      // behind it at all (freshly plotted, never saved) gets a distinct id.
      const loadedRouteId = resolveLoadedRouteId(voyageId);
      const activeSavedId = readActiveRouteId(voyageId)?.replace(/^saved-/, '') ?? null;
      const isViewingActiveSavedRouteUnedited =
        !editMode && !!loadedRouteId && loadedRouteId === activeSavedId;
      if (isViewingActiveSavedRouteUnedited) {
        setActiveSimRoute(null);
        return;
      }
      const distanceNm = waypoints.reduce((sum, wp) => sum + wp.distanceFromPrev, 0);
      const liveLabel =
        (loadedRouteId && savedRoutes.find((r) => r.id === loadedRouteId)?.name) ||
        t('plannedRoute', 'Planned route');
      const waypointOverrides = waypoints
        .filter(
          (wp) =>
            wp.rpmMin != null ||
            wp.rpmMax != null ||
            wp.mcrMin != null ||
            wp.mcrMax != null ||
            (wp.drift && wp.driftUntil),
        )
        .map((wp) => ({
          pos: [dmToDec(wp.lat), dmToDec(wp.lon)] as [number, number],
          label: wp.name,
          rpmMin: wp.rpmMin,
          rpmMax: wp.rpmMax,
          mcrMin: wp.mcrMin,
          mcrMax: wp.mcrMax,
          driftUntil: wp.drift ? wp.driftUntil : undefined,
        }))
        .filter((o) => !Number.isNaN(o.pos[0]) && !Number.isNaN(o.pos[1]));
      setActiveSimRoute({
        id: loadedRouteId ? `saved-${loadedRouteId}` : 'active-planned',
        label: liveLabel,
        color: '#1f6feb',
        path,
        distanceNm: Math.round(distanceNm),
        timeHours,
        etdIso: selectedVoyage?.etdIso,
        waypointOverrides: waypointOverrides.length > 0 ? waypointOverrides : undefined,
      });
    } else {
      setActiveSimRoute(null);
    }
  }, [mapPoints, waypoints, editMode, selectedVoyage?.etdIso, voyageId, savedRoutes, reportMarkers]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => setActiveSimRoute(null), []);

  const addPointFromMap = (lat: number, lon: number) => {
    setWaypoints((prev) => {
      const next: Waypoint = {
        id: uniqueId('wp'),
        name: `Waypoint ${prev.length + 1}`,
        lat: decToDM(lat, true),
        lon: decToDM(lon, false),
        course: 0,
        speed: prev[prev.length - 1]?.speed ?? cpDefaultSpeedKts ?? 12,
        distanceFromPrev: 0,
        eta: prev[prev.length - 1]?.eta ?? '',
        drift: false,
        isPort: false,
      };
      // Waypoints may only sit BETWEEN departure and arrival. If the last
      // waypoint is the arrival port, insert just before it instead of
      // appending after it. (And never before the departure port.)
      const lastIsPort = prev.length > 0 && prev[prev.length - 1].isPort;
      const insertAt = lastIsPort ? prev.length - 1 : prev.length;
      const list = [...prev];
      list.splice(insertAt, 0, next);
      return recomputeGeometry(list);
    });
  };

  const deletePoint = (id: string) => {
    setWaypoints((prev) => {
      const wp = prev.find((x) => x.id === id);
      // Departure/arrival and report-anchored waypoints are fixed.
      if (!wp || wp.isPort || isWaypointLocked(id)) return prev;
      return recomputeGeometry(prev.filter((x) => x.id !== id));
    });
    setSelected((prev) => prev.filter((x) => x !== id));
  };

  /** Anchor for Shift-click range-selection — the last waypoint plain-clicked
   *  (not Shift-clicked), from either the map or the list, so a subsequent
   *  Shift-click (on either) knows where the range should start from. */
  const rangeAnchorIdRef = useRef<string | null>(null);

  /** Whether a Shift-click range-select should CHECK or UNCHECK the range —
   *  set whenever the anchor itself is established. A checkbox's own plain
   *  click sets this to whichever way IT just toggled (so unchecking an
   *  already-checked waypoint, then Shift-clicking another, range-*un*checks
   *  the whole range in between, mirroring how range-*checking* already
   *  works); a plain row/map click (which doesn't check/uncheck anything by
   *  itself) leaves this as 'check', the original/default range behaviour. */
  const rangeAnchorModeRef = useRef<'check' | 'uncheck'>('check');

  /**
   * Shared Shift-click range-select logic for both the map markers and the
   * waypoint list rows — checks (or, per `rangeAnchorModeRef`, unchecks)
   * every waypoint between the last plain click (the range anchor, set by
   * whichever of the two was clicked last) and this one, inclusive, in
   * whichever order they appear in the route. A range-check only adds to
   * whatever was already checked (never replaces/clears it), so an earlier
   * selection — whether made by checkbox, a previous Shift-click, or
   * anything else — is never silently cleared by a later Shift-click;
   * symmetrically, a range-uncheck only removes the range, leaving anything
   * else checked untouched. Returns true if it handled the click as a
   * range-select (the caller should do nothing else); false if the caller
   * should fall through to its own plain-click behaviour (and must then
   * update `rangeAnchorIdRef`/`rangeAnchorModeRef` itself) — e.g. there's no
   * anchor yet, or it's since been deleted.
   */
  const applyRangeSelect = (id: string, shiftKey: boolean): boolean => {
    if (!shiftKey || !rangeAnchorIdRef.current) return false;
    const ids = waypoints.map((wp) => wp.id);
    const anchorIdx = ids.indexOf(rangeAnchorIdRef.current);
    const clickedIdx = ids.indexOf(id);
    if (anchorIdx === -1 || clickedIdx === -1) return false;
    const [start, end] = anchorIdx <= clickedIdx ? [anchorIdx, clickedIdx] : [clickedIdx, anchorIdx];
    const rangeIds = ids.slice(start, end + 1);
    const uncheck = rangeAnchorModeRef.current === 'uncheck';
    setCheckedIds((prev) => {
      const merged = new Set(prev);
      for (const rid of rangeIds) {
        if (uncheck) merged.delete(rid);
        else merged.add(rid);
      }
      // Keep the result in route order (not append order) so it stays
      // consistent with everything else that reads `checkedIds` expecting
      // route order (e.g. "insert after the last checked waypoint").
      return ids.filter((wid) => merged.has(wid));
    });
    setSideCollapsed(false);
    return true;
  };

  /**
   * Clicking a waypoint marker on the map selects it and expands the
   * Waypoint details side panel if it's currently collapsed. Shift-clicking
   * instead range-selects — see `applyRangeSelect`.
   */
  const selectWaypointFromMap = (id: string, shiftKey?: boolean) => {
    if (applyRangeSelect(id, !!shiftKey)) return;
    rangeAnchorIdRef.current = id;
    rangeAnchorModeRef.current = 'check';
    setSelected([id]);
    setSideCollapsed(false);
  };

  /**
   * Live position updates fired continuously while a waypoint marker is
   * being dragged (once per animation frame, so the route line follows the
   * cursor smoothly) — applied silently (no undo step) so a single drag
   * gesture doesn't flood the undo history with one entry per frame.
   * `dragBaselineRef` snapshots the route exactly as it was just before the
   * first of these preview frames, so the final position (committed once on
   * drag release, below) can record ONE undo step spanning the whole drag —
   * start position straight to end position — instead of needing repeated
   * Undo clicks to walk back through every intermediate frame in between.
   */
  const dragBaselineRef = useRef<Waypoint[] | null>(null);
  const moveWaypointPreview = (id: string, lat: number, lon: number) => {
    if (isWaypointLocked(id)) return;
    if (dragBaselineRef.current === null) dragBaselineRef.current = waypoints;
    setWaypointsSilently((prev) =>
      recomputeGeometry(
        prev.map((wp) =>
          wp.id === id
            ? { ...wp, lat: decToDM(lat, true), lon: decToDM(lon, false) }
            : wp,
        ),
      ),
    );
  };

  /** Committed once on drag release (or for any other single-shot move). */
  const moveWaypoint = (id: string, lat: number, lon: number) => {
    if (isWaypointLocked(id)) return;
    const baseline = dragBaselineRef.current ?? waypoints;
    dragBaselineRef.current = null;
    commitWaypoints(baseline, (prev) =>
      recomputeGeometry(
        prev.map((wp) =>
          wp.id === id
            ? { ...wp, lat: decToDM(lat, true), lon: decToDM(lon, false) }
            : wp,
        ),
      ),
    );
  };

  /**
   * Insert a new waypoint between `mapPoints[afterIndex]` and the next
   * one. `afterIndex` refers to the filtered map points, so map it back
   * to the position in the full waypoint list.
   */
  const insertPointFromMap = (afterIndex: number, lat: number, lon: number) => {
    const afterId = mapPoints[afterIndex]?.id;
    setWaypoints((prev) => {
      const pos = afterId ? prev.findIndex((wp) => wp.id === afterId) : prev.length - 1;
      const insertAt = pos < 0 ? prev.length : pos + 1;
      const newWp: Waypoint = {
        id: uniqueId('wp'),
        name: `Waypoint ${prev.length + 1}`,
        lat: decToDM(lat, true),
        lon: decToDM(lon, false),
        course: 0,
        speed: prev[pos]?.speed ?? 12,
        distanceFromPrev: 0,
        eta: prev[pos]?.eta ?? '',
        drift: false,
        isPort: false,
      };
      const next = [...prev];
      next.splice(insertAt, 0, newWp);
      return recomputeGeometry(next);
    });
  };

  // --- Waypoint-detail toolbar (operates on the checked rows) ----------------
  /** Insert a new waypoint after the last checked waypoint (or at the end). */
  const insertCheckedWaypoint = () => {
    setWaypoints((prev) => {
      if (prev.length === 0) return prev;
      const checkedIdx = prev
        .map((wp, i) => (checkedIds.includes(wp.id) ? i : -1))
        .filter((i) => i >= 0);
      let pos = checkedIdx.length ? checkedIdx[checkedIdx.length - 1] : prev.length - 1;
      // Never insert after the arrival port — step back before it.
      if (prev[pos].isPort && pos === prev.length - 1) pos = Math.max(0, pos - 1);
      const ref = prev[pos];
      const nextRef = prev[pos + 1];
      const lat1 = dmToDec(ref.lat);
      const lon1 = dmToDec(ref.lon);
      const lat = nextRef ? (lat1 + dmToDec(nextRef.lat)) / 2 : lat1 + 0.5;
      const lon = nextRef ? (lon1 + dmToDec(nextRef.lon)) / 2 : lon1 + 0.5;
      const newWp: Waypoint = {
        id: uniqueId('wp'),
        name: `Waypoint ${prev.length + 1}`,
        lat: decToDM(lat, true),
        lon: decToDM(lon, false),
        course: 0,
        speed: ref.speed,
        distanceFromPrev: 0,
        eta: ref.eta,
        drift: false,
        isPort: false,
      };
      const next = [...prev];
      next.splice(pos + 1, 0, newWp);
      return recomputeGeometry(next);
    });
  };

  /** Delete every checked waypoint (departure / arrival ports are kept). */
  const deleteCheckedWaypoints = () => {
    if (checkedIds.length === 0) return;
    setWaypoints((prev) =>
      recomputeGeometry(
        prev.filter(
          (wp) => wp.isPort || isWaypointLocked(wp.id) || !checkedIds.includes(wp.id),
        ),
      ),
    );
    setSelected((prev) => prev.filter((id) => !checkedIds.includes(id)));
    setCheckedIds((prev) => prev.filter((id) => isWaypointLocked(id)));
  };

  /** Open the "Set speed / RPM / MCR" popup for the checked waypoints. */
  const setSpeedForChecked = () => {
    if (checkedIds.length === 0) return;
    const checked = waypoints.filter((wp) => checkedIds.includes(wp.id));
    // Seed each field with the shared value across the checked waypoints, or
    // blank/default if they differ (so applying doesn't silently overwrite them).
    const seed = (values: Array<number | undefined>) => {
      const set = new Set(values.map((v) => v ?? ''));
      return set.size === 1 ? String([...set][0]) : '';
    };
    const speeds = new Set(checked.map((wp) => wp.speed));
    setSpeedInput(speeds.size === 1 ? String([...speeds][0]) : '12');
    setRpmMinInput(seed(checked.map((wp) => wp.rpmMin)));
    setRpmMaxInput(seed(checked.map((wp) => wp.rpmMax)));
    setMcrMinInput(seed(checked.map((wp) => wp.mcrMin)));
    setMcrMaxInput(seed(checked.map((wp) => wp.mcrMax)));
    setSpeedModalOpen(true);
  };

  /** Apply the popup's speed (knots) + Min/Max RPM/MCR to every checked
   *  waypoint. Leaving an RPM/MCR field blank clears that value. */
  const applySpeedToChecked = () => {
    const speed = Number(speedInput);
    if (!Number.isFinite(speed) || speed < 0) return;
    const parseOptional = (raw: string) => {
      if (raw.trim() === '') return undefined;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    };
    const rpmMin = parseOptional(rpmMinInput);
    const rpmMax = parseOptional(rpmMaxInput);
    const mcrMin = parseOptional(mcrMinInput);
    const mcrMax = parseOptional(mcrMaxInput);
    setWaypoints((prev) =>
      recomputeGeometry(
        prev.map((wp) =>
          checkedIds.includes(wp.id)
            ? { ...wp, speed, rpmMin, rpmMax, mcrMin, mcrMax, speedManual: true }
            : wp,
        ),
      ),
    );
    setSpeedModalOpen(false);
  };

  /** Append a new saved route — tagged with the given voyage (defaults to
   *  the currently selected one), merged into the FULL global list (not
   *  just this voyage's filtered view, which would otherwise silently drop
   *  every other voyage's routes on write). */
  const appendSavedRoute = (route: SavedRoute, forVoyageId: string | undefined = selectedVoyage?.id) => {
    const tagged = tagRouteWithVoyage(route, forVoyageId);
    writeSavedRoutes([...readAllSavedRoutes(), tagged]);
    setSavedRoutes(readSavedRoutes(selectedVoyage?.id));
    return tagged;
  };

  /**
   * Archive every saved route for this voyage *other than* `keepId` into
   * the permanent "All Routes" history, then remove them from the active
   * saved-routes list — called right before promoting `keepId` to be the
   * new active route (see `activateEdit`), so activating an edit doesn't
   * leave the superseded original (or any other inactive route) cluttering
   * the main list: per the explicit design, only the route that's actually
   * active stays there, everything else lives in "All Routes" instead.
   * Mirrors the shape used by the Route Simulator's own time-based stale-
   * route archiving (see `RouteSimulatorPanel.tsx`), just triggered
   * immediately instead of after a delay.
   */
  const archiveOtherSavedRoutes = (forVoyageId: string, keepId: string) => {
    const all = readAllSavedRoutes();
    const toArchive = all.filter((r) => r.id !== keepId && (r.voyageId == null || r.voyageId === forVoyageId));
    if (toArchive.length === 0) return;
    const nowIso = new Date().toISOString();
    const entries: RouteHistoryEntry[] = toArchive.map((r) => {
      const distanceNm = Math.round(
        r.waypoints.reduce((sum, wp) => sum + (Number.isFinite(wp.distanceFromPrev) ? wp.distanceFromPrev : 0), 0),
      );
      const etdIso = r.waypoints[0]?.eta || nowIso;
      const etaIso = r.waypoints[r.waypoints.length - 1]?.eta || etdIso;
      const durationMs = parseLocalDateTime(etaIso) != null && parseLocalDateTime(etdIso) != null
        ? Math.max(0, (parseLocalDateTime(etaIso)! - parseLocalDateTime(etdIso)!) / 3600_000)
        : 0;
      return {
        id: uniqueId('archived'),
        voyageId: forVoyageId,
        baseRouteName: r.name,
        name: r.name,
        generatedAt: r.savedAt || nowIso,
        path: r.waypoints.map((wp) => [dmToDec(wp.lat), dmToDec(wp.lon)] as [number, number]),
        summary: {
          distanceNm,
          durationH: durationMs,
          speedKn: durationMs > 0 ? distanceNm / durationMs : SERVICE_SPEED_KN,
          ecaDistanceNm: 0,
          ecaDurationH: 0,
          fuelTons: 0,
          ecaFuelTons: 0,
          fuelCost: 0,
          hireCost: 0,
          euaCost: 0,
          totalCost: 0,
          co2Tons: 0,
          etdIso,
          etaIso,
        },
        source: 'manual',
      };
    });
    appendRouteHistory(entries);
    const archivedIds = new Set(toArchive.map((r) => r.id));
    writeSavedRoutes(all.filter((r) => !archivedIds.has(r.id)));
    setSavedRoutes(readSavedRoutes(forVoyageId));
  };

  const saveRoute = () => {
    const name = routeName.trim() || `Route ${savedRoutes.length + 1}`;
    const canonicalWaypoints = waypoints.map((waypoint) => ({
      ...waypoint,
      lon: canonicalLongitudeLabel(waypoint.lon),
    }));
    appendSavedRoute({
      id: uniqueId('route'),
      name,
      savedAt: new Date().toISOString(),
      waypoints: canonicalWaypoints,
    });
    setRouteName('');
  };

  const clearRoute = () => {
    suppressManualRouteMarkRef.current = true; // resetting, not establishing an edit
    resetWaypoints([]);
    setSelected([]);
  };

  /**
   * Enter edit mode by duplicating the route into a genuinely separate,
   * durable saved entry — "Edit of {the real route name}" — which becomes
   * what the editor is attached to (`editorId`) from this point on; the
   * original is left completely untouched, still its own saved entry under
   * its own real name, so it stays visible in the Route Simulator's list
   * for comparison without needing any separate synthetic "comparison" row.
   * Only one new row appears: the copy being edited. "Save" persists into
   * this copy specifically (never the original); "Activate" promotes it to
   * the voyage's new active route and archives every other inactive route
   * into "All Routes"; "Discard" deletes this throwaway copy entirely.
   * From an empty route, this simply unlocks the map to plot a new one (no
   * copy to make yet).
   */
  const startEditDuplicate = () => {
    if (waypoints.length > 0 && voyageId) {
      setOriginalRoute(waypoints.map((wp) => ({ ...wp })));
      const loadedRouteId = resolveLoadedRouteId(voyageId);
      const realName =
        (loadedRouteId && savedRoutes.find((r) => r.id === loadedRouteId)?.name) ||
        routeName.trim() ||
        'Route';
      const copyName = `Edit of ${realName}`;
      const canonicalWaypoints = waypoints.map((wp) => ({ ...wp, lon: canonicalLongitudeLabel(wp.lon) }));
      const copy = appendSavedRoute({
        id: uniqueId('route'),
        name: copyName,
        savedAt: new Date().toISOString(),
        waypoints: canonicalWaypoints,
      });
      writeRouteEditorRouteId(voyageId, copy.id);
      setRouteName(copyName);
      bumpSavedRoutes();
    }
    // Fresh undo/redo history for this edit session — any leftover history
    // from an earlier (already-saved or discarded) session shouldn't be
    // reachable from here.
    resetWaypoints(waypoints);
    setEditMode(true);
    setSideCollapsed(false);
  };

  /**
   * Keep the edited route (stays live/editable on the map, and durably
   * persists whatever hasn't been explicitly Saved yet — Activate should
   * never silently lose unsaved work) and promote it to this voyage's new
   * active route. Every *other* non-active saved route (including the now-
   * superseded original) is archived into "All Routes" instead of staying
   * in the active list — a deliberate "this is now the route" action, so it
   * also turns this voyage's "Auto Route" off immediately.
   */
  const activateEdit = () => {
    if (voyageId && waypoints.length >= 2) {
      // Always persist first — covers both updating the existing "Edit of
      // X" copy, *and* the edge case of editing a route built entirely
      // from scratch during this session with no interim Save click yet,
      // where `editorId` isn't set at all until this very call creates it
      // (see `persistRouteToSavedEntry`'s own create-if-missing fallback).
      persistRouteToSavedEntry(waypoints);
      const editorId = readRouteEditorRouteId(voyageId);
      if (editorId) {
        archiveOtherSavedRoutes(voyageId, editorId);
        writeActiveRouteId(voyageId, editorId);
      }
      mergeVoyageShared(voyageId, { leg1AutoRoute: false });
    }
    setEditMode(false);
    setOriginalRoute(null);
    setPlotMode(false);
  };

  /** Discard the edits: delete the throwaway "Edit of X" copy entirely,
   *  restore the original route on the map, and re-lock the editor. */
  const discardEdit = () => {
    if (voyageId) {
      const editorId = readRouteEditorRouteId(voyageId);
      const activeId = readActiveRouteId(voyageId)?.replace(/^saved-/, '') ?? null;
      if (editorId && editorId !== activeId) {
        writeSavedRoutes(readAllSavedRoutes().filter((r) => r.id !== editorId));
        setSavedRoutes(readSavedRoutes(voyageId));
      }
      // Clearing this lets `loadRouteForVoyage` fall back to `activeId` (the
      // untouched original) on its own, rather than pointing at a copy that
      // no longer exists.
      writeRouteEditorRouteId(voyageId, null);
      bumpSavedRoutes();
    }
    if (originalRoute) {
      suppressManualRouteMarkRef.current = true; // reverting, not a new edit
      resetWaypoints(originalRoute);
      setSelected([]);
    }
    setEditMode(false);
    setOriginalRoute(null);
    setPlotMode(false);
  };

  // --- Duplicate & Edit bridge -------------------------------------
  // The button lives in the Route Simulator panel; it issues commands here and
  // we report whether an edit is in progress so the panel can show Activate /
  // Discard.
  useEffect(() => {
    setRouteEditActive(editMode);
  }, [editMode]);
  useEffect(() => () => setRouteEditActive(false), []);

  const editCommand = useRouteEditCommand();
  const lastEditNonceRef = useRef(0);
  useEffect(() => {
    if (!editCommand || editCommand.nonce === lastEditNonceRef.current) return;
    lastEditNonceRef.current = editCommand.nonce;
    if (editCommand.action === 'start') startEditDuplicate();
    else if (editCommand.action === 'activate') activateEdit();
    else if (editCommand.action === 'discard') discardEdit();
      else if (editCommand.action === 'clear') clearRoute();
      else if (editCommand.action === 'save') saveRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editCommand]);

  const updateWaypoint = <K extends keyof Waypoint>(
    id: string,
    key: K,
    value: Waypoint[K],
  ) => {
    if (isWaypointLocked(id) && (key === 'lat' || key === 'lon')) return;
    setWaypoints((prev) =>
      recomputeGeometry(prev.map((wp) => (wp.id === id ? { ...wp, [key]: value } : wp))),
    );
    // The first waypoint's ETD is the voyage's single shared departure time —
    // editing it here also updates the Tracksheet's Departure/COSP report and
    // CP & Leg Details' LEG-1 ETD (see data/voyageOverrides.ts `etdIso`).
    if (key === 'eta' && waypoints[0]?.id === id && typeof value === 'string') {
      mergeVoyageShared(selectedVoyage?.id, { etdIso: value });
    }
  };

  // Keep the first waypoint's ETD mirrored to the shared voyage ETD, so it
  // stays connected to the Tracksheet's Departure/COSP report and CP & Leg
  // Details' LEG-1 ETD. The first time nothing has been shared yet, adopt
  // whatever this route (or the voyage) already has as the starting value —
  // after that, the shared value always wins.
  useEffect(() => {
    const voyageId = selectedVoyage?.id;
    const sync = () => {
      const shared = loadVoyageShared(voyageId)?.etdIso;
      // Silent: mirroring the shared ETD is a background sync, not a
      // deliberate edit — it shouldn't show up as its own undo step.
      setWaypointsSilently((prev) => {
        if (prev.length === 0) return prev;
        const effective = shared || prev[0].eta || selectedVoyage?.etdIso || '';
        if (!effective || prev[0].eta === effective) return prev;
        return recomputeGeometry(
          prev.map((wp, i) => (i === 0 ? { ...wp, eta: effective } : wp)),
        );
      });
      if (!shared) {
        const bootstrap = waypoints[0]?.eta || selectedVoyage?.etdIso;
        if (bootstrap) mergeVoyageShared(voyageId, { etdIso: bootstrap });
      }
    };
    sync();
    return subscribeVoyageShared(voyageId, sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVoyage?.id]);

  return (
    <div className="fv-route">
      {/* Route editor map -------------------------------------------- */}
      <section className="fv-route__section">
        <header className="fv-route__section-header">
          <h2>{t('routeSimulator', 'Route Simulator')}</h2>
          <div className="fv-route__bulk">
            <button
              type="button"
              className="fv-route__icon-btn"
              onClick={undoWaypoints}
              disabled={!editMode || !canUndoWaypoints}
              title={t('undoRouteChange', 'Undo last route change')}
              aria-label={t('undoRouteChange', 'Undo last route change')}
            >
              <i className="fas fa-rotate-left" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="fv-route__icon-btn"
              onClick={redoWaypoints}
              disabled={!editMode || !canRedoWaypoints}
              title={t('redoRouteChange', 'Redo route change')}
              aria-label={t('redoRouteChange', 'Redo route change')}
            >
              <i className="fas fa-rotate-right" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="fv-route__icon-btn"
              onClick={() => requestMapCenterOnVessel()}
              disabled={!vesselPos}
              title={t('centerOnVessel', "Center map on the vessel's position")}
              aria-label={t('centerOnVessel', "Center map on the vessel's position")}
            >
              <i className="fas fa-ship" aria-hidden="true" />
            </button>
            {/* Portal target for the Route Simulator panel's own route-
                management buttons (bookmark/import/export/merge/split/
                duplicate-edit/...) — see `useRoutesToolbarSlot` — so they sit
                in this same row instead of their own row further down. */}
            <div
              className="fv-route__routes-toolbar-slot"
              ref={(el) => setRoutesToolbarSlot(el)}
            />
            <button
              type="button"
              className="fv-route__btn fv-route__btn--primary"
              onClick={saveWaypointDraft}
              disabled={!isWaypointDraftDirty && !hasRouteChangedSinceEdit}
              title={
                isWaypointDraftDirty || hasRouteChangedSinceEdit
                  ? t('saveRouteHint', 'Save every change made in this edit (waypoints, speed/RPM/MCR, inserts/deletes, ...) back to the route.')
                  : t('noUnsavedChanges', 'No unsaved route changes.')
              }
            >
              <i className="fas fa-check" aria-hidden="true" /> {t('save', 'Save')}
            </button>
            <button
              type="button"
              className="fv-route__btn"
              onClick={discardWaypointDraft}
              disabled={!isWaypointDraftDirty && !hasRouteChangedSinceEdit}
              title={t('discardRouteHint', 'Discard every unsaved change made in this edit.')}
            >
              <i className="fas fa-rotate-left" aria-hidden="true" /> {t('discard', 'Discard')}
            </button>
            <button
              type="button"
              className="fv-route__btn"
              onClick={insertCheckedWaypoint}
              disabled={!editMode || waypoints.length === 0}
              title={t('insertWaypointHint', 'Insert a new waypoint after the last checked one (or at the end).')}
            >
              <i className="fas fa-plus" aria-hidden="true" /> {t('insert', 'Insert')}
            </button>
            <button
              type="button"
              className="fv-route__btn"
              onClick={setSpeedForChecked}
              disabled={!editMode || checkedIds.length === 0}
              title={t('setSpeedEngineHint', 'Set speed/RPM/MCR for the checked waypoints.')}
            >
              <i className="fas fa-gauge-high" aria-hidden="true" /> {t('setSpeedEngine', 'Set speed/RPM/MCR')}
            </button>
            <button
              type="button"
              className="fv-route__btn fv-route__btn--danger"
              onClick={deleteCheckedWaypoints}
              disabled={!editMode || checkedIds.length === 0}
              title={
                !editMode
                  ? t('enableEditModeHint', 'Turn on route edit mode to make changes.')
                  : checkedIds.length > 0
                    ? t('deleteSelectedWaypointsHint', 'Delete all checked waypoints at once.')
                    : t(
                        'selectWaypointsToDeleteHint',
                        'Check one or more waypoints below to delete them together.',
                      )
              }
            >
              <i className="fas fa-trash" aria-hidden="true" /> {t('deleteSelected', 'Delete selected')}
            </button>
            <button
              type="button"
              className="fv-route__btn"
              onClick={() => {
                setUploadRouteError('');
                setAddRouteModalOpen(true);
              }}
              title={t('addNewRouteHint', 'Plot a route manually, generate one between two ports, or upload a route file.')}
            >
              <i className="fas fa-plus" aria-hidden="true" /> {t('addNewRoute', 'Add New Route')}
            </button>
            <input
              ref={uploadRouteInputRef}
              type="file"
              accept=".json,.geojson,.csv,.txt,.rtz,.xml,.gpx,.kml"
              style={{ display: 'none' }}
              onChange={onUploadRouteFile}
            />
          </div>
        </header>

        <div className="fv-route__map-layout">
          <div
            className={`fv-route__side-col${
              sideCollapsed ? ' fv-route__side-col--collapsed' : ''
            }`}
          >
          <aside className="fv-route__side-panel" aria-label={t('waypointDetails', 'Waypoint details')}>
            <header className="fv-route__side-head">
              <h3>
                <i className="fas fa-route" aria-hidden="true" />{' '}
                {t('waypointDetails', 'Waypoint details')}
              </h3>
              <span className="fv-route__side-count">{waypoints.length}</span>
              <button
                type="button"
                className="fv-route__side-toggle"
                onClick={() => setSideCollapsed((prev) => !prev)}
                aria-expanded={!sideCollapsed}
                title={
                  sideCollapsed
                    ? t('showWaypointDetails', 'Show waypoint details')
                    : t('hideWaypointDetails', 'Hide waypoint details')
                }
                aria-label={
                  sideCollapsed
                    ? t('showWaypointDetails', 'Show waypoint details')
                    : t('hideWaypointDetails', 'Hide waypoint details')
                }
              >
                <i
                  className={`fas ${sideCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`}
                  aria-hidden="true"
                />
              </button>
            </header>
            {!sideCollapsed && (
            <>
            <div className="fv-route__side-scroll">
              {waypoints.length === 0 ? (
                <p className="fv-route__side-empty">{t('noPoints', 'No points yet.')}</p>
              ) : (
                <table className="fv-route__side-table">
                  <thead>
                    <tr>
                      <th className="fv-route__side-check">
                        <input
                          type="checkbox"
                          checked={
                            waypoints.length > 0 && checkedIds.length === waypoints.length
                          }
                          ref={(el) => {
                            if (el)
                              el.indeterminate =
                                checkedIds.length > 0 &&
                                checkedIds.length < waypoints.length;
                          }}
                          onChange={toggleAllChecked}
                          aria-label={t('selectAllWaypoints', 'Select all waypoints')}
                        />
                      </th>
                      <th>#</th>
                      <th>{t('lat', 'Lat')}</th>
                      <th>{t('lon', 'Lon')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waypoints.map((wp, idx) => (
                      <Fragment key={wp.id}>
                        <tr
                          className={selected.includes(wp.id) ? 'fv-route__side-row--selected' : ''}
                          onClick={(e) => {
                            if (applyRangeSelect(wp.id, e.shiftKey)) return;
                            rangeAnchorIdRef.current = wp.id;
                            rangeAnchorModeRef.current = 'check';
                            setSelected(selected[0] === wp.id ? [] : [wp.id]);
                          }}
                        >
                          <td
                            className="fv-route__side-check"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={checkedIds.includes(wp.id)}
                              onChange={(e) => {
                                // Shift+click range-checks (or, per
                                // `rangeAnchorModeRef`, range-unchecks) from
                                // the last plain-clicked row (anywhere —
                                // list or map) through this one, instead of
                                // just toggling this single checkbox.
                                // Decided here (not in a separate onClick +
                                // preventDefault) since React tracks a
                                // checkbox's native click to drive
                                // onChange — trying to intercept and cancel
                                // that beforehand is unreliable and can race
                                // with this handler, leaving the range's own
                                // end point toggled back off. `nativeEvent`
                                // is the MouseEvent that triggered the
                                // click, so its `shiftKey` is still
                                // available here.
                                const shiftKey = (e.nativeEvent as MouseEvent).shiftKey;
                                if (shiftKey && applyRangeSelect(wp.id, true)) return;
                                rangeAnchorIdRef.current = wp.id;
                                // This checkbox's own new state (the
                                // opposite of its state just before this
                                // click) becomes the range mode for a
                                // subsequent Shift-click — so unchecking
                                // this one, then Shift-clicking another,
                                // range-unchecks everything in between.
                                rangeAnchorModeRef.current = checkedIds.includes(wp.id) ? 'uncheck' : 'check';
                                toggleWaypointChecked(wp.id);
                              }}
                              aria-label={t('selectWaypoint', 'Select waypoint')}
                            />
                          </td>
                          <td className="fv-route__side-row-num">
                            {wp.isPort ? (
                              <i
                                className={`fas ${
                                  idx === 0 ? 'fa-anchor-circle-check' : 'fa-anchor'
                                }`}
                                aria-hidden="true"
                              />
                            ) : (
                              idx + 1
                            )}
                          </td>
                          <td>{wp.lat}</td>
                          <td>{wp.lon}</td>
                        </tr>
                        {/* Expands inline, right after whichever waypoint is
                            actually selected — preserving the list's natural
                            order — rather than relocating to a fixed spot.
                            `selectedWaypoint &&` first: if it's undefined (stale
                            selection, or a waypoint with a missing/undefined id
                            from legacy saved-route data), never fall through to
                            `undefined === wp.id`, which could spuriously match a
                            malformed waypoint and crash reading `.name` below.
                            Guard with both `selectedWaypoint` (never spuriously
                            match a malformed waypoint with an undefined id —
                            see the sanitizeWaypointIds fix) and `waypointDraft`
                            (the draft is only populated once selection settles).
                            The list auto-scrolls up to bring this row into view
                            (see the ref'd scroll effect above) instead of
                            requiring the user to find it manually. */}
                        {selectedWaypoint && waypointDraft && selectedWaypoint.id === wp.id && (
                          <tr ref={waypointDetailRef} className="fv-route__wp-detail-row-cell">
                            <td colSpan={4}>
                              <div className="fv-route__wp-detail">
                                <div className="fv-route__wp-detail-head">
                                  <i className="fas fa-location-dot" aria-hidden="true" />{' '}
                                  {t('waypointDetails', 'Waypoint details')}
                                </div>
                                <label className="fv-route__wp-detail-field">
                                  <span>{t('waypointName', 'Waypoint')}</span>
                                  <input
                                    type="text"
                                    value={waypointDraft.name}
                                    disabled={!editMode}
                                    onChange={(e) => setDraftField('name', e.target.value)}
                                  />
                                </label>
                                <div className="fv-route__wp-detail-row">
                                  <label className="fv-route__wp-detail-field">
                                    <span>{t('lat', 'Lat')}</span>
                                    <input
                                      type="text"
                                      value={waypointDraft.lat}
                                      disabled={!editMode || isWaypointLocked(selectedWaypoint.id)}
                                      onChange={(e) => setDraftField('lat', e.target.value)}
                                    />
                                  </label>
                                  <label className="fv-route__wp-detail-field">
                                    <span>{t('lon', 'Lon')}</span>
                                    <input
                                      type="text"
                                      value={waypointDraft.lon}
                                      disabled={!editMode || isWaypointLocked(selectedWaypoint.id)}
                                      onChange={(e) => setDraftField('lon', e.target.value)}
                                    />
                                  </label>
                                </div>
                                <div className="fv-route__wp-detail-row">
                                  <label className="fv-route__wp-detail-field">
                                    <span>{t('course', 'Course')}</span>
                                    <input
                                      type="number"
                                      value={waypointDraft.course}
                                      disabled={!editMode}
                                      onChange={(e) =>
                                        setDraftField('course', Number(e.target.value) || 0)
                                      }
                                    />
                                  </label>
                                  <label className="fv-route__wp-detail-field">
                                    <span>{t('speed', 'Speed')}</span>
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={waypointDraft.speed}
                                      disabled={!editMode || waypointDraft.drift}
                                      onChange={(e) =>
                                        setDraftField('speed', Number(e.target.value) || 0)
                                      }
                                    />
                                  </label>
                                </div>
                                <div className="fv-route__wp-detail-row">
                                  <label className="fv-route__wp-detail-field">
                                    <span>{t('minRpm', 'Min RPM')}</span>
                                    <input
                                      type="number"
                                      min="0"
                                      value={waypointDraft.rpmMin ?? ''}
                                      disabled={!editMode}
                                      onChange={(e) =>
                                        setDraftField(
                                          'rpmMin',
                                          e.target.value === '' ? undefined : Number(e.target.value),
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="fv-route__wp-detail-field">
                                    <span>{t('maxRpm', 'Max RPM')}</span>
                                    <input
                                      type="number"
                                      min="0"
                                      value={waypointDraft.rpmMax ?? ''}
                                      disabled={!editMode}
                                      onChange={(e) =>
                                        setDraftField(
                                          'rpmMax',
                                          e.target.value === '' ? undefined : Number(e.target.value),
                                        )
                                      }
                                    />
                                  </label>
                                </div>
                                <div className="fv-route__wp-detail-row">
                                  <label className="fv-route__wp-detail-field">
                                    <span>{t('minMcr', 'Min MCR (%)')}</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={waypointDraft.mcrMin ?? ''}
                                      disabled={!editMode}
                                      onChange={(e) =>
                                        setDraftField(
                                          'mcrMin',
                                          e.target.value === '' ? undefined : Number(e.target.value),
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="fv-route__wp-detail-field">
                                    <span>{t('maxMcr', 'Max MCR (%)')}</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={waypointDraft.mcrMax ?? ''}
                                      disabled={!editMode}
                                      onChange={(e) =>
                                        setDraftField(
                                          'mcrMax',
                                          e.target.value === '' ? undefined : Number(e.target.value),
                                        )
                                      }
                                    />
                                  </label>
                                </div>
                                <label className="fv-route__wp-detail-field">
                                  <span>
                                    {waypoints[0]?.id === selectedWaypoint.id
                                      ? t('etd', 'ETD')
                                      : t('eta', 'ETA')}
                                  </span>
                                  <input
                                    type="datetime-local"
                                    value={waypointDraft.eta}
                                    readOnly={waypoints[0]?.id !== selectedWaypoint.id}
                                    disabled={!editMode || waypoints[0]?.id !== selectedWaypoint.id}
                                    title={
                                      waypoints[0]?.id === selectedWaypoint.id
                                        ? t('etdHint', 'Departure time (ETD) — shared with the Tracksheet\'s Departure/COSP report and CP & Leg Details.')
                                        : t('etaComputedHint', 'Calculated from distance, speed and any drift ahead.')
                                    }
                                    onChange={(e) => setDraftField('eta', e.target.value)}
                                  />
                                </label>
                                <label className="fv-route__toggle-switch">
                                  <input
                                    type="checkbox"
                                    checked={waypointDraft.drift}
                                    disabled={!editMode}
                                    onChange={(e) => setDraftField('drift', e.target.checked)}
                                  />
                                  <span className="fv-route__toggle-switch-track" aria-hidden="true" />
                                  <span>
                                    {waypointDraft.drift ? t('drift', 'Drift') : t('sail', 'Sail')}
                                  </span>
                                </label>
                                {waypointDraft.drift && (
                                  <label className="fv-route__wp-detail-field">
                                    <span>
                                      {t('driftUntil', 'Drift until')}
                                      {driftDurationLabel && (
                                        <span className="fv-route__drift-duration">
                                          {' '}
                                          ({t('driftDuration', 'drifting')} {driftDurationLabel})
                                        </span>
                                      )}
                                    </span>
                                    <input
                                      type="datetime-local"
                                      value={waypointDraft.driftUntil ?? ''}
                                      disabled={!editMode}
                                      onChange={(e) =>
                                        setDraftField('driftUntil', e.target.value || undefined)
                                      }
                                    />
                                  </label>
                                )}
                                {waypoints[waypoints.length - 1]?.id !== selectedWaypoint.id && (
                                  <label className="fv-route__wp-detail-field">
                                    <span>{t('legToNext', 'Leg to next')}</span>
                                    <select
                                      value={waypointDraft.legType ?? 'rhumb'}
                                      disabled={!editMode}
                                      onChange={(e) => {
                                        const legType = e.target.value as 'rhumb' | 'greatcircle';
                                        setDraftField('legType', legType);
                                        // Applied immediately (not gated behind
                                        // Save like the other fields above) —
                                        // it's a discrete, instantly-reversible
                                        // choice rather than a free-typed value
                                        // that could change mid-keystroke, so
                                        // the route shape and every distance/
                                        // cost figure below should reflect it
                                        // the moment it's picked.
                                        updateWaypoint(selectedWaypoint.id, 'legType', legType);
                                      }}
                                    >
                                      <option value="rhumb">
                                        {t('rhumbLine', 'Rhumb line (straight)')}
                                      </option>
                                      <option value="greatcircle">
                                        {t('greatCircle', 'Great circle')}
                                      </option>
                                    </select>
                                  </label>
                                )}
                                <button
                                  type="button"
                                  className="fv-route__btn fv-route__btn--danger"
                                  onClick={() => deletePoint(selectedWaypoint.id)}
                                  disabled={!editMode || selectedWaypoint.isPort || isWaypointLocked(selectedWaypoint.id)}
                                >
                                  <i className="fas fa-trash" aria-hidden="true" />{' '}
                                  {t('delete', 'Delete')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            </>
            )}
          </aside>
          </div>

          <div className="fv-route__map-col">
          <div className="fv-route__map-wrap">
            <div className="fv-route__map-actions">
              <button
                type="button"
                className="fv-route__btn"
                onClick={() => {
                  setOptDialogInitialRouteKey(undefined);
                  setOptDialogOpen(true);
                }}
              >
                <i className="fas fa-wand-magic-sparkles" aria-hidden="true" />{' '}
                {t('optimize', 'Optimize')}
              </button>
              <button
                type="button"
                className="fv-route__btn"
                onClick={viewOnMarineTraffic}
                title={
                  selectedVoyage?.vessel
                    ? t('viewVesselOnMt', 'View {vessel} on MarineTraffic').replace(
                        '{vessel}',
                        selectedVoyage.vessel,
                      )
                    : t('viewOnMt', 'View on MT')
                }
              >
                <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" />{' '}
                {t('viewOnMt', 'View on MT')}
              </button>
              <MapWeatherLegendBar />
            </div>
            <RouteEditorMap
              points={mapPoints}
              plotMode={plotMode}
              editable={editMode}
              selected={selected}
              checkedIds={checkedIds}
              vesselFallbackPos={vesselPos}
              routes={overlayRoutes}
              selectedRouteId={selectedRouteId}
              shipMarkers={allShipMarkers}
              reportMarkers={reportMarkers}
              reportSpeedOptions={reportSpeedOptions}
              defaultReportFuelType={defaultReportFuelType}
              onSetReportSpeed={onSelectReportSpeed}
              onSetReportFuel={onSelectReportFuel}
              onApplyReportCriteria={onApplyReportCriteria}
              plannedRouteColor={plannedColor}
              activeWaypoints={activeWaypoints}
              onSelectRoute={setSelectedRouteId}
              onSelectPoint={selectWaypointFromMap}
              onAddPoint={addPointFromMap}
              onInsertPoint={insertPointFromMap}
              onMovePoint={moveWaypoint}
              onMovePointPreview={moveWaypointPreview}
              onDeletePoint={deletePoint}
              legendBarInHostToolbar
            />
            {optimizing && (
              <div className="fv-route__map-overlay" role="status" aria-live="polite">
                <div className="fv-route__spinner" aria-hidden="true" />
                <span className="fv-route__spinner-label">
                  {t('optimizingRoute', 'Optimizing route…')}
                </span>
              </div>
            )}
            {!optimizing &&
              routeResults &&
              routeResults.length > 0 &&
              // Suppress the chooser entirely for a run that's about to be
              // (or just was) auto-applied — both the silent default-route
              // and the manual "Generate route" flows auto-pick the shortest
              // candidate now instead of asking the user to choose one.
              autoGenRunIdRef.current !== optimizeRunRef.current &&
              pendingManualGenRunIdRef.current !== optimizeRunRef.current && (
              <div className="fv-route__map-status fv-route__map-status--done" role="status">
                <div className="fv-route__opt-head">
                  <i className="fas fa-route" aria-hidden="true" />{' '}
                  {t('chooseRoute', 'Choose a route')}
                </div>
                <div
                  className="fv-route__opt-choices"
                  role="radiogroup"
                  aria-label={t('chooseRoute', 'Choose a route')}
                >
                  {routeResults.map((r) => {
                    const isSel = r.id === selectedRouteId;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        role="radio"
                        aria-checked={isSel}
                        className={`fv-route__opt-choice${
                          isSel ? ' fv-route__opt-choice--active' : ''
                        }`}
                        onClick={() => setSelectedRouteId(r.id)}
                      >
                        <span
                          className="fv-route__opt-swatch"
                          style={{ borderTopColor: r.color }}
                        />
                        <span className="fv-route__opt-choice-main">
                          <span className="fv-route__opt-choice-label">
                            {t(`routeVariant.${r.id}`, r.label)}
                          </span>
                          <span className="fv-route__opt-choice-desc">
                            {t(`routeVariant.${r.id}.desc`, r.description)}
                          </span>
                        </span>
                        <span className="fv-route__opt-choice-metrics">
                          <span>
                            {Math.round(r.info.distanceNm).toLocaleString()}{' '}
                            {t('nmUnit', 'NM')}
                          </span>
                          <span>
                            {Math.round(r.info.fuelTons).toLocaleString()}{' '}
                            {t('fuelTonsUnit', 't fuel')}
                          </span>
                          <span
                            className="fv-route__opt-choice-eta"
                            title={`${t('eta', 'ETA')}: ${new Date(
                              Date.now() + transitHours(r.info.distanceNm) * 3600000,
                            ).toLocaleString()} · ${SERVICE_SPEED_KN} ${t('knots', 'kn')}`}
                          >
                            <i className="fas fa-clock" aria-hidden="true" />{' '}
                            {formatDuration(transitHours(r.info.distanceNm))}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="fv-route__opt-apply"
                  onClick={applySelectedRoute}
                  disabled={!selectedRoute}
                >
                  <i className="fas fa-check" aria-hidden="true" />{' '}
                  {t('useThisRoute', 'Use this route')}
                </button>
              </div>
            )}
            {plotMode && (
              <div className="fv-route__map-hint">
                <i className="fas fa-info-circle" aria-hidden="true" />{' '}
                {t(
                  'plotBanner',
                  'Click empty sea to add a waypoint at the end, or click the route line to insert one in between. Drag pins to adjust.',
                )}
              </div>
            )}
          </div>
          </div>
        </div>
      </section>

      <OptimizationRunDialog
        open={optDialogOpen}
        onClose={() => setOptDialogOpen(false)}
        initialRouteKey={optDialogInitialRouteKey}
      />

      {addRouteModalOpen && (
        <div
          className="fv-route__modal-overlay"
          role="presentation"
          onClick={() => setAddRouteModalOpen(false)}
        >
          <div
            className="fv-route__modal"
            role="dialog"
            aria-modal="true"
            aria-label={t('addNewRoute', 'Add New Route')}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="fv-route__modal-head">
              <h3>
                <i className="fas fa-plus" aria-hidden="true" /> {t('addNewRoute', 'Add New Route')}
              </h3>
              <button
                type="button"
                className="fv-route__modal-close"
                onClick={() => setAddRouteModalOpen(false)}
                aria-label={t('close', 'Close')}
              >
                <i className="fas fa-xmark" aria-hidden="true" />
              </button>
            </header>
            <div className="fv-route__add-route-options">
              <button type="button" className="fv-route__add-route-option" onClick={createRouteManually}>
                <i className="fas fa-map-marker-alt" aria-hidden="true" />
                <span>
                  <strong>{t('plotManually', 'Plot manually on map')}</strong>
                  <small>
                    {t('plotManuallyDesc', 'Click on the map to add waypoints one at a time.')}
                  </small>
                </span>
              </button>
              <button type="button" className="fv-route__add-route-option" onClick={openPortToPortGenerator}>
                <i className="fas fa-wand-magic-sparkles" aria-hidden="true" />
                <span>
                  <strong>{t('generateBetweenPorts', 'Generate between two ports')}</strong>
                  <small>
                    {t(
                      'generateBetweenPortsDesc',
                      'Enter a departure and arrival port and generate a land-avoiding route.',
                    )}
                  </small>
                </span>
              </button>
              <button type="button" className="fv-route__add-route-option" onClick={openUploadRouteFile}>
                <i className="fas fa-upload" aria-hidden="true" />
                <span>
                  <strong>{t('uploadRouteFile', 'Upload route file')}</strong>
                  <small>
                    {t('uploadRouteFileDesc', 'Import waypoints from a JSON or CSV file.')}
                  </small>
                </span>
              </button>
              {uploadRouteError && (
                <span className="fv-route__gen-error">{uploadRouteError}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {genModalOpen && (
        <div
          className="fv-route__modal-overlay"
          role="presentation"
          onClick={() => setGenModalOpen(false)}
        >
          <div
            className="fv-route__modal"
            role="dialog"
            aria-modal="true"
            aria-label={t('autoRoute', 'Generate Optimized Sea Route')}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="fv-route__modal-head">
              <h3>
                <i className="fas fa-wand-magic-sparkles" aria-hidden="true" />{' '}
                {t('autoRoute', 'Generate Optimized Sea Route')}
              </h3>
              <button
                type="button"
                className="fv-route__modal-close"
                onClick={() => setGenModalOpen(false)}
                aria-label={t('close', 'Close')}
              >
                <i className="fas fa-xmark" aria-hidden="true" />
              </button>
            </header>
            <div className="fv-route__gen">
              <label className="fv-route__gen-field">
                <span>
                  <i className="fas fa-anchor-circle-check" aria-hidden="true" />{' '}
                  {t('departure', 'Departure')}
                </span>
                <PortInput
                  ports={worldPorts}
                  placeholder={t('portOrLatLon', 'Port name or "lat, lon"')}
                  value={depInput}
                  onChange={setDepInput}
                />
              </label>
              <label className="fv-route__gen-field">
                <span>
                  <i className="fas fa-anchor" aria-hidden="true" /> {t('arrival', 'Arrival')}
                </span>
                <PortInput
                  ports={worldPorts}
                  placeholder={t('portOrLatLon', 'Port name or "lat, lon"')}
                  value={arrInput}
                  onChange={setArrInput}
                />
              </label>
              <button
                type="button"
                className="fv-route__btn fv-route__btn--primary"
                onClick={generateRoute}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <i className="fas fa-spinner fa-spin" aria-hidden="true" />{' '}
                    {t('generating', 'Generating…')}
                  </>
                ) : (
                  <>
                    <i className="fas fa-wand-magic-sparkles" aria-hidden="true" />{' '}
                    {t('generateRoute', 'Generate route')}
                  </>
                )}
              </button>
              {genError && (
                <span className="fv-route__gen-error">
                  <i className="fas fa-triangle-exclamation" aria-hidden="true" /> {genError}
                </span>
              )}
              {!genError && genWarnings.length > 0 && (
                <div className="fv-route__gen-warning">
                  {genWarnings.map((w, i) => (
                    <span key={i} className="fv-route__gen-warning-row">
                      <i className="fas fa-circle-info" aria-hidden="true" /> {w}
                    </span>
                  ))}
                </div>
              )}
              <span className="fv-route__gen-hint">
                {t(
                  'genHint',
                  'Builds the shortest open-water track that routes around land between the two points.',
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      {speedModalOpen && (
        <div
          className="fv-route__modal-overlay"
          role="presentation"
          onClick={() => setSpeedModalOpen(false)}
        >
          <div
            className="fv-route__modal fv-route__modal--sm"
            role="dialog"
            aria-modal="true"
            aria-label={t('setSpeedEngine', 'Set speed/RPM/MCR')}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="fv-route__modal-head">
              <h3>
                <i className="fas fa-gauge-high" aria-hidden="true" />{' '}
                {t('setSpeedEngine', 'Set speed/RPM/MCR')}
              </h3>
              <button
                type="button"
                className="fv-route__modal-close"
                onClick={() => setSpeedModalOpen(false)}
                aria-label={t('close', 'Close')}
              >
                <i className="fas fa-xmark" aria-hidden="true" />
              </button>
            </header>
            <form
              className="fv-route__gen"
              onSubmit={(e) => {
                e.preventDefault();
                applySpeedToChecked();
              }}
            >
              <p className="fv-route__gen-hint">
                {t('forSelectedWaypoints', 'For')} {checkedIds.length}{' '}
                {checkedIds.length === 1 ? t('waypoint', 'waypoint') : t('waypoints', 'waypoints')}
                . {t(
                  'setRpmMcrHint',
                  'Leave an RPM/MCR field blank to clear it. RPM/MCR take priority over Limits & Constraints when optimizing.',
                )}
              </p>
              <label className="fv-route__gen-field">
                <span>{t('speedKnots', 'Speed (knots)')}</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  autoFocus
                  value={speedInput}
                  onChange={(e) => setSpeedInput(e.target.value)}
                />
              </label>
              <div className="fv-route__gen-row">
                <label className="fv-route__gen-field">
                  <span>{t('minRpm', 'Min RPM')}</span>
                  <input
                    type="number"
                    min="0"
                    value={rpmMinInput}
                    onChange={(e) => setRpmMinInput(e.target.value)}
                  />
                </label>
                <label className="fv-route__gen-field">
                  <span>{t('maxRpm', 'Max RPM')}</span>
                  <input
                    type="number"
                    min="0"
                    value={rpmMaxInput}
                    onChange={(e) => setRpmMaxInput(e.target.value)}
                  />
                </label>
                <label className="fv-route__gen-field">
                  <span>{t('minMcr', 'Min MCR (%)')}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={mcrMinInput}
                    onChange={(e) => setMcrMinInput(e.target.value)}
                  />
                </label>
                <label className="fv-route__gen-field">
                  <span>{t('maxMcr', 'Max MCR (%)')}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={mcrMaxInput}
                    onChange={(e) => setMcrMaxInput(e.target.value)}
                  />
                </label>
              </div>
              <div className="fv-route__modal-actions">
                <button
                  type="button"
                  className="fv-route__btn"
                  onClick={() => setSpeedModalOpen(false)}
                >
                  {t('cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="fv-route__btn fv-route__btn--primary"
                  disabled={
                    !Number.isFinite(Number(speedInput)) || Number(speedInput) < 0
                  }
                >
                  <i className="fas fa-check" aria-hidden="true" /> {t('save', 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
