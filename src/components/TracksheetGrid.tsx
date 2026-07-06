/**
 * Tracksheet grid — editable.
 *
 * Mirrors the legacy `TrackSheetProcessor` column layout:
 *   - Fundamentals       : RT, Date, Time, HRS, Lat, Lng
 *   - VLSFO 0.5% Sulphur : ROB / Bunkered / Corrected
 *   - LSMGO 0.1% Sulphur : ROB / Bunkered / Corrected
 *   - None               : ROB / Bunkered / Corrected
 *   - Distances          : DistR, DistO, dtg-o
 *   - Speed              : AvSpd-O
 *   - Engine             : RPM, EnginePower, Slip, Course
 *   - Cargo              : Amount
 *   - Weather Conditions : WindO, WavesO
 *   - Weather Factors    : Wind, Wave, Curr, AvgF
 *   - Rpt Sent           : W, F, I
 *
 * The grid is fed by `STUB_ROWS` for now. When the
 * `/api/voyage/{id}/tracksheet` endpoint is exposed, replace the stub
 * with the API response — every cell maps 1:1 to a `TrackRow` field so
 * the markup does not need to change.
 */

import { useEffect, useRef, useState } from 'react';

import { useSelectedVoyage } from '../data/selectedVoyage';
import { fetchPointWeatherAt } from '../data/openMeteo';
import { setVesselPosition } from '../data/vesselPosition';
import {
  fromDateInput,
  fromTimeInput,
  toDateInput,
  toTimeInput,
} from '../data/dateFields';

interface TrackRow {
  /** Stable row id (for selection / delete). */
  id: string;
  /** Next port for this leg / report. */
  nextPort: string;
  /** Report type marker (E = ETA/estimate, N = noon report). */
  rt: string;
  date: string;
  time: string;
  /** Steaming hours; blank for estimate rows. */
  hrs: number | null;
  lat: string;
  lng: string;
  // VLSFO 0.5% Sulphur
  vlsfoRob: number | null;
  vlsfoBunkered: number | null;
  vlsfoCorrected: number | null;
  // LSMGO 0.1% Sulphur
  lsmgoRob: number | null;
  lsmgoBunkered: number | null;
  lsmgoCorrected: number | null;
  // None
  noneRob: number | null;
  noneBunkered: number | null;
  noneCorrected: number | null;
  // Distances
  distR: number | null;
  distO: number | null;
  dtgO: number | null;
  // Speed
  avgSpeedO: number | null;
  // Engine
  rpm: number | null;
  enginePower: number | null;
  slip: number | null;
  course: number | null;
  // Cargo
  amount: number | null;
  // Weather conditions
  windO: string;
  wavesO: string;
  // Weather factors
  windF: number;
  waveF: number;
  currF: number;
  /** Avg factor string `W / F / C`. */
  avgF: string;
}

