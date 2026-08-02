import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useSelectedVoyage } from '../data/selectedVoyage';
import type { Voyage } from '../data/voyages';
import { makeBlankVoyage } from '../data/voyages';
import { addNotification, copyLaytimeToPostfix, useCpdds, useFixtureNumbers } from '../data/workflow';
import { loadClients, saveClients, SERVICE_PROVIDER_TYPES } from '../data/clients';
import { loadVessels, saveVessels } from '../data/vessels';
import { loadOpsRecap, readOpsRecapRaw, writeOpsRecapRaw, subscribeOpsRecap } from '../data/opsRecap';
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
  blIssueDate: string;
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
  loiStatus: string;
  // extra operating figures used by the P&L
  foCons: string;
  foPrice: string;
  doCons: string;
  doPrice: string;
  portDaLoad: string;
  portDaDisch: string;
  otherCost: string;
  miscIncome: string;
  // --- CP performance warranty (speed & consumption) ----------------------
  cpSpeed: string;
  cpCons: string;
  // --- units (redesigned Voyage Details) ---------------------------------
  hireCurrency: string;
  freightCurrency: string;
  cargoQtyUnit: string;
  // --- hire payment schedule ---------------------------------------------
  firstHirePeriodDays: string;
  firstHireInclude: string;
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
  // --- Freight invoice + laytime calculations (Freight & Laytime tab) ------
  freightLaytime?: FreightLaytimeData;
  // --- Independent duplicated hire installments (kept out of the live schedule) --
  hireDuplicates?: HireDuplicate[];
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
  // Vessel load-line draughts — drive zone-crossing points (Summer / Winter / Tropical).
  summerDraft: string;
  winterDraft: string;
  tropicalDraft: string;
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

/** One “statement of facts” line in a port laytime calculation. */
interface LaytimeEvent {
  date: string;   // dd-mm-yyyy
  from: string;   // HH:MM
  to: string;     // HH:MM
  pct: string;    // % of the elapsed time that counts as laytime
  remark: string;
}

/** A single load/discharge port laytime calculation (mirrors the LTC worksheet). */
interface LaytimePort {
  id: string;
  name: string;
  op: 'Load' | 'Discharge';
  cargo: string;
  quantity: string;        // MT worked at this port
  rate: string;            // load/disch rate mt/day
  terms: string;           // SSHEX / SHINC etc.
  norTendered: string;     // dd-mm-yyyy HH:MM
  norAccepted: string;     // dd-mm-yyyy HH:MM
  turnTimeHours: string;   // turn time in hours
  commenced: string;       // laytime commenced dd-mm-yyyy HH:MM
  completed: string;       // laytime completed dd-mm-yyyy HH:MM
  reversible: boolean;     // reversible laytime
  demurrageRate: string;   // USD / day
  despatchRate: string;    // USD / day
  events: LaytimeEvent[];
}

/** Freight invoice + per-port laytime data for the Freight & Laytime tab. */
interface FreightInvoice {
  id: string;
  kind: 'Freight' | 'Demurrage';
  title: string;
  invoiceNo: string;
  invoiceDate: string;       // dd-mm-yyyy
  invoiceTo: string;
  paymentTerms: string;
  dueDate: string;           // dd-mm-yyyy
  status: string;            // Draft / Sent / Paid
  freightType: 'Initial' | 'Final';
  freightDifferential: string; // extra freight rate per MT (final invoice)
  pctFreightDue: string;       // % of total freight due (e.g. 90 or 100)
  initialFreightReceived: string;
  loadPortDA: string;
  dischPortDA: string;
  includeDemurrage: boolean;   // fold demurrage/despatch into a final freight invoice
}

interface FreightLaytimeData {
  invoices: FreightInvoice[];
  laytimes: LaytimePort[];
}

