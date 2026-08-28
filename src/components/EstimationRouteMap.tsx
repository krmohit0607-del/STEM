import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';

import { useWorldPorts, type WorldPort } from '../data/ports';
import { generateSeaRoute, type SeaRoutePoint } from '../data/seaRoute';
import { getAntimeridianAwareBounds, unwrapRouteCoordinates } from '../data/antimeridian';

/** Named canals / capes / straits used as routing waypoints and to resolve
 * canal-transit legs that aren't in the world-port list. */
const LANDMARKS: { match: RegExp; lat: number; lon: number }[] = [
  { match: /suez/i, lat: 30.5, lon: 32.35 },
  { match: /panama/i, lat: 9.08, lon: -79.68 },
  { match: /kiel/i, lat: 54.0, lon: 9.4 },
  { match: /good hope|cogh|cape town/i, lat: -34.8, lon: 18.4 },
  { match: /english channel|dover|ushant/i, lat: 49.5, lon: -2.5 },
  { match: /gibraltar/i, lat: 35.95, lon: -5.6 },
  { match: /bab.?el.?mandeb|aden/i, lat: 12.6, lon: 43.4 },
  { match: /malacca|singapore strait/i, lat: 1.8, lon: 103.5 },
];

const WP = {
  babElMandeb: { lat: 12.6, lon: 43.4 },
  suez: { lat: 30.5, lon: 32.35 },
  gibMed: { lat: 36.0, lon: -4.3 },
  gibAtl: { lat: 36.0, lon: -7.2 },
  cogh: { lat: -34.8, lon: 18.4 },
  channelW: { lat: 49.2, lon: -5.5 },
  dover: { lat: 51.4, lon: 2.0 },
  malaccaW: { lat: 5.9, lon: 94.5 },
  malaccaMid: { lat: 2.9, lon: 100.6 },
  singaporeStr: { lat: 1.25, lon: 104.1 },
};

/** Narrow straits (< grid resolution) drawn as straight open-water hops so A*
 * doesn't detour around them. Compared by coordinate identity. */
const STRAIT_HOPS: [SeaRoutePoint, SeaRoutePoint][] = [
  [WP.gibMed, WP.gibAtl],
  [WP.channelW, WP.dover],
  [WP.malaccaW, WP.malaccaMid],
  [WP.malaccaMid, WP.singaporeStr],
];

function isStraitHop(a: SeaRoutePoint, b: SeaRoutePoint): boolean {
  return STRAIT_HOPS.some(
    ([p, q]) => (p === a && q === b) || (p === b && q === a),
  );
}

function landmark(value: string): { lat: number; lon: number } | null {
  const hit = LANDMARKS.find((l) => l.match.test(value));
  return hit ? { lat: hit.lat, lon: hit.lon } : null;
}

/** Insert canal / cape waypoints for the Asia ↔ Europe corridor so the leg
 * follows Suez (when selected) or the Cape of Good Hope → English Channel. */
function corridorWaypoints(a: SeaRoutePoint, b: SeaRoutePoint, suez: boolean): SeaRoutePoint[] {
  const asia = (p: SeaRoutePoint) => p.lon > 55 && p.lat < 40;
  const nwEurope = (p: SeaRoutePoint) => p.lat > 44 && p.lon > -15 && p.lon < 12;
  const med = (p: SeaRoutePoint) => p.lat > 30 && p.lat < 46 && p.lon > -6 && p.lon < 42;
  // West / east of the Malacca–Singapore strait.
  const westOfMalacca = (p: SeaRoutePoint) => p.lon >= 40 && p.lon <= 98 && p.lat >= -35 && p.lat <= 30;
  const eastOfMalacca = (p: SeaRoutePoint) => p.lon >= 100 && p.lon <= 135 && p.lat >= -12 && p.lat <= 45;

  const build = (from: SeaRoutePoint, to: SeaRoutePoint): SeaRoutePoint[] => {
    // Indian Ocean ↔ East Asia: transit the Malacca & Singapore straits.
    if (westOfMalacca(from) && eastOfMalacca(to)) {
      return [WP.malaccaW, WP.malaccaMid, WP.singaporeStr];
    }
    // Mediterranean → NW Europe: exit Gibraltar, then the English Channel.
    if (med(from) && nwEurope(to)) {
      return [WP.gibMed, WP.gibAtl, WP.channelW, WP.dover];
    }
    if (!asia(from)) return [];
    if (nwEurope(to)) {
      return suez
        ? [WP.babElMandeb, WP.suez, WP.gibMed, WP.gibAtl, WP.channelW, WP.dover]
        : [WP.cogh, WP.channelW, WP.dover];
    }
    if (med(to)) {
      return suez ? [WP.babElMandeb, WP.suez] : [WP.cogh, WP.gibAtl, WP.gibMed];
    }
    return [];
  };

  // Forward (Asia→Europe) or reverse (Europe→Asia).
  const fwd = build(a, b);
  if (fwd.length) return fwd;
  const rev = build(b, a);
  return rev.length ? [...rev].reverse() : [];
}

