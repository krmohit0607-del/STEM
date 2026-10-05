import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Marker, Polygon, Polyline, Popup, Tooltip, useMap } from 'react-leaflet';
import L, { type ControlPosition } from 'leaflet';

import { fetchActiveCyclones, type CycloneDto } from '../api/cyclonesApi';
import { MAP_CONTROL_OPEN_EVENT, notifyMapControlOpen } from './mapControlEvents';

/**
 * Active cyclones/typhoons/tropical storms &amp; depressions from NOAA's
 * National Hurricane Center and the Joint Typhoon Warning Center, as a
 * toggleable map layer — a MarineTraffic-style bullseye at the current
 * position with a floating name/time/wind label, the forecast track line
 * with a dot per forecast point, and (NOAA only, when published) the
 * forecast cone of uncertainty. Click the bullseye for the official
 * advisory text, forecast graphic/satellite image, and full track details.
 *
 *   <MapContainer ...>
 *     <CycloneLayer position="topright" />
 *   </MapContainer>
 */
const ON_KEY = 'fv.map.cyclones.on';
const REFRESH_MS = 15 * 60 * 1000;

function readOn(): boolean {
  try {
    return window.localStorage.getItem(ON_KEY) === '1';
  } catch {
    return false;
  }
}

/** Saffir-Simpson-ish colour by 1-minute sustained wind (knots). */
function cycloneColor(windKt: number | null | undefined): string {
  const kt = windKt ?? 0;
  if (kt >= 137) return '#9b30ff'; // Cat 5
  if (kt >= 113) return '#c0392b'; // Cat 4
  if (kt >= 96) return '#e2572c'; // Cat 3
  if (kt >= 83) return '#f2a53c'; // Cat 2
  if (kt >= 64) return '#f2d23c'; // Cat 1
  if (kt >= 34) return '#4fc6c6'; // Tropical storm
  return '#9fd3f2'; // Tropical depression
}

