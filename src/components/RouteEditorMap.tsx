import { Fragment, useEffect, useMemo, useState, useRef } from 'react';
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
import L, { type LatLngExpression, type LatLngBoundsExpression } from 'leaflet';
import {
  getAntimeridianAwareBounds,
  needsWorldCopies,
  offsetPoint,
  offsetPoints,
  unwrapRouteCoordinates,
  wrapLongitudeNear,
  wrapPointNear,
  type LatLngBoundsTuple,
} from '../data/antimeridian';
import { useMapFitRequest, useMapCenterOnVesselRequest } from '../data/routeSimulatorStore';
import { findMaritimeRegion, useAuthoritativeRegionName } from '../data/maritimeRegions';

import { AreaConstraintsControl } from './AreaConstraintsControl';
import { WeatherFieldControl } from './WeatherFieldControl';
import { CycloneLayer } from './CycloneLayer';
import { WeatherAlertsControl } from './WeatherAlertsControl';
import { WeatherPointControl } from './WeatherPointControl';
import { PortsControl, RulerControl } from './MapToolsControl';
import { MapCursorPosition } from './MapCursorPosition';
import { MapLayersControl, readMapLayerId, readOverlayLayers, type MapLayerId, type OverlayLayerId } from './MapLayersControl';
import { MapWeatherLegendControl } from './MapWeatherLegendControl';
import { LoadLineZonesLayer } from './LoadLineZonesLayer';

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

// Clamp vertical panning to just inside the poles so the grey area past the
// tiled world is never revealed; left wide open horizontally (worldCopyJump
// handles the wrap).
const WORLD_PAN_BOUNDS: LatLngBoundsExpression = [
  [-85, -1_000_000],
  [85, 1_000_000],
];

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
 * Which non-interpolated, real (non-placeholder) report markers fall
 * chronologically between two waypoints' ETAs — i.e. the vessel actually
 * reported being somewhere while sailing this specific leg. Used to splice
 * each report's exact position into the leg's rendered/simulated path (see
 * `buildLegPath`) so the route visibly passes through where the vessel
 * really was, without turning the report into an editable waypoint. Sorted
 * chronologically so multiple reports on the same leg thread in order.
 */
export function reportsForLeg(
  reportMarkers: ReportMarker[],
  etaMsA: number | undefined,
  etaMsB: number | undefined,
): ReportMarker[] {
  if (etaMsA == null || etaMsB == null || !Number.isFinite(etaMsA) || !Number.isFinite(etaMsB)) {
    return [];
  }
  const lo = Math.min(etaMsA, etaMsB);
  const hi = Math.max(etaMsA, etaMsB);
  return reportMarkers
    .filter((r) => !r.isInterpolated && !r.isDefault && r.dateTimeIso)
    .map((r) => ({ r, t: new Date(r.dateTimeIso as string).getTime() }))
    .filter(({ t }) => Number.isFinite(t) && t > lo && t < hi)
    .sort((a, b) => a.t - b.t)
    .map(({ r }) => r);
}

/**
 * Same geometry `legPositions` builds between two points, but threaded
 * through any number of intermediate points first (each sub-leg drawn with
 * the same `legType` as the whole leg) — used to route a leg's line through
 * any reports that fall between its two waypoints (see `reportsForLeg`).
 * With no intermediate points this is identical to `legPositions`.
 */
