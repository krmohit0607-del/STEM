import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage } from '../data/selectedVoyage';

/**
 * Route Editor page — `/route-editor`.
 *
 * Leg-oriented editor for an existing route. A "leg" is the segment
 * between two consecutive waypoints. The page groups the route-editing
 * operations the left sidebar links to:
 *
 *   - Import / export   (#import-export)
 *   - Add leg           (#add-leg)
 *   - Update leg        (#update-leg)
 *   - Split leg         (#split-leg)
 *   - Merge leg         (#merge-leg)
 *   - Waypoint details  (#waypoint-details)
 *   - Toggle drift/sail (#toggle-drift)
 *
 * The sidebar bullets navigate to this page with the matching hash, and
 * the page scrolls the relevant section into view. Geometry is computed
 * client-side; persistence is not wired yet.
 */

interface Waypoint {
  id: string;
  name: string;
  /** Decimal degrees. */
  lat: number;
  lon: number;
  /** Planned SOG departing this waypoint (kt). */
  speed: number;
  /** Drift until / sail toggle. False = sail (default). */
  drift: boolean;
  /** Departure / arrival ports are fixed endpoints. */
  isPort: boolean;
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

/** Initial true course from point 1 to point 2 (deg). */
function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return Math.round((((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360);
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

const STUB_WAYPOINTS: Waypoint[] = [
  { id: 'wp-1', name: 'Singapore (Departure)', lat: 1.29, lon: 103.85, speed: 12, drift: false, isPort: true },
  { id: 'wp-2', name: 'South China Sea WP', lat: 4.05, lon: 108.5, speed: 12, drift: false, isPort: false },
  { id: 'wp-3', name: 'Luzon Strait', lat: 20.5, lon: 120.83, speed: 12.5, drift: false, isPort: false },
  { id: 'wp-4', name: 'Rotterdam (Arrival)', lat: 51.95, lon: 4.14, speed: 0, drift: false, isPort: true },
];

interface Leg {
  index: number;
  from: Waypoint;
  to: Waypoint;
  distanceNm: number;
  course: number;
}

export function RouteEditorPage() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const selectedVoyage = useSelectedVoyage();
  const { hash } = useLocation();

  const [waypoints, setWaypoints] = useState<Waypoint[]>(STUB_WAYPOINTS);
  const [selectedLeg, setSelectedLeg] = useState(0);
  const [importText, setImportText] = useState('');
  const [ioMessage, setIoMessage] = useState('');

  // Scroll to the section matching the URL hash (e.g. #add-leg).
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('fv-route__section--flash');
      const timer = window.setTimeout(
        () => el.classList.remove('fv-route__section--flash'),
        1200,
      );
      return () => window.clearTimeout(timer);
    }
  }, [hash]);

  const legs = useMemo<Leg[]>(() => {
    const out: Leg[] = [];
    for (let i = 0; i < waypoints.length - 1; i += 1) {
      const from = waypoints[i];
      const to = waypoints[i + 1];
      out.push({
        index: i,
        from,
        to,
        distanceNm: Math.round(haversineNM(from.lat, from.lon, to.lat, to.lon)),
        course: bearingDeg(from.lat, from.lon, to.lat, to.lon),
      });
    }
    return out;
  }, [waypoints]);

  const totalDistance = useMemo(
    () => legs.reduce((acc, leg) => acc + leg.distanceNm, 0),
    [legs],
  );

  const clampLeg = (idx: number) => Math.max(0, Math.min(idx, Math.max(0, legs.length - 1)));

  // --- Operations --------------------------------------------------
  const addLeg = () => {
    setWaypoints((prev) => {
      // Append a new waypoint just before the arrival port (or at the end
      // when there is no arrival), creating a fresh leg to it.
      const lastIsPort = prev.length > 0 && prev[prev.length - 1].isPort;
      const insertAt = lastIsPort ? prev.length - 1 : prev.length;
      const ref = prev[insertAt - 1] ?? prev[prev.length - 1];
      const newWp: Waypoint = {
        id: `wp-${Date.now()}`,
        name: `Waypoint ${prev.length + 1}`,
        lat: ref ? ref.lat + 1 : 0,
        lon: ref ? ref.lon + 1 : 0,
        speed: ref?.speed || 12,
        drift: false,
        isPort: false,
      };
      const next = [...prev];
      next.splice(insertAt, 0, newWp);
      return next;
    });
    setSelectedLeg(clampLeg(legs.length));
    setIoMessage('');
  };

