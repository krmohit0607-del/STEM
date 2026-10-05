import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pane, TileLayer, useMap } from 'react-leaflet';
import L, { type ControlPosition } from 'leaflet';
import { MAP_CONTROL_OPEN_EVENT, notifyMapControlOpen } from './mapControlEvents';

export type MapLayerId = 'standard' | 'satellite' | 'dark' | 'nautical';
export type OverlayLayerId = 'loadLineZones';

export interface OverlayLayerOption {
  id: OverlayLayerId;
  label: string;
  icon: string;
}

const LAYER_KEY = 'fv.map.baseLayer';
const OVERLAY_LAYERS_KEY = 'fv.map.overlayLayers';
const NAUTICAL_OPACITY_KEY = 'fv.map.nauticalOpacity';
const DEFAULT_NAUTICAL_OPACITY = 0.5;

export const MAP_LAYER_OPTIONS: Array<{ id: MapLayerId; label: string; icon: string }> = [
  { id: 'standard', label: 'Standard', icon: 'fa-map' },
  { id: 'satellite', label: 'Satellite', icon: 'fa-satellite' },
  { id: 'dark', label: 'Dark', icon: 'fa-moon' },
  { id: 'nautical', label: 'Nautical Chart', icon: 'fa-anchor' },
];

export const OVERLAY_LAYER_OPTIONS: OverlayLayerOption[] = [
  { id: 'loadLineZones', label: 'Load Line Zones', icon: 'fa-water' },
];

function readNauticalOpacity(): number {
  try {
    const raw = window.localStorage.getItem(NAUTICAL_OPACITY_KEY);
    if (raw === null) return DEFAULT_NAUTICAL_OPACITY;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : DEFAULT_NAUTICAL_OPACITY;
  } catch {
    return DEFAULT_NAUTICAL_OPACITY;
  }
}

/**
 * Nautical chart tiles, blended between the weather field and the standard
 * base map by the same opacity slider: near 100% the (opaque) chart sits
 * above the weather panes and covers them, in the middle both are visible
 * blended together, and near 0% the chart is invisible, leaving just the
 * weather (and base map) showing through.
 */
function NauticalChartTiles({ enabled, opacity }: { enabled: boolean; opacity: number }) {
  const map = useMap();
  const previousMaxZoom = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    previousMaxZoom.current = map.getMaxZoom();
    map.setMaxZoom(18);
    return () => {
      map.setMaxZoom(previousMaxZoom.current ?? 18);
      previousMaxZoom.current = null;
    };
  }, [enabled, map]);

  // Re-assert the z-index imperatively on every mount: `map.createPane()`
  // (used both by react-leaflet's <Pane> below and by WeatherFieldLayer's
  // own panes) returns the *existing* pane if one with this name was
  // already created earlier in the session, without updating its style —
  // so if this pane was ever created before this ordering existed, it
  // could still be stuck on a stale z-index. This guarantees it's always
  // above the weather panes regardless of creation history.
  useEffect(() => {
    if (!enabled) return;
    const pane = map.getPane('nauticalTiles');
    if (pane) pane.style.zIndex = '355';
  }, [enabled, map]);

  if (!enabled) return null;

  return (
    // zIndex 355 sits above the weather field's contour (345) and glyph
    // (350) panes, so the opacity slider blends chart-over-weather, not the
    // other way around — but still below marker/overlay panes (400+).
    <Pane name="nauticalTiles" style={{ zIndex: 355 }}>
      <TileLayer
        url="/nautical-tiles/{z}/{x}/{y}.png"
        attribution="Nautical charts &copy; MarineTraffic"
        maxNativeZoom={11}
        maxZoom={18}
        pane="nauticalTiles"
        opacity={opacity}
      />
    </Pane>
  );
}

function isMapLayerId(value: string | null): value is MapLayerId {
  return (
    value === 'standard' ||
    value === 'satellite' ||
    value === 'dark' ||
    value === 'nautical'
  );
}

function isOverlayLayerId(value: string): value is OverlayLayerId {
  return value === 'loadLineZones';
}

export function readMapLayerId(): MapLayerId {
  try {
    const raw = window.localStorage.getItem(LAYER_KEY);
    return isMapLayerId(raw) ? raw : 'standard';
  } catch {
    return 'standard';
  }
}

export function readOverlayLayers(): OverlayLayerId[] {
  try {
    const raw = window.localStorage.getItem(OVERLAY_LAYERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isOverlayLayerId) : [];
  } catch {
    return [];
  }
}

function persistMapLayerId(id: MapLayerId): void {
  try {
    window.localStorage.setItem(LAYER_KEY, id);
  } catch {
    /* ignore */
  }
}

