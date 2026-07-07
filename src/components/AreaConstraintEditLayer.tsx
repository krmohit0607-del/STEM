import { Fragment, useMemo } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';

import type { AreaConstraint } from '../data/areaConstraints';

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
        return (
          <Fragment key={ri}>
            {/* Midpoint handles (drawn first so vertices sit on top). */}
            {ring.map((pt, pi) => {
              const next = ring[(pi + 1) % ring.length];
              const mid: [number, number] = [
                round5((pt[0] + next[0]) / 2),
                round5((pt[1] + next[1]) / 2),
              ];
              return (
                <Marker
                  key={`m-${ri}-${pi}`}
                  position={mid}
                  icon={mIcon}
                  keyboard={false}
                  eventHandlers={{
                    click: () => onInsert(ri, pi, mid),
                  }}
                />
              );
            })}

            {/* Draggable vertex handles. */}
            {ring.map((pt, pi) => (
              <Marker
                key={`v-${ri}-${pi}`}
                position={pt}
                icon={vIcon}
                draggable
                keyboard={false}
                eventHandlers={{
                  drag: (e) => {
                    const ll = (e.target as L.Marker).getLatLng();
                    onMove(ri, pi, [round5(ll.lat), round5(ll.lng)]);
                  },
                  click: () => {
                    if (canRemove) onRemove(ri, pi);
                  },
                }}
              />
            ))}
          </Fragment>
        );
      })}
    </>
  );
}
