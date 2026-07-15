import { Fragment, useEffect, useRef } from 'react';
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

import { AreaConstraintsControl } from './AreaConstraintsControl';
import { WeatherFieldControl } from './WeatherFieldControl';
import { WeatherPointControl } from './WeatherPointControl';
import { PortsControl, RulerControl } from './MapToolsControl';
import { MapCursorPosition } from './MapCursorPosition';

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/**
 * Positions for one leg between two waypoints. A rhumb-line leg is a single
 * straight segment (a loxodrome plots straight on this Mercator map); a
 * great-circle leg is densified into an arc that visibly curves poleward.
 * Longitudes are kept continuous across the antimeridian so the arc never
 * jumps horizontally across the map.
 */
export function legPositions(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  legType: 'rhumb' | 'greatcircle',
): LatLngExpression[] {
  if (legType !== 'greatcircle') return [[a.lat, a.lon], [b.lat, b.lon]];

  const φ1 = toRad(a.lat);
  const λ1 = toRad(a.lon);
  const φ2 = toRad(b.lat);
  let lon2 = b.lon;
  while (lon2 - a.lon > 180) lon2 -= 360;
  while (lon2 - a.lon < -180) lon2 += 360;
  const λ2 = toRad(lon2);
  const d =
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin((φ2 - φ1) / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2,
        ),
      ),
    );
  if (d === 0 || !Number.isFinite(d)) return [[a.lat, a.lon], [b.lat, b.lon]];

  const segs = Math.max(8, Math.min(128, Math.round((toDeg(d) / 180) * 96)));
  const out: LatLngExpression[] = [];
  let prevLon = a.lon;
  for (let i = 0; i <= segs; i += 1) {
    const f = i / segs;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    const lat = toDeg(Math.atan2(z, Math.hypot(x, y)));
    let lon = toDeg(Math.atan2(y, x));
    while (lon - prevLon > 180) lon -= 360;
    while (lon - prevLon < -180) lon += 360;
    prevLon = lon;
    out.push([lat, lon]);
  }
  return out;
}

/**
 * Interactive route editor map.
 *
 * - When `plotMode` is on, clicking anywhere on the sea appends a new
 *   waypoint at the clicked position (`onAddPoint`).
 * - Existing waypoints render as numbered, draggable markers connected
 *   by a polyline; dragging one updates its position (`onMovePoint`).
 * - Clicking a marker deletes it (`onDeletePoint`).
 *
 * Coordinates are plain decimal degrees here; the parent converts to /
 * from the degree-minute strings used by the waypoint table.
 */

export interface EditorPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /**
   * Stable `[lat, lon]` tuple reused across renders. Passing this (instead of a
   * fresh array literal) as the marker `position` stops react-leaflet from
   * calling `setLatLng` on every re-render, which would otherwise yank a marker
   * back to its committed position mid-drag.
   */
  latLng: [number, number];
  isPort: boolean;
  drift: boolean;
  /**
   * How the leg departing this point (to the next one) is drawn on the map:
   * `'rhumb'` = straight segment, `'greatcircle'` = curved great-circle arc.
   */
  legType?: 'rhumb' | 'greatcircle';
  /** Pre-formatted lat string, e.g. `01° 16.0' N`. */
  latLabel: string;
  /** Pre-formatted lon string, e.g. `103° 50.0' E`. */
  lonLabel: string;
  /** Distance from the previous waypoint (NM). */
  distFromPrev: number;
  /** Cumulative distance from departure (NM). */
  distFromStart: number;
}

/** An animated vessel marker moving along a candidate route during playback. */
export interface ShipMarker {
  id: string;
  color: string;
  /** Current `[lat, lon]` position of the ship. */
  pos: [number, number];
  /** Primary tooltip line (e.g. the route label). */
  label: string;
  /** Secondary tooltip line (e.g. weather factor / progress). */
  sublabel?: string;
  /** True when this route is the currently selected one (drawn emphasised). */
  active?: boolean;
  /** Compass heading (deg) the vessel is pointing, for icon rotation. */
  heading?: number;
}

