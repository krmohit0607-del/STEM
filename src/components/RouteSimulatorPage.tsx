import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import L, { type LatLngExpression } from 'leaflet';

import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { AreaConstraintsControl } from './AreaConstraintsControl';
import { WeatherFieldControl } from './WeatherFieldControl';
import { WeatherPointControl } from './WeatherPointControl';
import { MapCursorPosition } from './MapCursorPosition';

/**
 * Route Simulator page — `/route-simulator`.
 *
 * Compares every available route by drawing each one on a Leaflet
 * map and animating a vessel marker along the route. The selected
 * parameter (wave height, wind, SOG, fuel cost …) is shown in the
 * route cards and as a tooltip on each ship icon, so you can see how
 * the comparison value changes for every route at the same voyage day.
 *
 * Stub data only — replace `STUB_ROUTES` / `TIMELINE_DAYS` /
 * `OBSERVED_LAST_IDX` with API responses when the routing /
 * optimization endpoints are wired up.
 */

interface RouteSummary {
  id: string;
  label: string;
  sentAt: string;
  status: 'Active' | 'Sent' | 'Draft';
  eta: string;
  etaUtc: string;
  durationToGo: string;
  ecaTimeToGo: string;
  distanceToGo: number;
  ecaDistanceToGo: number;
  totalCostToGo: number;
  fuelCostToGo: number;
  color: string;
  /** Per-day samples keyed by parameter id. */
  series: Record<ParamId, number[]>;
  /**
   * Polyline of geographic waypoints for the route, sampled to one
   * coordinate per timeline day so `path[playbackIdx]` is the vessel
   * position at that day.
   */
  path: Array<[number, number]>;
}

type ParamId =
  | 'waveHeight'
  | 'wind'
  | 'currents'
  | 'sog'
  | 'rpm'
  | 'fuelRate'
  | 'distanceToGo'
  | 'fuelCostCum';

interface ParamDef {
  id: ParamId;
  label: string;
  unit: string;
  /** Optional safety threshold rendered as a dashed reference line. */
  threshold?: number;
  /** Y-axis tick hints (chart auto-scales but uses these as anchors). */
  ticks?: number[];
  fractionDigits: number;
}

const PARAMS: ParamDef[] = [
  {
    id: 'waveHeight',
    label: 'Significant Wave Ht.',
    unit: 'm',
    threshold: 2.5,
    ticks: [0, 2.5, 5, 7.5],
    fractionDigits: 1,
  },
  { id: 'wind', label: 'Wind speed', unit: 'kt', ticks: [0, 10, 20, 30, 40], fractionDigits: 0 },
  { id: 'currents', label: 'Currents', unit: 'kt', ticks: [0, 1, 2, 3], fractionDigits: 1 },
  { id: 'sog', label: 'Vessel SOG', unit: 'kt', ticks: [10, 11, 12, 13, 14], fractionDigits: 1 },
  { id: 'rpm', label: 'M/E RPM', unit: 'rpm', ticks: [60, 70, 80, 90, 100], fractionDigits: 0 },
  {
    id: 'fuelRate',
    label: 'Fuel rate',
    unit: 'mt/d',
    ticks: [0, 25, 50, 75, 100],
    fractionDigits: 1,
  },
  {
    id: 'distanceToGo',
    label: 'Distance to go',
    unit: 'NM',
    ticks: [0, 5_000, 10_000, 15_000],
    fractionDigits: 0,
  },
  {
    id: 'fuelCostCum',
    label: 'Cumulative fuel cost',
    unit: 'US$',
    ticks: [0, 300_000, 600_000, 900_000, 1_200_000],
    fractionDigits: 0,
  },
];

const TIMELINE_DAYS: string[] = [
  'Jun 13',
  'Jun 14',
  'Jun 15',
  'Jun 16',
  'Jun 17',
  'Jun 18',
  'Jun 19',
  'Jun 20',
  'Jun 21',
  'Jun 22',
  'Jun 23',
  'Jun 24',
  'Jun 25',
  'Jun 26',
  'Jun 27',
];

