import { useEffect, useMemo, useState } from 'react';

import { useSelectedVoyage } from '../data/selectedVoyage';
import { buildView } from './voyage/buildView';
import type { Voyage } from '../data/voyages';
import { useWorldPorts } from '../data/ports';
import { PortInput } from './PortInput';
import { VesselSearchInput } from './VesselSearchInput';

/**
 * Voyage Estimation — a flexible, free-standing speed/cons cost comparison
 * tool. Each column ("comparison") is one leg the operator describes by hand
 * (name + Ballast/Laden type, ports, distance, speed, consumption, market
 * factors) — nothing here is bound to any particular voyage's fixed
 * itinerary, so the tool can be used to check a hypothetical leg for a future
 * voyage just as easily as the currently selected one. "Add comparison"
 * appends another independent leg column.
 *
 * A leg is either Ballast or Laden, never both at once, so each column shows
 * only ONE speed/consumption rate for that leg — but both Full and Eco modes
 * are always computed side-by-side within that same column, so the operator
 * can directly compare the cost/time outcome of instructing Full vs Eco for
 * that leg.
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

type LegType = 'Ballast' | 'Laden';

interface LegCard {
  id: string;
  /** Editable column title, e.g. "Leg 1" or a custom name. */
  name: string;
  /** A leg is Ballast OR Laden, never both — purely descriptive here. */
  legType: LegType;
  vesselName: string;
  hirePerDay: string;
  foPrice: string;
  goPrice: string;
  euaPrice: string;
  portFrom: string;
  portTo: string;
  distNonEca: string;
  distEca: string;
  wf: string;
  /** Full/Eco CP speed (kn) — the one rate that applies to this leg's type. */
  fullSpeed: string;
  ecoSpeed: string;
  /** Full/Eco FO (Main) consumption (MT/day). */
  fullConsFO: string;
  ecoConsFO: string;
  /** Full/Eco MGO (Sub) consumption (MT/day). */
  fullConsMGO: string;
  ecoConsMGO: string;
  departure: string;
  timeZone: string;
  robDepFO: string;
  robDepMGO: string;
  suppliedFO: string;
  suppliedMGO: string;
}

let legSeq = 0;
function makeLegCard(base?: Partial<LegCard>): LegCard {
  legSeq += 1;
  return {
    legType: 'Laden',
    vesselName: 'ZEYNEP C',
    hirePerDay: '14000',
    foPrice: '620',
    goPrice: '700',
    euaPrice: '0',
    portFrom: 'LUBUK',
    portTo: 'CHITTAGONG',
    distNonEca: '240',
    distEca: '240',
    wf: '0',
    fullSpeed: '14',
    ecoSpeed: '12',
    fullConsFO: '30',
    ecoConsFO: '24',
    fullConsMGO: '0',
    ecoConsMGO: '0',
    departure: '2025-10-12T01:40',
    timeZone: '6',
    robDepFO: '300',
    robDepMGO: '100',
    suppliedFO: '0',
    suppliedMGO: '0',
    ...base,
    name: base?.name ?? `Leg ${legSeq}`,
    id: `leg-${legSeq}`,
  };
}

/**
 * Seed one leg card from the currently selected voyage — vessel name, market
 * factors (hire / FO / GO / EUA), ports, distance and the Full/Eco CP
 * speed & consumption profile are pulled from the voyage so the operator
 * starts from real data, but every field stays editable and nothing stays
 * bound to the voyage afterwards.
 */
