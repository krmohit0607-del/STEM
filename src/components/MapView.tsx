import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import type { LatLngBoundsLiteral, Map as LeafletMap } from 'leaflet';

/**
 * Leaflet map with floating right-side control bar.
 *
 * Mirrors the legacy `leaflet-panel-layers` control from
 * `MapManager.js` — four stacked icon buttons in the top-right
 * corner that open a panel:
 *
 *   - Basemaps        (fa-map)             radio: choose one
 *   - Overlays        (fa-layer-group)     checkbox list
 *   - Weather         (fa-cloud-sun-rain)  checkbox list (WMS layers)
 *   - Tools           (fa-tools)           ruler / screenshot / reset
 *
 * Most overlays + every weather layer are still STUBS — toggling them
 * just records the selection (and shows the badge count). The legacy
 * weather overlays come from the FleetView WMS service which has not
 * been factored out for the React app yet. Items marked `stub`
 * intentionally do not render any tiles.
 *
 * Live, free overlays that ARE wired:
 *   - `Sea marks (OpenSeaMap)`    transparent overlay tiles
 *
 * Map behaviour: matches the legacy FleetView map — vertical panning is
 * locked so the grey area above/below the tiled world is never visible,
 * horizontal panning wraps thanks to `worldCopyJump`, and `minZoom: 2`
 * keeps the world filling the viewport.
 */

const WORLD_BOUNDS: LatLngBoundsLiteral = [
  [-85, -1_000_000],
  [85, 1_000_000],
];

interface BaseMap {
  id: string;
  name: string;
  url: string;
  attribution: string;
  /** Some tile providers stop publishing tiles past a certain zoom. */
  maxNativeZoom?: number;
}