interface RouteEditorMapProps {
  points: EditorPoint[];
  plotMode: boolean;
  /** When false the route is locked: no dragging, deleting or inserting. */
  editable?: boolean;
  selected: string[];
  /** Candidate optimized routes to overlay, each with its own colour. */
  routes?: Array<{ id: string; color: string; path: Array<[number, number]> }>;
  /** Which candidate route is currently selected (drawn emphasised). */
  selectedRouteId?: string | null;
  /** Vessel markers animated along the routes during route-simulator playback. */
  shipMarkers?: ShipMarker[];
  /** Colour of the planned route legs (black when it is the active route). */
  plannedRouteColor?: string;
  /** Route waypoint vertices to render as coloured dots. */
  activeWaypoints?: Array<{ pos: [number, number]; color: string }>;
  /** Called when a ship marker is clicked, to select that route. */
  onSelectRoute?: (id: string) => void;
  onAddPoint: (lat: number, lon: number) => void;
  onInsertPoint: (afterIndex: number, lat: number, lon: number) => void;
  onMovePoint: (id: string, lat: number, lon: number) => void;
  onDeletePoint: (id: string) => void;
}

/** Cache of waypoint icons keyed by kind+selected so re-renders reuse the same
 *  `DivIcon` instance; a fresh icon would make react-leaflet rebuild the marker
 *  DOM, which can interrupt an in-progress drag. */
const waypointIconCache = new Map<string, L.DivIcon>();

