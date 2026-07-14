import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { useSelectedLegNo } from '../data/selectedLeg';
import { buildView } from './voyage/buildView';
import { InterimTabs } from './InterimTabs';
import { STUB_ROWS as TRACKSHEET_ROWS } from './TracksheetGrid';
import type { Voyage } from '../data/voyages';
import type { LegRow } from './voyage/types';

/** One noon-to-noon day plotted on the performance graph (sourced from the
 *  tracksheet). Speed and FO/GO consumption are normalised to 24 hours. */
interface ChartDay {
  date: string;
  time: string;
  normalized: boolean;
  speed: number;
  fo: number;
  go: number;
  rpm: number;
  wind: number;
  wave: number;
  current: number;
}

/** Trailing number from a tracksheet weather cell (e.g. "NW4" → 4, "NE1.2" → 1.2). */
function parseTrailingNum(s: string): number {
  const m = (s ?? '').match(/(-?\d+(?:\.\d+)?)\s*$/);
  return m ? parseFloat(m[1]) : 0;
}

/** Tracksheet date "26Jun2026" → "Jun 26". */
function fmtTrackDate(d: string): string {
  const m = (d ?? '').match(/^(\d{1,2})([A-Za-z]{3})\d{2,4}$/);
  return m ? `${m[2]} ${m[1].padStart(2, '0')}` : d;
}

/** Tracksheet time "0300" → "03:00". */
function fmtTrackTime(t: string): string {
  const s = (t ?? '').padStart(4, '0');
  return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
}

/**
 * Interim Dashboard page — `/interim`.
 *
 * Static stub matching the layout the user provided:
 *   - Top bar: leg selector + CP details (same as Fleet View).
 *   - Display options: show/hide RPM, Cons, Speed, Wind, Wave, etc.
 *   - Graphical representation area (placeholder, same as FV chart).
 *   - Vessel performance + good weather gain/loss stats (same as FV).
 *   - Noon Report summary grid with expandable rows so the full report
 *     received from the vessel can be inspected.
 *
 * No API data is wired yet — when the interim endpoints are exposed for
 * the React app, replace the stub arrays below.
 */

interface NoonReportRow {
  reportType: string;
  initial: boolean;
  current: boolean;
  timestamp: string;
  hoursSlr: number;
  distance: string;
  sog: string;
  fo: string;
  doGo: string;
  sigWaveHeight: string;
  bf: number;
  currentFactor: string;
  rpm: number;
  mePower: string;
  received: string;
  delayedBy: string;
  /** Rendered when the row is expanded — simulates the full vessel report. */
  fullReport: Array<[string, string]>;
}

interface CpDetails {
  speed: string;
  consFo: string;
  consGo: string;
  weatherClause: string;
  goodWeatherDef: string;
}

interface PerformanceStats {
  vesselPerformance: { label: string; value: string }[];
  goodWeather: { label: string; value: string }[];
}

/** Human-readable label for a leg, used where the old stub `label` was shown. */
function legLabel(leg: LegRow): string {
  return `${leg.no} · ${leg.from || '—'} → ${leg.to || '—'}`;
}

const DISPLAY_OPTIONS = [
  { key: 'speed', label: 'Speed', glyph: 'line' },
  { key: 'cons', label: 'Cons', glyph: 'bar' },
  { key: 'rpm', label: 'RPM', glyph: 'dot' },
  { key: 'wind', label: 'Wind', glyph: 'area' },
  { key: 'wave', label: 'Wave', glyph: 'dash' },
  { key: 'current', label: 'Current', glyph: 'triangle' },
] as const;

type DisplayKey = (typeof DISPLAY_OPTIONS)[number]['key'];

interface VesselInfo {
  name: string;
  imo: string;
  type: string;
  flag: string;
  dwt: string;
  built: number;
  loa: string;
  beam: string;
  enginePower: string;
}

const STUB_VESSEL: VesselInfo = {
  name: 'MV FleetView Demo',
  imo: 'IMO 9876543',
  type: 'Bulk Carrier (Capesize)',
  flag: 'Singapore',
  dwt: '180,000 MT',
  built: 2018,
  loa: '292 m',
  beam: '45 m',
  enginePower: '11,500 kW @ 76 RPM',
};

