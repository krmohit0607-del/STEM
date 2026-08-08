import { Fragment } from 'react';
import { Polygon, Tooltip } from 'react-leaflet';
import type { PathOptions } from 'leaflet';

import { AREA_CONSTRAINTS, type AreaConstraint } from '../data/areaConstraints';

/**
 * Renders the imported area constraints (SOFAR Wayfinder export) as polygons
 * on the map. Each constraint may have several rings (multi-part geometry);
 * every ring is drawn and shares the same hover tooltip describing the zone.
 *
 * Colour encodes the zone type:
 *   - limited-passage-zone   amber
 *   - no-go-zone             red
 *   - speed-control-zone     blue
 *   - eca-zone               green
 */

const MS_TO_KN = 1.94384;

/** Adjust ring longitudes so no consecutive pair differs by more than 180° — fixes antimeridian rendering. */
export function normalizeRingLonLat(ring: [number, number][]): [number, number][] {
  if (ring.length === 0) return ring;
  const out: [number, number][] = [[ring[0][0], ring[0][1]]];
  for (let i = 1; i < ring.length; i++) {
    let lon = ring[i][1];
    const prevLon = out[i - 1][1];
    while (lon - prevLon > 180) lon -= 360;
    while (lon - prevLon < -180) lon += 360;
    out.push([ring[i][0], lon]);
  }
  return out;
}

export interface ZoneStyle {
  label: string;
  color: string;
}

export const ZONE_STYLES: Record<string, ZoneStyle> = {
  'limited-passage-zone': { label: 'Limited passage', color: '#e0a106' },
  'no-go-zone': { label: 'No-go', color: '#cf222e' },
  'speed-control-zone': { label: 'Speed control', color: '#1f6feb' },
  'eca-zone': { label: 'ECA', color: '#1a7f37' },
};

const DEFAULT_STYLE: ZoneStyle = { label: 'Constraint', color: '#8957e5' };

export function getZoneStyle(zoneType: string): ZoneStyle {
  return ZONE_STYLES[zoneType] ?? DEFAULT_STYLE;
}

export function speedKnots(ms: string): string {
  const n = Number(ms);
  if (!Number.isFinite(n) || !ms) return '';
  return `${(n * MS_TO_KN).toFixed(1)} kn`;
}

function ConstraintTooltip({ c }: { c: AreaConstraint }) {
  const z = getZoneStyle(c.zoneType);
  const speedMinKn = speedKnots(c.speedMin);
  const speedMaxKn = speedKnots(c.speedMax);
  const hasSpeed = !!(c.speedMin || c.speedMax);
  const hasRpm = !!(c.rpmMin || c.rpmMax);
  return (
    <Tooltip sticky className="fv-area-tip" direction="top" opacity={1}>
      <div className="fv-area-tip__title">{c.name}</div>
      <table className="fv-area-tip__table">
        <tbody>
          <tr>
            <th>Zone type</th>
            <td>
              <span
                className="fv-area-tip__swatch"
                style={{ background: z.color }}
              />
              {z.label}
            </td>
          </tr>
          {c.geomType && c.geomType !== 'none' && (
            <tr>
              <th>Geometry</th>
              <td>{c.geomType}</td>
            </tr>
          )}
          {hasSpeed && (
            <tr>
              <th>Speed limit</th>
              <td>
                {c.speedMin && `${c.speedMin} m/s`}
                {c.speedMin && c.speedMax ? ' – ' : ''}
                {c.speedMax && `${c.speedMax} m/s`}
                {(speedMinKn || speedMaxKn) &&
                  ` (${[speedMinKn, speedMaxKn].filter(Boolean).join(' – ')})`}
              </td>
            </tr>
          )}
          {hasRpm && (
            <tr>
              <th>RPM limit</th>
              <td>
                {c.rpmMin}
                {c.rpmMin && c.rpmMax ? ' – ' : ''}
                {c.rpmMax}
              </td>
            </tr>
          )}
          {!hasSpeed && !hasRpm && (
            <tr>
              <th>Limits</th>
              <td>None specified</td>
            </tr>
          )}
        </tbody>
      </table>
    </Tooltip>
  );
}

export function AreaConstraintsLayer({
  constraints = AREA_CONSTRAINTS,
  selectedId,
  onConstraintClick,
}: {
  constraints?: AreaConstraint[];
  selectedId?: string;
  onConstraintClick?: (id: string) => void;
} = {}) {
  return (
    <>
      {constraints.map((c) => {
        const z = getZoneStyle(c.zoneType);
        const selected = c.id === selectedId;
        const pathOptions: PathOptions = {
          color: z.color,
          weight: selected ? 3 : 1,
          fillColor: z.color,
          fillOpacity: selected ? 0.4 : 0.18,
          opacity: selected ? 1 : 0.85,
        };
        const hoverOptions: PathOptions = { fillOpacity: 0.35, weight: 2 };
        return (
          <Fragment key={c.id}>
            {c.rings.map((ring, ri) => (
              <Polygon
                key={`${c.id}-${ri}`}
                positions={normalizeRingLonLat(ring)}
                pathOptions={pathOptions}
                eventHandlers={{
                  mouseover: (e) => e.target.setStyle(hoverOptions),
                  mouseout: (e) => e.target.setStyle(pathOptions),
                  click: () => onConstraintClick?.(c.id),
                }}
              >
                <ConstraintTooltip c={c} />
              </Polygon>
            ))}
          </Fragment>
        );
      })}
    </>
  );
}
