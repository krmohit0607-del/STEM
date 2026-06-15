import { useMemo, useState } from 'react';

import { useL } from '../i18n/LocalizationProvider';

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

interface FleetRow {
  voyageId: string;
  vesselName: string;
  clientName: string;
  pic: string;
  serviceTypes: string[];
  statuses: string[];
  legLB: string[];
  departurePort: string;
  etd: string;
  atd: string;
  interimPort: string;
  ataInterim: string;
  atdInterim: string;
  arrivalPort: string;
  eta: string;
  ataArrival: string;
  lastNN: string;
  optimizationTypes: string[];
  cpSpeed: number;
  cpCons: number;
  instSpeed: number;
  instCons: number;
  avgSpdSinceCOSP: number;
  perfSpeedSinceCOSP: number;
  costPerDay: number;
  foCost: number;
  goCost: number;
  euaCostPerMt: number;
  performance: string[];
  rrRiSent: string;
  weatherSent: string;
  interimSent: string;
  eovReportSent: string;
  fileStatus: string[];
  voyageTags: string;
}

const STUB_ROWS: FleetRow[] = [
  {
    voyageId: 'some unique id',
    vesselName: 'amit yadav',
    clientName: '',
    pic: 'amit',
    serviceTypes: [
      'RPM',
      'PMO',
      'Optimization',
      'Safety Optimization',
      'Weather Only',
      'PVA',
      'Waypoint only optimization',
    ],
    statuses: [
      'Active at sea',
      'Stdby for arrival',
      'Stdby for Departure',
      'at port',
      'bunkering',
      'arrived',
    ],
    legLB: ['Laden', 'Ballast'],
    departurePort: 'santos',
    etd: '14-06-2026 04:50',
    atd: '14-06-2026 04:55',
    interimPort: 'singapore',
    ataInterim: '###',
    atdInterim: '###',
    arrivalPort: 'qingdao',
    eta: '###',
    ataArrival: '###',
    lastNN: '14-06-2026 04:55',
    optimizationTypes: ['RTA', 'Speed', 'Cons', 'Least Cost', 'Least Emission'],
    cpSpeed: 12,
    cpCons: 30,
    instSpeed: 12,
    instCons: 30,
    avgSpdSinceCOSP: 11,
    perfSpeedSinceCOSP: 11.25,
    costPerDay: 55000,
    foCost: 765,
    goCost: 1120,
    euaCostPerMt: 74.5,
    performance: ['Gain', 'Loss'],
    rrRiSent: '',
    weatherSent: '',
    interimSent: '',
    eovReportSent: '',
    fileStatus: ['open', 'closed', 'dispute', 'claim'],
    voyageTags: '',
  },
];

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

  const visibleRows = useMemo(() => STUB_ROWS, []);

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