function bullseyeIcon(cyclone: CycloneDto): L.DivIcon {
  const color = cycloneColor(cyclone.maxSustainedWindKt);
  return L.divIcon({
    className: 'fv-cyclone-bullseye',
    html:
      `<span class="fv-cyclone-bullseye__ring3" style="border-color:${color}"></span>` +
      `<span class="fv-cyclone-bullseye__ring2" style="border-color:${color}"></span>` +
      `<span class="fv-cyclone-bullseye__core" style="background:${color}"></span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

const TRACK_DOT_ICON = L.divIcon({
  className: 'fv-cyclone-track-dot',
  html: '<span></span>',
  iconSize: [9, 9],
  iconAnchor: [4, 4],
});

/** "DD/HHZ" from an ISO timestamp (UTC day-of-month / hour), NOAA-advisory style. */
function formatLabelTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hour = String(d.getUTCHours()).padStart(2, '0');
  return `${day}/${hour}Z`;
}

function formatUpdated(iso: string | null | undefined): string {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return `${d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;
}

function ControlPortal({ position, children }: { position: ControlPosition; children: React.ReactNode }) {
  const map = useMap();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const ctrl = new L.Control({ position });
    ctrl.onAdd = () => {
      const div = L.DomUtil.create('div', 'fv-cyclone-control');
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      setContainer(div);
      return div;
    };
    ctrl.addTo(map);
    return () => {
      ctrl.remove();
    };
  }, [map, position]);

  return container ? createPortal(children, container) : null;
}

/** One storm's bullseye + label + forecast track + cone of uncertainty. */
function CycloneFeature({ cyclone }: { cyclone: CycloneDto }) {
  const labelTime = formatLabelTime(cyclone.lastUpdateUtc);
  const labelWind = cyclone.maxSustainedWindKt != null ? `${cyclone.maxSustainedWindKt.toFixed(1)} kt` : null;
  const trackLatLngs = cyclone.track.map((p): [number, number] => [p.lat, p.lon]);
  const coneLatLngs = cyclone.conePolygon.map((p): [number, number] => [p.lat, p.lon]);

  return (
    <>
      {coneLatLngs.length > 2 && (
        <Polygon
          positions={coneLatLngs}
          pathOptions={{ color: '#f2c14e', weight: 1, fillColor: '#f2c14e', fillOpacity: 0.22, interactive: false }}
        />
      )}
      {trackLatLngs.length > 1 && (
        <>
          <Polyline positions={trackLatLngs} pathOptions={{ color: '#e2342c', weight: 2, interactive: false }} />
          {cyclone.track.slice(1).map((p, i) => (
            <Marker key={i} position={[p.lat, p.lon]} icon={TRACK_DOT_ICON} interactive={false} />
          ))}
        </>
      )}
      <Marker position={[cyclone.latitude, cyclone.longitude]} icon={bullseyeIcon(cyclone)}>
        <Tooltip permanent direction="right" offset={[14, 0]} className="fv-cyclone-label" opacity={1}>
          <strong>{cyclone.name.toUpperCase()}</strong>
          {labelTime || labelWind ? ' ' : ''}
          {labelTime}
          {labelTime && labelWind ? ' \u00b7 ' : ''}
          {labelWind}
        </Tooltip>
        <Popup minWidth={240} maxWidth={280}>
          <div className="fv-cyclone-popup">
            <header>
              <span className="fv-cyclone-popup__source">{cyclone.source}</span>
              <h4>
                {cyclone.classificationLabel ?? cyclone.classification ?? 'Tropical Cyclone'} {cyclone.name}
              </h4>
              {cyclone.basin && <p className="fv-cyclone-popup__basin">{cyclone.basin}</p>}
            </header>
            <dl>
              {cyclone.maxSustainedWindKt != null && (
                <>
                  <dt>Max winds</dt>
                  <dd>{Math.round(cyclone.maxSustainedWindKt)} kt</dd>
                </>
              )}
              {cyclone.pressureMb != null && (
                <>
                  <dt>Pressure</dt>
                  <dd>{Math.round(cyclone.pressureMb)} mb</dd>
                </>
              )}
              {cyclone.movementSpeedKt != null && (
                <>
                  <dt>Movement</dt>
                  <dd>
                    {Math.round(cyclone.movementSpeedKt)} kt
                    {cyclone.movementDirectionDeg != null ? ` @ ${Math.round(cyclone.movementDirectionDeg)}\u00b0` : ''}
                  </dd>
                </>
              )}
              {cyclone.warningNumber && (
                <>
                  <dt>Warning #</dt>
                  <dd>{cyclone.warningNumber}</dd>
                </>
              )}
              <dt>Updated</dt>
              <dd>{formatUpdated(cyclone.lastUpdateUtc)}</dd>
            </dl>
            {cyclone.imageUrl && (
              <a href={cyclone.imageUrl} target="_blank" rel="noreferrer">
                <img src={cyclone.imageUrl} alt={`${cyclone.name} forecast/satellite graphic`} className="fv-cyclone-popup__img" />
              </a>
            )}
            <div className="fv-cyclone-popup__links">
              {cyclone.advisoryUrl && (
                <a href={cyclone.advisoryUrl} target="_blank" rel="noreferrer">
                  <i className="fas fa-file-lines" aria-hidden="true" /> Advisory
                </a>
              )}
              {cyclone.graphicUrl && cyclone.graphicUrl !== cyclone.imageUrl && (
                <a href={cyclone.graphicUrl} target="_blank" rel="noreferrer">
                  <i className="fas fa-chart-line" aria-hidden="true" /> Forecast graphic
                </a>
              )}
            </div>
          </div>
        </Popup>
      </Marker>
    </>
  );
}

export function CycloneLayer({ position = 'topright' }: { position?: ControlPosition } = {}) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(() => readOn());
  const [cyclones, setCyclones] = useState<CycloneDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const closeWhenAnotherOpens = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== 'cyclones') setOpen(false);
    };
    window.addEventListener(MAP_CONTROL_OPEN_EVENT, closeWhenAnotherOpens);
    return () => window.removeEventListener(MAP_CONTROL_OPEN_EVENT, closeWhenAnotherOpens);
  }, []);

  useEffect(() => {
    if (!on) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      return;
    }
    let cancelled = false;
    const load = () => {
      setLoading(true);
      fetchActiveCyclones()
        .then((data) => {
          if (!cancelled) {
            setCyclones(data);
            setError(null);
          }
        })
        .catch(() => {
          if (!cancelled) setError('Could not load cyclone data');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    timerRef.current = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [on]);

  const updateOn = (next: boolean) => {
    setOn(next);
    try {
      window.localStorage.setItem(ON_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      {on && cyclones.map((c) => <CycloneFeature key={c.id} cyclone={c} />)}

      <ControlPortal position={position}>
        <button
          type="button"
          className={`fv-cyclone-control__btn${on ? ' fv-cyclone-control__btn--on' : ''}`}
          title="Active cyclones (NOAA / JTWC)"
          aria-label="Active cyclones"
          aria-expanded={open}
          onClick={() => {
            setOpen((current) => {
              const next = !current;
              if (next) notifyMapControlOpen('cyclones');
              return next;
            });
          }}
        >
          <i className="fas fa-hurricane" aria-hidden="true" />
        </button>

        {open && (
          <div className="fv-cyclone-control__panel" role="menu">
            <label className="fv-cyclone-control__head">
              <span>Active Cyclones (NOAA / JTWC)</span>
              <input type="checkbox" checked={on} onChange={(e) => updateOn(e.target.checked)} />
            </label>
            {on && (
              <div className="fv-cyclone-control__status">
                {loading && cyclones.length === 0 && <span>Loading…</span>}
                {error && <span className="fv-cyclone-control__error">{error}</span>}
                {!loading && !error && (
                  <span>{cyclones.length ? `${cyclones.length} active system${cyclones.length === 1 ? '' : 's'}` : 'No active systems'}</span>
                )}
              </div>
            )}
          </div>
        )}
      </ControlPortal>
    </>
  );
}
