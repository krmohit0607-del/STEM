import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import L, { type LatLngBoundsLiteral, type Map as LeafletMap } from 'leaflet';

import { useL } from '../i18n/LocalizationProvider';
import { useTheme } from '../theme';
import { WeatherFieldControl } from './WeatherFieldControl';
import {
  AreaConstraintsLayer,
  ZONE_STYLES,
  getZoneStyle,
  speedKnots,
} from './AreaConstraintsLayer';
import { AREA_CONSTRAINTS, type AreaConstraint } from '../data/areaConstraints';

/**
 * Standalone page that lists every imported area constraint alongside a map
 * that draws them all. Picking a constraint from the list zooms the map to it,
 * highlights it in its zone colour, and opens an editor where the polygon
 * coordinates can be changed (degrees + decimal minutes, N/S and E/W).
 *
 * Reached from the left sidebar's "Area Constraints" tab (`/area-constraints`).
 */

const WORLD_BOUNDS: LatLngBoundsLiteral = [
  [-85, -1_000_000],
  [85, 1_000_000],
];

const EDITS_KEY = 'fv.areaConstraints.edits';

// ── Coordinate <-> degrees/minutes helpers ────────────────────────────
type Hemi = 'N' | 'S' | 'E' | 'W';

function toParts(value: number, axis: 'lat' | 'lon') {
  const hemi: Hemi =
    axis === 'lat' ? (value < 0 ? 'S' : 'N') : value < 0 ? 'W' : 'E';
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const min = Math.round((abs - deg) * 60 * 10) / 10;
  return { deg, min, hemi };
}

function fromParts(deg: number, min: number, hemi: Hemi): number {
  const sign = hemi === 'S' || hemi === 'W' ? -1 : 1;
  return Math.round(sign * (Math.abs(deg) + Math.abs(min) / 60) * 1e5) / 1e5;
}

// Deep clone the editable part of a constraint.
function cloneRings(rings: [number, number][][]): [number, number][][] {
  return rings.map((r) => r.map((p) => [p[0], p[1]] as [number, number]));
}

