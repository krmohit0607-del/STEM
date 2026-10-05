import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import L, { type ControlPosition } from 'leaflet';

import { sampleWeatherField } from '../data/weatherField';
import { sampleLiveField, type LatLngBounds } from '../data/openMeteo';
import { isLand } from '../data/landMask';
import { useActiveSimRoute } from '../data/routeSimulatorStore';
import { fetchActiveCyclones, type CycloneDto } from '../api/cyclonesApi';
import { MAP_CONTROL_OPEN_EVENT, notifyMapControlOpen } from './mapControlEvents';

/**
 * Weather-routing alerts bell: bad weather (current view + along the active
 * route), cyclone CPA, and a placeholder for AIS-based speed-drop detection
 * (not implemented yet — needs the AIS feed). Place it as a child of any
 * `<MapContainer>`, right after `<CycloneLayer>`:
 *
 *   <MapContainer ...>
 *     <CycloneLayer position="topright" />
 *     <WeatherAlertsControl position="topright" />
 *   </MapContainer>
 */
const WAVE_THRESHOLD_M = 5.0;
const WIND_THRESHOLD_KT = 25;
const CYCLONE_CPA_WARN_NM = 200;
const SCAN_COLS = 10;
const SCAN_ROWS = 7;
const RESCAN_INTERVAL_MS = 20_000;
const CYCLONE_REFRESH_MS = 15 * 60_000;
/** Route points are resampled at roughly this spacing so bad weather between
 *  sparse waypoints isn't missed; capped overall to bound scan cost. */
const ROUTE_SAMPLE_SPACING_NM = 100;
const ROUTE_SAMPLE_MAX = 200;

type AlertKind = 'view-wave' | 'view-wind' | 'route-wave' | 'route-wind' | 'cyclone';

interface WeatherAlert {
  id: string;
  kind: AlertKind;
  label: string;
  detail: string;
  icon: string;
  lat: number;
  lon: number;
  /** Used to sort within a group (higher = more severe / sooner). */
  sortValue: number;
}

/** Great-circle distance in nautical miles. */
function distanceNm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R_NM = 3440.065;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Resample a route polyline (with optional cumulative hours per vertex) to
 *  a roughly-even spacing, carrying an interpolated ETA hour along for each
 *  new point (straight-line lerp within each leg — a weather-routing warning
 *  doesn't need navigation-grade great-circle precision). */
function densifyRoute(
  path: Array<[number, number]>,
  timeHours: number[] | undefined,
): Array<{ lat: number; lon: number; hour: number | null }> {
  const out: Array<{ lat: number; lon: number; hour: number | null }> = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const [lat0, lon0] = path[i];
    const [lat1, lon1] = path[i + 1];
    const h0 = timeHours?.[i] ?? null;
    const h1 = timeHours?.[i + 1] ?? null;
    const legNm = distanceNm(lat0, lon0, lat1, lon1);
    const steps = Math.max(1, Math.min(20, Math.round(legNm / ROUTE_SAMPLE_SPACING_NM)));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      out.push({
        lat: lat0 + (lat1 - lat0) * t,
        lon: lon0 + (lon1 - lon0) * t,
        hour: h0 != null && h1 != null ? h0 + (h1 - h0) * t : null,
      });
      if (out.length >= ROUTE_SAMPLE_MAX) return out;
    }
  }
  const last = path[path.length - 1];
  if (last) out.push({ lat: last[0], lon: last[1], hour: timeHours?.[path.length - 1] ?? null });
  return out;
}

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
      const div = L.DomUtil.create('div', 'fv-wa-control');
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

