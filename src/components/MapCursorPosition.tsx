import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap, useMapEvents } from 'react-leaflet';
import L, { type ControlPosition } from 'leaflet';

/**
 * Live cursor coordinate readout for any map. Drop it as a child of a
 * `<MapContainer>`:
 *
 *   <MapContainer ...>
 *     <MapCursorPosition />
 *   </MapContainer>
 *
 * As the pointer moves over the map it shows the latitude/longitude of the
 * point under the cursor in the map's corner (top-left by default).
 */

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
      const div = L.DomUtil.create('div', 'fv-cursorpos');
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      setContainer(div);
      return div;
    };
    ctrl.addTo(map);
    // Move the readout to the top of the corner so it sits above the
    // built-in zoom (+/-) control rather than below it.
    const el = ctrl.getContainer();
    el?.parentElement?.prepend(el);
    return () => {
      ctrl.remove();
    };
  }, [map, position]);

  return container ? createPortal(children, container) : null;
}

/** `12° 34.56' N` style degrees-and-decimal-minutes coordinate. */
function formatCoord(value: number, isLat: boolean): string {
  const hemi = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = (abs - deg) * 60;
  // Guard against rounding 59.995' up to 60.00'.
  if (min >= 59.995) {
    min = 0;
    deg += 1;
  }
  return `${deg}° ${min.toFixed(2).padStart(5, '0')}' ${hemi}`;
}

export function MapCursorPosition({
  position = 'topleft',
}: {
  position?: ControlPosition;
} = {}) {
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);

  useMapEvents({
    mousemove(e) {
      const wrapped = e.latlng.wrap();
      setCoord({
        lat: Math.max(-90, Math.min(90, wrapped.lat)),
        lng: wrapped.lng,
      });
    },
    mouseout() {
      setCoord(null);
    },
  });

  return (
    <ControlPortal position={position}>
      <div
        className={`fv-cursorpos__box${coord ? '' : ' fv-cursorpos__box--empty'}`}
        aria-hidden="true"
      >
        <i className="fas fa-location-crosshairs" />
        <span>
          {coord
            ? `${formatCoord(coord.lat, true)}, ${formatCoord(coord.lng, false)}`
            : '—'}
        </span>
      </div>
    </ControlPortal>
  );
}
