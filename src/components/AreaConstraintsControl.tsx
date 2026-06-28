import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import L, { type ControlPosition } from 'leaflet';

import { AreaConstraintsLayer, ZONE_STYLES } from './AreaConstraintsLayer';
import { AREA_CONSTRAINTS } from '../data/areaConstraints';

/**
 * Drop-in map control that lets the user show area constraints on ANY map and
 * choose which zone types to display. Place it as a child of a `<MapContainer>`:
 *
 *   <MapContainer ...>
 *     ...
 *     <AreaConstraintsControl />
 *   </MapContainer>
 *
 * Visibility and the selected zone types are shared across every map via
 * `localStorage`, so a choice made on one map is remembered on the others.
 */

const VISIBLE_KEY = 'fv.map.areaConstraints.on';
const TYPES_KEY = 'fv.map.areaConstraints.types';

const ALL_TYPES = Object.keys(ZONE_STYLES);

function readVisible(): boolean {
  try {
    return localStorage.getItem(VISIBLE_KEY) === '1';
  } catch {
    return false;
  }
}

function readTypes(): Set<string> {
  try {
    const raw = localStorage.getItem(TYPES_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return new Set(ALL_TYPES);
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
      const div = L.DomUtil.create('div', 'fv-ac-control');
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

export function AreaConstraintsControl({
  position = 'topleft',
}: {
  position?: ControlPosition;
} = {}) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState<boolean>(() => readVisible());
  const [types, setTypes] = useState<Set<string>>(() => readTypes());

  useEffect(() => {
    try {
      localStorage.setItem(VISIBLE_KEY, visible ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [visible]);

  useEffect(() => {
    try {
      localStorage.setItem(TYPES_KEY, JSON.stringify([...types]));
    } catch {
      /* ignore */
    }
  }, [types]);

  const shown = useMemo(() => {
    if (!visible) return [];
    return AREA_CONSTRAINTS.filter((c) => types.has(c.zoneType));
  }, [visible, types]);

  const toggleType = (zt: string) => {
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(zt)) next.delete(zt);
      else next.add(zt);
      return next;
    });
  };

  const zoneCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of AREA_CONSTRAINTS) {
      counts.set(c.zoneType, (counts.get(c.zoneType) ?? 0) + 1);
    }
    return counts;
  }, []);

  return (
    <>
      {visible && <AreaConstraintsLayer constraints={shown} />}
      <ControlPortal position={position}>
        <button
          type="button"
          className={`fv-ac-control__btn${
            visible ? ' fv-ac-control__btn--on' : ''
          }`}
          title="Area constraints"
          aria-label="Area constraints"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <i className="fas fa-draw-polygon" aria-hidden="true" />
        </button>

        {open && (
          <div className="fv-ac-control__panel" role="menu">
            <label className="fv-ac-control__row fv-ac-control__row--head">
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
              />
              <span>Show area constraints</span>
            </label>

            <div className="fv-ac-control__sub">Which types to show</div>

            {ALL_TYPES.map((zt) => {
              const z = ZONE_STYLES[zt];
              return (
                <label key={zt} className="fv-ac-control__row">
                  <input
                    type="checkbox"
                    checked={types.has(zt)}
                    disabled={!visible}
                    onChange={() => toggleType(zt)}
                  />
                  <span
                    className="fv-ac-control__swatch"
                    style={{ background: z.color }}
                  />
                  <span className="fv-ac-control__label">{z.label}</span>
                  <span className="fv-ac-control__n">{zoneCounts.get(zt) ?? 0}</span>
                </label>
              );
            })}
          </div>
        )}
      </ControlPortal>
    </>
  );
}