export function WeatherAlertsControl({
  position = 'topright',
}: {
  position?: ControlPosition;
} = {}) {
  const map = useMap();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const route = useActiveSimRoute();

  useEffect(() => {
    const closeWhenAnotherOpens = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== 'alerts') setOpen(false);
    };
    window.addEventListener(MAP_CONTROL_OPEN_EVENT, closeWhenAnotherOpens);
    return () => window.removeEventListener(MAP_CONTROL_OPEN_EVENT, closeWhenAnotherOpens);
  }, []);

  // Active cyclones, polled independently of CycloneLayer (the backend
  // endpoint is itself cached ~15 min, so a second poll is cheap).
  const [cyclones, setCyclones] = useState<CycloneDto[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchActiveCyclones()
        .then((list) => {
          if (!cancelled) setCyclones(list);
        })
        .catch(() => {
          /* ignore — cyclone CPA checks simply skip this round */
        });
    };
    load();
    const id = window.setInterval(load, CYCLONE_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const scan = () => {
      if (cancelled) return;
      const found: WeatherAlert[] = [];

      // --- bad weather currently visible in the viewport ---------------
      const b = map.getBounds();
      const bounds: LatLngBounds = {
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
      };
      let worstWave = 0;
      let worstWind = 0;
      let worstWaveAt: [number, number] | null = null;
      let worstWindAt: [number, number] | null = null;
      for (let r = 0; r < SCAN_ROWS; r += 1) {
        for (let c = 0; c < SCAN_COLS; c += 1) {
          const lat = bounds.north + (bounds.south - bounds.north) * (r / (SCAN_ROWS - 1));
          const lon = bounds.west + (bounds.east - bounds.west) * (c / (SCAN_COLS - 1));
          if (isLand(lat, lon)) continue;
          const wave = sampleLiveField(lat, lon, 'waves', bounds, 0) ?? sampleWeatherField(lat, lon, 'waves', 0);
          const wind = sampleLiveField(lat, lon, 'wind', bounds, 0) ?? sampleWeatherField(lat, lon, 'wind', 0);
          if (wave.magnitude > worstWave) {
            worstWave = wave.magnitude;
            worstWaveAt = [lat, lon];
          }
          if (wind.magnitude > worstWind) {
            worstWind = wind.magnitude;
            worstWindAt = [lat, lon];
          }
        }
      }
      if (worstWave >= WAVE_THRESHOLD_M && worstWaveAt) {
        found.push({
          id: 'view-wave',
          kind: 'view-wave',
          label: 'High waves in view',
          detail: `${worstWave.toFixed(1)} m (current view)`,
          icon: 'fa-water',
          lat: worstWaveAt[0],
          lon: worstWaveAt[1],
          sortValue: worstWave,
        });
      }
      if (worstWind >= WIND_THRESHOLD_KT && worstWindAt) {
        found.push({
          id: 'view-wind',
          kind: 'view-wind',
          label: 'Strong wind in view',
          detail: `${worstWind.toFixed(0)} kt (current view)`,
          icon: 'fa-wind',
          lat: worstWindAt[0],
          lon: worstWindAt[1],
          sortValue: worstWind,
        });
      }

      // --- the active route vs forecast weather along its own ETA -------
      if (route && route.path.length > 1) {
        const samples = densifyRoute(route.path, route.timeHours);
        let firstWave: { hour: number; lat: number; lon: number; mag: number } | null = null;
        let firstWind: { hour: number; lat: number; lon: number; mag: number } | null = null;
        for (const s of samples) {
          const hour = Math.max(0, s.hour ?? 0);
          const wave = sampleLiveField(s.lat, s.lon, 'waves', bounds, hour) ?? sampleWeatherField(s.lat, s.lon, 'waves', hour);
          const wind = sampleLiveField(s.lat, s.lon, 'wind', bounds, hour) ?? sampleWeatherField(s.lat, s.lon, 'wind', hour);
          if (wave.magnitude >= WAVE_THRESHOLD_M && (!firstWave || hour < firstWave.hour)) {
            firstWave = { hour, lat: s.lat, lon: s.lon, mag: wave.magnitude };
          }
          if (wind.magnitude >= WIND_THRESHOLD_KT && (!firstWind || hour < firstWind.hour)) {
            firstWind = { hour, lat: s.lat, lon: s.lon, mag: wind.magnitude };
          }
        }
        if (firstWave) {
          const days = firstWave.hour / 24;
          found.push({
            id: 'route-wave',
            kind: 'route-wave',
            label: 'Bad waves ahead on route',
            detail: `${firstWave.mag.toFixed(1)} m in ${days < 1 ? '<1' : days.toFixed(1)} day${days >= 2 ? 's' : ''}`,
            icon: 'fa-water',
            lat: firstWave.lat,
            lon: firstWave.lon,
            sortValue: -firstWave.hour,
          });
        }
        if (firstWind) {
          const days = firstWind.hour / 24;
          found.push({
            id: 'route-wind',
            kind: 'route-wind',
            label: 'Strong wind ahead on route',
            detail: `${firstWind.mag.toFixed(0)} kt in ${days < 1 ? '<1' : days.toFixed(1)} day${days >= 2 ? 's' : ''}`,
            icon: 'fa-wind',
            lat: firstWind.lat,
            lon: firstWind.lon,
            sortValue: -firstWind.hour,
          });
        }

        // --- cyclone CPA against the route ------------------------------
        for (const cy of cyclones) {
          const trackPts = [{ lat: cy.latitude, lon: cy.longitude }, ...cy.track];
          let cpa = Infinity;
          let cpaAt: [number, number] = [cy.latitude, cy.longitude];
          for (const s of samples) {
            for (const t of trackPts) {
              const d = distanceNm(s.lat, s.lon, t.lat, t.lon);
              if (d < cpa) {
                cpa = d;
                cpaAt = [t.lat, t.lon];
              }
            }
          }
          if (cpa <= CYCLONE_CPA_WARN_NM) {
            found.push({
              id: `cyclone-${cy.id}`,
              kind: 'cyclone',
              label: `${cy.name || cy.classification || 'Cyclone'} near route`,
              detail: `CPA ${Math.round(cpa)} NM`,
              icon: 'fa-hurricane',
              lat: cpaAt[0],
              lon: cpaAt[1],
              sortValue: -cpa,
            });
          }
        }
      }

      found.sort((a, b2) => b2.sortValue - a.sortValue);
      if (!cancelled) setAlerts(found);
    };

    scan();
    map.on('moveend zoomend', scan);
    const id = window.setInterval(scan, RESCAN_INTERVAL_MS);
    return () => {
      cancelled = true;
      map.off('moveend zoomend', scan);
      window.clearInterval(id);
    };
  }, [map, route, cyclones]);

  const panTo = (a: WeatherAlert) => {
    map.setView([a.lat, a.lon], Math.max(map.getZoom(), 5));
  };

  return (
    <ControlPortal position={position}>
      <button
        type="button"
        className={`fv-wa-control__btn${alerts.length ? ' fv-wa-control__btn--alert' : ''}`}
        title="Weather & route alerts"
        aria-label="Weather & route alerts"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => {
            const next = !current;
            if (next) notifyMapControlOpen('alerts');
            return next;
          });
        }}
      >
        <i className="fas fa-triangle-exclamation" aria-hidden="true" />
        {alerts.length > 0 && <span className="fv-wa-control__badge">{alerts.length}</span>}
      </button>

      {open && (
        <div className="fv-wa-control__panel" role="menu">
          <div className="fv-wa-control__head">
            <span>Weather Alerts</span>
            <span className="fv-wa-control__sub">Route + current view</span>
          </div>

          {alerts.length === 0 ? (
            <div className="fv-wa-control__empty">No warnings right now.</div>
          ) : (
            <ul className="fv-wa-control__list">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className="fv-wa-control__row"
                  onClick={() => panTo(a)}
                  role="button"
                  tabIndex={0}
                >
                  <i className={`fas ${a.icon}`} aria-hidden="true" />
                  <span className="fv-wa-control__label">{a.label}</span>
                  <span className="fv-wa-control__value">{a.detail}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="fv-wa-control__foot">
            Waves ≥ {WAVE_THRESHOLD_M.toFixed(1)} m · Wind ≥ {WIND_THRESHOLD_KT} kt · Cyclone CPA ≤{' '}
            {CYCLONE_CPA_WARN_NM} NM
          </div>
          <div className="fv-wa-control__soon">
            <i className="fas fa-ship" aria-hidden="true" /> Speed-drop detection (AIS) — coming soon
          </div>
        </div>
      )}
    </ControlPortal>
  );
}
