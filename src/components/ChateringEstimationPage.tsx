import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { useSelectedVoyage } from '../data/selectedVoyage';
import type { Voyage } from '../data/voyages';
import { VOYAGES } from '../data/voyages';
import { useWorldPorts } from '../data/ports';
import { accountNames } from '../data/clients';
import { VesselSearchInput } from './VesselSearchInput';
import { setEstimationStatus, setEstimationFixType, makeFixtureNo, handoverToOperations, addNotification, useHandedOver } from '../data/workflow';
import { FUEL_TYPE_OPTIONS } from './voyage/types';
import { NoVesselSelected } from './NoVesselSelected';

/**
 * Chartering — Voyage Estimation (Netpas-style calculation sheet).
 *
 * Reproduces the Netpas voyage-estimation layout: Vessel Particular · Cargo ·
 * Port Rotation · Operation Expense / Bunker Expense / Result. The modern ODAS
 * header (status + New / Duplicate / Compare / Save / … actions) stays on top.
 * Every value is derived live.
 *
 * Calculation model:
 *   Revenue        = Σ (quantity × freight)
 *   Operation Exp. = Dem/Des + Add Comm + Brokerage + Freight Tax + Liner
 *                    Terms + Port Charge + Bunker Exp + CEV + ILOHC +
 *                    Ballast Bonus + Routing + Others
 *   Op. Profit     = Revenue − Operation Expense
 *   Net Hire       = Hire/Day × (1 − H.Add Comm%)
 *   Total Hire     = Net Hire × Voyage Days
 *   Total Expense  = Operation Expense + Total Hire
 *   PROFIT (USD)   = Revenue − Total Expense
 *   C/Base (TCE)   = Op. Profit ÷ Voyage Days
 */

/* ------------------------------------------------------------------ types */

type EstStatus = 'Estimate' | 'Quoted' | 'On Subs' | 'Fixed' | 'Cancelled' | 'Lost';
type LegType = 'Delivery' | 'Ballast' | 'Bunker' | 'Laden' | 'Canal Transit' | 'Discharging' | 'Redelivery';

interface VesselParticular {
  name: string;
  dwt: number;
  draft: number;
  tpc: number;
  built: number;
  kind: string;
  type: string;
}

interface SpeedSet {
  ballast: number;
  laden: number;
}
interface CustomSpeed extends SpeedSet {
  id: string;
  name: string;
}
interface MainCons {
  type: string;
  ballast: number;
  laden: number;
  idle: number;
  work: number;
}
interface SubCons {
  type: string;
  sea: number;
  idle: number;
  work: number;
}
interface Performance {
  speedMode: string;
  full: SpeedSet;
  eco: SpeedSet;
  customs: CustomSpeed[];
  mainNormal: MainCons;
  mainEca: MainCons;
  subNormal: SubCons;
  subEca: SubCons;
}

interface Cargo {
  id: string;
  account: string;
  name: string;
  loadPort: string;
  dischPort: string;
  quantity: number;
  unit: string;
  frt: number;
  term: string;
  aCommPct: number;
  brkgPct: number;
  frtTaxPct: number;
  linerTerm: number;
}

interface PortRow {
  id: string;
  type: LegType;
  port: string;
  distance: number;
  ecaDistance: number;
  wf: number;
  speed: number;
  ldRate: number;
  idle: number;
  work: number;
  seaManual: number;
  dem: number;
  des: number;
  portCharge: number;
}

interface Commercial {
  dailyHire: number;
  hAddCommPct: number;
  dailyHireOut: number;
  hAddCommOutPct: number;
  ownDailyCost: number;
  freightIn: number;
  bodQty: number;
  bodPrice: number;
  borQty: number;
  borPrice: number;
  cev: number;
  ilohc: number;
  ballastBonus: number;
  routingService: number;
  others: number;
  linerTerms: number;
  vlsfoPrice: number;
  mgoPrice: number;
  ulsfoPrice: number;
}

interface Canals {
  suez: boolean;
  panama: boolean;
  kiel: boolean;
}

interface EstimateInputs {
  fixType: FixType;
  perf: Performance;
  cargoes: Cargo[];
  ports: PortRow[];
  commercial: Commercial;
  canals: Canals;
  startDate: string;
}

interface LegCalc {
  sea: number;
  eca: number;
  arrival: string;
  departure: string;
}

interface EstimateResult {
  freight: number;
  addComm: number;
  brokerage: number;
  freightTax: number;
  linerTermTotal: number;
  seaDays: number;
  ecaDays: number;
  ladenDays: number;
  ballastDays: number;
  idleTotal: number;
  workTotal: number;
  portDays: number;
  voyageDays: number;
  distanceTotal: number;
  ecaDistanceTotal: number;
  portCharge: number;
  demTotal: number;
  desTotal: number;
  demDes: number;
  vlsfoCons: number;
  ulsfoCons: number;
  mgoCons: number;
  vlsfoExp: number;
  ulsfoExp: number;
  mgoExp: number;
  bunkerExpense: number;
  bodValue: number;
  borValue: number;
  bunkerAdj: number;
  opExpense: number;
  revenue: number;
  opProfit: number;
  netHire: number;
  totalHire: number;
  totalExpense: number;
  profit: number;
  profitPct: number;
  tce: number;
  startStr: string;
  endStr: string;
  perLeg: LegCalc[];
}

interface Snapshot {
  id: string;
  name: string;
  result: EstimateResult;
}

/* -------------------------------------------------------------- constants */

const STATUS_META: Record<EstStatus, { color: string }> = {
  Estimate: { color: 'slate' },
  Quoted: { color: 'blue' },
  'On Subs': { color: 'amber' },
  Fixed: { color: 'green' },
  Cancelled: { color: 'red' },
  Lost: { color: 'grey' },
};
const LEG_TYPES: LegType[] = ['Delivery', 'Ballast', 'Bunker', 'Laden', 'Canal Transit', 'Discharging', 'Redelivery'];

/* Fixture type = how the vessel is taken in — how it is employed out. */
type InKind = 'TCIN' | 'TCTIN' | 'VIN' | 'OWN';
type OutKind = 'TCOUT' | 'TCTOUT' | 'VOUT';
type FixType =
  | 'TCIN-TCOUT' | 'TCIN-VOUT' | 'TCIN-TCTOUT'
  | 'TCTIN-TCTOUT' | 'TCTIN-TCOUT' | 'TCTIN-VOUT'
  | 'VIN-VOUT' | 'VIN-TCTOUT'
  | 'OWN-TCOUT' | 'OWN-VOUT' | 'OWN-TCTOUT';

const FIX_TYPES: FixType[] = [
  'TCIN-TCOUT', 'TCIN-VOUT', 'TCIN-TCTOUT',
  'TCTIN-TCTOUT', 'TCTIN-TCOUT', 'TCTIN-VOUT',
  'VIN-VOUT', 'VIN-TCTOUT',
  'OWN-TCOUT', 'OWN-VOUT', 'OWN-TCTOUT',
];

/** Fix Type options, with TCTIN-VOUT pinned to the top (used by filters). */
export const FIX_TYPE_FILTER_OPTIONS: string[] = [
  'TCTIN-VOUT',
  ...FIX_TYPES.filter((f) => f !== 'TCTIN-VOUT'),
];

function parseFix(f: FixType): { inKind: InKind; outKind: OutKind } {
  const dash = f.indexOf('-');
  return { inKind: f.slice(0, dash) as InKind, outKind: f.slice(dash + 1) as OutKind };
}

/* ---------------------------------------------------------------- helpers */

