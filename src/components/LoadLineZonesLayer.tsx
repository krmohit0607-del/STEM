import { Fragment, useState } from 'react';
import { Polyline, Polygon, Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { PathOptions } from 'leaflet';

import {
  LOAD_LINE_ZONES,
  closedZoneRing,
  getLoadLineZoneStyle,
  type LoadLineZone,
  segmentToLineString,
  toLeafletCoords,
} from '../data/loadLineZones';

/**
 * Renders Load Line Zones (ILLC 1966 / Annex II) on the map.
 *
 * Zones whose boundary is a clean closed rectangle (`closed: true` — e.g. Mediterranean/Black
 * Sea/Bay of Bengal winter & seasonal-tropical boxes) render as a soft filled area, so they read
 * as an intentional shaded zone rather than a bare outline. Every other zone's boundary is open
 * by design (it's meant to join the coastline / an adjoining zone) and renders as a thin dashed
 * guide line instead of a solid box-like outline.
 *
 * Color encodes the zone type:
 *   - PERMANENT        orange
 *   - WINTER           blue
 *   - WINTER_SEASONAL  light blue
 *   - SEASONAL_TROPICAL orange variants
 *   - SMALL_SHIP_WINTER purple
 */

/** Only show the name/season chips once zoomed in past a world-view overview — avoids 20+
 *  labels overlapping when every zone is visible at once. */
const LABEL_MIN_ZOOM = 3;

/** All zone boundary lines render in this one colour (dotted) instead of per-zone colours —
 *  the fill (for closed zones) and the chip/tooltip swatch still use each zone's own colour. */
const LLZ_LINE_COLOR = '#2196F3';

/** Season/date text shown for a zone — permanent zones have no `season`, so say so explicitly. */
function zoneSeasonText(zone: LoadLineZone): string {
  if (zone.season) return zone.season.label;
  return 'Permanent — year-round';
}

function LoadLineZoneLabel({ zone }: { zone: LoadLineZone }) {
  const seasonText = zoneSeasonText(zone);

  // Plain two-line label — name, then dates underneath — neutral styling (no per-zone colour/
  // icon/dot) so it reads as a simple map label rather than a busy coloured badge.
  const icon = L.divIcon({
    className: 'fv-llz-chip-wrap',
    html: `
      <div class="fv-llz-chip">
        <span class="fv-llz-chip__name">${zone.name}</span>
        <span class="fv-llz-chip__season">${seasonText}</span>
      </div>
    `,
    iconSize: [160, 28],
    iconAnchor: [80, 14],
  });

  // Convert GeoJSON [lon, lat] to Leaflet [lat, lon]
  const leafletPos = toLeafletCoords(zone.labelPosition);

  return (
    <Marker position={leafletPos} icon={icon} interactive={false} keyboard={false} />
  );
}

function ZoneTooltip({ zone }: { zone: LoadLineZone }) {
  const typeInfo = getLoadLineZoneStyle(zone.type);
  return (
    <Tooltip className="fv-llz-tip" sticky direction="top">
      <div className="fv-llz-tip__title">
        <span className="fv-llz-tip__swatch" style={{ background: zone.color }} />
        {zone.name}
      </div>
      <div className="fv-llz-tip__dates">
        <i className="fas fa-calendar-days" aria-hidden="true" />
        {zoneSeasonText(zone)}
      </div>
      <table className="fv-llz-tip__table">
        <tbody>
          <tr><th>Type</th><td>{typeInfo.label}{zone.vesselSize ? ` (${zone.vesselSize})` : ''}</td></tr>
        </tbody>
      </table>
    </Tooltip>
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
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: (e) => setZoom(e.target.getZoom()) });
  const showLabels = zoom >= LABEL_MIN_ZOOM;

  return (
    <>
      {zones.map((zone) => {
        const selected = zone.id === selectedId;
        const ring = zone.closed ? closedZoneRing(zone) : null;

        if (ring) {
          const pathOptions: PathOptions = {
            color: LLZ_LINE_COLOR,
            weight: selected ? 3 : 1.5,
            opacity: selected ? 1 : 0.85,
            dashArray: '4 5',
            fillColor: zone.color,
            fillOpacity: selected ? 0.22 : 0.12,
          };
          const hoverOptions: PathOptions = { ...pathOptions, weight: 2.5, fillOpacity: 0.2 };
          return (
            <Fragment key={zone.id}>
              <Polygon
                positions={ring}
                pathOptions={pathOptions}
                eventHandlers={{
                  mouseover: (e) => e.target.setStyle(hoverOptions),
                  mouseout: (e) => e.target.setStyle(pathOptions),
                  click: () => onZoneClick?.(zone.id),
                }}
              >
                <ZoneTooltip zone={zone} />
              </Polygon>
              {showLabels && <LoadLineZoneLabel zone={zone} />}
            </Fragment>
          );
        }

        const pathOptions: PathOptions = {
          color: LLZ_LINE_COLOR,
          weight: selected ? 3 : 1.5,
          opacity: selected ? 1 : 0.75,
          dashArray: selected ? '2 4' : '7 6',
          lineCap: 'round',
          lineJoin: 'round',
        };
        const hoverOptions: PathOptions = { ...pathOptions, weight: 2.5, opacity: 1 };
        // Coastline-following edges are a straight-line stand-in (no real coastline data wired up
        // here) — shown lighter/dotted so the approximation reads as such, not as a precise boundary.
        const coastPathOptions: PathOptions = { ...pathOptions, opacity: 0.45, dashArray: '1 6', weight: 1 };
        const coastHoverOptions: PathOptions = { ...coastPathOptions, opacity: 0.8 };

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
            {normSegments.map((leafletCoords, si) => {
              const isCoastline = zone.segments[si]?.type === 'COASTLINE';
              const segPathOptions = isCoastline ? coastPathOptions : pathOptions;
              const segHoverOptions = isCoastline ? coastHoverOptions : hoverOptions;
              return (
                <Polyline
                  key={`${zone.id}-${si}`}
                  positions={leafletCoords}
                  pathOptions={segPathOptions}
                  eventHandlers={{
                    mouseover: (e) => e.target.setStyle(segHoverOptions),
                    mouseout: (e) => e.target.setStyle(segPathOptions),
                    click: () => onZoneClick?.(zone.id),
                  }}
                >
                  <ZoneTooltip zone={zone} />
                </Polyline>
              );
            })}
            {showLabels && <LoadLineZoneLabel zone={zone} />}
          </Fragment>
        );
      })}
    </>
  );
}

