import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useSelectedVoyage } from '../data/selectedVoyage';
import type { Voyage } from '../data/voyages';
import { makeBlankVoyage } from '../data/voyages';
import { addNotification, copyLaytimeToPostfix, useCpdds, useFixtureNumbers } from '../data/workflow';
import { loadClients, saveClients, SERVICE_PROVIDER_TYPES } from '../data/clients';
import { loadVessels, saveVessels } from '../data/vessels';
import { NoVesselSelected } from './NoVesselSelected';
import { WorkflowStatusSelect } from './WorkflowStatusSelect';
import { FIX_TYPE_FILTER_OPTIONS } from './ChateringEstimationPage';

/**
 * Operations module — the voyage-operations workspace for a fixed vessel.
 *
 * Layout: a recap header (voyage basics, populated from the fixture recap /
 * charter party), a tab bar (Live P&L · ETA & ROBs · Stowage · Hire Payments
 * · Freight & Laytime · Cost Comparisons · Vessel Reports) and a right-hand
 * icon rail giving anytime access to voyage documents, tasks & reminders and
 * alerts, plus an upload dock for the Terms Recap, Charter Party, SOF, NOR etc.
 *
 * Everything derives live from the recap so the Live P&L updates as figures
 * are edited or documents are parsed.
 */

/* ------------------------------------------------------------------ types */

type TabId = 'details' | 'pnl' | 'etarob' | 'stowage' | 'hire' | 'freight' | 'costs' | 'reports';

interface Recap {
  vesselName: string;
  vesselEmail: string;
  voyageFixType: string;
  owners: string;
  cpDate: string;
  laycanStart: string;
  laycanEnd: string;
  ownersBroker: string;
  hirePerDay: string;
  charterers: string;
  charterersCpDate: string;
  charterersLaycanStart: string;
  charterersLaycanEnd: string;
  charterersBroker: string;
  freightPerMt: string;
  demDespatch: string;
  despatchTerm: string;
  deliveryPort: string;
  deliveryTerm: string;
  deliveryDateTime: string;
  redeliveryPort: string;
  redeliveryTerm: string;
  redeliveryDateTime: string;
  deliveryNotices: string;
  wxClause: string;
  ilohc: string;
  cve: string;
  adcom: string;
  brokerage: string;
  ballastBonus: string;
  redeliveryNotices: string;
  hullCleaningClause: string;
  cargoName: string;
  cpQuantity: string;
  holdCleaning: string;
  finalQtyLoaded: string;
  loadPort: string;
  norAtLoadPort: string;
  loadRate: string;
  pdaLoadPort: string;
  frtPaymentTerms: string;
  dischargePort: string;
  norAtDPort: string;
  dischRate: string;
  pdaDPort: string;
  freeDa: string;
  loiOblDPort: string;
  // extra operating figures used by the P&L
  foCons: string;
  foPrice: string;
  doCons: string;
  doPrice: string;
  portDaLoad: string;
  portDaDisch: string;
  otherCost: string;
  miscIncome: string;
  // --- units (redesigned Voyage Details) ---------------------------------
  hireCurrency: string;
  freightCurrency: string;
  cargoQtyUnit: string;
  // --- hire payment schedule ---------------------------------------------
  firstHirePeriodDays: string;
  firstHireDays: string;
  firstHireBasis: string;
  hireEveryDays: string;
  // --- hire payment workflow (per installment: status + ballast + off-hire) -----
  hirePayState: Record<string, HirePayEntry>;
  // --- freight payment ----------------------------------------------------
  freightPaymentDays: string;
  freightPaymentBasis: string;
  // --- service providers selected for this voyage ------------------------
  serviceProviders: { type: string; name: string; email: string }[];
  // --- bunkering figures (per fuel grade) --------------------------------
  bunkerSpecs: string;
  bunkers: BunkerFuel[];
  // --- Live P&L per-line status notes (keyed by line label) ---------------
  pnlNotes: Record<string, string>;
  // --- ETA & ROB voyage plan (itinerary legs + instructed speed/cons) -----
  etaPlan: EtaPlan;
  // --- Cargo & stowage — DWT / cargo-intake by zone / port ----------------
  stowage: StowagePlan;
}

/** One deadweight/cargo-intake calculation column (a port or load-line zone). */
interface StowagePoint {
  name: string;
  displacement: string;
  density: string;
  vlsfo: string;
  mgo: string;
  bw: string;
  fw: string;
  constants: string;
}
interface StowagePlan {
  lightship: string;
  autoBunker: boolean;
  points: StowagePoint[];
  holds: StowageHold[];
  draft: StowageDraft;
  grades: StowageGrade[];
  ports: StowagePort[];
}

/** A cargo hold for the hold-wise distribution diagram + capacity limits. */
interface StowageHold {
  name: string;
  cargo: string;
  qty: string;
  capacity: string;
  grainCap: string;
  baleCap: string;
  tankTopArea: string;
  tankTopMax: string;
}

/** A cargo grade with its stowage factor. */
interface StowageGrade {
  grade: string;
  sf: string;
  qty: string;
}

/** A port with its draft restriction and water density. */
interface StowagePort {
  name: string;
  maxDraft: string;
  density: string;
  remarks: string;
}

/** Density-correction / change-in-draft calculation at the loading berth. */
interface StowageDraft {
  tpc: string;
  densityFrom: string;
  densityTo: string;
  draftCurrent: string;
  dispSW: string;
  vlsfo: string;
  mgo: string;
  bw: string;
  fw: string;
  constants: string;
  shipSurveyQty: string;
  shoreScaleQty: string;
}

/** One itinerary leg (a sea passage or a port stay) in the ETA & ROB plan. */
interface EtaLeg {
  from: string;
  to: string;
  kind: 'sea' | 'port';
  distNonEca: string;
  distEca: string;
  speed: string;
  wf: string;
  portDays: string;
  consVlsfo: string;
  consMgo: string;
  supVlsfo: string;
  supMgo: string;
  tz: string;
}

/** ETA & ROB plan header (instructed figures) + the leg list. */
interface EtaPlan {
  startDep: string;
  startRobVlsfo: string;
  startRobMgo: string;
  weatherMargin: string;
  perf: EtaPerf;
  legs: EtaLeg[];
}

/** Speed & consumption profile — mirrors the Chartering estimation vessel details. */
interface EtaMainCons { type: string; ballast: string; laden: string; idle: string; work: string }
interface EtaSubCons { type: string; sea: string; idle: string; work: string }
interface EtaSpeedSet { ballast: string; laden: string }
interface EtaCustomSpeed extends EtaSpeedSet { id: string; name: string }
interface EtaPerf {
  speedMode: string;
  full: EtaSpeedSet;
  eco: EtaSpeedSet;
  customs: EtaCustomSpeed[];
  mainNormal: EtaMainCons;
  mainEca: EtaMainCons;
  subNormal: EtaSubCons;
  subEca: EtaSubCons;
}

/** Per-fuel bunkering figures shown in the Voyage Details Bunkers card. */
interface BunkerFuel {
  fuel: string;
  bod: string;
  expBor: string;
  cpPrice: string;
  bookedPrice: string;
  masterReq: string;
  actualSupply: string;
  actualBor: string;
}

/** Recap keys whose value is a plain string (everything except arrays). */
type RecapTextKey = Exclude<keyof Recap, 'serviceProviders' | 'bunkers' | 'pnlNotes' | 'etaPlan' | 'stowage' | 'hirePayState'>;

interface DocItem {
  id: string;
  name: string;
  category: string;
  size: string;
  at: string;
}
interface Task {
  id: string;
  text: string;
  due: string;
  done: boolean;
}
interface Alert {
  id: string;
  text: string;
  level: 'info' | 'warn' | 'alert';
}

/* ---------------------------------------------------------------- helpers */

function num(v: string): number {
  const n = parseFloat(String(v).replace(/[,$%]/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function fmt(n: number, dp = 1): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function money(n: number): string {
  return `${n < 0 ? '-' : ''}$${fmt(Math.abs(n), 0)}`;
}
function uid(p: string): string {
  return `${p}-${Math.random().toString(36).slice(2, 8)}`;
}
/** Parse "dd-mm-yyyy hh:mm" (recap format) into a Date. */
function parseDMY(s: string): Date | null {
  const m = s.match(/(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0));
}
function daysBetween(a: Date | null, b: Date | null): number {
  if (!a || !b) return 0;
  return Math.max(0, (b.getTime() - a.getTime()) / 86_400_000);
}

/* --------------------------------------------------------- seed the recap */

/** Split a multi-port field ("PARADIP + HALDIA") into individual ports. */
function splitPorts(s: string): string[] {
  return (s || '').split(/[+,/&]|\band\b/i).map((x) => x.trim()).filter(Boolean);
}

/** Build itinerary legs from the voyage port rotation (delivery → load → disch → redelivery). */
function buildItineraryLegs(
  delivery: string, load: string, disch: string, redelivery: string,
  d: { speed: string; wf: string; seaV: string; seaM: string; portV: string; portM: string; tz: string },
): EtaLeg[] {
  const sea = (from: string, to: string): EtaLeg => ({ from, to, kind: 'sea', distNonEca: '0', distEca: '0', speed: d.speed, wf: d.wf, portDays: '', consVlsfo: d.seaV, consMgo: d.seaM, supVlsfo: '', supMgo: '', tz: d.tz });
  const port = (p: string): EtaLeg => ({ from: p, to: p, kind: 'port', distNonEca: '0', distEca: '0', speed: '', wf: '', portDays: '1', consVlsfo: d.portV, consMgo: d.portM, supVlsfo: '', supMgo: '', tz: d.tz });
  const loadPorts = splitPorts(load);
  const dischPorts = splitPorts(disch);
  const firstLoad = loadPorts[0] || load || delivery;
  const legs: EtaLeg[] = [];
  legs.push(sea(`Delivery — ${delivery || firstLoad}`, firstLoad));
  loadPorts.forEach((lp, idx) => {
    if (idx > 0) legs.push(sea(loadPorts[idx - 1], lp));
    legs.push(port(lp));
  });
  let prev = loadPorts[loadPorts.length - 1] || firstLoad;
  dischPorts.forEach((dp) => {
    legs.push(sea(prev, dp));
    legs.push(port(dp));
    prev = dp;
  });
  legs.push(sea(prev, `Redelivery — ${redelivery || prev}`));
  return legs;
}

/** Resolve the active speed set from the selected speed mode (Full / Eco / custom). */
function resolveEtaSpeed(perf: EtaPerf): EtaSpeedSet {
  if (perf.speedMode === 'Full') return perf.full;
  if (perf.speedMode === 'Eco') return perf.eco;
  return perf.customs.find((c) => c.id === perf.speedMode) ?? perf.full;
}

/** Per-leg defaults derived from the instructed speed & consumption profile. */
function legDefaults(perf: EtaPerf): { speed: string; seaV: string; seaM: string; portV: string; portM: string } {
  const spd = resolveEtaSpeed(perf);
  return {
    speed: spd.laden || spd.ballast || '12',
    seaV: perf.mainNormal.laden || '0',
    seaM: perf.subNormal.sea || '0',
    portV: perf.mainNormal.idle || '0',
    portM: perf.subNormal.idle || '0',
  };
}

interface EtaComputedLeg { dep: Date | null; arr: Date | null; arrLt: Date | null; dist: number; avgSpeed: number; days: number; usedV: number; usedM: number; robV: number; robM: number }

/** Sequential ETA/ROB projection: DEP = previous ARR; ROB carried forward per leg. */
function projectEtaLegs(plan: EtaPlan): EtaComputedLeg[] {
  let cursor = parseDMY(plan.startDep);
  let robV = num(plan.startRobVlsfo);
  let robM = num(plan.startRobMgo);
  return plan.legs.map((l) => {
    const dep = cursor;
    const dist = num(l.distNonEca) + num(l.distEca);
    // Average (effective) speed = ordered speed reduced by the leg weather margin.
    const avgSpeed = l.kind === 'sea' ? num(l.speed) * (1 - num(l.wf) / 100) : 0;
    let days = 0;
    if (l.kind === 'sea') {
      const eff = Math.max(0.1, avgSpeed);
      days = dist > 0 ? dist / (eff * 24) : 0;
    } else {
      days = num(l.portDays);
    }
    const arr = dep ? new Date(dep.getTime() + days * 86_400_000) : null;
    const tzH = parseFloat(l.tz) || 0;
    const arrLt = arr ? new Date(arr.getTime() + tzH * 3_600_000) : null;
    const usedV = num(l.consVlsfo) * days;
    const usedM = num(l.consMgo) * days;
    robV = robV - usedV + num(l.supVlsfo);
    robM = robM - usedM + num(l.supMgo);
    cursor = arr;
    return { dep, arr, arrLt, dist, avgSpeed, days, usedV, usedM, robV, robM };
  });
}

/** Final projected ROB at the end of the itinerary (VLSFO / LSMGO). */
function etaEndRob(plan: EtaPlan): { v: number; m: number } {
  const rows = projectEtaLegs(plan);
  const last = rows[rows.length - 1];
  return { v: last ? last.robV : num(plan.startRobVlsfo), m: last ? last.robM : num(plan.startRobMgo) };
}

function seedRecap(voyage: Voyage | undefined): Recap {
  return {
    vesselName: voyage?.vessel || 'AP JADRAN',
    vesselEmail: '',
    voyageFixType: 'TCTIN-VOUT',
    owners: 'ATLANTSKA',
    cpDate: '05-07-2025',
    laycanStart: '09-07-2025',
    laycanEnd: '12-07-2025',
    ownersBroker: 'OFE',
    hirePerDay: '10,100.00',
    charterers: 'PARAG GLOBAL',
    charterersCpDate: '05-07-2025',
    charterersLaycanStart: '08-07-2025',
    charterersLaycanEnd: '12-07-2025',
    charterersBroker: 'ATPI',
    freightPerMt: '6.65',
    demDespatch: '13,500.00',
    despatchTerm: 'Half Despatch WTS',
    deliveryPort: 'SALALAH',
    deliveryTerm: 'AFSPS',
    deliveryDateTime: '11-07-2025 15:00',
    redeliveryPort: 'HALDIA',
    redeliveryTerm: 'DLOSP',
    redeliveryDateTime: '05-08-2025 11:18',
    deliveryNotices: '10-7-5-3-2-1',
    wxClause: '',
    ilohc: '5,000.00',
    cve: '1,500.00',
    adcom: '3.75%',
    brokerage: '1.25% BY OWNERS',
    ballastBonus: '0',
    redeliveryNotices: '30-15-10-7-5-3-2-1',
    hullCleaningClause: '20 DAYS',
    cargoName: 'GYPSUM / LIMESTONE',
    cpQuantity: '75000 / 10%',
    holdCleaning: 'OWNERS - AP',
    finalQtyLoaded: '76214',
    loadPort: 'SALALAH',
    norAtLoadPort: 'ATDNSHINC',
    loadRate: '17000 SHINC',
    pdaLoadPort: '',
    frtPaymentTerms: '3 B.DAYS',
    dischargePort: 'PARADIP + HALDIA',
    norAtDPort: 'ATDNSHINC',
    dischRate: '17000 SHINC',
    pdaDPort: 'FREE DA',
    freeDa: '',
    loiOblDPort: '',
    foCons: '155',
    foPrice: '560',
    doCons: '6',
    doPrice: '800',
    portDaLoad: '48,000',
    portDaDisch: '86,000',
    otherCost: '12,000',
    miscIncome: '0',
    hireCurrency: 'USD',
    freightCurrency: 'USD',
    cargoQtyUnit: 'MT',
    firstHirePeriodDays: '15',
    firstHireDays: '3',
    firstHireBasis: 'Banking Days',
    hireEveryDays: '15',
    hirePayState: {},
    freightPaymentDays: '3',
    freightPaymentBasis: 'Banking Days',
    serviceProviders: [],
    bunkerSpecs: 'VLSFO max 0.50% S · MGO max 0.10% S',
    bunkers: [
      { fuel: 'VLSFO', bod: '351.00', expBor: '351.00', cpPrice: '550.00', bookedPrice: '0.00', masterReq: '895.00', actualSupply: '478.75', actualBor: '' },
      { fuel: 'ULSFO', bod: '', expBor: '', cpPrice: '', bookedPrice: '', masterReq: '', actualSupply: '', actualBor: '' },
      { fuel: 'MGO', bod: '220.00', expBor: '220.00', cpPrice: '750.00', bookedPrice: '0.00', masterReq: '130.00', actualSupply: '5.91', actualBor: '' },
    ],
    pnlNotes: {},
    etaPlan: {
      startDep: '11-07-2025 15:00',
      startRobVlsfo: '351.00',
      startRobMgo: '220.00',
      weatherMargin: '5',
      perf: {
        speedMode: 'Full',
        full: { ballast: '14', laden: '14' },
        eco: { ballast: '12', laden: '11.5' },
        customs: [],
        mainNormal: { type: 'VLSFO', ballast: '29', laden: '33', idle: '2.5', work: '5' },
        mainEca: { type: 'ULSFO', ballast: '29', laden: '33', idle: '2.5', work: '5' },
        subNormal: { type: 'MGO', sea: '0.1', idle: '0', work: '0' },
        subEca: { type: 'MGO', sea: '0.1', idle: '0', work: '0' },
      },
      legs: buildItineraryLegs('SALALAH', 'SALALAH', 'PARADIP + HALDIA', 'HALDIA', { speed: '14', wf: '5', seaV: '33', seaM: '0.1', portV: '2.5', portM: '0', tz: '+5.5' }),
    },
    stowage: {
      lightship: '13952',
      autoBunker: true,
      points: [
        { name: 'SALALAH', displacement: '93288', density: '1.025', vlsfo: '475', mgo: '30', bw: '200', fw: '150', constants: '500' },
        { name: 'COLOMBO', displacement: '93288', density: '1.025', vlsfo: '715', mgo: '30', bw: '200', fw: '150', constants: '500' },
        { name: 'ENTRY SUMMER ZONE', displacement: '93288', density: '1.025', vlsfo: '682', mgo: '30', bw: '200', fw: '150', constants: '500' },
        { name: 'PARADIP', displacement: '93288', density: '1.025', vlsfo: '597', mgo: '30', bw: '200', fw: '150', constants: '500' },
      ],
      holds: [
        { name: 'Hold 1', cargo: 'Gypsum', qty: '15500', capacity: '16500', grainCap: '20500', baleCap: '19800', tankTopArea: '700', tankTopMax: '25' },
        { name: 'Hold 2', cargo: 'Gypsum', qty: '15000', capacity: '16500', grainCap: '20500', baleCap: '19800', tankTopArea: '700', tankTopMax: '25' },
        { name: 'Hold 3', cargo: 'Limestone', qty: '15714', capacity: '16500', grainCap: '20500', baleCap: '19800', tankTopArea: '700', tankTopMax: '25' },
        { name: 'Hold 4', cargo: 'Limestone', qty: '15000', capacity: '16500', grainCap: '20500', baleCap: '19800', tankTopArea: '700', tankTopMax: '25' },
        { name: 'Hold 5', cargo: 'Limestone', qty: '15000', capacity: '16500', grainCap: '20500', baleCap: '19800', tankTopArea: '700', tankTopMax: '25' },
      ],
      draft: {
        tpc: '59',
        densityFrom: '1.025',
        densityTo: '1.006',
        draftCurrent: '12.800',
        dispSW: '69946',
        vlsfo: '360', mgo: '215', bw: '300', fw: '200', constants: '360',
        shipSurveyQty: '65279', shoreScaleQty: '65563.11',
      },
      grades: [
        { grade: 'Gypsum', sf: '0.85', qty: '30500' },
        { grade: 'Limestone', sf: '0.72', qty: '45714' },
      ],
      ports: [
        { name: 'SALALAH', maxDraft: '13.20', density: '1.025', remarks: 'Load port — SW' },
        { name: 'COLOMBO', maxDraft: '13.50', density: '1.020', remarks: 'Bunkering call' },
        { name: 'PARADIP', maxDraft: '13.02', density: '1.006', remarks: 'Disch — brackish, draft restricted' },
        { name: 'HALDIA', maxDraft: '10.50', density: '1.004', remarks: 'Disch — river, tidal / draft restricted' },
      ],
    },
  };
}

/* --------------------------------------------------------- P&L computation */

interface Pnl {
  days: number;
  qty: number;
  freight: number;
  demDespatch: number;
  miscIncome: number;
  revenue: number;
  // bunkers
  foCons: number;
  foExp: number;
  doCons: number;
  doExp: number;
  bunkerCost: number;
  // operation expense (excl. hire)
  portLoad: number;
  portDisch: number;
  portCost: number;
  cveTotal: number;
  ilohc: number;
  otherCost: number;
  opExpense: number;
  opProfit: number;
  // hire
  hirePerDay: number;
  addCommPct: number;
  grossHire: number;
  hireDeductions: number;
  netHirePerDay: number;
  netHire: number; // total net hire over the voyage
  totalHire: number;
  // result
  totalExpense: number;
  profit: number;
  dailyProfit: number;
  tce: number;
}

function computePnl(r: Recap): Pnl {
  const days = daysBetween(parseDMY(r.deliveryDateTime), parseDMY(r.redeliveryDateTime));
  const qty = num(r.finalQtyLoaded);
  const freight = num(r.freightPerMt) * qty;
  const demDespatch = num(r.demDespatch);
  const miscIncome = num(r.miscIncome);
  const revenue = freight + demDespatch + miscIncome;

  const foCons = num(r.foCons);
  const foPrice = num(r.foPrice);
  const foExp = foCons * foPrice;
  const doCons = num(r.doCons);
  const doPrice = num(r.doPrice);
  const doExp = doCons * doPrice;
  const bunkerCost = foExp + doExp;

  const portLoad = num(r.portDaLoad);
  const portDisch = num(r.portDaDisch);
  const portCost = portLoad + portDisch;
  const cveTotal = num(r.cve);
  const ilohc = num(r.ilohc);
  const otherCost = num(r.otherCost);
  const opExpense = bunkerCost + portCost + cveTotal + ilohc + otherCost;
  const opProfit = revenue - opExpense;

  const hirePerDay = num(r.hirePerDay);
  const addCommPct = num(r.adcom) + num(r.brokerage);
  const grossHire = hirePerDay * days;
  const hireDeductions = (grossHire * addCommPct) / 100;
  const netHirePerDay = hirePerDay * (1 - addCommPct / 100);
  const totalHire = grossHire - hireDeductions;
  const netHire = totalHire;

  const totalExpense = opExpense + totalHire;
  const profit = revenue - totalExpense;
  const dailyProfit = days > 0 ? profit / days : 0;
  const tce = days > 0 ? opProfit / days : 0;

  return {
    days,
    qty,
    freight,
    demDespatch,
    miscIncome,
    revenue,
    foCons,
    foExp,
    doCons,
    doExp,
    bunkerCost,
    portLoad,
    portDisch,
    portCost,
    cveTotal,
    ilohc,
    otherCost,
    opExpense,
    opProfit,
    hirePerDay,
    addCommPct,
    grossHire,
    hireDeductions,
    netHirePerDay,
    netHire,
    totalHire,
    totalExpense,
    profit,
    dailyProfit,
    tce,
  };
}

/* -------------------------------------------- document extraction (recap/CP) */

/** Heuristic: is the file content readable text (vs binary PDF bytes)? */
function looksTextual(s: string): boolean {
  if (!s) return false;
  const sample = s.slice(0, 3000);
  let printable = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)) printable++;
  }
  return sample.length > 0 && printable / sample.length > 0.85;
}

