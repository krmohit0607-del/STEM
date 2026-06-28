import { useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import L from 'leaflet';

import { PORT_COORDS } from '../data/fleet';
import { generateSeaRoute } from '../data/seaRoute';
import { writeSelectedVoyageId } from '../data/selectedVoyage';
import { AreaConstraintsControl } from './AreaConstraintsControl';
import { WeatherFieldControl } from './WeatherFieldControl';

/**
 * Fleet Map View — rendered when the Fleet List View toggle is set to
 * "Map". Plots every vessel currently in view at a fixed position along
 * its `portFrom → portTo` route, together with its current status.
 *
 * Positions are static placeholders derived from each vessel's route
 * until the real `/api/vessel/{imo}/position` stream is wired up.
 */

export interface MapVessel {
  id: string;
  vessel: string;
  client: string;
  service: string;
  status: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  portFrom: string;
  portTo: string;
  eta: string;
  health: number;
  aiAlert: string;
}

interface FleetMapViewProps {
  vessels: MapVessel[];
  theme?: 'dark' | 'light';
}

/** Deterministic 0..1 pseudo-random from a string seed. */
function seedFraction(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) % 100000;
  }
  return (h % 1000) / 1000;
}

/** Linear interpolation between two [lat, lon] points. */
function lerp(
  a: [number, number],
  b: [number, number],
  t: number,
): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Marker colour by vessel priority. */
function priorityColor(priority: MapVessel['priority']): string {
  if (priority === 'HIGH') return '#f85149';
  if (priority === 'MEDIUM') return '#d29922';
  return '#3fb950';
}

/** Heading (degrees, 0 = pointing east) from the route's from→to leg. */
function vesselHeading(
  from: [number, number] | undefined,
  to: [number, number] | undefined,
): number {
  if (!from || !to) return 0;
  return (Math.atan2(-(to[0] - from[0]), to[1] - from[1]) * 180) / Math.PI;
}

function vesselIcon(
  color: string,
  inPort: boolean,
  heading: number,
): L.DivIcon {
  if (inPort) {
    return L.divIcon({
      className: 'fv-fleet-map__ship-wrap',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      html: `
        <span class="fv-fleet-map__ship fv-fleet-map__ship--port" style="color:${color}">
          <i class="fas fa-anchor" aria-hidden="true"></i>
        </span>
      `,
    });
  }
  return L.divIcon({
    className: 'fv-fleet-map__ship-wrap',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `
      <span class="fv-fleet-map__ship" style="transform:rotate(${heading}deg)">
        <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 7 H15 L22 12 L15 17 H3 Z" fill="${color}" stroke="#0e1626" stroke-width="1.4" stroke-linejoin="round" />
        </svg>
      </span>
    `,
  });
}

interface PlacedVessel extends MapVessel {
  pos: [number, number];
  from: [number, number] | undefined;
  to: [number, number] | undefined;
  inPort: boolean;
}

export function FleetMapView({ vessels, theme = 'dark' }: FleetMapViewProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Real water-route geometry per vessel, computed lazily on first hover.
  const [routes, setRoutes] = useState<Record<string, [number, number][]>>({});
  const requested = useRef<Set<string>>(new Set());

  const requestRoute = (
    id: string,
    from: [number, number] | undefined,
    to: [number, number] | undefined,
  ) => {
    if (!from || !to || requested.current.has(id)) return;
    requested.current.add(id);
    generateSeaRoute(
      { lat: from[0], lon: from[1] },
      { lat: to[0], lon: to[1] },
    )
      .then((pts) => {
        setRoutes((prev) => ({
          ...prev,
          [id]: pts.map((p) => [p.lat, p.lon] as [number, number]),
        }));
      })
      .catch(() => {
        // No water path found — fall back to the straight leg on render.
        requested.current.delete(id);
      });
  };

  const placed = useMemo<PlacedVessel[]>(() => {
    return vessels.map((v) => {
      const from = PORT_COORDS[v.portFrom];
      const to = PORT_COORDS[v.portTo];
      const inPort = !from || !to || v.portFrom === v.portTo;

      if (inPort) {
        const at = from ?? to ?? [0, 0];
        return { ...v, pos: at, from, to, inPort: true };
      }

      // Fixed point along the leg, varied per vessel so markers don't
      // overlap. Replace with the real reported position when available.
      const t = 0.25 + seedFraction(v.id) * 0.5;
      return { ...v, pos: lerp(from, to, t), from, to, inPort: false };
    });
  }, [vessels]);

  return (
    <div className="fv-fleet__map">
      <MapContainer
        center={[20, 30]}
        zoom={2}
        minZoom={2}
        worldCopyJump
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          key={theme}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={`https://{s}.basemaps.cartocdn.com/${
            theme === 'light' ? 'light_all' : 'dark_all'
          }/{z}/{x}/{y}{r}.png`}
          crossOrigin="anonymous"
        />

        {placed.map((v) =>
          hoveredId === v.id && v.from && v.to ? (
            <Polyline
              key={`passage-${v.id}`}
              positions={routes[v.id] ?? [v.from, v.to]}
              pathOptions={{
                color: priorityColor(v.priority),
                weight: 2,
                opacity: 0.9,
                dashArray: '6 6',
              }}
            />
          ) : null,
        )}

        {placed.map((v) => (
          <Marker
            key={v.id}
            position={v.pos}
            icon={vesselIcon(
              priorityColor(v.priority),
              v.inPort,
              vesselHeading(v.from, v.to),
            )}
            eventHandlers={{
              mouseover: () => {
                setHoveredId(v.id);
                requestRoute(v.id, v.from, v.to);
              },
              mouseout: () => setHoveredId((cur) => (cur === v.id ? null : cur)),
              click: () => {
                writeSelectedVoyageId(v.id);
                window.open(
                  `/vessel-route?voyage=${encodeURIComponent(v.id)}`,
                  '_blank',
                  'noopener,noreferrer',
                );
              },
            }}
          >
            <Tooltip className="fv-fleet-map__tooltip" direction="top" offset={[0, -14]}>
              <strong>{v.vessel}</strong>
              <br />
              {v.client} · {v.service}
              <br />
              {v.portFrom} → {v.portTo}
              <br />
              {v.inPort ? 'In port' : v.status}
              <br />
              ETA {v.eta}
              {v.aiAlert && v.aiAlert !== 'None' ? (
                <>
                  <br />
                  <span className="fv-fleet-map__alert">⚠ {v.aiAlert}</span>
                </>
              ) : null}
            </Tooltip>
          </Marker>
        ))}
        <AreaConstraintsControl position="topright" />
        <WeatherFieldControl position="topright" />
      </MapContainer>
    </div>
  );
}
