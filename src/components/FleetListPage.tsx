import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';
import { writeSelectedVoyageId } from '../data/selectedVoyage';
import { data as fleetData } from '../api/fleetData';
import { type Priority, type TaskRow } from '../data/fleetTasks';
import { useTheme } from '../theme';
import { FleetMapView, type MapVessel } from './FleetMapView';
import { SettingsModal } from './SettingsModal';

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

// Grid row types come from ../data/fleetTasks; the rows themselves are loaded
// from the backend (`GET /api/data/fleetTasks`) at runtime — see FleetListPage.

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
  const noonMissing = rows.filter((r) => r.lastNoon >= 24).length;
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

const COLUMNS: { key: keyof TaskRow | 'actions'; label: string; width?: number }[] = [
  { key: 'priority', label: 'Priority', width: 90 },
  { key: 'dueLt', label: 'Due LT', width: 70 },
  { key: 'dueUtc', label: 'Due UTC', width: 80 },
  { key: 'remaining', label: 'Remaining', width: 90 },
  { key: 'orderId', label: 'Order ID', width: 90 },
  { key: 'vessel', label: 'Vessel', width: 110 },
  { key: 'createdDate', label: 'Created On', width: 160 },
  { key: 'pic', label: 'PIC', width: 90 },
  { key: 'client', label: 'Client', width: 100 },
  { key: 'clientType', label: 'Client Type', width: 110 },
  { key: 'voyageType', label: 'Voyage Type', width: 130 },
  { key: 'service', label: 'Service', width: 100 },
  { key: 'status', label: 'Status', width: 90 },
  { key: 'legDesc', label: 'Leg Desc', width: 130 },
  { key: 'portFrom', label: 'Port From', width: 110 },
  { key: 'portVia', label: 'Port Via', width: 110 },
  { key: 'portTo', label: 'Port To', width: 110 },
  { key: 'etd', label: 'ETD', width: 110 },
  { key: 'eta', label: 'ETA', width: 110 },
  { key: 'lastNoon', label: 'Last Noon', width: 100 },
  { key: 'lastAis', label: 'Last AIS Position', width: 140 },
  { key: 'tags', label: 'Tags', width: 120 },
  { key: 'aiAlert', label: 'AI Alert', width: 120 },
  { key: 'health', label: 'Health', width: 110 },
  { key: 'handoverNote', label: 'Voyage Note', width: 200 },
  { key: 'actions', label: 'Edit', width: 70 },
];

/** Dropdown filter definitions — one per filterable table column, in column order. */
const FILTER_FIELDS: { key: keyof TaskRow; label: string }[] = COLUMNS.filter(
  (col): col is { key: keyof TaskRow; label: string; width?: number } =>
    col.key !== 'actions',
).map((col) => ({ key: col.key, label: col.label }));

function uniqueValues(rows: TaskRow[], key: keyof TaskRow): string[] {
  return Array.from(new Set(rows.map((r) => String(r[key])))).sort();
}

/** Single leg-type code → human-readable label. */
const LEG_CODE_LABELS: Record<string, string> = {
  D: 'Delivery',
  RD: 'Redelivery',
  B: 'Ballast',
  L: 'Laden',
};

/** Build a tooltip describing each leg code in a `D+B+L` style value. */
function legDescTitle(code: string): string {
  return code
    .split('+')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => LEG_CODE_LABELS[c] ?? c)
    .join(' → ');
}

function priorityClass(p: Priority): string {
  return `fv-fleet-grid__priority fv-fleet-grid__priority--${p.toLowerCase()}`;
}

/** Render "how long ago" the last noon report was received. */
function formatLastNoon(hours: number): string {
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return rem === 0 ? `${days}d ago` : `${days}d ${rem}h ago`;
}

