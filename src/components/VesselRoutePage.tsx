import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import L, { type LatLngBoundsExpression, type LatLngExpression } from 'leaflet';

import { useFleetView } from '../context/FleetViewContext';
import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { PORT_COORDS } from '../data/fleet';
import type { Voyage } from '../data/voyages';
import { LeftSidebar } from './LeftSidebar';
import { BottomPanel } from './BottomPanel';

/**
 * Vessel Route View — `/vessel-route?voyage=<id>`.
 *
 * Opened when a vessel is clicked on the Fleet List View. Strips the
 * dashboard chrome down to the left icon rail plus a focused map of the
 * selected vessel's route and waypoints. A compact top bar shows the
 * vessel name, route itinerary and the Mail / Edit Voyage / New Voyage
 * actions; the bottom panel keeps the Tracksheet + Route Simulator
 * tabs. Every value is resolved live from the selected `Voyage`.
 */

interface Waypoint {
  name: string;
  label: string;
  coords: [number, number];
}

/** Build the ordered list of route waypoints from the voyage ports. */
function buildWaypoints(v: Voyage): Waypoint[] {
  return [
    { name: v.portFrom, label: 'Departure' },
    { name: v.interimPort, label: 'Interim' },
    { name: v.portTo, label: 'Arrival' },
  ]
    .filter((p) => p.name && PORT_COORDS[p.name])
    .map((p) => ({ name: p.name, label: p.label, coords: PORT_COORDS[p.name] }));
}

