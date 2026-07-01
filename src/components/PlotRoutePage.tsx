import { useEffect, useMemo, useState } from 'react';

import { useL } from '../i18n/LocalizationProvider';
import { PORT_COORDS } from '../data/fleet';
import { useWorldPorts, resolveWorldPort, type WorldPort } from '../data/ports';
import { findBestOptimizedRoute } from '../data/routeOptimizer';
import { RouteEditorMap, type EditorPoint } from './RouteEditorMap';
import { RouteEditingTabs } from './RouteEditingTabs';
import { PortInput } from './PortInput';

/**
 * Plot Route on Map page — `/plot-route`.
 *
 * A blank-canvas route planner. The user sets a Departure and Arrival
 * (by port name or "lat, lon"), then clicks the map to drop waypoints
 * from scratch between them. Pins are draggable and the running list of
 * waypoints (with coordinates and leg distance) is shown beside the map.
 *
 * Nothing is persisted or sent to the backend yet — this is a standalone
 * planning surface. Hook the waypoint list up to the route endpoints when
 * they are exposed for the React app.
 */

interface PlotPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  isPort: boolean;
  kind: 'departure' | 'arrival' | 'waypoint';
}

/** Great-circle distance in nautical miles. */
function haversineNM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3440.065;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Stand-in for the backend route optimizer. Runs the client-side
 * `findBestOptimizedRoute` search after a short delay to mimic a
 * network/compute round-trip, and can be aborted if the endpoints change.
 * Swap the body for a real `fetch(...)` when the optimization service is
 * available.
 */
function fetchOptimizedRoute(
  departure: { lat: number; lon: number },
  arrival: { lat: number; lon: number },
  signal?: AbortSignal,
): Promise<Array<[number, number]>> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      resolve(findBestOptimizedRoute(departure, arrival).path);
    }, 1400);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
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

/**
 * Persisted route shape — kept compatible with the Route Explorer's
 * saved routes (`fv.savedRoutes`) so routes plotted here can also be
 * loaded from the Route Explorer page.
 */
interface SavedWaypoint {
  id: string;
  name: string;
  lat: string;
  lon: string;
  course: number;
  speed: number;
  distanceFromPrev: number;
  eta: string;
  drift: boolean;
  isPort: boolean;
}