/** Last index that is observed; everything after is forecast (dashed). */
const OBSERVED_LAST_IDX = 4;

const STUB_ROUTES: RouteSummary[] = [
  {
    id: 'route-active',
    label: 'Active route',
    sentAt: 'Jun 12, 16:56Z',
    status: 'Active',
    eta: 'Jul 23, 13:42 UTC+2',
    etaUtc: 'Jul 23, 11:42Z',
    durationToGo: '37 d 4 h',
    ecaTimeToGo: '36 h',
    distanceToGo: 14_982,
    ecaDistanceToGo: 690,
    totalCostToGo: 1_870_180,
    fuelCostToGo: 1_214_380,
    color: '#1f6feb',
    series: {
      waveHeight: [1.4, 1.7, 2.1, 2.0, 1.8, 2.3, 2.6, 2.4, 2.2, 1.9, 1.6, 1.5, 1.4, 1.5, 1.6],
      wind: [12, 14, 18, 20, 22, 26, 28, 24, 22, 18, 16, 14, 13, 14, 16],
      currents: [0.6, 0.8, 1.2, 1.0, 1.1, 1.4, 1.6, 1.5, 1.3, 1.1, 0.9, 0.8, 0.7, 0.7, 0.8],
      sog: [12.0, 12.0, 12.0, 12.0, 12.0, 11.6, 11.4, 11.7, 11.9, 12.0, 12.1, 12.2, 12.2, 12.2, 12.2],
      rpm: [78, 78, 79, 79, 78, 76, 75, 77, 78, 78, 79, 80, 80, 80, 80],
      fuelRate: [32, 32, 33, 33, 32, 30, 29, 31, 32, 32, 33, 34, 34, 34, 34],
      distanceToGo: [
        14_982, 14_695, 14_410, 14_125, 13_840, 13_565, 13_295, 13_020, 12_745, 12_465, 12_180,
        11_895, 11_605, 11_315, 11_025,
      ],
      fuelCostCum: [
        0, 27_120, 55_120, 83_120, 110_240, 135_640, 160_220, 186_460, 213_580, 240_700, 268_660,
        297_460, 326_260, 355_060, 383_860,
      ],
    },
    // Singapore → around the Cape of Good Hope → Rotterdam.
    path: [
      [1.27, 103.83],
      [3.0, 96.0],
      [5.0, 80.0],
      [3.0, 70.0],
      [-3.0, 60.0],
      [-15.0, 55.0],
      [-25.0, 50.0],
      [-35.0, 22.0],
      [-25.0, 12.0],
      [-10.0, 0.0],
      [5.0, -15.0],
      [20.0, -25.0],
      [40.0, -10.0],
      [50.0, 0.0],
      [51.95, 4.0],
    ],
  },
  {
    id: 'route-eco',
    label: 'ECO speed (-0.4 kt)',
    sentAt: 'Jun 12, 17:10Z',
    status: 'Sent',
    eta: 'Jul 24, 19:00 UTC+2',
    etaUtc: 'Jul 24, 17:00Z',
    durationToGo: '38 d 9 h',
    ecaTimeToGo: '38 h',
    distanceToGo: 14_982,
    ecaDistanceToGo: 690,
    totalCostToGo: 1_805_400,
    fuelCostToGo: 1_140_900,
    color: '#56d364',
    series: {
      waveHeight: [1.3, 1.6, 1.9, 1.8, 1.7, 2.0, 2.3, 2.2, 2.0, 1.8, 1.5, 1.4, 1.3, 1.4, 1.5],
      wind: [11, 13, 16, 18, 20, 23, 25, 22, 20, 17, 15, 13, 12, 13, 15],
      currents: [0.6, 0.7, 1.1, 0.9, 1.0, 1.3, 1.4, 1.3, 1.1, 1.0, 0.8, 0.7, 0.6, 0.6, 0.7],
      sog: [11.6, 11.6, 11.6, 11.6, 11.6, 11.3, 11.1, 11.4, 11.5, 11.6, 11.7, 11.8, 11.8, 11.8, 11.8],
      rpm: [73, 73, 74, 74, 73, 71, 70, 72, 73, 73, 74, 75, 75, 75, 75],
      fuelRate: [27, 27, 28, 28, 27, 25, 24, 26, 27, 27, 28, 29, 29, 29, 29],
      distanceToGo: [
        14_982, 14_704, 14_430, 14_157, 13_884, 13_614, 13_348, 13_078, 12_807, 12_530, 12_252,
        11_972, 11_690, 11_408, 11_124,
      ],
      fuelCostCum: [
        0, 22_950, 46_750, 70_550, 93_500, 114_750, 135_150, 157_250, 180_200, 203_150, 226_950,
        251_600, 276_250, 300_900, 325_550,
      ],
    },
    // Same overall track as the active route, slightly south so it
    // can be told apart on the map.
    path: [
      [1.27, 103.83],
      [2.5, 95.0],
      [4.5, 79.0],
      [2.0, 68.0],
      [-4.0, 58.0],
      [-17.0, 53.0],
      [-27.0, 48.0],
      [-37.0, 20.0],
      [-26.0, 10.0],
      [-12.0, -2.0],
      [3.0, -17.0],
      [18.0, -26.0],
      [38.0, -12.0],
      [49.0, -1.0],
      [51.95, 4.0],
    ],
  },
  {
    id: 'route-suez',
    label: 'Via Suez Canal',
    sentAt: 'Jun 12, 17:18Z',
    status: 'Draft',
    eta: 'Jul 14, 06:30 UTC+2',
    etaUtc: 'Jul 14, 04:30Z',
    durationToGo: '27 d 18 h',
    ecaTimeToGo: '54 h',
    distanceToGo: 9_780,
    ecaDistanceToGo: 1_120,
    totalCostToGo: 1_640_950,
    fuelCostToGo: 870_410,
    color: '#f0b429',
    series: {
      waveHeight: [1.1, 1.3, 1.5, 1.6, 1.8, 1.9, 1.7, 1.5, 1.4, 1.3, 1.2, 1.1, 1.0, 1.0, 1.0],
      wind: [10, 12, 15, 17, 19, 22, 21, 18, 16, 14, 12, 11, 10, 10, 10],
      currents: [0.5, 0.6, 0.9, 1.0, 1.2, 1.3, 1.2, 1.0, 0.9, 0.8, 0.7, 0.6, 0.6, 0.5, 0.5],
      sog: [12.4, 12.4, 12.5, 12.5, 12.5, 12.2, 12.0, 12.3, 12.5, 12.6, 12.6, 12.7, 12.7, 12.7, 12.7],
      rpm: [80, 80, 81, 81, 80, 78, 77, 79, 80, 81, 81, 82, 82, 82, 82],
      fuelRate: [33, 33, 34, 34, 33, 31, 30, 32, 33, 34, 34, 35, 35, 35, 35],
      distanceToGo: [
        9_780, 9_482, 9_182, 8_882, 8_582, 8_293, 8_005, 7_710, 7_415, 7_115, 6_815, 6_510, 6_205,
        5_898, 5_590,
      ],
      fuelCostCum: [
        0, 19_580, 39_780, 59_980, 79_520, 97_300, 114_440, 132_720, 151_800, 171_480, 191_080,
        211_300, 231_600, 251_920, 272_240,
      ],
    },
    // Singapore → Indian Ocean → Bab-el-Mandeb → Suez Canal → Med →
    // Gibraltar → Bay of Biscay → Rotterdam.
    path: [
      [1.27, 103.83],
      [8.0, 95.0],
      [5.0, 78.0],
      [10.0, 65.0],
      [12.5, 50.0],
      [13.0, 43.0],
      [20.0, 38.0],
      [28.0, 33.0],
      [30.0, 32.5],
      [33.5, 27.0],
      [35.5, 18.0],
      [36.0, -5.5],
      [38.0, -10.0],
      [47.0, -5.0],
      [51.95, 4.0],
    ],
  },
];

