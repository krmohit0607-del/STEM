import { useEffect, useMemo, useRef, useState } from 'react';

import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { useSelectedLegNo } from '../data/selectedLeg';
import { buildView } from './voyage/buildView';
import { InterimTabs } from './InterimTabs';
import { STUB_ROWS as TRACKSHEET_ROWS, computeCons, type TrackRow } from './TracksheetGrid';
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
  speedKn: number;
  consFoPerDay: number;
  consGoPerDay: number;
  speed: string;
  consFo: string;
  consGo: string;
  weatherClause: string;
  goodWeatherDef: string;
}

interface InterimSummaryCell {
  primary: string;
  tone?: 'good' | 'bad';
}

interface InterimSummaryRow {
  label: string;
  overall: InterimSummaryCell;
  goodWeather: InterimSummaryCell;
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
    extract: (r) => parseNum(r.fo) + parseNum(r.doGo),
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
  speedKn: 12,
  consFoPerDay: 30,
  consGoPerDay: 0.1,
  speed: '12.0 kt',
  consFo: '30.0 MT/day',
  consGo: '0.10 MT/day',
  weatherClause: 'BF ≤ 4 / DSS ≤ 3 / no adverse current',
  goodWeatherDef: 'BF ≤ 4, Wave ≤ 2.5 m, Current ≤ 0.5 kt',
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

function formatHours(value: number): string {
  return `${value.toFixed(2)} HRS`;
}

function formatSpeed(value: number): string {
  return `${value.toFixed(2)} KTS`;
}

function formatMts(value: number): string {
  return `${value.toFixed(3)} MTS`;
}

function projectionTimeCell(deltaHours: number): InterimSummaryCell {
  const tone = deltaHours >= 0 ? 'good' : 'bad';
  const status = deltaHours >= 0 ? 'GAIN' : 'LOSS';
  return {
    primary: `${Math.abs(deltaHours).toFixed(2)} HRS (${status})`,
    tone,
  };
}

function projectionFuelCell(deltaFuel: number): InterimSummaryCell {
  if (Math.abs(deltaFuel) < 0.0005) {
    return { primary: formatMts(0) };
  }
  const tone = deltaFuel <= 0 ? 'good' : 'bad';
  const status = deltaFuel <= 0 ? 'UNDER' : 'OVER';
  return {
    primary: `${formatMts(Math.abs(deltaFuel))} (${status})`,
    tone,
  };
}

export function PerformanceReportsTable({ rows }: { rows: TrackRow[] }) {
  const allReports = rows.filter((row) => row.rt === 'N' || row.rt === 'E');
  const reports = allReports.slice(-12).reverse();
  const noonRows = rows.filter((row) => row.rt === 'N');
  const reportValues = (row: TrackRow) => {
    const noonIndex = noonRows.findIndex((item) => item.id === row.id);
    return {
      consFo: noonIndex >= 0 ? computeCons(noonRows, noonIndex, 'vlsfo') : null,
      consGo: noonIndex >= 0 ? computeCons(noonRows, noonIndex, 'lsmgo') : null,
    };
  };
  const headers = ['Report Type', 'Date/Time UTC', 'Date/Time LT', 'Duration (hrs)', 'Position', 'Avg Spd GPS', 'Avg Spd LOG', 'Dist Since Last (nm)', 'Total Dist (nm)', 'ROB FO', 'ROB DO', 'Cons FO', 'Cons DO', 'RPM', '% MCR', 'Slip', 'Vessel Weather', 'System Weather', 'Remarks'];
  const valuesFor = (row: TrackRow): string[] => {
    const values = reportValues(row);
    return [row.rt || 'Report', `${fmtTrackDate(row.date)} ${fmtTrackTime(row.time)}`, '—', String(row.hrs ?? '—'), `${row.lat || '—'} / ${row.lng || '—'}`, String(row.avgSpeedO ?? '—'), '—', String(row.distR ?? '—'), String(row.distO ?? '—'), String(row.vlsfoRob ?? '—'), String(row.lsmgoRob ?? '—'), values.consFo == null ? '—' : values.consFo.toFixed(3), values.consGo == null ? '—' : values.consGo.toFixed(3), String(row.rpm ?? '—'), '—', String(row.slip ?? '—'), `${row.windO || '—'} / ${row.wavesO || '—'}`, `Wind ${row.windF.toFixed(2)} · Wave ${row.waveF.toFixed(2)} · Curr ${row.currF.toFixed(2)}`, 'Tracksheet system row'];
  };
  const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const exportExcel = () => {
    const body = allReports.map((row) => `<tr>${valuesFor(row).map((value) => `<td>${esc(value)}</td>`).join('')}</tr>`).join('');
    const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'application/vnd.ms-excel' }));
    const link = document.createElement('a'); link.href = url; link.download = 'Performance_Vessel_Reports.xls'; link.click(); URL.revokeObjectURL(url);
  };
  const exportPdf = () => {
    const win = window.open('', '_blank', 'width=1400,height=900');
    if (!win) return;
    const body = allReports.map((row) => `<tr>${valuesFor(row).map((value) => `<td>${esc(value)}</td>`).join('')}</tr>`).join('');
    win.document.write(`<html><head><title>Performance Vessel Reports</title><style>body{font:10px Arial;margin:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #aaa;padding:4px;text-align:left;white-space:nowrap}th{background:#eee;white-space:normal}@page{size:landscape}</style></head><body><h1>Performance Vessel Reports</h1><table><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></body></html>`);
    win.document.close(); win.focus(); win.print();
  };
  return (
    <section className="fv-interim__stats-card fv-interim__reports-card">
      <div className="fv-interim__reports-head">
        <h3>Vessel Reports &amp; Weather Comparison</h3>
        <span>Vessel reported weather vs tracksheet system weather</span>
        <span className="fv-interim__reports-actions"><button type="button" onClick={exportExcel}><i className="fas fa-file-excel" aria-hidden="true" /> Excel</button><button type="button" onClick={exportPdf}><i className="fas fa-file-pdf" aria-hidden="true" /> PDF</button></span>
      </div>
      <div className="fv-interim__reports-scroll">
        <table className="fv-interim__reports-table">
          <thead>
            <tr>
              {headers.map((header) => <th key={header}>{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 && <tr><td colSpan={18}>No tracksheet reports available.</td></tr>}
            {reports.map((row) => (
              <tr key={row.id}>
                {(() => { const values = reportValues(row); return <>
                  <td>{row.rt || 'Report'}</td>
                  <td>{fmtTrackDate(row.date)} {fmtTrackTime(row.time)}</td>
                  <td>—</td>
                  <td className="fv-interim__reports-num">{row.hrs ?? '—'}</td>
                  <td>{row.lat || '—'} / {row.lng || '—'}</td>
                  <td className="fv-interim__reports-num">{row.avgSpeedO ?? '—'}</td>
                  <td className="fv-interim__reports-num">—</td>
                  <td className="fv-interim__reports-num">{row.distR ?? '—'}</td>
                  <td className="fv-interim__reports-num">{row.distO ?? '—'}</td>
                  <td className="fv-interim__reports-num">{row.vlsfoRob ?? '—'}</td>
                  <td className="fv-interim__reports-num">{row.lsmgoRob ?? '—'}</td>
                  <td className="fv-interim__reports-num">{values.consFo == null ? '—' : values.consFo.toFixed(3)}</td>
                  <td className="fv-interim__reports-num">{values.consGo == null ? '—' : values.consGo.toFixed(3)}</td>
                  <td className="fv-interim__reports-num">{row.rpm ?? '—'}</td>
                  <td className="fv-interim__reports-num">—</td>
                  <td className="fv-interim__reports-num">{row.slip ?? '—'}</td>
                  <td>{row.windO || '—'} / {row.wavesO || '—'}</td>
                  <td>Wind {row.windF.toFixed(2)} · Wave {row.waveF.toFixed(2)} · Curr {row.currF.toFixed(2)}</td>
                  <td>Tracksheet system row</td>
                </>; })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function InterimDashboardPage() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const selectedVoyage = useSelectedVoyage();
  // The active leg follows the leg picked in the top header (ODAS row) dropdown.
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

  const activeLeg = useMemo(
    () => legs.find((leg) => leg.no === selectedLegNo) ?? legs[0],
    [legs, selectedLegNo],
  );

  const cpDetails = useMemo<CpDetails>(() => {
    if (!activeLeg) return STUB_CP;
    const defaultSpeedRow = activeLeg.speedCons.find((row) => row.isDefault) ?? activeLeg.speedCons[0];
    const speedKn = Number(activeLeg.cpAboutSpeed || defaultSpeedRow?.speed || STUB_CP.speedKn) || STUB_CP.speedKn;
    const consFoPerDay = Number(defaultSpeedRow?.dailyCons1 || STUB_CP.consFoPerDay) || STUB_CP.consFoPerDay;
    const consGoPerDay = Number(defaultSpeedRow?.dailyCons2 || STUB_CP.consGoPerDay) || STUB_CP.consGoPerDay;
    const windLimit = activeLeg.cpWinds || '4';
    const swhLimit = activeLeg.cpSwh || '2.5';
    const currentLimit = parseNum(activeLeg.cpCurrents || '0.5');
    return {
      speedKn,
      consFoPerDay,
      consGoPerDay,
      speed: `${speedKn.toFixed(1)} kt`,
      consFo: `${consFoPerDay.toFixed(2)} MT/day`,
      consGo: `${consGoPerDay.toFixed(2)} MT/day`,
      weatherClause: `BF ≤ ${windLimit} / DSS ≤ ${activeLeg.cpDss || '3'} / Currents ${activeLeg.cpCurrents || '0.5 kn'}`,
      goodWeatherDef: `BF ≤ ${windLimit}, Wave ≤ ${swhLimit} m, Current ≤ ${currentLimit.toFixed(1)} kt`,
    };
  }, [activeLeg]);

  const toggleSeries = (key: string) => {
    setVisibleSeries((prev) => ({ ...prev, [key]: !prev[key] }));
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
      const hours = r.hrs && r.hrs > 0 ? r.hrs : 24;
      const factor = 24 / hours;
      const dist = r.distO ?? r.distR ?? 0;
      const foRaw = computeCons(noon, idx, 'vlsfo') ?? 0;
      const goRaw = computeCons(noon, idx, 'lsmgo') ?? 0;
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

  const interimSummaryRows = useMemo<InterimSummaryRow[]>(() => {
    const reports = STUB_NOON_REPORTS;
    const windLimit = Number(activeLeg?.cpWinds || 4) || 4;
    const swhLimit = Number(activeLeg?.cpSwh || 2.5) || 2.5;
    const currentLimit = parseNum(activeLeg?.cpCurrents || '0.5') || 0.5;
    const isGoodWeather = (row: NoonReportRow) =>
      row.bf <= windLimit
      && parseNum(row.sigWaveHeight) <= swhLimit
      && Math.abs(parseNum(row.currentFactor)) <= currentLimit;

    const aggregate = (rows: NoonReportRow[]) => {
      const hours = rows.reduce((sum, row) => sum + row.hoursSlr, 0);
      const distance = rows.reduce((sum, row) => sum + parseNum(row.distance), 0);
      const fo = rows.reduce((sum, row) => sum + parseNum(row.fo), 0);
      const go = rows.reduce((sum, row) => sum + parseNum(row.doGo), 0);
      const performanceDistance = rows.reduce(
        (sum, row) => sum + (parseNum(row.sog) - parseNum(row.currentFactor)) * row.hoursSlr,
        0,
      );
      const avgSpeed = hours > 0 ? distance / hours : 0;
      const avgPerformanceSpeed = hours > 0 ? performanceDistance / hours : 0;
      const avgFo = hours > 0 ? (fo / hours) * 24 : 0;
      const avgGo = hours > 0 ? (go / hours) * 24 : 0;
      const cpHours = cpDetails.speedKn > 0 ? distance / cpDetails.speedKn : 0;
      const cpFo = cpDetails.consFoPerDay * (hours / 24);
      const cpGo = cpDetails.consGoPerDay * (hours / 24);
      return {
        hours,
        distance,
        fo,
        go,
        avgSpeed,
        avgPerformanceSpeed,
        avgFo,
        avgGo,
        projectedTime: cpHours - hours,
        projectedFo: fo - cpFo,
        projectedGo: go - cpGo,
      };
    };

    const overall = aggregate(reports);
    const goodWeather = aggregate(reports.filter(isGoodWeather));
    const goodPct = overall.hours > 0 ? (goodWeather.hours / overall.hours) * 100 : 0;

    return [
      {
        label: 'TIME @ SEA',
        overall: {
          primary: formatHours(overall.hours),
        },
        goodWeather: {
          primary: `${formatHours(goodWeather.hours)} (${goodPct.toFixed(1)}%)`,
        },
      },
      {
        label: 'DISTANCE',
        overall: { primary: `${overall.distance.toFixed(0)} NM` },
        goodWeather: { primary: `${goodWeather.distance.toFixed(0)} NM` },
      },
      {
        label: 'AVERAGE SPEED',
        overall: { primary: formatSpeed(overall.avgSpeed) },
        goodWeather: { primary: formatSpeed(goodWeather.avgSpeed) },
      },
      {
        label: 'AVERAGE PERFORMANCE SPEED',
        overall: { primary: formatSpeed(overall.avgPerformanceSpeed) },
        goodWeather: { primary: formatSpeed(goodWeather.avgPerformanceSpeed) },
      },
      {
        label: 'AVERAGE VLSFO',
        overall: { primary: formatMts(overall.avgFo) },
        goodWeather: { primary: formatMts(goodWeather.avgFo) },
      },
      {
        label: 'AVERAGE LSMGO',
        overall: { primary: formatMts(overall.avgGo) },
        goodWeather: { primary: formatMts(goodWeather.avgGo) },
      },
      {
        label: 'AVERAGE NONE',
        overall: { primary: formatMts(0) },
        goodWeather: { primary: formatMts(0) },
      },
      {
        label: 'PROJECTED TIME',
        overall: projectionTimeCell(overall.projectedTime),
        goodWeather: projectionTimeCell(goodWeather.projectedTime),
      },
      {
        label: 'PROJECTED VLSFO',
        overall: projectionFuelCell(overall.projectedFo),
        goodWeather: projectionFuelCell(goodWeather.projectedFo),
      },
      {
        label: 'PROJECTED LSMGO',
        overall: projectionFuelCell(overall.projectedGo),
        goodWeather: projectionFuelCell(goodWeather.projectedGo),
      },
      {
        label: 'PROJECTED NONE',
        overall: { primary: formatMts(0) },
        goodWeather: { primary: formatMts(0) },
      },
    ];
  }, [activeLeg, cpDetails]);

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
              <strong>{cpDetails.speed}</strong>
            </li>
            <li>
              <span>{t('cpConsFo', 'Cons FO')}</span>
              <strong>{cpDetails.consFo}</strong>
            </li>
            <li>
              <span>{t('cpConsGo', 'Cons GO')}</span>
              <strong>{cpDetails.consGo}</strong>
            </li>
            <li>
              <span>{t('weatherClause', 'WX Clause')}</span>
              <strong>{cpDetails.weatherClause}</strong>
            </li>
            <li>
              <span>{t('goodWeatherDef', 'Good WX Def.')}</span>
              <strong>{cpDetails.goodWeatherDef}</strong>
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
        <section className="fv-interim__stats-card fv-interim__stats-card--summary fv-interim__stats-card--summary-full">
          <h3>{t('interimSummaryProjections', 'Interim Summary and Projections')}</h3>
          <table className="fv-interim__summary-table fv-interim__summary-table--compact">
            <thead>
              <tr>
                <th />
                <th>{t('overall', 'Overall')}</th>
                <th>{t('goodWeather', 'Good Weather')}</th>
              </tr>
            </thead>
            <tbody>
              {interimSummaryRows.map((row, idx) => (
                <tr key={row.label} className={idx === 6 ? 'fv-interim__summary-separator' : undefined}>
                  <th>{row.label}</th>
                  <td>
                    <strong className={row.overall.tone ? `fv-interim__summary-cell-value fv-interim__summary-tone fv-interim__summary-tone--${row.overall.tone}` : 'fv-interim__summary-cell-value'}>
                      {row.overall.primary}
                    </strong>
                  </td>
                  <td>
                    <strong className={row.goodWeather.tone ? `fv-interim__summary-cell-value fv-interim__summary-tone fv-interim__summary-tone--${row.goodWeather.tone}` : 'fv-interim__summary-cell-value'}>
                      {row.goodWeather.primary}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
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