const BASEMAPS: BaseMap[] = [
  {
    id: 'osm',
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  {
    id: 'esri-ocean',
    name: 'Esri Ocean',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxNativeZoom: 10,
  },
  {
    id: 'esri-imagery',
    name: 'Esri Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxNativeZoom: 18,
  },
  {
    id: 'carto-dark',
    name: 'CARTO Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap, &copy; CARTO',
  },
  {
    id: 'carto-voyager',
    name: 'CARTO Voyager',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap, &copy; CARTO',
  },
];

interface ToggleOption {
  id: string;
  name: string;
  /** When set, toggling really renders this overlay tile layer. */
  url?: string;
  attribution?: string;
  description?: string;
}

const OVERLAYS: ToggleOption[] = [
  {
    id: 'openseamap',
    name: 'Sea marks (OpenSeaMap)',
    url: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
    attribution: 'Sea marks &copy; OpenSeaMap',
    description: 'Buoys, lights, harbour boundaries.',
  },
  { id: 'ports', name: 'Ports', description: 'World port locations.' },
  {
    id: 'eca',
    name: 'ECA zones',
    description: 'Emission control areas (MARPOL Annex VI).',
  },
  { id: 'corridors', name: 'Voyage corridors' },
  { id: 'storms', name: 'Active storm tracks' },
  { id: 'timezones', name: 'Time zones' },
  { id: 'bathymetry', name: 'Bathymetry contours' },
  { id: 'pirate', name: 'High-risk areas (piracy)' },
  { id: 'load-lines', name: 'Load-line zones' },
];

const WEATHER: ToggleOption[] = [
  { id: 'wind', name: 'Wind (10 m)' },
  { id: 'gust', name: 'Wind gust' },
  { id: 'wave-height', name: 'Significant wave height' },
  { id: 'wave-period', name: 'Wave period' },
  { id: 'swell', name: 'Swell direction' },
  { id: 'currents', name: 'Ocean currents' },
  { id: 'pressure', name: 'Surface pressure' },
  { id: 'precipitation', name: 'Precipitation' },
  { id: 'temperature', name: 'Sea temperature' },
  { id: 'visibility', name: 'Visibility' },
  { id: 'ice', name: 'Sea ice coverage' },
  { id: 'cyclones', name: 'Tropical cyclones' },
];

type ControlId = 'basemaps' | 'overlays' | 'weather' | 'tools';

const CONTROL_BUTTONS: { id: ControlId; icon: string; label: string }[] = [
  { id: 'basemaps', icon: 'fa-map', label: 'Basemaps' },
  { id: 'overlays', icon: 'fa-layer-group', label: 'Overlays' },
  { id: 'weather', icon: 'fa-cloud-sun-rain', label: 'Weather' },
  { id: 'tools', icon: 'fa-tools', label: 'Tools' },
];

function todo(label: string) {
  // eslint-disable-next-line no-console
  console.warn(`[FleetView WebApp] '${label}' not ported yet — see MIGRATION.md.`);
}

export function MapView() {
  const mapRef = useRef<LeafletMap | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);

  const [basemapId, setBasemapId] = useState<string>(() => {
    const saved = localStorage.getItem('fv.map.basemap');
    return saved && BASEMAPS.some((b) => b.id === saved) ? saved : BASEMAPS[0].id;
  });
  const [overlayIds, setOverlayIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('fv.map.overlays');
      if (raw) return new Set(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    return new Set();
  });
  const [weatherIds, setWeatherIds] = useState<Set<string>>(() => new Set());
  const [openPanel, setOpenPanel] = useState<ControlId | null>(null);

  // Persist basemap + overlays.
  useEffect(() => {
    localStorage.setItem('fv.map.basemap', basemapId);
  }, [basemapId]);
  useEffect(() => {
    localStorage.setItem('fv.map.overlays', JSON.stringify([...overlayIds]));
  }, [overlayIds]);

  // Close panel on outside-click + Escape.
  useEffect(() => {
    if (!openPanel) return;
    const onDocClick = (e: MouseEvent) => {
      if (controlsRef.current && !controlsRef.current.contains(e.target as Node)) {
        setOpenPanel(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenPanel(null);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [openPanel]);

  const basemap = BASEMAPS.find((b) => b.id === basemapId) ?? BASEMAPS[0];
  const liveOverlays = OVERLAYS.filter((o) => o.url && overlayIds.has(o.id));

  const toggle = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const resetView = () => mapRef.current?.setView([20, 0], 3);

  return (
    <div className="fv-map-container">
      <MapContainer
        ref={(instance) => {
          mapRef.current = instance;
        }}
        center={[20, 0]}
        zoom={3}
        minZoom={2}
        maxZoom={18}
        worldCopyJump
        maxBounds={WORLD_BOUNDS}
        maxBoundsViscosity={1.0}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          key={basemap.id}
          attribution={basemap.attribution}
          url={basemap.url}
          maxNativeZoom={basemap.maxNativeZoom}
          maxZoom={18}
        />
        {liveOverlays.map((o) => (
          <TileLayer
            key={o.id}
            url={o.url!}
            attribution={o.attribution}
            maxZoom={18}
          />
        ))}
      </MapContainer>

      <div className="fv-map-controls" ref={controlsRef}>
        <div className="fv-map-controls__bar">
          {CONTROL_BUTTONS.map((c) => {
            const active = openPanel === c.id;
            const badgeCount =
              c.id === 'overlays'
                ? overlayIds.size
                : c.id === 'weather'
                ? weatherIds.size
                : 0;
            return (
              <button
                key={c.id}
                type="button"
                className={`fv-map-controls__btn${
                  active ? ' fv-map-controls__btn--active' : ''
                }`}
                title={c.label}
                aria-label={c.label}
                aria-haspopup="menu"
                aria-expanded={active}
                onClick={() => setOpenPanel(active ? null : c.id)}
              >
                <i className={`fas ${c.icon}`} aria-hidden="true" />
                {badgeCount > 0 && (
                  <span className="fv-map-controls__badge">{badgeCount}</span>
                )}
              </button>
            );
          })}
        </div>

        {openPanel === 'basemaps' && (
          <div className="fv-map-controls__panel" role="menu">
            <div className="fv-map-controls__panel-header">Basemaps</div>
            <ul className="fv-map-controls__list">
              {BASEMAPS.map((b) => {
                const sel = b.id === basemapId;
                return (
                  <li
                    key={b.id}
                    className={`fv-map-controls__item${
                      sel ? ' fv-map-controls__item--selected' : ''
                    }`}
                    role="menuitemradio"
                    aria-checked={sel}
                    onClick={() => setBasemapId(b.id)}
                  >
                    <i
                      className={`fas ${
                        sel ? 'fa-circle-dot' : 'fa-circle'
                      } fv-map-controls__item-icon`}
                      aria-hidden="true"
                    />
                    <span>{b.name}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {openPanel === 'overlays' && (
          <div className="fv-map-controls__panel" role="menu">
            <div className="fv-map-controls__panel-header">Overlays</div>
            <ul className="fv-map-controls__list">
              {OVERLAYS.map((o) => {
                const on = overlayIds.has(o.id);
                const live = !!o.url;
                return (
                  <li
                    key={o.id}
                    className={`fv-map-controls__item${
                      on ? ' fv-map-controls__item--selected' : ''
                    }`}
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => {
                      setOverlayIds((s) => toggle(s, o.id));
                      if (!live) todo(`Overlay '${o.name}'`);
                    }}
                    title={
                      live
                        ? ''
                        : 'Stub only — overlay tile source not wired yet.'
                    }
                  >
                    <i
                      className={`fas ${
                        on ? 'fa-square-check' : 'fa-square'
                      } fv-map-controls__item-icon`}
                      aria-hidden="true"
                    />
                    <div className="fv-map-controls__item-text">
                      <div>
                        {o.name}
                        {!live && (
                          <span className="fv-map-controls__stub-tag">
                            {' '}
                            stub
                          </span>
                        )}
                      </div>
                      {o.description && (
                        <div className="fv-map-controls__item-detail">
                          {o.description}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {openPanel === 'weather' && (
          <div className="fv-map-controls__panel" role="menu">
            <div className="fv-map-controls__panel-header">Weather</div>
            <ul className="fv-map-controls__list">
              {WEATHER.map((w) => {
                const on = weatherIds.has(w.id);
                return (
                  <li
                    key={w.id}
                    className={`fv-map-controls__item${
                      on ? ' fv-map-controls__item--selected' : ''
                    }`}
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => {
                      setWeatherIds((s) => toggle(s, w.id));
                      todo(`Weather layer '${w.name}'`);
                    }}
                    title="Stub only — weather tile source not wired yet."
                  >
                    <i
                      className={`fas ${
                        on ? 'fa-square-check' : 'fa-square'
                      } fv-map-controls__item-icon`}
                      aria-hidden="true"
                    />
                    <span>
                      {w.name}
                      <span className="fv-map-controls__stub-tag"> stub</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="fv-map-controls__panel-footer">
              Weather tiles will be wired to the FleetView WMS service in a
              later step.
            </div>
          </div>
        )}

        {openPanel === 'tools' && (
          <div className="fv-map-controls__panel" role="menu">
            <div className="fv-map-controls__panel-header">Tools</div>
            <ul className="fv-map-controls__list">
              <li
                className="fv-map-controls__item"
                role="menuitem"
                onClick={() => {
                  resetView();
                  setOpenPanel(null);
                }}
              >
                <i
                  className="fas fa-house fv-map-controls__item-icon"
                  aria-hidden="true"
                />
                <span>Reset view</span>
              </li>
              <li
                className="fv-map-controls__item"
                role="menuitem"
                onClick={() => {
                  todo('Ruler');
                  setOpenPanel(null);
                }}
                title="Stub only — ruler tool not ported yet."
              >
                <i
                  className="fas fa-ruler fv-map-controls__item-icon"
                  aria-hidden="true"
                />
                <span>
                  Ruler
                  <span className="fv-map-controls__stub-tag"> stub</span>
                </span>
              </li>
              <li
                className="fv-map-controls__item"
                role="menuitem"
                onClick={() => {
                  todo('Screenshot');
                  setOpenPanel(null);
                }}
                title="Stub only — screenshoter not ported yet."
              >
                <i
                  className="fas fa-camera fv-map-controls__item-icon"
                  aria-hidden="true"
                />
                <span>
                  Screenshot
                  <span className="fv-map-controls__stub-tag"> stub</span>
                </span>
              </li>
              <li
                className="fv-map-controls__item"
                role="menuitem"
                onClick={() => {
                  todo('Graticule');
                  setOpenPanel(null);
                }}
                title="Stub only — graticule plugin not ported yet."
              >
                <i
                  className="fas fa-globe fv-map-controls__item-icon"
                  aria-hidden="true"
                />
                <span>
                  Toggle graticule
                  <span className="fv-map-controls__stub-tag"> stub</span>
                </span>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
