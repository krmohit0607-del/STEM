import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { PORT_COORDS } from '../data/fleet';
import { useWorldPorts, resolveWorldPort, type WorldPort } from '../data/ports';
import { type OptimizedRoute } from '../data/routeOptimizer';
import { ROUTE_VARIANTS, type RouteVariantMeta } from '../data/routeVariants';
import {
  setActiveSimRoute,
  setEditCompareRoute,
  setRouteEditActive,
  useMapCompareRoutes,
  useMapShipMarkers,
  useMapPlannedColor,
  useMapRouteWaypoints,
  useRouteEditCommand,
} from '../data/routeSimulatorStore';
import { RouteEditorMap, type EditorPoint, legPositions } from './RouteEditorMap';
import { bumpSavedRoutes } from '../data/optimizationStore';
import { OptimizationRunDialog } from './OptimizationRunDialog';
import { PortInput } from './PortInput';
import { useVesselPosition } from '../data/vesselPosition';

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

interface Waypoint {
  id: string;
  name: string;
  lat: string;
  lon: string;
  /** True course at this waypoint (deg). */
  course: number;
  /** Planned SOG departing this waypoint (kt). */
  speed: number;
  /** Distance from previous waypoint (NM). 0 for the first one. */
  distanceFromPrev: number;
  /** ETA at this waypoint (ISO local string for datetime-local). */
  eta: string;
  /** Drift until / sail toggle. False = sail (default). */
  drift: boolean;
  /** Whether this waypoint is a port (so it can be edited). */
  isPort: boolean;
  /**
   * How the leg *departing* this waypoint (to the next one) is drawn:
   * `'rhumb'` = constant-bearing straight line, `'greatcircle'` = shortest
   * great-circle arc. Defaults to `'rhumb'` when unset.
   */
  legType?: 'rhumb' | 'greatcircle';
}

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

interface SavedRoute {
  id: string;
  name: string;
  savedAt: string;
  waypoints: Waypoint[];
}

const SAVED_ROUTES_KEY = 'fv.savedRoutes';

function readSavedRoutes(): SavedRoute[] {
  try {
    const raw = window.localStorage.getItem(SAVED_ROUTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedRoute[]) : [];
  } catch {
    return [];
  }
}

function writeSavedRoutes(routes: SavedRoute[]): void {
  try {
    window.localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(routes));
  } catch {
    /* storage unavailable — ignore */
  }
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

