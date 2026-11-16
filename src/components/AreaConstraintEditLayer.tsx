import { Fragment, useMemo } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';

import type { AreaConstraint } from '../data/areaConstraints';
import { normalizeCoordinate, offsetPoint, unwrapRouteCoordinates, worldCopyOffsets } from '../data/antimeridian';

/**
 * Interactive on-map editing handles for the selected area constraint.
 *
 * For every ring of the selected constraint it draws:
 *   - a draggable vertex handle at each point — drag to move it (the
 *     coordinate list updates live), click to remove it;
 *   - a smaller "midpoint" handle on each edge — click to insert a new
 *     vertex there.
 *
 * The handlers call back into the page's existing ring mutators so the
 * map and the coordinate editor stay in sync. Used for both the bundled
 * (admin) constraints and the per-voyage constraints.
 */

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

function vertexIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'fv-area-vertex',
    html: `<span style="background:${color}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function midIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'fv-area-midpoint',
    html: `<span style="border-color:${color}"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

interface Props {
  constraint: AreaConstraint;
  color: string;
  onMove: (ri: number, pi: number, coord: [number, number]) => void;
  onRemove: (ri: number, pi: number) => void;
  onInsert: (ri: number, pi: number, coord: [number, number]) => void;
}

export function AreaConstraintEditLayer({
  constraint,
  color,
  onMove,
  onRemove,
  onInsert,
}: Props) {
  const vIcon = useMemo(() => vertexIcon(color), [color]);
  const mIcon = useMemo(() => midIcon(color), [color]);

  return (
    <>
      {constraint.rings.map((ring, ri) => {
        // Keep a valid polygon — only allow removing vertices while more
        // than a triangle remains.
        const canRemove = ring.length > 3;
        // Handles are drawn at every nearby world copy (not just the
        // canonical one) so a constraint near the dateline keeps its edit
        // handles visible after the user pans into an adjacent world copy
        // (only the canonical, offset-0 copy is actually interactive).
        const offsets = worldCopyOffsets(ring);
        return (
          <Fragment key={ri}>
            {offsets.map((offset) => (
              <Fragment key={`copy-${offset}`}>
                {/* Midpoint handles (drawn first so vertices sit on top). */}
                {ring.map((pt, pi) => {
                  const next = ring[(pi + 1) % ring.length];
                  const unwrapped = unwrapRouteCoordinates([pt, next]);
                  const nextLon = unwrapped[1][1];
                  const mid: [number, number] = [
                    round5((pt[0] + next[0]) / 2),
                    normalizeCoordinate([0, round5((pt[1] + nextLon) / 2)])[1],
                  ];
                  return (
                    <Marker
                      key={`m-${ri}-${pi}-${offset}`}
                      position={offsetPoint(mid, offset)}
                      icon={mIcon}
                      keyboard={false}
                      interactive={offset === 0}
                      eventHandlers={
                        offset === 0
                          ? { click: () => onInsert(ri, pi, normalizeCoordinate(mid)) }
                          : undefined
                      }
                    />
                  );
                })}

                {/* Draggable vertex handles (only the canonical copy is draggable). */}
                {ring.map((pt, pi) => (
                  <Marker
                    key={`v-${ri}-${pi}-${offset}`}
                    position={offsetPoint(pt, offset)}
                    icon={vIcon}
                    draggable={offset === 0}
                    keyboard={false}
                    interactive={offset === 0}
                    eventHandlers={
                      offset === 0
                        ? {
                            drag: (e) => {
                              const ll = (e.target as L.Marker).getLatLng();
                              onMove(ri, pi, normalizeCoordinate([round5(ll.lat), round5(ll.lng)]));
                            },
                            click: () => {
                              if (canRemove) onRemove(ri, pi);
                            },
                          }
                        : undefined
                    }
                  />
                ))}
              </Fragment>
            ))}
          </Fragment>
        );
      })}
    </>
  );
}
