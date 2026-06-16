import { useMemo, useState } from 'react';

import { useL } from '../i18n/LocalizationProvider';

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

const VESSEL_NAME = 'MV Atlantic Voyager';
const VESSEL_CLIENT = 'Acme Shipping (owner)';
const VOYAGE_LABEL = 'Singapore → Rotterdam';
const VOYAGE_REF = 'BL-88421';
const VOYAGE_ETD = '12 Jun 2026, 13:30';

function formatNumber(n: number, fractionDigits = 0): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function RouteExplorerPage() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const [waypoints, setWaypoints] = useState<Waypoint[]>(STUB_WAYPOINTS);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkSpeed, setBulkSpeed] = useState<number>(12);

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
    setWaypoints((prev) => prev.filter((wp) => !selected.includes(wp.id)));
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
                        title={t('removeWp', 'Remove waypoint')}
                        onClick={() => {
                          setWaypoints((prev) => prev.filter((x) => x.id !== wp.id));
                          setSelected((prev) => prev.filter((x) => x !== wp.id));
                        }}
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
