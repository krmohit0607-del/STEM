import {
  type CSSProperties,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useL } from '../i18n/LocalizationProvider';

/**
 * Route Simulator page — `/route-simulator`.
 *
 * Compares every available route on the same parameter using a
 * multi-route overlay chart. A play / pause button and a timeline
 * slider scrub through each voyage day-by-day so users can see how
 * the parameter evolves across all candidate routes simultaneously.
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
  },
];

const PLAY_INTERVAL_MS = 600;

const VESSEL_NAME = 'MV Atlantic Voyager';
const VESSEL_CLIENT = 'Acme Shipping (owner)';
const VOYAGE_LABEL = 'Singapore → Rotterdam';
const VOYAGE_REF = 'BL-88421';

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

export function RouteSimulatorPage() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const [activeRouteId, setActiveRouteId] = useState<string>(STUB_ROUTES[0].id);
  const [paramId, setParamId] = useState<ParamId>('waveHeight');
  const [playbackIdx, setPlaybackIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const playTimerRef = useRef<number | null>(null);

  // Auto-play loop. Advances `playbackIdx` every PLAY_INTERVAL_MS while
  // `isPlaying` is true, looping back to 0 at the end.
  useEffect(() => {
    if (!isPlaying) {
      if (playTimerRef.current != null) {
        window.clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
      return;
    }
    playTimerRef.current = window.setInterval(() => {
      setPlaybackIdx((prev) => {
        const next = prev + 1;
        if (next >= TIMELINE_DAYS.length) {
          return 0;
        }
        return next;
      });
    }, PLAY_INTERVAL_MS);
    return () => {
      if (playTimerRef.current != null) {
        window.clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
    };
  }, [isPlaying]);

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
              const value = route.series[paramId][playbackIdx] ?? 0;
              const final = route.series[paramId][TIMELINE_DAYS.length - 1] ?? 0;
              const start = route.series[paramId][0] ?? 0;
              const delta = value - start;
              const isActive = route.id === activeRouteId;
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
                      <dd>{route.eta}</dd>
                    </div>
                  </dl>
                </button>
              );
            })}
          </div>

          <div className="fv-route__sim-chart-wrap">
            <SimulationChart
              routes={STUB_ROUTES}
              days={TIMELINE_DAYS}
              param={activeParam}
              activeIdx={playbackIdx}
              onPick={setPlaybackIdx}
              activeRouteId={activeRouteId}
              observedLastIdx={OBSERVED_LAST_IDX}
            />

            <div className="fv-route__sim-controls">
              <button
                type="button"
                className="fv-route__icon-btn"
                onClick={() => {
                  setIsPlaying(false);
                  setPlaybackIdx(0);
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
                  setPlaybackIdx(TIMELINE_DAYS.length - 1);
                }}
                title={t('last', 'Last')}
                aria-label={t('last', 'Last')}
              >
                <i className="fas fa-step-forward" aria-hidden="true" />
              </button>

              <input
                type="range"
                min={0}
                max={TIMELINE_DAYS.length - 1}
                step={1}
                value={playbackIdx}
                onChange={(e) => {
                  setIsPlaying(false);
                  setPlaybackIdx(Number(e.target.value));
                }}
                className="fv-route__slider"
                aria-label={t('timelineSlider', 'Timeline')}
                style={
                  {
                    '--fv-progress': `${
                      (playbackIdx / (TIMELINE_DAYS.length - 1)) * 100
                    }%`,
                  } as CSSProperties
                }
              />

              <span className="fv-route__playback-label">
                {TIMELINE_DAYS[playbackIdx]} ·{' '}
                {playbackIdx <= OBSERVED_LAST_IDX
                  ? t('observed', 'observed')
                  : t('forecast', 'forecast')}{' '}
                · {t('day', 'day')} {playbackIdx + 1} / {TIMELINE_DAYS.length}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

interface SimulationChartProps {
  routes: RouteSummary[];
  days: string[];
  param: ParamDef;
  activeIdx: number;
  onPick: (idx: number) => void;
  activeRouteId: string;
  /** Last index that is observed; everything after is forecast (dashed). */
  observedLastIdx: number;
}

const CHART_W = 880;
const CHART_H = 240;
const CHART_PAD = { top: 22, right: 16, bottom: 40, left: 56 };

