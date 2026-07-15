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

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

import { useSelectedVoyage } from '../data/selectedVoyage';
import { fetchPointWeatherAt } from '../data/openMeteo';
import { setVesselPosition } from '../data/vesselPosition';
import { loadVoyageShared } from '../data/voyageOverrides';
import {
  fromDateInput,
  fromTimeInput,
  toDateInput,
  toTimeInput,
} from '../data/dateFields';

export interface TrackRow {
  /** Stable row id (for selection / delete). */
  id: string;
  /** Next port for this leg / report. */
  nextPort: string;
  /** Report type code (D/A/N/FC/SC/BS/S/R); blank for interpolated weather rows. */
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

export const STUB_ROWS: Omit<TrackRow, 'id' | 'nextPort'>[] = [
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
    lsmgoRob: 155.0, lsmgoBunkered: 0, lsmgoCorrected: 0,
    noneRob: 0, noneBunkered: 0, noneCorrected: 0,
    distR: 217.0, distO: 216.7, dtgO: 1839.7, avgSpeedO: 8.7,
    rpm: 83.03, enginePower: 2567.0, slip: 22.56, course: 278, amount: 0,
    windO: 'NW2', wavesO: 'NE1.1', windF: 0, waveF: 0, currF: -0.35, avgF: '-0.04 / -0.02 / -0.41',
  },
  {
    rt: 'N', date: '27Jun2026', time: '0300', hrs: 24.0, lat: '0638N', lng: '14750E',
    vlsfoRob: 447.86, vlsfoBunkered: 0, vlsfoCorrected: 0,
    lsmgoRob: 149.5, lsmgoBunkered: 0, lsmgoCorrected: 0,
    noneRob: 0, noneBunkered: 0, noneCorrected: 0,
    distR: 230.0, distO: 230.0, dtgO: 1770.5, avgSpeedO: 9.6,
    rpm: 83.01, enginePower: 2565.0, slip: 14.56, course: 278, amount: 0,
    windO: 'VAR0', wavesO: 'VAR0.0', windF: 0, waveF: 0, currF: 0, avgF: '0 / 0 / 0',
  },
  {
    rt: 'N', date: '28Jun2026', time: '0300', hrs: 24.0, lat: '0713N', lng: '14355E',
    vlsfoRob: 435.66, vlsfoBunkered: 0, vlsfoCorrected: 0,
    lsmgoRob: 143.7, lsmgoBunkered: 0, lsmgoCorrected: 0,
    noneRob: 0, noneBunkered: 0, noneCorrected: 0,
    distR: 236.0, distO: 577.3, dtgO: 1267.9, avgSpeedO: 24.1,
    rpm: 83.02, enginePower: 2566.0, slip: 12.29, course: 278, amount: 0,
    windO: 'VAR0', wavesO: 'VAR0.0', windF: 0, waveF: 0, currF: 0, avgF: '0 / 0 / 0',
  },
  {
    rt: 'N', date: '29Jun2026', time: '0300', hrs: 24.0, lat: '0740N', lng: '14000E',
    vlsfoRob: 423.40, vlsfoBunkered: 0, vlsfoCorrected: 0,
    lsmgoRob: 138.3, lsmgoBunkered: 0, lsmgoCorrected: 0,
    noneRob: 0, noneBunkered: 0, noneCorrected: 0,
    distR: 232.0, distO: 231.5, dtgO: 1150.0, avgSpeedO: 9.7,
    rpm: 83.00, enginePower: 2564.0, slip: 15.10, course: 279, amount: 0,
    windO: 'NW3', wavesO: 'NNE1.3', windF: 0, waveF: 0, currF: -0.20, avgF: '-0.06 / -0.03 / -0.28',
  },
  {
    rt: 'N', date: '30Jun2026', time: '0300', hrs: 24.0, lat: '0808N', lng: '13606E',
    vlsfoRob: 411.05, vlsfoBunkered: 0, vlsfoCorrected: 0,
    lsmgoRob: 132.4, lsmgoBunkered: 0, lsmgoCorrected: 0,
    noneRob: 0, noneBunkered: 0, noneCorrected: 0,
    distR: 235.0, distO: 234.6, dtgO: 1030.0, avgSpeedO: 9.8,
    rpm: 83.05, enginePower: 2568.0, slip: 13.80, course: 280, amount: 0,
    windO: 'W3', wavesO: 'W1.4', windF: 0, waveF: 0, currF: -0.15, avgF: '-0.05 / -0.02 / -0.22',
  },
  {
    rt: 'N', date: '01Jul2026', time: '0300', hrs: 24.0, lat: '0835N', lng: '13212E',
    vlsfoRob: 398.90, vlsfoBunkered: 0, vlsfoCorrected: 0,
    lsmgoRob: 126.8, lsmgoBunkered: 0, lsmgoCorrected: 0,
    noneRob: 0, noneBunkered: 0, noneCorrected: 0,
    distR: 228.0, distO: 227.4, dtgO: 912.0, avgSpeedO: 9.5,
    rpm: 82.95, enginePower: 2560.0, slip: 16.40, course: 278, amount: 0,
    windO: 'WNW4', wavesO: 'WNW1.8', windF: 0, waveF: 0, currF: -0.30, avgF: '-0.10 / -0.05 / -0.35',
  },
  {
    rt: 'N', date: '02Jul2026', time: '0300', hrs: 24.0, lat: '0902N', lng: '12818E',
    vlsfoRob: 386.55, vlsfoBunkered: 0, vlsfoCorrected: 0,
    lsmgoRob: 121.6, lsmgoBunkered: 0, lsmgoCorrected: 0,
    noneRob: 0, noneBunkered: 0, noneCorrected: 0,
    distR: 240.0, distO: 239.2, dtgO: 795.0, avgSpeedO: 10.0,
    rpm: 83.10, enginePower: 2571.0, slip: 12.90, course: 281, amount: 0,
    windO: 'SW2', wavesO: 'SW1.0', windF: 0, waveF: 0, currF: 0.10, avgF: '0.03 / 0.01 / 0.05',
  },
  {
    rt: 'N', date: '03Jul2026', time: '0300', hrs: 24.0, lat: '0929N', lng: '12424E',
    vlsfoRob: 374.30, vlsfoBunkered: 0, vlsfoCorrected: 0,
    lsmgoRob: 115.9, lsmgoBunkered: 0, lsmgoCorrected: 0,
    noneRob: 0, noneBunkered: 0, noneCorrected: 0,
    distR: 233.0, distO: 232.1, dtgO: 679.0, avgSpeedO: 9.7,
    rpm: 83.02, enginePower: 2566.0, slip: 14.20, course: 279, amount: 0,
    windO: 'NE3', wavesO: 'NE1.5', windF: 0, waveF: 0, currF: -0.18, avgF: '-0.06 / -0.03 / -0.24',
  },
  {
    rt: 'N', date: '04Jul2026', time: '0300', hrs: 24.0, lat: '0956N', lng: '12030E',
    vlsfoRob: 362.10, vlsfoBunkered: 0, vlsfoCorrected: 0,
    lsmgoRob: 110.4, lsmgoBunkered: 0, lsmgoCorrected: 0,
    noneRob: 0, noneBunkered: 0, noneCorrected: 0,
    distR: 236.0, distO: 235.5, dtgO: 564.0, avgSpeedO: 9.8,
    rpm: 83.06, enginePower: 2569.0, slip: 13.10, course: 280, amount: 0,
    windO: 'N4', wavesO: 'N2.0', windF: 0, waveF: 0, currF: -0.25, avgF: '-0.08 / -0.04 / -0.30',
  },
  {
    rt: 'N', date: '05Jul2026', time: '0300', hrs: 24.0, lat: '1023N', lng: '11636E',
    vlsfoRob: 349.95, vlsfoBunkered: 0, vlsfoCorrected: 0,
    lsmgoRob: 104.6, lsmgoBunkered: 0, lsmgoCorrected: 0,
    noneRob: 0, noneBunkered: 0, noneCorrected: 0,
    distR: 229.0, distO: 228.3, dtgO: 450.0, avgSpeedO: 9.5,
    rpm: 82.98, enginePower: 2562.0, slip: 15.80, course: 278, amount: 0,
    windO: 'VAR1', wavesO: 'VAR0.6', windF: 0, waveF: 0, currF: 0, avgF: '0 / 0 / 0',
  },
  {
    rt: 'N', date: '06Jul2026', time: '0300', hrs: 24.0, lat: '1050N', lng: '11242E',
    vlsfoRob: 337.70, vlsfoBunkered: 0, vlsfoCorrected: 0,
    lsmgoRob: 99.3, lsmgoBunkered: 0, lsmgoCorrected: 0,
    noneRob: 0, noneBunkered: 0, noneCorrected: 0,
    distR: 238.0, distO: 237.4, dtgO: 337.0, avgSpeedO: 9.9,
    rpm: 83.08, enginePower: 2570.0, slip: 12.60, course: 281, amount: 0,
    windO: 'ESE3', wavesO: 'ESE1.3', windF: 0, waveF: 0, currF: -0.12, avgF: '-0.04 / -0.02 / -0.18',
  },
  {
    rt: 'N', date: '07Jul2026', time: '0300', hrs: 24.0, lat: '1117N', lng: '10848E',
    vlsfoRob: 325.50, vlsfoBunkered: 0, vlsfoCorrected: 0,
    lsmgoRob: 93.3, lsmgoBunkered: 0, lsmgoCorrected: 0,
    noneRob: 0, noneBunkered: 0, noneCorrected: 0,
    distR: 231.0, distO: 230.2, dtgO: 225.0, avgSpeedO: 9.6,
    rpm: 83.00, enginePower: 2565.0, slip: 14.90, course: 279, amount: 0,
    windO: 'SE2', wavesO: 'SE0.9', windF: 0, waveF: 0, currF: 0.08, avgF: '0.02 / 0.01 / 0.04',
  },
  {
    rt: 'N', date: '08Jul2026', time: '0300', hrs: 24.0, lat: '1144N', lng: '10454E',
    vlsfoRob: 313.40, vlsfoBunkered: 0, vlsfoCorrected: 0,
    lsmgoRob: 87.7, lsmgoBunkered: 0, lsmgoCorrected: 0,
    noneRob: 0, noneBunkered: 0, noneCorrected: 0,
    distR: 234.0, distO: 233.1, dtgO: 114.0, avgSpeedO: 9.75,
    rpm: 83.03, enginePower: 2567.0, slip: 13.40, course: 280, amount: 0,
    windO: 'NW3', wavesO: 'NNW1.2', windF: 0, waveF: 0, currF: -0.16, avgF: '-0.05 / -0.03 / -0.22',
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

/** Report-type (RT) codes shown in the RT column dropdown. */
const RT_OPTIONS = ['D', 'A', 'N', 'FC', 'SC', 'BS', 'S', 'R'];

/** Human-readable label for each RT code. */
const RT_LABELS: Record<string, string> = {
  D: 'Departure',
  A: 'Arrival',
  N: 'Noon',
  FC: 'Fuel Changeover',
  SC: 'Speed Change',
  BS: 'Bunker Survey',
  S: 'Stop',
  R: 'Resume',
};

function rtShort(value: string): string {
  if (!value) return '—';
  return value;
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

/** Fuel type whose consumption can be derived from tracksheet ROB readings. */
export type ConsFuel = 'vlsfo' | 'lsmgo' | 'none';

/**
 * Fuel consumption (MT) for row `i`: the drop in ROB since the previous report
 * that carried a reading, plus any bunkers taken on this report. Returns null
 * until a prior reading exists. Shared by the tracksheet Cons columns and the
 * Interim Dashboard performance chart so both views stay in sync.
 */
export function computeCons(
  rows: Pick<
    TrackRow,
    | 'vlsfoRob' | 'vlsfoBunkered'
    | 'lsmgoRob' | 'lsmgoBunkered'
    | 'noneRob' | 'noneBunkered'
  >[],
  i: number,
  fuel: ConsFuel,
): number | null {
  const robKey = `${fuel}Rob` as 'vlsfoRob' | 'lsmgoRob' | 'noneRob';
  const bunkKey = `${fuel}Bunkered` as
    | 'vlsfoBunkered'
    | 'lsmgoBunkered'
    | 'noneBunkered';
  const cur = rows[i]?.[robKey];
  if (cur == null) return null;
  for (let j = i - 1; j >= 0; j--) {
    const prev = rows[j][robKey];
    if (prev != null) {
      return Math.max(0, prev - cur + (rows[i][bunkKey] ?? 0));
    }
  }
  return null;
}

/**
 * Ship local time approximated from longitude: offset = round(lon/15) hours.
 * Returns `HHMM`, with a day-offset marker (`+1d` / `-1d`) appended when the
 * longitude offset pushes the local calendar day past midnight, so a UTC time
 * near midnight (e.g. 2300 UTC → 0100 +1d) is never mistaken for the same day.
 */
export function computeLt(date: string, time: string, lng: string): string {
  const epoch = rowEpoch(date, time);
  const lon = parseCoord(lng);
  if (epoch == null || lon == null) return '';
  const shifted = epoch + Math.round(lon / 15) * 3_600_000;
  const d = new Date(shifted);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const dayDiff =
    Math.floor(shifted / 86_400_000) - Math.floor(epoch / 86_400_000);
  const marker = dayDiff > 0 ? ' +1d' : dayDiff < 0 ? ' \u22121d' : '';
  return `${hh}${mm}${marker}`;
}

/** Average speed (kt) from the system distance (Dist O) over the steaming hours. */
export function computeSpeed(
  distO: number | null,
  hrs: number | null,
): number | null {
  if (distO == null || hrs == null || hrs <= 0) return null;
  return distO / hrs;
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

/**
 * Inverse of `parseCoord`: format a signed decimal degree back to the tracksheet
 * coordinate string (e.g. 6.07 → `0604N`, 151.63 → `15138E`).
 */
function toCoord(dec: number, isLat: boolean): string {
  const hemi = isLat ? (dec >= 0 ? 'N' : 'S') : (dec >= 0 ? 'E' : 'W');
  const abs = Math.abs(dec);
  let deg = Math.floor(abs);
  let min = Math.round((abs - deg) * 60);
  if (min === 60) {
    deg += 1;
    min = 0;
  }
  const degStr = String(deg).padStart(isLat ? 2 : 3, '0');
  const minStr = String(min).padStart(2, '0');
  return `${degStr}${minStr}${hemi}`;
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

  // Fuel column groups shown in the grid. VLSFO + LSMGO are always present; a
  // third group appears only when a 3rd fuel type was configured on the voyage
  // (Create/Edit Voyage → 3rd Fuel Type). `key` maps to the row field prefix.
  const fuelGroups = useMemo(() => {
    const third = loadVoyageShared(selectedVoyage?.id)?.thirdFuelType?.trim();
    const groups: { key: ConsFuel; label: string; robDigits: number }[] = [
      { key: 'vlsfo', label: 'VLSFO 0.5% Sulphur', robDigits: 2 },
      { key: 'lsmgo', label: 'LSMGO 0.1% Sulphur', robDigits: 1 },
    ];
    if (third) groups.push({ key: 'none', label: third, robDigits: 1 });
    return groups;
  }, [selectedVoyage?.id]);

  const [rows, setRows] = useState<TrackRow[]>(() =>
    STUB_ROWS.map((r, i) => ({ ...r, id: `row-${i}`, nextPort: '' })),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [savedFlash, setSavedFlash] = useState(false);
  const [validating, setValidating] = useState(false);

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

  /**
   * Add a blank Noon report row for manual entry. When one or more rows are
   * checked, the new row is inserted directly below the lowest-most selected
   * row; otherwise it is appended at the bottom.
   */
  const addRow = () => {
    const newRow: TrackRow = {
      id: `row-${Date.now()}`,
      nextPort: '',
      rt: 'N', date: '', time: '', hrs: null, lat: '', lng: '',
      vlsfoRob: null, vlsfoBunkered: null, vlsfoCorrected: null,
      lsmgoRob: null, lsmgoBunkered: null, lsmgoCorrected: null,
      noneRob: null, noneBunkered: null, noneCorrected: null,
      distR: null, distO: null, dtgO: null, avgSpeedO: null,
      rpm: null, enginePower: null, slip: null, course: null, amount: null,
      windO: '', wavesO: '', windF: 0, waveF: 0, currF: 0, avgF: '',
    };
    setRows((prev) => {
      // Insert after the last selected row (by grid order); append when none.
      let insertAt = prev.length;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (checkedIds.includes(prev[i].id)) {
          insertAt = i + 1;
          break;
        }
      }
      return [...prev.slice(0, insertAt), newRow, ...prev.slice(insertAt)];
    });
  };

  /**
   * Validate the checked reports (or every Noon report when none are checked):
   * fetch weather and expand each ~24h leg into 6-hourly steps. Three
   * interpolated weather rows (at +6h / +12h / +18h) are inserted ahead of each
   * report and the report row itself gets refreshed weather at its position.
   */
  const validateSelected = async () => {
    setValidating(true);
    try {
      const sample = async (lat: number, lon: number, when: Date) => {
        const res = await fetchPointWeatherAt(lat, lon, when);
        const wind = res.wind;
        const waves = res.waves;
        const curr = res.currents;
        const windO = wind
          ? `${compass16(wind.directionDeg)}${beaufort(wind.magnitude)}`
          : '';
        const wavesO = waves
          ? `${compass16(waves.directionDeg)}${waves.magnitude.toFixed(1)}`
          : '';
        const windF = wind ? round2(-wind.magnitude / 40) : 0;
        const waveF = waves ? round2(-waves.magnitude / 6) : 0;
        const currF = curr ? round2(-curr.magnitude) : 0;
        return { windO, wavesO, windF, waveF, currF, avgF: `${windF} / ${waveF} / ${currF}` };
      };

      const src = rows;
      const targetIds = new Set(
        someChecked ? checkedIds : src.filter((r) => r.rt === 'N').map((r) => r.id),
      );
      const out: TrackRow[] = [];
      for (let i = 0; i < src.length; i++) {
        const cur = src[i];
        const prev = src[i - 1];
        const startEpoch = prev ? rowEpoch(prev.date, prev.time) : null;
        const endEpoch = rowEpoch(cur.date, cur.time);
        const lat0 = prev ? parseCoord(prev.lat) : null;
        const lon0 = prev ? parseCoord(prev.lng) : null;
        const lat1 = parseCoord(cur.lat);
        const lon1 = parseCoord(cur.lng);
        const canExpand =
          targetIds.has(cur.id) &&
          prev != null &&
          startEpoch != null &&
          endEpoch != null &&
          endEpoch > startEpoch &&
          lat0 != null &&
          lon0 != null &&
          lat1 != null &&
          lon1 != null;

        if (canExpand) {
          for (let k = 1; k <= 3; k++) {
            const f = k / 4;
            const epoch = startEpoch! + (endEpoch! - startEpoch!) * f;
            const lat = lat0! + (lat1! - lat0!) * f;
            const lon = lon0! + (lon1! - lon0!) * f;
            const wx = await sample(lat, lon, new Date(epoch));
            const iso = new Date(epoch);
            const pad = (x: number) => String(x).padStart(2, '0');
            const lerp = (a: number | null, b: number | null) =>
              a == null || b == null ? null : round2(a + (b - a) * f);
            out.push({
              ...cur,
              id: `${cur.id}-h${k * 6}`,
              rt: '',
              date: fromDateInput(
                `${iso.getUTCFullYear()}-${pad(iso.getUTCMonth() + 1)}-${pad(iso.getUTCDate())}`,
              ),
              time: fromTimeInput(`${pad(iso.getUTCHours())}:${pad(iso.getUTCMinutes())}`),
              hrs: null,
              lat: toCoord(lat, true),
              lng: toCoord(lon, false),
              vlsfoRob: lerp(prev!.vlsfoRob, cur.vlsfoRob),
              vlsfoBunkered: 0,
              vlsfoCorrected: 0,
              lsmgoRob: lerp(prev!.lsmgoRob, cur.lsmgoRob),
              lsmgoBunkered: 0,
              lsmgoCorrected: 0,
              noneRob: lerp(prev!.noneRob, cur.noneRob),
              noneBunkered: 0,
              noneCorrected: 0,
              distR: null,
              distO: null,
              dtgO: null,
              avgSpeedO: null,
              amount: null,
              ...wx,
            });
          }
          const wxEnd = await sample(lat1!, lon1!, new Date(endEpoch!));
          out.push({ ...cur, ...wxEnd });
        } else {
          out.push(cur);
        }
      }
      setRows(out);
      setCheckedIds([]);
    } finally {
      setValidating(false);
    }
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
              {RT_LABELS[o] ? `${o} — ${RT_LABELS[o]}` : o}
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
        <span className="fv-tracksheet__route">{routeLabel}</span>
        <div className="fv-tracksheet__actions">
          <button
            type="button"
            className="fv-tracksheet__action"
            onClick={validateSelected}
            disabled={validating}
            title="Fetch weather and expand each 24h report into 6-hourly steps"
          >
            <i
              className={`fas ${validating ? 'fa-spinner fa-spin' : 'fa-circle-check'}`}
              aria-hidden="true"
            />{' '}
            {validating ? 'Validating…' : `Validate${someChecked ? ` (${checkedIds.length})` : ''}`}
          </button>
          <button
            type="button"
            className="fv-tracksheet__action"
            onClick={addRow}
            title="Add a blank report row for manual entry"
          >
            <i className="fas fa-plus" aria-hidden="true" /> Add Row
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
            <th colSpan={7}>Fundamentals</th>
            {fuelGroups.map((f) => (
              <th key={f.key} colSpan={4}>{f.label}</th>
            ))}
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
            <th>Time (UTC)</th>
            <th>Time (LT)</th>
            <th>HRS</th>
            <th>Lat</th>
            <th>Lng</th>

            {fuelGroups.map((f) => (
              <Fragment key={f.key}>
                <th>ROB</th>
                <th>Bunkered</th>
                <th>Corrected</th>
                <th>Cons</th>
              </Fragment>
            ))}

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
              {selectCell(i, 'rt', RT_OPTIONS)}
              {dateCell(i, 'date')}
              {timeCell(i, 'time')}
              <td
                className="fv-tracksheet__num fv-tracksheet__calc"
                title="Ship local time (from longitude). +1d / -1d marks a local date that differs from the UTC date."
              >
                {computeLt(r.date, r.time, r.lng)}
              </td>
              <td className="fv-tracksheet__num fv-tracksheet__calc">
                {n(i > 0 ? computeHrs(rows[i - 1], r) : null, 1)}
              </td>
              {textCell(i, 'lat')}
              {textCell(i, 'lng')}

              {fuelGroups.map((f) => (
                <Fragment key={f.key}>
                  {numCell(i, `${f.key}Rob` as NumField, f.robDigits)}
                  {numCell(i, `${f.key}Bunkered` as NumField, 0)}
                  {numCell(i, `${f.key}Corrected` as NumField, 0)}
                  <td className="fv-tracksheet__num fv-tracksheet__calc">
                    {n(computeCons(rows, i, f.key), f.robDigits)}
                  </td>
                </Fragment>
              ))}

              {numCell(i, 'distR', 2)}
              {numCell(i, 'distO', 1)}
              {numCell(i, 'dtgO', 1)}

              <td className="fv-tracksheet__num fv-tracksheet__calc">
                {n(
                  computeSpeed(r.distO, i > 0 ? computeHrs(rows[i - 1], r) : null),
                  1,
                )}
              </td>

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
