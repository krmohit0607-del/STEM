import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import L, { type ControlPosition } from 'leaflet';

export type MapLayerId = 'standard' | 'satellite' | 'dark' | 'nautical';
export type OverlayLayerId = 'loadLineZones';

export interface OverlayLayerOption {
  id: OverlayLayerId;
  label: string;
  icon: string;
}

const LAYER_KEY = 'fv.map.baseLayer';
const OVERLAY_LAYERS_KEY = 'fv.map.overlayLayers';

export const MAP_LAYER_OPTIONS: Array<{ id: MapLayerId; label: string; icon: string }> = [
  { id: 'standard', label: 'Standard', icon: 'fa-map' },
  { id: 'satellite', label: 'Satellite', icon: 'fa-satellite' },
  { id: 'dark', label: 'Dark', icon: 'fa-moon' },
  { id: 'nautical', label: 'Nautical Chart', icon: 'fa-anchor' },
];

export const OVERLAY_LAYER_OPTIONS: OverlayLayerOption[] = [
  { id: 'loadLineZones', label: 'Load Line Zones', icon: 'fa-water' },
];

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
  value,
  onChange,
  overlayLayers = [],
  onOverlayToggle,
}: {
  position?: ControlPosition;
  value: MapLayerId;
  onChange: (id: MapLayerId) => void;
  overlayLayers?: OverlayLayerId[];
  onOverlayToggle?: (layers: OverlayLayerId[]) => void;
} = {}) {
  const [open, setOpen] = useState(false);

  const select = (id: MapLayerId) => {
    onChange(id);
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

  const selected = MAP_LAYER_OPTIONS.find((o) => o.id === value) ?? MAP_LAYER_OPTIONS[0];

  return (
    <ControlPortal position={position}>
      <button
        type="button"
        className="fv-ml-control__btn"
        title="Map layers"
        aria-label="Map layers"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
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
          
          <div className="fv-ml-control__selected">Base: {selected.label}</div>
        </div>
      )}
    </ControlPortal>
  );
}