export function buildLegPath(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  legType: 'rhumb' | 'greatcircle',
  through: Array<{ lat: number; lon: number }>,
): Array<[number, number]> {
  if (through.length === 0) {
    return legPositions(a, b, legType) as Array<[number, number]>;
  }
  const chain = [a, ...through, b];
  const out: Array<[number, number]> = [];
  for (let i = 0; i < chain.length - 1; i += 1) {
    const seg = legPositions(chain[i], chain[i + 1], legType) as Array<[number, number]>;
    out.push(...(i === 0 ? seg : seg.slice(1)));
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
 * - Clicking a marker deletes it (`onDeletePoint`), unless `onSelectPoint`
 *   is provided, in which case clicking selects it instead (and deleting is
 *   left entirely to the host, e.g. a delete button in a details panel).
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
  /** When `drift` is true: a human-readable "until" timestamp and duration
   *  (e.g. "24 Nov 2026, 19:11" / "2d 6h"), for the hover tooltip — `null`
   *  when the duration can't be computed (e.g. "Drift until" not set yet). */
  driftUntilLabel?: string | null;
  driftDurationLabel?: string | null;
  /** This waypoint's own planned course (deg true) and SOG (kt), and any
   *  Min/Max RPM/MCR entered in Waypoint details — shown in the hover
   *  tooltip alongside distance/ETA so the full plan for this point is
   *  visible at a glance, not just position. */
  course?: number;
  speed?: number;
  rpmMin?: number;
  rpmMax?: number;
  mcrMin?: number;
  mcrMax?: number;
  /** Fuel type in use from this waypoint onward, once set via a vessel
   *  report's forward-propagated selection — shown in the hover tooltip. */
  fuelType?: string;
  /** Daily consumption (mt/day) for this waypoint's speed/cons profile —
   *  display-only, shown alongside `fuelType` in the hover tooltip. */
  dailyCons?: number;
  /** Pre-formatted ETA/ETD at this waypoint (local `datetime-local` value,
   *  e.g. "2026-11-24T19:11") for the hover tooltip — `undefined` when not
   *  yet computed (e.g. a malformed upstream date). */
  etaLabel?: string;
  /** This waypoint's ETA as an epoch ms, used (not displayed) to bracket
   *  which reports fall chronologically between this and the next waypoint
   *  — see `reportsForLeg`. `undefined` when the ETA can't be parsed. */
  etaMs?: number;
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
  /** Heading (deg true) to rotate the marker icon to, so it points along
   *  the track instead of defaulting to north. */
  course?: number;
  isInterpolated?: boolean;
  /** True for the default planned-departure placeholder row — excluded
   *  from `reportsForLeg`'s pass-through splicing since it just mirrors the
   *  departure waypoint's own position, not a distinct recorded point. */
  isDefault?: boolean;
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
  /** Daily consumption (mt/day) for this profile row, carried through to
   *  `onApplyReportCriteria` for display-only use on waypoints it's applied to. */
  dailyCons?: number;
  /** Fuel type fixed to this profile row — applied automatically alongside
   *  the speed/cons when this option is chosen, never a separate pick. */
  fuelType?: string;
}

interface RouteEditorMapProps {
  points: EditorPoint[];
  plotMode: boolean;
  /** When false the route is locked: no dragging, deleting or inserting. */
  editable?: boolean;
  selected: string[];
  /** Waypoints currently checked via the Waypoint details list's per-row
   *  checkboxes (for bulk actions like Insert/Delete/Set speed) — shown with
   *  a bold ring around their marker, distinct from `selected`'s single
   *  highlighted waypoint, so checked waypoints are identifiable on the map. */
  checkedIds?: string[];
  /** Where to center the map when there's no route yet (e.g. the vessel's
   *  last known position) — see `FitBounds`'s `fallbackPos`. Ignored once a
   *  route exists; the route's own bounds take priority. */
  vesselFallbackPos?: { lat: number; lon: number } | null;
  /** Candidate optimized routes to overlay, each with its own colour. */
  routes?: Array<{ id: string; color: string; path: Array<[number, number]> }>;
  /** Which candidate route is currently selected (drawn emphasised). */
  selectedRouteId?: string | null;
  /** Vessel markers animated along the routes during route-simulator playback. */
  shipMarkers?: ShipMarker[];
  /** Route report positions (departure/noon/speed-change/fuel-change/...). */
  reportMarkers?: ReportMarker[];
  /** Speed profile choices shown on report-marker right click — fuel type
   *  and daily consumption are fixed per-option (`ReportSpeedOption.fuelType`
   *  /`.dailyCons`), not chosen separately. */
  reportSpeedOptions?: ReportSpeedOption[];
  /** Fallback fuel type for a speed option with no `fuelType` of its own
   *  (e.g. the generic ECO/FULL/CUSTOM speeds used when no CP speed/cons
   *  table exists yet) — the CP's own default row's fuel type. */
  defaultReportFuelType?: string;
  /** Called when a speed profile is selected for a report marker — purely
   *  cosmetic (keeps the hover tooltip's "Speed profile"/"Fuel" lines in
   *  sync), distinct from `onApplyReportCriteria` below which actually
   *  propagates the change onto the route's waypoints. */
  onSetReportSpeed?: (reportId: string, option: ReportSpeedOption) => void;
  /** Companion to `onSetReportSpeed` — keeps the tooltip's "Fuel" line in
   *  sync with whichever option's (or the fallback) fuel type was applied. */
  onSetReportFuel?: (reportId: string, fuelType: string) => void;
  /** Called when the report popup's "Apply" button is clicked, with the
   *  report's own position and the chosen speed/cons/fuel profile —
   *  propagates it forward onto the route's own waypoints (see
   *  `applyReportCriteriaForward` in RouteExplorerPage.tsx), distinct from
   *  `onSetReportSpeed` above which only updates the report marker's own
   *  cosmetic "selected" display. */
  onApplyReportCriteria?: (reportPos: [number, number], option: ReportSpeedOption) => void;
  /** Colour of the planned route legs (black when it is the active route). */
  plannedRouteColor?: string;
  /** Route waypoint vertices to render as coloured dots. */
  activeWaypoints?: Array<{ pos: [number, number]; color: string }>;
  /** Called when a ship marker is clicked, to select that route. */
  onSelectRoute?: (id: string) => void;
  /** Called when a waypoint marker is clicked, to select it (e.g. expanding
   *  its details in a host panel). When provided, this replaces the default
   *  click/double-click-to-delete behavior for waypoint markers entirely —
   *  deleting then happens only via the host's own UI (e.g. a delete button
   *  in the Waypoint details panel). The second argument is true when the
   *  click was Shift-modified, so the host can range-select (checking every
   *  waypoint between the last plain click and this one) instead of just
   *  selecting this single waypoint. */
  onSelectPoint?: (id: string, shiftKey: boolean) => void;
  onAddPoint: (lat: number, lon: number) => void;
  onInsertPoint: (afterIndex: number, lat: number, lon: number) => void;
  onMovePoint: (id: string, lat: number, lon: number) => void;
  /** Fired continuously while a marker is being dragged (once per animation
   *  frame), for live visual feedback — separate from `onMovePoint`, which
   *  only fires once on drag release. When omitted, `onMovePoint` is used
   *  for both (the previous behavior), but a host that records undo history
   *  on `onMovePoint` should provide this so intermediate drag frames don't
   *  each become their own undo step. */
  onMovePointPreview?: (id: string, lat: number, lon: number) => void;
  onDeletePoint: (id: string) => void;
  /** When true, suppresses the floating top-left chart-opacity/weather-legend
   *  control — set this when the host page already renders `<MapWeatherLegendBar>`
   *  inline in its own top toolbar (e.g. Route Explorer's Optimize / View on MT row). */
  legendBarInHostToolbar?: boolean;
}

/**
 * A waypoint marker's hover-tooltip content. Its own component (not inline
 * JSX in the markers' `.map()` loop) specifically so it can call the
 * `useAuthoritativeRegionName` hook — React forbids calling hooks from
 * inside a loop/callback directly, since the number of hook calls must stay
 * consistent across renders regardless of how many markers happen to exist.
 */
function WaypointTipContent({ idx, p }: { idx: number; p: EditorPoint }) {
  // Ports already carry a meaningful name (the port itself). Plain
  // waypoints show whichever is most specific: a name the user has
  // actually typed into Waypoint details (anything other than the
  // auto-generated "WP N" placeholder — e.g. a note like "Increase speed")
  // takes priority, since that's an intentional label the user wants to
  // see at a glance; otherwise fall back to the strait/gulf/sea/ocean it
  // sits in instead of the generic "WP N" itself. The instant local lookup
  // is shown immediately and transparently upgraded to the authoritative
  // one (a real public gazetteer lookup — see `maritimeRegions.ts`) the
  // moment that resolves, without the tooltip ever showing nothing.
  const isAutoName = /^WP \d+$/.test(p.name);
  const customName = !p.isPort && !isAutoName ? p.name : null;
  const localFallback = p.isPort ? null : findMaritimeRegion(p.lat, p.lon);
  const regionName = useAuthoritativeRegionName(p.lat, p.lon, localFallback);
  const title = p.isPort ? p.name : customName || regionName || p.name;
  return (
    <div className="fv-route-map__tip">
      <strong className="fv-route-map__tip-title">
        {idx + 1}. {title}
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
      {p.etaLabel && (
        <span>
          <i className="fas fa-clock" aria-hidden="true" />{' '}
          ETA {p.etaLabel}
        </span>
      )}
      {p.course != null && p.speed != null && (
        <span>
          <i className="fas fa-compass" aria-hidden="true" />{' '}
          {Math.round(p.course)}° @ {p.speed.toFixed(1)} kt
        </span>
      )}
      {(p.rpmMin != null || p.rpmMax != null) && (
        <span>
          <i className="fas fa-gauge-high" aria-hidden="true" />{' '}
          RPM {p.rpmMin ?? '—'}–{p.rpmMax ?? '—'}
        </span>
      )}
      {(p.mcrMin != null || p.mcrMax != null) && (
        <span>
          <i className="fas fa-gauge-high" aria-hidden="true" />{' '}
          MCR {p.mcrMin ?? '—'}–{p.mcrMax ?? '—'}%
        </span>
      )}
      {(p.fuelType || p.dailyCons != null) && (
        <span>
          <i className="fas fa-gas-pump" aria-hidden="true" />{' '}
          {p.fuelType ?? 'Fuel'}
          {p.dailyCons != null && ` · ${p.dailyCons.toFixed(1)} mt/day`}
        </span>
      )}
      {p.drift && p.driftUntilLabel && (
        <span>
          <i className="fas fa-anchor" aria-hidden="true" />{' '}
          Drifting until {p.driftUntilLabel}
          {p.driftDurationLabel && ` (${p.driftDurationLabel})`}
        </span>
      )}
    </div>
  );
}

/** Cache of waypoint icons keyed by kind+selected+checked so re-renders reuse
 *  the same `DivIcon` instance; a fresh icon would make react-leaflet rebuild
 *  the marker DOM, which can interrupt an in-progress drag. */
const waypointIconCache = new Map<string, L.DivIcon>();

function waypointIcon(opts: {
  kind: 'departure' | 'arrival' | 'drift' | 'waypoint';
  selected: boolean;
  checked?: boolean;
}): L.DivIcon {
  const cacheKey = `${opts.kind}:${opts.selected ? 1 : 0}:${opts.checked ? 1 : 0}`;
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
    opts.checked ? 'fv-route-map__pin--checked' : '',
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
 * `getAntimeridianAwareBounds` picks whichever "unwrapped" longitude
 * representation keeps the route's own points contiguous (e.g. 170°..200°
 * instead of 170°..-160°) — a choice made independently of, and not
 * necessarily agreeing with, the anchor every waypoint/marker in this file
 * is wrapped near (`lonAnchor`, the departure point's own raw longitude —
 * see `wrapPointNear` below). When they disagree, fitting the map to this
 * bounds box centers the *view* near one longitude while every marker
 * renders near a different one 360°(×N) away — the route then appears
 * missing or only partly visible (every marker positioned far outside the
 * viewport) until some later pan/zoom happens to reconcile the two. This
 * silently shifts the whole bounds box by whatever whole multiple of 360°
 * brings its center in line with `lonAnchor` first, so the two can never
 * diverge regardless of which branch `getAntimeridianAwareBounds` took.
 */
function anchorBoundsNear(bounds: LatLngBoundsTuple, anchorLon: number): LatLngBoundsTuple {
  const [[south, west], [north, east]] = bounds;
  const centerLon = (west + east) / 2;
  const shift = wrapLongitudeNear(centerLon, anchorLon) - centerLon;
  return [
    [south, west + shift],
    [north, east + shift],
  ];
}

/**
 * Fits the map to the waypoints automatically — every time the route data
 * meaningfully changes (e.g. a voyage's route loads in stages: an initial
 * version followed shortly by the final one once auto-generation/background
 * computation finishes) — until the user manually pans or zooms, at which
 * point their control of the view takes over permanently and further data
 * changes (editing, adding/deleting/dragging waypoints) never reset it.
 *
 * When there's no route yet (e.g. a voyage/leg that hasn't had one plotted),
 * falls back to centering on the vessel's last known position instead of
 * leaving the map on its generic default view — so opening or returning to
 * this page always lands somewhere relevant: the route if there is one,
 * otherwise wherever the ship actually is. Since this component (and the
 * whole page) remounts fresh every time the route is navigated to, this
 * runs again on every visit, not just the very first load.
 */
function FitBounds({
  points,
  fallbackPos,
  lonAnchor,
}: {
  points: EditorPoint[];
  fallbackPos?: { lat: number; lon: number } | null;
  lonAnchor: number;
}) {
  const map = useMap();
  const userInteracted = useRef(false);
  // Guards against our own programmatic `fitBounds`/`setView` calls below —
  // those fire the same 'zoomstart'/'dragstart'-family events as a genuine
  // user gesture, so without this the very first auto-fit would immediately
  // (and permanently) mark itself as "the user took over".
  const programmatic = useRef(false);

  useEffect(() => {
    const markInteracted = () => {
      if (programmatic.current) return;
      userInteracted.current = true;
    };
    map.on('dragstart zoomstart', markInteracted);
    return () => {
      map.off('dragstart zoomstart', markInteracted);
    };
  }, [map]);

  useEffect(() => {
    if (userInteracted.current) return;
    if (points.length === 0) {
      if (!fallbackPos) return;
      programmatic.current = true;
      map.invalidateSize();
      map.setView([fallbackPos.lat, fallbackPos.lon], Math.max(map.getZoom(), 6));
      const t = window.setTimeout(() => {
        map.invalidateSize();
        map.fire('moveend');
        programmatic.current = false;
      }, 300);
      return () => window.clearTimeout(t);
    }
    programmatic.current = true;
    // The container's measured size can still be stale (e.g. the side panel
    // or bottom drawer hasn't finished its own layout pass yet when a
    // voyage's route first arrives) — invalidating first makes the fit/zoom
    // below compute against the real size, and forces Leaflet to reposition
    // every layer (route polylines *and* the weather field), instead of
    // only correcting once the user happens to pan/zoom manually.
    map.invalidateSize();
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lon], Math.max(map.getZoom(), 4));
    } else {
      const bounds = getAntimeridianAwareBounds(points.map((p) => [p.lat, p.lon]));
      if (bounds) map.fitBounds(L.latLngBounds(anchorBoundsNear(bounds, lonAnchor)), { padding: [40, 40], maxZoom: 9 });
    }
    // Belt-and-braces: explicitly ask every moveend-listening layer (the
    // weather field in particular — see `WeatherFieldLayer.tsx`) to redraw
    // once more shortly after, in case the panel/drawer layout was still
    // settling when the above ran against a still-stale container size.
    const t = window.setTimeout(() => {
      map.invalidateSize();
      map.fire('moveend');
      // Release the guard only once any animation from the fit above has
      // had time to fully settle, so a real user gesture that happens to
      // land right afterwards is still correctly recognised.
      programmatic.current = false;
    }, 300);
    return () => window.clearTimeout(t);
    // Deliberately keyed on the points themselves (not just their count) —
    // a route that loads in stages (e.g. a short placeholder followed by
    // the final land-avoiding path) changes point count *and* positions, and
    // either should re-fit as long as the user hasn't taken control yet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length, points[0]?.lat, points[0]?.lon, points[points.length - 1]?.lat, points[points.length - 1]?.lon, fallbackPos?.lat, fallbackPos?.lon, lonAnchor]);
  return null;
}