function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
function num(v: string): number {
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function fmt(n: number, dp = 1): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function money(n: number): string {
  return `${n < 0 ? '-' : ''}$${fmt(Math.abs(n), 0)}`;
}
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
function fmtDate(d: Date): string {
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function uid(p: string): string {
  return `${p}-${Math.random().toString(36).slice(2, 8)}`;
}

/* -------------------------------------------------------- estimate engine */

function computeEstimate(i: EstimateInputs): EstimateResult {
  const { cargoes, ports, perf, commercial } = i;

  let freight = 0;
  let addComm = 0;
  let brokerage = 0;
  let freightTax = 0;
  let linerTermTotal = 0;
  for (const c of cargoes) {
    const tf = c.quantity * c.frt;
    freight += tf;
    addComm += (tf * c.aCommPct) / 100;
    brokerage += (tf * c.brkgPct) / 100;
    freightTax += (tf * c.frtTaxPct) / 100;
    linerTermTotal += c.linerTerm;
  }

  let seaDays = 0;
  let ecaDays = 0;
  let ladenDays = 0;
  let ballastDays = 0;
  let idleTotal = 0;
  let workTotal = 0;
  let distanceTotal = 0;
  let ecaDistanceTotal = 0;
  let portCharge = 0;
  let demTotal = 0;
  let desTotal = 0;
  let foNormalSea = 0;
  let foEcaSea = 0;
  let foPort = 0;
  let mgoSea = 0;
  let mgoEcaSea = 0;
  let mgoPort = 0;

  const start = new Date(i.startDate);
  let cursor = start;
  const perLeg: LegCalc[] = [];

  for (const p of ports) {
    const spd = p.speed > 0 ? p.speed : 12;
    let legSea: number;
    let legEca: number;
    if (p.distance > 0) {
      legSea = (p.distance / (spd * 24)) * (1 + p.wf / 100);
      legEca = p.ecaDistance > 0 ? p.ecaDistance / (spd * 24) : 0;
    } else {
      // No distance → manual buffer days (e.g. Delivery / Redelivery margin).
      legSea = p.seaManual;
      legEca = 0;
    }
    const normalSea = Math.max(0, legSea - legEca);
    const isBallast = p.type === 'Ballast' || p.type === 'Delivery' || p.type === 'Redelivery';

    foNormalSea += normalSea * (isBallast ? perf.mainNormal.ballast : perf.mainNormal.laden);
    foEcaSea += legEca * (isBallast ? perf.mainEca.ballast : perf.mainEca.laden);
    foPort += p.idle * perf.mainNormal.idle + p.work * perf.mainNormal.work;
    mgoSea += normalSea * perf.subNormal.sea;
    mgoEcaSea += legEca * perf.subEca.sea;
    mgoPort += p.idle * perf.subNormal.idle + p.work * perf.subNormal.work;

    seaDays += legSea;
    ecaDays += legEca;
    if (isBallast) ballastDays += legSea;
    else ladenDays += legSea;
    idleTotal += p.idle;
    workTotal += p.work;
    distanceTotal += p.distance;
    ecaDistanceTotal += p.ecaDistance;
    portCharge += p.portCharge;
    demTotal += p.dem;
    desTotal += p.des;

    const arrival = addDays(cursor, legSea);
    const departure = addDays(arrival, p.idle + p.work);
    cursor = departure;
    perLeg.push({
      sea: round(legSea, 2),
      eca: round(legEca, 2),
      arrival: legSea > 0 ? fmtDate(arrival) : '—',
      departure: fmtDate(departure),
    });
  }

  const portDays = idleTotal + workTotal;
  const voyageDays = seaDays + portDays;
  const vlsfoCons = foNormalSea + foPort;
  const ulsfoCons = foEcaSea;
  const mgoCons = mgoSea + mgoEcaSea + mgoPort;
  const vlsfoExp = vlsfoCons * commercial.vlsfoPrice;
  const ulsfoExp = ulsfoCons * commercial.ulsfoPrice;
  const mgoExp = mgoCons * commercial.mgoPrice;
  const bunkerExpense = vlsfoExp + ulsfoExp + mgoExp;

  const demDes = desTotal - demTotal;

  // Fixture type drives which components apply. We operate the voyage (bear
  // bunkers/ports/dem-des and earn freight) only when the OUT side is a voyage.
  const { inKind, outKind } = parseFix(i.fixType);
  const isTCkind = (k: string) => k.startsWith('TC');
  const weOperate = outKind === 'VOUT' && inKind !== 'VIN'; // we run the voyage → pay bunkers/ports
  const isRelet = inKind === 'VIN'; // relet in → cost is freight-in, we don't operate
  const showBOD = !weOperate && !isRelet && (isTCkind(inKind) || isTCkind(outKind));

  const bodValue = commercial.bodQty * commercial.bodPrice;
  const borValue = commercial.borQty * commercial.borPrice;
  const bunkerAdj = bodValue - borValue;

  // Voyage components apply only for the relevant fixture legs.
  const freightCommOpex = outKind === 'VOUT' ? addComm + brokerage + freightTax + commercial.linerTerms + linerTermTotal : 0;
  const demDesOpex = outKind === 'VOUT' ? demDes : 0;
  const portOpex = weOperate ? portCharge : 0;
  const bunkerOpex = weOperate ? bunkerExpense : 0;
  const bodOpex = showBOD ? bunkerAdj : 0;
  const fixedOpex = commercial.cev + commercial.ilohc + commercial.ballastBonus + commercial.routingService + commercial.others;
  const opExpense = fixedOpex + freightCommOpex + demDesOpex + portOpex + bunkerOpex + bodOpex;

  // Revenue: freight (voyage out) or net hire out (time-charter out).
  const revenue = outKind === 'VOUT' ? freight : commercial.dailyHireOut * (1 - commercial.hAddCommOutPct / 100) * voyageDays;

  const opProfit = revenue - opExpense;
  // In-cost: relet freight-in (lumpsum), owner running cost, or net daily hire × days.
  const netHire = isRelet
    ? (voyageDays > 0 ? commercial.freightIn / voyageDays : commercial.freightIn)
    : inKind === 'OWN'
      ? commercial.ownDailyCost
      : commercial.dailyHire * (1 - commercial.hAddCommPct / 100);
  const totalHire = isRelet ? commercial.freightIn : netHire * voyageDays;
  const totalExpense = opExpense + totalHire;
  const profit = revenue - totalExpense;
  const profitPct = revenue !== 0 ? (profit / revenue) * 100 : 0;
  const tce = voyageDays > 0 ? opProfit / voyageDays : 0;

  return {
    freight,
    addComm,
    brokerage,
    freightTax,
    linerTermTotal,
    seaDays,
    ecaDays,
    ladenDays,
    ballastDays,
    idleTotal,
    workTotal,
    portDays,
    voyageDays,
    distanceTotal,
    ecaDistanceTotal,
    portCharge,
    demTotal,
    desTotal,
    demDes,
    vlsfoCons,
    ulsfoCons,
    mgoCons,
    vlsfoExp,
    ulsfoExp,
    mgoExp,
    bunkerExpense,
    bodValue,
    borValue,
    bunkerAdj,
    opExpense,
    revenue,
    opProfit,
    netHire,
    totalHire,
    totalExpense,
    profit,
    profitPct,
    tce,
    startStr: fmtDate(start),
    endStr: fmtDate(cursor),
    perLeg,
  };
}

function setLegSpeeds(i: EstimateInputs, set: SpeedSet): PortRow[] {
  return i.ports.map((p) => ({ ...p, speed: p.type === 'Ballast' || p.type === 'Delivery' || p.type === 'Redelivery' ? set.ballast : set.laden }));
}

/* --------------------------------------------------- freight ⇄ hire link */

/** Break-even daily hire for the current freight: the hire whose net cost equals the voyage TCE (profit → 0). */
function breakEvenHire(r: EstimateResult, hAddCommPct: number): number {
  const net = 1 - hAddCommPct / 100;
  if (net <= 0 || r.voyageDays <= 0) return 0;
  return r.tce / net;
}

/** Rescale every cargo's freight rate so the voyage breaks even at the given daily hire (inverse of breakEvenHire). */
function solveFreightForHire(i: EstimateInputs, targetHire: number): Cargo[] {
  const r = computeEstimate(i);
  const net = 1 - i.commercial.hAddCommPct / 100;
  // opExpense minus the freight-linked commissions = the part independent of freight rate.
  const opExpenseFixed = r.opExpense - r.addComm - r.brokerage - r.freightTax;
  // Net freight (revenue after freight commissions) required for profit = 0 at the target hire.
  const targetNetFreight = targetHire * net * r.voyageDays + opExpenseFixed;
  const currentNetFreight = r.revenue - r.addComm - r.brokerage - r.freightTax;

  if (Math.abs(currentNetFreight) > 1) {
    const k = targetNetFreight / currentNetFreight;
    return i.cargoes.map((c) => ({ ...c, frt: round(Math.max(0, c.frt * k), 3) }));
  }
  // No freight yet to scale: solve a single flat rate across the cargoes.
  const denom = i.cargoes.reduce((s, c) => s + c.quantity * (1 - (c.aCommPct + c.brkgPct + c.frtTaxPct) / 100), 0);
  if (Math.abs(denom) < 1e-6) return i.cargoes;
  const rate = round(Math.max(0, targetNetFreight / denom), 3);
  return i.cargoes.map((c) => (c.quantity > 0 ? { ...c, frt: rate } : c));
}

/* ------------------------------------------------------------ seed inputs */

function seedInputs(voyage: Voyage | undefined): EstimateInputs {
  const perf: Performance = {
    speedMode: 'Full',
    full: { ballast: 14, laden: 14 },
    eco: { ballast: 12, laden: 11.5 },
    customs: [],
    mainNormal: { type: 'VLSFO', ballast: 29, laden: 33, idle: 2.5, work: 5 },
    mainEca: { type: 'ULSFO', ballast: 29, laden: 33, idle: 2.5, work: 5 },
    subNormal: { type: 'MGO', sea: 0.1, idle: 0, work: 0 },
    subEca: { type: 'MGO', sea: 0.1, idle: 0, work: 0 },
  };

  const c = (
    account: string,
    name: string,
    loadPort: string,
    dischPort: string,
    quantity: number,
    frt: number,
  ): Cargo => ({
    id: uid('cg'),
    account,
    name,
    loadPort,
    dischPort,
    quantity,
    unit: 'MT',
    frt,
    term: 'FIO',
    aCommPct: 3.75,
    brkgPct: 1.25,
    frtTaxPct: 0,
    linerTerm: 0,
  });

  const cargoes: Cargo[] = [
    c('5011ACCT1', 'general', 'Tianjin <China>', 'Ravenna <Italy>', 15_000, 28),
    c('5011ACCT1', 'general', 'Rizhao <China>', 'Ravenna <Italy>', 10_000, 28),
    c('5011ACCT1', 'general', 'Tianjin <China>', 'Rotterdam <Netherlands>', 10_000, 30),
    c('5011ACCT2', 'steel', 'Qingdao <China>', 'Rotterdam <Netherlands>', 15_000, 35),
  ];
  if (voyage) {
    cargoes[0].loadPort = voyage.portFrom || cargoes[0].loadPort;
    cargoes[0].dischPort = voyage.portTo || cargoes[0].dischPort;
  }

  const p = (
    type: LegType,
    port: string,
    distance: number,
    ecaDistance: number,
    speed: number,
    ldRate: number,
    idle: number,
    work: number,
    des: number,
    portCharge: number,
    seaManual = 0,
  ): PortRow => ({
    id: uid('pr'),
    type,
    port,
    distance,
    ecaDistance,
    wf: 5,
    speed,
    ldRate,
    idle,
    work,
    seaManual,
    dem: 0,
    des,
    portCharge,
  });

  const ports: PortRow[] = [
    p('Delivery', 'CJK (Changjiangkou) <China>', 0, 0, 14, 0, 0, 0, 0, 0),
    p('Laden', 'Tianjin <China>', 676, 0, 14, 10_000, 0.5, 2.5, 3_000, 45_000),
    p('Laden', 'Qingdao <China>', 463, 0, 14, 5_000, 0.5, 3.0, 2_500, 35_000),
    p('Laden', 'Rizhao <China>', 82, 0, 14, 5_000, 0.5, 2.0, 3_000, 35_000),
    p('Bunker', 'Singapore <Singapore>', 2_461, 0, 14, 0, 0.5, 0, 0, 3_000),
    p('Canal Transit', 'Suez Canal (RP)', 5_047, 0, 14, 0, 0.21, 0, 0, 185_000),
    p('Discharging', 'Ravenna <Italy>', 1_356, 0, 14, 8_000, 0.5, 3.13, 3_000, 40_000),
    p('Discharging', 'Rotterdam <Netherlands>', 3_057, 417, 14, 10_000, 0.5, 1.0, 2_500, 20_000),
    p('Discharging', 'Rotterdam <Netherlands>', 0, 0, 14, 5_000, 1.66, 3.0, 3_000, 20_000),
    p('Redelivery', 'Redelivery Margin', 0, 0, 0, 0, 1.0, 0, 0, 0, 2.0),
  ];

  const commercial: Commercial = {
    dailyHire: voyage ? Math.round(voyage.price) : 8_500,
    hAddCommPct: 3.75,
    dailyHireOut: voyage ? Math.round(voyage.price * 1.1) : 9_500,
    hAddCommOutPct: 1.25,
    ownDailyCost: 6_500,
    freightIn: 900_000,
    bodQty: 600,
    bodPrice: voyage?.foCost || 400,
    borQty: 400,
    borPrice: (voyage?.foCost || 400) - 20,
    cev: 3_177.9,
    ilohc: 5_000,
    ballastBonus: 0,
    routingService: 0,
    others: 0,
    linerTerms: 0,
    vlsfoPrice: voyage?.foCost || 320,
    mgoPrice: voyage?.goCost || 360,
    ulsfoPrice: 350,
  };

  return { fixType: 'TCIN-VOUT', perf, cargoes, ports, commercial, canals: { suez: true, panama: true, kiel: false }, startDate: '2020-08-06T16:10' };
}

/** Vessel types grouped by segment for the Vessel Particular "Type" dropdown. */
const VESSEL_TYPES: { group: string; types: string[] }[] = [
  { group: 'Dry Bulk', types: ['Mini Bulker', 'Handysize', 'Handymax', 'Supramax', 'Ultramax', 'Panamax', 'Kamsarmax', 'Post-Panamax', 'Capesize', 'Newcastlemax', 'VLOC', 'Valemax'] },
  { group: 'Tanker', types: ['Product / MR', 'LR1', 'LR2', 'Panamax Tanker', 'Aframax', 'Suezmax', 'VLCC', 'ULCC', 'Chemical Tanker', 'Bitumen Tanker', 'Shuttle Tanker'] },
  { group: 'Gas', types: ['LNG Carrier', 'LPG Carrier', 'VLGC', 'Ethylene Carrier'] },
  { group: 'Container', types: ['Feeder', 'Feedermax', 'Container Panamax', 'Post-Panamax Container', 'New Panamax', 'ULCV'] },
  { group: 'Other', types: ['General Cargo', 'Multipurpose (MPP)', 'Reefer', 'Ro-Ro', 'PCTC / Car Carrier', 'Heavy Lift', 'Cement Carrier', 'Wood Chip Carrier', 'Livestock Carrier', 'OSV', 'Tug', 'Barge'] },
];

function seedVessel(voyage: Voyage | undefined): VesselParticular {
  return {
    name: voyage?.vessel || 'oriental phoenix',
    dwt: voyage ? num(voyage.dwt) : 56_811,
    draft: 12.8,
    tpc: 58,
    built: voyage?.built || 2012,
    kind: '—',
    type: voyage?.vesselType || 'Supramax',
  };
}

/* -------------------------------------------------------- small UI helpers */

function Section({
  title,
  icon,
  right,
  children,
}: {
  title: string;
  icon: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="fv-ce__card">
      <header className="fv-ce__card-head">
        <span className="fv-ce__card-toggle">
          <i className={`fas ${icon} fv-ce__card-icon`} aria-hidden="true" />
          <span>{title}</span>
        </span>
        {right && <div className="fv-ce__card-right">{right}</div>}
      </header>
      <div className="fv-ce__card-body">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------ main component */

export function ChateringEstimationPage() {
  const voyage = useSelectedVoyage();

  const [inputs, setInputs] = useState<EstimateInputs>(() => seedInputs(voyage));
  const [vessel, setVessel] = useState<VesselParticular>(() => seedVessel(voyage));
  const [status, setStatus] = useState<EstStatus>('Estimate');
  const [locked, setLocked] = useState(false);
  const [fixtureNo, setFixtureNo] = useState<string | null>(null);
  const [lastModified, setLastModified] = useState('2020-08-06 17:11');
  const [compareOpen, setCompareOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotName, setSnapshotName] = useState('');
  const [linkHF, setLinkHF] = useState(false);
  const handedOver = useHandedOver();
  const isSent = voyage ? handedOver.includes(voyage.id) : false;
  const worldPorts = useWorldPorts();
  const portOptions = useMemo(() => worldPorts.slice(0, 4000).map((p) => p.label), [worldPorts]);
  const vesselOptions = useMemo(() => Array.from(new Set(VOYAGES.map((v) => v.vessel))).sort(), []);
  // Account options come from Settings → Account Details.
  const accountOptions = useMemo(() => accountNames(), []);

  const estNo = useMemo(() => `EST-${voyage?.id ?? '0000'}`, [voyage?.id]);

  // Publish the estimate status so the Chartering sidebar buckets it correctly.
  useEffect(() => {
    if (voyage) setEstimationStatus(voyage.id, status);
  }, [voyage?.id, status]);

  // Publish the selected fix type so the sidebar shows it against the vessel.
  useEffect(() => {
    if (voyage) setEstimationFixType(voyage.id, inputs.fixType);
  }, [voyage?.id, inputs.fixType]);

  useEffect(() => {
    setInputs(seedInputs(voyage));
    setVessel(seedVessel(voyage));
    setStatus('Estimate');
    setLocked(false);
    setFixtureNo(null);
    setSnapshots([]);
  }, [voyage?.id]);

  const result = useMemo(() => computeEstimate(inputs), [inputs]);

  // Keep Hire/Day synced to the break-even hire (voyage-out fixtures only).
  useEffect(() => {
    if (!linkHF || locked || inputs.fixType.slice(inputs.fixType.indexOf('-') + 1) !== 'VOUT') return;
    const rounded = round(breakEvenHire(result, inputs.commercial.hAddCommPct));
    if (rounded !== inputs.commercial.dailyHire) {
      setInputs((prev) => ({ ...prev, commercial: { ...prev.commercial, dailyHire: rounded } }));
    }
  }, [linkHF, locked, result, inputs.fixType, inputs.commercial.hAddCommPct, inputs.commercial.dailyHire]);

  const compareOptions = useMemo(
    () => [{ id: 'current', name: 'Current', result }, ...snapshots.map((s) => ({ id: s.id, name: s.name, result: s.result }))],
    [result, snapshots],
  );
  const best = useMemo(() => {
    const r = compareOptions.map((o) => o.result);
    return {
      profit: Math.max(...r.map((x) => x.profit)),
      cost: Math.min(...r.map((x) => x.totalExpense)),
      tce: Math.max(...r.map((x) => x.tce)),
      days: Math.min(...r.map((x) => x.voyageDays)),
    };
  }, [compareOptions]);
  const cargoTotals = useMemo(() => {
    const qty = inputs.cargoes.reduce((s, c) => s + c.quantity, 0);
    const tf = inputs.cargoes.reduce((s, c) => s + c.quantity * c.frt, 0);
    return { qty, tf, frtAvg: qty > 0 ? tf / qty : 0 };
  }, [inputs.cargoes]);

  if (!voyage) return <NoVesselSelected />;

  /* -------- mutation helpers -------- */
  const touch = () => setLastModified(fmtDate(new Date()));
  const patch = (p: Partial<EstimateInputs>) => {
    if (locked) return;
    setInputs((prev) => ({ ...prev, ...p }));
    touch();
  };
  const patchPerf = (p: Partial<Performance>) => patch({ perf: { ...inputs.perf, ...p } });
  const patchMain = (which: 'mainNormal' | 'mainEca', p: Partial<MainCons>) =>
    patchPerf({ [which]: { ...inputs.perf[which], ...p } } as Partial<Performance>);
  const patchSub = (which: 'subNormal' | 'subEca', p: Partial<SubCons>) =>
    patchPerf({ [which]: { ...inputs.perf[which], ...p } } as Partial<Performance>);
  const patchComm = (p: Partial<Commercial>) => patch({ commercial: { ...inputs.commercial, ...p } });

  // Editing the hire back-solves the freight rates so the voyage stays at break-even (when linked).
  const updateDailyHire = (n: number) => {
    if (locked) return;
    if (linkHF) {
      const cargoes = solveFreightForHire(inputs, n);
      patch({ cargoes, commercial: { ...inputs.commercial, dailyHire: n } });
    } else {
      patchComm({ dailyHire: n });
    }
  };

  const updateCargo = (id: string, p: Partial<Cargo>) =>
    patch({ cargoes: inputs.cargoes.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const addCargo = () =>
    patch({
      cargoes: [
        ...inputs.cargoes,
        { id: uid('cg'), account: '', name: '', loadPort: '', dischPort: '', quantity: 0, unit: 'MT', frt: 0, term: 'FIO', aCommPct: 3.75, brkgPct: 1.25, frtTaxPct: 0, linerTerm: 0 },
      ],
    });
  const removeCargo = (id: string) => patch({ cargoes: inputs.cargoes.filter((c) => c.id !== id) });

  const updatePort = (id: string, p: Partial<PortRow>) =>
    patch({ ports: inputs.ports.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const addPort = () =>
    patch({
      ports: [
        ...inputs.ports,
        { id: uid('pr'), type: 'Discharging', port: '', distance: 0, ecaDistance: 0, wf: 5, speed: inputs.perf.full.laden, ldRate: 0, idle: 0.5, work: 0, seaManual: 0, dem: 0, des: 0, portCharge: 0 },
      ],
    });
  const removePort = (id: string) => patch({ ports: inputs.ports.filter((r) => r.id !== id) });
  // Reorder a leg so the rotation can be arranged in any sequence.
  const movePort = (id: string, dir: -1 | 1) => {
    const list = inputs.ports;
    const i = list.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    patch({ ports: next });
  };

  const resolveSpeedSet = (perf: Performance, mode: string): SpeedSet =>
    mode === 'Full' ? perf.full : mode === 'Eco' ? perf.eco : perf.customs.find((c) => c.id === mode) ?? perf.full;

  const setSpeedMode = (mode: string) => {
    if (locked) return;
    setInputs((prev) => ({ ...prev, perf: { ...prev.perf, speedMode: mode }, ports: setLegSpeeds(prev, resolveSpeedSet(prev.perf, mode)) }));
    touch();
  };

  const addCustomSpeed = () => {
    if (locked) return;
    const id = uid('sp');
    patchPerf({ customs: [...inputs.perf.customs, { id, name: `Custom ${inputs.perf.customs.length + 1}`, ballast: 12, laden: 12 }] });
  };
  const renameCustomSpeed = (id: string, name: string) =>
    patchPerf({ customs: inputs.perf.customs.map((c) => (c.id === id ? { ...c, name } : c)) });
  const removeCustomSpeed = (id: string) =>
    patchPerf({ customs: inputs.perf.customs.filter((c) => c.id !== id), speedMode: inputs.perf.speedMode === id ? 'Full' : inputs.perf.speedMode });
  const patchActiveSpeed = (p: Partial<SpeedSet>) => {
    const mode = inputs.perf.speedMode;
    if (mode === 'Full') patchPerf({ full: { ...inputs.perf.full, ...p } });
    else if (mode === 'Eco') patchPerf({ eco: { ...inputs.perf.eco, ...p } });
    else patchPerf({ customs: inputs.perf.customs.map((c) => (c.id === mode ? { ...c, ...p } : c)) });
  };

  /* -------- header actions -------- */
  const newEstimate = () => {
    setInputs(seedInputs(voyage));
    setStatus('Estimate');
    setLocked(false);
    setFixtureNo(null);
    setSnapshots([]);
  };
  const save = () => touch();
  const changeStatus = (next: EstStatus) => {
    if (locked) return;
    setStatus(next);
  };
  const markFixed = () => {
    if (locked) return;
    setStatus('Fixed');
    // Monthly fixture sequence derived deterministically from the voyage.
    const seq = (Math.abs(Math.round(voyage.seed ?? 0)) % 99) + 1;
    setFixtureNo(makeFixtureNo(seq));
    setLocked(true);
  };
  // Reopen a fixed estimate for editing — un-locks the form and reverts to
  // "On Subs" so details can be changed and re-fixed.
  const reopenEstimate = () => {
    setLocked(false);
    setStatus('On Subs');
    setFixtureNo(null);
  };
  // Cancel works from any state, including after the estimate has been fixed.
  const cancelEstimate = () => {
    setLocked(false);
    setStatus('Cancelled');
    setFixtureNo(null);
  };
  // Hand the fixed voyage over to Operations and notify the team to assign a PIC.
  const copyToOperations = () => {
    if (!voyage || status !== 'Fixed') return;
    handoverToOperations(voyage.id);
    addNotification(`New voyage ${voyage.id} — ${voyage.vessel} fixed & sent to Operations. Please assign a PIC.`, 'Operations');
  };

  /* -------- compare -------- */
  const captureSnapshot = () => {
    const name = snapshotName.trim() || `Option ${String.fromCharCode(65 + snapshots.length)}`;
    setSnapshots((s) => [...s, { id: uid('sn'), name, result }]);
    setSnapshotName('');
  };
  const removeSnapshot = (id: string) => setSnapshots((s) => s.filter((x) => x.id !== id));

  const stat = STATUS_META[status];
  const activeCanals = [inputs.canals.suez && 'SUEZ', inputs.canals.panama && 'PANAMA', inputs.canals.kiel && 'KIEL'].filter(Boolean).join(', ');
  const speeds = resolveSpeedSet(inputs.perf, inputs.perf.speedMode);
  const fix = parseFix(inputs.fixType);
  // Fixture mode drives which sections/expenses apply.
  const isTC = (k: string) => k.startsWith('TC');
  const weOperate = fix.outKind === 'VOUT' && fix.inKind !== 'VIN';
  const isRelet = fix.inKind === 'VIN';

  /* inline cell renderers */
  const numCell = (value: number, onChange: (n: number) => void, min = 66) => (
    <input className="fv-ce__cell-num" style={{ minWidth: min }} type="number" value={value} disabled={locked} onChange={(e) => onChange(num(e.target.value))} />
  );
  const txtCell = (value: string, onChange: (v: string) => void, min = 120) => (
    <input className="fv-ce__cell-input" style={{ minWidth: min }} value={value} disabled={locked} onChange={(e) => onChange(e.target.value)} />
  );
  // Port cell backed by our world-port data (settings database).
  const portCell = (value: string, onChange: (v: string) => void, min = 160) => (
    <input className="fv-ce__cell-input" style={{ minWidth: min }} list="fv-ce-ports" placeholder="Search port…" value={value} disabled={locked} onChange={(e) => onChange(e.target.value)} />
  );
  const vesselCell = (value: string, onChange: (v: string) => void, min = 150) => (
    <input className="fv-ce__cell-input" style={{ minWidth: min }} list="fv-ce-vessels" placeholder="Select vessel…" value={value} disabled={locked} onChange={(e) => onChange(e.target.value)} />
  );
  // Account cell backed by the accounts created in Settings → Account Details.
  const accountCell = (value: string, onChange: (v: string) => void, min = 90) => (
    <input className="fv-ce__cell-input" style={{ minWidth: min }} list="fv-ce-accounts" placeholder="Select account…" value={value} disabled={locked} onChange={(e) => onChange(e.target.value)} />
  );
  // Fuel-type select cell — same marine fuel options as the Performance module.
  const fuelCell = (value: string, onChange: (v: string) => void) => (
    <select className="fv-ce__cell-select" style={{ minWidth: 78 }} value={value} disabled={locked} onChange={(e) => onChange(e.target.value)}>
      {value && !FUEL_TYPE_OPTIONS.includes(value) && <option value={value}>{value}</option>}
      {FUEL_TYPE_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
    </select>
  );
  const kvIn = (label: string, value: number, onChange: (n: number) => void, pct?: boolean) => (
    <li className="fv-ce__kv-line">
      <span>{label}</span>
      <span className="fv-ce__kv-edit">
        <input type="number" value={value} disabled={locked} onChange={(e) => onChange(num(e.target.value))} />
        {pct && <em>%</em>}
      </span>
    </li>
  );
  const kvOut = (label: string, value: string) => (
    <li className="fv-ce__kv-line">
      <span>{label}</span>
      <span className="fv-ce__kv-out">{value}</span>
    </li>
  );

  return (
    <div className="fv-ce">
      {/* Shared option lists sourced from our vessel + world-port data. */}
      <datalist id="fv-ce-ports">{portOptions.map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="fv-ce-vessels">{vesselOptions.map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="fv-ce-accounts">{accountOptions.map((o) => <option key={o} value={o} />)}</datalist>
      {/* ============================ TOP HEADER ============================ */}
      <header className="fv-ce__header">
        <div className="fv-ce__title-block">
          <div className="fv-ce__title-row">
            <i className="fas fa-file-signature fv-ce__title-icon" aria-hidden="true" />
            <h1>Voyage Estimation</h1>
            <span className={`fv-ce__badge fv-ce__badge--${stat.color}`}>{status}</span>
            {fixtureNo && (
              <span className="fv-ce__fixture">
                <i className="fas fa-lock" aria-hidden="true" /> {fixtureNo}
              </span>
            )}
          </div>
          <div className="fv-ce__meta">
            <span><b>Estimation No.</b> {estNo}</span>
            <span><b>Created By</b> {voyage.pic}</span>
            <span><b>Last Modified</b> {lastModified}</span>
            <span><b>Customer</b> {voyage.client}</span>
            <span><b>PIC</b> {voyage.pic}</span>
            <span className="fv-ce__meta-status">
              <b>Fix Type</b>
              <select value={inputs.fixType} disabled={locked} onChange={(e) => patch({ fixType: e.target.value as FixType })}>
                {FIX_TYPES.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </span>
          </div>
        </div>

        <div className="fv-ce__actions">
          <button type="button" className="fv-ce__btn" onClick={newEstimate}><i className="fas fa-plus" /> New</button>
          <button type="button" className="fv-ce__btn" onClick={() => setSnapshots((s) => [...s, { id: uid('sn'), name: `Option ${String.fromCharCode(65 + s.length)}`, result }])}><i className="fas fa-clone" /> Duplicate</button>
          <button type="button" className={`fv-ce__btn${compareOpen ? ' fv-ce__btn--on' : ''}`} onClick={() => setCompareOpen((v) => !v)}><i className="fas fa-scale-balanced" /> Compare</button>
          <button type="button" className="fv-ce__btn fv-ce__btn--primary" onClick={save}><i className="fas fa-floppy-disk" /> Save</button>
          <button type="button" className="fv-ce__btn"><i className="fas fa-file-lines" /> Template</button>
          <button type="button" className="fv-ce__btn"><i className="fas fa-file-pdf" /> PDF</button>
          <button type="button" className="fv-ce__btn fv-ce__btn--amber" onClick={() => changeStatus('On Subs')} disabled={locked}><i className="fas fa-hourglass-half" /> On Subs</button>
          <button type="button" className="fv-ce__btn fv-ce__btn--green" onClick={markFixed} disabled={locked}><i className="fas fa-anchor" /> Mark Fixed</button>
          {status === 'Fixed' && (
            <button type="button" className="fv-ce__btn fv-ce__btn--primary" onClick={reopenEstimate} title="Reopen this fixed estimate to change details"><i className="fas fa-lock-open" /> Reopen</button>
          )}
          <button type="button" className="fv-ce__btn fv-ce__btn--danger" onClick={cancelEstimate}><i className="fas fa-ban" /> Cancel</button>
          {status === 'Fixed' && (
            <button type="button" className={`fv-ce__btn${isSent ? '' : ' fv-ce__btn--primary'}`} onClick={copyToOperations} disabled={isSent} title="Send this fixed voyage to the Operations module">
              <i className={`fas ${isSent ? 'fa-circle-check' : 'fa-share-from-square'}`} /> {isSent ? 'Sent to Operations' : 'Copy to Operations'}
            </button>
          )}
        </div>
      </header>

      {/* ===================== COMPARISON (toggle) ===================== */}
      {compareOpen && (
        <Section
          title="Comparison"
          icon="fa-scale-balanced"
          right={
            <span className="fv-ce__scenario-add">
              <input placeholder="Option name…" value={snapshotName} onChange={(e) => setSnapshotName(e.target.value)} />
              <button type="button" className="fv-ce__chip" onClick={captureSnapshot}><i className="fas fa-camera" /> Capture Current</button>
            </span>
          }
        >
          <div className="fv-ce__tablewrap">
            <table className="fv-ce__compare-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  {compareOptions.map((o) => (
                    <th key={o.id}>
                      {o.name}
                      {o.id !== 'current' && (
                        <button type="button" className="fv-ce__icon-btn" onClick={() => removeSnapshot(o.id)} title="Remove"><i className="fas fa-xmark" /></button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  ['Profit', (r: EstimateResult) => r.profit, (r: EstimateResult) => r.profit === best.profit],
                  ['Revenue', (r: EstimateResult) => r.revenue, () => false],
                  ['Expenses', (r: EstimateResult) => r.totalExpense, (r: EstimateResult) => r.totalExpense === best.cost],
                  ['TCE / Day', (r: EstimateResult) => r.tce, (r: EstimateResult) => r.tce === best.tce],
                  ['Voyage Days', (r: EstimateResult) => r.voyageDays, (r: EstimateResult) => r.voyageDays === best.days],
                  ['Total Hire', (r: EstimateResult) => r.totalHire, () => false],
                  ['Bunker', (r: EstimateResult) => r.bunkerExpense, () => false],
                  ['Profit %', (r: EstimateResult) => r.profitPct, () => false],
                ] as [string, (r: EstimateResult) => number, (r: EstimateResult) => boolean][]).map(([label, get, isBest]) => (
                  <tr key={label}>
                    <td className="fv-ce__compare-metric">{label}</td>
                    {compareOptions.map((o) => (
                      <td key={o.id} className={`fv-ce__r${isBest(o.result) ? ' fv-ce__cell-best' : ''}`}>
                        {label.includes('%') ? `${fmt(get(o.result))}%` : label === 'Voyage Days' ? fmt(get(o.result), 2) : money(get(o.result))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fv-ce__hint">Capture the current estimate as an option, adjust vessel / cargo / speed / freight, then compare. Green cells mark the best profit, lowest cost, highest TCE and fastest voyage.</p>
        </Section>
      )}

      {/* ===================== VESSEL PARTICULAR ===================== */}
      <Section
        title="Vessel Particular"
        icon="fa-ship"
        right={
          <div className="fv-ce__search">
            <i className="fas fa-magnifying-glass" aria-hidden="true" />
            <VesselSearchInput
              value={vessel.name}
              disabled={locked}
              placeholder="Search vessel or IMO…"
              onChange={(name) => setVessel((v) => ({ ...v, name }))}
              onPick={(v) =>
                setVessel((s) => ({
                  ...s,
                  name: v.name,
                  dwt: num(v.deadweight) || s.dwt,
                  draft: num(v.draught) || s.draft,
                  built: num(v.builtYear) || s.built,
                  type: v.vesselType || s.type,
                }))
              }
            />
          </div>
        }
      >
        <div className="fv-ce__vp">
          <div className="fv-ce__tablewrap">
            <table className="fv-ce__table fv-ce__table--vp">
              <thead>
                <tr>
                  <th>MV</th>
                  <th className="fv-ce__r">DWT</th>
                  <th className="fv-ce__r">Draft (M)</th>
                  <th className="fv-ce__r">TPC</th>
                  <th className="fv-ce__r">Built</th>
                  <th>Kind</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{vesselCell(vessel.name, (v) => setVessel((s) => ({ ...s, name: v })), 150)}</td>
                  <td className="fv-ce__r">{numCell(vessel.dwt, (n) => setVessel((s) => ({ ...s, dwt: n })), 80)}</td>
                  <td className="fv-ce__r">{numCell(vessel.draft, (n) => setVessel((s) => ({ ...s, draft: n })), 60)}</td>
                  <td className="fv-ce__r">{numCell(vessel.tpc, (n) => setVessel((s) => ({ ...s, tpc: n })), 56)}</td>
                  <td className="fv-ce__r">{numCell(vessel.built, (n) => setVessel((s) => ({ ...s, built: n })), 60)}</td>
                  <td>{txtCell(vessel.kind, (v) => setVessel((s) => ({ ...s, kind: v })), 70)}</td>
                  <td>
                    <select
                      className="fv-ce__cell-select"
                      value={vessel.type}
                      disabled={locked}
                      onChange={(e) => setVessel((s) => ({ ...s, type: e.target.value }))}
                    >
                      {vessel.type && !VESSEL_TYPES.some((g) => g.types.includes(vessel.type)) && <option value={vessel.type}>{vessel.type}</option>}
                      {VESSEL_TYPES.map((g) => (
                        <optgroup key={g.group} label={g.group}>
                          {g.types.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="fv-ce__vp-speed">
            <div className="fv-ce__vp-modes">
              <label className={`fv-ce__radio${inputs.perf.speedMode === 'Full' ? ' fv-ce__radio--on' : ''}`}>
                <input type="radio" name="speedMode" checked={inputs.perf.speedMode === 'Full'} disabled={locked} onChange={() => setSpeedMode('Full')} /> Full
              </label>
              <label className={`fv-ce__radio${inputs.perf.speedMode === 'Eco' ? ' fv-ce__radio--on' : ''}`}>
                <input type="radio" name="speedMode" checked={inputs.perf.speedMode === 'Eco'} disabled={locked} onChange={() => setSpeedMode('Eco')} /> Eco
              </label>
              {inputs.perf.customs.map((c) => (
                <span key={c.id} className={`fv-ce__radio${inputs.perf.speedMode === c.id ? ' fv-ce__radio--on' : ''}`}>
                  <input type="radio" name="speedMode" checked={inputs.perf.speedMode === c.id} disabled={locked} onChange={() => setSpeedMode(c.id)} />
                  <input className="fv-ce__custom-name" value={c.name} disabled={locked} onChange={(e) => renameCustomSpeed(c.id, e.target.value)} />
                  {!locked && (
                    <button type="button" className="fv-ce__custom-x" title="Remove speed" onClick={() => removeCustomSpeed(c.id)}><i className="fas fa-times" /></button>
                  )}
                </span>
              ))}
              {!locked && (
                <button type="button" className="fv-ce__radio fv-ce__custom-add" title="Add custom speed" onClick={addCustomSpeed}><i className="fas fa-plus" /></button>
              )}
            </div>
            <table className="fv-ce__table fv-ce__table--mini">
              <thead>
                <tr>
                  <th className="fv-ce__r">Ballast</th>
                  <th className="fv-ce__r">Laden</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="fv-ce__r">{numCell(speeds.ballast, (n) => patchActiveSpeed({ ballast: n }), 56)}</td>
                  <td className="fv-ce__r">{numCell(speeds.laden, (n) => patchActiveSpeed({ laden: n }), 56)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="fv-ce__tablewrap">
            <table className="fv-ce__table fv-ce__table--mini">
              <thead>
                <tr>
                  <th>FO</th>
                  <th>Type</th>
                  <th className="fv-ce__r">Ballast</th>
                  <th className="fv-ce__r">Laden</th>
                  <th className="fv-ce__r">Idle</th>
                  <th className="fv-ce__r">Work</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Normal</td>
                  <td>{fuelCell(inputs.perf.mainNormal.type, (v) => patchMain('mainNormal', { type: v }))}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.mainNormal.ballast, (n) => patchMain('mainNormal', { ballast: n }), 56)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.mainNormal.laden, (n) => patchMain('mainNormal', { laden: n }), 56)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.mainNormal.idle, (n) => patchMain('mainNormal', { idle: n }), 50)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.mainNormal.work, (n) => patchMain('mainNormal', { work: n }), 50)}</td>
                </tr>
                <tr>
                  <td>ECA</td>
                  <td>{fuelCell(inputs.perf.mainEca.type, (v) => patchMain('mainEca', { type: v }))}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.mainEca.ballast, (n) => patchMain('mainEca', { ballast: n }), 56)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.mainEca.laden, (n) => patchMain('mainEca', { laden: n }), 56)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.mainEca.idle, (n) => patchMain('mainEca', { idle: n }), 50)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.mainEca.work, (n) => patchMain('mainEca', { work: n }), 50)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="fv-ce__tablewrap">
            <table className="fv-ce__table fv-ce__table--mini">
              <thead>
                <tr>
                  <th>DO</th>
                  <th>Type</th>
                  <th className="fv-ce__r">Sea</th>
                  <th className="fv-ce__r">Idle</th>
                  <th className="fv-ce__r">Work</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Normal</td>
                  <td>{fuelCell(inputs.perf.subNormal.type, (v) => patchSub('subNormal', { type: v }))}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.subNormal.sea, (n) => patchSub('subNormal', { sea: n }), 50)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.subNormal.idle, (n) => patchSub('subNormal', { idle: n }), 50)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.subNormal.work, (n) => patchSub('subNormal', { work: n }), 50)}</td>
                </tr>
                <tr>
                  <td>ECA</td>
                  <td>{fuelCell(inputs.perf.subEca.type, (v) => patchSub('subEca', { type: v }))}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.subEca.sea, (n) => patchSub('subEca', { sea: n }), 50)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.subEca.idle, (n) => patchSub('subEca', { idle: n }), 50)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.subEca.work, (n) => patchSub('subEca', { work: n }), 50)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* ===================== CARGO (voyage-out fixtures only) ===================== */}
      {fix.outKind === 'VOUT' && (
      <Section
        title="Cargo"
        icon="fa-boxes-stacked"
        right={
          <div className="fv-ce__port-head">
            <button type="button" className="fv-ce__chip"><i className="fas fa-calculator" /> Loadable Quantity Calculator</button>
            <button type="button" className="fv-ce__chip"><i className="fas fa-chart-simple" /> Frt. Simulator</button>
            <button type="button" className="fv-ce__chip" onClick={addCargo} disabled={locked}><i className="fas fa-plus" /> Add Cargo</button>
          </div>
        }
      >
        <div className="fv-ce__tablewrap">
          <table className="fv-ce__table">
            <thead>
              <tr>
                <th className="fv-ce__num">#</th>
                <th>Account</th>
                <th>Cargo Name</th>
                <th>Loading Port</th>
                <th>Discharging Port</th>
                <th className="fv-ce__r">Quantity</th>
                <th className="fv-ce__r">Frt</th>
                <th>Term</th>
                <th className="fv-ce__r">Total Freight</th>
                <th className="fv-ce__r">A. Comm</th>
                <th className="fv-ce__r">Brkg</th>
                <th className="fv-ce__r">Frt Tax</th>
                <th className="fv-ce__r">Liner Term</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {inputs.cargoes.map((c, idx) => (
                <tr key={c.id}>
                  <td className="fv-ce__num">{idx + 1}</td>
                  <td>{accountCell(c.account, (v) => updateCargo(c.id, { account: v }), 90)}</td>
                  <td>{txtCell(c.name, (v) => updateCargo(c.id, { name: v }), 100)}</td>
                  <td>{portCell(c.loadPort, (v) => updateCargo(c.id, { loadPort: v }), 150)}</td>
                  <td>{portCell(c.dischPort, (v) => updateCargo(c.id, { dischPort: v }), 150)}</td>
                  <td className="fv-ce__r fv-ce__qty">{numCell(c.quantity, (n) => updateCargo(c.id, { quantity: n }), 76)}<span className="fv-ce__unit">{c.unit}</span></td>
                  <td className="fv-ce__r">{numCell(c.frt, (n) => updateCargo(c.id, { frt: n }), 56)}</td>
                  <td>{txtCell(c.term, (v) => updateCargo(c.id, { term: v }), 54)}</td>
                  <td className="fv-ce__r fv-ce__calc">{fmt(c.quantity * c.frt)}</td>
                  <td className="fv-ce__r">{numCell(c.aCommPct, (n) => updateCargo(c.id, { aCommPct: n }), 54)}<span className="fv-ce__unit">%</span></td>
                  <td className="fv-ce__r">{numCell(c.brkgPct, (n) => updateCargo(c.id, { brkgPct: n }), 52)}<span className="fv-ce__unit">%</span></td>
                  <td className="fv-ce__r">{numCell(c.frtTaxPct, (n) => updateCargo(c.id, { frtTaxPct: n }), 52)}<span className="fv-ce__unit">%</span></td>
                  <td className="fv-ce__r">{numCell(c.linerTerm, (n) => updateCargo(c.id, { linerTerm: n }), 66)}</td>
                  <td>
                    {inputs.cargoes.length > 1 && (
                      <button type="button" className="fv-ce__icon-btn" onClick={() => removeCargo(c.id)} disabled={locked} title="Remove cargo">
                        <i className="fas fa-xmark" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="fv-ce__total">
                <td colSpan={5}>Total</td>
                <td className="fv-ce__r">{fmt(cargoTotals.qty)}</td>
                <td className="fv-ce__r">{fmt(cargoTotals.frtAvg)}</td>
                <td />
                <td className="fv-ce__r">{fmt(cargoTotals.tf)}</td>
                <td className="fv-ce__r">{fmt(cargoTotals.tf > 0 ? (result.addComm / cargoTotals.tf) * 100 : 0)} %</td>
                <td className="fv-ce__r">{fmt(cargoTotals.tf > 0 ? (result.brokerage / cargoTotals.tf) * 100 : 0)} %</td>
                <td className="fv-ce__r">{fmt(cargoTotals.tf > 0 ? (result.freightTax / cargoTotals.tf) * 100 : 0)} %</td>
                <td className="fv-ce__r">{fmt(result.linerTermTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>
      )}

      {/* ===================== PORT ROTATION ===================== */}
      <Section
        title="Port Rotation"
        icon="fa-route"
        right={
          <div className="fv-ce__port-head">
            <label className="fv-ce__check"><input type="checkbox" checked={inputs.canals.suez} disabled={locked} onChange={(e) => patch({ canals: { ...inputs.canals, suez: e.target.checked } })} /> SUEZ</label>
            <label className="fv-ce__check"><input type="checkbox" checked={inputs.canals.panama} disabled={locked} onChange={(e) => patch({ canals: { ...inputs.canals, panama: e.target.checked } })} /> PANAMA</label>
            <label className="fv-ce__check"><input type="checkbox" checked={inputs.canals.kiel} disabled={locked} onChange={(e) => patch({ canals: { ...inputs.canals, kiel: e.target.checked } })} /> KIEL</label>
            <button type="button" className="fv-ce__chip" onClick={addPort} disabled={locked}><i className="fas fa-plus" /> Add Port</button>
          </div>
        }
      >
        <div className="fv-ce__port-summary">
          Total Duration: {fmt(result.voyageDays, 2)} Days (Ballast: {fmt(result.ballastDays, 2)}, Laden: {fmt(result.ladenDays, 2)}, ECA: {fmt(result.ecaDays, 2)}, Port: {fmt(result.portDays, 2)}) · (Port local time) {result.startStr} ~ {result.endStr}
          {activeCanals && <> · Canals: {activeCanals}</>}
        </div>
        <div className="fv-ce__tablewrap">
          <table className="fv-ce__table">
            <thead>
              <tr>
                <th className="fv-ce__num">#</th>
                <th>Type</th>
                <th>Port Name or Coordinates</th>
                <th className="fv-ce__r" colSpan={2}>Distance / ECA</th>
                <th className="fv-ce__r">W.F</th>
                <th className="fv-ce__r">Spd</th>
                <th className="fv-ce__r">Sea</th>
                <th className="fv-ce__r">L / D Rate</th>
                <th className="fv-ce__r" colSpan={2}>Port (I / W)</th>
                <th className="fv-ce__r">Dem</th>
                <th className="fv-ce__r">Des</th>
                <th className="fv-ce__r">Port Charge</th>
                <th>Arrival</th>
                <th>Departure</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {inputs.ports.map((p, idx) => {
                const leg = result.perLeg[idx];
                const manualSea = p.distance <= 0; // buffer legs enter sea days manually
                return (
                  <tr key={p.id}>
                    <td className="fv-ce__num">{idx + 1}</td>
                    <td>
                      <select className="fv-ce__cell-select" value={p.type} disabled={locked} onChange={(e) => updatePort(p.id, { type: e.target.value as LegType })}>
                        {LEG_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{portCell(p.port, (v) => updatePort(p.id, { port: v }))}</td>
                    <td className="fv-ce__r">{numCell(p.distance, (n) => updatePort(p.id, { distance: n }), 60)}</td>
                    <td className="fv-ce__r">{numCell(p.ecaDistance, (n) => updatePort(p.id, { ecaDistance: n }), 50)}</td>
                    <td className="fv-ce__r">{numCell(p.wf, (n) => updatePort(p.id, { wf: n }), 44)}</td>
                    <td className="fv-ce__r">{numCell(p.speed, (n) => updatePort(p.id, { speed: n }), 48)}</td>
                    <td className="fv-ce__r">{manualSea ? numCell(p.seaManual, (n) => updatePort(p.id, { seaManual: n }), 48) : <span className="fv-ce__calc">{leg ? fmt(leg.sea, 2) : '—'}</span>}</td>
                    <td className="fv-ce__r">{numCell(p.ldRate, (n) => updatePort(p.id, { ldRate: n }), 74)}</td>
                    <td className="fv-ce__r">{numCell(p.idle, (n) => updatePort(p.id, { idle: n }), 44)}</td>
                    <td className="fv-ce__r">{numCell(p.work, (n) => updatePort(p.id, { work: n }), 44)}</td>
                    <td className="fv-ce__r">{numCell(p.dem, (n) => updatePort(p.id, { dem: n }))}</td>
                    <td className="fv-ce__r">{numCell(p.des, (n) => updatePort(p.id, { des: n }))}</td>
                    <td className="fv-ce__r">{numCell(p.portCharge, (n) => updatePort(p.id, { portCharge: n }), 80)}</td>
                    <td className="fv-ce__calc">{leg?.arrival ?? '—'}</td>
                    <td className="fv-ce__calc">{leg?.departure ?? '—'}</td>
                    <td>
                      <span className="fv-ce__row-actions">
                        <button type="button" className="fv-ce__icon-btn" onClick={() => movePort(p.id, -1)} disabled={locked || idx === 0} title="Move up">
                          <i className="fas fa-chevron-up" />
                        </button>
                        <button type="button" className="fv-ce__icon-btn" onClick={() => movePort(p.id, 1)} disabled={locked || idx === inputs.ports.length - 1} title="Move down">
                          <i className="fas fa-chevron-down" />
                        </button>
                        {inputs.ports.length > 1 && (
                          <button type="button" className="fv-ce__icon-btn" onClick={() => removePort(p.id)} disabled={locked} title="Remove leg">
                            <i className="fas fa-xmark" />
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="fv-ce__total">
                <td colSpan={3}>Total</td>
                <td className="fv-ce__r">{fmt(result.distanceTotal, 0)}</td>
                <td className="fv-ce__r">{fmt(result.ecaDistanceTotal, 0)}</td>
                <td colSpan={2} />
                <td className="fv-ce__r">{fmt(result.seaDays, 2)}</td>
                <td />
                <td className="fv-ce__r">{fmt(result.idleTotal, 2)}</td>
                <td className="fv-ce__r">{fmt(result.workTotal, 2)}</td>
                <td className="fv-ce__r">{fmt(result.demTotal)}</td>
                <td className="fv-ce__r">{fmt(result.desTotal)}</td>
                <td className="fv-ce__r">{fmt(result.portCharge)}</td>
                <td>{result.startStr}</td>
                <td>{result.endStr}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="fv-ce__port-foot">
          <button type="button" className="fv-ce__chip">Get Distance (F9)</button>
          <button type="button" className="fv-ce__chip">To Distance (F10)</button>
          <button type="button" className="fv-ce__chip">To Operation</button>
          <span className="fv-ce__port-foot-right">
            <span className="fv-ce__chip fv-ce__chip--on">Port Local</span>
            <span className="fv-ce__chip">PC Time</span>
          </span>
        </div>
      </Section>

      {/* ============= OPERATION EXPENSE | BUNKER EXPENSE | RESULT ============= */}
      <div className="fv-ce__panels3">
        {weOperate ? (
        <>
        {/* Operation Expense */}
        <Section title="Operation Expense" icon="fa-file-invoice-dollar">
          <div className="fv-ce__kv2">
            <ul className="fv-ce__kv-list">
              {kvOut('Dem / Des', money(result.demDes))}
              {kvOut('Add Comm.', money(result.addComm))}
              {kvOut('Brokerage', money(result.brokerage))}
              {kvOut('Freight Tax', money(result.freightTax))}
              {kvIn('Liner Terms', inputs.commercial.linerTerms, (n) => patchComm({ linerTerms: n }))}
              {kvOut('Port Charge', money(result.portCharge))}
            </ul>
            <ul className="fv-ce__kv-list">
              {kvOut('Bunker Expense', money(result.bunkerExpense))}
              {kvIn('C.E.V.', inputs.commercial.cev, (n) => patchComm({ cev: n }))}
              {kvIn('ILOHC', inputs.commercial.ilohc, (n) => patchComm({ ilohc: n }))}
              {kvIn('Ballast Bonus', inputs.commercial.ballastBonus, (n) => patchComm({ ballastBonus: n }))}
              {kvIn('Routing Service', inputs.commercial.routingService, (n) => patchComm({ routingService: n }))}
              {kvIn('Others', inputs.commercial.others, (n) => patchComm({ others: n }))}
            </ul>
          </div>
          <div className="fv-ce__kv-line fv-ce__kv-line--sub">
            <span>Total Operation Expense</span>
            <span className="fv-ce__kv-out">{money(result.opExpense)}</span>
          </div>
        </Section>

        {/* Bunker Expense */}
        <Section
          title="Bunker Expense"
          icon="fa-gas-pump"
          right={
            <div className="fv-ce__port-head">
              <span className="fv-ce__chip fv-ce__chip--on"><i className="fas fa-list" /> Bunker Index</span>
              <span className="fv-ce__chip">Recent</span>
              <span className="fv-ce__chip"><i className="fas fa-gas-pump" /> Bunker Simulator</span>
            </div>
          }
        >
          <div className="fv-ce__tablewrap">
            <table className="fv-ce__table">
              <thead>
                <tr>
                  <th>Grade</th>
                  <th className="fv-ce__r">Price / MT</th>
                  <th className="fv-ce__r">Consumption</th>
                  <th className="fv-ce__r">Expense</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>VLSFO</td>
                  <td className="fv-ce__r">{numCell(inputs.commercial.vlsfoPrice, (n) => patchComm({ vlsfoPrice: n }), 70)}</td>
                  <td className="fv-ce__r fv-ce__calc">{fmt(result.vlsfoCons)}</td>
                  <td className="fv-ce__r fv-ce__calc">{fmt(result.vlsfoExp)}</td>
                </tr>
                <tr>
                  <td>MGO</td>
                  <td className="fv-ce__r">{numCell(inputs.commercial.mgoPrice, (n) => patchComm({ mgoPrice: n }), 70)}</td>
                  <td className="fv-ce__r fv-ce__calc">{fmt(result.mgoCons)}</td>
                  <td className="fv-ce__r fv-ce__calc">{fmt(result.mgoExp)}</td>
                </tr>
                <tr>
                  <td>ULSFO</td>
                  <td className="fv-ce__r">{numCell(inputs.commercial.ulsfoPrice, (n) => patchComm({ ulsfoPrice: n }), 70)}</td>
                  <td className="fv-ce__r fv-ce__calc">{fmt(result.ulsfoCons)}</td>
                  <td className="fv-ce__r fv-ce__calc">{fmt(result.ulsfoExp)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="fv-ce__total">
                  <td colSpan={3}>Total Bunker Expense</td>
                  <td className="fv-ce__r">{fmt(result.bunkerExpense)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Section>
        </>
        ) : isRelet ? (
        <Section title="Relet — Freight In & Voyage Expenses" icon="fa-arrows-left-right">
          <div className="fv-ce__kv2">
            <ul className="fv-ce__kv-list">
              {kvIn('Freight In (Lumpsum)', inputs.commercial.freightIn, (n) => patchComm({ freightIn: n }))}
              {kvOut('Freight Out', money(result.freight))}
              {kvOut('Add Comm.', money(result.addComm))}
              {kvOut('Brokerage', money(result.brokerage))}
            </ul>
            <ul className="fv-ce__kv-list">
              {kvOut('Dem / Des', money(result.demDes))}
              {kvIn('C.E.V.', inputs.commercial.cev, (n) => patchComm({ cev: n }))}
              {kvIn('Routing Service', inputs.commercial.routingService, (n) => patchComm({ routingService: n }))}
              {kvIn('Others', inputs.commercial.others, (n) => patchComm({ others: n }))}
            </ul>
          </div>
          <div className="fv-ce__kv-line fv-ce__kv-line--sub">
            <span>Total Operation Expense</span>
            <span className="fv-ce__kv-out">{money(result.opExpense)}</span>
          </div>
          <p className="fv-ce__hint">Relet: freight received (out) less freight paid to the sub-carrier (in) and commissions. No bunkers or port disbursements — the performing carrier bears them.</p>
        </Section>
        ) : (
        <Section title="Hire & Bunker (BOD / BOR)" icon="fa-gas-pump">
          <div className="fv-ce__kv2">
            <ul className="fv-ce__kv-list">
              {kvIn('BOD Qty (MT)', inputs.commercial.bodQty, (n) => patchComm({ bodQty: n }))}
              {kvIn('BOD Price', inputs.commercial.bodPrice, (n) => patchComm({ bodPrice: n }))}
              {kvOut('Bunker on Delivery', money(result.bodValue))}
            </ul>
            <ul className="fv-ce__kv-list">
              {kvIn('BOR Qty (MT)', inputs.commercial.borQty, (n) => patchComm({ borQty: n }))}
              {kvIn('BOR Price', inputs.commercial.borPrice, (n) => patchComm({ borPrice: n }))}
              {kvOut('Bunker on Redelivery', money(result.borValue))}
            </ul>
          </div>
          <div className="fv-ce__kv-line fv-ce__kv-line--sub">
            <span>Net Bunker (BOD − BOR)</span>
            <span className="fv-ce__kv-out">{money(result.bunkerAdj)}</span>
          </div>
          <ul className="fv-ce__kv-list">
            {kvIn('C.E.V.', inputs.commercial.cev, (n) => patchComm({ cev: n }))}
            {kvIn('ILOHC', inputs.commercial.ilohc, (n) => patchComm({ ilohc: n }))}
            {kvIn('Ballast Bonus', inputs.commercial.ballastBonus, (n) => patchComm({ ballastBonus: n }))}
            {kvIn('Others', inputs.commercial.others, (n) => patchComm({ others: n }))}
          </ul>
          <div className="fv-ce__kv-line fv-ce__kv-line--sub">
            <span>Total Operation Expense</span>
            <span className="fv-ce__kv-out">{money(result.opExpense)}</span>
          </div>
        </Section>
        )}

        {/* Result */}
        <Section
          title="Result"
          icon="fa-chart-line"
          right={
            <div className="fv-ce__port-head">
              {fix.outKind === 'VOUT' && (
                <button
                  type="button"
                  className={`fv-ce__chip${linkHF ? ' fv-ce__chip--on' : ''}`}
                  onClick={() => setLinkHF((v) => !v)}
                  title="Link freight rate and daily hire at break-even. Editing one re-solves the other."
                >
                  <i className={`fas ${linkHF ? 'fa-link' : 'fa-link-slash'}`} /> Frt ⇄ Hire
                </button>
              )}
              <span className="fv-ce__chip"><i className="fas fa-plus" /> Result Plus</span>
              <span className="fv-ce__chip"><i className="fas fa-chart-line" /> Analyzer</span>
              <span className="fv-ce__chip"><i className="fas fa-note-sticky" /> Remark</span>
            </div>
          }
        >
          <div className="fv-ce__kv2">
            <ul className="fv-ce__kv-list">
              {isRelet
                ? kvIn('Freight In (Lumpsum)', inputs.commercial.freightIn, (n) => patchComm({ freightIn: n }))
                : fix.inKind === 'OWN'
                  ? kvIn('Owner Cost / Day', inputs.commercial.ownDailyCost, (n) => patchComm({ ownDailyCost: n }))
                  : kvIn(`Hire In / Day (${fix.inKind})`, inputs.commercial.dailyHire, fix.outKind === 'VOUT' ? updateDailyHire : (n) => patchComm({ dailyHire: n }))}
              {isTC(fix.inKind) && kvIn('H.In Add Comm.', inputs.commercial.hAddCommPct, (n) => patchComm({ hAddCommPct: n }), true)}
              {fix.outKind !== 'VOUT' && kvIn(`Hire Out / Day (${fix.outKind})`, inputs.commercial.dailyHireOut, (n) => patchComm({ dailyHireOut: n }))}
              {fix.outKind !== 'VOUT' && kvIn('H.Out Add Comm.', inputs.commercial.hAddCommOutPct, (n) => patchComm({ hAddCommOutPct: n }), true)}
              {kvOut(isRelet ? 'Freight In' : 'Net Hire', money(result.totalHire))}
              {kvOut('C / Base (TCE)', money(result.tce))}
            </ul>
            <ul className="fv-ce__kv-list">
              {kvOut(fix.outKind === 'VOUT' ? 'Revenue (Freight)' : 'Revenue (Hire Out)', money(result.revenue))}
              {kvOut('Op. Expense', money(result.opExpense))}
              <li className="fv-ce__kv-line fv-ce__kv-line--sub"><span>Op. Profit</span><span className="fv-ce__kv-out">{money(result.opProfit)}</span></li>
              {kvOut('Total Hire', money(result.totalHire))}
              {kvOut('Total Expense', money(result.totalExpense))}
            </ul>
          </div>
          <div className={`fv-ce__kv-line fv-ce__kv-line--profit${result.profit < 0 ? ' fv-ce__kv-line--loss' : ''}`}>
            <span>PROFIT (USD)</span>
            <span className="fv-ce__kv-out">{money(result.profit)} · {fmt(result.profitPct)}%</span>
          </div>
        </Section>
      </div>
    </div>
  );
}