interface SavedRoute {
  id: string;
  name: string;
  savedAt: string;
  waypoints: SavedWaypoint[];
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

export function PlotRoutePage() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const [points, setPoints] = useState<PlotPoint[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [plotMode, setPlotMode] = useState(false);

  const [depInput, setDepInput] = useState('');
  const [arrInput, setArrInput] = useState('');
  const worldPorts = useWorldPorts();
  const [error, setError] = useState('');

  // --- Optimized route (background) --------------------------------
  const [optimizedRoute, setOptimizedRoute] = useState<Array<[number, number]> | null>(null);
  const [optimizing, setOptimizing] = useState(false);

  // --- Saved routes ------------------------------------------------
  const [routeName, setRouteName] = useState('');
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>(() => readSavedRoutes());
  const [saveMsg, setSaveMsg] = useState('');


  /** Insert/replace the departure or arrival endpoint. */
  const setEndpoint = (kind: 'departure' | 'arrival') => {
    setError('');
    const raw = kind === 'departure' ? depInput : arrInput;
    const loc = resolveLocation(raw, worldPorts);
    if (!loc) {
      setError(
        t('plotResolveErr', 'Enter a known port name or "lat, lon" (e.g. "1.26, 103.8").'),
      );
      return;
    }
    setPoints((prev) => {
      const withoutKind = prev.filter((p) => p.kind !== kind);
      const endpoint: PlotPoint = {
        id: `${kind}-${Date.now()}`,
        name: kind === 'departure' ? `${loc.name} (Departure)` : `${loc.name} (Arrival)`,
        lat: loc.lat,
        lon: loc.lon,
        isPort: true,
        kind,
      };
      // Departure always first, arrival always last, waypoints in between.
      const departure =
        kind === 'departure' ? endpoint : withoutKind.find((p) => p.kind === 'departure');
      const arrival =
        kind === 'arrival' ? endpoint : withoutKind.find((p) => p.kind === 'arrival');
      const mids = withoutKind.filter((p) => p.kind === 'waypoint');
      return [departure, ...mids, arrival].filter(Boolean) as PlotPoint[];
    });
  };

  const addWaypoint = (lat: number, lon: number) => {
    setPoints((prev) => {
      const wp: PlotPoint = {
        id: `wp-${Date.now()}`,
        name: `Waypoint ${prev.filter((p) => p.kind === 'waypoint').length + 1}`,
        lat,
        lon,
        isPort: false,
        kind: 'waypoint',
      };
      const hasArrival = prev.length > 0 && prev[prev.length - 1].kind === 'arrival';
      const insertAt = hasArrival ? prev.length - 1 : prev.length;
      const next = [...prev];
      next.splice(insertAt, 0, wp);
      return next;
    });
  };

  const insertWaypoint = (afterIndex: number, lat: number, lon: number) => {
    setPoints((prev) => {
      const wp: PlotPoint = {
        id: `wp-${Date.now()}`,
        name: `Waypoint ${prev.filter((p) => p.kind === 'waypoint').length + 1}`,
        lat,
        lon,
        isPort: false,
        kind: 'waypoint',
      };
      const next = [...prev];
      next.splice(afterIndex + 1, 0, wp);
      return next;
    });
  };

  const movePoint = (id: string, lat: number, lon: number) => {
    setPoints((prev) => prev.map((p) => (p.id === id ? { ...p, lat, lon } : p)));
  };

  const deletePoint = (id: string) => {
    setPoints((prev) => {
      const p = prev.find((x) => x.id === id);
      if (!p || p.isPort) return prev; // keep endpoints
      return prev.filter((x) => x.id !== id);
    });
    setSelected((prev) => prev.filter((x) => x !== id));
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const clearAll = () => {
    setPoints([]);
    setSelected([]);
    setPlotMode(false);
  };

  const saveRoute = () => {
    if (points.length < 2) {
      setSaveMsg(t('saveNeedTwo', 'Set a departure and arrival before saving.'));
      return;
    }
    const waypoints: SavedWaypoint[] = points.map((p, i) => {
      const prev = points[i - 1];
      const dist = i === 0 || !prev ? 0 : Math.round(haversineNM(prev.lat, prev.lon, p.lat, p.lon));
      return {
        id: p.id,
        name: p.name,
        lat: decToDM(p.lat, true),
        lon: decToDM(p.lon, false),
        course: 0,
        speed: 12,
        distanceFromPrev: dist,
        eta: '',
        drift: false,
        isPort: p.isPort,
      };
    });
    const route: SavedRoute = {
      id: `route-${Date.now()}`,
      name: routeName.trim() || `Route ${savedRoutes.length + 1}`,
      savedAt: new Date().toISOString(),
      waypoints,
    };
    const next = [...savedRoutes, route];
    setSavedRoutes(next);
    writeSavedRoutes(next);
    setRouteName('');
    setSaveMsg(t('saveDone', 'Route saved.'));
  };

  const loadRoute = (id: string) => {
    const route = savedRoutes.find((r) => r.id === id);
    if (!route) return;
    const loaded: PlotPoint[] = route.waypoints.map((wp, i, arr) => ({
      id: wp.id || `wp-${Date.now()}-${i}`,
      name: wp.name,
      lat: dmToDec(wp.lat),
      lon: dmToDec(wp.lon),
      isPort: wp.isPort,
      kind: wp.isPort
        ? i === 0
          ? 'departure'
          : i === arr.length - 1
            ? 'arrival'
            : 'waypoint'
        : 'waypoint',
    }));
    setPoints(loaded);
    setSelected([]);
    setPlotMode(false);
    setSaveMsg('');
  };

  const deleteRoute = (id: string) => {
    const next = savedRoutes.filter((r) => r.id !== id);
    setSavedRoutes(next);
    writeSavedRoutes(next);
  };

  /** Map points enriched with leg/cumulative distances. */
  const mapPoints = useMemo<EditorPoint[]>(() => {
    let cumulative = 0;
    return points.map((p, i) => {
      const prev = points[i - 1];
      const dist = i === 0 ? 0 : haversineNM(prev.lat, prev.lon, p.lat, p.lon);
      cumulative += dist;
      return {
        id: p.id,
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        isPort: p.isPort,
        drift: false,
        latLabel: decToDM(p.lat, true),
        lonLabel: decToDM(p.lon, false),
        distFromPrev: Math.round(dist),
        distFromStart: Math.round(cumulative),
      };
    });
  }, [points]);

  const totalDistance = useMemo(
    () => mapPoints.reduce((acc, p) => acc + p.distFromPrev, 0),
    [mapPoints],
  );

  const hasDeparture = points.some((p) => p.kind === 'departure');
  const hasArrival = points.some((p) => p.kind === 'arrival');

  const departurePoint = points.find((p) => p.kind === 'departure');
  const arrivalPoint = points.find((p) => p.kind === 'arrival');
  const depLat = departurePoint?.lat;
  const depLon = departurePoint?.lon;
  const arrLat = arrivalPoint?.lat;
  const arrLon = arrivalPoint?.lon;

  // Once both endpoints exist, the straight line is drawn immediately from
  // `points`; here we kick off the optimizer in the background and swap in
  // the optimized track when it resolves. Re-runs whenever an endpoint moves.
  useEffect(() => {
    if (depLat == null || depLon == null || arrLat == null || arrLon == null) {
      setOptimizedRoute(null);
      setOptimizing(false);
      return;
    }
    const controller = new AbortController();
    setOptimizedRoute(null);
    setOptimizing(true);
    fetchOptimizedRoute(
      { lat: depLat, lon: depLon },
      { lat: arrLat, lon: arrLon },
      controller.signal,
    )
      .then((route) => {
        setOptimizedRoute(route);
        setOptimizing(false);
      })
      .catch((err) => {
        if ((err as DOMException)?.name === 'AbortError') return;
        setOptimizing(false);
      });
    return () => controller.abort();
  }, [depLat, depLon, arrLat, arrLon]);

  return (
    <div className="fv-route">
      <header className="fv-route__header">
        <div className="fv-route__voyage-info">
          <div className="fv-route__title">
            <strong>{t('plotRouteTitle', 'Plot Route on Map')}</strong>
            <span className="fv-route__sep">/</span>
            <span className="fv-route__client">{t('blankCanvas', 'Blank canvas planner')}</span>
          </div>
          <div className="fv-route__voyage">
            <span>
              {t(
                'plotRouteSub',
                'Set a departure and arrival, then click the map to add waypoints from scratch.',
              )}
            </span>
          </div>
        </div>
        <ul className="fv-route__voyage-stats">
          <li>
            <span>{t('distance', 'Distance')}</span>
            <strong>{totalDistance.toLocaleString()} NM</strong>
          </li>
          <li>
            <span>{t('waypoints', 'Waypoints')}</span>
            <strong>{points.filter((p) => p.kind === 'waypoint').length}</strong>
          </li>
          <li>
            <span>{t('totalPoints', 'Total points')}</span>
            <strong>{points.length}</strong>
          </li>
        </ul>
      </header>

      <RouteEditingTabs />

      {/* Endpoints --------------------------------------------------- */}
      <section className="fv-route__section">
        <header className="fv-route__section-header">
          <h2>{t('endpoints', 'Departure & Arrival')}</h2>
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
          <button
            type="button"
            className="fv-route__btn"
            onClick={() => setEndpoint('departure')}
          >
            <i className="fas fa-map-pin" aria-hidden="true" /> {t('setDeparture', 'Set departure')}
          </button>
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
            className="fv-route__btn"
            onClick={() => setEndpoint('arrival')}
          >
            <i className="fas fa-map-pin" aria-hidden="true" /> {t('setArrival', 'Set arrival')}
          </button>
          {error && (
            <span className="fv-route__gen-error">
              <i className="fas fa-triangle-exclamation" aria-hidden="true" /> {error}
            </span>
          )}
        </div>
      </section>

      {/* Map --------------------------------------------------------- */}
      <section className="fv-route__section">
        <header className="fv-route__section-header">
          <h2>{t('map', 'Map')}</h2>
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
              className="fv-route__btn fv-route__btn--primary"
              onClick={saveRoute}
              disabled={points.length < 2}
            >
              <i className="fas fa-save" aria-hidden="true" /> {t('saveRoute', 'Save route')}
            </button>
            <button
              type="button"
              className="fv-route__btn fv-route__btn--danger"
              onClick={clearAll}
              disabled={points.length === 0}
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
              routes={
                optimizedRoute
                  ? [{ id: 'optimized', color: '#2ea043', path: optimizedRoute }]
                  : []
              }
              selectedRouteId="optimized"
              onAddPoint={addWaypoint}
              onInsertPoint={insertWaypoint}
              onMovePoint={movePoint}
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
            {!optimizing && optimizedRoute && (
              <div className="fv-route__map-status fv-route__map-status--done" role="status">
                <i className="fas fa-route" aria-hidden="true" />{' '}
                {t('optimizedRouteReady', 'Optimized route ready')}
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
            {!hasDeparture && !hasArrival && points.length === 0 && (
              <div className="fv-route__map-hint">
                <i className="fas fa-circle-info" aria-hidden="true" />{' '}
                {t('plotEmpty', 'Start by setting a departure and arrival above.')}
              </div>
            )}
          </div>

          <aside className="fv-route__side-panel" aria-label={t('latLon', 'Lat / Lon')}>
            <header className="fv-route__side-head">
              <h3>
                <i className="fas fa-location-crosshairs" aria-hidden="true" />{' '}
                {t('latLon', 'Lat / Lon')}
              </h3>
              <span className="fv-route__side-count">{mapPoints.length}</span>
            </header>
            <div className="fv-route__side-scroll">
              {mapPoints.length === 0 ? (
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
                    {mapPoints.map((p, idx) => (
                      <tr
                        key={p.id}
                        className={selected.includes(p.id) ? 'fv-route__side-row--selected' : ''}
                        onClick={() => toggleSelected(p.id)}
                      >
                        <td className="fv-route__side-row-num">
                          {p.isPort ? (
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
                        <td>{p.latLabel}</td>
                        <td>{p.lonLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </aside>
        </div>

        {saveMsg && <p className="fv-route__io-msg">{saveMsg}</p>}

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

      {/* Plotted points details -------------------------------------- */}
      <section className="fv-route__section">
        <header className="fv-route__section-header">
          <h2>{t('plottedPoints', 'Plotted Points')}</h2>
        </header>
        <div className="fv-route__wp-scroll">
          <table className="fv-route__wp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('point', 'Point')}</th>
                <th>{t('lat', 'Lat')}</th>
                <th>{t('lon', 'Lon')}</th>
                <th>{t('distFromPrev', 'Dist from prev')}</th>
                <th>{t('distFromStart', 'Cumulative')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {mapPoints.length === 0 ? (
                <tr>
                  <td colSpan={7} className="fv-route__center">
                    {t('noPoints', 'No points yet.')}
                  </td>
                </tr>
              ) : (
                mapPoints.map((p, idx) => (
                  <tr key={p.id}>
                    <td className="fv-route__wp-num">
                      {idx + 1}
                      {p.isPort && (
                        <span className="fv-route__wp-port" title="Port">
                          <i className="fas fa-anchor" aria-hidden="true" />
                        </span>
                      )}
                    </td>
                    <td>{p.name}</td>
                    <td>{p.latLabel}</td>
                    <td>{p.lonLabel}</td>
                    <td className="fv-route__num">{p.distFromPrev.toLocaleString()}</td>
                    <td className="fv-route__num">{p.distFromStart.toLocaleString()}</td>
                    <td className="fv-route__center">
                      <button
                        type="button"
                        className="fv-route__icon-btn"
                        title={
                          p.isPort
                            ? t('cantRemovePort', 'Departure / arrival cannot be removed')
                            : t('removeWp', 'Remove waypoint')
                        }
                        onClick={() => deletePoint(p.id)}
                        disabled={p.isPort}
                      >
                        <i className="fas fa-times" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}


