import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';
import { writeSelectedVoyageId } from '../data/selectedVoyage';

/**
 * Fleet List View page — `/main`.
 *
 * Operations / handover dashboard matching the Excel layout the user
 * provided:
 *   - Top bar: logo, Time From / Time To, PIC, Shift View, Fleet View
 *     (list / map) toggle, Create New Voyage.
 *   - KPI strip: active / completed / total voyages plus per-service
 *     counts (RPM, PMO, Optinav, weather-or-waypoint-only, shadow
 *     monitoring).
 *   - Tasks Highlight strip + Prepare Handover Summary action.
 *   - Filter strip: PIC / Assigned To / Client / Service / Status /
 *     Priority / Port / ETA / Due LT / Tags / AI Alert dropdowns and a
 *     Show Active Only toggle.
 *   - Main grid (Priority … Handover Note … Open).
 *   - Footer summary bar with the rolled-up counts.
 *
 * Layout-only first pass: the dropdown filters and Show Active Only are
 * wired to the stub rows; sorting, column resize and the per-row actions
 * are placeholders. Replace `TASK_ROWS` with the real
 * `/api/voyage/list` payload when the endpoint is exposed.
 */

type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

interface TaskRow {
  priority: Priority;
  dueLt: number;
  dueUtc: number;
  remaining: string;
  orderId: string;
  vessel: string;
  pic: string;
  client: string;
  service: string;
  status: string;
  portFrom: string;
  portTo: string;
  eta: string;
  lastNoon: string;
  wx: string;
  int: string;
  eov: string;
  opt: string;
  openTasks: number;
  tags: string;
  aiAlert: string;
  health: number;
  handoverNote: string;
  open: string;
}