/** Extract recap fields from readable recap / charter-party text (label: value). */
function extractRecapFields(text: string): Partial<Recap> {
  const t = text.replace(/\r/g, '');
  const grab = (patterns: RegExp[]): string | undefined => {
    for (const re of patterns) {
      const m = t.match(re);
      if (m && m[1] && m[1].trim()) return m[1].split('\n')[0].trim();
    }
    return undefined;
  };
  const map: [RecapTextKey, RegExp[]][] = [
    ['vesselName', [/vessel\s*name\s*[:\-|]\s*(.+)/i]],
    ['voyageFixType', [/voyage\s*\/?\s*fix\s*type\s*[:\-|]\s*(.+)/i, /\bfix\s*type\s*[:\-|]\s*(.+)/i]],
    ['owners', [/^owners\s*[:\-|]\s*(.+)/im]],
    ['ownersBroker', [/owners?\s*broker\s*[:\-|]\s*(.+)/i]],
    ['cpDate', [/^cp\s*date\s*[:\-|]\s*(.+)/im]],
    ['laycanStart', [/^laycan\s*(?:start|from)?\s*[:\-|]\s*(.+)/im]],
    ['hirePerDay', [/hire\s*per\s*day[^:\-|]*[:\-|]\s*\$?\s*([\d.,]+)/i, /hire\s*[:\-|]\s*\$?\s*([\d.,]+)/i]],
    ['charterers', [/^charterers?\s*[:\-|]\s*(.+)/im]],
    ['charterersBroker', [/charterers?\s*broker\s*[:\-|]\s*(.+)/i]],
    ['charterersCpDate', [/charterers?\s*cp\s*date\s*[:\-|]\s*(.+)/i]],
    ['charterersLaycanStart', [/charterers?\s*laycan\s*[:\-|]\s*(.+)/i]],
    ['freightPerMt', [/freight\s*\/?\s*mt[^:\-|]*[:\-|]\s*\$?\s*([\d.]+)/i, /freight\s*[:\-|]\s*\$?\s*([\d.]+)/i]],
    ['demDespatch', [/demurrage\s*\/?\s*despatch\s*[:\-|]\s*\$?\s*([\d.,]+)/i, /demurrage\s*[:\-|]\s*\$?\s*([\d.,]+)/i]],
    ['despatchTerm', [/despatch\s*[:\-|]\s*(.+)/i]],
    ['deliveryPort', [/delivery\s*(?:at|port)\s*[:\-|]\s*(.+)/i]],
    ['deliveryDateTime', [/delivery\s*date\s*\/?\s*time\s*[:\-|]\s*(.+)/i]],
    ['redeliveryPort', [/redelivery\s*(?:at|port)\s*[:\-|]\s*(.+)/i]],
    ['redeliveryDateTime', [/redelivery\s*date\s*\/?\s*time\s*[:\-|]\s*(.+)/i]],
    ['wxClause', [/wx\s*clause\s*[:\-|]\s*(.+)/i, /weather\s*clause\s*[:\-|]\s*(.+)/i]],
    ['ilohc', [/ilohc\s*[:\-|]\s*\$?\s*([\d.,]+)/i]],
    ['cve', [/\bc\.?v\.?e\.?\s*[:\-|]\s*\$?\s*([\d.,]+)/i]],
    ['adcom', [/ad\.?com\s*[:\-|]\s*([\d.]+\s*%?)/i, /address\s*comm[^:\-|]*[:\-|]\s*([\d.]+\s*%?)/i]],
    ['brokerage', [/brokerage\s*[:\-|]\s*(.+)/i]],
    ['redeliveryNotices', [/redelivery\s*notices\s*[:\-|]\s*(.+)/i]],
    ['hullCleaningClause', [/hull\s*cleaning[^:\-|]*[:\-|]\s*(.+)/i]],
    ['cargoName', [/cargo\s*name\s*[:\-|]\s*(.+)/i, /^cargo\s*[:\-|]\s*(.+)/im]],
    ['cpQuantity', [/cp\s*quantity\s*[:\-|]\s*(.+)/i, /^quantity\s*[:\-|]\s*(.+)/im]],
    ['holdCleaning', [/hold\s*cleaning\s*[:\-|]\s*(.+)/i]],
    ['finalQtyLoaded', [/final\s*qty[^:\-|]*[:\-|]\s*([\d.,]+)/i, /\bbl\s*qty\s*[:\-|]\s*([\d.,]+)/i]],
    ['loadPort', [/load\s*port\s*[:\-|]\s*(.+)/i]],
    ['norAtLoadPort', [/nor\s*at\s*load\s*port\s*[:\-|]\s*(.+)/i]],
    ['loadRate', [/load\s*rate\s*[:\-|]\s*(.+)/i]],
    ['pdaLoadPort', [/pda\s*load\s*port\s*[:\-|]\s*(.+)/i]],
    ['frtPaymentTerms', [/(?:frt|freight)\s*payment\s*terms\s*[:\-|]\s*(.+)/i]],
    ['dischargePort', [/discharge\s*port\s*[:\-|]\s*(.+)/i, /disch\.?\s*port\s*[:\-|]\s*(.+)/i]],
    ['norAtDPort', [/nor\s*at\s*d\.?\s*port\s*[:\-|]\s*(.+)/i]],
    ['dischRate', [/disch\.?\s*rate\s*[:\-|]\s*(.+)/i]],
    ['pdaDPort', [/pda\s*d\.?\s*port\s*[:\-|]\s*(.+)/i]],
    ['freeDa', [/free\s*da\s*[:\-|]\s*(.+)/i]],
    ['loiOblDPort', [/loi\s*\/?\s*obl[^:\-|]*[:\-|]\s*(.+)/i]],
  ];
  const out: Partial<Recap> = {};
  for (const [key, pats] of map) {
    const v = grab(pats);
    if (v) out[key] = v;
  }
  return out;
}

/** Representative extraction used when a document cannot be read as text
 *  (e.g. scanned/native PDF). Fills the recap so the workflow stays usable. */
const SAMPLE_RECAP_EXTRACT: Partial<Recap> = {
  vesselName: 'AP JADRAN',
  voyageFixType: 'TCTIN-VOUT',
  owners: 'ATLANTSKA',
  ownersBroker: 'OFE',
  cpDate: '05-07-2025',
  laycanStart: '09-07-2025',
  laycanEnd: '12-07-2025',
  hirePerDay: '10,100.00',
  charterers: 'PARAG GLOBAL',
  charterersBroker: 'ATPI',
  charterersCpDate: '05-07-2025',
  charterersLaycanStart: '08-07-2025',
  charterersLaycanEnd: '12-07-2025',
  freightPerMt: '6.65',
  demDespatch: '13,500.00',
  despatchTerm: 'Half Despatch WTS',
  deliveryPort: 'SALALAH',
  deliveryTerm: 'AFSPS',
  deliveryDateTime: '11-07-2025 15:00',
  redeliveryPort: 'HALDIA',
  redeliveryTerm: 'DLOSP',
  redeliveryDateTime: '05-08-2025 11:18',
  wxClause: 'BIMCO WEATHER STANDARD CLAUSE',
  ilohc: '5,000.00',
  cve: '1,500.00',
  adcom: '3.75%',
  brokerage: '1.25% BY OWNERS',
  redeliveryNotices: '30-15-10-7-5-3-2-1',
  hullCleaningClause: '20 DAYS',
  cargoName: 'GYPSUM / LIMESTONE',
  cpQuantity: '75000 / 10%',
  holdCleaning: 'OWNERS - AP',
  finalQtyLoaded: '76214',
  loadPort: 'SALALAH',
  norAtLoadPort: 'ATDNSHINC',
  loadRate: '17000 SHINC',
  pdaLoadPort: 'USD 48,000',
  frtPaymentTerms: '3 B.DAYS',
  dischargePort: 'PARADIP + HALDIA',
  norAtDPort: 'ATDNSHINC',
  dischRate: '17000 SHINC',
  pdaDPort: 'FREE DA',
  freeDa: 'YES',
  loiOblDPort: 'LOI IN OWNERS P&I WORDING',
};

const SAMPLE_CP_EXTRACT: Partial<Recap> = {
  cpDate: '05-07-2025',
  deliveryPort: 'SALALAH',
  deliveryTerm: 'AFSPS',
  redeliveryPort: 'HALDIA',
  redeliveryTerm: 'DLOSP',
  ilohc: '5,000.00',
  cve: '1,500.00',
  adcom: '3.75%',
  brokerage: '1.25% BY OWNERS',
  redeliveryNotices: '30-15-10-7-5-3-2-1',
  hullCleaningClause: '20 DAYS',
  wxClause: 'BIMCO WEATHER STANDARD CLAUSE',
  frtPaymentTerms: '3 B.DAYS',
};

/** Read a File and return the recap fields extracted from it. */
async function extractFromFile(file: File, category: string): Promise<Partial<Recap>> {
  let text = '';
  try {
    text = await file.text();
  } catch {
    text = '';
  }
  const parsed = looksTextual(text) ? extractRecapFields(text) : {};
  if (Object.keys(parsed).length >= 3) return parsed;
  // Fall back to a representative extraction for unreadable (binary PDF) docs.
  return category === 'Charter Party' ? SAMPLE_CP_EXTRACT : SAMPLE_RECAP_EXTRACT;
}

/* ---------------------------------------------------- seed side-panel data */

function seedDocs(): DocItem[] {
  return [
    { id: uid('d'), name: 'Terms Recap.pdf', category: 'Recap', size: '212 KB', at: '05-07 09:14' },
    { id: uid('d'), name: 'Charter Party.pdf', category: 'Charter Party', size: '1.2 MB', at: '05-07 18:40' },
    { id: uid('d'), name: 'NOR Salalah.pdf', category: 'NOR', size: '96 KB', at: '11-07 15:10' },
    { id: uid('d'), name: 'SOF Salalah.pdf', category: 'SOF', size: '140 KB', at: '14-07 22:05' },
    { id: uid('d'), name: 'Bill of Lading.pdf', category: 'B/L', size: '180 KB', at: '14-07 23:30' },
  ];
}
function seedTasks(): Task[] {
  return [
    { id: uid('t'), text: 'Tender NOR at Salalah', due: '11-07', done: true },
    { id: uid('t'), text: 'Submit 1st hire invoice to charterers', due: '12-07', done: true },
    { id: uid('t'), text: 'Collect SOF from load agent', due: '15-07', done: false },
    { id: uid('t'), text: 'Send 5-day redelivery notice', due: '31-07', done: false },
    { id: uid('t'), text: 'Prepare laytime statement — Haldia', due: '06-08', done: false },
  ];
}
function seedAlerts(r: Recap, pnl: Pnl): Alert[] {
  const list: Alert[] = [];
  if (pnl.profit < 0) list.push({ id: 'a1', text: 'Voyage P&L is negative — review costs.', level: 'alert' });
  list.push({ id: 'a2', text: `Next hire payment due — ${r.charterers}.`, level: 'warn' });
  list.push({ id: 'a3', text: 'Demurrage may accrue at Haldia (congestion).', level: 'warn' });
  list.push({ id: 'a4', text: `Redelivery notice window open (${r.redeliveryNotices}).`, level: 'info' });
  return list;
}

/* -------------------------------------------------------- small UI helpers */

function Card({ title, icon, right, children, wide, span2 }: { title: string; icon: string; right?: ReactNode; children: ReactNode; wide?: boolean; span2?: boolean }) {
  return (
    <section className={`fv-ops__card${wide ? ' fv-ops__card--wide' : ''}${span2 ? ' fv-ops__card--span2' : ''}`}>
      <header className="fv-ops__card-head">
        <span className="fv-ops__card-title">
          <i className={`fas ${icon}`} aria-hidden="true" /> {title}
        </span>
        {right && <span className="fv-ops__card-right">{right}</span>}
      </header>
      <div className="fv-ops__card-body">{children}</div>
    </section>
  );
}

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'details', label: 'Voyage Details', icon: 'fa-clipboard-list' },
  { id: 'pnl', label: 'Live P&L', icon: 'fa-sack-dollar' },
  { id: 'etarob', label: "ETA & ROB's", icon: 'fa-gauge-high' },
  { id: 'stowage', label: 'Cargo & Stowage', icon: 'fa-boxes-stacked' },
  { id: 'hire', label: 'Hire Payments', icon: 'fa-money-bill-wave' },
  { id: 'freight', label: 'Freight & Laytime', icon: 'fa-file-invoice-dollar' },
  { id: 'reports', label: 'Vessel Reports', icon: 'fa-file-lines' },
  { id: 'costs', label: 'Tool', icon: 'fa-scale-balanced' },
];

type RailPanel = 'docs' | 'tasks' | 'alerts' | 'upload' | null;

/* ------------------------------------------------------------ main component */

export function OperationsPage({ mode }: { mode?: 'create' } = {}) {
  const [searchParams] = useSearchParams();
  const selectedVoyage = useSelectedVoyage();
  // "create" mode (prop or ?new=1) opens a blank operations workspace.
  const createMode = mode === 'create' || searchParams.get('new') === '1';
  const blankVoyage = useMemo(() => makeBlankVoyage(), []);
  const voyage = createMode ? blankVoyage : selectedVoyage;

  const [recap, setRecap] = useState<Recap>(() => seedRecap(voyage));
  const [tab, setTab] = useState<TabId>('pnl');
  const [rail, setRail] = useState<RailPanel>(null);
  const [docs, setDocs] = useState<DocItem[]>(() => seedDocs());
  const [tasks, setTasks] = useState<Task[]>(() => seedTasks());
  const [fetchNote, setFetchNote] = useState<string | null>(null);
  const [opsStatus, setOpsStatus] = useState<string>(voyage?.status || 'At Sea');

  useEffect(() => {
    setRecap(seedRecap(voyage));
    setTab('pnl');
    setDocs(seedDocs());
    setTasks(seedTasks());
    setOpsStatus(voyage?.status || 'At Sea');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyage?.id]);

  const pnl = useMemo(() => computePnl(recap), [recap]);
  const alerts = useMemo(() => seedAlerts(recap, pnl), [recap, pnl]);
  // Estimate baseline = the fixed recap from Chartering (independent of live edits).
  const estPnl = useMemo(() => computePnl(seedRecap(voyage)), [voyage?.id]);

  if (!voyage) return <NoVesselSelected />;

  const set = (k: keyof Recap, v: string) => setRecap((r) => ({ ...r, [k]: v }));

  const addDocs = (files: FileList | null, category = 'Supporting') => {
    if (!files) return;
    const now = new Date();
    const at = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const items: DocItem[] = Array.from(files).map((f) => ({
      id: uid('d'),
      name: f.name,
      category,
      size: `${Math.max(1, Math.round(f.size / 1024))} KB`,
      at,
    }));
    setDocs((d) => [...items, ...d]);
  };
  const removeDoc = (id: string) => setDocs((d) => d.filter((x) => x.id !== id));
  const toggleTask = (id: string) => setTasks((t) => t.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));

  /** Upload a Terms Recap / Charter Party and fetch its data into the recap
   *  fields — only blank fields unless `overwrite` is set. */
  const ingest = async (files: FileList | null, category: string, overwrite: boolean) => {
    if (!files || files.length === 0) return;
    addDocs(files, category);
    if (category !== 'Recap' && category !== 'Charter Party') {
      setFetchNote(`Attached ${files[0].name} (${category})`);
      return;
    }
    const file = files[0];
    const extract = await extractFromFile(file, category);
    const applied: Partial<Recap> = {};
    (Object.keys(extract) as RecapTextKey[]).forEach((k) => {
      const v = extract[k];
      if (v == null || v === '') return;
      if (overwrite || !String(recap[k] ?? '').trim()) applied[k] = v;
    });
    if (Object.keys(applied).length) setRecap((prev) => ({ ...prev, ...applied }));
    setFetchNote(
      `Fetched ${Object.keys(applied).length} field(s) from ${file.name}${overwrite ? '' : ' (blank fields only)'}`,
    );
  };

  const openTasks = tasks.filter((t) => !t.done).length;

  return (
    <div className="fv-ops">
      <div className="fv-ops__main">
        {/* ===================== SLIM TOP BAR ===================== */}
        <RecapTopBar recap={recap} voyage={voyage} pnl={pnl} status={opsStatus} onStatus={setOpsStatus} />

        {/* ===================== TABS ===================== */}
        <nav className="fv-ops__tabs" aria-label="Operations sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`fv-ops__tab${tab === t.id ? ' fv-ops__tab--active' : ''}`}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              <i className={`fas ${t.icon}`} aria-hidden="true" /> {t.label}
            </button>
          ))}
        </nav>

        {/* ===================== TAB CONTENT ===================== */}
        <div className="fv-ops__content">
          {tab === 'details' && <VoyageDetailsTab recap={recap} setRecap={setRecap} voyage={voyage} status={opsStatus} />}
          {tab === 'pnl' && <PnlTab recap={recap} set={set} setRecap={setRecap} pnl={pnl} estPnl={estPnl} />}
          {tab === 'etarob' && <EtaRobTab recap={recap} setRecap={setRecap} />}
          {tab === 'stowage' && <StowageTab recap={recap} setRecap={setRecap} />}
          {tab === 'hire' && <HireTab recap={recap} setRecap={setRecap} pnl={pnl} />}
          {tab === 'freight' && <FreightTab recap={recap} voyage={voyage} />}
          {tab === 'costs' && <CostsTab pnl={pnl} />}
          {tab === 'reports' && <ReportsTab voyage={voyage} />}
        </div>
      </div>

      {/* ===================== RIGHT RAIL ===================== */}
      <aside className="fv-ops__rail">
        {rail && (
          <div className="fv-ops__rail-panel">
            <div className="fv-ops__rail-panel-head">
              <span>
                {rail === 'docs' && 'Voyage Documents'}
                {rail === 'tasks' && 'Tasks & Reminders'}
                {rail === 'alerts' && 'Alerts'}
                {rail === 'upload' && 'Upload Documents'}
              </span>
              <button type="button" className="fv-ops__icon-btn" onClick={() => setRail(null)} title="Close">
                <i className="fas fa-xmark" />
              </button>
            </div>
            <div className="fv-ops__rail-panel-body">
              {rail === 'docs' && <DocsPanel docs={docs} onRemove={removeDoc} onUpload={() => setRail('upload')} />}
              {rail === 'tasks' && <TasksPanel tasks={tasks} onToggle={toggleTask} />}
              {rail === 'alerts' && <AlertsPanel alerts={alerts} />}
              {rail === 'upload' && <UploadPanel onIngest={ingest} fetchNote={fetchNote} />}
            </div>
          </div>
        )}
        <div className="fv-ops__rail-icons">
          <RailIcon icon="fa-folder-open" label="Documents" active={rail === 'docs'} badge={docs.length} onClick={() => setRail(rail === 'docs' ? null : 'docs')} />
          <RailIcon icon="fa-list-check" label="Tasks" active={rail === 'tasks'} badge={openTasks} onClick={() => setRail(rail === 'tasks' ? null : 'tasks')} />
          <RailIcon icon="fa-bell" label="Alerts" active={rail === 'alerts'} badge={alerts.length} onClick={() => setRail(rail === 'alerts' ? null : 'alerts')} />
          <RailIcon icon="fa-cloud-arrow-up" label="Upload" active={rail === 'upload'} onClick={() => setRail(rail === 'upload' ? null : 'upload')} />
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------ recap header */

/** Recap fields grouped by type / category. */
/* ---- Voyage Details (redesigned) — option lists + field primitives ---- */

