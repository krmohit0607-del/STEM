import { Fragment } from 'react';
import { Polyline, Marker } from 'react-leaflet';
import L from 'leaflet';
import type { PathOptions } from 'leaflet';

import {
  LOAD_LINE_ZONES,
  type LoadLineZone,
  segmentToLineString,
  toLeafletCoords,
} from '../data/loadLineZones';

/**
 * Renders Load Line Zones (ILLC 1966 / Annex II) as boundary lines on the map.
 * Coordinates are stored in GeoJSON [lon, lat] format and converted to Leaflet [lat, lon] format.
 *
 * Color encodes the zone type:
 *   - PERMANENT        orange
 *   - WINTER           blue
 *   - WINTER_SEASONAL  light blue
 *   - SEASONAL_TROPICAL orange variants
 *   - SMALL_SHIP_WINTER purple
 */

function LoadLineZoneLabel({ zone }: { zone: LoadLineZone }) {
  const seasonText = zone.season ? zone.season.label : '';

  // Create a custom div icon for the text label
  const icon = L.divIcon({
    className: 'fv-llz-label',
    html: `
      <div style="text-align: center;">
        <div class="fv-llz-label__name">${zone.name}</div>
        ${seasonText ? `<div class="fv-llz-label__season">${seasonText}</div>` : ''}
      </div>
    `,
    iconSize: [140, 60],
    iconAnchor: [70, 30],
  });

  // Convert GeoJSON [lon, lat] to Leaflet [lat, lon]
  const leafletPos = toLeafletCoords(zone.labelPosition);

  return (
    <Marker position={leafletPos} icon={icon} interactive={false} keyboard={false} />
  );
}

export interface LoadLineZonesLayerProps {
  zones?: LoadLineZone[];
  selectedId?: string;
  onZoneClick?: (id: string) => void;
}

export function LoadLineZonesLayer({
  zones = LOAD_LINE_ZONES,
  selectedId,
  onZoneClick,
}: LoadLineZonesLayerProps = {}) {
  return (
    <>
      {zones.map((zone) => {
        const selected = zone.id === selectedId;
        const pathOptions: PathOptions = {
          color: zone.color,
          weight: selected ? 4 : 2,
          opacity: selected ? 1 : 0.8,
          lineCap: 'round',
          lineJoin: 'round',
        };
        const hoverOptions: PathOptions = { weight: 3, opacity: 1 };

        return (
          <Fragment key={zone.id}>
            {zone.segments.map((segment, si) => {
              // Convert segment to line string
              const lineString = segmentToLineString(segment);
              // Convert GeoJSON [lon, lat] to Leaflet [lat, lon]
              const leafletCoords = lineString.map(toLeafletCoords);

              return (
                <Polyline
                  key={`${zone.id}-${si}`}
                  positions={leafletCoords}
                  pathOptions={pathOptions}
                  eventHandlers={{
                    mouseover: (e) => e.target.setStyle(hoverOptions),
                    mouseout: (e) => e.target.setStyle(pathOptions),
                    click: () => onZoneClick?.(zone.id),
                  }}
                />
              );
            })}
            <LoadLineZoneLabel zone={zone} />
          </Fragment>
        );
      })}
    </>
  );
}
