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
 * The grid is fed by the real `/api/performance/tracksheet` endpoint (see
 * `performanceApi.getTracksheet`/`saveTracksheet`) — no local dummy/demo rows
 * are shown here. `STUB_ROWS` below is kept only as sample data for a few
 * other report pages (Forecast, Performance Report, …) that haven't been
 * wired to live per-voyage tracksheet data yet.
 */

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

import { useSelectedVoyage } from '../data/selectedVoyage';
import { useSelectedLegNo } from '../data/selectedLeg';
import { buildView } from './voyage/buildView';
import { fetchPointWeatherAt } from '../data/openMeteo';
import { setVesselPosition } from '../data/vesselPosition';
import { setRouteReportMarkers } from '../data/routeReportMarkers';
import { useActiveSimRoute } from '../data/routeSimulatorStore';
import { loadVoyageShared, mergeVoyageShared, subscribeVoyageShared } from '../data/voyageOverrides';
import { queueCommsDraft } from '../data/commsStore';
import { performanceApi, type TracksheetRowApiDto } from '../api/performanceApi';
import {
  beaufort,
  currentFactor,
  DEFAULT_DEADWEIGHT_MT,
  loadWeatherFactorTableFromBackend,
  parseDeadweightMt,
  waveFactor,
  windFactor,
} from '../data/weatherFactorTable';
import {
  type GwdmReport,
  classifyGoodWeatherRows,
  currentsOptionFromLabel,
  goodWeatherMethodFromOption,
} from '../data/goodWeatherDayMethod';
import {
  fromDateInput,
  fromTimeInput,
  rowDateTimeToIso,
  isoToRowDateTime,
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

const RT_COLORS: Record<string, string> = {
  D: '#3fb950',
  A: '#58a6ff',
  N: '#f59e0b',
  FC: '#ff7b72',
  SC: '#a371f7',
  BS: '#39c5cf',
  S: '#d29922',
  R: '#2ea043',
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

/** A blank report row for manual entry / seeding, with just the report type
 *  and date/time filled in. */
function blankTrackRow(rt: string, date = '', time = ''): TrackRow {
  return {
    id: `row-${Date.now()}`,
    nextPort: '',
    rt, date, time, hrs: null, lat: '', lng: '',
    vlsfoRob: null, vlsfoBunkered: null, vlsfoCorrected: null,
    lsmgoRob: null, lsmgoBunkered: null, lsmgoCorrected: null,
    noneRob: null, noneBunkered: null, noneCorrected: null,
    distR: null, distO: null, dtgO: null, avgSpeedO: null,
    rpm: null, enginePower: null, slip: null, course: null, amount: null,
    windO: '', wavesO: '', windF: 0, waveF: 0, currF: 0, avgF: '',
  };
}

/** Steaming hours = date/time gap from the previous report. */
export function computeHrs(prev: TrackRow, cur: TrackRow): number | null {
  const a = rowEpoch(prev.date, prev.time);
  const b = rowEpoch(cur.date, cur.time);
  if (a == null || b == null) return null;
  return Math.round(((b - a) / 3_600_000) * 10) / 10;
}

/** Fuel type whose consumption can be derived from tracksheet ROB readings. */
export type ConsFuel = 'vlsfo' | 'lsmgo' | 'none';

/**
 * Fuel consumption (MT) for row `i`: the drop in ROB since the previous report
 * that carried a reading, plus any bunkers taken on a Fuel-Changeover ("FC")
 * report. Mirrors the legacy `FuelModel` formula:
 *   - Departure ("D") / Resume ("R") rows always report `0` consumption.
 *   - Otherwise: `previousRob - currentRob`, with `Bunkered` added back only
 *     when the current row's report type is "FC" (fuel changeover).
 *   - The result is NOT clamped to zero — a negative value (e.g. from a
 *     bunker-survey ROB correction) is reported as-is, same as upstream.
 * Returns null until a prior reading exists. Shared by the tracksheet Cons
 * columns and the Interim Dashboard performance chart so both views stay in
 * sync.
 */
export function computeCons(
  rows: Pick<
    TrackRow,
    | 'rt'
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
  const curRow = rows[i];
  if (curRow?.rt === 'D' || curRow?.rt === 'R') return 0;
  const cur = curRow?.[robKey];
  if (cur == null) return null;
  for (let j = i - 1; j >= 0; j--) {
    const prev = rows[j][robKey];
    if (prev != null) {
      const bunkered = curRow.rt === 'FC' ? (curRow[bunkKey] ?? 0) : 0;
      return prev - cur + bunkered;
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

/**
 * Course made good (initial great-circle bearing, deg) from one position to
 * another — used as the vessel's heading for the wind/wave/current relative-
 * angle factor lookups, since reports don't carry a separate logged heading.
 */
function bearingDeg(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(bLon - aLon)) * Math.cos(toRad(bLat));
  const x =
    Math.cos(toRad(aLat)) * Math.sin(toRad(bLat)) -
    Math.sin(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.cos(toRad(bLon - aLon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Great-circle distance between two positions in nautical miles. */
function distanceNm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3440.065;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Nearest route vertex to a coordinate. */
function nearestRouteVertex(
  path: Array<[number, number]>,
  lat: number,
  lon: number,
): { pos: [number, number]; distNm: number; idx: number } | null {
  if (path.length === 0) return null;
  let bestIdx = 0;
  let bestPos = path[0];
  let bestDist = distanceNm(lat, lon, bestPos[0], bestPos[1]);
  for (let i = 1; i < path.length; i += 1) {
    const p = path[i];
    const d = distanceNm(lat, lon, p[0], p[1]);
    if (d < bestDist) {
      bestDist = d;
      bestPos = p;
      bestIdx = i;
    }
  }
  return { pos: bestPos, distNm: bestDist, idx: bestIdx };
}

/** Cumulative route distance (NM) from the start of `path` up to vertex `idx`. */
function cumulativeRouteDistanceNm(path: Array<[number, number]>, idx: number): number {
  let total = 0;
  for (let i = 1; i <= idx && i < path.length; i += 1) {
    total += distanceNm(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
  }
  return total;
}

const REPORT_ROUTE_SNAP_MAX_NM = 160;

/**
 * System-observed distance (NM) for report row `i`: the route-geometry
 * distance between the previous report's position and this one, mirroring
 * the legacy `PointsCollectionModel.GetDistO`. Departure ("D") / Resume ("R")
 * rows always report `0`. Falls back to the row's own manually-entered
 * `distO` when no active route is available or a position can't be matched
 * to it (so existing manually-entered data is preserved).
 */
export function computeDistO(
  rows: Pick<TrackRow, 'rt' | 'lat' | 'lng' | 'distO'>[],
  i: number,
  path: Array<[number, number]>,
): number | null {
  const cur = rows[i];
  if (cur.rt === 'D' || cur.rt === 'R') return 0;
  if (path.length < 2 || i === 0) return cur.distO;
  const prev = rows[i - 1];
  const prevLat = parseCoord(prev.lat);
  const prevLon = parseCoord(prev.lng);
  const curLat = parseCoord(cur.lat);
  const curLon = parseCoord(cur.lng);
  if (prevLat == null || prevLon == null || curLat == null || curLon == null) return cur.distO;
  const prevVertex = nearestRouteVertex(path, prevLat, prevLon);
  const curVertex = nearestRouteVertex(path, curLat, curLon);
  if (!prevVertex || !curVertex) return cur.distO;
  if (prevVertex.distNm > REPORT_ROUTE_SNAP_MAX_NM || curVertex.distNm > REPORT_ROUTE_SNAP_MAX_NM) {
    return cur.distO;
  }
  const dist = cumulativeRouteDistanceNm(path, curVertex.idx) - cumulativeRouteDistanceNm(path, prevVertex.idx);
  return round2(Math.max(0, dist));
}

/**
 * Distance to go (NM) for report row `i`: remaining route distance from this
 * report's position to the voyage destination, mirroring the legacy
 * `PointsCollectionModel.GetDistanceToGo`. Arrival ("A") rows always report
 * `0`. Falls back to the row's own manually-entered `dtgO` when no active
 * route is available or the position can't be matched to it.
 */
export function computeDtg(
  rows: Pick<TrackRow, 'rt' | 'lat' | 'lng' | 'dtgO'>[],
  i: number,
  path: Array<[number, number]>,
): number | null {
  const cur = rows[i];
  if (cur.rt === 'A') return 0;
  if (path.length < 2) return cur.dtgO;
  const curLat = parseCoord(cur.lat);
  const curLon = parseCoord(cur.lng);
  if (curLat == null || curLon == null) return cur.dtgO;
  const curVertex = nearestRouteVertex(path, curLat, curLon);
  if (!curVertex || curVertex.distNm > REPORT_ROUTE_SNAP_MAX_NM) return cur.dtgO;
  const total = cumulativeRouteDistanceNm(path, path.length - 1);
  return round2(Math.max(0, total - cumulativeRouteDistanceNm(path, curVertex.idx)));
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
  const activeRoute = useActiveSimRoute();
  const vesselName = selectedVoyage?.vessel ?? 'MV Atlantic Voyager';
  const routeLabel = selectedVoyage
    ? `${selectedVoyage.portFrom} → ${selectedVoyage.portTo}`
    : 'Singapore → Rotterdam';

  // The active leg follows the leg picked in the top header (ODAS row)
  // dropdown — same source the Interim Dashboard reads its CP config from —
  // so the Tracksheet's good/bad-weather-day highlighting always agrees
  // with the Interim Dashboard's "Good Weather %" classification.
  const legs = useMemo(
    () => (selectedVoyage ? buildView(selectedVoyage).legs : []),
    [selectedVoyage],
  );
  const selectedLegNo = useSelectedLegNo();
  const activeLeg = useMemo(
    () => legs.find((leg) => leg.no === selectedLegNo) ?? legs[0],
    [legs, selectedLegNo],
  );

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

  const [rows, setRows] = useState<TrackRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [forecasting, setForecasting] = useState(false);
  const [forecastData, setForecastData] = useState<{ lat: number; lng: number; label: string; windSpd: string; wavHt: string; time: string }[] | null>(null);

  // Good/bad weather day classification per row — reuses the exact ported
  // GWDM test (`classifyGoodWeatherRows`) the Interim Dashboard's "Good
  // Weather %" is built on, driven by the active leg's CP Good Weather
  // Method / Min Hours / Currents settings. Rows inside a "good weather"
  // block are highlighted green in the grid (see the `<tr>` render below).
  const goodWeatherByIndex = useMemo<boolean[]>(() => {
    if (rows.length === 0) return [];
    const method = goodWeatherMethodFromOption(activeLeg?.cpGoodWeatherSelection ?? '');
    const minGoodHours = Number(activeLeg?.cpMinHours) || 0;
    const currentsOption = currentsOptionFromLabel(activeLeg?.cpCurrents ?? '');
    const reports: GwdmReport[] = rows.map((row, i) => ({
      hours: i > 0 ? computeHrs(rows[i - 1], row) ?? 0 : 0,
      windFactor: row.windF,
      waveFactor: row.waveF,
      currentFactor: row.currF,
      isStart: row.rt === 'D' || row.rt === 'R',
      isEstimate: row.rt.trim() === '',
    }));
    return classifyGoodWeatherRows(reports, method, minGoodHours, currentsOption);
  }, [rows, activeLeg]);

  // Keep the Departure/COSP ("D") row's date+time mirrored to the shared
  // voyage ETD — connected to Waypoint details' first waypoint and CP & Leg
  // Details' LEG-1 ETD. If nothing has been shared yet but a "D" row already
  // has a date+time, adopt that as the starting value.
  const syncEtdRef = useRef<() => void>(() => {});
  syncEtdRef.current = () => {
    const voyageId = selectedVoyage?.id;
    const shared = loadVoyageShared(voyageId)?.etdIso;
    setRows((prev) => {
      const idx = prev.findIndex((row) => row.rt === 'D');
      if (idx < 0) {
        // No Departure/COSP report yet (and nothing else entered either) —
        // seed a real first report from the shared voyage ETD instead of
        // leaving the Tracksheet blank or showing unrelated dummy dates.
        if (!shared || prev.length > 0) return prev;
        const { date, time } = isoToRowDateTime(shared);
        if (!date || !time) return prev;
        return [blankTrackRow('D', date, time)];
      }
      const rowIso = rowDateTimeToIso(prev[idx].date, prev[idx].time);
      if (shared) {
        if (shared === rowIso) return prev;
        const { date, time } = isoToRowDateTime(shared);
        if (!date || !time) return prev;
        return prev.map((row, i) => (i === idx ? { ...row, date, time } : row));
      }
      if (rowIso) mergeVoyageShared(voyageId, { etdIso: rowIso });
      return prev;
    });
  };

  // Load any previously-saved tracksheet for this voyage from the Performance
  // module's own backend/database — no local dummy/demo fallback; an empty
  // result just seeds the Departure report from the shared ETD (above).
  useEffect(() => {
    const voyageId = selectedVoyage?.id;
    if (!voyageId) return;
    let cancelled = false;
    void (async () => {
      try {
        const saved = await performanceApi.getTracksheet(voyageId);
        if (!cancelled && saved.length > 0) setRows(saved);
      } catch {
        /* backend may be offline — syncEtdRef below still seeds a Departure
           report locally so the grid isn't just blank. */
      } finally {
        if (!cancelled) syncEtdRef.current();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedVoyage?.id]);

  useEffect(() => {
    syncEtdRef.current();
    return subscribeVoyageShared(selectedVoyage?.id, () => syncEtdRef.current());
  }, [selectedVoyage?.id]);

  const allChecked = rows.length > 0 && checkedIds.length === rows.length;
  const someChecked = checkedIds.length > 0;

  const toggleRow = (id: string) =>
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const toggleAll = () =>
    setCheckedIds((prev) => (prev.length === rows.length ? [] : rows.map((r) => r.id)));

  // Sample evenly-spaced waypoints from the active route and queue forecast email in Comms modal
  const sendForecast = async () => {
    setForecasting(true);
    try {
      const waypoints = activeRoute?.path ?? [];
      const step = Math.max(1, Math.floor(waypoints.length / 20));
      const sample = waypoints.filter((_, i) => i % step === 0).slice(0, 20);
      const etd = activeRoute?.etdIso ? new Date(activeRoute.etdIso) : new Date();
      const lastHour = activeRoute?.timeHours ? activeRoute.timeHours[activeRoute.timeHours.length - 1] : sample.length * 6;
      const etaFinal = new Date(etd.getTime() + lastHour * 3600_000);
      const fmtDate = (d: Date) => d.toUTCString().replace(' GMT', '').slice(0, -4);
      const fmtLatLng = (lat: number, lng: number) => {
        const latD = Math.abs(lat), lngD = Math.abs(lng);
        return `${Math.floor(latD)}° ${((latD % 1) * 60).toFixed(1)}' ${lat >= 0 ? 'N' : 'S'}  ${Math.floor(lngD)}° ${((lngD % 1) * 60).toFixed(1)}' ${lng >= 0 ? 'E' : 'W'}`;
      };

      const wxRows = await Promise.all(
        sample.map(async ([lat, lng], idx) => {
          const t = new Date(etd.getTime() + idx * (lastHour / sample.length) * 3600_000);
          try {
            const wx = await fetchPointWeatherAt(lat, lng, t);
            const wind = wx['wind']?.magnitude ?? 0;
            const windDir = wx['wind']?.directionDeg ?? 0;
            const wave = wx['waves']?.magnitude ?? 0;
            const waveDir = wx['waves']?.directionDeg;
            const curr = wx['currents']?.magnitude ?? 0;
            const windKt = (wind * 1.944).toFixed(1);
            const gustKt = ((wind * 1.944) * 1.5).toFixed(1);
            const waveDirStr = waveDir != null ? Math.round(waveDir).toString() : '--';
            return `${fmtDate(t).padEnd(22)} ${wave.toFixed(1).padStart(14)}  ${waveDirStr.padStart(10)}  ${windKt.padStart(14)}  ${Math.round(windDir).toString().padStart(10)}  ${gustKt.padStart(19)}  ${curr.toFixed(1).padStart(10)}  at-sea`;
          } catch {
            return `${fmtDate(t).padEnd(22)} ${'—'.padStart(14)}  ${'—'.padStart(10)}  ${'—'.padStart(14)}  ${'—'.padStart(10)}  ${'—'.padStart(19)}  ${'—'.padStart(10)}  at-sea`;
          }
        }),
      );

      const rpmRows = rows.slice(0, 5).map((r) =>
        `${(r.date + ' ' + r.time).padEnd(22)} ${'68'.padStart(4)} ${(r.avgSpeedO ?? 10.5).toFixed(1).padStart(20)} ${'14.0'.padStart(20)} ${'24.0'.padStart(14)}`
      );

      const locationList = sample.map(([lat, lng], idx) => {
        const t = new Date(etd.getTime() + idx * 6 * 3600_000);
        return `${(idx + 1).toString().padStart(3)}  ${fmtDate(t)}  ${fmtLatLng(lat, lng)}`;
      });

      const body = [
        `Hello Master of ${vesselName},`,
        ``,
        `Advised to stay on the current route. Your predicted arrival details at ${selectedVoyage?.portTo ?? 'destination'} are below:`,
        `  Predicted ETA: ${fmtDate(etaFinal)} utc`,
        `  Predicted Average SOG Remaining: ${activeRoute?.distanceNm ? (activeRoute.distanceNm / lastHour).toFixed(1) : '10.0'} kt`,
        `  Route: ${routeLabel}`,
        ``,
        `Voyage constraints: Average speed: -   RTA: On ${fmtDate(etaFinal).slice(0, 12)}   Max daily M/E fuel consumption: -`,
        ``,
        `RPM SETTING AND SPEED OPTIMIZATION:`,
        `Adjust vessel main engine rpm at the following times to achieve predicted speeds.`,
        `${'─'.repeat(80)}`,
        `${'Date/Time (utc)'.padEnd(22)} ${'RPM'.padStart(4)} ${'Predicted SOG (kt)'.padStart(20)} ${'M/E Consumption (mt)'.padStart(20)} ${'Duration (hr)'.padStart(14)}`,
        `${'─'.repeat(80)}`,
        ...(rpmRows.length ? rpmRows : [`${fmtDate(etd).padEnd(22)} ${'68'.padStart(4)} ${'10.5'.padStart(20)} ${'14.0'.padStart(20)} ${'24.0'.padStart(14)}`]),
        ``,
        `WEATHER SUMMARY:`,
        `${'─'.repeat(105)}`,
        `${'Date/Time (utc)'.padEnd(22)} ${'Max SigWaveHt (m)'.padStart(14)}  ${'WaveDir (deg)'.padStart(10)}  ${'Max Wind (kt)'.padStart(14)}  ${'WindDir (deg)'.padStart(10)}  ${'Max Wind Gust (kt)'.padStart(19)}  ${'Avg CF (kt)'.padStart(10)}  Status`,
        `${'─'.repeat(105)}`,
        ...wxRows,
        ``,
        `LOCATION LIST:`,
        `${'─'.repeat(65)}`,
        `${'#'.padStart(3)}  ${'ETA Date/Time (utc)'.padEnd(22)}  ${'Lat / Lon'}`,
        `${'─'.repeat(65)}`,
        ...locationList,
        `${'─'.repeat(65)}`,
        ``,
        `Warm Regards,`,
        `The ODAS Team`,
        `routing@odas.com`,
        `ODAS Help Center | For Emergencies Call: +1 (855) 229 9558`,
      ].join('\n');

      queueCommsDraft({
        subject: `${vesselName} - Weather Forecast`,
        to: `master@${(vesselName.toLowerCase().replace(/\s+/g, ''))}.com`,
        body,
      });
      setForecastData(null);
    } finally {
      setForecasting(false);
    }
  };

  const deleteSelected = () => {
    if (!someChecked) return;
    if (!window.confirm(`Delete ${checkedIds.length} selected row(s)?`)) return;
    setRows((prev) => prev.filter((r) => !checkedIds.includes(r.id)));
    setCheckedIds([]);
  };

  const saveSelected = async () => {
    // Persists the whole grid (the Performance module's tracksheet is a
    // single ordered document per voyage) to its own backend/database;
    // selection just gates the button per the existing UX convention.
    const voyageId = selectedVoyage?.id;
    if (!voyageId) return;
    setSaveError(null);
    try {
      const payload: TracksheetRowApiDto[] = rows.map(({ id, nextPort, ...rest }) => ({ id, nextPort, ...rest }));
      await performanceApi.saveTracksheet(voyageId, selectedVoyage?.imo ?? '', payload);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1500);
    } catch {
      setSaveError('Could not save — check your connection and try again.');
    }
  };

  /**
   * Add a blank Noon report row for manual entry. When one or more rows are
   * checked, the new row is inserted directly below the lowest-most selected
   * row; otherwise it is appended at the bottom.
   */
  const addRow = () => {
    const newRow = blankTrackRow('N');
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
      // The wind/wave calibration table is backend/database-backed (global
      // reference data) — fetch it once per session (memoized) so Validate
      // uses the live table, falling back to the embedded defaults offline.
      await loadWeatherFactorTableFromBackend(() => performanceApi.getWeatherFactors());
      const deadweightMt = parseDeadweightMt(selectedVoyage?.dwt) ?? DEFAULT_DEADWEIGHT_MT;

      // `courseDeg` is the segment's course-made-good (bearing from the
      // previous report's position to this one) — the vessel heading used to
      // turn each weather factor's "from"/"towards" direction into a
      // relative angle (0=head, 180=following/stern) for the table lookups.
      const sample = async (lat: number, lon: number, when: Date, courseDeg: number) => {
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
        const windF =
          wind && wind.directionDeg != null
            ? round2(windFactor(deadweightMt, wind.magnitude, wind.directionDeg, courseDeg))
            : 0;
        const waveF =
          waves && waves.directionDeg != null
            ? round2(waveFactor(deadweightMt, waves.magnitude, waves.directionDeg, courseDeg))
            : 0;
        const currF =
          curr && curr.directionDeg != null
            ? round2(currentFactor(curr.magnitude, curr.directionDeg, courseDeg))
            : 0;
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
          const courseDeg = bearingDeg(lat0!, lon0!, lat1!, lon1!);
          // Time-weighted average factors for the real report row, mirroring
          // the legacy `UpdateAverageFactorsOnly`: each sampled point
          // (including the three interpolated 6-hourly points and the report
          // itself) contributes `factor * elapsedHoursSincePreviousPoint`,
          // summed and divided by the total elapsed hours across the block.
          let weightedWind = 0;
          let weightedWave = 0;
          let weightedCurr = 0;
          let weightedHours = 0;
          let segStartEpoch = startEpoch!;
          const accumulate = (factors: { windF: number; waveF: number; currF: number }, epoch: number) => {
            const hours = (epoch - segStartEpoch) / 3_600_000;
            weightedWind += factors.windF * hours;
            weightedWave += factors.waveF * hours;
            weightedCurr += factors.currF * hours;
            weightedHours += hours;
            segStartEpoch = epoch;
          };
          for (let k = 1; k <= 3; k++) {
            const f = k / 4;
            const epoch = startEpoch! + (endEpoch! - startEpoch!) * f;
            const lat = lat0! + (lat1! - lat0!) * f;
            const lon = lon0! + (lon1! - lon0!) * f;
            const wx = await sample(lat, lon, new Date(epoch), courseDeg);
            accumulate(wx, epoch);
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
          const wxEnd = await sample(lat1!, lon1!, new Date(endEpoch!), courseDeg);
          accumulate(wxEnd, endEpoch!);
          const avgWind = weightedHours > 0 ? round2(weightedWind / weightedHours) : wxEnd.windF;
          const avgWave = weightedHours > 0 ? round2(weightedWave / weightedHours) : wxEnd.waveF;
          const avgCurr = weightedHours > 0 ? round2(weightedCurr / weightedHours) : wxEnd.currF;
          out.push({ ...cur, ...wxEnd, avgF: `${avgWind} / ${avgWave} / ${avgCurr}` });
        } else {
          out.push(cur);
        }
      }
      setRows(out);
      setCheckedIds([]);

      // Persist the freshly-validated weather factors immediately, rather
      // than requiring a separate manual "Save" click afterward — mirrors
      // `saveSelected`'s payload shape.
      const voyageId = selectedVoyage?.id;
      if (voyageId) {
        setSaveError(null);
        try {
          const payload: TracksheetRowApiDto[] = out.map(({ id, nextPort, ...rest }) => ({ id, nextPort, ...rest }));
          await performanceApi.saveTracksheet(voyageId, selectedVoyage?.imo ?? '', payload);
          setSavedFlash(true);
          window.setTimeout(() => setSavedFlash(false), 1500);
        } catch {
          setSaveError('Validated, but could not save — check your connection and try again.');
        }
      }
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
      const epoch = last ? rowEpoch(last.date, last.time) : null;
      setVesselPosition({
        lat,
        lon,
        label: vesselName,
        dateTimeIso: epoch != null ? new Date(epoch).toISOString() : undefined,
      });
    }
  }, [rows, vesselName]);

  // Keep received report positions on the current active route. This preserves
  // sailed geometry up to each saved report unless that report is edited/deleted.
  useEffect(() => {
    const routePath = activeRoute?.path ?? [];
    if (routePath.length < 2) return;
    setRows((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        if (!row.rt.trim()) return row;
        const lat = parseCoord(row.lat);
        const lon = parseCoord(row.lng);
        if (lat == null || lon == null) return row;
        const nearest = nearestRouteVertex(routePath, lat, lon);
        if (!nearest || nearest.distNm > REPORT_ROUTE_SNAP_MAX_NM) return row;
        const alignedLat = toCoord(nearest.pos[0], true);
        const alignedLon = toCoord(nearest.pos[1], false);
        if (alignedLat === row.lat && alignedLon === row.lng) return row;
        changed = true;
        return { ...row, lat: alignedLat, lng: alignedLon };
      });
      return changed ? next : prev;
    });
  }, [activeRoute?.id]);

  // Keep the stored DistO / DistanceToGo fields in sync with the
  // route-geometry calculation (so CSV export, saved payloads, and map
  // markers all see the same calculated numbers the grid displays).
  useEffect(() => {
    const routePath = activeRoute?.path ?? [];
    setRows((prev) => {
      let changed = false;
      const next = prev.map((row, i) => {
        const distO = computeDistO(prev, i, routePath);
        const dtgO = computeDtg(prev, i, routePath);
        if (distO === row.distO && dtgO === row.dtgO) return row;
        changed = true;
        return { ...row, distO, dtgO };
      });
      return changed ? next : prev;
    });
  }, [activeRoute?.id, activeRoute?.path, rows]);

  // Publish tracksheet reports (D/A/N/SC/FC/...) plus validated in-between
  // 6-hour breakup points so the active route map can render them.
  useEffect(() => {
    const markers = rows
      .map((row, i) => {
        const lat = parseCoord(row.lat);
        const lon = parseCoord(row.lng);
        if (lat == null || lon == null) return null;
        const code = (row.rt || '6H').trim().toUpperCase();
        const isInterpolated = row.rt.trim() === '';
        const epoch = rowEpoch(row.date, row.time);
        const iso = epoch != null ? new Date(epoch).toISOString() : undefined;
        return {
          id: row.id || `track-${i}`,
          pos: [lat, lon] as [number, number],
          reportCode: code,
          reportType: isInterpolated ? 'Validated 6-hour position' : RT_LABELS[code] ?? code,
          dateTimeIso: iso,
          dateTimeText: `${row.date} ${row.time} UTC`,
          speedKts: row.avgSpeedO,
          distanceNm: row.distO ?? row.distR,
          isInterpolated,
          color: isInterpolated ? '#b8c4d6' : RT_COLORS[code] ?? '#58a6ff',
        };
      })
      .filter((m): m is NonNullable<typeof m> => m != null);
    setRouteReportMarkers(markers);
  }, [rows]);

  // Only clear the published markers when the Tracksheet itself truly
  // unmounts (the whole bottom drawer collapses), not on every `rows`
  // change — so switching to the Route Simulator tab (which no longer
  // unmounts this component) keeps the report markers on the map.
  useEffect(() => () => setRouteReportMarkers([]), []);

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
    setRows((prev) => {
      const next = prev.map((row, i) => (i === rowIndex ? { ...row, [field]: raw } : row));
      // The Departure/COSP ("D") report's date+time is the voyage's single
      // shared ETD — also connected to Waypoint details' first waypoint and
      // CP & Leg Details' LEG-1 ETD (see data/voyageOverrides.ts `etdIso`).
      if ((field === 'date' || field === 'time') && next[rowIndex]?.rt === 'D') {
        const iso = rowDateTimeToIso(next[rowIndex].date, next[rowIndex].time);
        if (iso) mergeVoyageShared(selectedVoyage?.id, { etdIso: iso });
      }
      return next;
    });
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
            className="fv-tracksheet__action fv-tracksheet__action--forecast"
            onClick={sendForecast}
            disabled={forecasting || !activeRoute}
            title={activeRoute ? 'Generate weather forecast email for vessel' : 'No active route — plot a route first'}
          >
            <i className={`fas ${forecasting ? 'fa-spinner fa-spin' : 'fa-cloud-sun'}`} aria-hidden="true" />{' '}
            {forecasting ? 'Fetching…' : 'Forecast'}
          </button>
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
          {saveError && <span className="fv-tracksheet__save-error">{saveError}</span>}
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
            <tr
              key={r.id}
              className={goodWeatherByIndex[i] ? 'fv-tracksheet__row--good-weather' : undefined}
              title={goodWeatherByIndex[i] ? 'Good weather day (per CP Good Weather Method)' : undefined}
            >
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
              <td
                className="fv-tracksheet__num fv-tracksheet__calc"
                title="System-observed distance since the previous report, calculated from the active route geometry (falls back to the stored value when no route is matched)."
              >
                {n(computeDistO(rows, i, activeRoute?.path ?? []), 1)}
              </td>
              <td
                className="fv-tracksheet__num fv-tracksheet__calc"
                title="Remaining route distance to the voyage destination, calculated from the active route geometry (falls back to the stored value when no route is matched)."
              >
                {n(computeDtg(rows, i, activeRoute?.path ?? []), 1)}
              </td>

              <td className="fv-tracksheet__num fv-tracksheet__calc">
                {n(
                  computeSpeed(
                    computeDistO(rows, i, activeRoute?.path ?? []),
                    i > 0 ? computeHrs(rows[i - 1], r) : null,
                  ),
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
              <td
                className="fv-tracksheet__num fv-tracksheet__calc fv-tracksheet__avgf"
                title="Time-weighted average of Wind / Wave / Current factors across the report interval — calculated, not editable."
              >
                {r.avgF}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/* Weather forecast modal */}
      {forecastData && (
        <div className="fv-tracksheet__forecast-backdrop" onClick={() => setForecastData(null)}>
          <div className="fv-tracksheet__forecast-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fv-tracksheet__forecast-head">
              <span><i className="fas fa-cloud-sun" /> Weather Forecast — {vesselName}</span>
              <span className="fv-tracksheet__forecast-route">{routeLabel}</span>
              <button type="button" className="fv-tracksheet__forecast-close" onClick={() => setForecastData(null)}>
                <i className="fas fa-xmark" />
              </button>
            </div>
            <div className="fv-tracksheet__forecast-body">
              <p className="fv-tracksheet__forecast-note">
                <i className="fas fa-circle-info" /> Forecast sent to vessel. Showing weather outlook along {forecastData.length} waypoints of the active route.
              </p>
              <table className="fv-tracksheet__forecast-table">
                <thead>
                  <tr>
                    <th>Waypoint</th>
                    <th>Lat / Lng</th>
                    <th>ETA (UTC)</th>
                    <th>Wind Speed</th>
                    <th>Wave Height</th>
                  </tr>
                </thead>
                <tbody>
                  {forecastData.map((wp, i) => (
                    <tr key={i}>
                      <td>{wp.label}</td>
                      <td>{wp.lat.toFixed(2)}° / {wp.lng.toFixed(2)}°</td>
                      <td>{wp.time}</td>
                      <td>{wp.windSpd}</td>
                      <td>{wp.wavHt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