/** Strip the "<Country>" / "(code)" suffixes the estimation uses on port names. */
function cleanName(s: string): string {
  return s.split('<')[0].split('(')[0].trim().toLowerCase();
}

function resolveFuzzy(value: string, ports: WorldPort[]): WorldPort | null {
  const v = cleanName(value);
  if (!v || v.length < 3) return null;
  return (
    ports.find((p) => p.name.toLowerCase() === v) ??
    ports.find((p) => p.name.toLowerCase().startsWith(v)) ??
    ports.find((p) => p.name.toLowerCase().includes(v)) ??
    null
  );
}

/**
 * Read-only route map for the current Voyage Estimation. Resolves the Port
 * Rotation port names (and canal-transit legs) to coordinates, routes each
 * leg over water, and inserts canal / cape waypoints per the selected canals.
 */
export function EstimationRouteMap({
  ports,
  canals = [],
}: {
  ports: { type: string; port: string }[];
  canals?: string[];
}) {
  const world = useWorldPorts();

  const stops = useMemo(() => {
    return ports
      .map((p) => {
        const lm = landmark(p.port);
        if (lm) return { type: p.type, name: p.port.split('<')[0].split('(')[0].trim(), country: '', lat: lm.lat, lon: lm.lon };
        const hit = resolveFuzzy(p.port, world);
        return hit ? { type: p.type, name: hit.name, country: hit.country, lat: hit.lat, lon: hit.lon } : null;
      })
      .filter((x): x is { type: string; name: string; country: string; lat: number; lon: number } => !!x);
  }, [ports, world]);

  const positions = useMemo<LatLngExpression[]>(
    () => stops.map((s) => [s.lat, s.lon] as LatLngExpression),
    [stops],
  );

  const canalKey = canals.join('|');

  // Sea route (water-only) built leg-by-leg via A* pathfinding, with canal /
  // cape waypoints inserted per the selected canals. Falls back to the
  // straight track while it computes or if routing fails.
  const [seaRoute, setSeaRoute] = useState<LatLngExpression[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (stops.length < 2) {
      setSeaRoute(null);
      return;
    }
    (async () => {
      const suez = canals.some((c) => /suez/i.test(c));
      const path: LatLngExpression[] = [];
      let first = true;
      const pushLeg = async (a: SeaRoutePoint, b: SeaRoutePoint) => {
        // Narrow straits are drawn straight (A* can't thread them at 1°).
        if (isStraitHop(a, b)) {
          if (first) path.push([a.lat, a.lon]);
          path.push([b.lat, b.lon]);
          first = false;
          return;
        }
        try {
          const leg = await generateSeaRoute(a, b);
          const pts = leg.map((p) => [p.lat, p.lon] as LatLngExpression);
          if (!first && pts.length) pts.shift();
          path.push(...pts);
        } catch {
          if (first) path.push([a.lat, a.lon]);
          path.push([b.lat, b.lon]);
        }
        first = false;
      };
      for (let i = 0; i < stops.length - 1; i += 1) {
        const a = { lat: stops[i].lat, lon: stops[i].lon };
        const b = { lat: stops[i + 1].lat, lon: stops[i + 1].lon };
        const via = corridorWaypoints(a, b, suez);
        const chain = [a, ...via, b];
        for (let j = 0; j < chain.length - 1; j += 1) {
          await pushLeg(chain[j], chain[j + 1]);
        }
      }
      if (!cancelled) setSeaRoute(path);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, canalKey]);

  const routeLine = seaRoute
    ? unwrapRouteCoordinates(seaRoute.map((point) => {
        const [lat, lon] = point as [number, number];
        return [lat, lon];
      }))
    : unwrapRouteCoordinates(positions.map((point) => {
        const [lat, lon] = point as [number, number];
        return [lat, lon];
      }));

  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    if (stops.length === 0) return null;
    return getAntimeridianAwareBounds(stops.map((s) => [s.lat, s.lon]), 4);
  }, [stops]);

  const mapRef = useRef<L.Map | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (world.length === 0) {
    return <div className="fv-ce__map-empty">Loading map…</div>;
  }
  if (stops.length === 0) {
    return (
      <div className="fv-ce__map-empty">
        Enter recognisable port names in Port Rotation to plot the route.
      </div>
    );
  }

  return (
    <div className="fv-ce__map" ref={wrapRef}>
      <MapContainer
        ref={(instance) => {
          mapRef.current = instance;
        }}
        {...(bounds ? { bounds } : { center: [20, 60] as LatLngExpression, zoom: 3 })}
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
          crossOrigin="anonymous"
        />
        {routeLine.length >= 2 && (
          <Polyline positions={routeLine} pathOptions={{ color: '#58a6ff', weight: 3, opacity: 0.9 }} />
        )}
        {stops.map((s, i) => (
          <Marker
            key={`${s.name}-${i}`}
            position={[s.lat, s.lon]}
            icon={L.divIcon({
              className: 'fv-ce__map-pin-wrap',
              iconSize: [20, 20],
              iconAnchor: [10, 10],
              html: `<span class="fv-ce__map-pin">${i + 1}</span>`,
            })}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              {s.type}: {s.name}{s.country ? `, ${s.country}` : ''}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
