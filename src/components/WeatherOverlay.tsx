import { useEffect, useMemo, useRef, useState } from 'react';
import { Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

import {
  WeatherError,
  fetchManyPointWeather,
  formatFactorValue,
  type PointWeather,
} from '../api/stormglass';
import { useWeather } from '../context/WeatherContext';

/**
 * Live Storm Glass weather overlay rendered as Leaflet markers. Drop it
 * as a child of any `<MapContainer>`.
 *
 * - When `points` is supplied (route waypoints, ship positions, …) the
 *   overlay samples weather at exactly those locations.
 * - Otherwise it derives a coarse grid from the current map bounds so the
 *   general world map still shows conditions wherever the user is looking.
 *
 * Fetching is debounced and the API client caches aggressively, so the
 * overlay stays within Storm Glass's tight free-tier quota.
 */

interface WeatherOverlayProps {
  /** Explicit sample locations. Omit to derive a grid from map bounds. */
  points?: Array<[number, number]>;
  /** Hard cap on the number of API points fetched (default 6). */
  maxPoints?: number;
}

const DEBOUNCE_MS = 1200;

function roundKey(lat: number, lon: number): string {
  return `${lat.toFixed(1)},${lon.toFixed(1)}`;
}

/** Dedupe + evenly down-sample the supplied points to at most `max`. */
function pickPoints(
  coords: Array<[number, number]>,
  max: number,
): Array<[number, number]> {
  const seen = new Set<string>();
  const unique: Array<[number, number]> = [];
  for (const c of coords) {
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    const k = roundKey(c[0], c[1]);
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(c);
  }
  if (unique.length <= max) return unique;
  const step = (unique.length - 1) / (max - 1);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < max; i += 1) out.push(unique[Math.round(i * step)]);
  return out;
}

/** Builds a small inset grid of sample points from a Leaflet bounds box. */
function gridFromBounds(map: L.Map, max: number): Array<[number, number]> {
  const b = map.getBounds();
  const cols = max >= 6 ? 3 : 2;
  const rows = Math.max(1, Math.ceil(max / cols));
  const south = b.getSouth();
  const north = b.getNorth();
  const west = b.getWest();
  const east = b.getEast();
  const latPad = (north - south) * 0.18;
  const lonPad = (east - west) * 0.18;
  const out: Array<[number, number]> = [];
  for (let r = 0; r < rows; r += 1) {
    const lat = rows === 1
      ? (south + north) / 2
      : south + latPad + ((north - south - 2 * latPad) * r) / (rows - 1);
    for (let c = 0; c < cols; c += 1) {
      const lon = west + lonPad + ((east - west - 2 * lonPad) * c) / (cols - 1);
      out.push([
        Math.max(-85, Math.min(85, lat)),
        ((((lon + 180) % 360) + 360) % 360) - 180,
      ]);
    }
  }
  return out.slice(0, max);
}

function weatherDivIcon(
  point: PointWeather,
  factors: ReturnType<typeof useWeather>['selectedFactors'],
): L.DivIcon {
  const rows = factors
    .map((f) => {
      const raw = point.values[f.id];
      if (typeof raw !== 'number') return '';
      const arrow = f.directional
        ? `<i class="fas fa-location-arrow fv-weather-pin__arrow" style="transform:rotate(${raw}deg)"></i>`
        : `<i class="fas ${f.icon} fv-weather-pin__icon"></i>`;
      return (
        `<span class="fv-weather-pin__row">${arrow}` +
        `<span class="fv-weather-pin__short">${f.short}</span>` +
        `<span class="fv-weather-pin__val">${formatFactorValue(f, raw)}</span></span>`
      );
    })
    .filter(Boolean)
    .join('');
  const html =
    `<div class="fv-weather-pin">` +
    `<span class="fv-weather-pin__dot"></span>` +
    `<div class="fv-weather-pin__card">${rows || '<span class="fv-weather-pin__row">No data</span>'}</div>` +
    `</div>`;
  return L.divIcon({
    className: 'fv-weather-pin-wrap',
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export function WeatherOverlay({ points, maxPoints = 6 }: WeatherOverlayProps) {
  const map = useMap();
  const { enabled, selectedFactors, apiKey } = useWeather();

  const [results, setResults] = useState<PointWeather[]>([]);
  const [boundsTick, setBoundsTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recompute bounds-derived grids after the user stops moving the map.
  useMapEvents({
    moveend: () => {
      if (!points) setBoundsTick((t) => t + 1);
    },
  });

  const paramIds = useMemo(() => selectedFactors.map((f) => f.id), [selectedFactors]);
  const paramSig = paramIds.join(',');

  // Signature of the explicit points (so the effect re-runs when they move).
  const pointSig = points
    ? points.map((p) => roundKey(p[0], p[1])).join('|')
    : `bounds:${boundsTick}`;

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!enabled || !apiKey || paramIds.length === 0) {
      setResults([]);
      return;
    }

    timerRef.current = setTimeout(() => {
      const coords = points
        ? pickPoints(points, maxPoints)
        : gridFromBounds(map, maxPoints);
      if (coords.length === 0) {
        setResults([]);
        return;
      }
      void fetchManyPointWeather(coords, paramIds, apiKey).then(({ points: pts }) => {
        setResults(pts);
      });
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, apiKey, paramSig, pointSig, maxPoints]);

  if (!enabled || results.length === 0 || selectedFactors.length === 0) return null;

  return (
    <>
      {results.map((pt) => (
        <Marker
          key={`wx-${roundKey(pt.lat, pt.lon)}`}
          position={[pt.lat, pt.lon]}
          icon={weatherDivIcon(pt, selectedFactors)}
          interactive={false}
          keyboard={false}
          zIndexOffset={-500}
        >
          <Tooltip direction="top" offset={[0, -4]} opacity={1} className="fv-weather-tip">
            <strong>
              {pt.lat.toFixed(2)}°, {pt.lon.toFixed(2)}°
            </strong>
            {selectedFactors.map((f) => {
              const raw = pt.values[f.id];
              if (typeof raw !== 'number') return null;
              return (
                <span key={f.id}>
                  <i className={`fas ${f.icon}`} aria-hidden="true" /> {f.label}:{' '}
                  {formatFactorValue(f, raw)}
                </span>
              );
            })}
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}

/** Re-exported so callers can detect quota/auth errors if they fetch directly. */
export { WeatherError };
