import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';

import { useTheme } from '../theme';
import { WeatherFieldControl } from './WeatherFieldControl';
import {
  getOptimizationData,
  type OptimizationData,
  type RouteOption,
  type SpeedFuelPoint,
} from '../data/optimization';

/**
 * Voyage Optimization Studio — `/optimization-studio`.
 *
 * A weather-routing comparison workspace: voyage inputs and objective
 * controls on the left, an interactive route map with a playback
 * timeline and analysis tabs in the centre, and ranked route options
 * with an AI recommendation on the right.
 *
 * All content is rendered from the `OptimizationData` payload loaded via
 * `getOptimizationData()`, so the screen is fully driven by backend data
 * (see `src/data/optimization.ts`).
 */

/** Recenter the map whenever the active route changes. */
function FitRoute({ path }: { path: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (!path.length) return;
    const bounds = L.latLngBounds(path.map(([lat, lon]) => [lat, lon]));
    map.fitBounds(bounds, { padding: [40, 40] });
    const id = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(id);
  }, [map, path]);
  return null;
}

/** Compact, dependency-free line chart for the speed/fuel/cost curve. */
function SpeedFuelChart({ points }: { points: SpeedFuelPoint[] }) {
  const W = 360;
  const H = 220;
  const pad = { top: 16, right: 36, bottom: 28, left: 36 };
  const speeds = points.map((p) => p.speed);
  const minSpeed = Math.min(...speeds);
  const maxSpeed = Math.max(...speeds);
  const maxFuel = Math.max(...points.map((p) => p.fuelMt)) * 1.1;
  const maxCost = Math.max(...points.map((p) => p.costK)) * 1.1;

  const x = (s: number) =>
    pad.left + ((s - minSpeed) / (maxSpeed - minSpeed)) * (W - pad.left - pad.right);
  const yFuel = (v: number) =>
    H - pad.bottom - (v / maxFuel) * (H - pad.top - pad.bottom);
  const yCost = (v: number) =>
    H - pad.bottom - (v / maxCost) * (H - pad.top - pad.bottom);

  const fuelLine = points.map((p) => `${x(p.speed)},${yFuel(p.fuelMt)}`).join(' ');
  const costLine = points.map((p) => `${x(p.speed)},${yCost(p.costK)}`).join(' ');

  return (
    <svg
      className="fv-opt-chart"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Speed versus fuel and cost curve"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((g) => {
        const yy = pad.top + g * (H - pad.top - pad.bottom);
        return (
          <line
            key={g}
            x1={pad.left}
            x2={W - pad.right}
            y1={yy}
            y2={yy}
            className="fv-opt-chart__grid"
          />
        );
      })}
      <polyline className="fv-opt-chart__fuel" points={fuelLine} />
      <polyline className="fv-opt-chart__cost" points={costLine} />
      {points.map((p) => (
        <g key={p.speed}>
          <circle className="fv-opt-chart__dot-fuel" cx={x(p.speed)} cy={yFuel(p.fuelMt)} r={2.5} />
          <circle className="fv-opt-chart__dot-cost" cx={x(p.speed)} cy={yCost(p.costK)} r={2.5} />
        </g>
      ))}
      {points
        .filter((_, i) => i % 2 === 0)
        .map((p) => (
          <text key={p.speed} x={x(p.speed)} y={H - 8} className="fv-opt-chart__axis">
            {p.speed}
          </text>
        ))}
    </svg>
  );
}

const TABS_CENTER = ['Route Map', 'Waypoints', 'Summary'] as const;
const TABS_BOTTOM = [
  'ETA & Speed',
  'Bunker ROB',
  'Cost Breakdown',
  'Deviation Analysis',
  'Weather Summary',
  'Performance',
  'Documents',
] as const;