const PLAY_DURATION_MS = 9000;

const DEFAULT_VESSEL_NAME = 'MV Atlantic Voyager';
const DEFAULT_VESSEL_CLIENT = 'Acme Shipping (owner)';
const DEFAULT_VOYAGE_LABEL = 'Singapore → Rotterdam';
const DEFAULT_VOYAGE_REF = 'BL-88421';

function formatNumber(n: number, fractionDigits = 0): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatCurrency(n: number): string {
  return `US$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatParam(n: number, param: ParamDef): string {
  if (param.id === 'fuelCostCum') return formatCurrency(n);
  return `${formatNumber(n, param.fractionDigits)} ${param.unit}`;
}

/**
 * Linearly interpolate a numeric series between adjacent samples at the
 * fractional position `progress` (0..series.length-1). Returns 0 when the
 * series is empty.
 */
function sampleSeries(series: number[] | undefined, progress: number): number {
  if (!series || series.length === 0) return 0;
  const last = series.length - 1;
  const p = Math.max(0, Math.min(last, progress));
  const i0 = Math.floor(p);
  const i1 = Math.min(last, i0 + 1);
  const t = p - i0;
  return series[i0] * (1 - t) + series[i1] * t;
}

/** Linearly interpolate a `[lat, lon]` polyline at fractional `progress`. */
function samplePath(
  path: Array<[number, number]>,
  progress: number,
): [number, number] {
  const last = path.length - 1;
  if (last < 0) return [0, 0];
  const p = Math.max(0, Math.min(last, progress));
  const i0 = Math.floor(p);
  const i1 = Math.min(last, i0 + 1);
  const t = p - i0;
  const [lat0, lon0] = path[i0];
  const [lat1, lon1] = path[i1];
  return [lat0 * (1 - t) + lat1 * t, lon0 * (1 - t) + lon1 * t];
}

/** Parse a "37 d 4 h" style duration into total hours. */
function durationToHours(s: string): number {
  const d = /([\d.]+)\s*d/.exec(s);
  const h = /([\d.]+)\s*h/.exec(s);
  const days = d ? parseFloat(d[1]) : 0;
  const hours = h ? parseFloat(h[1]) : 0;
  const total = days * 24 + hours;
  return total > 0 ? total : 1;
}

export function RouteSimulatorPage() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const selectedVoyage = useSelectedVoyage();
  const VESSEL_NAME = selectedVoyage?.vessel ?? DEFAULT_VESSEL_NAME;
  const VESSEL_CLIENT = selectedVoyage ? `${selectedVoyage.client} (owner)` : DEFAULT_VESSEL_CLIENT;
  const VOYAGE_LABEL = selectedVoyage
    ? `${selectedVoyage.portFrom} → ${selectedVoyage.portTo}`
    : DEFAULT_VOYAGE_LABEL;
  const VOYAGE_REF = selectedVoyage?.routeRef ?? DEFAULT_VOYAGE_REF;

  const [activeRouteId, setActiveRouteId] = useState<string>(STUB_ROUTES[0].id);
  const [paramId, setParamId] = useState<ParamId>('waveHeight');
  /**
   * Global playback clock in `[0, 1]` representing elapsed voyage time as a
   * fraction of the *longest* route's duration. Each route converts this
   * shared clock into its own position using its ETA/duration, so a faster
   * vessel (shorter duration) advances along its path quicker and reaches
   * its destination earlier — every parameter then follows that movement.
   */
  const [clock, setClock] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const lastIdx = TIMELINE_DAYS.length - 1;

  // Per-route voyage durations (hours) and the longest one, which sets the
  // length of the global clock so the slowest vessel finishes at clock = 1.
  const routeHours = useMemo(
    () =>
      STUB_ROUTES.reduce<Record<string, number>>((acc, r) => {
        acc[r.id] = durationToHours(r.durationToGo);
        return acc;
      }, {}),
    [],
  );
  const maxHours = useMemo(
    () => Math.max(...Object.values(routeHours)),
    [routeHours],
  );

  /**
   * Convert the global clock into a route's own fractional path index
   * (0..lastIdx). The vessel arrives (reaches lastIdx) when elapsed voyage
   * time equals its own duration, i.e. at its ETA.
   */
  const progressById = useMemo(() => {
    const out: Record<string, number> = {};
    STUB_ROUTES.forEach((r) => {
      const frac = Math.min(1, (clock * maxHours) / routeHours[r.id]);
      out[r.id] = frac * lastIdx;
    });
    return out;
  }, [clock, maxHours, routeHours, lastIdx]);

  // Auto-play loop driven by requestAnimationFrame so the marker and values
  // animate at display refresh rate instead of jumping in discrete day steps.
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTsRef.current = null;
      return;
    }
    const speed = 1 / PLAY_DURATION_MS; // clock units per ms
    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      setClock((prev) => {
        const next = prev + dt * speed;
        return next >= 1 ? 0 : next;
      });
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTsRef.current = null;
    };
  }, [isPlaying]);

  // Timeline labels follow the active route's own progress along its path.
  const activeProgress = progressById[activeRouteId] ?? 0;
  /** Snap progress to the nearest day for day-label / observed-vs-forecast. */
  const dayIdx = Math.min(lastIdx, Math.max(0, Math.round(activeProgress)));

  const activeParam = PARAMS.find((p) => p.id === paramId) ?? PARAMS[0];

  return (
    <div className="fv-route">
      <header className="fv-route__header">
        <div className="fv-route__voyage-info">
          <div className="fv-route__title">
            <strong>{VESSEL_NAME}</strong>
            <span className="fv-route__sep">/</span>
            <span className="fv-route__client">{VESSEL_CLIENT}</span>
          </div>
          <div className="fv-route__voyage">
            <strong>{VOYAGE_LABEL}</strong>
            <span className="fv-route__sep">·</span>
            <span>{VOYAGE_REF}</span>
            <span className="fv-route__sep">·</span>
            <span>
              {STUB_ROUTES.length} {t('routes', 'routes')}
            </span>
          </div>
        </div>
      </header>

      <section className="fv-route__section">
        <header className="fv-route__section-header fv-route__sim-header">
          <div className="fv-route__sim-title">
            <h2>{t('routeSimulator', 'Route Simulator')}</h2>
            <p className="fv-route__sim-sub">
              {t(
                'routeSimulatorHint',
                'Compare every route on the same parameter. Press play or drag the slider to scrub through the voyage day-by-day.',
              )}
            </p>
          </div>
          <label className="fv-route__param-picker">
            <span>{t('parameter', 'Parameter')}</span>
            <select
              value={paramId}
              onChange={(e) => setParamId(e.target.value as ParamId)}
            >
              {PARAMS.map((param) => (
                <option key={param.id} value={param.id}>
                  {param.label} ({param.unit})
                </option>
              ))}
            </select>
          </label>
        </header>

        <div className="fv-route__sim-grid">
          <div className="fv-route__sim-cards">
            {STUB_ROUTES.map((route) => {
              const routeProgress = progressById[route.id] ?? 0;
              const value = sampleSeries(route.series[paramId], routeProgress);
              const final = route.series[paramId][lastIdx] ?? 0;
              const start = route.series[paramId][0] ?? 0;
              const delta = value - start;
              const isActive = route.id === activeRouteId;
              const arrived = routeProgress >= lastIdx - 1e-6;
              return (
                <button
                  type="button"
                  key={route.id}
                  className={`fv-route__sim-card${
                    isActive ? ' fv-route__sim-card--active' : ''
                  }`}
                  onClick={() => setActiveRouteId(route.id)}
                  style={{ borderColor: route.color }}
                >
                  <header>
                    <span
                      className="fv-route__swatch"
                      style={{ background: route.color }}
                      aria-hidden="true"
                    />
                    <strong>{route.label}</strong>
                    <span
                      className={`fv-route__status fv-route__status--${route.status.toLowerCase()}`}
                    >
                      {route.status}
                    </span>
                  </header>
                  <dl>
                    <div>
                      <dt>{t('current', 'Current')}</dt>
                      <dd>{formatParam(value, activeParam)}</dd>
                    </div>
                    <div>
                      <dt>Δ {t('fromStart', 'from start')}</dt>
                      <dd
                        className={
                          delta > 0
                            ? 'fv-route__delta fv-route__delta--up'
                            : delta < 0
                            ? 'fv-route__delta fv-route__delta--down'
                            : 'fv-route__delta'
                        }
                      >
                        {delta > 0 ? '+' : ''}
                        {formatParam(delta, activeParam)}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('finalValue', 'At ETA')}</dt>
                      <dd>{formatParam(final, activeParam)}</dd>
                    </div>
                    <div>
                      <dt>{t('eta', 'ETA')}</dt>
                      <dd>
                        {route.eta}
                        {arrived && (
                          <span className="fv-route__arrived" title={t('arrived', 'Arrived')}>
                            {' '}
                            <i className="fas fa-flag-checkered" aria-hidden="true" />{' '}
                            {t('arrived', 'Arrived')}
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>
                </button>
              );
            })}
          </div>

          <div className="fv-route__sim-chart-wrap">
            <RouteMap
              routes={STUB_ROUTES}
              param={activeParam}
              progressById={progressById}
              activeRouteId={activeRouteId}
              onSelectRoute={setActiveRouteId}
            />

            <div className="fv-route__sim-controls">
              <button
                type="button"
                className="fv-route__icon-btn"
                onClick={() => {
                  setIsPlaying(false);
                  setClock(0);
                }}
                title={t('first', 'First')}
                aria-label={t('first', 'First')}
              >
                <i className="fas fa-step-backward" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`fv-route__play-btn${
                  isPlaying ? ' fv-route__play-btn--on' : ''
                }`}
                onClick={() => setIsPlaying((prev) => !prev)}
                aria-label={isPlaying ? t('pause', 'Pause') : t('play', 'Play')}
              >
                <i
                  className={isPlaying ? 'fas fa-pause' : 'fas fa-play'}
                  aria-hidden="true"
                />
                <span>{isPlaying ? t('pause', 'Pause') : t('play', 'Play')}</span>
              </button>
              <button
                type="button"
                className="fv-route__icon-btn"
                onClick={() => {
                  setIsPlaying(false);
                  setClock(1);
                }}
                title={t('last', 'Last')}
                aria-label={t('last', 'Last')}
              >
                <i className="fas fa-step-forward" aria-hidden="true" />
              </button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.0001}
                value={clock}
                onChange={(e) => {
                  setIsPlaying(false);
                  setClock(Number(e.target.value));
                }}
                className="fv-route__slider"
                aria-label={t('timelineSlider', 'Timeline')}
                style={
                  {
                    '--fv-progress': `${clock * 100}%`,
                  } as CSSProperties
                }
              />

              <span className="fv-route__playback-label">
                {TIMELINE_DAYS[dayIdx]} ·{' '}
                {dayIdx <= OBSERVED_LAST_IDX
                  ? t('observed', 'observed')
                  : t('forecast', 'forecast')}{' '}
                · {t('day', 'day')} {dayIdx + 1} / {TIMELINE_DAYS.length}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

interface RouteMapProps {
  routes: RouteSummary[];
  param: ParamDef;
  /** Per-route continuous timeline position (0..path.length-1, fractional). */
  progressById: Record<string, number>;
  activeRouteId: string;
  onSelectRoute: (id: string) => void;
}

/** Shared bounds so the map fits all three routes the first time. */
const MAP_BOUNDS: L.LatLngBoundsExpression = [
  [-45, -40],
  [55, 115],
];

function shipIcon(color: string, isActive: boolean): L.DivIcon {
  const size = isActive ? 30 : 24;
  return L.divIcon({
    className: 'fv-route__ship-icon-wrap',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <span class="fv-route__ship-icon${
        isActive ? ' fv-route__ship-icon--active' : ''
      }" style="background:${color};width:${size}px;height:${size}px">
        <i class="fas fa-ship" aria-hidden="true"></i>
      </span>
    `,
  });
}

