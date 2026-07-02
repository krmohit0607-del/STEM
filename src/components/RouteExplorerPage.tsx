import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { PORT_COORDS } from '../data/fleet';
import { useWorldPorts, resolveWorldPort, type WorldPort } from '../data/ports';
import {
  sampleEnvironment,
  type OptimizedRoute,
} from '../data/routeOptimizer';
import {
  ensureLiveData,
  sampleLiveField,
  getLiveDataTime,
  type LatLngBounds,
} from '../data/openMeteo';
import { ROUTE_VARIANTS, type RouteVariantMeta } from '../data/routeVariants';
import { RouteEditorMap, type EditorPoint } from './RouteEditorMap';
import { PortInput } from './PortInput';

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

const DEFAULT_VESSEL_NAME = 'MV Atlantic Voyager';
const DEFAULT_VESSEL_CLIENT = 'Acme Shipping (owner)';
const DEFAULT_VOYAGE_LABEL = 'Singapore → Rotterdam';
const DEFAULT_VOYAGE_REF = 'BL-88421';
const DEFAULT_VOYAGE_ETD = '12 Jun 2026, 13:30';

function formatNumber(n: number, fractionDigits = 0): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

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

/** Linearly interpolate a `[lat, lon]` polyline at fractional `progress`. */
function samplePath(
  path: Array<[number, number]>,
  progress: number,
): [number, number] {
  const last = path.length - 1;
  if (last < 0) return [0, 0];
  const p = Math.max(0, Math.min(last, progress));
  const i0 = Math.floor(p);
  const i1 = Math.min(last, i0 + 1);
  const t = p - i0;
  const [lat0, lon0] = path[i0];
  const [lat1, lon1] = path[i1];
  return [lat0 * (1 - t) + lat1 * t, lon0 * (1 - t) + lon1 * t];
}

/** How long a full play-through of the slowest route takes (ms). */
const SIM_PLAY_DURATION_MS = 12000;

/** Number of samples taken along each route for the weather-factor chart. */
const SIM_WEATHER_SAMPLES = 48;

/** Individual weather components the user can pick to compare. */
type WeatherFactorId = 'waves' | 'swell' | 'wind' | 'current';

interface WeatherFactorDef {
  id: WeatherFactorId;
  label: string;
  icon: string;
  /** Display unit for the factor's magnitude. */
  unit: string;
  /** Matching Open-Meteo factor id used for live data. */
  liveId: string;
}

const WEATHER_FACTORS: WeatherFactorDef[] = [
  { id: 'waves', label: 'Waves', icon: 'fa-water', unit: 'm', liveId: 'waves' },
  { id: 'swell', label: 'Swell', icon: 'fa-wave-square', unit: 'm', liveId: 'swell' },
  { id: 'wind', label: 'Wind', icon: 'fa-wind', unit: 'kn', liveId: 'wind' },
  {
    id: 'current',
    label: 'Current',
    icon: 'fa-arrows-turn-right',
    unit: 'kn',
    liveId: 'currents',
  },
];

const WEATHER_FACTOR_BY_ID: Record<WeatherFactorId, WeatherFactorDef> =
  Object.fromEntries(WEATHER_FACTORS.map((f) => [f.id, f])) as Record<
    WeatherFactorId,
    WeatherFactorDef
  >;

/**
 * Synthetic magnitude of a factor at a point, in its display unit (m or kn).
 * Used as a fallback while the live Open-Meteo grid is loading or when a
 * request fails (e.g. the marine API returns nothing over land).
 */
function factorMagnitudeSynthetic(
  lat: number,
  lon: number,
  factor: WeatherFactorId,
): number {
  const env = sampleEnvironment(lat, lon);
  switch (factor) {
    case 'waves':
      return env.waveHeight;
    case 'swell':
      return Math.max(0, env.waveHeight * 0.6 + 1.1 * Math.sin(lat * 0.12 - lon * 0.09));
    case 'wind':
      return env.windSpeed;
    case 'current':
      return Math.max(
        0,
        0.9 + 0.8 * Math.sin(lon * 0.14 + lat * 0.1) + 0.5 * Math.cos(lat * 0.07),
      );
    default:
      return 0;
  }
}