export function OptimizationStudioPage() {
  const [theme] = useTheme();
  const [data, setData] = useState<OptimizationData | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [layers, setLayers] = useState<Record<string, boolean>>({});
  const [centerTab, setCenterTab] = useState<(typeof TABS_CENTER)[number]>('Route Map');
  const [bottomTab, setBottomTab] = useState<(typeof TABS_BOTTOM)[number]>('ETA & Speed');
  const [playing, setPlaying] = useState(false);
  const [timelinePct, setTimelinePct] = useState(50);
  const timelineRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    getOptimizationData().then((d) => {
      if (!active) return;
      setData(d);
      setSelectedRouteId(d.routeOptions.find((r) => r.selected)?.id ?? d.routeOptions[0]?.id ?? null);
      setLayers(Object.fromEntries(d.weatherLayers.map((w) => [w.id, w.on])));
    });
    return () => {
      active = false;
    };
  }, []);

  // Animate the playback timeline while playing.
  useEffect(() => {
    if (!playing) {
      if (timelineRef.current) window.clearInterval(timelineRef.current);
      return;
    }
    timelineRef.current = window.setInterval(() => {
      setTimelinePct((p) => (p >= 100 ? 0 : p + 1));
    }, 120);
    return () => {
      if (timelineRef.current) window.clearInterval(timelineRef.current);
    };
  }, [playing]);

  const selectedRoute = useMemo<RouteOption | null>(
    () => data?.routeOptions.find((r) => r.id === selectedRouteId) ?? null,
    [data, selectedRouteId],
  );

  const tileUrl =
    theme === 'light'
      ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';

  if (!data) {
    return (
      <div className="fv-opt-loading">
        <i className="fas fa-circle-notch fa-spin" aria-hidden="true" />
        <span>Loading optimization studio…</span>
      </div>
    );
  }

  const { voyage, keySummary, aiRecommendation } = data;

  const toggleLayer = (id: string) =>
    setLayers((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="fv-opt">
      {/* Left rail — voyage inputs and objective controls. */}
      <aside className="fv-opt-left">
        <Section n={1} title="Voyage Details">
          <div className="fv-opt-grid2">
            <Field label="From">
              <div className="fv-opt-pill">{`${voyage.fromName} (${voyage.fromCode})`}</div>
            </Field>
            <Field label="To">
              <div className="fv-opt-pill">{`${voyage.toName} (${voyage.toCode})`}</div>
            </Field>
          </div>
          <Field label="Departure (UTC)">
            <div className="fv-opt-input">
              <span>{voyage.departureUtc}</span>
              <i className="fas fa-calendar" aria-hidden="true" />
            </div>
          </Field>
          <div className="fv-opt-row-between">
            <span className="fv-opt-label">Current Position</span>
            <span className="fv-opt-live">
              <i className="fas fa-circle" aria-hidden="true" /> Live position
            </span>
          </div>
          <div className="fv-opt-input">
            <span>{voyage.currentPositionUtc}</span>
            <i className="fas fa-calendar" aria-hidden="true" />
          </div>
          <div className="fv-opt-stat3">
            <Stat label="Distance" value={voyage.distanceNm} />
            <Stat label="Draft" value={voyage.draft} />
            <Stat label="Displacement" value={voyage.displacement} />
          </div>
        </Section>

        <Section n={2} title="Optimization Objective">
          <Field label="Primary Objective">
            <Select
              value={data.selectedObjectiveId}
              options={data.objectives}
              icon="fa-bullseye"
            />
          </Field>
          <Field label="Weighting (Optional)">
            <div className="fv-opt-input fv-opt-input--btn">
              <span>{data.weightingLabel}</span>
              <i className="fas fa-sliders" aria-hidden="true" />
            </div>
          </Field>
        </Section>

        <Section n={3} title="Advanced Criteria">
          {data.advancedCriteria.map((c) => (
            <button key={c.id} type="button" className="fv-opt-accordion">
              <span>{c.label}</span>
              <i className="fas fa-chevron-right" aria-hidden="true" />
            </button>
          ))}
        </Section>

        <Section n={4} title="ETA Constraints (Optional)">
          <Field label="Required Arrival (LT)">
            <div className="fv-opt-input">
              <span>{data.etaConstraints.requiredArrivalLocal}</span>
              <i className="fas fa-calendar" aria-hidden="true" />
            </div>
          </Field>
          <div className="fv-opt-grid2">
            <Field label="Time Window (±)">
              <Select
                value={data.etaConstraints.timeWindow}
                options={data.etaConstraints.timeWindowOptions}
                matchLabel
              />
            </Field>
            <Field label="Priority">
              <Select
                value={data.etaConstraints.priority}
                options={data.etaConstraints.priorityOptions}
                matchLabel
              />
            </Field>
          </div>
        </Section>

        <Section n={5} title="Fuel & ROB Settings">
          <span className="fv-opt-sub">Fuel Prices (USD/MT)</span>
          <div className="fv-opt-stat3">
            <NumField label="FO" value={data.fuelRob.fuelPrices.fo} />
            <NumField label="MGO" value={data.fuelRob.fuelPrices.mgo} />
            <NumField label="BIO" value={data.fuelRob.fuelPrices.bio} />
          </div>
          <span className="fv-opt-sub">ROB at Departure (MT)</span>
          <div className="fv-opt-stat3">
            <NumField label="FO" value={data.fuelRob.robAtDeparture.fo} />
            <NumField label="MGO" value={data.fuelRob.robAtDeparture.mgo} />
            <NumField label="Reserve" value={`${data.fuelRob.robAtDeparture.reservePct} %`} />
          </div>
        </Section>

        <Section n={6} title="Speed Strategy">
          <div className="fv-opt-strategy">
            {data.speedStrategies.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`fv-opt-strategy__chip${
                  s.id === data.selectedSpeedStrategyId ? ' is-on' : ''
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Section>

        <button type="button" className="fv-opt-run">
          Run Optimization
        </button>
        <button type="button" className="fv-opt-advanced">
          <i className="fas fa-gear" aria-hidden="true" /> Advanced Settings
        </button>
      </aside>

      {/* Centre — map, timeline and analysis tabs. */}
      <section className="fv-opt-center">
        <div className="fv-opt-tabs">
          {TABS_CENTER.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`fv-opt-tab${centerTab === tab ? ' is-on' : ''}`}
              onClick={() => setCenterTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="fv-opt-weatherbar">
          <span className="fv-opt-weatherbar__title">Weather Layers</span>
          {data.weatherLayers.map((w) => (
            <button
              key={w.id}
              type="button"
              className={`fv-opt-toggle${layers[w.id] ? ' is-on' : ''}`}
              onClick={() => toggleLayer(w.id)}
            >
              <span className="fv-opt-toggle__track">
                <span className="fv-opt-toggle__thumb" />
              </span>
              {w.label}
            </button>
          ))}
          <button type="button" className="fv-opt-morelayers">
            More Layers <i className="fas fa-chevron-down" aria-hidden="true" />
          </button>
        </div>

        <div className="fv-opt-map">
          <MapContainer
            center={[-20, 20]}
            zoom={3}
            minZoom={2}
            maxZoom={12}
            worldCopyJump
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              key={theme}
              attribution="&copy; OpenStreetMap, &copy; CARTO"
              url={tileUrl}
              crossOrigin="anonymous"
            />
            <WeatherFieldControl position="topright" />
            {data.routeOptions.map((r) => {
              const isSel = r.id === selectedRouteId;
              return (
                <Polyline
                  key={r.id}
                  positions={r.path}
                  pathOptions={{
                    color: r.color,
                    weight: isSel ? 4 : 2,
                    opacity: isSel ? 1 : 0.7,
                    dashArray: r.dashed ? '6 8' : undefined,
                  }}
                  eventHandlers={{ click: () => setSelectedRouteId(r.id) }}
                >
                  <Tooltip sticky>{`${r.name} • ${r.totalCost} • ${r.fuel}`}</Tooltip>
                </Polyline>
              );
            })}
            {selectedRoute && (
              <>
                <CircleMarker
                  center={selectedRoute.path[0]}
                  radius={6}
                  pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 1 }}
                >
                  <Tooltip>{`${voyage.fromName} (${voyage.fromCode})`}</Tooltip>
                </CircleMarker>
                <CircleMarker
                  center={selectedRoute.path[selectedRoute.path.length - 1]}
                  radius={6}
                  pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1 }}
                >
                  <Tooltip>{`${voyage.toName} (${voyage.toCode})`}</Tooltip>
                </CircleMarker>
                <FitRoute path={selectedRoute.path} />
              </>
            )}
          </MapContainer>

          <div className="fv-opt-legend">
            {data.legend.map((entry) => (
              <span key={entry.id} className="fv-opt-legend__row">
                <span
                  className="fv-opt-legend__swatch"
                  style={{
                    background: entry.dashed ? 'transparent' : entry.color,
                    borderTop: entry.dashed ? `2px dashed ${entry.color}` : undefined,
                  }}
                />
                {entry.label}
              </span>
            ))}
          </div>
        </div>

        <div className="fv-opt-timeline">
          <button
            type="button"
            className="fv-opt-timeline__play"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            <i className={`fas ${playing ? 'fa-pause' : 'fa-play'}`} aria-hidden="true" />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={timelinePct}
            onChange={(e) => setTimelinePct(Number(e.target.value))}
            className="fv-opt-timeline__range"
            aria-label="Playback position"
          />
          <span className="fv-opt-timeline__time">{data.timeline.currentUtc} UTC</span>
          <span className="fv-opt-timeline__speed">
            Speed
            <input
              type="range"
              min={1}
              max={24}
              defaultValue={data.timeline.speedMultiplier}
              className="fv-opt-timeline__speed-range"
              aria-label="Playback speed"
            />
            {data.timeline.speedMultiplier}x
          </span>
          <button type="button" className="fv-opt-timeline__full" aria-label="Fullscreen">
            <i className="fas fa-expand" aria-hidden="true" />
          </button>
        </div>

        <div className="fv-opt-tabs fv-opt-tabs--bottom">
          {TABS_BOTTOM.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`fv-opt-tab${bottomTab === tab ? ' is-on' : ''}`}
              onClick={() => setBottomTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="fv-opt-analysis">
          <div className="fv-opt-analysis__col">
            <h4 className="fv-opt-analysis__title">ETA Table (Local Time)</h4>
            <table className="fv-opt-table">
              <thead>
                <tr>
                  <th>WF %</th>
                  <th>Avg Speed (kts)</th>
                  <th>TTG (dd:hh)</th>
                  <th>ETA (UTC)</th>
                  <th>ETA (LT)</th>
                  <th>Delay vs CP</th>
                </tr>
              </thead>
              <tbody>
                {data.etaTable.map((row) => (
                  <tr key={row.wf}>
                    <td>{row.wf}</td>
                    <td>{row.avgSpeed}</td>
                    <td>{row.ttg}</td>
                    <td>{row.etaUtc}</td>
                    <td>{row.etaLocal}</td>
                    <td className={`fv-opt-delay fv-opt-delay--${row.delayTone}`}>
                      {row.delayVsCp}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="fv-opt-link">
              View More Scenarios
            </button>
          </div>

          <div className="fv-opt-analysis__col fv-opt-analysis__col--chart">
            <h4 className="fv-opt-analysis__title">Speed vs Fuel Curve</h4>
            <div className="fv-opt-chart-legend">
              <span><i className="fv-opt-dot" style={{ background: '#22c55e' }} /> FO (MT)</span>
              <span><i className="fv-opt-dot" style={{ background: '#3b82f6' }} /> Total Cost (K USD)</span>
            </div>
            <SpeedFuelChart points={data.speedFuelCurve} />
            <div className="fv-opt-chart-axis">Speed (kts)</div>
          </div>

          <div className="fv-opt-analysis__col fv-opt-analysis__col--summary">
            <h4 className="fv-opt-analysis__title">Key Summary (Route {selectedRoute?.id})</h4>
            <SummaryRow label="Total Distance" value={keySummary.totalDistance} />
            <SummaryRow label="Total Time (TTG)" value={keySummary.totalTime} />
            <SummaryRow label="Avg Speed" value={keySummary.avgSpeed} />
            <SummaryRow label="Total Fuel (FO)" value={keySummary.totalFuelFo} />
            <SummaryRow label="Total Fuel (MGO)" value={keySummary.totalFuelMgo} />
            <SummaryRow label="Total Cost" value={keySummary.totalCost} strong />
            <SummaryRow label="CO₂ Emissions" value={keySummary.co2Emissions} />
            <SummaryRow label="Weather Risk" value={keySummary.weatherRisk} tone="good" />
          </div>
        </div>
      </section>

      {/* Right rail — ranked route options and AI recommendation. */}
      <aside className="fv-opt-right">
        <div className="fv-opt-right__head">
          <h3 className="fv-opt-right__title">
            Route Options <span>({data.routeOptions.length})</span>
          </h3>
          <label className="fv-opt-sortby">
            Sort by:
            <Select
              value={data.selectedSortId}
              options={data.sortOptions}
              compact
            />
          </label>
        </div>

        <div className="fv-opt-routes">
          {data.routeOptions.map((r) => {
            const isSel = r.id === selectedRouteId;
            return (
              <article
                key={r.id}
                className={`fv-opt-route${isSel ? ' is-on' : ''}`}
                style={isSel ? { borderColor: r.color } : undefined}
                onClick={() => setSelectedRouteId(r.id)}
              >
                <div className="fv-opt-route__top">
                  <span className="fv-opt-route__id" style={{ background: r.color }}>
                    {r.id}
                  </span>
                  <span className="fv-opt-route__name">
                    {r.name}
                    {r.recommended && (
                      <span className="fv-opt-route__rec"> (Recommended)</span>
                    )}
                  </span>
                  <span
                    className="fv-opt-route__score"
                    style={{ borderColor: r.scoreColor, color: r.scoreColor }}
                  >
                    {r.score}
                  </span>
                </div>
                <div className="fv-opt-route__grid">
                  <RouteMetric label="ETA (LT)" value={r.etaLocal} />
                  <RouteMetric label="Total Cost" value={r.totalCost} />
                  <RouteMetric label="Fuel" value={r.fuel} />
                  <RouteMetric
                    label="Weather Risk"
                    value={r.weatherRisk}
                    tone={r.weatherRisk === 'Medium' || r.weatherRisk === 'High' ? 'warn' : 'good'}
                  />
                  <RouteMetric label="CO₂" value={r.co2} />
                  <RouteMetric label="Distance" value={r.distance} />
                </div>
                <div className="fv-opt-route__actions">
                  <button type="button" className="fv-opt-route__details">
                    View Details
                  </button>
                  {isSel ? (
                    <span className="fv-opt-route__selected">
                      <i className="fas fa-check" aria-hidden="true" /> Selected
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="fv-opt-route__select"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRouteId(r.id);
                      }}
                    >
                      Select
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div className="fv-opt-ai">
          <h4 className="fv-opt-ai__title">AI Recommendation</h4>
          <p className="fv-opt-ai__objective">
            Based on your objective: <b>{aiRecommendation.objectiveLabel}</b>
          </p>
          <p className="fv-opt-ai__headline">
            <i className="fas fa-circle-check" aria-hidden="true" />{' '}
            <b>{aiRecommendation.routeName}</b> {aiRecommendation.headline}
          </p>
          <ul className="fv-opt-ai__list">
            {aiRecommendation.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <div className="fv-opt-ai__confidence">
            <span>Confidence Score</span>
            <span className="fv-opt-ai__confval">{aiRecommendation.confidence}%</span>
          </div>
          <div className="fv-opt-ai__bar">
            <span style={{ width: `${aiRecommendation.confidence}%` }} />
          </div>
          <button type="button" className="fv-opt-ai__apply">
            Apply This Route
          </button>
        </div>

        <button type="button" className="fv-opt-report">
          <i className="fas fa-download" aria-hidden="true" /> Generate Report
        </button>
      </aside>
    </div>
  );
}

/* ---- small presentational helpers ---- */

function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fv-opt-section">
      <div className="fv-opt-section__head">
        <span className="fv-opt-section__n">{n}</span>
        <span className="fv-opt-section__title">{title}</span>
        <i className="fas fa-chevron-up" aria-hidden="true" />
      </div>
      <div className="fv-opt-section__body">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="fv-opt-field">
      <span className="fv-opt-label">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="fv-opt-stat">
      <span className="fv-opt-stat__label">{label}</span>
      <span className="fv-opt-stat__value">{value}</span>
    </div>
  );
}

function NumField({ label, value }: { label: string; value: string }) {
  return (
    <label className="fv-opt-numfield">
      <span className="fv-opt-numfield__label">{label}</span>
      <span className="fv-opt-numfield__value">{value}</span>
    </label>
  );
}

function Select({
  value,
  options,
  icon,
  compact,
  matchLabel,
}: {
  value: string;
  options: { id: string; label: string }[];
  icon?: string;
  compact?: boolean;
  /** When set, `value` is matched against `label` instead of `id`. */
  matchLabel?: boolean;
}) {
  const current =
    options.find((o) => (matchLabel ? o.label === value : o.id === value)) ?? options[0];
  return (
    <span className={`fv-opt-select${compact ? ' fv-opt-select--compact' : ''}`}>
      {icon && <i className={`fas ${icon}`} aria-hidden="true" />}
      <span className="fv-opt-select__value">{current?.label}</span>
      <i className="fas fa-chevron-down" aria-hidden="true" />
    </span>
  );
}

function SummaryRow({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'good';
}) {
  return (
    <div className="fv-opt-summary-row">
      <span className="fv-opt-summary-row__label">{label}</span>
      <span
        className={`fv-opt-summary-row__value${strong ? ' is-strong' : ''}${
          tone === 'good' ? ' is-good' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function RouteMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'warn';
}) {
  return (
    <div className="fv-opt-route__metric">
      <span className="fv-opt-route__metric-label">{label}</span>
      <span
        className={`fv-opt-route__metric-value${
          tone === 'good' ? ' is-good' : tone === 'warn' ? ' is-warn' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}