function formatTooltip(
  route: RouteSummary,
  param: ParamDef,
  progress: number,
): string {
  const value = sampleSeries(route.series[param.id], progress);
  return `${route.label} — ${formatParam(value, param)}`;
}

function RouteMap({
  routes,
  param,
  progressById,
  activeRouteId,
  onSelectRoute,
}: RouteMapProps) {
  // Memoize icons so we don't recreate them on every render.
  const icons = useMemo(() => {
    const map = new Map<string, { active: L.DivIcon; inactive: L.DivIcon }>();
    routes.forEach((r) => {
      map.set(r.id, {
        active: shipIcon(r.color, true),
        inactive: shipIcon(r.color, false),
      });
    });
    return map;
  }, [routes]);

  return (
    <div className="fv-route__sim-map">
      <MapContainer
        bounds={MAP_BOUNDS}
        minZoom={2}
        maxZoom={10}
        worldCopyJump
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution="Tiles &copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}"
          maxNativeZoom={10}
          crossOrigin="anonymous"
        />

        {routes.map((route) => {
          const isActive = route.id === activeRouteId;
          const positions: LatLngExpression[] = route.path.map(
            ([lat, lon]) => [lat, lon],
          );
          return (
            <Polyline
              key={`line-${route.id}`}
              positions={positions}
              pathOptions={{
                color: route.color,
                weight: isActive ? 4 : 2.5,
                opacity: isActive ? 0.95 : 0.55,
                dashArray: isActive ? undefined : '6 6',
              }}
              eventHandlers={{ click: () => onSelectRoute(route.id) }}
            />
          );
        })}

        {routes.map((route) => {
          const isActive = route.id === activeRouteId;
          const routeProgress = progressById[route.id] ?? 0;
          const pos = samplePath(route.path, routeProgress);
          const icon = icons.get(route.id);
          if (!icon) return null;
          return (
            <Marker
              key={`ship-${route.id}`}
              position={pos}
              icon={isActive ? icon.active : icon.inactive}
              eventHandlers={{ click: () => onSelectRoute(route.id) }}
              zIndexOffset={isActive ? 1000 : 0}
            >
              <Tooltip
                direction="top"
                offset={[0, -12]}
                opacity={1}
                permanent={isActive}
                className="fv-route__ship-tooltip"
              >
                {formatTooltip(route, param, routeProgress)}
              </Tooltip>
            </Marker>
          );
        })}

        <AreaConstraintsControl position="topright" />
        <WeatherFieldControl position="topright" />
        <WeatherPointControl position="topright" />
        <MapCursorPosition />
      </MapContainer>

      <div className="fv-route__map-legend">
        {routes.map((route) => {
          const value = sampleSeries(route.series[param.id], progressById[route.id] ?? 0);
          const isActive = route.id === activeRouteId;
          return (
            <button
              type="button"
              key={`legend-${route.id}`}
              className={`fv-route__map-legend-item${
                isActive ? ' fv-route__map-legend-item--active' : ''
              }`}
              onClick={() => onSelectRoute(route.id)}
            >
              <span
                className="fv-route__swatch"
                style={{ background: route.color }}
                aria-hidden="true"
              />
              <span className="fv-route__map-legend-label">{route.label}</span>
              <span className="fv-route__map-legend-value">
                {formatParam(value, param)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