function legCardFromVoyage(voyage: Voyage | undefined): Partial<LegCard> {
  if (!voyage) return {};
  const view = buildView(voyage);
  const totalDist = view.legs.reduce((sum, leg) => sum + num(leg.distanceNm), 0);
  const base: Partial<LegCard> = {};
  if (voyage.vessel) base.vesselName = voyage.vessel;
  if (view.hireRate) base.hirePerDay = view.hireRate;
  if (view.foPrice) base.foPrice = view.foPrice;
  if (view.goPrice) base.goPrice = view.goPrice;
  if (view.euaPrice) base.euaPrice = view.euaPrice;
  if (voyage.portFrom) base.portFrom = voyage.portFrom;
  if (voyage.portTo) base.portTo = voyage.portTo;
  if (totalDist > 0) {
    base.distNonEca = String(Math.round(totalDist));
    base.distEca = '0';
  }
  if (voyage.etdIso) base.departure = voyage.etdIso;
  const speedCons = view.legs[0]?.speedCons ?? [];
  const pick = (desc: string) => speedCons.find((r) => r.description === desc);
  const eco = pick('ECO');
  const full = pick('FULL');
  base.ecoSpeed = eco?.speed || String(voyage.cpSpeed || 12);
  base.ecoConsFO = eco?.dailyCons1 || String(voyage.cpCons || 24);
  base.ecoConsMGO = eco?.dailyCons2 || '0';
  base.fullSpeed = full?.speed || String(voyage.instSpeed || voyage.cpSpeed || 14);
  base.fullConsFO = full?.dailyCons1 || String(voyage.instCons || voyage.cpCons || 30);
  base.fullConsMGO = full?.dailyCons2 || '0';
  return base;
}

