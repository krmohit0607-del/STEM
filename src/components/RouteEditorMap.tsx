import { useEffect, useRef } from 'react';
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L, { type LatLngExpression } from 'leaflet';

import { WeatherOverlay } from './WeatherOverlay';
import { AreaConstraintsControl } from './AreaConstraintsControl';
import { WeatherFieldControl } from './WeatherFieldControl';

/**
 * Interactive route editor map.
 *
 * - When `plotMode` is on, clicking anywhere on the sea appends a new
 *   waypoint at the clicked position (`onAddPoint`).
 * - Existing waypoints render as numbered, draggable markers connected
 *   by a polyline; dragging one updates its position (`onMovePoint`).
 * - Clicking a marker selects it (`onSelectPoint`).
 *
 * Coordinates are plain decimal degrees here; the parent converts to /
 * from the degree-minute strings used by the waypoint table.
 */

export interface EditorPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  isPort: boolean;
  drift: boolean;
  /** Pre-formatted lat string, e.g. `01° 16.0' N`. */
  latLabel: string;
  /** Pre-formatted lon string, e.g. `103° 50.0' E`. */
  lonLabel: string;
  /** Distance from the previous waypoint (NM). */
  distFromPrev: number;
  /** Cumulative distance from departure (NM). */
  distFromStart: number;
}

interface RouteEditorMapProps {
  points: EditorPoint[];
  plotMode: boolean;
  selected: string[];
  onAddPoint: (lat: number, lon: number) => void;
  onInsertPoint: (afterIndex: number, lat: number, lon: number) => void;
  onMovePoint: (id: string, lat: number, lon: number) => void;
  onSelectPoint: (id: string) => void;
  onDeletePoint: (id: string) => void;
}

function waypointIcon(opts: {
  kind: 'departure' | 'arrival' | 'drift' | 'waypoint';
  selected: boolean;
}): L.DivIcon {
  const cls = [
    'fv-route-map__pin',
    `fv-route-map__pin--${opts.kind}`,
    opts.selected ? 'fv-route-map__pin--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const icons: Record<typeof opts.kind, string> = {
    departure: 'fa-anchor-circle-check',
    arrival: 'fa-anchor',
    drift: 'fa-water',
    waypoint: 'fa-location-dot',
  };
  const label = `<i class="fas ${icons[opts.kind]}" aria-hidden="true"></i>`;
  return L.divIcon({
    className: 'fv-route-map__pin-wrap',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<span class="${cls}">${label}</span>`,
  });
}

/** Captures map clicks while in plot mode. */
function ClickCapture({
  plotMode,
  onAddPoint,
}: {
  plotMode: boolean;
  onAddPoint: (lat: number, lon: number) => void;
}) {
  const map = useMapEvents({
    click(e) {
      if (!plotMode) return;
      onAddPoint(e.latlng.lat, e.latlng.lng);
    },
  });

  useEffect(() => {
    const el = map.getContainer();
    el.style.cursor = plotMode ? 'crosshair' : '';
    return () => {
      el.style.cursor = '';
    };
  }, [map, plotMode]);

  return null;
}

/**
 * Fits the map to the waypoints once, on the first render that has any
 * points. After that the user's zoom/pan is left untouched so editing,
 * adding, deleting or dragging waypoints never resets the view.
 */
function FitBounds({ points }: { points: EditorPoint[] }) {
  const map = useMap();
  const hasFit = useRef(false);
  useEffect(() => {
    if (hasFit.current || points.length === 0) return;
    hasFit.current = true;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lon], Math.max(map.getZoom(), 4));
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 9 });
    // Only the first non-empty render fits; deliberately ignore later changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length]);
  return null;
}

export function RouteEditorMap({
  points,
  plotMode,
  selected,
  onAddPoint,
  onInsertPoint,
  onMovePoint,
  onSelectPoint,
  onDeletePoint,
}: RouteEditorMapProps) {
  const line: LatLngExpression[] = points.map((p) => [p.lat, p.lon]);

  return (
    <MapContainer
      className="fv-route-map__canvas"
      center={[20, 80]}
      zoom={3}
      minZoom={2}
      worldCopyJump
      scrollWheelZoom
      doubleClickZoom={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
        crossOrigin="anonymous"
      />
      <TileLayer
        url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
        attribution="&copy; OpenSeaMap"
      />

      <ClickCapture plotMode={plotMode} onAddPoint={onAddPoint} />
      <FitBounds points={points} />

      <WeatherOverlay points={points.map((p) => [p.lat, p.lon])} maxPoints={6} />

      {/* Each segment is clickable so a waypoint can be inserted between
          its two endpoints. A wide transparent line gives a forgiving
          click target on top of the thin visible line. */}
      {points.slice(0, -1).map((p, i) => {
        const seg: LatLngExpression[] = [
          [p.lat, p.lon],
          [points[i + 1].lat, points[i + 1].lon],
        ];
        return (
          <Polyline
            key={`seg-${p.id}`}
            positions={seg}
            pathOptions={{ color: '#58a6ff', weight: 12, opacity: 0 }}
            eventHandlers={{
              click: (e) => {
                if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
                onInsertPoint(i, e.latlng.lat, e.latlng.lng);
              },
            }}
          />
        );
      })}

      {line.length >= 2 && (
        <Polyline
          positions={line}
          pathOptions={{ color: '#58a6ff', weight: 3 }}
          interactive={false}
        />
      )}

      {points.map((p, idx) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lon]}
          draggable
          icon={waypointIcon({
            kind: p.isPort
              ? idx === 0
                ? 'departure'
                : 'arrival'
              : p.drift
                ? 'drift'
                : 'waypoint',
            selected: selected.includes(p.id),
          })}
          eventHandlers={{
            click: () => onSelectPoint(p.id),
            dblclick: (e) => {
              if (e.originalEvent) L.DomEvent.stop(e.originalEvent);
              if (!p.isPort) onDeletePoint(p.id);
            },
            dragend: (e) => {
              const m = e.target as L.Marker;
              const ll = m.getLatLng();
              onMovePoint(p.id, ll.lat, ll.lng);
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -14]}>
            <div className="fv-route-map__tip">
              <strong className="fv-route-map__tip-title">
                {idx + 1}. {p.name}
              </strong>
              <span>
                <i className="fas fa-location-crosshairs" aria-hidden="true" />{' '}
                {p.latLabel}, {p.lonLabel}
              </span>
              <span>
                <i className="fas fa-ruler-horizontal" aria-hidden="true" />{' '}
                {p.distFromPrev.toLocaleString()} NM from prev
              </span>
              <span>
                <i className="fas fa-flag-checkered" aria-hidden="true" />{' '}
                {p.distFromStart.toLocaleString()} NM from departure
              </span>
            </div>
          </Tooltip>
        </Marker>
      ))}
      <AreaConstraintsControl position="topright" />
      <WeatherFieldControl position="topright" />
    </MapContainer>
  );
}