function SimulationChart({
  routes,
  days,
  param,
  activeIdx,
  onPick,
  activeRouteId,
  observedLastIdx,
}: SimulationChartProps) {
  if (days.length === 0 || routes.length === 0) return null;

  const innerW = CHART_W - CHART_PAD.left - CHART_PAD.right;
  const innerH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;

  const allValues = routes.flatMap((r) => r.series[param.id] ?? []);
  const dataMin = Math.min(...allValues);
  const dataMax = Math.max(...allValues);
  const tickMin = param.ticks ? Math.min(...param.ticks) : dataMin;
  const tickMax = param.ticks ? Math.max(...param.ticks) : dataMax;
  let min = Math.min(dataMin, tickMin);
  let max = Math.max(dataMax, tickMax);
  if (min === max) {
    max = min + 1;
  }
  const pad = (max - min) * 0.08;
  min -= pad;
  max += pad;
  const range = max - min;

  const xAt = (i: number) =>
    days.length === 1
      ? CHART_PAD.left + innerW / 2
      : CHART_PAD.left + (i / (days.length - 1)) * innerW;
  const yAt = (v: number) =>
    CHART_PAD.top + innerH - ((v - min) / range) * innerH;

  const ticks = (param.ticks ?? [min, (min + max) / 2, max]).filter(
    (tick) => tick >= min - 1e-6 && tick <= max + 1e-6,
  );

  const formatTick = (tick: number) => {
    if (param.id === 'fuelCostCum') {
      if (Math.abs(tick) >= 1000) return `$${Math.round(tick / 1000)}k`;
      return `$${Math.round(tick)}`;
    }
    if (Math.abs(tick) >= 1000) return `${Math.round(tick / 1000)}k`;
    return tick.toLocaleString(undefined, {
      minimumFractionDigits: param.fractionDigits,
      maximumFractionDigits: param.fractionDigits,
    });
  };

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="fv-route__chart"
      role="img"
      aria-label={`${param.label} along route, multi-route comparison`}
    >
      {observedLastIdx >= 0 && observedLastIdx < days.length - 1 && (
        <rect
          x={xAt(observedLastIdx)}
          y={CHART_PAD.top}
          width={xAt(days.length - 1) - xAt(observedLastIdx)}
          height={innerH}
          fill="#58a6ff"
          fillOpacity={0.05}
        />
      )}

      {ticks.map((tick) => (
        <g key={`y-${tick}`}>
          <line
            x1={CHART_PAD.left}
            x2={CHART_W - CHART_PAD.right}
            y1={yAt(tick)}
            y2={yAt(tick)}
            stroke="#2a3447"
          />
          <text
            x={CHART_PAD.left - 8}
            y={yAt(tick) + 3}
            fill="#8b949e"
            fontSize="10"
            textAnchor="end"
          >
            {formatTick(tick)}
          </text>
        </g>
      ))}

      {param.threshold != null &&
        param.threshold >= min &&
        param.threshold <= max && (
          <line
            x1={CHART_PAD.left}
            x2={CHART_W - CHART_PAD.right}
            y1={yAt(param.threshold)}
            y2={yAt(param.threshold)}
            stroke="#ff7b72"
            strokeDasharray="6,4"
          />
        )}

      {days.map((day, i) =>
        i % 2 === 0 || i === days.length - 1 ? (
          <text
            key={`x-${i}`}
            x={xAt(i)}
            y={CHART_PAD.top + innerH + 18}
            fill="#8b949e"
            fontSize="10"
            textAnchor="middle"
          >
            {day}
          </text>
        ) : null,
      )}

      <line
        x1={xAt(activeIdx)}
        x2={xAt(activeIdx)}
        y1={CHART_PAD.top}
        y2={CHART_PAD.top + innerH}
        stroke="#58a6ff"
        strokeWidth={1.5}
        strokeDasharray="3,3"
      />

      {routes.map((route) => {
        const series = route.series[param.id] ?? [];
        if (series.length === 0) return null;
        const isActive = route.id === activeRouteId;
        const observedSeg: string[] = [];
        const forecastSeg: string[] = [];
        for (let i = 0; i < days.length; i += 1) {
          const v = series[i];
          if (v == null) continue;
          const coord = `${xAt(i)},${yAt(v)}`;
          if (i <= observedLastIdx) observedSeg.push(coord);
          if (i >= observedLastIdx) forecastSeg.push(coord);
        }
        const stroke = route.color;
        const opacity = isActive ? 1 : 0.55;
        return (
          <g key={route.id}>
            {observedSeg.length > 1 && (
              <polyline
                points={observedSeg.join(' ')}
                fill="none"
                stroke={stroke}
                strokeOpacity={opacity}
                strokeWidth={isActive ? 3 : 2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {forecastSeg.length > 1 && (
              <polyline
                points={forecastSeg.join(' ')}
                fill="none"
                stroke={stroke}
                strokeOpacity={opacity * 0.85}
                strokeWidth={isActive ? 3 : 2}
                strokeDasharray="4,4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {series.map((value, i) => {
              if (value == null) return null;
              const isMarker = i === activeIdx;
              return (
                <circle
                  key={`${route.id}-pt-${i}`}
                  cx={xAt(i)}
                  cy={yAt(value)}
                  r={isMarker ? (isActive ? 5.5 : 4) : isActive ? 3.5 : 2.5}
                  fill={stroke}
                  fillOpacity={opacity}
                  stroke={isMarker ? '#fff' : 'none'}
                  strokeWidth={isMarker ? 2 : 0}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onPick(i)}
                >
                  <title>
                    {`${route.label} · ${days[i]}: ${formatParam(value, param)}`}
                  </title>
                </circle>
              );
            })}
          </g>
        );
      })}

      <g pointerEvents="none">
        <rect
          x={xAt(activeIdx) - 36}
          y={CHART_PAD.top - 18}
          width={72}
          height={18}
          rx={9}
          fill="#1f6feb"
        />
        <text
          x={xAt(activeIdx)}
          y={CHART_PAD.top - 4}
          fill="#fff"
          fontSize="10"
          fontWeight="700"
          textAnchor="middle"
        >
          {days[activeIdx]}
        </text>
      </g>
    </svg>
  );
}
