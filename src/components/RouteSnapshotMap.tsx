import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L, { type LatLngBoundsExpression } from 'leaflet';

import { MapLayersControl, readMapLayerId, readOverlayLayers, type MapLayerId, type OverlayLayerId } from './MapLayersControl';
import { WeatherFieldControl } from './WeatherFieldControl';
import { MapWeatherLegendControl } from './MapWeatherLegendControl';
import { sampleFrozenGrid, type FrozenWeatherGrid, type WeatherFactorId } from '../data/routeWeatherSnapshot';
import type { SnapshotRouteItem } from '../data/routeSnapshotsStore';
import { antimeridianAwareBoundsBox, needsWorldCopies, offsetPoint, unwrapRouteCoordinates } from '../data/antimeridian';

/** Fit the map to the given bounds once, when they first become available
 *  (e.g. once the snapshot has loaded) — not on every render. */
function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [24, 24] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return null;
}

const shipIcon = (color: string) =>
  L.divIcon({
    className: 'fv-snapshot-ship',
    html: `<i class="fas fa-location-arrow" style="color:${color}"></i>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

/** Matches the live map's weather field ids (`currents`, not `current`). */
const LIVE_ID_BY_FACTOR: Record<string, string> = {
  waves: 'waves',
  swell: 'swell',
  wind: 'wind',
  current: 'currents',
};

/**
 * The interactive map for a locked route snapshot — the same map chrome as
 * the Route Explorer's editor map (base-layer switcher incl. nautical
 * charts, weather layer toggle, legend), but read-only: no click-to-add/
 * drag/report markers, and the weather layer replays a frozen grid
 * captured at lock time instead of sampling live conditions.
 */
export function RouteSnapshotMap({
  routes,
  weatherGrids,
  shipPositions = [],
}: {
  routes: SnapshotRouteItem[];
  weatherGrids?: Record<WeatherFactorId, FrozenWeatherGrid>;
  /** Optional vessel markers (e.g. simulated playback position per route). */
  shipPositions?: Array<{ id: string; pos: [number, number]; color: string }>;
}) {
  const [baseLayer, setBaseLayer] = useState<MapLayerId>(() => readMapLayerId());
  const [overlayLayers, setOverlayLayers] = useState<OverlayLayerId[]>(() => readOverlayLayers());

  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    const pts = routes.flatMap((r) => r.path);
    if (pts.length === 0) return null;
    const box = antimeridianAwareBoundsBox(pts);
    if (!box) return null;
    return [
      [box.south, box.west],
      [box.north, box.east],
    ];
  }, [routes]);

  // Each route is unwrapped onto its own continuous numberline, then (if
  // near the dateline) duplicated at adjacent world copies so it doesn't
  // disappear when the user pans past 180deg — Leaflet only auto-repeats
  // `<TileLayer>`s, never `<Polyline>`/`<Marker>`.
  const renderRoutes = useMemo(
    () =>
      routes.map((r) => {
        const path = unwrapRouteCoordinates(r.path);
        const offsets = needsWorldCopies(path) ? [-360, 0, 360] : [0];
        return { ...r, path, offsets };
      }),
    [routes],
  );

  const sampleOverrides = useMemo(() => {
    if (!weatherGrids) return undefined;
    const entries = Object.entries(weatherGrids).map(([factorId, grid]) => {
      const liveId = LIVE_ID_BY_FACTOR[factorId] ?? factorId;
      return [liveId, (lat: number, lon: number) => sampleFrozenGrid(grid, lat, lon)] as const;
    });
    return Object.fromEntries(entries);
  }, [weatherGrids]);

  return (
    <MapContainer
      className="fv-route-map__canvas"
      center={[20, 80]}
      zoom={3}
      minZoom={2}
      zoomSnap={0.25}
      zoomDelta={0.5}
      wheelPxPerZoomLevel={120}
      worldCopyJump
      scrollWheelZoom
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

      <FitBounds bounds={bounds} />

      {renderRoutes.flatMap((r) =>
        r.offsets.map((offset) => (
          <Polyline
            key={`${r.id}-${offset}`}
            positions={r.path.map(([lat, lon]) => [lat, lon + offset] as [number, number])}
            pathOptions={{ color: r.color, weight: 3 }}
          />
        )),
      )}
      {shipPositions.flatMap((s) => {
        const offsets = needsWorldCopies([s.pos]) ? [-360, 0, 360] : [0];
        return offsets.map((offset) => (
          <Marker key={`${s.id}-${offset}`} position={offsetPoint(s.pos, offset)} icon={shipIcon(s.color)} />
        ));
      })}

      <MapLayersControl
        position="topright"
        value={baseLayer}
        onChange={setBaseLayer}
        overlayLayers={overlayLayers}
        onOverlayToggle={setOverlayLayers}
      />
      <WeatherFieldControl position="topright" sampleOverrides={sampleOverrides} />
      <MapWeatherLegendControl position="topleft" />
    </MapContainer>
  );
}