/** Recompute `distanceFromPrev` + `course` for every waypoint from coords. */
function recomputeGeometry(list: Waypoint[]): Waypoint[] {
  return list.map((wp, i) => {
    const lat = dmToDec(wp.lat);
    const lon = dmToDec(wp.lon);
    if (i === 0 || Number.isNaN(lat) || Number.isNaN(lon)) {
      return { ...wp, distanceFromPrev: i === 0 ? 0 : wp.distanceFromPrev };
    }
    const prev = list[i - 1];
    const plat = dmToDec(prev.lat);
    const plon = dmToDec(prev.lon);
    if (Number.isNaN(plat) || Number.isNaN(plon)) return wp;
    return {
      ...wp,
      distanceFromPrev: Math.round(haversineNM(plat, plon, lat, lon)),
      course: bearingDeg(plat, plon, lat, lon),
    };
  });
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

  const [waypoints, setWaypoints] = useState<Waypoint[]>(STUB_WAYPOINTS);
  const [selected, setSelected] = useState<string[]>([]);
  const selectedWaypoint =
    selected.length === 1 ? waypoints.find((w) => w.id === selected[0]) : undefined;

  // Placeholder action for toolbar buttons whose endpoints are not wired yet.
  const notImplemented = (label: string) => () => {
    // eslint-disable-next-line no-console
    console.warn(`[STEM] '${label}' is not wired yet — see MIGRATION.md.`);
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
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>(() => readSavedRoutes());

  // The map route is locked by default; "Edit" enters edit mode on a duplicate
  // so the original stays visible for comparison until the edit is activated.
  const [editMode, setEditMode] = useState(false);
  const [originalRoute, setOriginalRoute] = useState<Waypoint[] | null>(null);

  // --- Auto sea-route generator ------------------------------------
  const [depInput, setDepInput] = useState(selectedVoyage?.portFrom ?? '');
  const [arrInput, setArrInput] = useState(selectedVoyage?.portTo ?? '');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const worldPorts = useWorldPorts();

  // "Generate Optimized Sea Route" popup, opened from the map "Optimize" button.
  const [genModalOpen, setGenModalOpen] = useState(false);
  // "Run Optimization" dialog (route/scenario/ETD/market factors).
  const [optDialogOpen, setOptDialogOpen] = useState(false);

  // Whether the Waypoint details side panel is collapsed. Minimized by
  // default; it opens automatically while editing the route (plot mode) or
  // when the user intentionally expands it.
  const [sideCollapsed, setSideCollapsed] = useState(true);

  useEffect(() => {
    if (plotMode) setSideCollapsed(false);
  }, [plotMode]);

  // Waypoints checked via the per-row checkbox in the details list.
  const [checkedIds, setCheckedIds] = useState<string[]>([]);

  // "Set speed" popup for the checked waypoints.
  const [speedModalOpen, setSpeedModalOpen] = useState(false);
  const [speedInput, setSpeedInput] = useState('12');

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
    setRouteResults(null);
    setSelectedRouteId(null);
    try {
      // Straight line from departure to arrival.
      const built: Waypoint[] = [
        {
          id: `wp-${Date.now()}-0`,
          name: `${from.name} (Departure)`,
          lat: decToDM(from.lat, true),
          lon: decToDM(from.lon, false),
          course: 0,
          speed: 12,
          distanceFromPrev: 0,
          eta: '',
          drift: false,
          isPort: true,
          legType: chooseLegType(from.lat, from.lon, to.lat, to.lon),
        },
        {
          id: `wp-${Date.now()}-1`,
          name: `${to.name} (Arrival)`,
          lat: decToDM(to.lat, true),
          lon: decToDM(to.lon, false),
          course: 0,
          speed: 12,
          distanceFromPrev: 0,
          eta: '',
          drift: false,
          isPort: true,
        },
      ];
      setWaypoints(recomputeGeometry(built));
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

  // Publish the pre-edit original as a comparison route so the simulator table
  // shows it as a separate row alongside the "Edit of …" route.
  useEffect(() => {
    if (!originalSim) {
      setEditCompareRoute(null);
      return;
    }
    setEditCompareRoute({
      id: 'original-compare',
      label: t('plannedRoute', 'Planned route'),
      color: '#8b949e',
      path: originalSim.path,
      distanceNm: originalSim.distanceNm,
      timeHours: originalSim.timeHours,
      etdIso: selectedVoyage?.etdIso,
    });
  }, [originalSim, selectedVoyage?.etdIso]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => setEditCompareRoute(null), []);

  const overlayRoutes = useMemo(
    () => [...mapRoutes, ...compareRoutes, ...originalOverlay],
    [mapRoutes, compareRoutes, originalOverlay],
  );

  // Vessel positions published by the simulator while it plays back.
  const shipMarkers = useMapShipMarkers();
  const plannedColor = useMapPlannedColor();
  const activeWaypoints = useMapRouteWaypoints();

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

  /** Replace the editable waypoints with the selected candidate route. */
  const applySelectedRoute = () => {
    const chosen = selectedRoute;
    if (!chosen || chosen.info.path.length < 2) return;
    const path = chosen.info.path;
    const last = path.length - 1;
    const stamp = Date.now();
    const built: Waypoint[] = path.map((pt, i) => ({
      id: `wp-${stamp}-${i}`,
      name:
        i === 0
          ? `${depInput || 'Departure'} (Departure)`
          : i === last
            ? `${arrInput || 'Arrival'} (Arrival)`
            : `${chosen.label} WP ${i}`,
      lat: decToDM(pt[0], true),
      lon: decToDM(pt[1], false),
      course: 0,
      speed: 12,
      distanceFromPrev: 0,
      eta: '',
      drift: false,
      isPort: i === 0 || i === last,
      legType:
        i === last
          ? 'rhumb'
          : chooseLegType(pt[0], pt[1], path[i + 1][0], path[i + 1][1]),
    }));
    setWaypoints(recomputeGeometry(built));
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
        cumulative += wp.distanceFromPrev;
        return {
          id: wp.id,
          name: wp.name,
          lat: dmToDec(wp.lat),
          lon: dmToDec(wp.lon),
          latLng: [dmToDec(wp.lat), dmToDec(wp.lon)] as [number, number],
          isPort: wp.isPort,
          drift: wp.drift,
          legType: wp.legType ?? 'rhumb',
          latLabel: wp.lat,
          lonLabel: wp.lon,
          distFromPrev: Math.round(wp.distanceFromPrev),
          distFromStart: Math.round(cumulative),
        };
      })
      .filter((p) => !Number.isNaN(p.lat) && !Number.isNaN(p.lon));
  }, [waypoints]);

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
    for (let i = 0; i < mapPoints.length - 1; i += 1) {
      const seg = legPositions(
        mapPoints[i],
        mapPoints[i + 1],
        mapPoints[i].legType ?? 'rhumb',
      ).map((p) => p as [number, number]);
      const rawSpeed = speedById.get(mapPoints[i].id) ?? 0;
      const legSpeed = rawSpeed > 0 ? rawSpeed : SERVICE_SPEED_KN;
      if (i === 0 && seg.length > 0) {
        path.push(seg[0]);
        timeHours.push(0);
      }
      for (let k = 1; k < seg.length; k += 1) {
        const prev = seg[k - 1];
        const curr = seg[k];
        cumHours += haversineNM(prev[0], prev[1], curr[0], curr[1]) / legSpeed;
        path.push(curr);
        timeHours.push(cumHours);
      }
    }
    if (path.length >= 2) {
      const distanceNm = waypoints.reduce((sum, wp) => sum + wp.distanceFromPrev, 0);
      const plannedLabel = t('plannedRoute', 'Planned route');
      setActiveSimRoute({
        id: 'active-planned',
        label: editMode ? `Edit of ${plannedLabel}` : plannedLabel,
        color: '#1f6feb',
        path,
        distanceNm: Math.round(distanceNm),
        timeHours,
        etdIso: selectedVoyage?.etdIso,
      });
    } else {
      setActiveSimRoute(null);
    }
  }, [mapPoints, waypoints, editMode, selectedVoyage?.etdIso]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => setActiveSimRoute(null), []);

  const addPointFromMap = (lat: number, lon: number) => {
    setWaypoints((prev) => {
      const next: Waypoint = {
        id: `wp-${Date.now()}`,
        name: `Waypoint ${prev.length + 1}`,
        lat: decToDM(lat, true),
        lon: decToDM(lon, false),
        course: 0,
        speed: prev[prev.length - 1]?.speed ?? 12,
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
      // Departure / arrival ports are fixed endpoints — keep them.
      if (!wp || wp.isPort) return prev;
      return recomputeGeometry(prev.filter((x) => x.id !== id));
    });
    setSelected((prev) => prev.filter((x) => x !== id));
  };

  const moveWaypoint = (id: string, lat: number, lon: number) => {
    setWaypoints((prev) =>
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
        id: `wp-${Date.now()}`,
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
        id: `wp-${Date.now()}`,
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
      recomputeGeometry(prev.filter((wp) => wp.isPort || !checkedIds.includes(wp.id))),
    );
    setSelected((prev) => prev.filter((id) => !checkedIds.includes(id)));
    setCheckedIds([]);
  };

  /** Open the "Set speed" popup for the checked waypoints. */
  const setSpeedForChecked = () => {
    if (checkedIds.length === 0) return;
    // Seed the field with the current speed if all checked waypoints share one.
    const speeds = new Set(
      waypoints.filter((wp) => checkedIds.includes(wp.id)).map((wp) => wp.speed),
    );
    setSpeedInput(speeds.size === 1 ? String([...speeds][0]) : '12');
    setSpeedModalOpen(true);
  };

  /** Apply the popup's speed (knots) to every checked waypoint. */
  const applySpeedToChecked = () => {
    const speed = Number(speedInput);
    if (!Number.isFinite(speed) || speed < 0) return;
    setWaypoints((prev) =>
      recomputeGeometry(
        prev.map((wp) => (checkedIds.includes(wp.id) ? { ...wp, speed } : wp)),
      ),
    );
    setSpeedModalOpen(false);
  };

  const saveRoute = () => {
    const name = routeName.trim() || `Route ${savedRoutes.length + 1}`;
    const route: SavedRoute = {
      id: `route-${Date.now()}`,
      name,
      savedAt: new Date().toISOString(),
      waypoints,
    };
    const next = [...savedRoutes, route];
    setSavedRoutes(next);
    writeSavedRoutes(next);
    setRouteName('');
  };

  const clearRoute = () => {
    setWaypoints([]);
    setSelected([]);
  };

  /**
   * Enter edit mode. When a route already exists it is duplicated: the original
   * is snapshotted and drawn faded on the map for comparison, and the copy is
   * edited. From an empty route this simply unlocks the map to plot a new one.
   */
  const startEditDuplicate = () => {
    if (waypoints.length > 0) {
      setOriginalRoute(waypoints.map((wp) => ({ ...wp })));
      setRouteName((n) => (n.trim() ? `${n.trim()} (copy)` : 'Route (copy)'));
    }
    setEditMode(true);
    setSideCollapsed(false);
  };

  /**
   * Keep the edited route (stays live/editable on the map) and preserve the
   * pre-edit original as a saved route so both remain available in the routes
   * list below for comparison — the operator can activate or delete either.
   */
  const activateEdit = () => {
    if (originalRoute && originalRoute.length >= 2) {
      const baseName =
        routeName.trim().replace(/\s*\(copy\)\s*$/i, '') || 'Planned route';
      const saved: SavedRoute = {
        id: `route-${Date.now()}`,
        name: `${baseName} (original)`,
        savedAt: new Date().toISOString(),
        waypoints: originalRoute,
      };
      const next = [...savedRoutes, saved];
      setSavedRoutes(next);
      writeSavedRoutes(next);
      bumpSavedRoutes();
    }
    setEditMode(false);
    setOriginalRoute(null);
    setPlotMode(false);
  };

  /** Discard the edits, restore the original route and re-lock the map. */
  const discardEdit = () => {
    if (originalRoute) {
      setWaypoints(originalRoute);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editCommand]);

  const updateWaypoint = <K extends keyof Waypoint>(
    id: string,
    key: K,
    value: Waypoint[K],
  ) => {
    setWaypoints((prev) =>
      prev.map((wp) => (wp.id === id ? { ...wp, [key]: value } : wp)),
    );
  };

  return (
    <div className="fv-route">
      {/* Route editor map -------------------------------------------- */}
      <section className="fv-route__section">
        <header className="fv-route__section-header">
          <h2>{t('routeEditor', 'Route Editor')}</h2>
          <div className="fv-route__bulk">
            <button
              type="button"
              className={`fv-route__btn${plotMode ? ' fv-route__btn--active' : ''}`}
              onClick={() => setPlotMode((p) => !p)}
              disabled={!editMode}
              title={
                editMode
                  ? t('plotHint', 'Click on the map to add waypoints')
                  : t('plotLockedHint', 'Click Edit to unlock the route first')
              }
            >
              <i className="fas fa-map-marker-alt" aria-hidden="true" />{' '}
              {plotMode ? t('plottingOn', 'Plotting…') : t('plotOnMap', 'Plot on map')}
            </button>
            <input
              type="text"
              className="fv-route__name-input"
              placeholder={t('routeNamePh', 'Route name')}
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
            />
            <button
              type="button"
              className="fv-route__btn"
              onClick={saveRoute}
              disabled={waypoints.length === 0}
            >
              <i className="fas fa-save" aria-hidden="true" /> {t('saveRoute', 'Save route')}
            </button>
            <button
              type="button"
              className="fv-route__btn fv-route__btn--danger"
              onClick={clearRoute}
              disabled={waypoints.length === 0}
            >
              <i className="fas fa-eraser" aria-hidden="true" /> {t('clear', 'Clear')}
            </button>
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
            <div className="fv-route__side-tools">
              <button
                type="button"
                className="fv-route__side-tool"
                onClick={insertCheckedWaypoint}
                disabled={waypoints.length === 0}
              >
                <i className="fas fa-plus" aria-hidden="true" /> {t('insert', 'Insert')}
              </button>
              <button
                type="button"
                className="fv-route__side-tool"
                onClick={deleteCheckedWaypoints}
                disabled={checkedIds.length === 0}
              >
                <i className="fas fa-trash" aria-hidden="true" /> {t('delete', 'Delete')}
              </button>
              <button
                type="button"
                className="fv-route__side-tool"
                onClick={setSpeedForChecked}
                disabled={checkedIds.length === 0}
              >
                <i className="fas fa-gauge-high" aria-hidden="true" /> {t('setSpeed', 'Set speed')}
              </button>
            </div>
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
                          onClick={() => setSelected(selected[0] === wp.id ? [] : [wp.id])}
                        >
                          <td
                            className="fv-route__side-check"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={checkedIds.includes(wp.id)}
                              onChange={() => toggleWaypointChecked(wp.id)}
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
                        {selectedWaypoint?.id === wp.id && (
                          <tr className="fv-route__wp-detail-row-cell">
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
                                    value={selectedWaypoint.name}
                                    onChange={(e) =>
                                      updateWaypoint(selectedWaypoint.id, 'name', e.target.value)
                                    }
                                  />
                                </label>
                                <div className="fv-route__wp-detail-row">
                                  <label className="fv-route__wp-detail-field">
                                    <span>{t('lat', 'Lat')}</span>
                                    <input
                                      type="text"
                                      value={selectedWaypoint.lat}
                                      onChange={(e) =>
                                        updateWaypoint(selectedWaypoint.id, 'lat', e.target.value)
                                      }
                                      onBlur={() => setWaypoints((prev) => recomputeGeometry(prev))}
                                    />
                                  </label>
                                  <label className="fv-route__wp-detail-field">
                                    <span>{t('lon', 'Lon')}</span>
                                    <input
                                      type="text"
                                      value={selectedWaypoint.lon}
                                      onChange={(e) =>
                                        updateWaypoint(selectedWaypoint.id, 'lon', e.target.value)
                                      }
                                      onBlur={() => setWaypoints((prev) => recomputeGeometry(prev))}
                                    />
                                  </label>
                                </div>
                                <div className="fv-route__wp-detail-row">
                                  <label className="fv-route__wp-detail-field">
                                    <span>{t('course', 'Course')}</span>
                                    <input
                                      type="number"
                                      value={selectedWaypoint.course}
                                      onChange={(e) =>
                                        updateWaypoint(
                                          selectedWaypoint.id,
                                          'course',
                                          Number(e.target.value) || 0,
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="fv-route__wp-detail-field">
                                    <span>{t('speed', 'Speed')}</span>
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={selectedWaypoint.speed}
                                      disabled={selectedWaypoint.drift}
                                      onChange={(e) =>
                                        updateWaypoint(
                                          selectedWaypoint.id,
                                          'speed',
                                          Number(e.target.value) || 0,
                                        )
                                      }
                                    />
                                  </label>
                                </div>
                                <label className="fv-route__wp-detail-field">
                                  <span>{t('eta', 'ETA')}</span>
                                  <input
                                    type="datetime-local"
                                    value={selectedWaypoint.eta}
                                    onChange={(e) =>
                                      updateWaypoint(selectedWaypoint.id, 'eta', e.target.value)
                                    }
                                  />
                                </label>
                                <label className="fv-route__wp-detail-toggle">
                                  <input
                                    type="checkbox"
                                    checked={selectedWaypoint.drift}
                                    onChange={(e) =>
                                      updateWaypoint(selectedWaypoint.id, 'drift', e.target.checked)
                                    }
                                  />
                                  <span>
                                    {selectedWaypoint.drift ? t('drift', 'Drift') : t('sail', 'Sail')}
                                  </span>
                                </label>
                                {waypoints[waypoints.length - 1]?.id !== selectedWaypoint.id && (
                                  <label className="fv-route__wp-detail-field">
                                    <span>{t('legToNext', 'Leg to next')}</span>
                                    <select
                                      value={selectedWaypoint.legType ?? 'rhumb'}
                                      onChange={(e) =>
                                        updateWaypoint(
                                          selectedWaypoint.id,
                                          'legType',
                                          e.target.value as 'rhumb' | 'greatcircle',
                                        )
                                      }
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
                                  disabled={selectedWaypoint.isPort}
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
                onClick={() => setOptDialogOpen(true)}
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
              <button
                type="button"
                className="fv-route__btn"
                onClick={notImplemented('Weather color code')}
              >
                <i className="fas fa-palette" aria-hidden="true" />{' '}
                {t('weatherColorCode', 'Weather color code')}
              </button>
            </div>
            <RouteEditorMap
              points={mapPoints}
              plotMode={plotMode}
              editable={editMode}
              selected={selected}
              routes={overlayRoutes}
              selectedRouteId={selectedRouteId}
              shipMarkers={allShipMarkers}
              plannedRouteColor={plannedColor}
              activeWaypoints={activeWaypoints}
              onSelectRoute={setSelectedRouteId}
              onAddPoint={addPointFromMap}
              onInsertPoint={insertPointFromMap}
              onMovePoint={moveWaypoint}
              onDeletePoint={deletePoint}
            />
            {optimizing && (
              <div className="fv-route__map-overlay" role="status" aria-live="polite">
                <div className="fv-route__spinner" aria-hidden="true" />
                <span className="fv-route__spinner-label">
                  {t('optimizingRoute', 'Optimizing route…')}
                </span>
              </div>
            )}
            {!optimizing && routeResults && routeResults.length > 0 && (
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

      <OptimizationRunDialog open={optDialogOpen} onClose={() => setOptDialogOpen(false)} />

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
            aria-label={t('setSpeed', 'Set speed')}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="fv-route__modal-head">
              <h3>
                <i className="fas fa-gauge-high" aria-hidden="true" />{' '}
                {t('setSpeed', 'Set speed')}
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
              <label className="fv-route__gen-field">
                <span>
                  {t('speedForSelected', 'Speed (knots) for')}{' '}
                  {checkedIds.length}{' '}
                  {checkedIds.length === 1
                    ? t('waypoint', 'waypoint')
                    : t('waypoints', 'waypoints')}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  autoFocus
                  value={speedInput}
                  onChange={(e) => setSpeedInput(e.target.value)}
                />
              </label>
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