/** Parse a number out of a string like "7,896 kW" or "-0.2 kt". */
function parseNum(value: string): number {
  const m = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

interface SeriesDef {
  label: string;
  color: string;
  unit: string;
  format: (n: number) => string;
  extract: (row: NoonReportRow) => number;
}

const SERIES_DEFS: Record<DisplayKey, SeriesDef> = {
  rpm: {
    label: 'RPM',
    color: '#0b3d91',
    unit: 'rpm',
    format: (n) => n.toFixed(0),
    extract: (r) => r.rpm,
  },
  cons: {
    label: 'Cons (FO+GO)',
    color: '#f0b429',
    unit: 'MT/day',
    format: (n) => n.toFixed(2),
    extract: (r) => parseNum(r.fo),
  },
  speed: {
    label: 'Speed (SOG)',
    color: '#56d364',
    unit: 'kt',
    format: (n) => n.toFixed(2),
    extract: (r) => parseNum(r.sog),
  },
  wind: {
    label: 'Wind',
    color: '#a371f7',
    unit: 'BF',
    format: (n) => n.toFixed(0),
    extract: (r) => r.bf,
  },
  wave: {
    label: 'Wave',
    color: '#79c0ff',
    unit: 'm',
    format: (n) => n.toFixed(2),
    extract: (r) => parseNum(r.sigWaveHeight),
  },
  current: {
    label: 'Current',
    color: '#ff7b72',
    unit: 'kt',
    format: (n) => n.toFixed(2),
    extract: (r) => parseNum(r.currentFactor),
  },
};

const STUB_CP: CpDetails = {
  speed: '12.0 kt',
  consFo: '30.0 MT/day',
  consGo: '0.10 MT/day',
  weatherClause: 'BF ≤ 4 / DSS ≤ 3 / no adverse current',
  goodWeatherDef: 'BF ≤ 4, Wave ≤ 2.5 m, Current ≤ 0.5 kt',
};

const STUB_PERFORMANCE: PerformanceStats = {
  vesselPerformance: [
    { label: 'Avg Speed since COSP', value: '11.0 kt' },
    { label: 'Performance Speed since COSP', value: '11.25 kt' },
    { label: 'Speed Loss vs CP', value: '-0.75 kt' },
    { label: 'Avg FO Cons', value: '34.6 MT/day' },
    { label: 'Cons Over CP', value: '+4.6 MT/day' },
  ],
  goodWeather: [
    { label: 'Good WX Hours', value: '120 hrs' },
    { label: 'Good WX Distance', value: '1,260 NM' },
    { label: 'Good WX Avg Speed', value: '10.8 kt' },
    { label: 'Good WX Speed Loss', value: '-1.2 kt' },
    { label: 'Good WX FO Gain/Loss', value: '+12.4 MT' },
  ],
};

const STUB_NOON_REPORTS: NoonReportRow[] = [
  {
    reportType: 'Noon Report',
    initial: true,
    current: true,
    timestamp: 'Jun 13, 10:00Z',
    hoursSlr: 24,
    distance: '244 NM',
    sog: '10.2 kt',
    fo: '35.72 MT',
    doGo: '0.32 MT',
    sigWaveHeight: '2.2 m',
    bf: 4,
    currentFactor: '-0.2 kt',
    rpm: 68,
    mePower: '7,896 kW',
    received: 'Jun 13, 10:35Z',
    delayedBy: '0.6 hrs',
    fullReport: [
      ['Position', '12°34\'N / 045°12\'E'],
      ['Course', '094°'],
      ['Heading', '096°'],
      ['Wind Direction', 'NE'],
      ['Wind Force (BF)', '4'],
      ['Sea State', '3'],
      ['Swell Direction', 'NE'],
      ['Swell Height', '2.2 m'],
      ['Air Temp', '28.5 °C'],
      ['Sea Temp', '29.1 °C'],
      ['ROB FO', '1,245 MT'],
      ['ROB GO', '85 MT'],
    ],
  },
  {
    reportType: 'Noon Report',
    initial: true,
    current: true,
    timestamp: 'Jun 12, 10:00Z',
    hoursSlr: 24,
    distance: '250 NM',
    sog: '10.4 kt',
    fo: '34.74 MT',
    doGo: '0 MT',
    sigWaveHeight: '1.8 m',
    bf: 3,
    currentFactor: '-0.4 kt',
    rpm: 69,
    mePower: '7,635 kW',
    received: 'Jun 12, 10:58Z',
    delayedBy: '1.0 hrs',
    fullReport: [
      ['Position', '12°02\'N / 042°48\'E'],
      ['Course', '094°'],
      ['Wind Force (BF)', '3'],
      ['Sea State', '2'],
      ['Swell Height', '1.8 m'],
      ['ROB FO', '1,280 MT'],
      ['ROB GO', '85 MT'],
    ],
  },
  {
    reportType: 'Noon Report',
    initial: true,
    current: true,
    timestamp: 'Jun 11, 10:00Z',
    hoursSlr: 23,
    distance: '242 NM',
    sog: '10.5 kt',
    fo: '30.46 MT',
    doGo: '0 MT',
    sigWaveHeight: '1.7 m',
    bf: 4,
    currentFactor: '-0.2 kt',
    rpm: 70,
    mePower: '6,872 kW',
    received: 'Jun 11, 10:58Z',
    delayedBy: '1.0 hrs',
    fullReport: [
      ['Position', '11°25\'N / 040°33\'E'],
      ['Course', '094°'],
      ['Wind Force (BF)', '4'],
      ['Sea State', '3'],
      ['ROB FO', '1,314 MT'],
      ['ROB GO', '85 MT'],
    ],
  },
  {
    reportType: 'Noon Report',
    initial: true,
    current: true,
    timestamp: 'Jun 10, 11:00Z',
    hoursSlr: 24,
    distance: '254 NM',
    sog: '10.6 kt',
    fo: '39.65 MT',
    doGo: '0.3 MT',
    sigWaveHeight: '2.1 m',
    bf: 4,
    currentFactor: '-0.2 kt',
    rpm: 72,
    mePower: '8,742 kW',
    received: 'Jun 10, 12:12Z',
    delayedBy: '1.2 hrs',
    fullReport: [
      ['Position', '10°44\'N / 038°20\'E'],
      ['Course', '094°'],
      ['Wind Force (BF)', '4'],
      ['Sea State', '3'],
      ['ROB FO', '1,344 MT'],
      ['ROB GO', '84 MT'],
    ],
  },
  {
    reportType: 'Noon Report',
    initial: true,
    current: true,
    timestamp: 'Jun 09, 11:00Z',
    hoursSlr: 24,
    distance: '258 NM',
    sog: '10.8 kt',
    fo: '39.53 MT',
    doGo: '0.02 MT',
    sigWaveHeight: '2.2 m',
    bf: 4,
    currentFactor: '-0.0 kt',
    rpm: 72,
    mePower: '8,699 kW',
    received: 'Jun 09, 11:54Z',
    delayedBy: '0.9 hrs',
    fullReport: [
      ['Position', '10°02\'N / 036°05\'E'],
      ['Course', '094°'],
      ['Wind Force (BF)', '4'],
      ['Sea State', '3'],
      ['ROB FO', '1,383 MT'],
      ['ROB GO', '84 MT'],
    ],
  },
  {
    reportType: 'Noon Report',
    initial: true,
    current: true,
    timestamp: 'Jun 08, 11:00Z',
    hoursSlr: 24,
    distance: '261 NM',
    sog: '10.9 kt',
    fo: '38.52 MT',
    doGo: '0.15 MT',
    sigWaveHeight: '1.9 m',
    bf: 4,
    currentFactor: '-0.1 kt',
    rpm: 72,
    mePower: '8,482 kW',
    received: 'Jun 08, 15:13Z',
    delayedBy: '4.2 hrs',
    fullReport: [
      ['Position', '09°20\'N / 033°50\'E'],
      ['Course', '094°'],
      ['Wind Force (BF)', '4'],
      ['Sea State', '3'],
      ['ROB FO', '1,422 MT'],
      ['ROB GO', '84 MT'],
    ],
  },
  {
    reportType: 'Noon Report',
    initial: true,
    current: true,
    timestamp: 'Jun 07, 11:00Z',
    hoursSlr: 24,
    distance: '276 NM',
    sog: '11.5 kt',
    fo: '38.32 MT',
    doGo: '0.01 MT',
    sigWaveHeight: '1.5 m',
    bf: 4,
    currentFactor: '-0.0 kt',
    rpm: 73,
    mePower: '8,412 kW',
    received: 'Jun 07, 11:58Z',
    delayedBy: '1.0 hrs',
    fullReport: [
      ['Position', '08°36\'N / 031°30\'E'],
      ['Course', '094°'],
      ['Wind Force (BF)', '4'],
      ['Sea State', '2'],
      ['ROB FO', '1,460 MT'],
      ['ROB GO', '84 MT'],
    ],
  },
];

const NOON_COLUMNS: { key: keyof NoonReportRow | 'expand'; label: string; width?: number }[] = [
  { key: 'expand', label: '', width: 32 },
  { key: 'reportType', label: 'Report Type', width: 110 },
  { key: 'initial', label: 'Initial', width: 70 },
  { key: 'current', label: 'Current', width: 80 },
  { key: 'timestamp', label: 'Timestamp', width: 130 },
  { key: 'hoursSlr', label: 'Hours SLR', width: 90 },
  { key: 'distance', label: 'Distance', width: 90 },
  { key: 'sog', label: 'SOG', width: 80 },
  { key: 'fo', label: 'FO', width: 90 },
  { key: 'doGo', label: 'DO/GO', width: 90 },
  { key: 'sigWaveHeight', label: 'Sig. Wave Height', width: 130 },
  { key: 'bf', label: 'BF', width: 60 },
  { key: 'currentFactor', label: 'Current Factor', width: 120 },
  { key: 'rpm', label: 'RPM', width: 70 },
  { key: 'mePower', label: 'M/E Power', width: 100 },
  { key: 'received', label: 'Received', width: 130 },
  { key: 'delayedBy', label: 'Delayed by', width: 100 },
];

/** Build the Interim vessel-info card from a shared voyage. */
function voyageToVesselInfo(v: Voyage): VesselInfo {
  return {
    name: v.vessel,
    imo: `IMO ${v.imo}`,
    type: v.vesselType,
    flag: v.flag,
    dwt: v.dwt,
    built: v.built,
    loa: v.loa,
    beam: v.beam,
    enginePower: v.enginePower,
  };
}

export function InterimDashboardPage() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const selectedVoyage = useSelectedVoyage();
  const vessel = selectedVoyage ? voyageToVesselInfo(selectedVoyage) : STUB_VESSEL;

  // The active leg follows the leg picked in the top header (STEM row) dropdown.
  const legs = useMemo(
    () => (selectedVoyage ? buildView(selectedVoyage).legs : []),
    [selectedVoyage],
  );
  const selectedLegNo = useSelectedLegNo();
  const [visibleSeries, setVisibleSeries] = useState<Record<string, boolean>>(() =>
    DISPLAY_OPTIONS.reduce<Record<string, boolean>>((acc, opt) => {
      acc[opt.key] = true;
      return acc;
    }, {}),
  );
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const activeLeg = useMemo(
    () => legs.find((leg) => leg.no === selectedLegNo) ?? legs[0],
    [legs, selectedLegNo],
  );

  const toggleSeries = (key: string) => {
    setVisibleSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleRow = (idx: number) => {
    setExpandedRows((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const visibleSeriesKeys = (Object.keys(SERIES_DEFS) as DisplayKey[]).filter(
    (k) => visibleSeries[k],
  );

  // Performance graph data is sourced from the Tracksheet (noon rows only).
  // FO/GO consumption is derived from the ROB deltas between noon reports and
  // normalised, along with speed, to a 24-hour basis.
  const chartDays = useMemo<ChartDay[]>(() => {
    const noon = TRACKSHEET_ROWS.filter((r) => r.rt === 'N');
    return noon.map((r, idx) => {
      const prev = noon[idx - 1];
      const hours = r.hrs && r.hrs > 0 ? r.hrs : 24;
      const factor = 24 / hours;
      const dist = r.distR ?? r.distO ?? 0;
      const foRaw = prev
        ? Math.max(0, (prev.vlsfoRob ?? 0) - (r.vlsfoRob ?? 0) + (r.vlsfoBunkered ?? 0))
        : 0;
      const goRaw = prev
        ? Math.max(0, (prev.lsmgoRob ?? 0) - (r.lsmgoRob ?? 0) + (r.lsmgoBunkered ?? 0))
        : 0;
      return {
        date: fmtTrackDate(r.date),
        time: fmtTrackTime(r.time),
        normalized: hours < 24,
        speed: dist > 0 && hours > 0 ? dist / hours : r.avgSpeedO ?? 0,
        fo: foRaw * factor,
        go: goRaw * factor,
        rpm: r.rpm ?? 0,
        wind: parseTrailingNum(r.windO),
        wave: parseTrailingNum(r.wavesO),
        current: r.currF,
      };
    });
  }, []);

  // Measure the chart container so the SVG can be drawn at the real pixel width
  // (viewBox = container width). This makes it fill edge-to-edge on any screen
  // without letterboxing or distorting the axis text.
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(1000);
  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el) return;
    const update = () => setChartWidth(el.clientWidth || 1000);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const noonSummary = useMemo(() => {
    const reports = STUB_NOON_REPORTS;
    const sum = (fn: (r: NoonReportRow) => number) =>
      reports.reduce((acc, r) => acc + fn(r), 0);
    const totalHours = sum((r) => r.hoursSlr);
    const totalDistance = sum((r) => parseNum(r.distance));
    const totalFo = sum((r) => parseNum(r.fo));
    const totalGo = sum((r) => parseNum(r.doGo));
    const avgSpeed = totalHours > 0 ? totalDistance / totalHours : 0;
    const avgFoPerDay = totalHours > 0 ? (totalFo / totalHours) * 24 : 0;
    return {
      count: reports.length,
      latest: reports[0],
      from: reports[reports.length - 1].timestamp,
      to: reports[0].timestamp,
      totalHours,
      totalDistance,
      totalFo,
      totalGo,
      avgSpeed,
      avgFoPerDay,
    };
  }, []);

  return (
    <div className="fv-interim">
      <header className="fv-voyage__header">
        <div className="fv-voyage__heading">
          <span className="fv-voyage__heading-icon" aria-hidden="true">
            <i className="fas fa-bolt" />
          </span>
          <h1>{t('interimDashboard', 'Interim Dashboard')}</h1>
        </div>
      </header>

      <InterimTabs active="interim" />

      <div className="fv-interim__topbar">
        <div className="fv-interim__cp">
          <h2 className="fv-interim__cp-title">
            {t('cpDetails', 'CP Details')} — {activeLeg ? legLabel(activeLeg) : t('noLegs', 'No legs')}
          </h2>
          <ul className="fv-interim__cp-list">
            <li>
              <span>{t('cpSpeed', 'Speed')}</span>
              <strong>{STUB_CP.speed}</strong>
            </li>
            <li>
              <span>{t('cpConsFo', 'Cons FO')}</span>
              <strong>{STUB_CP.consFo}</strong>
            </li>
            <li>
              <span>{t('cpConsGo', 'Cons GO')}</span>
              <strong>{STUB_CP.consGo}</strong>
            </li>
            <li>
              <span>{t('weatherClause', 'WX Clause')}</span>
              <strong>{STUB_CP.weatherClause}</strong>
            </li>
            <li>
              <span>{t('goodWeatherDef', 'Good WX Def.')}</span>
              <strong>{STUB_CP.goodWeatherDef}</strong>
            </li>
          </ul>
        </div>
      </div>

      <div className="fv-interim__display-options">
        <span className="fv-interim__display-options-label">
          {t('show', 'Show')}
        </span>
        {DISPLAY_OPTIONS.map((opt) => {
          const def = SERIES_DEFS[opt.key];
          return (
            <label
              key={opt.key}
              className={`fv-interim__chip${visibleSeries[opt.key] ? ' fv-interim__chip--on' : ''}`}
            >
              <input
                type="checkbox"
                checked={visibleSeries[opt.key]}
                onChange={() => toggleSeries(opt.key)}
              />
              {opt.glyph === 'dash' ? (
                <i className="fv-interim__key-dash" style={{ borderColor: def.color }} aria-hidden="true" />
              ) : opt.glyph === 'triangle' ? (
                <i className="fv-interim__key-triangle" style={{ borderBottomColor: def.color }} aria-hidden="true" />
              ) : (
                <i className={`fv-interim__key-${opt.glyph}`} style={{ background: def.color }} aria-hidden="true" />
              )}
              <span className="fv-interim__chip-label">{def.label}</span>
            </label>
          );
        })}
        <span className="fv-interim__norm-note">
          * interval &lt; 24h, normalised to 24h
        </span>
      </div>

      <div className="fv-interim__chart" role="img" aria-label="Vessel performance chart" ref={chartWrapRef}>
        <PerformanceChart days={chartDays} visibleKeys={visibleSeriesKeys} width={chartWidth} />
        {visibleSeriesKeys.length === 0 && (
          <p className="fv-interim__chart-hint">
            {t('noSeries', '— no series selected —')}
          </p>
        )}
      </div>

      <div className="fv-interim__stats">
        <section className="fv-interim__stats-card">
          <h3>{t('vesselPerformance', 'Vessel Performance')}</h3>
          <ul>
            {STUB_PERFORMANCE.vesselPerformance.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </li>
            ))}
          </ul>
        </section>
        <section className="fv-interim__stats-card">
          <h3>{t('goodWeatherGainLoss', 'Good Weather Gain / Loss')}</h3>
          <ul>
            {STUB_PERFORMANCE.goodWeather.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="fv-interim__noon">
        <div className="fv-interim__noon-header">
          <div className="fv-interim__noon-titlebar">
            <h3 className="fv-interim__noon-title">
              {t('noonReportSummary', 'Noon Report Summary')}
            </h3>
            <span className="fv-interim__noon-vessel">
              {vessel.name}{activeLeg ? ` · ${legLabel(activeLeg)}` : ''}
            </span>
          </div>
          <ul className="fv-interim__noon-kpis">
            <li>
              <span>Reports</span>
              <strong>{noonSummary.count}</strong>
            </li>
            <li>
              <span>Period</span>
              <strong>
                {noonSummary.from} → {noonSummary.to}
              </strong>
            </li>
            <li>
              <span>Latest Received</span>
              <strong>{noonSummary.latest.received}</strong>
            </li>
            <li>
              <span>Total Distance</span>
              <strong>{noonSummary.totalDistance.toFixed(0)} NM</strong>
            </li>
            <li>
              <span>Avg SOG</span>
              <strong>{noonSummary.avgSpeed.toFixed(2)} kt</strong>
            </li>
            <li>
              <span>Total FO</span>
              <strong>{noonSummary.totalFo.toFixed(2)} MT</strong>
            </li>
            <li>
              <span>Total DO/GO</span>
              <strong>{noonSummary.totalGo.toFixed(2)} MT</strong>
            </li>
            <li>
              <span>Avg FO / day</span>
              <strong>{noonSummary.avgFoPerDay.toFixed(2)} MT</strong>
            </li>
          </ul>
        </div>

        <div className="fv-interim__noon-scroll">
          <table className="fv-interim__noon-grid">
            <thead>
              <tr>
                {NOON_COLUMNS.map((col) => (
                  <th
                    key={col.key as string}
                    style={col.width ? { minWidth: col.width, width: col.width } : undefined}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STUB_NOON_REPORTS.map((row, idx) => {
                const expanded = !!expandedRows[idx];
                return (
                  <Fragment key={`noon-${idx}`}>
                    <tr>
                      {NOON_COLUMNS.map((col) => {
                        if (col.key === 'expand') {
                          return (
                            <td key="expand" className="fv-interim__noon-expand-cell">
                              <button
                                type="button"
                                className="fv-interim__noon-expand-btn"
                                aria-expanded={expanded}
                                aria-label={expanded ? 'Collapse row' : 'Expand row'}
                                onClick={() => toggleRow(idx)}
                              >
                                <i
                                  className={`fas ${
                                    expanded ? 'fa-chevron-down' : 'fa-chevron-right'
                                  }`}
                                  aria-hidden="true"
                                />
                              </button>
                            </td>
                          );
                        }
                        const value = row[col.key as keyof NoonReportRow];
                        if (typeof value === 'boolean') {
                          return (
                            <td key={col.key as string} className="fv-interim__noon-bool">
                              {value ? (
                                <i
                                  className="fas fa-check-circle fv-interim__noon-check"
                                  aria-hidden="true"
                                />
                              ) : (
                                ''
                              )}
                            </td>
                          );
                        }
                        return (
                          <td key={col.key as string}>{String(value ?? '')}</td>
                        );
                      })}
                    </tr>
                    {expanded && (
                      <tr className="fv-interim__noon-detail-row">
                        <td colSpan={NOON_COLUMNS.length}>
                          <div className="fv-interim__noon-detail">
                            <h4>{t('fullReport', 'Full report received from vessel')}</h4>
                            <dl>
                              {row.fullReport.map(([label, value]) => (
                                <div key={label} className="fv-interim__noon-detail-item">
                                  <dt>{label}</dt>
                                  <dd>{value}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const CHART_H = 300;
const CHART_PAD = { top: 18, right: 44, bottom: 54, left: 46 };

interface PerformanceChartProps {
  days: ChartDay[];
  visibleKeys: DisplayKey[];
  /** Measured pixel width of the container — used as the viewBox width so the
   *  chart fills its box edge-to-edge without letterboxing or text distortion. */
  width: number;
}

function PerformanceChart({ days, visibleKeys, width }: PerformanceChartProps) {
  const CHART_W = Math.max(360, width);

  if (days.length === 0 || visibleKeys.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        width="100%"
        height={CHART_H}
        preserveAspectRatio="none"
        className="fv-interim__chart-svg"
        role="presentation"
      >
        <rect
          x={CHART_PAD.left}
          y={CHART_PAD.top}
          width={CHART_W - CHART_PAD.left - CHART_PAD.right}
          height={CHART_H - CHART_PAD.top - CHART_PAD.bottom}
          fill="transparent"
          stroke="#2a3447"
        />
      </svg>
    );
  }

  const innerW = CHART_W - CHART_PAD.left - CHART_PAD.right;
  const innerH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
  const baseY = CHART_PAD.top + innerH;

  const FO_COLOR = SERIES_DEFS.cons.color;
  const GO_COLOR = '#3fb6ad';
  const SPEED_COLOR = SERIES_DEFS.speed.color;
  const RPM_COLOR = SERIES_DEFS.rpm.color;
  const WIND_COLOR = SERIES_DEFS.wind.color;
  const WAVE_COLOR = SERIES_DEFS.wave.color;
  const CURRENT_COLOR = SERIES_DEFS.current.color;

  const slotW = days.length > 1 ? innerW / (days.length - 1) : innerW;
  // Point positioning: the first report sits on the left edge and the last on
  // the right edge, so the trace always spans end-to-end regardless of how many
  // days (reports) there are.
  const cx = (i: number) =>
    days.length === 1
      ? CHART_PAD.left + innerW / 2
      : CHART_PAD.left + (i / (days.length - 1)) * innerW;
  const on = (k: DisplayKey) => visibleKeys.includes(k);

  /** Build a value→y mapping plus its inverse (for axis ticks). Bars measure
   *  from zero; other series auto-fit with a little headroom. */
  const buildScale = (values: number[], fromZero: boolean) => {
    const lo0 = fromZero ? Math.min(0, ...values) : Math.min(...values);
    const hi0 = Math.max(...values);
    const pad = fromZero ? 0 : (hi0 - lo0 || 1) * 0.1;
    const lo = lo0 - pad;
    const hi = hi0 + pad;
    const span = hi - lo || 1;
    return {
      scale: (v: number) => baseY - ((v - lo) / span) * innerH,
      valueAt: (t: number) => lo + (1 - t) * span,
    };
  };

  const consTotals = days.map((d) => d.fo + d.go);
  const consAxis = buildScale(consTotals, true);
  const speedAxis = buildScale(days.map((d) => d.speed), false);
  const rpmScale = buildScale(days.map((d) => d.rpm), false).scale;
  const windScale = buildScale(days.map((d) => d.wind), false).scale;
  const waveScale = buildScale(days.map((d) => d.wave), false).scale;
  const currentScale = buildScale(days.map((d) => d.current), false).scale;

  const barW = Math.max(8, Math.min(26, slotW * 0.4));
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      width="100%"
      height={CHART_H}
      preserveAspectRatio="none"
      className="fv-interim__chart-svg"
    >
      {gridLines.map((t) => (
        <line
          key={t}
          x1={CHART_PAD.left}
          x2={CHART_W - CHART_PAD.right}
          y1={CHART_PAD.top + innerH * t}
          y2={CHART_PAD.top + innerH * t}
          stroke="#2a3447"
          strokeDasharray={t === 0 || t === 1 ? undefined : '3,3'}
        />
      ))}

      {/* Left axis — Cons (MT/day) */}
      <text x={CHART_PAD.left - 8} y={CHART_PAD.top - 6} fill="#6e7681" fontSize="9" textAnchor="end">
        MT/day
      </text>
      {gridLines.map((t) => (
        <text
          key={`ly-${t}`}
          x={CHART_PAD.left - 8}
          y={CHART_PAD.top + innerH * t + 3}
          fill="#8b949e"
          fontSize="9"
          textAnchor="end"
        >
          {Math.round(consAxis.valueAt(t))}
        </text>
      ))}

      {/* Right axis — Speed (kt) */}
      <text x={CHART_W - CHART_PAD.right + 8} y={CHART_PAD.top - 6} fill="#6e7681" fontSize="9" textAnchor="start">
        kt
      </text>
      {gridLines.map((t) => (
        <text
          key={`ry-${t}`}
          x={CHART_W - CHART_PAD.right + 8}
          y={CHART_PAD.top + innerH * t + 3}
          fill="#8b949e"
          fontSize="9"
          textAnchor="start"
        >
          {speedAxis.valueAt(t).toFixed(1)}
        </text>
      ))}

      {/* Wind — translucent background band */}
      {on('wind') && (
        <polygon
          fill="rgba(163,113,247,0.14)"
          stroke={WIND_COLOR}
          strokeWidth={1}
          points={
            `${cx(0)},${baseY} ` +
            days.map((d, i) => `${cx(i)},${windScale(d.wind)}`).join(' ') +
            ` ${cx(days.length - 1)},${baseY}`
          }
        />
      )}

      {/* Cons — stacked fuel-type bars (FO + GO), 24h-normalised */}
      {on('cons') &&
        days.map((d, i) => {
          const foTop = consAxis.scale(d.fo);
          const stackTop = consAxis.scale(d.fo + d.go);
          const bx = Math.max(
            CHART_PAD.left,
            Math.min(cx(i) - barW / 2, CHART_W - CHART_PAD.right - barW),
          );
          return (
            <g key={`cons-${i}`}>
              <rect x={bx} y={foTop} width={barW} height={Math.max(0, baseY - foTop)} fill={FO_COLOR} rx={1}>
                <title>{`FO: ${d.fo.toFixed(2)} MT/day${d.normalized ? ' (24h norm.)' : ''}`}</title>
              </rect>
              {d.go > 0 && (
                <rect x={bx} y={stackTop} width={barW} height={Math.max(0, foTop - stackTop)} fill={GO_COLOR} rx={1}>
                  <title>{`GO: ${d.go.toFixed(2)} MT/day${d.normalized ? ' (24h norm.)' : ''}`}</title>
                </rect>
              )}
            </g>
          );
        })}

      {/* Wave — dashed line */}
      {on('wave') && (
        <polyline
          fill="none"
          stroke={WAVE_COLOR}
          strokeWidth={2}
          strokeDasharray="6,4"
          points={days.map((d, i) => `${cx(i)},${waveScale(d.wave)}`).join(' ')}
        />
      )}

      {/* Speed — solid line (24h avg) */}
      {on('speed') && (
        <polyline
          fill="none"
          stroke={SPEED_COLOR}
          strokeWidth={2.5}
          points={days.map((d, i) => `${cx(i)},${speedAxis.scale(d.speed)}`).join(' ')}
        />
      )}

      {/* Current — upward-triangle markers (distinct from RPM dots) */}
      {on('current') &&
        days.map((d, i) => {
          const x = cx(i);
          const y = currentScale(d.current);
          const s = 5;
          return (
            <path
              key={`cur-${i}`}
              d={`M ${x} ${y - s} L ${x + s} ${y + s} L ${x - s} ${y + s} Z`}
              fill={CURRENT_COLOR}
              stroke="#0d1117"
              strokeWidth={0.8}
            >
              <title>{`Current: ${d.current.toFixed(2)} kt`}</title>
            </path>
          );
        })}

      {/* RPM — dark dots with a light ring for visibility over the bars */}
      {on('rpm') &&
        days.map((d, i) => (
          <circle key={`rpm-${i}`} cx={cx(i)} cy={rpmScale(d.rpm)} r={4.5} fill={RPM_COLOR} stroke="#e6edf3" strokeWidth={1.4}>
            <title>{`RPM: ${d.rpm}`}</title>
          </circle>
        ))}

      {/* X axis — one noon-to-noon slot per report */}
      {days.map((d, i) => {
        const anchor = i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle';
        return (
          <g key={`x-${i}`}>
            <line x1={cx(i)} x2={cx(i)} y1={CHART_PAD.top} y2={baseY} stroke="#1f2a3d" />
            <text x={cx(i)} y={baseY + 14} fill="#8b949e" fontSize="10" textAnchor={anchor}>
              {d.date}
              {d.normalized ? '*' : ''}
            </text>
            <text x={cx(i)} y={baseY + 26} fill="#6e7681" fontSize="9" textAnchor={anchor}>
              {d.time}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