/**
 * Weather factor magnitude at a fractional position `frac` in [0, 1] along a
 * route. Prefers the live Open-Meteo value (bilinear-sampled from the cached
 * grid over `bounds`) and falls back to the synthetic field when live data is
 * unavailable, so routes can be compared on one factor at a time.
 */
function weatherAt(
  path: Array<[number, number]>,
  frac: number,
  factor: WeatherFactorDef,
  bounds: LatLngBounds | null,
  hour: number,
): number {
  const lastIdx = path.length - 1;
  const clamped = Math.max(0, Math.min(1, frac));
  const [lat, lon] = samplePath(path, clamped * lastIdx);
  if (bounds) {
    const live = sampleLiveField(lat, lon, factor.liveId, bounds, hour);
    if (live && Number.isFinite(live.magnitude)) return Math.max(0, live.magnitude);
  }
  return factorMagnitudeSynthetic(lat, lon, factor.id);
}

/** Whether the live grid for a factor has loaded over the given bounds. */
function isLiveLoaded(
  bounds: LatLngBounds | null,
  liveId: string,
  hour: number,
): boolean {
  if (!bounds) return false;
  const cLat = (bounds.north + bounds.south) / 2;
  const cLon = (bounds.west + bounds.east) / 2;
  return sampleLiveField(cLat, cLon, liveId, bounds, hour) != null;
}

