import { useMemo, useState } from 'react';

import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { PORT_COORDS } from '../data/fleet';
import { generateSeaRoute } from '../data/seaRoute';
import { RouteEditorMap, type EditorPoint } from './RouteEditorMap';
import { WeatherControls } from './WeatherControls';

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
function resolveLocation(raw: string): { lat: number; lon: number; name: string } | null {
  const text = raw.trim();
  if (!text) return null;
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
  const [bulkSpeed, setBulkSpeed] = useState<number>(12);

  // --- Map plotting + saved routes ---------------------------------
  const [plotMode, setPlotMode] = useState(false);
  const [routeName, setRouteName] = useState('');
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>(() => readSavedRoutes());

  // --- Auto sea-route generator ------------------------------------
  const [depInput, setDepInput] = useState(selectedVoyage?.portFrom ?? '');
  const [arrInput, setArrInput] = useState(selectedVoyage?.portTo ?? '');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  const generateRoute = async () => {
    setGenError('');
    const from = resolveLocation(depInput);
    const to = resolveLocation(arrInput);
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
    try {
      const path = await generateSeaRoute(
        { lat: from.lat, lon: from.lon },
        { lat: to.lat, lon: to.lon },
      );
      const built: Waypoint[] = path.map((p, i) => {
        const isFirst = i === 0;
        const isLast = i === path.length - 1;
        return {
          id: `wp-${Date.now()}-${i}`,
          name: isFirst
            ? `${from.name} (Departure)`
            : isLast
              ? `${to.name} (Arrival)`
              : `Waypoint ${i}`,
          lat: decToDM(p.lat, true),
          lon: decToDM(p.lon, false),
          course: 0,
          speed: 12,
          distanceFromPrev: 0,
          eta: '',
          drift: false,
          isPort: isFirst || isLast,
        };
      });
      setWaypoints(recomputeGeometry(built));
      setSelected([]);
      setPlotMode(false);
    } catch (err) {
      setGenError(
        err instanceof Error
          ? err.message
          : t('genFailed', 'Could not generate a route.'),
      );
    } finally {
      setGenerating(false);
    }
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

  /** Insert a blank waypoint into the table right after `index`. */
  const insertWaypointAfter = (index: number) => {
    setWaypoints((prev) => {
      const a = prev[index];
      const b = prev[index + 1];
      const alat = a ? dmToDec(a.lat) : NaN;
      const alon = a ? dmToDec(a.lon) : NaN;
      const blat = b ? dmToDec(b.lat) : NaN;
      const blon = b ? dmToDec(b.lon) : NaN;
      // Midpoint of the two neighbours when both have valid coords.
      const lat =
        !Number.isNaN(alat) && !Number.isNaN(blat) ? (alat + blat) / 2 : alat;
      const lon =
        !Number.isNaN(alon) && !Number.isNaN(blon) ? (alon + blon) / 2 : alon;
      const newWp: Waypoint = {
        id: `wp-${Date.now()}`,
        name: `Waypoint ${prev.length + 1}`,
        lat: Number.isNaN(lat) ? a?.lat ?? "00° 00.0' N" : decToDM(lat, true),
        lon: Number.isNaN(lon) ? a?.lon ?? "000° 00.0' E" : decToDM(lon, false),
        course: 0,
        speed: a?.speed ?? 12,
        distanceFromPrev: 0,
        eta: a?.eta ?? '',
        drift: false,
        isPort: false,
      };
      const next = [...prev];
      next.splice(index + 1, 0, newWp);
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

  const toggleSelected = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    setSelected(
      selected.length === waypoints.length ? [] : waypoints.map((wp) => wp.id),
    );
  };

  const deleteSelected = () => {
    if (selected.length === 0) return;
    setWaypoints((prev) =>
      // Keep the departure / arrival ports; only remove selected waypoints.
      recomputeGeometry(
        prev.filter((wp) => !selected.includes(wp.id) || wp.isPort),
      ),
    );
    setSelected([]);
  };

  const setSpeedOnSelected = () => {
    if (selected.length === 0) return;
    setWaypoints((prev) =>
      prev.map((wp) => (selected.includes(wp.id) ? { ...wp, speed: bulkSpeed } : wp)),
    );
  };

  const toggleDriftOnSelected = () => {
    if (selected.length === 0) return;
    setWaypoints((prev) =>
      prev.map((wp) =>
        selected.includes(wp.id) ? { ...wp, drift: !wp.drift } : wp,
      ),
    );
  };

  const addWaypoint = () => {
    const last = waypoints[waypoints.length - 1];
    const newWp: Waypoint = {
      id: `wp-${Date.now()}`,
      name: `Waypoint ${waypoints.length + 1}`,
      lat: last?.lat ?? '00° 00.0\' N',
      lon: last?.lon ?? '000° 00.0\' E',
      course: last?.course ?? 0,
      speed: last?.speed ?? 12,
      distanceFromPrev: 0,
      eta: last?.eta ?? '',
      drift: false,
      isPort: false,
    };
    setWaypoints((prev) => [...prev, newWp]);
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

      {/* Auto sea-route generator ------------------------------------ */}
      <section className="fv-route__section">
        <header className="fv-route__section-header">
          <h2>{t('autoRoute', 'Generate Optimized Sea Route')}</h2>
        </header>
        <div className="fv-route__gen">
          <datalist id="fv-route-ports">
            {Object.keys(PORT_COORDS).map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <label className="fv-route__gen-field">
            <span>
              <i className="fas fa-anchor-circle-check" aria-hidden="true" />{' '}
              {t('departure', 'Departure')}
            </span>
            <input
              type="text"
              list="fv-route-ports"
              placeholder={t('portOrLatLon', 'Port name or "lat, lon"')}
              value={depInput}
              onChange={(e) => setDepInput(e.target.value)}
            />
          </label>
          <label className="fv-route__gen-field">
            <span>
              <i className="fas fa-anchor" aria-hidden="true" /> {t('arrival', 'Arrival')}
            </span>
            <input
              type="text"
              list="fv-route-ports"
              placeholder={t('portOrLatLon', 'Port name or "lat, lon"')}
              value={arrInput}
              onChange={(e) => setArrInput(e.target.value)}
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
          </div>
        </header>

        <div className="fv-route__map-layout">
          <div className="fv-route__map-wrap">
            <RouteEditorMap
              points={mapPoints}
              plotMode={plotMode}
              selected={selected}
              onAddPoint={addPointFromMap}
              onInsertPoint={insertPointFromMap}
              onMovePoint={moveWaypoint}
              onSelectPoint={toggleSelected}
              onDeletePoint={deletePoint}
            />
            <WeatherControls />
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
                      <tr
                        key={wp.id}
                        className={selected.includes(wp.id) ? 'fv-route__side-row--selected' : ''}
                        onClick={() => toggleSelected(wp.id)}
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
                        <td>
                          <input
                            type="text"
                            className="fv-route__side-input"
                            value={wp.lat}
                            aria-label={`${wp.name} latitude`}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateWaypoint(wp.id, 'lat', e.target.value)}
                            onBlur={() => setWaypoints((prev) => recomputeGeometry(prev))}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="fv-route__side-input"
                            value={wp.lon}
                            aria-label={`${wp.name} longitude`}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateWaypoint(wp.id, 'lon', e.target.value)}
                            onBlur={() => setWaypoints((prev) => recomputeGeometry(prev))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </aside>
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

      <section className="fv-route__section">
        <header className="fv-route__section-header">
          <h2>{t('expectedRoute', 'Expected Route')}</h2>
          <div className="fv-route__bulk">
            <span className="fv-route__bulk-count">
              {selected.length} {t('selected', 'selected')}
            </span>
            <label className="fv-route__bulk-speed">
              <span>{t('setSpeed', 'Set speed')}</span>
              <input
                type="number"
                step="0.1"
                value={bulkSpeed}
                onChange={(e) => setBulkSpeed(Number(e.target.value) || 0)}
              />
              <span>kt</span>
            </label>
            <button
              type="button"
              className="fv-route__btn"
              onClick={setSpeedOnSelected}
              disabled={selected.length === 0}
            >
              {t('apply', 'Apply')}
            </button>
            <button
              type="button"
              className="fv-route__btn"
              onClick={toggleDriftOnSelected}
              disabled={selected.length === 0}
              title={t('driftToggleHint', 'Toggle drift / sail on selected waypoints')}
            >
              <i className="fas fa-water" aria-hidden="true" />{' '}
              {t('drift', 'Drift')}
            </button>
            <button
              type="button"
              className="fv-route__btn fv-route__btn--danger"
              onClick={deleteSelected}
              disabled={selected.length === 0}
            >
              <i className="fas fa-trash" aria-hidden="true" />{' '}
              {t('delete', 'Delete')}
            </button>
            <button type="button" className="fv-route__btn" onClick={addWaypoint}>
              <i className="fas fa-plus" aria-hidden="true" />{' '}
              {t('addWaypoint', 'Add WP')}
            </button>
          </div>
        </header>

        <div className="fv-route__wp-scroll">
          <table className="fv-route__wp-table">
            <thead>
              <tr>
                <th className="fv-route__center">
                  <input
                    type="checkbox"
                    checked={
                      selected.length === waypoints.length && waypoints.length > 0
                    }
                    onChange={selectAll}
                    aria-label={t('selectAll', 'Select all')}
                  />
                </th>
                <th>#</th>
                <th>{t('waypointName', 'Waypoint')}</th>
                <th>{t('lat', 'Lat')}</th>
                <th>{t('lon', 'Lon')}</th>
                <th>{t('course', 'Course')}</th>
                <th>{t('speed', 'Speed')}</th>
                <th>{t('distFromPrev', 'Dist from prev')}</th>
                <th>{t('eta', 'ETA')}</th>
                <th>{t('mode', 'Mode')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {waypoints.map((wp, idx) => {
                const isSelected = selected.includes(wp.id);
                return (
                  <tr
                    key={wp.id}
                    className={`${isSelected ? 'fv-route__wp-row--selected' : ''}${
                      wp.drift ? ' fv-route__wp-row--drift' : ''
                    }`}
                  >
                    <td className="fv-route__center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(wp.id)}
                        aria-label={`Select ${wp.name}`}
                      />
                    </td>
                    <td className="fv-route__wp-num">
                      {idx + 1}
                      {wp.isPort && (
                        <span className="fv-route__wp-port" title="Port">
                          <i className="fas fa-anchor" aria-hidden="true" />
                        </span>
                      )}
                    </td>
                    <td>
                      <input
                        type="text"
                        value={wp.name}
                        onChange={(e) => updateWaypoint(wp.id, 'name', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={wp.lat}
                        onChange={(e) => updateWaypoint(wp.id, 'lat', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={wp.lon}
                        onChange={(e) => updateWaypoint(wp.id, 'lon', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={wp.course}
                        onChange={(e) =>
                          updateWaypoint(wp.id, 'course', Number(e.target.value) || 0)
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.1"
                        value={wp.speed}
                        onChange={(e) =>
                          updateWaypoint(wp.id, 'speed', Number(e.target.value) || 0)
                        }
                        disabled={wp.drift}
                      />
                    </td>
                    <td className="fv-route__num">{formatNumber(wp.distanceFromPrev)}</td>
                    <td>
                      <input
                        type="datetime-local"
                        value={wp.eta}
                        onChange={(e) => updateWaypoint(wp.id, 'eta', e.target.value)}
                      />
                    </td>
                    <td className="fv-route__center">
                      <label className="fv-route__drift-toggle" title="Drift / Sail">
                        <input
                          type="checkbox"
                          checked={wp.drift}
                          onChange={(e) =>
                            updateWaypoint(wp.id, 'drift', e.target.checked)
                          }
                        />
                        <span>{wp.drift ? 'Drift' : 'Sail'}</span>
                      </label>
                    </td>
                    <td className="fv-route__center">
                      <button
                        type="button"
                        className="fv-route__icon-btn"
                        title={
                          idx === waypoints.length - 1
                            ? t('cantInsertAfterArrival', 'Cannot add a waypoint after arrival')
                            : t('insertAfter', 'Insert waypoint after')
                        }
                        onClick={() => insertWaypointAfter(idx)}
                        disabled={idx === waypoints.length - 1}
                      >
                        <i className="fas fa-plus" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="fv-route__icon-btn"
                        title={
                          wp.isPort
                            ? t('cantRemovePort', 'Departure / arrival cannot be removed')
                            : t('removeWp', 'Remove waypoint')
                        }
                        onClick={() => deletePoint(wp.id)}
                        disabled={wp.isPort}
                      >
                        <i className="fas fa-times" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