const TASK_ROWS: TaskRow[] = [
  {
    priority: 'HIGH',
    dueLt: 900,
    dueUtc: 300,
    remaining: '01:20',
    orderId: 'OPT001',
    vessel: 'MV ABC',
    pic: 'Amit',
    client: 'Cargill',
    service: 'PMO',
    status: 'At Sea',
    portFrom: 'Singapore',
    portTo: 'Santos',
    eta: '18-Jun 1200',
    lastNoon: '0600 UTC',
    wx: 'Y',
    int: 'Y',
    eov: 'N',
    opt: 'Y',
    openTasks: 3,
    tags: 'Typhoon, ETA',
    aiAlert: 'ETA Risk',
    health: 65,
    handoverNote: 'Monitor weather near Japan',
    open: 'OPEN',
  },
  {
    priority: 'MEDIUM',
    dueLt: 1000,
    dueUtc: 400,
    remaining: '02:35',
    orderId: 'OPT002',
    vessel: 'MV XYZ',
    pic: 'Rahul',
    client: 'Bunge',
    service: 'RPM',
    status: 'At Sea',
    portFrom: 'Fujairah',
    portTo: 'Rotterdam',
    eta: '22-Jun 0800',
    lastNoon: '0500 UTC',
    wx: 'Y',
    int: 'N',
    eov: 'N',
    opt: 'N',
    openTasks: 2,
    tags: 'FuelIssue',
    aiAlert: 'Fuel Increase',
    health: 78,
    handoverNote: 'Awaiting owner reply',
    open: 'OPEN',
  },
  {
    priority: 'LOW',
    dueLt: 1300,
    dueUtc: 700,
    remaining: '05:10',
    orderId: 'OPT003',
    vessel: 'MV John',
    pic: 'John',
    client: 'WX',
    service: 'Monitoring',
    status: 'At Port',
    portFrom: 'Santos',
    portTo: 'Santos',
    eta: 'N/A',
    lastNoon: '0000 UTC',
    wx: 'Y',
    int: 'N/A',
    eov: 'N/A',
    opt: 'N/A',
    openTasks: 0,
    tags: 'PortStay',
    aiAlert: 'None',
    health: 98,
    handoverNote: 'Cargo ops ongoing',
    open: 'OPEN',
  },
  {
    priority: 'HIGH',
    dueLt: 800,
    dueUtc: 200,
    remaining: '00:45',
    orderId: 'OPT004',
    vessel: 'MV Pacific',
    pic: 'Sara',
    client: 'Trafigura',
    service: 'PMO',
    status: 'At Sea',
    portFrom: 'Houston',
    portTo: 'Rotterdam',
    eta: '20-Jun 1500',
    lastNoon: '0600 UTC',
    wx: 'Y',
    int: 'Y',
    eov: 'N',
    opt: 'Y',
    openTasks: 5,
    tags: 'Storm, Deviation',
    aiAlert: 'Weather Risk',
    health: 58,
    handoverNote: 'Route deviation under review',
    open: 'OPEN',
  },
  {
    priority: 'MEDIUM',
    dueLt: 1100,
    dueUtc: 500,
    remaining: '03:15',
    orderId: 'OPT005',
    vessel: 'MV Atlantic',
    pic: 'Amit',
    client: 'Cargill',
    service: 'RPM',
    status: 'At Sea',
    portFrom: 'Santos',
    portTo: 'Qingdao',
    eta: '28-Jun 0200',
    lastNoon: '0500 UTC',
    wx: 'Y',
    int: 'Y',
    eov: 'N',
    opt: 'Y',
    openTasks: 1,
    tags: 'ETA',
    aiAlert: 'On Track',
    health: 82,
    handoverNote: 'Steady progress, no issues',
    open: 'OPEN',
  },
  {
    priority: 'LOW',
    dueLt: 1400,
    dueUtc: 800,
    remaining: '06:40',
    orderId: 'OPT006',
    vessel: 'MV Orient',
    pic: 'Rahul',
    client: 'Bunge',
    service: 'Optinav',
    status: 'At Port',
    portFrom: 'Qingdao',
    portTo: 'Qingdao',
    eta: 'N/A',
    lastNoon: '0000 UTC',
    wx: 'N',
    int: 'N/A',
    eov: 'N/A',
    opt: 'N/A',
    openTasks: 0,
    tags: 'Bunkering',
    aiAlert: 'None',
    health: 95,
    handoverNote: 'Bunkering scheduled tomorrow',
    open: 'OPEN',
  },
  {
    priority: 'HIGH',
    dueLt: 950,
    dueUtc: 350,
    remaining: '01:05',
    orderId: 'OPT007',
    vessel: 'MV Northern Star',
    pic: 'John',
    client: 'Vitol',
    service: 'PMO',
    status: 'At Sea',
    portFrom: 'Rotterdam',
    portTo: 'New York',
    eta: '24-Jun 1800',
    lastNoon: '0600 UTC',
    wx: 'Y',
    int: 'N',
    eov: 'N',
    opt: 'Y',
    openTasks: 4,
    tags: 'Typhoon, FuelIssue',
    aiAlert: 'Fuel Increase',
    health: 61,
    handoverNote: 'High consumption flagged by AI',
    open: 'OPEN',
  },
  {
    priority: 'MEDIUM',
    dueLt: 1050,
    dueUtc: 450,
    remaining: '02:50',
    orderId: 'OPT008',
    vessel: 'MV Southern Cross',
    pic: 'Sara',
    client: 'Glencore',
    service: 'Weather Only',
    status: 'At Sea',
    portFrom: 'Singapore',
    portTo: 'Fujairah',
    eta: '21-Jun 0900',
    lastNoon: '0500 UTC',
    wx: 'Y',
    int: 'N',
    eov: 'N',
    opt: 'N',
    openTasks: 2,
    tags: 'ETA',
    aiAlert: 'ETA Risk',
    health: 74,
    handoverNote: 'Monitoring monsoon swell',
    open: 'OPEN',
  },
  {
    priority: 'LOW',
    dueLt: 1500,
    dueUtc: 900,
    remaining: '07:20',
    orderId: 'OPT009',
    vessel: 'MV Endeavour',
    pic: 'Amit',
    client: 'Trafigura',
    service: 'Shadow Monitoring',
    status: 'Completed',
    portFrom: 'New York',
    portTo: 'Houston',
    eta: '15-Jun 1000',
    lastNoon: '0000 UTC',
    wx: 'N',
    int: 'N/A',
    eov: 'Y',
    opt: 'N/A',
    openTasks: 0,
    tags: 'None',
    aiAlert: 'None',
    health: 99,
    handoverNote: 'Voyage closed, EOV sent',
    open: 'CLOSED',
  },
  {
    priority: 'HIGH',
    dueLt: 870,
    dueUtc: 270,
    remaining: '00:30',
    orderId: 'OPT010',
    vessel: 'MV Voyager',
    pic: 'Rahul',
    client: 'Cargill',
    service: 'RPM',
    status: 'At Sea',
    portFrom: 'Fujairah',
    portTo: 'Singapore',
    eta: '19-Jun 0600',
    lastNoon: '0600 UTC',
    wx: 'Y',
    int: 'Y',
    eov: 'N',
    opt: 'Y',
    openTasks: 6,
    tags: 'Storm, ETA, Deviation',
    aiAlert: 'Weather Risk',
    health: 54,
    handoverNote: 'Awaiting revised routing from ops',
    open: 'OPEN',
  },
];

