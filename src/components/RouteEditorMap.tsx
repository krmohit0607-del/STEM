import { Fragment, useEffect, useState, useRef } from 'react';
import {
  MapContainer,
  Marker,
  Popup,
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
import { MapLayersControl, readMapLayerId, type MapLayerId } from './MapLayersControl';

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
  // For rhumb lines normalise the destination longitude so the segment always
  // takes the shorter path (handles antimeridian crossings, e.g. Japan→US).
  if (legType !== 'greatcircle') {
    let lon2 = b.lon;
    while (lon2 - a.lon > 180) lon2 -= 360;
    while (lon2 - a.lon < -180) lon2 += 360;
    return [[a.lat, a.lon], [b.lat, lon2]];
  }

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
  /** True when this waypoint is anchored by a received report and fixed. */
  locked?: boolean;
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

export interface ReportMarker {
  id: string;
  pos: [number, number];
  reportCode: string;
  reportType: string;
  dateTimeIso?: string;
  dateTimeText?: string;
  speedKts?: number | null;
  distanceNm?: number | null;
  isInterpolated?: boolean;
  color?: string;
  selectedSpeedLabel?: string;
  selectedSpeedKts?: number;
  selectedFuelType?: string;
}

export interface ReportSpeedOption {
  id: string;
  label: string;
  speedKts: number;
  isDefault?: boolean;
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
  /** Route report positions (departure/noon/speed-change/fuel-change/...). */
  reportMarkers?: ReportMarker[];
  /** Speed profile choices shown on report-marker right click. */
  reportSpeedOptions?: ReportSpeedOption[];
  /** Fuel type choices shown on report-marker right click. */
  reportFuelOptions?: string[];
  /** Default fuel type taken from the leg's selected speed/cons profile. */
  defaultReportFuelType?: string;
  /** Called when a speed profile is selected for a report marker. */
  onSetReportSpeed?: (reportId: string, option: ReportSpeedOption) => void;
  /** Called when a fuel type is selected for a report marker. */
  onSetReportFuel?: (reportId: string, fuelType: string) => void;
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

/** Pale dot icon for validated in-between (6-hour) breakup points. */
const reportGapDotCache = new Map<string, L.DivIcon>();
function reportGapDotIcon(color: string): L.DivIcon {
  const cached = reportGapDotCache.get(color);
  if (cached) return cached;
  const icon = L.divIcon({
    className: 'fv-route-map__pin-wrap',
    iconSize: [10, 10],
    iconAnchor: [5, 5],
    html: `<span class="fv-route-map__report-gap-dot" style="background:${color}"></span>`,
  });
  reportGapDotCache.set(color, icon);
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
  reportMarkers = [],
  reportSpeedOptions = [],
  reportFuelOptions = [],
  defaultReportFuelType,
  onSetReportSpeed,
  onSetReportFuel,
  plannedRouteColor = '#58a6ff',
  activeWaypoints = [],
  onSelectRoute,
  onAddPoint,
  onInsertPoint,
  onMovePoint,
  onDeletePoint,
}: RouteEditorMapProps) {
  const [baseLayer, setBaseLayer] = useState<MapLayerId>(() => readMapLayerId());
  const dragFrameByIdRef = useRef(new Map<string, number>());
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editingSpeedId, setEditingSpeedId] = useState<string>('');
  const [editingFuelType, setEditingFuelType] = useState<string>('');

  useEffect(() => {
    return () => {
      dragFrameByIdRef.current.forEach((rafId) => {
        window.cancelAnimationFrame(rafId);
      });
      dragFrameByIdRef.current.clear();
    };
  }, []);

  const scheduleDragMove = (id: string, lat: number, lon: number) => {
    const pending = dragFrameByIdRef.current.get(id);
    if (pending !== undefined) window.cancelAnimationFrame(pending);
    const rafId = window.requestAnimationFrame(() => {
      dragFrameByIdRef.current.delete(id);
      onMovePoint(id, lat, lon);
    });
    dragFrameByIdRef.current.set(id, rafId);
  };

  const cancelDragMove = (id: string) => {
    const pending = dragFrameByIdRef.current.get(id);
    if (pending !== undefined) {
      window.cancelAnimationFrame(pending);
      dragFrameByIdRef.current.delete(id);
    }
  };

  const openReportEditor = (report: ReportMarker) => {
    const defaultSpeedOpt = reportSpeedOptions.find((o) => o.isDefault) ?? reportSpeedOptions[0];
    const speedOpt =
      reportSpeedOptions.find((o) => o.label === report.selectedSpeedLabel) ??
      (report.selectedSpeedKts != null
        ? reportSpeedOptions.find(
            (o) => Math.abs(o.speedKts - report.selectedSpeedKts!) < 0.01,
          )
        : undefined) ??
      (report.speedKts != null
        ? reportSpeedOptions.find((o) => Math.abs(o.speedKts - report.speedKts!) < 0.01)
        : undefined) ??
      defaultSpeedOpt;
    setEditingSpeedId(speedOpt?.id ?? '');
    setEditingFuelType(report.selectedFuelType ?? defaultReportFuelType ?? reportFuelOptions[0] ?? '');
    setEditingReportId(report.id);
  };

  const applyReportEditor = () => {
    if (!editingReportId) return;
    if (onSetReportSpeed && editingSpeedId) {
      const opt = reportSpeedOptions.find((o) => o.id === editingSpeedId);
      if (opt) onSetReportSpeed(editingReportId, opt);
    }
    if (onSetReportFuel && editingFuelType) {
      onSetReportFuel(editingReportId, editingFuelType);
    }
    setEditingReportId(null);
  };

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
      {baseLayer === 'satellite' && (
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri"
        />
      )}
      {baseLayer === 'dark' && (
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap contributors &copy; CARTO"
        />
      )}
      {(baseLayer === 'nautical' || baseLayer === 'standard') && (
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
          crossOrigin="anonymous"
        />
      )}
      {baseLayer === 'nautical' && (
        <TileLayer
          url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
          attribution="&copy; OpenSeaMap"
        />
      )}

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

        {/* Markers render from committed `points`; the position is a stable
          tuple (`latLng`) so unrelated re-renders never call setLatLng.
          During drag, updates are streamed to the parent (throttled to one
          update per animation frame) so the route line moves with the marker. */}
      {points.map((p, idx) => (
        <Marker
          key={p.id}
          position={p.latLng}
          draggable={editable && !p.locked}
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
              if (editable && !p.isPort && !p.locked) onDeletePoint(p.id);
            },
            dblclick: (e) => {
              if (e.originalEvent) L.DomEvent.stop(e.originalEvent);
              if (editable && !p.isPort && !p.locked) onDeletePoint(p.id);
            },
            drag: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              scheduleDragMove(p.id, ll.lat, ll.lng);
            },
            dragend: (e) => {
              cancelDragMove(p.id);
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

      {/* Received reports on the active route (departure/arrival/noon/speed/fuel
          changes), plus light validated 6-hour breakup points between them. */}
      {reportMarkers.map((r) => {
        const isInterpolated = !!r.isInterpolated;
        const color = r.color ?? (isInterpolated ? '#b8c4d6' : '#f59e0b');
        return (
          <Marker
            key={`report-${r.id}`}
            position={r.pos}
            icon={
              isInterpolated
                ? reportGapDotIcon(color)
                : shipDivIcon(color, false, 0)
            }
            eventHandlers={
              isInterpolated
                ? undefined
                : {
                    contextmenu: (e) => {
                      if (e.originalEvent) L.DomEvent.stop(e.originalEvent);
                      openReportEditor(r);
                      const marker = e.target as L.Marker;
                      window.setTimeout(() => marker.openPopup(), 0);
                    },
                    popupclose: () => {
                      setEditingReportId((cur) => (cur === r.id ? null : cur));
                    },
                  }
            }
          >
            {!isInterpolated && (
              <Popup
                className="fv-route-map__report-popup"
                closeButton
                autoClose={false}
                closeOnEscapeKey
              >
                <div className="fv-route-map__report-card">
                  <h4 className="fv-route-map__report-title">Report Criteria</h4>
                  <p className="fv-route-map__report-meta">
                    {r.reportType} · {r.dateTimeText || 'Position update'}
                  </p>
                  <label className="fv-route-map__report-field">
                    <span>Speed profile</span>
                    <select
                      value={editingSpeedId}
                      onChange={(e) => setEditingSpeedId(e.target.value)}
                    >
                      {reportSpeedOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="fv-route-map__report-field">
                    <span>Fuel type</span>
                    <select
                      value={editingFuelType}
                      onChange={(e) => setEditingFuelType(e.target.value)}
                    >
                      {reportFuelOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="fv-route-map__report-actions">
                    <button
                      type="button"
                      className="fv-route-map__report-btn"
                      onClick={() => setEditingReportId(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="fv-route-map__report-btn fv-route-map__report-btn--primary"
                      onClick={applyReportEditor}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </Popup>
            )}
            <Tooltip direction="top" offset={[0, -14]}>
              <div className="fv-route-map__tip">
                <strong className="fv-route-map__tip-title">{r.reportType}</strong>
                <span>
                  <i className="fas fa-calendar-day" aria-hidden="true" />{' '}
                  {r.dateTimeIso
                    ? new Date(r.dateTimeIso).toLocaleString()
                    : r.dateTimeText || '—'}
                </span>
                <span>
                  <i className="fas fa-gauge-high" aria-hidden="true" />{' '}
                  Spd: {r.speedKts != null ? `${r.speedKts.toFixed(1)} kt` : '—'}
                </span>
                <span>
                  <i className="fas fa-ruler-horizontal" aria-hidden="true" />{' '}
                  Dist: {r.distanceNm != null ? `${r.distanceNm.toFixed(1)} NM` : '—'}
                </span>
                {!isInterpolated && (
                  <span>
                    <i className="fas fa-list-check" aria-hidden="true" />{' '}
                    Speed profile:{' '}
                    {r.selectedSpeedLabel
                      ? `${r.selectedSpeedLabel}${
                          r.selectedSpeedKts != null
                            ? ` (${r.selectedSpeedKts.toFixed(1)} kt)`
                            : ''
                        }`
                      : 'Not selected'}
                  </span>
                )}
                {!isInterpolated && (
                  <span>
                    <i className="fas fa-gas-pump" aria-hidden="true" /> Fuel:{' '}
                    {r.selectedFuelType || 'Not selected'}
                  </span>
                )}
              </div>
            </Tooltip>
          </Marker>
        );
      })}

      <MapLayersControl position="topright" value={baseLayer} onChange={setBaseLayer} />
      <AreaConstraintsControl position="topright" />
      <WeatherFieldControl position="topright" />
      <WeatherPointControl position="topright" />
      <PortsControl position="topright" />
      <RulerControl position="topright" />
      <MapCursorPosition />
    </MapContainer>
  );
}