interface ModeResult {
  corr: number;
  durN: number;
  durE: number;
  days: number;
  etaUtcMs: number | null;
  etaLtMs: number | null;
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

function computeMode(card: LegCard, speed: string, consFO: string, consMGO: string): ModeResult {
  const sp = num(speed);
  const corr = sp * (1 - num(card.wf) / 100);
  const durN = corr > 0 ? num(card.distNonEca) / corr / 24 : 0;
  const durE = corr > 0 ? num(card.distEca) / corr / 24 : 0;
  const days = durN + durE;

  const depMs = parseDT(card.departure);
  const etaUtcMs = depMs != null ? depMs + days * DAY : null;
  const etaLtMs = etaUtcMs != null ? etaUtcMs + num(card.timeZone) * HOUR : null;

  // FO burned outside ECA; inside ECA the same daily rate is met by MGO.
  const foUsed = num(consFO) * durN;
  const mgoUsed = num(consFO) * durE + num(consMGO) * days;

  const robArrFO = num(card.robDepFO) - foUsed + num(card.suppliedFO);
  const robArrMGO = num(card.robDepMGO) - mgoUsed + num(card.suppliedMGO);

  const hireCost = num(card.hirePerDay) * days;
  const foCost = foUsed * num(card.foPrice);
  const mgoCost = mgoUsed * num(card.goPrice);
  const euaCost = (foUsed * FO_CO2 + mgoUsed * MGO_CO2) * num(card.euaPrice);
  const total = hireCost + foCost + mgoCost + euaCost;

  return {
    corr, durN, durE, days, etaUtcMs, etaLtMs,
    foUsed, mgoUsed, robArrFO, robArrMGO,
    hireCost, foCost, mgoCost, euaCost, total,
  };
}

function computeCard(card: LegCard): { full: ModeResult; eco: ModeResult } {
  return {
    full: computeMode(card, card.fullSpeed, card.fullConsFO, card.fullConsMGO),
    eco: computeMode(card, card.ecoSpeed, card.ecoConsFO, card.ecoConsMGO),
  };
}

export function VoyageEstimation() {
  const voyage = useSelectedVoyage();
  const worldPorts = useWorldPorts();
  const [legs, setLegs] = useState<LegCard[]>(() => [makeLegCard(legCardFromVoyage(voyage))]);

  // Re-seed a single leg from the selected voyage whenever it changes.
  const voyageId = voyage?.id;
  useEffect(() => {
    setLegs([makeLegCard(legCardFromVoyage(voyage))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyageId]);

  const results = useMemo(() => legs.map(computeCard), [legs]);

  const setField = (id: string, field: keyof Omit<LegCard, 'id' | 'legType'>, value: string) =>
    setLegs((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)),
    );

  const setLegType = (id: string, value: LegType) =>
    setLegs((prev) => prev.map((l) => (l.id === id ? { ...l, legType: value } : l)));

  const addComparison = () =>
    setLegs((prev) => [...prev, makeLegCard({ ...prev[prev.length - 1], name: undefined })]);

  const removeComparison = (id: string) =>
    setLegs((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));

  // ── cell renderers ──────────────────────────────────────────────────
  const singleInput = (
    field: keyof Omit<LegCard, 'id' | 'legType'>,
    opts?: { num?: boolean; prefix?: string; suffix?: string; type?: string },
  ) =>
    legs.map((l) => (
      <td key={l.id} colSpan={2} className="fv-est__cell">
        <span className="fv-est__in-wrap">
          {opts?.prefix && <span className="fv-est__affix">{opts.prefix}</span>}
          <input
            className={`fv-est__in${opts?.num ? ' fv-est__in--num' : ''}`}
            type={opts?.type ?? (opts?.num ? 'number' : 'text')}
            value={l[field]}
            onChange={(ev) => setField(l.id, field, ev.target.value)}
          />
          {opts?.suffix && <span className="fv-est__affix">{opts.suffix}</span>}
        </span>
      </td>
    ));

  const dualInput = (
    fieldA: keyof Omit<LegCard, 'id' | 'legType'>,
    fieldB: keyof Omit<LegCard, 'id' | 'legType'>,
    opts?: { num?: boolean },
  ) =>
    legs.flatMap((l) => [
      <td key={`${l.id}-a`} className="fv-est__cell">
        <input
          className={`fv-est__in${opts?.num ? ' fv-est__in--num' : ''}`}
          type={opts?.num ? 'number' : 'text'}
          value={l[fieldA]}
          onChange={(ev) => setField(l.id, fieldA, ev.target.value)}
        />
      </td>,
      <td key={`${l.id}-b`} className="fv-est__cell">
        <input
          className={`fv-est__in${opts?.num ? ' fv-est__in--num' : ''}`}
          type={opts?.num ? 'number' : 'text'}
          value={l[fieldB]}
          onChange={(ev) => setField(l.id, fieldB, ev.target.value)}
        />
      </td>,
    ]);

  /** One accessor applied to both this leg's Full and Eco results. */
  const modeOut = (get: (r: ModeResult) => string) =>
    legs.flatMap((l, i) => [
      <td key={`${l.id}-full`} className="fv-est__cell fv-est__out">{get(results[i].full)}</td>,
      <td key={`${l.id}-eco`} className="fv-est__cell fv-est__out">{get(results[i].eco)}</td>,
    ]);

  const subhead = (a: string, b: string) =>
    legs.flatMap((l) => [
      <th key={`${l.id}-a`} className="fv-est__subhead">{a}</th>,
      <th key={`${l.id}-b`} className="fv-est__subhead">{b}</th>,
    ]);

  /** Vessel Name — search/select against the saved fleet + bundled IMO ship database. */
  const vesselNameRow = () =>
    legs.map((l) => (
      <td key={l.id} colSpan={2} className="fv-est__cell">
        <VesselSearchInput
          value={l.vesselName}
          onChange={(v) => setField(l.id, 'vesselName', v)}
          placeholder="Vessel name"
        />
      </td>
    ));

  /** Ports — search/select against the World Port Index. */
  const portsRow = () =>
    legs.flatMap((l) => [
      <td key={`${l.id}-a`} className="fv-est__cell">
        <PortInput value={l.portFrom} onChange={(v) => setField(l.id, 'portFrom', v)} ports={worldPorts} placeholder="From" />
      </td>,
      <td key={`${l.id}-b`} className="fv-est__cell">
        <PortInput value={l.portTo} onChange={(v) => setField(l.id, 'portTo', v)} ports={worldPorts} placeholder="To" />
      </td>,
    ]);

  return (
    <div className="fv-est">
      <div className="fv-est__scroll">
        <table className="fv-est__table">
          <thead>
            <tr>
              <th className="fv-est__corner" />
              {legs.map((l) => (
                <th key={l.id} colSpan={2} className="fv-est__est-head">
                  <input
                    className="fv-est__in"
                    style={{ width: 96, marginRight: 6 }}
                    value={l.name}
                    onChange={(ev) => setField(l.id, 'name', ev.target.value)}
                  />
                  <select
                    className="fv-est__in"
                    style={{ width: 82, display: 'inline-block', marginRight: 4 }}
                    value={l.legType}
                    onChange={(ev) => setLegType(l.id, ev.target.value as LegType)}
                  >
                    <option value="Ballast">Ballast</option>
                    <option value="Laden">Laden</option>
                  </select>
                  {legs.length > 1 && (
                    <button
                      type="button"
                      className="fv-est__remove"
                      onClick={() => removeComparison(l.id)}
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
            <tr><td className="fv-est__label">Vessel Name</td>{vesselNameRow()}</tr>
            <tr><td className="fv-est__label">Hire Per Day</td>{singleInput('hirePerDay', { num: true, prefix: '$' })}</tr>
            <tr><td className="fv-est__label">FO Price /MT</td>{singleInput('foPrice', { num: true, prefix: '$' })}</tr>
            <tr><td className="fv-est__label">GO Price /MT</td>{singleInput('goPrice', { num: true, prefix: '$' })}</tr>
            <tr><td className="fv-est__label">EUA Price /tCO₂</td>{singleInput('euaPrice', { num: true, prefix: '$' })}</tr>

            <tr className="fv-est__subrow"><td className="fv-est__label" />{subhead('From', 'To')}</tr>
            <tr><td className="fv-est__label">Ports</td>{portsRow()}</tr>

            <tr className="fv-est__subrow"><td className="fv-est__label" />{subhead('Non-ECA', 'ECA')}</tr>
            <tr><td className="fv-est__label">Distance</td>{dualInput('distNonEca', 'distEca', { num: true })}</tr>

            <tr><td className="fv-est__label">W.F</td>{singleInput('wf', { num: true, suffix: '%' })}</tr>

            <tr className="fv-est__subrow"><td className="fv-est__label" />{subhead('Full', 'Eco')}</tr>
            <tr><td className="fv-est__label">CP Speed</td>{dualInput('fullSpeed', 'ecoSpeed', { num: true })}</tr>
            <tr><td className="fv-est__label">Speed after W.F</td>{modeOut((r) => fmt(r.corr))}</tr>
            <tr><td className="fv-est__label">FO Cons / Day</td>{dualInput('fullConsFO', 'ecoConsFO', { num: true })}</tr>
            <tr><td className="fv-est__label">MGO Cons / Day</td>{dualInput('fullConsMGO', 'ecoConsMGO', { num: true })}</tr>
            <tr><td className="fv-est__label">Days</td>{modeOut((r) => fmt(r.days))}</tr>
            <tr><td className="fv-est__label">FO Used</td>{modeOut((r) => fmt(r.foUsed, 3))}</tr>
            <tr><td className="fv-est__label">MGO Used</td>{modeOut((r) => fmt(r.mgoUsed, 3))}</tr>

            <tr><td className="fv-est__label">Departure</td>{singleInput('departure', { type: 'datetime-local' })}</tr>
            <tr><td className="fv-est__label">ETA — UTC</td>{modeOut((r) => fmtDateDay(r.etaUtcMs))}</tr>
            <tr><td className="fv-est__label">Time Zone</td>{singleInput('timeZone', { num: true })}</tr>
            <tr><td className="fv-est__label">ETA — LT</td>{modeOut((r) => fmtDateDay(r.etaLtMs))}</tr>

            <tr className="fv-est__subrow"><td className="fv-est__label" />{subhead('FO', 'MGO')}</tr>
            <tr><td className="fv-est__label">ROB on Dep</td>{dualInput('robDepFO', 'robDepMGO', { num: true })}</tr>
            <tr><td className="fv-est__label">Fuel Supplied</td>{dualInput('suppliedFO', 'suppliedMGO', { num: true })}</tr>

            <tr className="fv-est__subrow"><td className="fv-est__label" />{subhead('Full', 'Eco')}</tr>
            <tr><td className="fv-est__label">ROB FO on Arrival</td>{modeOut((r) => fmt(r.robArrFO, 3))}</tr>
            <tr><td className="fv-est__label">ROB MGO on Arrival</td>{modeOut((r) => fmt(r.robArrMGO, 3))}</tr>

            <tr><td className="fv-est__label">Hire Cost</td>{modeOut((r) => money(r.hireCost))}</tr>
            <tr><td className="fv-est__label">FO Cost</td>{modeOut((r) => money(r.foCost))}</tr>
            <tr><td className="fv-est__label">MGO Cost</td>{modeOut((r) => money(r.mgoCost))}</tr>
            <tr><td className="fv-est__label">EUA Cost</td>{modeOut((r) => money(r.euaCost))}</tr>
            <tr className="fv-est__total"><td className="fv-est__label">Total Costs</td>{modeOut((r) => money(r.total))}</tr>
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

