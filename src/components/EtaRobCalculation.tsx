import { useMemo, useState } from 'react';

/**
 * ETA & ROB Calculation — two sections modelled on the operations
 * spreadsheet:
 *
 *   1. ETA Calculation
 *      - ETA Calculation: sweeps a weather-factor (%) range and shows the
 *        resulting average speed, time-to-go and arrival time (UTC + LT).
 *      - Required Speed Calculation: given a required arrival time, computes
 *        the average speed (and weather factor) needed to make it.
 *
 *   2. ROB Calculation
 *      - Multiple-speed itinerary: per-leg speed / weather factor drives the
 *        steaming days, arrival times and the running fuel (FO) / gas-oil
 *        (GO) remaining-on-board after consumption and bunker supply.
 *
 * All figures are computed live in the browser from the editable inputs;
 * no API is wired yet.
 */

const HOUR = 3_600_000;

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Parse a `YYYY-MM-DDTHH:mm` value as an epoch (fields treated as UTC). */
function parseDT(s: string): number | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Epoch -> `DD-MM-YY HH:mm`. */
function fmtDT(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${String(
    d.getUTCFullYear(),
  ).slice(2)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Decimal hours -> `DD:HH:MM`. */
function fmtDur(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '—';
  const totalMin = Math.round(hours * 60);
  const dd = Math.floor(totalMin / 1440);
  const hh = Math.floor((totalMin % 1440) / 60);
  const mm = totalMin % 60;
  return `${pad(dd)}:${pad(hh)}:${pad(mm)}`;
}

function fmt(n: number, dp = 2): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

/** A labelled input used across the calculation cards. */
function Field({
  label,
  value,
  onChange,
  type = 'number',
  suffix,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: 'number' | 'datetime-local';
  suffix?: string;
  step?: string;
}) {
  return (
    <label className="fv-calc__field">
      <span className="fv-calc__field-label">{label}</span>
      <span className="fv-calc__field-input">
        <input
          type={type}
          value={value}
          step={step}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="fv-calc__field-suffix">{suffix}</span>}
      </span>
    </label>
  );
}

const WF_STEPS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

function EtaCalculationCard() {
  const [from, setFrom] = useState('2026-02-24T23:00');
  const [curTz, setCurTz] = useState('1');
  const [destTz, setDestTz] = useState('1');
  const [cpSpeed, setCpSpeed] = useState('14.7');
  const [distance, setDistance] = useState('1030');
  const [wfList, setWfList] = useState<string[]>(WF_STEPS.map(String));

  const fromMs = parseDT(from);
  const utcStartMs = fromMs != null ? fromMs - num(curTz) * HOUR : null;
  const cp = num(cpSpeed);
  const dist = num(distance);

  const rows = useMemo(
    () =>
      wfList.map((wfStr) => {
        const wf = num(wfStr);
        const avg = cp * (1 - wf / 100);
        const hrs = avg > 0 ? dist / avg : Infinity;
        const arrUtc = utcStartMs != null ? utcStartMs + hrs * HOUR : NaN;
        const arrLt = Number.isFinite(arrUtc) ? arrUtc + num(destTz) * HOUR : NaN;
        return { wfStr, avg, hrs, arrUtc, arrLt };
      }),
    [cp, dist, utcStartMs, destTz, wfList],
  );

  const setWf = (idx: number, value: string) =>
    setWfList((prev) => prev.map((w, i) => (i === idx ? value : w)));

  return (
    <div className="fv-calc__card">
      <h4 className="fv-calc__card-title">ETA Calculation</h4>
      <div className="fv-calc__inputs">
        <Field label="From Date &amp; Time" type="datetime-local" value={from} onChange={setFrom} />
        <Field label="Current Time Zone" value={curTz} onChange={setCurTz} step="0.5" />
        <div className="fv-calc__derived">
          <span className="fv-calc__field-label">Date &amp; Time in UTC</span>
          <span className="fv-calc__derived-value">
            {utcStartMs != null ? fmtDT(utcStartMs) : '—'}
          </span>
        </div>
        <Field label="Destination Time Zone" value={destTz} onChange={setDestTz} step="0.5" />
        <Field label="CP Speed" value={cpSpeed} onChange={setCpSpeed} suffix="KTS" step="0.1" />
        <Field label="Distance To Go" value={distance} onChange={setDistance} suffix="NM" step="1" />
      </div>

      <div className="fv-calc__table-wrap fv-calc__table-wrap--scroll">
        <table className="fv-calc__table">
          <thead>
            <tr>
              <th>WF %</th>
              <th>Avg Speed</th>
              <th>Arrival Time in UTC</th>
              <th className="fv-calc__center">Time To Go (DD:HH:MM)</th>
              <th>Arrival Time in LT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td className="fv-calc__wf">
                  <input
                    className="fv-calc__wf-input"
                    type="number"
                    step="0.1"
                    value={r.wfStr}
                    onChange={(e) => setWf(idx, e.target.value)}
                  />
                  <span className="fv-calc__wf-unit">%</span>
                </td>
                <td className="fv-calc__num">{fmt(r.avg)}</td>
                <td>{fmtDT(r.arrUtc)}</td>
                <td className="fv-calc__center">{fmtDur(r.hrs)}</td>
                <td>{fmtDT(r.arrLt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RequiredSpeedCard() {
  const [from, setFrom] = useState('2026-02-24T23:00');
  const [curTz, setCurTz] = useState('1');
  const [destTz, setDestTz] = useState('1');
  const [cpSpeed, setCpSpeed] = useState('14.7');
  const [distance, setDistance] = useState('1030');
  const [reqArrival, setReqArrival] = useState('2026-02-27T22:00');

  const fromMs = parseDT(from);
  const reqMs = parseDT(reqArrival);
  const utcStartMs = fromMs != null ? fromMs - num(curTz) * HOUR : null;
  const reqUtcMs = reqMs != null ? reqMs - num(destTz) * HOUR : null;

  const hrs =
    utcStartMs != null && reqUtcMs != null ? (reqUtcMs - utcStartMs) / HOUR : NaN;
  const dist = num(distance);
  const cp = num(cpSpeed);
  const reqAvg = Number.isFinite(hrs) && hrs > 0 ? dist / hrs : NaN;
  const wf = cp > 0 && Number.isFinite(reqAvg) ? (1 - reqAvg / cp) * 100 : NaN;

  return (
    <div className="fv-calc__card">
      <h4 className="fv-calc__card-title">Required Speed Calculation</h4>
      <div className="fv-calc__inputs">
        <Field label="From Date &amp; Time" type="datetime-local" value={from} onChange={setFrom} />
        <Field label="Current Time Zone" value={curTz} onChange={setCurTz} step="0.5" />
        <div className="fv-calc__derived">
          <span className="fv-calc__field-label">Date &amp; Time in UTC</span>
          <span className="fv-calc__derived-value">
            {utcStartMs != null ? fmtDT(utcStartMs) : '—'}
          </span>
        </div>
        <Field label="Destination Time Zone" value={destTz} onChange={setDestTz} step="0.5" />
        <Field label="CP Speed" value={cpSpeed} onChange={setCpSpeed} suffix="KTS" step="0.1" />
        <Field label="Distance To Go" value={distance} onChange={setDistance} suffix="NM" step="1" />
        <Field
          label="Required Arrival (LT)"
          type="datetime-local"
          value={reqArrival}
          onChange={setReqArrival}
        />
      </div>

      <div className="fv-calc__results">
        <div className="fv-calc__result">
          <span className="fv-calc__result-label">Time To Go (DD:HH:MM)</span>
          <span className="fv-calc__result-value">{fmtDur(hrs)}</span>
        </div>
        <div className="fv-calc__result">
          <span className="fv-calc__result-label">Required Avg Speed</span>
          <span className="fv-calc__result-value fv-calc__result-value--strong">
            {fmt(reqAvg)} <small>kt</small>
          </span>
        </div>
        <div className="fv-calc__result">
          <span className="fv-calc__result-label">Weather Factor</span>
          <span className="fv-calc__result-value">{Number.isFinite(wf) ? `${fmt(wf)}%` : '—'}</span>
        </div>
        <div className="fv-calc__result">
          <span className="fv-calc__result-label">Arrival in UTC</span>
          <span className="fv-calc__result-value">
            {reqUtcMs != null ? fmtDT(reqUtcMs) : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

interface Leg {
  id: string;
  from: string;
  to: string;
  distN: string;
  distE: string;
  cp: string;
  wf: string;
  tz: string;
  foCons: string;
  goCons: string;
  foSup: string;
  goSup: string;
}

let legSeq = 0;
function emptyLeg(): Leg {
  legSeq += 1;
  return {
    id: `leg-${legSeq}`,
    from: '',
    to: '',
    distN: '0',
    distE: '0',
    cp: '0',
    wf: '0',
    tz: '0',
    foCons: '0',
    goCons: '0',
    foSup: '',
    goSup: '',
  };
}

function RobCalculationSection() {
  const [from, setFrom] = useState('2026-01-13T06:00');
  const [curTz, setCurTz] = useState('0');
  const [bunkerFo, setBunkerFo] = useState('1219.55');
  const [bunkerGo, setBunkerGo] = useState('95.62');
  const [foConsNonEca, setFoConsNonEca] = useState('18');
  const [foConsEca, setFoConsEca] = useState('0');
  const [goConsNonEca, setGoConsNonEca] = useState('0.1');
  const [goConsEca, setGoConsEca] = useState('18.1');

  const [legs, setLegs] = useState<Leg[]>(() => [
    { ...emptyLeg(), from: '13-0600', to: '19-0600', distN: '2001', distE: '0', cp: '14.8', wf: '5', tz: '10', foCons: '18', goCons: '0.1' },
    { ...emptyLeg(), from: '19-0600', to: 'DBCT', distN: '1649', distE: '0', cp: '13', wf: '5', tz: '10', foCons: '0', goCons: '0' },
  ]);

  const setLeg = (i: number, key: keyof Leg, value: string) =>
    setLegs((prev) => prev.map((leg, idx) => (idx === i ? { ...leg, [key]: value } : leg)));

  const addLeg = () => setLegs((prev) => [...prev, emptyLeg()]);
  const removeLeg = (i: number) =>
    setLegs((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const startUtcMs = useMemo(() => {
    const ms = parseDT(from);
    return ms != null ? ms - num(curTz) * HOUR : null;
  }, [from, curTz]);

  const computed = useMemo(() => {
    let depMs = startUtcMs;
    let robFo = num(bunkerFo);
    let robGo = num(bunkerGo);
    let totalFoUsed = 0;
    let totalGoUsed = 0;

    // Consumption rates come from the top fields (per zone), not per-leg.
    const foNon = num(foConsNonEca);
    const foEca = num(foConsEca);
    const goNon = num(goConsNonEca);
    const goEca = num(goConsEca);

    const rows = legs.map((leg) => {
      const distN = num(leg.distN);
      const distE = num(leg.distE);
      const totalDist = distN + distE;
      const crr = num(leg.cp) * (1 - num(leg.wf) / 100);
      const hrs = crr > 0 && totalDist > 0 ? totalDist / crr : 0;
      const days = hrs / 24;

      const legDepMs = depMs;
      const arrMs = legDepMs != null && hrs > 0 ? legDepMs + hrs * HOUR : legDepMs;
      const arrLtMs = arrMs != null ? arrMs + num(leg.tz) * HOUR : null;

      // Split steaming days by zone (Non-ECA = distN, ECA = distE) and apply
      // the matching consumption rate from the top fields.
      const nonEcaDays = crr > 0 ? distN / crr / 24 : 0;
      const ecaDays = crr > 0 ? distE / crr / 24 : 0;
      const foUsed = foNon * nonEcaDays + foEca * ecaDays;
      const goUsed = goNon * nonEcaDays + goEca * ecaDays;
      const foSup = leg.foSup.trim() === '' ? 0 : num(leg.foSup);
      const goSup = leg.goSup.trim() === '' ? 0 : num(leg.goSup);

      robFo = robFo - foUsed + foSup;
      robGo = robGo - goUsed + goSup;
      totalFoUsed += foUsed;
      totalGoUsed += goUsed;

      const result = {
        crr,
        days,
        depMs: legDepMs,
        arrMs,
        arrLtMs,
        foUsed,
        goUsed,
        robFo,
        robGo,
      };
      depMs = arrMs;
      return result;
    });

    return { rows, totalFoUsed, totalGoUsed };
  }, [legs, startUtcMs, bunkerFo, bunkerGo, foConsNonEca, foConsEca, goConsNonEca, goConsEca]);

  return (
    <div className="fv-calc__card fv-calc__card--wide">
      <h4 className="fv-calc__card-title">Multiple Speed ETA &amp; ROB Calculation</h4>

      <div className="fv-calc__inputs fv-calc__inputs--rob">
        <Field label="From Date &amp; Time" type="datetime-local" value={from} onChange={setFrom} />
        <Field label="Current Time Zone" value={curTz} onChange={setCurTz} step="0.5" />
        <div className="fv-calc__derived">
          <span className="fv-calc__field-label">Date &amp; Time in UTC</span>
          <span className="fv-calc__derived-value">
            {startUtcMs != null ? fmtDT(startUtcMs) : '—'}
          </span>
        </div>
        <Field label="Bunker ROB — FO" value={bunkerFo} onChange={setBunkerFo} suffix="mt" step="0.01" />
        <Field label="Bunker ROB — GO" value={bunkerGo} onChange={setBunkerGo} suffix="mt" step="0.01" />
        <Field label="FO Cons Non ECA" value={foConsNonEca} onChange={setFoConsNonEca} suffix="mt/day" step="0.1" />
        <Field label="FO Cons ECA" value={foConsEca} onChange={setFoConsEca} suffix="mt/day" step="0.1" />
        <Field label="GO Cons Non ECA" value={goConsNonEca} onChange={setGoConsNonEca} suffix="mt/day" step="0.1" />
        <Field label="GO Cons ECA" value={goConsEca} onChange={setGoConsEca} suffix="mt/day" step="0.1" />
      </div>

      <div className="fv-calc__table-wrap fv-calc__table-wrap--scroll">
        <table className="fv-calc__table fv-calc__table--rob">
          <thead>
            <tr>
              <th rowSpan={2}>From</th>
              <th rowSpan={2}>To</th>
              <th colSpan={2}>Distance</th>
              <th rowSpan={2}>CP Speed</th>
              <th rowSpan={2}>W.F %</th>
              <th rowSpan={2}>Crr Speed</th>
              <th rowSpan={2}>Days</th>
              <th rowSpan={2}>Departure UTC</th>
              <th rowSpan={2}>Arrival UTC</th>
              <th rowSpan={2}>TZ</th>
              <th rowSpan={2}>Arrival LT</th>
              <th rowSpan={2}>FO Used</th>
              <th rowSpan={2}>GO Used</th>
              <th rowSpan={2}>FO Sup</th>
              <th rowSpan={2}>GO Sup</th>
              <th rowSpan={2}>Est ROB FO</th>
              <th rowSpan={2}>Est ROB GO</th>
              <th rowSpan={2} />
            </tr>
            <tr>
              <th>Non ECA</th>
              <th>ECA</th>
            </tr>
          </thead>
          <tbody>
            {legs.map((leg, i) => {
              const r = computed.rows[i];
              return (
                <tr key={leg.id}>
                  <td><input className="fv-calc__cell" value={leg.from} onChange={(e) => setLeg(i, 'from', e.target.value)} /></td>
                  <td><input className="fv-calc__cell" value={leg.to} onChange={(e) => setLeg(i, 'to', e.target.value)} /></td>
                  <td><input className="fv-calc__cell fv-calc__cell--num" value={leg.distN} onChange={(e) => setLeg(i, 'distN', e.target.value)} /></td>
                  <td><input className="fv-calc__cell fv-calc__cell--num" value={leg.distE} onChange={(e) => setLeg(i, 'distE', e.target.value)} /></td>
                  <td><input className="fv-calc__cell fv-calc__cell--num" value={leg.cp} onChange={(e) => setLeg(i, 'cp', e.target.value)} /></td>
                  <td><input className="fv-calc__cell fv-calc__cell--num" value={leg.wf} onChange={(e) => setLeg(i, 'wf', e.target.value)} /></td>
                  <td className="fv-calc__num fv-calc__out">{fmt(r.crr)}</td>
                  <td className="fv-calc__num fv-calc__out">{fmt(r.days)}</td>
                  <td className="fv-calc__out">{r.depMs != null ? fmtDT(r.depMs) : '—'}</td>
                  <td className="fv-calc__out">{r.arrMs != null ? fmtDT(r.arrMs) : '—'}</td>
                  <td><input className="fv-calc__cell fv-calc__cell--num" value={leg.tz} onChange={(e) => setLeg(i, 'tz', e.target.value)} /></td>
                  <td className="fv-calc__out">{r.arrLtMs != null ? fmtDT(r.arrLtMs) : '—'}</td>
                  <td className="fv-calc__num fv-calc__out">{fmt(r.foUsed)}</td>
                  <td className="fv-calc__num fv-calc__out">{fmt(r.goUsed)}</td>
                  <td><input className="fv-calc__cell fv-calc__cell--num" value={leg.foSup} onChange={(e) => setLeg(i, 'foSup', e.target.value)} /></td>
                  <td><input className="fv-calc__cell fv-calc__cell--num" value={leg.goSup} onChange={(e) => setLeg(i, 'goSup', e.target.value)} /></td>
                  <td className="fv-calc__num fv-calc__out fv-calc__out--rob">{fmt(r.robFo)}</td>
                  <td className="fv-calc__num fv-calc__out fv-calc__out--rob">{fmt(r.robGo)}</td>
                  <td>
                    <button
                      type="button"
                      className="fv-calc__row-del"
                      onClick={() => removeLeg(i)}
                      disabled={legs.length <= 1}
                      title="Remove leg"
                      aria-label="Remove leg"
                    >
                      <i className="fas fa-trash" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={12} className="fv-calc__foot-label">Total Used</td>
              <td className="fv-calc__num fv-calc__total">{fmt(computed.totalFoUsed)}</td>
              <td className="fv-calc__num fv-calc__total">{fmt(computed.totalGoUsed)}</td>
              <td colSpan={5} />
            </tr>
          </tfoot>
        </table>
      </div>

      <button type="button" className="fv-calc__add-leg" onClick={addLeg}>
        <i className="fas fa-plus" aria-hidden="true" /> Add leg
      </button>
    </div>
  );
}

export function EtaCalculation() {
  return (
    <div className="fv-calc">
      <section className="fv-calc__section">
        <h3 className="fv-calc__section-title">
          <i className="fas fa-clock" aria-hidden="true" /> ETA Calculation
        </h3>
        <div className="fv-calc__cards">
          <EtaCalculationCard />
          <RequiredSpeedCard />
        </div>
      </section>
    </div>
  );
}

export function RobCalculation() {
  return (
    <div className="fv-calc">
      <section className="fv-calc__section">
        <h3 className="fv-calc__section-title">
          <i className="fas fa-gas-pump" aria-hidden="true" /> ROB Calculation
        </h3>
        <RobCalculationSection />
      </section>
    </div>
  );
}
