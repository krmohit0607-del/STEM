import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import L, { type ControlPosition } from 'leaflet';

import { getFieldFactor } from '../data/weatherField';
import { useMapBaseLayerId, useNauticalOpacity } from './MapLayersControl';
import { useWeatherFieldSelection } from '../data/weatherFieldSelection';

/**
 * The nautical-chart-opacity slider + weather colour-code legend, as a bare
 * row of pills with no map/portal dependency — so a page that already has
 * its own top-of-map toolbar (e.g. Route Explorer's Optimize / View on MT
 * row) can place it inline, in the same row, instead of getting it as a
 * separate floating Leaflet control. Pages without such a toolbar should
 * use `<MapWeatherLegendControl>` below instead.
 *
 * Shows:
 *   - the nautical chart opacity slider, whenever the Nautical Chart base
 *     layer is active (previously tucked away inside the Map Layers
 *     dropdown); and
 *   - a colour-code legend for whichever weather factor is currently
 *     selected in the Weather layers control (wave height, wind, current,
 *     swell, …) — it always follows that selection instead of being fixed
 *     to one factor.
 *
 * Renders nothing when neither applies (a non-nautical base layer with the
 * weather field off), so it never shows an empty bar.
 */
export function MapWeatherLegendBar() {
  const baseLayerId = useMapBaseLayerId();
  const [nauticalOpacity, setNauticalOpacity] = useNauticalOpacity();
  const { on: weatherOn, factorIds } = useWeatherFieldSelection();

  const showOpacity = baseLayerId === 'nautical';
  const primary = weatherOn && factorIds.length > 0 ? getFieldFactor(factorIds[0]) : undefined;

  if (!showOpacity && !primary) return null;

  return (
    <div className="fv-wl-control__bar">
      {showOpacity && (
        <div className="fv-wl-control__opacity">
          <i className="fas fa-anchor" aria-hidden="true" />
          <span className="fv-wl-control__opacity-label">Chart opacity</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={nauticalOpacity}
            onChange={(event) => setNauticalOpacity(Number(event.target.value))}
            aria-label="Nautical chart opacity"
          />
          <span className="fv-wl-control__opacity-value">{Math.round(nauticalOpacity * 100)}%</span>
        </div>
      )}
      {primary && (
        <div className="fv-wl-control__legend" role="img" aria-label={`${primary.label} colour code`}>
          <span className="fv-wl-control__legend-label">{primary.label}</span>
          <span className="fv-wl-control__legend-unit">{primary.unit}</span>
          <span
            className="fv-wl-control__legend-gradient"
            style={{
              background: `linear-gradient(90deg, ${primary.stops
                .map(([frac, hex]) => `${hex} ${frac * 100}%`)
                .join(', ')})`,
            }}
          >
            {primary.stops.map(([frac]) => (
              <span key={frac} className="fv-wl-control__legend-tick" style={{ left: `${frac * 100}%` }}>
                {Math.round(frac * primary.max * 10) / 10}
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

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
      const div = L.DomUtil.create('div', 'fv-wl-control');
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

/**
 * `<MapWeatherLegendBar>` as a floating Leaflet corner control — use this on
 * any map page that doesn't already have its own top toolbar to place the
 * bar inline into. Drop it as a child of any `<MapContainer>`, alongside
 * `<MapLayersControl>` and `<WeatherFieldControl>`:
 *
 *   <MapContainer ...>
 *     <MapLayersControl position="topright" />
 *     <WeatherFieldControl position="topright" />
 *     <MapWeatherLegendControl position="topleft" />
 *   </MapContainer>
 */
export function MapWeatherLegendControl({
  position = 'topleft',
}: {
  position?: ControlPosition;
} = {}) {
  return (
    <ControlPortal position={position}>
      <MapWeatherLegendBar />
    </ControlPortal>
  );
}

