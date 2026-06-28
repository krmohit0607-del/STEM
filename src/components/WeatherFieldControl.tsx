import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import L, { type ControlPosition } from 'leaflet';

import { FIELD_FACTORS, getFieldFactor } from '../data/weatherField';
import { WeatherFieldLayer } from './WeatherFieldLayer';

/**
 * Drop-in map control for the MarineTraffic-style weather field. Place it
 * as a child of any `<MapContainer>`:
 *
 *   <MapContainer ...>
 *     <WeatherFieldControl position="topright" />
 *   </MapContainer>
 *
 * The on/off state and the chosen weather factor are shared across every
 * map via `localStorage` (and a lightweight event bus so multiple maps on
 * one screen stay in sync), exactly like the area-constraints control.
 */

const ON_KEY = 'fv.map.weatherField.on';
const FACTORS_KEY = 'fv.map.weatherField.factors';
const EVENT = 'fv-weatherfield-change';

function readOn(): boolean {
  try {
    return localStorage.getItem(ON_KEY) === '1';
  } catch {
    return false;
  }
}

function readFactors(): string[] {
  try {
    const raw = localStorage.getItem(FACTORS_KEY);
    if (raw) {
      const ids = (JSON.parse(raw) as string[]).filter((id) => getFieldFactor(id));
      if (ids.length) return ids;
    }
    // Migrate the old single-factor key if present.
    const legacy = localStorage.getItem('fv.map.weatherField.factor');
    if (legacy && getFieldFactor(legacy)) return [legacy];
  } catch {
    /* ignore */
  }
  return [FIELD_FACTORS[0].id];
}

function broadcast() {
  window.dispatchEvent(new Event(EVENT));
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
      const div = L.DomUtil.create('div', 'fv-wf-control');
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

export function WeatherFieldControl({
  position = 'topright',
}: {
  position?: ControlPosition;
} = {}) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState<boolean>(() => readOn());
  const [factorIds, setFactorIds] = useState<string[]>(() => readFactors());

  // Keep every mounted control in sync via the shared event + storage.
  useEffect(() => {
    const sync = () => {
      setOn(readOn());
      setFactorIds(readFactors());
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const updateOn = (next: boolean) => {
    setOn(next);
    try {
      localStorage.setItem(ON_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
    broadcast();
  };

  const persistFactors = (ids: string[]) => {
    setFactorIds(ids);
    try {
      localStorage.setItem(FACTORS_KEY, JSON.stringify(ids));
    } catch {
      /* ignore */
    }
    broadcast();
  };

  const toggleFactor = (id: string) => {
    const next = factorIds.includes(id)
      ? factorIds.filter((x) => x !== id)
      : [...factorIds, id];
    persistFactors(next);
    if (next.length && !on) updateOn(true);
  };

  // The first selected factor paints the colour field; the legend follows it.
  const primary = getFieldFactor(factorIds[0]) ?? FIELD_FACTORS[0];

  return (
    <>
      {on &&
        factorIds.map((id, i) => (
          <WeatherFieldLayer key={id} factorId={id} showField={i === 0} />
        ))}
      <ControlPortal position={position}>
        <button
          type="button"
          className={`fv-wf-control__btn${on ? ' fv-wf-control__btn--on' : ''}`}
          title="Weather layers"
          aria-label="Weather layers"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <i className="fas fa-layer-group" aria-hidden="true" />
        </button>

        {open && (
          <div className="fv-wf-control__panel" role="menu">
            <label className="fv-wf-control__head">
              <span>Weather Base Layer</span>
              <input
                type="checkbox"
                checked={on}
                onChange={(e) => updateOn(e.target.checked)}
              />
            </label>

            <div className="fv-wf-control__list">
              {FIELD_FACTORS.map((f) => (
                <label key={f.id} className="fv-wf-control__row">
                  <input
                    type="checkbox"
                    checked={factorIds.includes(f.id)}
                    onChange={() => toggleFactor(f.id)}
                  />
                  <i className={`fas ${f.icon}`} aria-hidden="true" />
                  <span className="fv-wf-control__label">{f.label}</span>
                  {f.directional && (
                    <i
                      className="fas fa-location-arrow fv-wf-control__dir"
                      aria-hidden="true"
                      title="Shows direction & magnitude"
                    />
                  )}
                </label>
              ))}
            </div>

            <div className="fv-wf-control__legend">
              <div className="fv-wf-control__legend-title">{primary.label}</div>
              <div
                className="fv-wf-control__bar"
                style={{
                  background: `linear-gradient(to right, ${primary.stops
                    .map(([p, c]) => `${c} ${Math.round(p * 100)}%`)
                    .join(', ')})`,
                }}
              />
              <div className="fv-wf-control__ticks">
                {primary.legend.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </ControlPortal>
    </>
  );
}