export function RouteExplorerPage() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const selectedVoyage = useSelectedVoyage();
  const VESSEL_NAME = selectedVoyage?.vessel ?? DEFAULT_VESSEL_NAME;
  const VESSEL_CLIENT = selectedVoyage ? `${selectedVoyage.client} (owner)` : DEFAULT_VESSEL_CLIENT;
  const VOYAGE_LABEL = selectedVoyage
    ? `${selectedVoyage.portFrom} → ${selectedVoyage.portTo}`
    : DEFAULT_VOYAGE_LABEL;
  const VOYAGE_REF = selectedVoyage?.routeRef ?? DEFAULT_VOYAGE_REF;
  const VOYAGE_ETD = selectedVoyage?.etdDisplay ?? DEFAULT_VOYAGE_ETD;

  const [waypoints, setWaypoints] = useState<Waypoint[]>(STUB_WAYPOINTS);
  const [selected, setSelected] = useState<string[]>([]);
  const selectedWaypoint =
    selected.length === 1 ? waypoints.find((w) => w.id === selected[0]) : undefined;

  // --- Map plotting + saved routes ---------------------------------
  const [plotMode, setPlotMode] = useState(false);
  const [routeName, setRouteName] = useState('');
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>(() => readSavedRoutes());

  // --- Auto sea-route generator ------------------------------------
  const [depInput, setDepInput] = useState(selectedVoyage?.portFrom ?? '');
  const [arrInput, setArrInput] = useState(selectedVoyage?.portTo ?? '');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const worldPorts = useWorldPorts();

  // Candidate optimized routes computed in the background after the straight
  // line is drawn. The user picks their preferred one from the list.
  const [routeResults, setRouteResults] = useState<ComputedRoute[] | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const optimizeRunRef = useRef(0);
  const workerRef = useRef<Worker | null>(null);

  // --- Route simulator playback ------------------------------------
  // A single normalized clock [0, 1] drives a vessel marker along every
  // candidate route. Each route advances at the same service speed, so the
  // shorter routes reach their destination (clock → their ETA) sooner, while
  // the slower ones are still under way — letting you compare arrival times
  // and weather exposure at a glance.
  const [simClock, setSimClock] = useState(0);
  const [simPlaying, setSimPlaying] = useState(false);
  const [simMinimized, setSimMinimized] = useState(false);
  const simRafRef = useRef<number | null>(null);
  const simLastTsRef = useRef<number | null>(null);
  // Which single weather factor the routes are compared on.
  const [simFactor, setSimFactor] = useState<WeatherFactorId>('waves');
  // Bumped whenever a live Open-Meteo grid finishes loading, to re-sample.
  const [liveVersion, setLiveVersion] = useState(0);
  const simFactorDef = WEATHER_FACTOR_BY_ID[simFactor];

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

  // --- Route simulator derived data --------------------------------
  /** Playable routes with per-route transit time + weather factor. */
  const simRoutes = useMemo(() => {
    return (routeResults ?? [])
      .filter((r) => r.info.path.length >= 2)
      .map((r) => ({
        id: r.id,
        label: t(`routeVariant.${r.id}`, r.label),
        color: r.color,
        path: r.info.path,
        distanceNm: r.info.distanceNm,
        hours: transitHours(r.info.distanceNm),
        weatherFactor: r.info.weatherPenalty,
      }));
  }, [routeResults, l]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Longest transit time across all routes — the full playback span. */
  const simMaxHours = useMemo(
    () => simRoutes.reduce((m, r) => Math.max(m, r.hours), 0),
    [simRoutes],
  );

  /** Bounding box covering every route, used to fetch the live weather grid. */
  const simBounds = useMemo<LatLngBounds | null>(() => {
    let south = Infinity;
    let north = -Infinity;
    let west = Infinity;
    let east = -Infinity;
    simRoutes.forEach((r) =>
      r.path.forEach(([lat, lon]) => {
        if (lat < south) south = lat;
        if (lat > north) north = lat;
        if (lon < west) west = lon;
        if (lon > east) east = lon;
      }),
    );
    if (!Number.isFinite(south)) return null;
    // Pad slightly so the grid comfortably covers the tracks.
    const padLat = Math.max(0.5, (north - south) * 0.08);
    const padLon = Math.max(0.5, (east - west) * 0.08);
    return {
      south: south - padLat,
      north: north + padLat,
      west: west - padLon,
      east: east + padLon,
    };
  }, [simRoutes]);

  /** Whether the simulator UI should be shown. */
  const showSimulator = !optimizing && simRoutes.length > 0;

  // Fetch the live Open-Meteo grid for the selected factor over all routes.
  // `ensureLiveData` de-dupes/caches, and bumps `liveVersion` when ready so the
  // weather series re-samples with real data (falling back to synthetic until).
  useEffect(() => {
    if (!showSimulator || !simBounds) return;
    ensureLiveData(simFactorDef.liveId, simBounds, 0, () =>
      setLiveVersion((v) => v + 1),
    );
  }, [showSimulator, simFactorDef.liveId, simBounds]);

  /** True once real Open-Meteo data is available for the current factor. */
  const simLiveActive = isLiveLoaded(simBounds, simFactorDef.liveId, 0);

  /** Base UTC time the live weather data represents (voyage departure). */
  const simBaseDate = useMemo(() => {
    void liveVersion; // recompute once the grid loads
    if (!simLiveActive || !simBounds) return null;
    const iso = getLiveDataTime(simFactorDef.liveId, simBounds, 0);
    if (!iso) return null;
    // Open-Meteo returns local-to-UTC strings like "2026-07-02T00:00".
    const d = new Date(`${iso}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [simLiveActive, simBounds, simFactorDef.liveId, liveVersion]);

  /**
   * Weather factor sampled along every route, expressed against voyage time
   * (hours from departure) so the chart compares what each vessel experiences
   * at the moment it reaches that point. Uses live Open-Meteo data when loaded,
   * otherwise the synthetic field.
   */
  const simWeather = useMemo(() => {
    const series = simRoutes.map((r) => {
      const points: Array<{ t: number; w: number }> = [];
      for (let i = 0; i <= SIM_WEATHER_SAMPLES; i += 1) {
        const f = i / SIM_WEATHER_SAMPLES;
        points.push({
          t: f * r.hours,
          w: weatherAt(r.path, f, simFactorDef, simBounds, 0),
        });
      }
      return { id: r.id, color: r.color, label: r.label, points };
    });
    let maxW = 0;
    series.forEach((s) => s.points.forEach((p) => {
      if (p.w > maxW) maxW = p.w;
    }));
    return { series, maxW: Math.max(0.2, maxW) };
  }, [simRoutes, simFactorDef, simBounds, liveVersion]);

  // Reset the clock whenever the set of routes changes or optimizing restarts.
  useEffect(() => {
    setSimPlaying(false);
    setSimClock(0);
  }, [routeResults, optimizing]);

  // Drive the playback clock with requestAnimationFrame while playing.
  useEffect(() => {
    if (!simPlaying) {
      if (simRafRef.current != null) {
        window.cancelAnimationFrame(simRafRef.current);
        simRafRef.current = null;
      }
      simLastTsRef.current = null;
      return;
    }
    const speed = 1 / SIM_PLAY_DURATION_MS; // clock units per ms
    const tick = (ts: number) => {
      if (simLastTsRef.current == null) simLastTsRef.current = ts;
      const dt = ts - simLastTsRef.current;
      simLastTsRef.current = ts;
      setSimClock((prev) => {
        const next = prev + dt * speed;
        if (next >= 1) {
          setSimPlaying(false);
          return 1;
        }
        return next;
      });
      simRafRef.current = window.requestAnimationFrame(tick);
    };
    simRafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (simRafRef.current != null) {
        window.cancelAnimationFrame(simRafRef.current);
        simRafRef.current = null;
      }
      simLastTsRef.current = null;
    };
  }, [simPlaying]);

  /** Elapsed voyage hours represented by the current clock position. */
  const simElapsedHours = simClock * simMaxHours;

  /**
   * Projected UTC date/time at the current slider position: the base live-data
   * time advanced by the elapsed voyage hours, so it updates as the slider
   * moves. Falls back to the base "valid" time when the slider is at departure.
   */
  const simForecastTime = useMemo(() => {
    if (!simBaseDate) return null;
    const d = new Date(simBaseDate.getTime() + simElapsedHours * 3600_000);
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(d);
  }, [simBaseDate, simElapsedHours]);

  /**
   * Live per-route weather factor at the position each vessel currently
   * occupies, plus which route is the calmest at this instant.
   */
  const simLive = useMemo(() => {
    const byId: Record<string, { frac: number; weather: number }> = {};
    let bestId: string | null = null;
    let bestW = Infinity;
    simRoutes.forEach((r) => {
      const frac = r.hours > 0 ? Math.min(1, simElapsedHours / r.hours) : 0;
      const weather = weatherAt(r.path, frac, simFactorDef, simBounds, 0);
      byId[r.id] = { frac, weather };
      if (weather < bestW) {
        bestW = weather;
        bestId = r.id;
      }
    });
    return { byId, bestId };
  }, [simRoutes, simElapsedHours, simFactorDef, simBounds, liveVersion]);

  /** Vessel markers for each route at the current clock position. */
  const shipMarkers = useMemo(() => {
    if (!showSimulator) return [];
    const factorLabel = t(
      `weatherFactor.${simFactor}`,
      simFactorDef.label,
    );
    return simRoutes.map((r) => {
      const live = simLive.byId[r.id] ?? { frac: 0, weather: 0 };
      const lastIdx = r.path.length - 1;
      const pos = samplePath(r.path, live.frac * lastIdx);
      const pct = Math.round(live.frac * 100);
      return {
        id: r.id,
        color: r.color,
        pos,
        label: r.label,
        sublabel: `${pct}% · ${factorLabel} ${live.weather.toFixed(1)} ${simFactorDef.unit}`,
        active: r.id === selectedRouteId,
      };
    });
  }, [showSimulator, simRoutes, simLive, simFactorDef, selectedRouteId, l]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const loadRoute = (id: string) => {
    const route = savedRoutes.find((r) => r.id === id);
    if (!route) return;
    setWaypoints(recomputeGeometry(route.waypoints));
    setSelected([]);
    setPlotMode(false);
  };

  const deleteRoute = (id: string) => {
    const next = savedRoutes.filter((r) => r.id !== id);
    setSavedRoutes(next);
    writeSavedRoutes(next);
  };

  const clearRoute = () => {
    setWaypoints([]);
    setSelected([]);
  };

  // --- CSV import / export -----------------------------------------
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportRoute = () => {
    const header = 'name,lat,lon,speed,drift,isPort';
    const rows = waypoints.map((wp) => {
      const name = `"${wp.name.replace(/"/g, '""')}"`;
      return [
        name,
        dmToDec(wp.lat).toFixed(5),
        dmToDec(wp.lon).toFixed(5),
        wp.speed,
        wp.drift,
        wp.isPort,
      ].join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = downloadRef.current;
    if (a) {
      a.href = url;
      a.download = 'expected-route.csv';
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /** Split a CSV line, honouring quoted fields with embedded commas. */
  const parseCsvLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  const importRoute = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length && /name\s*,\s*lat/i.test(lines[0])) lines.shift();
    if (lines.length < 2) return;
    const imported: Waypoint[] = lines.map((line, i) => {
      const [name, lat, lon, speed, drift, isPort] = parseCsvLine(line);
      return {
        id: `wp-${Date.now()}-${i}`,
        name: (name ?? `Waypoint ${i + 1}`).trim(),
        lat: decToDM(Number(lat) || 0, true),
        lon: decToDM(Number(lon) || 0, false),
        course: 0,
        speed: Number(speed) || 0,
        distanceFromPrev: 0,
        eta: '',
        drift: String(drift).trim().toLowerCase() === 'true',
        isPort:
          String(isPort).trim().toLowerCase() === 'true' || i === 0 || i === lines.length - 1,
      };
    });
    setWaypoints(recomputeGeometry(imported));
    setSelected([]);
    setPlotMode(false);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importRoute(String(reader.result ?? ''));
    reader.readAsText(file);
    e.target.value = '';
  };

  const totalDistance = useMemo(
    () => waypoints.reduce((acc, wp) => acc + wp.distanceFromPrev, 0),
    [waypoints],
  );
  const etd = waypoints[0]?.eta ?? '';
  const eta = waypoints[waypoints.length - 1]?.eta ?? '';

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
      <header className="fv-route__header">
        <div className="fv-route__voyage-info">
          <div className="fv-route__title">
            <strong>{VESSEL_NAME}</strong>
            <span className="fv-route__sep">/</span>
            <span className="fv-route__client">{VESSEL_CLIENT}</span>
          </div>
          <div className="fv-route__voyage">
            <strong>{VOYAGE_LABEL}</strong>
            <span className="fv-route__sep">·</span>
            <span>{VOYAGE_REF}</span>
            <span className="fv-route__sep">·</span>
            <span>ETD {VOYAGE_ETD}</span>
          </div>
        </div>
        <ul className="fv-route__voyage-stats">
          <li>
            <span>Distance</span>
            <strong>{formatNumber(totalDistance)} NM</strong>
          </li>
          <li>
            <span>ETD</span>
            <strong>{etd ? etd.replace('T', ' ') : '—'}</strong>
          </li>
          <li>
            <span>ETA</span>
            <strong>{eta ? eta.replace('T', ' ') : '—'}</strong>
          </li>
          <li>
            <span>Waypoints</span>
            <strong>{waypoints.length}</strong>
          </li>
        </ul>
      </header>

      {/* Route editor map -------------------------------------------- */}
      <section className="fv-route__section">
        <header className="fv-route__section-header">
          <h2>{t('routeEditor', 'Route Editor')}</h2>
          <div className="fv-route__bulk">
            <button
              type="button"
              className={`fv-route__btn${plotMode ? ' fv-route__btn--active' : ''}`}
              onClick={() => setPlotMode((p) => !p)}
              title={t('plotHint', 'Click on the map to add waypoints')}
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
            <button
              type="button"
              className="fv-route__btn"
              onClick={exportRoute}
              disabled={waypoints.length === 0}
            >
              <i className="fas fa-file-export" aria-hidden="true" /> {t('export', 'Export')}
            </button>
            <button
              type="button"
              className="fv-route__btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <i className="fas fa-file-import" aria-hidden="true" /> {t('import', 'Import')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,text/csv"
              style={{ display: 'none' }}
              onChange={handleFile}
            />
            {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
            <a ref={downloadRef} style={{ display: 'none' }} aria-hidden="true" />
          </div>
        </header>

        <div className="fv-route__map-layout">
          <div className="fv-route__side-col">
          {/* Auto sea-route generator ---------------------------------- */}
          <section className="fv-route__gen-panel">
            <header className="fv-route__side-head">
              <h3>
                <i className="fas fa-wand-magic-sparkles" aria-hidden="true" />{' '}
                {t('autoRoute', 'Generate Optimized Sea Route')}
              </h3>
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
          </section>

          <aside className="fv-route__side-panel" aria-label={t('expectedRoute', 'Expected Route')}>
            <header className="fv-route__side-head">
              <h3>
                <i className="fas fa-route" aria-hidden="true" />{' '}
                {t('expectedRoute', 'Expected Route')}
              </h3>
              <span className="fv-route__side-count">{waypoints.length}</span>
            </header>
            <div className="fv-route__side-scroll">
              {waypoints.length === 0 ? (
                <p className="fv-route__side-empty">{t('noPoints', 'No points yet.')}</p>
              ) : (
                <table className="fv-route__side-table">
                  <thead>
                    <tr>
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
                            <td colSpan={3}>
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
          </aside>
          </div>

          <div className="fv-route__map-col">
          <div className="fv-route__map-wrap">
            <RouteEditorMap
              points={mapPoints}
              plotMode={plotMode}
              selected={selected}
              routes={(routeResults ?? []).map((r) => ({
                id: r.id,
                color: r.color,
                path: r.info.path,
              }))}
              selectedRouteId={selectedRouteId}
              shipMarkers={shipMarkers}
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
          {showSimulator && (
              <div
                className={`fv-route__sim-panel${simMinimized ? ' fv-route__sim-panel--min' : ''}`}
                role="group"
                aria-label={t('routeSimulator', 'Route simulator')}
              >
                <div className="fv-route__sim-panel-head">
                  <span className="fv-route__sim-panel-title">
                    <i className="fas fa-clapperboard" aria-hidden="true" />{' '}
                    {t('routeSimulator', 'Route simulator')}
                  </span>
                  <span className="fv-route__sim-panel-clock">
                    <i className="fas fa-clock" aria-hidden="true" />{' '}
                    {formatDuration(simElapsedHours)} / {formatDuration(simMaxHours)}
                  </span>
                  <button
                    type="button"
                    className="fv-route__sim-min"
                    onClick={() => setSimMinimized((m) => !m)}
                    aria-expanded={!simMinimized}
                    title={
                      simMinimized
                        ? t('expand', 'Expand')
                        : t('minimize', 'Minimize')
                    }
                    aria-label={
                      simMinimized
                        ? t('expand', 'Expand')
                        : t('minimize', 'Minimize')
                    }
                  >
                    <i
                      className={`fas ${simMinimized ? 'fa-chevron-up' : 'fa-chevron-down'}`}
                      aria-hidden="true"
                    />
                  </button>
                </div>
                {!simMinimized && (
                <>
                <div className="fv-route__sim-controls">
                  <button
                    type="button"
                    className="fv-route__sim-ctrl"
                    onClick={() => {
                      setSimPlaying(false);
                      setSimClock(0);
                    }}
                    title={t('restart', 'Restart')}
                    aria-label={t('restart', 'Restart')}
                  >
                    <i className="fas fa-backward-step" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={`fv-route__play-btn${simPlaying ? ' fv-route__play-btn--on' : ''}`}
                    onClick={() => {
                      // Restart from the beginning if we're parked at the end.
                      if (!simPlaying && simClock >= 1) setSimClock(0);
                      setSimPlaying((p) => !p);
                    }}
                  >
                    <i className={simPlaying ? 'fas fa-pause' : 'fas fa-play'} aria-hidden="true" />{' '}
                    {simPlaying ? t('pause', 'Pause') : t('play', 'Play')}
                  </button>
                  <button
                    type="button"
                    className="fv-route__sim-ctrl"
                    onClick={() => {
                      setSimPlaying(false);
                      setSimClock(1);
                    }}
                    title={t('skipToEnd', 'Skip to end')}
                    aria-label={t('skipToEnd', 'Skip to end')}
                  >
                    <i className="fas fa-forward-step" aria-hidden="true" />
                  </button>
                  <input
                    type="range"
                    className="fv-route__slider"
                    min={0}
                    max={1}
                    step={0.0001}
                    value={simClock}
                    style={{ ['--fv-progress' as string]: `${simClock * 100}%` }}
                    onChange={(e) => {
                      setSimPlaying(false);
                      setSimClock(Number(e.target.value));
                    }}
                    aria-label={t('voyageProgress', 'Voyage progress')}
                  />
                </div>
                <div className="fv-route__sim-factors" role="radiogroup" aria-label={t('compareFactor', 'Compare factor')}>
                  {WEATHER_FACTORS.map((f) => {
                    const on = simFactor === f.id;
                    return (
                      <label
                        key={f.id}
                        className={`fv-route__sim-factor${on ? ' fv-route__sim-factor--on' : ''}`}
                      >
                        <input
                          type="radio"
                          name="fv-sim-factor"
                          checked={on}
                          onChange={() => setSimFactor(f.id)}
                        />
                        <i className={`fas ${f.icon}`} aria-hidden="true" />
                        {t(`weatherFactor.${f.id}`, f.label)}
                      </label>
                    );
                  })}
                </div>
                <div className="fv-route__sim-chart">
                  <div className="fv-route__sim-chart-head">
                    <span>
                      <i className="fas fa-cloud-sun-rain" aria-hidden="true" />{' '}
                      {t(`weatherFactor.${simFactor}`, simFactorDef.label)}{' '}
                      {t('alongVoyage', 'along voyage')}
                      <span
                        className={`fv-route__sim-live${simLiveActive ? ' fv-route__sim-live--on' : ''}`}
                        title={
                          simLiveActive
                            ? t('liveDataHint', 'Live Open-Meteo data')
                            : t('sampleDataHint', 'Sample data (loading live…)')
                        }
                      >
                        <i
                          className={`fas ${simLiveActive ? 'fa-satellite-dish' : 'fa-flask'}`}
                          aria-hidden="true"
                        />{' '}
                        {simLiveActive
                          ? t('live', 'Live')
                          : t('sampleData', 'Sample')}
                      </span>
                      {simForecastTime && (
                        <span
                          className="fv-route__sim-time"
                          title={t('forecastTimeHint', 'Projected date/time at the current position (UTC)')}
                        >
                          <i className="fas fa-calendar-day" aria-hidden="true" />{' '}
                          {simForecastTime} {t('utc', 'UTC')}
                        </span>
                      )}
                    </span>
                    <span className="fv-route__sim-chart-ymax">
                      {t('max', 'max')} {simWeather.maxW.toFixed(1)} {simFactorDef.unit}
                    </span>
                  </div>
                  <div className="fv-route__sim-chart-plot">
                  <svg
                    className="fv-route__sim-chart-svg"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label={t('weatherFactorCompare', 'Weather factor along voyage')}
                  >
                    <line
                      x1="0"
                      y1="50"
                      x2="100"
                      y2="50"
                      className="fv-route__sim-chart-grid"
                      vectorEffect="non-scaling-stroke"
                    />
                    {simWeather.series.map((s) => {
                      const pts = s.points
                        .map((p) => {
                          const x = simMaxHours > 0 ? (p.t / simMaxHours) * 100 : 0;
                          const y = 100 - (p.w / simWeather.maxW) * 100;
                          return `${x.toFixed(2)},${y.toFixed(2)}`;
                        })
                        .join(' ');
                      const dim = selectedRouteId && selectedRouteId !== s.id;
                      return (
                        <polyline
                          key={s.id}
                          points={pts}
                          fill="none"
                          stroke={s.color}
                          strokeWidth={s.id === selectedRouteId ? 2.5 : 1.5}
                          strokeOpacity={dim ? 0.35 : 1}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      );
                    })}
                    <line
                      x1={simClock * 100}
                      y1="0"
                      x2={simClock * 100}
                      y2="100"
                      className="fv-route__sim-chart-cursor"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                  <div className="fv-route__sim-chart-overlay">
                    <span className="fv-route__sim-chart-ytick" style={{ top: '0%' }}>
                      {simWeather.maxW.toFixed(1)}
                    </span>
                    <span className="fv-route__sim-chart-ytick" style={{ top: '50%' }}>
                      {(simWeather.maxW / 2).toFixed(1)}
                    </span>
                    <span className="fv-route__sim-chart-ytick" style={{ top: '100%' }}>
                      0
                    </span>
                    {simRoutes.map((r) => {
                      const live = simLive.byId[r.id] ?? { frac: 0, weather: 0 };
                      const dim = selectedRouteId && selectedRouteId !== r.id;
                      const left = simClock * 100;
                      const top = 100 - (live.weather / simWeather.maxW) * 100;
                      return (
                        <span
                          key={r.id}
                          className={`fv-route__sim-chart-val${dim ? ' fv-route__sim-chart-val--dim' : ''}`}
                          style={{
                            left: `${left}%`,
                            top: `${Math.max(0, Math.min(100, top))}%`,
                            ['--fv-val-color' as string]: r.color,
                          }}
                        >
                          <span
                            className="fv-route__sim-chart-dot"
                            style={{ background: r.color }}
                          />
                          <span
                            className="fv-route__sim-chart-tag"
                            style={{ borderColor: r.color }}
                          >
                            {live.weather.toFixed(1)}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                  </div>
                  <div className="fv-route__sim-chart-axis">
                    <span>{t('departure', 'Departure')}</span>
                    <span>{formatDuration(simMaxHours)}</span>
                  </div>
                </div>
                <ul className="fv-route__sim-legend">
                  {simRoutes.map((r) => {
                    const live = simLive.byId[r.id] ?? { frac: 0, weather: 0 };
                    const isSel = r.id === selectedRouteId;
                    const isBest = r.id === simLive.bestId;
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          className={`fv-route__sim-leg${isSel ? ' fv-route__sim-leg--active' : ''}`}
                          onClick={() => setSelectedRouteId(r.id)}
                        >
                          <span
                            className="fv-route__sim-leg-swatch"
                            style={{ background: r.color }}
                          />
                          <span className="fv-route__sim-leg-label">{r.label}</span>
                          <span
                            className={`fv-route__sim-leg-weather${
                              isBest ? ' fv-route__sim-leg-weather--best' : ''
                            }`}
                            title={t('weatherFactorNow', 'Current conditions at this position')}
                          >
                            <i className="fas fa-cloud-sun-rain" aria-hidden="true" />{' '}
                            {live.weather.toFixed(1)} {simFactorDef.unit}
                            {isBest && (
                              <i
                                className="fas fa-star fv-route__sim-leg-best"
                                aria-hidden="true"
                                title={t('calmestNow', 'Calmest right now')}
                              />
                            )}
                          </span>
                          <span className="fv-route__sim-leg-bar">
                            <span
                              className="fv-route__sim-leg-fill"
                              style={{ width: `${live.frac * 100}%`, background: r.color }}
                            />
                          </span>
                          <span className="fv-route__sim-leg-pct">
                            {live.frac >= 1 ? (
                              <i className="fas fa-flag-checkered" aria-hidden="true" />
                            ) : (
                              `${Math.round(live.frac * 100)}%`
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                </>
                )}
              </div>
          )}
          </div>
        </div>

        {savedRoutes.length > 0 && (
          <div className="fv-route__saved">
            <span className="fv-route__saved-label">{t('savedRoutes', 'Saved routes')}:</span>
            <ul className="fv-route__saved-list">
              {savedRoutes.map((r) => (
                <li key={r.id} className="fv-route__saved-item">
                  <button
                    type="button"
                    className="fv-route__saved-load"
                    onClick={() => loadRoute(r.id)}
                    title={t('loadRoute', 'Load this route')}
                  >
                    <i className="fas fa-route" aria-hidden="true" /> {r.name}
                    <span className="fv-route__saved-meta">
                      {r.waypoints.length} {t('wp', 'WP')}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="fv-route__saved-del"
                    onClick={() => deleteRoute(r.id)}
                    title={t('deleteRoute', 'Delete saved route')}
                  >
                    <i className="fas fa-times" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