  const splitLeg = (index: number) => {
    setWaypoints((prev) => {
      const from = prev[index];
      const to = prev[index + 1];
      if (!from || !to) return prev;
      const midWp: Waypoint = {
        id: `wp-${Date.now()}`,
        name: `${from.name.replace(/ \(.*\)$/, '')} → ${to.name.replace(/ \(.*\)$/, '')} mid`,
        lat: (from.lat + to.lat) / 2,
        lon: (from.lon + to.lon) / 2,
        speed: from.speed || 12,
        drift: false,
        isPort: false,
      };
      const next = [...prev];
      next.splice(index + 1, 0, midWp);
      return next;
    });
  };

  const mergeLeg = (index: number) => {
    // Merge leg `index` with the next leg by removing the shared waypoint
    // between them (the "to" of this leg). Endpoints can't be removed.
    setWaypoints((prev) => {
      const shared = prev[index + 1];
      if (!shared || shared.isPort || index + 2 > prev.length - 1) return prev;
      return prev.filter((_, i) => i !== index + 1);
    });
    setSelectedLeg((s) => clampLeg(s));
  };

  const updateLegField = <K extends keyof Waypoint>(
    waypointId: string,
    key: K,
    value: Waypoint[K],
  ) => {
    setWaypoints((prev) =>
      prev.map((wp) => (wp.id === waypointId ? { ...wp, [key]: value } : wp)),
    );
  };

  const toggleDrift = (waypointId: string) => {
    setWaypoints((prev) =>
      prev.map((wp) => (wp.id === waypointId ? { ...wp, drift: !wp.drift } : wp)),
    );
  };