/** Service-type buckets used by the KPI strip. */
const SERVICE_KPIS: { label: string; match: (s: string) => boolean }[] = [
  { label: 'RPM', match: (s) => s === 'RPM' },
  { label: 'PMO', match: (s) => s === 'PMO' },
  { label: 'Optinav', match: (s) => s === 'Optinav' },
  {
    label: 'Weather / Waypoint Only',
    match: (s) => s === 'Weather Only' || s === 'Waypoint Only',
  },
  { label: 'Shadow Monitoring', match: (s) => s === 'Shadow Monitoring' },
];

/** Count rows considered "active" (anything not closed/completed). */
function isActiveRow(row: TaskRow): boolean {
  return row.open.toUpperCase() === 'OPEN' && row.status !== 'Completed';
}

/** Build the KPI cards live from the current rows. */
function buildKpiCards(
  rows: TaskRow[],
): { label: string; value: string | number; accent?: string }[] {
  const active = rows.filter(isActiveRow).length;
  const completed = rows.length - active;
  const serviceCards = SERVICE_KPIS.map((svc) => ({
    label: svc.label,
    value: rows.filter((r) => svc.match(r.service)).length,
  }));
  return [
    { label: 'Active Vessels', value: active, accent: 'fv-fleet-kpi__card--accent' },
    { label: 'Completed Vessels', value: completed },
    { label: 'Total Voyages', value: rows.length },
    ...serviceCards,
  ];
}

