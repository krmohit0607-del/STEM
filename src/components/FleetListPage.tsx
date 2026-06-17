import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';
import { STUB_ROWS, type FleetRow } from '../data/fleet';

/**
 * Fleet List View page — `/main`.
 *
 * Static stub matching the Excel layout the user provided:
 *   - Top filter bar: Fleet List View | From | TO date pickers, scope tabs
 *     (All Vessels / My assigned vessels), filters strip.
 *   - Wide grid with columns for voyage / vessel / leg / dates / cost /
 *     performance / file status, plus voyage tags.
 *   - Footer note: every voyage has 4 legs (Delivery → 1st port,
 *     Ballast 1 → 2, Laden 2 → 3, 3 → redelivery).
 *
 * Data, sorting, filtering, column resize, and edit (pencil) actions
 * are NOT wired up — this is a layout-only first pass. Replace the stub
 * row data with the appropriate API call when those endpoints are
 * exposed for the React app.
 */

type Scope = 'all' | 'mine';

const COLUMNS: { key: keyof FleetRow | 'edit'; label: string; width?: number }[] = [
  { key: 'edit', label: '', width: 32 },
  { key: 'voyageId', label: 'Voyage ID', width: 140 },
  { key: 'vesselName', label: 'Vessel Name', width: 140 },
  { key: 'clientName', label: 'Client Name', width: 130 },
  { key: 'pic', label: 'Pic/Analyst', width: 110 },
  { key: 'serviceTypes', label: 'Service Type', width: 170 },
  { key: 'statuses', label: 'Status', width: 160 },
  { key: 'legLB', label: 'Leg L/B', width: 90 },
  { key: 'departurePort', label: 'Departure Port', width: 120 },
  { key: 'etd', label: 'ETD', width: 130 },
  { key: 'atd', label: 'ATD', width: 130 },
  { key: 'interimPort', label: 'Interim Port', width: 110 },
  { key: 'ataInterim', label: 'ATA', width: 70 },
  { key: 'atdInterim', label: 'ATD', width: 70 },
  { key: 'arrivalPort', label: 'Arrival Port', width: 110 },
  { key: 'eta', label: 'ETA', width: 70 },
  { key: 'ataArrival', label: 'ATA', width: 70 },
  { key: 'lastNN', label: 'Last NN Report', width: 140 },
  { key: 'optimizationTypes', label: 'Optimization Type', width: 150 },
  { key: 'cpSpeed', label: 'CP Speed', width: 80 },
  { key: 'cpCons', label: 'CP Cons', width: 80 },
  { key: 'instSpeed', label: 'Inst Speed', width: 90 },
  { key: 'instCons', label: 'Inst Cons', width: 90 },
  { key: 'avgSpdSinceCOSP', label: 'AVG Spd since COSP', width: 130 },
  { key: 'perfSpeedSinceCOSP', label: 'Performance speed Since COSP', width: 170 },
  { key: 'costPerDay', label: 'Cost/Day', width: 100 },
  { key: 'foCost', label: 'FO Cost', width: 90 },
  { key: 'goCost', label: 'GO Cost', width: 90 },
  { key: 'euaCostPerMt', label: 'EUA Cost/mt', width: 110 },
  { key: 'performance', label: 'Performance', width: 110 },
  { key: 'rrRiSent', label: 'RR - RI sent', width: 100 },
  { key: 'weatherSent', label: 'Weather sent', width: 110 },
  { key: 'interimSent', label: 'interim sent', width: 100 },
  { key: 'eovReportSent', label: 'EOV report sent', width: 130 },
  { key: 'fileStatus', label: 'File Status', width: 110 },
  { key: 'voyageTags', label: 'voyage tags', width: 110 },
];