/** Zooms to the points of the latest `requestMapFit` call (e.g. a just-imported route). */
function FitRequestHandler({ lonAnchor }: { lonAnchor: number }) {
  const map = useMap();
  const request = useMapFitRequest();
  const handled = useRef<number | null>(request?.nonce ?? null);
  useEffect(() => {
    if (!request || handled.current === request.nonce) return;
    handled.current = request.nonce;
    const bounds = getAntimeridianAwareBounds(request.points);
    map.invalidateSize();
    if (bounds) map.fitBounds(L.latLngBounds(anchorBoundsNear(bounds, lonAnchor)), { padding: [40, 40], maxZoom: 9 });
  }, [map, request, lonAnchor]);
  return null;
}

/**
 * Recenters the map on the vessel's last known position, keeping the current
 * zoom, whenever the host page issues a `requestMapCenterOnVessel()` call
 * (e.g. the "center on ship" toolbar button) — regardless of wherever the
 * view happens to be panned to at the time.
 */
function CenterOnVesselHandler({
  vesselPos,
  lonAnchor,
}: {
  vesselPos?: { lat: number; lon: number } | null;
  lonAnchor: number;
}) {
  const map = useMap();
  const request = useMapCenterOnVesselRequest();
  const handled = useRef<number | null>(request?.nonce ?? null);
  useEffect(() => {
    if (!request || handled.current === request.nonce) return;
    handled.current = request.nonce;
    if (!vesselPos) return;
    const [lat, lon] = wrapPointNear([vesselPos.lat, vesselPos.lon], lonAnchor);
    map.setView([lat, lon], map.getZoom());
  }, [map, request, vesselPos, lonAnchor]);
  return null;
}