const STUB_ROWS: Omit<TrackRow, 'id' | 'nextPort'>[] = [
  {
    rt: 'E', date: '25Jun2026', time: '1200', hrs: null, lat: '0545N', lng: '15347E',
    vlsfoRob: null, vlsfoBunkered: null, vlsfoCorrected: null,
    lsmgoRob: null, lsmgoBunkered: null, lsmgoCorrected: null,
    noneRob: null, noneBunkered: null, noneCorrected: null,
    distR: null, distO: null, dtgO: null, avgSpeedO: null,
    rpm: null, enginePower: null, slip: null, course: null, amount: null,
    windO: 'W4', wavesO: 'ESE1.2', windF: 0, waveF: 0, currF: -0.49, avgF: '',
  },
  {
    rt: 'E', date: '25Jun2026', time: '1800', hrs: null, lat: '0553N', lng: '15256E',
    vlsfoRob: null, vlsfoBunkered: null, vlsfoCorrected: null,
    lsmgoRob: null, lsmgoBunkered: null, lsmgoCorrected: null,
    noneRob: null, noneBunkered: null, noneCorrected: null,
    distR: null, distO: null, dtgO: null, avgSpeedO: null,
    rpm: null, enginePower: null, slip: null, course: null, amount: null,
    windO: 'WNW3', wavesO: 'NNE1.2', windF: 0, waveF: 0, currF: -0.42, avgF: '',
  },
  {
    rt: 'E', date: '26Jun2026', time: '0000', hrs: null, lat: '0601N', lng: '15204E',
    vlsfoRob: null, vlsfoBunkered: null, vlsfoCorrected: null,
    lsmgoRob: null, lsmgoBunkered: null, lsmgoCorrected: null,
    noneRob: null, noneBunkered: null, noneCorrected: null,
    distR: null, distO: null, dtgO: null, avgSpeedO: null,
    rpm: null, enginePower: null, slip: null, course: null, amount: null,
    windO: 'NW2', wavesO: 'NE1.1', windF: 0, waveF: 0, currF: -0.36, avgF: '',
  },
  {
    rt: 'N', date: '26Jun2026', time: '0300', hrs: 25.0, lat: '0604N', lng: '15138E',
    vlsfoRob: 460.25, vlsfoBunkered: 0, vlsfoCorrected: 0,
    lsmgoRob: 77.2, lsmgoBunkered: 0, lsmgoCorrected: 0,
    noneRob: 0, noneBunkered: 0, noneCorrected: 0,
    distR: 217.0, distO: 216.7, dtgO: 1839.7, avgSpeedO: 8.7,
    rpm: 83.03, enginePower: 2567.0, slip: 22.56, course: 278, amount: 0,
    windO: 'NW2', wavesO: 'NE1.1', windF: 0, waveF: 0, currF: -0.35, avgF: '-0.04 / -0.02 / -0.41',
  },
  {
    rt: 'N', date: '27Jun2026', time: '0300', hrs: 24.0, lat: '0638N', lng: '14750E',
    vlsfoRob: 447.86, vlsfoBunkered: 0, vlsfoCorrected: 0,
    lsmgoRob: 77.1, lsmgoBunkered: 0, lsmgoCorrected: 0,
    noneRob: 0, noneBunkered: 0, noneCorrected: 0,
    distR: 230.0, distO: 230.0, dtgO: 1770.5, avgSpeedO: 9.6,
    rpm: 83.01, enginePower: 2565.0, slip: 14.56, course: 278, amount: 0,
    windO: 'VAR0', wavesO: 'VAR0.0', windF: 0, waveF: 0, currF: 0, avgF: '0 / 0 / 0',
  },
  {
    rt: 'N', date: '28Jun2026', time: '0300', hrs: 24.0, lat: '0713N', lng: '14355E',
    vlsfoRob: 435.66, vlsfoBunkered: 0, vlsfoCorrected: 0,
    lsmgoRob: 77, lsmgoBunkered: 0, lsmgoCorrected: 0,
    noneRob: 0, noneBunkered: 0, noneCorrected: 0,
    distR: 236.0, distO: 577.3, dtgO: 1267.9, avgSpeedO: 24.1,
    rpm: 83.02, enginePower: 2566.0, slip: 12.29, course: 278, amount: 0,
    windO: 'VAR0', wavesO: 'VAR0.0', windF: 0, waveF: 0, currF: 0, avgF: '0 / 0 / 0',
  },
];