  const exportRoute = () => {
    const payload = waypoints.map((wp) => ({
      name: wp.name,
      lat: Number(wp.lat.toFixed(5)),
      lon: Number(wp.lon.toFixed(5)),
      speed: wp.speed,
      drift: wp.drift,
      isPort: wp.isPort,
    }));
    const json = JSON.stringify(payload, null, 2);
    setImportText(json);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(json).catch(() => undefined);
    }
    setIoMessage(t('exportDone', 'Route exported to the text box (and copied to clipboard).'));
  };

  const importRoute = () => {
    try {
      const parsed = JSON.parse(importText);
      if (!Array.isArray(parsed) || parsed.length < 2) {
        setIoMessage(t('importTooFew', 'Provide a JSON array with at least two waypoints.'));
        return;
      }
      const imported: Waypoint[] = parsed.map((raw, i) => ({
        id: `wp-${Date.now()}-${i}`,
        name: String(raw.name ?? `Waypoint ${i + 1}`),
        lat: Number(raw.lat) || 0,
        lon: Number(raw.lon) || 0,
        speed: Number(raw.speed) || 0,
        drift: Boolean(raw.drift),
        isPort: Boolean(raw.isPort) || i === 0 || i === parsed.length - 1,
      }));
      setWaypoints(imported);
      setSelectedLeg(0);
      setIoMessage(t('importDone', 'Route imported.'));
    } catch {
      setIoMessage(t('importErr', 'Could not parse JSON. Check the format and try again.'));
    }
  };

  const downloadRef = useRef<HTMLAnchorElement>(null);
  const downloadRoute = () => {
    const payload = waypoints.map((wp) => ({
      name: wp.name,
      lat: Number(wp.lat.toFixed(5)),
      lon: Number(wp.lon.toFixed(5)),
      speed: wp.speed,
      drift: wp.drift,
      isPort: wp.isPort,
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = downloadRef.current;
    if (a) {
      a.href = url;
      a.download = 'route.json';
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const VESSEL_NAME = selectedVoyage?.vessel ?? 'MV Atlantic Voyager';
  const VOYAGE_LABEL = selectedVoyage
    ? `${selectedVoyage.portFrom} → ${selectedVoyage.portTo}`
    : 'Singapore → Rotterdam';

  return (
    <div className="fv-route">
      <header className="fv-route__header">
        <div className="fv-route__voyage-info">
          <div className="fv-route__title">
            <strong>{VESSEL_NAME}</strong>
            <span className="fv-route__sep">/</span>
            <span className="fv-route__client">{t('routeEditor', 'Route Editor')}</span>
          </div>
          <div className="fv-route__voyage">
            <strong>{VOYAGE_LABEL}</strong>
            <span className="fv-route__sep">·</span>
            <span>
              {legs.length} {t('legs', 'legs')}
            </span>
          </div>
        </div>
        <ul className="fv-route__voyage-stats">
          <li>
            <span>{t('distance', 'Distance')}</span>
            <strong>{totalDistance.toLocaleString()} NM</strong>
          </li>
          <li>
            <span>{t('legs', 'Legs')}</span>
            <strong>{legs.length}</strong>
          </li>
          <li>
            <span>{t('waypoints', 'Waypoints')}</span>
            <strong>{waypoints.length}</strong>
          </li>
        </ul>
      </header>

      {/* Import / Export --------------------------------------------- */}
      <section id="import-export" className="fv-route__section">
        <header className="fv-route__section-header">
          <h2>{t('importExport', 'Import / Export')}</h2>
          <div className="fv-route__bulk">
            <button type="button" className="fv-route__btn" onClick={exportRoute}>
              <i className="fas fa-file-export" aria-hidden="true" /> {t('export', 'Export')}
            </button>
            <button type="button" className="fv-route__btn" onClick={downloadRoute}>
              <i className="fas fa-download" aria-hidden="true" /> {t('download', 'Download')}
            </button>
            <button
              type="button"
              className="fv-route__btn fv-route__btn--primary"
              onClick={importRoute}
            >
              <i className="fas fa-file-import" aria-hidden="true" /> {t('import', 'Import')}
            </button>
            {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
            <a ref={downloadRef} style={{ display: 'none' }} aria-hidden="true" />
          </div>
        </header>
        <textarea
          className="fv-route__io-text"
          rows={6}
          placeholder={t(
            'ioPlaceholder',
            'Paste route JSON here to import, or click Export to dump the current route.',
          )}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
        {ioMessage && <p className="fv-route__io-msg">{ioMessage}</p>}
      </section>

      {/* Leg operations ---------------------------------------------- */}
      <section id="add-leg" className="fv-route__section">
        <header className="fv-route__section-header">
          <h2>{t('legOperations', 'Leg Operations')}</h2>
          <div className="fv-route__bulk">
            <label className="fv-route__bulk-speed">
              <span>{t('selectLeg', 'Select leg')}</span>
              <select
                value={selectedLeg}
                onChange={(e) => setSelectedLeg(Number(e.target.value))}
                disabled={legs.length === 0}
              >
                {legs.map((leg) => (
                  <option key={leg.index} value={leg.index}>
                    {t('leg', 'Leg')} {leg.index + 1}: {leg.from.name} → {leg.to.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="fv-route__btn" onClick={addLeg}>
              <i className="fas fa-plus" aria-hidden="true" /> {t('addLeg', 'Add leg')}
            </button>
            <span id="split-leg" />
            <button
              type="button"
              className="fv-route__btn"
              onClick={() => splitLeg(selectedLeg)}
              disabled={legs.length === 0}
              title={t('splitHint', 'Insert a waypoint at the midpoint of the selected leg')}
            >
              <i className="fas fa-arrows-left-right-to-line" aria-hidden="true" />{' '}
              {t('splitLeg', 'Split leg')}
            </button>
            <span id="merge-leg" />
            <button
              type="button"
              className="fv-route__btn"
              onClick={() => mergeLeg(selectedLeg)}
              disabled={
                legs.length < 2 ||
                selectedLeg >= legs.length - 1 ||
                waypoints[selectedLeg + 1]?.isPort
              }
              title={t('mergeHint', 'Merge the selected leg with the next one')}
            >
              <i className="fas fa-compress" aria-hidden="true" /> {t('mergeLeg', 'Merge leg')}
            </button>
          </div>
        </header>
        <p className="fv-route__hint">
          {t(
            'legOpsHint',
            'Add appends a new leg before arrival. Split inserts a midpoint into the selected leg. Merge removes the waypoint shared with the next leg (endpoints are protected).',
          )}
        </p>
      </section>

      {/* Update leg / legs table ------------------------------------- */}
      <section id="update-leg" className="fv-route__section">
        <header className="fv-route__section-header">
          <h2>{t('legs', 'Legs')}</h2>
        </header>
        <div className="fv-route__wp-scroll">
          <table className="fv-route__wp-table">
            <thead>
              <tr>
                <th>{t('leg', 'Leg')}</th>
                <th>{t('from', 'From')}</th>
                <th>{t('toName', 'To (editable)')}</th>
                <th>{t('course', 'Course')}</th>
                <th>{t('speed', 'Speed')}</th>
                <th>{t('distNm', 'Dist (NM)')}</th>
                <th id="toggle-drift">{t('mode', 'Mode')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {legs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="fv-route__center">
                    {t('noLegs', 'No legs — add one above.')}
                  </td>
                </tr>
              ) : (
                legs.map((leg) => (
                  <tr
                    key={leg.index}
                    className={`${selectedLeg === leg.index ? 'fv-route__wp-row--selected' : ''}${
                      leg.to.drift ? ' fv-route__wp-row--drift' : ''
                    }`}
                    onClick={() => setSelectedLeg(leg.index)}
                  >
                    <td className="fv-route__wp-num">
                      {leg.index + 1}
                      {leg.to.isPort && (
                        <span className="fv-route__wp-port" title="Port">
                          <i className="fas fa-anchor" aria-hidden="true" />
                        </span>
                      )}
                    </td>
                    <td>{leg.from.name}</td>
                    <td>
                      <input
                        type="text"
                        value={leg.to.name}
                        onChange={(e) => updateLegField(leg.to.id, 'name', e.target.value)}
                        disabled={leg.to.isPort}
                      />
                    </td>
                    <td className="fv-route__num">{leg.course}°</td>
                    <td>
                      <input
                        type="number"
                        step="0.1"
                        value={leg.from.speed}
                        onChange={(e) =>
                          updateLegField(leg.from.id, 'speed', Number(e.target.value) || 0)
                        }
                        disabled={leg.from.drift}
                      />
                    </td>
                    <td className="fv-route__num">{leg.distanceNm.toLocaleString()}</td>
                    <td className="fv-route__center">
                      <label className="fv-route__drift-toggle" title="Drift / Sail">
                        <input
                          type="checkbox"
                          checked={leg.from.drift}
                          onChange={() => toggleDrift(leg.from.id)}
                        />
                        <span>{leg.from.drift ? t('drift', 'Drift') : t('sail', 'Sail')}</span>
                      </label>
                    </td>
                    <td className="fv-route__center">
                      <button
                        type="button"
                        className="fv-route__icon-btn"
                        title={t('splitLeg', 'Split leg')}
                        onClick={(e) => {
                          e.stopPropagation();
                          splitLeg(leg.index);
                        }}
                      >
                        <i className="fas fa-arrows-left-right-to-line" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="fv-route__icon-btn"
                        title={
                          leg.to.isPort
                            ? t('cantMergeArrival', 'Cannot merge across the arrival port')
                            : t('mergeLeg', 'Merge with next leg')
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          mergeLeg(leg.index);
                        }}
                        disabled={leg.to.isPort || leg.index >= legs.length - 1}
                      >
                        <i className="fas fa-compress" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Waypoint details -------------------------------------------- */}
      <section id="waypoint-details" className="fv-route__section">
        <header className="fv-route__section-header">
          <h2>{t('waypointDetails', 'Waypoint Details')}</h2>
        </header>
        <div className="fv-route__wp-scroll">
          <table className="fv-route__wp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('waypointName', 'Waypoint')}</th>
                <th>{t('lat', 'Lat')}</th>
                <th>{t('lon', 'Lon')}</th>
                <th>{t('course', 'Course')}</th>
                <th>{t('speed', 'Speed')}</th>
                <th>{t('distFromLast', 'Dist from last WP')}</th>
                <th>{t('mode', 'Mode')}</th>
              </tr>
            </thead>
            <tbody>
              {waypoints.map((wp, idx) => {
                const prev = waypoints[idx - 1];
                const dist =
                  idx === 0 ? 0 : Math.round(haversineNM(prev.lat, prev.lon, wp.lat, wp.lon));
                const course =
                  idx === 0 ? 0 : bearingDeg(prev.lat, prev.lon, wp.lat, wp.lon);
                return (
                  <tr key={wp.id}>
                    <td className="fv-route__wp-num">
                      {idx + 1}
                      {wp.isPort && (
                        <span className="fv-route__wp-port" title="Port">
                          <i className="fas fa-anchor" aria-hidden="true" />
                        </span>
                      )}
                    </td>
                    <td>{wp.name}</td>
                    <td>{decToDM(wp.lat, true)}</td>
                    <td>{decToDM(wp.lon, false)}</td>
                    <td className="fv-route__num">{idx === 0 ? '—' : `${course}°`}</td>
                    <td className="fv-route__num">{wp.drift ? '—' : `${wp.speed} kt`}</td>
                    <td className="fv-route__num">
                      {idx === 0 ? '—' : `${dist.toLocaleString()} NM`}
                    </td>
                    <td>{wp.drift ? t('drift', 'Drift') : t('sail', 'Sail')}</td>
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