function waypointIcon(opts: {
  kind: 'departure' | 'arrival' | 'drift' | 'waypoint';
  selected: boolean;
}): L.DivIcon {
  const cacheKey = `${opts.kind}:${opts.selected ? 1 : 0}`;
  const cached = waypointIconCache.get(cacheKey);
  if (cached) return cached;
  // Ports (departure/arrival) use a location-pin icon; plain waypoints and
  // drift points are shown as dots (app-wide convention).
  const isPort = opts.kind === 'departure' || opts.kind === 'arrival';
  const cls = [
    'fv-route-map__pin',
    `fv-route-map__pin--${opts.kind}`,
    isPort ? 'fv-route-map__pin--port' : 'fv-route-map__pin--dot',
    opts.selected ? 'fv-route-map__pin--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const inner = isPort
    ? '<i class="fas fa-location-dot" aria-hidden="true"></i>'
    : '<span class="fv-route-map__dot"></span>';
  const icon = L.divIcon({
    className: 'fv-route-map__pin-wrap',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<span class="${cls}">${inner}</span>`,
  });
  waypointIconCache.set(cacheKey, icon);
  return icon;
}

/**
 * Vessel marker used by the route simulator — the same arrow-shaped ship icon
 * as the main fleet map, rotated to the vessel's heading. Icons are cached per
 * colour/active/heading so playback re-renders don't churn the DOM.
 */
const shipIconCache = new Map<string, L.DivIcon>();
function shipDivIcon(color: string, active: boolean, heading: number): L.DivIcon {
  const h = Math.round(heading);
  const key = `${color}|${active ? 1 : 0}|${h}`;
  const cached = shipIconCache.get(key);
  if (cached) return cached;
  const size = active ? 26 : 22;
  const icon = L.divIcon({
    className: 'fv-route__ship-icon-wrap',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <span class="fv-route__ship-vessel${active ? ' fv-route__ship-vessel--active' : ''}" style="transform:rotate(${h - 90}deg)">
        <svg viewBox="0 0 24 24" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 7 H15 L22 12 L15 17 H3 Z" fill="${color}" stroke="#0e1626" stroke-width="1.4" stroke-linejoin="round" />
        </svg>
      </span>
    `,
  });
  shipIconCache.set(key, icon);
  return icon;
}

/** Coloured dot marking a waypoint of a simulated route (cached per colour). */
const wpDotCache = new Map<string, L.DivIcon>();
function wpDotIcon(color: string): L.DivIcon {
  const cached = wpDotCache.get(color);
  if (cached) return cached;
  const icon = L.divIcon({
    className: 'fv-route-map__pin-wrap',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    html: `<span class="fv-route-map__route-wp" style="background:${color}"></span>`,
  });
  wpDotCache.set(color, icon);
  return icon;
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

/**
 * Keeps the Leaflet map sized to its container. When the side panel is
 * minimized the map grows; Leaflet caches its pixel size, so without
 * invalidateSize() the map would stay clipped instead of filling the page.
 */
function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

export function RouteEditorMap({
  points,
  plotMode,
  editable = true,
  selected,
  routes = [],
  selectedRouteId,
  shipMarkers = [],
  plannedRouteColor = '#58a6ff',
  activeWaypoints = [],
  onSelectRoute,
  onAddPoint,
  onInsertPoint,
  onMovePoint,
  onDeletePoint,
}: RouteEditorMapProps) {
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
      <MapResizeHandler />

      {/* Each leg is drawn as a straight rhumb line or a curved great-circle
          arc depending on its originating waypoint's `legType`. A wide
          transparent line on top gives a forgiving click target for inserting
          a new waypoint between the two endpoints. */}
      {points.slice(0, -1).map((p, i) => {
        const next = points[i + 1];
        const visible = legPositions(p, next, p.legType ?? 'rhumb');
        const hit: LatLngExpression[] = [
          [p.lat, p.lon],
          [next.lat, next.lon],
        ];
        return (
          <Fragment key={`seg-${p.id}-${editable ? 'edit' : 'lock'}`}>
            <Polyline
              positions={visible}
              pathOptions={{ color: plannedRouteColor, weight: 3 }}
              interactive={false}
            />
            <Polyline
              positions={hit}
              pathOptions={{ color: plannedRouteColor, weight: 12, opacity: 0 }}
              interactive={editable}
              eventHandlers={{
                click: (e) => {
                  if (!editable) return;
                  if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
                  onInsertPoint(i, e.latlng.lat, e.latlng.lng);
                },
              }}
            />
          </Fragment>
        );
      })}

      {/* Candidate optimized routes. The selected one is drawn last (on top),
          solid and emphasised; the rest are thinner, dashed and translucent. */}
      {[...routes]
        .filter((r) => r.path.length >= 2)
        .sort((a, b) => {
          const aSel = a.id === selectedRouteId ? 1 : 0;
          const bSel = b.id === selectedRouteId ? 1 : 0;
          return aSel - bSel;
        })
        .map((r) => {
          const isSel = r.id === selectedRouteId;
          return (
            <Polyline
              key={r.id}
              positions={r.path as LatLngExpression[]}
              pathOptions={{
                color: r.color,
                weight: isSel ? 5 : 3,
                opacity: isSel ? 1 : 0.75,
              }}
              interactive={false}
            />
          );
        })}

      {/* Markers render from the committed `points`; the position is a stable
          tuple (`latLng`) so unrelated re-renders never call setLatLng and the
          drag is left entirely to Leaflet. The move is committed on drop. */}
      {points.map((p, idx) => (
        <Marker
          key={p.id}
          position={p.latLng}
          draggable={editable}
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
            click: () => {
              if (editable && !p.isPort) onDeletePoint(p.id);
            },
            dblclick: (e) => {
              if (e.originalEvent) L.DomEvent.stop(e.originalEvent);
              if (editable && !p.isPort) onDeletePoint(p.id);
            },
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
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
      {/* Waypoints of the simulated routes (coloured dots). */}
      {activeWaypoints.map((w, i) => (
        <Marker key={`awp-${i}`} position={w.pos} icon={wpDotIcon(w.color)} interactive={false} />
      ))}
      {/* Animated vessel markers driven by the route simulator playback. */}
      {shipMarkers.map((s) => (
        <Marker
          key={`ship-${s.id}`}
          position={s.pos}
          icon={shipDivIcon(s.color, s.active ?? false, s.heading ?? 0)}
          zIndexOffset={s.active ? 1000 : 500}
          eventHandlers={
            onSelectRoute ? { click: () => onSelectRoute(s.id) } : undefined
          }
        />
      ))}

      <AreaConstraintsControl position="topright" />
      <WeatherFieldControl position="topright" />
      <WeatherPointControl position="topright" />
      <PortsControl position="topright" />
      <RulerControl position="topright" />
      <MapCursorPosition />
    </MapContainer>
  );
}
