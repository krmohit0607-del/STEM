import { Fragment, useMemo, useState } from 'react';

import { useL } from '../i18n/LocalizationProvider';

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

const LEGS = [
  { id: 'delivery', label: 'Delivery → 1st port' },
  { id: 'ballast-1-2', label: 'Ballast 1 → 2' },
  { id: 'laden-2-3', label: 'Laden 2 → 3' },
  { id: 'redelivery', label: '3 → Redelivery' },
];

const DISPLAY_OPTIONS = [
  { key: 'rpm', label: 'RPM' },
  { key: 'cons', label: 'Cons' },
  { key: 'speed', label: 'Speed' },
  { key: 'wind', label: 'Wind' },
  { key: 'wave', label: 'Wave' },
  { key: 'current', label: 'Current' },
  { key: 'mePower', label: 'M/E Power' },
  { key: 'sfoc', label: 'SFOC' },
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
    color: '#58a6ff',
    unit: 'rpm',
    format: (n) => n.toFixed(0),
    extract: (r) => r.rpm,
  },
  cons: {
    label: 'Cons (FO)',
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
  mePower: {
    label: 'M/E Power',
    color: '#d2a8ff',
    unit: 'kW',
    format: (n) => n.toLocaleString(undefined, { maximumFractionDigits: 0 }),
    extract: (r) => parseNum(r.mePower),
  },
  sfoc: {
    label: 'SFOC',
    color: '#ffa657',
    unit: 'g/kWh',
    format: (n) => n.toFixed(1),
    // SFOC ≈ (FO MT/day * 1e6 g/MT) / (kW * 24 h)
    extract: (r) => {
      const fo = parseNum(r.fo);
      const power = parseNum(r.mePower);
      if (power <= 0) return 0;
      return (fo * 1_000_000) / (power * 24);
    },
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

export function InterimDashboardPage() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const [legId, setLegId] = useState<string>(LEGS[0].id);
  const [visibleSeries, setVisibleSeries] = useState<Record<string, boolean>>(() =>
    DISPLAY_OPTIONS.reduce<Record<string, boolean>>((acc, opt) => {
      acc[opt.key] = true;
      return acc;
    }, {}),
  );
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const activeLeg = useMemo(
    () => LEGS.find((leg) => leg.id === legId) ?? LEGS[0],
    [legId],
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

  const chartRows = useMemo(() => [...STUB_NOON_REPORTS].reverse(), []);

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
      <div className="fv-interim__topbar">
        <div className="fv-interim__leg-picker">
          <label htmlFor="fv-interim-leg">
            {t('selectLeg', 'Select Leg')}
          </label>
          <select
            id="fv-interim-leg"
            value={legId}
            onChange={(e) => setLegId(e.target.value)}
          >
            {LEGS.map((leg) => (
              <option key={leg.id} value={leg.id}>
                {leg.label}
              </option>
            ))}
          </select>
        </div>

        <div className="fv-interim__cp">
          <h2 className="fv-interim__cp-title">
            {t('cpDetails', 'CP Details')} — {activeLeg.label}
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
        {DISPLAY_OPTIONS.map((opt) => (
          <label key={opt.key} className="fv-interim__chip">
            <input
              type="checkbox"
              checked={visibleSeries[opt.key]}
              onChange={() => toggleSeries(opt.key)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>

      <div className="fv-interim__vessel-card">
        <div className="fv-interim__vessel-head">
          <div>
            <h3>{STUB_VESSEL.name}</h3>
            <p className="fv-interim__vessel-sub">
              {STUB_VESSEL.imo} · {STUB_VESSEL.type} · {STUB_VESSEL.flag}
            </p>
          </div>
          <span className="fv-interim__vessel-tag">{t('demoVessel', 'Demo Vessel')}</span>
        </div>
        <dl>
          <div className="fv-interim__vessel-item">
            <dt>DWT</dt>
            <dd>{STUB_VESSEL.dwt}</dd>
          </div>
          <div className="fv-interim__vessel-item">
            <dt>Built</dt>
            <dd>{STUB_VESSEL.built}</dd>
          </div>
          <div className="fv-interim__vessel-item">
            <dt>LOA</dt>
            <dd>{STUB_VESSEL.loa}</dd>
          </div>
          <div className="fv-interim__vessel-item">
            <dt>Beam</dt>
            <dd>{STUB_VESSEL.beam}</dd>
          </div>
          <div className="fv-interim__vessel-item">
            <dt>M/E</dt>
            <dd>{STUB_VESSEL.enginePower}</dd>
          </div>
        </dl>
      </div>

      <div className="fv-interim__chart" role="img" aria-label="Vessel performance chart">
        <PerformanceChart rows={chartRows} visibleKeys={visibleSeriesKeys} />
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
              {STUB_VESSEL.name} · {activeLeg.label}
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

const CHART_W = 880;
const CHART_H = 280;
const CHART_PAD = { top: 16, right: 24, bottom: 56, left: 44 };

interface PerformanceChartProps {
  rows: NoonReportRow[];
  visibleKeys: DisplayKey[];
}

function PerformanceChart({ rows, visibleKeys }: PerformanceChartProps) {
  if (rows.length === 0 || visibleKeys.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
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
  const xScale = (i: number) =>
    rows.length === 1
      ? CHART_PAD.left + innerW / 2
      : CHART_PAD.left + (i / (rows.length - 1)) * innerW;

  const series = visibleKeys.map((key) => {
    const def = SERIES_DEFS[key];
    const values = rows.map(def.extract);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const points = values.map((v, i) => ({
      x: xScale(i),
      y: CHART_PAD.top + innerH - ((v - min) / range) * innerH,
      v,
    }));
    return { key, def, points, min, max, latest: values[values.length - 1] };
  });

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
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

        {rows.map((row, i) => (
          <g key={`x-${i}`}>
            <line
              x1={xScale(i)}
              x2={xScale(i)}
              y1={CHART_PAD.top}
              y2={CHART_PAD.top + innerH}
              stroke="#1f2a3d"
            />
            <text
              x={xScale(i)}
              y={CHART_PAD.top + innerH + 14}
              fill="#8b949e"
              fontSize="10"
              textAnchor="middle"
            >
              {row.timestamp.split(',')[0]}
            </text>
            <text
              x={xScale(i)}
              y={CHART_PAD.top + innerH + 26}
              fill="#6e7681"
              fontSize="9"
              textAnchor="middle"
            >
              {(row.timestamp.split(',')[1] ?? '').trim()}
            </text>
          </g>
        ))}

        {series.map(({ key, def, points }) => (
          <polyline
            key={`line-${key}`}
            fill="none"
            stroke={def.color}
            strokeWidth={2}
            points={points.map((p) => `${p.x},${p.y}`).join(' ')}
          />
        ))}

        {series.map(({ key, def, points }) => (
          <g key={`pts-${key}`}>
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3} fill={def.color}>
                <title>{`${def.label}: ${def.format(p.v)} ${def.unit}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>

      <ul className="fv-interim__chart-legend">
        {series.map(({ key, def, latest, min, max }) => (
          <li key={`legend-${key}`}>
            <span
              className="fv-interim__legend-swatch"
              style={{ background: def.color }}
              aria-hidden="true"
            />
            <span className="fv-interim__legend-label">{def.label}</span>
            <strong>
              {def.format(latest)} {def.unit}
            </strong>
            <span className="fv-interim__legend-range">
              min {def.format(min)} · max {def.format(max)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
