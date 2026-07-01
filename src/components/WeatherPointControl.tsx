import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Popup, useMap, useMapEvents } from 'react-leaflet';
import L, { type ControlPosition } from 'leaflet';

import { FIELD_FACTORS, type FieldFactor } from '../data/weatherField';
import {
  fetchPointForecast,
  fetchPointWeather,
  type ForecastRow,
  type PointFactor,
} from '../data/openMeteo';

/**
 * Drop-in map control that lets the user inspect the weather at any point.
 * Place it as a child of any `<MapContainer>`:
 *
 *   <MapContainer ...>
 *     <WeatherPointControl />
 *   </MapContainer>
 *
 * A toggle button turns "inspect" mode on/off. While on, the cursor
 * becomes a crosshair and clicking anywhere on the map fetches every
 * supported weather factor at that spot (via Open-Meteo) and shows them
 * in a popup.
 */

/** Renders React children into a real Leaflet control container. */
function ControlPortal({
  position,
  children,
}: {
  position: ControlPosition;
  children: React.ReactNode;
}) {
  const map = useMap();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const ctrl = new L.Control({ position });
    ctrl.onAdd = () => {
      const div = L.DomUtil.create('div', 'fv-wp-control');
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

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function compass(deg: number): string {
  return COMPASS[Math.round(deg / 45) % 8];
}

/** `12.3 kt` (+ ` · 210° SW` for directional factors). */
function formatValue(v: PointFactor, factor: FieldFactor): string {
  const mag = `${v.magnitude.toFixed(1)} ${factor.unit}`;
  if (factor.directional && v.directionDeg != null) {
    return `${mag} · ${Math.round(v.directionDeg)}° ${compass(v.directionDeg)}`;
  }
  return mag;
}

/** `01.29° N` style compact coordinate. */
function formatCoord(value: number, isLat: boolean): string {
  const hemi = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return `${Math.abs(value).toFixed(2)}° ${hemi}`;
}

/** Build a CSV of the hourly forecast, one column per (directional) factor. */
function buildForecastCsv(rows: ForecastRow[]): string {
  const header: string[] = ['Time (UTC)'];
  for (const f of FIELD_FACTORS) {
    header.push(`${f.label} (${f.unit})`);
    if (f.directional) header.push(`${f.label} direction (deg)`);
  }
  const lines = [header.join(',')];
  for (const row of rows) {
    const cells: string[] = [row.time];
    for (const f of FIELD_FACTORS) {
      const v = row.values[f.id];
      cells.push(v ? v.magnitude.toFixed(2) : '');
      if (f.directional) {
        cells.push(v && v.directionDeg != null ? String(Math.round(v.directionDeg)) : '');
      }
    }
    lines.push(cells.join(','));
  }
  return lines.join('\r\n');
}

/** Trigger a client-side download of `text` as a file named `filename`. */
function downloadTextFile(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function WeatherPointControl({
  position = 'topright',
}: {
  position?: ControlPosition;
} = {}) {
  const [active, setActive] = useState(false);
  const [point, setPoint] = useState<{
    lat: number;
    lon: number;
    displayLat: number;
    displayLng: number;
  } | null>(null);
  const [data, setData] = useState<Record<string, PointFactor> | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('ready');
  const [downloading, setDownloading] = useState(false);

  const map = useMapEvents({
    click(e) {
      if (!active) return;
      // Leaflet lets the map scroll across world copies, so the raw click
      // longitude can fall outside -180..180 (and Open-Meteo rejects those).
      // Wrap the coordinate back into the canonical range before fetching,
      // but keep the raw click position so the popup stays where clicked.
      const wrapped = e.latlng.wrap();
      const lat = Math.max(-90, Math.min(90, wrapped.lat));
      const lon = wrapped.lng;
      setPoint({ lat, lon, displayLat: e.latlng.lat, displayLng: e.latlng.lng });
      setData(null);
      setStatus('loading');
      fetchPointWeather(lat, lon)
        .then((res) => {
          if (Object.keys(res).length === 0) {
            setStatus('error');
            return;
          }
          setData(res);
          setStatus('ready');
        })
        .catch(() => setStatus('error'));
    },
  });

  // Crosshair cursor while inspecting.
  useEffect(() => {
    const el = map.getContainer();
    el.style.cursor = active ? 'crosshair' : '';
    return () => {
      el.style.cursor = '';
    };
  }, [map, active]);

  const closePopup = () => {
    setPoint(null);
    setData(null);
    setStatus('ready');
  };

  const handleDownload = () => {
    if (!point || downloading) return;
    setDownloading(true);
    fetchPointForecast(point.lat, point.lon)
      .then((rows) => {
        if (!rows.length) return;
        const name = `forecast_${point.lat.toFixed(2)}_${point.lon.toFixed(2)}.csv`;
        downloadTextFile(buildForecastCsv(rows), name);
      })
      .catch(() => {
        /* ignore — download simply doesn't start */
      })
      .finally(() => setDownloading(false));
  };

  return (
    <>
      <ControlPortal position={position}>
        <button
          type="button"
          className={`fv-wp-control__btn${active ? ' fv-wp-control__btn--on' : ''}`}
          title="Show weather at a point"
          aria-label="Show weather at a point"
          aria-pressed={active}
          onClick={() => setActive((a) => !a)}
        >
          <i className="fas fa-location-crosshairs" aria-hidden="true" />
        </button>
      </ControlPortal>

      {point && (
        <Popup
          position={[point.displayLat, point.displayLng]}
          maxWidth={260}
          className="fv-wp-popup"
          eventHandlers={{ remove: closePopup }}
        >
          <div className="fv-wp-popup__inner">
            <div className="fv-wp-popup__head">
              <i className="fas fa-location-dot" aria-hidden="true" />
              <span>
                {formatCoord(point.lat, true)}, {formatCoord(point.lon, false)}
              </span>
            </div>

            {status === 'loading' && (
              <div className="fv-wp-popup__msg">Loading weather…</div>
            )}
            {status === 'error' && (
              <div className="fv-wp-popup__msg">Weather unavailable for this point.</div>
            )}
            {status === 'ready' && data && (
              <ul className="fv-wp-popup__list">
                {FIELD_FACTORS.map((factor) => {
                  const v = data[factor.id];
                  return (
                    <li key={factor.id} className="fv-wp-popup__row">
                      <i className={`fas ${factor.icon}`} aria-hidden="true" />
                      <span className="fv-wp-popup__label">{factor.label}</span>
                      <span className="fv-wp-popup__value">
                        {v ? formatValue(v, factor) : '—'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {status === 'ready' && data && (
              <div className="fv-wp-popup__foot">
                <button
                  type="button"
                  className="fv-wp-popup__download"
                  onClick={handleDownload}
                  disabled={downloading}
                  title="Download forecast (CSV)"
                >
                  <i
                    className={`fas ${downloading ? 'fa-spinner fa-spin' : 'fa-download'}`}
                    aria-hidden="true"
                  />
                  <span>{downloading ? 'Preparing…' : 'Download forecast'}</span>
                </button>
              </div>
            )}
          </div>
        </Popup>
      )}
    </>
  );
}