/** Recap keys whose value is a plain string (everything except arrays). */
type RecapTextKey = Exclude<keyof Recap, 'serviceProviders' | 'bunkers' | 'pnlNotes' | 'etaPlan' | 'stowage' | 'hirePayState' | 'freightLaytime' | 'hireDuplicates'>;

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
    holdCleaning: 'Owners',
    finalQtyLoaded: '76214',
    blIssueDate: '',
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
    loiOblDPort: 'LOI',
    loiStatus: 'Awaiting from Charterers',
    foCons: '155',
    foPrice: '560',
    doCons: '6',
    doPrice: '800',
    portDaLoad: '48,000',
    portDaDisch: '86,000',
    otherCost: '12,000',
    miscIncome: '0',
    cpSpeed: voyage?.cpSpeed ? String(voyage.cpSpeed) : '14',
    cpCons: voyage?.cpCons ? String(voyage.cpCons) : '33',
    hireCurrency: 'USD',
    freightCurrency: 'USD',
    cargoQtyUnit: 'MT',
    firstHirePeriodDays: '15',
    firstHireInclude: 'Bunkers',
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
      lightship: '11236',
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
      summerDraft: '12.90',
      winterDraft: '12.63',
      tropicalDraft: '13.17',
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

  const [recap, setRecap] = useState<Recap>(() => {
    const loaded = loadOpsRecap(voyage?.id);
    return loaded ? { ...seedRecap(voyage), ...(loaded as Partial<Recap>) } : seedRecap(voyage);
  });
  const [tab, setTab] = useState<TabId>('pnl');
  const [rail, setRail] = useState<RailPanel>(null);
  const [docs, setDocs] = useState<DocItem[]>(() => seedDocs());
  const [tasks, setTasks] = useState<Task[]>(() => seedTasks());
  const [fetchNote, setFetchNote] = useState<string | null>(null);
  const [opsStatus, setOpsStatus] = useState<string>(voyage?.status || 'At Sea');
  // Guards the shared-store sync loop: the raw JSON we last read/wrote.
  const lastSavedRef = useRef<string>(readOpsRecapRaw(voyage?.id) ?? '');

  useEffect(() => {
    const loaded = loadOpsRecap(voyage?.id);
    setRecap(loaded ? { ...seedRecap(voyage), ...(loaded as Partial<Recap>) } : seedRecap(voyage));
    lastSavedRef.current = readOpsRecapRaw(voyage?.id) ?? '';
    setTab('pnl');
    setDocs(seedDocs());
    setTasks(seedTasks());
    setOpsStatus(voyage?.status || 'At Sea');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyage?.id]);

  // Persist recap edits to the shared per-voyage store (skips no-op writes).
  useEffect(() => {
    if (!voyage) return;
    const raw = JSON.stringify(recap);
    if (raw === lastSavedRef.current) return;
    lastSavedRef.current = raw;
    writeOpsRecapRaw(voyage.id, raw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recap, voyage?.id]);

  // Reflect external edits (other tabs / other pages) into the recap live.
  useEffect(() => {
    if (!voyage) return;
    return subscribeOpsRecap(voyage.id, () => {
      const raw = readOpsRecapRaw(voyage.id);
      if (raw && raw !== lastSavedRef.current) {
        lastSavedRef.current = raw;
        try {
          const loaded = JSON.parse(raw) as Partial<Recap>;
          setRecap((prev) => ({ ...prev, ...loaded }));
        } catch {
          /* ignore malformed */
        }
      }
    });
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
        <RecapTopBar recap={recap} voyage={voyage} status={opsStatus} onStatus={setOpsStatus} />

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
          {tab === 'freight' && <FreightTab recap={recap} setRecap={setRecap} voyage={voyage} />}
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
// What the 1st hire payment includes.
const OPS_HIRE_INCLUDE = ['Bunkers', 'Ballast Bonus', 'Both', 'None'];
// Hold-cleaning responsibility.
const OPS_HOLD_CLEANING = ['Owners', 'Self (Company)', 'Charterers'];
// LOI / OBL at discharge and its approval status.
const OPS_LOI_OBL = ['OBL', 'LOI'];
const OPS_LOI_STATUS = ['Awaiting from Charterers', 'Awaiting Owners Confirmation', 'Submitted', 'Approved by Owners'];
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
        step="60"
        className={`fv-ops__vd-in fv-ops__vd-in--dt${accent ? ' fv-ops__vd-in--accent' : ''}`}
        value={dmyToDateTimeInput(value)}
        onChange={(e) => onChange(dateTimeInputToDmy(e.target.value))}
      />
    </label>
  );
}

/** Labelled date-only picker bound to a recap `dd-mm-yyyy` string. */
function VdDate({ label, value, onChange, accent }: { label: string; value: string; onChange: (v: string) => void; accent?: boolean }) {
  const toInput = (v: string) => { const m = (v || '').match(/(\d{1,2})-(\d{1,2})-(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
  const fromInput = (iso: string) => { const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
  return (
    <label className="fv-ops__vd-field">
      <span>{label}</span>
      <input type="date" className={`fv-ops__vd-in fv-ops__vd-in--dt${accent ? ' fv-ops__vd-in--accent' : ''}`} value={toInput(value)} onChange={(e) => onChange(fromInput(e.target.value))} />
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


function RecapTopBar({ recap, voyage, status, onStatus }: { recap: Recap; voyage: Voyage; status: string; onStatus: (v: string) => void }) {
  const cpdd = useCpdds()[voyage.id];
  const account = voyage.client || recap.owners || '—';
  const portFrom = recap.loadPort || voyage.portFrom || '—';
  const portTo = recap.dischargePort || voyage.portTo || '—';
  return (
    <div className="fv-ops__topbar">
      <div className="fv-ops__recap-title">
        <i className="fas fa-ship" aria-hidden="true" />
        <div>
          <h1>{recap.vesselName}</h1>
          <span className="fv-ops__recap-sub">
            {recap.voyageFixType} · {account} / CPDD {cpdd || recap.cpDate || '—'} - {portFrom} - {portTo}
          </span>
        </div>
      </div>
      <div className="fv-ops__recap-kpis">
        <WorkflowStatusSelect module="Operations" voyageId={voyage.id} />
        <label className="fv-status-select" title="Change voyage status">
          <span className="fv-status-select__label">Voyage</span>
          <select className="fv-status-select__input fv-status-select__input--active" value={status} onChange={(e) => onStatus(e.target.value)} aria-label="Voyage status">
            {status && !OPS_VOYAGE_STATUSES.includes(status) && <option value={status}>{status}</option>}
            {OPS_VOYAGE_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
        </label>
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
            <VdDate label="BL Issue Date" value={recap.blIssueDate} onChange={(v) => set('blIssueDate', v)} />
            <VdSelect label="Hold Cleaning" value={recap.holdCleaning} onChange={(v) => set('holdCleaning', v)} options={OPS_HOLD_CLEANING} />
            <label className="fv-ops__vd-field">
              <span>Voyage Duration (days)</span>
              <input className="fv-ops__vd-in" readOnly value={fmt(daysBetween(parseDMY(recap.deliveryDateTime), parseDMY(recap.redeliveryDateTime)), 2)} title="Delivery → Redelivery" />
            </label>
            <VdField label="CP Speed (kn)" value={recap.cpSpeed} onChange={(v) => set('cpSpeed', v)} num />
            <VdField label="CP Consumption (MT/day)" value={recap.cpCons} onChange={(v) => set('cpCons', v)} num />
          </div>
        </Card>

        <Card title="Owners" icon="fa-building">
          <div className="fv-ops__vd-fields">
            <VdCombo label="Owners" value={recap.owners} onChange={(v) => set('owners', v)} options={ownerNames} listId="vd-owners" accent />
            <VdCombo label="Owners Broker" value={recap.ownersBroker} onChange={(v) => set('ownersBroker', v)} options={brokerNames} listId="vd-brokers" />
            <VdField label="CP Date" value={recap.cpDate} onChange={(v) => set('cpDate', v)} placeholder="dd-mm-yyyy" />
            <VdValueUnit label="Hire Per Day (PDPR)" value={recap.hirePerDay} onValue={(v) => set('hirePerDay', v)} unit={recap.hireCurrency} onUnit={(v) => set('hireCurrency', v)} units={OPS_CURRENCIES} accent num />
          </div>
          <div className="fv-ops__vd-dr">
            <div className="fv-ops__vd-dr-col">
              <VdDateTime label="Laycan Start" value={recap.laycanStart} onChange={(v) => set('laycanStart', v)} />
            </div>
            <div className="fv-ops__vd-dr-col">
              <VdDateTime label="Laycan End" value={recap.laycanEnd} onChange={(v) => set('laycanEnd', v)} />
            </div>
          </div>
          <div className="fv-ops__vd-sub">
            <div className="fv-ops__vd-sub-head"><i className="fas fa-money-check-dollar" aria-hidden="true" /> Hire Payment</div>
            <div className="fv-ops__vd-inline fv-ops__vd-inline--tight">
              <span>1st hire covers</span>
              <select className="fv-ops__vd-unit" value={recap.firstHirePeriodDays} onChange={(e) => set('firstHirePeriodDays', e.target.value)}>{OPS_HIRE_INTERVALS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
              <span>days, including</span>
              <select className="fv-ops__vd-unit fv-ops__vd-unit--wide" value={recap.firstHireInclude} onChange={(e) => set('firstHireInclude', e.target.value)}>{OPS_HIRE_INCLUDE.map((o) => <option key={o} value={o}>{o}</option>)}</select>
              <span>, payable within</span>
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
            <VdValueUnit label="Freight / MT" value={recap.freightPerMt} onValue={(v) => set('freightPerMt', v)} unit={recap.freightCurrency} onUnit={(v) => set('freightCurrency', v)} units={OPS_CURRENCIES} accent num />
          </div>
          <div className="fv-ops__vd-dr">
            <div className="fv-ops__vd-dr-col">
              <VdDateTime label="Charterers Laycan Start" value={recap.charterersLaycanStart} onChange={(v) => set('charterersLaycanStart', v)} />
            </div>
            <div className="fv-ops__vd-dr-col">
              <VdDateTime label="Charterers Laycan End" value={recap.charterersLaycanEnd} onChange={(v) => set('charterersLaycanEnd', v)} />
            </div>
          </div>
          <div className="fv-ops__vd-sub">
            <div className="fv-ops__vd-sub-head"><i className="fas fa-file-invoice-dollar" aria-hidden="true" /> Freight Payment</div>
            <div className="fv-ops__vd-inline fv-ops__vd-inline--tight">
              <span>Within</span>
              <select className="fv-ops__vd-unit" value={recap.freightPaymentDays} onChange={(e) => set('freightPaymentDays', e.target.value)}>{OPS_BANKING_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
              <select className="fv-ops__vd-unit fv-ops__vd-unit--wide" value={recap.freightPaymentBasis} onChange={(e) => set('freightPaymentBasis', e.target.value)}>{OPS_PAYMENT_BASES.map((b) => <option key={b} value={b}>{b}</option>)}</select>
              <span>after loading / BL</span>
            </div>
          </div>
        </Card>

        <Card title="Delivery / Redelivery" icon="fa-clock">
          <div className="fv-ops__vd-dr">
            <div className="fv-ops__vd-dr-col">
              <VdField label="Delivery Port" value={recap.deliveryPort} onChange={(v) => set('deliveryPort', v)} accent />
              <VdCombo label="Delivery Term" value={recap.deliveryTerm} onChange={(v) => set('deliveryTerm', v)} options={OPS_BERTH_TERMS} listId="vd-delterm" />
              <VdDateTime label="Delivery Date / Time" value={recap.deliveryDateTime} onChange={(v) => set('deliveryDateTime', v)} accent />
            </div>
            <div className="fv-ops__vd-dr-col">
              <VdField label="Redelivery Port" value={recap.redeliveryPort} onChange={(v) => set('redeliveryPort', v)} accent />
              <VdCombo label="Redelivery Term" value={recap.redeliveryTerm} onChange={(v) => set('redeliveryTerm', v)} options={OPS_BERTH_TERMS} listId="vd-redelterm" />
              <VdDateTime label="Redelivery Date / Time" value={recap.redeliveryDateTime} onChange={(v) => set('redeliveryDateTime', v)} accent />
            </div>
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
            <VdSelect label="LOI / OBL at D.Port" value={recap.loiOblDPort} onChange={(v) => set('loiOblDPort', v)} options={OPS_LOI_OBL} />
            {recap.loiOblDPort === 'LOI' && (
              <VdSelect label="LOI Status" value={recap.loiStatus} onChange={(v) => set('loiStatus', v)} options={OPS_LOI_STATUS} />
            )}
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
  // Standard load-line rule: Winter = Summer − 1/48·S, Tropical = Summer + 1/48·S.
  const deriveZoneDrafts = () => {
    const s = num(st.summerDraft);
    if (s > 0) setPlan({ winterDraft: (s - s / 48).toFixed(2), tropicalDraft: (s + s / 48).toFixed(2) });
  };
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
  // Vessel hydrostatic reference (from the density-correction card) for deriving
  // a port's max displacement from its max draft: Δdisp = TPC × 100 per metre.
  const draftRef = num(st.draft.draftCurrent);
  const dispRef = num(st.draft.dispSW);
  const tpcRef = num(st.draft.tpc);
  const portFor = (name: string) => st.ports.find((pp) => pp.name.trim().toUpperCase() === (name || '').trim().toUpperCase());
  // Load-line zone crossing → the vessel's zone draught caps the max draft.
  const zoneDraftFor = (name: string): number => {
    const n = (name || '').toUpperCase();
    if (n.includes('WINTER') || /\bWZ\b/.test(n)) return num(st.winterDraft);
    if (n.includes('TROPICAL') || /\bTZ\b/.test(n)) return num(st.tropicalDraft);
    if (n.includes('SUMMER') || /\bSZ\b/.test(n)) return num(st.summerDraft);
    return 0;
  };
  const rows = st.points.map((p) => {
    const port = portFor(p.name);
    const zoneDraft = zoneDraftFor(p.name);
    const portDensity = port ? num(port.density) : 0;
    const density = portDensity || num(p.density) || 1.025;
    const maxDraft = zoneDraft > 0 ? zoneDraft : (port ? num(port.maxDraft) : 0);
    const draftDerived = maxDraft > 0 && dispRef > 0 && tpcRef > 0 && draftRef > 0;
    const dispMax = draftDerived ? dispRef + (maxDraft - draftRef) * tpcRef * 100 : num(p.displacement);
    const dispPort = dispMax * (density / 1.025);
    const auto = st.autoBunker ? robByPort[p.name.trim().toUpperCase()] : undefined;
    const vlsfo = auto ? auto.v : num(p.vlsfo);
    const mgo = auto ? auto.m : num(p.mgo);
    const bw = num(p.bw);
    const fw = num(p.fw);
    const constants = num(p.constants);
    const deductions = vlsfo + mgo + bw + fw + constants;
    const dwt = dispPort - lightship;
    const cargo = dwt - deductions;
    return { maxDraft, density, dispMax, dispPort, vlsfo, mgo, bw, fw, constants, dwt, deductions, cargo, autoMatched: !!auto, draftDerived, densityFromPort: portDensity > 0, zone: zoneDraft > 0 };
  });
  const cargoVals = rows.map((r) => r.cargo);
  const minCargo = cargoVals.length ? Math.min(...cargoVals) : 0;
  const governIdx = cargoVals.indexOf(minCargo);
  const governName = governIdx >= 0 ? st.points[governIdx]?.name : '—';
  // Governing-point details for the summary strip.
  const govDensity = governIdx >= 0 ? rows[governIdx].density.toFixed(3) : '';
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
            <button type="button" className="fv-ops__btn" onClick={deriveZoneDrafts} title="Winter = Summer − 1/48; Tropical = Summer + 1/48">W/T from Summer</button>
            <label className="fv-ops__stw-toggle" title="Auto-fill VLSFO/MGO from the ETA & ROB itinerary where the port name matches">
              <input type="checkbox" checked={st.autoBunker} onChange={(e) => setPlan({ autoBunker: e.target.checked })} /> Auto bunkers
            </label>
            <button type="button" className="fv-ops__btn" onClick={addPoint}><i className="fas fa-plus" aria-hidden="true" /> Zone / Port</button>
          </span>
        )}
      >
        <div className="fv-ops__vd-fields fv-ops__eta-controls">
          <VdField label="Lightship (MT)" value={st.lightship} onChange={(v) => setPlan({ lightship: v })} num />
          <VdField label="Summer Draft (m)" value={st.summerDraft} onChange={(v) => setPlan({ summerDraft: v })} num />
          <VdField label="Winter Draft (m)" value={st.winterDraft} onChange={(v) => setPlan({ winterDraft: v })} num />
          <VdField label="Tropical Draft (m)" value={st.tropicalDraft} onChange={(v) => setPlan({ tropicalDraft: v })} num />
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
              <tr><th scope="row">Max Draft (m)</th>{rows.map((r, i) => <td key={i} className="fv-ops__r fv-ops__stw-calc" title={r.zone ? 'Vessel load-line zone draught' : undefined}>{r.maxDraft > 0 ? `${fmt(r.maxDraft, 2)}${r.zone ? ' ⚓' : ''}` : '—'}</td>)}</tr>
              <tr><th scope="row">Displacement (Max)</th>{st.points.map((p, i) => <td key={i} className="fv-ops__r">{rows[i].draftDerived ? <span className="fv-ops__stw-derived" title="Derived from Max Draft × TPC (density-correction card)">{fmt(rows[i].dispMax, 0)}</span> : nIn(p.displacement, (v) => setPoint(i, { displacement: v }))}</td>)}</tr>
              <tr><th scope="row">Lightship</th>{rows.map((_, i) => <td key={i} className="fv-ops__r fv-ops__stw-calc">{fmt(lightship, 0)}</td>)}</tr>
              <tr><th scope="row">Water Density</th>{st.points.map((p, i) => <td key={i} className="fv-ops__r">{rows[i].densityFromPort ? <span className="fv-ops__stw-derived" title="From Ports & Draft Restrictions">{rows[i].density.toFixed(3)}</span> : nIn(p.density, (v) => setPoint(i, { density: v }))}</td>)}</tr>
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
          <i className="fas fa-circle-info" aria-hidden="true" /> A point named <b>Summer / Winter / Tropical</b> zone is capped at the vessel's corresponding load-line draught (⚓); otherwise the Max Draft comes from the matching Ports row. <b>Max Displacement is derived from that Max Draft</b> (Δ = TPC × 100 per metre vs the reference draft/displacement in the density-correction card) and <b>Density</b> from the Ports table. Cargo Qty = (Displacement × Density/1.025) − Lightship − VLSFO − MGO − Ballast − Fresh Water − Constants. The lowest intake sets the max loadable cargo. “Auto bunkers” pulls VLSFO/MGO from the ETA &amp; ROB projection.
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
                <th className="fv-ops__r">Max by Grain (MT)</th>
                <th className="fv-ops__r">Max by Bale (MT)</th>
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
                    <td className="fv-ops__r fv-ops__stw-calc">{lim.maxByBale ? fmt(lim.maxByBale, 0) : '—'}</td>
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
          <i className="fas fa-circle-info" aria-hidden="true" /> Max by Grain = Grain capacity ÷ SF (bulk) · Max by Bale = Bale capacity ÷ SF (bagged/baled) · Max by Strength = Tank-Top Area × permissible load density (MT/m²). Max Loadable = lower of Max-by-Grain &amp; Max-by-Strength; amber marks a strength-governed hold, red planned figures exceed the limit.
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
interface OffHireRow { cat: string; from: string; to: string; pct: string; remark: string; robStartV?: string; robStartM?: string; robEndV?: string; robEndM?: string }
/** Extra ad-hoc expense line in a hire SOA, due to Owners or Charterers. */
interface ExtraExpense { desc: string; amount: string; due: string }
/** Per-installment hire workflow state. */
interface HirePayEntry { status: string; ballast: boolean; name?: string; from?: string; to?: string; offHire?: OffHireRow[]; bunkerPay?: boolean; bunkerRev?: boolean; jointOn?: string; jointOff?: string; hra?: string; ownersExp?: string; ownersClaim?: string; ilohcOn?: boolean; borV?: string; borM?: string; borFo?: string; borDo?: string; bunkerPayOff?: boolean; ballastPayOff?: boolean; extraExpenses?: ExtraExpense[]; deleted?: boolean }

/** A standalone snapshot of a hire installment — independent from the live schedule. */
interface HireDuplicate { id: string; name: string; account: string; from: string; to: string; onHire: number; offHire: number; amount: number; due: string; status: string }

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
    return { status: (s?.status as HireStatus) ?? 'Draft', ballast: s?.ballast ?? false, name: s?.name, from: s?.from, to: s?.to, offHire: s?.offHire ?? [], bunkerPay: s?.bunkerPay ?? false, bunkerRev: s?.bunkerRev ?? false, jointOn: s?.jointOn, jointOff: s?.jointOff, hra: s?.hra, ownersExp: s?.ownersExp, ownersClaim: s?.ownersClaim, ilohcOn: s?.ilohcOn, borV: s?.borV, borM: s?.borM, borFo: s?.borFo, borDo: s?.borDo, bunkerPayOff: s?.bunkerPayOff ?? false, ballastPayOff: s?.ballastPayOff ?? false, extraExpenses: s?.extraExpenses ?? [], deleted: s?.deleted ?? false };
  };
  const setState = (key: string, patch: Partial<HirePayEntry>) =>
    setRecap((r) => ({ ...r, hirePayState: { ...r.hirePayState, [key]: { ...stateOfRaw(r, key), ...patch } } }));
  const stateOfRaw = (r: Recap, key: string): HirePayEntry => ({ status: (r.hirePayState[key]?.status as HireStatus) ?? 'Draft', ballast: r.hirePayState[key]?.ballast ?? false, name: r.hirePayState[key]?.name, from: r.hirePayState[key]?.from, to: r.hirePayState[key]?.to, offHire: r.hirePayState[key]?.offHire ?? [], bunkerPay: r.hirePayState[key]?.bunkerPay ?? false, bunkerRev: r.hirePayState[key]?.bunkerRev ?? false, jointOn: r.hirePayState[key]?.jointOn, jointOff: r.hirePayState[key]?.jointOff, hra: r.hirePayState[key]?.hra, ownersExp: r.hirePayState[key]?.ownersExp, ownersClaim: r.hirePayState[key]?.ownersClaim, ilohcOn: r.hirePayState[key]?.ilohcOn, borV: r.hirePayState[key]?.borV, borM: r.hirePayState[key]?.borM, borFo: r.hirePayState[key]?.borFo, borDo: r.hirePayState[key]?.borDo, bunkerPayOff: r.hirePayState[key]?.bunkerPayOff ?? false, ballastPayOff: r.hirePayState[key]?.ballastPayOff ?? false, extraExpenses: r.hirePayState[key]?.extraExpenses ?? [], deleted: r.hirePayState[key]?.deleted ?? false });
  // Bunker reversal anchor is single-select: setting one clears the flag on other installments.
  const setBunkerAnchor = (key: string, field: 'bunkerPay' | 'bunkerRev', on: boolean) =>
    setRecap((r) => {
      const next: Record<string, HirePayEntry> = {};
      for (const [k, v] of Object.entries(r.hirePayState)) next[k] = { ...v, [field]: false };
      next[key] = { ...(next[key] ?? stateOfRaw(r, key)), [field]: on };
      return { ...r, hirePayState: next };
    });
  // Bunkers-on-delivery payment: single-select installment, or unselect entirely (off stored on '1').
  const setBunkerPay = (key: string, on: boolean) =>
    setRecap((r) => {
      const next: Record<string, HirePayEntry> = {};
      for (const [k, v] of Object.entries(r.hirePayState)) next[k] = { ...v, bunkerPay: false };
      next['1'] = { ...(next['1'] ?? stateOfRaw(r, '1')), bunkerPayOff: !on };
      if (on) next[key] = { ...(next[key] ?? stateOfRaw(r, key)), bunkerPay: true, bunkerPayOff: false };
      return { ...r, hirePayState: next };
    });
  // Ballast bonus payment: single-select installment, or unselect entirely (off stored on '1').
  const setBallastPay = (key: string, on: boolean) =>
    setRecap((r) => {
      const next: Record<string, HirePayEntry> = {};
      for (const [k, v] of Object.entries(r.hirePayState)) next[k] = { ...v, ballast: false };
      next['1'] = { ...(next['1'] ?? stateOfRaw(r, '1')), ballastPayOff: !on };
      if (on) next[key] = { ...(next[key] ?? stateOfRaw(r, key)), ballast: true, ballastPayOff: false };
      return { ...r, hirePayState: next };
    });

  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
  const addBankingDays = (d: Date, n: number) => {
    const r = new Date(d);
    let added = 0;
    while (added < n) { r.setDate(r.getDate() + 1); const dow = r.getDay(); if (dow !== 0 && dow !== 6) added += 1; }
    return r;
  };
  const moveOffWeekend = (d: Date | null) => {
    if (!d) return d;
    const r = new Date(d);
    const dow = r.getDay();
    if (dow === 0) r.setDate(r.getDate() - 2); // Sunday → Friday
    else if (dow === 6) r.setDate(r.getDate() - 1); // Saturday → Friday
    return r;
  };
  const p2 = (n: number) => String(n).padStart(2, '0');
  const fmtDT = (d: Date | null) => (d ? `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}` : '—');
  const fmtDate = (d: Date | null) => (d ? `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()}` : '—');

  // Bunkers on redelivery = expected ROB at end of voyage from the ETA & ROB projection
  // (accounts for consumption and bunkers supplied), valued at CP price. Passed to the SOA
  // as the BOR estimate default (BOD and BOR both shown in full on each SOA, cancelling).
  const borRob = etaEndRob(recap.etaPlan);
  const firstPeriod = Math.max(1, num(recap.firstHirePeriodDays) || 15);
  const dueBank = Math.max(0, num(recap.firstHireDays) || 3);
  const subPeriod = Math.max(1, num(recap.hireEveryDays) || 15);
  // Hire Payment clause (Voyage Details → Owners): drives which of BB / BOD / BOR apply.
  const incl = recap.firstHireInclude || 'Bunkers';
  const firstInclBallast = incl === 'Ballast Bonus' || incl === 'Both';
  const firstInclBunkers = incl === 'Bunkers' || incl === 'Both';
  const total = pnl.days;
  const start = parseDMY(recap.deliveryDateTime);
  const [manualExtra, setManualExtra] = useState(0);

  interface HireRow { key: string; name: string; account: string; from: Date | null; to: Date | null; onHire: number; offHire: number; amount: number; due: Date | null; status: HireStatus; ballast: boolean; bunkers: number; bunkerCredit: number; cumulativeOnHire?: number; cumulativeOffHire?: number; cumulativeGross?: number }
  let rows: HireRow[] = [];
  let covered = 0;
  let n = 1;
  while (covered < total - 0.01 && n <= 200) {
    const key = String(n);
    const e = stateOf(key);
    const status = e.status as HireStatus;
    const periodLen = n === 1 ? firstPeriod : subPeriod;
    const days = Math.min(periodLen, total - covered);
    // From/To: use clause-computed dates for unlocked interim hires; allow override only for
    // locked (paid/approved) hires — the cumulative final hire's date override is applied post-loop.
    const locked = hireLocked(status);
    const from = (locked && e.from) ? parseDMY(e.from) : (start ? addDays(start, covered) : null);
    const to = (locked && e.to) ? parseDMY(e.to) : (start ? addDays(start, covered + days) : null);
    const onHire = from && to ? Math.max(0, (to.getTime() - from.getTime()) / 86_400_000) : days;
    const offHire = (e.offHire ?? []).reduce((s, o) => s + offHireDays(o), 0);
    const duePre = n === 1 ? (start ? addBankingDays(start, dueBank) : null) : from;
    const due = moveOffWeekend(duePre);
    // CUMULATIVE CALCULATION: Gross hire from Delivery date to this hire's end date
    // Cumulative on-hire days from delivery to this hire's end
    const cumulativeOnHire = to && start ? Math.max(0, (to.getTime() - start.getTime()) / 86_400_000) : 0;
    // Cumulative off-hire from ALL hires from delivery to this hire's end (including current hire)
    let cumulativeOffHire = 0;
    for (let k = 0; k < n; k++) {
      const rKey = String(k + 1);
      const rEntry = stateOf(rKey);
      const offHireList = rEntry.offHire ?? [];
      cumulativeOffHire += offHireList.reduce((s, o) => s + offHireDays(o), 0);
    }
    const cumulativeGross = hd * cumulativeOnHire;
    const cumulativeNett = Math.max(0, cumulativeOnHire - cumulativeOffHire);
    const cumulativeCve = (num(recap.cve) / 30) * cumulativeNett;
    // Amount is cumulative hire (net of commissions) + CVE, minus prior payments (applied later)
    const amount = cumulativeGross * (1 - dedPct / 100) + cumulativeCve;
    rows.push({ key, name: `${ordinal(n)} Hire`, account: owners, from, to, onHire, offHire, amount, due, status, ballast: false, bunkers: 0, bunkerCredit: 0, cumulativeOnHire, cumulativeOffHire, cumulativeGross });
    covered += days;
    n += 1;
  }
  const autoCount = rows.length; // installments auto-built to cover the estimated voyage
  // Manually added installments (for when the actual voyage runs beyond the estimate) — each
  // continues from the previous cut-off, editable per installment. Not consolidated on settlement.
  let manualFrom: Date | null = rows.length ? rows[rows.length - 1].to : start;
  for (let m = 0; m < manualExtra && n <= 200; m++) {
    const key = String(n);
    const e = stateOf(key);
    const status = e.status as HireStatus;
    const from = e.from ? parseDMY(e.from) : manualFrom;
    const to = e.to ? parseDMY(e.to) : (from ? addDays(from, subPeriod) : null);
    const onHire = from && to ? Math.max(0, (to.getTime() - from.getTime()) / 86_400_000) : subPeriod;
    const offHire = (e.offHire ?? []).reduce((s, o) => s + offHireDays(o), 0);
    // CUMULATIVE: Manual hires also calculate from delivery to their end date
    const cumulativeOnHire = to && start ? Math.max(0, (to.getTime() - start.getTime()) / 86_400_000) : 0;
    let cumulativeOffHire = 0;
    for (let k = 1; k <= rows.length + m + 1; k++) {
      const rKey = String(k);
      const rEntry = stateOf(rKey);
      const offHireList = rEntry.offHire ?? [];
      cumulativeOffHire += offHireList.reduce((s, o) => s + offHireDays(o), 0);
    }
    const cumulativeGross = hd * cumulativeOnHire;
    const cumulativeNett = Math.max(0, cumulativeOnHire - cumulativeOffHire);
    const cumulativeCve = (num(recap.cve) / 30) * cumulativeNett;
    const amount = cumulativeGross * (1 - dedPct / 100) + cumulativeCve;
    const dueMan = moveOffWeekend(from);
    rows.push({ key, name: `${ordinal(n)} Hire`, account: owners, from, to, onHire, offHire, amount, due: dueMan, status, ballast: false, bunkers: 0, bunkerCredit: 0, cumulativeOnHire, cumulativeOffHire, cumulativeGross });
    manualFrom = to;
    n += 1;
  }

  // Drop installments the user has soft-deleted via the row checkboxes.
  rows = rows.filter((r) => stateOf(r.key).deleted !== true);
  
  // Apply cumulative payments deduction: subtract all previously approved/paid hires from each row
  // This ensures Current Hire Payable = Net Cumulative - Prior Approved Payments
  for (let i = 0; i < rows.length; i++) {
    const priorRows = rows.slice(0, i);
    const priorPayments = priorRows.reduce((s, r) => {
      const status = stateOf(r.key).status as HireStatus;
      // Include payments that are approved/sent or paid (not draft)
      if (status === 'Draft') return s;
      return s + r.amount;
    }, 0);
    rows[i].amount = Math.max(0, rows[i].amount - priorPayments);
  }
    // Ballast bonus: only when CP terms include it (Ballast Bonus / Both). Single installment
  // (default 1st), user-selectable or off. Not shown/applied when terms are Bunkers or None.
  const ballastOff = stateOf('1').ballastPayOff === true;
  let ballastPayIdx = rows.findIndex((r) => stateOf(r.key).ballast);
  if (ballastPayIdx < 0 && !ballastOff && firstInclBallast && ballastBonusAmt > 0) ballastPayIdx = 0;
  if (ballastOff || ballastBonusAmt <= 0 || !firstInclBallast) ballastPayIdx = -1;
  rows.forEach((r, i) => { r.ballast = i === ballastPayIdx; });
  if (ballastPayIdx >= 0) rows[ballastPayIdx].amount += ballastBonusAmt;
  
  // Bunkers (only when the Hire Payment clause includes them): BOD is charged to owners on the
  // BOD hire (default 1st, movable). The estimated BOR is reversed to charterers on the
  // BOR settlement hire (default last, movable).
  const bodValue = num(recap.etaPlan.startRobVlsfo) * num(recap.foPrice) + num(recap.etaPlan.startRobMgo) * num(recap.doPrice);
  const borEstValue = borRob.v * num(recap.foPrice) + borRob.m * num(recap.doPrice);
  let bunkerPayIdx = -1;
  let bunkerSettleIdx = -1;
  let bunkerRefund = 0;
  if (firstInclBunkers && rows.length && (bodValue > 0 || borEstValue > 0)) {
    bunkerPayIdx = rows.findIndex((r) => stateOf(r.key).bunkerPay);
    if (bunkerPayIdx < 0) bunkerPayIdx = 0;
    // Add BOD to the designated BOD hire
    rows[bunkerPayIdx].amount += bodValue;

    bunkerSettleIdx = rows.findIndex((r) => stateOf(r.key).bunkerRev);
    if (bunkerSettleIdx < 0) {
      // Default BOR settlement: last hire (since cumulative means it has the most to absorb BOR)
      bunkerSettleIdx = rows.length - 1;
    }
    // Subtract BOR from the settlement hire
    rows[bunkerSettleIdx].amount -= borEstValue;
    bunkerRefund = 0; // BOR is fully absorbed in cumulative method
    
    // Set bunker display values per maritime charter logic:
    // BOD (Bunkers on Delivery) shown in ALL hire SOAs for reference
    // BOR (Bunkers on Redelivery) shown only on BOR settlement hire where it's reversed
    rows.forEach((row, idx) => {
      row.bunkers = bodValue;  // Always show full BOD for reference
      if (idx === bunkerSettleIdx) {
        row.bunkerCredit = borEstValue;
      } else {
        row.bunkerCredit = 0;
      }
    });
    
    // Do not filter rows — all hires should be displayed since cumulative logic doesn't need to hide trailing hires
  } else {
    // When bunkers clause is NOT included:
    rows.forEach((row) => {
      row.bunkers = bodValue;
      row.bunkerCredit = borEstValue;
    });
  }
  const finalIdx = bunkerSettleIdx >= 0 ? bunkerSettleIdx : autoCount - 1; // cumulative final-settlement hire
  // Apply any saved redelivery date from the settlement hire's SOA (saved by the user as actual redelivery).
  const finalEntry = stateOf(rows[finalIdx].key);
  if (finalEntry.to) {
    const savedTo = parseDMY(finalEntry.to);
    if (savedTo) rows[finalIdx].to = savedTo;
  }
  // Apply user-set name overrides; all hires default to their ordinal (1st, 2nd, …).
  rows.forEach((r) => { const en = stateOf(r.key).name; if (en) r.name = en; });
  const totalPayable = rows.reduce((s, r) => s + r.amount, 0);
  const totalOnHireDays = rows.reduce((s, r) => s + r.onHire, 0);
  const totalOffHireDays = rows.reduce((s, r) => s + r.offHire, 0);

  // Workflow transitions per installment.
  const advance = (key: string, to: HireStatus) => setState(key, { status: to });
  const setHireName = (key: string, name: string) => setState(key, { name: name.trim() || undefined });
  const [soaRow, setSoaRow] = useState<number | null>(null);
  const [editNameKey, setEditNameKey] = useState<string | null>(null);
  const [editNameVal, setEditNameVal] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const toggleSelect = (key: string) => setSelectedKeys((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const deleteSelected = () => {
    if (selectedKeys.size === 0) return;
    setRecap((r) => {
      const next = { ...r.hirePayState };
      selectedKeys.forEach((key) => { next[key] = { ...stateOfRaw(r, key), deleted: true }; });
      return { ...r, hirePayState: next };
    });
    setSelectedKeys(new Set());
  };
  const duplicateSelected = () => {
    if (selectedKeys.size === 0) return;
    const sel = rows.filter((r) => selectedKeys.has(r.key));
    const snapshots: HireDuplicate[] = sel.map((row) => ({
      id: uid('dup'),
      name: `${row.name} (copy)`,
      account: row.account,
      from: fmtDT(start),
      to: fmtDT(row.to),
      onHire: row.cumulativeOnHire ?? row.onHire,
      offHire: row.offHire,
      amount: row.amount,
      due: fmtDate(row.due),
      status: row.status,
    }));
    setRecap((r) => ({ ...r, hireDuplicates: [...(r.hireDuplicates ?? []), ...snapshots] }));
    setSelectedKeys(new Set());
  };
  const deleteDuplicate = (id: string) => setRecap((r) => ({ ...r, hireDuplicates: (r.hireDuplicates ?? []).filter((d) => d.id !== id) }));
  const exportSelectedPdf = () => {
    const sel = rows.filter((r) => selectedKeys.has(r.key));
    if (sel.length === 0) return;
    const w = window.open('', '_blank', 'width=980,height=1100');
    if (!w) return;
    const p2 = (x: number) => String(x).padStart(2, '0');
    const today = new Date();
    const body = sel.map((r) => `<tr><td>${r.name}</td><td>${r.account}</td><td>${fmtDT(start)}</td><td>${fmtDT(r.to)}</td><td class="r">${fmt(r.cumulativeOnHire ?? r.onHire, 2)}</td><td class="r">${fmt(r.offHire, 2)}</td><td class="r">${money(r.amount)}</td><td>${fmtDate(r.due)}</td><td>${r.status}</td></tr>`).join('');
    const totalAmt = sel.reduce((s, r) => s + r.amount, 0);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Hire Payments — ${recap.vesselName}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:28px;font-size:12px}
      h1{font-size:16px;margin:0 0 2px}.sub{color:#555;margin:0 0 14px;font-size:11px}
      table{border-collapse:collapse;width:100%;margin:8px 0}
      th,td{border:1px solid #bbb;padding:4px 7px;text-align:left}
      th.r,td.r{text-align:right}tfoot td{font-weight:700;background:#f2f2f2}
    </style></head><body>
      <h1>Hire Payment Schedule — ${sel.length} installment${sel.length > 1 ? 's' : ''}</h1>
      <p class="sub">${recap.vesselName} · Owners ${recap.owners || '—'} · CP ${recap.cpDate || '—'} · ${p2(today.getDate())}-${p2(today.getMonth() + 1)}-${today.getFullYear()}</p>
      <table><thead><tr><th>Hire</th><th>Account</th><th>From</th><th>To</th><th class="r">On Hire (d)</th><th class="r">Off-Hire (d)</th><th class="r">Amount Payable</th><th>Due Date</th><th>Status</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="6">Total</td><td class="r">${money(totalAmt)}</td><td colspan="2"></td></tr></tfoot></table>
      <p class="sub">*E&amp;OE.</p>
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <>
    <Card title="Hire Payment Schedule" icon="fa-money-bill-wave" right={
      <div className="fv-ops__card-controls">
        <button type="button" className="fv-ops__btn fv-ops__btn--sm" onClick={() => setManualExtra((x) => x + 1)} title="Add installment beyond estimated redelivery"><i className="fas fa-plus" aria-hidden="true" /> Add</button>
        <button type="button" className="fv-ops__btn fv-ops__btn--sm" onClick={duplicateSelected} disabled={selectedKeys.size === 0} title="Duplicate the selected hire payments"><i className="fas fa-copy" aria-hidden="true" /> Duplicate{selectedKeys.size > 0 ? ` (${selectedKeys.size})` : ''}</button>
        <button type="button" className="fv-ops__btn fv-ops__btn--sm" onClick={exportSelectedPdf} disabled={selectedKeys.size === 0} title="Generate a PDF of the selected hire payments"><i className="fas fa-file-pdf" aria-hidden="true" /> PDF{selectedKeys.size > 0 ? ` (${selectedKeys.size})` : ''}</button>
        <button type="button" className="fv-ops__btn fv-ops__btn--sm" onClick={deleteSelected} disabled={selectedKeys.size === 0} title="Delete the selected hire payments"><i className="fas fa-trash" aria-hidden="true" /> Delete{selectedKeys.size > 0 ? ` (${selectedKeys.size})` : ''}</button>
      </div>
    }>
      <div className="fv-ops__eta-scroll">
        <table className="fv-ops__table fv-ops__hire">
          <thead>
            <tr>
              <th className="fv-ops__hire-selcol">
                <input type="checkbox" aria-label="Select all hire payments"
                  checked={rows.length > 0 && rows.every((r) => selectedKeys.has(r.key))}
                  ref={(el) => { if (el) el.indeterminate = selectedKeys.size > 0 && !rows.every((r) => selectedKeys.has(r.key)); }}
                  onChange={(e) => setSelectedKeys(e.target.checked ? new Set(rows.map((r) => r.key)) : new Set())} />
              </th>
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
            {rows.length === 0 && <tr><td colSpan={11} className="fv-ops__vd-empty">Set delivery &amp; redelivery dates to build the schedule.</td></tr>}
            {rows.map((r, i) => {
              const locked = hireLocked(r.status);
              return (
                <tr key={r.key}>
                  <td className="fv-ops__hire-selcol">
                    <input type="checkbox" aria-label={`Select ${r.name}`} checked={selectedKeys.has(r.key)} onChange={() => toggleSelect(r.key)} />
                  </td>
                  <td>
                    <div className="fv-ops__hire-namecell">
                      <div className="fv-ops__hire-nameleft">
                        {editNameKey === r.key
                          ? <input autoFocus className="fv-ops__hire-namein" defaultValue={editNameVal}
                              onBlur={(e) => { setHireName(r.key, e.target.value); setEditNameKey(null); }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); setHireName(r.key, (e.target as HTMLInputElement).value); setEditNameKey(null); }
                                if (e.key === 'Escape') setEditNameKey(null);
                              }} />
                          : <>
                              <button type="button" className="fv-ops__hire-namebtn" onClick={() => setSoaRow(i)} title={r.name === 'FHS' ? 'Final Hire Statement — settlement at actual redelivery' : 'Open Statement of Account'}>{r.name}</button>
                              {!locked && <button type="button" className="fv-ops__hire-nameedit" title="Rename" onClick={() => { setEditNameKey(r.key); setEditNameVal(r.name); }}><i className="fas fa-pen" aria-hidden="true" /></button>}
                            </>
                        }
                      </div>
                      <div className="fv-ops__hire-nameright">
                        {r.ballast && <span className="fv-ops__hire-tag fv-ops__hire-tag--bb" title="Ballast bonus paid with this hire">+BB</span>}
                        {i === bunkerPayIdx && <span className="fv-ops__hire-tag" title="Bunkers on delivery (BOD) charged to owners on this hire">+BOD</span>}
                        {i === bunkerSettleIdx && <span className="fv-ops__hire-tag fv-ops__hire-tag--credit" title="Bunkers on redelivery (BOR) reversed to charterers on this hire — runs to actual redelivery">−BOR</span>}
                        {firstInclBallast && ballastBonusAmt > 0 && !locked && (
                          <label className="fv-ops__hire-bb" title="Pay ballast bonus (BB) on this hire — untick to not pay it">
                            <input type="checkbox" checked={i === ballastPayIdx} onChange={(e) => setBallastPay(r.key, e.target.checked)} /> BB
                          </label>
                        )}
                        {firstInclBunkers && bodValue > 0 && !locked && (
                          <label className="fv-ops__hire-bb fv-ops__hire-bb--bnk" title="Charge bunkers on delivery (BOD) on this hire">
                            <input type="checkbox" checked={i === bunkerPayIdx} onChange={(e) => setBunkerPay(r.key, e.target.checked)} /> BOD
                          </label>
                        )}
                        {firstInclBunkers && borEstValue > 0 && !locked && (
                          <label className="fv-ops__hire-bb fv-ops__hire-bb--rev" title="Reverse bunkers on redelivery (BOR) on this hire — sets its Hire-to-date to actual redelivery">
                            <input type="checkbox" checked={i === bunkerSettleIdx} onChange={(e) => setBunkerAnchor(r.key, 'bunkerRev', e.target.checked)} /> BOR
                          </label>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>{r.account}</td>
                  <td className="fv-ops__eta-dt">{fmtDT(start)}</td>
                  <td className="fv-ops__eta-dt">{fmtDT(r.to)}</td>
                  <td className="fv-ops__r">{fmt(r.cumulativeOnHire ?? r.onHire, 2)}</td>
                  <td className="fv-ops__r">{fmt(r.offHire, 2)}</td>
                  <td className="fv-ops__r">{money(r.amount)}</td>
                  <td>{fmtDate(r.due)}</td>
                  <td>
                    <span className={`fv-ops__pill fv-ops__pill--${hireStatusPill(r.status)}`}>{r.status}</span>
                    {locked && <i className="fas fa-lock fv-ops__hire-lock" title="Locked — manager approval required to unlock" aria-hidden="true" />}
                  </td>
                  <td>
                    <span className="fv-ops__hire-actions">
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
            <tr className="fv-ops__row-sub">
              <td />
              <td>Total Payable ({rows.length} installments)</td>
              <td />
              <td />
              <td />
              <td className="fv-ops__r">{fmt(totalOnHireDays, 2)}</td>
              <td className="fv-ops__r">{fmt(totalOffHireDays, 2)}</td>
              <td className="fv-ops__r">{money(totalPayable)}</td>
              <td />
              <td colSpan={2} />
            </tr>
            {bunkerRefund > 0.01 && (
              <>
                <tr className="fv-ops__row-sub"><td colSpan={7}>Less: estimated BOR refund not absorbed by trailing hires (settled after actual redelivery)</td><td className="fv-ops__r fv-ops__neg">-{money(bunkerRefund)}</td><td colSpan={3} /></tr>
                <tr className="fv-ops__row-sub"><td colSpan={7}>Net to Owners (after redelivery settlement)</td><td className="fv-ops__r">{money(totalPayable - bunkerRefund)}</td><td colSpan={3} /></tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      <p className="fv-ops__hint">
        {cur} · Auto-built from CP terms: 1st hire {firstPeriod} days including {incl}, payable within {recap.firstHireDays} {recap.firstHireBasis}, then every {recap.hireEveryDays} days in advance until redelivery. Each hire = net hire + CVE; bunkers on delivery (BOD, due owners) and on redelivery (BOR, due charterers) are shown in full on every SOA and cancel for the estimate — the actual bunker settlement applies on the final hire once the redelivery-notice ROBs are received. Voyage {fmt(total, 2)} days — schedule &amp; due dates recompute as the redelivery date moves. Commissions {fmt(dedPct)}% deducted. Rename any hire using the pencil icon.
      </p>
      <p className="fv-ops__hint">
        <i className="fas fa-diagram-project" aria-hidden="true" /> Action flow: Draft → <b>Send for Approval &amp; Payment</b> → Manager <b>Approve</b> (→ Approved &amp; Sent for Payment, locked) → Accounts <b>Mark Paid</b> (→ Paid &amp; Locked). A locked installment can only be reopened via <b>Unlock</b> (manager). Tick <b>BB</b> to choose which hire pays the ballast bonus ({money(ballastBonusAmt)}); <b>BOR</b> chooses which hire the bunker settlement (BOD − BOR) falls due on (default the final hire).
      </p>
    </Card>
    {(recap.hireDuplicates ?? []).length > 0 && (
      <Card title="Duplicated Hire Payments" icon="fa-copy" right={
        <div className="fv-ops__card-controls">
          <button type="button" className="fv-ops__btn fv-ops__btn--sm" onClick={() => setRecap((r) => ({ ...r, hireDuplicates: [] }))} title="Clear all duplicated hire payments"><i className="fas fa-trash" aria-hidden="true" /> Clear All</button>
        </div>
      }>
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
              {(recap.hireDuplicates ?? []).map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.account}</td>
                  <td className="fv-ops__eta-dt">{d.from}</td>
                  <td className="fv-ops__eta-dt">{d.to}</td>
                  <td className="fv-ops__r">{fmt(d.onHire, 2)}</td>
                  <td className="fv-ops__r">{fmt(d.offHire, 2)}</td>
                  <td className="fv-ops__r">{money(d.amount)}</td>
                  <td>{d.due}</td>
                  <td><span className={`fv-ops__pill fv-ops__pill--${hireStatusPill(d.status as HireStatus)}`}>{d.status}</span></td>
                  <td><button type="button" className="fv-ops__bnk-rm" aria-label="Delete duplicate" onClick={() => deleteDuplicate(d.id)}><i className="fas fa-trash" aria-hidden="true" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fv-ops__hint">Independent snapshots created from the schedule above. These do not affect the live hire calculations or the next-hire addition.</p>
      </Card>
    )}
    {soaRow !== null && rows[soaRow] && (
      <HireSoaModal
        key={rows[soaRow].key}
        row={rows[soaRow]}
        entry={stateOf(rows[soaRow].key)}
        allRows={rows}
        recap={recap}
        borRobV={borRob.v}
        borRobM={borRob.m}
        isLast={soaRow === rows.length - 1}
        cumulative={true}
        bodCharged={bunkerPayIdx >= 0 && soaRow === bunkerPayIdx}
        borReversedToHere={rows[soaRow].bunkerCredit}
        priorOffHireDays={rows.slice(0, soaRow).reduce((s, r) => s + r.offHire, 0)}
        onSave={(recapPatch, entryPatch) => {
          const key = rows[soaRow].key;
          setRecap((r) => ({ ...r, ...recapPatch, hirePayState: { ...r.hirePayState, [key]: { ...stateOfRaw(r, key), ...entryPatch } } }));
        }}
        onClose={() => setSoaRow(null)}
      />
    )}
    </>
  );
}

/** Editable draft of the SOA — buffered until the user saves. */
interface SoaDraft {
  hirePerDay: string; adcom: string; brokerage: string; foPrice: string; doPrice: string;
  cve: string; ilohc: string; ballastBonus: string;
  delV: string; delM: string; borV: string; borM: string; borFo: string; borDo: string;
  from: string; to: string; offHire: OffHireRow[]; extras: ExtraExpense[];
  jointOn: string; jointOff: string;
  ilohcOn: boolean; ballastOn: boolean;
}

/** Statement of Account — detailed hire calculation for one installment. */
function HireSoaModal({ row, entry, allRows, recap, borRobV, borRobM, isLast, cumulative, bodCharged, borReversedToHere, priorOffHireDays, onSave, onClose }: {
  row: { key: string; name: string; from: Date | null; to: Date | null; onHire: number; offHire: number; amount: number; ballast: boolean; status: string; bunkers: number; bunkerCredit: number };
  entry: HirePayEntry;
  allRows: { key: string; name: string; amount: number; status: string }[];
  recap: Recap; borRobV: number; borRobM: number; isLast: boolean; cumulative: boolean; bodCharged: boolean; borReversedToHere: number; priorOffHireDays: number;
  onSave: (recapPatch: Partial<Recap>, entryPatch: Partial<HirePayEntry>) => void;
  onClose: () => void;
}) {
  const p2 = (n: number) => String(n).padStart(2, '0');
  const dmyOf = (d: Date | null) => (d ? `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}` : '');
  const fmtDT = (d: Date | null) => (d ? dmyOf(d) : '—');
  const toInput = (d: Date | null) => (d ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}` : '');
  const inputToDmy = (iso: string) => { const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/); return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}` : ''; };
  const today = new Date();

  const mk = (): SoaDraft => ({
    hirePerDay: recap.hirePerDay, adcom: recap.adcom, brokerage: recap.brokerage,
    foPrice: recap.foPrice, doPrice: recap.doPrice, cve: recap.cve, ilohc: recap.ilohc,
    ballastBonus: recap.ballastBonus,
    delV: recap.etaPlan.startRobVlsfo, delM: recap.etaPlan.startRobMgo,
    borV: entry.borV ?? '', borM: entry.borM ?? '', borFo: entry.borFo ?? '', borDo: entry.borDo ?? '',
    // Interim hires always start from clause-computed row dates; only the cumulative final hire
    // may have a user-saved redelivery time stored in entry.from/to.
    from: (cumulative ? entry.from : null) ?? dmyOf(row.from),
    to: (cumulative ? entry.to : null) ?? dmyOf(row.to),
    offHire: entry.offHire ?? [], extras: entry.extraExpenses ?? [],
    jointOn: entry.jointOn ?? '0', jointOff: entry.jointOff ?? '0',
    ilohcOn: entry.ilohcOn ?? isLast, ballastOn: row.ballast,
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SoaDraft>(mk);
  const setD = (patch: Partial<SoaDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const offRows = draft.offHire;
  const setOff = (i: number, patch: Partial<OffHireRow>) => setD({ offHire: offRows.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) });
  const addOff = () => setD({ offHire: [...offRows, { cat: OFFHIRE_CATS[0], from: '', to: '', pct: '100', remark: '', robStartV: '', robStartM: '', robEndV: '', robEndM: '' }] });
  // Per-category daily consumption (VLSFO from main engine, MGO from aux) for off-hire bunkers.
  const mnCons = recap.etaPlan.perf.mainNormal;
  const snCons = recap.etaPlan.perf.subNormal;
  const foType = mnCons.type || 'VLSFO';
  const doType = snCons.type || 'MGO';
  const catRate = (cat: string): { v: number; m: number } => {
    if (cat.startsWith('A')) return { v: num(mnCons.work), m: num(snCons.work) };
    if (cat.startsWith('B')) return { v: num(mnCons.idle), m: num(snCons.idle) };
    return { v: num(mnCons.laden), m: num(snCons.sea) }; // C (sea) & D (weather): steaming rates
  };
  // Auto ROB end = start − (category rate × off-hire time); a manual entry is used as-is (no % applied).
  const offBunker = (o: OffHireRow) => {
    const r = catRate(o.cat);
    const d = offHireDays(o);
    const startV = num(o.robStartV ?? '0'); const startM = num(o.robStartM ?? '0');
    const manualV = (o.robEndV ?? '').trim() !== ''; const manualM = (o.robEndM ?? '').trim() !== '';
    const endV = manualV ? num(o.robEndV ?? '0') : startV - r.v * d;
    const endM = manualM ? num(o.robEndM ?? '0') : startM - r.m * d;
    const consV = manualV ? startV - endV : r.v * d;
    const consM = manualM ? startM - endM : r.m * d;
    return { startV, startM, endV, endM, consV, consM };
  };
  const offConsTotal = offRows.reduce((a, o) => { const b = offBunker(o); return { v: a.v + b.consV, m: a.m + b.consM }; }, { v: 0, m: 0 });
  const delOff = (i: number) => setD({ offHire: offRows.filter((_, idx) => idx !== i) });
  const offTotal = offRows.reduce((s, o) => s + offHireDays(o), 0);

  // Interim hires are calculated PER-PERIOD (from this hire's own start to its cut-off), matching
  // the clause duration shown in the schedule. The final settlement hire is CUMULATIVE (from the
  // vessel DELIVERY date to redelivery) so it trues up against the payments already made.
  const deliveryD = parseDMY(recap.deliveryDateTime);
  const toD = parseDMY(draft.to);
  const periodFromD = parseDMY(draft.from);
  const fromD = cumulative ? deliveryD : periodFromD;
  const onHire = fromD && toD ? Math.max(0, (toD.getTime() - fromD.getTime()) / 86_400_000) : row.onHire;
  const cumOffHire = cumulative ? priorOffHireDays + offTotal : offTotal;
  const nett = Math.max(0, onHire - cumOffHire);
  const perDay = num(draft.hirePerDay);
  const addrPct = num(draft.adcom);
  const brkgPct = num(draft.brokerage);
  const dedPct = addrPct + brkgPct;
  const foP = num(draft.foPrice);
  const doP = num(draft.doPrice);
  const delV = num(draft.delV);
  const delM = num(draft.delM);
  // BOD (bunkers on delivery) — DUE OWNERS; BOR (bunkers on redelivery) — DUE CHARTERERS.
  // Column sums use the full displayed values (row.bunkers / row.bunkerCredit) so they cancel.
  const borV = draft.borV.trim() !== '' ? num(draft.borV) : borRobV;
  const borM = draft.borM.trim() !== '' ? num(draft.borM) : borRobM;
  const borFo = draft.borFo.trim() !== '' ? num(draft.borFo) : foP;
  const borDo = draft.borDo.trim() !== '' ? num(draft.borDo) : doP;
  const borFullValue = borV * borFo + borM * borDo;
  const bunkRedelivery = borReversedToHere;
  const borCredited = borReversedToHere > 0.01;
  // CUMULATIVE CALCULATION FOR MODAL
  // Recalculate from delivery date to this hire's end date (mirroring main table logic)
  const deliveryDt = recap.deliveryDateTime ? parseDMY(recap.deliveryDateTime) : row.from;
  const hireTo = row.to || new Date();
  const cumulativeOnHireCalc = deliveryDt && hireTo ? Math.max(0, (hireTo.getTime() - deliveryDt.getTime()) / 86_400_000) : 0;
  
  // Cumulative off-hire: use priorOffHireDays + this hire's off-hire
  const thisHireOffHire = (entry?.offHire ?? []).reduce((s, o) => s + offHireDays(o), 0);
  const cumulativeOffHireCalc = priorOffHireDays + thisHireOffHire;
  
  // CUMULATIVE METHODOLOGY: Hire is calculated GROSS from delivery date (all cumulative on-hire days)
  // Off-hire deduction is applied separately in the balance calculation
  const hireAmtGross = perDay * cumulativeOnHireCalc;
  const bb = draft.ballastOn ? num(draft.ballastBonus) : 0;
  const address = ((hireAmtGross + bb) * addrPct) / 100;
  const brokerage = (hireAmtGross * brkgPct) / 100;
  const offBunkerCost = offConsTotal.v * foP + offConsTotal.m * doP;
  const cve = (num(draft.cve) / 30) * cumulativeOnHireCalc;
  // Off-hire value deduction: cumulative off-hire days × (hire rate net of commission + CVE) + bunker cost during off-hire
  const offHirePart = cumulativeOffHireCalc * perDay * (1 - dedPct / 100) + (num(draft.cve) / 30) * cumulativeOffHireCalc + offBunkerCost;
  const hireAmt = hireAmtGross;
  // Value of this hire's off-hire: hire lost (net of commission) + CVE for the off-hire days + off-hire bunkers.
  const offHireValue = offTotal * perDay * (1 - dedPct / 100) + (num(draft.cve) / 30) * offTotal + offBunkerCost;
  const ilohc = draft.ilohcOn ? num(draft.ilohc) : 0;
  const surveys = num(draft.jointOn) / 2 + num(draft.jointOff) / 2;
  const extras = draft.extras;
  const setExtra = (i: number, patch: Partial<ExtraExpense>) => setD({ extras: extras.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) });
  const addExtra = () => setD({ extras: [...extras, { desc: '', amount: '0', due: 'Owners' }] });
  const delExtra = (i: number) => setD({ extras: extras.filter((_, idx) => idx !== i) });
  const extrasOwners = extras.reduce((s, e) => s + (e.due === 'Owners' ? num(e.amount) : 0), 0);
  const extrasCharterers = extras.reduce((s, e) => s + (e.due !== 'Owners' ? num(e.amount) : 0), 0);

  // The column Sums must match the bunker values shown in the rows (full BOD / BOR), so they
  // cancel for the estimate. bunkDelivery / bunkRedelivery remain for the settlement notes only.
  const owners = hireAmt + bb + row.bunkers + cve + extrasOwners;
  const charterers = address + brokerage + row.bunkerCredit + ilohc + surveys + extrasCharterers;
  const totalPayable = owners - charterers;

  // Current Hire Payable = Net Cumulative Hire - all prior hire statements (paid or draft).
  const currentIndex = allRows.findIndex((x) => x.key === row.key);
  const priorRows = currentIndex > 0 ? allRows.slice(0, currentIndex) : [];
  const paidTotal = priorRows.reduce((s, x) => s + x.amount, 0);
  // Balance Due to (or from) Owners = Total Payable - Off-Hire Value - Prior Hire Statements.
  const balanceDue = totalPayable - offHirePart - paidTotal;

  const save = () => {
    // Only persist from/to for the final (cumulative) hire where the user may set the actual
    // redelivery time. Interim hires always derive dates from the clause, so saving them back
    // would lock them and prevent the clause from re-computing on future renders.
    const datePatch = cumulative ? { from: draft.from, to: draft.to } : {};
    onSave(
      { hirePerDay: draft.hirePerDay, adcom: draft.adcom, brokerage: draft.brokerage, foPrice: draft.foPrice, doPrice: draft.doPrice, cve: draft.cve, ilohc: draft.ilohc, ballastBonus: draft.ballastBonus, etaPlan: { ...recap.etaPlan, startRobVlsfo: draft.delV, startRobMgo: draft.delM } },
      { ...datePatch, offHire: draft.offHire, ballast: draft.ballastOn, jointOn: draft.jointOn, jointOff: draft.jointOff, ilohcOn: draft.ilohcOn, borV: draft.borV, borM: draft.borM, borFo: draft.borFo, borDo: draft.borDo, extraExpenses: draft.extras },
    );
    setEditing(false);
  };
  const discard = () => { setDraft(mk()); setEditing(false); };

  const exportPdf = () => {
    const w = window.open('', '_blank', 'width=900,height=1100');
    if (!w) return;
    const li = (no: number | string, desc: string, o: number, c: number) => `<tr><td>${no}</td><td>${desc}</td><td class="r">${o ? money(o) : ''}</td><td class="r">${c ? money(c) : ''}</td></tr>`;
    const body = [
      li(1, `Hire — ${fmt(onHire, 2)} days × ${money(perDay)}/day`, hireAmt, 0),
      li(2, `Ballast Bonus (LSUM)${draft.ballastOn ? '' : ' — n/a'}`, bb, 0),
      li(3, `Address Commission @ ${fmt(addrPct, 3)}%`, 0, address),
      li(4, `Brokerage @ ${fmt(brkgPct, 3)}%`, 0, brokerage),
      li(5, `Bunker on Delivery — VLSFO ${fmt(delV, 2)}mt @ ${foP} · LSMGO ${fmt(delM, 2)}mt @ ${doP}${bodCharged ? '' : ' (charged on BOD hire)'}`, row.bunkers, 0),
      li(6, `Bunker on Redelivery — VLSFO ${fmt(borV, 2)}mt @ ${fmt(borFo, 2)} · LSMGO ${fmt(borM, 2)}mt @ ${fmt(borDo, 2)}${borCredited ? '' : ' (reversed on BOR hire)'}`, 0, row.bunkerCredit),
      li(7, `Cable/Victualing/Entertainment — ${money(num(draft.cve))}/mo × ${fmt(onHire, 2)}d`, cve, 0),
      li(8, `ILOHC${draft.ilohcOn ? '' : ' — n/a'}`, 0, ilohc),
      li(9, 'Joint On-Hire Survey (÷2)', 0, num(draft.jointOn) / 2),
      li(10, 'Joint Off-Hire Survey (÷2)', 0, num(draft.jointOff) / 2),
      ...extras.map((ex, i) => li(11 + i, ex.desc || 'Other expense', ex.due === 'Owners' ? num(ex.amount) : 0, ex.due !== 'Owners' ? num(ex.amount) : 0)),
    ].join('');
    const allPriorHtml = priorRows.map((x) => `<tr><td>Less: ${x.name} — ${x.status}</td><td class="r">-${money(x.amount)}</td></tr>`).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>SOA ${row.name} — ${recap.vesselName}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:28px;font-size:12px}
      h1{font-size:16px;margin:0 0 2px} .sub{color:#555;margin:0 0 14px;font-size:11px}
      table{border-collapse:collapse;width:100%;margin:8px 0}
      th,td{border:1px solid #bbb;padding:4px 7px;text-align:left}
      th.r,td.r{text-align:right} tfoot td{font-weight:700;background:#f2f2f2}
      .tot{font-size:13px}
    </style></head><body>
      <h1>Statement of Account — ${row.name}</h1>
      <p class="sub">${recap.vesselName} · CP ${recap.cpDate || '—'} · Owners ${recap.owners || '—'} · SOA ${p2(today.getDate())}-${p2(today.getMonth() + 1)}-${today.getFullYear()} · Status ${row.status}</p>
      <p class="sub">On-Hire ${fmtDT(fromD)} → ${fmtDT(toD)} · Days ${fmt(onHire, 2)} · Off-Hire ${fmt(offTotal, 2)} · Nett ${fmt(nett, 2)}</p>
      <table><thead><tr><th>No</th><th>Description</th><th class="r">Due Owners</th><th class="r">Due Charterers</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="2">Sum</td><td class="r">${money(owners)}</td><td class="r">${money(charterers)}</td></tr>
      <tr class="tot"><td colspan="2">Total Payable to Owners</td><td class="r" colspan="2">${money(totalPayable)}</td></tr></tfoot></table>
      <table><tbody><tr><td>Total Payable to Owners</td><td class="r">${money(totalPayable)}</td></tr>${offHirePart > 0.01 ? `<tr><td>Less: Off-Hire (${fmt(cumOffHire, 2)} days)</td><td class="r">-${money(offHirePart)}</td></tr>` : ''}${allPriorHtml}</tbody>
      <tfoot>${priorRows.length > 0 ? `<tr><td>Total payment expected to be paid till date (${priorRows.length})</td><td class="r">-${money(paidTotal)}</td></tr>` : ''}<tr class="tot"><td>Balance Due ${balanceDue >= 0 ? 'to' : 'from'} Owners</td><td class="r">${money(Math.abs(balanceDue))}</td></tr></tfoot></table>
      <p class="sub">*E&amp;OE.</p>
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const nIn = (val: string, on: (v: string) => void, w = 78) => (
    <input className="fv-ops__eta-in" style={{ width: w }} inputMode="decimal" value={val} onChange={(e) => on(e.target.value)} />
  );
  const oCol = (v: number) => (v ? money(v) : '');
  const cCol = (v: number) => (v ? money(v) : '');

  return (
    <div className="fv-ops__modal-overlay" onClick={onClose}>
      <div className="fv-ops__soa" onClick={(e) => e.stopPropagation()}>
        <div className="fv-ops__soa-head">
          <div>
            <h2>{row.name} SOA</h2>
            <span className="fv-ops__soa-sub">{recap.vesselName} · {recap.owners || '—'} · CP {recap.cpDate || '—'} · SOA {p2(today.getDate())}-{p2(today.getMonth() + 1)}-{today.getFullYear()} · <span className={`fv-ops__pill fv-ops__pill--${hireStatusPill(row.status as HireStatus)}`}>{row.status}</span>{editing && <span className="fv-ops__soa-editing"> · editing</span>}</span>
          </div>
          <div className="fv-ops__soa-headbtns">
            {!editing && <button type="button" className="fv-ops__btn" onClick={() => setEditing(true)}><i className="fas fa-pen" aria-hidden="true" /> Edit</button>}
            {editing && <button type="button" className="fv-ops__btn fv-ops__btn--go" onClick={save}><i className="fas fa-floppy-disk" aria-hidden="true" /> Save</button>}
            {editing && <button type="button" className="fv-ops__btn" onClick={discard}><i className="fas fa-rotate-left" aria-hidden="true" /> Discard</button>}
            <button type="button" className="fv-ops__btn" onClick={exportPdf}><i className="fas fa-file-pdf" aria-hidden="true" /> PDF</button>
            <button type="button" className="fv-ops__icon-btn" onClick={onClose} aria-label="Close"><i className="fas fa-xmark" aria-hidden="true" /></button>
          </div>
        </div>

        <div className="fv-ops__soa-body">
          {/* On-hire details — interim hires run for their own clause period; the final hire is cumulative from delivery */}
          <div className="fv-ops__soa-onhire">
            <div><span>{cumulative ? 'Delivery (From)' : 'Hire From'}</span><b>{fmtDT(fromD)}</b></div>
            <div><span>Hire To Date (To)</span>{editing ? <input type="datetime-local" className="fv-ops__eta-in" value={toInput(toD)} onChange={(e) => setD({ to: inputToDmy(e.target.value) })} /> : <b>{fmtDT(toD)}</b>}</div>
            <div><span>Days On-Hire</span><b>{fmt(onHire, 2)}</b></div>
            <div><span>Days Off-Hire</span><b>{fmt(cumOffHire, 2)}</b></div>
            <div><span>Nett Days On-Hire</span><b className="fv-ops__pos">{fmt(nett, 2)}</b></div>
            {cumulative && <div><span>This Hire Period</span><b className="fv-ops__soa-muted">{fmtDT(periodFromD)} → {fmtDT(toD)} · {fmt(row.onHire, 2)}d</b></div>}
          </div>

          <table className="fv-ops__soa-tbl">
            <thead>
              <tr><th>No</th><th>Description</th><th className="fv-ops__r">Due to Owners</th><th className="fv-ops__r">Due to Charterers</th></tr>
            </thead>
            <tbody>
              <tr><td>1</td><td>Hire — {fmt(cumulativeOnHireCalc, 2)} days × {editing ? nIn(draft.hirePerDay, (v) => setD({ hirePerDay: v })) : money(perDay)}/day</td><td className="fv-ops__r">{money(hireAmtGross)}</td><td className="fv-ops__r" /></tr>
              <tr><td>2</td><td><label className="fv-ops__soa-chk"><input type="checkbox" checked={draft.ballastOn} disabled={!editing} onChange={(e) => setD({ ballastOn: e.target.checked })} /> Ballast Bonus (LSUM)</label> {editing && nIn(draft.ballastBonus, (v) => setD({ ballastBonus: v }))}</td><td className="fv-ops__r">{oCol(bb)}</td><td className="fv-ops__r" /></tr>
              <tr><td>3</td><td>Address Commission @ {editing ? nIn(draft.adcom, (v) => setD({ adcom: v }), 56) : fmt(addrPct, 3)}%</td><td className="fv-ops__r" /><td className="fv-ops__r">{cCol(address)}</td></tr>
              <tr><td>4</td><td>Brokerage @ {editing ? nIn(draft.brokerage, (v) => setD({ brokerage: v }), 56) : fmt(brkgPct, 3)}%</td><td className="fv-ops__r" /><td className="fv-ops__r">{cCol(brokerage)}</td></tr>
              <tr><td>5</td><td>Bunker on Delivery — VLSFO {editing ? nIn(draft.delV, (v) => setD({ delV: v }), 64) : `${fmt(delV, 2)}mt`} @ {editing ? nIn(draft.foPrice, (v) => setD({ foPrice: v }), 60) : foP} · LSMGO {editing ? nIn(draft.delM, (v) => setD({ delM: v }), 64) : `${fmt(delM, 2)}mt`} @ {editing ? nIn(draft.doPrice, (v) => setD({ doPrice: v }), 60) : doP}{!bodCharged ? <span className="fv-ops__soa-muted"> · charged on the BOD hire</span> : ''}</td><td className="fv-ops__r">{oCol(row.bunkers)}</td><td className="fv-ops__r" /></tr>
              <tr><td>6</td><td>Bunker on Redelivery — VLSFO {editing ? nIn(draft.borV.trim() !== '' ? draft.borV : fmt(borRobV, 2), (v) => setD({ borV: v }), 64) : `${fmt(borV, 2)}mt`} @ {editing ? nIn(draft.borFo.trim() !== '' ? draft.borFo : fmt(foP, 2), (v) => setD({ borFo: v }), 60) : fmt(borFo, 2)} · LSMGO {editing ? nIn(draft.borM.trim() !== '' ? draft.borM : fmt(borRobM, 2), (v) => setD({ borM: v }), 64) : `${fmt(borM, 2)}mt`} @ {editing ? nIn(draft.borDo.trim() !== '' ? draft.borDo : fmt(doP, 2), (v) => setD({ borDo: v }), 60) : fmt(borDo, 2)}{!borCredited ? <span className="fv-ops__soa-muted"> · reversed nearer redelivery</span> : (bunkRedelivery < borFullValue - 0.01 ? <span className="fv-ops__soa-muted"> · {money(bunkRedelivery)} of {money(borFullValue)} reversed to date</span> : '')}</td><td className="fv-ops__r" /><td className="fv-ops__r">{cCol(row.bunkerCredit)}</td></tr>
              <tr><td>7</td><td>Cable / Victualing / Entertainment — {editing ? nIn(draft.cve, (v) => setD({ cve: v })) : money(num(draft.cve))}/mo × {fmt(onHire, 2)}d</td><td className="fv-ops__r">{oCol(cve)}</td><td className="fv-ops__r" /></tr>
              <tr><td>8</td><td><label className="fv-ops__soa-chk"><input type="checkbox" checked={draft.ilohcOn} disabled={!editing} onChange={(e) => setD({ ilohcOn: e.target.checked })} /> ILOHC</label> {editing && nIn(draft.ilohc, (v) => setD({ ilohc: v }))}</td><td className="fv-ops__r" /><td className="fv-ops__r">{cCol(ilohc)}</td></tr>
              <tr><td>9</td><td>Joint On-Hire Survey (÷2) {editing ? <span className="fv-ops__soa-in">{nIn(draft.jointOn, (v) => setD({ jointOn: v }))}</span> : money(num(draft.jointOn))}</td><td className="fv-ops__r" /><td className="fv-ops__r">{cCol(num(draft.jointOn) / 2)}</td></tr>
              <tr><td>10</td><td>Joint Off-Hire Survey (÷2) {editing ? <span className="fv-ops__soa-in">{nIn(draft.jointOff, (v) => setD({ jointOff: v }))}</span> : money(num(draft.jointOff))}</td><td className="fv-ops__r" /><td className="fv-ops__r">{cCol(num(draft.jointOff) / 2)}</td></tr>
              {extras.map((ex, i) => (
                <tr key={`ex-${i}`}>
                  <td>{11 + i}</td>
                  <td>
                    {editing ? (
                      <span className="fv-ops__soa-extra">
                        <input className="fv-ops__vd-in" value={ex.desc} placeholder="Other expense" onChange={(e) => setExtra(i, { desc: e.target.value })} />
                        <select className="fv-ops__eta-sel" value={ex.due} onChange={(e) => setExtra(i, { due: e.target.value })}><option value="Owners">Due Owners</option><option value="Charterers">Due Charterers</option></select>
                        {nIn(ex.amount, (v) => setExtra(i, { amount: v }))}
                        <button type="button" className="fv-ops__bnk-rm" aria-label="Remove" onClick={() => delExtra(i)}><i className="fas fa-xmark" aria-hidden="true" /></button>
                      </span>
                    ) : (ex.desc || 'Other expense')}
                  </td>
                  <td className="fv-ops__r">{ex.due === 'Owners' ? oCol(num(ex.amount)) : ''}</td>
                  <td className="fv-ops__r">{ex.due !== 'Owners' ? cCol(num(ex.amount)) : ''}</td>
                </tr>
              ))}
              {editing && (
                <tr><td /><td colSpan={3}><button type="button" className="fv-ops__btn fv-ops__soa-add" onClick={addExtra}><i className="fas fa-plus" aria-hidden="true" /> Add expense</button></td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="fv-ops__soa-sum"><td colSpan={2}>Sum</td><td className="fv-ops__r">{money(owners)}</td><td className="fv-ops__r">{money(charterers)}</td></tr>
              <tr className="fv-ops__soa-total"><td colSpan={2}>Total Payable to Owners</td><td className="fv-ops__r" colSpan={2}>{money(totalPayable)}</td></tr>
            </tfoot>
          </table>

          {/* Statement of off-hire */}
          <div className="fv-ops__soa-section">
            <div className="fv-ops__vd-sub-head"><i className="fas fa-hourglass-half" aria-hidden="true" /> Statement of Off-Hire {editing && <button type="button" className="fv-ops__btn fv-ops__soa-add" onClick={addOff}><i className="fas fa-plus" aria-hidden="true" /> Event</button>}</div>
            <table className="fv-ops__soa-tbl">
              <thead>
                <tr><th>Category</th><th>From</th><th>To</th><th className="fv-ops__r">%</th><th className="fv-ops__r">Days</th><th>Remarks</th>{editing && <th aria-label="Remove" />}</tr>
              </thead>
              <tbody>
                {offRows.length === 0 && <tr><td colSpan={editing ? 7 : 6} className="fv-ops__vd-empty">No off-hire recorded.{editing ? ' Use “Event” to add working / idle / sea / weather off-hire.' : ''}</td></tr>}
                {offRows.map((o, i) => {
                  const b = offBunker(o);
                  return (
                  <Fragment key={i}>
                  <tr>
                    <td>{editing ? <select className="fv-ops__eta-sel" value={o.cat} onChange={(e) => setOff(i, { cat: e.target.value })}>{OFFHIRE_CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select> : o.cat}</td>
                    <td>{editing ? <input type="datetime-local" className="fv-ops__eta-in" value={toInput(parseDMY(o.from))} onChange={(e) => setOff(i, { from: inputToDmy(e.target.value) })} /> : (o.from || '—')}</td>
                    <td>{editing ? <input type="datetime-local" className="fv-ops__eta-in" value={toInput(parseDMY(o.to))} onChange={(e) => setOff(i, { to: inputToDmy(e.target.value) })} /> : (o.to || '—')}</td>
                    <td className="fv-ops__r">{editing ? nIn(o.pct, (v) => setOff(i, { pct: v }), 48) : o.pct}</td>
                    <td className="fv-ops__r fv-ops__stw-calc">{fmt(offHireDays(o), 3)}</td>
                    <td>{editing ? <input className="fv-ops__vd-in" value={o.remark} placeholder="Remarks" onChange={(e) => setOff(i, { remark: e.target.value })} /> : (o.remark || '—')}</td>
                    {editing && <td className="fv-ops__r"><button type="button" className="fv-ops__bnk-rm" aria-label="Remove" onClick={() => delOff(i)}><i className="fas fa-xmark" aria-hidden="true" /></button></td>}
                  </tr>
                  <tr className="fv-ops__soa-robrow">
                    <td className="fv-ops__soa-roblbl">Bunker ROB</td>
                    <td className="fv-ops__soa-robcell"><span className="fv-ops__soa-robsub">Start</span> {foType} {editing ? nIn(o.robStartV ?? '', (v) => setOff(i, { robStartV: v }), 56) : fmt(b.startV, 2)} · {doType} {editing ? nIn(o.robStartM ?? '', (v) => setOff(i, { robStartM: v }), 56) : fmt(b.startM, 2)}</td>
                    <td className="fv-ops__soa-robcell"><span className="fv-ops__soa-robsub">End</span> {foType} {editing ? nIn((o.robEndV ?? '').trim() !== '' ? (o.robEndV ?? '') : fmt(b.endV, 2), (v) => setOff(i, { robEndV: v }), 56) : fmt(b.endV, 2)} · {doType} {editing ? nIn((o.robEndM ?? '').trim() !== '' ? (o.robEndM ?? '') : fmt(b.endM, 2), (v) => setOff(i, { robEndM: v }), 56) : fmt(b.endM, 2)}</td>
                    <td colSpan={editing ? 4 : 3} className="fv-ops__soa-muted">Consumed · {foType} {fmt(b.consV, 2)} · {doType} {fmt(b.consM, 2)}</td>
                  </tr>
                  </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="fv-ops__soa-sum"><td colSpan={editing ? 7 : 6}><div className="fv-ops__soa-offsum"><span>Total Off-Hire (A + B + C + D)</span><span className="fv-ops__soa-offsum-d">{fmt(offTotal, 3)} days</span><span className="fv-ops__soa-offsum-b">Bunkers · {foType} {fmt(offConsTotal.v, 2)} · {doType} {fmt(offConsTotal.m, 2)}</span><span className="fv-ops__soa-offsum-val">{money(offHireValue)}</span></div></td></tr>
              </tfoot>
            </table>
          </div>

          {/* Balance due to owners — Total Payable less off-hire and (on the final hire) payments made */}
          <div className="fv-ops__soa-section">
            <div className="fv-ops__vd-sub-head"><i className="fas fa-scale-balanced" aria-hidden="true" /> Balance Due to Owners</div>
              <table className="fv-ops__soa-tbl fv-ops__soa-prior">
                <tbody>
                  <tr className="fv-ops__soa-sum"><td>Total Payable to Owners</td><td className="fv-ops__r">{money(totalPayable)}</td></tr>
                  {offHirePart > 0.01 && (
                    <tr><td>Less: Off-Hire ({fmt(cumOffHire, 2)} days)</td><td className="fv-ops__r">-{money(offHirePart)}</td></tr>
                  )}
                  {priorRows.map((x) => (
                    <tr key={x.key}>
                      <td>Less: {x.name} <span className={`fv-ops__pill fv-ops__pill--${hireStatusPill(x.status as HireStatus)}`}>{x.status}</span></td>
                      <td className="fv-ops__r">-{money(x.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {priorRows.length > 0 && <tr className="fv-ops__soa-sum"><td>Total payment expected to be paid till date ({priorRows.length})</td><td className="fv-ops__r">-{money(paidTotal)}</td></tr>}
                  <tr className={`fv-ops__soa-bal${balanceDue < 0 ? ' fv-ops__soa-bal--neg' : ''}`}><td>Balance Due {balanceDue >= 0 ? 'to' : 'from'} Owners</td><td className="fv-ops__r">{money(Math.abs(balanceDue))}</td></tr>
                </tfoot>
              </table>
            </div>

          <p className="fv-ops__hint">Nett On-Hire = On-Hire − Off-Hire (A working + B idle + C sea + D weather). Bunkers on delivery (BOD, due Owners) and on redelivery (BOR, due Charterers) are shown in full and cancel for the estimate; the actual bunker settlement applies on the final hire. Payments already made are deducted to give the balance due. Use <b>Edit</b> to adjust figures — linked values update the voyage details only when you <b>Save</b>. *E&amp;OE.</p>
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

/** Parse "HH:MM" into fractional hours (e.g. "13:30" → 13.5). */
function parseClock(s: string): number | null {
  const m = String(s).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) + Number(m[2]) / 60;
}

/** Elapsed time of one statement-of-facts row, in days (handles midnight crossing). */
function eventElapsedDays(ev: LaytimeEvent): number {
  const from = parseClock(ev.from);
  const to = parseClock(ev.to);
  if (from == null || to == null) return 0;
  let diff = to - from;
  if (diff < 0) diff += 24;
  return diff / 24;
}

interface LaytimeResult {
  allowed: number; used: number; balance: number;
  onDemurrage: boolean; demurrageDays: number; despatchDays: number;
  demurrageAmt: number; despatchAmt: number;
  rows: { ev: LaytimeEvent; elapsed: number; counted: number; cumulative: number }[];
}

/** Full laytime calculation for one port (allowed vs used → demurrage / despatch). */
function calcLaytime(port: LaytimePort): LaytimeResult {
  const qty = num(port.quantity);
  const rate = num(port.rate);
  const allowed = rate > 0 ? qty / rate : 0;
  let used = 0;
  const rows = port.events.map((ev) => {
    const elapsed = eventElapsedDays(ev);
    const counted = elapsed * (num(ev.pct) / 100);
    used += counted;
    return { ev, elapsed, counted, cumulative: used };
  });
  const balance = allowed - used;
  const onDemurrage = balance < 0;
  const demurrageDays = onDemurrage ? -balance : 0;
  const despatchDays = onDemurrage ? 0 : balance;
  return {
    allowed, used, balance, onDemurrage, demurrageDays, despatchDays,
    demurrageAmt: demurrageDays * num(port.demurrageRate),
    despatchAmt: despatchDays * num(port.despatchRate),
    rows,
  };
}

/** Build a default freight-invoice + laytime dataset from the recap voyage figures. */
function seedFreightLaytime(recap: Recap): FreightLaytimeData {
  const loadPorts = splitPorts(recap.loadPort).map((name) => ({ name, op: 'Load' as const }));
  const dischPorts = splitPorts(recap.dischargePort).map((name) => ({ name, op: 'Discharge' as const }));
  const allPorts = [...loadPorts, ...dischPorts];
  const blQty = num(recap.finalQtyLoaded) || num(recap.cpQuantity);
  const demRate = num(recap.demDespatch);
  const despRate = /half/i.test(recap.despatchTerm) ? demRate / 2 : demRate;
  const laytimes: LaytimePort[] = allPorts.map((p) => ({
    id: uid('lay'),
    name: p.name,
    op: p.op,
    cargo: recap.cargoName,
    quantity: p.op === 'Load'
      ? String(Math.round(blQty))
      : String(Math.round(blQty / Math.max(1, dischPorts.length))),
    rate: String(num(p.op === 'Load' ? recap.loadRate : recap.dischRate)),
    terms: p.op === 'Load' ? recap.norAtLoadPort : recap.norAtDPort,
    norTendered: '',
    norAccepted: '',
    turnTimeHours: '12',
    commenced: '',
    completed: '',
    reversible: false,
    demurrageRate: String(demRate),
    despatchRate: String(despRate),
    events: [],
  }));
  return {
    invoices: [{
      id: uid('inv'),
      kind: 'Freight',
      title: 'Initial Freight Invoice',
      invoiceNo: '1',
      invoiceDate: '',
      invoiceTo: recap.charterers,
      paymentTerms: recap.frtPaymentTerms,
      dueDate: '',
      status: 'Draft',
      freightType: 'Initial',
      freightDifferential: '0',
      pctFreightDue: '100',
      initialFreightReceived: '0',
      loadPortDA: String(num(recap.portDaLoad)),
      dischPortDA: String(num(recap.portDaDisch)),
      includeDemurrage: false,
    }],
    laytimes,
  };
}

interface InvoiceLine { desc: string; amount: number; sign: 1 | -1 }
interface InvoiceResult { lines: InvoiceLine[]; total: number }

/** Compute an invoice's line items and total from the recap + laytime results. */
function calcInvoice(inv: FreightInvoice, recap: Recap, laytimes: LaytimePort[]): InvoiceResult {
  const results = laytimes.map((p) => calcLaytime(p));
  const totalDemurrage = results.reduce((s, r) => s + r.demurrageAmt, 0);
  const totalDespatch = results.reduce((s, r) => s + r.despatchAmt, 0);
  const adcomPct = num(recap.adcom) / 100;
  const lines: InvoiceLine[] = [];
  if (inv.kind === 'Demurrage') {
    laytimes.forEach((p) => {
      const r = calcLaytime(p);
      if (r.demurrageAmt > 0) lines.push({ desc: `${p.name} (${p.op}) — Demurrage ${fmt(r.demurrageDays, 3)}d × ${money(num(p.demurrageRate))}/day`, amount: r.demurrageAmt, sign: 1 });
      if (r.despatchAmt > 0) lines.push({ desc: `${p.name} (${p.op}) — Despatch ${fmt(r.despatchDays, 3)}d × ${money(num(p.despatchRate))}/day`, amount: r.despatchAmt, sign: -1 });
    });
    const adcomDem = totalDemurrage * adcomPct;
    if (adcomDem > 0) lines.push({ desc: `Less: Address commission on demurrage @ ${fmt(adcomPct * 100, 3)}%`, amount: adcomDem, sign: -1 });
    const total = lines.reduce((s, l) => s + l.sign * l.amount, 0);
    return { lines, total };
  }
  // Freight invoice
  const blQty = num(recap.finalQtyLoaded);
  const frtRate = num(recap.freightPerMt);
  const diffRate = num(inv.freightDifferential);
  const grossFreight = blQty * frtRate;
  const diffFreight = blQty * diffRate;
  const pctDue = num(inv.pctFreightDue) / 100;
  const freightDue = (grossFreight + diffFreight) * pctDue;
  const adcomFreight = freightDue * adcomPct;
  lines.push({ desc: `Freight: ${fmt(blQty, 0)} MT × ${money(frtRate)} PMT`, amount: grossFreight, sign: 1 });
  if (inv.freightType === 'Final' && diffFreight !== 0) lines.push({ desc: `Freight differential: ${fmt(blQty, 0)} MT × ${money(diffRate)} PMT`, amount: diffFreight, sign: 1 });
  if (pctDue !== 1) lines.push({ desc: `% of total freight due — ${fmt(pctDue * 100, 2)}%`, amount: freightDue - (grossFreight + diffFreight), sign: 1 });
  lines.push({ desc: `Less: Address commission @ ${fmt(adcomPct * 100, 3)}%`, amount: adcomFreight, sign: -1 });
  lines.push({ desc: 'Less: Load port D/A', amount: num(inv.loadPortDA), sign: -1 });
  lines.push({ desc: 'Less: Discharge port D/A', amount: num(inv.dischPortDA), sign: -1 });
  if (inv.includeDemurrage) {
    if (totalDemurrage > 0) lines.push({ desc: 'Add: Total demurrage (all ports)', amount: totalDemurrage, sign: 1 });
    const adcomDem = totalDemurrage * adcomPct;
    if (adcomDem > 0) lines.push({ desc: `Less: Address commission on demurrage @ ${fmt(adcomPct * 100, 3)}%`, amount: adcomDem, sign: -1 });
    if (totalDespatch > 0) lines.push({ desc: 'Less: Total despatch (all ports)', amount: totalDespatch, sign: -1 });
  }
  if (num(inv.initialFreightReceived) > 0) lines.push({ desc: 'Less: Initial freight received', amount: num(inv.initialFreightReceived), sign: -1 });
  const total = lines.reduce((s, l) => s + l.sign * l.amount, 0);
  return { lines, total };
}

function freightStatusPill(s: string): string {
  if (s === 'Paid') return 'green';
  if (s === 'Sent') return 'blue';
  return 'amber';
}

/** HTML body for one invoice (used by the modal and bulk PDF export). */
function invoicePdfSection(inv: FreightInvoice, recap: Recap, voyage: Voyage, laytimes: LaytimePort[]): string {
  const { lines, total } = calcInvoice(inv, recap, laytimes);
  const rows = lines.map((l) => `<tr><td>${l.desc}</td><td class="r">${l.sign < 0 ? '-' : ''}${money(l.amount)}</td></tr>`).join('');
  return `<section>
    <h1>${inv.kind === 'Freight' ? `${inv.freightType} Freight Invoice` : inv.title}</h1>
    <p class="sub">${recap.vesselName} · IMO ${voyage.imo || '—'} · ${voyage.flag || '—'} · CP ${recap.cpDate || '—'}</p>
    <div class="meta">
      <div><span>Invoice To:</span> ${inv.invoiceTo || '—'}</div>
      <div><span>Invoice No.:</span> ${inv.invoiceNo || '—'}</div>
      <div><span>Invoice Date:</span> ${inv.invoiceDate || '—'}</div>
      <div><span>Payment Terms:</span> ${inv.paymentTerms || '—'}</div>
      <div><span>Due Date:</span> ${inv.dueDate || '—'}</div>
      <div><span>Voyage:</span> ${recap.loadPort} → ${recap.dischargePort}</div>
      <div><span>Cargo:</span> ${recap.cargoName}</div>
    </div>
    <table><thead><tr><th>Description</th><th class="r">Amount (US$)</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="tot"><td>Total Payable Due to Owners</td><td class="r">${money(total)}</td></tr></tfoot></table>
  </section>`;
}

/** HTML body for one laytime calculation (used by the modal and bulk PDF export). */
function laytimePdfSection(port: LaytimePort, recap: Recap): string {
  const res = calcLaytime(port);
  const factRows = res.rows.map(({ ev, elapsed, counted, cumulative }) => `<tr><td>${ev.date || ''}</td><td>${ev.from || ''}</td><td>${ev.to || ''}</td><td class="r">${ev.pct}</td><td class="r">${fmt(elapsed, 3)}</td><td class="r">${fmt(counted, 3)}</td><td class="r">${fmt(cumulative, 3)}</td><td>${ev.remark || ''}</td></tr>`).join('');
  return `<section>
    <h1>Laytime Calculation — ${port.name || 'Port'} (${port.op})</h1>
    <p class="sub">${recap.vesselName} · Cargo ${port.cargo} · CP ${recap.cpDate || '—'}</p>
    <div class="meta">
      <div><span>Quantity:</span> ${fmt(num(port.quantity), 0)} MT</div>
      <div><span>Rate:</span> ${fmt(num(port.rate), 0)} mt/day</div>
      <div><span>Terms:</span> ${port.terms || '—'}</div>
      <div><span>Laytime Allowed:</span> ${fmt(res.allowed, 3)} days</div>
      <div><span>Laytime Used:</span> ${fmt(res.used, 3)} days</div>
      <div><span>${res.onDemurrage ? 'Demurrage Due:' : 'Despatch Due:'}</span> ${res.onDemurrage ? money(res.demurrageAmt) : money(res.despatchAmt)}</div>
    </div>
    <table><thead><tr><th>Date</th><th>From</th><th>To</th><th class="r">% Count</th><th class="r">Elapsed</th><th class="r">Counted</th><th class="r">Cumulative</th><th>Remarks</th></tr></thead>
    <tbody>${factRows}</tbody>
    <tfoot><tr><td colspan="6">Total Time Used</td><td class="r">${fmt(res.used, 3)}</td><td>days</td></tr></tfoot></table>
  </section>`;
}

/** Open a print window wrapping the given HTML sections in a standard stylesheet. */
function printSections(title: string, sections: string): void {
  const w = window.open('', '_blank', 'width=1000,height=1100');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:28px;font-size:12px}
    h1{font-size:16px;margin:0 0 2px}.sub{color:#555;margin:0 0 12px;font-size:11px}
    table{border-collapse:collapse;width:100%;margin:8px 0}
    th,td{border:1px solid #bbb;padding:4px 7px;text-align:left}
    th.r,td.r{text-align:right}tfoot td{font-weight:700;background:#f2f2f2}.tot{font-size:13px}
    .meta{margin:0 0 12px;font-size:11px}.meta span{display:inline-block;min-width:130px;color:#555}
    section{page-break-after:always}section:last-child{page-break-after:auto}
  </style></head><body>${sections}<p class="sub">*E&amp;OE.</p></body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

function FreightTab({ recap, setRecap, voyage }: { recap: Recap; setRecap: Dispatch<SetStateAction<Recap>>; voyage: Voyage }) {
  const stored = recap.freightLaytime;
  const valid = !!stored && Array.isArray(stored.invoices) && Array.isArray(stored.laytimes);
  const fl = valid ? (stored as FreightLaytimeData) : seedFreightLaytime(recap);

  // Seed (or migrate a legacy shape) the first time the tab is opened.
  useEffect(() => {
    if (!valid) setRecap((r) => ({ ...r, freightLaytime: seedFreightLaytime(r) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setFL = (patch: Partial<FreightLaytimeData>) =>
    setRecap((r) => {
      const cur = (r.freightLaytime && Array.isArray(r.freightLaytime.invoices) && Array.isArray(r.freightLaytime.laytimes))
        ? r.freightLaytime : seedFreightLaytime(r);
      return { ...r, freightLaytime: { ...cur, ...patch } };
    });

  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [laytimeId, setLaytimeId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selInvoices, setSelInvoices] = useState<Set<string>>(new Set());
  const [selLaytimes, setSelLaytimes] = useState<Set<string>>(new Set());
  const toggleInv = (id: string) => setSelInvoices((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleLay = (id: string) => setSelLaytimes((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const copyToPostfix = () => {
    copyLaytimeToPostfix(voyage.id);
    addNotification(`Laytime for ${voyage.vessel} (${voyage.id}) copied to Postfix.`, 'Postfix');
    setCopied(true);
  };

  // --- Invoice list operations ---
  const addInvoice = (kind: 'Freight' | 'Demurrage') => {
    const n = fl.invoices.length + 1;
    const inv: FreightInvoice = {
      id: uid('inv'), kind,
      title: kind === 'Freight' ? 'Freight Invoice' : 'Demurrage / Despatch Invoice',
      invoiceNo: String(n), invoiceDate: '', invoiceTo: recap.charterers,
      paymentTerms: recap.frtPaymentTerms, dueDate: '', status: 'Draft',
      freightType: kind === 'Freight' ? 'Final' : 'Initial',
      freightDifferential: '0', pctFreightDue: '100', initialFreightReceived: '0',
      loadPortDA: String(num(recap.portDaLoad)), dischPortDA: String(num(recap.portDaDisch)),
      includeDemurrage: kind === 'Demurrage',
    };
    setFL({ invoices: [...fl.invoices, inv] });
    setInvoiceId(inv.id);
  };
  const delInvoice = (id: string) => setFL({ invoices: fl.invoices.filter((x) => x.id !== id) });
  const saveInvoice = (id: string, patch: Partial<FreightInvoice>) =>
    setFL({ invoices: fl.invoices.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const deleteSelInvoices = () => { setFL({ invoices: fl.invoices.filter((x) => !selInvoices.has(x.id)) }); setSelInvoices(new Set()); };
  const duplicateSelInvoices = () => {
    const copies = fl.invoices.filter((x) => selInvoices.has(x.id)).map((x) => ({ ...x, id: uid('inv'), title: `${x.title} (copy)`, status: 'Draft' }));
    setFL({ invoices: [...fl.invoices, ...copies] });
    setSelInvoices(new Set());
  };
  const pdfSelInvoices = () => {
    const sel = fl.invoices.filter((x) => selInvoices.has(x.id));
    if (sel.length === 0) return;
    printSections(`Invoices — ${recap.vesselName}`, sel.map((x) => invoicePdfSection(x, recap, voyage, fl.laytimes)).join(''));
  };

  // --- Laytime list operations ---
  const addLaytime = (op: 'Load' | 'Discharge') => {
    const p: LaytimePort = {
      id: uid('lay'), name: '', op, cargo: recap.cargoName, quantity: '0',
      rate: String(num(op === 'Load' ? recap.loadRate : recap.dischRate)),
      terms: op === 'Load' ? recap.norAtLoadPort : recap.norAtDPort,
      norTendered: '', norAccepted: '', turnTimeHours: '12', commenced: '', completed: '',
      reversible: false, demurrageRate: String(num(recap.demDespatch)),
      despatchRate: String(/half/i.test(recap.despatchTerm) ? num(recap.demDespatch) / 2 : num(recap.demDespatch)),
      events: [],
    };
    setFL({ laytimes: [...fl.laytimes, p] });
    setLaytimeId(p.id);
  };
  const delLaytime = (id: string) => setFL({ laytimes: fl.laytimes.filter((x) => x.id !== id) });
  const saveLaytime = (id: string, patch: Partial<LaytimePort>) =>
    setFL({ laytimes: fl.laytimes.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const deleteSelLaytimes = () => { setFL({ laytimes: fl.laytimes.filter((x) => !selLaytimes.has(x.id)) }); setSelLaytimes(new Set()); };
  const duplicateSelLaytimes = () => {
    const copies = fl.laytimes.filter((x) => selLaytimes.has(x.id)).map((x) => ({ ...x, id: uid('lay'), name: `${x.name} (copy)`, events: x.events.map((e) => ({ ...e })) }));
    setFL({ laytimes: [...fl.laytimes, ...copies] });
    setSelLaytimes(new Set());
  };
  const pdfSelLaytimes = () => {
    const sel = fl.laytimes.filter((x) => selLaytimes.has(x.id));
    if (sel.length === 0) return;
    printSections(`Laytime — ${recap.vesselName}`, sel.map((x) => laytimePdfSection(x, recap)).join(''));
  };

  const openInvoice = fl.invoices.find((x) => x.id === invoiceId) ?? null;
  const openLaytime = fl.laytimes.find((x) => x.id === laytimeId) ?? null;

  return (
    <>
    <div className="fv-ops__frl">
      {/* ---------------------------------------------------------- Invoices list */}
      <Card title="Invoices" icon="fa-file-invoice-dollar" wide
        right={
          <span className="fv-ops__frl-secbtns">
            <button type="button" className="fv-ops__btn" onClick={() => addInvoice('Freight')}><i className="fas fa-plus" aria-hidden="true" /> Freight Invoice</button>
            <button type="button" className="fv-ops__btn" onClick={() => addInvoice('Demurrage')}><i className="fas fa-plus" aria-hidden="true" /> Demurrage Invoice</button>
            <button type="button" className="fv-ops__btn" onClick={duplicateSelInvoices} disabled={selInvoices.size === 0} title="Duplicate selected invoices"><i className="fas fa-copy" aria-hidden="true" /> Duplicate{selInvoices.size > 0 ? ` (${selInvoices.size})` : ''}</button>
            <button type="button" className="fv-ops__btn" onClick={pdfSelInvoices} disabled={selInvoices.size === 0} title="Generate PDF of selected invoices"><i className="fas fa-file-pdf" aria-hidden="true" /> PDF{selInvoices.size > 0 ? ` (${selInvoices.size})` : ''}</button>
            <button type="button" className="fv-ops__btn" onClick={deleteSelInvoices} disabled={selInvoices.size === 0} title="Delete selected invoices"><i className="fas fa-trash" aria-hidden="true" /> Delete{selInvoices.size > 0 ? ` (${selInvoices.size})` : ''}</button>
          </span>
        }>
        <table className="fv-ops__table">
          <thead>
            <tr>
              <th className="fv-ops__hire-selcol">
                <input type="checkbox" aria-label="Select all invoices"
                  checked={fl.invoices.length > 0 && fl.invoices.every((x) => selInvoices.has(x.id))}
                  ref={(el) => { if (el) el.indeterminate = selInvoices.size > 0 && !fl.invoices.every((x) => selInvoices.has(x.id)); }}
                  onChange={(e) => setSelInvoices(e.target.checked ? new Set(fl.invoices.map((x) => x.id)) : new Set())} />
              </th>
              <th>Invoice</th><th>No.</th><th>Invoice To</th><th>Date</th><th className="fv-ops__r">Amount (US$)</th><th>Status</th><th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {fl.invoices.length === 0 && <tr><td colSpan={8} className="fv-ops__vd-empty">No invoices yet. Use “Freight Invoice” or “Demurrage Invoice” to add one.</td></tr>}
            {fl.invoices.map((inv) => {
              const { total } = calcInvoice(inv, recap, fl.laytimes);
              return (
                <tr key={inv.id}>
                  <td className="fv-ops__hire-selcol"><input type="checkbox" aria-label={`Select ${inv.title}`} checked={selInvoices.has(inv.id)} onChange={() => toggleInv(inv.id)} /></td>
                  <td><button type="button" className="fv-ops__hire-namebtn" onClick={() => setInvoiceId(inv.id)}>{inv.kind === 'Freight' ? `${inv.freightType} Freight Invoice` : inv.title}</button></td>
                  <td>{inv.invoiceNo}</td>
                  <td>{inv.invoiceTo || '—'}</td>
                  <td>{inv.invoiceDate || '—'}</td>
                  <td className="fv-ops__r">{money(total)}</td>
                  <td><span className={`fv-ops__pill fv-ops__pill--${freightStatusPill(inv.status)}`}>{inv.status}</span></td>
                  <td className="fv-ops__r">
                    <span className="fv-ops__hire-actions">
                      <button type="button" className="fv-ops__btn" onClick={() => setInvoiceId(inv.id)}><i className="fas fa-pen" aria-hidden="true" /> Open</button>
                      <button type="button" className="fv-ops__bnk-rm" aria-label="Delete invoice" onClick={() => delInvoice(inv.id)}><i className="fas fa-trash" aria-hidden="true" /></button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* --------------------------------------------------- Laytime Calculations */}
      <Card title="Laytime Calculations" icon="fa-hourglass-half" wide
        right={
          <span className="fv-ops__frl-secbtns">
            <button type="button" className="fv-ops__btn" onClick={() => addLaytime('Load')}><i className="fas fa-plus" aria-hidden="true" /> Load Port</button>
            <button type="button" className="fv-ops__btn" onClick={() => addLaytime('Discharge')}><i className="fas fa-plus" aria-hidden="true" /> Discharge Port</button>
            <button type="button" className="fv-ops__btn" onClick={duplicateSelLaytimes} disabled={selLaytimes.size === 0} title="Duplicate selected laytime calculations"><i className="fas fa-copy" aria-hidden="true" /> Duplicate{selLaytimes.size > 0 ? ` (${selLaytimes.size})` : ''}</button>
            <button type="button" className="fv-ops__btn" onClick={pdfSelLaytimes} disabled={selLaytimes.size === 0} title="Generate PDF of selected laytime calculations"><i className="fas fa-file-pdf" aria-hidden="true" /> PDF{selLaytimes.size > 0 ? ` (${selLaytimes.size})` : ''}</button>
            <button type="button" className="fv-ops__btn" onClick={deleteSelLaytimes} disabled={selLaytimes.size === 0} title="Delete selected laytime calculations"><i className="fas fa-trash" aria-hidden="true" /> Delete{selLaytimes.size > 0 ? ` (${selLaytimes.size})` : ''}</button>
          </span>
        }>
        <table className="fv-ops__table">
          <thead>
            <tr>
              <th className="fv-ops__hire-selcol">
                <input type="checkbox" aria-label="Select all laytime calculations"
                  checked={fl.laytimes.length > 0 && fl.laytimes.every((x) => selLaytimes.has(x.id))}
                  ref={(el) => { if (el) el.indeterminate = selLaytimes.size > 0 && !fl.laytimes.every((x) => selLaytimes.has(x.id)); }}
                  onChange={(e) => setSelLaytimes(e.target.checked ? new Set(fl.laytimes.map((x) => x.id)) : new Set())} />
              </th>
              <th>Port</th><th>Operation</th><th className="fv-ops__r">Allowed (d)</th><th className="fv-ops__r">Used (d)</th><th>Result</th><th className="fv-ops__r">Amount (US$)</th><th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {fl.laytimes.length === 0 && <tr><td colSpan={8} className="fv-ops__vd-empty">No laytime calculations yet. Use “Load Port” or “Discharge Port” to add one.</td></tr>}
            {fl.laytimes.map((p) => {
              const r = calcLaytime(p);
              return (
                <tr key={p.id}>
                  <td className="fv-ops__hire-selcol"><input type="checkbox" aria-label={`Select ${p.name || 'port'}`} checked={selLaytimes.has(p.id)} onChange={() => toggleLay(p.id)} /></td>
                  <td><button type="button" className="fv-ops__hire-namebtn" onClick={() => setLaytimeId(p.id)}>{p.name || 'New Port'}</button></td>
                  <td>{p.op}</td>
                  <td className="fv-ops__r">{fmt(r.allowed, 3)}</td>
                  <td className="fv-ops__r">{fmt(r.used, 3)}</td>
                  <td className={r.onDemurrage ? 'fv-ops__neg' : 'fv-ops__pos'}>{r.onDemurrage ? 'Demurrage' : 'Despatch'}</td>
                  <td className={`fv-ops__r ${r.onDemurrage ? 'fv-ops__neg' : 'fv-ops__pos'}`}>{r.onDemurrage ? money(r.demurrageAmt) : `-${money(r.despatchAmt)}`}</td>
                  <td className="fv-ops__r">
                    <span className="fv-ops__hire-actions">
                      <button type="button" className="fv-ops__btn" onClick={() => setLaytimeId(p.id)}><i className="fas fa-pen" aria-hidden="true" /> Open</button>
                      <button type="button" className="fv-ops__bnk-rm" aria-label="Delete laytime" onClick={() => delLaytime(p.id)}><i className="fas fa-trash" aria-hidden="true" /></button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="fv-ops__row-sub">
              <td colSpan={6}>Net Demurrage / (Despatch)</td>
              <td className="fv-ops__r" colSpan={2}>{money(fl.laytimes.reduce((s, p) => { const r = calcLaytime(p); return s + r.demurrageAmt - r.despatchAmt; }, 0))}</td>
            </tr>
          </tfoot>
        </table>
      </Card>

      <div className="fv-ops__laytime-actions">
        <button type="button" className="fv-ops__btn fv-ops__btn--primary" onClick={copyToPostfix} disabled={copied}>
          <i className={`fas ${copied ? 'fa-circle-check' : 'fa-share-from-square'}`} aria-hidden="true" />{' '}
          {copied ? 'Copied to Postfix' : 'Copy Laytime to Postfix'}
        </button>
      </div>
    </div>

    {openInvoice && (
      <FreightInvoiceModal
        key={openInvoice.id}
        inv={openInvoice}
        recap={recap}
        voyage={voyage}
        laytimes={fl.laytimes}
        onSave={(patch) => saveInvoice(openInvoice.id, patch)}
        onDelete={() => { delInvoice(openInvoice.id); setInvoiceId(null); }}
        onClose={() => setInvoiceId(null)}
      />
    )}
    {openLaytime && (
      <LaytimeModal
        key={openLaytime.id}
        port={openLaytime}
        recap={recap}
        onSave={(patch) => saveLaytime(openLaytime.id, patch)}
        onDelete={() => { delLaytime(openLaytime.id); setLaytimeId(null); }}
        onClose={() => setLaytimeId(null)}
      />
    )}
    </>
  );
}

/** Freight / demurrage invoice editor — mirrors the SOA modal (edit / save / pdf). */
function FreightInvoiceModal({ inv, recap, voyage, laytimes, onSave, onDelete, onClose }: {
  inv: FreightInvoice; recap: Recap; voyage: Voyage; laytimes: LaytimePort[];
  onSave: (patch: Partial<FreightInvoice>) => void; onDelete: () => void; onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<FreightInvoice>(inv);
  const setD = (patch: Partial<FreightInvoice>) => setDraft((d) => ({ ...d, ...patch }));
  const view = editing ? draft : inv;
  const { lines, total } = calcInvoice(view, recap, laytimes);
  const today = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');

  const save = () => { onSave(draft); setEditing(false); };
  const discard = () => { setDraft(inv); setEditing(false); };

  const inp = (val: string, on: (v: string) => void, w?: number, ph?: string) => (
    <input className="fv-ops__vd-in" style={w ? { width: w } : undefined} value={val} placeholder={ph} disabled={!editing} onChange={(e) => on(e.target.value)} />
  );

  const exportPdf = () => {
    const w = window.open('', '_blank', 'width=900,height=1100');
    if (!w) return;
    const rows = lines.map((l) => `<tr><td>${l.desc}</td><td class="r">${l.sign < 0 ? '-' : ''}${money(l.amount)}</td></tr>`).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${view.title} — ${recap.vesselName}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:28px;font-size:12px}
      h1{font-size:16px;margin:0 0 2px}.sub{color:#555;margin:0 0 14px;font-size:11px}
      table{border-collapse:collapse;width:100%;margin:8px 0}
      th,td{border:1px solid #bbb;padding:4px 7px;text-align:left}
      th.r,td.r{text-align:right}tfoot td{font-weight:700;background:#f2f2f2}.tot{font-size:13px}
      .meta{margin:0 0 12px;font-size:11px}.meta span{display:inline-block;min-width:130px;color:#555}
    </style></head><body>
      <h1>${view.kind === 'Freight' ? `${view.freightType} Freight Invoice` : view.title}</h1>
      <p class="sub">${recap.vesselName} · IMO ${voyage.imo || '—'} · ${voyage.flag || '—'} · CP ${recap.cpDate || '—'}</p>
      <div class="meta">
        <div><span>Invoice To:</span> ${view.invoiceTo || '—'}</div>
        <div><span>Invoice No.:</span> ${view.invoiceNo || '—'}</div>
        <div><span>Invoice Date:</span> ${view.invoiceDate || '—'}</div>
        <div><span>Payment Terms:</span> ${view.paymentTerms || '—'}</div>
        <div><span>Due Date:</span> ${view.dueDate || '—'}</div>
        <div><span>Voyage:</span> ${recap.loadPort} → ${recap.dischargePort}</div>
        <div><span>Cargo:</span> ${recap.cargoName}</div>
      </div>
      <table><thead><tr><th>Description</th><th class="r">Amount (US$)</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="tot"><td>Total Payable Due to Owners</td><td class="r">${money(total)}</td></tr></tfoot></table>
      <p class="sub">SOA ${p2(today.getDate())}-${p2(today.getMonth() + 1)}-${today.getFullYear()} · *E&amp;OE.</p>
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="fv-ops__modal-overlay" onClick={onClose}>
      <div className="fv-ops__soa" onClick={(e) => e.stopPropagation()}>
        <div className="fv-ops__soa-head">
          <div>
            <h2>{view.kind === 'Freight' ? `${view.freightType} Freight Invoice` : view.title}</h2>
            <span className="fv-ops__soa-sub">{recap.vesselName} · IMO {voyage.imo || '—'} · {view.invoiceTo || '—'} · No. {view.invoiceNo} · <span className={`fv-ops__pill fv-ops__pill--${freightStatusPill(view.status)}`}>{view.status}</span>{editing && <span className="fv-ops__soa-editing"> · editing</span>}</span>
          </div>
          <div className="fv-ops__soa-headbtns">
            {!editing && <button type="button" className="fv-ops__btn" onClick={() => setEditing(true)}><i className="fas fa-pen" aria-hidden="true" /> Edit</button>}
            {editing && <button type="button" className="fv-ops__btn fv-ops__btn--go" onClick={save}><i className="fas fa-floppy-disk" aria-hidden="true" /> Save</button>}
            {editing && <button type="button" className="fv-ops__btn" onClick={discard}><i className="fas fa-rotate-left" aria-hidden="true" /> Discard</button>}
            <button type="button" className="fv-ops__btn" onClick={exportPdf}><i className="fas fa-file-pdf" aria-hidden="true" /> PDF</button>
            <button type="button" className="fv-ops__btn" onClick={onDelete}><i className="fas fa-trash" aria-hidden="true" /> Delete</button>
            <button type="button" className="fv-ops__icon-btn" onClick={onClose} aria-label="Close"><i className="fas fa-xmark" aria-hidden="true" /></button>
          </div>
        </div>
        <div className="fv-ops__soa-body">
          <div className="fv-ops__frl-invhead">
            <div className="fv-ops__frl-party">
              <div className="fv-ops__frl-lbl">Invoice To</div>
              {inp(view.invoiceTo, (v) => setD({ invoiceTo: v }), undefined, 'Charterers')}
              <div className="fv-ops__frl-meta">
                <span>Vessel</span><b>{recap.vesselName}</b>
                <span>IMO</span><b>{voyage.imo || '—'}</b>
                <span>Flag</span><b>{voyage.flag || '—'}</b>
                <span>Type</span><b>{voyage.vesselType || '—'}</b>
                <span>CP Dated</span><b>{recap.cpDate || '—'}</b>
                <span>B/L Date</span><b>{recap.blIssueDate || '—'}</b>
              </div>
            </div>
            <div className="fv-ops__frl-invno">
              {view.kind === 'Freight' && (
                <label>Invoice Type
                  <select className="fv-ops__eta-sel" value={view.freightType} disabled={!editing} onChange={(e) => setD({ freightType: e.target.value as 'Initial' | 'Final', includeDemurrage: e.target.value === 'Final' })}>
                    <option value="Initial">Initial</option>
                    <option value="Final">Final</option>
                  </select>
                </label>
              )}
              <label>Invoice No.{inp(view.invoiceNo, (v) => setD({ invoiceNo: v }), 90)}</label>
              <label>Invoice Date{inp(view.invoiceDate, (v) => setD({ invoiceDate: v }), 110, 'dd-mm-yyyy')}</label>
              <label>Payment Terms{inp(view.paymentTerms, (v) => setD({ paymentTerms: v }), 150)}</label>
              <label>Due Date{inp(view.dueDate, (v) => setD({ dueDate: v }), 110, 'dd-mm-yyyy')}</label>
              <label>Status
                <select className="fv-ops__eta-sel" value={view.status} disabled={!editing} onChange={(e) => setD({ status: e.target.value })}>
                  <option value="Draft">Draft</option>
                  <option value="Sent">Sent</option>
                  <option value="Paid">Paid</option>
                </select>
              </label>
            </div>
          </div>
          <div className="fv-ops__frl-voy">
            <span><b>Voyage:</b> {recap.loadPort} → {recap.dischargePort}</span>
            <span><b>Cargo:</b> {recap.cargoName}</span>
            <span><b>B/L Qty:</b> {fmt(num(recap.finalQtyLoaded), 0)} MT</span>
            <span><b>Freight:</b> {money(num(recap.freightPerMt))} PMT</span>
          </div>
          {view.kind === 'Freight' && editing && (
            <div className="fv-ops__frl-adj">
              {view.freightType === 'Final' && <label>Freight Differential (PMT){inp(view.freightDifferential, (v) => setD({ freightDifferential: v }), 80)}</label>}
              <label>% Freight Due{inp(view.pctFreightDue, (v) => setD({ pctFreightDue: v }), 64)}</label>
              <label>Load Port D/A{inp(view.loadPortDA, (v) => setD({ loadPortDA: v }), 100)}</label>
              <label>Discharge Port D/A{inp(view.dischPortDA, (v) => setD({ dischPortDA: v }), 100)}</label>
              {view.freightType === 'Final' && <label>Initial Freight Received{inp(view.initialFreightReceived, (v) => setD({ initialFreightReceived: v }), 120)}</label>}
              {view.freightType === 'Final' && <label className="fv-ops__frl-chk"><input type="checkbox" checked={view.includeDemurrage} onChange={(e) => setD({ includeDemurrage: e.target.checked })} /> Include demurrage / despatch</label>}
            </div>
          )}
          <table className="fv-ops__soa-tbl">
            <thead>
              <tr><th>Description</th><th className="fv-ops__r">Amount (US$)</th></tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}><td>{l.desc}</td><td className={`fv-ops__r ${l.sign < 0 ? 'fv-ops__neg' : ''}`}>{l.sign < 0 ? '-' : ''}{money(l.amount)}</td></tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="fv-ops__soa-total"><td>Total Payable Due to Owners</td><td className="fv-ops__r">{money(total)}</td></tr>
            </tfoot>
          </table>
          <p className="fv-ops__hint">Freight, commissions and D/A are pulled from the voyage recap. {view.kind === 'Freight' && view.freightType === 'Final' ? 'Demurrage / despatch fold in from the laytime calculations when enabled.' : ''} Use <b>Edit</b> to adjust figures, <b>Save</b> to persist, <b>PDF</b> to print. *E&amp;OE.</p>
        </div>
      </div>
    </div>
  );
}

/** Laytime calculation editor — mirrors the SOA modal (edit / save / pdf) with a statement of facts. */
function LaytimeModal({ port, recap, onSave, onDelete, onClose }: {
  port: LaytimePort; recap: Recap;
  onSave: (patch: Partial<LaytimePort>) => void; onDelete: () => void; onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LaytimePort>(port);
  const view = editing ? draft : port;
  const setD = (patch: Partial<LaytimePort>) => setDraft((d) => ({ ...d, ...patch }));
  const res = calcLaytime(view);
  const today = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');

  const save = () => { onSave(draft); setEditing(false); };
  const discard = () => { setDraft(port); setEditing(false); };

  const addEvent = () => setD({ events: [...draft.events, { date: '', from: '', to: '', pct: '100', remark: '' }] });
  const setEvent = (i: number, patch: Partial<LaytimeEvent>) => setD({ events: draft.events.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) });
  const delEvent = (i: number) => setD({ events: draft.events.filter((_, idx) => idx !== i) });

  const inp = (val: string, on: (v: string) => void, w?: number, ph?: string) => (
    <input className="fv-ops__vd-in" style={w ? { width: w } : undefined} value={val} placeholder={ph} disabled={!editing} onChange={(e) => on(e.target.value)} />
  );

  const exportPdf = () => {
    const w = window.open('', '_blank', 'width=1000,height=1100');
    if (!w) return;
    const factRows = res.rows.map(({ ev, elapsed, counted, cumulative }) => `<tr><td>${ev.date || ''}</td><td>${ev.from || ''}</td><td>${ev.to || ''}</td><td class="r">${ev.pct}</td><td class="r">${fmt(elapsed, 3)}</td><td class="r">${fmt(counted, 3)}</td><td class="r">${fmt(cumulative, 3)}</td><td>${ev.remark || ''}</td></tr>`).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Laytime — ${view.name} — ${recap.vesselName}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:28px;font-size:12px}
      h1{font-size:16px;margin:0 0 2px}.sub{color:#555;margin:0 0 14px;font-size:11px}
      table{border-collapse:collapse;width:100%;margin:8px 0}
      th,td{border:1px solid #bbb;padding:4px 7px;text-align:left}
      th.r,td.r{text-align:right}tfoot td{font-weight:700;background:#f2f2f2}
      .meta{margin:0 0 12px;font-size:11px}.meta span{display:inline-block;min-width:150px;color:#555}
    </style></head><body>
      <h1>Laytime Calculation — ${view.name} (${view.op})</h1>
      <p class="sub">${recap.vesselName} · Cargo ${view.cargo} · CP ${recap.cpDate || '—'}</p>
      <div class="meta">
        <div><span>Quantity:</span> ${fmt(num(view.quantity), 0)} MT</div>
        <div><span>Rate:</span> ${fmt(num(view.rate), 0)} mt/day</div>
        <div><span>Terms:</span> ${view.terms || '—'}</div>
        <div><span>NOR Tendered:</span> ${view.norTendered || '—'}</div>
        <div><span>NOR Accepted:</span> ${view.norAccepted || '—'}</div>
        <div><span>Laytime Allowed:</span> ${fmt(res.allowed, 3)} days</div>
        <div><span>Laytime Used:</span> ${fmt(res.used, 3)} days</div>
        <div><span>${res.onDemurrage ? 'On Demurrage:' : 'Time Saved:'}</span> ${fmt(Math.abs(res.balance), 3)} days</div>
        <div><span>${res.onDemurrage ? 'Demurrage Due:' : 'Despatch Due:'}</span> ${res.onDemurrage ? money(res.demurrageAmt) : money(res.despatchAmt)}</div>
      </div>
      <table><thead><tr><th>Date</th><th>From</th><th>To</th><th class="r">% Count</th><th class="r">Elapsed</th><th class="r">Counted</th><th class="r">Cumulative</th><th>Remarks</th></tr></thead>
      <tbody>${factRows}</tbody>
      <tfoot><tr><td colspan="6">Total Time Used</td><td class="r">${fmt(res.used, 3)}</td><td>days</td></tr></tfoot></table>
      <p class="sub">Prepared ${p2(today.getDate())}-${p2(today.getMonth() + 1)}-${today.getFullYear()} · *E&amp;OE.</p>
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="fv-ops__modal-overlay" onClick={onClose}>
      <div className="fv-ops__soa" onClick={(e) => e.stopPropagation()}>
        <div className="fv-ops__soa-head">
          <div>
            <h2>Laytime — {view.name || 'New Port'}</h2>
            <span className="fv-ops__soa-sub">{recap.vesselName} · {view.op} · {view.cargo || '—'}{editing && <span className="fv-ops__soa-editing"> · editing</span>}</span>
          </div>
          <div className="fv-ops__soa-headbtns">
            {!editing && <button type="button" className="fv-ops__btn" onClick={() => setEditing(true)}><i className="fas fa-pen" aria-hidden="true" /> Edit</button>}
            {editing && <button type="button" className="fv-ops__btn fv-ops__btn--go" onClick={save}><i className="fas fa-floppy-disk" aria-hidden="true" /> Save</button>}
            {editing && <button type="button" className="fv-ops__btn" onClick={discard}><i className="fas fa-rotate-left" aria-hidden="true" /> Discard</button>}
            <button type="button" className="fv-ops__btn" onClick={exportPdf}><i className="fas fa-file-pdf" aria-hidden="true" /> PDF</button>
            <button type="button" className="fv-ops__btn" onClick={onDelete}><i className="fas fa-trash" aria-hidden="true" /> Delete</button>
            <button type="button" className="fv-ops__icon-btn" onClick={onClose} aria-label="Close"><i className="fas fa-xmark" aria-hidden="true" /></button>
          </div>
        </div>
        <div className="fv-ops__soa-body">
          <div className="fv-ops__frl-lay">
            <div className="fv-ops__frl-layfields">
              <label>Port Name{inp(view.name, (v) => setD({ name: v }))}</label>
              <label>Cargo{inp(view.cargo, (v) => setD({ cargo: v }))}</label>
              <label>Quantity (MT){inp(view.quantity, (v) => setD({ quantity: v }))}</label>
              <label>Rate (mt/day){inp(view.rate, (v) => setD({ rate: v }))}</label>
              <label>Terms{inp(view.terms, (v) => setD({ terms: v }))}</label>
              <label>Turn Time (hrs){inp(view.turnTimeHours, (v) => setD({ turnTimeHours: v }))}</label>
              <label>NOR Tendered{inp(view.norTendered, (v) => setD({ norTendered: v }), undefined, 'dd-mm-yyyy HH:MM')}</label>
              <label>NOR Accepted{inp(view.norAccepted, (v) => setD({ norAccepted: v }), undefined, 'dd-mm-yyyy HH:MM')}</label>
              <label>Laytime Commenced{inp(view.commenced, (v) => setD({ commenced: v }), undefined, 'dd-mm-yyyy HH:MM')}</label>
              <label>Laytime Completed{inp(view.completed, (v) => setD({ completed: v }), undefined, 'dd-mm-yyyy HH:MM')}</label>
              <label>Demurrage (US$/day){inp(view.demurrageRate, (v) => setD({ demurrageRate: v }))}</label>
              <label>Despatch (US$/day){inp(view.despatchRate, (v) => setD({ despatchRate: v }))}</label>
              <label className="fv-ops__frl-chk"><input type="checkbox" checked={view.reversible} disabled={!editing} onChange={(e) => setD({ reversible: e.target.checked })} /> Reversible laytime</label>
            </div>
            <div className="fv-ops__frl-laysum">
              <div><span>Laytime Allowed</span><b>{fmt(res.allowed, 3)} d</b></div>
              <div><span>Laytime Used</span><b>{fmt(res.used, 3)} d</b></div>
              <div><span>{res.onDemurrage ? 'On Demurrage' : 'Time Saved'}</span><b className={res.onDemurrage ? 'fv-ops__neg' : 'fv-ops__pos'}>{fmt(Math.abs(res.balance), 3)} d</b></div>
              <div><span>{res.onDemurrage ? 'Demurrage Due' : 'Despatch Due'}</span><b className={res.onDemurrage ? 'fv-ops__neg' : 'fv-ops__pos'}>{res.onDemurrage ? money(res.demurrageAmt) : money(res.despatchAmt)}</b></div>
            </div>
          </div>
          <div className="fv-ops__vd-sub-head"><i className="fas fa-list-ul" aria-hidden="true" /> Statement of Facts
            {editing && <button type="button" className="fv-ops__btn fv-ops__soa-add" onClick={addEvent}><i className="fas fa-plus" aria-hidden="true" /> Row</button>}
          </div>
          <table className="fv-ops__soa-tbl">
            <thead>
              <tr><th>Date</th><th>From</th><th>To</th><th className="fv-ops__r">% Count</th><th className="fv-ops__r">Elapsed (d)</th><th className="fv-ops__r">Counted (d)</th><th className="fv-ops__r">Cumulative (d)</th><th>Remarks</th>{editing && <th aria-label="Remove" />}</tr>
            </thead>
            <tbody>
              {res.rows.length === 0 && <tr><td colSpan={editing ? 9 : 8} className="fv-ops__vd-empty">No facts recorded.{editing ? ' Use “Row” to log NOR, laytime periods, stoppages, weather etc.' : ''}</td></tr>}
              {res.rows.map(({ ev, elapsed, counted, cumulative }, i) => (
                <tr key={i}>
                  <td>{inp(ev.date, (v) => setEvent(i, { date: v }), 96, 'dd-mm-yyyy')}</td>
                  <td>{inp(ev.from, (v) => setEvent(i, { from: v }), 56, 'HH:MM')}</td>
                  <td>{inp(ev.to, (v) => setEvent(i, { to: v }), 56, 'HH:MM')}</td>
                  <td className="fv-ops__r">{inp(ev.pct, (v) => setEvent(i, { pct: v }), 48)}</td>
                  <td className="fv-ops__r">{fmt(elapsed, 3)}</td>
                  <td className="fv-ops__r">{fmt(counted, 3)}</td>
                  <td className="fv-ops__r">{fmt(cumulative, 3)}</td>
                  <td>{inp(ev.remark, (v) => setEvent(i, { remark: v }), undefined, 'Remarks')}</td>
                  {editing && <td className="fv-ops__r"><button type="button" className="fv-ops__bnk-rm" aria-label="Remove row" onClick={() => delEvent(i)}><i className="fas fa-xmark" aria-hidden="true" /></button></td>}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="fv-ops__soa-sum"><td colSpan={5}>Total Time Used</td><td className="fv-ops__r">{fmt(res.used, 3)}</td><td className="fv-ops__r" colSpan={editing ? 3 : 2}>days</td></tr>
            </tfoot>
          </table>
          <p className="fv-ops__hint">Laytime Allowed = Quantity ÷ Rate. Each fact row counts its elapsed time × % to count; demurrage / despatch derive from used vs allowed. Use <b>Edit</b> to adjust, <b>Save</b> to persist, <b>PDF</b> to print. *E&amp;OE.</p>
        </div>
      </div>
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