const OPS_CURRENCIES = ['USD', 'EUR', 'GBP', 'SGD', 'JPY', 'CNY'];
const OPS_QTY_UNITS = ['MT', 'CBM', 'LT', 'BBL'];
const OPS_BANKING_DAYS = ['1', '2', '3', '4', '5', '6', '7'];
const OPS_HIRE_INTERVALS = ['1', '2', '3', '4', '5', '6', '7', '10', '15', '30'];
const OPS_PAYMENT_BASES = ['Banking Days', 'Running Days', 'Calendar Days'];
const OPS_NOTICE_DAYS = [30, 20, 15, 10, 7, 5, 4, 3, 2, 1];
// Delivery / redelivery position terms (charter-party place references).
const OPS_BERTH_TERMS = [
  'APS', 'AFSPS', 'AOSP', 'AOP', 'AIP', 'DLOSP', 'DLOP', 'DLSP',
  'Pilot Station', 'Pilot On Board', 'Pilot Off', 'Passing Breakwater',
  'Port Limits', 'Outer Port Limits', 'Off Port Limits',
  'Outer Anchorage', 'Inner Anchorage', 'Anchorage', 'Roads', 'At Roads',
  'At Buoy', 'Sea Buoy', 'At Berth', 'All Fast', 'First Line Ashore', 'Last Line Away',
  'Free Pratique Granted', 'Customs Cleared',
  'Delivery Ex Berth', 'Delivery Ex Anchorage', 'Delivery Ex Buoy', 'Delivery Ex Port Limits',
  'Delivery at Sea', 'Delivery at Anchorage', 'Delivery at Pilot Station', 'Delivery at Port Limits',
  'Redelivery Ex Berth', 'Redelivery Ex Anchorage', 'Redelivery Ex Buoy', 'Redelivery Ex Port Limits',
  'Redelivery at Sea', 'Redelivery at Anchorage', 'Redelivery at Pilot Station', 'Redelivery at Port Limits',
  'Completed Loading', 'Completed Discharging', 'Completed Cargo Operations', 'After Cargo Completion',
  'Waiting Orders', 'Awaiting Berth', 'At STS Position', 'Canal Entrance', 'Canal Exit',
];
// NOR tender terms (when a Notice of Readiness may be tendered).
const OPS_NOR_TENDER_TERMS = [
  'Any Time', 'Any Time Day or Night', 'ATDN', 'ATDNSHINC', 'ATDN SHEX',
  'Office Hours', 'Office Hours Only', 'Outside Office Hours', 'Business Hours', 'Working Hours', 'Banking Hours',
  '24 Hours', 'During Office Hours', 'At Berth', 'At Anchorage', 'At Roads', 'At Pilot Station', 'At Port Limits',
  'Upon Arrival', 'Immediately Upon Arrival', 'Upon Berthing', 'Upon All Fast', 'Upon Free Pratique',
  'Upon Customs Clearance', 'Upon Completion of Formalities',
];
// Despatch treatment options.
const OPS_DESPATCH_TERMS = ['Same as Demurrage', 'Half Despatch WTS', 'HDWTS', 'HDATS', 'Free Despatch', 'No Despatch'];
// Voyage operational status (editable in the Voyage Details summary strip).
const OPS_VOYAGE_STATUSES = ['At Sea', 'At Port', 'At Berth', 'At Anchorage', 'Loading', 'Discharging', 'On Voyage', 'Ballast', 'Idle', 'Completed'];
// Bunker fuel grades (defaults mirror the Chartering estimation fuels).
const OPS_FUEL_GRADES = ['VLSFO', 'ULSFO', 'HSFO', 'LSMGO', 'MGO', 'MDO', 'LNG', 'Methanol'];