function persistOverlayLayers(layers: OverlayLayerId[]): void {
  try {
    window.localStorage.setItem(OVERLAY_LAYERS_KEY, JSON.stringify(layers));
  } catch {
    /* ignore */
  }
}

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
      const div = L.DomUtil.create('div', 'fv-ml-control');
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

export function MapLayersControl({
  position = 'topright',
  value: controlledValue,
  onChange,
  overlayLayers = [],
  onOverlayToggle,
}: {
  position?: ControlPosition;
  value?: MapLayerId;
  onChange?: (id: MapLayerId) => void;
  overlayLayers?: OverlayLayerId[];
  onOverlayToggle?: (layers: OverlayLayerId[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState<MapLayerId>(() => readMapLayerId());
  const [nauticalOpacity, setNauticalOpacity] = useState(() => readNauticalOpacity());
  const value = controlledValue ?? internalValue;

  useEffect(() => {
    const closeWhenAnotherOpens = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== 'layers') setOpen(false);
    };
    window.addEventListener(MAP_CONTROL_OPEN_EVENT, closeWhenAnotherOpens);
    return () => window.removeEventListener(MAP_CONTROL_OPEN_EVENT, closeWhenAnotherOpens);
  }, []);

  const toggleOpen = () => {
    setOpen((current) => {
      const next = !current;
      if (next) notifyMapControlOpen('layers');
      return next;
    });
  };

  const select = (id: MapLayerId) => {
    setInternalValue(id);
    onChange?.(id);
    persistMapLayerId(id);
    setOpen(false);
  };

  const toggleOverlay = (layerId: OverlayLayerId) => {
    const newLayers = overlayLayers.includes(layerId)
      ? overlayLayers.filter((l) => l !== layerId)
      : [...overlayLayers, layerId];
    onOverlayToggle?.(newLayers);
    persistOverlayLayers(newLayers);
  };

  const updateNauticalOpacity = (next: number) => {
    setNauticalOpacity(next);
    try {
      window.localStorage.setItem(NAUTICAL_OPACITY_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  const selected = MAP_LAYER_OPTIONS.find((o) => o.id === value) ?? MAP_LAYER_OPTIONS[0];

  return (
    <>
      <NauticalChartTiles enabled={value === 'nautical'} opacity={nauticalOpacity} />
      <ControlPortal position={position}>
        <button
          type="button"
          className="fv-ml-control__btn"
          title="Map layers"
          aria-label="Map layers"
          aria-expanded={open}
          onClick={toggleOpen}
        >
          <i className="fas fa-layer-group" aria-hidden="true" />
        </button>
        {open && (
          <div className="fv-ml-control__panel" role="menu" aria-label="Map layer options">
          <div className="fv-ml-control__title">Base Layers</div>
          {MAP_LAYER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="menuitemradio"
              aria-checked={opt.id === value}
              className={`fv-ml-control__row${opt.id === value ? ' fv-ml-control__row--active' : ''}`}
              onClick={() => select(opt.id)}
            >
              <i className={`fas ${opt.icon}`} aria-hidden="true" />
              <span>{opt.label}</span>
              {opt.id === value && <i className="fas fa-check" aria-hidden="true" />}
            </button>
          ))}
          
          {OVERLAY_LAYER_OPTIONS.length > 0 && (
            <>
              <div className="fv-ml-control__divider" />
              <div className="fv-ml-control__title">Overlays</div>
              {OVERLAY_LAYER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={overlayLayers.includes(opt.id)}
                  className={`fv-ml-control__row fv-ml-control__overlay${overlayLayers.includes(opt.id) ? ' fv-ml-control__row--active' : ''}`}
                  onClick={() => toggleOverlay(opt.id)}
                >
                  <i className={`fas ${opt.icon}`} aria-hidden="true" />
                  <span>{opt.label}</span>
                  {overlayLayers.includes(opt.id) && <i className="fas fa-check" aria-hidden="true" />}
                </button>
              ))}
            </>
          )}

          {value === 'nautical' && (
            <div className="fv-ml-control__opacity">
              <label htmlFor="fv-nautical-opacity">Nautical chart opacity</label>
              <input
                id="fv-nautical-opacity"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={nauticalOpacity}
                onChange={(event) => updateNauticalOpacity(Number(event.target.value))}
                aria-label="Nautical chart opacity"
              />
              <span>{Math.round(nauticalOpacity * 100)}%</span>
            </div>
          )}
          
          <div className="fv-ml-control__selected">Base: {selected.label}</div>
          </div>
        )}
      </ControlPortal>
    </>
  );
}
