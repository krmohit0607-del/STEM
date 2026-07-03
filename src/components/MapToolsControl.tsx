import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CircleMarker,
  Marker,
  Polyline,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L, { type ControlPosition } from 'leaflet';

import { useWorldPorts } from '../data/ports';

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
      const div = L.DomUtil.create('div', 'fv-wp-control');
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

/** Mean Earth radius in nautical miles. */
const R_NM = 3440.065;

/** Great-circle distance between two points, in nautical miles. */
function haversineNm(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** `01.29° N` style compact coordinate. */
function formatCoord(value: number, isLat: boolean): string {
  const hemi = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return `${Math.abs(value).toFixed(2)}° ${hemi}`;
}

/** Small draggable dot used for ruler vertices. */
function rulerDotIcon(): L.DivIcon {
  return L.divIcon({
    className: 'fv-ruler-dot',
    html: '<span></span>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

/**
 * Ports control — a toggle button that overlays every world port that
 * currently falls within the map viewport. Only visible ports are drawn
 * (and capped) so the ~3k-port list never bogs the map down.
 */
export function PortsControl({
  position = 'topright',
}: {
  position?: ControlPosition;
} = {}) {
  const [active, setActive] = useState(false);
  const ports = useWorldPorts();
  const map = useMap();
  const [bounds, setBounds] = useState(() => map.getBounds());

  useMapEvents({
    moveend: () => setBounds(map.getBounds()),
    zoomend: () => setBounds(map.getBounds()),
  });

  // Only render the ports currently in view, capped for performance.
  const MAX_MARKERS = 600;
  const visible = active
    ? ports
        .filter((p) => bounds.contains([p.lat, p.lon]))
        .slice(0, MAX_MARKERS)
    : [];

  return (
    <>
      <ControlPortal position={position}>
        <button
          type="button"
          className={`fv-wp-control__btn${active ? ' fv-wp-control__btn--on' : ''}`}
          title="Show ports"
          aria-label="Show ports"
          aria-pressed={active}
          onClick={() => setActive((a) => !a)}
        >
          <i className="fas fa-anchor" aria-hidden="true" />
        </button>
      </ControlPortal>

      {visible.map((p) => (
        <CircleMarker
          key={p.code}
          center={[p.lat, p.lon]}
          radius={4}
          pathOptions={{
            color: '#0b1220',
            weight: 1,
            fillColor: '#f0b429',
            fillOpacity: 0.95,
          }}
        >
          <Tooltip direction="top" offset={[0, -4]}>
            <div className="fv-route-map__tip">
              <strong className="fv-route-map__tip-title">{p.name}</strong>
              <span>{p.country}</span>
              <span>
                <i className="fas fa-location-crosshairs" aria-hidden="true" />{' '}
                {formatCoord(p.lat, true)}, {formatCoord(p.lon, false)}
              </span>
              <span>{p.code}</span>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

/**
 * Ruler control — a toggle button that lets the user drop points on the
 * map and measures the running / total great-circle distance between them.
 */
export function RulerControl({
  position = 'topright',
}: {
  position?: ControlPosition;
} = {}) {
  const [active, setActive] = useState(false);
  const [points, setPoints] = useState<[number, number][]>([]);
  const map = useMap();

  useMapEvents({
    click(e) {
      if (!active) return;
      setPoints((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
    },
  });

  // Crosshair cursor while measuring.
  useEffect(() => {
    const el = map.getContainer();
    if (active) el.style.cursor = 'crosshair';
    return () => {
      el.style.cursor = '';
    };
  }, [map, active]);

  // Distance from the previous vertex, and cumulative distance from the
  // first vertex, for every point (NM).
  const segment: number[] = [];
  const cumulative: number[] = [];
  let running = 0;
  points.forEach((pt, i) => {
    const seg = i > 0 ? haversineNm(points[i - 1], pt) : 0;
    running += seg;
    segment.push(seg);
    cumulative.push(running);
  });
  const total = running;

  return (
    <>
      <ControlPortal position={position}>
        <button
          type="button"
          className={`fv-wp-control__btn${active ? ' fv-wp-control__btn--on' : ''}`}
          title="Measure distance"
          aria-label="Measure distance"
          aria-pressed={active}
          onClick={() =>
            setActive((a) => {
              // Turning the ruler off clears any measurement drawn so far.
              if (a) setPoints([]);
              return !a;
            })
          }
        >
          <i className="fas fa-ruler" aria-hidden="true" />
        </button>
        {active && (
          <div className="fv-wp-control__readout">
            <span>
              {points.length < 2
                ? 'Click the map to add points'
                : `${total.toLocaleString(undefined, { maximumFractionDigits: 1 })} NM`}
            </span>
            {points.length > 0 && (
              <button
                type="button"
                className="fv-wp-control__readout-clear"
                title="Clear measurement"
                aria-label="Clear measurement"
                onClick={() => setPoints([])}
              >
                <i className="fas fa-trash" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </ControlPortal>

      {points.length > 1 && (
        <Polyline
          positions={points}
          pathOptions={{ color: '#39c5cf', weight: 2, dashArray: '6 4' }}
        />
      )}
      {points.map((pt, i) => (
        <Marker
          key={i}
          position={pt}
          icon={rulerDotIcon()}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              setPoints((prev) =>
                prev.map((p, idx) => (idx === i ? [ll.lat, ll.lng] : p)),
              );
            },
            click: () => {
              setPoints((prev) => prev.filter((_, idx) => idx !== i));
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -8]} permanent>
            <div className="fv-route-map__tip">
              {i === 0 ? (
                <span>
                  <i className="fas fa-flag-checkered" aria-hidden="true" /> Start
                </span>
              ) : (
                <>
                  <span>
                    <i className="fas fa-ruler-horizontal" aria-hidden="true" />{' '}
                    {segment[i].toLocaleString(undefined, { maximumFractionDigits: 1 })} NM from prev
                  </span>
                  <span>
                    <i className="fas fa-flag-checkered" aria-hidden="true" />{' '}
                    {cumulative[i].toLocaleString(undefined, { maximumFractionDigits: 1 })} NM from start
                  </span>
                </>
              )}
            </div>
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}
