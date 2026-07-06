import { useMemo, useState } from 'react';

/**
 * Voyage Estimation — a side-by-side voyage cost comparison modelled on the
 * operations spreadsheet. Each column is one estimate; the "Add comparison"
 * button appends another column to the right.
 *
 * Inputs drive live calculations for corrected speed, duration, ETA (UTC/LT),
 * fuel used, ROB on arrival and the cost breakdown (hire / FO / MGO / EUA).
 */

const HOUR = 3_600_000;
const DAY = 86_400_000;
/** tCO2 emitted per tonne of fuel burned (used for the EUA cost). */
const FO_CO2 = 3.114;
const MGO_CO2 = 3.206;

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmt(n: number, dp = 2): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

const pad = (n: number) => String(n).padStart(2, '0');

function parseDT(s: string): number | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

function fmtDateDay(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate(),
  )} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} ${WEEKDAYS[d.getUTCDay()]}`;
}

interface Estimate {
  id: string;
  vesselName: string;
  hirePerDay: string;
  foPrice: string;
  goPrice: string;
  euaPrice: string;
  consFO: string;
  consMGO: string;
  portFrom: string;
  portTo: string;
  distNonEca: string;
  distEca: string;
  speed: string;
  wf: string;
  departure: string;
  timeZone: string;
  robDepFO: string;
  robDepMGO: string;
  suppliedFO: string;
  suppliedMGO: string;
}

let estSeq = 0;
function makeEstimate(base?: Partial<Estimate>): Estimate {
  estSeq += 1;
  return {
    vesselName: 'ZEYNEP C',
    hirePerDay: '14000',
    foPrice: '620',
    goPrice: '700',
    euaPrice: '0',
    consFO: '24',
    consMGO: '0',
    portFrom: 'LUBUK',
    portTo: 'CHITTAGONG',
    distNonEca: '240',
    distEca: '240',
    speed: '12',
    wf: '0',
    departure: '2025-10-12T01:40',
    timeZone: '6',
    robDepFO: '300',
    robDepMGO: '100',
    suppliedFO: '0',
    suppliedMGO: '0',
    ...base,
    id: `est-${estSeq}`,
  };
}

interface Result {
  corr: number;
  durN: number;
  durE: number;
  days: number;
  etaUtcMs: number | null;
  etaLtMs: number | null;
  depMs: number | null;
  foUsed: number;
  mgoUsed: number;
  robArrFO: number;
  robArrMGO: number;
  hireCost: number;
  foCost: number;
  mgoCost: number;
  euaCost: number;
  total: number;
}

function compute(e: Estimate): Result {
  const speed = num(e.speed);
  const corr = speed * (1 - num(e.wf) / 100);
  const durN = corr > 0 ? num(e.distNonEca) / corr / 24 : 0;
  const durE = corr > 0 ? num(e.distEca) / corr / 24 : 0;
  const days = durN + durE;

  const depMs = parseDT(e.departure);
  const etaUtcMs = depMs != null ? depMs + days * DAY : null;
  const etaLtMs = etaUtcMs != null ? etaUtcMs + num(e.timeZone) * HOUR : null;

  // FO burned outside ECA; inside ECA the same daily rate is met by MGO.
  const foUsed = num(e.consFO) * durN;
  const mgoUsed = num(e.consFO) * durE + num(e.consMGO) * days;

  const robArrFO = num(e.robDepFO) - foUsed + num(e.suppliedFO);
  const robArrMGO = num(e.robDepMGO) - mgoUsed + num(e.suppliedMGO);

  const hireCost = num(e.hirePerDay) * days;
  const foCost = foUsed * num(e.foPrice);
  const mgoCost = mgoUsed * num(e.goPrice);
  const euaCost = (foUsed * FO_CO2 + mgoUsed * MGO_CO2) * num(e.euaPrice);
  const total = hireCost + foCost + mgoCost + euaCost;

  return {
    corr, durN, durE, days, depMs, etaUtcMs, etaLtMs,
    foUsed, mgoUsed, robArrFO, robArrMGO,
    hireCost, foCost, mgoCost, euaCost, total,
  };
}

export function VoyageEstimation() {
  const [estimates, setEstimates] = useState<Estimate[]>(() => [makeEstimate()]);
  const results = useMemo(() => estimates.map(compute), [estimates]);

  const setField = (id: string, field: keyof Estimate, value: string) =>
    setEstimates((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    );

  const addComparison = () =>
    setEstimates((prev) => [...prev, makeEstimate(prev[prev.length - 1])]);

  const removeComparison = (id: string) =>
    setEstimates((prev) => (prev.length > 1 ? prev.filter((e) => e.id !== id) : prev));

  // ── cell renderers ────────────────────────────────────────────────
  const singleInput = (
    field: keyof Estimate,
    opts?: { num?: boolean; prefix?: string; suffix?: string; type?: string },
  ) =>
    estimates.map((e) => (
      <td key={e.id} colSpan={2} className="fv-est__cell">
        <span className="fv-est__in-wrap">
          {opts?.prefix && <span className="fv-est__affix">{opts.prefix}</span>}
          <input
            className={`fv-est__in${opts?.num ? ' fv-est__in--num' : ''}`}
            type={opts?.type ?? (opts?.num ? 'number' : 'text')}
            value={e[field]}
            onChange={(ev) => setField(e.id, field, ev.target.value)}
          />
          {opts?.suffix && <span className="fv-est__affix">{opts.suffix}</span>}
        </span>
      </td>
    ));

  const dualInput = (
    fieldA: keyof Estimate,
    fieldB: keyof Estimate,
    opts?: { num?: boolean },
  ) =>
    estimates.flatMap((e) => [
      <td key={`${e.id}-a`} className="fv-est__cell">
        <input
          className={`fv-est__in${opts?.num ? ' fv-est__in--num' : ''}`}
          type={opts?.num ? 'number' : 'text'}
          value={e[fieldA]}
          onChange={(ev) => setField(e.id, fieldA, ev.target.value)}
        />
      </td>,
      <td key={`${e.id}-b`} className="fv-est__cell">
        <input
          className={`fv-est__in${opts?.num ? ' fv-est__in--num' : ''}`}
          type={opts?.num ? 'number' : 'text'}
          value={e[fieldB]}
          onChange={(ev) => setField(e.id, fieldB, ev.target.value)}
        />
      </td>,
    ]);

  const singleOut = (get: (r: Result) => string) =>
    estimates.map((e, i) => (
      <td key={e.id} colSpan={2} className="fv-est__cell fv-est__out">
        {get(results[i])}
      </td>
    ));

  const dualOut = (getA: (r: Result) => string, getB: (r: Result) => string) =>
    estimates.flatMap((e, i) => [
      <td key={`${e.id}-a`} className="fv-est__cell fv-est__out">{getA(results[i])}</td>,
      <td key={`${e.id}-b`} className="fv-est__cell fv-est__out">{getB(results[i])}</td>,
    ]);

  const subhead = (a: string, b: string) =>
    estimates.flatMap((e) => [
      <th key={`${e.id}-a`} className="fv-est__subhead">{a}</th>,
      <th key={`${e.id}-b`} className="fv-est__subhead">{b}</th>,
    ]);

  return (
    <div className="fv-est">
      <div className="fv-est__scroll">
        <table className="fv-est__table">
          <thead>
            <tr>
              <th className="fv-est__corner" />
              {estimates.map((e, i) => (
                <th key={e.id} colSpan={2} className="fv-est__est-head">
                  <span>Estimate {i + 1}</span>
                  {estimates.length > 1 && (
                    <button
                      type="button"
                      className="fv-est__remove"
                      onClick={() => removeComparison(e.id)}
                      title="Remove comparison"
                      aria-label="Remove comparison"
                    >
                      <i className="fas fa-xmark" aria-hidden="true" />
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr><td className="fv-est__label">Vessel Name</td>{singleInput('vesselName')}</tr>
            <tr><td className="fv-est__label">Hire Per Day</td>{singleInput('hirePerDay', { num: true, prefix: '$' })}</tr>
            <tr><td className="fv-est__label">FO Price /MT</td>{singleInput('foPrice', { num: true, prefix: '$' })}</tr>
            <tr><td className="fv-est__label">GO Price /MT</td>{singleInput('goPrice', { num: true, prefix: '$' })}</tr>
            <tr><td className="fv-est__label">EUA Price /tCO₂</td>{singleInput('euaPrice', { num: true, prefix: '$' })}</tr>

            <tr className="fv-est__subrow"><td className="fv-est__label" />{subhead('FO', 'MGO')}</tr>
            <tr><td className="fv-est__label">Fuel Cons / Day</td>{dualInput('consFO', 'consMGO', { num: true })}</tr>

            <tr className="fv-est__subrow"><td className="fv-est__label" />{subhead('From', 'To')}</tr>
            <tr><td className="fv-est__label">Ports</td>{dualInput('portFrom', 'portTo')}</tr>

            <tr className="fv-est__subrow"><td className="fv-est__label" />{subhead('Non-ECA', 'ECA')}</tr>
            <tr><td className="fv-est__label">Distance</td>{dualInput('distNonEca', 'distEca', { num: true })}</tr>

            <tr><td className="fv-est__label">Speed</td>{singleInput('speed', { num: true })}</tr>
            <tr><td className="fv-est__label">W.F</td>{singleInput('wf', { num: true, suffix: '%' })}</tr>
            <tr><td className="fv-est__label">Corr. Speed W.F</td>{singleOut((r) => fmt(r.corr))}</tr>

            <tr className="fv-est__subrow"><td className="fv-est__label" />{subhead('Non-ECA', 'ECA')}</tr>
            <tr><td className="fv-est__label">Duration</td>{dualOut((r) => fmt(r.durN), (r) => fmt(r.durE))}</tr>
            <tr><td className="fv-est__label">Days</td>{singleOut((r) => fmt(r.days))}</tr>

            <tr><td className="fv-est__label">Departure</td>{singleInput('departure', { type: 'datetime-local' })}</tr>
            <tr><td className="fv-est__label">ETA — UTC</td>{singleOut((r) => fmtDateDay(r.etaUtcMs))}</tr>
            <tr><td className="fv-est__label">Time Zone</td>{singleInput('timeZone', { num: true })}</tr>
            <tr><td className="fv-est__label">ETA — LT</td>{singleOut((r) => fmtDateDay(r.etaLtMs))}</tr>

            <tr className="fv-est__subrow"><td className="fv-est__label" />{subhead('FO', 'MGO')}</tr>
            <tr><td className="fv-est__label">ROB on Dep</td>{dualInput('robDepFO', 'robDepMGO', { num: true })}</tr>
            <tr><td className="fv-est__label">Fuel Used</td>{dualOut((r) => fmt(r.foUsed, 3), (r) => fmt(r.mgoUsed, 3))}</tr>
            <tr><td className="fv-est__label">Fuel Supplied</td>{dualInput('suppliedFO', 'suppliedMGO', { num: true })}</tr>
            <tr><td className="fv-est__label">ROB on Arrival</td>{dualOut((r) => fmt(r.robArrFO, 3), (r) => fmt(r.robArrMGO, 3))}</tr>

            <tr><td className="fv-est__label">Hire Cost</td>{singleOut((r) => money(r.hireCost))}</tr>
            <tr><td className="fv-est__label">FO Cost</td>{singleOut((r) => money(r.foCost))}</tr>
            <tr><td className="fv-est__label">MGO Cost</td>{singleOut((r) => money(r.mgoCost))}</tr>
            <tr><td className="fv-est__label">EUA Cost</td>{singleOut((r) => money(r.euaCost))}</tr>
            <tr className="fv-est__total"><td className="fv-est__label">Total Costs</td>{singleOut((r) => money(r.total))}</tr>
          </tbody>
        </table>
      </div>

      <button type="button" className="fv-est__add" onClick={addComparison}>
        <i className="fas fa-plus" aria-hidden="true" />
        <span>Add comparison</span>
      </button>
    </div>
  );
}
