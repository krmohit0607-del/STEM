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

        // Build all segments for this zone then normalise consecutive endpoint
        // longitudes — prevents segments that cross the antimeridian from
        // rendering on different world copies of the Leaflet canvas.
        const rawSegments = zone.segments.map((seg) => segmentToLineString(seg).map(toLeafletCoords));
        let refLon: number | null = null;
        const normSegments = rawSegments.map((pts) => {
          if (pts.length === 0) return pts;
          if (refLon === null) {
            refLon = pts[pts.length - 1][1];
            return pts;
          }
          // Shortest-path delta from the last segment's end to this segment's start.
          let delta = pts[0][1] - refLon;
          while (delta > 180) delta -= 360;
          while (delta < -180) delta += 360;
          const offset = refLon + delta - pts[0][1];
          const shifted = pts.map(([lat, lon]) => [lat, lon + offset] as [number, number]);
          refLon = shifted[shifted.length - 1][1];
          return shifted;
        });

        return (
          <Fragment key={zone.id}>
            {normSegments.map((leafletCoords, si) => (
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
            ))}
            <LoadLineZoneLabel zone={zone} />
          </Fragment>
        );
      })}
    </>
  );
}