/**
 * Keeps the Leaflet map sized to its container. When the side panel is
 * minimized the map grows; Leaflet caches its pixel size, so without
 * invalidateSize() the map would stay clipped instead of filling the page.
 *
 * (The separate "route/zones missing until the first pan/zoom" first-paint
 * issue is handled by remounting the vector layers once shortly after mount
 * — see `remountNonce` in `RouteEditorMap` — rather than here: neither
 * `invalidateSize()` nor forcing Leaflet's internal `_resetView()` turned
 * out to reliably fix it.)
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
  checkedIds = [],
  vesselFallbackPos,
  routes = [],
  selectedRouteId,
  shipMarkers = [],
  reportMarkers = [],
  reportSpeedOptions = [],
  defaultReportFuelType,
  onSetReportSpeed,
  onSetReportFuel,
  onApplyReportCriteria,
  plannedRouteColor = '#58a6ff',
  activeWaypoints = [],
  onSelectRoute,
  onSelectPoint,
  onAddPoint,
  onInsertPoint,
  onMovePoint,
  onMovePointPreview,
  onDeletePoint,
  legendBarInHostToolbar = false,
}: RouteEditorMapProps) {
  const [baseLayer, setBaseLayer] = useState<MapLayerId>(() => readMapLayerId());
  const [overlayLayers, setOverlayLayers] = useState<OverlayLayerId[]>(() => readOverlayLayers());
  const dragFrameByIdRef = useRef(new Map<string, number>());
  // Whether Shift is currently held — while it is, waypoint markers are kept
  // non-draggable (see `draggable=` on the Marker below). Without this, even
  // a sub-3px mouse movement during a Shift+click (ordinary hand/trackpad
  // jitter — unavoidable in real use, unlike a precise synthetic click) can
  // get interpreted by Leaflet as the start of a drag instead of a click:
  // at a low zoom level that tiny on-screen movement still maps to a real,
  // visible shift in the waypoint's position, AND the resulting 'drag'
  // event swallows the 'click' entirely — so Shift+click range-selecting
  // waypoints (see `onSelectPoint`) silently never fires. Tracked as React
  // state (not just a ref) so toggling it re-renders every marker's
  // `draggable` prop live, the instant Shift is pressed or released.
  const [shiftHeld, setShiftHeld] = useState(false);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(false);
    };
    // Also release on window blur (e.g. alt-tabbing away mid-Shift-hold)
    // so a stuck "Shift held" state can never linger past its real cause.
    const onBlur = () => setShiftHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editingSpeedId, setEditingSpeedId] = useState<string>('');
  // Lets Cancel/Apply actually close the Leaflet popup they're inside (it
  // was only ever opened imperatively via `marker.openPopup()` on
  // right-click — clicking these buttons never called the matching
  // `closePopup()`, so the popup stayed open no matter which button was
  // clicked, which is what made them look broken).
  const reportMarkerRefs = useRef<Map<string, L.Marker>>(new Map());
  // Forces one clean remount of every vector layer (route lines, waypoint/
  // ship/report markers, area-constraint zones, the weather field, etc.) a
  // short beat after this map first mounts. Neither `invalidateSize()` nor
  // directly forcing Leaflet's internal `_resetView()` reliably fixed routes/
  // zones rendering missing or only partly visible until the user's first
  // pan/zoom (confirmed still happening after both) — remounting instead of
  // trying to coax Leaflet's existing layer instances into redrawing
  // sidesteps whatever specific internal state was wrong: a freshly mounted
  // layer always computes its position fresh against the map's *current*
  // state, with no stale cache to go wrong in the first place.
  const [remountNonce, setRemountNonce] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setRemountNonce((n) => n + 1), 700);
    return () => window.clearTimeout(t);
  }, []);

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
      (onMovePointPreview ?? onMovePoint)(id, lat, lon);
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

  /** The speed/fuel currently in effect at a report's position — the
   *  waypoint the leg it sits on departed from (the last waypoint whose ETA
   *  is at or before the report's own time) — so reopening the popup for
   *  any report shows what's *actually* governing that stretch of the
   *  voyage right now: the CP default until the first override, or
   *  whichever override was last applied at or before this report. */
  const effectiveSpeedAt = (report: ReportMarker): { speed?: number; fuelType?: string } => {
    const t = report.dateTimeIso ? new Date(report.dateTimeIso).getTime() : NaN;
    if (!Number.isFinite(t)) return {};
    let best: EditorPoint | null = null;
    for (const p of points) {
      if (p.etaMs != null && p.etaMs <= t && (best?.etaMs ?? -Infinity) <= p.etaMs) best = p;
    }
    return { speed: best?.speed, fuelType: best?.fuelType };
  };

  const openReportEditor = (report: ReportMarker) => {
    const defaultSpeedOpt = reportSpeedOptions.find((o) => o.isDefault) ?? reportSpeedOptions[0];
    const effective = effectiveSpeedAt(report);
    const speedOpt =
      (effective.speed != null
        ? reportSpeedOptions.find((o) => Math.abs(o.speedKts - effective.speed!) < 0.01)
        : undefined) ?? defaultSpeedOpt;
    setEditingSpeedId(speedOpt?.id ?? '');
    setEditingReportId(report.id);
  };

  const closeReportPopup = (reportId: string) => {
    reportMarkerRefs.current.get(reportId)?.closePopup();
    setEditingReportId(null);
  };

  const applyReportEditor = () => {
    if (!editingReportId) return;
    const opt = editingSpeedId ? reportSpeedOptions.find((o) => o.id === editingSpeedId) : undefined;
    const fuelType = opt?.fuelType ?? defaultReportFuelType;
    if (onSetReportSpeed && opt) {
      onSetReportSpeed(editingReportId, opt);
    }
    if (onSetReportFuel && fuelType) {
      onSetReportFuel(editingReportId, fuelType);
    }
    if (onApplyReportCriteria && opt) {
      const report = reportMarkers.find((r) => r.id === editingReportId);
      if (report) onApplyReportCriteria(report.pos, opt);
    }
    closeReportPopup(editingReportId);
  };

  // Every marker below must land in the same "world copy" as the route polylines, which are
  // drawn on a continuous (possibly >180 or <-180) numberline once the route crosses the
  // dateline. Markers otherwise keep their raw, canonical ±180 longitude and can render far
  // from the line they belong on (same geographic point, different copy of the map).
  const lonAnchor = points[0]?.lon ?? routes.find((r) => r.path.length > 0)?.path[0]?.[1] ?? 0;
  const wrappedWaypoints = useMemo(
    () => points.map((p): [number, number] => wrapPointNear([p.lat, p.lon], lonAnchor)),
    [points, lonAnchor],
  );
  const wrappedActiveWaypoints = useMemo(
    () => activeWaypoints.map((w) => ({ ...w, pos: wrapPointNear(w.pos, lonAnchor) })),
    [activeWaypoints, lonAnchor],
  );
  const wrappedShipMarkers = useMemo(
    () => shipMarkers.map((s) => ({ ...s, pos: wrapPointNear(s.pos, lonAnchor) })),
    [shipMarkers, lonAnchor],
  );
  const wrappedReportMarkers = useMemo(
    () => reportMarkers.map((r) => ({ ...r, pos: wrapPointNear(r.pos, lonAnchor) })),
    [reportMarkers, lonAnchor],
  );
  // `worldCopyJump` lets the user pan freely across repeated copies of the
  // tiled world, but Leaflet never auto-repeats vector layers (polylines,
  // polygons, markers) — only `<TileLayer>`s. For anything near the
  // dateline, render it at the adjacent world copies too (shifted by whole
  // multiples of 360°) so it stays visible no matter which side the user is
  // currently viewing from, instead of only existing in a single, arbitrary
  // copy of the map.
  const nearDateline = useMemo(
    () =>
      needsWorldCopies(points.map((p): [number, number] => [p.lat, p.lon])) ||
      needsWorldCopies(routes.flatMap((r) => r.path)) ||
      needsWorldCopies(shipMarkers.map((s) => s.pos)) ||
      needsWorldCopies(reportMarkers.map((r) => r.pos)) ||
      needsWorldCopies(activeWaypoints.map((w) => w.pos)),
    [points, routes, shipMarkers, reportMarkers, activeWaypoints],
  );
  const mapOffsets = nearDateline ? [-360, 0, 360] : [0];

  return (
    <MapContainer
      className="fv-route-map__canvas"
      center={[20, 80]}
      zoom={3}
      // Hard floor on zoom-out: below ~zoom 3 the whole world shrinks small
      // enough that it stops carrying useful navigational detail (country/
      // port labels disappear and the weather field loses resolution), and
      // on wide viewports Leaflet's implicit maxBounds-driven clamp alone
      // doesn't reliably stop it — so cap it explicitly instead of relying
      // on that container-size-dependent behaviour.
      minZoom={3}
      zoomSnap={0.25}
      zoomDelta={0.5}
      wheelPxPerZoomLevel={120}
      maxBounds={WORLD_PAN_BOUNDS}
      maxBoundsViscosity={1.0}
      worldCopyJump
      scrollWheelZoom
      // Leaflet's default Shift+drag "box zoom" competes with Shift+click
      // range-selecting waypoints below: any tiny mouse movement during a
      // real-world click (unlike a precise synthetic one) gets interpreted
      // as the start of a zoom box instead of a plain click, so the
      // marker's click handler (and its Shift-modified range-select) never
      // fires at all. Not used anywhere else in this UI, so disabling it
      // outright is the simplest fix.
      boxZoom={false}
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
      <FitBounds points={points} fallbackPos={vesselFallbackPos} lonAnchor={lonAnchor} />
      <FitRequestHandler lonAnchor={lonAnchor} />
      <CenterOnVesselHandler vesselPos={vesselFallbackPos} lonAnchor={lonAnchor} />
      <MapResizeHandler />

      <Fragment key={remountNonce}>
      {/* Each leg is drawn as a straight rhumb line or a curved great-circle
          arc depending on its originating waypoint's `legType`. A wide
          transparent line on top gives a forgiving click target for inserting
          a new waypoint between the two endpoints. */}
      {mapOffsets.flatMap((offset) =>
        points.slice(0, -1).map((p, i) => {
          const next = points[i + 1];
          // Thread the leg's line through any real (non-interpolated) report
          // positions that fall chronologically between these two
          // waypoints' ETAs — so the route visibly passes through where the
          // vessel actually was, without making the report an editable
          // waypoint itself (see `reportsForLeg`/`buildLegPath`).
          const through = reportsForLeg(reportMarkers, p.etaMs, next.etaMs).map((r) => ({
            lat: r.pos[0],
            lon: r.pos[1],
          }));
          const visible = offsetPoints(
            unwrapRouteCoordinates(
              buildLegPath(p, next, p.legType ?? 'rhumb', through) as Array<[number, number]>,
            ),
            offset,
          );
          const hit: LatLngExpression[] = offsetPoints(
            unwrapRouteCoordinates([
              [p.lat, p.lon],
              [next.lat, next.lon],
            ]),
            offset,
          );
          return (
            <Fragment key={`seg-${p.id}-${editable ? 'edit' : 'lock'}-${offset}`}>
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
        }),
      )}

      {/* Candidate optimized routes. The selected one is drawn last (on top),
          solid and emphasised; the rest are thinner, dashed and translucent. */}
      {mapOffsets.flatMap((offset) =>
        [...routes]
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
                key={`${r.id}-${offset}`}
                positions={offsetPoints(unwrapRouteCoordinates(r.path), offset) as LatLngExpression[]}
                pathOptions={{
                  color: r.color,
                  weight: isSel ? 5 : 3,
                  opacity: isSel ? 1 : 0.75,
                }}
                interactive={false}
              />
            );
          }),
      )}

        {/* Markers render from committed `points`; the position is a stable
          tuple (`latLng`) so unrelated re-renders never call setLatLng.
          During drag, updates are streamed to the parent (throttled to one
          update per animation frame) so the route line moves with the marker. */}
      {mapOffsets.flatMap((offset) =>
        points.map((p, idx) => (
          <Marker
            key={`${p.id}-${offset}`}
            position={offsetPoint(wrappedWaypoints[idx], offset)}
            draggable={offset === 0 && editable && !p.locked && !shiftHeld}
            // Always drawn above the "other candidate routes" comparison
            // overlay (`wpDotIcon` below) and anything else without its own
            // offset — otherwise, when another route being compared tracks
            // almost the same path (very common, since it's often a copy
            // of this same voyage), its plain dots can sit almost exactly
            // on top of these and fully hide a checked/selected colour
            // change, leaving only the shared white ring visible.
            zIndexOffset={1000}
            // Every world-copy duplicate stays interactive (not just the
            // canonical `offset === 0` one) so hovering shows the waypoint's
            // tooltip no matter which side of the antimeridian the user is
            // currently viewing from — only dragging/click-to-delete stay
            // restricted to the canonical copy below, to avoid ambiguity
            // over which copy's edit should apply.
            interactive
            icon={waypointIcon({
              kind: p.isPort
                ? idx === 0
                  ? 'departure'
                  : 'arrival'
                : p.drift
                  ? 'drift'
                  : 'waypoint',
              selected: selected.includes(p.id),
              checked: checkedIds.includes(p.id),
            })}
            eventHandlers={
              offset === 0
                ? {
                    click: (e) => {
                      if (onSelectPoint) {
                        onSelectPoint(p.id, e.originalEvent?.shiftKey ?? false);
                        return;
                      }
                      if (editable && !p.isPort && !p.locked) onDeletePoint(p.id);
                    },
                    dblclick: (e) => {
                      if (e.originalEvent) L.DomEvent.stop(e.originalEvent);
                      // When `onSelectPoint` is wired up (e.g. Route Explorer's
                      // Waypoint details panel), deleting moves to that panel's own
                      // delete button instead of a map click.
                      if (onSelectPoint) return;
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
                  }
                : undefined
            }
          >
            {/* Rendered on every world-copy duplicate (not just the
                canonical one) so it shows up regardless of which side of
                the antimeridian the marker the user is hovering happens to
                be drawn on. */}
            <Tooltip direction="top" offset={[0, -14]}>
              <WaypointTipContent idx={idx} p={p} />
            </Tooltip>
          </Marker>
        )),
      )}
      {/* Waypoints of the simulated routes (coloured dots). */}
      {mapOffsets.flatMap((offset) =>
        wrappedActiveWaypoints.map((w, i) => (
          <Marker key={`awp-${i}-${offset}`} position={offsetPoint(w.pos, offset)} icon={wpDotIcon(w.color)} interactive={false} />
        )),
      )}
      {/* Animated vessel markers driven by the route simulator playback. */}
      {mapOffsets.flatMap((offset) =>
        wrappedShipMarkers.map((s) => (
          <Marker
            key={`ship-${s.id}-${offset}`}
            position={offsetPoint(s.pos, offset)}
            icon={shipDivIcon(s.color, s.active ?? false, s.heading ?? 0)}
            zIndexOffset={s.active ? 1000 : 500}
            eventHandlers={
              onSelectRoute ? { click: () => onSelectRoute(s.id) } : undefined
            }
          />
        )),
      )}

      {/* Received reports on the active route (departure/arrival/noon/speed/fuel
          changes), plus light validated 6-hour breakup points between them. */}
      {mapOffsets.flatMap((offset) =>
        wrappedReportMarkers.map((r) => {
          const isInterpolated = !!r.isInterpolated;
          const color = r.color ?? (isInterpolated ? '#b8c4d6' : '#f59e0b');
          return (
            <Marker
              key={`report-${r.id}-${offset}`}
              position={offsetPoint(r.pos, offset)}
              ref={(instance) => {
                if (offset !== 0) return;
                if (instance) reportMarkerRefs.current.set(r.id, instance);
                else reportMarkerRefs.current.delete(r.id);
              }}
              icon={
                isInterpolated
                  ? reportGapDotIcon(color)
                  : shipDivIcon(color, false, r.course ?? 0)
              }
              eventHandlers={
                offset !== 0 || isInterpolated
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
              {offset === 0 && !isInterpolated && (
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
                  {!editable && (
                    <p className="fv-route-map__report-meta">
                      Enter route edit mode to apply a speed change forward from this report.
                    </p>
                  )}
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
                  <div className="fv-route-map__report-actions">
                    <button
                      type="button"
                      className="fv-route-map__report-btn"
                      onClick={() => closeReportPopup(r.id)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="fv-route-map__report-btn fv-route-map__report-btn--primary"
                      disabled={!editable}
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
        }),
      )}

      <MapLayersControl position="topright" value={baseLayer} onChange={setBaseLayer} overlayLayers={overlayLayers} onOverlayToggle={setOverlayLayers} />
      {overlayLayers.includes('loadLineZones') && <LoadLineZonesLayer />}
      <WeatherFieldControl position="topright" />
      {!legendBarInHostToolbar && <MapWeatherLegendControl position="topleft" />}
      <AreaConstraintsControl position="topright" />
      <WeatherPointControl position="topright" />
      <PortsControl position="topright" />
      <RulerControl position="topright" />
      <CycloneLayer position="topright" />
      <WeatherAlertsControl position="topright" />
      <MapCursorPosition />
      </Fragment>
    </MapContainer>
  );
}