function waypointIcon(index: number, total: number): L.DivIcon {
  const first = index === 0;
  const last = index === total - 1;
  const cls = first
    ? 'fv-vessel-route__wp--start'
    : last
      ? 'fv-vessel-route__wp--end'
      : 'fv-vessel-route__wp--mid';
  return L.divIcon({
    className: 'fv-vessel-route__wp-wrap',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<span class="fv-vessel-route__wp ${cls}">${index + 1}</span>`,
  });
}

function shipIcon(): L.DivIcon {
  return L.divIcon({
    className: 'fv-vessel-route__ship-wrap',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: '<span class="fv-vessel-route__ship"><i class="fas fa-ship" aria-hidden="true"></i></span>',
  });
}

/** Point a fraction `t` (0..1) of the way along the multi-leg route. */
function pointAlong(coords: Array<[number, number]>, t: number): [number, number] {
  if (coords.length === 0) return [0, 0];
  if (coords.length === 1) return coords[0];
  const segCount = coords.length - 1;
  const pos = Math.max(0, Math.min(segCount, t * segCount));
  const i = Math.min(segCount - 1, Math.floor(pos));
  const f = pos - i;
  const [aLat, aLon] = coords[i];
  const [bLat, bLon] = coords[i + 1];
  return [aLat + (bLat - aLat) * f, aLon + (bLon - aLon) * f];
}

export function VesselRoutePage() {
  const { isLoading, error, user, isStubbed } = useFleetView();
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };
  const voyage = useSelectedVoyage();

  const waypoints = useMemo(
    () => (voyage ? buildWaypoints(voyage) : []),
    [voyage],
  );
  const linePositions = useMemo<LatLngExpression[]>(
    () => waypoints.map((w) => w.coords as LatLngExpression),
    [waypoints],
  );
  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    if (waypoints.length === 0) return null;
    const lats = waypoints.map((w) => w.coords[0]);
    const lons = waypoints.map((w) => w.coords[1]);
    const pad = 5;
    return [
      [Math.min(...lats) - pad, Math.min(...lons) - pad],
      [Math.max(...lats) + pad, Math.max(...lons) + pad],
    ];
  }, [waypoints]);
  const shipPos = useMemo<[number, number] | null>(
    () =>
      waypoints.length >= 2
        ? pointAlong(
            waypoints.map((w) => w.coords),
            0.4,
          )
        : waypoints[0]?.coords ?? null,
    [waypoints],
  );

  if (isLoading) {
    return <div className="fv-loading">Loading FleetView…</div>;
  }

  if (error || !user) {
    return (
      <div className="fv-unauthenticated">
        <h1>Not signed in</h1>
        <p>
          Please <a href="/Account/Login">sign in</a> to continue.
        </p>
      </div>
    );
  }

  const voyageQuery = voyage ? `?voyage=${encodeURIComponent(voyage.id)}` : '';
  const itinerary = waypoints.map((w) => w.name).join(' → ');

  return (
    <div id="page-wrapper">
      {isStubbed && (
        <div className="fv-dev-banner">
          DEV MODE — showing stub data so the layout renders.
        </div>
      )}

      <div id="main-wrapper">
        <LeftSidebar iconOnly />

        <div id="portal" className="portal-container fv-vessel-route">
          {/* TOP BAR --------------------------------------------------- */}
          <header className="fv-vessel-route__topbar">
            <div className="fv-vessel-route__heading">
              <i className="fas fa-ship" aria-hidden="true" />
              <h1 className="fv-vessel-route__vessel">
                {voyage?.vessel ?? t('noVesselSelected', 'No vessel selected')}
              </h1>
              {voyage && (
                <span className="fv-vessel-route__itinerary" title={itinerary}>
                  {itinerary || `${voyage.portFrom} → ${voyage.portTo}`}
                </span>
              )}
            </div>

            <div className="fv-vessel-route__actions">
              <Link
                className="fv-vessel-route__btn"
                to={`/email${voyageQuery}`}
                title={t('mail', 'Mail')}
              >
                <i className="fas fa-envelope" aria-hidden="true" />
                <span>{t('mail', 'Mail')}</span>
              </Link>
              <Link
                className="fv-vessel-route__btn"
                to={`/voyage${voyageQuery}`}
                title={t('editVoyage', 'Edit Voyage')}
              >
                <i className="fas fa-pen-to-square" aria-hidden="true" />
                <span>{t('editVoyage', 'Edit Voyage')}</span>
              </Link>
              <Link
                className="fv-vessel-route__btn fv-vessel-route__btn--primary"
                to="/voyage/new"
                title={t('createNewVoyage', 'New Voyage')}
              >
                <i className="fas fa-plus" aria-hidden="true" />
                <span>{t('newVoyage', 'New Voyage')}</span>
              </Link>
            </div>
          </header>

          {/* MAP ------------------------------------------------------- */}
          <div className="fv-vessel-route__map">
            {waypoints.length === 0 ? (
              <div className="fv-vessel-route__empty">
                {t(
                  'noRouteData',
                  'No route data is available for this vessel.',
                )}
              </div>
            ) : (
              <MapContainer
                {...(bounds
                  ? { bounds }
                  : { center: [20, 0] as LatLngExpression, zoom: 3 })}
                minZoom={2}
                maxZoom={10}
                worldCopyJump
                scrollWheelZoom
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution="Tiles &copy; Esri"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}"
                  maxNativeZoom={10}
                />

                {linePositions.length >= 2 && (
                  <Polyline
                    positions={linePositions}
                    pathOptions={{ color: '#58a6ff', weight: 4, opacity: 0.9 }}
                  />
                )}

                {waypoints.map((w, i) => (
                  <Marker
                    key={`${w.label}-${w.name}`}
                    position={w.coords}
                    icon={waypointIcon(i, waypoints.length)}
                  >
                    <Tooltip
                      direction="top"
                      offset={[0, -10]}
                      opacity={1}
                      className="fv-vessel-route__tooltip"
                    >
                      {w.label}: {w.name}
                    </Tooltip>
                  </Marker>
                ))}

                {shipPos && (
                  <Marker position={shipPos} icon={shipIcon()} zIndexOffset={1000}>
                    <Tooltip
                      direction="top"
                      offset={[0, -14]}
                      opacity={1}
                      permanent
                      className="fv-vessel-route__tooltip"
                    >
                      {voyage?.vessel} · {voyage?.status}
                    </Tooltip>
                  </Marker>
                )}
              </MapContainer>
            )}
          </div>

          {/* BOTTOM: Tracksheet + Route Simulator --------------------- */}
          <BottomPanel />
        </div>
      </div>
    </div>
  );
}