function n(value: number | null, digits = 2): string {
  if (value === null) return '';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Keys of `TrackRow` whose value is a number (or null). */
type NumField = {
  [K in keyof TrackRow]: TrackRow[K] extends number | null ? K : never;
}[keyof TrackRow];

/** Keys of `TrackRow` whose value is a string. */
type StrField = {
  [K in keyof TrackRow]: TrackRow[K] extends string ? K : never;
}[keyof TrackRow];

/** Report-type (RT) options shown in the RT column dropdown. */
const RT_OPTIONS = [
  'Arrival',
  'Departure',
  'Stop',
  'Resume',
  'Delivery',
  'Bunker correction',
  'First line report',
  'Last Line report',
  'Standby engine',
];

/** Short form shown in the cell while not editing. */
const RT_SHORT: Record<string, string> = {
  Arrival: 'Arr',
  Departure: 'Dep',
  Stop: 'Stop',
  Resume: 'Res',
  Delivery: 'Dlv',
  'Bunker correction': 'BC',
  'First line report': 'FLR',
  'Last Line report': 'LLR',
  'Standby engine': 'SBE',
};

function rtShort(value: string): string {
  if (!value) return '—';
  return RT_SHORT[value] ?? value;
}

/** Epoch (ms) for a row's date + time, or null when unparseable. */
function rowEpoch(date: string, time: string): number | null {
  const dm = toDateInput(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dm) return null;
  const tm = toTimeInput(time).match(/^(\d{2}):(\d{2})$/);
  const hh = tm ? Number(tm[1]) : 0;
  const mm = tm ? Number(tm[2]) : 0;
  return Date.UTC(+dm[1], +dm[2] - 1, +dm[3], hh, mm);
}

/** Steaming hours = date/time gap from the previous report. */
function computeHrs(prev: TrackRow, cur: TrackRow): number | null {
  const a = rowEpoch(prev.date, prev.time);
  const b = rowEpoch(cur.date, cur.time);
  if (a == null || b == null) return null;
  return Math.round(((b - a) / 3_600_000) * 10) / 10;
}

/**
 * Parse a tracksheet coordinate such as `0545N` (05°45'N) or `15347E`
 * (153°47'E) to a signed decimal degree. The last two digits are minutes.
 */
function parseCoord(s: string): number | null {
  const m = s.trim().match(/^(\d{3,6})([NSEWnsew])$/);
  if (!m) return null;
  const mins = Number(m[1].slice(-2));
  const degs = Number(m[1].slice(0, -2) || '0');
  let val = degs + mins / 60;
  if (m[2].toUpperCase() === 'S' || m[2].toUpperCase() === 'W') val = -val;
  return Number.isFinite(val) ? val : null;
}

const COMPASS16 = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];
function compass16(deg: number | null): string {
  if (deg == null || !Number.isFinite(deg)) return 'VAR';
  return COMPASS16[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

/** Beaufort force from wind speed (knots). */
function beaufort(kn: number): number {
  const thresholds = [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64];
  let bf = 0;
  for (let i = 0; i < thresholds.length; i++) if (kn >= thresholds[i]) bf = i + 1;
  return bf;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Column order used for CSV import / export. */
const CSV_COLS: { key: keyof TrackRow; kind: 'num' | 'str' }[] = [
  { key: 'nextPort', kind: 'str' },
  { key: 'rt', kind: 'str' },
  { key: 'date', kind: 'str' },
  { key: 'time', kind: 'str' },
  { key: 'hrs', kind: 'num' },
  { key: 'lat', kind: 'str' },
  { key: 'lng', kind: 'str' },
  { key: 'vlsfoRob', kind: 'num' },
  { key: 'vlsfoBunkered', kind: 'num' },
  { key: 'vlsfoCorrected', kind: 'num' },
  { key: 'lsmgoRob', kind: 'num' },
  { key: 'lsmgoBunkered', kind: 'num' },
  { key: 'lsmgoCorrected', kind: 'num' },
  { key: 'noneRob', kind: 'num' },
  { key: 'noneBunkered', kind: 'num' },
  { key: 'noneCorrected', kind: 'num' },
  { key: 'distR', kind: 'num' },
  { key: 'distO', kind: 'num' },
  { key: 'dtgO', kind: 'num' },
  { key: 'avgSpeedO', kind: 'num' },
  { key: 'rpm', kind: 'num' },
  { key: 'enginePower', kind: 'num' },
  { key: 'slip', kind: 'num' },
  { key: 'course', kind: 'num' },
  { key: 'amount', kind: 'num' },
  { key: 'windO', kind: 'str' },
  { key: 'wavesO', kind: 'str' },
  { key: 'windF', kind: 'num' },
  { key: 'waveF', kind: 'num' },
  { key: 'currF', kind: 'num' },
  { key: 'avgF', kind: 'str' },
];

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Minimal RFC-4180-ish CSV parser (handles quoted fields + embedded commas). */
function parseCsv(text: string): string[][] {
  const grid: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      grid.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    grid.push(row);
  }
  return grid;
}

export function TracksheetGrid() {
  const selectedVoyage = useSelectedVoyage();
  const vesselName = selectedVoyage?.vessel ?? 'MV Atlantic Voyager';
  const routeLabel = selectedVoyage
    ? `${selectedVoyage.portFrom} → ${selectedVoyage.portTo}`
    : 'Singapore → Rotterdam';
  const nextPortLabel = selectedVoyage?.portTo ?? '—';

  const [rows, setRows] = useState<TrackRow[]>(() =>
    STUB_ROWS.map((r, i) => ({ ...r, id: `row-${i}`, nextPort: '' })),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [savedFlash, setSavedFlash] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const allChecked = rows.length > 0 && checkedIds.length === rows.length;
  const someChecked = checkedIds.length > 0;

  const toggleRow = (id: string) =>
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const toggleAll = () =>
    setCheckedIds((prev) => (prev.length === rows.length ? [] : rows.map((r) => r.id)));

  const deleteSelected = () => {
    if (!someChecked) return;
    if (!window.confirm(`Delete ${checkedIds.length} selected row(s)?`)) return;
    setRows((prev) => prev.filter((r) => !checkedIds.includes(r.id)));
    setCheckedIds([]);
  };

  const saveSelected = () => {
    // No tracksheet API yet — flash a confirmation. Selection is preserved so
    // the operator can see which rows were saved.
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Publish the last row's position so the route editor map can show the
  // vessel at its last reported location.
  useEffect(() => {
    const last = rows[rows.length - 1];
    const lat = last ? parseCoord(last.lat) : null;
    const lon = last ? parseCoord(last.lng) : null;
    if (lat != null && lon != null) {
      setVesselPosition({ lat, lon, label: vesselName });
    }
  }, [rows, vesselName]);

  /** Auto-fill weather conditions + factors from Open-Meteo using each row's
   *  lat/lng and date/time. */
  const autoWeather = async () => {
    setWeatherLoading(true);
    try {
      const updates = await Promise.all(
        rows.map(async (r) => {
          const lat = parseCoord(r.lat);
          const lon = parseCoord(r.lng);
          const epoch = rowEpoch(r.date, r.time);
          if (lat == null || lon == null || epoch == null) return null;
          const res = await fetchPointWeatherAt(lat, lon, new Date(epoch));
          const wind = res.wind;
          const waves = res.waves;
          const curr = res.currents;
          if (!wind && !waves && !curr) return null;
          const windO = wind
            ? `${compass16(wind.directionDeg)}${beaufort(wind.magnitude)}`
            : r.windO;
          const wavesO = waves
            ? `${compass16(waves.directionDeg)}${waves.magnitude.toFixed(1)}`
            : r.wavesO;
          const windF = wind ? round2(-wind.magnitude / 40) : r.windF;
          const waveF = waves ? round2(-waves.magnitude / 6) : r.waveF;
          const currF = curr ? round2(-curr.magnitude) : r.currF;
          const avgF = `${windF} / ${waveF} / ${currF}`;
          return { id: r.id, windO, wavesO, windF, waveF, currF, avgF };
        }),
      );
      const byId = new Map(
        updates.filter((u): u is NonNullable<typeof u> => u !== null).map((u) => [u.id, u]),
      );
      setRows((prev) => prev.map((r) => ({ ...r, ...(byId.get(r.id) ?? {}) })));
    } finally {
      setWeatherLoading(false);
    }
  };

  const exportCsv = () => {
    const header = CSV_COLS.map((c) => String(c.key)).join(',');
    const body = rows.map((r) =>
      CSV_COLS.map((c) => {
        const v = r[c.key];
        if (c.kind === 'num') return v == null ? '' : String(v);
        return csvEscape(String(v ?? ''));
      }).join(','),
    );
    const csv = [header, ...body].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tracksheet.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const grid = parseCsv(String(reader.result ?? '')).filter(
        (r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ''),
      );
      if (grid.length < 2) return;
      const header = grid[0].map((h) => h.trim());
      const imported: TrackRow[] = grid.slice(1).map((cells, i) => {
        const get = (key: string) => {
          const j = header.indexOf(key);
          return j >= 0 ? cells[j] ?? '' : '';
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const obj: any = { id: `imp-${Date.now()}-${i}` };
        for (const c of CSV_COLS) {
          const raw = get(String(c.key)).trim();
          if (c.kind === 'num') {
            const num = raw === '' ? null : Number(raw);
            obj[c.key] = num == null || Number.isNaN(num) ? null : num;
          } else {
            obj[c.key] = get(String(c.key));
          }
        }
        obj.windF = obj.windF ?? 0;
        obj.waveF = obj.waveF ?? 0;
        obj.currF = obj.currF ?? 0;
        return obj as TrackRow;
      });
      setRows(imported);
      setCheckedIds([]);
    };
    reader.readAsText(file);
  };

  const updateNum = (rowIndex: number, field: NumField, raw: string) => {
    const trimmed = raw.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (parsed !== null && Number.isNaN(parsed)) return;
    setRows((prev) =>
      prev.map((row, i) => (i === rowIndex ? { ...row, [field]: parsed } : row)),
    );
  };

  const updateStr = (rowIndex: number, field: StrField, raw: string) => {
    setRows((prev) =>
      prev.map((row, i) => (i === rowIndex ? { ...row, [field]: raw } : row)),
    );
  };

  /** Editable numeric cell. */
  const numCell = (
    rowIndex: number,
    field: NumField,
    digits = 2,
    extraClass = '',
  ) => {
    const key = `${rowIndex}-${field}`;
    const value = rows[rowIndex][field];
    return (
      <td className={`fv-tracksheet__num ${extraClass}`.trim()}>
        <input
          className="fv-tracksheet__input"
          inputMode="decimal"
          value={
            editing === key ? (value === null ? '' : String(value)) : n(value, digits)
          }
          onFocus={() => setEditing(key)}
          onBlur={() => setEditing((k) => (k === key ? null : k))}
          onChange={(e) => updateNum(rowIndex, field, e.target.value)}
        />
      </td>
    );
  };

  /** Editable text cell. */
  const textCell = (rowIndex: number, field: StrField, extraClass = '') => (
    <td className={extraClass}>
      <input
        className="fv-tracksheet__input"
        value={rows[rowIndex][field]}
        onChange={(e) => updateStr(rowIndex, field, e.target.value)}
      />
    </td>
  );

  /** Editable dropdown cell — shows a short form at rest, full menu on click. */
  const selectCell = (rowIndex: number, field: StrField, options: string[]) => {
    const current = rows[rowIndex][field];
    const opts =
      current === '' || options.includes(current) ? options : [current, ...options];
    return (
      <td className="fv-tracksheet__rt-cell">
        <span className="fv-tracksheet__rt-label">{rtShort(current)}</span>
        <select
          className="fv-tracksheet__rt-select"
          value={current}
          aria-label="Report type"
          onChange={(e) => updateStr(rowIndex, field, e.target.value)}
        >
          <option value="">—</option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </td>
    );
  };

  /** Editable date cell backed by a native calendar picker. */
  const dateCell = (rowIndex: number, field: StrField) => (
    <td>
      <input
        className="fv-tracksheet__input fv-tracksheet__input--picker"
        type="date"
        value={toDateInput(rows[rowIndex][field])}
        onClick={(e) => e.currentTarget.showPicker?.()}
        onChange={(e) => updateStr(rowIndex, field, fromDateInput(e.target.value))}
      />
    </td>
  );

  /** Editable time cell backed by a native time picker. */
  const timeCell = (rowIndex: number, field: StrField) => (
    <td>
      <input
        className="fv-tracksheet__input fv-tracksheet__input--picker"
        type="time"
        value={toTimeInput(rows[rowIndex][field])}
        onClick={(e) => e.currentTarget.showPicker?.()}
        onChange={(e) => updateStr(rowIndex, field, fromTimeInput(e.target.value))}
      />
    </td>
  );

  return (
    <div className="fv-tracksheet">
      <div className="fv-tracksheet__header">
        <span className="fv-tracksheet__vessel">{vesselName}</span>
        <span className="fv-tracksheet__route">{routeLabel}</span>
        <div className="fv-tracksheet__actions">
          <button
            type="button"
            className="fv-tracksheet__action"
            onClick={autoWeather}
            disabled={weatherLoading}
            title="Fill weather from Open-Meteo using each row's position & time"
          >
            <i
              className={`fas ${weatherLoading ? 'fa-spinner fa-spin' : 'fa-cloud-sun-rain'}`}
              aria-hidden="true"
            />{' '}
            {weatherLoading ? 'Fetching…' : 'Weather'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importCsv(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="fv-tracksheet__action"
            onClick={() => fileInputRef.current?.click()}
          >
            <i className="fas fa-file-import" aria-hidden="true" /> Import
          </button>
          <button
            type="button"
            className="fv-tracksheet__action"
            onClick={exportCsv}
          >
            <i className="fas fa-file-export" aria-hidden="true" /> Export
          </button>
          <button
            type="button"
            className="fv-tracksheet__action fv-tracksheet__action--primary"
            onClick={saveSelected}
            disabled={!someChecked}
          >
            <i className={`fas ${savedFlash ? 'fa-check' : 'fa-floppy-disk'}`} aria-hidden="true" />{' '}
            {savedFlash ? 'Saved' : `Save${someChecked ? ` (${checkedIds.length})` : ''}`}
          </button>
          <button
            type="button"
            className="fv-tracksheet__action fv-tracksheet__action--danger"
            onClick={deleteSelected}
            disabled={!someChecked}
          >
            <i className="fas fa-trash" aria-hidden="true" /> Delete{someChecked ? ` (${checkedIds.length})` : ''}
          </button>
        </div>
      </div>
      <div className="fv-tracksheet__scroll">
      <table className="fv-tracksheet__table">
        <thead>
          <tr className="fv-tracksheet__group-row">
            <th rowSpan={2} className="fv-tracksheet__check-col">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={toggleAll}
                aria-label="Select all rows"
              />
            </th>
            <th rowSpan={2}>Next Port</th>
            <th colSpan={6}>Fundamentals</th>
            <th colSpan={3}>VLSFO 0.5% Sulphur</th>
            <th colSpan={3}>LSMGO 0.1% Sulphur</th>
            <th colSpan={3}>None</th>
            <th colSpan={3}>Distances</th>
            <th colSpan={1}>Speed</th>
            <th colSpan={4}>Engine</th>
            <th colSpan={1}>Cargo</th>
            <th colSpan={2}>Weather Conditions</th>
            <th colSpan={4}>Weather Factors</th>
          </tr>
          <tr className="fv-tracksheet__head-row">
            <th>RT</th>
            <th>Date</th>
            <th>Time</th>
            <th>HRS</th>
            <th>Lat</th>
            <th>Lng</th>

            <th>ROB</th>
            <th>Bunkered</th>
            <th>Corrected</th>

            <th>ROB</th>
            <th>Bunkered</th>
            <th>Corrected</th>

            <th>ROB</th>
            <th>Bunkered</th>
            <th>Corrected</th>

            <th>DistR</th>
            <th>DistO</th>
            <th>dtg-o</th>

            <th>AvSpd-O</th>

            <th>RPM</th>
            <th>EnginePower</th>
            <th>Slip</th>
            <th>Course</th>

            <th>Amount</th>

            <th>WindO</th>
            <th>WavesO</th>

            <th>Wind</th>
            <th>Wave</th>
            <th>Curr</th>
            <th>AvgF</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td className="fv-tracksheet__check-cell">
                <input
                  type="checkbox"
                  checked={checkedIds.includes(r.id)}
                  onChange={() => toggleRow(r.id)}
                  aria-label="Select row"
                />
              </td>
              <td className="fv-tracksheet__nextport">{nextPortLabel}</td>
              {selectCell(i, 'rt', RT_OPTIONS)}
              {dateCell(i, 'date')}
              {timeCell(i, 'time')}
              <td className="fv-tracksheet__num fv-tracksheet__calc">
                {n(i > 0 ? computeHrs(rows[i - 1], r) : null, 1)}
              </td>
              {textCell(i, 'lat')}
              {textCell(i, 'lng')}

              {numCell(i, 'vlsfoRob', 2)}
              {numCell(i, 'vlsfoBunkered', 0)}
              {numCell(i, 'vlsfoCorrected', 0)}

              {numCell(i, 'lsmgoRob', 1)}
              {numCell(i, 'lsmgoBunkered', 0)}
              {numCell(i, 'lsmgoCorrected', 0)}

              {numCell(i, 'noneRob', 0)}
              {numCell(i, 'noneBunkered', 0)}
              {numCell(i, 'noneCorrected', 0)}

              {numCell(i, 'distR', 2)}
              {numCell(i, 'distO', 1)}
              {numCell(i, 'dtgO', 1)}

              {numCell(i, 'avgSpeedO', 1)}

              {numCell(i, 'rpm', 2)}
              {numCell(i, 'enginePower', 1)}
              {numCell(i, 'slip', 2)}
              {numCell(i, 'course', 0)}

              {numCell(i, 'amount', 3)}

              {textCell(i, 'windO')}
              {textCell(i, 'wavesO')}

              {numCell(i, 'windF', 2)}
              {numCell(i, 'waveF', 2)}
              {numCell(
                i,
                'currF',
                2,
                r.currF < 0 ? 'fv-tracksheet__perf-loss' : '',
              )}
              {textCell(i, 'avgF', 'fv-tracksheet__num fv-tracksheet__avgf')}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