/** Parse a "HH:mm" remaining string into minutes (null when unknown). */
function remainingMinutes(remaining: string): number | null {
  const m = remaining.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Build the Tasks Highlight chips live from the current rows. */
function buildTaskHighlights(
  rows: TaskRow[],
): { label: string; value: number; tone: string }[] {
  const openTasks = rows.reduce((acc, r) => acc + r.openTasks, 0);
  const dueSoon = rows.filter((r) => {
    const mins = remainingMinutes(r.remaining);
    return mins !== null && mins <= 120;
  }).length;
  const forecastOverdue = rows.filter((r) => r.opt === 'N').length;
  const noonMissing = rows.filter((r) => r.lastNoon.startsWith('0000')).length;
  const etaRisks = rows.filter((r) => /eta/i.test(r.aiAlert)).length;
  const weatherRisks = rows.filter((r) => /weather|storm|typhoon/i.test(r.aiAlert)).length;
  const completed = rows.filter((r) => !isActiveRow(r)).length;
  return [
    { label: 'Open Tasks', value: openTasks, tone: 'info' },
    { label: 'Due in next 2 hrs', value: dueSoon, tone: 'warn' },
    { label: 'Forecast overdue', value: forecastOverdue, tone: 'danger' },
    { label: 'Noon Missing', value: noonMissing, tone: 'warn' },
    { label: 'ETA Risks', value: etaRisks, tone: 'danger' },
    { label: 'Weather Risks', value: weatherRisks, tone: 'danger' },
    { label: 'Completed Tasks', value: completed, tone: 'ok' },
  ];
}

/** Build the footer rolled-up summary live from the current rows. */
function buildFooterSummary(rows: TaskRow[]): { label: string; value: number }[] {
  const highlights = buildTaskHighlights(rows);
  const byLabel = (label: string) =>
    highlights.find((h) => h.label === label)?.value ?? 0;
  return [
    { label: 'Active Vessels', value: rows.filter(isActiveRow).length },
    { label: 'Due Next 2 Hrs', value: byLabel('Due in next 2 hrs') },
    { label: 'Forecast Overdue', value: byLabel('Forecast overdue') },
    { label: 'Noon Missing', value: byLabel('Noon Missing') },
    { label: 'ETA Risks', value: byLabel('ETA Risks') },
    { label: 'Weather Risks', value: byLabel('Weather Risks') },
    { label: 'Open Tasks', value: byLabel('Open Tasks') },
    { label: 'Completed', value: byLabel('Completed Tasks') },
  ];
}

const COLUMNS: { key: keyof TaskRow; label: string; width?: number }[] = [
  { key: 'priority', label: 'Priority', width: 90 },
  { key: 'dueLt', label: 'Due LT', width: 70 },
  { key: 'dueUtc', label: 'Due UTC', width: 80 },
  { key: 'remaining', label: 'Remaining', width: 90 },
  { key: 'orderId', label: 'Order ID', width: 90 },
  { key: 'vessel', label: 'Vessel', width: 110 },
  { key: 'pic', label: 'PIC', width: 90 },
  { key: 'client', label: 'Client', width: 100 },
  { key: 'service', label: 'Service', width: 100 },
  { key: 'status', label: 'Status', width: 90 },
  { key: 'portFrom', label: 'Port From', width: 110 },
  { key: 'portTo', label: 'Port To', width: 110 },
  { key: 'eta', label: 'ETA', width: 110 },
  { key: 'lastNoon', label: 'Last Noon', width: 100 },
  { key: 'wx', label: 'Wx', width: 50 },
  { key: 'int', label: 'Int', width: 50 },
  { key: 'eov', label: 'EOV', width: 55 },
  { key: 'opt', label: 'Opt', width: 50 },
  { key: 'openTasks', label: 'Open Tasks', width: 90 },
  { key: 'tags', label: 'Tags', width: 120 },
  { key: 'aiAlert', label: 'AI Alert', width: 120 },
  { key: 'health', label: 'Health', width: 110 },
  { key: 'handoverNote', label: 'Handover Note', width: 200 },
  { key: 'open', label: 'Open', width: 80 },
];

/** Dropdown filter definitions: label + the row field they filter on. */
const FILTER_FIELDS: { key: keyof TaskRow; label: string }[] = [
  { key: 'pic', label: 'PIC' },
  { key: 'client', label: 'Client' },
  { key: 'service', label: 'Service' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'portFrom', label: 'Port' },
  { key: 'eta', label: 'ETA' },
  { key: 'dueLt', label: 'Due LT' },
  { key: 'tags', label: 'Tags' },
  { key: 'aiAlert', label: 'AI Alert' },
];

function uniqueValues(key: keyof TaskRow): string[] {
  return Array.from(new Set(TASK_ROWS.map((r) => String(r[key])))).sort();
}

function priorityClass(p: Priority): string {
  return `fv-fleet-grid__priority fv-fleet-grid__priority--${p.toLowerCase()}`;
}

function healthClass(h: number): string {
  if (h >= 85) return 'fv-fleet-grid__health-fill--ok';
  if (h >= 70) return 'fv-fleet-grid__health-fill--warn';
  return 'fv-fleet-grid__health-fill--danger';
}

function renderCell(row: TaskRow, key: keyof TaskRow): React.ReactNode {
  if (key === 'priority') {
    return <span className={priorityClass(row.priority)}>{row.priority}</span>;
  }
  if (key === 'health') {
    return (
      <span className="fv-fleet-grid__health">
        <span className="fv-fleet-grid__health-bar">
          <span
            className={`fv-fleet-grid__health-fill ${healthClass(row.health)}`}
            style={{ width: `${row.health}%` }}
          />
        </span>
        <span className="fv-fleet-grid__health-pct">{row.health}%</span>
      </span>
    );
  }
  if (key === 'open') {
    return <span className="fv-fleet-grid__open-badge">{row.open}</span>;
  }
  if (key === 'vessel') {
    return (
      <Link
        className="fv-fleet-grid__vessel-link"
        to={`/voyage?voyage=${encodeURIComponent(row.orderId)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => writeSelectedVoyageId(row.orderId)}
        title={`Open ${row.vessel} voyage details`}
      >
        {row.vessel}
        <i className="fas fa-arrow-right" aria-hidden="true" />
      </Link>
    );
  }
  if (key === 'tags') {
    return (
      <span className="fv-fleet-grid__tags">
        {row.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
          .map((tag) => (
            <span key={tag} className="fv-fleet-grid__tag">
              {tag}
            </span>
          ))}
      </span>
    );
  }
  return String(row[key]);
}

export function FleetListPage() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pic, setPic] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const setFilter = (label: string, value: string) => {
    setFilters((prev) => ({ ...prev, [label]: value }));
  };

  const visibleRows = useMemo(() => {
    return TASK_ROWS.filter((row) => {
      if (showActiveOnly && row.open.toUpperCase() !== 'OPEN') return false;
      if (pic && row.pic.toLowerCase() !== pic.toLowerCase()) return false;

      for (const field of FILTER_FIELDS) {
        const selected = filters[field.label];
        if (selected && String(row[field.key]) !== selected) return false;
      }
      return true;
    });
  }, [showActiveOnly, pic, filters]);

  // KPI / highlight / footer strips are derived live from the rows in
  // view so they always reflect the current filter selection.
  const kpiCards = useMemo(() => buildKpiCards(visibleRows), [visibleRows]);
  const taskHighlights = useMemo(
    () => buildTaskHighlights(visibleRows),
    [visibleRows],
  );
  const footerSummary = useMemo(
    () => buildFooterSummary(visibleRows),
    [visibleRows],
  );

  return (
    <div className="fv-fleet">
      {/* TOP BAR ---------------------------------------------------- */}
      <header className="fv-fleet__topbar">
        <div className="fv-fleet__brand">
          <i className="fas fa-ship" aria-hidden="true" />
          <span>FleetView</span>
        </div>

        <div className="fv-fleet__topbar-fields">
          <label>
            <span>{t('timeFrom', 'Time From')}</span>
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            <span>{t('timeTo', 'Time To')}</span>
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label>
            <span>{t('pic', 'PIC')}</span>
            <select value={pic} onChange={(e) => setPic(e.target.value)}>
              <option value="">{t('all', 'All')}</option>
              {uniqueValues('pic').map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="fv-fleet__topbar-actions">
          <button type="button" className="fv-fleet__btn">
            <i className="fas fa-right-left" aria-hidden="true" />
            <span>{t('shiftView', 'Shift View')}</span>
          </button>

          <div className="fv-fleet__view-toggle" role="group" aria-label="Fleet view">
            <button
              type="button"
              className={`fv-fleet__view-btn${
                view === 'list' ? ' fv-fleet__view-btn--active' : ''
              }`}
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
            >
              <i className="fas fa-list" aria-hidden="true" /> {t('list', 'List')}
            </button>
            <button
              type="button"
              className={`fv-fleet__view-btn${
                view === 'map' ? ' fv-fleet__view-btn--active' : ''
              }`}
              onClick={() => setView('map')}
              aria-pressed={view === 'map'}
            >
              <i className="fas fa-map-location-dot" aria-hidden="true" /> {t('map', 'Map')}
            </button>
          </div>

          <Link
            to="/voyage/new"
            target="_blank"
            rel="noopener noreferrer"
            className="fv-fleet__new-btn"
            title={t('createNewVoyage', 'Create New Voyage')}
          >
            <i className="fas fa-plus" aria-hidden="true" />
            <span>{t('createNewVoyage', 'Create New Voyage')}</span>
          </Link>
        </div>
      </header>

      {/* KPI STRIP -------------------------------------------------- */}
      <section className="fv-fleet-kpi" aria-label="KPIs">
        <span className="fv-fleet-kpi__label">{t('kpi', 'KPI')}</span>
        <div className="fv-fleet-kpi__cards">
          {kpiCards.map((card) => (
            <div
              key={card.label}
              className={`fv-fleet-kpi__card${card.accent ? ` ${card.accent}` : ''}`}
            >
              <span className="fv-fleet-kpi__value">{card.value}</span>
              <span className="fv-fleet-kpi__caption">{card.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* TASKS HIGHLIGHT -------------------------------------------- */}
      <section className="fv-fleet-tasks" aria-label="Task highlights">
        <span className="fv-fleet-tasks__label">
          {t('tasksHighlight', 'Tasks Highlight')}
        </span>
        <div className="fv-fleet-tasks__chips">
          {taskHighlights.map((task) => (
            <span
              key={task.label}
              className={`fv-fleet-tasks__chip fv-fleet-tasks__chip--${task.tone}`}
            >
              <strong>{task.value}</strong> {task.label}
            </span>
          ))}
        </div>
        <button type="button" className="fv-fleet__btn fv-fleet__btn--ghost">
          <i className="fas fa-clipboard-list" aria-hidden="true" />
          <span>{t('prepareHandover', 'Prepare Handover Summary')}</span>
        </button>
      </section>

      {/* FILTER STRIP ----------------------------------------------- */}
      <section className="fv-fleet-filters" aria-label="Filters">
        {FILTER_FIELDS.map((field) => (
          <label key={field.label} className="fv-fleet-filters__item">
            <select
              value={filters[field.label] ?? ''}
              onChange={(e) => setFilter(field.label, e.target.value)}
            >
              <option value="">{field.label}</option>
              {uniqueValues(field.key).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="fv-fleet-filters__check">
          <input
            type="checkbox"
            checked={showActiveOnly}
            onChange={(e) => setShowActiveOnly(e.target.checked)}
          />
          {t('showActiveOnly', 'Show Active Only')}
        </label>
        <span className="fv-fleet-filters__count">
          {visibleRows.length} / {TASK_ROWS.length}
        </span>
      </section>

      {/* GRID ------------------------------------------------------- */}
      <div className="fv-fleet__grid-scroll">
        <table className="fv-fleet-grid">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { minWidth: col.width, width: col.width } : undefined}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="fv-fleet-grid__empty">
                  {t('noVesselsMatch', 'No voyages match the current filters.')}
                </td>
              </tr>
            )}
            {visibleRows.map((row) => (
              <tr key={row.orderId}>
                {COLUMNS.map((col) => (
                  <td key={col.key}>{renderCell(row, col.key)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FOOTER SUMMARY --------------------------------------------- */}
      <footer className="fv-fleet__footer">
        <span className="fv-fleet__footer-label">{t('summary', 'Summary')}</span>
        <ul className="fv-fleet__footer-summary">
          {footerSummary.map((item) => (
            <li key={item.label}>
              <span className="fv-fleet__footer-value">{item.value}</span>
              <span className="fv-fleet__footer-caption">{item.label}</span>
            </li>
          ))}
        </ul>
      </footer>
    </div>
  );
}
