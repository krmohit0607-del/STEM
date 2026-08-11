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

/**
 * Split a ring at the antimeridian so Leaflet's SVG fill never wraps across
 * the globe. Returns one ring when no crossing exists, or two rings (one on
 * each side of ±180°) when the ring straddles the antimeridian.
 */
export function splitRingAtAntimeridian(ring: [number, number][]): [number, number][][] {
  const norm = normalizeRingLonLat(ring);
  const lons = norm.map(([, lon]) => lon);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  // If the ring fits within any 360° window that doesn't straddle 180°, use as-is.
  if (maxLon - minLon <= 180) return [norm];

  // Find the split meridian: use 180 when any vertex has lon > 180,
  // use -180 when any vertex has lon < -180.
  const splitAt = lons.some((l) => l > 180) ? 180 : -180;

  const sideA: [number, number][] = [];
  const sideB: [number, number][] = [];

  for (let i = 0; i < norm.length; i++) {
    const curr = norm[i];
    const next = norm[(i + 1) % norm.length];
    const currLon = curr[1];
    const nextLon = next[1];

    // Assign current vertex to the appropriate side.
    (currLon <= splitAt ? sideA : sideB).push(curr);

    // If this edge crosses the split meridian, insert an interpolated vertex on both sides.
    const crossesForward = currLon <= splitAt && nextLon > splitAt;
    const crossesBack = currLon > splitAt && nextLon <= splitAt;
    if (crossesForward || crossesBack) {
      const t = (splitAt - currLon) / (nextLon - currLon);
      const crossLat = curr[0] + t * (next[0] - curr[0]);
      sideA.push([crossLat, splitAt]);
      sideB.push([crossLat, splitAt]);
    }
  }

  // Normalise the "other-side" vertices back into [-180, 180].
  const normaliseBack = (pts: [number, number][]): [number, number][] =>
    pts.map(([lat, lon]) => [lat, lon > 180 ? lon - 360 : lon < -180 ? lon + 360 : lon]);

  const results: [number, number][][] = [];
  if (sideA.length >= 3) results.push(sideA);
  const adjB = normaliseBack(sideB);
  if (adjB.length >= 3) results.push(adjB);
  return results.length > 0 ? results : [norm];
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
            {c.rings.map((ring, ri) => {
              const subRings = splitRingAtAntimeridian(ring);
              return subRings.map((positions, si) => (
                <Polygon
                  key={`${c.id}-${ri}-${si}`}
                  positions={positions}
                  pathOptions={pathOptions}
                  eventHandlers={{
                    mouseover: (e) => e.target.setStyle(hoverOptions),
                    mouseout: (e) => e.target.setStyle(pathOptions),
                    click: () => onConstraintClick?.(c.id),
                  }}
                >
                  {si === 0 && <ConstraintTooltip c={c} />}
                </Polygon>
              ));
            })}
          </Fragment>
        );
      })}
    </>
  );
}