function renderCell(row: FleetRow, key: keyof FleetRow): React.ReactNode {
  const value = row[key];
  if (Array.isArray(value)) {
    return (
      <ul className="fv-fleet-list__multi">
        {value.map((v) => (
          <li key={v}>{v}</li>
        ))}
      </ul>
    );
  }
  if (typeof value === 'number') {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return value;
}

export function FleetListPage() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const [scope, setScope] = useState<Scope>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filterText, setFilterText] = useState('');

  /**
   * Stub assignment for the "My assigned vessels" scope. Replace with
   * the logged-in user once auth is wired up.
   */
  const MY_PIC = 'amit';

  /** Parse the page's "DD-MM-YYYY HH:mm" strings into a Date for range filtering. */
  const parseEtd = (s: string): Date | null => {
    if (!s) return null;
    const m = s.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/);
    if (!m) return null;
    const [, dd, mm, yyyy, hh, mi] = m;
    const d = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(mi),
    );
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const visibleRows = useMemo(() => {
    const needle = filterText.trim().toLowerCase();
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;

    return STUB_ROWS.filter((row) => {
      // Scope filter (All / Mine).
      if (scope === 'mine' && row.pic.toLowerCase() !== MY_PIC) return false;

      // Date range filter — matches if the row's ETD lies inside [from, to].
      if (fromDate || toDate) {
        const etd = parseEtd(row.etd);
        if (!etd) return false;
        if (fromDate && etd < fromDate) return false;
        if (toDate && etd > toDate) return false;
      }

      // Free-text filter — searches every primitive / array field on the row.
      if (needle) {
        const haystack = Object.values(row)
          .map((v) => (Array.isArray(v) ? v.join(' ') : String(v)))
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      return true;
    });
  }, [scope, from, to, filterText]);

  return (
    <div className="fv-fleet-list">
      <div className="fv-fleet-list__topbar">
        <h1 className="fv-fleet-list__title">{t('fleetListView', 'Fleet List View')}</h1>

        <div className="fv-fleet-list__date">
          <label>
            <span>{t('from', 'From')}</span>
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="Date and time here"
            />
          </label>
          <label>
            <span>{t('to', 'TO')}</span>
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="date and time here"
            />
          </label>
        </div>

        <Link
          to="/voyage/new"
          target="_blank"
          rel="noopener noreferrer"
          className="fv-fleet-list__new-btn"
          title={t('createNewVoyage', 'New voyage')}
        >
          <i className="fas fa-plus" aria-hidden="true" />
          <span>{t('createNewVoyage', 'New voyage')}</span>
        </Link>
      </div>

      <div className="fv-fleet-list__scope" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'all'}
          className={`fv-fleet-list__scope-btn${
            scope === 'all' ? ' fv-fleet-list__scope-btn--active' : ''
          }`}
          onClick={() => setScope('all')}
        >
          {t('allVessels', 'All Vessels')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'mine'}
          className={`fv-fleet-list__scope-btn${
            scope === 'mine' ? ' fv-fleet-list__scope-btn--active' : ''
          }`}
          onClick={() => setScope('mine')}
        >
          {t('myAssignedVessels', 'My assigned vessels')}
        </button>
      </div>

      <div className="fv-fleet-list__filters">
        <span className="fv-fleet-list__filters-label">
          {t('filters', 'Filters')}
        </span>
        <input
          type="search"
          placeholder={t('filterByPlaceholder', 'Filter by voyage, vessel, port, status…')}
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
        <span className="fv-fleet-list__filters-count">
          {visibleRows.length} / {STUB_ROWS.length}{' '}
          {visibleRows.length === 1 ? t('vessel', 'vessel') : t('vessels', 'vessels')}
        </span>
      </div>

      <div className="fv-fleet-list__grid-scroll">
        <table className="fv-fleet-list__grid">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
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
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="fv-fleet-list__empty">
                  {t('noVesselsMatch', 'No vessels match the current filters.')}
                </td>
              </tr>
            )}
            {visibleRows.map((row, idx) => (
              <tr key={`${row.voyageId}-${idx}`}>
                {COLUMNS.map((col) => {
                  if (col.key === 'edit') {
                    return (
                      <td key="edit" className="fv-fleet-list__edit-cell">
                        <button
                          type="button"
                          title="Edit voyage"
                          aria-label="Edit voyage"
                          className="fv-fleet-list__edit-btn"
                          onClick={() => {
                            // eslint-disable-next-line no-console
                            console.warn('[FleetView WebApp] Edit voyage not ported yet.');
                          }}
                        >
                          <i className="fas fa-pen" aria-hidden="true" />
                        </button>
                      </td>
                    );
                  }
                  if (col.key === 'voyageId') {
                    return (
                      <td key="voyageId">
                        <a
                          className="fv-fleet-list__voyage-link"
                          href={`/?voyage=${encodeURIComponent(row.voyageId)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Open ${row.voyageId} on the live map (new tab)`}
                        >
                          {row.voyageId}
                          <i
                            className="fas fa-external-link-alt"
                            aria-hidden="true"
                          />
                        </a>
                      </td>
                    );
                  }
                  return (
                    <td key={col.key as string}>{renderCell(row, col.key as keyof FleetRow)}</td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="fv-fleet-list__footer">
        <p className="fv-fleet-list__footer-title">
          every voyage we should be able to create 4 legs
        </p>
        <ol>
          <li>Delivery port or position to 1st port</li>
          <li>Ballast leg 1st port to 2nd port — this will include any port in between like bunker etc</li>
          <li>Laden Leg 2nd port to 3rd port — this will include any port in between or multiple load port discharge port etc</li>
          <li>3rd port to redelivery port / position</li>
        </ol>
      </div>
    </div>
  );
}