/** Text field with a label (edit mode) — used across the Voyage Details cards. */
function VdField({ label, value, onChange, placeholder, accent, num }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; accent?: boolean; num?: boolean }) {
  return (
    <label className="fv-ops__vd-field">
      <span>{label}</span>
      <input className={`fv-ops__vd-in${accent ? ' fv-ops__vd-in--accent' : ''}`} inputMode={num ? 'decimal' : undefined} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Recap date string (`dd-mm-yyyy` / `dd-mm-yyyy HH:mm`) -> `YYYY-MM-DDTHH:mm`. */
function dmyToDateTimeInput(value: string): string {
  const d = parseDMY(value);
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** `YYYY-MM-DDTHH:mm` -> recap date string `dd-mm-yyyy HH:mm`. */
function dateTimeInputToDmy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return '';
  const [, y, mo, d, h, mi] = m;
  return `${d}-${mo}-${y} ${h}:${mi}`;
}

/** Labelled date + time picker bound to a recap `dd-mm-yyyy HH:mm` string. */
function VdDateTime({ label, value, onChange, accent }: { label: string; value: string; onChange: (v: string) => void; accent?: boolean }) {
  return (
    <label className="fv-ops__vd-field">
      <span>{label}</span>
      <input
        type="datetime-local"
        className={`fv-ops__vd-in${accent ? ' fv-ops__vd-in--accent' : ''}`}
        value={dmyToDateTimeInput(value)}
        onChange={(e) => onChange(dateTimeInputToDmy(e.target.value))}
      />
    </label>
  );
}

/** Labelled dropdown backed by a fixed option list. */
function VdSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="fv-ops__vd-field">
      <span>{label}</span>
      <select className="fv-ops__vd-in" value={value} onChange={(e) => onChange(e.target.value)}>
        {value && !options.includes(value) && <option value={value}>{value}</option>}
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

/** Autocomplete field backed by a datalist (pick a saved account or type one). */
function VdCombo({ label, value, onChange, options, listId, accent }: { label: string; value: string; onChange: (v: string) => void; options: string[]; listId: string; accent?: boolean }) {
  return (
    <label className="fv-ops__vd-field">
      <span>{label}</span>
      <input className={`fv-ops__vd-in${accent ? ' fv-ops__vd-in--accent' : ''}`} list={listId} value={value} placeholder="Select or type…" onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>{options.map((o) => <option key={o} value={o} />)}</datalist>
    </label>
  );
}

/** Numeric value paired with a unit / currency dropdown. */
function VdValueUnit({ label, value, onValue, unit, onUnit, units, accent, num }: { label: string; value: string; onValue: (v: string) => void; unit: string; onUnit: (v: string) => void; units: string[]; accent?: boolean; num?: boolean }) {
  return (
    <label className="fv-ops__vd-field">
      <span>{label}</span>
      <span className="fv-ops__vd-unitwrap">
        <input className={`fv-ops__vd-in${accent ? ' fv-ops__vd-in--accent' : ''}`} inputMode={num ? 'decimal' : undefined} value={value} onChange={(e) => onValue(e.target.value)} />
        <select className="fv-ops__vd-unit" value={unit} onChange={(e) => onUnit(e.target.value)}>
          {units.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </span>
    </label>
  );
}


function RecapTopBar({ recap, voyage, pnl, status, onStatus }: { recap: Recap; voyage: Voyage; pnl: Pnl; status: string; onStatus: (v: string) => void }) {
  const cpdd = useCpdds()[voyage.id];
  return (
    <div className="fv-ops__topbar">
      <div className="fv-ops__recap-title">
        <i className="fas fa-ship" aria-hidden="true" />
        <div>
          <h1>{recap.vesselName}</h1>
          <span className="fv-ops__recap-sub">
            {recap.voyageFixType} · {recap.cargoName} · {recap.loadPort} → {recap.dischargePort}
            {voyage.client && ` · ${voyage.client}`}
            {cpdd && ` / CPDD ${cpdd}`}
          </span>
        </div>
      </div>
      <div className="fv-ops__recap-kpis">
        <WorkflowStatusSelect module="Operations" voyageId={voyage.id} />
        <select className="fv-ops__vd-status-select" value={status} onChange={(e) => onStatus(e.target.value)} aria-label="Voyage status">
          {status && !OPS_VOYAGE_STATUSES.includes(status) && <option value={status}>{status}</option>}
          {OPS_VOYAGE_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
        </select>
        <span>P&amp;L <b className={pnl.profit >= 0 ? 'fv-ops__pos' : 'fv-ops__neg'}>{money(pnl.profit)}</b></span>
        <span>Days <b>{fmt(pnl.days, 2)}</b></span>
        <span>Daily <b className={pnl.dailyProfit >= 0 ? 'fv-ops__pos' : 'fv-ops__neg'}>{money(pnl.dailyProfit)}</b></span>
      </div>
    </div>
  );
}

function VoyageDetailsTab({ recap, setRecap, voyage, status }: { recap: Recap; setRecap: Dispatch<SetStateAction<Recap>>; voyage: Voyage; status: string }) {
  const set = (k: keyof Recap, v: string) => setRecap((r) => ({ ...r, [k]: v }));

  // Counterparty / service-provider options sourced from Settings → Account Details.
  const clients = useMemo(() => loadClients(), []);
  const namesFor = (kind: string, cat: string) =>
    clients.filter((c) => (c.kind ?? 'Account') === kind && c.category === cat && c.name.trim()).map((c) => c.name.trim());
  const ownerNames = useMemo(() => namesFor('Account', 'Owner'), [clients]);
  const chartererNames = useMemo(() => namesFor('Account', 'Charterer'), [clients]);
  const brokerNames = useMemo(() => namesFor('Account', 'Broker'), [clients]);
  const spNamesFor = (type: string) =>
    clients.filter((c) => (c.kind ?? 'Account') === 'Service Provider' && c.category === type && c.name.trim()).map((c) => c.name.trim());

  // Notice-day lists (delivery + redelivery) — configurable.
  const parseDays = (s: string) => (s || '').split(/[^\d]+/).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n));
  const joinDays = (arr: number[]) => Array.from(new Set(arr)).sort((a, b) => b - a).join('-');
  const notices = parseDays(recap.redeliveryNotices);
  const setNotices = (arr: number[]) => set('redeliveryNotices', joinDays(arr));
  const delNotices = parseDays(recap.deliveryNotices);
  const setDelNotices = (arr: number[]) => set('deliveryNotices', joinDays(arr));

  // Service providers assigned to this voyage (type + company + email).
  type SP = { type: string; name: string; email: string };
  const sps: SP[] = recap.serviceProviders ?? [];
  const setSPs = (list: SP[]) => setRecap((r) => ({ ...r, serviceProviders: list }));
  const spEmailFor = (type: string, name: string) =>
    clients.find((c) => (c.kind ?? 'Account') === 'Service Provider' && c.category === type && c.name.trim() === name.trim())?.email ?? '';
  const updSP = (i: number, p: Partial<SP>) =>
    setSPs(sps.map((x, idx) => {
      if (idx !== i) return x;
      const next = { ...x, ...p };
      // Auto-fill the email when a known provider is picked / its type changes.
      if (p.name !== undefined && (!x.email || x.email === spEmailFor(x.type, x.name))) {
        const auto = spEmailFor(next.type, next.name);
        if (auto) next.email = auto;
      } else if (p.type !== undefined) {
        const auto = spEmailFor(next.type, next.name);
        if (auto) next.email = auto;
      }
      return next;
    }));

  // Write vessel-email edits back to Settings → Vessel Details (matched by name).
  const syncVesselEmail = (email: string) => {
    const nm = (recap.vesselName || '').trim();
    if (!nm) return;
    const vessels = loadVessels();
    const idx = vessels.findIndex((v) => v.name.trim().toLowerCase() === nm.toLowerCase());
    if (idx >= 0 && vessels[idx].email !== email) {
      const next = [...vessels];
      next[idx] = { ...next[idx], email };
      saveVessels(next);
    }
  };

  // Write service-provider email edits back to Settings → Service Provider Details.
  const syncServiceProviderEmail = (type: string, name: string, email: string) => {
    const nm = (name || '').trim();
    if (!nm) return;
    const all = loadClients();
    const idx = all.findIndex(
      (c) => (c.kind ?? 'Account') === 'Service Provider' && c.category === type && c.name.trim().toLowerCase() === nm.toLowerCase(),
    );
    if (idx >= 0 && all[idx].email !== email) {
      const next = [...all];
      next[idx] = { ...next[idx], email };
      saveClients(next);
    }
  };

  // Voyage operational status now lives in the top header; used here for the timeline.
  const fixtureNos = useFixtureNumbers();
  const fixtureNo = fixtureNos[voyage.id] ?? voyage.id;

  const strip: { label: string; value: string }[] = [
    { label: 'Fixture No.', value: fixtureNo },
    { label: 'Vessel', value: recap.vesselName || voyage.vessel },
    { label: 'Voyage Type', value: recap.voyageFixType || '—' },
    { label: 'Cargo', value: recap.cargoName || '—' },
    { label: 'Hire / Day', value: `${recap.hireCurrency} ${recap.hirePerDay}`.trim() || '—' },
    { label: 'Freight Rate', value: `${recap.freightCurrency} ${recap.freightPerMt} / ${recap.cargoQtyUnit}`.trim() || '—' },
    { label: 'Delivery Port', value: recap.deliveryPort || '—' },
    { label: 'Redelivery Port', value: recap.redeliveryPort || '—' },
  ];

  const milestones = buildMilestones(recap, voyage, status);

  return (
    <div className="fv-ops__vd">
      {/* Summary strip (fixture basics) */}
      <div className="fv-ops__vd-strip">
        {strip.map((s) => (
          <div className="fv-ops__vd-cell" key={s.label}>
            <span className="fv-ops__vd-cell-label">{s.label}</span>
            <span className="fv-ops__vd-cell-value">{s.value}</span>
          </div>
        ))}
      </div>

      {/* Editable detail cards */}
      <div className="fv-ops__vd-grid">
        <Card title="Fixture & Vessel" icon="fa-ship">
          <div className="fv-ops__vd-fields">
            <label className="fv-ops__vd-field">
              <span>Vessel Name</span>
              <input className="fv-ops__vd-in fv-ops__vd-in--accent" value={recap.vesselName} onChange={(e) => set('vesselName', e.target.value)} />
            </label>
            <VdField
              label="Vessel Email"
              value={recap.vesselEmail}
              onChange={(v) => { set('vesselEmail', v); syncVesselEmail(v); }}
              placeholder="master.vessel@…"
            />
            <VdSelect label="Voyage / Fix Type" value={recap.voyageFixType} onChange={(v) => set('voyageFixType', v)} options={FIX_TYPE_FILTER_OPTIONS} />
            <VdField label="Cargo Name" value={recap.cargoName} onChange={(v) => set('cargoName', v)} accent />
            <VdValueUnit label="CP Quantity" value={recap.cpQuantity} onValue={(v) => set('cpQuantity', v)} unit={recap.cargoQtyUnit} onUnit={(v) => set('cargoQtyUnit', v)} units={OPS_QTY_UNITS} />
            <VdValueUnit label="Final Qty Loaded / BL" value={recap.finalQtyLoaded} onValue={(v) => set('finalQtyLoaded', v)} unit={recap.cargoQtyUnit} onUnit={(v) => set('cargoQtyUnit', v)} units={OPS_QTY_UNITS} accent num />
            <VdField label="Hold Cleaning" value={recap.holdCleaning} onChange={(v) => set('holdCleaning', v)} />
          </div>
        </Card>

        <Card title="Head Charter — Owners" icon="fa-building">
          <div className="fv-ops__vd-fields">
            <VdCombo label="Owners" value={recap.owners} onChange={(v) => set('owners', v)} options={ownerNames} listId="vd-owners" accent />
            <VdCombo label="Owners Broker" value={recap.ownersBroker} onChange={(v) => set('ownersBroker', v)} options={brokerNames} listId="vd-brokers" />
            <VdField label="CP Date" value={recap.cpDate} onChange={(v) => set('cpDate', v)} placeholder="dd-mm-yyyy" />
            <VdDateTime label="Laycan Start" value={recap.laycanStart} onChange={(v) => set('laycanStart', v)} />
            <VdDateTime label="Laycan End" value={recap.laycanEnd} onChange={(v) => set('laycanEnd', v)} />
            <VdValueUnit label="Hire Per Day (PDPR)" value={recap.hirePerDay} onValue={(v) => set('hirePerDay', v)} unit={recap.hireCurrency} onUnit={(v) => set('hireCurrency', v)} units={OPS_CURRENCIES} accent num />
          </div>
          <div className="fv-ops__vd-sub">
            <div className="fv-ops__vd-sub-head"><i className="fas fa-money-check-dollar" aria-hidden="true" /> Hire Payment</div>
            <div className="fv-ops__vd-inline">
              <span>1st hire covers</span>
              <select className="fv-ops__vd-unit" value={recap.firstHirePeriodDays} onChange={(e) => set('firstHirePeriodDays', e.target.value)}>{OPS_HIRE_INTERVALS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
              <span>days (incl. bunkers), payable within</span>
              <select className="fv-ops__vd-unit" value={recap.firstHireDays} onChange={(e) => set('firstHireDays', e.target.value)}>{OPS_BANKING_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
              <select className="fv-ops__vd-unit fv-ops__vd-unit--wide" value={recap.firstHireBasis} onChange={(e) => set('firstHireBasis', e.target.value)}>{OPS_PAYMENT_BASES.map((b) => <option key={b} value={b}>{b}</option>)}</select>
              <span>, then every</span>
              <select className="fv-ops__vd-unit" value={recap.hireEveryDays} onChange={(e) => set('hireEveryDays', e.target.value)}>{OPS_HIRE_INTERVALS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
              <span>days in advance</span>
            </div>
          </div>
        </Card>

        <Card title="Sub Charter — Charterers" icon="fa-handshake">
          <div className="fv-ops__vd-fields">
            <VdCombo label="Charterers" value={recap.charterers} onChange={(v) => set('charterers', v)} options={chartererNames} listId="vd-charterers" accent />
            <VdCombo label="Charterers Broker" value={recap.charterersBroker} onChange={(v) => set('charterersBroker', v)} options={brokerNames} listId="vd-brokers2" />
            <VdField label="Charterers CP Date" value={recap.charterersCpDate} onChange={(v) => set('charterersCpDate', v)} placeholder="dd-mm-yyyy" />
            <VdDateTime label="Charterers Laycan Start" value={recap.charterersLaycanStart} onChange={(v) => set('charterersLaycanStart', v)} />
            <VdDateTime label="Charterers Laycan End" value={recap.charterersLaycanEnd} onChange={(v) => set('charterersLaycanEnd', v)} />
            <VdValueUnit label="Freight / MT" value={recap.freightPerMt} onValue={(v) => set('freightPerMt', v)} unit={recap.freightCurrency} onUnit={(v) => set('freightCurrency', v)} units={OPS_CURRENCIES} accent num />
          </div>
          <div className="fv-ops__vd-sub">
            <div className="fv-ops__vd-sub-head"><i className="fas fa-file-invoice-dollar" aria-hidden="true" /> Freight Payment</div>
            <div className="fv-ops__vd-inline">
              <span>Within</span>
              <select className="fv-ops__vd-unit" value={recap.freightPaymentDays} onChange={(e) => set('freightPaymentDays', e.target.value)}>{OPS_BANKING_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
              <select className="fv-ops__vd-unit fv-ops__vd-unit--wide" value={recap.freightPaymentBasis} onChange={(e) => set('freightPaymentBasis', e.target.value)}>{OPS_PAYMENT_BASES.map((b) => <option key={b} value={b}>{b}</option>)}</select>
              <span>after loading / BL</span>
            </div>
          </div>
        </Card>

        <Card title="Delivery / Redelivery" icon="fa-clock">
          <div className="fv-ops__vd-fields">
            <VdField label="Delivery Port" value={recap.deliveryPort} onChange={(v) => set('deliveryPort', v)} accent />
            <VdCombo label="Delivery Term" value={recap.deliveryTerm} onChange={(v) => set('deliveryTerm', v)} options={OPS_BERTH_TERMS} listId="vd-delterm" />
            <VdDateTime label="Delivery Date / Time" value={recap.deliveryDateTime} onChange={(v) => set('deliveryDateTime', v)} accent />
            <VdField label="Redelivery Port" value={recap.redeliveryPort} onChange={(v) => set('redeliveryPort', v)} accent />
            <VdCombo label="Redelivery Term" value={recap.redeliveryTerm} onChange={(v) => set('redeliveryTerm', v)} options={OPS_BERTH_TERMS} listId="vd-redelterm" />
            <VdDateTime label="Redelivery Date / Time" value={recap.redeliveryDateTime} onChange={(v) => set('redeliveryDateTime', v)} accent />
          </div>
          <div className="fv-ops__vd-sub">
            <div className="fv-ops__vd-sub-head"><i className="fas fa-bell" aria-hidden="true" /> Delivery Notices — from Owners (days)</div>
            <div className="fv-ops__vd-chips">
              {delNotices.length === 0 && <span className="fv-ops__vd-empty">No notices set</span>}
              {delNotices.map((d) => (
                <span key={d} className="fv-ops__vd-chip">
                  {d}
                  <button type="button" aria-label={`Remove ${d} day delivery notice`} onClick={() => setDelNotices(delNotices.filter((x) => x !== d))}><i className="fas fa-xmark" aria-hidden="true" /></button>
                </span>
              ))}
              <select className="fv-ops__vd-unit" value="" aria-label="Add delivery notice" onChange={(e) => { if (e.target.value) { setDelNotices([...delNotices, parseInt(e.target.value, 10)]); e.currentTarget.value = ''; } }}>
                <option value="">＋ Add</option>
                {OPS_NOTICE_DAYS.filter((d) => !delNotices.includes(d)).map((d) => <option key={d} value={d}>{d} days</option>)}
              </select>
            </div>
          </div>
          <div className="fv-ops__vd-sub">
            <div className="fv-ops__vd-sub-head"><i className="fas fa-bell-slash" aria-hidden="true" /> Redelivery Notices — to Charterers &amp; Owners (days)</div>
            <div className="fv-ops__vd-chips">
              {notices.length === 0 && <span className="fv-ops__vd-empty">No notices set</span>}
              {notices.map((d) => (
                <span key={d} className="fv-ops__vd-chip">
                  {d}
                  <button type="button" aria-label={`Remove ${d} day notice`} onClick={() => setNotices(notices.filter((x) => x !== d))}><i className="fas fa-xmark" aria-hidden="true" /></button>
                </span>
              ))}
              <select className="fv-ops__vd-unit" value="" aria-label="Add redelivery notice" onChange={(e) => { if (e.target.value) { setNotices([...notices, parseInt(e.target.value, 10)]); e.currentTarget.value = ''; } }}>
                <option value="">＋ Add</option>
                {OPS_NOTICE_DAYS.filter((d) => !notices.includes(d)).map((d) => <option key={d} value={d}>{d} days</option>)}
              </select>
            </div>
          </div>
        </Card>

        <Card title="Commercial Terms" icon="fa-file-contract">
          <div className="fv-ops__vd-fields">
            <VdField label="ILOHC" value={recap.ilohc} onChange={(v) => set('ilohc', v)} num />
            <VdField label="CVE (per month)" value={recap.cve} onChange={(v) => set('cve', v)} num />
            <VdField label="ADCOM" value={recap.adcom} onChange={(v) => set('adcom', v)} placeholder="e.g. 3.75%" />
            <VdField label="Brokerage" value={recap.brokerage} onChange={(v) => set('brokerage', v)} />
            <VdField label="Ballast Bonus" value={recap.ballastBonus} onChange={(v) => set('ballastBonus', v)} num />
            <VdField label="Demurrage / Day" value={recap.demDespatch} onChange={(v) => set('demDespatch', v)} num />
            <VdSelect label="Despatch" value={recap.despatchTerm} onChange={(v) => set('despatchTerm', v)} options={OPS_DESPATCH_TERMS} />
            <VdField label="WX Clause" value={recap.wxClause} onChange={(v) => set('wxClause', v)} />
            <VdField label="Hull Cleaning Clause" value={recap.hullCleaningClause} onChange={(v) => set('hullCleaningClause', v)} />
          </div>
        </Card>

        <Card title="Load & Discharge Ports" icon="fa-anchor">
          <div className="fv-ops__vd-fields">
            <VdField label="Load Port" value={recap.loadPort} onChange={(v) => set('loadPort', v)} accent />
            <VdCombo label="NOR at Load Port" value={recap.norAtLoadPort} onChange={(v) => set('norAtLoadPort', v)} options={OPS_NOR_TENDER_TERMS} listId="vd-nor-load" />
            <VdField label="Load Rate" value={recap.loadRate} onChange={(v) => set('loadRate', v)} />
            <VdField label="PDA Load Port" value={recap.pdaLoadPort} onChange={(v) => set('pdaLoadPort', v)} />
            <VdField label="Discharge Port" value={recap.dischargePort} onChange={(v) => set('dischargePort', v)} accent />
            <VdCombo label="NOR at D.Port" value={recap.norAtDPort} onChange={(v) => set('norAtDPort', v)} options={OPS_NOR_TENDER_TERMS} listId="vd-nor-disch" />
            <VdField label="Disch. Rate" value={recap.dischRate} onChange={(v) => set('dischRate', v)} />
            <VdField label="PDA D.Port" value={recap.pdaDPort} onChange={(v) => set('pdaDPort', v)} />
            <VdField label="LOI / OBL at D.Port" value={recap.loiOblDPort} onChange={(v) => set('loiOblDPort', v)} />
          </div>
        </Card>

        <BunkersCard recap={recap} setRecap={setRecap} />

        <Card
          title="Service Providers"
          icon="fa-user-gear"
          wide
          right={<button type="button" className="fv-ops__btn" onClick={() => setSPs([...sps, { type: SERVICE_PROVIDER_TYPES[0], name: '', email: '' }])}><i className="fas fa-plus" aria-hidden="true" /> Add</button>}
        >
          {sps.length === 0 ? (
            <p className="fv-ops__vd-empty">No service providers assigned. Use “Add” to link a bunker surveyor, agent, etc. from Settings → Service Provider Details.</p>
          ) : (
            <div className="fv-ops__vd-sp">
              {sps.map((sp, i) => (
                <div className="fv-ops__vd-sp-row" key={i}>
                  <select className="fv-ops__vd-in" value={sp.type} onChange={(e) => updSP(i, { type: e.target.value })}>
                    {SERVICE_PROVIDER_TYPES.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
                  </select>
                  <input className="fv-ops__vd-in" list={`vd-sp-${i}`} value={sp.name} placeholder="Company name…" onChange={(e) => updSP(i, { name: e.target.value })} />
                  <datalist id={`vd-sp-${i}`}>{spNamesFor(sp.type).map((n) => <option key={n} value={n} />)}</datalist>
                  <input className="fv-ops__vd-in" type="email" value={sp.email} placeholder="email@company.com" onChange={(e) => { updSP(i, { email: e.target.value }); syncServiceProviderEmail(sp.type, sp.name, e.target.value); }} />
                  <button type="button" className="fv-ops__vd-sp-rm" aria-label="Remove provider" onClick={() => setSPs(sps.filter((_, idx) => idx !== i))}><i className="fas fa-trash" aria-hidden="true" /></button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Timeline */}
      <Card title="Timeline" icon="fa-timeline">
        <div className="fv-ops__milestones">
          {milestones.map((m) => (
            <div className={`fv-ops__ms fv-ops__ms--${m.state}`} key={m.label}>
              <span className="fv-ops__ms-dot"><i className={`fas ${m.icon}`} aria-hidden="true" /></span>
              <span className="fv-ops__ms-label">{m.label}</span>
              <span className="fv-ops__ms-date">{m.date}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/** Bunkering figures per fuel grade + a one-line bunker specs field. */
function BunkersCard({ recap, setRecap }: { recap: Recap; setRecap: Dispatch<SetStateAction<Recap>> }) {
  const fuels = recap.bunkers;
  const setFuel = (i: number, k: keyof BunkerFuel, v: string) =>
    setRecap((r) => ({ ...r, bunkers: r.bunkers.map((f, idx) => (idx === i ? { ...f, [k]: v } : f)) }));
  const addFuel = (grade = '') =>
    setRecap((r) => ({ ...r, bunkers: [...r.bunkers, { fuel: grade, bod: '', expBor: '', cpPrice: '', bookedPrice: '', masterReq: '', actualSupply: '', actualBor: '' }] }));
  const removeFuel = (i: number) =>
    setRecap((r) => ({ ...r, bunkers: r.bunkers.filter((_, idx) => idx !== i) }));
  // 5% margin on the BOD qty, both down (−5%) and up (+5%), stacked vertically.
  const margin = (v: string) => {
    const n = parseFloat((v || '').replace(/,/g, ''));
    if (!Number.isFinite(n)) return <span>—</span>;
    return (
      <span className="fv-ops__bnk-margin">
        <span className="fv-ops__bnk-margin-up">+5% {(n * 1.05).toFixed(2)}</span>
        <span className="fv-ops__bnk-margin-dn">−5% {(n * 0.95).toFixed(2)}</span>
      </span>
    );
  };
  const rows: { key: keyof BunkerFuel; label: string }[] = [
    { key: 'bod', label: 'BOD (MT)' },
    { key: 'expBor', label: 'Expected BOR (MT)' },
    { key: 'cpPrice', label: 'CP Price (USD)' },
    { key: 'bookedPrice', label: 'Booked Price (USD)' },
    { key: 'masterReq', label: 'Master Requirement (MT)' },
    { key: 'actualSupply', label: 'Actual Supply (MT)' },
    { key: 'actualBor', label: 'Actual BOR (MT)' },
  ];
  // Expected BOR mirrors the end ROB from the ETA & ROB itinerary (matched by fuel).
  const endRob = etaEndRob(recap.etaPlan);
  const derivedBor = (fuel: string): number | null => {
    const f = (fuel || '').trim().toUpperCase();
    if (f === 'VLSFO') return endRob.v;
    if (f === 'MGO' || f === 'LSMGO') return endRob.m;
    return null;
  };
  return (
    <Card
      title="Bunkers"
      icon="fa-gas-pump"
      span2
      right={(
        <select
          className="fv-ops__vd-unit fv-ops__vd-unit--wide"
          value=""
          aria-label="Add fuel grade"
          onChange={(e) => { if (e.target.value) { addFuel(e.target.value === '__other' ? '' : e.target.value); e.currentTarget.value = ''; } }}
        >
          <option value="">＋ Add fuel</option>
          {OPS_FUEL_GRADES.filter((g) => !fuels.some((f) => f.fuel === g)).map((g) => <option key={g} value={g}>{g}</option>)}
          <option value="__other">Other…</option>
        </select>
      )}
    >
      <label className="fv-ops__vd-field fv-ops__bnk-specs">
        <span>Bunker Specs</span>
        <input className="fv-ops__vd-in" value={recap.bunkerSpecs} placeholder="e.g. VLSFO max 0.50% S · MGO max 0.10% S" onChange={(e) => setRecap((r) => ({ ...r, bunkerSpecs: e.target.value }))} />
      </label>
      <table className="fv-ops__bnk">
        <thead>
          <tr>
            <th aria-label="Item" />
            {fuels.map((f, i) => (
              <th key={i}>
                <span className="fv-ops__bnk-fuelhd">
                  <input className="fv-ops__vd-in" list="ops-fuel-grades" value={f.fuel} placeholder="Fuel" onChange={(e) => setFuel(i, 'fuel', e.target.value)} />
                  {fuels.length > 1 && (
                    <button type="button" className="fv-ops__bnk-rm" aria-label="Remove fuel" onClick={() => removeFuel(i)}><i className="fas fa-xmark" aria-hidden="true" /></button>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              {fuels.map((f, i) => {
                if (row.key === 'expBor') {
                  const d = derivedBor(f.fuel);
                  if (d != null) {
                    return <td key={i} className="fv-ops__bnk-derived" title="Linked to ETA & ROB itinerary end ROB">{fmt(d, 2)}</td>;
                  }
                }
                return <td key={i}><input className="fv-ops__vd-in" inputMode="decimal" value={f[row.key]} onChange={(e) => setFuel(i, row.key, e.target.value)} /></td>;
              })}
            </tr>
          ))}
          <tr className="fv-ops__bnk-marginrow">
            <th scope="row">5% Margin (BOD)</th>
            {fuels.map((f, i) => (
              <td key={i} className="fv-ops__bnk-calc">{margin(f.bod)}</td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="fv-ops__hint"><i className="fas fa-link" aria-hidden="true" /> Expected BOR (VLSFO / MGO) is linked to the end ROB projected in the ETA &amp; ROB itinerary.</p>
      <datalist id="ops-fuel-grades">{OPS_FUEL_GRADES.map((g) => <option key={g} value={g} />)}</datalist>
    </Card>
  );
}

/** Build the voyage milestone timeline, marking the active stage from the voyage status. */
function buildMilestones(recap: Recap, voyage: Voyage, statusOverride?: string): { label: string; date: string; icon: string; state: 'done' | 'current' | 'todo' }[] {
  const stages = [
    { label: 'Fixed', date: recap.cpDate || '—', icon: 'fa-file-signature' },
    { label: 'NOR', date: recap.norAtLoadPort || '—', icon: 'fa-flag' },
    { label: 'ETD', date: voyage.etdDisplay || recap.deliveryDateTime || '—', icon: 'fa-arrow-up-from-bracket' },
    { label: 'At Sea', date: voyage.lastNoon || '—', icon: 'fa-water' },
    { label: 'ETA', date: voyage.eta || '—', icon: 'fa-anchor' },
    { label: 'Discharge', date: recap.redeliveryDateTime || '—', icon: 'fa-arrow-down-to-bracket' },
    { label: 'Completion', date: recap.redeliveryDateTime || '—', icon: 'fa-circle-check' },
  ];
  const status = (statusOverride || voyage.status || '').toLowerCase();
  let active = 3; // default: At Sea
  if (status.includes('load')) active = 1;
  else if (status.includes('port') || status.includes('berth')) active = 2;
  else if (status.includes('sea') || status.includes('voyage') || status.includes('transit')) active = 3;
  else if (status.includes('disch')) active = 5;
  else if (status.includes('complete') || status.includes('redeliver')) active = 6;
  return stages.map((s, i) => ({ ...s, state: i < active ? 'done' : i === active ? 'current' : 'todo' }));
}

/* ------------------------------------------------------------ Live P&L tab */

type PnlKind = 'income' | 'cost' | 'result' | 'neutral';
interface PnlItem { label: string; est: number; act: number; kind: PnlKind }

function pnlTone(kind: PnlKind, delta: number): 'good' | 'bad' | 'flat' {
  if (kind === 'neutral' || Math.abs(delta) < 0.5) return 'flat';
  const good = kind === 'cost' ? delta < 0 : delta > 0;
  return good ? 'good' : 'bad';
}

function PnlTab({ recap, set, setRecap, pnl, estPnl }: { recap: Recap; set: (k: keyof Recap, v: string) => void; setRecap: Dispatch<SetStateAction<Recap>>; pnl: Pnl; estPnl: Pnl }) {
  const pctOf = (delta: number, est: number) => (est !== 0 ? (delta / Math.abs(est)) * 100 : delta !== 0 ? 100 : 0);
  const signed = (n: number) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;
  const signedPct = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n), 1)}%`;
  const setNote = (label: string, v: string) => setRecap((r) => ({ ...r, pnlNotes: { ...r.pnlNotes, [label]: v } }));

  const revenueItems: PnlItem[] = [
    { label: 'Freight', est: estPnl.freight, act: pnl.freight, kind: 'income' },
    { label: 'Demurrage / Despatch', est: estPnl.demDespatch, act: pnl.demDespatch, kind: 'income' },
    { label: 'Misc Income', est: estPnl.miscIncome, act: pnl.miscIncome, kind: 'income' },
  ];
  const costItems: PnlItem[] = [
    { label: 'Hire Cost', est: estPnl.totalHire, act: pnl.totalHire, kind: 'cost' },
    { label: 'Bunker Cost', est: estPnl.bunkerCost, act: pnl.bunkerCost, kind: 'cost' },
    { label: 'Port DA (Load + Disch)', est: estPnl.portCost, act: pnl.portCost, kind: 'cost' },
    { label: 'C.V.E.', est: estPnl.cveTotal, act: pnl.cveTotal, kind: 'cost' },
    { label: 'ILOHC', est: estPnl.ilohc, act: pnl.ilohc, kind: 'cost' },
    { label: 'Other Cost', est: estPnl.otherCost, act: pnl.otherCost, kind: 'cost' },
  ];
  const resultItems: PnlItem[] = [
    { label: 'Revenue', est: estPnl.revenue, act: pnl.revenue, kind: 'income' },
    { label: 'Total Expense', est: estPnl.totalExpense, act: pnl.totalExpense, kind: 'cost' },
    { label: 'Profit', est: estPnl.profit, act: pnl.profit, kind: 'result' },
    { label: 'Profit / Day', est: estPnl.dailyProfit, act: pnl.dailyProfit, kind: 'result' },
    { label: 'TCE / Day', est: estPnl.tce, act: pnl.tce, kind: 'result' },
    { label: 'Voyage Days', est: estPnl.days, act: pnl.days, kind: 'neutral' },
  ];

  const vRow = (it: PnlItem) => {
    const delta = it.act - it.est;
    const t = pnlTone(it.kind, delta);
    const flat = Math.abs(delta) < 0.5;
    return (
      <tr key={it.label}>
        <td className="fv-ops__pnl-lbl">{it.label}</td>
        <td className="fv-ops__r">{money(it.est)}</td>
        <td className="fv-ops__r fv-ops__pnl-act">{money(it.act)}</td>
        <td className={`fv-ops__r fv-ops__pnl-delta--${t}`}>{flat ? '—' : signed(delta)}</td>
        <td className={`fv-ops__r fv-ops__pnl-delta--${t}`}>{flat ? '' : signedPct(pctOf(delta, it.est))}</td>
        <td className="fv-ops__pnl-note">
          <input className="fv-ops__vd-in" value={recap.pnlNotes?.[it.label] ?? ''} placeholder="Add note…" onChange={(e) => setNote(it.label, e.target.value)} />
        </td>
      </tr>
    );
  };

  const tiles: { label: string; est: number; act: number; kind: PnlKind; icon: string }[] = [
    { label: 'Profit', est: estPnl.profit, act: pnl.profit, kind: 'result', icon: 'fa-sack-dollar' },
    { label: 'TCE / Day', est: estPnl.tce, act: pnl.tce, kind: 'result', icon: 'fa-gauge-high' },
    { label: 'Revenue', est: estPnl.revenue, act: pnl.revenue, kind: 'income', icon: 'fa-hand-holding-dollar' },
    { label: 'Total Cost', est: estPnl.totalExpense, act: pnl.totalExpense, kind: 'cost', icon: 'fa-file-invoice-dollar' },
  ];

  const ranked = [...revenueItems, ...costItems]
    .map((it) => ({ ...it, delta: it.act - it.est, t: pnlTone(it.kind, it.act - it.est) }))
    .filter((it) => Math.abs(it.delta) >= 1);
  const worse = ranked.filter((i) => i.t === 'bad').sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const better = ranked.filter((i) => i.t === 'good').sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const profitDelta = pnl.profit - estPnl.profit;
  const profitT = pnlTone('result', profitDelta);

  // Expenses breakdown (actual) — dependency-free stacked bar + legend.
  const expSegments = [
    { label: 'Hire', val: pnl.totalHire, color: '#3b82f6' },
    { label: 'Bunkers', val: pnl.bunkerCost, color: '#ef4444' },
    { label: 'Port DA', val: pnl.portCost, color: '#8b5cf6' },
    { label: 'C.V.E.', val: pnl.cveTotal, color: '#22c55e' },
    { label: 'ILOHC', val: pnl.ilohc, color: '#f59e0b' },
    { label: 'Other', val: pnl.otherCost, color: '#14b8a6' },
  ].filter((e) => e.val > 0);
  const expTotal = expSegments.reduce((s, e) => s + e.val, 0) || 1;

  return (
    <div className="fv-ops__pnl">
      {/* Headline banner — actual profit vs estimate */}
      <div className={`fv-ops__pnl-banner fv-ops__pnl-banner--${profitT}`}>
        <div className="fv-ops__pnl-banner-main">
          <span className="fv-ops__pnl-banner-label">Actual Profit</span>
          <span className={`fv-ops__pnl-banner-val fv-ops__pnl-delta--${pnl.profit >= 0 ? 'good' : 'bad'}`}>{money(pnl.profit)}</span>
        </div>
        <div className="fv-ops__pnl-banner-side">
          <span>Estimated <b>{money(estPnl.profit)}</b></span>
          <span className={`fv-ops__pnl-chip fv-ops__pnl-chip--${profitT}`}>
            <i className={`fas ${profitDelta >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}`} aria-hidden="true" />
            {Math.abs(profitDelta) < 0.5 ? 'On plan' : `${signed(profitDelta)} · ${signedPct(pctOf(profitDelta, estPnl.profit))}`}
          </span>
        </div>
      </div>

      {/* Headline comparison tiles */}
      <div className="fv-ops__pnl-tiles">
        {tiles.map((tl) => {
          const delta = tl.act - tl.est;
          const t = pnlTone(tl.kind, delta);
          return (
            <div key={tl.label} className={`fv-ops__pnl-tile fv-ops__pnl-tile--${t}`}>
              <span className="fv-ops__pnl-tile-head"><i className={`fas ${tl.icon}`} aria-hidden="true" /> {tl.label}</span>
              <span className="fv-ops__pnl-tile-act">{money(tl.act)}</span>
              <span className="fv-ops__pnl-tile-est">Est {money(tl.est)}</span>
              <span className={`fv-ops__pnl-chip fv-ops__pnl-chip--${t}`}>{Math.abs(delta) < 0.5 ? 'On plan' : `${signed(delta)} · ${signedPct(pctOf(delta, tl.est))}`}</span>
            </div>
          );
        })}
      </div>

      {/* Breakdown table + highlights */}
      <div className="fv-ops__pnl-cols">
        <Card title="Estimate vs Actual — Breakdown" icon="fa-scale-balanced">
          <table className="fv-ops__pnl-table">
            <thead>
              <tr>
                <th />
                <th className="fv-ops__r">Estimate</th>
                <th className="fv-ops__r">Actual</th>
                <th className="fv-ops__r">Δ</th>
                <th className="fv-ops__r">Δ%</th>
                <th>Status / Note</th>
              </tr>
            </thead>
            <tbody>
              <tr className="fv-ops__pnl-group"><td colSpan={6}>Revenue</td></tr>
              {revenueItems.map(vRow)}
              <tr className="fv-ops__pnl-group"><td colSpan={6}>Costs</td></tr>
              {costItems.map(vRow)}
              <tr className="fv-ops__pnl-group"><td colSpan={6}>Result</td></tr>
              {resultItems.map(vRow)}
            </tbody>
          </table>
          <p className="fv-ops__hint">Green = better than estimate · Red = worse than estimate. Costs are “better” when lower; revenue &amp; profit when higher.</p>
        </Card>

        <div className="fv-ops__pnl-side">
          <Card title="Highlights" icon="fa-triangle-exclamation">
            <div className="fv-ops__pnl-hl">
              <div className="fv-ops__pnl-hl-head fv-ops__pnl-hl-head--bad"><i className="fas fa-circle-exclamation" aria-hidden="true" /> Not as expected</div>
              {worse.length === 0 ? (
                <p className="fv-ops__vd-empty">Nothing worse than estimate.</p>
              ) : (
                <ul className="fv-ops__pnl-hl-list">
                  {worse.slice(0, 5).map((i) => (
                    <li key={i.label}><span>{i.label}</span><span className="fv-ops__pnl-delta--bad">{signed(i.delta)}</span></li>
                  ))}
                </ul>
              )}
              <div className="fv-ops__pnl-hl-head fv-ops__pnl-hl-head--good"><i className="fas fa-circle-check" aria-hidden="true" /> Better than estimate</div>
              {better.length === 0 ? (
                <p className="fv-ops__vd-empty">No gains vs estimate yet.</p>
              ) : (
                <ul className="fv-ops__pnl-hl-list">
                  {better.slice(0, 5).map((i) => (
                    <li key={i.label}><span>{i.label}</span><span className="fv-ops__pnl-delta--good">{signed(i.delta)}</span></li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card title="Expenses Breakdown (Actual)" icon="fa-chart-pie">
            {expSegments.length === 0 ? (
              <p className="fv-ops__vd-empty">No expenses recorded yet.</p>
            ) : (
              <>
                <div className="fv-ops__pnl-bar" role="img" aria-label="Expenses breakdown">
                  {expSegments.map((e) => (
                    <span key={e.label} className="fv-ops__pnl-bar-seg" style={{ width: `${(e.val / expTotal) * 100}%`, background: e.color }} title={`${e.label} ${money(e.val)}`} />
                  ))}
                </div>
                <ul className="fv-ops__pnl-legend">
                  {expSegments.map((e) => (
                    <li key={e.label}>
                      <span className="fv-ops__pnl-legend-dot" style={{ background: e.color }} />
                      <span className="fv-ops__pnl-legend-lbl">{e.label}</span>
                      <b>{money(e.val)}</b>
                      <em>{fmt((e.val / expTotal) * 100, 1)}%</em>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>
      </div>

      {/* Editable actuals — shared recap keys, so edits sync to Voyage Details too */}
      <Card title="Update Actuals" icon="fa-pen-to-square">
        <p className="fv-ops__hint fv-ops__pnl-actuals-note">
          <i className="fas fa-link" aria-hidden="true" /> Values entered here update the same fields everywhere in the voyage (Voyage Details, recap &amp; reports). The Actual column and variances refresh live.
        </p>

        <div className="fv-ops__vd-sub">
          <div className="fv-ops__vd-sub-head"><i className="fas fa-sack-dollar" aria-hidden="true" /> Revenue</div>
          <div className="fv-ops__vd-fields">
            <VdValueUnit label="Freight / MT" value={recap.freightPerMt} onValue={(v) => set('freightPerMt', v)} unit={recap.freightCurrency} onUnit={(v) => set('freightCurrency', v)} units={OPS_CURRENCIES} accent num />
            <VdValueUnit label="Final Qty Loaded / BL" value={recap.finalQtyLoaded} onValue={(v) => set('finalQtyLoaded', v)} unit={recap.cargoQtyUnit} onUnit={(v) => set('cargoQtyUnit', v)} units={OPS_QTY_UNITS} num />
            <VdField label="Demurrage / Despatch" value={recap.demDespatch} onChange={(v) => set('demDespatch', v)} num />
            <VdField label="Misc Income" value={recap.miscIncome} onChange={(v) => set('miscIncome', v)} num />
          </div>
        </div>

        <div className="fv-ops__vd-sub">
          <div className="fv-ops__vd-sub-head"><i className="fas fa-file-invoice-dollar" aria-hidden="true" /> Costs</div>
          <div className="fv-ops__vd-fields">
            <VdValueUnit label="Hire / Day" value={recap.hirePerDay} onValue={(v) => set('hirePerDay', v)} unit={recap.hireCurrency} onUnit={(v) => set('hireCurrency', v)} units={OPS_CURRENCIES} num />
            <VdField label="Port DA — Load" value={recap.portDaLoad} onChange={(v) => set('portDaLoad', v)} num />
            <VdField label="Port DA — Disch" value={recap.portDaDisch} onChange={(v) => set('portDaDisch', v)} num />
            <VdField label="C.V.E." value={recap.cve} onChange={(v) => set('cve', v)} num />
            <VdField label="ILOHC" value={recap.ilohc} onChange={(v) => set('ilohc', v)} num />
            <VdField label="Other Cost" value={recap.otherCost} onChange={(v) => set('otherCost', v)} num />
          </div>
        </div>

        <div className="fv-ops__vd-sub">
          <div className="fv-ops__vd-sub-head"><i className="fas fa-gas-pump" aria-hidden="true" /> Bunkers Consumed</div>
          <div className="fv-ops__vd-fields">
            <VdField label="FO Cons (MT)" value={recap.foCons} onChange={(v) => set('foCons', v)} num />
            <VdField label="FO Price / MT" value={recap.foPrice} onChange={(v) => set('foPrice', v)} num />
            <VdField label="DO Cons (MT)" value={recap.doCons} onChange={(v) => set('doCons', v)} num />
            <VdField label="DO Price / MT" value={recap.doPrice} onChange={(v) => set('doPrice', v)} num />
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ ETA & ROB tab */

function EtaRobTab({ recap, setRecap }: { recap: Recap; setRecap: Dispatch<SetStateAction<Recap>> }) {
  const plan = recap.etaPlan;
  const setPlan = (patch: Partial<EtaPlan>) => setRecap((r) => ({ ...r, etaPlan: { ...r.etaPlan, ...patch } }));
  const setPerf = (patch: Partial<EtaPerf>) => setPlan({ perf: { ...plan.perf, ...patch } });
  const setMain = (which: 'mainNormal' | 'mainEca', patch: Partial<EtaMainCons>) => setPerf({ [which]: { ...plan.perf[which], ...patch } } as Partial<EtaPerf>);
  const setSub = (which: 'subNormal' | 'subEca', patch: Partial<EtaSubCons>) => setPerf({ [which]: { ...plan.perf[which], ...patch } } as Partial<EtaPerf>);
  const setSpeedMode = (mode: string) => setPerf({ speedMode: mode });
  const patchActiveSpeed = (patch: Partial<EtaSpeedSet>) => {
    const m = plan.perf.speedMode;
    if (m === 'Full') setPerf({ full: { ...plan.perf.full, ...patch } });
    else if (m === 'Eco') setPerf({ eco: { ...plan.perf.eco, ...patch } });
    else setPerf({ customs: plan.perf.customs.map((c) => (c.id === m ? { ...c, ...patch } : c)) });
  };
  const addCustomSpeed = () =>
    setRecap((r) => {
      const p = r.etaPlan.perf;
      const id = `sp-${Date.now()}`;
      const custom: EtaCustomSpeed = { id, name: `Custom ${p.customs.length + 1}`, ballast: p.full.ballast, laden: p.full.laden };
      return { ...r, etaPlan: { ...r.etaPlan, perf: { ...p, customs: [...p.customs, custom], speedMode: id } } };
    });
  const renameCustom = (id: string, name: string) => setPerf({ customs: plan.perf.customs.map((c) => (c.id === id ? { ...c, name } : c)) });
  const removeCustom = (id: string) => setPerf({ customs: plan.perf.customs.filter((c) => c.id !== id), speedMode: plan.perf.speedMode === id ? 'Full' : plan.perf.speedMode });
  const setLeg = (i: number, patch: Partial<EtaLeg>) =>
    setRecap((r) => ({ ...r, etaPlan: { ...r.etaPlan, legs: r.etaPlan.legs.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) } }));
  const addLeg = (kind: 'sea' | 'port') =>
    setRecap((r) => {
      const p = r.etaPlan;
      const last = p.legs[p.legs.length - 1];
      const d = legDefaults(p.perf);
      const leg: EtaLeg = {
        from: last?.to ?? '', to: '', kind,
        distNonEca: '0', distEca: '0',
        speed: kind === 'sea' ? d.speed : '',
        wf: kind === 'sea' ? p.weatherMargin : '',
        portDays: kind === 'port' ? '1' : '',
        consVlsfo: kind === 'sea' ? d.seaV : d.portV,
        consMgo: kind === 'sea' ? d.seaM : d.portM,
        supVlsfo: '', supMgo: '', tz: last?.tz ?? '+0',
      };
      return { ...r, etaPlan: { ...p, legs: [...p.legs, leg] } };
    });
  const removeLeg = (i: number) =>
    setRecap((r) => ({ ...r, etaPlan: { ...r.etaPlan, legs: r.etaPlan.legs.filter((_, idx) => idx !== i) } }));
  // Push the instructed speed / cons profile onto every leg (per kind).
  const applyInstructed = () =>
    setRecap((r) => {
      const p = r.etaPlan;
      const d = legDefaults(p.perf);
      const legs = p.legs.map((l) => l.kind === 'sea'
        ? { ...l, speed: d.speed, consVlsfo: d.seaV, consMgo: d.seaM }
        : { ...l, consVlsfo: d.portV, consMgo: d.portM });
      return { ...r, etaPlan: { ...p, legs } };
    });

  const p2 = (n: number) => String(n).padStart(2, '0');
  const fmtDT = (d: Date | null) => (d ? `${p2(d.getDate())}-${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}` : '—');
  // Regenerate the leg list from the voyage's actual port rotation.
  const rebuildFromPorts = () =>
    setPlan({ legs: buildItineraryLegs(recap.deliveryPort, recap.loadPort, recap.dischargePort, recap.redeliveryPort, { ...legDefaults(plan.perf), wf: plan.weatherMargin, tz: plan.legs[0]?.tz ?? '+0' }) });

  // Sequential projection: dep = previous arrival, ROB carried forward.
  const computed = projectEtaLegs(plan);
  const endV = computed.length ? computed[computed.length - 1].robV : num(plan.startRobVlsfo);
  const endM = computed.length ? computed[computed.length - 1].robM : num(plan.startRobMgo);

  const arrDest = computed.length ? computed[computed.length - 1].arr : null;
  const totalDays = computed.reduce((s, c) => s + c.days, 0);
  const totalUsedV = computed.reduce((s, c) => s + c.usedV, 0);
  const totalUsedM = computed.reduce((s, c) => s + c.usedM, 0);

  const nIn = (val: string, on: (v: string) => void, cls = '') => (
    <input className={`fv-ops__eta-in ${cls}`} inputMode="decimal" value={val} onChange={(e) => on(e.target.value)} />
  );
  const fuelSel = (val: string, on: (v: string) => void) => (
    <select className="fv-ops__eta-sel" value={val} onChange={(e) => on(e.target.value)}>
      {val && !OPS_FUEL_GRADES.includes(val) && <option value={val}>{val}</option>}
      {OPS_FUEL_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
    </select>
  );
  const perf = plan.perf;
  const activeSpeed = resolveEtaSpeed(perf);

  return (
    <div className="fv-ops__col">
      {/* Instructed speed & consumption — mirrors the estimation vessel details */}
      <Card
        title="Instructed Speed & Consumption"
        icon="fa-gauge-high"
        right={<button type="button" className="fv-ops__btn" onClick={applyInstructed}><i className="fas fa-arrows-rotate" aria-hidden="true" /> Apply to all legs</button>}
      >
        <div className="fv-ops__perf">
          <div className="fv-ops__perf-top">
            <div className="fv-ops__perf-modes">
              <label className={`fv-ops__perf-radio${perf.speedMode === 'Full' ? ' fv-ops__perf-radio--on' : ''}`}>
                <input type="radio" name="etaSpeedMode" checked={perf.speedMode === 'Full'} onChange={() => setSpeedMode('Full')} /> Full
              </label>
              <label className={`fv-ops__perf-radio${perf.speedMode === 'Eco' ? ' fv-ops__perf-radio--on' : ''}`}>
                <input type="radio" name="etaSpeedMode" checked={perf.speedMode === 'Eco'} onChange={() => setSpeedMode('Eco')} /> Eco
              </label>
              {perf.customs.map((c) => (
                <span key={c.id} className={`fv-ops__perf-radio${perf.speedMode === c.id ? ' fv-ops__perf-radio--on' : ''}`}>
                  <input type="radio" name="etaSpeedMode" checked={perf.speedMode === c.id} onChange={() => setSpeedMode(c.id)} />
                  <input className="fv-ops__perf-customname" value={c.name} onChange={(e) => renameCustom(c.id, e.target.value)} />
                  <button type="button" className="fv-ops__perf-customx" title="Remove speed" onClick={() => removeCustom(c.id)}><i className="fas fa-times" aria-hidden="true" /></button>
                </span>
              ))}
              <button type="button" className="fv-ops__perf-radio fv-ops__perf-add" title="Add custom speed" onClick={addCustomSpeed}><i className="fas fa-plus" aria-hidden="true" /></button>
            </div>
            <table className="fv-ops__perf-tbl">
              <thead><tr><th className="fv-ops__r">Ballast</th><th className="fv-ops__r">Laden</th></tr></thead>
              <tbody>
                <tr>
                  <td className="fv-ops__r">{nIn(activeSpeed.ballast, (v) => patchActiveSpeed({ ballast: v }))}</td>
                  <td className="fv-ops__r">{nIn(activeSpeed.laden, (v) => patchActiveSpeed({ laden: v }))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="fv-ops__perf-tables">
            <table className="fv-ops__perf-tbl">
              <thead><tr><th>FO</th><th>Type</th><th className="fv-ops__r">Ballast</th><th className="fv-ops__r">Laden</th><th className="fv-ops__r">Idle</th><th className="fv-ops__r">Work</th></tr></thead>
              <tbody>
                <tr>
                  <td>Normal</td>
                  <td>{fuelSel(perf.mainNormal.type, (v) => setMain('mainNormal', { type: v }))}</td>
                  <td className="fv-ops__r">{nIn(perf.mainNormal.ballast, (v) => setMain('mainNormal', { ballast: v }))}</td>
                  <td className="fv-ops__r">{nIn(perf.mainNormal.laden, (v) => setMain('mainNormal', { laden: v }))}</td>
                  <td className="fv-ops__r">{nIn(perf.mainNormal.idle, (v) => setMain('mainNormal', { idle: v }))}</td>
                  <td className="fv-ops__r">{nIn(perf.mainNormal.work, (v) => setMain('mainNormal', { work: v }))}</td>
                </tr>
                <tr>
                  <td>ECA</td>
                  <td>{fuelSel(perf.mainEca.type, (v) => setMain('mainEca', { type: v }))}</td>
                  <td className="fv-ops__r">{nIn(perf.mainEca.ballast, (v) => setMain('mainEca', { ballast: v }))}</td>
                  <td className="fv-ops__r">{nIn(perf.mainEca.laden, (v) => setMain('mainEca', { laden: v }))}</td>
                  <td className="fv-ops__r">{nIn(perf.mainEca.idle, (v) => setMain('mainEca', { idle: v }))}</td>
                  <td className="fv-ops__r">{nIn(perf.mainEca.work, (v) => setMain('mainEca', { work: v }))}</td>
                </tr>
              </tbody>
            </table>
            <table className="fv-ops__perf-tbl">
              <thead><tr><th>DO</th><th>Type</th><th className="fv-ops__r">Sea</th><th className="fv-ops__r">Idle</th><th className="fv-ops__r">Work</th></tr></thead>
              <tbody>
                <tr>
                  <td>Normal</td>
                  <td>{fuelSel(perf.subNormal.type, (v) => setSub('subNormal', { type: v }))}</td>
                  <td className="fv-ops__r">{nIn(perf.subNormal.sea, (v) => setSub('subNormal', { sea: v }))}</td>
                  <td className="fv-ops__r">{nIn(perf.subNormal.idle, (v) => setSub('subNormal', { idle: v }))}</td>
                  <td className="fv-ops__r">{nIn(perf.subNormal.work, (v) => setSub('subNormal', { work: v }))}</td>
                </tr>
                <tr>
                  <td>ECA</td>
                  <td>{fuelSel(perf.subEca.type, (v) => setSub('subEca', { type: v }))}</td>
                  <td className="fv-ops__r">{nIn(perf.subEca.sea, (v) => setSub('subEca', { sea: v }))}</td>
                  <td className="fv-ops__r">{nIn(perf.subEca.idle, (v) => setSub('subEca', { idle: v }))}</td>
                  <td className="fv-ops__r">{nIn(perf.subEca.work, (v) => setSub('subEca', { work: v }))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Itinerary — ETA & ROB projection */}
      <Card
        title="ETA & ROB - Itinerary"
        icon="fa-route"
        right={(
          <span className="fv-ops__eta-addbtns">
            <button type="button" className="fv-ops__btn" onClick={rebuildFromPorts} title="Rebuild legs from the voyage port rotation"><i className="fas fa-arrows-rotate" aria-hidden="true" /> From ports</button>
            <button type="button" className="fv-ops__btn" onClick={() => addLeg('sea')}><i className="fas fa-water" aria-hidden="true" /> Sea leg</button>
            <button type="button" className="fv-ops__btn" onClick={() => addLeg('port')}><i className="fas fa-anchor" aria-hidden="true" /> Port stay</button>
          </span>
        )}
      >
        <div className="fv-ops__vd-fields fv-ops__eta-controls">
          <VdDateTime label="Delivery Date / Time (DEP-UTC)" value={plan.startDep} onChange={(v) => setPlan({ startDep: v })} accent />
          <VdField label="Default Weather Margin (%)" value={plan.weatherMargin} onChange={(v) => setPlan({ weatherMargin: v })} num />
          <VdField label="Bunkers on Delivery — VLSFO" value={plan.startRobVlsfo} onChange={(v) => setPlan({ startRobVlsfo: v })} num />
          <VdField label="Bunkers on Delivery — LSMGO" value={plan.startRobMgo} onChange={(v) => setPlan({ startRobMgo: v })} num />
        </div>
        <div className="fv-ops__eta-scroll">
          <table className="fv-ops__eta">
            <colgroup>
              <col className="fv-ops__eta-c-port" />
              <col className="fv-ops__eta-c-port" />
              <col className="fv-ops__eta-c-num" />
              <col className="fv-ops__eta-c-num" />
              <col className="fv-ops__eta-c-num" />
              <col className="fv-ops__eta-c-num" />
              <col className="fv-ops__eta-c-num" />
              <col className="fv-ops__eta-c-num" />
              <col className="fv-ops__eta-c-dt" />
              <col className="fv-ops__eta-c-dt" />
              <col className="fv-ops__eta-c-tz" />
              <col className="fv-ops__eta-c-dt" />
              <col className="fv-ops__eta-c-num" />
              <col className="fv-ops__eta-c-num" />
              <col className="fv-ops__eta-c-num" />
              <col className="fv-ops__eta-c-num" />
              <col className="fv-ops__eta-c-num" />
              <col className="fv-ops__eta-c-num" />
              <col className="fv-ops__eta-c-num" />
              <col className="fv-ops__eta-c-num" />
              <col className="fv-ops__eta-c-rm" />
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2}>From</th>
                <th rowSpan={2}>To</th>
                <th colSpan={2}>Distance (nm)</th>
                <th rowSpan={2}>Speed<br />(kts)</th>
                <th rowSpan={2}>WM %</th>
                <th rowSpan={2}>Avg Spd<br />(kts)</th>
                <th rowSpan={2}>Days</th>
                <th rowSpan={2}>DEP-UTC</th>
                <th rowSpan={2}>ARR-UTC</th>
                <th rowSpan={2}>TZ</th>
                <th rowSpan={2}>ARR-LT</th>
                <th colSpan={2}>Cons (MT/day)</th>
                <th colSpan={2}>Used (MT)</th>
                <th colSpan={2}>Supply (MT)</th>
                <th colSpan={2}>Est ROB (MT)</th>
                <th rowSpan={2} aria-label="Remove" />
              </tr>
              <tr>
                <th>Non-ECA</th>
                <th>ECA</th>
                <th>VLSFO</th>
                <th>MGO</th>
                <th>VLSFO</th>
                <th>MGO</th>
                <th>VLSFO</th>
                <th>MGO</th>
                <th>VLSFO</th>
                <th>LSMGO</th>
              </tr>
            </thead>
            <tbody>
              <tr className="fv-ops__eta-delivery">
                <td colSpan={18}>Bunkers on Delivery</td>
                <td className="fv-ops__r fv-ops__eta-rob">{fmt(num(plan.startRobVlsfo))}</td>
                <td className="fv-ops__r fv-ops__eta-rob">{fmt(num(plan.startRobMgo))}</td>
                <td />
              </tr>
              {plan.legs.map((l, i) => {
                const c = computed[i];
                return (
                  <tr key={i} className={l.kind === 'port' ? 'fv-ops__eta-port' : undefined}>
                    <td>{nIn(l.from, (v) => setLeg(i, { from: v }), 'fv-ops__eta-in--wide')}</td>
                    <td>{nIn(l.to, (v) => setLeg(i, { to: v }), 'fv-ops__eta-in--wide')}</td>
                    <td className="fv-ops__r">{l.kind === 'sea' ? nIn(l.distNonEca, (v) => setLeg(i, { distNonEca: v })) : '—'}</td>
                    <td className="fv-ops__r">{l.kind === 'sea' ? nIn(l.distEca, (v) => setLeg(i, { distEca: v })) : '—'}</td>
                    <td className="fv-ops__r">{l.kind === 'sea' ? nIn(l.speed, (v) => setLeg(i, { speed: v })) : '—'}</td>
                    <td className="fv-ops__r">{l.kind === 'sea' ? nIn(l.wf, (v) => setLeg(i, { wf: v })) : '—'}</td>
                    <td className="fv-ops__r fv-ops__eta-calc">{l.kind === 'sea' ? fmt(c.avgSpeed, 2) : '—'}</td>
                    <td className="fv-ops__r">{l.kind === 'port' ? nIn(l.portDays, (v) => setLeg(i, { portDays: v })) : <span className="fv-ops__eta-calc">{fmt(c.days, 2)}</span>}</td>
                    <td className="fv-ops__eta-dt">{fmtDT(c.dep)}</td>
                    <td className="fv-ops__eta-dt">{fmtDT(c.arr)}</td>
                    <td className="fv-ops__r">{nIn(l.tz, (v) => setLeg(i, { tz: v }), 'fv-ops__eta-in--tz')}</td>
                    <td className="fv-ops__eta-dt fv-ops__eta-lt">{fmtDT(c.arrLt)}</td>
                    <td className="fv-ops__r">{nIn(l.consVlsfo, (v) => setLeg(i, { consVlsfo: v }))}</td>
                    <td className="fv-ops__r">{nIn(l.consMgo, (v) => setLeg(i, { consMgo: v }))}</td>
                    <td className="fv-ops__r fv-ops__eta-calc">{fmt(c.usedV, 2)}</td>
                    <td className="fv-ops__r fv-ops__eta-calc">{fmt(c.usedM, 2)}</td>
                    <td className="fv-ops__r">{nIn(l.supVlsfo, (v) => setLeg(i, { supVlsfo: v }))}</td>
                    <td className="fv-ops__r">{nIn(l.supMgo, (v) => setLeg(i, { supMgo: v }))}</td>
                    <td className={`fv-ops__r fv-ops__eta-rob${c.robV < 0 ? ' fv-ops__neg' : ''}`}>{fmt(c.robV, 2)}</td>
                    <td className={`fv-ops__r fv-ops__eta-rob${c.robM < 0 ? ' fv-ops__neg' : ''}`}>{fmt(c.robM, 2)}</td>
                    <td className="fv-ops__r"><button type="button" className="fv-ops__vd-sp-rm" aria-label="Remove leg" onClick={() => removeLeg(i)}><i className="fas fa-trash" aria-hidden="true" /></button></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="fv-ops__row-sub">
                <td colSpan={7}>Totals</td>
                <td className="fv-ops__r">{fmt(totalDays, 2)}</td>
                <td colSpan={6} />
                <td className="fv-ops__r">{fmt(totalUsedV, 2)}</td>
                <td className="fv-ops__r">{fmt(totalUsedM, 2)}</td>
                <td colSpan={2} />
                <td className="fv-ops__r">{fmt(endV, 2)}</td>
                <td className="fv-ops__r">{fmt(endM, 2)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="fv-ops__hint">
          <i className="fas fa-circle-info" aria-hidden="true" /> Avg Speed = Speed × (1 − Weather Margin%); Days = distance ÷ (Avg Speed × 24). Operator updates distance, speed, weather margin &amp; consumption; ARR-UTC/LT and ROB recompute live. Projected arrival at destination: <b>{fmtDT(arrDest)}</b>.
        </p>
      </Card>

      {/* Bunker details (same box as Voyage Details — BOD, 5% margins, CP price) */}
      <BunkersCard recap={recap} setRecap={setRecap} />
    </div>
  );
}

/* ------------------------------------------------------------ Stowage tab */

function StowageTab({ recap, setRecap }: { recap: Recap; setRecap: Dispatch<SetStateAction<Recap>> }) {
  const st = recap.stowage;
  const setPlan = (patch: Partial<StowagePlan>) => setRecap((r) => ({ ...r, stowage: { ...r.stowage, ...patch } }));
  const setPoint = (i: number, patch: Partial<StowagePoint>) =>
    setRecap((r) => ({ ...r, stowage: { ...r.stowage, points: r.stowage.points.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) } }));
  const addPoint = () =>
    setRecap((r) => {
      const base = r.stowage.points[r.stowage.points.length - 1];
      const np: StowagePoint = { name: 'New Port', displacement: base?.displacement ?? '0', density: '1.025', vlsfo: '0', mgo: '0', bw: base?.bw ?? '0', fw: base?.fw ?? '0', constants: base?.constants ?? '0' };
      return { ...r, stowage: { ...r.stowage, points: [...r.stowage.points, np] } };
    });
  const removePoint = (i: number) =>
    setRecap((r) => ({ ...r, stowage: { ...r.stowage, points: r.stowage.points.filter((_, idx) => idx !== i) } }));
  const setHold = (i: number, patch: Partial<StowageHold>) =>
    setRecap((r) => ({ ...r, stowage: { ...r.stowage, holds: r.stowage.holds.map((h, idx) => (idx === i ? { ...h, ...patch } : h)) } }));
  const setGrade = (i: number, patch: Partial<StowageGrade>) =>
    setRecap((r) => ({ ...r, stowage: { ...r.stowage, grades: r.stowage.grades.map((g, idx) => (idx === i ? { ...g, ...patch } : g)) } }));
  const addGrade = () =>
    setRecap((r) => ({ ...r, stowage: { ...r.stowage, grades: [...r.stowage.grades, { grade: '', sf: '', qty: '' }] } }));
  const removeGrade = (i: number) =>
    setRecap((r) => ({ ...r, stowage: { ...r.stowage, grades: r.stowage.grades.filter((_, idx) => idx !== i) } }));
  const setPort = (i: number, patch: Partial<StowagePort>) =>
    setRecap((r) => ({ ...r, stowage: { ...r.stowage, ports: r.stowage.ports.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) } }));
  const addPort = () =>
    setRecap((r) => ({ ...r, stowage: { ...r.stowage, ports: [...r.stowage.ports, { name: '', maxDraft: '', density: '1.025', remarks: '' }] } }));
  const removePort = (i: number) =>
    setRecap((r) => ({ ...r, stowage: { ...r.stowage, ports: r.stowage.ports.filter((_, idx) => idx !== i) } }));

  // Bunker ROB at each port from the ETA & ROB itinerary (arrival ROB at the leg 'to').
  const robByPort = useMemo(() => {
    const map: Record<string, { v: number; m: number }> = {};
    projectEtaLegs(recap.etaPlan).forEach((c, idx) => {
      const leg = recap.etaPlan.legs[idx];
      if (leg?.to) map[leg.to.trim().toUpperCase()] = { v: c.robV, m: c.robM };
    });
    return map;
  }, [recap.etaPlan]);

  const lightship = num(st.lightship);
  const rows = st.points.map((p) => {
    const disp = num(p.displacement);
    const density = num(p.density) || 1.025;
    const dispPort = disp * (density / 1.025);
    const auto = st.autoBunker ? robByPort[p.name.trim().toUpperCase()] : undefined;
    const vlsfo = auto ? auto.v : num(p.vlsfo);
    const mgo = auto ? auto.m : num(p.mgo);
    const bw = num(p.bw);
    const fw = num(p.fw);
    const constants = num(p.constants);
    const deductions = vlsfo + mgo + bw + fw + constants;
    const dwt = dispPort - lightship;
    const cargo = dwt - deductions;
    return { disp, density, dispPort, vlsfo, mgo, bw, fw, constants, dwt, deductions, cargo, autoMatched: !!auto };
  });
  const cargoVals = rows.map((r) => r.cargo);
  const minCargo = cargoVals.length ? Math.min(...cargoVals) : 0;
  const governIdx = cargoVals.indexOf(minCargo);
  const governName = governIdx >= 0 ? st.points[governIdx]?.name : '—';
  // Governing-point details for the summary strip.
  const govDensity = governIdx >= 0 ? st.points[governIdx]?.density : '';
  const govBunker = governIdx >= 0 ? rows[governIdx].vlsfo + rows[governIdx].mgo : 0;
  const govPort = st.ports.find((p) => p.name.trim().toUpperCase() === (governName || '').trim().toUpperCase());

  // --- Heuristic "AI" recommendations (freight × intake trade-offs) ---------
  const freight = num(recap.freightPerMt);
  const cpNum = num((recap.cpQuantity || '').split('/')[0]);
  const maxCargoVal = cargoVals.length ? Math.max(...cargoVals) : 0;
  const trapped = Math.max(0, maxCargoVal - minCargo);
  const bunkerAtGov = governIdx >= 0 ? rows[governIdx].vlsfo + rows[governIdx].mgo : 0;
  const portBefore = governIdx > 0 ? st.points[governIdx - 1]?.name : '';
  const portAfter = governIdx >= 0 && governIdx < st.points.length - 1 ? st.points[governIdx + 1]?.name : '';
  const applyMaxIntake = () => setRecap((r) => ({ ...r, finalQtyLoaded: String(Math.round(minCargo)) }));

  type Rec = { tone: 'good' | 'bad' | 'flat'; icon: string; title: string; text: string; impact?: number; action?: () => void; actionLabel?: string };
  const recs: Rec[] = [];
  if (cpNum > 0 && minCargo >= cpNum) {
    recs.push({ tone: 'good', icon: 'fa-arrow-trend-up', title: 'Lift full CP quantity', text: `Governing zone ${governName} allows ${fmt(minCargo, 0)} MT — above CP ${fmt(cpNum, 0)} MT. Load CP max within tolerance; ${fmt(minCargo - cpNum, 0)} MT spare capacity.`, impact: cpNum * freight, action: applyMaxIntake, actionLabel: 'Set BL = max intake' });
  } else if (minCargo > 0) {
    const short = Math.max(0, cpNum - minCargo);
    recs.push({ tone: 'bad', icon: 'fa-triangle-exclamation', title: 'Intake below CP — deadfreight risk', text: `Max intake ${fmt(minCargo, 0)} MT (governing at ${governName})${cpNum ? ` is ${fmt(short, 0)} MT under CP ${fmt(cpNum, 0)} MT` : ''}. Potential deadfreight ≈ $${fmt(short * freight, 0)}. Trim bunkers / ballast at ${governName} or advise charterers.`, impact: -short * freight, action: applyMaxIntake, actionLabel: 'Set BL = max intake' });
  }
  recs.push({ tone: 'good', icon: 'fa-gas-pump', title: 'Optimise bunker ROB at governing zone', text: `${governName} carries ${fmt(bunkerAtGov, 0)} MT bunkers on board — each MT trimmed here frees 1 MT of cargo (~$${fmt(freight, 2)}/MT). Stemming 200 MT less before ${governName} ≈ +$${fmt(200 * freight, 0)} freight; bunker after the summer-zone crossing instead.`, impact: 200 * freight });
  recs.push({ tone: 'flat', icon: 'fa-arrows-split-up-and-left', title: 'Split supply across two ports', text: `Stem only enough VLSFO at ${portBefore || 'the load port'} to safely reach ${governName}, then top up at ${portAfter || 'the next port'} after the deepest-draft zone. Keeps ROB low where draft governs; compare bunker prices at ${portBefore || 'port A'} vs ${portAfter || 'port B'} and lift the cheaper grade in bulk.` });
  if (trapped > 0) {
    recs.push({ tone: 'flat', icon: 'fa-scale-unbalanced', title: 'Draft-limited cargo', text: `Up to ${fmt(trapped, 0)} MT (≈ $${fmt(trapped * freight, 0)} freight) is trapped by the ${governName} restriction vs the least-restrictive zone. Managing bunkers/ballast at that crossing recovers part of it.`, impact: trapped * freight });
  }

  const nIn = (val: string, on: (v: string) => void) => (
    <input className="fv-ops__eta-in" inputMode="decimal" value={val} onChange={(e) => on(e.target.value)} />
  );
  const holdColor = (util: number) => (util >= 95 ? '#3fb96e' : util >= 80 ? '#f0aa5a' : '#4f8cf0');

  // Hold weight limits from grain/bale volume ÷ stowage factor and tank-top strength.
  const gradeSf = (cargo: string): number => {
    const g = st.grades.find((x) => x.grade.trim().toLowerCase() === (cargo || '').trim().toLowerCase());
    return g ? num(g.sf) : 0;
  };
  const holdLimits = (h: StowageHold) => {
    const sf = gradeSf(h.cargo);
    const maxByGrain = sf > 0 ? num(h.grainCap) / sf : 0;
    const maxByBale = sf > 0 ? num(h.baleCap) / sf : 0;
    const maxByStrength = num(h.tankTopArea) * num(h.tankTopMax);
    const constraints = [maxByGrain, maxByStrength].filter((v) => v > 0);
    const maxLoadable = constraints.length ? Math.min(...constraints) : num(h.capacity);
    return { sf, maxByGrain, maxByBale, maxByStrength, maxLoadable };
  };

  // --- Change-in-draft (density correction) at the loading berth ------------
  const setDraft = (patch: Partial<StowageDraft>) => setRecap((r) => ({ ...r, stowage: { ...r.stowage, draft: { ...r.stowage.draft, ...patch } } }));
  const dc = st.draft;
  const tpc = num(dc.tpc) || 1;
  const dispSW = num(dc.dispSW);
  const dFrom = num(dc.densityFrom) || 1.025;
  const dTo = num(dc.densityTo) || dFrom;
  const fwaCm = dispSW / (40 * tpc);            // Fresh Water Allowance, cm
  const changeDraft = (fwaCm / 100) * ((dFrom - dTo) / 0.025); // metres
  const draftTo = num(dc.draftCurrent) + changeDraft;
  const corrDisp = dispSW * (dTo / dFrom);
  const dwtBerth = corrDisp - lightship;
  const berthDeduct = num(dc.vlsfo) + num(dc.mgo) + num(dc.bw) + num(dc.fw) + num(dc.constants);
  const cargoBerth = dwtBerth - berthDeduct;
  const shipQ = num(dc.shipSurveyQty);
  const shoreQ = num(dc.shoreScaleQty);
  const diffQty = shoreQ - shipQ;
  const pctDiff = shipQ > 0 ? (diffQty / shipQ) * 100 : 0;
  const loi = Math.abs(pctDiff) > 0.5 ? 'YES' : 'NO';

  const calcField = (label: string, value: string) => (
    <div className="fv-ops__vd-field"><span>{label}</span><b className="fv-ops__stw-calcfield">{value}</b></div>
  );

  return (
    <div className="fv-ops__col">
      {/* Merged summary + loadability strip */}
      <div className="fv-ops__vd-strip">
        <div className="fv-ops__vd-cell"><span className="fv-ops__vd-cell-label">Cargo</span><span className="fv-ops__vd-cell-value">{recap.cargoName || '—'}</span></div>
        <div className="fv-ops__vd-cell"><span className="fv-ops__vd-cell-label">Max Loadable</span><span className="fv-ops__vd-cell-value fv-ops__pos">{fmt(minCargo, 0)} MT</span></div>
        <div className="fv-ops__vd-cell"><span className="fv-ops__vd-cell-label">Governing Zone / Point</span><span className="fv-ops__vd-cell-value">{governName}</span></div>
        <div className="fv-ops__vd-cell"><span className="fv-ops__vd-cell-label">Governing Density</span><span className="fv-ops__vd-cell-value">{govDensity || '—'}</span></div>
        <div className="fv-ops__vd-cell"><span className="fv-ops__vd-cell-label">Max Draft @ Governing</span><span className="fv-ops__vd-cell-value">{govPort?.maxDraft ? `${govPort.maxDraft} m` : '—'}</span></div>
        <div className="fv-ops__vd-cell"><span className="fv-ops__vd-cell-label">Bunkers @ Governing</span><span className="fv-ops__vd-cell-value">{fmt(govBunker, 0)} MT</span></div>
        <div className="fv-ops__vd-cell"><span className="fv-ops__vd-cell-label">CP Quantity</span><span className="fv-ops__vd-cell-value">{recap.cpQuantity || '—'}</span></div>
        <div className="fv-ops__vd-cell"><span className="fv-ops__vd-cell-label">Final Qty / BL</span><span className="fv-ops__vd-cell-value">{recap.finalQtyLoaded || '—'} MT</span></div>
      </div>

      {/* Cargo grades & ports data entry */}
      <div className="fv-ops__grid2">
        <Card
          title="Cargo Grades & Stowage Factor"
          icon="fa-wheat-awn"
          right={<button type="button" className="fv-ops__btn" onClick={addGrade}><i className="fas fa-plus" aria-hidden="true" /> Grade</button>}
        >
          <table className="fv-ops__stw fv-ops__stw--rows">
            <thead>
              <tr><th>Grade / Description</th><th className="fv-ops__r">SF (m³/MT)</th><th className="fv-ops__r">Qty (MT)</th><th className="fv-ops__r">Volume (m³)</th><th aria-label="Remove" /></tr>
            </thead>
            <tbody>
              {st.grades.map((g, i) => (
                <tr key={i}>
                  <td><input className="fv-ops__vd-in" value={g.grade} placeholder="e.g. Gypsum" onChange={(e) => setGrade(i, { grade: e.target.value })} /></td>
                  <td className="fv-ops__r">{nIn(g.sf, (v) => setGrade(i, { sf: v }))}</td>
                  <td className="fv-ops__r">{nIn(g.qty, (v) => setGrade(i, { qty: v }))}</td>
                  <td className="fv-ops__r fv-ops__stw-calc">{fmt(num(g.qty) * num(g.sf), 0)}</td>
                  <td className="fv-ops__r"><button type="button" className="fv-ops__bnk-rm" aria-label="Remove grade" onClick={() => removeGrade(i)}><i className="fas fa-xmark" aria-hidden="true" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fv-ops__hint">Stowage Factor (SF) = m³ occupied per MT. Higher SF = lighter/bulkier cargo. Used to derive each hold's max weight from its volume.</p>
        </Card>

        <Card
          title="Ports & Draft Restrictions"
          icon="fa-anchor"
          right={<button type="button" className="fv-ops__btn" onClick={addPort}><i className="fas fa-plus" aria-hidden="true" /> Port</button>}
        >
          <table className="fv-ops__stw fv-ops__stw--rows">
            <thead>
              <tr><th>Port</th><th className="fv-ops__r">Max Draft (m)</th><th className="fv-ops__r">Density</th><th>Remarks</th><th aria-label="Remove" /></tr>
            </thead>
            <tbody>
              {st.ports.map((p, i) => (
                <tr key={i}>
                  <td><input className="fv-ops__vd-in" value={p.name} placeholder="Port" onChange={(e) => setPort(i, { name: e.target.value })} /></td>
                  <td className="fv-ops__r">{nIn(p.maxDraft, (v) => setPort(i, { maxDraft: v }))}</td>
                  <td className="fv-ops__r">{nIn(p.density, (v) => setPort(i, { density: v }))}</td>
                  <td><input className="fv-ops__vd-in" value={p.remarks} placeholder="Remarks" onChange={(e) => setPort(i, { remarks: e.target.value })} /></td>
                  <td className="fv-ops__r"><button type="button" className="fv-ops__bnk-rm" aria-label="Remove port" onClick={() => removePort(i)}><i className="fas fa-xmark" aria-hidden="true" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fv-ops__hint">Enter each port's max permissible draft &amp; water density — the deepest-draft / lowest-density port usually governs the cargo intake.</p>
        </Card>
      </div>

      <Card
        title="DWT & Cargo Intake — by Zone / Port"
        icon="fa-scale-balanced"
        right={(
          <span className="fv-ops__eta-addbtns">
            <label className="fv-ops__stw-toggle" title="Auto-fill VLSFO/MGO from the ETA & ROB itinerary where the port name matches">
              <input type="checkbox" checked={st.autoBunker} onChange={(e) => setPlan({ autoBunker: e.target.checked })} /> Auto bunkers
            </label>
            <button type="button" className="fv-ops__btn" onClick={addPoint}><i className="fas fa-plus" aria-hidden="true" /> Zone / Port</button>
          </span>
        )}
      >
        <div className="fv-ops__vd-fields fv-ops__eta-controls">
          <VdField label="Lightship (MT)" value={st.lightship} onChange={(v) => setPlan({ lightship: v })} num />
        </div>
        <div className="fv-ops__eta-scroll">
          <table className="fv-ops__stw">
            <thead>
              <tr>
                <th>DWT Calculation</th>
                {st.points.map((p, i) => (
                  <th key={i} className={i === governIdx ? 'fv-ops__stw-gov' : undefined}>
                    <span className="fv-ops__bnk-fuelhd">
                      <input className="fv-ops__vd-in" value={p.name} onChange={(e) => setPoint(i, { name: e.target.value })} />
                      {st.points.length > 1 && <button type="button" className="fv-ops__bnk-rm" aria-label="Remove point" onClick={() => removePoint(i)}><i className="fas fa-xmark" aria-hidden="true" /></button>}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr><th scope="row">Displacement (Max)</th>{st.points.map((p, i) => <td key={i} className="fv-ops__r">{nIn(p.displacement, (v) => setPoint(i, { displacement: v }))}</td>)}</tr>
              <tr><th scope="row">Lightship</th>{rows.map((_, i) => <td key={i} className="fv-ops__r fv-ops__stw-calc">{fmt(lightship, 0)}</td>)}</tr>
              <tr><th scope="row">Water Density</th>{st.points.map((p, i) => <td key={i} className="fv-ops__r">{nIn(p.density, (v) => setPoint(i, { density: v }))}</td>)}</tr>
              <tr><th scope="row">Displacement @ Density</th>{rows.map((r, i) => <td key={i} className="fv-ops__r fv-ops__stw-calc">{fmt(r.dispPort, 0)}</td>)}</tr>
              <tr className="fv-ops__stw-sub"><th scope="row">Net DWT</th>{rows.map((r, i) => <td key={i} className="fv-ops__r">{fmt(r.dwt, 0)}</td>)}</tr>
              <tr><th scope="row">(−) VLSFO</th>{st.points.map((p, i) => <td key={i} className="fv-ops__r">{rows[i].autoMatched ? <span className="fv-ops__stw-derived" title="From ETA & ROB">{fmt(rows[i].vlsfo, 0)}</span> : nIn(p.vlsfo, (v) => setPoint(i, { vlsfo: v }))}</td>)}</tr>
              <tr><th scope="row">(−) MGO</th>{st.points.map((p, i) => <td key={i} className="fv-ops__r">{rows[i].autoMatched ? <span className="fv-ops__stw-derived" title="From ETA & ROB">{fmt(rows[i].mgo, 0)}</span> : nIn(p.mgo, (v) => setPoint(i, { mgo: v }))}</td>)}</tr>
              <tr><th scope="row">(−) Ballast Water</th>{st.points.map((p, i) => <td key={i} className="fv-ops__r">{nIn(p.bw, (v) => setPoint(i, { bw: v }))}</td>)}</tr>
              <tr><th scope="row">(−) Fresh Water</th>{st.points.map((p, i) => <td key={i} className="fv-ops__r">{nIn(p.fw, (v) => setPoint(i, { fw: v }))}</td>)}</tr>
              <tr><th scope="row">(−) Constants</th>{st.points.map((p, i) => <td key={i} className="fv-ops__r">{nIn(p.constants, (v) => setPoint(i, { constants: v }))}</td>)}</tr>
              <tr className="fv-ops__stw-cargo">
                <th scope="row">Cargo Qty (MT)</th>
                {rows.map((r, i) => <td key={i} className={`fv-ops__r${i === governIdx ? ' fv-ops__stw-gov' : ''}`}>{fmt(r.cargo, 0)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="fv-ops__hint">
          <i className="fas fa-circle-info" aria-hidden="true" /> Cargo Qty = (Displacement × Density/1.025) − Lightship − VLSFO − MGO − Ballast − Fresh Water − Constants. The lowest intake (governing zone — often <b>entering the summer zone</b>) sets the max loadable cargo. With “Auto bunkers” on, VLSFO/MGO are pulled from the ETA &amp; ROB projection where the port name matches.
        </p>
      </Card>

      {/* Change in draft — density correction at loading berth */}
      <Card title="Change in Draft — Density Correction (Loading Berth)" icon="fa-water">
        <div className="fv-ops__stw-draft">
          <div className="fv-ops__stw-draft-col">
            <div className="fv-ops__vd-sub-head"><i className="fas fa-arrows-down-to-line" aria-hidden="true" /> Density &amp; Draft</div>
            <div className="fv-ops__vd-fields">
              <VdField label="Density Going From" value={dc.densityFrom} onChange={(v) => setDraft({ densityFrom: v })} num />
              <VdField label="Density Going To" value={dc.densityTo} onChange={(v) => setDraft({ densityTo: v })} num />
              <VdField label="TPC" value={dc.tpc} onChange={(v) => setDraft({ tpc: v })} num />
              <VdField label="Draft in Current Density (m)" value={dc.draftCurrent} onChange={(v) => setDraft({ draftCurrent: v })} num />
              <VdField label="Displacement @ SW Density" value={dc.dispSW} onChange={(v) => setDraft({ dispSW: v })} num />
              {calcField('FWA of Vessel (mm)', fmt(fwaCm * 10, 0))}
              {calcField('Change in Draft (m)', changeDraft.toFixed(3))}
              {calcField('Draft @ Density Going To (m)', draftTo.toFixed(3))}
              {calcField('Corr. Displacement @ Berth', fmt(corrDisp, 0))}
              {calcField('Less Lightship', fmt(lightship, 0))}
              {calcField('DWT @ Berth', fmt(dwtBerth, 0))}
            </div>
          </div>
          <div className="fv-ops__stw-draft-col">
            <div className="fv-ops__vd-sub-head"><i className="fas fa-minus" aria-hidden="true" /> Deductions &amp; Cargo Qty</div>
            <div className="fv-ops__vd-fields">
              <VdField label="VLSFO" value={dc.vlsfo} onChange={(v) => setDraft({ vlsfo: v })} num />
              <VdField label="MGO" value={dc.mgo} onChange={(v) => setDraft({ mgo: v })} num />
              <VdField label="Ballast Water" value={dc.bw} onChange={(v) => setDraft({ bw: v })} num />
              <VdField label="Fresh Water" value={dc.fw} onChange={(v) => setDraft({ fw: v })} num />
              <VdField label="Constants" value={dc.constants} onChange={(v) => setDraft({ constants: v })} num />
            </div>
            <div className="fv-ops__stw-cargoqty">Cargo Qty @ Berth <b>{fmt(cargoBerth, 0)} MT</b></div>
          </div>
        </div>
        <p className="fv-ops__hint">FWA = Displacement ÷ (40 × TPC) · Change in draft = FWA × (ρ from − ρ to) ÷ 0.025 · Corr. displacement = Displacement × ρ to ÷ ρ from.</p>
      </Card>

      {/* Ship–shore cargo difference */}
      <Card title="Ship–Shore Cargo Difference" icon="fa-scale-balanced">
        <div className="fv-ops__vd-fields">
          <VdField label="Ship Draft Survey (MT)" value={dc.shipSurveyQty} onChange={(v) => setDraft({ shipSurveyQty: v })} num />
          <VdField label="Qty as per Shore Scale (MT)" value={dc.shoreScaleQty} onChange={(v) => setDraft({ shoreScaleQty: v })} num />
          {calcField('Diff in Qty (MT)', `${diffQty >= 0 ? '+' : '−'}${fmt(Math.abs(diffQty), 2)}`)}
          {calcField('% Age Diff', `${diffQty >= 0 ? '+' : '−'}${fmt(Math.abs(pctDiff), 2)}%`)}
          <div className="fv-ops__vd-field"><span>LOI to be done</span><b className={`fv-ops__stw-loi fv-ops__stw-loi--${loi === 'YES' ? 'yes' : 'no'}`}>{loi}</b></div>
        </div>
        <p className="fv-ops__hint">LOI flagged when the ship/shore difference exceeds 0.50%. Diff = Shore Scale − Ship Draft Survey.</p>
      </Card>

      {/* Hold-wise cargo distribution — ship top view */}
      <Card title="Hold-wise Cargo Distribution" icon="fa-ship">
        <div className="fv-ops__ship">
          <div className="fv-ops__ship-cap fv-ops__ship-cap--fore" aria-hidden="true"><span>Fore</span></div>
          {st.holds.map((h, i) => {
            const qty = num(h.qty);
            const lim = holdLimits(h).maxLoadable || num(h.capacity) || 1;
            const util = Math.min(120, (qty / lim) * 100);
            const color = util > 100 ? '#ff6b6b' : holdColor(util);
            return (
              <div key={i} className="fv-ops__hold" style={{ background: `linear-gradient(to top, ${color}44 ${Math.min(100, util)}%, transparent ${Math.min(100, util)}%)` }}>
                <div className="fv-ops__hold-name">{h.name}</div>
                <div className="fv-ops__hold-cargo">{h.cargo || '—'}</div>
                <div className="fv-ops__hold-qty"><input className="fv-ops__eta-in" inputMode="decimal" value={h.qty} onChange={(e) => setHold(i, { qty: e.target.value })} /></div>
                <div className="fv-ops__hold-util" style={{ color }}>{fmt(util, 0)}%</div>
              </div>
            );
          })}
          <div className="fv-ops__ship-cap fv-ops__ship-cap--aft" aria-hidden="true"><span>Aft</span></div>
        </div>
        <div className="fv-ops__ship-legend">
          <span><i className="fas fa-square" style={{ color: '#3fb96e' }} aria-hidden="true" /> ≥95%</span>
          <span><i className="fas fa-square" style={{ color: '#f0aa5a' }} aria-hidden="true" /> 80–95%</span>
          <span><i className="fas fa-square" style={{ color: '#4f8cf0' }} aria-hidden="true" /> &lt;80%</span>
          <span><i className="fas fa-square" style={{ color: '#ff6b6b' }} aria-hidden="true" /> Over limit</span>
          <span className="fv-ops__ship-total">Total loaded <b>{fmt(st.holds.reduce((s, h) => s + num(h.qty), 0), 0)} MT</b> · Max intake <b>{fmt(minCargo, 0)} MT</b></span>
        </div>
      </Card>

      {/* Hold capacities & strength limits */}
      <Card title="Hold Capacities & Strength Limits" icon="fa-cubes-stacked">
        <div className="fv-ops__eta-scroll">
          <table className="fv-ops__stw fv-ops__stw--rows">
            <thead>
              <tr>
                <th>Hold</th>
                <th>Cargo</th>
                <th className="fv-ops__r">SF (m³/MT)</th>
                <th className="fv-ops__r">Grain (m³)</th>
                <th className="fv-ops__r">Bale (m³)</th>
                <th className="fv-ops__r">Max by Vol (MT)</th>
                <th className="fv-ops__r">Tank-Top Area (m²)</th>
                <th className="fv-ops__r">Tank-Top Max (MT/m²)</th>
                <th className="fv-ops__r">Max by Strength (MT)</th>
                <th className="fv-ops__r">Max Loadable (MT)</th>
                <th className="fv-ops__r">Planned (MT)</th>
              </tr>
            </thead>
            <tbody>
              {st.holds.map((h, i) => {
                const lim = holdLimits(h);
                const qty = num(h.qty);
                const over = lim.maxLoadable > 0 && qty > lim.maxLoadable;
                const strengthGoverns = lim.maxByStrength > 0 && lim.maxByStrength <= lim.maxByGrain;
                return (
                  <tr key={i}>
                    <th scope="row">{h.name}</th>
                    <td><input className="fv-ops__vd-in" list="stw-grade-list" value={h.cargo} onChange={(e) => setHold(i, { cargo: e.target.value })} /></td>
                    <td className="fv-ops__r fv-ops__stw-calc">{lim.sf ? fmt(lim.sf, 2) : '—'}</td>
                    <td className="fv-ops__r">{nIn(h.grainCap, (v) => setHold(i, { grainCap: v }))}</td>
                    <td className="fv-ops__r">{nIn(h.baleCap, (v) => setHold(i, { baleCap: v }))}</td>
                    <td className="fv-ops__r fv-ops__stw-calc">{lim.maxByGrain ? fmt(lim.maxByGrain, 0) : '—'}</td>
                    <td className="fv-ops__r">{nIn(h.tankTopArea, (v) => setHold(i, { tankTopArea: v }))}</td>
                    <td className="fv-ops__r">{nIn(h.tankTopMax, (v) => setHold(i, { tankTopMax: v }))}</td>
                    <td className={`fv-ops__r fv-ops__stw-calc${strengthGoverns ? ' fv-ops__stw-gov' : ''}`}>{lim.maxByStrength ? fmt(lim.maxByStrength, 0) : '—'}</td>
                    <td className="fv-ops__r fv-ops__stw-calc"><b>{fmt(lim.maxLoadable, 0)}</b></td>
                    <td className={`fv-ops__r${over ? ' fv-ops__neg' : ''}`}>{fmt(qty, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <datalist id="stw-grade-list">{st.grades.map((g) => <option key={g.grade} value={g.grade} />)}</datalist>
        <p className="fv-ops__hint">
          <i className="fas fa-circle-info" aria-hidden="true" /> Max by Volume = Grain capacity ÷ Stowage Factor · Max by Strength = Tank-Top Area × permissible load density (MT/m²). Max Loadable = the lower of the two; amber marks a strength-governed hold, red planned figures exceed the limit.
        </p>
      </Card>

      {/* AI recommendations */}
      <Card title="AI Recommendations" icon="fa-robot">
        <div className="fv-ops__rec-list">
          {recs.map((rec, i) => (
            <div key={i} className={`fv-ops__rec fv-ops__rec--${rec.tone}`}>
              <span className="fv-ops__rec-icon"><i className={`fas ${rec.icon}`} aria-hidden="true" /></span>
              <div className="fv-ops__rec-body">
                <div className="fv-ops__rec-title">
                  {rec.title}
                  {rec.impact != null && rec.impact !== 0 && (
                    <span className={`fv-ops__pnl-chip fv-ops__pnl-chip--${rec.impact >= 0 ? 'good' : 'bad'}`}>{rec.impact >= 0 ? '+' : '−'}${fmt(Math.abs(rec.impact), 0)}</span>
                  )}
                </div>
                <p className="fv-ops__rec-text">{rec.text}</p>
              </div>
              {rec.action && (
                <button type="button" className="fv-ops__btn fv-ops__rec-btn" onClick={rec.action}>{rec.actionLabel ?? 'Apply'}</button>
              )}
            </div>
          ))}
        </div>
        <p className="fv-ops__hint">Heuristic guidance from the live intake, freight rate and ETA/ROB bunkers — validate against actual bunker prices &amp; charter terms before acting.</p>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ Hire tab */

/** Off-hire event row (working / idle / sea / weather) inside a hire SOA. */
interface OffHireRow { cat: string; from: string; to: string; pct: string; remark: string }
/** Per-installment hire workflow state. */
interface HirePayEntry { status: string; ballast: boolean; from?: string; to?: string; offHire?: OffHireRow[] }

/** Hire installment workflow states. */
const HIRE_FLOW = ['Draft', 'Sent For Approval', 'Approved & Sent for Payment', 'Paid & Locked'] as const;
type HireStatus = (typeof HIRE_FLOW)[number];
const hireLocked = (s: HireStatus) => s === 'Approved & Sent for Payment' || s === 'Paid & Locked';
const hireStatusPill = (s: HireStatus) => (s === 'Draft' ? 'blue' : s === 'Paid & Locked' ? 'green' : 'amber');
const OFFHIRE_CATS = ['A. Working (Port)', 'B. Idle (Sea/Port)', 'C. Sea Off-Hire', 'D. Weather / WRI Time Loss'];

/** Off-hire duration in days for a row: (To − From) × %. */
function offHireDays(o: OffHireRow): number {
  const f = parseDMY(o.from);
  const t = parseDMY(o.to);
  if (!f || !t) return 0;
  const days = (t.getTime() - f.getTime()) / 86_400_000;
  const pct = o.pct === '' ? 100 : num(o.pct);
  return Math.max(0, days) * (pct / 100);
}

function HireTab({ recap, setRecap, pnl }: { recap: Recap; setRecap: Dispatch<SetStateAction<Recap>>; pnl: Pnl }) {
  const hd = num(recap.hirePerDay);
  const dedPct = num(recap.adcom) + num(recap.brokerage);
  const cur = recap.hireCurrency || 'USD';
  const owners = recap.owners || '—';
  const ballastBonusAmt = num(recap.ballastBonus);

  const stateOf = (key: string): HirePayEntry => {
    const s = recap.hirePayState[key];
    return { status: (s?.status as HireStatus) ?? 'Draft', ballast: s?.ballast ?? false, from: s?.from, to: s?.to, offHire: s?.offHire ?? [] };
  };
  const setState = (key: string, patch: Partial<HirePayEntry>) =>
    setRecap((r) => ({ ...r, hirePayState: { ...r.hirePayState, [key]: { ...stateOfRaw(r, key), ...patch } } }));
  const stateOfRaw = (r: Recap, key: string): HirePayEntry => ({ status: (r.hirePayState[key]?.status as HireStatus) ?? 'Draft', ballast: r.hirePayState[key]?.ballast ?? false, from: r.hirePayState[key]?.from, to: r.hirePayState[key]?.to, offHire: r.hirePayState[key]?.offHire ?? [] });

  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
  const addBankingDays = (d: Date, n: number) => {
    const r = new Date(d);
    let added = 0;
    while (added < n) { r.setDate(r.getDate() + 1); const dow = r.getDay(); if (dow !== 0 && dow !== 6) added += 1; }
    return r;
  };
  const p2 = (n: number) => String(n).padStart(2, '0');
  const fmtDT = (d: Date | null) => (d ? `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}` : '—');
  const fmtDate = (d: Date | null) => (d ? `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()}` : '—');

  const bunkersValue = num(recap.etaPlan.startRobVlsfo) * num(recap.foPrice) + num(recap.etaPlan.startRobMgo) * num(recap.doPrice);
  const firstPeriod = Math.max(1, num(recap.firstHirePeriodDays) || 15);
  const dueBank = Math.max(0, num(recap.firstHireDays) || 3);
  const subPeriod = Math.max(1, num(recap.hireEveryDays) || 15);
  const total = pnl.days;
  const start = parseDMY(recap.deliveryDateTime);

  interface HireRow { key: string; name: string; account: string; from: Date | null; to: Date | null; onHire: number; offHire: number; amount: number; due: Date | null; status: HireStatus; ballast: boolean; bunkers: number }
  const rows: HireRow[] = [];
  let covered = 0;
  let n = 1;
  while (covered < total - 0.01 && n <= 200) {
    const key = String(n);
    const e = stateOf(key);
    const status = e.status as HireStatus;
    const ballast = e.ballast;
    const periodLen = n === 1 ? firstPeriod : subPeriod;
    const days = Math.min(periodLen, total - covered);
    // From/To editable per installment (override the auto period when set).
    const from = e.from ? parseDMY(e.from) : (start ? addDays(start, covered) : null);
    const to = e.to ? parseDMY(e.to) : (start ? addDays(start, covered + days) : null);
    const onHire = from && to ? Math.max(0, (to.getTime() - from.getTime()) / 86_400_000) : days;
    const offHire = (e.offHire ?? []).reduce((s, o) => s + offHireDays(o), 0);
    const nett = Math.max(0, onHire - offHire);
    const due = n === 1 ? (start ? addBankingDays(start, dueBank) : null) : from;
    const gross = hd * nett;
    const bunkers = n === 1 ? bunkersValue : 0;
    const amount = gross * (1 - dedPct / 100) + bunkers + (ballast ? ballastBonusAmt : 0);
    rows.push({ key, name: `${ordinal(n)} Hire`, account: owners, from, to, onHire, offHire, amount, due, status, ballast, bunkers });
    covered += days;
    n += 1;
  }
  const totalPayable = rows.reduce((s, r) => s + r.amount, 0);

  // Workflow transitions per installment.
  const advance = (key: string, to: HireStatus) => setState(key, { status: to });
  const [soaRow, setSoaRow] = useState<number | null>(null);

  return (
    <>
    <Card title="Hire Payment Schedule" icon="fa-money-bill-wave">
      <div className="fv-ops__eta-scroll">
        <table className="fv-ops__table fv-ops__hire">
          <thead>
            <tr>
              <th>Hire Name</th>
              <th>Account</th>
              <th>From</th>
              <th>To</th>
              <th className="fv-ops__r">On Hire (days)</th>
              <th className="fv-ops__r">Off-Hire (days)</th>
              <th className="fv-ops__r">Amount Payable</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="fv-ops__vd-empty">Set delivery &amp; redelivery dates to build the schedule.</td></tr>}
            {rows.map((r, i) => {
              const locked = hireLocked(r.status);
              return (
                <tr key={r.key}>
                  <td>
                    <button type="button" className="fv-ops__hire-namebtn" onClick={() => setSoaRow(i)} title="Open Statement of Account">{r.name}</button>
                    {i === 0 && r.bunkers > 0 && <span className="fv-ops__hire-tag" title="Includes bunkers value on delivery"> +bunkers</span>}
                    {r.ballast && <span className="fv-ops__hire-tag fv-ops__hire-tag--bb" title="Ballast bonus paid with this hire"> +ballast</span>}
                  </td>
                  <td>{r.account}</td>
                  <td className="fv-ops__eta-dt">{fmtDT(r.from)}</td>
                  <td className="fv-ops__eta-dt">{fmtDT(r.to)}</td>
                  <td className="fv-ops__r">{fmt(r.onHire, 2)}</td>
                  <td className="fv-ops__r">{fmt(r.offHire, 2)}</td>
                  <td className="fv-ops__r">{money(r.amount)}</td>
                  <td>{fmtDate(r.due)}</td>
                  <td>
                    <span className={`fv-ops__pill fv-ops__pill--${hireStatusPill(r.status)}`}>{r.status}</span>
                    {locked && <i className="fas fa-lock fv-ops__hire-lock" title="Locked — manager approval required to unlock" aria-hidden="true" />}
                  </td>
                  <td>
                    <span className="fv-ops__hire-actions">
                      {ballastBonusAmt > 0 && !locked && (
                        <label className="fv-ops__hire-bb" title="Pay ballast bonus with this hire">
                          <input type="checkbox" checked={r.ballast} onChange={(e) => setState(r.key, { ballast: e.target.checked })} /> BB
                        </label>
                      )}
                      {r.status === 'Draft' && <button type="button" className="fv-ops__btn" onClick={() => advance(r.key, 'Sent For Approval')}><i className="fas fa-paper-plane" aria-hidden="true" /> Send for Approval &amp; Payment</button>}
                      {r.status === 'Sent For Approval' && <>
                        <button type="button" className="fv-ops__btn fv-ops__btn--go" onClick={() => advance(r.key, 'Approved & Sent for Payment')}><i className="fas fa-user-check" aria-hidden="true" /> Approve</button>
                        <button type="button" className="fv-ops__btn" onClick={() => advance(r.key, 'Draft')}><i className="fas fa-rotate-left" aria-hidden="true" /> Reject</button>
                      </>}
                      {r.status === 'Approved & Sent for Payment' && <>
                        <button type="button" className="fv-ops__btn fv-ops__btn--go" onClick={() => advance(r.key, 'Paid & Locked')}><i className="fas fa-circle-check" aria-hidden="true" /> Mark Paid</button>
                        <button type="button" className="fv-ops__btn" onClick={() => advance(r.key, 'Sent For Approval')} title="Manager unlock"><i className="fas fa-lock-open" aria-hidden="true" /> Unlock</button>
                      </>}
                      {r.status === 'Paid & Locked' && <button type="button" className="fv-ops__btn" onClick={() => advance(r.key, 'Approved & Sent for Payment')} title="Manager unlock"><i className="fas fa-lock-open" aria-hidden="true" /> Unlock</button>}
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr className="fv-ops__row-sub"><td colSpan={6}>Total Payable ({rows.length} installments)</td><td className="fv-ops__r">{money(totalPayable)}</td><td colSpan={3} /></tr>
          </tbody>
        </table>
      </div>
      <p className="fv-ops__hint">
        {cur} · Auto-built from CP terms: 1st hire {firstPeriod} days (incl. bunkers ≈ {money(bunkersValue)}) payable within {recap.firstHireDays} {recap.firstHireBasis}, then every {recap.hireEveryDays} days in advance until redelivery. Voyage {fmt(total, 2)} days — schedule &amp; due dates recompute as the redelivery date moves. Commissions {fmt(dedPct)}% deducted.
      </p>
      <p className="fv-ops__hint">
        <i className="fas fa-diagram-project" aria-hidden="true" /> Action flow: Draft → <b>Send for Approval &amp; Payment</b> → Manager <b>Approve</b> (→ Approved &amp; Sent for Payment, locked) → Accounts <b>Mark Paid</b> (→ Paid &amp; Locked). A locked installment can only be reopened via <b>Unlock</b> (manager). Tick <b>BB</b> to pay the ballast bonus ({money(ballastBonusAmt)}) with an installment.
      </p>
    </Card>
    {soaRow !== null && rows[soaRow] && (
      <HireSoaModal
        row={rows[soaRow]}
        entry={stateOf(rows[soaRow].key)}
        allRows={rows}
        recap={recap}
        isFirst={soaRow === 0}
        isLast={soaRow === rows.length - 1}
        onPatch={(patch) => setState(rows[soaRow].key, patch)}
        onClose={() => setSoaRow(null)}
      />
    )}
    </>
  );
}

/** Statement of Account — detailed hire calculation for one installment. */
function HireSoaModal({ row, entry, allRows, recap, isFirst, isLast, onPatch, onClose }: {
  row: { key: string; name: string; from: Date | null; to: Date | null; onHire: number; offHire: number; amount: number; ballast: boolean; status: string };
  entry: HirePayEntry;
  allRows: { key: string; name: string; amount: number; status: string }[];
  recap: Recap; isFirst: boolean; isLast: boolean;
  onPatch: (patch: Partial<HirePayEntry>) => void;
  onClose: () => void;
}) {
  const [jointOn, setJointOn] = useState('0');
  const [jointOff, setJointOff] = useState('0');
  const [hra, setHra] = useState('0');
  const [ownersExp, setOwnersExp] = useState('0');
  const [ownersClaim, setOwnersClaim] = useState('0');
  const [ilohcOn, setIlohcOn] = useState(isLast);

  const p2 = (n: number) => String(n).padStart(2, '0');
  const toInput = (d: Date | null) => (d ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}` : '');
  const inputToDmy = (iso: string) => { const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/); return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}` : ''; };
  const today = new Date();

  const offRows = entry.offHire ?? [];
  const setOff = (i: number, patch: Partial<OffHireRow>) => onPatch({ offHire: offRows.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) });
  const addOff = () => onPatch({ offHire: [...offRows, { cat: OFFHIRE_CATS[0], from: '', to: '', pct: '100', remark: '' }] });
  const delOff = (i: number) => onPatch({ offHire: offRows.filter((_, idx) => idx !== i) });
  const offTotal = offRows.reduce((s, o) => s + offHireDays(o), 0);

  const perDay = num(recap.hirePerDay);
  const nett = Math.max(0, row.onHire - offTotal);
  const hireAmt = nett * perDay;
  const bb = row.ballast ? num(recap.ballastBonus) : 0;
  const addrPct = num(recap.adcom);
  const brkgPct = num(recap.brokerage);
  const address = ((hireAmt + bb) * addrPct) / 100;
  const brokerage = (hireAmt * brkgPct) / 100;
  const foP = num(recap.foPrice);
  const doP = num(recap.doPrice);
  const delV = num(recap.etaPlan.startRobVlsfo);
  const delM = num(recap.etaPlan.startRobMgo);
  const bunkDelivery = isFirst ? delV * foP + delM * doP : 0;
  const end = etaEndRob(recap.etaPlan);
  const bunkRedelivery = isLast ? end.v * foP + end.m * doP : 0;
  const cve = (num(recap.cve) / 30) * nett;
  const ilohc = ilohcOn ? num(recap.ilohc) : 0;
  const surveys = num(jointOn) / 2 + num(jointOff) / 2;

  const owners = hireAmt + bb + bunkDelivery + cve + num(hra) + num(ownersExp) + num(ownersClaim);
  const charterers = address + brokerage + bunkRedelivery + ilohc + surveys;
  const totalPayable = owners - charterers;

  // Payments made to date = prior installments already Paid & Locked.
  const paidRows = allRows.filter((x) => x.status === 'Paid & Locked');
  const paidTotal = paidRows.reduce((s, x) => s + x.amount, 0);
  const grandTotal = allRows.reduce((s, x) => s + x.amount, 0);
  const balance = grandTotal - paidTotal;

  const nIn = (val: string, on: (v: string) => void) => (
    <input className="fv-ops__eta-in" inputMode="decimal" value={val} onChange={(e) => on(e.target.value)} />
  );
  const oCol = (v: number) => (v ? money(v) : '');
  const cCol = (v: number) => (v ? money(v) : '');

  return (
    <div className="fv-ops__modal-overlay" onClick={onClose}>
      <div className="fv-ops__soa" onClick={(e) => e.stopPropagation()}>
        <div className="fv-ops__soa-head">
          <div>
            <h2>Statement of Account — {row.name}</h2>
            <span className="fv-ops__soa-sub">{recap.vesselName} · CP {recap.cpDate || '—'} · SOA {p2(today.getDate())}-{p2(today.getMonth() + 1)}-{today.getFullYear()} · <span className={`fv-ops__pill fv-ops__pill--${hireStatusPill(row.status as HireStatus)}`}>{row.status}</span></span>
          </div>
          <button type="button" className="fv-ops__icon-btn" onClick={onClose} aria-label="Close"><i className="fas fa-xmark" aria-hidden="true" /></button>
        </div>

        <div className="fv-ops__soa-body">
          {/* On-hire details — From/To editable */}
          <div className="fv-ops__soa-onhire">
            <div><span>Delivery (From)</span><input type="datetime-local" className="fv-ops__eta-in" value={toInput(row.from)} onChange={(e) => onPatch({ from: inputToDmy(e.target.value) })} /></div>
            <div><span>Redelivery (To)</span><input type="datetime-local" className="fv-ops__eta-in" value={toInput(row.to)} onChange={(e) => onPatch({ to: inputToDmy(e.target.value) })} /></div>
            <div><span>Days On-Hire</span><b>{fmt(row.onHire, 2)}</b></div>
            <div><span>Days Off-Hire</span><b>{fmt(offTotal, 2)}</b></div>
            <div><span>Nett Days On-Hire</span><b className="fv-ops__pos">{fmt(nett, 2)}</b></div>
          </div>

          <table className="fv-ops__soa-tbl">
            <thead>
              <tr><th>No</th><th>Description</th><th className="fv-ops__r">Due to Owners</th><th className="fv-ops__r">Due to Charterers</th></tr>
            </thead>
            <tbody>
              <tr><td>1</td><td>Hire — {fmt(nett, 2)} days × {money(perDay)}/day</td><td className="fv-ops__r">{money(hireAmt)}</td><td className="fv-ops__r" /></tr>
              <tr><td>2</td><td>Ballast Bonus (LSUM){row.ballast ? '' : ' — n/a'}</td><td className="fv-ops__r">{oCol(bb)}</td><td className="fv-ops__r" /></tr>
              <tr><td>3</td><td>Address Commission @ {fmt(addrPct, 3)}%</td><td className="fv-ops__r" /><td className="fv-ops__r">{cCol(address)}</td></tr>
              <tr><td>4</td><td>Brokerage @ {fmt(brkgPct, 3)}%</td><td className="fv-ops__r" /><td className="fv-ops__r">{cCol(brokerage)}</td></tr>
              <tr><td>5</td><td>Bunker on Delivery{isFirst ? ` — VLSFO ${fmt(delV, 2)}mt @ ${foP} · LSMGO ${fmt(delM, 2)}mt @ ${doP}` : ' — n/a'}</td><td className="fv-ops__r">{oCol(bunkDelivery)}</td><td className="fv-ops__r" /></tr>
              <tr><td>6</td><td>Bunker on Redelivery{isLast ? ` — VLSFO ${fmt(end.v, 2)}mt · LSMGO ${fmt(end.m, 2)}mt` : ' — n/a'}</td><td className="fv-ops__r" /><td className="fv-ops__r">{cCol(bunkRedelivery)}</td></tr>
              <tr><td>7</td><td>Cable / Victualing / Entertainment — {money(num(recap.cve))}/mo × {fmt(nett, 2)}d</td><td className="fv-ops__r">{oCol(cve)}</td><td className="fv-ops__r" /></tr>
              <tr><td>8</td><td>ILOHC <label className="fv-ops__soa-chk"><input type="checkbox" checked={ilohcOn} onChange={(e) => setIlohcOn(e.target.checked)} /> apply</label></td><td className="fv-ops__r" /><td className="fv-ops__r">{cCol(ilohc)}</td></tr>
              <tr><td>9</td><td>Joint On-Hire Survey (÷2) <span className="fv-ops__soa-in">{nIn(jointOn, setJointOn)}</span></td><td className="fv-ops__r" /><td className="fv-ops__r">{cCol(num(jointOn) / 2)}</td></tr>
              <tr><td>10</td><td>Joint Off-Hire Survey (÷2) <span className="fv-ops__soa-in">{nIn(jointOff, setJointOff)}</span></td><td className="fv-ops__r" /><td className="fv-ops__r">{cCol(num(jointOff) / 2)}</td></tr>
              <tr><td>11</td><td>HRA Expenses <span className="fv-ops__soa-in">{nIn(hra, setHra)}</span></td><td className="fv-ops__r">{oCol(num(hra))}</td><td className="fv-ops__r" /></tr>
              <tr><td>12</td><td>Owners Expenses <span className="fv-ops__soa-in">{nIn(ownersExp, setOwnersExp)}</span></td><td className="fv-ops__r">{oCol(num(ownersExp))}</td><td className="fv-ops__r" /></tr>
              <tr><td>13</td><td>Owners Claim <span className="fv-ops__soa-in">{nIn(ownersClaim, setOwnersClaim)}</span></td><td className="fv-ops__r">{oCol(num(ownersClaim))}</td><td className="fv-ops__r" /></tr>
            </tbody>
            <tfoot>
              <tr className="fv-ops__soa-sum"><td colSpan={2}>Sum</td><td className="fv-ops__r">{money(owners)}</td><td className="fv-ops__r">{money(charterers)}</td></tr>
              <tr className="fv-ops__soa-total"><td colSpan={2}>Total Payable to Owners (this hire)</td><td className="fv-ops__r" colSpan={2}>{money(totalPayable)}</td></tr>
            </tfoot>
          </table>

          {/* Statement of off-hire */}
          <div className="fv-ops__soa-section">
            <div className="fv-ops__vd-sub-head"><i className="fas fa-hourglass-half" aria-hidden="true" /> Statement of Off-Hire <button type="button" className="fv-ops__btn fv-ops__soa-add" onClick={addOff}><i className="fas fa-plus" aria-hidden="true" /> Event</button></div>
            <table className="fv-ops__soa-tbl">
              <thead>
                <tr><th>Category</th><th>From</th><th>To</th><th className="fv-ops__r">%</th><th className="fv-ops__r">Days</th><th>Remarks</th><th aria-label="Remove" /></tr>
              </thead>
              <tbody>
                {offRows.length === 0 && <tr><td colSpan={7} className="fv-ops__vd-empty">No off-hire recorded. Use “Event” to add working / idle / sea / weather off-hire.</td></tr>}
                {offRows.map((o, i) => (
                  <tr key={i}>
                    <td><select className="fv-ops__eta-sel" value={o.cat} onChange={(e) => setOff(i, { cat: e.target.value })}>{OFFHIRE_CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select></td>
                    <td><input type="datetime-local" className="fv-ops__eta-in" value={toInput(parseDMY(o.from))} onChange={(e) => setOff(i, { from: inputToDmy(e.target.value) })} /></td>
                    <td><input type="datetime-local" className="fv-ops__eta-in" value={toInput(parseDMY(o.to))} onChange={(e) => setOff(i, { to: inputToDmy(e.target.value) })} /></td>
                    <td className="fv-ops__r">{nIn(o.pct, (v) => setOff(i, { pct: v }))}</td>
                    <td className="fv-ops__r fv-ops__stw-calc">{fmt(offHireDays(o), 3)}</td>
                    <td><input className="fv-ops__vd-in" value={o.remark} placeholder="Remarks" onChange={(e) => setOff(i, { remark: e.target.value })} /></td>
                    <td className="fv-ops__r"><button type="button" className="fv-ops__bnk-rm" aria-label="Remove" onClick={() => delOff(i)}><i className="fas fa-xmark" aria-hidden="true" /></button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="fv-ops__soa-sum"><td colSpan={4}>Total Off-Hire (A + B + C + D)</td><td className="fv-ops__r">{fmt(offTotal, 3)}</td><td colSpan={2}>days</td></tr>
              </tfoot>
            </table>
          </div>

          {/* Payments — running account of all installments */}
          <div className="fv-ops__soa-section">
            <div className="fv-ops__vd-sub-head"><i className="fas fa-list-check" aria-hidden="true" /> Payments</div>
            <table className="fv-ops__soa-tbl">
              <tbody>
                {allRows.map((x) => {
                  const locked = hireLocked(x.status as HireStatus);
                  const paid = x.status === 'Paid & Locked';
                  return (
                    <tr key={x.key} className={x.key === row.key ? 'fv-ops__soa-current' : undefined}>
                      <td>Less: {x.name}{locked && <i className="fas fa-lock fv-ops__hire-lock" title={x.status} aria-hidden="true" />}</td>
                      <td>{x.status}</td>
                      <td className="fv-ops__r">{paid ? `-${money(x.amount)}` : money(x.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="fv-ops__soa-sum"><td colSpan={2}>Total Payment Made Till Date</td><td className="fv-ops__r">-{money(paidTotal)}</td></tr>
                <tr className={`fv-ops__soa-bal${balance < 0 ? ' fv-ops__soa-bal--neg' : ''}`}><td colSpan={2}>Balance Due {balance >= 0 ? 'to' : '(from)'} Owners (all hires)</td><td className="fv-ops__r">{money(Math.abs(balance))}</td></tr>
              </tfoot>
            </table>
          </div>

          <p className="fv-ops__hint">Nett On-Hire = On-Hire − Off-Hire (A working + B idle + C sea + D weather). Off-hire event days = (To − From) × %. Bunkers on delivery due Owners (1st hire); on redelivery due Charterers (last hire). Paid &amp; Locked hires show a lock and deduct from the balance. *E&amp;OE.</p>
        </div>
      </div>
    </div>
  );
}

/** Ordinal label (1 → "1st", 2 → "2nd", …). */
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/* ------------------------------------------------------------ Freight & Laytime */

function FreightTab({ recap, voyage }: { recap: Recap; voyage: Voyage }) {
  const qty = num(recap.finalQtyLoaded);
  const freight = qty * num(recap.freightPerMt);
  const laytime = [
    { port: 'Salalah (Load)', allowed: qty / num(recap.loadRate || '1'), used: 4.2, rate: recap.loadRate },
    { port: 'Paradip (Disch)', allowed: (qty * 0.4) / num(recap.dischRate || '1'), used: 3.1, rate: recap.dischRate },
    { port: 'Haldia (Disch)', allowed: (qty * 0.6) / num(recap.dischRate || '1'), used: 5.8, rate: recap.dischRate },
  ];
  const [copied, setCopied] = useState(false);
  const copyToPostfix = () => {
    copyLaytimeToPostfix(voyage.id);
    addNotification(`Laytime for ${voyage.vessel} (${voyage.id}) copied to Postfix.`, 'Postfix');
    setCopied(true);
  };
  return (
    <div className="fv-ops__grid2">
      <Card title="Freight Invoice" icon="fa-file-invoice-dollar">
        <table className="fv-ops__table">
          <tbody>
            <tr><td>BL Quantity</td><td className="fv-ops__r">{fmt(qty, 0)} MT</td></tr>
            <tr><td>Freight Rate</td><td className="fv-ops__r">${recap.freightPerMt} / MT</td></tr>
            <tr className="fv-ops__row-sub"><td>Gross Freight</td><td className="fv-ops__r">{money(freight)}</td></tr>
            <tr><td>Payment Terms</td><td className="fv-ops__r">{recap.frtPaymentTerms}</td></tr>
          </tbody>
        </table>
      </Card>
      <Card title="Laytime Statement" icon="fa-hourglass-half">
        <table className="fv-ops__table">
          <thead>
            <tr><th>Port</th><th className="fv-ops__r">Allowed (d)</th><th className="fv-ops__r">Used (d)</th><th className="fv-ops__r">Balance</th></tr>
          </thead>
          <tbody>
            {laytime.map((l) => {
              const bal = l.allowed - l.used;
              return (
                <tr key={l.port}>
                  <td>{l.port}</td>
                  <td className="fv-ops__r">{fmt(l.allowed, 2)}</td>
                  <td className="fv-ops__r">{fmt(l.used, 2)}</td>
                  <td className={`fv-ops__r ${bal >= 0 ? 'fv-ops__pos' : 'fv-ops__neg'}`}>{fmt(bal, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="fv-ops__hint">Demurrage: {recap.demDespatch} /day · Despatch: {recap.despatchTerm}</p>
        <div className="fv-ops__laytime-actions">
          <button type="button" className="fv-ops__btn fv-ops__btn--primary" onClick={copyToPostfix} disabled={copied}>
            <i className={`fas ${copied ? 'fa-circle-check' : 'fa-share-from-square'}`} aria-hidden="true" />{' '}
            {copied ? 'Copied to Postfix' : 'Copy Laytime to Postfix'}
          </button>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ Cost Comparisons */

function CostsTab({ pnl }: { pnl: Pnl }) {
  const lines: { label: string; est: number; act: number }[] = [
    { label: 'Hire (net)', est: pnl.netHire * 0.97, act: pnl.netHire },
    { label: 'Bunkers', est: pnl.bunkerCost * 0.92, act: pnl.bunkerCost },
    { label: 'Port DA', est: pnl.portCost * 0.9, act: pnl.portCost },
    { label: 'C/V/E', est: pnl.cveTotal, act: pnl.cveTotal },
    { label: 'ILOHC', est: pnl.ilohc, act: pnl.ilohc },
    { label: 'Other', est: pnl.otherCost * 0.8, act: pnl.otherCost },
  ];
  return (
    <Card title="Cost Comparison — Estimate vs Actual" icon="fa-scale-balanced">
      <table className="fv-ops__table">
        <thead>
          <tr><th>Cost Line</th><th className="fv-ops__r">Estimate</th><th className="fv-ops__r">Actual</th><th className="fv-ops__r">Variance</th><th className="fv-ops__r">%</th></tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const v = l.act - l.est;
            const pct = l.est ? (v / l.est) * 100 : 0;
            return (
              <tr key={l.label}>
                <td>{l.label}</td>
                <td className="fv-ops__r">{money(l.est)}</td>
                <td className="fv-ops__r">{money(l.act)}</td>
                <td className={`fv-ops__r ${v <= 0 ? 'fv-ops__pos' : 'fv-ops__neg'}`}>{money(v)}</td>
                <td className={`fv-ops__r ${v <= 0 ? 'fv-ops__pos' : 'fv-ops__neg'}`}>{fmt(pct)}%</td>
              </tr>
            );
          })}
          <tr className="fv-ops__row-sub">
            <td>Total</td>
            <td className="fv-ops__r">{money(lines.reduce((s, l) => s + l.est, 0))}</td>
            <td className="fv-ops__r">{money(lines.reduce((s, l) => s + l.act, 0))}</td>
            <td className="fv-ops__r">{money(lines.reduce((s, l) => s + (l.act - l.est), 0))}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

/* ------------------------------------------------------------ Vessel Reports */

function ReportsTab({ voyage }: { voyage: Voyage }) {
  const reports = [
    { date: '20-07 12:00 UTC', type: 'Noon at Sea', spd: voyage.instSpeed ?? 12.4, fo: voyage.instCons ?? 26, pos: '14°20N 070°10E' },
    { date: '19-07 12:00 UTC', type: 'Noon at Sea', spd: 12.1, fo: 25.6, pos: '13°02N 073°44E' },
    { date: '18-07 12:00 UTC', type: 'Noon at Sea', spd: 12.6, fo: 26.4, pos: '11°40N 077°05E' },
    { date: '14-07 22:00 LT', type: 'Departure', spd: 0, fo: 0, pos: 'Salalah' },
  ];
  return (
    <Card title="Vessel Reports" icon="fa-file-lines">
      <table className="fv-ops__table">
        <thead>
          <tr><th>Date</th><th>Report</th><th className="fv-ops__r">Speed (kn)</th><th className="fv-ops__r">FO/day (MT)</th><th>Position</th></tr>
        </thead>
        <tbody>
          {reports.map((r, i) => (
            <tr key={i}>
              <td>{r.date}</td>
              <td>{r.type}</td>
              <td className="fv-ops__r">{fmt(r.spd, 1)}</td>
              <td className="fv-ops__r">{fmt(r.fo, 1)}</td>
              <td>{r.pos}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/* ------------------------------------------------------------ right rail bits */

function RailIcon({ icon, label, active, badge, onClick }: { icon: string; label: string; active: boolean; badge?: number; onClick: () => void }) {
  return (
    <button type="button" className={`fv-ops__rail-icon${active ? ' fv-ops__rail-icon--active' : ''}`} onClick={onClick} title={label}>
      <i className={`fas ${icon}`} aria-hidden="true" />
      {badge != null && badge > 0 && <span className="fv-ops__rail-badge">{badge}</span>}
      <span className="fv-ops__rail-icon-label">{label}</span>
    </button>
  );
}

function DocsPanel({ docs, onRemove, onUpload }: { docs: DocItem[]; onRemove: (id: string) => void; onUpload: () => void }) {
  const groups = docs.reduce<Record<string, DocItem[]>>((acc, d) => {
    (acc[d.category] ??= []).push(d);
    return acc;
  }, {});
  return (
    <div>
      <button type="button" className="fv-ops__btn fv-ops__btn--primary fv-ops__btn--block" onClick={onUpload}>
        <i className="fas fa-cloud-arrow-up" /> Upload document
      </button>
      {Object.entries(groups).map(([cat, items]) => (
        <div key={cat} className="fv-ops__doc-group">
          <div className="fv-ops__doc-group-head">{cat}</div>
          {items.map((d) => (
            <div key={d.id} className="fv-ops__doc">
              <i className="fas fa-file-pdf" aria-hidden="true" />
              <span className="fv-ops__doc-name">{d.name}</span>
              <span className="fv-ops__doc-meta">{d.size} · {d.at}</span>
              <button type="button" className="fv-ops__icon-btn" onClick={() => onRemove(d.id)} title="Remove"><i className="fas fa-xmark" /></button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TasksPanel({ tasks, onToggle }: { tasks: Task[]; onToggle: (id: string) => void }) {
  return (
    <ul className="fv-ops__tasks">
      {tasks.map((t) => (
        <li key={t.id} className={t.done ? 'fv-ops__task--done' : ''}>
          <label>
            <input type="checkbox" checked={t.done} onChange={() => onToggle(t.id)} />
            <span className="fv-ops__task-text">{t.text}</span>
          </label>
          <span className="fv-ops__task-due">{t.due}</span>
        </li>
      ))}
    </ul>
  );
}

function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  return (
    <ul className="fv-ops__alerts">
      {alerts.map((a) => (
        <li key={a.id} className={`fv-ops__alert fv-ops__alert--${a.level}`}>
          <i className="fas fa-bell" aria-hidden="true" /> {a.text}
        </li>
      ))}
    </ul>
  );
}

function UploadPanel({
  onIngest,
  fetchNote,
}: {
  onIngest: (files: FileList | null, category: string, overwrite: boolean) => void;
  fetchNote: string | null;
}) {
  const [category, setCategory] = useState('Recap');
  const [overwrite, setOverwrite] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cats = ['Recap', 'Charter Party', 'SOF', 'NOR', 'B/L', 'Invoice', 'Supporting'];
  const fetches = category === 'Recap' || category === 'Charter Party';
  return (
    <div>
      <label className="fv-ops__rf">
        <span className="fv-ops__rf-label">Document type</span>
        <select className="fv-ops__rf-input" value={category} onChange={(e) => setCategory(e.target.value)}>
          {cats.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      {fetches && (
        <label className="fv-ops__check" style={{ margin: '6px 0' }}>
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> Overwrite manual entries
        </label>
      )}
      <div
        className={`fv-ops__dropzone${dragOver ? ' fv-ops__dropzone--over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onIngest(e.dataTransfer.files, category, overwrite);
        }}
        onClick={() => fileRef.current?.click()}
      >
        <i className="fas fa-cloud-arrow-up" aria-hidden="true" />
        <span>Drop {category} here</span>
        <span className="fv-ops__hint">or click to browse</span>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => onIngest(e.target.files, category, overwrite)} />
      </div>
      {fetchNote && (
        <p className="fv-ops__fetch-note">
          <i className="fas fa-circle-check" aria-hidden="true" /> {fetchNote}
        </p>
      )}
      <p className="fv-ops__hint">
        Uploading a Terms Recap or Charter Party reads key figures from the document into the Voyage
        Details fields — blank fields only, unless “Overwrite” is ticked.
      </p>
    </div>
  );
}