// Bounding box across a constraint's rings.
function boundsOf(c: AreaConstraint): LatLngBoundsLiteral {
  let minLat = 90;
  let minLon = 180;
  let maxLat = -90;
  let maxLon = -180;
  for (const ring of c.rings) {
    for (const [lat, lon] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
  }
  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
}

function limitSummary(c: AreaConstraint): string {
  const parts: string[] = [];
  if (c.speedMin || c.speedMax) {
    const kn = [speedKnots(c.speedMin), speedKnots(c.speedMax)]
      .filter(Boolean)
      .join(' – ');
    parts.push(kn ? `Speed ${kn}` : '');
  }
  if (c.rpmMin || c.rpmMax) {
    parts.push(`RPM ${[c.rpmMin, c.rpmMax].filter(Boolean).join(' – ')}`);
  }
  return parts.filter(Boolean).join(' · ');
}

// Apply persisted ring edits (by constraint id) on top of the bundled data.
function loadInitial(): AreaConstraint[] {
  let edits: Record<string, [number, number][][]> = {};
  try {
    const raw = localStorage.getItem(EDITS_KEY);
    if (raw) edits = JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return AREA_CONSTRAINTS.map((c) =>
    edits[c.id] ? { ...c, rings: cloneRings(edits[c.id]) } : c
  );
}

export function AreaConstraintsPage() {
  const l = useL();
  const [theme] = useTheme();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const mapRef = useRef<LeafletMap | null>(null);
  const [data, setData] = useState<AreaConstraint[]>(() => loadInitial());
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Make sure Leaflet measures the container after the flex layout settles,
  // otherwise the map can render as a thin sliver.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = window.setTimeout(() => map.invalidateSize(), 60);
    return () => window.clearTimeout(id);
  }, []);

  const zoneCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of data) {
      counts.set(c.zoneType, (counts.get(c.zoneType) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((c) => {
      if (zoneFilter && c.zoneType !== zoneFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.zoneType.toLowerCase().includes(q) ||
        c.rawName.toLowerCase().includes(q)
      );
    });
  }, [data, search, zoneFilter]);

  const selected = data.find((c) => c.id === selectedId) ?? null;

  const flyTo = (c: AreaConstraint) => {
    const map = mapRef.current;
    if (map) {
      map.fitBounds(L.latLngBounds(boundsOf(c)).pad(0.5), {
        maxZoom: 7,
        animate: true,
      });
    }
  };

  const select = (c: AreaConstraint) => {
    setSelectedId(c.id);
    flyTo(c);
  };

  // ── Editing ─────────────────────────────────────────────────────────
  const mutateRings = (
    id: string,
    fn: (rings: [number, number][][]) => [number, number][][]
  ) => {
    setData((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, rings: fn(cloneRings(c.rings)) } : c
      )
    );
  };

  const updatePoint = (
    id: string,
    ri: number,
    pi: number,
    next: [number, number]
  ) => {
    mutateRings(id, (rings) => {
      rings[ri][pi] = next;
      return rings;
    });
  };

  const deletePoint = (id: string, ri: number, pi: number) => {
    mutateRings(id, (rings) => {
      rings[ri].splice(pi, 1);
      return rings.filter((r) => r.length >= 1);
    });
  };

  const addPoint = (id: string, ri: number) => {
    mutateRings(id, (rings) => {
      const ring = rings[ri];
      const last = ring[ring.length - 1] ?? [0, 0];
      ring.push([last[0], last[1]]);
      return rings;
    });
  };

  const saveEdits = () => {
    try {
      const edits: Record<string, [number, number][][]> = {};
      const original = new Map(AREA_CONSTRAINTS.map((c) => [c.id, c]));
      for (const c of data) {
        const orig = original.get(c.id);
        if (orig && JSON.stringify(orig.rings) !== JSON.stringify(c.rings)) {
          edits[c.id] = c.rings;
        }
      }
      localStorage.setItem(EDITS_KEY, JSON.stringify(edits));
    } catch {
      /* ignore */
    }
  };

  const resetConstraint = (id: string) => {
    const orig = AREA_CONSTRAINTS.find((c) => c.id === id);
    if (!orig) return;
    mutateRings(id, () => cloneRings(orig.rings));
  };

  const tileUrl =
    theme === 'light'
      ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';

  return (
    <div className="fv-area-page">
      <aside className="fv-area-page__list">
        <div className="fv-area-page__head">
          <h2 className="fv-area-page__title">
            <i className="fas fa-draw-polygon" aria-hidden="true" />{' '}
            {t('areaConstraints', 'Area Constraints')}
          </h2>
          <p className="fv-area-page__count">
            {filtered.length} of {data.length}
          </p>
        </div>

        <div className="fv-area-page__search">
          <i className="fas fa-magnifying-glass" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchConstraints', 'Filter by name or type…')}
          />
        </div>

        <div className="fv-area-page__chips">
          <button
            type="button"
            className={`fv-area-chip${zoneFilter === null ? ' fv-area-chip--on' : ''}`}
            onClick={() => setZoneFilter(null)}
          >
            All <span className="fv-area-chip__n">{data.length}</span>
          </button>
          {[...zoneCounts.keys()].map((zt) => {
            const z = getZoneStyle(zt);
            const on = zoneFilter === zt;
            return (
              <button
                key={zt}
                type="button"
                className={`fv-area-chip${on ? ' fv-area-chip--on' : ''}`}
                onClick={() => setZoneFilter(on ? null : zt)}
              >
                <span
                  className="fv-area-chip__swatch"
                  style={{ background: z.color }}
                />
                {z.label}
                <span className="fv-area-chip__n">{zoneCounts.get(zt)}</span>
              </button>
            );
          })}
        </div>

        <ul className="fv-area-page__items">
          {filtered.map((c) => {
            const z = getZoneStyle(c.zoneType);
            const limits = limitSummary(c);
            const isOpen = selectedId === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={`fv-area-item${isOpen ? ' fv-area-item--on' : ''}`}
                  onClick={() => (isOpen ? setSelectedId(null) : select(c))}
                >
                  <span
                    className="fv-area-item__swatch"
                    style={{ background: z.color }}
                  />
                  <span className="fv-area-item__text">
                    <span className="fv-area-item__name">{c.name}</span>
                    <span className="fv-area-item__meta">
                      {z.label}
                      {limits && ` · ${limits}`}
                    </span>
                  </span>
                  <i
                    className={`fas fa-chevron-${isOpen ? 'up' : 'down'} fv-area-item__caret`}
                    aria-hidden="true"
                  />
                </button>

                {isOpen && selected && (
                  <CoordinateEditor
                    constraint={selected}
                    zoneColor={z.color}
                    zoneLabel={z.label}
                    onUpdatePoint={updatePoint}
                    onDeletePoint={deletePoint}
                    onAddPoint={addPoint}
                    onSave={saveEdits}
                    onReset={() => resetConstraint(selected.id)}
                    onZoom={() => flyTo(selected)}
                    t={t}
                  />
                )}
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="fv-area-page__empty">
              {t('noConstraintsMatch', 'No constraints match your search.')}
            </li>
          )}
        </ul>
      </aside>

      <div className="fv-area-page__map">
        <MapContainer
          ref={(instance) => {
            mapRef.current = instance;
          }}
          center={[20, 20]}
          zoom={2}
          minZoom={2}
          maxZoom={18}
          worldCopyJump
          maxBounds={WORLD_BOUNDS}
          maxBoundsViscosity={1.0}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            key={theme}
            attribution="&copy; OpenStreetMap, &copy; CARTO"
            url={tileUrl}
            maxZoom={18}
            crossOrigin="anonymous"
          />
          <WeatherFieldControl position="topright" />
          <AreaConstraintsLayer
            constraints={data}
            selectedId={selectedId ?? undefined}
          />
        </MapContainer>

        <div className="fv-area-legend">
          {Object.entries(ZONE_STYLES).map(([zt, z]) => (
            <div key={zt} className="fv-area-legend__row">
              <span
                className="fv-area-legend__swatch"
                style={{ background: z.color }}
              />
              {z.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Coordinate editor ──────────────────────────────────────────────────
interface CoordinateEditorProps {
  constraint: AreaConstraint;
  zoneColor: string;
  zoneLabel: string;
  onUpdatePoint: (
    id: string,
    ri: number,
    pi: number,
    next: [number, number]
  ) => void;
  onDeletePoint: (id: string, ri: number, pi: number) => void;
  onAddPoint: (id: string, ri: number) => void;
  onSave: () => void;
  onReset: () => void;
  onZoom: () => void;
  t: (key: string, fallback: string) => string;
}

function CoordinateEditor({
  constraint: c,
  zoneColor,
  zoneLabel,
  onUpdatePoint,
  onDeletePoint,
  onAddPoint,
  onSave,
  onReset,
  onZoom,
  t,
}: CoordinateEditorProps) {
  const [saved, setSaved] = useState(false);
  const multiRing = c.rings.length > 1;

  const handleSave = () => {
    onSave();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const setLat = (
    ri: number,
    pi: number,
    deg: number,
    min: number,
    hemi: Hemi
  ) => {
    const lon = c.rings[ri][pi][1];
    onUpdatePoint(c.id, ri, pi, [fromParts(deg, min, hemi), lon]);
  };
  const setLon = (
    ri: number,
    pi: number,
    deg: number,
    min: number,
    hemi: Hemi
  ) => {
    const lat = c.rings[ri][pi][0];
    onUpdatePoint(c.id, ri, pi, [lat, fromParts(deg, min, hemi)]);
  };

  return (
    <div className="fv-area-editor">
      <div className="fv-area-editor__bar">
        <button
          type="button"
          className="fv-area-editor__action"
          onClick={handleSave}
        >
          <i className="fas fa-floppy-disk" aria-hidden="true" />{' '}
          {saved ? t('saved', 'Saved') : t('save', 'Save')}
        </button>
        <button
          type="button"
          className="fv-area-editor__action fv-area-editor__action--ghost"
          onClick={onReset}
        >
          <i className="fas fa-rotate-left" aria-hidden="true" />{' '}
          {t('reset', 'Reset')}
        </button>
        <button
          type="button"
          className="fv-area-editor__action fv-area-editor__action--ghost"
          onClick={onZoom}
          title={t('zoomTo', 'Zoom to constraint')}
        >
          <i className="fas fa-crosshairs" aria-hidden="true" />
        </button>
      </div>

      <div className="fv-area-editor__note">
        <span className="fv-area-editor__dot" style={{ background: zoneColor }} />
        {zoneLabel} · {c.rings.reduce((n, r) => n + r.length, 0)}{' '}
        {t('coordinates', 'coordinates')}
      </div>

      {c.rings.map((ring, ri) => (
        <div key={ri} className="fv-area-editor__ring">
          {multiRing && (
            <div className="fv-area-editor__ring-head">
              {t('part', 'Part')} {ri + 1}
            </div>
          )}
          <div className="fv-area-editor__rows">
            {ring.map((pt, pi) => {
              const lat = toParts(pt[0], 'lat');
              const lon = toParts(pt[1], 'lon');
              return (
                <div key={pi} className="fv-area-coord">
                  <button
                    type="button"
                    className="fv-area-coord__del"
                    title={t('removeCoordinate', 'Remove coordinate')}
                    onClick={() => onDeletePoint(c.id, ri, pi)}
                  >
                    <i className="fas fa-trash-can" aria-hidden="true" />
                  </button>
                  <span className="fv-area-coord__group">
                    <input
                      className="fv-area-coord__num"
                      type="number"
                      value={lat.deg}
                      onChange={(e) =>
                        setLat(ri, pi, Number(e.target.value), lat.min, lat.hemi)
                      }
                    />
                    <span className="fv-area-coord__u">°</span>
                    <input
                      className="fv-area-coord__num"
                      type="number"
                      step="0.1"
                      value={lat.min}
                      onChange={(e) =>
                        setLat(ri, pi, lat.deg, Number(e.target.value), lat.hemi)
                      }
                    />
                    <span className="fv-area-coord__u">′</span>
                    <select
                      className="fv-area-coord__hemi"
                      value={lat.hemi}
                      onChange={(e) =>
                        setLat(ri, pi, lat.deg, lat.min, e.target.value as Hemi)
                      }
                    >
                      <option value="N">N</option>
                      <option value="S">S</option>
                    </select>
                  </span>
                  <span className="fv-area-coord__comma">,</span>
                  <span className="fv-area-coord__group">
                    <input
                      className="fv-area-coord__num"
                      type="number"
                      value={lon.deg}
                      onChange={(e) =>
                        setLon(ri, pi, Number(e.target.value), lon.min, lon.hemi)
                      }
                    />
                    <span className="fv-area-coord__u">°</span>
                    <input
                      className="fv-area-coord__num"
                      type="number"
                      step="0.1"
                      value={lon.min}
                      onChange={(e) =>
                        setLon(ri, pi, lon.deg, Number(e.target.value), lon.hemi)
                      }
                    />
                    <span className="fv-area-coord__u">′</span>
                    <select
                      className="fv-area-coord__hemi"
                      value={lon.hemi}
                      onChange={(e) =>
                        setLon(ri, pi, lon.deg, lon.min, e.target.value as Hemi)
                      }
                    >
                      <option value="E">E</option>
                      <option value="W">W</option>
                    </select>
                  </span>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="fv-area-editor__add"
            onClick={() => onAddPoint(c.id, ri)}
          >
            <i className="fas fa-circle-plus" aria-hidden="true" />{' '}
            {t('addCoordinate', 'Add Coordinate')}
          </button>
        </div>
      ))}
    </div>
  );
}