/** Render "how long ago" the last AIS position was fetched (minute precision). */
function formatLastAis(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins === 0 ? `${hours}h ago` : `${hours}h ${mins}m ago`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH === 0 ? `${days}d ago` : `${days}d ${remH}h ago`;
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
  if (key === 'legDesc') {    const legCount = row.legDesc
      .split('+')
      .map((c) => c.trim())
      .filter(Boolean).length;
    return (
      <span className="fv-fleet-grid__leg-desc" title={legDescTitle(row.legDesc)}>
        {legCount} ({row.legDesc})
      </span>
    );
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
  if (key === 'lastNoon') {
    const stale = row.lastNoon >= 24;
    return (
      <span
        className={`fv-fleet-grid__last-noon${
          stale ? ' fv-fleet-grid__last-noon--stale' : ''
        }`}
        title={`Last noon report received ${formatLastNoon(row.lastNoon)}`}
      >
        {formatLastNoon(row.lastNoon)}
      </span>
    );
  }
  if (key === 'lastAis') {
    const stale = row.lastAis >= 1440;
    return (
      <span
        className={`fv-fleet-grid__last-noon${
          stale ? ' fv-fleet-grid__last-noon--stale' : ''
        }`}
        title={`Last AIS position fetched ${formatLastAis(row.lastAis)}`}
      >
        {formatLastAis(row.lastAis)}
      </span>
    );
  }
  if (key === 'vessel') {
    return (
      <Link
        className={`fv-fleet-grid__vessel-link fv-fleet-grid__vessel-link--${row.priority.toLowerCase()}`}
        to={`/route-explorer?voyage=${encodeURIComponent(row.orderId)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => writeSelectedVoyageId(row.orderId)}
        title={`${row.vessel} — ${row.priority} priority`}
      >
        <span className="fv-fleet-grid__vessel-dot" aria-hidden="true" />
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
  // Grid rows are loaded exclusively from the backend
  // (`GET /api/data/fleetTasks`). No local fallback.
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState('');
  const [shiftView, setShiftView] = useState(true);
  // Switch mode (light theme) is off by default on every load.
  const [theme, toggleTheme] = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Open/close a column filter panel, resetting the search box each time.
  const toggleFilterPanel = (label: string) => {
    setOpenFilter((prev) => (prev === label ? null : label));
    setFilterSearch('');
  };

  // Toggle a single value within a column's multi-select filter.
  const toggleFilterValue = (label: string, value: string) => {
    setFilters((prev) => {
      const current = prev[label] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (next.length === 0) {
        const { [label]: _omit, ...rest } = prev;
        return rest;
      }
      return { ...prev, [label]: next };
    });
  };

  const clearFilters = () => {
    setFilters({});
    setOpenFilter(null);
  };

  // Close the open filter popover on any outside click.
  useEffect(() => {
    if (!openFilter) return;
    const onDocClick = () => setOpenFilter(null);
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openFilter]);

  // Close the profile menu on any outside click.
  useEffect(() => {
    if (!profileOpen) return;
    const onDocClick = () => setProfileOpen(false);
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [profileOpen]);

  // Load the fleet grid rows from the backend. Backend is the only source —
  // on failure the grid stays empty and an error banner is shown.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fleetData
      .get<TaskRow[]>('fleetTasks')
      .then((data) => {
        if (cancelled) return;
        setRows(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(
          'Could not load fleet data from the server. Make sure the backend is running.',
        );
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      if (pic && row.pic.toLowerCase() !== pic.toLowerCase()) return false;

      for (const field of FILTER_FIELDS) {
        const selected = filters[field.label];
        if (
          selected &&
          selected.length > 0 &&
          !selected.includes(String(row[field.key]))
        ) {
          return false;
        }
      }
      return true;
    });
  }, [rows, pic, filters]);

  // In Shift View the first four columns (Priority, Due LT, Due UTC,
  // Remaining) are hidden and surfaced through the filter strip instead.
  const visibleColumns = useMemo(
    () =>
      shiftView
        ? COLUMNS.filter(
            (col) =>
              col.key !== 'priority' &&
              col.key !== 'dueLt' &&
              col.key !== 'dueUtc' &&
              col.key !== 'remaining',
          )
        : COLUMNS,
    [shiftView],
  );

  // KPI / highlight strips are derived live from the rows in
  // view so they always reflect the current filter selection.
  const kpiCards = useMemo(() => buildKpiCards(visibleRows), [visibleRows]);
  const taskHighlights = useMemo(
    () => buildTaskHighlights(visibleRows),
    [visibleRows],
  );

  // Vessels plotted on the Map view, derived live from the rows in view.
  const mapVessels = useMemo<MapVessel[]>(
    () =>
      visibleRows.map((row) => ({
        id: row.orderId,
        vessel: row.vessel,
        client: row.client,
        service: row.service,
        status: row.status,
        priority: row.priority,
        portFrom: row.portFrom,
        portTo: row.portTo,
        eta: row.eta,
        health: row.health,
        aiAlert: row.aiAlert,
      })),
    [visibleRows],
  );

  return (
    <div className={`fv-fleet${theme === 'light' ? ' fv-fleet--light' : ''}`}>
      {/* TOP BAR ---------------------------------------------------- */}
      <header className="fv-fleet__topbar">
        <div className="fv-fleet__brand">
          <i className="fas fa-ship" aria-hidden="true" />
          <span>STEM</span>
        </div>

        {!shiftView && view !== 'map' && (
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
                {uniqueValues(rows, 'pic').map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="fv-fleet__topbar-actions">
          {view !== 'map' && (
            <button
              type="button"
              className={`fv-fleet__btn${shiftView ? ' fv-fleet__btn--active' : ''}`}
              onClick={() => setShiftView((prev) => !prev)}
              aria-pressed={shiftView}
            >
              <i className="fas fa-right-left" aria-hidden="true" />
              <span>{t('shiftView', 'Shift View')}</span>
            </button>
          )}

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

          <button
            type="button"
            className="fv-fleet__theme-toggle"
            onClick={toggleTheme}
            aria-pressed={theme === 'light'}
            title={
              theme === 'dark'
                ? t('switchToLight', 'Switch to Light Mode')
                : t('switchToDark', 'Switch to Dark Mode')
            }
          >
            <i
              className={`fas ${theme === 'dark' ? 'fa-moon' : 'fa-sun'}`}
              aria-hidden="true"
            />
            <span>{theme === 'dark' ? t('dark', 'Dark') : t('light', 'Light')}</span>
          </button>

          <div
            className="fv-fleet__profile"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="fv-fleet__profile-btn"
              aria-label={t('profileSettings', 'Profile Settings')}
              title={t('profileSettings', 'Profile Settings')}
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen((prev) => !prev)}
            >
              <i className="fas fa-user-gear" aria-hidden="true" />
            </button>
            {profileOpen && (
              <div className="fv-fleet__profile-menu" role="menu">
                <div className="fv-fleet__profile-head">
                  <span className="fv-fleet__profile-avatar" aria-hidden="true">
                    <i className="fas fa-user" />
                  </span>
                  <div className="fv-fleet__profile-id">
                    <span className="fv-fleet__profile-name">Amit Sharma</span>
                    <span className="fv-fleet__profile-role">
                      {t('role', 'Role')}: Fleet Operator
                    </span>
                  </div>
                </div>
                <button type="button" className="fv-fleet__profile-item" role="menuitem">
                  <i className="fas fa-id-badge" aria-hidden="true" />
                  <span>{t('accountDetails', 'Account Details')}</span>
                </button>
                <button
                  type="button"
                  className="fv-fleet__profile-item"
                  role="menuitem"
                  onClick={() => {
                    setProfileOpen(false);
                    setSettingsOpen(true);
                  }}
                >
                  <i className="fas fa-gear" aria-hidden="true" />
                  <span>{t('settings', 'Settings')}</span>
                </button>
                <div className="fv-fleet__profile-divider" />
                <button
                  type="button"
                  className="fv-fleet__profile-logout"
                  role="menuitem"
                >
                  <i className="fas fa-right-from-bracket" aria-hidden="true" />
                  <span>{t('logout', 'Logout')}</span>
                </button>
              </div>
            )}
          </div>
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
        <button
          type="button"
          className="fv-fleet__btn fv-fleet__btn--ghost fv-fleet-kpi__clear"
          onClick={clearFilters}
        >
          <i className="fas fa-filter-circle-xmark" aria-hidden="true" />
          <span>{t('clearFilters', 'Clear Filters')}</span>
        </button>
      </section>

      {/* TASKS HIGHLIGHT -------------------------------------------- */}
      {!shiftView && view !== 'map' && (
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
      )}

      {/* FILTER STRIP ----------------------------------------------- */}
      <section className="fv-fleet-filters" aria-label="Filters">
        <span className="fv-fleet-filters__count">
          {visibleRows.length} / {rows.length}
        </span>
      </section>

      {/* GRID / MAP ------------------------------------------------- */}
      {view === 'map' ? (
        <FleetMapView vessels={mapVessels} theme={theme} />
      ) : (
        <div className="fv-fleet__grid-scroll">
          <table className="fv-fleet-grid">
            <thead>
              <tr>
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    style={col.width ? { minWidth: col.width, width: col.width } : undefined}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
              <tr className="fv-fleet-grid__filter-row">
                {visibleColumns.map((col) => {
                  if (col.key === 'actions') {
                    return (
                      <th key={col.key} className="fv-fleet-grid__filter-cell" />
                    );
                  }
                  const selected = filters[col.label] ?? [];
                  const isOpen = openFilter === col.label;
                  return (
                    <th
                      key={col.key}
                      className="fv-fleet-grid__filter-cell"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={`fv-fleet-grid__filter-btn${
                          selected.length > 0 ? ' fv-fleet-grid__filter-btn--active' : ''
                        }`}
                        onClick={() =>
                          toggleFilterPanel(col.label)
                        }
                        aria-label={`Filter ${col.label}`}
                        aria-expanded={isOpen}
                      >
                        <span className="fv-fleet-grid__filter-text">
                          {selected.length > 0
                            ? `${selected.length} ${t('selected', 'selected')}`
                            : t('all', 'All')}
                        </span>
                        <i className="fas fa-caret-down" aria-hidden="true" />
                      </button>
                      {isOpen && (
                        <div className="fv-fleet-grid__filter-panel">
                          <input
                            type="text"
                            className="fv-fleet-grid__filter-search"
                            placeholder={t('search', 'Search…')}
                            value={filterSearch}
                            autoFocus
                            onChange={(e) => setFilterSearch(e.target.value)}
                          />
                          {(() => {
                            const options = uniqueValues(rows, col.key).filter((v) => {
                              const display =
                                col.key === 'lastNoon'
                                  ? formatLastNoon(Number(v))
                                  : col.key === 'lastAis'
                                  ? formatLastAis(Number(v))
                                  : v;
                              return display
                                .toLowerCase()
                                .includes(filterSearch.toLowerCase());
                            });
                            if (options.length === 0) {
                              return (
                                <div className="fv-fleet-grid__filter-empty">
                                  {t('noMatches', 'No matches')}
                                </div>
                              );
                            }
                            return options.map((v) => (
                              <label key={v} className="fv-fleet-grid__filter-opt">
                                <input
                                  type="checkbox"
                                  checked={selected.includes(v)}
                                  onChange={() => toggleFilterValue(col.label, v)}
                                />
                                <span>
                                  {col.key === 'lastNoon'
                                    ? formatLastNoon(Number(v))
                                    : col.key === 'lastAis'
                                    ? formatLastAis(Number(v))
                                    : v}
                                </span>
                              </label>
                            ));
                          })()}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={visibleColumns.length} className="fv-fleet-grid__empty">
                    {loading
                      ? t('loadingFleet', 'Loading fleet data…')
                      : loadError
                      ? loadError
                      : rows.length === 0
                      ? t('noVoyages', 'No voyages available.')
                      : t('noVesselsMatch', 'No voyages match the current filters.')}
                  </td>
                </tr>
              )}
              {visibleRows.map((row) => (
                <tr key={row.orderId}>
                  {visibleColumns.map((col) =>
                    col.key === 'actions' ? (
                      <td key={col.key} className="fv-fleet-grid__actions">
                        <Link
                          className="fv-fleet-grid__edit-link"
                          to={`/voyage?voyage=${encodeURIComponent(row.orderId)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => writeSelectedVoyageId(row.orderId)}
                          title={t('editVoyage', 'Edit Voyage')}
                          aria-label={`${t('editVoyage', 'Edit Voyage')} ${row.orderId}`}
                        >
                          <i className="fas fa-pen-to-square" aria-hidden="true" />
                        </Link>
                      </td>
                    ) : (
                      <td key={col.key}>{renderCell(row, col.key)}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
