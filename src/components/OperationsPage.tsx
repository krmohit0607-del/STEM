import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { extractInvoiceDocument, type InvoiceDocumentKind, type InvoiceDocumentFields } from '../data/invoiceDocuments';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useSelectedVoyage, writeSelectedVoyageId } from '../data/selectedVoyage';
import type { Voyage } from '../data/voyages';
import { makeBlankVoyage, upsertCreatedVoyage } from '../data/voyages';
import { addNotification, copyLaytimeToPostfix, useCpdds, useFixtureNumbers } from '../data/workflow';
import { getWorkflowConfig } from '../data/workflowConfig';
import { loadClients, saveClients, useClients, SERVICE_PROVIDER_TYPES, clientToUpdateDto } from '../data/clients';
import { addBunkerRequirement, updateBunkerRequirement, useBunkerRequirements, type BunkerRequirement } from '../data/bunker';
import { addPayable, useAccountTxns } from '../data/accounts';
import { useWorldPorts, resolveWorldPort, type WorldPort } from '../data/ports';
import { classifyLoadLineZone } from '../data/loadLineZones';
import { loadVessels, saveVessels, useVessels } from '../data/vessels';
import { vesselsApi } from '../api/vesselsApi';
import { clientsApi } from '../api/clientsApi';
import { useCargoMaster, cargoStowageFactor } from '../data/cargoMaster';
import { loadOpsRecap, readOpsRecapRaw, writeOpsRecapRaw, subscribeOpsRecap, loadOpsEstBaseline, hydrateOpsRecap, hydrateOpsEstBaseline } from '../data/opsRecap';
import { diffRecap, appendConfigHistory, loadConfigHistory, hydrateConfigHistory, subscribeConfigHistory, type ConfigHistoryEntry } from '../data/opsConfigHistory';
import { loadVoyageShared, mergeVoyageShared, subscribeVoyageShared, hydrateVoyageShared, type VoyageSharedFields } from '../data/voyageOverrides';
import { NoVesselSelected } from './NoVesselSelected';
import { WorkflowStatusSelect } from './WorkflowStatusSelect';
import { LAYTIME_TERMS_OPTIONS, PORT_TYPE_OPTIONS } from '../data/estimationOptions';
import { EtaCalculation, RobCalculation } from './EtaRobCalculation';
import { VoyageEstimation } from './VoyageEstimation';
import { WeatherMargins } from './WeatherMargins';
import { ModuleVesselSearch } from './ModuleVesselSearch';
import { RichTextEditor } from './RichTextEditor';
import { VoyageTagsStrip } from './VoyageTagsStrip';
import { useFleetView } from '../context/FleetViewContext';

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

type TabId = 'details' | 'pnl' | 'etarob' | 'stowage' | 'hire' | 'freight' | 'reports' | 'notes' | 'costs';

export interface Recap {
  vesselName: string;
  vesselEmail: string;
  vesselImo?: string;
  vesselLoa?: string;
  vesselBeam?: string;
  /** No. of cargo holds — drives the Cargo & Stowage hold-wise distribution/capacity rows. */
  holdCount?: string;
  draftBallast?: string;
  draftLaden?: string;
  engineRpmMin?: string;
  engineRpmMax?: string;
  engineMcrMin?: string;
  engineMcrMax?: string;
  scrubberFitted?: string;
  scrubberType?: string;
  craneCount?: string;
  craneSwl?: string;
  craneSafeLimit?: string;
  grabCount?: string;
  grabWeight?: string;
  grabSafeLimit?: string;
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
  // True once the user has directly typed a redelivery date in Voyage Details — stops the
  // ETA & ROB itinerary's computed final arrival from overwriting it on every itinerary edit.
  redeliveryDateManual?: boolean;
  deliveryNotices: string;
  wxClause: string;
  ilohc: string;
  cve: string;
  adcom: string;
  brokerage: string;
  pniClub: string;
  arbitrationPlace: string;
  governingLaw: string;
  sanctionsClause: string;
  ballastBonus: string;
  redeliveryNotices: string;
  hullCleaningClause: string;
  cargoName: string;
  cpQuantity: string;
  cpQuantityOption: string; // 'OO' | 'CHOPT' | 'MIN' | 'MAX' | 'RANGE' | 'PERCENT'
  cpQuantityMin?: string; // For MIN/MAX range
  cpQuantityMax?: string; // For MIN/MAX range
  cpQuantityTolerancePct?: string; // For +/- percentage tolerance (e.g. '5', '10')
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
  cpConsByFuel?: Record<string, string>;
  // --- units (redesigned Voyage Details) ---------------------------------
  hireCurrency: string;
  freightCurrency: string;
  cargoQtyUnit: string;
  charterHirePerDay: string;
  charterHireCurrency: string;
  // --- hire payment schedule ---------------------------------------------
  firstHirePeriodDays: string;
  firstHireInclude: string;
  firstHireDays: string;
  firstHireBasis: string;
  hireEveryDays: string;
  charterFirstHirePeriodDays: string;
  charterFirstHireInclude: string;
  charterFirstHireDays: string;
  charterFirstHireBasis: string;
  charterHireEveryDays: string;
  // --- hire payment workflow (per installment: status + ballast + off-hire) -----
  hirePayState: Record<string, HirePayEntry>;
  charterHirePayState: Record<string, HirePayEntry>;
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
  charterHireDuplicates?: HireDuplicate[];
  // --- Persisted snapshot of the live hire schedule (dates/amounts/due per installment) —
  // refreshed on every save for non-locked rows, frozen for locked rows; feeds backend reporting.
  hireScheduleSnapshot?: HireScheduleRow[];
  charterHireScheduleSnapshot?: HireScheduleRow[];
  // --- Estimated voyage cash flow (Voyage Details tab) --------------------
  cashflow?: CashflowData;
  // --- Vessel reports (Vessel Reports tab) -------------------------------
  vesselReports?: VesselReport[];
  notes?: string;
  additionalVoyageLegs?: { id: string; type: string; port: string; term: string; rate: string; pda: string; dateTime: string; notice: string; loi: string; loiStatus: string }[];
  portRotationTypes?: Record<string, string>;
  portRotationDeleted?: Record<string, boolean>;
  // Generic field storage used when a port-rotation row's Type is switched away
  // from its native role (e.g. a Discharge row set to ReDelivery) — keyed the
  // same as portRotationTypes so the row's own fields don't get overwritten.
  portRotationOverrides?: Record<string, { term?: string; dateTime?: string; rate?: string; pda?: string; notice?: string; loi?: string; loiStatus?: string; qty?: string; qtyUnit?: string; blDate?: string }>;
  dischargePortDetails?: { loiObl: string; loiStatus: string }[];
  // --- EU ETS allowance records (Freight & Laytime tab) ------------------
  eua?: EuaData;
}

/** One deadweight/cargo-intake calculation column (a port or load-line zone). */
interface StowagePoint {
  name: string;
  displacement: string;
  /** True while Displacement is still auto-derived from Max Draft × TPC (unset by a manual edit). */
  displacementAuto?: boolean;
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
  // Single voyage-wide Constants & Fresh Water (MT) — applied to every zone/port column in
  // the DWT & Cargo Intake table instead of entering them per column.
  constants: string;
  freshWater: string;
  ballastWater: string;
  /** Reference displacement (MT) — used with TPC & reference draft (density-correction card)
   *  to derive each zone/port's Displacement (Max) from its Max Draft. Falls back to the
   *  density-correction card's "Displacement @ SW Density" if left blank. */
  refDisplacement: string;
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
  /** True while SF is still auto-filled from the Cargo Master database match (unset by a manual SF edit). */
  sfAuto?: boolean;
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
  /** Ship/shore qty mismatch threshold (%) that flags an LOI — editable, defaults to 0.5. */
  loiTolerancePct: string;
}

/** One itinerary leg (a sea passage or a port stay) in the ETA & ROB plan. */
export interface EtaLeg {
  from: string;
  to: string;
  kind: 'sea' | 'port';
  type?: string;           // leg type (Ballast / Laden / Loading / Discharging / …)
  distNonEca: string;
  distEca: string;
  speed: string;
  wf: string;
  portDays: string;
  /** True when a port-kind leg's port is within an ECA zone (switches its idle Cons to the ECA rate). */
  ecaPort?: boolean;
  consVlsfo: string;
  consMgo: string;
  supVlsfo: string;
  supMgo: string;
  tz: string;
  /** True while TZ is still auto-derived from the To port (unset by a manual TZ edit; reset to true when To changes). */
  tzAuto?: boolean;
  /** True while Cons (MT/day) is still auto-blended from the Normal/ECA rates by this leg's ECA distance fraction
   *  (unset by a manual Cons edit; reset to true when distNonEca/distEca changes). */
  consAuto?: boolean;
  /** Extra fuel-type daily consumption / supply for this leg, keyed by EtaExtraFuel.id. */
  extraCons?: Record<string, string>;
  extraSup?: Record<string, string>;
}

/** ETA & ROB plan header (instructed figures) + the leg list. */
export interface EtaPlan {
  startDep: string;
  startRobVlsfo: string;
  startRobMgo: string;
  /** Starting (bunkers-on-delivery) ROB for each extra fuel type, keyed by EtaExtraFuel.id. */
  startRobExtra?: Record<string, string>;
  weatherMargin: string;
  perf: EtaPerf;
  legs: EtaLeg[];
}

/** Speed & consumption profile — mirrors the Chartering estimation vessel details. */
export interface EtaMainCons { type: string; ballast: string; laden: string; idle: string; work: string }
export interface EtaSubCons { type: string; sea: string; idle: string; work: string }
export interface EtaSpeedSet { ballast: string; laden: string }
export interface EtaCustomSpeed extends EtaSpeedSet { id: string; name: string }
/** A user-added extra fuel type (beyond the default FO/DO) — Normal + ECA consumption per speed mode. */
interface EtaExtraFuel {
  id: string;
  grade: string;
  fullNormal: EtaMainCons;
  fullEca: EtaMainCons;
  ecoNormal: EtaMainCons;
  ecoEca: EtaMainCons;
  customNormal: EtaMainCons;
  customEca: EtaMainCons;
}
export interface EtaPerf {
  speedMode: string;
  full: EtaSpeedSet;
  eco: EtaSpeedSet;
  customs: EtaCustomSpeed[];
  fullMainNormal?: EtaMainCons;
  fullMainEca?: EtaMainCons;
  fullSubNormal?: EtaSubCons;
  fullSubEca?: EtaSubCons;
  ecoMainNormal?: EtaMainCons;
  ecoMainEca?: EtaMainCons;
  ecoSubNormal?: EtaSubCons;
  ecoSubEca?: EtaSubCons;
  customMainNormal?: EtaMainCons;
  customMainEca?: EtaMainCons;
  customSubNormal?: EtaSubCons;
  customSubEca?: EtaSubCons;
  mainNormal: EtaMainCons;
  mainEca: EtaMainCons;
  subNormal: EtaSubCons;
  subEca: EtaSubCons;
  /** Additional fuel types the user has added (e.g. a 3rd fuel grade). */
  extraFuels?: EtaExtraFuel[];
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
  specs: string;
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
  accountName?: string;    // account the laytime is prepared in favour of
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
  calcMethod?: 'counting' | 'deduction'; // time-counting (default) or deduction method
  onceOnDemurrage?: boolean;             // once on demurrage, always on demurrage (all time counts)
  demurrageRate: string;   // USD / day
  despatchRate: string;    // USD / day
  demurrageStarts?: string;
  voyageFieldOverrides?: string[];
  events: LaytimeEvent[];
  status?: HireStatus;
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
  status: string;
  workflowStatus?: HireStatus;
  paymentStatus?: string;
  paymentStatusManual?: boolean;
  freightType: 'Initial' | 'Final';
  freightDifferential: string; // extra freight rate per MT (final invoice)
  pctFreightDue: string;       // % of total freight due (e.g. 90 or 100)
  initialFreightReceived: string;
  includeDemurrage: boolean;   // fold demurrage/despatch into a final freight invoice
  adjustments?: FreightInvoiceAdjustment[];
  includedPortOps?: ('Load' | 'Discharge')[];
  // Manual overrides (blank = fall back to the voyage recap figure).
  blQtyOverride?: string;      // cargo / B-L quantity (MT)
  freightRateOverride?: string; // freight rate per MT
  adcomOverride?: string;      // address commission (%)
  claimIds?: string[];
  attachments?: SettlementAttachment[];
}

interface FreightInvoiceAdjustment {
  id: string;
  description: string;
  amount: string;
  direction: 'Add' | 'Deduct';
}

interface FreightLaytimeData {
  invoices: FreightInvoice[];
  laytimes: LaytimePort[];
  settlement?: FreightSettlementData;
}

interface SettlementAttachment {
  id: string;
  name: string;
  sizeKb: number;
  at: string;
}

const SETTLEMENT_STATUS_OPTIONS = ['Requested', 'Received', 'Under Review', 'Approved', 'Settled'];
const PAYMENT_STATUS_OPTIONS = ['Pending', 'Paid', 'Partially Paid'];
const STATUS_OPTIONS_PDA = SETTLEMENT_STATUS_OPTIONS;
const STATUS_OPTIONS_AGENT_SERVICE = SETTLEMENT_STATUS_OPTIONS;
const STATUS_OPTIONS_CLAIMS = ['Raised', 'Received', 'Under Review', 'Approved', 'Settled'];
const settlementStatusValue = (value: string | undefined, fallback = 'Requested') => value && SETTLEMENT_STATUS_OPTIONS.includes(value) ? value : fallback;
const claimStatusValue = (value: string | undefined): string => value && STATUS_OPTIONS_CLAIMS.includes(value) ? value : 'Raised';
const settlementPaymentValue = (value: string | undefined) => value && PAYMENT_STATUS_OPTIONS.includes(value) ? value : 'Pending';
const CLAIM_CHARGE_TO_OPTIONS = ['Owners', 'Charterers', 'Agents', 'Surveyor', 'Receiver', 'Shipper', 'P&I Club', 'Terminal'];

interface PdaRow {
  id: string;
  port: string;
  agent: string;
  due?: string;
  currency: string;
  estimated: number;
  advance: number;
  fdaFinal: number;
  status: string;
  fdaStatus?: string;
  paymentStatus?: string;
  workflowStatus?: HireStatus;
  approval: string;
  attachments?: SettlementAttachment[];
}

interface AgentInvoiceRow {
  id: string;
  invoiceNo: string;
  vendor: string;
  category: string;
  port: string;
  due: string;
  currency: string;
  amount: number;
  approved: number;
  paid: number;
  dept: string;
  accounts: string;
  status: string;
  paymentStatus?: string;
  workflowStatus?: HireStatus;
  attachments?: SettlementAttachment[];
}

interface ServiceRow {
  id: string;
  service: string;
  vendor: string;
  invoice: string;
  currency: string;
  cost: number;
  tax: number;
  reason: string;
  status: string;
  paymentStatus?: string;
  workflowStatus?: HireStatus;
  attachments?: SettlementAttachment[];
}

interface ClaimRow {
  id: string;
  type: string;
  reference: string;
  chargeTo?: string;
  owner?: string; // legacy key kept for backward compatibility
  due?: string;
  currency: string;
  amount: number;
  settlement: number;
  status: string;
  paymentStatus?: string;
  workflowStatus?: HireStatus;
  attachments?: SettlementAttachment[];
}

interface FreightSettlementData {
  pda: PdaRow[];
  agentInvoices: AgentInvoiceRow[];
  services: ServiceRow[];
  claims: ClaimRow[];
}

/** One inward (receivable) or outward (payable) line in the voyage cash flow. */
interface CashflowRow { id: string; date: string; label: string; amount: string }
interface CashflowData { receivables: CashflowRow[]; payables: CashflowRow[] }

/** EU ETS allowance (EUA) records — per-leg emission calc + a bought/used ledger. */
interface EuaLeg { id: string; from: string; to: string; fuel: string; cons: string; emissionFactor: string; phasePct: string }
interface EuaLedgerRow { id: string; date: string; type: string; qty: string; rate: string }
interface EuaData { phaseInPct: string; legs: EuaLeg[]; ledger: EuaLedgerRow[] }

/** One vessel report row (SBE / noon / EOSP / shifting / bunker etc.). */
interface VesselReport {
  id: string;
  type: string;          // report type
  shiftSub: string;      // shifting sub-type (used when type is a shifting report)
  dtUtc: string;         // date-time UTC (dd-mm-yyyy HH:MM)
  dtLt: string;          // date-time local time
  duration: string;      // hours since last report
  position: string;
  avgSpdGps: string;     // avg speed — GPS (kn)
  avgSpdLog: string;     // avg speed — LOG (kn)
  distSinceLast: string; // distance sailed since last report (nm)
  distTotal: string;     // total distance sailed (nm)
  robFo: string;         // ROB fuel oil (MT)
  robDo: string;         // ROB diesel oil (MT)
  consFo: string;        // FO consumed since last report (MT)
  consDo: string;        // DO consumed since last report (MT)
  rpm: string;
  mcr: string;           // % MCR
  slip: string;          // slip percentage
  weather: string;       // winds / waves / currents
  remarks: string;
}

/** Recap keys whose value is a plain string (everything except arrays). */
type RecapTextKey = Exclude<keyof Recap, 'serviceProviders' | 'bunkers' | 'pnlNotes' | 'etaPlan' | 'stowage' | 'hirePayState' | 'charterHirePayState' | 'freightLaytime' | 'hireDuplicates' | 'charterHireDuplicates' | 'hireScheduleSnapshot' | 'charterHireScheduleSnapshot' | 'cashflow' | 'vesselReports' | 'notes' | 'eua' | 'additionalVoyageLegs' | 'portRotationTypes' | 'portRotationDeleted' | 'portRotationOverrides' | 'dischargePortDetails' | 'cpConsByFuel' | 'redeliveryDateManual'>;

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

interface DuePopupItem {
  id: string;
  text: string;
  level: 'info' | 'warn' | 'alert';
}

const OPS_DUE_POPUP_SNOOZE_MS = 3 * 60 * 60 * 1000;

/* ---------------------------------------------------------------- helpers */

function num(v: string | null | undefined): number {
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
export function parseDMY(s: string): Date | null {
  const m = s.match(/(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0));
}
function daysBetween(a: Date | null, b: Date | null): number {
  if (!a || !b) return 0;
  return Math.max(0, (b.getTime() - a.getTime()) / 86_400_000);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayDiffFromNow(target: Date, now: Date): number {
  const ms = startOfDay(target).getTime() - startOfDay(now).getTime();
  return Math.round(ms / 86_400_000);
}

function fmtShortDate(d: Date): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()}`;
}

function parseFlexibleDate(raw: string): Date | null {
  const dmy = parseDMY(raw);
  if (dmy) return dmy;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t) : null;
}

function parseNoticeDays(raw: string): number[] {
  return Array.from(
    new Set(
      (raw || '')
        .split(/[^\d]+/)
        .map((x) => parseInt(x, 10))
        .filter((n) => Number.isFinite(n) && n >= 0),
    ),
  ).sort((a, b) => b - a);
}

function addDaysDate(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function addBankingDaysDate(d: Date, n: number): Date {
  const out = new Date(d);
  let added = 0;
  while (added < n) {
    out.setDate(out.getDate() + 1);
    const dow = out.getDay();
    if (dow !== 0 && dow !== 6) added += 1;
  }
  return out;
}

function moveOffWeekendDate(d: Date): Date {
  const out = new Date(d);
  const dow = out.getDay();
  if (dow === 0) out.setDate(out.getDate() - 2);
  else if (dow === 6) out.setDate(out.getDate() - 1);
  return out;
}

function readDuePopupSnoozeMap(storageKey: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeDuePopupSnoozeMap(storageKey: string, map: Record<string, number>): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    // ignore storage write failures
  }
}

function buildDuePopupItems(recap: Recap, pnl: Pnl, voyage: Voyage, now: Date): DuePopupItem[] {
  const out: DuePopupItem[] = [];
  const pushDue = (id: string, label: string, dueDateRaw: string, baseLevel: Alert['level'] = 'warn') => {
    const due = parseFlexibleDate(dueDateRaw);
    if (!due) return;
    const diff = dayDiffFromNow(due, now);
    if (diff !== 0 && diff !== 1) return;
    const when = diff === 0 ? 'today' : 'tomorrow';
    out.push({
      id: `${id}|${fmtShortDate(due)}`,
      text: `${label} is due ${when} (${fmtShortDate(due)}).`,
      level: diff === 0 ? 'alert' : baseLevel,
    });
  };

  const deliveryDt = parseDMY(recap.deliveryDateTime);
  const redeliveryDt = parseDMY(recap.redeliveryDateTime);
  const deliveryNoticeDays = parseNoticeDays(recap.deliveryNotices);
  const redeliveryNoticeDays = parseNoticeDays(recap.redeliveryNotices);
  if (deliveryDt) {
    deliveryNoticeDays.forEach((d) => {
      const due = addDaysDate(deliveryDt, -d);
      pushDue(`notice:delivery:${d}`, `Delivery notice (${d}-day)`, fmtShortDate(due), 'info');
    });
  }
  if (redeliveryDt) {
    redeliveryNoticeDays.forEach((d) => {
      const due = addDaysDate(redeliveryDt, -d);
      pushDue(`notice:redelivery:${d}`, `Redelivery notice (${d}-day)`, fmtShortDate(due), 'info');
    });
  }

  const start = parseDMY(recap.deliveryDateTime);
  if (start) {
    const firstPeriod = Math.max(1, num(recap.firstHirePeriodDays) || 15);
    const dueBank = Math.max(0, num(recap.firstHireDays) || 3);
    const subPeriod = Math.max(1, num(recap.hireEveryDays) || 15);
    let covered = 0;
    let n = 1;
    while (covered < pnl.days - 0.01 && n <= 200) {
      const key = String(n);
      const state = recap.hirePayState[key];
      const deleted = state?.deleted === true;
      const status = state?.status || 'Draft';
      const periodLen = n === 1 ? firstPeriod : subPeriod;
      const days = Math.min(periodLen, pnl.days - covered);
      const from = addDaysDate(start, covered);
      const duePre = n === 1 ? addBankingDaysDate(start, dueBank) : from;
      const due = moveOffWeekendDate(duePre);
      if (!deleted && status !== 'Paid & Locked') {
        pushDue(`hire:${key}`, `${ordinal(n)} hire payment`, fmtShortDate(due), 'warn');
      }
      covered += days;
      n += 1;
    }
  }

  const voyageType = (recap.voyageFixType || '').toUpperCase();
  const [inType = '', outType = ''] = voyageType.split('-');
  const dualTimeCharter = (inType === 'TCIN' || inType === 'TCTIN') && (outType === 'TCOUT' || outType === 'TCTOUT');
  if (start && dualTimeCharter) {
    const firstPeriod = Math.max(1, num(recap.charterFirstHirePeriodDays) || 15);
    const dueBank = Math.max(0, num(recap.charterFirstHireDays) || 3);
    const subPeriod = Math.max(1, num(recap.charterHireEveryDays) || 15);
    let covered = 0;
    let n = 1;
    while (covered < pnl.days - 0.01 && n <= 200) {
      const periodLen = n === 1 ? firstPeriod : subPeriod;
      const days = Math.min(periodLen, pnl.days - covered);
      const from = addDaysDate(start, covered);
      const duePre = n === 1 ? addBankingDaysDate(start, dueBank) : from;
      const due = moveOffWeekendDate(duePre);
      pushDue(`hire-charter:${n}`, `${ordinal(n)} charterers hire payment`, fmtShortDate(due), 'warn');
      covered += days;
      n += 1;
    }
  }

  const stored = recap.freightLaytime;
  const valid = !!stored && Array.isArray(stored.invoices) && Array.isArray(stored.laytimes);
  const fl = valid ? (stored as FreightLaytimeData) : seedFreightLaytime(recap);
  const settlement = fl.settlement ?? seedFreightSettlement(voyage, recap);

  fl.invoices.forEach((inv) => {
    if (!inv.dueDate || inv.status === 'Paid') return;
    const label = `${inv.kind === 'Freight' ? 'Freight' : 'Demurrage'} invoice ${inv.invoiceNo || ''}`.trim();
    pushDue(`freight:${inv.id}`, label, inv.dueDate, 'warn');
  });

  settlement.agentInvoices.forEach((inv) => {
    if (!inv.due) return;
    const outstanding = (inv.approved || inv.amount) - inv.paid;
    if (outstanding <= 0) return;
    if (/closed|settled/i.test(inv.status) || /paid/i.test(inv.accounts)) return;
    pushDue(`agent:${inv.id}`, `Agent invoice ${inv.invoiceNo || ''}`.trim(), inv.due, 'warn');
  });

  settlement.pda.forEach((p) => {
    if (!p.due) return;
    const expected = p.fdaFinal > 0 ? p.fdaFinal : p.estimated;
    const outstanding = expected - p.advance;
    if (outstanding <= 0) return;
    if (/closed/i.test(p.status)) return;
    pushDue(`pda:${p.id}`, `PDA payment ${p.port || ''}`.trim(), p.due, 'warn');
  });

  settlement.claims.forEach((c) => {
    if (!c.due) return;
    if (claimOutstanding(c) <= 0) return;
    if (/settled|closed|rejected/i.test(c.status)) return;
    const ref = c.reference || c.type || 'Claim';
    pushDue(`claim:${c.id}`, `Claim settlement ${ref}`, c.due, 'warn');
  });

  return out;
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
  const sea = (from: string, to: string, type = 'Laden'): EtaLeg => ({ from, to, kind: 'sea', type, distNonEca: '0', distEca: '0', speed: d.speed, wf: d.wf, portDays: '', consVlsfo: d.seaV, consMgo: d.seaM, supVlsfo: '', supMgo: '', tz: d.tz });
  const port = (p: string, type = 'Loading'): EtaLeg => ({ from: p, to: p, kind: 'port', type, distNonEca: '0', distEca: '0', speed: '', wf: '', portDays: '1', consVlsfo: d.portV, consMgo: d.portM, supVlsfo: '', supMgo: '', tz: d.tz });
  const loadPorts = splitPorts(load);
  const dischPorts = splitPorts(disch);
  const firstLoad = loadPorts[0] || load || delivery;
  const legs: EtaLeg[] = [];
  legs.push(sea(`Delivery — ${delivery || firstLoad}`, firstLoad, 'Ballast'));
  loadPorts.forEach((lp, idx) => {
    if (idx > 0) legs.push(sea(loadPorts[idx - 1], lp));
    legs.push(port(lp, 'Loading'));
  });
  let prev = loadPorts[loadPorts.length - 1] || firstLoad;
  dischPorts.forEach((dp) => {
    legs.push(sea(prev, dp));
    legs.push(port(dp, 'Discharging'));
    prev = dp;
  });
  legs.push(sea(prev, `Redelivery — ${redelivery || prev}`));
  return legs;
}

/** Strip a "Delivery — "/"Redelivery — " prefix and any trailing "<Country>"/"(Country)" tag off a leg's from/to label. */
function bareportName(v: string): string {
  const idx = v.indexOf('—');
  const rest = idx >= 0 ? v.slice(idx + 1) : v;
  return rest.replace(/[<(][^<>()]*[>)]\s*$/, '').trim();
}

/** Resolve a leg's To/From label to a world port — exact match first, then a loose substring match. */
function matchWorldPort(value: string, ports: WorldPort[]): WorldPort | null {
  const bare = bareportName(value);
  const exact = resolveWorldPort(bare, ports);
  if (exact) return exact;
  const q = bare.toLowerCase();
  if (q.length < 3) return null;
  return ports.find((p) => { const n = p.name.toLowerCase(); return n === q || n.includes(q) || q.includes(n); }) ?? null;
}

/** Derive a signed UTC-offset string (e.g. "+5.5", "-3", "+0") from a port's longitude. */
function tzFromLon(lon: number): string {
  const off = Math.round((lon / 15) * 2) / 2;
  if (off === 0) return '+0';
  return off > 0 ? `+${off}` : `${off}`;
}

/** Resolve the active speed set from the selected speed mode (Full / Eco / custom). */
export function resolveEtaSpeed(perf: EtaPerf): EtaSpeedSet {
  if (perf.speedMode === 'Full') return perf.full;
  if (perf.speedMode === 'Eco') return perf.eco;
  return perf.customs.find((c) => c.id === perf.speedMode) ?? perf.full;
}

/** Resolve the selected Full, Eco, or Custom consumption profile — including any extra fuel types added. */
export function resolveEtaConsumption(perf: EtaPerf): { mainNormal: EtaMainCons; mainEca: EtaMainCons; subNormal: EtaSubCons; subEca: EtaSubCons; extraFuels: { id: string; grade: string; normal: EtaMainCons; eca: EtaMainCons }[] } {
  const extraFuels = (perf.extraFuels ?? []).map((f) => ({
    id: f.id,
    grade: f.grade,
    normal: perf.speedMode === 'Eco' ? f.ecoNormal : perf.speedMode === 'Full' ? f.fullNormal : f.customNormal,
    eca: perf.speedMode === 'Eco' ? f.ecoEca : perf.speedMode === 'Full' ? f.fullEca : f.customEca,
  }));
  if (perf.speedMode === 'Eco') {
    return {
      mainNormal: perf.ecoMainNormal ?? perf.mainNormal,
      mainEca: perf.ecoMainEca ?? perf.mainEca,
      subNormal: perf.ecoSubNormal ?? perf.subNormal,
      subEca: perf.ecoSubEca ?? perf.subEca,
      extraFuels,
    };
  }
  if (perf.speedMode !== 'Full') {
    return {
      mainNormal: perf.customMainNormal ?? perf.mainNormal,
      mainEca: perf.customMainEca ?? perf.mainEca,
      subNormal: perf.customSubNormal ?? perf.subNormal,
      subEca: perf.customSubEca ?? perf.subEca,
      extraFuels,
    };
  }
  return {
    mainNormal: perf.fullMainNormal ?? perf.mainNormal,
    mainEca: perf.fullMainEca ?? perf.mainEca,
    subNormal: perf.fullSubNormal ?? perf.subNormal,
    subEca: perf.fullSubEca ?? perf.subEca,
    extraFuels,
  };
}


/** Per-leg defaults derived from the instructed speed & consumption profile. */
function legDefaults(perf: EtaPerf): { speed: string; seaV: string; seaM: string; portV: string; portM: string; extra: Record<string, { sea: string; port: string }> } {
  const spd = resolveEtaSpeed(perf);
  const cons = resolveEtaConsumption(perf);
  const extra: Record<string, { sea: string; port: string }> = {};
  cons.extraFuels.forEach((f) => { extra[f.id] = { sea: f.normal.laden || '0', port: f.normal.idle || '0' }; });
  return {
    speed: spd.laden || spd.ballast || '12',
    seaV: cons.mainNormal.laden || '0',
    seaM: cons.subNormal.sea || '0',
    // Main/FO does not apply at port (only DO/auxiliary generators run) — see blendedLegCons.
    portV: '0',
    portM: cons.subNormal.idle || '0',
    extra,
  };
}

/** A leg's ECA fraction (0 = all Non-ECA, 1 = all ECA). Sea legs: distEca share of the leg's
 *  distance. Port legs: 1 when the port itself is flagged as being inside an ECA zone, else 0. */
function legEcaFrac(l: EtaLeg): number {
  if (l.kind !== 'sea') return l.ecaPort ? 1 : 0;
  const total = num(l.distNonEca) + num(l.distEca);
  return total > 0 ? Math.min(1, num(l.distEca) / total) : 0;
}

/** Where the ECA-zone "orphan" consumption shares (Main-ECA when its type differs from Main-Normal,
 *  Sub-ECA when its type differs from Sub-Normal) physically belong: if an orphan's grade matches the
 *  OTHER slot's own Normal type, it's the SAME tank as that built-in column and folds straight into it
 *  (e.g. Main-ECA = MDO and Sub-Normal is already MDO ⇒ fold into the Sub/DO column, no extra column);
 *  if both orphans share a grade (and neither folds into a built-in column), they're merged into one
 *  `auto-eca-main` entry; otherwise each orphan gets its own dedicated auto column. */
function ecaFuelRouting(cons: { mainNormal: EtaMainCons; mainEca: EtaMainCons; subNormal: EtaSubCons; subEca: EtaSubCons }) {
  const eq = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();
  const mainSplit = cons.mainNormal.type !== cons.mainEca.type;
  const subSplit = cons.subNormal.type !== cons.subEca.type;
  const mainEcaFoldsIntoSub = mainSplit && eq(cons.mainEca.type, cons.subNormal.type);
  const subEcaFoldsIntoMain = subSplit && !mainEcaFoldsIntoSub && eq(cons.subEca.type, cons.mainNormal.type);
  const mergeEca = mainSplit && subSplit && !mainEcaFoldsIntoSub && !subEcaFoldsIntoMain && eq(cons.mainEca.type, cons.subEca.type);
  const needsAutoMain = mainSplit && !mainEcaFoldsIntoSub && !mergeEca;
  const needsAutoSub = subSplit && !subEcaFoldsIntoMain && !mergeEca;
  return { mainSplit, subSplit, mainEcaFoldsIntoSub, subEcaFoldsIntoMain, mergeEca, needsAutoMain, needsAutoSub };
}

/** Which ETA & ROB Itinerary "starting ROB" field a fuel grade corresponds to (Main/Sub/extra) — used
 *  to keep the Bunkers card's "Bunkers on Delivery" and the Itinerary's own BOD fields for the same
 *  fuel always in sync, in either direction. */
function startRobFieldFor(perf: EtaPerf, grade: string): { kind: 'main' | 'sub' | 'extra'; extraId?: string } | null {
  const cons = resolveEtaConsumption(perf);
  const g = grade.trim().toUpperCase();
  if (g === cons.mainNormal.type.trim().toUpperCase()) return { kind: 'main' };
  if (g === cons.subNormal.type.trim().toUpperCase()) return { kind: 'sub' };
  const match = cons.extraFuels.find((f) => f.grade.trim().toUpperCase() === g);
  if (match) return { kind: 'extra', extraId: match.id };
  return null;
}

/** CP Price for a fuel grade — Main/Sub fuels mirror the single recap.foPrice/doPrice field (the
 *  same single source of truth shared by the Bunkers card, the Owners "Bunker Settlement" table and
 *  the Hire SOA popup's Bunker on Delivery price); other (extra) fuels use their own per-row cpPrice. */
function cpPriceFor(recap: Recap, fuel: string): string {
  const field = startRobFieldFor(recap.etaPlan.perf, fuel);
  if (field?.kind === 'main') return recap.foPrice;
  if (field?.kind === 'sub') return recap.doPrice;
  return recap.bunkers.find((b) => b.fuel === fuel)?.cpPrice ?? '';
}

/** Apply a CP Price edit made on a bunkers-row: always updates that row's own `cpPrice`, and
 *  additionally mirrors into recap.foPrice/doPrice when the grade is the Main/Sub fuel. */
function applyCpPriceEdit(r: Recap, index: number, value: string): Recap {
  const bunkers = r.bunkers.map((b, i) => (i === index ? { ...b, cpPrice: value } : b));
  const field = startRobFieldFor(r.etaPlan.perf, r.bunkers[index]?.fuel ?? '');
  if (field?.kind === 'main') return { ...r, bunkers, foPrice: value };
  if (field?.kind === 'sub') return { ...r, bunkers, doPrice: value };
  return { ...r, bunkers };
}

/** Apply a recap.foPrice/doPrice edit (e.g. from the Hire SOA popup) back onto the matching
 *  Main/Sub bunkers rows, by fuel-grade match rather than a hardcoded "VLSFO"/"MGO" name. */
function applyGlobalBunkerPrices(r: Recap, foPrice: string, doPrice: string): Recap {
  const bunkers = r.bunkers.map((b) => {
    const field = startRobFieldFor(r.etaPlan.perf, b.fuel);
    if (field?.kind === 'main') return { ...b, cpPrice: foPrice };
    if (field?.kind === 'sub') return { ...b, cpPrice: doPrice };
    return b;
  });
  return { ...r, bunkers };
}

/** Daily Cons (MT/day) for a leg, blending the Normal and ECA rates by its ECA distance fraction
 *  (sea legs use the ballast/laden rate — whichever matches the leg's own Type — or the idle rate at
 *  port). At port, only DO (Sub fuel, via auxiliary generators) is consumed — Main/FO does not apply
 *  at all in port, ECA or not — so the Main column is always 0 there. When the Normal and ECA fuel
 *  TYPE differ (e.g. VLSFO outside ECA, MDO inside), the main/sub column only carries the Non-ECA-rate
 *  share — the ECA-zone share is routed per `ecaFuelRouting` (folded into the Main/Sub column if it's
 *  really the same tank, merged with the other slot's ECA share if they match each other, or tracked
 *  under its own `auto-eca-main`/`auto-eca-sub` extra-fuel entry) — see the ECA-fuel-split sync
 *  effect. */
export function blendedLegCons(perf: EtaPerf, l: EtaLeg): { v: string; m: string; extra: Record<string, string> } {
  const cons = resolveEtaConsumption(perf);
  const frac = legEcaFrac(l);
  const isBallast = l.type === 'Ballast';
  const seaRate = (m: EtaMainCons) => (isBallast ? m.ballast : m.laden);
  const blendSea = (normal: EtaMainCons, eca: EtaMainCons) => String(num(seaRate(normal)) * (1 - frac) + num(seaRate(eca)) * frac);
  const blendIdle = (normal: string, eca: string) => String(num(normal) * (1 - frac) + num(eca) * frac);
  const route = ecaFuelRouting(cons);
  const isPort = l.kind !== 'sea';
  const mainEcaShare = (!route.mainSplit || isPort) ? 0 : num(seaRate(cons.mainEca)) * frac;
  const subEcaShare = !route.subSplit ? 0 : (isPort ? num(cons.subEca.idle) * frac : num(cons.subEca.sea) * frac);
  let v = isPort
    ? 0
    : (route.mainSplit ? num(seaRate(cons.mainNormal)) * (1 - frac) : num(seaRate(cons.mainNormal)) * (1 - frac) + num(seaRate(cons.mainEca)) * frac);
  let m = isPort
    ? (route.subSplit ? num(cons.subNormal.idle) * (1 - frac) : num(cons.subNormal.idle) * (1 - frac) + num(cons.subEca.idle) * frac)
    : (route.subSplit ? num(cons.subNormal.sea) * (1 - frac) : num(cons.subNormal.sea) * (1 - frac) + num(cons.subEca.sea) * frac);
  if (route.mainEcaFoldsIntoSub) m += mainEcaShare;
  if (route.subEcaFoldsIntoMain) v += subEcaShare;
  const extra: Record<string, string> = {};
  if (route.mergeEca) extra['auto-eca-main'] = String(mainEcaShare + subEcaShare);
  else if (route.needsAutoMain) extra['auto-eca-main'] = String(mainEcaShare);
  else if (route.needsAutoSub) extra['auto-eca-sub'] = String(subEcaShare);
  cons.extraFuels.forEach((f) => {
    if (f.id === 'auto-eca-main' || f.id === 'auto-eca-sub') return;
    extra[f.id] = l.kind === 'sea' ? blendSea(f.normal, f.eca) : blendIdle(f.normal.idle, f.eca.idle);
  });
  return { v: String(v), m: String(m), extra };
}

/** Itinerary column header for an extra fuel — plain grade name, no "ECA-" prefix. */
function extraFuelLabel(f: { id: string; grade: string }): string {
  return f.grade;
}

interface EtaComputedLeg { dep: Date | null; arr: Date | null; arrLt: Date | null; dist: number; avgSpeed: number; days: number; usedV: number; usedM: number; robV: number; robM: number; extraUsed: Record<string, number>; extraRob: Record<string, number> }

/** Sequential ETA/ROB projection: DEP = previous ARR; ROB carried forward per leg. */
function projectEtaLegs(plan: EtaPlan): EtaComputedLeg[] {
  let cursor = parseDMY(plan.startDep);
  let robV = num(plan.startRobVlsfo);
  let robM = num(plan.startRobMgo);
  const extraIds = (plan.perf?.extraFuels ?? []).map((f) => f.id);
  const robExtra: Record<string, number> = {};
  extraIds.forEach((id) => { robExtra[id] = num(plan.startRobExtra?.[id]); });
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
    const extraUsed: Record<string, number> = {};
    const extraRob: Record<string, number> = {};
    extraIds.forEach((id) => {
      const used = num(l.extraCons?.[id]) * days;
      extraUsed[id] = used;
      robExtra[id] = robExtra[id] - used + num(l.extraSup?.[id]);
      extraRob[id] = robExtra[id];
    });
    cursor = arr;
    return { dep, arr, arrLt, dist, avgSpeed, days, usedV, usedM, robV, robM, extraUsed, extraRob };
  });
}

/** Final projected ROB at the end of the itinerary (VLSFO / LSMGO / extra fuel types). */
function etaEndRob(plan: EtaPlan): { v: number; m: number; extra: Record<string, number> } {
  const rows = projectEtaLegs(plan);
  const last = rows[rows.length - 1];
  const extra: Record<string, number> = {};
  (plan.perf?.extraFuels ?? []).forEach((f) => { extra[f.id] = last ? last.extraRob[f.id] : num(plan.startRobExtra?.[f.id]); });
  return { v: last ? last.robV : num(plan.startRobVlsfo), m: last ? last.robM : num(plan.startRobMgo), extra };
}

export function seedRecap(voyage: Voyage | undefined, blank = false): Recap {
  const base: Recap = {
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
    despatchTerm: 'Half Despatch',
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
    pniClub: '',
    arbitrationPlace: 'London',
    governingLaw: 'English Law',
    sanctionsClause: '',
    ballastBonus: '0',
    redeliveryNotices: '30-15-10-7-5-3-2-1',
    hullCleaningClause: '20 DAYS',
    cargoName: 'GYPSUM / LIMESTONE',
    cpQuantity: '75000',
    cpQuantityOption: 'CHOPT',
    cpQuantityMin: '',
    cpQuantityMax: '',
    cpQuantityTolerancePct: '5',
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
    cpConsByFuel: {},
    hireCurrency: 'USD',
    freightCurrency: 'USD',
    cargoQtyUnit: 'MT',
    charterHirePerDay: '12,500.00',
    charterHireCurrency: 'USD',
    firstHirePeriodDays: '15',
    firstHireInclude: 'Bunkers',
    firstHireDays: '3',
    firstHireBasis: 'Banking Days',
    hireEveryDays: '15',
    charterFirstHirePeriodDays: '15',
    charterFirstHireInclude: 'None',
    charterFirstHireDays: '3',
    charterFirstHireBasis: 'Banking Days',
    charterHireEveryDays: '15',
    hirePayState: {},
    charterHirePayState: {},
    freightPaymentDays: '3',
    freightPaymentBasis: 'Banking Days',
    serviceProviders: [],
    bunkerSpecs: 'VLSFO max 0.50% S · MGO max 0.10% S',
    bunkers: [
      { fuel: 'VLSFO', bod: '351.00', expBor: '351.00', cpPrice: '560.00', bookedPrice: '0.00', masterReq: '895.00', actualSupply: '478.75', actualBor: '', specs: 'Max 0.50% S' },
      { fuel: 'ULSFO', bod: '', expBor: '', cpPrice: '', bookedPrice: '', masterReq: '', actualSupply: '', actualBor: '', specs: 'Max 0.10% S' },
      { fuel: 'MGO', bod: '220.00', expBor: '220.00', cpPrice: '800.00', bookedPrice: '0.00', masterReq: '130.00', actualSupply: '5.91', actualBor: '', specs: 'Max 0.10% S' },
    ],
    additionalVoyageLegs: [],
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
        fullMainNormal: { type: 'VLSFO', ballast: '29', laden: '33', idle: '2.5', work: '5' },
        fullMainEca: { type: 'ULSFO', ballast: '29', laden: '33', idle: '2.5', work: '5' },
        fullSubNormal: { type: 'MGO', sea: '0.1', idle: '0', work: '0' },
        fullSubEca: { type: 'MGO', sea: '0.1', idle: '0', work: '0' },
        ecoMainNormal: { type: 'VLSFO', ballast: '23', laden: '26', idle: '2', work: '4' },
        ecoMainEca: { type: 'ULSFO', ballast: '23', laden: '26', idle: '2', work: '4' },
        ecoSubNormal: { type: 'MGO', sea: '0.08', idle: '0', work: '0' },
        ecoSubEca: { type: 'MGO', sea: '0.08', idle: '0', work: '0' },
        customMainNormal: { type: 'VLSFO', ballast: '29', laden: '33', idle: '2.5', work: '5' },
        customMainEca: { type: 'ULSFO', ballast: '29', laden: '33', idle: '2.5', work: '5' },
        customSubNormal: { type: 'MGO', sea: '0.1', idle: '0', work: '0' },
        customSubEca: { type: 'MGO', sea: '0.1', idle: '0', work: '0' },
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
      constants: '500',
      freshWater: '150',
      ballastWater: '200',
      refDisplacement: '69946',
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
        loiTolerancePct: '0.5',
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

  if (!blank) return base;

  const blankRecap = { ...base } as Recap;
  for (const key of Object.keys(blankRecap) as (keyof Recap)[]) {
    if (typeof blankRecap[key] === 'string') {
      ((blankRecap as unknown) as Record<string, unknown>)[key] = '';
    }
  }

  blankRecap.vesselName = voyage?.vessel || '';
  blankRecap.hireCurrency = 'USD';
  blankRecap.freightCurrency = 'USD';
  blankRecap.cargoQtyUnit = 'MT';
  blankRecap.charterHireCurrency = 'USD';
  blankRecap.cpQuantityOption = 'OO';
  blankRecap.firstHirePeriodDays = '15';
  blankRecap.firstHireInclude = 'None';
  blankRecap.firstHireDays = '3';
  blankRecap.firstHireBasis = 'Banking Days';
  blankRecap.hireEveryDays = '15';
  blankRecap.charterFirstHirePeriodDays = '15';
  blankRecap.charterFirstHireInclude = 'None';
  blankRecap.charterFirstHireDays = '3';
  blankRecap.charterFirstHireBasis = 'Banking Days';
  blankRecap.charterHireEveryDays = '15';
  blankRecap.freightPaymentDays = '3';
  blankRecap.freightPaymentBasis = 'Banking Days';
  blankRecap.bunkers = [
    { fuel: 'VLSFO', bod: '', expBor: '', cpPrice: '', bookedPrice: '', masterReq: '', actualSupply: '', actualBor: '', specs: '' },
    { fuel: 'ULSFO', bod: '', expBor: '', cpPrice: '', bookedPrice: '', masterReq: '', actualSupply: '', actualBor: '', specs: '' },
    { fuel: 'MGO', bod: '', expBor: '', cpPrice: '', bookedPrice: '', masterReq: '', actualSupply: '', actualBor: '', specs: '' },
  ];
  blankRecap.etaPlan = {
    startDep: '',
    startRobVlsfo: '',
    startRobMgo: '',
    weatherMargin: '',
    perf: {
      speedMode: 'Full',
      full: { ballast: '', laden: '' },
      eco: { ballast: '', laden: '' },
      customs: [],
      fullMainNormal: { type: 'VLSFO', ballast: '', laden: '', idle: '', work: '' },
      fullMainEca: { type: 'ULSFO', ballast: '', laden: '', idle: '', work: '' },
      fullSubNormal: { type: 'MGO', sea: '', idle: '', work: '' },
      fullSubEca: { type: 'MGO', sea: '', idle: '', work: '' },
      ecoMainNormal: { type: 'VLSFO', ballast: '', laden: '', idle: '', work: '' },
      ecoMainEca: { type: 'ULSFO', ballast: '', laden: '', idle: '', work: '' },
      ecoSubNormal: { type: 'MGO', sea: '', idle: '', work: '' },
      ecoSubEca: { type: 'MGO', sea: '', idle: '', work: '' },
      customMainNormal: { type: 'VLSFO', ballast: '', laden: '', idle: '', work: '' },
      customMainEca: { type: 'ULSFO', ballast: '', laden: '', idle: '', work: '' },
      customSubNormal: { type: 'MGO', sea: '', idle: '', work: '' },
      customSubEca: { type: 'MGO', sea: '', idle: '', work: '' },
      mainNormal: { type: 'VLSFO', ballast: '', laden: '', idle: '', work: '' },
      mainEca: { type: 'ULSFO', ballast: '', laden: '', idle: '', work: '' },
      subNormal: { type: 'MGO', sea: '', idle: '', work: '' },
      subEca: { type: 'MGO', sea: '', idle: '', work: '' },
    },
    legs: [],
  };
  blankRecap.stowage = {
    lightship: '',
    autoBunker: true,
    constants: '',
    freshWater: '',
    ballastWater: '',
    refDisplacement: '',
    points: [],
    holds: [],
    draft: {
      tpc: '',
      densityFrom: '',
      densityTo: '',
      draftCurrent: '',
      dispSW: '',
      vlsfo: '',
      mgo: '',
      bw: '',
      fw: '',
      constants: '',
      shipSurveyQty: '',
      shoreScaleQty: '',
      loiTolerancePct: '0.5',
    },
    grades: [],
    ports: [],
    summerDraft: '',
    winterDraft: '',
    tropicalDraft: '',
  };

  return blankRecap;
}

/* --------------------------------------------------------- P&L computation */

export interface Pnl {
  days: number;
  qty: number;
  freight: number;
  hireOutIncome: number;
  demDespatch: number;
  miscIncome: number;
  revenue: number;
  // bunkers
  foCons: number;
  foExp: number;
  doCons: number;
  doExp: number;
  extraFuelCost: number;
  bunkerCost: number;
  // operation expense (excl. hire)
  portLoad: number;
  portDisch: number;
  portCost: number;
  cveTotal: number;
  ilohc: number;
  otherCost: number;
  carbonCost: number;
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
  ballastBonus: number;
  // result
  totalExpense: number;
  profit: number;
  dailyProfit: number;
  tce: number;
}

/** Total sea distance (nm) and port days from the itinerary legs. */
function itineraryTotals(plan: EtaPlan): { distance: number; ecaDistance: number; portDays: number } {
  let distance = 0;
  let ecaDistance = 0;
  let portDays = 0;
  plan.legs.forEach((l) => {
    if (l.kind === 'sea') { distance += num(l.distNonEca) + num(l.distEca); ecaDistance += num(l.distEca); }
    else portDays += num(l.portDays);
  });
  return { distance, ecaDistance, portDays };
}

/**
 * Net laytime settlement (demurrage income − despatch cost) from the actual
 * statement-of-facts. Returns null until SOF events are entered, so the flat
 * `demDespatch` rate is used until a real laytime calc exists. Mirrors the
 * Freight & Laytime tab total.
 */
function laytimeSettlementNet(r: Recap): number | null {
  const fl = r.freightLaytime;
  if (!fl || !Array.isArray(fl.laytimes) || fl.laytimes.length === 0) return null;
  const hasFacts = fl.laytimes.some((p) => Array.isArray(p.events) && p.events.length > 0 && (p.commenced || p.completed));
  if (!hasFacts) return null;
  return fl.laytimes.reduce((s, p) => { const res = calcLaytime(p); return s + res.demurrageAmt - res.despatchAmt; }, 0);
}

/**
 * Actual port disbursements from the Freight & Laytime PDA/FDA settlement, keyed
 * by port. Amount per port = FDA final, else estimated, else advance. This is the
 * single source of truth for port DA: it feeds the Voyage Details PDA fields and
 * the Live P&L port cost.
 */
function settlementPortDa(r: Recap): { byPort: Map<string, number>; loadTotal: number; dischTotal: number; total: number; hasData: boolean } {
  const byPort = new Map<string, number>();
  let total = 0;
  const rows = r.freightLaytime?.settlement?.pda;
  if (Array.isArray(rows)) {
    rows.forEach((p) => {
      if (!p.port) return;
      const amt = p.fdaFinal > 0 ? p.fdaFinal : (p.estimated > 0 ? p.estimated : p.advance);
      if (amt <= 0) return;
      const key = p.port.trim().toUpperCase();
      byPort.set(key, (byPort.get(key) ?? 0) + amt);
      total += amt;
    });
  }
  const loadTotal = splitPorts(r.loadPort).reduce((s, p) => s + (byPort.get(p.trim().toUpperCase()) ?? 0), 0);
  const dischTotal = splitPorts(r.dischargePort).reduce((s, p) => s + (byPort.get(p.trim().toUpperCase()) ?? 0), 0);
  return { byPort, loadTotal, dischTotal, total, hasData: total > 0 };
}

/** Total off-hire days entered across the owners hire installments (Hire tab). */
function totalOffHireDays(r: Recap): number {
  let total = 0;
  Object.values(r.hirePayState ?? {}).forEach((e) => {
    (e?.offHire ?? []).forEach((o) => { total += offHireDays(o); });
  });
  return total;
}

/**
 * EU ETS carbon cost = phased EUAs required × the latest EUA price entered in the
 * Emissions ledger. Zero until the user records emission legs and a purchase rate,
 * so it never injects a guessed price.
 */
function euaCost(r: Recap): number {
  const eua = r.eua;
  if (!eua || !Array.isArray(eua.legs) || eua.legs.length === 0) return 0;
  const phaseIn = num(eua.phaseInPct) / 100;
  const totalEuas = eua.legs.reduce((s, l) => {
    const factor = num(l.emissionFactor) || euaFactor(l.fuel);
    return s + num(l.cons) * factor * (num(l.phasePct) / 100) * phaseIn;
  }, 0);
  const rates = (eua.ledger ?? []).filter((x) => /buy|bought/i.test(x.type) && num(x.rate) > 0).map((x) => num(x.rate));
  const rate = rates.length ? rates[rates.length - 1] : 0;
  return totalEuas * rate;
}

function actualReportTotals(reports: VesselReport[] | undefined): { speed: number; foCons: number; doCons: number } | null {
  const rows = (reports ?? []).filter((report) => report.type.toLowerCase().includes('noon') || report.type.toLowerCase().includes('eosp'));
  if (rows.length === 0) return null;
  let speedHours = 0;
  let speedTotal = 0;
  let foCons = 0;
  let doCons = 0;
  rows.forEach((report) => {
    const hours = num(report.duration);
    const gps = num(report.avgSpdGps);
    const log = num(report.avgSpdLog);
    const speed = gps > 0 ? gps : log;
    if (speed > 0) {
      speedTotal += speed * (hours > 0 ? hours : 1);
      speedHours += hours > 0 ? hours : 1;
    }
    foCons += num(report.consFo);
    doCons += num(report.consDo);
  });
  return speedHours > 0 || foCons > 0 || doCons > 0
    ? { speed: speedHours > 0 ? speedTotal / speedHours : 0, foCons, doCons }
    : null;
}

export function computePnl(r: Recap): Pnl {
  // Actual vessel reports drive actual duration and bunker consumption.
  const actuals = actualReportTotals(r.vesselReports);
  const spd = actuals?.speed ?? num(r.cpSpeed);
  const { distance, ecaDistance, portDays } = itineraryTotals(r.etaPlan);
  // Days from the itinerary when it has distance; otherwise the delivery→redelivery span.
  const days = spd > 0 && distance > 0
    ? distance / (spd * 24) + portDays
    : daysBetween(parseDMY(r.deliveryDateTime), parseDMY(r.redeliveryDateTime));
  const qty = num(r.finalQtyLoaded);
  // Fix type drives who hire belongs to: charter-in = expense, charter-out = income.
  const [inType = '', outType = ''] = (r.voyageFixType || '').toUpperCase().split('-');
  const chartersIn = inType === 'TCIN' || inType === 'TCTIN';
  const chartersOut = outType === 'TCOUT' || outType === 'TCTOUT';
  const performsVoyage = outType === 'VOUT';
  const addCommPct = num(r.adcom) + num(r.brokerage);
  // Hire is charged only for on-hire days — off-hire entered in the Hire tab is excluded.
  const onHireDays = Math.max(0, days - totalOffHireDays(r));

  // Freight income only when we perform the voyage out; shown net of address commission.
  const freightCommPct = num(r.adcom);
  const grossFreight = num(r.freightPerMt) * qty;
  const freight = performsVoyage ? grossFreight * (1 - freightCommPct / 100) : 0;
  // Hire OUT income — when we charter the vessel out. For a relet (also chartered in)
  // the sub-hire is in charterHirePerDay; for an owned vessel it's the main hirePerDay.
  const hireOutPerDay = chartersOut ? (chartersIn ? num(r.charterHirePerDay) : num(r.hirePerDay)) : 0;
  const hireOutIncome = hireOutPerDay * onHireDays * (1 - addCommPct / 100);
  // Actual laytime settlement overrides the flat demurrage rate once SOF facts exist.
  const laytimeNet = laytimeSettlementNet(r);
  const demDespatch = laytimeNet != null ? laytimeNet : num(r.demDespatch);
  const miscIncome = num(r.miscIncome);
  const revenue = freight + hireOutIncome + demDespatch + miscIncome;

  // Reported consumption is the actual; Voyage Details totals are the fallback.
  const foCons = actuals?.foCons || num(r.foCons);
  const foPrice = num(r.foPrice);
  // Split FO consumption by ECA distance fraction and price the ECA portion at ULSFO.
  const ulsfoPrice = num(r.bunkers?.find((b) => b.fuel === 'ULSFO')?.cpPrice) || foPrice;
  const ecaFrac = distance > 0 ? Math.min(1, ecaDistance / distance) : 0;
  const foExp = foCons * (1 - ecaFrac) * foPrice + foCons * ecaFrac * ulsfoPrice;
  const doCons = actuals?.doCons || num(r.doCons);
  const doPrice = num(r.doPrice);
  const doExp = doCons * doPrice;
  // Extra fuel types added in Instructed Speed & Consumption — voyage consumption
  // (Normal/ECA-split laden rate × on-hire days) priced from the matching Bunkers row.
  const extraFuelCost = (r.etaPlan?.perf.extraFuels ?? []).reduce((sum, f) => {
    const mode = r.etaPlan.perf.speedMode;
    const normal = mode === 'Eco' ? f.ecoNormal : mode === 'Full' ? f.fullNormal : f.customNormal;
    const eca = mode === 'Eco' ? f.ecoEca : mode === 'Full' ? f.fullEca : f.customEca;
    const rate = num(normal.laden) * (1 - ecaFrac) + num(eca.laden) * ecaFrac;
    const price = num(r.bunkers?.find((b) => b.fuel === f.grade)?.cpPrice);
    return sum + rate * onHireDays * price;
  }, 0);
  const bunkerCost = foExp + doExp + extraFuelCost;

  // Port DA: the Freight & Laytime PDA/FDA settlement is authoritative once any
  // figure is entered there; otherwise fall back to the Voyage Details PDA fields.
  const settlementDa = settlementPortDa(r);
  const portLoad = settlementDa.hasData ? settlementDa.loadTotal : num(r.portDaLoad);
  const portDisch = settlementDa.hasData ? settlementDa.dischTotal : num(r.portDaDisch);
  // DA for extra ports/bunker calls added in Operations (skip any already in the settlement).
  const legPda = (r.additionalVoyageLegs ?? []).reduce((s, l) => {
    const key = (l.port || '').trim().toUpperCase();
    if (settlementDa.hasData && key && settlementDa.byPort.has(key)) return s;
    return s + num(l.pda);
  }, 0);
  const portCost = (settlementDa.hasData ? settlementDa.total : portLoad + portDisch) + legPda;
  const cveTotal = num(r.cve);
  const ilohc = num(r.ilohc);
  const otherCost = num(r.otherCost);
  const carbonCost = euaCost(r);
  const opExpense = bunkerCost + portCost + cveTotal + ilohc + otherCost + carbonCost;
  const opProfit = revenue - opExpense;

  const hirePerDay = num(r.hirePerDay);
  // Hire IN — an expense only when we charter the vessel in (TCIN/TCTIN); zero when we own.
  const grossHire = chartersIn ? hirePerDay * onHireDays : 0;
  const hireDeductions = (grossHire * addCommPct) / 100;
  const netHirePerDay = hirePerDay * (1 - addCommPct / 100);
  const totalHire = grossHire - hireDeductions;
  const netHire = totalHire;

  // Ballast bonus is a lump sum paid to owners alongside hire — a charter cost.
  const ballastBonus = num(r.ballastBonus);
  const totalExpense = opExpense + totalHire + ballastBonus;
  const profit = revenue - totalExpense;
  const dailyProfit = days > 0 ? profit / days : 0;
  const tce = days > 0 ? opProfit / days : 0;

  return {
    days,
    qty,
    freight,
    hireOutIncome,
    demDespatch,
    miscIncome,
    revenue,
    foCons,
    foExp,
    doCons,
    doExp,
    extraFuelCost,
    bunkerCost,
    portLoad,
    portDisch,
    portCost,
    cveTotal,
    ilohc,
    otherCost,
    carbonCost,
    opExpense,
    opProfit,
    hirePerDay,
    addCommPct,
    grossHire,
    hireDeductions,
    netHirePerDay,
    netHire,
    totalHire,
    ballastBonus,
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

function readNumberToken(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const v = Number.parseFloat(raw.replace(/,/g, '').trim());
  return Number.isFinite(v) ? v : undefined;
}

function cleanPortToken(raw: string): string {
  const cleaned = raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:CHOPS|ECI|MPT|SB|SP|PORT\s+DISCHARGE\s+BASIS|SINGLE\s+PORT\s+DISCHARGE\s+BASIS)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const bits = cleaned.split(',').map((x) => x.trim()).filter(Boolean);
  const keep = bits.find((x) => /[A-Za-z]/.test(x) && !/^(?:\d+\/?\d*|INDIA|SOUTH AFRICA)$/i.test(x));
  const value = keep ?? bits[0] ?? cleaned;
  return value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function parseDateToken(token: string, fallbackYear?: number): { d: number; m: number; y: number } | null {
  const m = token.match(/(\d{1,2})(?:ST|ND|RD|TH)?\s*([A-Z]{3,9})\s*(\d{4})?/i);
  if (!m) return null;
  const monthMap: Record<string, number> = {
    JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
    JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
  };
  const day = Number(m[1]);
  const mon = monthMap[m[2].slice(0, 3).toUpperCase()] ?? 0;
  const year = m[3] ? Number(m[3]) : (fallbackYear ?? new Date().getFullYear());
  if (!day || !mon || !year) return null;
  return { d: day, m: mon, y: year };
}

function toRecapDateTime(part: { d: number; m: number; y: number }, hhmm = '0000'): string {
  const hh = hhmm.padStart(4, '0').slice(0, 2);
  const mm = hhmm.padStart(4, '0').slice(2, 4);
  return `${String(part.d).padStart(2, '0')}-${String(part.m).padStart(2, '0')}-${part.y} ${hh}:${mm}`;
}

function extractRecapFromPaste(text: string): Partial<Recap> {
  const src = text.replace(/\r/g, '').replace(/\*/g, '');
  const up = src.toUpperCase();
  const out: Partial<Recap> = { ...extractRecapFields(src) };

  const vesselName = src.match(/\n\s*([A-Z][A-Z0-9 .'-]{2,})\s*\n\s*BUILT\b/i)?.[1]?.trim();
  if (vesselName) out.vesselName = vesselName;

  const holdMatch =
    src.match(/\bNO\.?\s*OF\s*HOLDS?(?:\s*\/\s*HATCHES?)?\s*[:\-]?\s*(\d+)/i) ??
    src.match(/\b(\d+)\s*HOLDS?\s*\/\s*\d+\s*HATCHES?\b/i) ??
    src.match(/\bHOLDS?\s*\/\s*HATCHES?\s*[:\-]\s*(\d+)/i) ??
    src.match(/\bHOLDS?\s*[:\-]\s*(\d+)\b/i);
  if (holdMatch?.[1]) out.holdCount = holdMatch[1];

  const cargoLine = src.match(/CARGO\s*&\s*QTY\s*:\s*([^\n]+)/i)?.[1]?.trim();
  if (cargoLine) out.cargoName = cargoLine.replace(/\s+/g, ' ');
  const qty = src.match(/\b(\d{1,3}(?:,\d{3})+(?:\.\d+)?)\s*\+\/-\s*\d+(?:\.\d+)?%/i)?.[1];
  if (qty) out.cpQuantity = qty;

  const laycanBlock = src.match(/LAYCAN\s*:\s*([\s\S]{0,260})/i)?.[1] ?? '';
  const dateTokens = [...laycanBlock.matchAll(/\d{1,2}(?:ST|ND|RD|TH)?\s*[A-Z]{3,9}\s*(?:\d{4})?/gi)].map((m) => m[0]);
  const timeTokens = [...laycanBlock.matchAll(/(\d{3,4})\s*HRS/gi)].map((m) => m[1]);
  const first = dateTokens[0] ? parseDateToken(dateTokens[0]) : null;
  const last = dateTokens[1] ? parseDateToken(dateTokens[1], first?.y) : null;
  if (first) out.laycanStart = toRecapDateTime(first, timeTokens[0] ?? '0001');
  if (last) out.laycanEnd = toRecapDateTime(last, timeTokens[1] ?? '2359');

  const loadPortRaw = src.match(/LOAD\s+PORT\s*:\s*([^\n]+)/i)?.[1] ?? '';
  const loadPort = cleanPortToken(loadPortRaw);
  if (loadPort) out.loadPort = loadPort;

  const dischPorts = [...src.matchAll(/[A-Z]\)\s*[^\n\-]*-\s*([^\n]+)/gi)]
    .map((m) => cleanPortToken(m[1]))
    .filter(Boolean);
  if (dischPorts.length > 0) out.dischargePort = Array.from(new Set(dischPorts)).join(' / ');

  const loadRate = src.match(/LOAD\s+RATE[\s\S]{0,140}?-\s*([\d,]+(?:\.\d+)?)\s*MT/i)?.[1];
  if (loadRate) out.loadRate = `${loadRate} MT`;

  const dischRatePairs = [...src.matchAll(/\b(PARADIP|GOPALPUR|GANGAVARAM)\s*-\s*([\d,]+(?:\.\d+)?)\s*MT/gi)]
    .map((m) => `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]} MT`);
  if (dischRatePairs.length > 0) out.dischRate = dischRatePairs.join(' / ');

  const freightRate = src.match(/FREIGHT\s+RATE[^\n:]*:\s*[^\d\n]*([\d]+(?:\.\d+)?)/i)?.[1];
  if (freightRate) out.freightPerMt = freightRate;

  const demLine = src.match(/DEM\/?DSP[^\n]*/i)?.[0]?.replace(/\s+/g, ' ').trim();
  if (demLine) {
    out.demDespatch = demLine.replace(/^DEM\/?DSP\s*:?\s*/i, '').trim();
  } else {
    const dem = readNumberToken(src.match(/DEM\/?DSP[^\n:]*:\s*USD\s*([\d,]+(?:\.\d+)?)/i)?.[1]);
    if (typeof dem === 'number' && dem > 0) {
      out.demDespatch = `${dem.toLocaleString('en-US')} / ${(dem / 2).toLocaleString('en-US')}`;
    }
  }

  const eco = up.match(/ECO\s+SPEED[\s\S]*?LADEN\s*:\s*ABOUT\s*([\d.]+)\s*KNOTS[\s\S]*?ON\s*ABOUT\s*([\d.]+)\s*MT/i);
  const service = up.match(/SERVICE\s+SPEED[\s\S]*?LADEN\s*:\s*ABOUT\s*([\d.]+)\s*KNOTS[\s\S]*?ON\s*ABOUT\s*([\d.]+)\s*MT/i);
  const speed = readNumberToken(eco?.[1] ?? service?.[1]);
  const cons = readNumberToken(eco?.[2] ?? service?.[2]);
  if (typeof speed === 'number' && speed > 0) out.cpSpeed = speed.toFixed(2);
  if (typeof cons === 'number' && cons > 0) out.cpCons = cons.toFixed(2);

  return out;
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
    ['holdCount', [/no\.?\s*of\s*holds?(?:\s*\/\s*hatches?)?\s*[:\-|]\s*(\d+)/i, /holds?\s*\/\s*hatches?\s*[:\-|]\s*(\d+)/i, /^holds?\s*[:\-|]\s*(\d+)/im]],
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
    ['deliveryTerm', [/delivery\s*term\s*[:\-|]\s*(.+)/i]],
    ['deliveryDateTime', [/delivery\s*date\s*\/?\s*time\s*[:\-|]\s*(.+)/i]],
    ['redeliveryPort', [/redelivery\s*(?:at|port)\s*[:\-|]\s*(.+)/i]],
    ['redeliveryTerm', [/redelivery\s*term\s*[:\-|]\s*(.+)/i]],
    ['redeliveryDateTime', [/redelivery\s*date\s*\/?\s*time\s*[:\-|]\s*(.+)/i]],
    ['wxClause', [/wx\s*clause\s*[:\-|]\s*(.+)/i, /weather\s*clause\s*[:\-|]\s*(.+)/i]],
    ['ilohc', [/ilohc\s*[:\-|]\s*\$?\s*([\d.,]+)/i]],
    ['cve', [/\bc\.?v\.?e\.?\s*[:\-|]\s*\$?\s*([\d.,]+)/i]],
    ['adcom', [/ad\.?com\s*[:\-|]\s*([\d.]+\s*%?)/i, /address\s*comm[^:\-|]*[:\-|]\s*([\d.]+\s*%?)/i]],
    ['brokerage', [/brokerage\s*[:\-|]\s*(.+)/i]],
    ['pniClub', [/p\s*&\s*i\s*club\s*[:\-|]\s*(.+)/i, /pni\s*club\s*[:\-|]\s*(.+)/i]],
    ['arbitrationPlace', [/arbitration\s*(?:place|venue)\s*[:\-|]\s*(.+)/i]],
    ['governingLaw', [/governing\s*law\s*[:\-|]\s*(.+)/i]],
    ['sanctionsClause', [/sanctions?\s*clause\s*[:\-|]\s*(.+)/i]],
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
  despatchTerm: 'Half Despatch',
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
  cpQuantity: '75000',
  cpQuantityOption: 'CHOPT',
  cpQuantityMin: '',
  cpQuantityMax: '',
  cpQuantityTolerancePct: '5',
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
  const now = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
  const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const noticeDays = Array.from(
    new Set(
      (r.redeliveryNotices || '')
        .split(/[^\d]+/)
        .map((x) => parseInt(x, 10))
        .filter((n) => Number.isFinite(n) && n >= 0),
    ),
  ).sort((a, b) => b - a);
  const redeliveryDt = parseDMY(r.redeliveryDateTime);

  if (pnl.profit < 0) list.push({ id: 'a1', text: 'Voyage P&L is negative — review costs.', level: 'alert' });
  list.push({ id: 'a2', text: `Next hire payment due — ${r.charterers}.`, level: 'warn' });
  list.push({ id: 'a3', text: 'Demurrage may accrue at Haldia (congestion).', level: 'warn' });

  if (noticeDays.length > 0 && !redeliveryDt) {
    list.push({
      id: 'a4',
      text: 'Redelivery notices selected but Redelivery Date / Time is missing.',
      level: 'warn',
    });
  }

  if (redeliveryDt && noticeDays.length > 0) {
    const schedule = noticeDays
      .map((d) => ({
        day: d,
        dueAt: new Date(redeliveryDt.getTime() - d * 86_400_000),
      }))
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

    const dueToday = schedule.filter((x) => isSameDay(x.dueAt, now));
    dueToday.forEach((x, idx) => {
      list.push({
        id: `a4-today-${idx}`,
        text: `Send ${x.day}-day redelivery notice today (${fmtDate(x.dueAt)}).`,
        level: 'alert',
      });
    });

    const nextUpcoming = schedule.find((x) => x.dueAt.getTime() > now.getTime());
    if (nextUpcoming) {
      const level: Alert['level'] = nextUpcoming.dueAt.getTime() - now.getTime() <= 86_400_000 ? 'warn' : 'info';
      list.push({
        id: 'a4-next',
        text: `Upcoming redelivery notice: ${nextUpcoming.day}-day due on ${fmtDate(nextUpcoming.dueAt)}.`,
        level,
      });
    }

    const lastMissed = [...schedule].reverse().find((x) => x.dueAt.getTime() < now.getTime() && !isSameDay(x.dueAt, now));
    if (lastMissed) {
      list.push({
        id: 'a4-overdue',
        text: `Missed redelivery notice: ${lastMissed.day}-day was due on ${fmtDate(lastMissed.dueAt)}.`,
        level: 'warn',
      });
    }
  }

  return list;
}

/* -------------------------------------------------------- small UI helpers */

function Card({ title, icon, right, children, wide, span2, span3, className }: { title: string; icon: string; right?: ReactNode; children: ReactNode; wide?: boolean; span2?: boolean; span3?: boolean; className?: string }) {
  return (
    <section className={`fv-ops__card${wide ? ' fv-ops__card--wide' : ''}${span2 ? ' fv-ops__card--span2' : ''}${span3 ? ' fv-ops__card--span3' : ''}${className ? ` ${className}` : ''}`}>
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
  { id: 'etarob', label: "ETA & Bunker", icon: 'fa-gauge-high' },
  { id: 'stowage', label: 'Cargo & Stowage', icon: 'fa-boxes-stacked' },
  { id: 'hire', label: 'Hire & Claims', icon: 'fa-money-bill-wave' },
  { id: 'freight', label: 'Freight & Laytime', icon: 'fa-file-invoice-dollar' },
  { id: 'reports', label: 'Vessel Reports', icon: 'fa-file-lines' },
  { id: 'notes', label: 'Notes', icon: 'fa-note-sticky' },
  { id: 'costs', label: 'Tool', icon: 'fa-scale-balanced' },
];

type RailPanel = 'docs' | 'tasks' | 'alerts' | 'upload' | 'confighistory' | null;
/** How long after a voyage switch automatic reconciliation (backend hydrate, shared market
 *  factor sync, itinerary recompute) is still expected, so it's not logged as a user edit. */
const SWITCH_GRACE_MS = 3000;

/* ------------------------------------------------------------ main component */

export function OperationsPage({ mode }: { mode?: 'create' } = {}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useFleetView();
  const selectedVoyage = useSelectedVoyage({ emptyWhenCleared: true });
  // "create" mode (prop or ?new=1) opens a blank operations workspace.
  const createMode = mode === 'create' || searchParams.get('new') === '1';
  const blankVoyage = useMemo(() => makeBlankVoyage(), []);
  const voyage = createMode ? blankVoyage : selectedVoyage;

  const [recap, setRecap] = useState<Recap>(() => {
    const loaded = loadOpsRecap(voyage?.id);
    return loaded ? { ...seedRecap(voyage, createMode), ...(loaded as Partial<Recap>) } : seedRecap(voyage, createMode);
  });
  const [tab, setTab] = useState<TabId>('details');
  const [rail, setRail] = useState<RailPanel>(null);
  const [docs, setDocs] = useState<DocItem[]>(() => seedDocs());
  const [tasks, setTasks] = useState<Task[]>(() => seedTasks());
  const [fetchNote, setFetchNote] = useState<string | null>(null);
  const [cpPasteOpen, setCpPasteOpen] = useState(createMode);
  const [cpPasteText, setCpPasteText] = useState('');
  const [cpPasteMsg, setCpPasteMsg] = useState<string | null>(null);
  const [opsStatus, setOpsStatus] = useState<string>(voyage?.status || 'At Sea');
  const [duePopupClock, setDuePopupClock] = useState<number>(Date.now());
  const voyageTypeForTabs = String(recap.voyageFixType || '').toUpperCase();
  const includesVoyageType = voyageTypeForTabs.includes('VOUT') || voyageTypeForTabs.includes('VIN') || voyageTypeForTabs.includes('VOYAGE');
  const freightTabLabel = includesVoyageType ? 'Freight & Laytime' : 'Services';
  const duePopupStorageKey = `fv.ops.duePopupSnooze.v1:${voyage?.id ?? 'none'}`;
  const [duePopupSnooze, setDuePopupSnooze] = useState<Record<string, number>>(() => readDuePopupSnoozeMap(duePopupStorageKey));
  const [configHistory, setConfigHistory] = useState<ConfigHistoryEntry[]>(() => loadConfigHistory(voyage?.id));
  // Guards the shared-store sync loop: the raw JSON we last read/wrote.
  const lastSavedRef = useRef<string>(readOpsRecapRaw(voyage?.id) ?? '');
  // Timestamp of the most recent voyage switch/reseed — recap changes within `SWITCH_GRACE_MS`
  // of it are reconciliation noise (hydrate from backend, shared market-factor sync, itinerary
  // recompute, StrictMode's double-invoked mount effects), not a user edit, so they're never
  // logged to Configuration History.
  const voyageSwitchedAtRef = useRef<number>(Date.now());
  // Configuration History is logged on a quiet-period debounce, not per keystroke: `historyBaseRef`
  // holds the recap snapshot from before the CURRENT burst of edits started, and the timer fires
  // once typing pauses, diffing that base against the latest recap so a field shows one entry with
  // its final value (e.g. typing "101" logs once as — → 101, not —ₒ1→1 0→1 01).
  const historyBaseRef = useRef<string | null>(null);
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The last FULL recap JSON this effect itself observed — kept separate from `lastSavedRef`
  // (which external syncs below also write a PARTIAL payload into) so the history diff always
  // compares full-recap-to-full-recap and never flags an external sync's extra/missing keys as
  // a spurious "user" change.
  const historyLastFullRef = useRef<string>(JSON.stringify(recap));
  const recapRef = useRef(recap);
  recapRef.current = recap;

  // The ETA & ROB itinerary's final computed port arrival (UTC) is the single source of truth for
  // the vessel's expected redelivery once an itinerary exists — keep Voyage Details' "Redelivery
  // Date & Time UTC" field in sync with it (every consumer that reads `recap.redeliveryDateTime` —
  // the hire schedule's BOR settlement date, voyage duration, notices, PDFs — then stays correct
  // without separately re-deriving it) UNLESS the user has directly typed their own value there.
  // Runs regardless of which tab is active since `recap` lives here at the top level.
  useEffect(() => {
    if (recap.redeliveryDateManual) return;
    const legs = recap.etaPlan?.legs ?? [];
    if (!legs.length) return;
    const etaRows = projectEtaLegs(recap.etaPlan);
    const lastArr = etaRows.length ? etaRows[etaRows.length - 1].arr : null;
    if (!lastArr) return;
    const p2 = (n: number) => String(n).padStart(2, '0');
    const dmy = `${p2(lastArr.getDate())}-${p2(lastArr.getMonth() + 1)}-${lastArr.getFullYear()} ${p2(lastArr.getHours())}:${p2(lastArr.getMinutes())}`;
    if (dmy !== recap.redeliveryDateTime) setRecap((r) => ({ ...r, redeliveryDateTime: dmy }));
  }, [recap.etaPlan, recap.redeliveryDateTime, recap.redeliveryDateManual]);

  // The itinerary's own timeline must be anchored to the SAME delivery date/time as Voyage
  // Details — otherwise its final computed arrival (used above) is on an unrelated timeline and
  // can't ever validly serve as the hire schedule's redelivery date. Voyage Details' Delivery
  // Date & Time is the single source of truth; the itinerary's DEP-UTC start always mirrors it.
  useEffect(() => {
    if (!recap.deliveryDateTime) return;
    if (recap.etaPlan.startDep !== recap.deliveryDateTime) {
      setRecap((r) => ({ ...r, etaPlan: { ...r.etaPlan, startDep: recap.deliveryDateTime } }));
    }
  }, [recap.deliveryDateTime, recap.etaPlan.startDep]);

  useEffect(() => {
    const loaded = loadOpsRecap(voyage?.id);
    const base = loaded ? { ...seedRecap(voyage, createMode), ...(loaded as Partial<Recap>) } : seedRecap(voyage, createMode);
    // Adopt shared Market Factors (hire / FO / GO) so Performance & Limits edits carry in.
    const shared = loadVoyageShared(voyage?.id);
    if (shared) {
      if (shared.hireRate) base.hirePerDay = shared.hireRate;
      if (shared.foPrice) base.foPrice = shared.foPrice;
      if (shared.goPrice) base.doPrice = shared.goPrice;
    }
    setRecap(base);
    lastSavedRef.current = readOpsRecapRaw(voyage?.id) ?? '';
    voyageSwitchedAtRef.current = Date.now();
    setTab('details');
    setDocs(seedDocs());
    setTasks(seedTasks());
    setCpPasteOpen(createMode);
    setCpPasteText('');
    setCpPasteMsg(null);
    setOpsStatus(voyage?.status || 'At Sea');
    setDuePopupSnooze(readDuePopupSnoozeMap(`fv.ops.duePopupSnooze.v1:${voyage?.id ?? 'none'}`));
    setConfigHistory(loadConfigHistory(voyage?.id));
    // Pull the server copies into the local cache; the recap subscribe effect applies them.
    void hydrateOpsRecap(voyage?.id);
    void hydrateOpsEstBaseline(voyage?.id);
    void hydrateVoyageShared(voyage?.id);
    void hydrateConfigHistory(voyage?.id).then(setConfigHistory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyage?.id]);

  useEffect(() => {
    const t = window.setInterval(() => setDuePopupClock(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Persist recap edits to the shared per-voyage store (skips no-op writes) immediately — data
  // safety shouldn't wait on a debounce. Configuration History logging is debounced separately
  // (see `historyTimerRef`) so a burst of keystrokes collapses into one entry per field.
  useEffect(() => {
    if (!voyage) return;
    const raw = JSON.stringify(recap);
    const skipLog = Date.now() - voyageSwitchedAtRef.current < SWITCH_GRACE_MS;
    const previousFull = historyLastFullRef.current;
    historyLastFullRef.current = raw;
    if (raw !== lastSavedRef.current) {
      lastSavedRef.current = raw;
      writeOpsRecapRaw(voyage.id, raw);
    }
    if (previousFull && previousFull !== raw && !skipLog) {
      if (historyBaseRef.current == null) historyBaseRef.current = previousFull;
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
      const voyageId = voyage.id;
      const by = user?.fullName || user?.name || 'Unknown user';
      historyTimerRef.current = setTimeout(() => {
        historyTimerRef.current = null;
        const base = historyBaseRef.current;
        historyBaseRef.current = null;
        if (!base) return;
        try {
          const before = JSON.parse(base) as Record<string, unknown>;
          const after = recapRef.current as unknown as Record<string, unknown>;
          const entries = diffRecap(before, after, by);
          if (entries.length) appendConfigHistory(voyageId, entries);
        } catch {
          /* malformed snapshot — skip logging this save */
        }
      }, 1200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recap, voyage?.id]);

  // Flush any pending (debounced) Configuration History entry for the OUTGOING voyage before
  // switching to a new one, or on unmount, so a typed edit is never silently dropped.
  useEffect(() => {
    return () => {
      if (!historyTimerRef.current) return;
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
      const base = historyBaseRef.current;
      historyBaseRef.current = null;
      if (base && voyage) {
        try {
          const before = JSON.parse(base) as Record<string, unknown>;
          const after = recapRef.current as unknown as Record<string, unknown>;
          const by = user?.fullName || user?.name || 'Unknown user';
          const entries = diffRecap(before, after, by);
          if (entries.length) appendConfigHistory(voyage.id, entries);
        } catch {
          /* malformed snapshot — skip logging this save */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyage?.id]);

  // Live-update the Configuration History panel when another tab/page changes it.
  useEffect(() => {
    if (!voyage) return;
    return subscribeConfigHistory(voyage.id, () => setConfigHistory(loadConfigHistory(voyage.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyage?.id]);

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

  // Push hire / fuel prices to the shared Market Factors store (Performance, Limits, Optimization).
  useEffect(() => {
    if (!voyage?.id) return;
    const shared = loadVoyageShared(voyage.id) ?? {};
    const patch: Partial<VoyageSharedFields> = {};
    if (recap.hirePerDay !== (shared.hireRate ?? '')) patch.hireRate = recap.hirePerDay;
    if (recap.foPrice !== (shared.foPrice ?? '')) patch.foPrice = recap.foPrice;
    if (recap.doPrice !== (shared.goPrice ?? '')) patch.goPrice = recap.doPrice;
    if (Object.keys(patch).length > 0) mergeVoyageShared(voyage.id, patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recap.hirePerDay, recap.foPrice, recap.doPrice, voyage?.id]);

  // Reflect external Market Factor edits (Performance / Limits) into the recap live.
  useEffect(() => {
    if (!voyage?.id) return;
    return subscribeVoyageShared(voyage.id, () => {
      const shared = loadVoyageShared(voyage.id);
      if (!shared) return;
      setRecap((r) => {
        let changed = false;
        const next = { ...r };
        if (shared.hireRate != null && shared.hireRate !== r.hirePerDay) { next.hirePerDay = shared.hireRate; changed = true; }
        if (shared.foPrice != null && shared.foPrice !== r.foPrice) { next.foPrice = shared.foPrice; changed = true; }
        if (shared.goPrice != null && shared.goPrice !== r.doPrice) { next.doPrice = shared.goPrice; changed = true; }
        return changed ? next : r;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyage?.id]);

  const pnl = useMemo(() => computePnl(recap), [recap]);
  const alerts = useMemo(() => seedAlerts(recap, pnl), [recap, pnl]);
  const duePopupItems = useMemo(
    () => (voyage ? buildDuePopupItems(recap, pnl, voyage, new Date(duePopupClock)) : []),
    [recap, pnl, voyage, duePopupClock],
  );
  const visibleDuePopupItems = useMemo(
    () => duePopupItems.filter((x) => (duePopupSnooze[x.id] ?? 0) <= duePopupClock),
    [duePopupItems, duePopupSnooze, duePopupClock],
  );
  // Estimate baseline = the fixed recap snapshotted from Chartering at handover,
  // independent of live Operations/Postfix edits. Falls back to seedRecap when no
  // handover snapshot exists (e.g. sample or manually created voyages).
  const estPnl = useMemo(() => {
    const baseline = loadOpsEstBaseline(voyage?.id);
    const baseRecap = baseline
      ? { ...seedRecap(voyage, createMode), ...(baseline as Partial<Recap>) }
      : seedRecap(voyage, createMode);
    return computePnl(baseRecap);
  }, [voyage?.id, createMode]);

  if (!voyage) return <NoVesselSelected />;

  const canSaveCreate = createMode && recap.vesselName.trim().length > 0;

  const discardCreateDraft = () => {
    setRecap(seedRecap(voyage, true));
    setCpPasteText('');
    setCpPasteMsg(null);
    setOpsStatus('At Sea');
    setFetchNote(null);
  };

  const saveCreateDraft = () => {
    if (!canSaveCreate) return;
    const loadPort = recap.loadPort || recap.deliveryPort || voyage.portFrom || '';
    const dischPort = recap.dischargePort || recap.redeliveryPort || voyage.portTo || '';
    const saved = upsertCreatedVoyage({
      vessel: recap.vesselName.trim(),
      imo: recap.vesselImo || voyage.imo || '',
      vesselType: voyage.vesselType || '',
      dwt: recap.cpQuantity || voyage.dwt || '',
      built: voyage.built || 0,
      client: recap.charterers || recap.owners || voyage.client || '',
      clientEmail: recap.vesselEmail || voyage.clientEmail || '',
      pic: voyage.pic || 'You',
      service: voyage.service || 'PMO',
      status: opsStatus || 'At Sea',
      portFrom: loadPort,
      portTo: dischPort,
      eta: recap.redeliveryDateTime || '',
      etdDisplay: recap.deliveryDateTime || '',
      etdIso: '',
      cpSpeed: num(recap.cpSpeed),
      cpCons: num(recap.cpCons),
      instSpeed: num(recap.cpSpeed),
      instCons: num(recap.cpCons),
      price: num(recap.hirePerDay),
      pricingBasis: 'Per Day',
      costPerDay: num(recap.hirePerDay),
      foCost: num(recap.foPrice),
      goCost: num(recap.doPrice),
      euaCost: 0,
      openTasks: 0,
      health: 75,
      open: 'OPEN',
      seed: Date.now() % 10_000,
    });
    writeOpsRecapRaw(saved.id, JSON.stringify(recap));
    writeSelectedVoyageId(saved.id);
    addNotification(`Operations draft saved — ${saved.vessel}`, 'Operations');
    navigate(`/operations?voyage=${encodeURIComponent(saved.id)}`);
  };

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

  const applyCpPaste = () => {
    const body = cpPasteText.trim();
    if (!body) {
      setCpPasteMsg('Paste CP/Recap text first, then click Apply.');
      return;
    }
    const extracted = extractRecapFromPaste(body);
    const appliedEntries = Object.entries(extracted).filter(([, v]) => typeof v === 'string' && v.trim().length > 0);
    if (appliedEntries.length === 0) {
      setCpPasteMsg('No matching recap fields found in the pasted text.');
      return;
    }
    setRecap((prev) => {
      const next = { ...prev, ...extracted };
      // Seed the Cargo & Stowage grade rows from the pasted cargo name (Cargo Master SF
      // auto-filled where a match exists) — only when no grade rows have been entered yet.
      if (extracted.cargoName && prev.stowage.grades.every((g) => !g.grade.trim())) {
        const names = extracted.cargoName.split(/\s*\/\s*|\s*,\s*/).map((n) => n.trim()).filter(Boolean);
        if (names.length) {
          const soleQty = names.length === 1 ? (extracted.cpQuantity || '') : '';
          next.stowage = { ...prev.stowage, grades: names.map((n) => ({ grade: n, sf: cargoStowageFactor(n), qty: soleQty, sfAuto: true })) };
        }
      }
      return next;
    });
    setCpPasteMsg(`Applied ${appliedEntries.length} field(s) from pasted CP details.`);
  };

  const openTasks = tasks.filter((t) => !t.done).length;
  const dismissDuePopup = () => {
    if (visibleDuePopupItems.length === 0) return;
    const until = Date.now() + OPS_DUE_POPUP_SNOOZE_MS;
    const next = { ...duePopupSnooze };
    visibleDuePopupItems.forEach((x) => { next[x.id] = until; });
    setDuePopupSnooze(next);
    writeDuePopupSnoozeMap(duePopupStorageKey, next);
  };

  return (
    <div className="fv-ops">
      {visibleDuePopupItems.length > 0 && <DueAlertsPopup items={visibleDuePopupItems} onClose={dismissDuePopup} />}
      <div className="fv-ops__main">
        {/* ===================== SLIM TOP BAR ===================== */}
        <RecapTopBar recap={recap} voyage={voyage} status={opsStatus} onStatus={setOpsStatus} />
        <VoyageTagsStrip />

        {createMode && (
          <div className="fv-ops__create-actions">
            <button type="button" className="fv-ops__btn" onClick={discardCreateDraft}>
              <i className="fas fa-rotate-left" aria-hidden="true" /> Discard
            </button>
            <button
              type="button"
              className="fv-ops__btn fv-ops__btn--primary"
              disabled={!canSaveCreate}
              onClick={saveCreateDraft}
            >
              <i className="fas fa-floppy-disk" aria-hidden="true" /> Save Voyage
            </button>
          </div>
        )}

        {cpPasteOpen && (
          <section className="fv-pastebox fv-ops__pastebox">
            <div className="fv-pastebox__head">
              <h3>Paste CP / Recap Details</h3>
              <p>Paste text from charter party or recap email. Matching Operations fields will be auto-filled.</p>
            </div>
            <textarea
              className="fv-pastebox__input"
              value={cpPasteText}
              onChange={(e) => setCpPasteText(e.target.value)}
              placeholder="Paste CP or recap details here..."
            />
            <div className="fv-pastebox__actions">
              <button type="button" className="fv-ops__btn fv-ops__btn--primary" onClick={applyCpPaste}>
                <i className="fas fa-wand-magic-sparkles" aria-hidden="true" /> Apply to Operations
              </button>
              <button
                type="button"
                className="fv-ops__btn"
                onClick={() => {
                  setCpPasteText('');
                  setCpPasteMsg(null);
                }}
              >
                <i className="fas fa-eraser" aria-hidden="true" /> Clear
              </button>
              {cpPasteMsg && <span className="fv-pastebox__msg">{cpPasteMsg}</span>}
            </div>
          </section>
        )}

        {/* ===================== TABS ===================== */}
        <div className="fv-ops__tabs-row">
          <nav className="fv-ops__tabs" aria-label="Operations sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`fv-ops__tab${tab === t.id ? ' fv-ops__tab--active' : ''}`}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
              >
                <i className={`fas ${t.icon}`} aria-hidden="true" /> {t.id === 'freight' ? freightTabLabel : t.label}
              </button>
            ))}
          </nav>
          <button
            type="button"
            className={`fv-ops__btn fv-ops__btn--sm${cpPasteOpen ? ' fv-ops__btn--primary' : ''}`}
            onClick={() => setCpPasteOpen((v) => !v)}
          >
            <i className="fas fa-paste" aria-hidden="true" /> {cpPasteOpen ? 'Hide CP Details' : 'Paste CP Details'}
          </button>
        </div>

        {/* ===================== TAB CONTENT ===================== */}
        <div className="fv-ops__content">
          {tab === 'details' && <VoyageDetailsTab recap={recap} setRecap={setRecap} voyage={voyage} status={opsStatus} />}
          {tab === 'pnl' && <PnlTab recap={recap} setRecap={setRecap} pnl={pnl} estPnl={estPnl} />}
          {tab === 'etarob' && <EtaRobTab recap={recap} setRecap={setRecap} voyage={voyage} />}
          {tab === 'stowage' && <StowageTab recap={recap} setRecap={setRecap} />}
          {tab === 'hire' && <HireTab recap={recap} setRecap={setRecap} pnl={pnl} voyage={voyage} />}
          {tab === 'freight' && <FreightTab recap={recap} setRecap={setRecap} voyage={voyage} />}
          {tab === 'costs' && <CostsTab />}
          {tab === 'reports' && <ReportsTab recap={recap} setRecap={setRecap} voyage={voyage} />}
          {tab === 'notes' && <NotesTab recap={recap} setRecap={setRecap} />}
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
                {rail === 'confighistory' && 'Configuration History'}
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
              {rail === 'confighistory' && <ConfigHistoryPanel entries={configHistory} />}
            </div>
          </div>
        )}
        <div className="fv-ops__rail-icons">
          <RailIcon icon="fa-folder-open" label="Documents" active={rail === 'docs'} badge={docs.length} onClick={() => setRail(rail === 'docs' ? null : 'docs')} />
          <RailIcon icon="fa-list-check" label="Tasks" active={rail === 'tasks'} badge={openTasks} onClick={() => setRail(rail === 'tasks' ? null : 'tasks')} />
          <RailIcon icon="fa-bell" label="Alerts" active={rail === 'alerts'} badge={alerts.length} onClick={() => setRail(rail === 'alerts' ? null : 'alerts')} />
          <RailIcon icon="fa-cloud-arrow-up" label="Upload" active={rail === 'upload'} onClick={() => setRail(rail === 'upload' ? null : 'upload')} />
          <RailIcon icon="fa-clock-rotate-left" label="Config History" active={rail === 'confighistory'} onClick={() => setRail(rail === 'confighistory' ? null : 'confighistory')} />
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
// Common cargo commodities offered as type-ahead suggestions (free text stays).
const OPS_COMMON_CARGOES = [
  'Iron Ore', 'Coal', 'Steam Coal', 'Coking Coal', 'Bauxite', 'Alumina', 'Gypsum', 'Limestone',
  'Clinker', 'Cement', 'Grain', 'Wheat', 'Corn', 'Soybeans', 'Soybean Meal', 'Rice', 'Sugar',
  'Salt', 'Fertilizer', 'Urea', 'DAP', 'MOP', 'Sulphur', 'Petcoke', 'Scrap', 'Steel Products',
  'HR Coils', 'Rebar', 'Logs', 'Woodchips', 'Manganese Ore', 'Chrome Ore', 'Nickel Ore', 'Concentrates',
];
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
const OPS_DESPATCH_TERMS = ['Dem = Des', 'Half Despatch', 'HDWTS', 'HDATS', 'Free Despatch', 'No Despatch'];
// Voyage operational status (editable in the Voyage Details summary strip).
const OPS_VOYAGE_STATUSES = ['At Sea', 'At Port', 'At Berth', 'At Anchorage', 'Loading', 'Discharging', 'On Voyage', 'Ballast', 'Idle', 'Completed'];
// Bunker fuel grades (defaults mirror the Chartering estimation fuels).
const OPS_FUEL_GRADES = ['VLSFO', 'ULSFO', 'HSFO', 'LSMGO', 'MGO', 'MDO', 'LNG', 'Methanol'];
const OPS_PORT_ROTATION_TYPES = ['Delivery', 'Loading', 'Bunker', 'Discharging', 'ReDelivery', 'Canal Transit', 'STS', 'DryDock', 'Anchorage', 'Idle / Waiting', 'Pilotage'];
// Itinerary leg types (mirrors the Chartering port-rotation Type column).
const OPS_LEG_TYPES = ['Ballast', 'Laden', 'LoadLine Change', ...PORT_TYPE_OPTIONS];
// Vessel report types (Vessel Reports tab).
const OPS_REPORT_TYPES = [
  'SBE', 'FWE', 'COSP (Departure)', 'NOON - SEA', 'NOON - PORT', 'EOSP (Arrival)',
  'NOON - ANCHOR', 'BUNKER', 'SHIFTING REPORT', 'SPEED CHANGE', 'FUEL CHANGE',
  'STOP', 'RESUME', 'DEVIATION',
];
// Shifting-report sub-types (shown when the report type is a shifting report).
const OPS_SHIFTING_SUBTYPES = [
  'Anchorage to Another Anchorage', 'Anchorage to Berth', 'Berth to Berth', 'Berth to Anchorage',
];

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
function VdDateTime({ label, value, onChange, accent, readOnly, title }: { label: string; value: string; onChange: (v: string) => void; accent?: boolean; readOnly?: boolean; title?: string }) {
  return (
    <label className="fv-ops__vd-field" title={title}>
      <span>{label}</span>
      <input
        type="datetime-local"
        step="60"
        className={`fv-ops__vd-in fv-ops__vd-in--dt${accent ? ' fv-ops__vd-in--accent' : ''}`}
        value={dmyToDateTimeInput(value)}
        onChange={(e) => onChange(dateTimeInputToDmy(e.target.value))}
        readOnly={readOnly}
        disabled={readOnly}
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

/** Shared themed autocomplete popup: free-text input over a filtered saved list. */
function VdAutocomplete({ value, onChange, options, placeholder, accent, inputClass, inputLabel }: { value: string; onChange: (v: string) => void; options: { value: string; label?: string; meta?: string }[]; placeholder?: string; accent?: boolean; inputClass?: string; inputLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q ? options.filter((o) => `${o.value} ${o.label ?? ''} ${o.meta ?? ''}`.toLowerCase().includes(q)) : options;
    return list.slice(0, 50);
  }, [value, options]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const choose = (v: string) => { onChange(v); setOpen(false); };
  return (
    <div className="fv-ops__vd-combo" ref={wrapRef}>
      <input
        className={inputClass ?? `fv-ops__vd-in${accent ? ' fv-ops__vd-in--accent' : ''}`}
        value={value}
        placeholder={placeholder ?? 'Select or type…'}
        aria-label={inputLabel}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && matches[active]) { e.preventDefault(); choose(matches[active].value); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && matches.length > 0 && (
        <ul className="fv-port-combo__list">
          {matches.map((o, i) => (
            <li
              key={`${o.value}-${i}`}
              className={`fv-port-combo__item${i === active ? ' fv-port-combo__item--active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); choose(o.value); }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="fv-port-combo__name">{o.label ?? o.value}</span>
              {o.meta && <span className="fv-port-combo__meta">{o.meta}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Autocomplete field backed by saved accounts (pick a saved account or type one). */
function VdCombo({ label, value, onChange, options, accent }: { label: string; value: string; onChange: (v: string) => void; options: string[]; accent?: boolean }) {
  const opts = useMemo(() => options.map((o) => ({ value: o })), [options]);
  return (
    <label className="fv-ops__vd-field">
      <span>{label}</span>
      <VdAutocomplete value={value} onChange={onChange} options={opts} accent={accent} />
    </label>
  );
}

/** Port field with autocomplete over the saved World Port Index. */
function VdPort({ label, value, onChange, ports, accent }: { label: string; value: string; onChange: (v: string) => void; ports: WorldPort[]; accent?: boolean }) {
  const opts = useMemo(() => ports.map((p) => ({ value: p.label, label: p.name, meta: p.code ? `${p.country} · ${p.code}` : p.country })), [ports]);
  return (
    <label className="fv-ops__vd-field">
      <span>{label}</span>
      <VdAutocomplete value={value} onChange={onChange} options={opts} placeholder="Search port…" accent={accent} />
    </label>
  );
}

/** Numeric value paired with a unit / currency dropdown. */
function VdValueUnit({ label, value, onValue, unit, onUnit, units, accent, num, className }: { label: string; value: string; onValue: (v: string) => void; unit: string; onUnit: (v: string) => void; units: string[]; accent?: boolean; num?: boolean; className?: string }) {
  return (
    <label className="fv-ops__vd-field">
      <span>{label}</span>
      <span className={`fv-ops__vd-unitwrap${className ? ` ${className}` : ''}`}>
        <input className={`fv-ops__vd-in${accent ? ' fv-ops__vd-in--accent' : ''}`} inputMode={num ? 'decimal' : undefined} value={value} onChange={(e) => onValue(e.target.value)} />
        <select className="fv-ops__vd-unit" value={unit} onChange={(e) => onUnit(e.target.value)}>
          {units.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </span>
    </label>
  );
}

/** CP Quantity field with option type selector (OO, CHOPT, ±%, MIN/MAX) and unit dropdown */
const OPS_QTY_TOLERANCE_PCTS = ['2.5', '5', '7.5', '10', '15'];

function VdCpQuantity({ label, value, onValue, option, onOption, min, onMin, max, onMax, tolerancePct, onTolerancePct, unit, onUnit, units }: { label: string; value: string; onValue: (v: string) => void; option: string; onOption: (v: string) => void; min: string; onMin: (v: string) => void; max: string; onMax: (v: string) => void; tolerancePct: string; onTolerancePct: (v: string) => void; unit: string; onUnit: (v: string) => void; units: string[] }) {
  const base = num(value);
  const pct = num(tolerancePct);
  const pctMin = base && pct ? base * (1 - pct / 100) : 0;
  const pctMax = base && pct ? base * (1 + pct / 100) : 0;
  return (
    <label className="fv-ops__vd-field fv-ops__vd-field--cpqty">
      <span>{label}</span>
      <div className="fv-ops__vd-cpqty">
        <span className="fv-ops__vd-unitwrap fv-ops__vd-unitwrap--triple">
          <input className="fv-ops__vd-in" inputMode="decimal" value={value} onChange={(e) => onValue(e.target.value)} placeholder="Qty" />
          <select className="fv-ops__vd-unit" value={unit} onChange={(e) => onUnit(e.target.value)}>
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <select className="fv-ops__vd-unit" value={option} onChange={(e) => onOption(e.target.value)} title="OO=Option On, CHOPT=Charterer's Option, ±%=Percentage tolerance, MIN/MAX=Min/Max range">
            <option value="OO">OO</option>
            <option value="CHOPT">CHOPT</option>
            <option value="PERCENT">± %</option>
            <option value="RANGE">MIN/MAX</option>
          </select>
        </span>
        {option === 'PERCENT' && (
          <div className="fv-ops__vd-field--range">
            <span className="fv-ops__vd-range-label">Tolerance (± %)</span>
            <span className="fv-ops__vd-unitwrap fv-ops__vd-unitwrap--pct">
              <span className="fv-ops__vd-pct-pm">±</span>
              <input className="fv-ops__vd-in" inputMode="decimal" placeholder="%" value={tolerancePct} onChange={(e) => onTolerancePct(e.target.value)} list="ops-qty-tolerance-pcts" />
              <span className="fv-ops__vd-pct-suffix">%</span>
            </span>
            <datalist id="ops-qty-tolerance-pcts">
              {OPS_QTY_TOLERANCE_PCTS.map((p) => <option key={p} value={p} />)}
            </datalist>
            {base > 0 && pct > 0 && (
              <span className="fv-ops__vd-pct-range">{fmt(pctMin, 0)} – {fmt(pctMax, 0)} {unit}</span>
            )}
          </div>
        )}
        {option === 'RANGE' && (
          <div className="fv-ops__vd-field--range">
            <span className="fv-ops__vd-range-label">Tolerance Range</span>
            <span className="fv-ops__vd-unitwrap fv-ops__vd-unitwrap--range">
              <input className="fv-ops__vd-in" inputMode="decimal" placeholder="Min" value={min} onChange={(e) => onMin(e.target.value)} />
              <span className="fv-ops__vd-range-to">to</span>
              <input className="fv-ops__vd-in" inputMode="decimal" placeholder="Max" value={max} onChange={(e) => onMax(e.target.value)} />
              <select className="fv-ops__vd-unit" value={unit} onChange={(e) => onUnit(e.target.value)}>
                {units.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </span>
          </div>
        )}
      </div>
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
        <ModuleVesselSearch />
        <i className="fas fa-ship" aria-hidden="true" />
        <div>
          <span className="fv-ops__recap-sub fv-ops__recap-details">
            {recap.voyageFixType} · {account} / CPDD {recap.cpDate || cpdd || '—'} - {portFrom} - {portTo}
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

export function VoyageDetailsTab({ recap, setRecap, voyage, status }: { recap: Recap; setRecap: Dispatch<SetStateAction<Recap>>; voyage: Voyage; status: string }) {
  // Voyage Details is the master entry point: editing a canonical field here also
  // propagates to the same value stored in the nested laytime/bunker structures.
  const set = (k: keyof Recap, v: string) => setRecap((r) => {
    const next = { ...r, [k]: v } as Recap;
    const fl = r.freightLaytime;
    const flValid = fl && Array.isArray(fl.laytimes) && Array.isArray(fl.invoices);
    if (flValid && (k === 'loadRate' || k === 'dischRate')) {
      const op = k === 'loadRate' ? 'Load' : 'Discharge';
      next.freightLaytime = { ...fl, laytimes: fl.laytimes.map((p) => (p.op === op ? { ...p, rate: String(num(v)) } : p)) };
    } else if (flValid && (k === 'demDespatch' || k === 'despatchTerm')) {
      const demRate = num(k === 'demDespatch' ? v : r.demDespatch);
      const despRate = /half/i.test(k === 'despatchTerm' ? v : r.despatchTerm) ? demRate / 2 : demRate;
      next.freightLaytime = { ...fl, laytimes: fl.laytimes.map((p) => ({ ...p, demurrageRate: String(demRate), despatchRate: String(despRate) })) };
    } else if (flValid && k === 'finalQtyLoaded') {
      const blQty = num(v);
      const dischCount = Math.max(1, fl.laytimes.filter((p) => p.op === 'Discharge').length);
      next.freightLaytime = { ...fl, laytimes: fl.laytimes.map((p) => ({ ...p, quantity: String(Math.round(p.op === 'Load' ? blQty : blQty / dischCount)) })) };
    }
    if (Array.isArray(r.bunkers) && (k === 'foPrice' || k === 'doPrice')) {
      const synced = applyGlobalBunkerPrices(next, k === 'foPrice' ? v : next.foPrice, k === 'doPrice' ? v : next.doPrice);
      next.bunkers = synced.bunkers;
    }
    return next;
  });
  // "Bunkers on Delivery" for a Main/Sub/extra fuel grade always reads straight from the Itinerary's
  // starting-ROB fields (same single source of truth used by BunkersCard.bodDisplay) rather than this
  // row's own stored `bod`, so this table can never drift out of sync with the Bunkers card or the
  // ETA & ROB itinerary. Editing here still writes both, for backward-compat storage.
  const ownersBodDisplay = (fuel: BunkerFuel): string => {
    const field = startRobFieldFor(recap.etaPlan.perf, fuel.fuel);
    if (!field) return fuel.bod;
    if (field.kind === 'main') return recap.etaPlan.startRobVlsfo;
    if (field.kind === 'sub') return recap.etaPlan.startRobMgo;
    return recap.etaPlan.startRobExtra?.[field.extraId as string] ?? '';
  };
  const extraLegs = recap.additionalVoyageLegs ?? [];
  const normalizeRotationType = (value: string) => ({ Bunkering: 'Bunker', 'Bunker Port': 'Bunker', Redelivery: 'ReDelivery', 'Dry Dock': 'DryDock', Waiting: 'Idle / Waiting', Idle: 'Idle / Waiting', Other: 'Idle / Waiting', Port: 'Idle / Waiting' } as Record<string, string>)[value] || value;
  const rotationType = (key: string, fallback: string) => normalizeRotationType(recap.portRotationTypes?.[key] || fallback);
  const isRotationDeleted = (key: string) => recap.portRotationDeleted?.[key] === true;
  const setRotationType = (key: string, value: string) => setRecap((r) => ({
    ...r,
    portRotationTypes: { ...(r.portRotationTypes ?? {}), [key]: value },
    portRotationDeleted: { ...(r.portRotationDeleted ?? {}), [key]: false },
  }));
  useEffect(() => {
    const stale = (recap.additionalVoyageLegs ?? []).filter((leg) => leg.id.startsWith('canonical-'));
    if (!stale.length) return;
    const keys = stale.map((leg) => leg.id.replace(/^canonical-/, ''));
    setRecap((r) => ({
      ...r,
      additionalVoyageLegs: (r.additionalVoyageLegs ?? []).filter((leg) => !leg.id.startsWith('canonical-')),
      portRotationDeleted: { ...(r.portRotationDeleted ?? {}), ...Object.fromEntries(keys.map((key) => [key, false])) },
    }));
  }, [recap.additionalVoyageLegs, setRecap]);
  const deleteRotation = (key: string) => setRecap((r) => ({ ...r, portRotationDeleted: { ...(r.portRotationDeleted ?? {}), [key]: true } }));
  const rotOverride = (key: string) => recap.portRotationOverrides?.[key] ?? {};
  const setRotOverride = (key: string, patch: Partial<{ term: string; dateTime: string; rate: string; pda: string; notice: string; loi: string; loiStatus: string; qty: string; qtyUnit: string; blDate: string }>) =>
    setRecap((r) => ({ ...r, portRotationOverrides: { ...(r.portRotationOverrides ?? {}), [key]: { ...(r.portRotationOverrides?.[key] ?? {}), ...patch } } }));
  /**
   * Renders a port-rotation row whose Type has been switched away from its native
   * role (e.g. a Discharge row set to ReDelivery). Fields shown — and their
   * storage (in `portRotationOverrides`) — follow the SELECTED type only, so the
   * row's native fields (recap.dischRate, etc.) are left untouched and restored if
   * the user switches the Type back.
   */
  const renderGenericRotationRow = (key: string, className: string, selectedType: string, port: string, onPort: (v: string) => void) => {
    const ov = rotOverride(key);
    const category = (selectedType === 'Delivery' || selectedType === 'ReDelivery') ? 'delivery'
      : /bunker/i.test(selectedType) ? 'bunker'
      : selectedType === 'Loading' ? 'loading'
      : 'cargo';
    const noticeDays = (ov.notice || '').split(/[^\d]+/).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n));
    const setNoticeDays = (days: number[]) => setRotOverride(key, { notice: Array.from(new Set(days)).sort((a, b) => b - a).join('-') });
    return (
      <div className={className} key={key}>
        <VdSelect label="Type" value={selectedType} onChange={(v) => (v === 'Delete leg' ? deleteRotation(key) : setRotationType(key, v))} options={OPS_PORT_ROTATION_TYPES} />
        <VdPort label="Port" value={port} onChange={onPort} ports={worldPorts} accent />
        <VdSelect
          label={category === 'bunker' ? 'Supply Terms' : category === 'delivery' ? `${selectedType} Terms` : 'NOR'}
          value={ov.term ?? ''}
          onChange={(v) => setRotOverride(key, { term: v })}
          options={category === 'bunker' ? ['By arrangement', 'Upon arrival', 'Upon berthing', 'Before departure'] : category === 'delivery' ? OPS_BERTH_TERMS : OPS_NOR_TENDER_TERMS}
        />
        {category === 'delivery' ? (
          <VdDateTime label={`${selectedType} Date & Time UTC`} value={ov.dateTime ?? ''} onChange={(v) => setRotOverride(key, { dateTime: v })} accent />
        ) : (
          <div className="fv-ops__legs-stack">
            <VdDateTime label={category === 'bunker' ? 'Bunker Supply Schedule' : 'Date & Time UTC'} value={ov.dateTime ?? ''} onChange={(v) => setRotOverride(key, { dateTime: v })} />
            <VdField label={category === 'bunker' ? 'Supply Qty / Rate' : category === 'loading' ? 'Load Rate' : selectedType === 'Discharging' ? 'Disch. Rate' : 'Rate'} value={ov.rate ?? ''} onChange={(v) => setRotOverride(key, { rate: v })} num />
            <VdField label={category === 'bunker' ? 'Bunker PDA' : 'PDA'} value={ov.pda ?? ''} onChange={(v) => setRotOverride(key, { pda: v })} num />
          </div>
        )}
        <div className="fv-ops__legs-stack">
          {category === 'delivery' ? (
            <div className="fv-ops__legs-notice">
              <span className="fv-ops__vd-field-label">Notice</span>
              {noticeDays.map((d) => <span key={d} className="fv-ops__vd-chip">{d}<button type="button" aria-label={`Remove ${d} day notice`} onClick={() => setNoticeDays(noticeDays.filter((x) => x !== d))}><i className="fas fa-xmark" aria-hidden="true" /></button></span>)}
              <select className="fv-ops__vd-unit" value="" aria-label={`Add ${selectedType.toLowerCase()} notice`} onChange={(e) => { if (e.target.value) { setNoticeDays([...noticeDays, parseInt(e.target.value, 10)]); e.currentTarget.value = ''; } }}>
                <option value="">+</option>
                {OPS_NOTICE_DAYS.filter((d) => !noticeDays.includes(d)).map((d) => <option key={d} value={d}>{d} days</option>)}
              </select>
            </div>
          ) : category === 'bunker' ? (
            <>
              <VdField label="Fuel Grade / Notice" value={ov.notice ?? ''} onChange={(v) => setRotOverride(key, { notice: v })} />
              <VdField label="Barge Name" value={ov.loi ?? ''} onChange={(v) => setRotOverride(key, { loi: v })} />
            </>
          ) : category === 'loading' ? (
            <>
              <VdValueUnit className="fv-ops__bl-qty" label="Final Qty Loaded / BL" value={ov.qty ?? ''} onValue={(v) => setRotOverride(key, { qty: v })} unit={ov.qtyUnit || 'MT'} onUnit={(v) => setRotOverride(key, { qtyUnit: v })} units={OPS_QTY_UNITS} accent num />
              <VdDate label="BL Issue Date" value={ov.blDate ?? ''} onChange={(v) => setRotOverride(key, { blDate: v })} />
            </>
          ) : (
            <>
              <VdSelect label="LOI / OBL" value={ov.loi ?? ''} onChange={(v) => setRotOverride(key, { loi: v })} options={OPS_LOI_OBL} />
              {ov.loi === 'LOI' && <VdSelect label="LOI Status" value={ov.loiStatus ?? ''} onChange={(v) => setRotOverride(key, { loiStatus: v })} options={OPS_LOI_STATUS} />}
            </>
          )}
          <button type="button" className="fv-ops__vd-sp-rm" aria-label="Remove leg" onClick={() => deleteRotation(key)}><i className="fas fa-trash" aria-hidden="true" /></button>
        </div>
      </div>
    );
  };
  const splitPorts = (value: string) => (value || '').split(/\s*(?:\+|\/|,|;)\s*/).map((port) => port.trim()).filter(Boolean);
  
  // Update port - changes stay in Operations module only, do NOT sync back to Chartering
  const updatePortPart = (field: 'loadPort' | 'dischargePort', index: number, value: string) => setRecap((r) => {
    const ports = splitPorts(r[field]);
    ports[index] = value;
    return { ...r, [field]: ports.join(' + ') };
  });
  const dischargeDetails = recap.dischargePortDetails ?? [];
  const updateDischargeDetail = (index: number, patch: Partial<{ loiObl: string; loiStatus: string }>) => setRecap((r) => ({
    ...r,
    dischargePortDetails: splitPorts(r.dischargePort).map((_, detailIndex) => ({
      loiObl: r.dischargePortDetails?.[detailIndex]?.loiObl ?? r.loiOblDPort,
      loiStatus: r.dischargePortDetails?.[detailIndex]?.loiStatus ?? r.loiStatus,
      ...(detailIndex === index ? patch : {}),
    })),
  }));
  const addVoyageLeg = () => setRecap((r) => ({ ...r, additionalVoyageLegs: [...(r.additionalVoyageLegs ?? []), { id: `leg-${Date.now()}`, type: 'Other', port: '', term: '', rate: '', pda: '', dateTime: '', notice: '', loi: '', loiStatus: '' }] }));
  const updateVoyageLeg = (id: string, patch: Partial<NonNullable<Recap['additionalVoyageLegs']>[number]>) => setRecap((r) => ({ ...r, additionalVoyageLegs: (r.additionalVoyageLegs ?? []).map((leg) => leg.id === id ? { ...leg, ...patch } : leg) }));
  const removeVoyageLeg = (id: string) => setRecap((r) => ({ ...r, additionalVoyageLegs: (r.additionalVoyageLegs ?? []).filter((leg) => leg.id !== id) }));

  const OPS_ALLOWED_VOYAGE_TYPES = [
    'TCIN-TCOUT',
    'TCIN-VOUT',
    'TCIN-TCTOUT',
    'TCTIN-TCTOUT',
    'TCTIN-VOUT',
    'VIN-VOUT',
    'OWN-TCOUT',
    'OWN-VOUT',
    'OWN-TCTOUT',
  ];

  const voyageType = (recap.voyageFixType || '').toUpperCase();
  const [inType = '', outType = ''] = voyageType.split('-');
  const hasTcIn = inType === 'TCIN' || inType === 'TCTIN';
  const hasVin = inType === 'VIN';
  const outIsTime = outType === 'TCOUT' || outType === 'TCTOUT';
  const outIsVoyage = outType === 'VOUT';
  const showDualHire = hasTcIn && outIsTime && !hasVin && !outIsVoyage;

  const showDelivery = hasTcIn || outIsTime;
  const showVoyageCargo = hasVin || outIsVoyage;
  const showLoadDischarge = hasVin || outIsVoyage;
  const showFreightFields = outIsVoyage;
  const showChartererLaycan = outIsTime;
  const showHireFields = hasTcIn || outIsTime;
  const showLaytimeTerms = hasVin || outIsVoyage;
  const cpFuelTypes = Array.from(new Set((recap.bunkers ?? []).map((fuel) => fuel.fuel.trim()).filter(Boolean))).length > 0
    ? Array.from(new Set((recap.bunkers ?? []).map((fuel) => fuel.fuel.trim()).filter(Boolean)))
    : ['FO', 'DO'];
  const cpConsumptionFor = (fuel: string, index: number) => recap.cpConsByFuel?.[fuel] ?? (index === 0 ? recap.cpCons : '');
  const setCpConsumption = (fuel: string, value: string, index: number) => setRecap((current) => ({
    ...current,
    cpCons: index === 0 ? value : current.cpCons,
    cpConsByFuel: { ...(current.cpConsByFuel ?? {}), [fuel]: value },
  }));

  // Counterparty / service-provider options sourced from Settings → Account Details; reactive so a
  // backend sync or an edit made elsewhere shows up here without needing a page reload.
  const clients = useClients();
  const worldPorts = useWorldPorts();
  // Actual port DA from the Freight & Laytime PDA/FDA settlement, reflected read-only
  // into the PDA fields below when a figure has been entered there.
  const settlementDa = settlementPortDa(recap);
  const pdaFieldFor = (port: string, fallbackKey: 'pdaLoadPort' | 'pdaDPort') => {
    const amt = settlementDa.byPort.get((port || '').trim().toUpperCase());
    if (settlementDa.hasData && amt != null && amt > 0) {
      return (
        <label className="fv-ops__vd-field">
          <span>PDA / FDA</span>
          <input className="fv-ops__vd-in" readOnly value={money(amt)} title="Actual from Freight & Laytime PDA/FDA settlement" />
        </label>
      );
    }
    return <VdField label="PDA" value={recap[fallbackKey]} onChange={(v) => set(fallbackKey, v)} />;
  };
  // Vessel options sourced from Settings → Vessels Details (name + master email); reactive so a
  // backend sync or an edit made elsewhere shows up here without needing a page reload.
  const vessels = useVessels();
  const vesselNames = useMemo(() => vessels.map((v) => v.name.trim()).filter(Boolean), [vessels]);
  const vesselEmails = useMemo(() => Array.from(new Set(vessels.map((v) => v.email.trim()).filter(Boolean))), [vessels]);
  const pickVessel = (name: string) => {
    set('vesselName', name);
    const match = vessels.find((v) => v.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (match?.email) { set('vesselEmail', match.email); syncVesselEmail(match.email); }
  };
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
      if (next[idx].id) void vesselsApi.update(next[idx].id, next[idx]).catch(() => { /* local fallback */ });
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
      if (next[idx].id) void clientsApi.update(next[idx].id, clientToUpdateDto(next[idx])).catch(() => { /* local fallback */ });
    }
  };

  // Voyage operational status now lives in the top header; used here for the timeline.
  const fixtureNos = useFixtureNumbers();
  const fixtureNo = fixtureNos[voyage.id] ?? voyage.id;

  const strip: { label: string; value: string }[] = [
    { label: 'Fixture No.', value: fixtureNo },
    { label: 'Vessel', value: recap.vesselName || voyage.vessel },
    { label: 'Voyage Type', value: recap.voyageFixType || '—' },
    ...(showVoyageCargo ? [{ label: 'Cargo', value: recap.cargoName || voyage.service || '—' }] : []),
    ...(showHireFields ? [{ label: 'Hire / Day', value: `${recap.hireCurrency || 'USD'} ${recap.hirePerDay || voyage.costPerDay || voyage.price || ''}`.trim() || '—' }] : []),
    ...(showDualHire ? [{ label: 'Sub-Hire / Day', value: `${recap.charterHireCurrency} ${recap.charterHirePerDay}`.trim() || '—' }] : []),
    ...(showFreightFields ? [{ label: 'Freight Rate', value: `${recap.freightCurrency || 'USD'} ${recap.freightPerMt || voyage.price || ''} / ${recap.cargoQtyUnit || 'MT'}`.trim() || '—' }] : []),
    ...(showDelivery ? [{ label: 'Delivery Port', value: recap.deliveryPort || voyage.portFrom || '—' }] : []),
    ...(showDelivery ? [{ label: 'Redelivery Port', value: recap.redeliveryPort || voyage.portTo || '—' }] : []),
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
        <Card title="Fixture & Vessel" icon="fa-ship" className="fv-ops__fixture-card">
          <div className="fv-ops__vd-fields fv-ops__fixture-fields">
            <label className="fv-ops__vd-field">
              <span>Vessel Name</span>
              <VdAutocomplete value={recap.vesselName} onChange={pickVessel} options={vesselNames.map((n) => ({ value: n }))} inputClass="fv-ops__vd-in fv-ops__vd-in--accent" />
            </label>
            <label className="fv-ops__vd-field">
              <span>Vessel Email</span>
              <VdAutocomplete value={recap.vesselEmail} onChange={(v) => { set('vesselEmail', v); syncVesselEmail(v); }} options={vesselEmails.map((e) => ({ value: e }))} placeholder="master.vessel@…" />
            </label>
            <VdSelect label="Voyage / Fix Type" value={recap.voyageFixType} onChange={(v) => set('voyageFixType', v)} options={OPS_ALLOWED_VOYAGE_TYPES} />
            {showVoyageCargo && <VdCombo label="Cargo Name" value={recap.cargoName} onChange={(v) => set('cargoName', v)} options={OPS_COMMON_CARGOES} accent />}
            {showVoyageCargo && (
              <VdCpQuantity
                label="CP Quantity"
                value={recap.cpQuantity}
                onValue={(v) => set('cpQuantity', v)}
                option={recap.cpQuantityOption}
                onOption={(v) => set('cpQuantityOption', v)}
                min={recap.cpQuantityMin ?? ''}
                onMin={(v) => set('cpQuantityMin', v)}
                max={recap.cpQuantityMax ?? ''}
                onMax={(v) => set('cpQuantityMax', v)}
                tolerancePct={recap.cpQuantityTolerancePct ?? ''}
                onTolerancePct={(v) => set('cpQuantityTolerancePct', v)}
                unit={recap.cargoQtyUnit}
                onUnit={(v) => set('cargoQtyUnit', v)}
                units={OPS_QTY_UNITS}
              />
            )}
            <div style={{ gridColumn: '1 / -1', height: '1px' }}></div>
            {showVoyageCargo && <VdSelect label="Hold Cleaning" value={recap.holdCleaning} onChange={(v) => set('holdCleaning', v)} options={OPS_HOLD_CLEANING} />}
            {!showVoyageCargo && <div></div>}
            <VdField label="CP Speed (kn)" value={recap.cpSpeed} onChange={(v) => set('cpSpeed', v)} num />
            {cpFuelTypes.map((fuel, index) => (
              <VdField key={fuel} label={`CP Consumption - ${fuel} (MT/day)`} value={cpConsumptionFor(fuel, index)} onChange={(v) => setCpConsumption(fuel, v, index)} num />
            ))}
            <VdField label="No. of Holds" value={recap.holdCount || ''} onChange={(v) => set('holdCount', v)} num />
            {showDelivery && (
              <label className="fv-ops__vd-field">
                <span>Voyage Duration (days)</span>
                <input className="fv-ops__vd-in" readOnly value={fmt(daysBetween(parseDMY(recap.deliveryDateTime), parseDMY(recap.redeliveryDateTime)), 2)} title="Delivery → Redelivery" />
              </label>
            )}
            {!showDelivery && <div></div>}
          </div>
        </Card>

        <Card title="Vessel Profile" icon="fa-id-card" span2 className="fv-ops__vd-vessel-profile">
          <div className="fv-ops__vd-sub-head"><i className="fas fa-ruler-combined" aria-hidden="true" /> Vessel &amp; Engine Details</div>
          <div className="fv-ops__vd-fields">
            <VdField label="IMO Number" value={recap.vesselImo || voyage.imo || ''} onChange={(v) => set('vesselImo', v)} />
            <VdField label="LOA (m)" value={recap.vesselLoa || voyage.loa || ''} onChange={(v) => set('vesselLoa', v)} num />
            <VdField label="Beam (m)" value={recap.vesselBeam || voyage.beam || ''} onChange={(v) => set('vesselBeam', v)} num />
            <VdField label="Default Draft — Ballast (m)" value={recap.draftBallast || ''} onChange={(v) => set('draftBallast', v)} num />
            <VdField label="Default Draft — Laden (m)" value={recap.draftLaden || ''} onChange={(v) => set('draftLaden', v)} num />
            <VdField label="Engine RPM Min" value={recap.engineRpmMin || ''} onChange={(v) => set('engineRpmMin', v)} num />
            <VdField label="Engine RPM Max" value={recap.engineRpmMax || ''} onChange={(v) => set('engineRpmMax', v)} num />
            <VdField label="MCR Min (kW)" value={recap.engineMcrMin || ''} onChange={(v) => set('engineMcrMin', v)} num />
            <VdField label="MCR Max (kW)" value={recap.engineMcrMax || voyage.enginePower || ''} onChange={(v) => set('engineMcrMax', v)} num />
          </div>
          <div className="fv-ops__vd-sub-head"><i className="fas fa-gears" aria-hidden="true" /> Scrubber, Cranes &amp; Grabs</div>
          <div className="fv-ops__vd-fields">
            <VdField label="Scrubber Fitted" value={recap.scrubberFitted || 'No'} onChange={(v) => set('scrubberFitted', v)} />
            <VdField label="Scrubber Type" value={recap.scrubberType || ''} onChange={(v) => set('scrubberType', v)} />
            <VdField label="Number of Cranes" value={recap.craneCount || ''} onChange={(v) => set('craneCount', v)} num />
            <VdField label="Crane SWL (MT)" value={recap.craneSwl || ''} onChange={(v) => set('craneSwl', v)} num />
            <VdField label="Crane Safe Limit (MT)" value={recap.craneSafeLimit || ''} onChange={(v) => set('craneSafeLimit', v)} num />
            <VdField label="Number of Grabs" value={recap.grabCount || ''} onChange={(v) => set('grabCount', v)} num />
            <VdField label="Grab Weight (MT)" value={recap.grabWeight || ''} onChange={(v) => set('grabWeight', v)} num />
            <VdField label="Grab Safety Limit (MT)" value={recap.grabSafeLimit || ''} onChange={(v) => set('grabSafeLimit', v)} num />
          </div>
        </Card>

        <Card title="Owners" icon="fa-building">
          <div className="fv-ops__owners-layout">
          <div className="fv-ops__owners-main">
          <div className="fv-ops__vd-fields">
            <VdCombo label="Owners" value={recap.owners} onChange={(v) => set('owners', v)} options={ownerNames} accent />
            <VdCombo label="Owners Broker" value={recap.ownersBroker} onChange={(v) => set('ownersBroker', v)} options={brokerNames} />
            <VdDate label="CP Date" value={recap.cpDate} onChange={(v) => set('cpDate', v)} />
            {showHireFields && <VdValueUnit label="Hire Per Day (PDPR)" value={recap.hirePerDay} onValue={(v) => set('hirePerDay', v)} unit={recap.hireCurrency} onUnit={(v) => set('hireCurrency', v)} units={OPS_CURRENCIES} accent num />}
          </div>
          {showHireFields && (
            <div className="fv-ops__owners-laycan">
              <VdDateTime label="Laycan Start" value={recap.laycanStart} onChange={(v) => set('laycanStart', v)} />
              <VdDateTime label="Laycan End" value={recap.laycanEnd} onChange={(v) => set('laycanEnd', v)} />
            </div>
          )}
          </div>
          <div className="fv-ops__owners-bunker">
            <div className="fv-ops__vd-sub-head"><i className="fas fa-gas-pump" aria-hidden="true" /> Bunker Settlement</div>
            <table className="fv-ops__owners-bunker-table"><thead><tr><th>Fuel</th><th>BOD (MT)</th><th>BOR (MT)</th><th>CP Price (USD/MT)</th></tr></thead><tbody>
            {recap.bunkers.map((fuel, index) => (
              <tr key={`${fuel.fuel}-${index}`}><td>{fuel.fuel || 'Fuel'}</td><td><input className="fv-ops__vd-in" inputMode="decimal" value={ownersBodDisplay(fuel)} onChange={(e) => { const v = e.target.value; setRecap((current) => { const bunkers = current.bunkers.map((line, lineIndex) => (lineIndex === index ? { ...line, bod: v } : line)); const field = startRobFieldFor(current.etaPlan.perf, fuel.fuel); if (!field) return { ...current, bunkers }; const etaPlan = field.kind === 'main' ? { ...current.etaPlan, startRobVlsfo: v } : field.kind === 'sub' ? { ...current.etaPlan, startRobMgo: v } : { ...current.etaPlan, startRobExtra: { ...(current.etaPlan.startRobExtra ?? {}), [field.extraId as string]: v } }; return { ...current, bunkers, etaPlan }; }); }} /></td><td><input className="fv-ops__vd-in" inputMode="decimal" value={fuel.actualBor} onChange={(e) => setRecap((current) => ({ ...current, bunkers: current.bunkers.map((line, lineIndex) => lineIndex === index ? { ...line, actualBor: e.target.value } : line) }))} /></td><td><input className="fv-ops__vd-in" inputMode="decimal" value={cpPriceFor(recap, fuel.fuel)} onChange={(e) => setRecap((current) => applyCpPriceEdit(current, index, e.target.value))} /></td></tr>
            ))}
            </tbody></table>
          </div>
          </div>
          {showHireFields && (
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
          )}
        </Card>

        <Card title="Sub Charter — Charterers" icon="fa-handshake">
          <div className="fv-ops__vd-fields">
            <VdCombo label="Charterers" value={recap.charterers} onChange={(v) => set('charterers', v)} options={chartererNames} accent />
            <VdCombo label="Charterers Broker" value={recap.charterersBroker} onChange={(v) => set('charterersBroker', v)} options={brokerNames} />
            <VdDate label="Charterers CP Date" value={recap.charterersCpDate} onChange={(v) => set('charterersCpDate', v)} />
            {showDualHire && <VdValueUnit label="Hire Per Day (PDPR)" value={recap.charterHirePerDay} onValue={(v) => set('charterHirePerDay', v)} unit={recap.charterHireCurrency} onUnit={(v) => set('charterHireCurrency', v)} units={OPS_CURRENCIES} accent num />}
            {showFreightFields && <VdValueUnit label="Freight / MT" value={recap.freightPerMt} onValue={(v) => set('freightPerMt', v)} unit={recap.freightCurrency} onUnit={(v) => set('freightCurrency', v)} units={OPS_CURRENCIES} accent num />}
          </div>
          {showChartererLaycan && (
            <div className="fv-ops__vd-dr">
              <div className="fv-ops__vd-dr-col">
                <VdDateTime label="Charterers Laycan Start" value={recap.charterersLaycanStart} onChange={(v) => set('charterersLaycanStart', v)} />
              </div>
              <div className="fv-ops__vd-dr-col">
                <VdDateTime label="Charterers Laycan End" value={recap.charterersLaycanEnd} onChange={(v) => set('charterersLaycanEnd', v)} />
              </div>
            </div>
          )}
          {showFreightFields && (
            <div className="fv-ops__vd-sub">
              <div className="fv-ops__vd-sub-head"><i className="fas fa-file-invoice-dollar" aria-hidden="true" /> Freight Payment</div>
              <div className="fv-ops__vd-inline fv-ops__vd-inline--tight">
                <span>Within</span>
                <select className="fv-ops__vd-unit" value={String(Math.max(1, num(recap.freightPaymentDays) || 1))} onChange={(e) => set('freightPaymentDays', e.target.value)}>{OPS_BANKING_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
                <select className="fv-ops__vd-unit fv-ops__vd-unit--wide" value={recap.freightPaymentBasis} onChange={(e) => set('freightPaymentBasis', e.target.value)}>{OPS_PAYMENT_BASES.map((b) => <option key={b} value={b}>{b}</option>)}</select>
                <span>after loading / BL</span>
              </div>
            </div>
          )}
          {showDualHire && (
            <div className="fv-ops__vd-sub">
              <div className="fv-ops__vd-sub-head"><i className="fas fa-money-check-dollar" aria-hidden="true" /> Hire Payment</div>
              <div className="fv-ops__vd-inline fv-ops__vd-inline--tight">
                <span>1st hire covers</span>
                <select className="fv-ops__vd-unit" value={recap.charterFirstHirePeriodDays} onChange={(e) => set('charterFirstHirePeriodDays', e.target.value)}>{OPS_HIRE_INTERVALS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
                <span>days, including</span>
                <select className="fv-ops__vd-unit fv-ops__vd-unit--wide" value={recap.charterFirstHireInclude} onChange={(e) => set('charterFirstHireInclude', e.target.value)}>{OPS_HIRE_INCLUDE.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                <span>, payable within</span>
                <select className="fv-ops__vd-unit" value={recap.charterFirstHireDays} onChange={(e) => set('charterFirstHireDays', e.target.value)}>{OPS_BANKING_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
                <select className="fv-ops__vd-unit fv-ops__vd-unit--wide" value={recap.charterFirstHireBasis} onChange={(e) => set('charterFirstHireBasis', e.target.value)}>{OPS_PAYMENT_BASES.map((b) => <option key={b} value={b}>{b}</option>)}</select>
                <span>, then every</span>
                <select className="fv-ops__vd-unit" value={recap.charterHireEveryDays} onChange={(e) => set('charterHireEveryDays', e.target.value)}>{OPS_HIRE_INTERVALS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
                <span>days in advance</span>
              </div>
            </div>
          )}
        </Card>

        {(showDelivery || showLoadDischarge) && <Card title="Ports - Del / Redel / Load / Disch" icon="fa-route" className="fv-ops__vd-voyage-legs" right={<button type="button" className="fv-ops__btn fv-ops__btn--sm" onClick={addVoyageLeg}><i className="fas fa-plus" aria-hidden="true" /> Add Leg</button>}>
          <div className="fv-ops__legs-table">
            <div className="fv-ops__legs-head"><span>Type</span><span>Port</span><span>Delivery / NOR Terms</span><span>Date &amp; Time UTC / Rate / PDA</span><span>Notice / LOI-OBL / Status</span></div>
            {showDelivery && <>
              {rotationType('delivery', 'Delivery') === 'Delivery' ? (
                <div className="fv-ops__legs-row fv-ops__legs-row--delivery" style={{ display: isRotationDeleted('delivery') ? 'none' : undefined }}><VdSelect label="Type" value={rotationType('delivery', 'Delivery')} onChange={(v) => setRotationType('delivery', v)} options={OPS_PORT_ROTATION_TYPES} /><VdPort label="Port" value={recap.deliveryPort} onChange={(v) => set('deliveryPort', v)} ports={worldPorts} accent /><VdSelect label="Term" value={recap.deliveryTerm} onChange={(v) => set('deliveryTerm', v)} options={OPS_BERTH_TERMS} /><VdDateTime label="Delivery Date & Time UTC" value={recap.deliveryDateTime} onChange={(v) => set('deliveryDateTime', v)} accent /><div className="fv-ops__legs-notice">{delNotices.map((d) => <span key={d} className="fv-ops__vd-chip">{d}<button type="button" aria-label={`Remove ${d} day delivery notice`} onClick={() => setDelNotices(delNotices.filter((x) => x !== d))}><i className="fas fa-xmark" aria-hidden="true" /></button></span>)}<select className="fv-ops__vd-unit" value="" aria-label="Add delivery notice" onChange={(e) => { if (e.target.value) { setDelNotices([...delNotices, parseInt(e.target.value, 10)]); e.currentTarget.value = ''; } }}><option value="">+</option>{OPS_NOTICE_DAYS.filter((d) => !delNotices.includes(d)).map((d) => <option key={d} value={d}>{d} days</option>)}</select></div></div>
              ) : renderGenericRotationRow('delivery', 'fv-ops__legs-row fv-ops__legs-row--delivery', rotationType('delivery', 'Delivery'), recap.deliveryPort, (v) => set('deliveryPort', v))}
              {rotationType('redelivery', 'ReDelivery') === 'ReDelivery' ? (
                <div className="fv-ops__legs-row fv-ops__legs-row--redelivery" style={{ display: isRotationDeleted('redelivery') ? 'none' : undefined }}><VdSelect label="Type" value={rotationType('redelivery', 'ReDelivery')} onChange={(v) => setRotationType('redelivery', v)} options={OPS_PORT_ROTATION_TYPES} /><VdPort label="Port" value={recap.redeliveryPort} onChange={(v) => set('redeliveryPort', v)} ports={worldPorts} accent /><VdSelect label="Term" value={recap.redeliveryTerm} onChange={(v) => set('redeliveryTerm', v)} options={OPS_BERTH_TERMS} /><div className="fv-ops__legs-stack"><VdDateTime label="Redelivery Date & Time UTC" value={recap.redeliveryDateTime} onChange={(v) => setRecap((r) => ({ ...r, redeliveryDateTime: v, redeliveryDateManual: true }))} accent title={recap.redeliveryDateManual ? 'Manually set \u2014 click Auto to resync from the ETA & ROB itinerary\'s final port arrival.' : 'Auto-synced from the ETA & ROB itinerary\'s final port arrival \u2014 edit here to override.'} />{recap.redeliveryDateManual && recap.etaPlan.legs.length > 0 && <button type="button" className="fv-ops__btn fv-ops__btn--sm" onClick={() => setRecap((r) => ({ ...r, redeliveryDateManual: false }))} title="Resync from the ETA & ROB itinerary's final port arrival"><i className="fas fa-arrows-rotate" aria-hidden="true" /> Auto</button>}</div><div className="fv-ops__legs-notice">{notices.map((d) => <span key={d} className="fv-ops__vd-chip">{d}<button type="button" aria-label={`Remove ${d} day notice`} onClick={() => setNotices(notices.filter((x) => x !== d))}><i className="fas fa-xmark" aria-hidden="true" /></button></span>)}<select className="fv-ops__vd-unit" value="" aria-label="Add redelivery notice" onChange={(e) => { if (e.target.value) { setNotices([...notices, parseInt(e.target.value, 10)]); e.currentTarget.value = ''; } }}><option value="">+</option>{OPS_NOTICE_DAYS.filter((d) => !notices.includes(d)).map((d) => <option key={d} value={d}>{d} days</option>)}</select></div></div>
              ) : renderGenericRotationRow('redelivery', 'fv-ops__legs-row fv-ops__legs-row--redelivery', rotationType('redelivery', 'ReDelivery'), recap.redeliveryPort, (v) => set('redeliveryPort', v))}
            </>}
            {showLoadDischarge && <>
              {splitPorts(recap.loadPort).map((port, index) => rotationType(`load-${index}`, 'Loading') === 'Loading' ? (
                <div className="fv-ops__legs-row fv-ops__legs-row--loading" style={{ display: isRotationDeleted(`load-${index}`) ? 'none' : undefined }} key={`load-${index}`}><VdSelect label="Type" value={rotationType(`load-${index}`, 'Loading')} onChange={(v) => setRotationType(`load-${index}`, v)} options={OPS_PORT_ROTATION_TYPES} /><VdPort label="Port" value={port} onChange={(v) => updatePortPart('loadPort', index, v)} ports={worldPorts} accent /><VdSelect label="NOR" value={recap.norAtLoadPort} onChange={(v) => set('norAtLoadPort', v)} options={OPS_NOR_TENDER_TERMS} /><div className="fv-ops__legs-stack"><VdField label="Load Rate" value={recap.loadRate} onChange={(v) => set('loadRate', v)} />{pdaFieldFor(port, 'pdaLoadPort')}</div><div className="fv-ops__legs-stack"><VdValueUnit className="fv-ops__bl-qty" label="Final Qty Loaded / BL" value={recap.finalQtyLoaded} onValue={(v) => set('finalQtyLoaded', v)} unit={recap.cargoQtyUnit} onUnit={(v) => set('cargoQtyUnit', v)} units={OPS_QTY_UNITS} accent num /><VdDate label="BL Issue Date" value={recap.blIssueDate} onChange={(v) => set('blIssueDate', v)} /></div></div>
              ) : renderGenericRotationRow(`load-${index}`, 'fv-ops__legs-row fv-ops__legs-row--loading', rotationType(`load-${index}`, 'Loading'), port, (v) => updatePortPart('loadPort', index, v)))}
              {extraLegs.map((leg) => {
                const rotationType = normalizeRotationType(leg.type);
                const typeOptions = OPS_PORT_ROTATION_TYPES;
                const cargoCall = /load|disch|part load|part discharg/i.test(rotationType);
                const bunkerCall = /bunker/i.test(rotationType);
                const deliveryCall = rotationType === 'Delivery' || rotationType === 'ReDelivery';
                const legNoticeDays = (leg.notice || '').split(/[^\d]+/).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n));
                const setLegNoticeDays = (days: number[]) => updateVoyageLeg(leg.id, { notice: Array.from(new Set(days)).sort((a, b) => b - a).join('-') });
                return <div className="fv-ops__legs-row fv-ops__legs-row--manual" key={leg.id}>
                  <VdSelect label="Type" value={rotationType} onChange={(v) => v === 'Delete leg' ? removeVoyageLeg(leg.id) : updateVoyageLeg(leg.id, { type: v })} options={typeOptions} />
                  <VdPort label="Port" value={leg.port} onChange={(v) => updateVoyageLeg(leg.id, { port: v })} ports={worldPorts} accent />
                  <VdSelect label={bunkerCall ? 'Supply Terms' : cargoCall ? 'NOR / Terms' : deliveryCall ? `${rotationType} Terms` : 'Terms'} value={leg.term} onChange={(v) => updateVoyageLeg(leg.id, { term: v })} options={bunkerCall ? ['By arrangement', 'Upon arrival', 'Upon berthing', 'Before departure'] : cargoCall ? OPS_NOR_TENDER_TERMS : OPS_BERTH_TERMS} />
                  <div className="fv-ops__legs-stack">
                    <VdDateTime label={bunkerCall ? 'Bunker Supply Schedule' : deliveryCall ? `${rotationType} Date & Time UTC` : 'Date & Time UTC'} value={leg.dateTime} onChange={(v) => updateVoyageLeg(leg.id, { dateTime: v })} />
                    {!deliveryCall && <VdField label={bunkerCall ? 'Supply Qty / Rate' : 'Rate'} value={leg.rate} onChange={(v) => updateVoyageLeg(leg.id, { rate: v })} num />}
                    {!deliveryCall && <VdField label={bunkerCall ? 'Bunker PDA' : 'PDA'} value={leg.pda} onChange={(v) => updateVoyageLeg(leg.id, { pda: v })} num />}
                  </div>
                  <div className="fv-ops__legs-stack">
                    {deliveryCall ? <div className="fv-ops__legs-notice"><span className="fv-ops__vd-field-label">Notice</span>{legNoticeDays.map((d) => <span key={d} className="fv-ops__vd-chip">{d}<button type="button" aria-label={`Remove ${d} day notice`} onClick={() => setLegNoticeDays(legNoticeDays.filter((x) => x !== d))}><i className="fas fa-xmark" aria-hidden="true" /></button></span>)}<select className="fv-ops__vd-unit" value="" aria-label={`Add ${rotationType.toLowerCase()} notice`} onChange={(e) => { if (e.target.value) { setLegNoticeDays([...legNoticeDays, parseInt(e.target.value, 10)]); e.currentTarget.value = ''; } }}><option value="">+</option>{OPS_NOTICE_DAYS.filter((d) => !legNoticeDays.includes(d)).map((d) => <option key={d} value={d}>{d} days</option>)}</select></div> : <VdField label={bunkerCall ? 'Fuel Grade / Notice' : 'Notice'} value={leg.notice} onChange={(v) => updateVoyageLeg(leg.id, { notice: v })} />}
                    {!deliveryCall && (bunkerCall ? <VdField label="Barge Name" value={leg.loi} onChange={(v) => updateVoyageLeg(leg.id, { loi: v })} /> : cargoCall ? <VdSelect label="LOI / OBL" value={leg.loi} onChange={(v) => updateVoyageLeg(leg.id, { loi: v })} options={OPS_LOI_OBL} /> : <VdField label="LOI / OBL" value={leg.loi} onChange={(v) => updateVoyageLeg(leg.id, { loi: v })} />)}
                    {!deliveryCall && !bunkerCall && <VdField label="Status" value={leg.loiStatus} onChange={(v) => updateVoyageLeg(leg.id, { loiStatus: v })} />}
                    <button type="button" className="fv-ops__vd-sp-rm" aria-label="Remove leg" onClick={() => removeVoyageLeg(leg.id)}><i className="fas fa-trash" aria-hidden="true" /></button>
                  </div>
                </div>;
              })}
              {splitPorts(recap.dischargePort).map((port, index) => rotationType(`discharge-${index}`, 'Discharging') === 'Discharging' ? (
                <div className="fv-ops__legs-row fv-ops__legs-row--discharge" key={`discharge-${index}`}><VdSelect label="Type" value={rotationType(`discharge-${index}`, 'Discharging')} onChange={(v) => setRotationType(`discharge-${index}`, v)} options={OPS_PORT_ROTATION_TYPES} /><VdPort label="Port" value={port} onChange={(v) => updatePortPart('dischargePort', index, v)} ports={worldPorts} accent /><VdSelect label="NOR" value={recap.norAtDPort} onChange={(v) => set('norAtDPort', v)} options={OPS_NOR_TENDER_TERMS} /><div className="fv-ops__legs-stack"><VdField label="Disch. Rate" value={recap.dischRate} onChange={(v) => set('dischRate', v)} />{pdaFieldFor(port, 'pdaDPort')}</div><div className="fv-ops__legs-stack"><VdSelect label="LOI / OBL" value={dischargeDetails[index]?.loiObl ?? recap.loiOblDPort} onChange={(v) => updateDischargeDetail(index, { loiObl: v })} options={OPS_LOI_OBL} />{(dischargeDetails[index]?.loiObl ?? recap.loiOblDPort) === 'LOI' && <VdSelect label="LOI Status" value={dischargeDetails[index]?.loiStatus ?? recap.loiStatus} onChange={(v) => updateDischargeDetail(index, { loiStatus: v })} options={OPS_LOI_STATUS} />}</div></div>
              ) : renderGenericRotationRow(`discharge-${index}`, 'fv-ops__legs-row fv-ops__legs-row--discharge', rotationType(`discharge-${index}`, 'Discharging'), port, (v) => updatePortPart('dischargePort', index, v)))}
            </>}
          </div>
        </Card>}

        <Card title="Commercial Terms" icon="fa-file-contract">
          <div className="fv-ops__vd-fields">
            {showHireFields && <VdField label="ILOHC" value={recap.ilohc} onChange={(v) => set('ilohc', v)} num />}
            {showHireFields && <VdField label="CVE (per month)" value={recap.cve} onChange={(v) => set('cve', v)} num />}
            <VdField label="ADCOM" value={recap.adcom} onChange={(v) => set('adcom', v)} placeholder="e.g. 3.75%" />
            <VdField label="Brokerage" value={recap.brokerage} onChange={(v) => set('brokerage', v)} />
            <VdField label="P&amp;I Club" value={recap.pniClub} onChange={(v) => set('pniClub', v)} placeholder="e.g. Britannia P&amp;I" />
            <VdField label="Arbitration Place" value={recap.arbitrationPlace} onChange={(v) => set('arbitrationPlace', v)} placeholder="e.g. London" />
            <VdField label="Governing Law" value={recap.governingLaw} onChange={(v) => set('governingLaw', v)} placeholder="e.g. English Law" />
            <VdField label="Sanctions Clause" value={recap.sanctionsClause} onChange={(v) => set('sanctionsClause', v)} placeholder="Applicable sanctions wording" />
            {showHireFields && <VdField label="Ballast Bonus" value={recap.ballastBonus} onChange={(v) => set('ballastBonus', v)} num />}
            {showLaytimeTerms && <VdField label="Demurrage / Day" value={recap.demDespatch} onChange={(v) => set('demDespatch', v)} num />}
            {showLaytimeTerms && <VdSelect label="Despatch" value={recap.despatchTerm === 'Same as Demurrage' ? 'Dem = Des' : /half\s*despatch/i.test(recap.despatchTerm || '') ? 'Half Despatch' : recap.despatchTerm} onChange={(v) => set('despatchTerm', v)} options={OPS_DESPATCH_TERMS} />}
            <VdField label="WX Clause" value={recap.wxClause} onChange={(v) => set('wxClause', v)} />
            <VdField label="Hull Cleaning Clause" value={recap.hullCleaningClause} onChange={(v) => set('hullCleaningClause', v)} />
          </div>
        </Card>

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
                  <VdAutocomplete value={sp.name} onChange={(v) => updSP(i, { name: v })} options={spNamesFor(sp.type).map((n) => ({ value: n }))} placeholder="Company name…" inputClass="fv-ops__vd-in" />
                  <input className="fv-ops__vd-in" type="email" value={sp.email} placeholder="email@company.com" onChange={(e) => { updSP(i, { email: e.target.value }); syncServiceProviderEmail(sp.type, sp.name, e.target.value); }} />
                  <button type="button" className="fv-ops__vd-sp-rm" aria-label="Remove provider" onClick={() => setSPs(sps.filter((_, idx) => idx !== i))}><i className="fas fa-trash" aria-hidden="true" /></button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Estimated voyage cash flow */}
      <VoyageCashflowCard recap={recap} setRecap={setRecap} />

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

/** Bunkering figures per fuel grade, incl. a per-grade Specs field (one per active fuel type). */
function BunkersCard({ recap, setRecap, voyage }: { recap: Recap; setRecap: Dispatch<SetStateAction<Recap>>; voyage: Voyage }) {
  const fuels = recap.bunkers;
  // Editing BOD here also updates the matching field in the ETA & ROB Itinerary's "Bunkers on
  // Delivery" (Main/Sub/extra) — same physical figure, kept in sync in both directions.
  const setFuel = (i: number, k: keyof BunkerFuel, v: string) => setRecap((r) => {
    if (k === 'cpPrice') return applyCpPriceEdit(r, i, v);
    const bunkers = r.bunkers.map((f, idx) => (idx === i ? { ...f, [k]: v } : f));
    if (k !== 'bod') return { ...r, bunkers };
    const field = startRobFieldFor(r.etaPlan.perf, r.bunkers[i].fuel);
    if (!field) return { ...r, bunkers };
    const etaPlan = field.kind === 'main' ? { ...r.etaPlan, startRobVlsfo: v }
      : field.kind === 'sub' ? { ...r.etaPlan, startRobMgo: v }
      : { ...r.etaPlan, startRobExtra: { ...(r.etaPlan.startRobExtra ?? {}), [field.extraId as string]: v } };
    return { ...r, bunkers, etaPlan };
  });
  const addFuel = (grade = '') => setRecap((r) => ({ ...r, bunkers: [...r.bunkers, { fuel: grade, bod: '', expBor: '', cpPrice: '', bookedPrice: '', masterReq: '', actualSupply: '', actualBor: '', specs: '' }] }));
  const removeFuel = (i: number) => setRecap((r) => ({ ...r, bunkers: r.bunkers.filter((_, idx) => idx !== i) }));
  const margin = (v: string) => {
    const n = parseFloat((v || '').replace(/,/g, ''));
    if (!Number.isFinite(n)) return <span>—</span>;
    return <span className="fv-ops__bnk-margin"><span className="fv-ops__bnk-margin-up">+5% {(n * 1.05).toFixed(2)}</span><span className="fv-ops__bnk-margin-dn">−5% {(n * 0.95).toFixed(2)}</span></span>;
  };
  const rows: { key: keyof BunkerFuel; label: string }[] = [
    { key: 'specs', label: 'Specs' },
    { key: 'bod', label: 'Bunkers on Delivery (MT)' },
    { key: 'expBor', label: 'Expected BOR (MT)' },
    { key: 'cpPrice', label: 'CP Price (USD/MT)' },
    { key: 'bookedPrice', label: 'Booked Price (USD/MT)' },
    { key: 'masterReq', label: 'Master Requirement (MT)' },
    { key: 'actualSupply', label: 'Actual Supply (MT)' },
    { key: 'actualBor', label: 'Actual BOR (MT)' },
  ];
  // Expected BOR mirrors the end ROB from the ETA & ROB itinerary (matched by fuel).
  const endRob = etaEndRob(recap.etaPlan);
  const activeCons = resolveEtaConsumption(recap.etaPlan.perf);
  const extraFuels = activeCons.extraFuels;
  // "Bunkers on Delivery" for a Main/Sub/extra fuel grade is always read straight from the Itinerary's
  // starting-ROB fields (the single source of truth) rather than this row's own stored `bod` — so this
  // card can never show a value that's out of sync with the ETA & ROB itinerary or the Owners
  // "Bunker Settlement" table, even for legacy voyages whose stored `bod` diverged before this field
  // existed. Editing this field (via `setFuel`) still writes both, for backward-compat storage.
  const bodDisplay = (fuel: string): string => {
    const field = startRobFieldFor(recap.etaPlan.perf, fuel);
    if (!field) return recap.bunkers.find((b) => b.fuel === fuel)?.bod ?? '';
    if (field.kind === 'main') return recap.etaPlan.startRobVlsfo;
    if (field.kind === 'sub') return recap.etaPlan.startRobMgo;
    return recap.etaPlan.startRobExtra?.[field.extraId as string] ?? '';
  };
  const derivedBor = (fuel: string): number | null => {
    const f = (fuel || '').trim().toUpperCase();
    if (f === activeCons.mainNormal.type.trim().toUpperCase()) return endRob.v;
    if (f === activeCons.subNormal.type.trim().toUpperCase()) return endRob.m;
    const match = extraFuels.find((x) => x.grade.trim().toUpperCase() === f);
    if (match) return endRob.extra[match.id] ?? null;
    return null;
  };
  // Expected BOR is flagged red once it strays outside ±5% of Bunkers on Delivery for that grade
  // (the same ±5% band shown in the "5% Margin (BOD)" row below) — green while within range.
  const borOutOfRange = (d: number, fuel: string): boolean => {
    const bodVal = parseFloat((bodDisplay(fuel) || '').replace(/,/g, ''));
    if (!Number.isFinite(bodVal) || bodVal === 0) return false;
    return d < bodVal * 0.95 || d > bodVal * 1.05;
  };
  // "Booked Price" and "Actual Supply" link live to the Bunker module's requirement(s) for this
  // voyage (matched by the shared `reference` — falls back to vessel name for older, untagged
  // requirements) and fuel grade. With exactly one matching requirement the field is directly
  // editable here and writes straight into that requirement (true two-way sync — the Bunker module
  // sees the change immediately, same reactive store). With more than one (multiple bunkering calls
  // for the same grade) the total/price is shown read-only, since there's no single record an edit
  // here could unambiguously apply to; with none, the field is a plain, locally-stored value exactly
  // as before (voyages that never went through the Bunker module aren't affected).
  const bunkerReqs = useBunkerRequirements();
  const voyageBunkerReqs = useMemo(
    () => bunkerReqs.filter((r) => (r.reference || '').trim() === voyage.id || (!r.reference?.trim() && r.vessel.trim().toLowerCase() === recap.vesselName.trim().toLowerCase())),
    [bunkerReqs, voyage.id, recap.vesselName],
  );
  const suppliedQtyFor = (r: BunkerRequirement, fuel: string): number | undefined => {
    const f = fuel.trim().toUpperCase();
    const line = r.fuelLines?.find((l) => l.fuel.trim().toUpperCase() === f);
    if (line) return line.suppliedQty ?? ((r.fuelLines?.length ?? 0) === 1 ? r.suppliedQty : undefined);
    return r.fuelType.trim().toUpperCase() === f ? r.suppliedQty : undefined;
  };
  // Actual quantity received per BDN (Bill of Delivery) — the Bunker module's post-arrival figure,
  // used here purely for on-arrival reconciliation against what was nominated/planned.
  const deliveredQtyFor = (r: BunkerRequirement, fuel: string): number | undefined => {
    const f = fuel.trim().toUpperCase();
    const line = r.fuelLines?.find((l) => l.fuel.trim().toUpperCase() === f);
    if (line) return line.deliveredQty ?? ((r.fuelLines?.length ?? 0) === 1 ? r.deliveredQty : undefined);
    return r.fuelType.trim().toUpperCase() === f ? r.deliveredQty : undefined;
  };
  const nominalQtyFor = (r: BunkerRequirement, fuel: string): number => {
    const f = fuel.trim().toUpperCase();
    const line = r.fuelLines?.find((l) => l.fuel.trim().toUpperCase() === f);
    if (line) return line.quantity;
    return r.fuelType.trim().toUpperCase() === f ? r.quantity : 0;
  };
  const bunkerLink = (fuel: string) => {
    const f = fuel.trim().toUpperCase();
    const matches = voyageBunkerReqs.filter((r) => (r.fuelLines?.length ? r.fuelLines.some((l) => l.fuel.trim().toUpperCase() === f) : r.fuelType.trim().toUpperCase() === f));
    if (!matches.length) return null;
    const supplyVals = matches.map((r) => suppliedQtyFor(r, fuel)).filter((v): v is number => v != null);
    const totalSupplied = supplyVals.length ? supplyVals.reduce((a, b) => a + b, 0) : null;
    const deliveredVals = matches.map((r) => deliveredQtyFor(r, fuel)).filter((v): v is number => v != null);
    const totalDelivered = deliveredVals.length ? deliveredVals.reduce((a, b) => a + b, 0) : null;
    const totalNominal = matches.reduce((sum, r) => sum + nominalQtyFor(r, fuel), 0);
    const prices = matches.map((r) => r.pricePerMt).filter((v): v is number => v != null);
    const uniquePrices = Array.from(new Set(prices));
    return { matches, totalSupplied, totalDelivered, totalNominal, price: uniquePrices.length === 1 ? uniquePrices[0] : null, single: matches.length === 1 };
  };
  // Keep exactly one Bunkers row per fuel grade currently in use by the calculation (Main/Sub Normal
  // & ECA types, plus any extra fuel types): collapses any already-duplicated rows for the same grade
  // (merging in non-empty fields from the extras) and adds a row for any grade that has none yet.
  // Never removes a row (even a blank one) — a row might be one the user just added via "+ Add fuel"
  // and hasn't filled in yet, so pruning by "inactive + blank" would delete it before they can type.
  const wantedKey = [activeCons.mainNormal.type, activeCons.subNormal.type, ...extraFuels.map((f) => f.grade)].filter(Boolean).join('|');
  useEffect(() => {
    const wantedRaw = wantedKey.split('|').filter(Boolean);
    const seenWanted = new Set<string>();
    const wanted: string[] = [];
    wantedRaw.forEach((g) => {
      const k = g.trim().toUpperCase();
      if (!seenWanted.has(k)) { seenWanted.add(k); wanted.push(g); }
    });
    setRecap((r) => {
      const byKey = new Map<string, number>();
      const deduped: BunkerFuel[] = [];
      r.bunkers.forEach((b) => {
        const key = b.fuel.trim().toUpperCase();
        const idx = key ? byKey.get(key) : undefined;
        if (idx === undefined) {
          if (key) byKey.set(key, deduped.length);
          deduped.push({ ...b });
        } else {
          const kept = deduped[idx];
          (Object.keys(b) as (keyof BunkerFuel)[]).forEach((k) => { if (!kept[k] && b[k]) kept[k] = b[k]; });
        }
      });
      const existing = new Set(deduped.map((b) => b.fuel.trim().toUpperCase()));
      const missing = wanted.filter((g) => !existing.has(g.trim().toUpperCase()));
      if (!missing.length && deduped.length === r.bunkers.length) return r;
      // Seed a newly-created row's BOD from the matching Itinerary starting-ROB field, if any, so an
      // already-entered figure there isn't lost just because this is the row's first appearance here.
      const bodFor = (grade: string): string => {
        const field = startRobFieldFor(r.etaPlan.perf, grade);
        if (!field) return '';
        if (field.kind === 'main') return r.etaPlan.startRobVlsfo || '';
        if (field.kind === 'sub') return r.etaPlan.startRobMgo || '';
        return r.etaPlan.startRobExtra?.[field.extraId as string] || '';
      };
      const next = missing.length
        ? [...deduped, ...missing.map((fuel) => ({ fuel, bod: bodFor(fuel), expBor: '', cpPrice: '', bookedPrice: '', masterReq: '', actualSupply: '', actualBor: '', specs: '' }))]
        : deduped;
      return { ...r, bunkers: next };
    });
  }, [wantedKey, setRecap]);
  // Cleanup of stale, fully-blank-or-zero rows that aren't part of the active calculation — e.g. an
  // old "ULSFO" column left over after the ECA fuel type was switched away from it (a zero in a
  // column nobody actively uses is never meaningful data, only a leftover default). Re-runs whenever
  // the active grade set (`wantedKey`) changes, not on every render — so it can never race a row the
  // user just added via "+ Add fuel" and hasn't typed into yet (that action doesn't change
  // `wantedKey`); any row with a real non-zero entry is left alone regardless.
  useEffect(() => {
    const wantedRaw = wantedKey.split('|').filter(Boolean).map((g) => g.trim().toUpperCase());
    const wantedSet = new Set(wantedRaw);
    const isBlank = (b: BunkerFuel) => !num(b.bod) && !num(b.expBor) && !num(b.cpPrice) && !num(b.bookedPrice) && !num(b.masterReq) && !num(b.actualSupply) && !num(b.actualBor);
    setRecap((r) => {
      const kept = r.bunkers.filter((b) => wantedSet.has(b.fuel.trim().toUpperCase()) || !isBlank(b));
      return kept.length === r.bunkers.length ? r : { ...r, bunkers: kept };
    });
  }, [wantedKey, setRecap]);
  return (
    <Card
      title="Bunkers"
      icon="fa-gas-pump"
      span3
      className="fv-ops__vd-bunkers"
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
                    const outOfRange = borOutOfRange(d, f.fuel);
                    return (
                      <td key={i} className={`fv-ops__bnk-derived${outOfRange ? ' fv-ops__bnk-derived--bad' : ''}`} title={`Linked to ETA & ROB itinerary end ROB${outOfRange ? ' — outside ±5% of Bunkers on Delivery' : ''}`}>
                        {fmt(d, 2)}
                      </td>
                    );
                  }
                }
                if (row.key === 'bod') {
                  return <td key={i}><input className="fv-ops__vd-in" inputMode="decimal" value={bodDisplay(f.fuel)} onChange={(e) => setFuel(i, 'bod', e.target.value)} /></td>;
                }
                if (row.key === 'cpPrice') {
                  return <td key={i}><input className="fv-ops__vd-in" inputMode="decimal" value={cpPriceFor(recap, f.fuel)} onChange={(e) => setFuel(i, 'cpPrice', e.target.value)} /></td>;
                }
                if (row.key === 'specs') {
                  return <td key={i} className="fv-ops__bnk-specscell"><input className="fv-ops__vd-in fv-ops__bnk-specs-in" placeholder={`e.g. Max 0.50% S`} value={f.specs} onChange={(e) => setFuel(i, 'specs', e.target.value)} /></td>;
                }
                if (row.key === 'bookedPrice' || row.key === 'actualSupply') {
                  const link = bunkerLink(f.fuel);
                  if (link) {
                    const linkedVal = row.key === 'bookedPrice' ? link.price : link.totalSupplied;
                    if (link.single) {
                      return (
                        <td key={i}>
                          <input
                            className="fv-ops__vd-in"
                            inputMode="decimal"
                            title="Linked to the Bunker module requirement"
                            value={linkedVal != null ? String(linkedVal) : ''}
                            onChange={(e) => updateBunkerRequirement(
                              link.matches[0].id,
                              row.key === 'bookedPrice' ? { pricePerMt: num(e.target.value) } : { suppliedQty: num(e.target.value) },
                              { user: 'Operations', role: 'Operations', action: `Updated ${row.label} from Operations` },
                            )}
                          />
                        </td>
                      );
                    }
                    // Multiple bunker-port calls for this grade — show + edit each requirement's own
                    // figure individually (keyed by its own bunker port) instead of an ambiguous
                    // read-only "Multiple", so it's always clear which supply belongs to which call.
                    return (
                      <td key={i} className="fv-ops__bnk-multi" title={`${link.matches.length} Bunker module requirements for this grade`}>
                        {link.matches.map((m) => {
                          const mVal = row.key === 'bookedPrice' ? m.pricePerMt : suppliedQtyFor(m, f.fuel);
                          return (
                            <div key={m.id} className="fv-ops__bnk-multi-row">
                              <span className="fv-ops__bnk-multi-port" title={`${m.id} \u2014 ${m.bunkerPort}`}>{m.bunkerPort || m.id}</span>
                              <input
                                className="fv-ops__vd-in fv-ops__bnk-multi-in"
                                inputMode="decimal"
                                value={mVal != null ? String(mVal) : ''}
                                onChange={(e) => updateBunkerRequirement(
                                  m.id,
                                  row.key === 'bookedPrice' ? { pricePerMt: num(e.target.value) } : { suppliedQty: num(e.target.value) },
                                  { user: 'Operations', role: 'Operations', action: `Updated ${row.label} from Operations (${m.bunkerPort})` },
                                )}
                              />
                            </div>
                          );
                        })}
                      </td>
                    );
                  }
                }
                return <td key={i}><input className="fv-ops__vd-in" inputMode="decimal" value={f[row.key]} onChange={(e) => setFuel(i, row.key, e.target.value)} /></td>;
              })}
            </tr>
          ))}
          <tr className="fv-ops__bnk-marginrow">
            <th scope="row">Delivered (BDN) (MT)</th>
            {fuels.map((f, i) => {
              const link = bunkerLink(f.fuel);
              if (!link || link.totalDelivered == null) return <td key={i} className="fv-ops__bnk-calc">—</td>;
              // Flags a reconciliation discrepancy the moment the Bunker module's actual BDN figure
              // diverges from what Operations nominated/planned for this grade — previously nothing
              // surfaced this mismatch back in Operations at all.
              const discrepant = link.totalNominal > 0 && Math.abs(link.totalDelivered - link.totalNominal) > link.totalNominal * 0.01;
              return (
                <td
                  key={i}
                  className={`fv-ops__bnk-derived${discrepant ? ' fv-ops__bnk-derived--bad' : ''}`}
                  title={discrepant
                    ? `Delivered ${fmt(link.totalDelivered, 2)} MT vs ${fmt(link.totalNominal, 2)} MT nominated — reconcile with Bunker module (${link.matches.map((m) => m.id).join(', ')})`
                    : `Delivered ${fmt(link.totalDelivered, 2)} MT per BDN — matches the nominated quantity`}
                >
                  {fmt(link.totalDelivered, 2)}
                </td>
              );
            })}
          </tr>
          <tr className="fv-ops__bnk-marginrow">
            <th scope="row">5% Margin (BOD)</th>
            {fuels.map((f, i) => (
              <td key={i} className="fv-ops__bnk-calc">{margin(bodDisplay(f.fuel))}</td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="fv-ops__hint"><i className="fas fa-link" aria-hidden="true" /> Expected BOR (VLSFO / MGO) is linked to the end ROB projected in the ETA &amp; ROB itinerary. Booked Price / Actual Supply link live to the matching Bunker module requirement(s) for this voyage — with multiple bunkering calls for the same grade, each is shown and editable individually by its own bunker port. Delivered (BDN) is flagged red if it differs from the nominated quantity by more than 1%, so an on-arrival short/over supply is never silently missed.</p>
      <datalist id="ops-fuel-grades">{OPS_FUEL_GRADES.map((g) => <option key={g} value={g} />)}</datalist>
    </Card>
  );
}

/** Build the voyage milestone timeline, marking the active stage from the voyage status. */
function buildMilestones(recap: Recap, voyage: Voyage, statusOverride?: string): { label: string; date: string; icon: string; state: 'done' | 'current' | 'todo' }[] {
  const norm = (s: string) => (s || '').trim().toLowerCase();
  const legs = recap.etaPlan?.legs ?? [];
  const computed = projectEtaLegs(recap.etaPlan);
  const laytimes = recap.freightLaytime?.laytimes ?? [];

  // Planned arrival at a port from the itinerary (first port leg whose destination matches).
  const itinArrival = (portName: string): Date | null => {
    for (let i = 0; i < legs.length; i += 1) {
      if (legs[i].kind === 'port' && norm(legs[i].to) === norm(portName)) return computed[i]?.arr ?? null;
    }
    return null;
  };
  // Laytime record for a port (actual NOR / commenced / completed).
  const layFor = (portName: string, op: 'Load' | 'Discharge') =>
    laytimes.find((p) => p.op === op && norm(p.name) === norm(portName)) ?? laytimes.find((p) => p.op === op);

  const dOnly = (d: Date | null): string => (d ? fmtShortDate(d) : '');
  type Node = { label: string; date: string; icon: string; port?: string; when: Date | null; arrived: boolean };
  const nodes: Node[] = [];

  nodes.push({ label: 'Fixed', icon: 'fa-file-signature', date: dOnly(parseDMY(recap.cpDate)) || (recap.cpDate || '—'), port: undefined, when: parseDMY(recap.cpDate), arrived: !!recap.cpDate });
  const deliveryDt = parseDMY(recap.deliveryDateTime);
  nodes.push({ label: 'Delivery', icon: 'fa-ship', date: dOnly(deliveryDt) || '—', port: recap.deliveryPort, when: deliveryDt, arrived: !!deliveryDt });

  splitPorts(recap.loadPort).forEach((p) => {
    const lay = layFor(p, 'Load');
    const actual = parseDMY(lay?.commenced || '') || parseDMY(lay?.norAccepted || '') || parseDMY(lay?.norTendered || '');
    const when = actual || itinArrival(p);
    nodes.push({ label: `Load — ${p}`, icon: 'fa-arrow-down-to-bracket', date: dOnly(when) || '—', port: p, when, arrived: !!parseDMY(lay?.completed || '') || !!actual });
  });
  splitPorts(recap.dischargePort).forEach((p) => {
    const lay = layFor(p, 'Discharge');
    const actual = parseDMY(lay?.commenced || '') || parseDMY(lay?.norAccepted || '') || parseDMY(lay?.norTendered || '');
    const when = actual || itinArrival(p);
    nodes.push({ label: `Discharge — ${p}`, icon: 'fa-arrow-up-from-bracket', date: dOnly(when) || '—', port: p, when, arrived: !!parseDMY(lay?.completed || '') || !!actual });
  });

  const redeliveryDt = parseDMY(recap.redeliveryDateTime);
  nodes.push({ label: 'Completion', icon: 'fa-circle-check', date: dOnly(redeliveryDt) || '—', port: recap.redeliveryPort, when: redeliveryDt, arrived: false });

  // Current position from the latest vessel report (its position + whether at sea / in port).
  const reports = recap.vesselReports ?? [];
  const latest = reports.reduce<{ r: VesselReport; t: number } | null>((best, r) => {
    const t = (parseDMY(r.dtUtc) || parseDMY(r.dtLt))?.getTime();
    if (t == null || Number.isNaN(t)) return best;
    return !best || t > best.t ? { r, t } : best;
  }, null);

  let active = -1;
  if (latest) {
    const pos = norm(latest.r.position);
    const atSea = /cosp|departure|sea/i.test(latest.r.type);
    const idx = pos ? nodes.findIndex((n) => n.port && (pos.includes(norm(n.port)) || norm(n.port).includes(pos))) : -1;
    if (idx >= 0) {
      // At a known port: in-port/arrival reports mark that node current; departure/at-sea advance to next.
      active = atSea ? idx + 1 : idx;
    } else {
      // At sea between ports: the last node whose date has passed is done, the next is current.
      let lastPassed = -1;
      nodes.forEach((n, i) => { if (n.when && n.when.getTime() <= latest.t) lastPassed = i; });
      active = lastPassed + 1;
    }
  } else {
    // No reports yet: fall back to today's date (else the coarse voyage status keyword).
    const now = Date.now();
    let lastPassed = -1;
    nodes.forEach((n, i) => { if (n.when && n.when.getTime() <= now) lastPassed = i; });
    if (lastPassed >= 0) active = lastPassed;
    else {
      const status = (statusOverride || voyage.status || '').toLowerCase();
      active = 1;
      if (status.includes('load')) active = 2;
      else if (status.includes('disch')) active = nodes.length - 2;
      else if (status.includes('complete') || status.includes('redeliver')) active = nodes.length - 1;
      else if (status.includes('sea') || status.includes('voyage') || status.includes('transit')) active = Math.min(nodes.length - 1, 2);
    }
  }
  active = Math.max(0, Math.min(active, nodes.length - 1));

  return nodes.map((n, i) => ({
    label: n.label,
    date: n.date,
    icon: n.icon,
    state: i < active ? 'done' : i === active ? 'current' : 'todo',
  }));
}

/* ------------------------------------------------------------ Live P&L tab */

type PnlKind = 'income' | 'cost' | 'result' | 'neutral';
interface PnlItem { label: string; est: number; act: number; kind: PnlKind }

function pnlTone(kind: PnlKind, delta: number): 'good' | 'bad' | 'flat' {
  if (kind === 'neutral' || Math.abs(delta) < 0.5) return 'flat';
  const good = kind === 'cost' ? delta < 0 : delta > 0;
  return good ? 'good' : 'bad';
}

function PnlTab({ recap, setRecap, pnl, estPnl }: { recap: Recap; setRecap: Dispatch<SetStateAction<Recap>>; pnl: Pnl; estPnl: Pnl }) {
  const pctOf = (delta: number, est: number) => (est !== 0 ? (delta / Math.abs(est)) * 100 : delta !== 0 ? 100 : 0);
  const signed = (n: number) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;
  const signedPct = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n), 1)}%`;
  const setNote = (label: string, v: string) => setRecap((r) => ({ ...r, pnlNotes: { ...r.pnlNotes, [label]: v } }));
  const actualReportCount = (recap.vesselReports ?? []).filter((report) => report.type.toLowerCase().includes('noon') || report.type.toLowerCase().includes('eosp')).length;
  const actualReportData = actualReportTotals(recap.vesselReports);
  const reportRows = (recap.vesselReports ?? []).filter((report) => report.type.toLowerCase().includes('noon') || report.type.toLowerCase().includes('eosp'));
  const reportProblems = reportRows.length === 0 ? ['No noon/EOSP Vessel Reports are available.'] : [
    reportRows.some((report) => num(report.avgSpdGps) <= 0 && num(report.avgSpdLog) <= 0) ? 'One or more reports are missing average speed.' : '',
    reportRows.some((report) => num(report.consFo) < 0 || num(report.consDo) < 0 || num(report.consFo) === 0) ? 'One or more reports contain missing or invalid FO consumption values.' : '',
  ].filter(Boolean);
  const performanceSource = actualReportData ? `Vessel Reports (${actualReportCount} noon/EOSP report${actualReportCount === 1 ? '' : 's'})` : 'Voyage Details fallback fields';

  // Fix type decides whether hire is our income (charter-out) or expense (charter-in).
  const [inType = '', outType = ''] = (recap.voyageFixType || '').toUpperCase().split('-');
  const owns = inType === 'OWN';
  const chartersIn = inType === 'TCIN' || inType === 'TCTIN';
  const chartersOut = outType === 'TCOUT' || outType === 'TCTOUT';
  const performsVoyage = outType === 'VOUT';

  const revenueItems: PnlItem[] = [
    ...(performsVoyage ? [{ label: 'Freight', est: estPnl.freight, act: pnl.freight, kind: 'income' as const }] : []),
    ...(chartersOut ? [{ label: owns ? 'Hire Income (Owned Vessel)' : 'Hire Income (Sub-Charter)', est: estPnl.hireOutIncome, act: pnl.hireOutIncome, kind: 'income' as const }] : []),
    { label: 'Demurrage / Despatch', est: estPnl.demDespatch, act: pnl.demDespatch, kind: 'income' },
    { label: 'Misc Income', est: estPnl.miscIncome, act: pnl.miscIncome, kind: 'income' },
  ];
  const costItems: PnlItem[] = [
    ...(chartersIn ? [{ label: 'Hire Cost (Charter In)', est: estPnl.totalHire, act: pnl.totalHire, kind: 'cost' as const }] : []),
    { label: 'Ballast Bonus', est: estPnl.ballastBonus, act: pnl.ballastBonus, kind: 'cost' },
    { label: 'Bunker Cost', est: estPnl.bunkerCost, act: pnl.bunkerCost, kind: 'cost' },
    { label: 'Port DA (Load + Disch)', est: estPnl.portCost, act: pnl.portCost, kind: 'cost' },
    { label: 'C.V.E.', est: estPnl.cveTotal, act: pnl.cveTotal, kind: 'cost' },
    { label: 'ILOHC', est: estPnl.ilohc, act: pnl.ilohc, kind: 'cost' },
    { label: 'EUA / Carbon', est: estPnl.carbonCost, act: pnl.carbonCost, kind: 'cost' },
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
    { label: 'Ballast Bonus', val: pnl.ballastBonus, color: '#6366f1' },
    { label: 'Bunkers', val: pnl.bunkerCost, color: '#ef4444' },
    { label: 'Port DA', val: pnl.portCost, color: '#8b5cf6' },
    { label: 'C.V.E.', val: pnl.cveTotal, color: '#22c55e' },
    { label: 'ILOHC', val: pnl.ilohc, color: '#f59e0b' },
    { label: 'EUA / Carbon', val: pnl.carbonCost, color: '#0ea5e9' },
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

          <Card title="P&L Data Sources & Alerts" icon="fa-circle-info">
            <div className="fv-ops__pnl-source-alerts">
              <div className={`fv-ops__pnl-source-alert fv-ops__pnl-source-alert--${reportProblems.length > 0 ? 'warn' : 'good'}`}>
                <i className={`fas ${reportProblems.length > 0 ? 'fa-triangle-exclamation' : 'fa-circle-check'}`} aria-hidden="true" />
                <div><b>{reportProblems.length > 0 ? 'Speed and consumption alert' : 'Speed and consumption source'}</b><span>{reportProblems.length > 0 ? reportProblems.join(' ') : `${performanceSource} — Live P&L uses these reported values.`}</span>{actualReportData && <small>Average speed: {fmt(actualReportData.speed, 2)} kn · FO: {fmt(actualReportData.foCons, 2)} MT · DO: {fmt(actualReportData.doCons, 2)} MT</small>}{!actualReportData && <small>Open Vessel Reports and save vessel-reported speed/consumption to make the P&amp;L actual.</small>}</div>
              </div>
              <div className="fv-ops__pnl-source-list">
                <div><span>Revenue</span><b>Voyage Details: Freight / MT × Final Qty Loaded / BL, net of address commission</b></div>
                <div><span>Demurrage / Despatch</span><b>Voyage Details / Freight &amp; Laytime</b></div>
                <div><span>Hire</span><b>Expense when chartered in (TCIN/TCTIN); income when chartered out (TCOUT/TCTOUT) — from fix type, less off-hire</b></div>
                <div><span>Ballast Bonus</span><b>Voyage Details: Commercial Terms</b></div>
                <div><span>Port DA</span><b>Freight &amp; Laytime PDA/FDA settlement (fallback: Voyage Details PDA fields)</b></div>
                <div><span>Bunker prices</span><b>Voyage Details: FO and DO price per MT (ECA portion priced at ULSFO); extra fuel types priced from their matching Bunkers row</b></div>
                <div><span>EUA / Carbon</span><b>Emissions (EUA): phased EUAs × latest ledger price</b></div>
                <div><span>CVE / ILOHC / Other</span><b>Voyage Details: Commercial Terms</b></div>
              </div>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ ETA & ROB tab */

function EtaRobTab({ recap, setRecap, voyage }: { recap: Recap; setRecap: Dispatch<SetStateAction<Recap>>; voyage: Voyage }) {
  const plan = recap.etaPlan;
  const [bunkerOpen, setBunkerOpen] = useState(false);
  const setPlan = (patch: Partial<EtaPlan>) => setRecap((r) => ({ ...r, etaPlan: { ...r.etaPlan, ...patch } }));
  const setPerf = (patch: Partial<EtaPerf>) => setPlan({ perf: { ...plan.perf, ...patch } });
  // Changing the default weather margin pushes it onto every sea leg's WM %; each row can still be
  // manually edited afterwards (individual leg edits go through setLeg and are not touched by this).
  const setWeatherMargin = (v: string) =>
    setRecap((r) => ({
      ...r,
      etaPlan: {
        ...r.etaPlan,
        weatherMargin: v,
        legs: r.etaPlan.legs.map((l) => (l.kind === 'sea' ? { ...l, wf: v } : l)),
      },
    }));
  // Backfill any sea leg whose WM % was never set (e.g. legacy/imported legs) with the current default.
  useEffect(() => {
    if (!plan.weatherMargin) return;
    const needsFill = plan.legs.some((l) => l.kind === 'sea' && !l.wf);
    if (!needsFill) return;
    setRecap((r) => ({
      ...r,
      etaPlan: {
        ...r.etaPlan,
        legs: r.etaPlan.legs.map((l) => (l.kind === 'sea' && !l.wf ? { ...l, wf: r.etaPlan.weatherMargin } : l)),
      },
    }));
  }, [plan.weatherMargin, plan.legs, setRecap]);
  // Auto-derive each sea/port leg's TZ from its "To" port; recomputes whenever To changes or
  // (re)hydrates with a stale value, but is skipped once the TZ has been manually edited
  // (`tzAuto === false`) — a subsequent To edit re-enables auto-detection for that leg.
  const worldPorts = useWorldPorts();
  useEffect(() => {
    if (!worldPorts.length) return;
    const patches: Record<number, string> = {};
    plan.legs.forEach((l, i) => {
      if (!l.to || l.tzAuto === false) return;
      const port = matchWorldPort(l.to, worldPorts);
      if (!port) return;
      const tz = tzFromLon(port.lon);
      if (tz !== l.tz) patches[i] = tz;
    });
    if (!Object.keys(patches).length) return;
    setRecap((r) => ({
      ...r,
      etaPlan: { ...r.etaPlan, legs: r.etaPlan.legs.map((l, i) => (patches[i] !== undefined ? { ...l, tz: patches[i], tzAuto: true } : l)) },
    }));
  }, [worldPorts, plan.legs, setRecap]);
  // When the Normal and ECA fuel TYPE differ for Main (FO) or Sub (DO), the ECA-zone consumption
  // can't be blended into the Normal-type's column (different tank/grade) — auto-manage a hidden
  // `auto-eca-main`/`auto-eca-sub` extra-fuel entry (Normal rate 0, ECA rate = the ECA row's rate)
  // so it gets its own tracked Cons/Used/Supply/Est ROB columns and Bunkers ROB under its own grade.
  // Uses `ecaFuelRouting` (same routing `blendedLegCons` uses) so an orphan ECA share that's really
  // the SAME tank as the Main/Sub column, or the SAME grade as the other slot's ECA share, never gets
  // its own duplicate-looking column — it's folded/merged instead. Also skipped entirely when a
  // user-added extra fuel already uses that exact grade name.
  useEffect(() => {
    const cons = resolveEtaConsumption(plan.perf);
    const zero = (type: string): EtaMainCons => ({ type, ballast: '0', laden: '0', idle: '0', work: '0' });
    const fromSub = (eca: EtaSubCons): EtaMainCons => ({ type: eca.type, ballast: eca.sea, laden: eca.sea, idle: eca.idle, work: eca.work });
    const makeAuto = (id: string, grade: string, normal: EtaMainCons, eca: EtaMainCons): EtaExtraFuel => ({ id, grade, fullNormal: normal, fullEca: eca, ecoNormal: normal, ecoEca: eca, customNormal: normal, customEca: eca });
    const existing = plan.perf.extraFuels ?? [];
    const userFuels = existing.filter((f) => !f.id.startsWith('auto-eca-'));
    const hasUserGrade = (grade: string) => userFuels.some((f) => f.grade.trim().toUpperCase() === grade.trim().toUpperCase());
    const route = ecaFuelRouting(cons);
    let wantMain: EtaExtraFuel | null = null;
    let wantSub: EtaExtraFuel | null = null;
    if (route.mergeEca) {
      if (!hasUserGrade(cons.mainEca.type)) wantMain = makeAuto('auto-eca-main', cons.mainEca.type, zero(cons.mainEca.type), cons.mainEca);
    } else {
      if (route.needsAutoMain && !hasUserGrade(cons.mainEca.type)) wantMain = makeAuto('auto-eca-main', cons.mainEca.type, zero(cons.mainEca.type), cons.mainEca);
      if (route.needsAutoSub && !hasUserGrade(cons.subEca.type)) wantSub = makeAuto('auto-eca-sub', cons.subEca.type, zero(cons.subEca.type), fromSub(cons.subEca));
    }
    const curMain = existing.find((f) => f.id === 'auto-eca-main') ?? null;
    const curSub = existing.find((f) => f.id === 'auto-eca-sub') ?? null;
    if (JSON.stringify(wantMain) === JSON.stringify(curMain) && JSON.stringify(wantSub) === JSON.stringify(curSub)) return;
    const next = existing.filter((f) => f.id !== 'auto-eca-main' && f.id !== 'auto-eca-sub');
    if (wantMain) next.push(wantMain);
    if (wantSub) next.push(wantSub);
    // When an auto column's grade changes (or it's removed because the ECA share now folds into
    // Main/Sub's own column), rename/merge the matching Bunkers-card row too, in the same update —
    // otherwise it lingers under the old grade name (e.g. a stale "ULSFO" row after switching the
    // ECA fuel type to MGO) since nothing else ever renames or drops it.
    const renames: { from: string; to: string }[] = [];
    if (curMain && curMain.grade.trim().toUpperCase() !== (wantMain?.grade ?? '').trim().toUpperCase()) {
      renames.push({ from: curMain.grade, to: wantMain ? wantMain.grade : (route.mainEcaFoldsIntoSub ? cons.subNormal.type : cons.mainNormal.type) });
    }
    if (curSub && curSub.grade.trim().toUpperCase() !== (wantSub?.grade ?? '').trim().toUpperCase()) {
      renames.push({ from: curSub.grade, to: wantSub ? wantSub.grade : (route.subEcaFoldsIntoMain ? cons.mainNormal.type : cons.subNormal.type) });
    }
    setRecap((r) => {
      let bunkers = r.bunkers;
      renames.forEach(({ from, to }) => {
        if (from.trim().toUpperCase() === to.trim().toUpperCase()) return;
        const fromIdx = bunkers.findIndex((b) => b.fuel.trim().toUpperCase() === from.trim().toUpperCase());
        if (fromIdx < 0) return;
        const toIdx = bunkers.findIndex((b) => b.fuel.trim().toUpperCase() === to.trim().toUpperCase());
        const row = bunkers[fromIdx];
        if (toIdx < 0) {
          bunkers = bunkers.map((b, i) => (i === fromIdx ? { ...b, fuel: to } : b));
        } else {
          const target = bunkers[toIdx];
          const merged = { ...target };
          (Object.keys(row) as (keyof BunkerFuel)[]).forEach((k) => { if (!merged[k] && row[k]) merged[k] = row[k]; });
          bunkers = bunkers.map((b, i) => (i === toIdx ? merged : b)).filter((_, i) => i !== fromIdx);
        }
      });
      return { ...r, etaPlan: { ...r.etaPlan, perf: { ...r.etaPlan.perf, extraFuels: next } }, bunkers };
    });
  }, [plan.perf, setRecap]);
  // Auto-blend each leg's Cons (MT/day) from the Normal/ECA rates by its own Non-ECA/ECA distance
  // split; recomputes whenever distances or the instructed profile change, unless manually edited
  // (`consAuto === false`) — a subsequent distance edit re-enables auto-blending for that leg.
  useEffect(() => {
    const patches: Record<number, { consVlsfo: string; consMgo: string; extraCons: Record<string, string> }> = {};
    plan.legs.forEach((l, i) => {
      if (l.consAuto === false) return;
      const blend = blendedLegCons(plan.perf, l);
      const extraChanged = Object.entries(blend.extra).some(([id, v]) => v !== (l.extraCons?.[id] ?? '0'));
      if (blend.v === l.consVlsfo && blend.m === l.consMgo && !extraChanged) return;
      patches[i] = { consVlsfo: blend.v, consMgo: blend.m, extraCons: blend.extra };
    });
    if (!Object.keys(patches).length) return;
    setRecap((r) => ({
      ...r,
      etaPlan: {
        ...r.etaPlan,
        legs: r.etaPlan.legs.map((l, i) => (patches[i] ? { ...l, consVlsfo: patches[i].consVlsfo, consMgo: patches[i].consMgo, extraCons: patches[i].extraCons, consAuto: true } : l)),
      },
    }));
  }, [plan.legs, plan.perf, setRecap]);
  useEffect(() => {
    const p = plan.perf;
    if (p.fullMainNormal && p.fullMainEca && p.fullSubNormal && p.fullSubEca && p.ecoMainNormal && p.ecoMainEca && p.ecoSubNormal && p.ecoSubEca && p.customMainNormal && p.customMainEca && p.customSubNormal && p.customSubEca) return;
    setRecap((r) => {
      const current = r.etaPlan.perf;
      return {
        ...r,
        etaPlan: {
          ...r.etaPlan,
          perf: {
            ...current,
            fullMainNormal: current.fullMainNormal ?? current.mainNormal,
            fullMainEca: current.fullMainEca ?? current.mainEca,
            fullSubNormal: current.fullSubNormal ?? current.subNormal,
            fullSubEca: current.fullSubEca ?? current.subEca,
            ecoMainNormal: current.ecoMainNormal ?? { type: current.mainNormal.type, ballast: '23', laden: '26', idle: '2', work: '4' },
            ecoMainEca: current.ecoMainEca ?? { type: current.mainEca.type, ballast: '23', laden: '26', idle: '2', work: '4' },
            ecoSubNormal: current.ecoSubNormal ?? { type: current.subNormal.type, sea: '0.08', idle: '0', work: '0' },
            ecoSubEca: current.ecoSubEca ?? { type: current.subEca.type, sea: '0.08', idle: '0', work: '0' },
            customMainNormal: current.customMainNormal ?? current.mainNormal,
            customMainEca: current.customMainEca ?? current.mainEca,
            customSubNormal: current.customSubNormal ?? current.subNormal,
            customSubEca: current.customSubEca ?? current.subEca,
          },
        },
      };
    });
  }, [plan.perf, setRecap]);
  const setMain = (which: 'mainNormal' | 'mainEca', patch: Partial<EtaMainCons>) => {
    const active = resolveEtaConsumption(plan.perf);
    const key = plan.perf.speedMode === 'Full' ? (which === 'mainNormal' ? 'fullMainNormal' : 'fullMainEca') : plan.perf.speedMode === 'Eco' ? (which === 'mainNormal' ? 'ecoMainNormal' : 'ecoMainEca') : (which === 'mainNormal' ? 'customMainNormal' : 'customMainEca');
    setPerf({ [key]: { ...(which === 'mainNormal' ? active.mainNormal : active.mainEca), ...patch } } as Partial<EtaPerf>);
  };
  const setSub = (which: 'subNormal' | 'subEca', patch: Partial<EtaSubCons>) => {
    const active = resolveEtaConsumption(plan.perf);
    const key = plan.perf.speedMode === 'Full' ? (which === 'subNormal' ? 'fullSubNormal' : 'fullSubEca') : plan.perf.speedMode === 'Eco' ? (which === 'subNormal' ? 'ecoSubNormal' : 'ecoSubEca') : (which === 'subNormal' ? 'customSubNormal' : 'customSubEca');
    setPerf({ [key]: { ...(which === 'subNormal' ? active.subNormal : active.subEca), ...patch } } as Partial<EtaPerf>);
  };
  // Extra fuel types (beyond FO/DO) — Normal/ECA consumption per speed mode, kept
  // in sync with the Bunkers card so pricing/BOD/BOR fields exist for the grade.
  const addExtraFuel = () => setRecap((r) => {
    const used = new Set([r.etaPlan.perf.mainNormal.type, r.etaPlan.perf.subNormal.type, ...(r.etaPlan.perf.extraFuels ?? []).map((f) => f.grade)]);
    const grade = OPS_FUEL_GRADES.find((g) => !used.has(g)) || 'Other';
    const blankMain = (): EtaMainCons => ({ type: grade, ballast: '0', laden: '0', idle: '0', work: '0' });
    const fuel: EtaExtraFuel = { id: `xf-${Date.now()}`, grade, fullNormal: blankMain(), fullEca: blankMain(), ecoNormal: blankMain(), ecoEca: blankMain(), customNormal: blankMain(), customEca: blankMain() };
    const hasBunkerRow = (r.bunkers ?? []).some((b) => b.fuel === grade);
    return {
      ...r,
      etaPlan: { ...r.etaPlan, perf: { ...r.etaPlan.perf, extraFuels: [...(r.etaPlan.perf.extraFuels ?? []), fuel] } },
      bunkers: hasBunkerRow ? r.bunkers : [...r.bunkers, { fuel: grade, bod: '', expBor: '', cpPrice: '', bookedPrice: '', masterReq: '', actualSupply: '', actualBor: '', specs: '' }],
    };
  });
  const setExtraFuel = (id: string, which: 'normal' | 'eca', patch: Partial<EtaMainCons>) => {
    const active = resolveEtaConsumption(plan.perf);
    const cur = active.extraFuels.find((f) => f.id === id);
    if (!cur) return;
    const key = plan.perf.speedMode === 'Full' ? (which === 'normal' ? 'fullNormal' : 'fullEca') : plan.perf.speedMode === 'Eco' ? (which === 'normal' ? 'ecoNormal' : 'ecoEca') : (which === 'normal' ? 'customNormal' : 'customEca');
    setPerf({
      extraFuels: (plan.perf.extraFuels ?? []).map((f) => f.id === id ? { ...f, [key]: { ...(which === 'normal' ? cur.normal : cur.eca), ...patch } } : f),
    });
  };
  const renameExtraFuelGrade = (id: string, grade: string) => setPerf({
    extraFuels: (plan.perf.extraFuels ?? []).map((f) => f.id === id
      ? { ...f, grade, fullNormal: { ...f.fullNormal, type: grade }, fullEca: { ...f.fullEca, type: grade }, ecoNormal: { ...f.ecoNormal, type: grade }, ecoEca: { ...f.ecoEca, type: grade }, customNormal: { ...f.customNormal, type: grade }, customEca: { ...f.customEca, type: grade } }
      : f),
  });
  const removeExtraFuel = (id: string) => setPerf({ extraFuels: (plan.perf.extraFuels ?? []).filter((f) => f.id !== id) });
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
  // Per-leg extra-fuel consumption / supply (keyed by EtaExtraFuel.id).
  const setLegExtraCons = (i: number, fuelId: string, value: string) =>
    setRecap((r) => ({ ...r, etaPlan: { ...r.etaPlan, legs: r.etaPlan.legs.map((l, idx) => (idx === i ? { ...l, extraCons: { ...(l.extraCons ?? {}), [fuelId]: value } } : l)) } }));
  const setLegExtraSup = (i: number, fuelId: string, value: string) =>
    setRecap((r) => ({ ...r, etaPlan: { ...r.etaPlan, legs: r.etaPlan.legs.map((l, idx) => (idx === i ? { ...l, extraSup: { ...(l.extraSup ?? {}), [fuelId]: value } } : l)) } }));
  // Starting ROB fields also mirror into the matching Bunkers-card row's BOD — same physical figure,
  // kept in sync in both directions (see BunkersCard.setFuel / the Owners "Bunker Settlement" table).
  const setStartRobMain = (value: string) =>
    setRecap((r) => {
      const grade = resolveEtaConsumption(r.etaPlan.perf).mainNormal.type;
      const bunkers = r.bunkers.map((b) => (b.fuel.trim().toUpperCase() === grade.trim().toUpperCase() ? { ...b, bod: value } : b));
      return { ...r, etaPlan: { ...r.etaPlan, startRobVlsfo: value }, bunkers };
    });
  const setStartRobSub = (value: string) =>
    setRecap((r) => {
      const grade = resolveEtaConsumption(r.etaPlan.perf).subNormal.type;
      const bunkers = r.bunkers.map((b) => (b.fuel.trim().toUpperCase() === grade.trim().toUpperCase() ? { ...b, bod: value } : b));
      return { ...r, etaPlan: { ...r.etaPlan, startRobMgo: value }, bunkers };
    });
  const setStartRobExtra = (fuelId: string, value: string) =>
    setRecap((r) => {
      const etaPlan = { ...r.etaPlan, startRobExtra: { ...(r.etaPlan.startRobExtra ?? {}), [fuelId]: value } };
      const grade = r.etaPlan.perf.extraFuels?.find((f) => f.id === fuelId)?.grade;
      const bunkers = grade ? r.bunkers.map((b) => (b.fuel.trim().toUpperCase() === grade.trim().toUpperCase() ? { ...b, bod: value } : b)) : r.bunkers;
      return { ...r, etaPlan, bunkers };
    });
  // NOTE: `plan.startRobVlsfo` / `startRobMgo` / `startRobExtra` are the single source of truth for
  // Main/Sub/extra-fuel "Bunkers on Delivery" — the Bunkers card and Owners "Bunker Settlement" table
  // never read their own stored `bunkers[].bod` for a grade that matches Main/Sub/an extra fuel type;
  // they always *display* the value straight from `plan` (see `bodDisplay` in BunkersCard and
  // `ownersBodDisplay` here) and only write back into `bunkers[].bod` for backward-compat storage.
  // This removes any possibility of the two views drifting apart or racing to "self-heal" each other
  // (a prior continuous reconciliation effect here was itself a source of hydration-race glitches).
  const addLeg = (kind: 'sea' | 'port') =>
    setRecap((r) => {
      const p = r.etaPlan;
      const last = p.legs[p.legs.length - 1];
      const d = legDefaults(p.perf);
      const leg: EtaLeg = {
        from: last?.to ?? '', to: '', kind,
        type: kind === 'sea' ? 'Laden' : 'Loading',
        distNonEca: '0', distEca: '0',
        speed: kind === 'sea' ? d.speed : '',
        wf: kind === 'sea' ? p.weatherMargin : '',
        portDays: kind === 'port' ? '1' : '',
        consVlsfo: kind === 'sea' ? d.seaV : d.portV,
        consMgo: kind === 'sea' ? d.seaM : d.portM,
        consAuto: true,
        supVlsfo: '', supMgo: '', tz: last?.tz ?? '+0',
        extraCons: Object.fromEntries(Object.entries(d.extra).map(([id, v]) => [id, kind === 'sea' ? v.sea : v.port])),
        extraSup: {},
      };
      return { ...r, etaPlan: { ...p, legs: [...p.legs, leg] } };
    });
  const removeLeg = (i: number) =>
    setRecap((r) => ({ ...r, etaPlan: { ...r.etaPlan, legs: r.etaPlan.legs.filter((_, idx) => idx !== i) } }));
  // Push the instructed speed profile onto every leg, and re-blend each leg's Cons (MT/day) from the
  // Normal/ECA rates by its own Non-ECA/ECA distance split (any manual Cons override is reset).
  const applyInstructed = () =>
    setRecap((r) => {
      const p = r.etaPlan;
      const d = legDefaults(p.perf);
      const legs = p.legs.map((l) => {
        const blend = blendedLegCons(p.perf, l);
        return {
          ...l,
          ...(l.kind === 'sea' ? { speed: d.speed } : null),
          consVlsfo: blend.v,
          consMgo: blend.m,
          extraCons: blend.extra,
          consAuto: true,
        };
      });
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
  const itinCons = resolveEtaConsumption(plan.perf);
  // Itinerary column headers mirror whatever Type is currently selected in Instructed Speed & Consumption.
  const mainFuelLabel = itinCons.mainNormal.type || 'VLSFO';
  const subFuelLabel = itinCons.subNormal.type || 'MGO';
  const extraFuelList = itinCons.extraFuels;
  const endExtra: Record<string, number> = {};
  extraFuelList.forEach((f) => { endExtra[f.id] = computed.length ? computed[computed.length - 1].extraRob[f.id] : num(plan.startRobExtra?.[f.id]); });

  // Bunker-booking request: supply ports (arrival + supplied qty) drawn from the itinerary.
  const bunkerPortOptions: BunkerReqPort[] = plan.legs.map((l, i) => {
    const arr = computed[i]?.arr ?? null;
    const day = (dd: Date | null) => (dd ? `${p2(dd.getDate())}-${p2(dd.getMonth() + 1)}-${dd.getFullYear()}` : '');
    const full = (dd: Date | null) => (dd ? `${day(dd)} ${p2(dd.getHours())}:${p2(dd.getMinutes())}` : '');
    return {
      port: (l.kind === 'sea' ? l.to : l.from) || l.from || '',
      eta: full(arr),
      laycanStart: day(arr),
      laycanEnd: day(arr ? new Date(arr.getTime() + 3 * 86_400_000) : null),
      supV: num(l.supVlsfo),
      supM: num(l.supMgo),
    };
  }).filter((o) => o.port);

  const arrDest = computed.length ? computed[computed.length - 1].arr : null;
  const totalDays = computed.reduce((s, c) => s + c.days, 0);
  const totalUsedV = computed.reduce((s, c) => s + c.usedV, 0);
  const totalUsedM = computed.reduce((s, c) => s + c.usedM, 0);
  const totalUsedExtra: Record<string, number> = {};
  extraFuelList.forEach((f) => { totalUsedExtra[f.id] = computed.reduce((s, c) => s + (c.extraUsed[f.id] || 0), 0); });

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
  const activeConsumption = resolveEtaConsumption(perf);
  // Auto-managed ECA-split fuels (see syncEcaFuelSplit) mirror the ECA rate already shown in the
  // FO/DO tables above — hide them from the user-editable extra-fuel list to avoid a confusing dupe.
  const userExtraFuels = activeConsumption.extraFuels.filter((f) => !f.id.startsWith('auto-eca-'));

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
                  <td>{fuelSel(activeConsumption.mainNormal.type, (v) => setMain('mainNormal', { type: v }))}</td>
                  <td className="fv-ops__r">{nIn(activeConsumption.mainNormal.ballast, (v) => setMain('mainNormal', { ballast: v }))}</td>
                  <td className="fv-ops__r">{nIn(activeConsumption.mainNormal.laden, (v) => setMain('mainNormal', { laden: v }))}</td>
                  <td className="fv-ops__r">{nIn(activeConsumption.mainNormal.idle, (v) => setMain('mainNormal', { idle: v }))}</td>
                  <td className="fv-ops__r">{nIn(activeConsumption.mainNormal.work, (v) => setMain('mainNormal', { work: v }))}</td>
                </tr>
                <tr>
                  <td>ECA</td>
                  <td>{fuelSel(activeConsumption.mainEca.type, (v) => setMain('mainEca', { type: v }))}</td>
                  <td className="fv-ops__r">{nIn(activeConsumption.mainEca.ballast, (v) => setMain('mainEca', { ballast: v }))}</td>
                  <td className="fv-ops__r">{nIn(activeConsumption.mainEca.laden, (v) => setMain('mainEca', { laden: v }))}</td>
                  <td className="fv-ops__r">{nIn(activeConsumption.mainEca.idle, (v) => setMain('mainEca', { idle: v }))}</td>
                  <td className="fv-ops__r">{nIn(activeConsumption.mainEca.work, (v) => setMain('mainEca', { work: v }))}</td>
                </tr>
              </tbody>
            </table>
            <table className="fv-ops__perf-tbl">
              <thead><tr><th>DO</th><th>Type</th><th className="fv-ops__r">Sea</th><th className="fv-ops__r">Idle</th><th className="fv-ops__r">Work</th></tr></thead>
              <tbody>
                <tr>
                  <td>Normal</td>
                  <td>{fuelSel(activeConsumption.subNormal.type, (v) => setSub('subNormal', { type: v }))}</td>
                  <td className="fv-ops__r">{nIn(activeConsumption.subNormal.sea, (v) => setSub('subNormal', { sea: v }))}</td>
                  <td className="fv-ops__r">{nIn(activeConsumption.subNormal.idle, (v) => setSub('subNormal', { idle: v }))}</td>
                  <td className="fv-ops__r">{nIn(activeConsumption.subNormal.work, (v) => setSub('subNormal', { work: v }))}</td>
                </tr>
                <tr>
                  <td>ECA</td>
                  <td>{fuelSel(activeConsumption.subEca.type, (v) => setSub('subEca', { type: v }))}</td>
                  <td className="fv-ops__r">{nIn(activeConsumption.subEca.sea, (v) => setSub('subEca', { sea: v }))}</td>
                  <td className="fv-ops__r">{nIn(activeConsumption.subEca.idle, (v) => setSub('subEca', { idle: v }))}</td>
                  <td className="fv-ops__r">{nIn(activeConsumption.subEca.work, (v) => setSub('subEca', { work: v }))}</td>
                </tr>
              </tbody>
            </table>
            {userExtraFuels.map((f) => (
              <div className="fv-ops__perf-extrafuel" key={f.id}>
                <div className="fv-ops__perf-extrafuel-head">
                  <input className="fv-ops__eta-sel fv-ops__perf-extrafuel-name" value={f.grade} onChange={(e) => renameExtraFuelGrade(f.id, e.target.value)} />
                  <button type="button" className="fv-ops__perf-customx fv-ops__perf-extrafuel-rm" title="Remove fuel" aria-label="Remove fuel" onClick={() => removeExtraFuel(f.id)}><i className="fas fa-times" aria-hidden="true" /></button>
                </div>
                <table className="fv-ops__perf-tbl">
                  <thead><tr><th /><th>Type</th><th className="fv-ops__r">Ballast</th><th className="fv-ops__r">Laden</th><th className="fv-ops__r">Idle</th><th className="fv-ops__r">Work</th></tr></thead>
                  <tbody>
                    <tr>
                      <td>Normal</td>
                      <td>{fuelSel(f.normal.type, (v) => setExtraFuel(f.id, 'normal', { type: v }))}</td>
                      <td className="fv-ops__r">{nIn(f.normal.ballast, (v) => setExtraFuel(f.id, 'normal', { ballast: v }))}</td>
                      <td className="fv-ops__r">{nIn(f.normal.laden, (v) => setExtraFuel(f.id, 'normal', { laden: v }))}</td>
                      <td className="fv-ops__r">{nIn(f.normal.idle, (v) => setExtraFuel(f.id, 'normal', { idle: v }))}</td>
                      <td className="fv-ops__r">{nIn(f.normal.work, (v) => setExtraFuel(f.id, 'normal', { work: v }))}</td>
                    </tr>
                    <tr>
                      <td>ECA</td>
                      <td>{fuelSel(f.eca.type, (v) => setExtraFuel(f.id, 'eca', { type: v }))}</td>
                      <td className="fv-ops__r">{nIn(f.eca.ballast, (v) => setExtraFuel(f.id, 'eca', { ballast: v }))}</td>
                      <td className="fv-ops__r">{nIn(f.eca.laden, (v) => setExtraFuel(f.id, 'eca', { laden: v }))}</td>
                      <td className="fv-ops__r">{nIn(f.eca.idle, (v) => setExtraFuel(f.id, 'eca', { idle: v }))}</td>
                      <td className="fv-ops__r">{nIn(f.eca.work, (v) => setExtraFuel(f.id, 'eca', { work: v }))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
            <button type="button" className="fv-ops__btn fv-ops__btn--sm" onClick={addExtraFuel}><i className="fas fa-plus" aria-hidden="true" /> Add Fuel</button>
          </div>
        </div>
      </Card>

      {/* Itinerary — ETA & ROB projection */}
      <Card
        title="ETA & ROB - Itinerary"
        icon="fa-route"
        right={(
          <span className="fv-ops__eta-addbtns">
            <button type="button" className="fv-ops__btn fv-ops__btn--primary" onClick={() => setBunkerOpen(true)} title="Raise a bunker booking request to the Bunkers department"><i className="fas fa-gas-pump" aria-hidden="true" /> Request Bunker Booking</button>
            <button type="button" className="fv-ops__btn" onClick={rebuildFromPorts} title="Discards all current legs and rebuilds the itinerary from the voyage port rotation"><i className="fas fa-arrows-rotate" aria-hidden="true" /> Reset</button>
            <button type="button" className="fv-ops__btn" onClick={() => addLeg('sea')}><i className="fas fa-water" aria-hidden="true" /> Sea leg</button>
            <button type="button" className="fv-ops__btn" onClick={() => addLeg('port')}><i className="fas fa-anchor" aria-hidden="true" /> Port stay</button>
          </span>
        )}
      >
        <div className="fv-ops__vd-fields fv-ops__eta-controls">
          <VdDateTime label="Delivery Date / Time (DEP-UTC)" value={plan.startDep} onChange={(v) => setPlan({ startDep: v })} accent readOnly title="Derived from Voyage Details' Delivery Date & Time \u2014 edit it there to change this." />
          <VdField label="Default Weather Margin (%)" value={plan.weatherMargin} onChange={setWeatherMargin} num />
          <VdField label={`Bunkers on Delivery — ${mainFuelLabel}`} value={plan.startRobVlsfo} onChange={setStartRobMain} num />
          <VdField label={`Bunkers on Delivery — ${subFuelLabel}`} value={plan.startRobMgo} onChange={setStartRobSub} num />
        </div>
        <div className="fv-ops__eta-scroll">
          <table className="fv-ops__eta">
            <colgroup>
              <col className="fv-ops__eta-c-type" />
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
              {extraFuelList.map((f) => <col className="fv-ops__eta-c-num" key={`cg-cons-${f.id}`} />)}
              <col className="fv-ops__eta-c-num" />
              <col className="fv-ops__eta-c-num" />
              {extraFuelList.map((f) => <col className="fv-ops__eta-c-num" key={`cg-used-${f.id}`} />)}
              <col className="fv-ops__eta-c-num" />
              <col className="fv-ops__eta-c-num" />
              {extraFuelList.map((f) => <col className="fv-ops__eta-c-num" key={`cg-sup-${f.id}`} />)}
              <col className="fv-ops__eta-c-num" />
              <col className="fv-ops__eta-c-num" />
              {extraFuelList.map((f) => <col className="fv-ops__eta-c-num" key={`cg-rob-${f.id}`} />)}
              <col className="fv-ops__eta-c-rm" />
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2}>Type</th>
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
                <th colSpan={2 + extraFuelList.length}>Cons (MT/day)</th>
                <th colSpan={2 + extraFuelList.length}>Used (MT)</th>
                <th colSpan={2 + extraFuelList.length}>Supply (MT)</th>
                <th colSpan={2 + extraFuelList.length}>Est ROB (MT)</th>
                <th rowSpan={2} aria-label="Remove" />
              </tr>
              <tr>
                <th>Non-ECA</th>
                <th>ECA</th>
                <th>{mainFuelLabel}</th>
                <th>{subFuelLabel}</th>
                {extraFuelList.map((f) => <th key={`h-cons-${f.id}`}>{extraFuelLabel(f)}</th>)}
                <th>{mainFuelLabel}</th>
                <th>{subFuelLabel}</th>
                {extraFuelList.map((f) => <th key={`h-used-${f.id}`}>{extraFuelLabel(f)}</th>)}
                <th>{mainFuelLabel}</th>
                <th>{subFuelLabel}</th>
                {extraFuelList.map((f) => <th key={`h-sup-${f.id}`}>{extraFuelLabel(f)}</th>)}
                <th>{mainFuelLabel}</th>
                <th>{subFuelLabel}</th>
                {extraFuelList.map((f) => <th key={`h-rob-${f.id}`}>{extraFuelLabel(f)}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="fv-ops__eta-delivery">
                <td colSpan={19 + 3 * extraFuelList.length}>Bunkers on Delivery</td>
                <td className="fv-ops__r fv-ops__eta-rob">{fmt(num(plan.startRobVlsfo))}</td>
                <td className="fv-ops__r fv-ops__eta-rob">{fmt(num(plan.startRobMgo))}</td>
                {extraFuelList.map((f) => (
                  <td className="fv-ops__r fv-ops__eta-rob" key={`del-${f.id}`}>{nIn(plan.startRobExtra?.[f.id] ?? '0', (v) => setStartRobExtra(f.id, v))}</td>
                ))}
                <td />
              </tr>
              {plan.legs.map((l, i) => {
                const c = computed[i];
                return (
                  <tr key={i} className={l.kind === 'port' ? 'fv-ops__eta-port' : undefined}>
                    <td>
                      <select className="fv-ops__eta-sel" value={l.type ?? (l.kind === 'sea' ? 'Laden' : 'Loading')} onChange={(e) => setLeg(i, { type: e.target.value })}>
                        {l.type && !OPS_LEG_TYPES.includes(l.type) && <option value={l.type}>{l.type}</option>}
                        {OPS_LEG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td>{nIn(l.from, (v) => setLeg(i, { from: v }), 'fv-ops__eta-in--wide')}</td>
                    <td>{nIn(l.to, (v) => setLeg(i, { to: v, tzAuto: true }), 'fv-ops__eta-in--wide')}</td>
                    <td className="fv-ops__r">{l.kind === 'sea' ? nIn(l.distNonEca, (v) => setLeg(i, { distNonEca: v, consAuto: true })) : '—'}</td>
                    <td className="fv-ops__r">
                      {l.kind === 'sea'
                        ? nIn(l.distEca, (v) => setLeg(i, { distEca: v, consAuto: true }))
                        : <label className="fv-ops__eta-port-eca" title="Port is within an ECA zone">
                            <input type="checkbox" checked={!!l.ecaPort} onChange={(e) => setLeg(i, { ecaPort: e.target.checked, consAuto: true })} /> ECA
                          </label>}
                    </td>
                    <td className="fv-ops__r">{l.kind === 'sea' ? nIn(l.speed, (v) => setLeg(i, { speed: v })) : '—'}</td>
                    <td className="fv-ops__r">{l.kind === 'sea' ? nIn(l.wf, (v) => setLeg(i, { wf: v })) : '—'}</td>
                    <td className="fv-ops__r fv-ops__eta-calc">{l.kind === 'sea' ? fmt(c.avgSpeed, 2) : '—'}</td>
                    <td className="fv-ops__r">{l.kind === 'port' ? nIn(l.portDays, (v) => setLeg(i, { portDays: v })) : <span className="fv-ops__eta-calc">{fmt(c.days, 2)}</span>}</td>
                    <td className="fv-ops__eta-dt">{fmtDT(c.dep)}</td>
                    <td className="fv-ops__eta-dt">{fmtDT(c.arr)}</td>
                    <td className="fv-ops__r">{nIn(l.tz, (v) => setLeg(i, { tz: v, tzAuto: false }), 'fv-ops__eta-in--tz')}</td>
                    <td className="fv-ops__eta-dt fv-ops__eta-lt">{fmtDT(c.arrLt)}</td>
                    <td className="fv-ops__r">{nIn(l.consVlsfo, (v) => setLeg(i, { consVlsfo: v, consAuto: false }))}</td>
                    <td className="fv-ops__r">{nIn(l.consMgo, (v) => setLeg(i, { consMgo: v, consAuto: false }))}</td>
                    {extraFuelList.map((f) => (
                      <td className="fv-ops__r" key={`cons-${f.id}`}>{nIn(l.extraCons?.[f.id] ?? '0', (v) => { setLegExtraCons(i, f.id, v); setLeg(i, { consAuto: false }); })}</td>
                    ))}
                    <td className="fv-ops__r fv-ops__eta-calc">{fmt(c.usedV, 2)}</td>
                    <td className="fv-ops__r fv-ops__eta-calc">{fmt(c.usedM, 2)}</td>
                    {extraFuelList.map((f) => (
                      <td className="fv-ops__r fv-ops__eta-calc" key={`used-${f.id}`}>{fmt(c.extraUsed[f.id] || 0, 2)}</td>
                    ))}
                    <td className="fv-ops__r">{nIn(l.supVlsfo, (v) => setLeg(i, { supVlsfo: v }))}</td>
                    <td className="fv-ops__r">{nIn(l.supMgo, (v) => setLeg(i, { supMgo: v }))}</td>
                    {extraFuelList.map((f) => (
                      <td className="fv-ops__r" key={`sup-${f.id}`}>{nIn(l.extraSup?.[f.id] ?? '0', (v) => setLegExtraSup(i, f.id, v))}</td>
                    ))}
                    <td className={`fv-ops__r fv-ops__eta-rob${c.robV < 0 ? ' fv-ops__neg' : ''}`}>{fmt(c.robV, 2)}</td>
                    <td className={`fv-ops__r fv-ops__eta-rob${c.robM < 0 ? ' fv-ops__neg' : ''}`}>{fmt(c.robM, 2)}</td>
                    {extraFuelList.map((f) => (
                      <td className={`fv-ops__r fv-ops__eta-rob${(c.extraRob[f.id] || 0) < 0 ? ' fv-ops__neg' : ''}`} key={`rob-${f.id}`}>{fmt(c.extraRob[f.id] || 0, 2)}</td>
                    ))}
                    <td className="fv-ops__r"><button type="button" className="fv-ops__vd-sp-rm" aria-label="Remove leg" onClick={() => removeLeg(i)}><i className="fas fa-trash" aria-hidden="true" /></button></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="fv-ops__row-sub">
                <td colSpan={8}>Totals</td>
                <td className="fv-ops__r">{fmt(totalDays, 2)}</td>
                <td colSpan={6 + extraFuelList.length} />
                <td className="fv-ops__r">{fmt(totalUsedV, 2)}</td>
                <td className="fv-ops__r">{fmt(totalUsedM, 2)}</td>
                {extraFuelList.map((f) => (
                  <td className="fv-ops__r" key={`tot-used-${f.id}`}>{fmt(totalUsedExtra[f.id] || 0, 2)}</td>
                ))}
                <td colSpan={2 + extraFuelList.length} />
                <td className="fv-ops__r">{fmt(endV, 2)}</td>
                <td className="fv-ops__r">{fmt(endM, 2)}</td>
                {extraFuelList.map((f) => (
                  <td className="fv-ops__r" key={`tot-rob-${f.id}`}>{fmt(endExtra[f.id] || 0, 2)}</td>
                ))}
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
      <BunkersCard recap={recap} setRecap={setRecap} voyage={voyage} />
      {bunkerOpen && <BunkerRequestModal recap={recap} voyage={voyage} ports={bunkerPortOptions} mainFuel={mainFuelLabel} subFuel={subFuelLabel} onClose={() => setBunkerOpen(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------ Stowage tab */

/** One itinerary port option for the bunker-booking request (arrival + supplied qty). */
interface BunkerReqPort { port: string; eta: string; laycanStart: string; laycanEnd: string; supV: number; supM: number }

/** Request bunker booking — seeded from the itinerary supply columns; submits to the Bunkers dept. */
function BunkerRequestModal({ recap, voyage, ports, mainFuel, subFuel, onClose }: {
  recap: Recap; voyage: Voyage; ports: BunkerReqPort[]; mainFuel: string; subFuel: string; onClose: () => void;
}) {
  // Pre-populate ALL ports that have supply values; fall back to first port if none.
  const supplyPorts = ports.filter((o) => o.supV + o.supM > 0);
  const initPorts = supplyPorts.length > 0 ? supplyPorts : [ports[0] ?? { port: recap.dischargePort, eta: '', laycanStart: '', laycanEnd: '', supV: 0, supM: 0 }];
  // Only pre-fill a fuel line for a grade that actually has a supply quantity recorded against
  // this port — a port with only VLSFO supplied shouldn't also show a blank/zero LSMGO row. Uses
  // the voyage's actual active Main/Sub fuel grades (not hardcoded names), so e.g. a vessel running
  // MGO rather than LSMGO shows "MGO" here, matching the ETA & ROB itinerary and Bunkers card.
  const linesForSupply = (supV: number, supM: number): { fuel: string; qty: string }[] => {
    const lines: { fuel: string; qty: string }[] = [];
    if (supV > 0) lines.push({ fuel: mainFuel, qty: String(supV) });
    if (supM > 0) lines.push({ fuel: subFuel, qty: String(supM) });
    return lines.length ? lines : [{ fuel: mainFuel, qty: '' }];
  };
  // Shows the Bunkers card's Specs entry for this grade, so the bunkers team sees the required
  // spec alongside the quantity being requested (read-only here — specs are edited in the Bunkers
  // card itself).
  const specsFor = (fuel: string): string =>
    recap.bunkers.find((b) => b.fuel.trim().toUpperCase() === fuel.trim().toUpperCase())?.specs ?? '';

  // Each entry is one port with its own fuel lines.
  const [portEntries, setPortEntries] = useState<Array<{
    port: string; eta: string; laycanStart: string; laycanEnd: string;
    lines: { fuel: string; qty: string }[];
  }>>(initPorts.map((o) => ({
    port: o.port, eta: o.eta, laycanStart: o.laycanStart, laycanEnd: o.laycanEnd,
    lines: linesForSupply(o.supV, o.supM),
  })));
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const [doneIds, setDoneIds] = useState<string[]>([]);

  // Convert dd-mm-yyyy HH:MM ↔ datetime-local value (yyyy-MM-ddTHH:mm).
  const p2 = (n: number) => String(n).padStart(2, '0');
  const dmyToDatetimeLocal = (s: string) => {
    const d = parseDMY(s);
    if (!d) return '';
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
  };
  const datetimeLocalToDmy = (s: string) => {
    if (!s) return '';
    const [datePart, timePart = '00:00'] = s.split('T');
    const [y, mo, dd] = datePart.split('-');
    return `${dd}-${mo}-${y} ${timePart}`;
  };
  const dateInputToDmy = (s: string) => {
    if (!s) return '';
    const [y, mo, dd] = s.split('-');
    return `${dd}-${mo}-${y}`;
  };

  // Ports with an actual supply quantity recorded in the itinerary — the only ones selectable in
  // the single "Port of Supply" field below (falls back to the full itinerary list if none have
  // supply yet, so the field is never left with nothing to pick).
  const supplyPortList = ports.filter((o) => o.supV + o.supM > 0);
  const portPickList = supplyPortList.length > 0 ? supplyPortList : ports;
  const applyPortByName = (entryIdx: number, portName: string) => {
    const o = ports.find((p) => p.port === portName);
    if (!o) return;
    setPortEntries((prev) => prev.map((e, i) => i !== entryIdx ? e : {
      ...e, port: o.port, eta: o.eta, laycanStart: o.laycanStart, laycanEnd: o.laycanEnd,
      lines: linesForSupply(o.supV, o.supM),
    }));
  };
  const setEntryField = (i: number, patch: Partial<typeof portEntries[0]>) =>
    setPortEntries((prev) => prev.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const setLine = (ei: number, li: number, patch: Partial<{ fuel: string; qty: string }>) =>
    setPortEntries((prev) => prev.map((e, k) => k !== ei ? e : { ...e, lines: e.lines.map((l, j) => (j === li ? { ...l, ...patch } : l)) }));
  const addLine = (ei: number) => setPortEntries((prev) => prev.map((e, k) => k !== ei ? e : { ...e, lines: [...e.lines, { fuel: mainFuel, qty: '' }] }));
  const delLine = (ei: number, li: number) => setPortEntries((prev) => prev.map((e, k) => k !== ei ? e : { ...e, lines: e.lines.filter((_, j) => j !== li) }));
  const addPort = () => setPortEntries((prev) => [...prev, { port: '', eta: '', laycanStart: '', laycanEnd: '', lines: [{ fuel: mainFuel, qty: '' }] }]);
  const removePort = (i: number) => setPortEntries((prev) => prev.filter((_, k) => k !== i));

  const validEntries = portEntries.filter((e) => e.port.trim() && e.lines.some((l) => num(l.qty) > 0));
  const valid = validEntries.length > 0;

  // Create ONE requirement per port with all its fuel lines.
  const submit = () => {
    const ids: string[] = [];
    validEntries.forEach((e) => {
      const activeLines = e.lines.filter((l) => num(l.qty) > 0);
      const id = addBunkerRequirement({
        vessel: recap.vesselName, imo: recap.vesselImo || voyage.imo, reference: voyage.id, loadPort: recap.loadPort, dischargePort: recap.dischargePort,
        bunkerPort: e.port, eta: e.eta, requiredOn: e.laycanStart, laycanStart: e.laycanStart, laycanEnd: e.laycanEnd,
        fuelType: activeLines[0].fuel, quantity: num(activeLines[0].qty),
        fuelLines: activeLines.map((l) => ({ fuel: l.fuel, quantity: num(l.qty), specs: specsFor(l.fuel) || undefined })),
        ownerInstructions: note || undefined,
      });
      ids.push(id);
      const summary = activeLines.map((l) => `${l.fuel} ${fmt(num(l.qty), 0)} MT`).join(' + ');
      addNotification(`New bunker request — ${recap.vesselName} @ ${e.port} (${summary}), ETA ${e.eta || '—'}`, 'Bunker');
    });
    setDoneIds(ids);
    setDone(true);
  };

  return (
    <div className="fv-ops__modal-overlay" onClick={onClose}>
      <div className="fv-ops__soa" style={{ width: 'min(660px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="fv-ops__soa-head">
          <div>
            <h2>Request Bunker Booking</h2>
            <span className="fv-ops__soa-sub">{recap.vesselName} · IMO {recap.vesselImo || voyage.imo || '—'} · to Bunkers Department</span>
          </div>
          <div className="fv-ops__soa-headbtns">
            <button type="button" className="fv-ops__icon-btn" onClick={onClose} aria-label="Close"><i className="fas fa-xmark" aria-hidden="true" /></button>
          </div>
        </div>
        <div className="fv-ops__soa-body">
          {done ? (
            <div className="fv-ops__bnkreq-done">
              <i className="fas fa-circle-check" aria-hidden="true" />
              <p>{doneIds.length} bunker requirement{doneIds.length > 1 ? 's' : ''} sent to the Bunkers department (<b>{doneIds.join(', ')}</b>). {doneIds.length > 1 ? 'They appear' : 'It appears'} in the Bunker module as <b>Pending RFQ</b>.</p>
              <button type="button" className="fv-ops__btn fv-ops__btn--go" onClick={onClose}>Done</button>
            </div>
          ) : (
            <>
              {portEntries.map((entry, ei) => (
                <div key={ei} className="fv-ops__bnkreq-port-block">
                  {portEntries.length > 1 && (
                    <div className="fv-ops__bnkreq-port-head">
                      <span><i className="fas fa-anchor" aria-hidden="true" /> Port #{ei + 1}</span>
                      <button type="button" className="fv-ops__bnk-rm" aria-label="Remove port" onClick={() => removePort(ei)}><i className="fas fa-xmark" aria-hidden="true" /></button>
                    </div>
                  )}
                  <div className="fv-ops__vd-fields">
                    <label className="fv-ops__vd-field">
                      <span>Port of Supply</span>
                      <select className="fv-ops__vd-in" value={entry.port} onChange={(e) => applyPortByName(ei, e.target.value)}>
                        <option value="">— pick from itinerary —</option>
                        {portPickList.map((o, i) => <option key={i} value={o.port}>{o.port}{o.supV + o.supM > 0 ? ' · supply planned' : ''}</option>)}
                      </select>
                    </label>
                    <label className="fv-ops__vd-field"><span>ETA at Port</span><input type="datetime-local" className="fv-ops__vd-in fv-ops__vd-in--dt" value={dmyToDatetimeLocal(entry.eta)} onChange={(e) => setEntryField(ei, { eta: datetimeLocalToDmy(e.target.value) })} /></label>
                    <label className="fv-ops__vd-field"><span>Laycan Start</span><input type="datetime-local" className="fv-ops__vd-in fv-ops__vd-in--dt" value={dmyToDatetimeLocal(entry.laycanStart)} onChange={(e) => setEntryField(ei, { laycanStart: dateInputToDmy(e.target.value.split('T')[0]) })} /></label>
                    <label className="fv-ops__vd-field"><span>Laycan End</span><input type="datetime-local" className="fv-ops__vd-in fv-ops__vd-in--dt" value={dmyToDatetimeLocal(entry.laycanEnd)} onChange={(e) => setEntryField(ei, { laycanEnd: dateInputToDmy(e.target.value.split('T')[0]) })} /></label>
                  </div>
                  <div className="fv-ops__vd-sub-head fv-ops__bnkreq-fuelhd"><i className="fas fa-gas-pump" aria-hidden="true" /> Fuel &amp; Quantity
                    <button type="button" className="fv-ops__btn fv-ops__soa-add" onClick={() => addLine(ei)}><i className="fas fa-plus" aria-hidden="true" /> Fuel</button>
                  </div>
                  <table className="fv-ops__table">
                    <thead><tr><th>Fuel Type</th><th className="fv-ops__r">Quantity (MT)</th><th>Specs</th><th aria-label="Remove" /></tr></thead>
                    <tbody>
                      {entry.lines.map((l, li) => (
                        <tr key={li}>
                          <td><select className="fv-ops__eta-sel" value={l.fuel} onChange={(e) => setLine(ei, li, { fuel: e.target.value })}>{OPS_FUEL_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}</select></td>
                          <td className="fv-ops__r"><input className="fv-ops__eta-in" value={l.qty} placeholder="0" onChange={(e) => setLine(ei, li, { qty: e.target.value })} /></td>
                          <td className="fv-ops__bnkreq-specs">{specsFor(l.fuel) || '—'}</td>
                          <td className="fv-ops__r">{entry.lines.length > 1 && <button type="button" className="fv-ops__bnk-rm" aria-label="Remove fuel" onClick={() => delLine(ei, li)}><i className="fas fa-xmark" aria-hidden="true" /></button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              <button type="button" className="fv-ops__btn fv-ops__soa-add" style={{ marginBottom: 8 }} onClick={addPort}><i className="fas fa-plus" aria-hidden="true" /> Add Another Port</button>
              <label className="fv-ops__vd-field fv-ops__bnkreq-note"><span>Instructions / Note</span><input className="fv-ops__vd-in" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional message to the bunkers team" /></label>
              <div className="fv-ops__laytime-actions">
                <button type="button" className="fv-ops__btn" onClick={onClose}>Cancel</button>
                <button type="button" className="fv-ops__btn fv-ops__btn--primary" disabled={!valid} onClick={submit}><i className="fas fa-paper-plane" aria-hidden="true" /> Submit {validEntries.length > 1 ? `${validEntries.length} Requests` : 'Request'}</button>
              </div>
              <p className="fv-ops__hint">One requirement is created per port with all its fuel types. Add ports with <b>Add Another Port</b> to submit multiple bunkering stops in one action.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

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
  // Rebuild the zone/port columns from the ETA & ROB port rotation, auto-inserting a Load
  // Line Zone crossing column wherever the route between two consecutive ports is detected
  // to pass through a different zone (best-effort — see classifyLoadLineZone()).
  const worldPorts = useWorldPorts();
  const syncPointsFromRotation = () => {
    const computed = projectEtaLegs(recap.etaPlan);
    const seen = new Set<string>();
    const stops: { name: string; lat?: number; lon?: number; date?: Date }[] = [];
    recap.etaPlan.legs.forEach((l, idx) => {
      const name = l.to?.trim();
      if (l.kind !== 'port' || !name) return;
      const key = name.toUpperCase();
      if (seen.has(key)) return;
      seen.add(key);
      const port = matchWorldPort(name, worldPorts);
      const date = computed[idx]?.dep ?? computed[idx]?.arr ?? undefined;
      stops.push({ name, lat: port?.lat, lon: port?.lon, date: date ?? undefined });
    });

    const names: string[] = [];
    stops.forEach((a, i) => {
      names.push(a.name);
      const b = stops[i + 1];
      if (!b || a.lat == null || a.lon == null || b.lat == null || b.lon == null) return;
      // Sample the straight-line path between the two ports (with the date interpolated across
      // the leg's transit time) and flag every zone the route passes through in between.
      const steps = 16;
      let lon2 = b.lon;
      while (lon2 - a.lon > 180) lon2 -= 360;
      while (lon2 - a.lon < -180) lon2 += 360;
      const tMs = a.date && b.date ? b.date.getTime() - a.date.getTime() : 0;
      let prevZone = classifyLoadLineZone(a.lat, a.lon, a.date ?? new Date()).name;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const lat = a.lat + (b.lat - a.lat) * t;
        const lon = a.lon + (lon2 - a.lon) * t;
        const date = a.date && tMs ? new Date(a.date.getTime() + tMs * t) : (a.date ?? new Date());
        const zone = classifyLoadLineZone(lat, lon, date).name;
        if (zone !== prevZone) {
          names.push(`Entry ${zone}`);
          prevZone = zone;
        }
      }
    });

    setRecap((r) => ({
      ...r,
      stowage: {
        ...r.stowage,
        points: names.map((name) => {
          const existing = r.stowage.points.find((p) => p.name.trim().toUpperCase() === name.toUpperCase());
          return existing ?? { name, displacement: '', density: '', vlsfo: '0', mgo: '0', bw: '0', fw: '0', constants: '0' };
        }),
      },
    }));
  };
  const setHold = (i: number, patch: Partial<StowageHold>) =>
    setRecap((r) => ({ ...r, stowage: { ...r.stowage, holds: r.stowage.holds.map((h, idx) => (idx === i ? { ...h, ...patch } : h)) } }));
  const addHold = () =>
    setRecap((r) => {
      const base = r.stowage.holds[r.stowage.holds.length - 1];
      const nh: StowageHold = { name: `Hold ${r.stowage.holds.length + 1}`, cargo: base?.cargo ?? '', qty: '0', capacity: base?.capacity ?? '', grainCap: base?.grainCap ?? '', baleCap: base?.baleCap ?? '', tankTopArea: base?.tankTopArea ?? '', tankTopMax: base?.tankTopMax ?? '' };
      return { ...r, stowage: { ...r.stowage, holds: [...r.stowage.holds, nh] } };
    });
  const removeHold = (i: number) =>
    setRecap((r) => ({ ...r, stowage: { ...r.stowage, holds: r.stowage.holds.filter((_, idx) => idx !== i) } }));
  // Keep the hold rows (grow or shrink) in sync with "No. of Holds" (Fixture & Vessel card).
  // Runs on mount too (the Cargo & Stowage tab unmounts when you switch tabs, so a ref-based
  // "only when it changes" guard missed edits made on the Voyage Details tab) and is a no-op
  // once the counts already match, so it won't fight a manual +/✕ edit on its own.
  useEffect(() => {
    const target = Math.round(num(recap.holdCount || ''));
    if (!(target > 0)) return;
    setRecap((r) => {
      if (r.stowage.holds.length === target) return r;
      let holds = [...r.stowage.holds];
      if (holds.length < target) {
        while (holds.length < target) {
          holds.push({ name: `Hold ${holds.length + 1}`, cargo: '', qty: '0', capacity: '', grainCap: '', baleCap: '', tankTopArea: '', tankTopMax: '' });
        }
      } else if (holds.length > target) {
        holds = holds.slice(0, target);
      }
      return { ...r, stowage: { ...r.stowage, holds } };
    });
  }, [recap.holdCount, setRecap]);
  const setGrade = (i: number, patch: Partial<StowageGrade>) =>
    setRecap((r) => ({ ...r, stowage: { ...r.stowage, grades: r.stowage.grades.map((g, idx) => (idx === i ? { ...g, ...patch } : g)) } }));
  const addGrade = () =>
    setRecap((r) => ({ ...r, stowage: { ...r.stowage, grades: [...r.stowage.grades, { grade: '', sf: '', qty: '', sfAuto: true }] } }));
  const removeGrade = (i: number) =>
    setRecap((r) => ({ ...r, stowage: { ...r.stowage, grades: r.stowage.grades.filter((_, idx) => idx !== i) } }));

  // Cargo Master database lookup — grade names searched against the admin-maintained
  // cargo database, with the stowage factor pulled from it unless manually overridden.
  const cargoMaster = useCargoMaster();
  const cargoOptions = useMemo(
    () => cargoMaster
      .filter((c) => c.status === 'Active')
      .map((c) => ({
        value: c.cargoName,
        meta: c.stowageFactorMin || c.stowageFactorMax
          ? `SF ${c.stowageFactorMin || '—'}–${c.stowageFactorMax || '—'} ${c.stowageFactorUnit}`
          : c.category || undefined,
      })),
    [cargoMaster],
  );
  // Grade name change: re-match the Cargo Master database and pull its SF whenever the
  // field still holds an auto-filled value, or was left blank (a non-empty manual SF
  // edit sticks until the grade is changed again).
  const setGradeName = (i: number, name: string) => {
    const sf = cargoStowageFactor(name);
    setRecap((r) => ({
      ...r,
      stowage: {
        ...r.stowage,
        grades: r.stowage.grades.map((g, idx) => {
          if (idx !== i) return g;
          if (sf && (g.sfAuto !== false || !g.sf.trim())) return { ...g, grade: name, sf, sfAuto: true };
          return { ...g, grade: name };
        }),
      },
    }));
  };
  const setPort = (i: number, patch: Partial<StowagePort>) =>
    setRecap((r) => ({ ...r, stowage: { ...r.stowage, ports: r.stowage.ports.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) } }));
  const addPort = () =>
    setRecap((r) => ({ ...r, stowage: { ...r.stowage, ports: [...r.stowage.ports, { name: '', maxDraft: '', density: '1.025', remarks: '' }] } }));
  // Rebuild the port list from the ETA & ROB port rotation (kind: 'port' legs) — remarks
  // mirror that leg's Type, and any max draft / density already entered for a matching
  // port name is preserved.
  const syncPortsFromRotation = () => {
    const seen = new Set<string>();
    const rotation: { name: string; type: string }[] = [];
    recap.etaPlan.legs.forEach((l) => {
      const name = l.to?.trim();
      if (l.kind !== 'port' || !name) return;
      const key = name.toUpperCase();
      if (seen.has(key)) return;
      seen.add(key);
      rotation.push({ name, type: l.type || '' });
    });
    setRecap((r) => ({
      ...r,
      stowage: {
        ...r.stowage,
        ports: rotation.map(({ name, type }) => {
          const existing = r.stowage.ports.find((p) => p.name.trim().toUpperCase() === name.toUpperCase());
          return { name, maxDraft: existing?.maxDraft ?? '', density: existing?.density ?? '', remarks: type };
        }),
      },
    }));
  };
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
  // Vessel hydrostatic reference (from the Displacement field above, or the density-correction
  // card if left blank) for deriving a port's max displacement from its max draft: Δdisp = TPC × 100 per metre.
  const draftRef = num(st.draft.draftCurrent);
  const dispRef = num(st.refDisplacement) || num(st.draft.dispSW);
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
    const dispMax = (p.displacementAuto !== false && draftDerived) ? dispRef + (maxDraft - draftRef) * tpcRef * 100 : num(p.displacement);
    const dispPort = dispMax * (density / 1.025);
    const auto = st.autoBunker ? robByPort[p.name.trim().toUpperCase()] : undefined;
    const vlsfo = auto ? auto.v : num(p.vlsfo);
    const mgo = auto ? auto.m : num(p.mgo);
    const bw = num(st.ballastWater);
    const fw = num(st.freshWater);
    const constants = num(st.constants);
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
    const constraints = [maxByGrain, maxByBale, maxByStrength].filter((v) => v > 0);
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
  const loiTolerance = num(dc.loiTolerancePct) || 0.5;
  const loi = Math.abs(pctDiff) > loiTolerance ? 'YES' : 'NO';

  // --- "AI" recommendations — every figure below is pulled live from the actual Cargo & Stowage
  // data (DWT intake, hold capacities, ETA & ROB bunkers, ship/shore survey) rather than fixed
  // assumptions, so each recommendation only appears when it reflects a real, current condition. ---
  const freight = num(recap.freightPerMt);
  const cpNum = num((recap.cpQuantity || '').split('/')[0]);
  const maxCargoVal = cargoVals.length ? Math.max(...cargoVals) : 0;
  const trapped = Math.max(0, maxCargoVal - minCargo);
  const bunkerAtGov = governIdx >= 0 ? rows[governIdx].vlsfo + rows[governIdx].mgo : 0;
  const portBefore = governIdx > 0 ? st.points[governIdx - 1]?.name : '';
  const portAfter = governIdx >= 0 && governIdx < st.points.length - 1 ? st.points[governIdx + 1]?.name : '';
  const applyMaxIntake = () => setRecap((r) => ({ ...r, finalQtyLoaded: String(Math.round(minCargo)) }));

  // Minimum bunkers needed (+10% margin) to safely sail the leg departing the governing point —
  // anything carried above this at the governing point is genuine spare ROB, not a cargo guess.
  const legFromGoverning = recap.etaPlan.legs.find((l) => l.kind === 'sea' && l.from.trim().toUpperCase() === (governName || '').trim().toUpperCase());
  let safeMinBunkerAtGov = 0;
  if (legFromGoverning) {
    const dist = num(legFromGoverning.distNonEca) + num(legFromGoverning.distEca);
    const speed = num(legFromGoverning.speed) * (1 - num(legFromGoverning.wf) / 100);
    const days = speed > 0 ? dist / (speed * 24) : 0;
    safeMinBunkerAtGov = (num(legFromGoverning.consVlsfo) + num(legFromGoverning.consMgo)) * days * 1.1;
  }
  const spareBunkerAtGov = legFromGoverning ? Math.max(0, bunkerAtGov - safeMinBunkerAtGov) : 0;

  type Rec = { tone: 'good' | 'bad' | 'flat'; icon: string; title: string; text: string; impact?: number; action?: () => void; actionLabel?: string };
  const recs: Rec[] = [];

  if (cpNum > 0 && minCargo >= cpNum) {
    recs.push({ tone: 'good', icon: 'fa-arrow-trend-up', title: 'Lift full CP quantity', text: `Governing zone ${governName} allows ${fmt(minCargo, 0)} MT — above CP ${fmt(cpNum, 0)} MT. Load CP max within tolerance; ${fmt(minCargo - cpNum, 0)} MT spare capacity.`, impact: cpNum * freight, action: applyMaxIntake, actionLabel: 'Set BL = max intake' });
  } else if (minCargo > 0 && cpNum > 0) {
    const short = Math.max(0, cpNum - minCargo);
    recs.push({ tone: 'bad', icon: 'fa-triangle-exclamation', title: 'Intake below CP — deadfreight risk', text: `Max intake ${fmt(minCargo, 0)} MT (governing at ${governName}) is ${fmt(short, 0)} MT under CP ${fmt(cpNum, 0)} MT. Potential deadfreight ≈ $${fmt(short * freight, 0)}. Trim bunkers / ballast at ${governName} or advise charterers.`, impact: -short * freight, action: applyMaxIntake, actionLabel: 'Set BL = max intake' });
  }

  // Bunker-trim opportunity — only surfaced when there's real spare ROB *and* draft is actually
  // binding (trapped > 0), sized from the next leg's own consumption rather than a flat guess.
  if (spareBunkerAtGov > 20 && trapped > 0 && governName && governName !== '—') {
    const gain = Math.min(spareBunkerAtGov, trapped);
    recs.push({
      tone: 'good',
      icon: 'fa-gas-pump',
      title: 'Trim bunkers at the governing point',
      text: `${governName} carries ${fmt(bunkerAtGov, 0)} MT bunkers vs ~${fmt(safeMinBunkerAtGov, 0)} MT needed (+10% margin) to safely reach ${legFromGoverning?.to || 'the next port'}. Trimming the ${fmt(spareBunkerAtGov, 0)} MT spare frees up to ${fmt(gain, 0)} MT of extra cargo.`,
      impact: gain * freight,
    });
  }

  if (portBefore && portAfter && bunkerAtGov > 0 && trapped > 0) {
    recs.push({ tone: 'flat', icon: 'fa-arrows-split-up-and-left', title: 'Split bunker supply across two ports', text: `Stem only enough fuel at ${portBefore} to safely reach ${governName}, then top up at ${portAfter} after the draft-restricted crossing — keeps ROB low exactly where draft governs the intake.` });
  }

  if (trapped > 10) {
    recs.push({ tone: 'flat', icon: 'fa-scale-unbalanced', title: 'Draft-limited cargo', text: `Up to ${fmt(trapped, 0)} MT (≈ $${fmt(trapped * freight, 0)} freight) is trapped by the ${governName} restriction vs the least-restrictive zone (max ${fmt(maxCargoVal, 0)} MT). Managing bunkers/ballast at that crossing recovers part of it.`, impact: trapped * freight });
  }

  // Hold-level checks — real figures from the Hold Capacities table, not just the DWT summary.
  const overHolds = st.holds.map((h) => ({ h, lim: holdLimits(h) })).filter(({ h, lim }) => lim.maxLoadable > 0 && num(h.qty) > lim.maxLoadable);
  if (overHolds.length > 0) {
    const worst = overHolds.reduce((a, b) => (num(b.h.qty) - b.lim.maxLoadable > num(a.h.qty) - a.lim.maxLoadable ? b : a));
    const excess = num(worst.h.qty) - worst.lim.maxLoadable;
    const governs = worst.lim.maxByStrength > 0 && worst.lim.maxByStrength === worst.lim.maxLoadable ? 'tank-top strength' : worst.lim.maxByBale > 0 && worst.lim.maxByBale === worst.lim.maxLoadable ? 'bale capacity' : 'grain capacity';
    recs.push({
      tone: 'bad',
      icon: 'fa-weight-hanging',
      title: overHolds.length > 1 ? `${overHolds.length} holds over their loadable limit` : `${worst.h.name} over its loadable limit`,
      text: `${worst.h.name} is planned at ${fmt(num(worst.h.qty), 0)} MT vs a max loadable of ${fmt(worst.lim.maxLoadable, 0)} MT (${governs} governs) — ${fmt(excess, 0)} MT over.${overHolds.length > 1 ? ` ${overHolds.length - 1} other hold(s) also exceed their limit.` : ''} Redistribute to holds with spare capacity.`,
    });
  }

  // A grade with no stowage factor makes every Grain/Bale capacity figure for that hold unreliable.
  const gradesNoSf = Array.from(new Set(st.holds.map((h) => h.cargo.trim()).filter(Boolean))).filter((cargoName) => gradeSf(cargoName) <= 0);
  if (gradesNoSf.length > 0) {
    recs.push({ tone: 'bad', icon: 'fa-circle-question', title: 'Missing stowage factor', text: `No SF found for ${gradesNoSf.join(', ')} in Cargo Grades & Stowage Factor — Max by Grain/Bale can't be calculated for those holds until SF is entered.` });
  }

  // Hold-wise plan vs the DWT-derived governing cargo figure should reconcile.
  const holdsTotal = st.holds.reduce((s, h) => s + num(h.qty), 0);
  const holdsVsIntakeDiff = holdsTotal - minCargo;
  if (st.holds.length > 0 && minCargo > 0 && Math.abs(holdsVsIntakeDiff) > Math.max(50, minCargo * 0.01)) {
    recs.push({ tone: 'flat', icon: 'fa-clipboard-check', title: "Hold plan doesn't match max intake", text: `Holds total ${fmt(holdsTotal, 0)} MT vs ${fmt(minCargo, 0)} MT max intake at ${governName} — a ${fmt(Math.abs(holdsVsIntakeDiff), 0)} MT ${holdsVsIntakeDiff > 0 ? 'over-allocation' : 'shortfall'}. Re-check the hold-wise distribution.` });
  }

  // Ship/shore quantity dispute — surfaced here too since it directly affects the B/L figure.
  if (loi === 'YES') {
    recs.push({ tone: 'bad', icon: 'fa-file-signature', title: 'Ship/shore difference exceeds tolerance', text: `${fmt(Math.abs(pctDiff), 2)}% difference between ship draft survey and shore scale qty (tolerance ${fmt(loiTolerance, 2)}%) — issue a Letter of Protest before finalising cargo documents.` });
  }

  recs.sort((a, b) => Math.abs(b.impact ?? 0) - Math.abs(a.impact ?? 0));

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
        <div className="fv-ops__vd-cell"><span className="fv-ops__vd-cell-label">CP Quantity</span><span className="fv-ops__vd-cell-value">{recap.cpQuantity ? `${recap.cpQuantity} ${recap.cpQuantityOption === 'RANGE' ? `(${recap.cpQuantityMin || '—'}–${recap.cpQuantityMax || '—'}) MIN/MAX` : recap.cpQuantityOption === 'PERCENT' ? `± ${recap.cpQuantityTolerancePct || '0'}%` : recap.cpQuantityOption || 'OO'}` : '—'}</span></div>
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
                  <td>
                    <VdAutocomplete
                      value={g.grade}
                      onChange={(v) => setGradeName(i, v)}
                      options={cargoOptions}
                      placeholder="Search cargo database…"
                      inputClass="fv-ops__vd-in"
                    />
                  </td>
                  <td className="fv-ops__r">
                    <input
                      className={`fv-ops__eta-in${g.sfAuto && g.sf ? ' fv-ops__stw-derived-in' : ''}`}
                      inputMode="decimal"
                      value={g.sf}
                      title={g.sfAuto && g.sf ? 'From Cargo Master database — edit to override' : undefined}
                      onChange={(e) => setGrade(i, { sf: e.target.value, sfAuto: false })}
                    />
                  </td>
                  <td className="fv-ops__r">{nIn(g.qty, (v) => setGrade(i, { qty: v }))}</td>
                  <td className="fv-ops__r fv-ops__stw-calc">{fmt(num(g.qty) * num(g.sf), 0)}</td>
                  <td className="fv-ops__r"><button type="button" className="fv-ops__bnk-rm" aria-label="Remove grade" onClick={() => removeGrade(i)}><i className="fas fa-xmark" aria-hidden="true" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fv-ops__hint">Grade / Description is searched against the Cargo Master database (Settings → Cargo Master) — picking a match pulls its Stowage Factor automatically; edit SF manually to override. SF (m³/MT) is used to derive each hold's max weight from its volume.</p>
        </Card>

        <Card
          title="Ports & Draft Restrictions"
          icon="fa-anchor"
          right={(
            <span className="fv-ops__eta-addbtns">
              <button type="button" className="fv-ops__btn" onClick={syncPortsFromRotation} title="Rebuild the port list from the ETA & ROB port rotation">
                <i className="fas fa-rotate" aria-hidden="true" /> Sync from ETA &amp; ROB
              </button>
              <button type="button" className="fv-ops__btn" onClick={addPort}><i className="fas fa-plus" aria-hidden="true" /> Port</button>
            </span>
          )}
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
          <p className="fv-ops__hint">“Sync from ETA &amp; ROB” pulls the port list and Remarks (leg Type) from the ETA &amp; ROB port rotation — any Max Draft / Density already entered for a matching port name is kept. No database currently holds per-port max draft or water density (the World Port Index has only name/country/coordinates), so enter these manually from the port's sailing directions / agent advice.</p>
        </Card>
      </div>

      <Card
        title="DWT & Cargo Intake — by Zone / Port"
        icon="fa-scale-balanced"
        right={(
          <span className="fv-ops__eta-addbtns">
            <button type="button" className="fv-ops__btn" onClick={syncPointsFromRotation} title="Rebuild the zone/port columns from the ETA & ROB port rotation, auto-detecting any Load Line Zone crossing in between">
              <i className="fas fa-rotate" aria-hidden="true" /> Sync from ETA &amp; ROB
            </button>
            <button type="button" className="fv-ops__btn" onClick={deriveZoneDrafts} title="Winter = Summer − 1/48; Tropical = Summer + 1/48">W/T from Summer</button>
            <label className="fv-ops__stw-toggle" title="Auto-fill VLSFO/MGO from the ETA & ROB itinerary where the port name matches">
              <input type="checkbox" checked={st.autoBunker} onChange={(e) => setPlan({ autoBunker: e.target.checked })} /> Auto bunkers
            </label>
            <button type="button" className="fv-ops__btn" onClick={addPoint}><i className="fas fa-plus" aria-hidden="true" /> Zone / Port</button>
          </span>
        )}
      >
        <div className="fv-ops__vd-fields fv-ops__eta-controls fv-ops__stw-dwtfields">
          <VdField label="Displacement (MT)" value={st.refDisplacement} onChange={(v) => setPlan({ refDisplacement: v })} num />
          <VdField label="Lightship (MT)" value={st.lightship} onChange={(v) => setPlan({ lightship: v })} num />
          <VdField label="Constants (MT)" value={st.constants} onChange={(v) => setPlan({ constants: v })} num />
          <VdField label="Fresh Water (MT)" value={st.freshWater} onChange={(v) => setPlan({ freshWater: v })} num />
          <VdField label="Ballast Water (MT)" value={st.ballastWater} onChange={(v) => setPlan({ ballastWater: v })} num />
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
                      {i === governIdx && spareBunkerAtGov > 20 && trapped > 0 && (
                        <i
                          className="fas fa-lightbulb fv-ops__stw-gov-tip"
                          aria-hidden="true"
                          title={`Governing point — trim ~${fmt(spareBunkerAtGov, 0)} MT bunkers here (keeping ~${fmt(safeMinBunkerAtGov, 0)} MT to safely reach ${legFromGoverning?.to || 'the next port'}) to free up to ${fmt(Math.min(spareBunkerAtGov, trapped), 0)} MT more cargo (~$${fmt(Math.min(spareBunkerAtGov, trapped) * freight, 0)} extra revenue).`}
                        />
                      )}
                      {st.points.length > 1 && <button type="button" className="fv-ops__bnk-rm" aria-label="Remove point" onClick={() => removePoint(i)}><i className="fas fa-xmark" aria-hidden="true" /></button>}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr><th scope="row">Max Draft (m)</th>{rows.map((r, i) => <td key={i} className="fv-ops__r fv-ops__stw-calc" title={r.zone ? 'Vessel load-line zone draught' : undefined}>{r.maxDraft > 0 ? `${fmt(r.maxDraft, 2)}${r.zone ? ' ⚓' : ''}` : '—'}</td>)}</tr>
              <tr>
                <th scope="row">Displacement (Max)</th>
                {st.points.map((p, i) => {
                  const r = rows[i];
                  const auto = p.displacementAuto !== false && r.draftDerived;
                  return (
                    <td key={i} className="fv-ops__r">
                      <input
                        className={`fv-ops__eta-in${auto ? ' fv-ops__stw-derived-in' : ''}`}
                        inputMode="decimal"
                        value={auto ? String(Math.round(r.dispMax)) : p.displacement}
                        title={auto ? 'Derived from Max Draft × TPC — edit to override' : undefined}
                        onChange={(e) => setPoint(i, { displacement: e.target.value, displacementAuto: false })}
                      />
                    </td>
                  );
                })}
              </tr>
              <tr><th scope="row">Lightship</th>{rows.map((_, i) => <td key={i} className="fv-ops__r fv-ops__stw-calc">{fmt(lightship, 0)}</td>)}</tr>
              <tr><th scope="row">Water Density</th>{st.points.map((p, i) => <td key={i} className="fv-ops__r">{rows[i].densityFromPort ? <span className="fv-ops__stw-derived" title="From Ports & Draft Restrictions">{rows[i].density.toFixed(3)}</span> : nIn(p.density, (v) => setPoint(i, { density: v }))}</td>)}</tr>
              <tr><th scope="row">Displacement @ Density</th>{rows.map((r, i) => <td key={i} className="fv-ops__r fv-ops__stw-calc">{fmt(r.dispPort, 0)}</td>)}</tr>
              <tr className="fv-ops__stw-sub"><th scope="row">Net DWT</th>{rows.map((r, i) => <td key={i} className="fv-ops__r">{fmt(r.dwt, 0)}</td>)}</tr>
              <tr><th scope="row">(−) VLSFO</th>{st.points.map((p, i) => <td key={i} className="fv-ops__r">{rows[i].autoMatched ? <span className="fv-ops__stw-derived" title="From ETA & ROB">{fmt(rows[i].vlsfo, 0)}</span> : nIn(p.vlsfo, (v) => setPoint(i, { vlsfo: v }))}</td>)}</tr>
              <tr><th scope="row">(−) MGO</th>{st.points.map((p, i) => <td key={i} className="fv-ops__r">{rows[i].autoMatched ? <span className="fv-ops__stw-derived" title="From ETA & ROB">{fmt(rows[i].mgo, 0)}</span> : nIn(p.mgo, (v) => setPoint(i, { mgo: v }))}</td>)}</tr>
              <tr><th scope="row">(−) Ballast Water</th>{rows.map((r, i) => <td key={i} className="fv-ops__r fv-ops__stw-calc">{fmt(r.bw, 0)}</td>)}</tr>
              <tr><th scope="row">(−) Fresh Water</th>{rows.map((r, i) => <td key={i} className="fv-ops__r fv-ops__stw-calc">{fmt(r.fw, 0)}</td>)}</tr>
              <tr><th scope="row">(−) Constants</th>{rows.map((r, i) => <td key={i} className="fv-ops__r fv-ops__stw-calc">{fmt(r.constants, 0)}</td>)}</tr>
              <tr className="fv-ops__stw-cargo">
                <th scope="row">Cargo Qty (MT)</th>
                {rows.map((r, i) => <td key={i} className={`fv-ops__r${i === governIdx ? ' fv-ops__stw-gov' : ''}`}>{fmt(r.cargo, 0)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="fv-ops__hint">
          <i className="fas fa-circle-info" aria-hidden="true" /> <b>Sync from ETA &amp; ROB</b> rebuilds the zone/port columns from the port rotation and auto-inserts an <b>Entry [Zone]</b> column wherever the route between two ports is estimated to cross into a different Load Line Zone (best-effort — approximates the IMO Load Line Zone chart using each port's position and the ETA &amp; ROB transit dates; always confirm against the current chart / vessel's load line certificate). A column named <b>Summer / Winter / Tropical</b> zone is capped at the vessel's corresponding load-line draught (⚓); otherwise the Max Draft comes from the matching Ports row. <b>Max Displacement is derived from that Max Draft</b> (Δ = TPC × 100 per metre vs the <b>Displacement (MT)</b> field above and TPC/reference draft from the density-correction card — edit a column's Displacement directly to override it) and <b>Density</b> from the Ports table. Cargo Qty = (Displacement × Density/1.025) − Lightship − VLSFO − MGO − Ballast − Fresh Water − Constants. <b>Ballast Water</b>, <b>Fresh Water</b> and <b>Constants</b> are entered once above and applied to every zone/port column. The lowest intake sets the max loadable cargo. “Auto bunkers” pulls VLSFO/MGO from the ETA &amp; ROB projection.
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
          <VdField label="LOI Tolerance (%)" value={dc.loiTolerancePct} onChange={(v) => setDraft({ loiTolerancePct: v })} num />
          {calcField('Diff in Qty (MT)', `${diffQty >= 0 ? '+' : '−'}${fmt(Math.abs(diffQty), 2)}`)}
          {calcField('% Age Diff', `${diffQty >= 0 ? '+' : '−'}${fmt(Math.abs(pctDiff), 2)}%`)}
          <div className="fv-ops__vd-field"><span>LOI to be done</span><b className={`fv-ops__stw-loi fv-ops__stw-loi--${loi === 'YES' ? 'yes' : 'no'}`}>{loi}</b></div>
        </div>
        <p className="fv-ops__hint">LOI flagged when the ship/shore difference exceeds the tolerance above (default 0.50%). Diff = Shore Scale − Ship Draft Survey.</p>
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
      <Card
        title="Hold Capacities & Strength Limits"
        icon="fa-cubes-stacked"
        right={<button type="button" className="fv-ops__btn" onClick={addHold}><i className="fas fa-plus" aria-hidden="true" /> Hold</button>}
      >
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
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {st.holds.map((h, i) => {
                const lim = holdLimits(h);
                const qty = num(h.qty);
                const over = lim.maxLoadable > 0 && qty > lim.maxLoadable;
                const strengthGoverns = lim.maxByStrength > 0 && lim.maxByStrength === lim.maxLoadable;
                return (
                  <tr key={i}>
                    <th scope="row"><input className="fv-ops__vd-in" value={h.name} onChange={(e) => setHold(i, { name: e.target.value })} /></th>
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
                    <td className="fv-ops__r"><button type="button" className="fv-ops__bnk-rm" aria-label="Remove hold" onClick={() => removeHold(i)}><i className="fas fa-xmark" aria-hidden="true" /></button></td>
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
          {recs.length === 0 && <p className="fv-ops__vd-empty">No issues or opportunities detected from the current intake, hold plan and ETA &amp; ROB bunkers.</p>}
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
        <p className="fv-ops__hint">Recalculated live from the current intake, hold plan, ETA &amp; ROB bunkers and ship/shore figures — sorted by $ impact. Validate against actual bunker prices &amp; charter terms before acting.</p>
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
interface HirePayEntry { status: string; ballast: boolean; name?: string; from?: string; to?: string; amount?: number; due?: string; offHire?: OffHireRow[]; bunkerPay?: boolean; bunkerRev?: boolean; jointOn?: string; jointOff?: string; hra?: string; ownersExp?: string; ownersClaim?: string; ownersClaimIds?: string[]; ilohcOn?: boolean; borV?: string; borM?: string; borFo?: string; borDo?: string; bunkerPayOff?: boolean; ballastPayOff?: boolean; extraExpenses?: ExtraExpense[]; deleted?: boolean; toManual?: boolean }

/** A standalone, independently-editable snapshot of a hire installment — opened in its own SOA
 *  popup (same editing experience as a real hire) to experiment with "what if" scenarios without
 *  ever touching the live schedule. Carries its OWN copy of every clause/rate field a real
 *  installment would otherwise share via `recap` — self-contained, no carry-forward to/from
 *  anything else (always treated as its own first-and-last installment). */
interface HireDuplicate {
  id: string; name: string; account: string; from: string; to: string; onHire: number; offHire: number; amount: number; due: string; status: string;
  ballast: boolean; bunkers: number; bunkerCredit: number;
  hirePerDay: string; adcom: string; brokerage: string; foPrice: string; doPrice: string; cve: string; ilohc: string; ballastBonus: string;
  delV: string; delM: string; borV: string; borM: string; borFo: string; borDo: string;
  offHireEvents: OffHireRow[]; extraExpenses: ExtraExpense[]; jointOn: string; jointOff: string; ilohcOn: boolean;
}

/** Persisted snapshot of one live hire-schedule row (serializable, saved alongside the recap). */
interface HireScheduleRow { key: string; name: string; account: string; from: string; to: string; onHire: number; offHire: number; amount: number; due: string; status: string; ballast: boolean; bunkers: number; bunkerCredit: number; deleted: boolean }

/** Hire installment workflow states. */
const HIRE_FLOW = ['Draft', 'Sent For Approval', 'Approved', 'Sent For Payment', 'Paid & Locked'] as const;
type HireStatus = (typeof HIRE_FLOW)[number];
function normalizeHireStatus(value: unknown): HireStatus {
  if (value === 'Approved & Sent for Payment') return 'Approved';
  return HIRE_FLOW.includes(value as HireStatus) ? value as HireStatus : 'Draft';
}
const hireLocked = (s: HireStatus) => s === 'Sent For Payment' || s === 'Paid & Locked';
const hireStatusPill = (s: HireStatus) => (s === 'Draft' ? 'blue' : s === 'Paid & Locked' ? 'green' : 'amber');
const OFFHIRE_CATS = ['A. Working (Port)', 'B. Idle (Sea/Port)', 'C. Sea Off-Hire (Ballast)', 'C. Sea Off-Hire (Laden)', 'D. Weather / WRI Time Loss'];

/** Off-hire duration in days for a row: (To − From) × %. */
function offHireDays(o: OffHireRow): number {
  const f = parseDMY(o.from);
  const t = parseDMY(o.to);
  if (!f || !t) return 0;
  const days = (t.getTime() - f.getTime()) / 86_400_000;
  const pct = o.pct === '' ? 100 : num(o.pct);
  return Math.max(0, days) * (pct / 100);
}

/** Per-category daily consumption rate (VLSFO main engine, MGO/DO aux) used to project off-hire
 *  bunker consumption — shared by the Hire SOA popup's off-hire table and the schedule's own
 *  off-hire value deduction. */
function offHireCatRate(perf: EtaPerf, cat: string): { v: number; m: number } {
  const mnCons = perf.mainNormal;
  const snCons = perf.subNormal;
  if (cat.startsWith('A')) return { v: num(mnCons.work), m: num(snCons.work) };
  if (cat.startsWith('B')) return { v: num(mnCons.idle), m: num(snCons.idle) };
  const ballast = /ballast/i.test(cat);
  return { v: num(ballast ? mnCons.ballast : mnCons.laden), m: num(snCons.sea) };
}

/** Projected bunker ROB/consumption for one off-hire event; a manual End ROB entry is used as-is. */
function offHireBunker(perf: EtaPerf, o: OffHireRow): { startV: number; startM: number; endV: number; endM: number; consV: number; consM: number } {
  const r = offHireCatRate(perf, o.cat);
  const d = offHireDays(o);
  const startV = num(o.robStartV ?? '0'); const startM = num(o.robStartM ?? '0');
  const manualV = (o.robEndV ?? '').trim() !== ''; const manualM = (o.robEndM ?? '').trim() !== '';
  const endV = manualV ? num(o.robEndV ?? '0') : startV - r.v * d;
  const endM = manualM ? num(o.robEndM ?? '0') : startM - r.m * d;
  const consV = manualV ? startV - endV : r.v * d;
  const consM = manualM ? startM - endM : r.m * d;
  return { startV, startM, endV, endM, consV, consM };
}

/** Off-hire $ value for one installment's own off-hire events: hire-rate deduction (net of
 *  commission) for the CUMULATIVE off-hire days through this hire, plus CVE for those same days,
 *  plus bunker-consumption cost for just this hire's own events — mirrors the Hire SOA popup's
 *  "Less: Off-Hire" balance deduction. The Cable/Victualing line charges CVE for the FULL (gross)
 *  on-hire period, so the off-hire days' share must be deducted here, or CVE would be overpaid
 *  for time the vessel was off-hire. */
function offHireValueFor(perf: EtaPerf, offHireList: OffHireRow[], cumulativeOffHireDays: number, hirePerDay: number, dedPct: number, cvePerMonth: number, foPrice: number, doPrice: number): number {
  const bunkerCost = offHireList.reduce((s, o) => {
    const b = offHireBunker(perf, o);
    return s + b.consV * foPrice + b.consM * doPrice;
  }, 0);
  return cumulativeOffHireDays * hirePerDay * (1 - dedPct / 100) + (cvePerMonth / 30) * cumulativeOffHireDays + bunkerCost;
}

/** Recompute a `HireDuplicate`'s displayed on/off-hire days, bunkers and amount payable from its
 *  own independent fields — mirrors the real cumulative-then-deduct formula exactly, but
 *  self-contained (it's always its own first-and-last installment: BOD/BOR/ILOHC/Joint Survey
 *  apply in full here, nothing carries forward from or to any other hire, real or duplicate). */
function recomputeDuplicate(d: HireDuplicate, perf: EtaPerf): HireDuplicate {
  const from = parseDMY(d.from);
  const to = parseDMY(d.to);
  const onHire = from && to ? Math.max(0, (to.getTime() - from.getTime()) / 86_400_000) : 0;
  const offHire = d.offHireEvents.reduce((s, o) => s + offHireDays(o), 0);
  const hd = num(d.hirePerDay);
  const dedPct = num(d.adcom) + num(d.brokerage);
  const foP = num(d.foPrice);
  const doP = num(d.doPrice);
  const gross = hd * onHire;
  const bb = d.ballast ? num(d.ballastBonus) : 0;
  const cve = (num(d.cve) / 30) * onHire;
  const bodValue = num(d.delV) * foP + num(d.delM) * doP;
  const borV = d.borV.trim() !== '' ? num(d.borV) : 0;
  const borM = d.borM.trim() !== '' ? num(d.borM) : 0;
  const borFo = d.borFo.trim() !== '' ? num(d.borFo) : foP;
  const borDo = d.borDo.trim() !== '' ? num(d.borDo) : doP;
  const borValue = borV * borFo + borM * borDo;
  const offHireValue = offHireValueFor(perf, d.offHireEvents, offHire, hd, dedPct, num(d.cve), foP, doP);
  const ilohcValue = d.ilohcOn ? num(d.ilohc) : 0;
  const extrasOwners = d.extraExpenses.reduce((s, e) => s + (e.due === 'Owners' ? num(e.amount) : 0), 0);
  const extrasCharterers = d.extraExpenses.reduce((s, e) => s + (e.due !== 'Owners' ? num(e.amount) : 0), 0);
  const amount = gross * (1 - dedPct / 100) + cve - offHireValue + bodValue + bb - borValue
    + extrasOwners - extrasCharterers - ilohcValue - num(d.jointOn) / 2 - num(d.jointOff) / 2;
  return { ...d, onHire, offHire, amount, bunkers: bodValue, bunkerCredit: borValue };
}

/** Cumulative Other-Expense totals (additive) and Joint Survey totals (override-cascade) across
 *  installments 1..(uptoIndex+1). Other Expenses ADD into the running total from whichever hire
 *  they're entered on (never overridden, never retroactive to earlier hires). Joint Survey is
 *  instead a single running figure: whichever hire last explicitly set its own amount becomes the
 *  new total from that hire onward; hires that never touched it simply inherit the nearest earlier
 *  hire's value unchanged — editing it on hire N never changes what hires before N already
 *  calculated. ILOHC is a single global value (recap.ilohc) gated by a per-hire checkbox, so it
 *  carries forward like BOD/BB instead — see ilohcPayIdx in the caller. */
function cumulativeExtrasFor(stateOf: (key: string) => HirePayEntry, uptoIndex: number): { jointOn: number; jointOff: number; extrasOwners: number; extrasCharterers: number; extrasList: ExtraExpense[] } {
  let jointOn = 0, jointOff = 0, extrasOwners = 0, extrasCharterers = 0;
  const extrasList: ExtraExpense[] = [];
  for (let k = 0; k <= uptoIndex; k++) {
    const e = stateOf(String(k + 1));
    if (e.jointOn !== undefined) jointOn = num(e.jointOn);
    if (e.jointOff !== undefined) jointOff = num(e.jointOff);
    (e.extraExpenses ?? []).forEach((ex) => {
      extrasList.push(ex);
      if (ex.due === 'Owners') extrasOwners += num(ex.amount); else extrasCharterers += num(ex.amount);
    });
  }
  return { jointOn, jointOff, extrasOwners, extrasCharterers, extrasList };
}

export function HireTab({ recap, setRecap, pnl, voyage, module = 'Operations' }: { recap: Recap; setRecap: Dispatch<SetStateAction<Recap>>; pnl: Pnl; voyage: Voyage; module?: 'Operations' | 'Postfix' }) {
  const { isInRole } = useFleetView();
  const canApproveHire = isInRole('Manager, Operations Manager, Administrator');
  const fixtureNo = useFixtureNumbers()[voyage.id] ?? voyage.id;
  const hd = num(recap.hirePerDay);
  const dedPct = num(recap.adcom) + num(recap.brokerage);
  const cur = recap.hireCurrency || 'USD';
  const owners = recap.owners || '—';
  const voyageType = (recap.voyageFixType || '').toUpperCase();
  const [inType = '', outType = ''] = voyageType.split('-');
  const showDualHire = (inType === 'TCIN' || inType === 'TCTIN') && (outType === 'TCOUT' || outType === 'TCTOUT');
  const ballastBonusAmt = num(recap.ballastBonus);
  const stored = recap.freightLaytime;
  const valid = !!stored && Array.isArray(stored.invoices) && Array.isArray(stored.laytimes);
  const fl = valid ? (stored as FreightLaytimeData) : seedFreightLaytime(recap);
  const seededSettlement = useMemo(() => seedFreightSettlement(voyage, recap), [voyage.id, voyage.portFrom, voyage.portTo, recap.loadPort, recap.dischargePort]);
  const settlement = fl.settlement ?? seededSettlement;
  const setFL = (patch: Partial<FreightLaytimeData>) =>
    setRecap((r) => {
      const cur = (r.freightLaytime && Array.isArray(r.freightLaytime.invoices) && Array.isArray(r.freightLaytime.laytimes))
        ? r.freightLaytime : seedFreightLaytime(r);
      return { ...r, freightLaytime: { ...cur, ...patch } };
    });
  const setSettlement = (patch: Partial<FreightSettlementData>) => setFL({ settlement: { ...settlement, ...patch } });

  useEffect(() => {
    if (!valid || !fl.settlement) {
      setRecap((r) => {
        const cur = (r.freightLaytime && Array.isArray(r.freightLaytime.invoices) && Array.isArray(r.freightLaytime.laytimes))
          ? r.freightLaytime : seedFreightLaytime(r);
        return { ...r, freightLaytime: { ...cur, settlement: cur.settlement ?? seededSettlement } };
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, fl.settlement, seededSettlement]);

  const stateOf = (key: string): HirePayEntry => {
    const s = recap.hirePayState[key];
    return { status: normalizeHireStatus(s?.status), ballast: s?.ballast ?? false, name: s?.name, from: s?.from, to: s?.to, amount: s?.amount, due: s?.due, offHire: s?.offHire ?? [], bunkerPay: s?.bunkerPay ?? false, bunkerRev: s?.bunkerRev ?? false, jointOn: s?.jointOn, jointOff: s?.jointOff, hra: s?.hra, ownersExp: s?.ownersExp, ownersClaim: s?.ownersClaim, ownersClaimIds: s?.ownersClaimIds ?? [], ilohcOn: s?.ilohcOn, borV: s?.borV, borM: s?.borM, borFo: s?.borFo, borDo: s?.borDo, bunkerPayOff: s?.bunkerPayOff ?? false, ballastPayOff: s?.ballastPayOff ?? false, extraExpenses: s?.extraExpenses ?? [], deleted: s?.deleted ?? false, toManual: s?.toManual ?? false };
  };
  const setState = (key: string, patch: Partial<HirePayEntry>) =>
    setRecap((r) => ({ ...r, hirePayState: { ...r.hirePayState, [key]: { ...stateOfRaw(r, key), ...patch } } }));
  const stateOfRaw = (r: Recap, key: string): HirePayEntry => ({ status: normalizeHireStatus(r.hirePayState[key]?.status), ballast: r.hirePayState[key]?.ballast ?? false, name: r.hirePayState[key]?.name, from: r.hirePayState[key]?.from, to: r.hirePayState[key]?.to, amount: r.hirePayState[key]?.amount, due: r.hirePayState[key]?.due, offHire: r.hirePayState[key]?.offHire ?? [], bunkerPay: r.hirePayState[key]?.bunkerPay ?? false, bunkerRev: r.hirePayState[key]?.bunkerRev ?? false, jointOn: r.hirePayState[key]?.jointOn, jointOff: r.hirePayState[key]?.jointOff, hra: r.hirePayState[key]?.hra, ownersExp: r.hirePayState[key]?.ownersExp, ownersClaim: r.hirePayState[key]?.ownersClaim, ownersClaimIds: r.hirePayState[key]?.ownersClaimIds ?? [], ilohcOn: r.hirePayState[key]?.ilohcOn, borV: r.hirePayState[key]?.borV, borM: r.hirePayState[key]?.borM, borFo: r.hirePayState[key]?.borFo, borDo: r.hirePayState[key]?.borDo, bunkerPayOff: r.hirePayState[key]?.bunkerPayOff ?? false, ballastPayOff: r.hirePayState[key]?.ballastPayOff ?? false, extraExpenses: r.hirePayState[key]?.extraExpenses ?? [], deleted: r.hirePayState[key]?.deleted ?? false, toManual: r.hirePayState[key]?.toManual ?? false });
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

  const charterStateOf = (key: string): HirePayEntry => {
    const s = recap.charterHirePayState[key];
    return { status: normalizeHireStatus(s?.status), ballast: s?.ballast ?? false, name: s?.name, from: s?.from, to: s?.to, amount: s?.amount, due: s?.due, offHire: s?.offHire ?? [], bunkerPay: s?.bunkerPay ?? false, bunkerRev: s?.bunkerRev ?? false, jointOn: s?.jointOn, jointOff: s?.jointOff, hra: s?.hra, ownersExp: s?.ownersExp, ownersClaim: s?.ownersClaim, ownersClaimIds: s?.ownersClaimIds ?? [], ilohcOn: s?.ilohcOn, borV: s?.borV, borM: s?.borM, borFo: s?.borFo, borDo: s?.borDo, bunkerPayOff: s?.bunkerPayOff ?? false, ballastPayOff: s?.ballastPayOff ?? false, extraExpenses: s?.extraExpenses ?? [], deleted: s?.deleted ?? false, toManual: s?.toManual ?? false };
  };
  const charterStateOfRaw = (r: Recap, key: string): HirePayEntry => ({ status: normalizeHireStatus(r.charterHirePayState[key]?.status), ballast: r.charterHirePayState[key]?.ballast ?? false, name: r.charterHirePayState[key]?.name, from: r.charterHirePayState[key]?.from, to: r.charterHirePayState[key]?.to, amount: r.charterHirePayState[key]?.amount, due: r.charterHirePayState[key]?.due, offHire: r.charterHirePayState[key]?.offHire ?? [], bunkerPay: r.charterHirePayState[key]?.bunkerPay ?? false, bunkerRev: r.charterHirePayState[key]?.bunkerRev ?? false, jointOn: r.charterHirePayState[key]?.jointOn, jointOff: r.charterHirePayState[key]?.jointOff, hra: r.charterHirePayState[key]?.hra, ownersExp: r.charterHirePayState[key]?.ownersExp, ownersClaim: r.charterHirePayState[key]?.ownersClaim, ownersClaimIds: r.charterHirePayState[key]?.ownersClaimIds ?? [], ilohcOn: r.charterHirePayState[key]?.ilohcOn, borV: r.charterHirePayState[key]?.borV, borM: r.charterHirePayState[key]?.borM, borFo: r.charterHirePayState[key]?.borFo, borDo: r.charterHirePayState[key]?.borDo, bunkerPayOff: r.charterHirePayState[key]?.bunkerPayOff ?? false, ballastPayOff: r.charterHirePayState[key]?.ballastPayOff ?? false, extraExpenses: r.charterHirePayState[key]?.extraExpenses ?? [], deleted: r.charterHirePayState[key]?.deleted ?? false, toManual: r.charterHirePayState[key]?.toManual ?? false });
  const setCharterState = (key: string, patch: Partial<HirePayEntry>) =>
    setRecap((r) => ({ ...r, charterHirePayState: { ...r.charterHirePayState, [key]: { ...charterStateOfRaw(r, key), ...patch } } }));
  const setCharterBunkerAnchor = (key: string, field: 'bunkerPay' | 'bunkerRev', on: boolean) =>
    setRecap((r) => {
      const next: Record<string, HirePayEntry> = {};
      for (const [k, v] of Object.entries(r.charterHirePayState)) next[k] = { ...v, [field]: false };
      next[key] = { ...(next[key] ?? charterStateOfRaw(r, key)), [field]: on };
      return { ...r, charterHirePayState: next };
    });
  const setCharterBunkerPay = (key: string, on: boolean) =>
    setRecap((r) => {
      const next: Record<string, HirePayEntry> = {};
      for (const [k, v] of Object.entries(r.charterHirePayState)) next[k] = { ...v, bunkerPay: false };
      next['1'] = { ...(next['1'] ?? charterStateOfRaw(r, '1')), bunkerPayOff: !on };
      if (on) next[key] = { ...(next[key] ?? charterStateOfRaw(r, key)), bunkerPay: true, bunkerPayOff: false };
      return { ...r, charterHirePayState: next };
    });
  const setCharterBallastPay = (key: string, on: boolean) =>
    setRecap((r) => {
      const next: Record<string, HirePayEntry> = {};
      for (const [k, v] of Object.entries(r.charterHirePayState)) next[k] = { ...v, ballast: false };
      next['1'] = { ...(next['1'] ?? charterStateOfRaw(r, '1')), ballastPayOff: !on };
      if (on) next[key] = { ...(next[key] ?? charterStateOfRaw(r, key)), ballast: true, ballastPayOff: false };
      return { ...r, charterHirePayState: next };
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
  // Banking basis skips weekends; Running/Calendar basis uses plain calendar days.
  const useBankingBasis = /banking/i.test(recap.firstHireBasis || 'Banking Days');
  const total = pnl.days;
  const start = parseDMY(recap.deliveryDateTime);
  const [manualExtra, setManualExtra] = useState(0);
  // Prefer the live ETA/Rotation projection's final arrival (reflects the actual planned voyage)
  // over the manually-typed CP redelivery field, which is easy to leave stale/unset; fall back to
  // the manual field when the rotation plan has no legs or its arrival predates the voyage start.
  const etaLegsForRedelivery = projectEtaLegs(recap.etaPlan);
  const etaComputedRedelivery = etaLegsForRedelivery.length ? etaLegsForRedelivery[etaLegsForRedelivery.length - 1].arr : null;
  const manualRedelivery = parseDMY(recap.redeliveryDateTime);
  const expectedRedelivery = (etaComputedRedelivery && start && etaComputedRedelivery.getTime() > start.getTime())
    ? etaComputedRedelivery
    : manualRedelivery;

  interface HireRow { key: string; name: string; account: string; from: Date | null; to: Date | null; onHire: number; offHire: number; amount: number; due: Date | null; status: HireStatus; ballast: boolean; bunkers: number; bunkerCredit: number; cumulativeOnHire?: number; cumulativeOffHire?: number; cumulativeGross?: number; offHireValue?: number; cumulativeAmountDue?: number; cumulativeIlohc?: number; cumulativeJointOn?: number; cumulativeJointOff?: number; cumulativeExtrasOwners?: number; cumulativeExtrasCharterers?: number; cumulativeExtrasList?: ExtraExpense[]; cumulativeOffHireEvents?: OffHireRow[] }
  let rows: HireRow[] = [];
  let covered = 0;
  let n = 1;
  while (covered < total - 0.01 && n <= 200) {
    const key = String(n);
    const e = stateOf(key);
    const status = e.status as HireStatus;
    const periodLen = n === 1 ? firstPeriod : subPeriod;
    const normalDays = Math.min(periodLen, total - covered);
    // From/To: use clause-computed dates for unlocked interim hires; allow override only for
    // locked (paid/approved) hires — the cumulative final hire's date override is applied post-loop.
    const locked = hireLocked(status);
    const from = (locked && e.from) ? parseDMY(e.from) : (start ? addDays(start, covered) : null);
    // A hire the user has manually edited the "Hire To Date" on and saved (via the SOA popup)
    // keeps that date even while still Draft — unlike other saved fields, this one is explicitly
    // flagged (`toManual`) so leftover/stale `e.to` values from elsewhere can't masquerade as one.
    const manualTo = (!locked && e.toManual && e.to) ? parseDMY(e.to) : null;
    // The LAST hire of the schedule (the one that reaches the voyage's actual redelivery) settles
    // to the exact expected-redelivery timestamp instead of the plain clause cutoff — independent
    // of which hire carries the BOR bunker credit (see bunkerSettleIdx below, which may land on an
    // earlier hire to avoid dumping the whole credit onto a single, deeply negative final invoice).
    const isLastRow = manualExtra === 0 && !manualTo && (covered + normalDays) >= total - 0.01;
    // Guard against a stale/unset redelivery date that falls before this hire even starts — that
    // would collapse On-Hire to 0 and break the whole calculation, so fall back to the clause cutoff.
    const redeliveryValid = isLastRow && expectedRedelivery && from && expectedRedelivery.getTime() > from.getTime();
    const to = (locked && e.to) ? parseDMY(e.to)
      : manualTo ? manualTo
      : redeliveryValid ? expectedRedelivery
      : (start ? addDays(start, covered + normalDays) : null);
    // Actual elapsed days for this installment — reflects a manual "To" edit (which may run
    // longer or shorter than the normal clause period); later installments shift to follow it.
    const days = from && to ? Math.max(0, (to.getTime() - from.getTime()) / 86_400_000) : normalDays;
    const onHire = from && to ? Math.max(0, (to.getTime() - from.getTime()) / 86_400_000) : days;
    const offHire = (e.offHire ?? []).reduce((s, o) => s + offHireDays(o), 0);
    // Due date: every installment is payable within `dueBank` days of its OWN period start, using
    // the clause's basis — Banking Days counts business days only and nudges a weekend result back
    // to Friday; Running/Calendar Days count every day with no weekend adjustment.
    const duePre = from ? (useBankingBasis ? addBankingDays(from, dueBank) : addDays(from, dueBank)) : null;
    const due = useBankingBasis ? moveOffWeekend(duePre) : duePre;
    // CUMULATIVE CALCULATION: Gross hire from Delivery date to this hire's end date
    // Cumulative on-hire days from delivery to this hire's end
    const cumulativeOnHire = to && start ? Math.max(0, (to.getTime() - start.getTime()) / 86_400_000) : 0;
    // Cumulative off-hire from ALL hires from delivery to this hire's end (including current hire)
    let cumulativeOffHire = 0;
    const cumulativeOffHireEvents: OffHireRow[] = [];
    for (let k = 0; k < n; k++) {
      const rKey = String(k + 1);
      const rEntry = stateOf(rKey);
      const offHireList = rEntry.offHire ?? [];
      cumulativeOffHire += offHireList.reduce((s, o) => s + offHireDays(o), 0);
      cumulativeOffHireEvents.push(...offHireList);
    }
    const cumulativeGross = hd * cumulativeOnHire;
    const cumulativeNett = Math.max(0, cumulativeOnHire - cumulativeOffHire);
    const cumulativeCve = (num(recap.cve) / 30) * cumulativeNett;
    // Amount is cumulative hire (net of commissions) + CVE, minus prior payments (applied later)
    const amount = cumulativeGross * (1 - dedPct / 100) + cumulativeCve;
    const offHireValue = offHireValueFor(recap.etaPlan.perf, cumulativeOffHireEvents, cumulativeOffHire, hd, dedPct, num(recap.cve), num(recap.foPrice), num(recap.doPrice));
    rows.push({ key, name: `${ordinal(n)} Hire`, account: owners, from, to, onHire, offHire, amount, due, status, ballast: false, bunkers: 0, bunkerCredit: 0, cumulativeOnHire, cumulativeOffHire, cumulativeGross, offHireValue, cumulativeOffHireEvents });
    covered += days;
    n += 1;
  }
  // Manually added installments (for when the actual voyage runs beyond the estimate) — each
  // continues from the previous cut-off, editable per installment. Not consolidated on settlement.
  let manualFrom: Date | null = rows.length ? rows[rows.length - 1].to : start;
  for (let m = 0; m < manualExtra && n <= 200; m++) {
    const key = String(n);
    const e = stateOf(key);
    const status = e.status as HireStatus;
    const from = e.from ? parseDMY(e.from) : manualFrom;
    // The last manual installment settles to the expected redelivery date instead of the plain
    // clause cutoff (which row carries the BOR bunker credit is decided separately, below).
    const isLastManRow = m === manualExtra - 1;
    const redeliveryValidMan = isLastManRow && expectedRedelivery && from && expectedRedelivery.getTime() > from.getTime();
    const to = e.to ? parseDMY(e.to) : redeliveryValidMan ? expectedRedelivery : (from ? addDays(from, subPeriod) : null);
    const onHire = from && to ? Math.max(0, (to.getTime() - from.getTime()) / 86_400_000) : subPeriod;
    const offHire = (e.offHire ?? []).reduce((s, o) => s + offHireDays(o), 0);
    // CUMULATIVE: Manual hires also calculate from delivery to their end date
    const cumulativeOnHire = to && start ? Math.max(0, (to.getTime() - start.getTime()) / 86_400_000) : 0;
    let cumulativeOffHire = 0;
    const cumulativeOffHireEvents: OffHireRow[] = [];
    for (let k = 1; k <= rows.length + m + 1; k++) {
      const rKey = String(k);
      const rEntry = stateOf(rKey);
      const offHireList = rEntry.offHire ?? [];
      cumulativeOffHire += offHireList.reduce((s, o) => s + offHireDays(o), 0);
      cumulativeOffHireEvents.push(...offHireList);
    }
    const cumulativeGross = hd * cumulativeOnHire;
    const cumulativeNett = Math.max(0, cumulativeOnHire - cumulativeOffHire);
    const cumulativeCve = (num(recap.cve) / 30) * cumulativeNett;
    const amount = cumulativeGross * (1 - dedPct / 100) + cumulativeCve;
    const offHireValue = offHireValueFor(recap.etaPlan.perf, cumulativeOffHireEvents, cumulativeOffHire, hd, dedPct, num(recap.cve), num(recap.foPrice), num(recap.doPrice));
    const duePreMan = from ? (useBankingBasis ? addBankingDays(from, dueBank) : addDays(from, dueBank)) : null;
    const dueMan = useBankingBasis ? moveOffWeekend(duePreMan) : duePreMan;
    rows.push({ key, name: `${ordinal(n)} Hire`, account: owners, from, to, onHire, offHire, amount, due: dueMan, status, ballast: false, bunkers: 0, bunkerCredit: 0, cumulativeOnHire, cumulativeOffHire, cumulativeGross, offHireValue, cumulativeOffHireEvents });
    manualFrom = to;
    n += 1;
  }

  // Drop installments the user has soft-deleted via the row checkboxes.
  rows = rows.filter((r) => stateOf(r.key).deleted !== true);

  // Ballast bonus: only when CP terms include it (Ballast Bonus / Both). Single installment
  // (default 1st), user-selectable or off. Not shown/applied when terms are Bunkers or None.
  const ballastOff = stateOf('1').ballastPayOff === true;
  let ballastPayIdx = rows.findIndex((r) => stateOf(r.key).ballast);
  if (ballastPayIdx < 0 && !ballastOff && firstInclBallast) ballastPayIdx = 0;
  if (ballastOff || !firstInclBallast) ballastPayIdx = -1;
  rows.forEach((r, i) => { r.ballast = i === ballastPayIdx; });
  // ILOHC is a single global value (recap.ilohc) gated by a per-hire checkbox — carried forward
  // from the first hire it was switched on, same as BOD/BB. Computed here (ahead of the bunker
  // block) since the BOR auto-placement simulation below needs it.
  const ilohcPayIdx = rows.findIndex((r) => stateOf(r.key).ilohcOn === true);

  // Bunkers (only when the Hire Payment clause includes them): BOD is charged to owners on the
  // BOD hire (default 1st, movable). The estimated BOR is reversed to charterers on whichever
  // hire settles to redelivery (auto-picked below, or movable by ticking a specific hire's BOR
  // box) — that hire absorbs every remaining day up to redelivery, so no installments follow it.
  const bodValue = num(recap.etaPlan.startRobVlsfo) * num(recap.foPrice) + num(recap.etaPlan.startRobMgo) * num(recap.doPrice);
  const borEstValue = borRob.v * num(recap.foPrice) + borRob.m * num(recap.doPrice);
  let bunkerPayIdx = -1;
  let bunkerSettleIdx = -1;
  const bunkerRefund = 0; // BOR is fully absorbed in the cumulative method
  if (firstInclBunkers && rows.length) {
    bunkerPayIdx = rows.findIndex((r) => stateOf(r.key).bunkerPay);
    if (bunkerPayIdx < 0) bunkerPayIdx = 0;
    // The full on-hire span if a hire absorbed every day from delivery to actual redelivery —
    // the same for any candidate row, since it's just the voyage's total on-hire span.
    const grandOnHire = (expectedRedelivery && start) ? Math.max(0, (expectedRedelivery.getTime() - start.getTime()) / 86_400_000) : total;
    const grandGross = hd * grandOnHire;
    bunkerSettleIdx = rows.findIndex((r) => stateOf(r.key).bunkerRev);
    if (bunkerSettleIdx < 0) {
      // Walk the hires in order (each still on its own normal clause period so far); at each one,
      // test the scenario where THIS hire instead absorbed every remaining day up to redelivery
      // and carried the BOR credit. Keep advancing while that scenario still comes out non-
      // negative — the last row for which it does is the closest-to-zero settlement point. Any
      // further row would push the remainder below zero. Locked hires are skipped as candidates
      // (frozen to their saved snapshot regardless of where the credit lands). Falls back to the
      // last hire if even the very first one would go negative.
      let priorNormal = 0;
      let bestIdx = -1;
      rows.forEach((r, i) => {
        const e = stateOf(r.key);
        const rowLocked = hireLocked(e.status as HireStatus);
        const carryBodSim = bunkerPayIdx >= 0 && i >= bunkerPayIdx ? bodValue : 0;
        const carryBbSim = ballastPayIdx >= 0 && i >= ballastPayIdx ? ballastBonusAmt : 0;
        const carryIlohcSim = ilohcPayIdx >= 0 && i >= ilohcPayIdx ? num(recap.ilohc) : 0;
        const sideExtrasSim = cumulativeExtrasFor(stateOf, i);
        const carryRest = carryBodSim + carryBbSim + sideExtrasSim.extrasOwners - sideExtrasSim.extrasCharterers - carryIlohcSim - sideExtrasSim.jointOn / 2 - sideExtrasSim.jointOff / 2;
        // This hire's own normal (short clause-period) amount — accumulates what's already
        // been billed before any candidate settlement point.
        const normalDue = (r.cumulativeGross ?? 0) * (1 - dedPct / 100)
          + (num(recap.cve) / 30) * (r.cumulativeOnHire ?? 0)
          - (r.offHireValue ?? 0) + carryRest;
        const normalAmount = rowLocked && typeof e.amount === 'number' ? e.amount : normalDue - priorNormal;
        if (!rowLocked) {
          const extendedDue = grandGross * (1 - dedPct / 100)
            + (num(recap.cve) / 30) * grandOnHire
            - (r.offHireValue ?? 0) + carryRest;
          const remainder = extendedDue - borEstValue - priorNormal;
          if (remainder >= -0.005) bestIdx = i;
        }
        priorNormal += normalAmount;
      });
      bunkerSettleIdx = bestIdx >= 0 ? bestIdx : rows.length - 1;
    }
    // The settlement hire absorbs every remaining day to redelivery — nothing follows it.
    if (bunkerSettleIdx < rows.length - 1) rows = rows.slice(0, bunkerSettleIdx + 1);
    const settleRow = rows[bunkerSettleIdx];
    const settleLocked = settleRow ? hireLocked(stateOf(settleRow.key).status as HireStatus) : true;
    // A manually-edited "to" date on the settlement row (set via the SOA popup) already has its
    // own correct from-loop figures and must win over the auto redelivery-snap below.
    const settleManual = settleRow ? stateOf(settleRow.key).toManual === true : false;
    if (settleRow && !settleLocked && !settleManual) {
      const redeliveryValidHere = expectedRedelivery && settleRow.from && expectedRedelivery.getTime() > settleRow.from.getTime();
      if (redeliveryValidHere) {
        settleRow.to = expectedRedelivery;
        settleRow.onHire = settleRow.from ? Math.max(0, (expectedRedelivery.getTime() - settleRow.from.getTime()) / 86_400_000) : settleRow.onHire;
      }
      settleRow.cumulativeOnHire = grandOnHire;
      settleRow.cumulativeGross = grandGross;
    }
    // Bunker display values: BOD shown in full on every SOA for reference; BOR carried forward
    // (shown) from the settlement hire onward, same as BOD/BB.
    rows.forEach((row, idx) => {
      row.bunkers = bodValue;
      row.bunkerCredit = idx >= bunkerSettleIdx ? borEstValue : 0;
    });
  } else {
    rows.forEach((row) => {
      row.bunkers = bodValue;
      row.bunkerCredit = borEstValue;
    });
  }
  // The settlement hire (bunkerSettleIdx, or the structural last hire when bunkers aren't part of
  // the clause) is where a saved redelivery-time override applies once it's locked.
  const finalIdx = bunkerSettleIdx >= 0 ? bunkerSettleIdx : rows.length - 1;
  // Apply a saved actual-redelivery date on the settlement hire's SOA only once it's locked (Sent
  // For Payment / Paid & Locked) — otherwise a stale saved value shouldn't override a still-Draft
  // hire's live, clause-computed date.
  const finalEntry = stateOf(rows[finalIdx].key);
  if (hireLocked(finalEntry.status as HireStatus) && finalEntry.to) {
    const savedTo = parseDMY(finalEntry.to);
    if (savedTo) rows[finalIdx].to = savedTo;
  }
  // Apply user-set name overrides; all hires default to their ordinal (1st, 2nd, …).
  rows.forEach((r) => { const en = stateOf(r.key).name; if (en) r.name = en; });

  // CUMULATIVE-THEN-DEDUCT (per the Hire Payment clause): each hire's payable = the FULL cumulative
  // amount from Delivery to its own Hire-To-Date (hire + CVE, net of cumulative off-hire, plus
  // BOD/BB/BOR carried forward from whichever hire they're first charged on, not just that one
  // hire) MINUS the sum of all earlier hires' own final amounts. Locked (Sent For Payment / Paid &
  // Locked) hires are frozen to their saved snapshot and contribute that frozen value to the
  // running total, so settled history never shifts; unlocked hires keep recalculating live.
  let priorPaymentsTotal = 0;
  rows.forEach((r, i) => {
    const carryBod = bunkerPayIdx >= 0 && i >= bunkerPayIdx ? bodValue : 0;
    const carryBb = ballastPayIdx >= 0 && i >= ballastPayIdx ? ballastBonusAmt : 0;
    const carryBor = bunkerSettleIdx >= 0 && i >= bunkerSettleIdx ? borEstValue : 0;
    const carryIlohc = ilohcPayIdx >= 0 && i >= ilohcPayIdx ? num(recap.ilohc) : 0;
    const sideExtras = cumulativeExtrasFor(stateOf, i);
    r.cumulativeIlohc = carryIlohc;
    r.cumulativeJointOn = sideExtras.jointOn;
    r.cumulativeJointOff = sideExtras.jointOff;
    r.cumulativeExtrasOwners = sideExtras.extrasOwners;
    r.cumulativeExtrasCharterers = sideExtras.extrasCharterers;
    r.cumulativeExtrasList = sideExtras.extrasList;
    r.cumulativeAmountDue = (r.cumulativeGross ?? 0) * (1 - dedPct / 100)
      + (num(recap.cve) / 30) * (r.cumulativeOnHire ?? 0)
      - (r.offHireValue ?? 0) + carryBod + carryBb - carryBor
      + sideExtras.extrasOwners - sideExtras.extrasCharterers - carryIlohc - sideExtras.jointOn / 2 - sideExtras.jointOff / 2;
    const e = stateOf(r.key);
    const locked = hireLocked(e.status as HireStatus);
    if (locked && typeof e.amount === 'number') {
      r.amount = e.amount;
      if (e.due) { const d = parseDMY(e.due); if (d) r.due = d; }
    } else {
      r.amount = r.cumulativeAmountDue - priorPaymentsTotal;
    }
    priorPaymentsTotal += r.amount;
  });
  const totalPayable = rows.reduce((s, r) => s + r.amount, 0);
  const totalOnHireDays = rows.reduce((s, r) => s + r.onHire, 0);
  const totalOffHireDays = rows.reduce((s, r) => s + r.offHire, 0);

  const charterHd = num(recap.charterHirePerDay || recap.hirePerDay);
  const charterCur = recap.charterHireCurrency || 'USD';
  const charterAccount = recap.charterers || '—';
  const charterFirstPeriod = Math.max(1, num(recap.charterFirstHirePeriodDays) || 15);
  const charterDueBank = Math.max(0, num(recap.charterFirstHireDays) || 3);
  const charterSubPeriod = Math.max(1, num(recap.charterHireEveryDays) || 15);
  const charterIncl = recap.charterFirstHireInclude || 'None';
  const charterInclBallast = charterIncl === 'Ballast Bonus' || charterIncl === 'Both';
  const charterInclBunkers = charterIncl === 'Bunkers' || charterIncl === 'Both';
  const charterUseBankingBasis = /banking/i.test(recap.charterFirstHireBasis || 'Banking Days');
  const [charterManualExtra, setCharterManualExtra] = useState(0);

  let charterRows: HireRow[] = [];
  let charterCovered = 0;
  let charterN = 1;
  while (showDualHire && charterCovered < total - 0.01 && charterN <= 200) {
    const key = String(charterN);
    const e = charterStateOf(key);
    const status = e.status as HireStatus;
    const periodLen = charterN === 1 ? charterFirstPeriod : charterSubPeriod;
    const normalDays = Math.min(periodLen, total - charterCovered);
    const locked = hireLocked(status);
    const from = (locked && e.from) ? parseDMY(e.from) : (start ? addDays(start, charterCovered) : null);
    const manualTo = (!locked && e.toManual && e.to) ? parseDMY(e.to) : null;
    const isLastRow = !manualTo && charterCovered + normalDays >= total - 0.01;
    const redeliveryValid = isLastRow && expectedRedelivery && from && expectedRedelivery.getTime() > from.getTime();
    const to = (locked && e.to) ? parseDMY(e.to)
      : manualTo ? manualTo
      : redeliveryValid ? expectedRedelivery
      : (start ? addDays(start, charterCovered + normalDays) : null);
    const days = from && to ? Math.max(0, (to.getTime() - from.getTime()) / 86_400_000) : normalDays;
    const onHire = from && to ? Math.max(0, (to.getTime() - from.getTime()) / 86_400_000) : days;
    const offHire = (e.offHire ?? []).reduce((s, o) => s + offHireDays(o), 0);
    const duePre = from ? (charterUseBankingBasis ? addBankingDays(from, charterDueBank) : addDays(from, charterDueBank)) : null;
    const due = charterUseBankingBasis ? moveOffWeekend(duePre) : duePre;
    let cumulativeOffHire = 0;
    const cumulativeOffHireEvents: OffHireRow[] = [];
    for (let k = 0; k < charterN; k++) {
      const rKey = String(k + 1);
      const rEntry = charterStateOf(rKey);
      const offHireList = rEntry.offHire ?? [];
      cumulativeOffHire += offHireList.reduce((s, o) => s + offHireDays(o), 0);
      cumulativeOffHireEvents.push(...offHireList);
    }
    const cumulativeOnHire = to && start ? Math.max(0, (to.getTime() - start.getTime()) / 86_400_000) : 0;
    const cumulativeGross = charterHd * cumulativeOnHire;
    const cumulativeNett = Math.max(0, cumulativeOnHire - cumulativeOffHire);
    const cumulativeCve = (num(recap.cve) / 30) * cumulativeNett;
    const amount = cumulativeGross * (1 - dedPct / 100) + cumulativeCve;
    const offHireValue = offHireValueFor(recap.etaPlan.perf, cumulativeOffHireEvents, cumulativeOffHire, charterHd, dedPct, num(recap.cve), num(recap.foPrice), num(recap.doPrice));
    charterRows.push({ key, name: `${ordinal(charterN)} Hire`, account: charterAccount, from, to, onHire, offHire, amount, due, status, ballast: false, bunkers: 0, bunkerCredit: 0, cumulativeOnHire, cumulativeOffHire, cumulativeGross, offHireValue, cumulativeOffHireEvents });
    charterCovered += days;
    charterN += 1;
  }
  let charterManualFrom: Date | null = charterRows.length ? charterRows[charterRows.length - 1].to : start;
  for (let m = 0; showDualHire && m < charterManualExtra && charterN <= 200; m++) {
    const key = String(charterN);
    const e = charterStateOf(key);
    const status = e.status as HireStatus;
    const from = e.from ? parseDMY(e.from) : charterManualFrom;
    const isLastManRow = m === charterManualExtra - 1;
    const redeliveryValidMan = isLastManRow && expectedRedelivery && from && expectedRedelivery.getTime() > from.getTime();
    const to = e.to ? parseDMY(e.to) : redeliveryValidMan ? expectedRedelivery : (from ? addDays(from, charterSubPeriod) : null);
    const onHire = from && to ? Math.max(0, (to.getTime() - from.getTime()) / 86_400_000) : charterSubPeriod;
    const offHire = (e.offHire ?? []).reduce((s, o) => s + offHireDays(o), 0);
    const cumulativeOnHire = to && start ? Math.max(0, (to.getTime() - start.getTime()) / 86_400_000) : 0;
    let cumulativeOffHire = 0;
    const cumulativeOffHireEvents: OffHireRow[] = [];
    for (let k = 1; k <= charterRows.length + m + 1; k++) {
      const rKey = String(k);
      const rEntry = charterStateOf(rKey);
      const offHireList = rEntry.offHire ?? [];
      cumulativeOffHire += offHireList.reduce((s, o) => s + offHireDays(o), 0);
      cumulativeOffHireEvents.push(...offHireList);
    }
    const cumulativeGross = charterHd * cumulativeOnHire;
    const cumulativeNett = Math.max(0, cumulativeOnHire - cumulativeOffHire);
    const cumulativeCve = (num(recap.cve) / 30) * cumulativeNett;
    const amount = cumulativeGross * (1 - dedPct / 100) + cumulativeCve;
    const offHireValue = offHireValueFor(recap.etaPlan.perf, cumulativeOffHireEvents, cumulativeOffHire, charterHd, dedPct, num(recap.cve), num(recap.foPrice), num(recap.doPrice));
    const duePreMan = from ? (charterUseBankingBasis ? addBankingDays(from, charterDueBank) : addDays(from, charterDueBank)) : null;
    const dueMan = charterUseBankingBasis ? moveOffWeekend(duePreMan) : duePreMan;
    charterRows.push({ key, name: `${ordinal(charterN)} Hire`, account: charterAccount, from, to, onHire, offHire, amount, due: dueMan, status, ballast: false, bunkers: 0, bunkerCredit: 0, cumulativeOnHire, cumulativeOffHire, cumulativeGross, offHireValue, cumulativeOffHireEvents });
    charterManualFrom = to;
    charterN += 1;
  }

  charterRows = charterRows.filter((r) => charterStateOf(r.key).deleted !== true);

  const charterBallastOff = charterStateOf('1').ballastPayOff === true;
  let charterBallastPayIdx = charterRows.findIndex((r) => charterStateOf(r.key).ballast);
  if (charterBallastPayIdx < 0 && !charterBallastOff && charterInclBallast) charterBallastPayIdx = 0;
  if (charterBallastOff || !charterInclBallast) charterBallastPayIdx = -1;
  charterRows.forEach((r, i) => { r.ballast = i === charterBallastPayIdx; });
  // Computed ahead of the bunker block since the BOR auto-placement simulation needs it.
  const charterIlohcPayIdx = charterRows.findIndex((r) => charterStateOf(r.key).ilohcOn === true);

  let charterBunkerPayIdx = -1;
  let charterBunkerSettleIdx = -1;
  if (charterInclBunkers && charterRows.length) {
    charterBunkerPayIdx = charterRows.findIndex((r) => charterStateOf(r.key).bunkerPay);
    if (charterBunkerPayIdx < 0) charterBunkerPayIdx = 0;
    const grandOnHire = (expectedRedelivery && start) ? Math.max(0, (expectedRedelivery.getTime() - start.getTime()) / 86_400_000) : total;
    const grandGross = charterHd * grandOnHire;
    charterBunkerSettleIdx = charterRows.findIndex((r) => charterStateOf(r.key).bunkerRev);
    if (charterBunkerSettleIdx < 0) {
      // Auto-pick the settlement hire the same way as the owner side (see rationale above): walk
      // hires in order, testing the scenario where each one absorbed every remaining day to
      // redelivery and carried the BOR credit, and stop at the last one that stays non-negative.
      let priorNormal = 0;
      let bestIdx = -1;
      charterRows.forEach((r, i) => {
        const e = charterStateOf(r.key);
        const rowLocked = hireLocked(e.status as HireStatus);
        const carryBodSim = charterBunkerPayIdx >= 0 && i >= charterBunkerPayIdx ? bodValue : 0;
        const carryBbSim = charterBallastPayIdx >= 0 && i >= charterBallastPayIdx ? ballastBonusAmt : 0;
        const carryIlohcSim = charterIlohcPayIdx >= 0 && i >= charterIlohcPayIdx ? num(recap.ilohc) : 0;
        const sideExtrasSim = cumulativeExtrasFor(charterStateOf, i);
        const carryRest = carryBodSim + carryBbSim + sideExtrasSim.extrasOwners - sideExtrasSim.extrasCharterers - carryIlohcSim - sideExtrasSim.jointOn / 2 - sideExtrasSim.jointOff / 2;
        const normalDue = (r.cumulativeGross ?? 0) * (1 - dedPct / 100)
          + (num(recap.cve) / 30) * (r.cumulativeOnHire ?? 0)
          - (r.offHireValue ?? 0) + carryRest;
        const normalAmount = rowLocked && typeof e.amount === 'number' ? e.amount : normalDue - priorNormal;
        if (!rowLocked) {
          const extendedDue = grandGross * (1 - dedPct / 100)
            + (num(recap.cve) / 30) * grandOnHire
            - (r.offHireValue ?? 0) + carryRest;
          const remainder = extendedDue - borEstValue - priorNormal;
          if (remainder >= -0.005) bestIdx = i;
        }
        priorNormal += normalAmount;
      });
      charterBunkerSettleIdx = bestIdx >= 0 ? bestIdx : charterRows.length - 1;
    }
    // The settlement hire absorbs every remaining day to redelivery — nothing follows it.
    if (charterBunkerSettleIdx < charterRows.length - 1) charterRows = charterRows.slice(0, charterBunkerSettleIdx + 1);
    const settleRow = charterRows[charterBunkerSettleIdx];
    const settleLocked = settleRow ? hireLocked(charterStateOf(settleRow.key).status as HireStatus) : true;
    const settleManual = settleRow ? charterStateOf(settleRow.key).toManual === true : false;
    if (settleRow && !settleLocked && !settleManual) {
      const redeliveryValidHere = expectedRedelivery && settleRow.from && expectedRedelivery.getTime() > settleRow.from.getTime();
      if (redeliveryValidHere) {
        settleRow.to = expectedRedelivery;
        settleRow.onHire = settleRow.from ? Math.max(0, (expectedRedelivery.getTime() - settleRow.from.getTime()) / 86_400_000) : settleRow.onHire;
      }
      settleRow.cumulativeOnHire = grandOnHire;
      settleRow.cumulativeGross = grandGross;
    }
    charterRows.forEach((row, idx) => {
      row.bunkers = bodValue;
      row.bunkerCredit = idx >= charterBunkerSettleIdx ? borEstValue : 0;
    });
  } else {
    charterRows.forEach((row) => {
      row.bunkers = bodValue;
      row.bunkerCredit = borEstValue;
    });
  }

  const charterFinalIdx = charterBunkerSettleIdx >= 0 ? charterBunkerSettleIdx : charterRows.length - 1;
  if (charterRows[charterFinalIdx]) {
    const finalEntryCharter = charterStateOf(charterRows[charterFinalIdx].key);
    if (hireLocked(finalEntryCharter.status as HireStatus) && finalEntryCharter.to) {
      const savedTo = parseDMY(finalEntryCharter.to);
      if (savedTo) charterRows[charterFinalIdx].to = savedTo;
    }
  }
  charterRows.forEach((r) => { const en = charterStateOf(r.key).name; if (en) r.name = en; });
  // Cumulative-then-deduct (see owner-side rationale above).
  let charterPriorPaymentsTotal = 0;
  charterRows.forEach((r, i) => {
    const carryBod = charterBunkerPayIdx >= 0 && i >= charterBunkerPayIdx ? bodValue : 0;
    const carryBb = charterBallastPayIdx >= 0 && i >= charterBallastPayIdx ? ballastBonusAmt : 0;
    const carryBor = charterBunkerSettleIdx >= 0 && i >= charterBunkerSettleIdx ? borEstValue : 0;
    const carryIlohc = charterIlohcPayIdx >= 0 && i >= charterIlohcPayIdx ? num(recap.ilohc) : 0;
    const sideExtras = cumulativeExtrasFor(charterStateOf, i);
    r.cumulativeIlohc = carryIlohc;
    r.cumulativeJointOn = sideExtras.jointOn;
    r.cumulativeJointOff = sideExtras.jointOff;
    r.cumulativeExtrasOwners = sideExtras.extrasOwners;
    r.cumulativeExtrasCharterers = sideExtras.extrasCharterers;
    r.cumulativeExtrasList = sideExtras.extrasList;
    r.cumulativeAmountDue = (r.cumulativeGross ?? 0) * (1 - dedPct / 100)
      + (num(recap.cve) / 30) * (r.cumulativeOnHire ?? 0)
      - (r.offHireValue ?? 0) + carryBod + carryBb - carryBor
      + sideExtras.extrasOwners - sideExtras.extrasCharterers - carryIlohc - sideExtras.jointOn / 2 - sideExtras.jointOff / 2;
    const e = charterStateOf(r.key);
    const locked = hireLocked(e.status as HireStatus);
    if (locked && typeof e.amount === 'number') {
      r.amount = e.amount;
      if (e.due) { const d = parseDMY(e.due); if (d) r.due = d; }
    } else {
      r.amount = r.cumulativeAmountDue - charterPriorPaymentsTotal;
    }
    charterPriorPaymentsTotal += r.amount;
  });
  const charterTotalPayable = charterRows.reduce((s, r) => s + r.amount, 0);
  const charterTotalOnHireDays = charterRows.reduce((s, r) => s + r.onHire, 0);
  const charterTotalOffHireDays = charterRows.reduce((s, r) => s + r.offHire, 0);

  // Persist the fully computed schedule (dates/amounts/due per installment) into the recap so
  // the backend can read real numbers for fleet-wide hire reporting without re-deriving them.
  // Locked rows are already frozen above; unlocked rows refresh here every time days/clauses change.
  useEffect(() => {
    const toSnapshot = (list: typeof rows): HireScheduleRow[] => list.map((r) => ({
      key: r.key, name: r.name, account: r.account, from: fmtDate(r.from), to: fmtDate(r.to),
      onHire: r.onHire, offHire: r.offHire, amount: r.amount, due: fmtDate(r.due), status: r.status,
      ballast: r.ballast, bunkers: r.bunkers, bunkerCredit: r.bunkerCredit, deleted: false,
    }));
    const ownerSnap = toSnapshot(rows);
    const charterSnap = showDualHire ? toSnapshot(charterRows) : [];
    const ownerChanged = JSON.stringify(ownerSnap) !== JSON.stringify(recap.hireScheduleSnapshot ?? []);
    const charterChanged = JSON.stringify(charterSnap) !== JSON.stringify(recap.charterHireScheduleSnapshot ?? []);
    if (!ownerChanged && !charterChanged) return;
    setRecap((r) => ({
      ...r,
      hireScheduleSnapshot: ownerChanged ? ownerSnap : (r.hireScheduleSnapshot ?? ownerSnap),
      charterHireScheduleSnapshot: charterChanged ? charterSnap : (r.charterHireScheduleSnapshot ?? charterSnap),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, charterRows, showDualHire]);

  // Workflow transitions: Operations requests approval; only managers approve;
  // the payable is created when Operations sends an approved hire to Accounts.
  const advance = (key: string, to: HireStatus) => {
    const row = rows.find((r) => r.key === key);
    // Locking an installment snapshots its current computed from/to/amount/due so it stops
    // moving with later edits to the clause, off-hire or bunkers upstream (see freeze pass above).
    if (row && hireLocked(to)) {
      setState(key, { status: to, from: fmtDate(row.from), to: fmtDate(row.to), amount: row.amount, due: fmtDate(row.due) });
    } else {
      setState(key, { status: to });
    }
    if (!row) return;
    if (to === 'Sent For Approval') {
      addNotification(`Hire payment ${row.name} for ${recap.vesselName} is ready for manager review and approval. Vessel: ${recap.vesselName}; Voyage: ${voyage.id}.`, 'Manager');
    } else if (to === 'Approved') {
      addNotification(`Hire payment ${row.name} for ${recap.vesselName} was approved by the manager. The payment is ready to send to Accounts.`, module);
    } else if (to === 'Sent For Payment') {
      addPayable({
        reference: fixtureNo, vessel: recap.vesselName, voyage: voyage.id,
        supplier: recap.owners || 'Owners',
        invoiceNo: `HIR-${voyage.id}-${key}`,
        amount: row.amount, currency: recap.hireCurrency || 'USD',
        module, category: 'Hire',
      });
      addNotification(`Hire payment ${row.name} sent to Accounts. Fixture: ${fixtureNo}; Vessel: ${recap.vesselName}; Voyage: ${voyage.id}; Amount: ${money(row.amount)}.`, 'Accounts');
    }
  };
  const setHireName = (key: string, name: string) => setState(key, { name: name.trim() || undefined });
  const [soaRow, setSoaRow] = useState<number | null>(null);
  const [editNameKey, setEditNameKey] = useState<string | null>(null);
  const [editNameVal, setEditNameVal] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [charterSoaRow, setCharterSoaRow] = useState<number | null>(null);
  const [charterEditNameKey, setCharterEditNameKey] = useState<string | null>(null);
  const [charterEditNameVal, setCharterEditNameVal] = useState('');
  const [charterSelectedKeys, setCharterSelectedKeys] = useState<Set<string>>(new Set());
  const [selClaims, setSelClaims] = useState<Set<string>>(new Set());
  const [claimId, setClaimId] = useState<string | null>(null);
  const [claimStatusOpen, setClaimStatusOpen] = useState(false);
  const [claimStatusValue, setClaimStatusValue] = useState('Under Review');
  const fmtAmt = (n: number) => n.toLocaleString('en-US');
  const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const openFirstSelected = (ids: Set<string>) => Array.from(ids)[0] ?? null;

  const addClaim = () => {
    const row: ClaimRow = { id: uid('clm'), type: '', reference: '', chargeTo: '', owner: '', due: '', currency: 'USD', amount: 0, settlement: 0, status: 'Raised', paymentStatus: 'Pending', attachments: [] };
    setSettlement({ claims: [...settlement.claims, row] });
    setClaimId(row.id);
  };
  const saveClaim = (id: string, patch: Partial<ClaimRow>) => setSettlement({ claims: settlement.claims.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const deleteSelClaims = () => { setSettlement({ claims: settlement.claims.filter((x) => !selClaims.has(x.id)) }); setSelClaims(new Set()); };
  const copySelClaims = () => { setSettlement({ claims: [...settlement.claims, ...settlement.claims.filter((x) => selClaims.has(x.id)).map((x) => ({ ...x, id: uid('clm'), status: 'Raised', paymentStatus: 'Pending' }))] }); setSelClaims(new Set()); };
  const updateSelClaimStatus = () => {
    setClaimStatusValue('Under Review');
    setClaimStatusOpen(true);
  };
  const applyClaimStatus = () => {
    setSettlement({ claims: settlement.claims.map((x) => (selClaims.has(x.id) ? { ...x, status: claimStatusValue } : x)) });
    setClaimStatusOpen(false);
  };
  const pdfSelClaims = () => {
    const rowsSel = settlement.claims.filter((x) => selClaims.has(x.id));
    if (rowsSel.length === 0) return;
    const body = rowsSel.map((r) => `<tr><td>${esc(r.type)}</td><td>${esc(r.reference)}</td><td>${esc(claimChargeTo(r))}</td><td class="r">${fmtAmt(r.amount)}</td><td class="r">${fmtAmt(r.settlement)}</td><td class="r">${fmtAmt(r.amount - r.settlement)}</td><td>${esc(r.status)}</td></tr>`).join('');
    printSections(`Claims — ${recap.vesselName}`, `<section><h1>Claims</h1><table><thead><tr><th>Type</th><th>Reference</th><th>Charge To</th><th class="r">Amount</th><th class="r">Settlement</th><th class="r">Balance</th><th>Status</th></tr></thead><tbody>${body}</tbody></table></section>`);
  };
  const openClaim = settlement.claims.find((x) => x.id === claimId) ?? null;

  const sendPayable = (id: string, supplier: string, invoiceNo: string, amount: number, dueDate: string, category: 'PDA' | 'FDA' | 'Agency' | 'Claims') => {
    if (amount <= 0) return false;
    const payee = supplier || 'Settlement counterparty';
    const bank = findClientBankByName(payee);
    if (!bank?.verified) {
      window.alert(`Cannot send ${invoiceNo} to Accounts. Bank account details for "${payee}" are missing or not verified.`);
      return false;
    }
    addPayable({
      reference: `${voyage.id}-${id}`,
      vessel: voyage.vessel,
      voyage: voyage.id,
      supplier: payee,
      invoiceNo,
      amount,
      currency: 'USD',
      dueDate: dueDate || '—',
      module,
      category,
      bank: 'Verified account details on file',
      remarks: `Verified payment account: ${(bank.details || bank.accountHolder || payee).trim()}`,
    });
    return true;
  };
  const sendSelectedClaimsToAccounts = () => {
    const sent = settlement.claims
      .filter((x) => selClaims.has(x.id))
      .filter((x) => sendPayable(x.id, claimChargeTo(x), `CLM-${voyage.id}-${x.id}`, Math.max(0, x.amount - (x.settlement || 0)), x.due || '', 'Claims')).length;
    if (sent > 0) addNotification(`Selected claims for ${voyage.vessel} sent to Accounts.`, 'Accounts');
  };
  const advanceClaim = (id: string, to: HireStatus) => {
    const row = settlement.claims.find((x) => x.id === id);
    if (!row) return;
    if (to === 'Sent For Payment') {
      const sent = sendPayable(row.id, claimChargeTo(row), `CLM-${voyage.id}-${row.id}`, Math.max(0, row.amount - (row.settlement || 0)), row.due || '', 'Claims');
      if (!sent) return;
    }
    setSettlement({ claims: settlement.claims.map((x) => x.id === id ? { ...x, workflowStatus: to } : x) });
    if (to === 'Sent For Approval') addNotification(`Claim ${row.reference || row.type} for ${voyage.vessel} is ready for manager review and approval.`, 'Manager');
    else if (to === 'Approved') addNotification(`Claim ${row.reference || row.type} for ${voyage.vessel} was approved by the manager and is ready to send to Accounts.`, module);
    else if (to === 'Sent For Payment') {
      addNotification(`Claim ${row.reference || row.type} sent to Accounts. Fixture: ${fixtureNo}; Vessel: ${voyage.vessel}; Voyage: ${voyage.id}.`, 'Accounts');
    }
  };
  const claimActions = (id: string, workflowStatus: HireStatus = 'Draft') => (
    <span className="fv-ops__hire-actions">
      {workflowStatus === 'Draft' && <button type="button" className="fv-ops__btn" onClick={() => advanceClaim(id, 'Sent For Approval')}><i className="fas fa-paper-plane" aria-hidden="true" /> Send for Approval</button>}
      {workflowStatus === 'Sent For Approval' && canApproveHire && <>
        <button type="button" className="fv-ops__btn fv-ops__btn--go" onClick={() => advanceClaim(id, 'Approved')}><i className="fas fa-user-check" aria-hidden="true" /> Approve</button>
        <button type="button" className="fv-ops__btn" onClick={() => advanceClaim(id, 'Draft')}><i className="fas fa-rotate-left" aria-hidden="true" /> Reject</button>
      </>}
      {workflowStatus === 'Approved' && <button type="button" className="fv-ops__btn fv-ops__btn--go" onClick={() => advanceClaim(id, 'Sent For Payment')}><i className="fas fa-paper-plane" aria-hidden="true" /> Send for Payment</button>}
      {workflowStatus === 'Sent For Payment' && canApproveHire && <button type="button" className="fv-ops__btn" onClick={() => advanceClaim(id, 'Approved')} title="Manager unlock"><i className="fas fa-lock-open" aria-hidden="true" /> Unlock</button>}
    </span>
  );

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
    const snapshots: HireDuplicate[] = sel.map((row) => {
      const e = stateOf(row.key);
      const base: HireDuplicate = {
        id: uid('dup'),
        name: `${row.name} (copy)`,
        account: row.account,
        from: fmtDT(start),
        to: fmtDT(row.to),
        onHire: 0, offHire: 0, amount: 0, bunkers: 0, bunkerCredit: 0,
        due: fmtDate(row.due),
        status: row.status,
        ballast: row.ballast,
        hirePerDay: recap.hirePerDay, adcom: recap.adcom, brokerage: recap.brokerage,
        foPrice: recap.foPrice, doPrice: recap.doPrice, cve: recap.cve, ilohc: recap.ilohc, ballastBonus: recap.ballastBonus,
        delV: recap.etaPlan.startRobVlsfo, delM: recap.etaPlan.startRobMgo,
        borV: e.borV ?? '', borM: e.borM ?? '', borFo: e.borFo ?? '', borDo: e.borDo ?? '',
        offHireEvents: row.cumulativeOffHireEvents ?? e.offHire ?? [],
        extraExpenses: row.cumulativeExtrasList ?? e.extraExpenses ?? [],
        jointOn: String(row.cumulativeJointOn ?? num(e.jointOn ?? '0')),
        jointOff: String(row.cumulativeJointOff ?? num(e.jointOff ?? '0')),
        ilohcOn: e.ilohcOn ?? false,
      };
      return recomputeDuplicate(base, recap.etaPlan.perf);
    });
    setRecap((r) => ({ ...r, hireDuplicates: [...(r.hireDuplicates ?? []), ...snapshots] }));
    setSelectedKeys(new Set());
  };
  const deleteDuplicate = (id: string) => setRecap((r) => ({ ...r, hireDuplicates: (r.hireDuplicates ?? []).filter((d) => d.id !== id) }));
  const setDuplicate = (id: string, patch: Partial<HireDuplicate>) =>
    setRecap((r) => ({ ...r, hireDuplicates: (r.hireDuplicates ?? []).map((d) => (d.id === id ? recomputeDuplicate({ ...d, ...patch }, r.etaPlan.perf) : d)) }));
  const [dupSoaId, setDupSoaId] = useState<string | null>(null);
  const exportSelectedPdf = () => {
    const sel = rows.filter((r) => selectedKeys.has(r.key));
    if (sel.length === 0) return;
    const w = window.open('', '_blank', 'width=980,height=1100');
    if (!w) return;
    const p2 = (x: number) => String(x).padStart(2, '0');
    const today = new Date();
    const body = sel.map((r) => `<tr><td>${r.name}</td><td>${r.account}</td><td>${fmtDT(r.from)}</td><td>${fmtDT(r.to)}</td><td class="r">${fmt(r.cumulativeOnHire ?? r.onHire, 2)}</td><td class="r">${fmt(r.offHire, 2)}</td><td class="r">${money(r.amount)}</td><td>${fmtDate(r.due)}</td><td>${r.status}</td></tr>`).join('');
    const totalAmt = sel.reduce((s, r) => s + r.amount, 0);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Hire Payments — ${recap.vesselName}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:28px;font-size:12px}
      h1{font-size:16px;margin:0 0 2px}.sub{color:#555;margin:0 0 14px;font-size:11px}
      table{border-collapse:collapse;width:100%;margin:8px 0}
      th,td{border:1px solid #bbb;padding:4px 7px;text-align:left}
      th.r,td.r{text-align:right}tfoot td{font-weight:700;background:#f2f2f2}
    </style></head><body>${pdfCompanyHeader()}
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

  const advanceCharter = (key: string, to: HireStatus) => {
    const row = charterRows.find((r) => r.key === key);
    if (row && hireLocked(to)) {
      setCharterState(key, { status: to, from: fmtDate(row.from), to: fmtDate(row.to), amount: row.amount, due: fmtDate(row.due) });
    } else {
      setCharterState(key, { status: to });
    }
    if (!row) return;
    if (to === 'Sent For Approval') {
      addNotification(`Charterers hire payment ${row.name} for ${recap.vesselName} is ready for manager review and approval. Vessel: ${recap.vesselName}; Voyage: ${voyage.id}.`, 'Manager');
    } else if (to === 'Approved') {
      addNotification(`Charterers hire payment ${row.name} for ${recap.vesselName} was approved by the manager. The payment is ready to send to Accounts.`, module);
    } else if (to === 'Sent For Payment') {
      addPayable({ reference: fixtureNo, vessel: recap.vesselName, voyage: voyage.id, supplier: recap.charterers || 'Charterers', invoiceNo: `CHR-${voyage.id}-${key}`, amount: row.amount, currency: recap.charterHireCurrency || 'USD', module, category: 'Hire' });
      addNotification(`Charterers hire payment ${row.name} sent to Accounts. Fixture: ${fixtureNo}; Vessel: ${recap.vesselName}; Voyage: ${voyage.id}; Amount: ${money(row.amount)}.`, 'Accounts');
    }
  };
  const setCharterHireName = (key: string, name: string) => setCharterState(key, { name: name.trim() || undefined });
  const toggleSelectCharter = (key: string) => setCharterSelectedKeys((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const deleteSelectedCharter = () => {
    if (charterSelectedKeys.size === 0) return;
    setRecap((r) => {
      const next = { ...r.charterHirePayState };
      charterSelectedKeys.forEach((key) => { next[key] = { ...charterStateOfRaw(r, key), deleted: true }; });
      return { ...r, charterHirePayState: next };
    });
    setCharterSelectedKeys(new Set());
  };
  const duplicateSelectedCharter = () => {
    if (charterSelectedKeys.size === 0) return;
    const sel = charterRows.filter((r) => charterSelectedKeys.has(r.key));
    const snapshots: HireDuplicate[] = sel.map((row) => {
      const e = charterStateOf(row.key);
      const base: HireDuplicate = {
        id: uid('dup'),
        name: `${row.name} (copy)`,
        account: row.account,
        from: fmtDT(start),
        to: fmtDT(row.to),
        onHire: 0, offHire: 0, amount: 0, bunkers: 0, bunkerCredit: 0,
        due: fmtDate(row.due),
        status: row.status,
        ballast: row.ballast,
        hirePerDay: recap.charterHirePerDay || recap.hirePerDay, adcom: recap.adcom, brokerage: recap.brokerage,
        foPrice: recap.foPrice, doPrice: recap.doPrice, cve: recap.cve, ilohc: recap.ilohc, ballastBonus: recap.ballastBonus,
        delV: recap.etaPlan.startRobVlsfo, delM: recap.etaPlan.startRobMgo,
        borV: e.borV ?? '', borM: e.borM ?? '', borFo: e.borFo ?? '', borDo: e.borDo ?? '',
        offHireEvents: row.cumulativeOffHireEvents ?? e.offHire ?? [],
        extraExpenses: row.cumulativeExtrasList ?? e.extraExpenses ?? [],
        jointOn: String(row.cumulativeJointOn ?? num(e.jointOn ?? '0')),
        jointOff: String(row.cumulativeJointOff ?? num(e.jointOff ?? '0')),
        ilohcOn: e.ilohcOn ?? false,
      };
      return recomputeDuplicate(base, recap.etaPlan.perf);
    });
    setRecap((r) => ({ ...r, charterHireDuplicates: [...(r.charterHireDuplicates ?? []), ...snapshots] }));
    setCharterSelectedKeys(new Set());
  };
  const deleteCharterDuplicate = (id: string) => setRecap((r) => ({ ...r, charterHireDuplicates: (r.charterHireDuplicates ?? []).filter((d) => d.id !== id) }));
  const setCharterDuplicate = (id: string, patch: Partial<HireDuplicate>) =>
    setRecap((r) => ({ ...r, charterHireDuplicates: (r.charterHireDuplicates ?? []).map((d) => (d.id === id ? recomputeDuplicate({ ...d, ...patch }, r.etaPlan.perf) : d)) }));
  const [charterDupSoaId, setCharterDupSoaId] = useState<string | null>(null);
  const exportSelectedCharterPdf = () => {
    const sel = charterRows.filter((r) => charterSelectedKeys.has(r.key));
    if (sel.length === 0) return;
    const w = window.open('', '_blank', 'width=980,height=1100');
    if (!w) return;
    const p2 = (x: number) => String(x).padStart(2, '0');
    const today = new Date();
    const body = sel.map((r) => `<tr><td>${r.name}</td><td>${r.account}</td><td>${fmtDT(r.from)}</td><td>${fmtDT(r.to)}</td><td class="r">${fmt(r.cumulativeOnHire ?? r.onHire, 2)}</td><td class="r">${fmt(r.offHire, 2)}</td><td class="r">${money(r.amount)}</td><td>${fmtDate(r.due)}</td><td>${r.status}</td></tr>`).join('');
    const totalAmt = sel.reduce((s, r) => s + r.amount, 0);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Charterers Hire Payments — ${recap.vesselName}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:28px;font-size:12px}
      h1{font-size:16px;margin:0 0 2px}.sub{color:#555;margin:0 0 14px;font-size:11px}
      table{border-collapse:collapse;width:100%;margin:8px 0}
      th,td{border:1px solid #bbb;padding:4px 7px;text-align:left}
      th.r,td.r{text-align:right}tfoot td{font-weight:700;background:#f2f2f2}
    </style></head><body>${pdfCompanyHeader()}
      <h1>Charterers Hire Payment Schedule — ${sel.length} installment${sel.length > 1 ? 's' : ''}</h1>
      <p class="sub">${recap.vesselName} · Charterers ${recap.charterers || '—'} · CP ${recap.charterersCpDate || recap.cpDate || '—'} · ${p2(today.getDate())}-${p2(today.getMonth() + 1)}-${today.getFullYear()}</p>
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
                        {firstInclBallast && !locked && (
                          <label className="fv-ops__hire-bb" title="Pay ballast bonus (BB) on this hire — untick to not pay it">
                            <input type="checkbox" checked={i === ballastPayIdx} onChange={(e) => setBallastPay(r.key, e.target.checked)} /> BB
                          </label>
                        )}
                        {firstInclBunkers && !locked && (
                          <label className="fv-ops__hire-bb fv-ops__hire-bb--bnk" title="Charge bunkers on delivery (BOD) on this hire">
                            <input type="checkbox" checked={i === bunkerPayIdx} onChange={(e) => setBunkerPay(r.key, e.target.checked)} /> BOD
                          </label>
                        )}
                        {firstInclBunkers && !locked && (
                          <label className="fv-ops__hire-bb fv-ops__hire-bb--rev" title="Reverse bunkers on redelivery (BOR) on this hire — sets its Hire-to-date to actual redelivery">
                            <input type="checkbox" checked={i === bunkerSettleIdx} onChange={(e) => setBunkerAnchor(r.key, 'bunkerRev', e.target.checked)} /> BOR
                          </label>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>{r.account}</td>
                  <td className="fv-ops__eta-dt">{fmtDT(r.from)}</td>
                  <td className="fv-ops__eta-dt">{fmtDT(r.to)}</td>
                  <td className="fv-ops__r">{fmt(r.cumulativeOnHire ?? r.onHire, 2)} <span className="fv-ops__soa-muted">({fmt(r.onHire, 2)})</span></td>
                  <td className="fv-ops__r">{fmt(r.cumulativeOffHire ?? r.offHire, 2)} <span className="fv-ops__soa-muted">({fmt(r.offHire, 2)})</span></td>
                  <td className="fv-ops__r">{money(r.amount)}</td>
                  <td>{fmtDate(r.due)}</td>
                  <td>
                    <span className={`fv-ops__pill fv-ops__pill--${hireStatusPill(r.status)}`}>{r.status}</span>
                    {locked && <i className="fas fa-lock fv-ops__hire-lock" title="Locked — manager approval required to unlock" aria-hidden="true" />}
                  </td>
                  <td>
                    <span className="fv-ops__hire-actions">
                      {r.status === 'Draft' && <button type="button" className="fv-ops__btn" onClick={() => advance(r.key, 'Sent For Approval')}><i className="fas fa-paper-plane" aria-hidden="true" /> Send for Approval</button>}
                      {r.status === 'Sent For Approval' && canApproveHire && <>
                        <button type="button" className="fv-ops__btn fv-ops__btn--go" onClick={() => advance(r.key, 'Approved')}><i className="fas fa-user-check" aria-hidden="true" /> Approve</button>
                        <button type="button" className="fv-ops__btn" onClick={() => advance(r.key, 'Draft')}><i className="fas fa-rotate-left" aria-hidden="true" /> Reject</button>
                      </>}
                      {r.status === 'Approved' && <button type="button" className="fv-ops__btn fv-ops__btn--go" onClick={() => advance(r.key, 'Sent For Payment')}><i className="fas fa-paper-plane" aria-hidden="true" /> Send for Payment</button>}
                      {r.status === 'Sent For Payment' && canApproveHire && <button type="button" className="fv-ops__btn" onClick={() => advance(r.key, 'Approved')} title="Manager unlock"><i className="fas fa-lock-open" aria-hidden="true" /> Unlock</button>}
                      {r.status === 'Paid & Locked' && canApproveHire && <button type="button" className="fv-ops__btn" onClick={() => advance(r.key, 'Approved')} title="Manager unlock"><i className="fas fa-lock-open" aria-hidden="true" /> Unlock</button>}
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
        <i className="fas fa-diagram-project" aria-hidden="true" /> Action flow: Draft → Operations <b>Send for Approval</b> → Manager <b>Approve</b> → Operations <b>Send for Payment</b> → Accounts. The Status column reflects each step. A sent payment can only be reopened by a manager. Tick <b>BB</b> to choose which hire pays the ballast bonus ({money(ballastBonusAmt)}); <b>BOR</b> chooses which hire the bunker settlement (BOD − BOR) falls due on (default the final hire).
      </p>
    </Card>

    {showDualHire && (
      <Card title="Charterers Hire Payment Schedule" icon="fa-handshake" right={
        <div className="fv-ops__card-controls">
          <button type="button" className="fv-ops__btn fv-ops__btn--sm" onClick={() => setCharterManualExtra((x) => x + 1)} title="Add installment beyond estimated redelivery"><i className="fas fa-plus" aria-hidden="true" /> Add</button>
          <button type="button" className="fv-ops__btn fv-ops__btn--sm" onClick={duplicateSelectedCharter} disabled={charterSelectedKeys.size === 0} title="Duplicate the selected charterers hire payments"><i className="fas fa-copy" aria-hidden="true" /> Duplicate{charterSelectedKeys.size > 0 ? ` (${charterSelectedKeys.size})` : ''}</button>
          <button type="button" className="fv-ops__btn fv-ops__btn--sm" onClick={exportSelectedCharterPdf} disabled={charterSelectedKeys.size === 0} title="Generate a PDF of the selected charterers hire payments"><i className="fas fa-file-pdf" aria-hidden="true" /> PDF{charterSelectedKeys.size > 0 ? ` (${charterSelectedKeys.size})` : ''}</button>
          <button type="button" className="fv-ops__btn fv-ops__btn--sm" onClick={deleteSelectedCharter} disabled={charterSelectedKeys.size === 0} title="Delete the selected charterers hire payments"><i className="fas fa-trash" aria-hidden="true" /> Delete{charterSelectedKeys.size > 0 ? ` (${charterSelectedKeys.size})` : ''}</button>
        </div>
      }>
        <div className="fv-ops__eta-scroll">
          <table className="fv-ops__table fv-ops__hire">
            <thead>
              <tr>
                <th className="fv-ops__hire-selcol">
                  <input type="checkbox" aria-label="Select all charterers hire payments"
                    checked={charterRows.length > 0 && charterRows.every((r) => charterSelectedKeys.has(r.key))}
                    ref={(el) => { if (el) el.indeterminate = charterSelectedKeys.size > 0 && !charterRows.every((r) => charterSelectedKeys.has(r.key)); }}
                    onChange={(e) => setCharterSelectedKeys(e.target.checked ? new Set(charterRows.map((r) => r.key)) : new Set())} />
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
              {charterRows.length === 0 && <tr><td colSpan={11} className="fv-ops__vd-empty">Set delivery &amp; redelivery dates to build the schedule.</td></tr>}
              {charterRows.map((r, i) => {
                const locked = hireLocked(r.status);
                return (
                  <tr key={r.key}>
                    <td className="fv-ops__hire-selcol">
                      <input type="checkbox" aria-label={`Select ${r.name}`} checked={charterSelectedKeys.has(r.key)} onChange={() => toggleSelectCharter(r.key)} />
                    </td>
                    <td>
                      <div className="fv-ops__hire-namecell">
                        <div className="fv-ops__hire-nameleft">
                          {charterEditNameKey === r.key
                            ? <input autoFocus className="fv-ops__hire-namein" defaultValue={charterEditNameVal}
                                onBlur={(e) => { setCharterHireName(r.key, e.target.value); setCharterEditNameKey(null); }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') { e.preventDefault(); setCharterHireName(r.key, (e.target as HTMLInputElement).value); setCharterEditNameKey(null); }
                                  if (e.key === 'Escape') setCharterEditNameKey(null);
                                }} />
                            : <>
                                <button type="button" className="fv-ops__hire-namebtn" onClick={() => setCharterSoaRow(i)} title={r.name === 'FHS' ? 'Final Hire Statement — settlement at actual redelivery' : 'Open Statement of Account'}>{r.name}</button>
                                {!locked && <button type="button" className="fv-ops__hire-nameedit" title="Rename" onClick={() => { setCharterEditNameKey(r.key); setCharterEditNameVal(r.name); }}><i className="fas fa-pen" aria-hidden="true" /></button>}
                              </>
                          }
                        </div>
                        <div className="fv-ops__hire-nameright">
                          {r.ballast && <span className="fv-ops__hire-tag fv-ops__hire-tag--bb" title="Ballast bonus paid with this hire">+BB</span>}
                          {i === charterBunkerPayIdx && <span className="fv-ops__hire-tag" title="Bunkers on delivery (BOD) charged to charterers on this hire">+BOD</span>}
                          {i === charterBunkerSettleIdx && <span className="fv-ops__hire-tag fv-ops__hire-tag--credit" title="Bunkers on redelivery (BOR) reversed on this hire — runs to actual redelivery">−BOR</span>}
                          {charterInclBallast && !locked && (
                            <label className="fv-ops__hire-bb" title="Pay ballast bonus (BB) on this hire — untick to not pay it">
                              <input type="checkbox" checked={i === charterBallastPayIdx} onChange={(e) => setCharterBallastPay(r.key, e.target.checked)} /> BB
                            </label>
                          )}
                          {charterInclBunkers && !locked && (
                            <label className="fv-ops__hire-bb fv-ops__hire-bb--bnk" title="Charge bunkers on delivery (BOD) on this hire">
                              <input type="checkbox" checked={i === charterBunkerPayIdx} onChange={(e) => setCharterBunkerPay(r.key, e.target.checked)} /> BOD
                            </label>
                          )}
                          {charterInclBunkers && !locked && (
                            <label className="fv-ops__hire-bb fv-ops__hire-bb--rev" title="Reverse bunkers on redelivery (BOR) on this hire">
                              <input type="checkbox" checked={i === charterBunkerSettleIdx} onChange={(e) => setCharterBunkerAnchor(r.key, 'bunkerRev', e.target.checked)} /> BOR
                            </label>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{r.account}</td>
                    <td className="fv-ops__eta-dt">{fmtDT(r.from)}</td>
                    <td className="fv-ops__eta-dt">{fmtDT(r.to)}</td>
                    <td className="fv-ops__r">{fmt(r.cumulativeOnHire ?? r.onHire, 2)} <span className="fv-ops__soa-muted">({fmt(r.onHire, 2)})</span></td>
                    <td className="fv-ops__r">{fmt(r.cumulativeOffHire ?? r.offHire, 2)} <span className="fv-ops__soa-muted">({fmt(r.offHire, 2)})</span></td>
                    <td className="fv-ops__r">{money(r.amount)}</td>
                    <td>{fmtDate(r.due)}</td>
                    <td>
                      <span className={`fv-ops__pill fv-ops__pill--${hireStatusPill(r.status)}`}>{r.status}</span>
                      {locked && <i className="fas fa-lock fv-ops__hire-lock" title="Locked — manager approval required to unlock" aria-hidden="true" />}
                    </td>
                    <td>
                      <span className="fv-ops__hire-actions">
                        {r.status === 'Draft' && <button type="button" className="fv-ops__btn" onClick={() => advanceCharter(r.key, 'Sent For Approval')}><i className="fas fa-paper-plane" aria-hidden="true" /> Send for Approval</button>}
                        {r.status === 'Sent For Approval' && canApproveHire && <>
                          <button type="button" className="fv-ops__btn fv-ops__btn--go" onClick={() => advanceCharter(r.key, 'Approved')}><i className="fas fa-user-check" aria-hidden="true" /> Approve</button>
                          <button type="button" className="fv-ops__btn" onClick={() => advanceCharter(r.key, 'Draft')}><i className="fas fa-rotate-left" aria-hidden="true" /> Reject</button>
                        </>}
                        {r.status === 'Approved' && <button type="button" className="fv-ops__btn fv-ops__btn--go" onClick={() => advanceCharter(r.key, 'Sent For Payment')}><i className="fas fa-paper-plane" aria-hidden="true" /> Send for Payment</button>}
                        {r.status === 'Sent For Payment' && canApproveHire && <button type="button" className="fv-ops__btn" onClick={() => advanceCharter(r.key, 'Approved')} title="Manager unlock"><i className="fas fa-lock-open" aria-hidden="true" /> Unlock</button>}
                        {r.status === 'Paid & Locked' && canApproveHire && <button type="button" className="fv-ops__btn" onClick={() => advanceCharter(r.key, 'Approved')} title="Manager unlock"><i className="fas fa-lock-open" aria-hidden="true" /> Unlock</button>}
                      </span>
                    </td>
                  </tr>
                );
              })}
              <tr className="fv-ops__row-sub">
                <td />
                <td>Total Payable ({charterRows.length} installments)</td>
                <td />
                <td />
                <td />
                <td className="fv-ops__r">{fmt(charterTotalOnHireDays, 2)}</td>
                <td className="fv-ops__r">{fmt(charterTotalOffHireDays, 2)}</td>
                <td className="fv-ops__r">{money(charterTotalPayable)}</td>
                <td />
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="fv-ops__hint">
          {charterCur} · Auto-built from CP terms: 1st hire {charterFirstPeriod} days including {charterIncl}, payable within {recap.charterFirstHireDays} {recap.charterFirstHireBasis}, then every {recap.charterHireEveryDays} days in advance until redelivery. Each hire = net hire + CVE; bunkers on delivery (BOD) and on redelivery (BOR) follow selected charterers clause anchors. Voyage {fmt(total, 2)} days — schedule &amp; due dates recompute as the redelivery date moves. Commissions {fmt(dedPct)}% deducted. Rename any hire using the pencil icon.
        </p>
        <p className="fv-ops__hint">
          <i className="fas fa-diagram-project" aria-hidden="true" /> Action flow: Draft → Operations <b>Send for Approval</b> → Manager <b>Approve</b> → Operations <b>Send for Payment</b> → Accounts. The Status column reflects each step. A sent payment can only be reopened by a manager. Tick <b>BB</b> to choose which hire pays the ballast bonus ({money(ballastBonusAmt)}); <b>BOR</b> chooses which hire the bunker settlement (BOD − BOR) falls due on (default the final hire).
        </p>
      </Card>
    )}

    <Card
      title="Claims & Expenses"
      icon="fa-gavel"
      wide
      right={(
        <span className="fv-ops__frl-secbtns">
          <button type="button" className="fv-ops__btn" onClick={addClaim}><i className="fas fa-plus" aria-hidden="true" /> New</button>
          <button type="button" className="fv-ops__btn" onClick={() => setClaimId(openFirstSelected(selClaims))} disabled={selClaims.size === 0}><i className="fas fa-pen" aria-hidden="true" /> Edit</button>
          <button type="button" className="fv-ops__btn" onClick={copySelClaims} disabled={selClaims.size === 0}><i className="fas fa-copy" aria-hidden="true" /> Copy</button>
          <button type="button" className="fv-ops__btn" onClick={deleteSelClaims} disabled={selClaims.size === 0}><i className="fas fa-trash" aria-hidden="true" /> Delete</button>
          <button type="button" className="fv-ops__btn" onClick={pdfSelClaims} disabled={selClaims.size === 0}><i className="fas fa-file-pdf" aria-hidden="true" /> Pdf</button>
          <button type="button" className="fv-ops__btn" onClick={updateSelClaimStatus} disabled={selClaims.size === 0}><i className="fas fa-rotate" aria-hidden="true" /> Status</button>
          <button type="button" className="fv-ops__btn fv-ops__btn--primary" onClick={sendSelectedClaimsToAccounts} disabled={selClaims.size === 0}><i className="fas fa-paper-plane" aria-hidden="true" /> Send to Accounts</button>
        </span>
      )}
    >
      <table className="fv-ops__table">
        <thead>
            <tr><th className="fv-ops__hire-selcol"><input type="checkbox" aria-label="Select all claims" checked={settlement.claims.length > 0 && settlement.claims.every((x) => selClaims.has(x.id))} ref={(el) => { if (el) el.indeterminate = selClaims.size > 0 && !settlement.claims.every((x) => selClaims.has(x.id)); }} onChange={(e) => setSelClaims(e.target.checked ? new Set(settlement.claims.map((x) => x.id)) : new Set())} /></th><th>Type</th><th>Reference</th><th>Charge To</th><th>Due</th><th className="fv-ops__r">Amount</th><th className="fv-ops__r">Settlement</th><th className="fv-ops__r">Balance</th><th>Attachment</th><th>Status</th><th>Payment Status</th><th>Action</th></tr>
        </thead>
        <tbody>
          {settlement.claims.map((c) => {
            const settled = c.settlement || 0;
            const balance = c.amount - settled;
            return (
              <tr key={c.id}>
                <td className="fv-ops__hire-selcol"><input type="checkbox" aria-label={`Select ${c.reference || 'claim'}`} checked={selClaims.has(c.id)} onChange={() => setSelClaims((prev) => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} /></td>
                <td><button type="button" className="fv-ops__hire-namebtn" onClick={() => setClaimId(c.id)}>{c.type || 'Open'}</button></td>
                <td>{c.reference}</td>
                <td>{claimChargeTo(c) || '—'}</td>
                <td>{c.due || '—'}</td>
                <td className="fv-ops__r">{fmtAmt(c.amount)}</td>
                <td className="fv-ops__r">{fmtAmt(settled)}</td>
                <td className={`fv-ops__r${balance > 0 ? ' fv-ops__neg' : ' fv-ops__pos'}`}>{fmtAmt(balance)}</td>
                <td>{attachmentStatusLabel(c.attachments)}</td>
                <td><span className={`fv-ops__pill fv-ops__pill--${c.workflowStatus === 'Paid & Locked' || c.status === 'Settled' ? 'green' : 'amber'}`}>{c.workflowStatus || c.status}</span></td>
                <td><span className={`fv-ops__pill fv-ops__pill--${c.paymentStatus === 'Paid' ? 'green' : 'amber'}`}>{c.paymentStatus || 'Pending'}</span></td>
                <td>{claimActions(c.id, c.workflowStatus)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
                  <td><button type="button" className="fv-ops__hire-namebtn" onClick={() => setDupSoaId(d.id)} title="Open Statement of Account">{d.name}</button></td>
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
        <p className="fv-ops__hint">Independent snapshots created from the schedule above — click a name to open its own Statement of Account, fully editable, same as a real hire. These never affect the live hire calculations or the next-hire addition.</p>
      </Card>
    )}
    {dupSoaId && (recap.hireDuplicates ?? []).find((d) => d.id === dupSoaId) && (() => {
      const d = (recap.hireDuplicates ?? []).find((x) => x.id === dupSoaId)!;
      const dRow = {
        key: d.id, name: d.name, from: parseDMY(d.from), to: parseDMY(d.to), onHire: d.onHire, offHire: d.offHire, amount: d.amount,
        ballast: d.ballast, status: d.status, bunkers: d.bunkers, bunkerCredit: d.bunkerCredit, cumulativeAmountDue: d.amount,
        cumulativeIlohc: d.ilohcOn ? num(d.ilohc) : 0, cumulativeJointOn: num(d.jointOn), cumulativeJointOff: num(d.jointOff),
        cumulativeExtrasOwners: d.extraExpenses.reduce((s, e) => s + (e.due === 'Owners' ? num(e.amount) : 0), 0),
        cumulativeExtrasCharterers: d.extraExpenses.reduce((s, e) => s + (e.due !== 'Owners' ? num(e.amount) : 0), 0),
        cumulativeExtrasList: d.extraExpenses, cumulativeOffHireEvents: d.offHireEvents,
      };
      const dEntry: HirePayEntry = {
        status: d.status, ballast: d.ballast, name: d.name, from: d.from, to: d.to, amount: d.amount, due: d.due,
        offHire: d.offHireEvents, jointOn: d.jointOn, jointOff: d.jointOff, ilohcOn: d.ilohcOn,
        borV: d.borV, borM: d.borM, borFo: d.borFo, borDo: d.borDo, extraExpenses: d.extraExpenses, ownersClaimIds: [],
      };
      return (
        <HireSoaModal
          row={dRow}
          entry={dEntry}
          allRows={[]}
          claims={settlement.claims}
          recap={{ ...recap, hirePerDay: d.hirePerDay, adcom: d.adcom, brokerage: d.brokerage, foPrice: d.foPrice, doPrice: d.doPrice, cve: d.cve, ilohc: d.ilohc, ballastBonus: d.ballastBonus, etaPlan: { ...recap.etaPlan, startRobVlsfo: d.delV, startRobMgo: d.delM } }}
          borRobV={borRob.v}
          borRobM={borRob.m}
          isLast={true}
          cumulative={true}
          bodCharged={true}
          ballastCarried={d.ballast}
          borReversedToHere={d.bunkerCredit}
          priorOffHireDays={0}
          onSave={(recapPatch, entryPatch) => {
            setDuplicate(d.id, {
              hirePerDay: recapPatch.hirePerDay ?? d.hirePerDay,
              adcom: recapPatch.adcom ?? d.adcom,
              brokerage: recapPatch.brokerage ?? d.brokerage,
              foPrice: recapPatch.foPrice ?? d.foPrice,
              doPrice: recapPatch.doPrice ?? d.doPrice,
              cve: recapPatch.cve ?? d.cve,
              ilohc: recapPatch.ilohc ?? d.ilohc,
              ballastBonus: recapPatch.ballastBonus ?? d.ballastBonus,
              delV: recapPatch.etaPlan?.startRobVlsfo ?? d.delV,
              delM: recapPatch.etaPlan?.startRobMgo ?? d.delM,
              from: entryPatch.from ?? d.from,
              to: entryPatch.to ?? d.to,
              offHireEvents: entryPatch.offHire ?? d.offHireEvents,
              ballast: entryPatch.ballast ?? d.ballast,
              jointOn: entryPatch.jointOn ?? d.jointOn,
              jointOff: entryPatch.jointOff ?? d.jointOff,
              ilohcOn: entryPatch.ilohcOn ?? d.ilohcOn,
              borV: entryPatch.borV ?? d.borV,
              borM: entryPatch.borM ?? d.borM,
              borFo: entryPatch.borFo ?? d.borFo,
              borDo: entryPatch.borDo ?? d.borDo,
              extraExpenses: entryPatch.extraExpenses ?? d.extraExpenses,
            });
          }}
          onClose={() => setDupSoaId(null)}
        />
      );
    })()}
    {showDualHire && (recap.charterHireDuplicates ?? []).length > 0 && (
      <Card title="Duplicated Charterers Hire Payments" icon="fa-copy" right={
        <div className="fv-ops__card-controls">
          <button type="button" className="fv-ops__btn fv-ops__btn--sm" onClick={() => setRecap((r) => ({ ...r, charterHireDuplicates: [] }))} title="Clear all duplicated charterers hire payments"><i className="fas fa-trash" aria-hidden="true" /> Clear All</button>
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
              {(recap.charterHireDuplicates ?? []).map((d) => (
                <tr key={d.id}>
                  <td><button type="button" className="fv-ops__hire-namebtn" onClick={() => setCharterDupSoaId(d.id)} title="Open Statement of Account">{d.name}</button></td>
                  <td>{d.account}</td>
                  <td className="fv-ops__eta-dt">{d.from}</td>
                  <td className="fv-ops__eta-dt">{d.to}</td>
                  <td className="fv-ops__r">{fmt(d.onHire, 2)}</td>
                  <td className="fv-ops__r">{fmt(d.offHire, 2)}</td>
                  <td className="fv-ops__r">{money(d.amount)}</td>
                  <td>{d.due}</td>
                  <td><span className={`fv-ops__pill fv-ops__pill--${hireStatusPill(d.status as HireStatus)}`}>{d.status}</span></td>
                  <td><button type="button" className="fv-ops__bnk-rm" aria-label="Delete duplicate" onClick={() => deleteCharterDuplicate(d.id)}><i className="fas fa-trash" aria-hidden="true" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fv-ops__hint">Independent snapshots created from the charterers schedule above — click a name to open its own Statement of Account, fully editable, same as a real hire. These never affect the live hire calculations or the next-hire addition.</p>
      </Card>
    )}
    {charterDupSoaId && (recap.charterHireDuplicates ?? []).find((d) => d.id === charterDupSoaId) && (() => {
      const d = (recap.charterHireDuplicates ?? []).find((x) => x.id === charterDupSoaId)!;
      const dRow = {
        key: d.id, name: d.name, from: parseDMY(d.from), to: parseDMY(d.to), onHire: d.onHire, offHire: d.offHire, amount: d.amount,
        ballast: d.ballast, status: d.status, bunkers: d.bunkers, bunkerCredit: d.bunkerCredit, cumulativeAmountDue: d.amount,
        cumulativeIlohc: d.ilohcOn ? num(d.ilohc) : 0, cumulativeJointOn: num(d.jointOn), cumulativeJointOff: num(d.jointOff),
        cumulativeExtrasOwners: d.extraExpenses.reduce((s, e) => s + (e.due === 'Owners' ? num(e.amount) : 0), 0),
        cumulativeExtrasCharterers: d.extraExpenses.reduce((s, e) => s + (e.due !== 'Owners' ? num(e.amount) : 0), 0),
        cumulativeExtrasList: d.extraExpenses, cumulativeOffHireEvents: d.offHireEvents,
      };
      const dEntry: HirePayEntry = {
        status: d.status, ballast: d.ballast, name: d.name, from: d.from, to: d.to, amount: d.amount, due: d.due,
        offHire: d.offHireEvents, jointOn: d.jointOn, jointOff: d.jointOff, ilohcOn: d.ilohcOn,
        borV: d.borV, borM: d.borM, borFo: d.borFo, borDo: d.borDo, extraExpenses: d.extraExpenses, ownersClaimIds: [],
      };
      return (
        <HireSoaModal
          row={dRow}
          entry={dEntry}
          allRows={[]}
          claims={settlement.claims}
          recap={{ ...recap, charterHirePerDay: d.hirePerDay, adcom: d.adcom, brokerage: d.brokerage, foPrice: d.foPrice, doPrice: d.doPrice, cve: d.cve, ilohc: d.ilohc, ballastBonus: d.ballastBonus, etaPlan: { ...recap.etaPlan, startRobVlsfo: d.delV, startRobMgo: d.delM } }}
          borRobV={borRob.v}
          borRobM={borRob.m}
          isLast={true}
          cumulative={true}
          bodCharged={true}
          ballastCarried={d.ballast}
          borReversedToHere={d.bunkerCredit}
          priorOffHireDays={0}
          mode="charterers"
          onSave={(recapPatch, entryPatch) => {
            setCharterDuplicate(d.id, {
              hirePerDay: recapPatch.charterHirePerDay ?? d.hirePerDay,
              adcom: recapPatch.adcom ?? d.adcom,
              brokerage: recapPatch.brokerage ?? d.brokerage,
              foPrice: recapPatch.foPrice ?? d.foPrice,
              doPrice: recapPatch.doPrice ?? d.doPrice,
              cve: recapPatch.cve ?? d.cve,
              ilohc: recapPatch.ilohc ?? d.ilohc,
              ballastBonus: recapPatch.ballastBonus ?? d.ballastBonus,
              delV: recapPatch.etaPlan?.startRobVlsfo ?? d.delV,
              delM: recapPatch.etaPlan?.startRobMgo ?? d.delM,
              from: entryPatch.from ?? d.from,
              to: entryPatch.to ?? d.to,
              offHireEvents: entryPatch.offHire ?? d.offHireEvents,
              ballast: entryPatch.ballast ?? d.ballast,
              jointOn: entryPatch.jointOn ?? d.jointOn,
              jointOff: entryPatch.jointOff ?? d.jointOff,
              ilohcOn: entryPatch.ilohcOn ?? d.ilohcOn,
              borV: entryPatch.borV ?? d.borV,
              borM: entryPatch.borM ?? d.borM,
              borFo: entryPatch.borFo ?? d.borFo,
              borDo: entryPatch.borDo ?? d.borDo,
              extraExpenses: entryPatch.extraExpenses ?? d.extraExpenses,
            });
          }}
          onClose={() => setCharterDupSoaId(null)}
        />
      );
    })()}
    {soaRow !== null && rows[soaRow] && (
      <HireSoaModal
        key={rows[soaRow].key}
        row={rows[soaRow]}
        entry={stateOf(rows[soaRow].key)}
        allRows={rows}
        claims={settlement.claims}
        recap={recap}
        borRobV={borRob.v}
        borRobM={borRob.m}
        isLast={soaRow === rows.length - 1}
        cumulative={true}
        bodCharged={bunkerPayIdx >= 0 && soaRow >= bunkerPayIdx}
        ballastCarried={ballastPayIdx >= 0 && soaRow >= ballastPayIdx}
        borReversedToHere={rows[soaRow].bunkerCredit}
        priorOffHireDays={rows.slice(0, soaRow).reduce((s, r) => s + r.offHire, 0)}
        onSave={(recapPatch, entryPatch) => {
          const key = rows[soaRow].key;
          setRecap((r) => {
            let next = { ...r, ...recapPatch };
            if (recapPatch.foPrice !== undefined || recapPatch.doPrice !== undefined) next = applyGlobalBunkerPrices(next, next.foPrice, next.doPrice);
            return { ...next, hirePayState: { ...next.hirePayState, [key]: { ...stateOfRaw(r, key), ...entryPatch } } };
          });
        }}
        onClose={() => setSoaRow(null)}
      />
    )}
    {charterSoaRow !== null && charterRows[charterSoaRow] && (
      <HireSoaModal
        key={`charter-${charterRows[charterSoaRow].key}`}
        row={charterRows[charterSoaRow]}
        entry={charterStateOf(charterRows[charterSoaRow].key)}
        allRows={charterRows}
        claims={settlement.claims}
        recap={recap}
        borRobV={borRob.v}
        borRobM={borRob.m}
        isLast={charterSoaRow === charterRows.length - 1}
        cumulative={true}
        bodCharged={charterBunkerPayIdx >= 0 && charterSoaRow >= charterBunkerPayIdx}
        ballastCarried={charterBallastPayIdx >= 0 && charterSoaRow >= charterBallastPayIdx}
        borReversedToHere={charterRows[charterSoaRow].bunkerCredit}
        priorOffHireDays={charterRows.slice(0, charterSoaRow).reduce((s, r) => s + r.offHire, 0)}
        mode="charterers"
        onSave={(recapPatch, entryPatch) => {
          const key = charterRows[charterSoaRow].key;
          setRecap((r) => {
            let next = { ...r, ...recapPatch };
            if (recapPatch.foPrice !== undefined || recapPatch.doPrice !== undefined) next = applyGlobalBunkerPrices(next, next.foPrice, next.doPrice);
            return { ...next, charterHirePayState: { ...next.charterHirePayState, [key]: { ...charterStateOfRaw(r, key), ...entryPatch } } };
          });
        }}
        onClose={() => setCharterSoaRow(null)}
      />
    )}
    {openClaim && (
      <ClaimModal
        row={openClaim}
        onSave={(patch) => saveClaim(openClaim.id, patch)}
        onDelete={() => {
          setSettlement({ claims: settlement.claims.filter((x) => x.id !== openClaim.id) });
          setSelClaims((prev) => { const n = new Set(prev); n.delete(openClaim.id); return n; });
          setClaimId(null);
        }}
        onClose={() => setClaimId(null)}
      />
    )}
    {claimStatusOpen && (
      <StatusPickerModal
        title="Update Claim Status"
        options={STATUS_OPTIONS_CLAIMS}
        value={claimStatusValue}
        onChange={setClaimStatusValue}
        onApply={applyClaimStatus}
        onClose={() => setClaimStatusOpen(false)}
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
  ownersClaimIds: string[];
  jointOn: string; jointOff: string;
  ilohcOn: boolean; ballastOn: boolean;
}

/** Statement of Account — detailed hire calculation for one installment. */
/**
 * Standalone Claims & Expenses card — used by both Operations (HireTab)
 * and Postfix. Reads/writes `recap.freightLaytime.settlement.claims`.
 */
export function OpsClaimsCard({ recap, setRecap, voyage }: { recap: Recap; setRecap: Dispatch<SetStateAction<Recap>>; voyage: Voyage }) {
  const stored = recap.freightLaytime;
  const valid = !!stored && Array.isArray(stored.invoices) && Array.isArray(stored.laytimes);
  const fl = valid ? (stored as FreightLaytimeData) : seedFreightLaytime(recap);
  const seededSettlement = useMemo(() => seedFreightSettlement(voyage, recap), [voyage.id, voyage.portFrom, voyage.portTo, recap.loadPort, recap.dischargePort]);
  const settlement = fl.settlement ?? seededSettlement;
  const setFL = (patch: Partial<FreightLaytimeData>) =>
    setRecap((r) => {
      const cur = (r.freightLaytime && Array.isArray(r.freightLaytime.invoices) && Array.isArray(r.freightLaytime.laytimes))
        ? r.freightLaytime : seedFreightLaytime(r);
      return { ...r, freightLaytime: { ...cur, ...patch } };
    });
  const setSettlement = (patch: Partial<FreightSettlementData>) => setFL({ settlement: { ...settlement, ...patch } });

  useEffect(() => {
    if (!valid || !fl.settlement) {
      setRecap((r) => {
        const cur = (r.freightLaytime && Array.isArray(r.freightLaytime.invoices) && Array.isArray(r.freightLaytime.laytimes))
          ? r.freightLaytime : seedFreightLaytime(r);
        return { ...r, freightLaytime: { ...cur, settlement: cur.settlement ?? seededSettlement } };
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, fl.settlement, seededSettlement]);

  const [selClaims, setSelClaims] = useState<Set<string>>(new Set());
  const [claimId, setClaimId] = useState<string | null>(null);
  const [claimStatusOpen, setClaimStatusOpen] = useState(false);
  const [claimStatusValue, setClaimStatusValue] = useState('Under Review');
  const fmtAmt = (n: number) => n.toLocaleString('en-US');
  const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const openFirstSelected = (ids: Set<string>) => Array.from(ids)[0] ?? null;

  const addClaim = () => {
    const row: ClaimRow = { id: uid('clm'), type: '', reference: '', chargeTo: '', owner: '', due: '', currency: 'USD', amount: 0, settlement: 0, status: 'Raised', attachments: [] };
    setSettlement({ claims: [...settlement.claims, row] });
    setClaimId(row.id);
  };
  const saveClaim = (id: string, patch: Partial<ClaimRow>) => setSettlement({ claims: settlement.claims.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const deleteSelClaims = () => { setSettlement({ claims: settlement.claims.filter((x) => !selClaims.has(x.id)) }); setSelClaims(new Set()); };
  const copySelClaims = () => { setSettlement({ claims: [...settlement.claims, ...settlement.claims.filter((x) => selClaims.has(x.id)).map((x) => ({ ...x, id: uid('clm'), status: 'Raised' }))] }); setSelClaims(new Set()); };
  const updateSelClaimStatus = () => { setClaimStatusValue('Under Review'); setClaimStatusOpen(true); };
  const applyClaimStatus = () => { setSettlement({ claims: settlement.claims.map((x) => (selClaims.has(x.id) ? { ...x, status: claimStatusValue } : x)) }); setClaimStatusOpen(false); };
  const pdfSelClaims = () => {
    const rowsSel = settlement.claims.filter((x) => selClaims.has(x.id));
    if (rowsSel.length === 0) return;
    const body = rowsSel.map((r) => `<tr><td>${esc(r.type)}</td><td>${esc(r.reference)}</td><td>${esc(claimChargeTo(r))}</td><td class="r">${fmtAmt(r.amount)}</td><td class="r">${fmtAmt(r.settlement)}</td><td class="r">${fmtAmt(r.amount - r.settlement)}</td><td>${esc(r.status)}</td></tr>`).join('');
    printSections(`Claims — ${recap.vesselName}`, `<section><h1>Claims</h1><table><thead><tr><th>Type</th><th>Reference</th><th>Charge To</th><th class="r">Amount</th><th class="r">Settlement</th><th class="r">Balance</th><th>Status</th></tr></thead><tbody>${body}</tbody></table></section>`);
  };
  const openClaim = settlement.claims.find((x) => x.id === claimId) ?? null;

  return (
    <>
      <Card
        title="Claims & Expenses"
        icon="fa-gavel"
        wide
        right={(
          <span className="fv-ops__frl-secbtns">
            <button type="button" className="fv-ops__btn" onClick={addClaim}><i className="fas fa-plus" aria-hidden="true" /> New</button>
            <button type="button" className="fv-ops__btn" onClick={() => setClaimId(openFirstSelected(selClaims))} disabled={selClaims.size === 0}><i className="fas fa-pen" aria-hidden="true" /> Edit</button>
            <button type="button" className="fv-ops__btn" onClick={copySelClaims} disabled={selClaims.size === 0}><i className="fas fa-copy" aria-hidden="true" /> Copy</button>
            <button type="button" className="fv-ops__btn" onClick={deleteSelClaims} disabled={selClaims.size === 0}><i className="fas fa-trash" aria-hidden="true" /> Delete</button>
            <button type="button" className="fv-ops__btn" onClick={pdfSelClaims} disabled={selClaims.size === 0}><i className="fas fa-file-pdf" aria-hidden="true" /> Pdf</button>
            <button type="button" className="fv-ops__btn" onClick={updateSelClaimStatus} disabled={selClaims.size === 0}><i className="fas fa-rotate" aria-hidden="true" /> Status</button>
          </span>
        )}
      >
        <table className="fv-ops__table">
          <thead>
            <tr><th className="fv-ops__hire-selcol"><input type="checkbox" aria-label="Select all claims" checked={settlement.claims.length > 0 && settlement.claims.every((x) => selClaims.has(x.id))} ref={(el) => { if (el) el.indeterminate = selClaims.size > 0 && !settlement.claims.every((x) => selClaims.has(x.id)); }} onChange={(e) => setSelClaims(e.target.checked ? new Set(settlement.claims.map((x) => x.id)) : new Set())} /></th><th>Type</th><th>Reference</th><th>Charge To</th><th>Due</th><th className="fv-ops__r">Amount</th><th className="fv-ops__r">Settlement</th><th className="fv-ops__r">Balance</th><th>Attachment</th><th>Status</th></tr>
          </thead>
          <tbody>
            {settlement.claims.map((c) => {
              const settled = c.settlement || 0;
              const balance = c.amount - settled;
              return (
                <tr key={c.id}>
                  <td className="fv-ops__hire-selcol"><input type="checkbox" aria-label={`Select ${c.reference || 'claim'}`} checked={selClaims.has(c.id)} onChange={() => setSelClaims((prev) => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} /></td>
                  <td><button type="button" className="fv-ops__hire-namebtn" onClick={() => setClaimId(c.id)}>{c.type || 'Open'}</button></td>
                  <td>{c.reference}</td>
                  <td>{claimChargeTo(c) || '—'}</td>
                  <td>{c.due || '—'}</td>
                  <td className="fv-ops__r">{fmtAmt(c.amount)}</td>
                  <td className="fv-ops__r">{fmtAmt(settled)}</td>
                  <td className={`fv-ops__r${balance > 0 ? ' fv-ops__neg' : ' fv-ops__pos'}`}>{fmtAmt(balance)}</td>
                  <td>{attachmentStatusLabel(c.attachments)}</td>
                  <td><span className={`fv-ops__pill fv-ops__pill--${c.workflowStatus === 'Paid & Locked' || c.status === 'Settled' ? 'green' : 'amber'}`}>{c.workflowStatus || c.status}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      {openClaim && (
        <ClaimModal
          row={openClaim}
          onSave={(patch) => saveClaim(openClaim.id, patch)}
          onDelete={() => { setSettlement({ claims: settlement.claims.filter((x) => x.id !== openClaim.id) }); setSelClaims((prev) => { const n = new Set(prev); n.delete(openClaim.id); return n; }); setClaimId(null); }}
          onClose={() => setClaimId(null)}
        />
      )}
      {claimStatusOpen && (
        <StatusPickerModal
          title="Update Claim Status"
          options={STATUS_OPTIONS_CLAIMS}
          value={claimStatusValue}
          onChange={setClaimStatusValue}
          onApply={applyClaimStatus}
          onClose={() => setClaimStatusOpen(false)}
        />
      )}
    </>
  );
}

function HireSoaModal({ row, entry, allRows, claims, recap, borRobV, borRobM, isLast, cumulative, bodCharged, ballastCarried, borReversedToHere, priorOffHireDays, mode = 'owners', onSave, onClose }: {
  row: { key: string; name: string; from: Date | null; to: Date | null; onHire: number; offHire: number; amount: number; ballast: boolean; status: string; bunkers: number; bunkerCredit: number; cumulativeAmountDue?: number; cumulativeIlohc?: number; cumulativeJointOn?: number; cumulativeJointOff?: number; cumulativeExtrasOwners?: number; cumulativeExtrasCharterers?: number; cumulativeExtrasList?: ExtraExpense[]; cumulativeOffHireEvents?: OffHireRow[] };
  entry: HirePayEntry;
  allRows: { key: string; name: string; amount: number; status: string }[];
  claims: ClaimRow[];
  recap: Recap; borRobV: number; borRobM: number; isLast: boolean; cumulative: boolean; bodCharged: boolean; ballastCarried: boolean; borReversedToHere: number; priorOffHireDays: number;
  mode?: 'owners' | 'charterers';
  onSave: (recapPatch: Partial<Recap>, entryPatch: Partial<HirePayEntry>) => void;
  onClose: () => void;
}) {
  const p2 = (n: number) => String(n).padStart(2, '0');
  const dmyOf = (d: Date | null) => (d ? `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}` : '');
  const fmtDT = (d: Date | null) => (d ? dmyOf(d) : '—');
  const toInput = (d: Date | null) => (d ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}` : '');
  const inputToDmy = (iso: string) => { const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/); return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}` : ''; };
  const today = new Date();
  const isCharterMode = mode === 'charterers';
  const cpCounterparty = isCharterMode ? (recap.charterers || '—') : (recap.owners || '—');
  const cpDate = isCharterMode ? (recap.charterersCpDate || recap.cpDate || '—') : (recap.cpDate || '—');

  const mk = (): SoaDraft => ({
    hirePerDay: isCharterMode ? (recap.charterHirePerDay || recap.hirePerDay) : recap.hirePerDay, adcom: recap.adcom, brokerage: recap.brokerage,
    foPrice: recap.foPrice, doPrice: recap.doPrice, cve: recap.cve, ilohc: recap.ilohc,
    ballastBonus: recap.ballastBonus,
    delV: recap.etaPlan.startRobVlsfo, delM: recap.etaPlan.startRobMgo,
    borV: entry.borV ?? '', borM: entry.borM ?? '', borFo: entry.borFo ?? '', borDo: entry.borDo ?? '',
    // Interim hires always start from clause-computed row dates; only a LOCKED hire (Sent For
    // Payment / Paid & Locked) may have a user-saved actual redelivery time stored in entry.from/to
    // — a Draft hire's saved from/to (if any, e.g. leftover from an earlier edit) must not override
    // the live, clause-computed dates.
    from: (hireLocked(row.status as HireStatus) ? entry.from : null) ?? dmyOf(row.from),
    to: (hireLocked(row.status as HireStatus) ? entry.to : null) ?? dmyOf(row.to),
    offHire: entry.offHire ?? [], extras: entry.extraExpenses ?? [],
    ownersClaimIds: entry.ownersClaimIds ?? [],
    // Joint Survey starts out showing the cascaded total inherited from earlier hires (not 0) —
    // this hire hasn't set its own override yet, so it's just carrying the prior value forward.
    jointOn: entry.jointOn ?? String(row.cumulativeJointOn ?? 0), jointOff: entry.jointOff ?? String(row.cumulativeJointOff ?? 0),
    ilohcOn: entry.ilohcOn ?? isLast, ballastOn: row.ballast,
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SoaDraft>(mk);
  const setD = (patch: Partial<SoaDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const offRows = draft.offHire;
  const setOff = (i: number, patch: Partial<OffHireRow>) => setD({ offHire: offRows.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) });
  const addOff = () => setD({ offHire: [...offRows, { cat: OFFHIRE_CATS[0], from: '', to: '', pct: '100', remark: '', robStartV: '', robStartM: '', robEndV: '', robEndM: '' }] });
  // Derived from the `entry` PROP (the last-SAVED state), not the live `draft` — adding/removing
  // this hire's OWN off-hire events while editing must not shift how many of the cumulative list's
  // items count as "historical" (earlier hires'), or already-shown historical rows would
  // disappear/reappear mid-edit. `entry` only changes after a real Save (stable while editing,
  // refreshes correctly afterward — unlike a mount-frozen ref, which would go stale across repeat
  // saves in the same still-open popup session).
  const ownOffHireCount = entry.offHire?.length ?? 0;
  // Earlier hires' own off-hire events, carried forward here as a read-only reference (so this
  // hire's Statement of Off-Hire shows the full picture back to delivery, not just its own events).
  const historicalOffHire = (row.cumulativeOffHireEvents ?? []).slice(0, Math.max(0, (row.cumulativeOffHireEvents ?? []).length - ownOffHireCount));
  // Per-category daily consumption (VLSFO from main engine, MGO from aux) for off-hire bunkers.
  const mnCons = recap.etaPlan.perf.mainNormal;
  const snCons = recap.etaPlan.perf.subNormal;
  const foType = mnCons.type || 'VLSFO';
  const doType = snCons.type || 'MGO';
  // Auto ROB end = start − (category rate × off-hire time); a manual entry is used as-is (no % applied).
  const offBunker = (o: OffHireRow) => offHireBunker(recap.etaPlan.perf, o);
  // Cumulative bunker consumption across historical + this hire's own off-hire events.
  const offConsTotal = [...historicalOffHire, ...offRows].reduce((a, o) => { const b = offBunker(o); return { v: a.v + b.consV, m: a.m + b.consM }; }, { v: 0, m: 0 });
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
  // This hire's own period length (From → To), live-recomputed from the edited date — used only
  // for the "This Hire Period" reference line, distinct from the cumulative `onHire` above.
  const ownPeriodDays = periodFromD && toD ? Math.max(0, (toD.getTime() - periodFromD.getTime()) / 86_400_000) : row.onHire;
  const cumOffHire = cumulative ? priorOffHireDays + offTotal : offTotal;
  const nett = Math.max(0, onHire - cumOffHire);
  const perDay = num(draft.hirePerDay);
  const addrPct = num(draft.adcom);
  const brkgPct = num(draft.brokerage);
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

  // SIMPLIFIED METHODOLOGY: Hire (and everything derived from it — commission, CVE) is calculated
  // directly on NETT days (cumulative on-hire less cumulative off-hire) — no separate "gross then
  // deduct" step needed, since the off-hire time is already excluded up front.
  const hireAmtNett = perDay * nett;
  // While read-only, trust the schedule's own cascading carry-forward (`ballastCarried`, computed
  // from the main table's BB tick + ballastPayIdx — existing BB logic, untouched). While actively
  // editing, nothing's saved yet, so preview live from the draft's own checkbox/amount instead —
  // otherwise ticking/typing in the popup never moves the figures until after Save.
  const ballastOnEff = editing ? draft.ballastOn : ballastCarried;
  const bb = ballastOnEff ? num(draft.ballastBonus) : 0;
  const address = ((hireAmtNett + bb) * addrPct) / 100;
  const brokerage = (hireAmtNett * brkgPct) / 100;
  // Off-hire bunkers consumed (historical + this hire's own events), valued at CP price — the
  // ONLY off-hire deduction needed now that Hire/CVE are already nett-days-based above.
  const offBunkerCost = offConsTotal.v * foP + offConsTotal.m * doP;
  const cve = (num(draft.cve) / 30) * nett;
  const hireAmt = hireAmtNett;
  // Same editing-live-preview pattern as `bb` above — `row.cumulativeIlohc` is the schedule's own
  // cascading carry-forward (existing ILOHC logic, untouched) used while read-only; while editing,
  // preview live from the draft's own checkbox/amount so ticking/typing updates immediately.
  const ilohc = editing ? (draft.ilohcOn ? num(draft.ilohc) : 0) : (row.cumulativeIlohc ?? (draft.ilohcOn ? num(draft.ilohc) : 0));
  // Joint Survey is a single running figure, not additive: whichever hire last explicitly set its
  // own amount becomes the new total from that hire onward (`cumulativeJointOn`/`Off`, computed by
  // the schedule via override-cascade — see `cumulativeExtrasFor`), so editing it here only ever
  // affects this hire and later ones, never hires before it.
  const cumJointOn = editing ? num(draft.jointOn) : (row.cumulativeJointOn ?? num(draft.jointOn));
  const cumJointOff = editing ? num(draft.jointOff) : (row.cumulativeJointOff ?? num(draft.jointOff));
  const surveys = cumJointOn / 2 + cumJointOff / 2;

  // This hire's own editable "Other Expense" lines; earlier hires' lines are carried forward
  // below as read-only reference rows (not retroactively shown on hires before they existed).
  const extras = draft.extras;
  // Derived from the `entry` PROP — same reasoning as `ownOffHireCount` above, for Other Expenses.
  const ownExtrasCount = entry.extraExpenses?.length ?? 0;
  const historicalExtras = (row.cumulativeExtrasList ?? []).slice(0, Math.max(0, (row.cumulativeExtrasList ?? []).length - ownExtrasCount));
  const setExtra = (i: number, patch: Partial<ExtraExpense>) => setD({ extras: extras.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) });
  const addExtra = () => setD({ extras: [...extras, { desc: '', amount: '0', due: 'Owners' }] });
  const delExtra = (i: number) => setD({ extras: extras.filter((_, idx) => idx !== i) });
  const priorExtrasOwners = historicalExtras.reduce((s, e) => s + (e.due === 'Owners' ? num(e.amount) : 0), 0);
  const priorExtrasCharterers = historicalExtras.reduce((s, e) => s + (e.due !== 'Owners' ? num(e.amount) : 0), 0);
  const liveExtrasOwners = priorExtrasOwners + extras.reduce((s, e) => s + (e.due === 'Owners' ? num(e.amount) : 0), 0);
  const liveExtrasCharterers = priorExtrasCharterers + extras.reduce((s, e) => s + (e.due !== 'Owners' ? num(e.amount) : 0), 0);
  const extrasOwners = editing ? liveExtrasOwners : (row.cumulativeExtrasOwners ?? liveExtrasOwners);
  const extrasCharterers = editing ? liveExtrasCharterers : (row.cumulativeExtrasCharterers ?? liveExtrasCharterers);
  const claimRowsOwners = claims.filter((c) => draft.ownersClaimIds.includes(c.id) && claimForOwners(c));
  const claimsOwnersValue = claimRowsOwners.reduce((s, c) => s + claimOutstanding(c), 0);
  const ownerClaimsChoices = claims.filter((c) => claimForOwners(c));
  const ownerClaimChoicesUnselected = ownerClaimsChoices.filter((c) => !draft.ownersClaimIds.includes(c.id));
  const [ownerClaimPick, setOwnerClaimPick] = useState('');
  const addOwnerClaim = (id: string) => {
    if (!id || draft.ownersClaimIds.includes(id)) return;
    setD({ ownersClaimIds: [...draft.ownersClaimIds, id] });
    setOwnerClaimPick('');
  };
  const removeOwnerClaim = (id: string) => setD({ ownersClaimIds: draft.ownersClaimIds.filter((x) => x !== id) });

  // BOD counts on the OWNERS side only once charged (bodCharged, carried forward from that hire
  // onward); BOR credit (row.bunkerCredit) is likewise carried forward from the settle hire.
  const owners = hireAmt + bb + (bodCharged ? row.bunkers : 0) + cve + extrasOwners;
  // Off-hire bunkers consumed is a credit due to Charterers — the only off-hire deduction needed
  // now that Hire/CVE are already nett-days-based above (see "Off-Hire Bunkers" line item).
  const charterers = address + brokerage + row.bunkerCredit + ilohc + surveys + extrasCharterers + claimsOwnersValue + offBunkerCost;
  // While read-only, trust the schedule's own `row.cumulativeAmountDue`/`row.amount` as the single
  // source of truth (matches the main Hire Payment Schedule table exactly, no drift). While
  // actively editing, nothing's been saved yet, so these must recompute live from the draft
  // (hireTo/toD above) — otherwise an edited date never moves "Total Payable"/"Balance Due".
  const liveTotalPayable = owners - charterers;
  const totalPayable = editing ? liveTotalPayable : (row.cumulativeAmountDue ?? liveTotalPayable);

  // Current Hire Payable = the cumulative-then-deduct amount already computed by the schedule
  // (row.amount) — single source of truth, shared with the main Hire Payment Schedule table.
  const currentIndex = allRows.findIndex((x) => x.key === row.key);
  const priorRows = currentIndex > 0 ? allRows.slice(0, currentIndex) : [];
  const paidTotal = priorRows.reduce((s, x) => s + x.amount, 0);
  const balanceDue = editing ? totalPayable - paidTotal : row.amount;

  const save = () => {
    // Any hire — including the final/settlement one — only persists its "to" if the user
    // actually changed it here (flagged `toManual` so it isn't confused with stale/leftover
    // data, and so it correctly overrides the auto redelivery-snap on the final row too). The
    // schedule then shifts every later installment to follow from this new date, re-applying
    // the normal clause period length and BOR logic from there.
    const toEdited = draft.to !== dmyOf(row.to);
    const datePatch = toEdited ? { from: draft.from, to: draft.to, toManual: true } : {};
    // Joint Survey only persists an explicit override if the user actually changed it from the
    // cascaded value it was showing — otherwise every unrelated save (e.g. just the hire rate)
    // would freeze this hire with a spurious override and break the cascade for every later hire.
    const jointOnEdited = draft.jointOn !== (entry.jointOn ?? String(row.cumulativeJointOn ?? 0));
    const jointOffEdited = draft.jointOff !== (entry.jointOff ?? String(row.cumulativeJointOff ?? 0));
    const recapPatch = isCharterMode
      ? { charterHirePerDay: draft.hirePerDay, adcom: draft.adcom, brokerage: draft.brokerage, foPrice: draft.foPrice, doPrice: draft.doPrice, cve: draft.cve, ilohc: draft.ilohc, ballastBonus: draft.ballastBonus, etaPlan: { ...recap.etaPlan, startRobVlsfo: draft.delV, startRobMgo: draft.delM } }
      : { hirePerDay: draft.hirePerDay, adcom: draft.adcom, brokerage: draft.brokerage, foPrice: draft.foPrice, doPrice: draft.doPrice, cve: draft.cve, ilohc: draft.ilohc, ballastBonus: draft.ballastBonus, etaPlan: { ...recap.etaPlan, startRobVlsfo: draft.delV, startRobMgo: draft.delM } };
    onSave(
      recapPatch,
      {
        ...datePatch, offHire: draft.offHire, ballast: draft.ballastOn,
        jointOn: jointOnEdited ? draft.jointOn : entry.jointOn,
        jointOff: jointOffEdited ? draft.jointOff : entry.jointOff,
        ilohcOn: draft.ilohcOn, borV: draft.borV, borM: draft.borM, borFo: draft.borFo, borDo: draft.borDo, extraExpenses: draft.extras, ownersClaimIds: draft.ownersClaimIds,
      },
    );
    setEditing(false);
  };
  const discard = () => { setDraft(mk()); setEditing(false); };

  const exportPdf = () => {
    const w = window.open('', '_blank', 'width=900,height=1100');
    if (!w) return;
    const li = (no: number | string, desc: string, o: number, c: number) => `<tr><td>${no}</td><td>${desc}</td><td class="r">${o ? money(o) : ''}</td><td class="r">${c ? money(c) : ''}</td></tr>`;
    const body = [
      li(1, `Hire — ${fmt(nett, 2)} days (nett) × ${money(perDay)}/day`, hireAmt, 0),
      li(2, `Ballast Bonus (LSUM)${draft.ballastOn ? '' : ' — n/a'}`, bb, 0),
      li(3, `Address Commission @ ${fmt(addrPct, 3)}%`, 0, address),
      li(4, `Brokerage @ ${fmt(brkgPct, 3)}%`, 0, brokerage),
      li(5, `Bunker on Delivery — VLSFO ${fmt(delV, 2)}mt @ ${foP} · LSMGO ${fmt(delM, 2)}mt @ ${doP}${bodCharged ? '' : ' (charged on BOD hire)'}`, bodCharged ? row.bunkers : 0, 0),
      li(6, `Bunker on Redelivery — VLSFO ${fmt(borV, 2)}mt @ ${fmt(borFo, 2)} · LSMGO ${fmt(borM, 2)}mt @ ${fmt(borDo, 2)}${borCredited ? '' : ' (reversed on BOR hire)'}`, 0, row.bunkerCredit),
      li(7, `Off-Hire Bunkers — ${foType} ${fmt(offConsTotal.v, 2)}mt @ ${foP} · ${doType} ${fmt(offConsTotal.m, 2)}mt @ ${doP}`, 0, offBunkerCost),
      li(8, `Cable/Victualing/Entertainment — ${money(num(draft.cve))}/mo × ${fmt(nett, 2)}d (nett)`, cve, 0),
      li(9, `ILOHC${draft.ilohcOn ? '' : ' — n/a'}`, 0, ilohc),
      li(10, 'Joint On-Hire Survey (÷2)', 0, cumJointOn / 2),
      li(11, 'Joint Off-Hire Survey (÷2)', 0, cumJointOff / 2),
      ...historicalExtras.map((ex, i) => li(12 + i, `${ex.desc || 'Other expense'} · carried forward`, ex.due === 'Owners' ? num(ex.amount) : 0, ex.due !== 'Owners' ? num(ex.amount) : 0)),
      ...extras.map((ex, i) => li(12 + historicalExtras.length + i, ex.desc || 'Other expense', ex.due === 'Owners' ? num(ex.amount) : 0, ex.due !== 'Owners' ? num(ex.amount) : 0)),
      ...claimRowsOwners.map((c, i) => li(12 + historicalExtras.length + extras.length + i, `Claim (${claimChargeTo(c)}): ${c.reference || c.type || 'Claim'}`, 0, claimOutstanding(c))),
    ].join('');
    const allPriorHtml = priorRows.map((x) => `<tr><td>Less: ${x.name} — ${x.status}</td><td class="r">-${money(x.amount)}</td></tr>`).join('');
    // Statement of Off-Hire — same event rows + bunker ROB/consumed figures shown in the popup.
    // Time and bunker quantities only — the $ values are covered by the line items above.
    const offHireRowsHtml = offRows.length === 0
      ? `<tr><td colspan="6">No off-hire recorded.</td></tr>`
      : offRows.map((o) => {
          const b = offBunker(o);
          return `<tr><td>${o.cat}</td><td>${o.from || '—'}</td><td>${o.to || '—'}</td><td class="r">${o.pct}</td><td class="r">${fmt(offHireDays(o), 3)}</td><td>${o.remark || '—'}</td></tr>
            <tr class="rob"><td colspan="2">Bunker ROB — Start: ${foType} ${fmt(b.startV, 2)} · ${doType} ${fmt(b.startM, 2)}</td><td colspan="2">End: ${foType} ${fmt(b.endV, 2)} · ${doType} ${fmt(b.endM, 2)}</td><td colspan="2">Consumed: ${foType} ${fmt(b.consV, 2)} · ${doType} ${fmt(b.consM, 2)}</td></tr>`;
        }).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>SOA ${row.name} — ${recap.vesselName}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:28px;font-size:12px}
      h1{font-size:16px;margin:0 0 2px} h2{font-size:13px;margin:16px 0 2px} .sub{color:#555;margin:0 0 14px;font-size:11px}
      table{border-collapse:collapse;width:100%;margin:8px 0}
      th,td{border:1px solid #bbb;padding:4px 7px;text-align:left}
      th.r,td.r{text-align:right} tfoot td{font-weight:700;background:#f2f2f2}
      tr.rob td{color:#555;font-size:11px;background:#fafafa}
      .tot{font-size:13px}
    </style></head><body>${pdfCompanyHeader()}
      <h1>Statement of Account — ${row.name}</h1>
      <p class="sub">${recap.vesselName} · CP ${cpDate} · ${isCharterMode ? 'Charterers' : 'Owners'} ${cpCounterparty} · SOA ${p2(today.getDate())}-${p2(today.getMonth() + 1)}-${today.getFullYear()} · Status ${row.status}</p>
      <p class="sub">On-Hire ${fmtDT(fromD)} → ${fmtDT(toD)} · Days ${fmt(onHire, 2)} · Off-Hire ${fmt(offTotal, 2)} · Nett ${fmt(nett, 2)}</p>
      <table><thead><tr><th>No</th><th>Description</th><th class="r">Due Owners</th><th class="r">Due Charterers</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="2">Sum</td><td class="r">${money(owners)}</td><td class="r">${money(charterers)}</td></tr>
      <tr class="tot"><td colspan="2">Total Payable to Owners</td><td class="r" colspan="2">${money(totalPayable)}</td></tr></tfoot></table>
      <h2>Statement of Off-Hire</h2>
      <table><thead><tr><th>Category</th><th>From</th><th>To</th><th class="r">%</th><th class="r">Days</th><th>Remarks</th></tr></thead>
      <tbody>${offHireRowsHtml}</tbody>
      <tfoot><tr><td colspan="4">Total Off-Hire (A + B + C + D)</td><td class="r">${fmt(offTotal, 3)}d</td><td>Bunkers · ${foType} ${fmt(offConsTotal.v, 2)} · ${doType} ${fmt(offConsTotal.m, 2)}</td></tr></tfoot></table>
      <table><tbody><tr><td>Total Cumulative Amount Due</td><td class="r">${money(totalPayable)}</td></tr>${allPriorHtml}</tbody>
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
            <span className="fv-ops__soa-sub">{recap.vesselName} · {cpCounterparty} · CP {cpDate} · SOA {p2(today.getDate())}-{p2(today.getMonth() + 1)}-{today.getFullYear()} · <span className={`fv-ops__pill fv-ops__pill--${hireStatusPill(row.status as HireStatus)}`}>{row.status}</span>{editing && <span className="fv-ops__soa-editing"> · editing</span>}</span>
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
            {cumulative && <div><span>This Hire Period</span><b className="fv-ops__soa-muted">{fmtDT(periodFromD)} → {fmtDT(toD)} · {fmt(ownPeriodDays, 2)}d</b></div>}
          </div>

          <table className="fv-ops__soa-tbl">
            <thead>
              <tr><th>No</th><th>Description</th><th className="fv-ops__r">Due to Owners</th><th className="fv-ops__r">Due to Charterers</th></tr>
            </thead>
            <tbody>
              <tr><td>1</td><td>Hire — {fmt(nett, 2)} days (nett) × {editing ? nIn(draft.hirePerDay, (v) => setD({ hirePerDay: v })) : money(perDay)}/day</td><td className="fv-ops__r">{money(hireAmtNett)}</td><td className="fv-ops__r" /></tr>
              <tr><td>2</td><td><label className="fv-ops__soa-chk"><input type="checkbox" checked={draft.ballastOn} disabled={!editing} onChange={(e) => setD({ ballastOn: e.target.checked })} /> Ballast Bonus (LSUM)</label> {editing && nIn(draft.ballastBonus, (v) => setD({ ballastBonus: v }))}</td><td className="fv-ops__r">{oCol(bb)}</td><td className="fv-ops__r" /></tr>
              <tr><td>3</td><td>Address Commission @ {editing ? nIn(draft.adcom, (v) => setD({ adcom: v }), 56) : fmt(addrPct, 3)}%</td><td className="fv-ops__r" /><td className="fv-ops__r">{cCol(address)}</td></tr>
              <tr><td>4</td><td>Brokerage @ {editing ? nIn(draft.brokerage, (v) => setD({ brokerage: v }), 56) : fmt(brkgPct, 3)}%</td><td className="fv-ops__r" /><td className="fv-ops__r">{cCol(brokerage)}</td></tr>
              <tr><td>5</td><td>Bunker on Delivery — VLSFO {editing ? nIn(draft.delV, (v) => setD({ delV: v }), 64) : `${fmt(delV, 2)}mt`} @ {editing ? nIn(draft.foPrice, (v) => setD({ foPrice: v }), 60) : foP} · LSMGO {editing ? nIn(draft.delM, (v) => setD({ delM: v }), 64) : `${fmt(delM, 2)}mt`} @ {editing ? nIn(draft.doPrice, (v) => setD({ doPrice: v }), 60) : doP}{!bodCharged ? <span className="fv-ops__soa-muted"> · charged on the BOD hire</span> : ''}</td><td className="fv-ops__r">{oCol(bodCharged ? row.bunkers : 0)}</td><td className="fv-ops__r" /></tr>
              <tr><td>6</td><td>Bunker on Redelivery — VLSFO {editing ? nIn(draft.borV.trim() !== '' ? draft.borV : fmt(borRobV, 2), (v) => setD({ borV: v }), 64) : `${fmt(borV, 2)}mt`} @ {editing ? nIn(draft.borFo.trim() !== '' ? draft.borFo : fmt(foP, 2), (v) => setD({ borFo: v }), 60) : fmt(borFo, 2)} · LSMGO {editing ? nIn(draft.borM.trim() !== '' ? draft.borM : fmt(borRobM, 2), (v) => setD({ borM: v }), 64) : `${fmt(borM, 2)}mt`} @ {editing ? nIn(draft.borDo.trim() !== '' ? draft.borDo : fmt(doP, 2), (v) => setD({ borDo: v }), 60) : fmt(borDo, 2)}{!borCredited ? <span className="fv-ops__soa-muted"> · reversed nearer redelivery</span> : (bunkRedelivery < borFullValue - 0.01 ? <span className="fv-ops__soa-muted"> · {money(bunkRedelivery)} of {money(borFullValue)} reversed to date</span> : '')}</td><td className="fv-ops__r" /><td className="fv-ops__r">{cCol(row.bunkerCredit)}</td></tr>
              <tr><td>7</td><td>Off-Hire Bunkers — {foType} {fmt(offConsTotal.v, 2)}mt @ {foP} · {doType} {fmt(offConsTotal.m, 2)}mt @ {doP}</td><td className="fv-ops__r" /><td className="fv-ops__r">{cCol(offBunkerCost)}</td></tr>
              <tr><td>8</td><td>Cable / Victualing / Entertainment — {editing ? nIn(draft.cve, (v) => setD({ cve: v })) : money(num(draft.cve))}/mo × {fmt(nett, 2)}d (nett)</td><td className="fv-ops__r">{oCol(cve)}</td><td className="fv-ops__r" /></tr>
              <tr><td>9</td><td><label className="fv-ops__soa-chk"><input type="checkbox" checked={draft.ilohcOn} disabled={!editing} onChange={(e) => setD({ ilohcOn: e.target.checked })} /> ILOHC</label> {editing && nIn(draft.ilohc, (v) => setD({ ilohc: v }))}</td><td className="fv-ops__r" /><td className="fv-ops__r">{cCol(ilohc)}</td></tr>
              <tr><td>10</td><td>Joint On-Hire Survey (÷2) {editing ? nIn(draft.jointOn, (v) => setD({ jointOn: v })) : money(cumJointOn)}</td><td className="fv-ops__r" /><td className="fv-ops__r">{cCol(cumJointOn / 2)}</td></tr>
              <tr><td>11</td><td>Joint Off-Hire Survey (÷2) {editing ? nIn(draft.jointOff, (v) => setD({ jointOff: v })) : money(cumJointOff)}</td><td className="fv-ops__r" /><td className="fv-ops__r">{cCol(cumJointOff / 2)}</td></tr>
              {historicalExtras.map((ex, i) => (

                <tr key={`hex-${i}`}>
                  <td>{12 + i}</td>
                  <td>{ex.desc || 'Other expense'} <span className="fv-ops__soa-muted">· carried forward</span></td>
                  <td className="fv-ops__r">{ex.due === 'Owners' ? oCol(num(ex.amount)) : ''}</td>
                  <td className="fv-ops__r">{ex.due !== 'Owners' ? cCol(num(ex.amount)) : ''}</td>
                </tr>
              ))}
              {extras.map((ex, i) => (
                <tr key={`ex-${i}`}>
                  <td>{12 + historicalExtras.length + i}</td>
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
              {claimRowsOwners.map((c, i) => (
                <tr key={`clm-own-${c.id}`}>
                  <td>{12 + historicalExtras.length + extras.length + i}</td>
                  <td>
                    Claim ({claimChargeTo(c)}): {c.reference || c.type || 'Claim'}
                    {editing && (
                      <button type="button" className="fv-ops__bnk-rm" aria-label="Remove linked claim" onClick={() => removeOwnerClaim(c.id)}>
                        <i className="fas fa-xmark" aria-hidden="true" />
                      </button>
                    )}
                  </td>
                  <td className="fv-ops__r" />
                  <td className="fv-ops__r">{money(claimOutstanding(c))}</td>
                </tr>
              ))}
              {editing && (
                <tr>
                  <td />
                  <td colSpan={3}>
                    <button type="button" className="fv-ops__btn fv-ops__soa-add" onClick={addExtra}><i className="fas fa-plus" aria-hidden="true" /> Add expense</button>
                    <span className="fv-ops__soa-extra" style={{ marginLeft: 8 }}>
                      <select className="fv-ops__eta-sel" value={ownerClaimPick} onChange={(e) => setOwnerClaimPick(e.target.value)}>
                        <option value="">Link Owners claim…</option>
                        {ownerClaimChoicesUnselected.map((c) => (
                          <option key={c.id} value={c.id}>{`${c.reference || c.type || 'Claim'} · ${money(claimOutstanding(c))}`}</option>
                        ))}
                      </select>
                      <button type="button" className="fv-ops__btn fv-ops__soa-add" disabled={!ownerClaimPick} onClick={() => addOwnerClaim(ownerClaimPick)}>
                        <i className="fas fa-link" aria-hidden="true" /> Add Claim
                      </button>
                    </span>
                  </td>
                </tr>
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
            <table className="fv-ops__soa-tbl fv-ops__soa-tbl--offhire">
              <thead>
                <tr><th>Category</th><th>From</th><th>To</th><th className="fv-ops__r">%</th><th className="fv-ops__r">Days</th><th>Remarks</th>{editing && <th aria-label="Remove" />}</tr>
              </thead>
              <tbody>
                {historicalOffHire.length === 0 && offRows.length === 0 && <tr><td colSpan={editing ? 7 : 6} className="fv-ops__vd-empty">No off-hire recorded.{editing ? ' Use “Event” to add working / idle / sea / weather off-hire.' : ''}</td></tr>}
                {historicalOffHire.map((o, i) => {
                  const b = offBunker(o);
                  return (
                  <Fragment key={`hoff-${i}`}>
                  <tr>
                    <td>{o.cat} <span className="fv-ops__soa-muted">· carried forward</span></td>
                    <td>{o.from || '—'}</td>
                    <td>{o.to || '—'}</td>
                    <td className="fv-ops__r">{o.pct}</td>
                    <td className="fv-ops__r fv-ops__stw-calc">{fmt(offHireDays(o), 3)}</td>
                    <td>{o.remark || '—'}</td>
                    {editing && <td />}
                  </tr>
                  <tr className="fv-ops__soa-robrow">
                    <td className="fv-ops__soa-roblbl">Bunker ROB</td>
                    <td className="fv-ops__soa-robcell"><span className="fv-ops__soa-robsub">Start</span> {foType} {fmt(b.startV, 2)} · {doType} {fmt(b.startM, 2)}</td>
                    <td className="fv-ops__soa-robcell"><span className="fv-ops__soa-robsub">End</span> {foType} {fmt(b.endV, 2)} · {doType} {fmt(b.endM, 2)}</td>
                    <td colSpan={editing ? 4 : 3} className="fv-ops__soa-muted">Consumed · {foType} {fmt(b.consV, 2)} · {doType} {fmt(b.consM, 2)}</td>
                  </tr>
                  </Fragment>
                  );
                })}
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
                <tr className="fv-ops__soa-sum"><td colSpan={editing ? 7 : 6}><div className="fv-ops__soa-offsum"><span>Total Off-Hire (A + B + C + D)</span><span className="fv-ops__soa-offsum-d">{fmt(cumOffHire, 3)} days</span><span className="fv-ops__soa-offsum-b">Bunkers · {foType} {fmt(offConsTotal.v, 2)} · {doType} {fmt(offConsTotal.m, 2)}</span></div></td></tr>
              </tfoot>
            </table>
          </div>

          {/* Balance due to owners — full cumulative amount from Delivery to this hire's own end,
              less all previously-paid hires, leaving just this period's own new amount */}
          <div className="fv-ops__soa-section">
            <div className="fv-ops__vd-sub-head"><i className="fas fa-scale-balanced" aria-hidden="true" /> Balance Due to Owners</div>
              <table className="fv-ops__soa-tbl fv-ops__soa-prior">
                <tbody>
                  <tr className="fv-ops__soa-sum"><td>Total Cumulative Amount Due</td><td className="fv-ops__r">{money(totalPayable)}</td></tr>
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

function buildHireCashflowRows({
  days,
  perDay,
  dedPct,
  firstPeriod,
  everyPeriod,
  label,
  start,
  dueBank,
  banking,
  idBase,
}: {
  days: number;
  perDay: number;
  dedPct: number;
  firstPeriod: number;
  everyPeriod: number;
  label: string;
  start: Date | null;
  dueBank: number;
  banking: boolean;
  idBase: string;
}): CashflowRow[] {
  const rows: CashflowRow[] = [];
  let covered = 0;
  let n = 1;
  while (covered < days - 0.01 && n <= 60) {
    const d = Math.min(n === 1 ? firstPeriod : everyPeriod, days - covered);
    // Due date mirrors the hire schedule: 1st installment payable within `dueBank`
    // days of delivery, each subsequent one in advance at the start of its period.
    let date = '';
    if (start) {
      const from = addDaysDate(start, covered);
      const duePre = n === 1 ? (banking ? addBankingDaysDate(start, dueBank) : addDaysDate(start, dueBank)) : from;
      const due = banking ? moveOffWeekendDate(duePre) : duePre;
      date = fmtShortDate(due);
    }
    rows.push({
      id: `${idBase}-${n}`,
      date,
      label: `${ordinal(n)} ${label}`,
      amount: String(Math.round(perDay * d * (1 - dedPct / 100))),
    });
    covered += d;
    n += 1;
  }
  return rows;
}

/** Build the estimated voyage cash flow (receivables + payables) from the recap figures. */
function seedCashflow(recap: Recap): CashflowData {
  const pnl = computePnl(recap);
  const voyageType = (recap.voyageFixType || '').toUpperCase();
  const [inType = '', outType = ''] = voyageType.split('-');
  const inIsTime = inType === 'TCIN' || inType === 'TCTIN';
  const outIsTime = outType === 'TCOUT' || outType === 'TCTOUT';
  const outIsVoyage = outType === 'VOUT';

  const start = parseDMY(recap.deliveryDateTime);
  const redelivery = parseDMY(recap.redeliveryDateTime);

  // Port-call arrival & completion dates from the itinerary (completion = arrival + port days).
  const legs = recap.etaPlan?.legs ?? [];
  const computed = projectEtaLegs(recap.etaPlan);
  const norm = (s: string) => (s || '').trim().toLowerCase();
  const portCall = (pred: (l: EtaLeg) => boolean): { arr: Date | null; complete: Date | null } => {
    for (let i = 0; i < legs.length; i += 1) {
      if (legs[i].kind === 'port' && pred(legs[i])) {
        const a = computed[i]?.arr ?? null;
        return { arr: a, complete: a ? addDaysDate(a, num(legs[i].portDays)) : null };
      }
    }
    return { arr: null, complete: null };
  };
  const findCall = (typeRe: RegExp, portName: string) => {
    const byType = portCall((l) => typeRe.test(l.type || ''));
    return byType.arr ? byType : portCall((l) => norm(l.to) === norm(portName));
  };
  const loadCall = findCall(/load/i, recap.loadPort);
  const dischCall = findCall(/disch/i, recap.dischargePort);
  const bunkerCall = (() => { const b = portCall((l) => num(l.supVlsfo) + num(l.supMgo) > 0); return b.arr ? b : loadCall; })();

  // Actual data (invoice due dates, PDA due dates, laytime completion) takes precedence;
  // the itinerary-based rules below are used only as fallbacks when it isn't available yet.
  const invoices = recap.freightLaytime?.invoices ?? [];
  const pdaRows = recap.freightLaytime?.settlement?.pda ?? [];
  const pdaDueFor = (portName: string) => {
    const hit = pdaRows.find((p) => p.due && norm(p.port) === norm(portName));
    return hit?.due || '';
  };
  const freightInvDue = invoices.find((i) => i.kind === 'Freight' && i.dueDate)?.dueDate || '';
  const demInvDue = invoices.find((i) => i.kind === 'Demurrage' && i.dueDate)?.dueDate || '';
  const dischCompletedActual = parseFlexibleDate(recap.freightLaytime?.laytimes?.find((p) => p.op === 'Discharge' && p.completed)?.completed || '');

  const freightDue = freightInvDue || computeFreightDue(recap);
  // Port DA — actual PDA due date if entered, else remitted ~2 days before the vessel's ETA.
  const loadDaDate = pdaDueFor(recap.loadPort) || (loadCall.arr ? fmtShortDate(addDaysDate(loadCall.arr, -2)) : '');
  const dischDaDate = pdaDueFor(recap.dischargePort) || (dischCall.arr ? fmtShortDate(addDaysDate(dischCall.arr, -2)) : '');
  // Bunkers are settled ~30 days after the supply (stem) date.
  const bunkerDate = bunkerCall.arr ? fmtShortDate(addDaysDate(bunkerCall.arr, 30)) : '';
  // Demurrage — actual invoice due date, else within 15 days of (actual) completion of discharge.
  const demComplete = dischCompletedActual || dischCall.complete;
  const demDate = demInvDue || (demComplete ? fmtShortDate(addDaysDate(demComplete, 15)) : freightDue);

  const receivables: CashflowRow[] = [];
  if (outIsVoyage) {
    receivables.push({ id: 'cf-freight', date: freightDue, label: `Freight (${recap.charterers || 'Charterers'})`, amount: String(Math.round(pnl.freight)) });
  }
  if (outIsTime) {
    const charterHd = num(recap.charterHirePerDay || recap.hirePerDay);
    const dedPct = num(recap.adcom) + num(recap.brokerage);
    const first = Math.max(1, num(recap.charterFirstHirePeriodDays) || 15);
    const every = Math.max(1, num(recap.charterHireEveryDays) || 15);
    receivables.push(
      ...buildHireCashflowRows({
        days: pnl.days,
        perDay: charterHd,
        dedPct,
        firstPeriod: first,
        everyPeriod: every,
        label: 'Sub-Hire',
        start,
        dueBank: Math.max(0, num(recap.charterFirstHireDays) || 3),
        banking: /banking/i.test(recap.charterFirstHireBasis || 'Banking Days'),
        idBase: 'cf-subhire',
      }),
    );
  }
  if (outIsVoyage && pnl.demDespatch > 0) receivables.push({ id: 'cf-demurrage', date: demDate, label: 'Demurrage', amount: String(Math.round(pnl.demDespatch)) });
  if (pnl.miscIncome > 0) receivables.push({ id: 'cf-misc', date: '', label: 'Misc Income', amount: String(Math.round(pnl.miscIncome)) });

  const payables: CashflowRow[] = [];
  let lastHireDate = '';
  if (inIsTime) {
    const hd = num(recap.hirePerDay);
    const dedPct = num(recap.adcom) + num(recap.brokerage);
    const first = Math.max(1, num(recap.firstHirePeriodDays) || 15);
    const every = Math.max(1, num(recap.hireEveryDays) || 15);
    const hireRows = buildHireCashflowRows({
      days: pnl.days,
      perDay: hd,
      dedPct,
      firstPeriod: first,
      everyPeriod: every,
      label: 'Hire',
      start,
      dueBank: Math.max(0, num(recap.firstHireDays) || 3),
      banking: /banking/i.test(recap.firstHireBasis || 'Banking Days'),
      idBase: 'cf-hire',
    });
    payables.push(...hireRows);
    lastHireDate = hireRows.length ? hireRows[hireRows.length - 1].date : '';
  }
  // CVE & ILOHC settle together with the final hire payment (else on redelivery).
  const cveIlohcDate = lastHireDate || (redelivery ? fmtShortDate(redelivery) : (start ? fmtShortDate(start) : ''));
  if (pnl.portLoad > 0) payables.push({ id: 'cf-load-da', date: loadDaDate, label: 'Load Port DA', amount: String(Math.round(pnl.portLoad)) });
  if (pnl.portDisch > 0) payables.push({ id: 'cf-disch-da', date: dischDaDate, label: 'Disch Port DA', amount: String(Math.round(pnl.portDisch)) });
  if (pnl.bunkerCost > 0) payables.push({ id: 'cf-bunker', date: bunkerDate, label: 'Bunker Payment', amount: String(Math.round(pnl.bunkerCost)) });
  if (pnl.cveTotal > 0) payables.push({ id: 'cf-cve', date: cveIlohcDate, label: 'C.V.E.', amount: String(Math.round(pnl.cveTotal)) });
  if (pnl.ilohc > 0) payables.push({ id: 'cf-ilohc', date: cveIlohcDate, label: 'ILOHC', amount: String(Math.round(pnl.ilohc)) });
  if (pnl.otherCost > 0) payables.push({ id: 'cf-other', date: '', label: 'Other Cost', amount: String(Math.round(pnl.otherCost)) });

  // Settlement invoices the user has added: agent invoices, broker/vendor service
  // invoices, and claims — each an expected payment (outstanding balance + due date).
  payables.push(...settlementCashflowRows(recap));
  return { receivables, payables };
}

/**
 * A cash-flow row is "derived" (auto-seeded from the voyage) when its id is prefixed
 * `cf-`, or — for legacy rows seeded before stable ids — when its label matches a known
 * derived line. Genuinely manual rows (custom labels) are preserved by the reconciler.
 */
const DERIVED_CF_LABEL_RE = /^(Freight\b|Demurrage$|Misc Income$|Load Port DA$|Disch Port DA$|Bunker Payment$|C\.V\.E\.$|ILOHC$|Other Cost$|\d+(?:st|nd|rd|th)\s+(?:Sub-)?Hire$|Agent Invoice\b|Claim:\s)/i;
const isDerivedCashflowRow = (row: CashflowRow) => row.id.startsWith('cf-') || DERIVED_CF_LABEL_RE.test(row.label || '');

/**
 * Live payable rows derived from the Freight & Laytime settlement — agent invoices,
 * broker/vendor service invoices, and claims. Stable ids (`cf-agi/srv/clm-<id>`) let
 * the cash-flow card keep them in sync as items are added, edited, or removed.
 */
function settlementCashflowRows(recap: Recap): CashflowRow[] {
  const settlement = recap.freightLaytime?.settlement;
  if (!settlement) return [];
  const rows: CashflowRow[] = [];
  // Agent / service invoices without an actual due date default to 15 days after the
  // vessel departs the relevant port (the last port when the item has no port).
  const fallbackDue = (portName?: string) => {
    const dep = portDepartureDate(recap, portName || '') || lastDepartureDate(recap);
    return dep ? fmtShortDate(addDaysDate(dep, 15)) : '';
  };
  (settlement.agentInvoices ?? []).forEach((inv) => {
    const outstanding = (inv.approved || inv.amount) - inv.paid;
    if (outstanding <= 0) return;
    if (/closed|settled/i.test(inv.status || '') || /paid/i.test(inv.accounts || '')) return;
    const who = inv.vendor || inv.port || '';
    rows.push({ id: `cf-agi-${inv.id}`, date: inv.due || fallbackDue(inv.port), label: `Agent Invoice ${inv.invoiceNo || ''}${who ? ` — ${who}` : ''}`.trim(), amount: String(Math.round(outstanding)) });
  });
  (settlement.services ?? []).forEach((s) => {
    const amt = (s.cost || 0) + (s.tax || 0);
    if (amt <= 0) return;
    if (/closed|settled|paid/i.test(s.status || '')) return;
    const name = s.service || s.vendor || 'Service';
    rows.push({ id: `cf-srv-${s.id}`, date: fallbackDue(), label: `${name}${s.invoice ? ` (${s.invoice})` : ''}`.trim(), amount: String(Math.round(amt)) });
  });
  (settlement.claims ?? []).forEach((c) => {
    const outstanding = claimOutstanding(c);
    if (outstanding <= 0) return;
    if (/settled|closed|rejected/i.test(c.status || '')) return;
    const ref = c.reference || c.type || 'Claim';
    const to = claimChargeTo(c);
    rows.push({ id: `cf-clm-${c.id}`, date: c.due || '', label: `Claim: ${ref}${to ? ` (${to})` : ''}`, amount: String(Math.round(outstanding)) });
  });
  return rows;
}

/** Estimated voyage cash-flow card — inward (receivables) vs outward (payables), with Excel / PDF export. */
function VoyageCashflowCard({ recap, setRecap }: { recap: Recap; setRecap: Dispatch<SetStateAction<Recap>> }) {
  const stored = recap.cashflow;
  const valid = !!stored && Array.isArray(stored.receivables) && Array.isArray(stored.payables);
  const cf = valid ? (stored as CashflowData) : seedCashflow(recap);

  useEffect(() => {
    if (!valid) setRecap((r) => ({ ...r, cashflow: seedCashflow(r) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid]);

  // Keep all derived cash-flow rows (hire, freight, port DA, bunkers, CVE/ILOHC, demurrage,
  // and settlement invoices/claims) live: re-seed on any voyage change and reconcile, while
  // preserving rows the user added manually (their ids are not prefixed `cf-`).
  useEffect(() => {
    if (!valid) return;
    setRecap((r) => {
      const cur = r.cashflow;
      if (!cur || !Array.isArray(cur.receivables) || !Array.isArray(cur.payables)) return r;
      const seeded = seedCashflow(r);
      const manualR = cur.receivables.filter((x) => !isDerivedCashflowRow(x));
      const manualP = cur.payables.filter((x) => !isDerivedCashflowRow(x));
      const nextR = [...seeded.receivables, ...manualR];
      const nextP = [...seeded.payables, ...manualP];
      const same = (a: CashflowRow[], b: CashflowRow[]) =>
        a.length === b.length && a.every((x, i) => b[i] && b[i].id === x.id && b[i].date === x.date && b[i].label === x.label && b[i].amount === x.amount);
      if (same(nextR, cur.receivables) && same(nextP, cur.payables)) return r;
      return { ...r, cashflow: { receivables: nextR, payables: nextP } };
    });
  }, [recap, valid, setRecap]);

  const setCF = (patch: Partial<CashflowData>) => setRecap((r) => ({ ...r, cashflow: { ...(r.cashflow ?? seedCashflow(r)), ...patch } }));
  const setRow = (side: 'receivables' | 'payables', id: string, patch: Partial<CashflowRow>) =>
    setCF({ [side]: cf[side].map((x) => (x.id === id ? { ...x, ...patch } : x)) } as Partial<CashflowData>);
  const addRow = (side: 'receivables' | 'payables') =>
    setCF({ [side]: [...cf[side], { id: uid(side === 'receivables' ? 'cfr' : 'cfp'), date: '', label: '', amount: '' }] } as Partial<CashflowData>);
  const delRow = (side: 'receivables' | 'payables', id: string) =>
    setCF({ [side]: cf[side].filter((x) => x.id !== id) } as Partial<CashflowData>);
  const reseed = () => setRecap((r) => ({ ...r, cashflow: seedCashflow(r) }));

  const totalIn = cf.receivables.reduce((s, x) => s + num(x.amount), 0);
  const totalOut = cf.payables.reduce((s, x) => s + num(x.amount), 0);
  const net = totalIn - totalOut;
  const rowCount = Math.max(cf.receivables.length, cf.payables.length);

  const cell = (val: string, on: (v: string) => void, ph?: string, right?: boolean) => (
    <input className={`fv-ops__vd-in${right ? ' fv-ops__r' : ''}`} value={val} placeholder={ph} inputMode={right ? 'decimal' : undefined} onChange={(e) => on(e.target.value)} />
  );

  const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const bodyHtml = () => Array.from({ length: rowCount }).map((_, i) => {
    const a = cf.receivables[i]; const b = cf.payables[i];
    return `<tr><td>${esc(a?.date ?? '')}</td><td>${esc(a?.label ?? '')}</td><td class="r">${a ? esc(a.amount) : ''}</td><td>${esc(b?.date ?? '')}</td><td>${esc(b?.label ?? '')}</td><td class="r">${b ? esc(b.amount) : ''}</td></tr>`;
  }).join('');
  const headHtml = `<tr><th colspan="6">ESTIMATED CASH FLOW FOR THE VOYAGE — ${esc(recap.vesselName)}</th></tr>
    <tr><th>DATE</th><th>RECEIVABLES</th><th class="r">AMOUNT (USD)</th><th>DATE</th><th>PAYABLES</th><th class="r">AMOUNT (USD)</th></tr>`;
  const footHtml = `<tr><td></td><td><b>TOTAL RECEIVABLES</b></td><td class="r"><b>${Math.round(totalIn)}</b></td><td></td><td><b>TOTAL PAYABLES</b></td><td class="r"><b>${Math.round(totalOut)}</b></td></tr>
    <tr><td colspan="5"><b>NET CASH FLOW</b></td><td class="r"><b>${Math.round(net)}</b></td></tr>`;

  const exportExcel = () => {
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>
      <table border="1"><thead>${headHtml}</thead><tbody>${bodyHtml()}</tbody><tfoot>${footHtml}</tfoot></table></body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Cashflow_${(recap.vesselName || 'voyage').replace(/\s+/g, '_')}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const w = window.open('', '_blank', 'width=1000,height=800');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Cash Flow — ${esc(recap.vesselName)}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:28px;font-size:12px}
      h1{font-size:15px;margin:0 0 2px}.sub{color:#555;margin:0 0 12px;font-size:11px}
      table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #bbb;padding:4px 7px;text-align:left}
      th.r,td.r{text-align:right}tfoot td{background:#f2f2f2}
      thead tr:first-child th{background:#f7caa5;text-align:center}
    </style></head><body>${pdfCompanyHeader()}
      <p class="sub">${esc(recap.vesselName)} · Owners ${esc(recap.owners)} · CP ${esc(recap.cpDate || '—')}</p>
      <table><thead>${headHtml}</thead><tbody>${bodyHtml()}</tbody><tfoot>${footHtml}</tfoot></table>
      <p class="sub">*Estimated · E&amp;OE.</p></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <Card
      title="Estimated Cash Flow for the Voyage"
      icon="fa-money-bill-transfer"
      span2
      right={(
        <span className="fv-ops__frl-secbtns">
          <button type="button" className="fv-ops__btn" onClick={() => addRow('receivables')}><i className="fas fa-plus" aria-hidden="true" /> Receivable</button>
          <button type="button" className="fv-ops__btn" onClick={() => addRow('payables')}><i className="fas fa-plus" aria-hidden="true" /> Payable</button>
          <button type="button" className="fv-ops__btn" onClick={reseed} title="Rebuild from voyage figures"><i className="fas fa-arrows-rotate" aria-hidden="true" /> Reset</button>
          <button type="button" className="fv-ops__btn" onClick={exportExcel}><i className="fas fa-file-excel" aria-hidden="true" /> Excel</button>
          <button type="button" className="fv-ops__btn" onClick={exportPdf}><i className="fas fa-file-pdf" aria-hidden="true" /> PDF</button>
        </span>
      )}
    >
      <div className="fv-ops__eta-scroll">
        <table className="fv-ops__soa-tbl fv-ops__cf-tbl">
          <thead>
            <tr>
              <th>Date</th><th>Receivables</th><th className="fv-ops__r">Amount (USD)</th>
              <th>Date</th><th>Payables</th><th className="fv-ops__r">Amount (USD)</th>
            </tr>
          </thead>
          <tbody>
            {rowCount === 0 && <tr><td colSpan={6} className="fv-ops__vd-empty">No cash-flow lines. Use “Reset” to rebuild from the voyage figures, or add rows.</td></tr>}
            {Array.from({ length: rowCount }).map((_, i) => {
              const a = cf.receivables[i];
              const b = cf.payables[i];
              return (
                <tr key={i}>
                  <td>{a ? cell(a.date, (v) => setRow('receivables', a.id, { date: v }), 'dd-mm-yyyy') : null}</td>
                  <td>{a ? cell(a.label, (v) => setRow('receivables', a.id, { label: v }), 'Description') : null}</td>
                  <td className="fv-ops__r fv-ops__cf-amtcell">
                    {a && <>{cell(a.amount, (v) => setRow('receivables', a.id, { amount: v }), '0', true)}<button type="button" className="fv-ops__bnk-rm" aria-label="Remove receivable" onClick={() => delRow('receivables', a.id)}><i className="fas fa-xmark" aria-hidden="true" /></button></>}
                  </td>
                  <td>{b ? cell(b.date, (v) => setRow('payables', b.id, { date: v }), 'dd-mm-yyyy') : null}</td>
                  <td>{b ? cell(b.label, (v) => setRow('payables', b.id, { label: v }), 'Description') : null}</td>
                  <td className="fv-ops__r fv-ops__cf-amtcell">
                    {b && <>{cell(b.amount, (v) => setRow('payables', b.id, { amount: v }), '0', true)}<button type="button" className="fv-ops__bnk-rm" aria-label="Remove payable" onClick={() => delRow('payables', b.id)}><i className="fas fa-xmark" aria-hidden="true" /></button></>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="fv-ops__soa-sum">
              <td /><td>Total Receivables</td><td className="fv-ops__r">{money(totalIn)}</td>
              <td /><td>Total Payables</td><td className="fv-ops__r">{money(totalOut)}</td>
            </tr>
            <tr className={`fv-ops__soa-total ${net < 0 ? 'fv-ops__cf-net--neg' : ''}`}>
              <td colSpan={5}>Net Cash Flow (Receivables − Payables)</td>
              <td className={`fv-ops__r ${net < 0 ? 'fv-ops__neg' : 'fv-ops__pos'}`}>{money(net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="fv-ops__hint">Estimated inflows &amp; outflows are auto-adjusted by voyage type (Voyage freight legs vs time-charter hire legs) and derived from the recap (hire/freight, port DA, bunkers, CVE, ILOHC). Edit dates / amounts, add lines, then export to <b>Excel</b> or <b>PDF</b>. *E&amp;OE.</p>
    </Card>
  );
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
  allowed: number; used: number; gross: number; deductions: number; balance: number;
  onDemurrage: boolean; demurrageDays: number; despatchDays: number;
  demurrageAmt: number; despatchAmt: number;
  demurrageStart: Date | null;
  rows: { ev: LaytimeEvent; elapsed: number; counted: number; cumulative: number }[];
}

/** Start datetime of one statement-of-facts row (date + from-clock). */
function eventStartDate(ev: LaytimeEvent): Date | null {
  const d = parseDMY(ev.date);
  if (!d) return null;
  const clock = parseClock(ev.from);
  return clock != null ? new Date(d.getTime() + clock * 3_600_000) : d;
}

/** Datetime at which a port's cumulative counted/used laytime reaches `target` days. */
function laytimeReachDate(port: LaytimePort, target: number): Date | null {
  if ((port.calcMethod ?? 'counting') === 'deduction') {
    const start = parseDMY(port.commenced);
    if (!start) return null;
    const deductions = port.events.reduce((s, ev) => s + eventElapsedDays(ev) * (num(ev.pct) / 100), 0);
    return new Date(start.getTime() + (target + deductions) * 86_400_000);
  }
  let prev = 0;
  for (const ev of port.events) {
    const counted = eventElapsedDays(ev) * (num(ev.pct) / 100);
    if (prev + counted >= target) {
      const pct = num(ev.pct) / 100;
      const need = target - prev;
      const rs = eventStartDate(ev);
      return rs ? new Date(rs.getTime() + (pct > 0 ? need / pct : 0) * 86_400_000) : null;
    }
    prev += counted;
  }
  return null;
}

/** Full laytime calculation for one port (allowed vs used → demurrage / despatch).
 *  Counting method: each row's time × % counts as laytime used.
 *  Deduction method: rows are excepted periods deducted from the gross commenced→completed span. */
function calcLaytime(port: LaytimePort): LaytimeResult {
  const qty = num(port.quantity);
  const rate = num(port.rate);
  const allowed = rate > 0 ? qty / rate : 0;
  const method = port.calcMethod ?? 'counting';
  // "Once on demurrage, always on demurrage": after the allowance is used up, all subsequent time counts fully.
  const alwaysDem = port.onceOnDemurrage === true;
  let running = 0;
  let onDem = false;
  const rows = port.events.map((ev) => {
    const elapsed = eventElapsedDays(ev);
    const counted = alwaysDem && onDem ? elapsed : elapsed * (num(ev.pct) / 100);
    running += counted;
    if (allowed > 0 && running >= allowed) onDem = true;
    return { ev, elapsed, counted, cumulative: running };
  });
  let gross: number;
  let deductions: number;
  let used: number;
  if (method === 'deduction') {
    gross = daysBetween(parseDMY(port.commenced), parseDMY(port.completed));
    deductions = running;
    used = Math.max(0, gross - deductions);
  } else {
    gross = running;
    deductions = 0;
    used = running;
  }
  const balance = allowed - used;
  const onDemurrage = balance < 0;
  const demurrageDays = onDemurrage ? -balance : 0;
  const despatchDays = onDemurrage ? 0 : balance;
  const demurrageStart = parseDMY(port.demurrageStarts ?? '') ?? (onDemurrage ? laytimeReachDate(port, allowed) : null);
  return {
    allowed, used, gross, deductions, balance, onDemurrage, demurrageDays, despatchDays,
    demurrageAmt: demurrageDays * num(port.demurrageRate),
    despatchAmt: despatchDays * num(port.despatchRate),
    demurrageStart,
    rows,
  };
}

/** Combined (reversible) laytime across several ports — allowances and time used are pooled. */
function calcLaytimeCombined(ports: LaytimePort[], rateFrom: LaytimePort): Omit<LaytimeResult, 'rows'> {
  let allowed = 0, used = 0, gross = 0, deductions = 0;
  ports.forEach((p) => { const r = calcLaytime(p); allowed += r.allowed; used += r.used; gross += r.gross; deductions += r.deductions; });
  const balance = allowed - used;
  const onDemurrage = balance < 0;
  const demurrageDays = onDemurrage ? -balance : 0;
  const despatchDays = onDemurrage ? 0 : balance;
  let demurrageStart: Date | null = null;
  if (onDemurrage) {
    let cum = 0;
    for (const p of ports) {
      const u = calcLaytime(p).used;
      if (cum + u >= allowed) { demurrageStart = laytimeReachDate(p, allowed - cum); break; }
      cum += u;
    }
  }
  return {
    allowed, used, gross, deductions, balance, onDemurrage, demurrageDays, despatchDays,
    demurrageAmt: demurrageDays * num(rateFrom.demurrageRate),
    despatchAmt: despatchDays * num(rateFrom.despatchRate),
    demurrageStart: parseDMY(rateFrom.demurrageStarts ?? '') ?? demurrageStart,
  };
}

/**
 * Freight invoice due date from the freight payment clause: reference is the BL
 * issue date (else the load port's completed date), plus `freightPaymentDays`,
 * counted as banking days when the basis is Banking, otherwise calendar days.
 */
function computeFreightDue(r: Recap): string {
  const loadComplete = r.freightLaytime?.laytimes?.find((p) => p.op === 'Load' && p.completed)?.completed;
  const ref = parseFlexibleDate(r.blIssueDate) || parseFlexibleDate(loadComplete || '') || loadingCompleteFromItinerary(r);
  if (!ref) return '';
  const days = Math.max(1, num(r.freightPaymentDays) || 1);
  const due = /banking/i.test(r.freightPaymentBasis || '') ? addBankingDaysDate(ref, days) : new Date(ref.getTime() + days * 86_400_000);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(due.getDate())}-${p2(due.getMonth() + 1)}-${due.getFullYear()}`;
}

/** Loading-complete date derived from the itinerary: departure from the load port (arrival + port days). */
function loadingCompleteFromItinerary(r: Recap): Date | null {
  const legs = r.etaPlan?.legs ?? [];
  const computed = projectEtaLegs(r.etaPlan);
  const norm = (s: string) => (s || '').trim().toLowerCase();
  const idx = legs.findIndex((l) => l.kind === 'port' && (/load/i.test(l.type || '') || norm(l.to) === norm(r.loadPort)));
  if (idx < 0) return null;
  const c = computed[idx];
  if (!c?.arr) return null;
  return new Date(c.arr.getTime() + num(legs[idx].portDays) * 86_400_000);
}

/** Vessel departure (arrival + port days) from the itinerary port whose name matches `portName`. */
function portDepartureDate(r: Recap, portName: string): Date | null {
  if (!portName) return null;
  const legs = r.etaPlan?.legs ?? [];
  const computed = projectEtaLegs(r.etaPlan);
  const norm = (s: string) => (s || '').trim().toLowerCase();
  for (let i = 0; i < legs.length; i += 1) {
    if (legs[i].kind === 'port' && norm(legs[i].to) === norm(portName)) {
      const a = computed[i]?.arr;
      return a ? addDaysDate(a, num(legs[i].portDays)) : null;
    }
  }
  return null;
}

/** Vessel departure from the final itinerary port (fallback when a settlement item has no port). */
function lastDepartureDate(r: Recap): Date | null {
  const legs = r.etaPlan?.legs ?? [];
  const computed = projectEtaLegs(r.etaPlan);
  for (let i = legs.length - 1; i >= 0; i -= 1) {
    const a = computed[i]?.arr;
    if (a) return legs[i].kind === 'port' ? addDaysDate(a, num(legs[i].portDays)) : a;
  }
  return null;
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
    accountName: recap.charterers,
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
      paymentTerms: freightPaymentClause(recap),
      dueDate: computeFreightDue(recap),
      status: 'Draft',
      freightType: 'Initial',
      freightDifferential: '0',
      pctFreightDue: '100',
      initialFreightReceived: '0',
      includeDemurrage: false,
      claimIds: [],
    }],
    laytimes,
  };
}

function seedFreightSettlement(voyage: Voyage, recap?: Recap): FreightSettlementData {
  // PDA rows are derived from the actual voyage port rotation with zero amounts,
  // so any figure entered here is a real actual (not demo) and can safely drive
  // the Voyage Details PDA fields and the Live P&L port cost.
  const loadPorts = recap ? splitPorts(recap.loadPort) : splitPorts(voyage.portFrom || '');
  const dischPorts = recap ? splitPorts(recap.dischargePort) : splitPorts(voyage.portTo || '');
  const ports = [...loadPorts, ...dischPorts].filter(Boolean);
  const mkPda = (port: string): PdaRow => ({
    id: uid('pda'), port, agent: '', due: '', currency: 'USD',
    estimated: 0, advance: 0, fdaFinal: 0,
    status: 'Requested', fdaStatus: 'Requested', paymentStatus: 'Pending', approval: 'Pending', attachments: [],
  });
  return {
    pda: ports.map(mkPda),
    agentInvoices: [],
    services: [],
    claims: [],
  };
}

interface InvoiceLine { desc: string; amount: number; sign: 1 | -1; adjustmentId?: string }
interface InvoiceResult { lines: InvoiceLine[]; total: number }

function freightPaymentClause(recap: Recap): string {
  const days = Math.max(1, num(recap.freightPaymentDays) || 1);
  const basis = recap.freightPaymentBasis || 'Banking Days';
  return `Within ${days} ${basis} after loading / BL`;
}

/** Compute an invoice's line items and total from the recap + laytime results. */
function calcInvoice(inv: FreightInvoice, recap: Recap, laytimes: LaytimePort[], claims?: ClaimRow[]): InvoiceResult {
  const invoiceLaytimes = inv.kind === 'Demurrage' && inv.includedPortOps
    ? laytimes.filter((port) => inv.includedPortOps?.includes(port.op))
    : laytimes;
  const results = invoiceLaytimes.map((p) => calcLaytime(p));
  const demurrageRate = num(recap.demDespatch);
  const despatchRate = /no\s*despatch|free\s*despatch/i.test(recap.despatchTerm) ? 0 : /half\s*despatch/i.test(recap.despatchTerm) ? demurrageRate / 2 : demurrageRate;
  const totalDemurrage = results.reduce((s, r) => s + r.demurrageDays * demurrageRate, 0);
  const totalDespatch = results.reduce((s, r) => s + r.despatchDays * despatchRate, 0);
  const adcomPct = (inv.adcomOverride?.trim() ? num(inv.adcomOverride) : num(recap.adcom)) / 100;
  const lines: InvoiceLine[] = [];
  if (inv.kind === 'Demurrage') {
    invoiceLaytimes.forEach((p) => {
      const r = calcLaytime(p);
      const portName = p.op === 'Load' ? (recap.loadPort || p.name) : (recap.dischargePort || p.name);
      if (r.demurrageDays > 0) lines.push({ desc: `${portName} (${p.op}) — Demurrage ${fmt(r.demurrageDays, 3)}d × ${money(demurrageRate)}/day`, amount: r.demurrageDays * demurrageRate, sign: 1 });
      if (r.despatchDays > 0) lines.push({ desc: `${portName} (${p.op}) — Despatch ${fmt(r.despatchDays, 3)}d × ${money(despatchRate)}/day`, amount: r.despatchDays * despatchRate, sign: -1 });
    });
    const adcomDem = totalDemurrage * adcomPct;
    if (adcomDem > 0) lines.push({ desc: `Less: Address commission on demurrage @ ${fmt(adcomPct * 100, 3)}%`, amount: adcomDem, sign: -1 });
    const linked = (inv.claimIds ?? []).map((id) => claims?.find((c) => c.id === id)).filter((c): c is ClaimRow => !!c && claimForCharterers(c));
    linked.forEach((c) => {
      const amt = claimOutstanding(c);
      if (amt > 0) lines.push({ desc: `Add: Claim (${claimChargeTo(c)}) ${c.reference || c.type || 'Claim'}`, amount: amt, sign: 1 });
    });
    (inv.adjustments ?? []).forEach((adjustment) => {
      lines.push({
        desc: `${adjustment.direction === 'Deduct' ? 'Less' : 'Add'}: ${adjustment.description || 'Other adjustment'}`,
        amount: Math.abs(num(adjustment.amount)),
        sign: adjustment.direction === 'Deduct' ? -1 : 1,
        adjustmentId: adjustment.id,
      });
    });
    const total = lines.reduce((s, l) => s + l.sign * l.amount, 0);
    return { lines, total };
  }
  // Freight invoice
  const blQty = inv.blQtyOverride?.trim() ? num(inv.blQtyOverride) : num(recap.finalQtyLoaded);
  const frtRate = inv.freightRateOverride?.trim() ? num(inv.freightRateOverride) : num(recap.freightPerMt);
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
  if (inv.includeDemurrage) {
    if (totalDemurrage > 0) lines.push({ desc: 'Add: Total demurrage (all ports)', amount: totalDemurrage, sign: 1 });
    const adcomDem = totalDemurrage * adcomPct;
    if (adcomDem > 0) lines.push({ desc: `Less: Address commission on demurrage @ ${fmt(adcomPct * 100, 3)}%`, amount: adcomDem, sign: -1 });
    if (totalDespatch > 0) lines.push({ desc: 'Less: Total despatch (all ports)', amount: totalDespatch, sign: -1 });
  }
  if (num(inv.initialFreightReceived) > 0) lines.push({ desc: 'Less: Initial freight received', amount: num(inv.initialFreightReceived), sign: -1 });
  const linked = (inv.claimIds ?? []).map((id) => claims?.find((c) => c.id === id)).filter((c): c is ClaimRow => !!c && claimForCharterers(c));
  linked.forEach((c) => {
    const amt = claimOutstanding(c);
    if (amt > 0) lines.push({ desc: `Add: Claim (${claimChargeTo(c)}) ${c.reference || c.type || 'Claim'}`, amount: amt, sign: 1 });
  });
  (inv.adjustments ?? []).forEach((adjustment) => {
    lines.push({
      desc: `${adjustment.direction === 'Deduct' ? 'Less' : 'Add'}: ${adjustment.description || 'Other adjustment'}`,
      amount: Math.abs(num(adjustment.amount)),
      sign: adjustment.direction === 'Deduct' ? -1 : 1,
      adjustmentId: adjustment.id,
    });
  });
  const total = lines.reduce((s, l) => s + l.sign * l.amount, 0);
  return { lines, total };
}

function freightStatusPill(s: string): string {
  if (s === 'Paid & Locked') return 'green';
  if (s === 'Sent For Approval') return 'blue';
  return s === 'Draft' ? 'amber' : 'blue';
}

function pdfEsc(value: unknown): string {
  return String(value ?? '').replace(/[&<>]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character] ?? character));
}

function findClientBankByName(name?: string): { verified: boolean; details: string; bankName: string; accountHolder: string; accountNumber: string; swift: string; iban: string } | null {
  const key = (name ?? '').trim().toLowerCase();
  if (!key) return null;
  const hit = loadClients().find((client) => client.name.trim().toLowerCase() === key);
  return hit?.bankAccount ?? null;
}

function accountBoxHtml(title: string, partyName: string, bank?: { verified?: boolean; details?: string; bankName?: string; accountHolder?: string; accountNumber?: string; swift?: string; iban?: string } | null): string {
  const account = bank ?? {};
  if (!account.verified) return '';
  const detailsText = (account.details ?? '').trim();
  const hasAny = Boolean(detailsText || account.bankName || account.accountHolder || account.accountNumber || account.swift || account.iban);
  return `<div style="margin:14px 0 6px;border:1px solid #cdd5e1;background:#f8fafc;padding:10px 12px;border-radius:6px">
    <div style="font-size:11px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">${pdfEsc(title)}</div>
    <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:6px">${pdfEsc(partyName || '—')}</div>
    ${hasAny
      ? detailsText
        ? `<pre style="margin:0;white-space:pre-wrap;font:12px Arial;color:#0f172a">${pdfEsc(detailsText)}</pre>`
        : `<table style="width:100%;border-collapse:collapse;margin:0"><tbody>
          <tr><td style="border:none;padding:2px 6px 2px 0;color:#64748b;width:150px">Bank Name</td><td style="border:none;padding:2px 0">${pdfEsc(account.bankName || '—')}</td></tr>
          <tr><td style="border:none;padding:2px 6px 2px 0;color:#64748b">Account Holder</td><td style="border:none;padding:2px 0">${pdfEsc(account.accountHolder || '—')}</td></tr>
          <tr><td style="border:none;padding:2px 6px 2px 0;color:#64748b">Account Number</td><td style="border:none;padding:2px 0">${pdfEsc(account.accountNumber || '—')}</td></tr>
          <tr><td style="border:none;padding:2px 6px 2px 0;color:#64748b">SWIFT</td><td style="border:none;padding:2px 0">${pdfEsc(account.swift || '—')}</td></tr>
          <tr><td style="border:none;padding:2px 6px 2px 0;color:#64748b">IBAN</td><td style="border:none;padding:2px 0">${pdfEsc(account.iban || '—')}</td></tr>
        </tbody></table>`
      : '<div style="font-size:11px;color:#64748b">No bank account details saved.</div>'}
  </div>`;
}

function companyAccountBoxHtml(label = 'Our Company Account Details'): string {
  const cfg = getWorkflowConfig();
  return accountBoxHtml(label, cfg.companyName || 'Our Company', cfg.companyBankAccount);
}

/** HTML body for one invoice (used by the modal and bulk PDF export). */
function invoicePdfSection(inv: FreightInvoice, recap: Recap, voyage: Voyage, laytimes: LaytimePort[], claims?: ClaimRow[]): string {
  const { lines, total } = calcInvoice(inv, recap, laytimes, claims);
  const rows = lines.map((l) => `<tr><td>${pdfEsc(l.desc)}</td><td class="r">${l.sign < 0 ? '-' : ''}${money(l.amount)}</td></tr>`).join('');
  const payerBank = findClientBankByName(inv.invoiceTo);
  return `<section>
    <h1>${inv.kind === 'Freight' ? `${inv.freightType} Freight Invoice` : inv.title}</h1>
    <p class="sub">${recap.vesselName} · IMO ${recap.vesselImo || voyage.imo || '—'} · ${voyage.flag || '—'} · CP ${recap.cpDate || '—'}</p>
    <div class="meta">
      <div><span>Invoice To:</span> ${inv.invoiceTo || '—'}</div>
      <div><span>Invoice No.:</span> ${inv.invoiceNo || '—'}</div>
      <div><span>Invoice Date:</span> ${inv.invoiceDate || '—'}</div>
      <div><span>Payment Terms:</span> ${pdfEsc(freightPaymentClause(recap))}</div>
      <div><span>Due Date:</span> ${inv.dueDate || '—'}</div>
      <div><span>Voyage:</span> ${recap.loadPort} → ${recap.dischargePort}</div>
      <div><span>Cargo:</span> ${recap.cargoName}</div>
    </div>
    <table><thead><tr><th>Description</th><th class="r">Amount (US$)</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="tot"><td>Total Payable Due to Owners</td><td class="r">${money(total)}</td></tr></tfoot></table>
    ${companyAccountBoxHtml('Beneficiary Account Details (Our Company)')}
    ${accountBoxHtml('Payer Details (Reference)', inv.invoiceTo || recap.charterers || 'Counterparty', payerBank)}
  </section>`;
}

/** HTML body for one laytime calculation (used by the modal and bulk PDF export). */
function laytimePdfSection(port: LaytimePort, recap: Recap): string {
  const res = calcLaytime(port);
  const factRows = res.rows.map(({ ev, elapsed, counted, cumulative }) => `<tr><td>${ev.date || ''}</td><td>${ev.from || ''}</td><td>${ev.to || ''}</td><td class="r">${fmt(elapsed, 3)}</td><td class="r">${ev.pct}</td><td class="r">${fmt(counted, 3)}</td><td class="r">${fmt(cumulative, 3)}</td><td>${ev.remark || ''}</td></tr>`).join('');
  const payeeName = res.onDemurrage ? (getWorkflowConfig().companyName || 'Our Company') : (port.accountName || recap.charterers || 'Counterparty');
  const payeeBank = res.onDemurrage ? getWorkflowConfig().companyBankAccount : findClientBankByName(payeeName);
  return `<section>
    <h1>Laytime Calculation — ${port.name || 'Port'} (${port.op})</h1>
    <p class="sub">${recap.vesselName} · Cargo ${port.cargo} · CP ${recap.cpDate || '—'}</p>
    <div class="meta">
      <div><span>In Favour Of:</span> ${port.accountName || '—'}</div>
      <div><span>Quantity:</span> ${fmt(num(port.quantity), 0)} MT</div>
      <div><span>Rate:</span> ${fmt(num(port.rate), 0)} mt/day</div>
      <div><span>Terms:</span> ${port.terms || '—'}</div>
      <div><span>Laytime Allowed:</span> ${fmt(res.allowed, 3)} days</div>
      <div><span>Laytime Used:</span> ${fmt(res.used, 3)} days</div>
      <div><span>${res.onDemurrage ? 'Demurrage Due:' : 'Despatch Due:'}</span> ${res.onDemurrage ? money(res.demurrageAmt) : money(res.despatchAmt)}</div>
    </div>
    <table><thead><tr><th>Date</th><th>From</th><th>To</th><th class="r">Time</th><th class="r">% Count</th><th class="r">Time Used / Deducted</th><th class="r">Cumulative</th><th>Remarks</th></tr></thead>
    <tbody>${factRows}</tbody>
    <tfoot><tr><td colspan="6">Total Time Used</td><td class="r">${fmt(res.used, 3)}</td><td>days</td></tr></tfoot></table>
    ${accountBoxHtml(res.onDemurrage ? 'Beneficiary Account Details' : 'Payee Account Details', payeeName, payeeBank)}
  </section>`;
}

/** Open a print window wrapping the given HTML sections in a standard stylesheet. */
/** Returns an HTML block with the company logo, name, and address for PDF document headers. */
function pdfCompanyHeader(): string {
  const cfg = getWorkflowConfig();
  if (!cfg.companyName && !cfg.companyAddress && !cfg.companyLogoDataUrl) return '';
  const logo = cfg.companyLogoDataUrl
    ? `<img src="${cfg.companyLogoDataUrl}" style="max-height:60px;max-width:220px;object-fit:contain;display:block" alt="${cfg.companyName}" />`
    : '';
  const name = cfg.companyName ? `<div style="font-size:14px;font-weight:700;color:#111;margin-bottom:3px">${cfg.companyName}</div>` : '';
  const addr = cfg.companyAddress
    ? `<div style="font-size:11px;color:#555;white-space:pre-line;text-align:right">${cfg.companyAddress}</div>`
    : '';
  return `<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px">
    <div>${logo}</div>
    <div style="text-align:right">${name}${addr}</div>
  </div>`;
}

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
  </style></head><body>${pdfCompanyHeader()}${sections}<p class="sub">*E&amp;OE.</p></body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

/* --------------------------------------------------- EU ETS Allowances (EUA) */

// Well-to-... CO2 emission factors (t-CO2 per t-fuel) per ISO 8217 fuel grade.
const EUA_EMISSION_FACTORS: Record<string, number> = {
  VLSFO: 3.151, LSFO: 3.151, ULSFO: 3.151, LFO: 3.151,
  HFO: 3.114, HSFO: 3.114,
  LSMGO: 3.206, MGO: 3.206, MDO: 3.206, DMX: 3.206,
};
const euaFactor = (fuel: string) => EUA_EMISSION_FACTORS[(fuel || '').trim().toUpperCase()] ?? 3.114;

/** Build a starter EUA dataset from the voyage itinerary bunkers. */
function seedEua(recap: Recap): EuaData {
  const rows = projectEtaLegs(recap.etaPlan);
  const totV = rows.reduce((s, c) => s + c.usedV, 0);
  const totM = rows.reduce((s, c) => s + c.usedM, 0);
  const from = recap.loadPort || '';
  const to = recap.dischargePort || '';
  return {
    phaseInPct: '70',
    legs: [
      { id: uid('eua'), from, to, fuel: 'VLSFO', cons: totV.toFixed(3), emissionFactor: String(euaFactor('VLSFO')), phasePct: '50' },
      { id: uid('eua'), from, to, fuel: 'LSMGO', cons: totM.toFixed(3), emissionFactor: String(euaFactor('LSMGO')), phasePct: '50' },
    ],
    ledger: [],
  };
}

/* ------------------------------------------------------------ Emissions (EUA) */

/** EU ETS allowance record — emission → EUA calculation plus a bought/used ledger. */
export function EuaCard({ recap, setRecap }: { recap: Recap; setRecap: Dispatch<SetStateAction<Recap>> }) {
  const stored = recap.eua;
  const valid = !!stored && Array.isArray(stored.legs) && Array.isArray(stored.ledger);
  const base = valid ? (stored as EuaData) : seedEua(recap);

  useEffect(() => {
    if (!valid) setRecap((r) => ({ ...r, eua: seedEua(r) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EuaData>(base);
  const view = editing ? draft : base;

  const beginEdit = () => { setDraft(base); setEditing(true); };
  const save = () => { setRecap((r) => ({ ...r, eua: draft })); setEditing(false); };
  const discard = () => { setDraft(base); setEditing(false); };

  const setField = (patch: Partial<EuaData>) => setDraft((d) => ({ ...d, ...patch }));
  const setLeg = (id: string, patch: Partial<EuaLeg>) => setDraft((d) => ({ ...d, legs: d.legs.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const addLeg = () => setDraft((d) => ({ ...d, legs: [...d.legs, { id: uid('eua'), from: '', to: '', fuel: 'VLSFO', cons: '', emissionFactor: String(euaFactor('VLSFO')), phasePct: '50' }] }));
  const delLeg = (id: string) => setDraft((d) => ({ ...d, legs: d.legs.filter((x) => x.id !== id) }));
  const setLed = (id: string, patch: Partial<EuaLedgerRow>) => setDraft((d) => ({ ...d, ledger: d.ledger.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const addLed = () => setDraft((d) => ({ ...d, ledger: [...d.ledger, { id: uid('eual'), date: '', type: 'Bought', qty: '', rate: '' }] }));
  const delLed = (id: string) => setDraft((d) => ({ ...d, ledger: d.ledger.filter((x) => x.id !== id) }));

  const phaseIn = num(view.phaseInPct) / 100;
  const calc = (l: EuaLeg) => {
    const factor = num(l.emissionFactor) || euaFactor(l.fuel);
    const co2 = num(l.cons) * factor;
    const euas = co2 * (num(l.phasePct) / 100);
    return { factor, co2, euas, euasPhased: euas * phaseIn };
  };
  const totalEuas = view.legs.reduce((s, l) => s + calc(l).euasPhased, 0);
  const bought = view.ledger.filter((x) => /buy|bought/i.test(x.type)).reduce((s, x) => s + num(x.qty), 0);
  const used = view.ledger.filter((x) => /use|surrender/i.test(x.type)).reduce((s, x) => s + num(x.qty), 0);
  const cost = view.ledger.filter((x) => /buy|bought/i.test(x.type)).reduce((s, x) => s + num(x.qty) * num(x.rate), 0);
  const balance = bought - used;
  const shortfall = totalEuas - balance;

  const nIn = (val: string, on: (v: string) => void, ph?: string) => (
    editing ? <input className="fv-ops__eta-in" inputMode="decimal" value={val} placeholder={ph} onChange={(e) => on(e.target.value)} /> : <span className="fv-ops__vr-val">{val || '—'}</span>
  );
  const tIn = (val: string, on: (v: string) => void, ph?: string) => (
    editing ? <input className="fv-ops__vd-in" value={val} placeholder={ph} onChange={(e) => on(e.target.value)} /> : <span className="fv-ops__vr-val">{val || '—'}</span>
  );
  const money2 = (n: number) => `€${fmt(n, 2)}`;

  const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const calcTableHtml = () => {
    const head = `<tr><th>From</th><th>To</th><th>Fuel</th><th class="r">Cons (MT)</th><th class="r">CO₂ Factor</th><th class="r">CO₂ Emission (t)</th><th class="r">% Phase</th><th class="r">EUAs</th><th class="r">EUAs @ ${esc(view.phaseInPct)}%</th></tr>`;
    const body = view.legs.map((l) => { const c = calc(l); return `<tr><td>${esc(l.from)}</td><td>${esc(l.to)}</td><td>${esc(l.fuel)}</td><td class="r">${fmt(num(l.cons), 3)}</td><td class="r">${fmt(c.factor, 3)}</td><td class="r">${fmt(c.co2, 3)}</td><td class="r">${esc(l.phasePct)}%</td><td class="r">${fmt(c.euas, 3)}</td><td class="r">${fmt(c.euasPhased, 3)}</td></tr>`; }).join('');
    const foot = `<tr><td colspan="8"><b>Total EUAs Applicable (to be paid)</b></td><td class="r"><b>${fmt(totalEuas, 3)}</b></td></tr>`;
    return `<table border="1"><thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table>`;
  };
  const ledgerTableHtml = () => {
    const head = `<tr><th>Date</th><th>Type</th><th class="r">Qty (EUAs)</th><th class="r">Rate (€/EUA)</th><th class="r">Amount (€)</th></tr>`;
    const body = view.ledger.map((x) => `<tr><td>${esc(x.date)}</td><td>${esc(x.type)}</td><td class="r">${fmt(num(x.qty), 3)}</td><td class="r">${fmt(num(x.rate), 2)}</td><td class="r">${fmt(num(x.qty) * num(x.rate), 2)}</td></tr>`).join('');
    const foot = `<tr><td colspan="2"><b>Bought ${fmt(bought, 3)} · Used ${fmt(used, 3)} · Balance ${fmt(balance, 3)}</b></td><td colspan="3" class="r"><b>Cost €${fmt(cost, 2)}</b></td></tr>`;
    return `<table border="1"><thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table>`;
  };
  const exportExcel = () => {
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>
      <h3>EU ETS Allowance (EUA) — ${esc(recap.vesselName)}</h3>${calcTableHtml()}<br/>${ledgerTableHtml()}</body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EUA_${(recap.vesselName || 'voyage').replace(/\s+/g, '_')}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const exportPdf = () => {
    const w = window.open('', '_blank', 'width=1000,height=800');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>EUA — ${esc(recap.vesselName)}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:11px}
      h1{font-size:14px;margin:0 0 2px}h2{font-size:12px;margin:14px 0 4px}.sub{color:#555;margin:0 0 10px;font-size:10px}
      table{border-collapse:collapse;width:100%;margin:4px 0}
      th,td{border:1px solid #bbb;padding:3px 6px;text-align:left}
      td.r,th.r{text-align:right}tfoot td{background:#f2f2f2;font-weight:700}
    </style></head><body>${pdfCompanyHeader()}
      <h1>EU ETS Allowance (EUA) — ${esc(recap.vesselName)}</h1>
      <p class="sub">${esc(recap.loadPort)} → ${esc(recap.dischargePort)} · Surrender phase-in ${esc(view.phaseInPct)}%</p>
      <h2>EUA Calculation</h2>${calcTableHtml()}
      <h2>Allowance Ledger</h2>${ledgerTableHtml()}
      <p class="sub">*E&amp;OE.</p></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <Card
      title="EU ETS Allowances (EUA)"
      icon="fa-leaf"
      wide
      right={(
        <span className="fv-ops__frl-secbtns">
          {!editing && <button type="button" className="fv-ops__btn" onClick={beginEdit}><i className="fas fa-pen" aria-hidden="true" /> Edit</button>}
          {editing && <button type="button" className="fv-ops__btn fv-ops__btn--go" onClick={save}><i className="fas fa-floppy-disk" aria-hidden="true" /> Save</button>}
          {editing && <button type="button" className="fv-ops__btn" onClick={discard}><i className="fas fa-rotate-left" aria-hidden="true" /> Discard</button>}
          {editing && <button type="button" className="fv-ops__btn" onClick={addLeg}><i className="fas fa-plus" aria-hidden="true" /> Leg</button>}
          {editing && <button type="button" className="fv-ops__btn" onClick={addLed}><i className="fas fa-plus" aria-hidden="true" /> Allowance</button>}
          <button type="button" className="fv-ops__btn" onClick={exportExcel}><i className="fas fa-file-excel" aria-hidden="true" /> Excel</button>
          <button type="button" className="fv-ops__btn" onClick={exportPdf}><i className="fas fa-file-pdf" aria-hidden="true" /> PDF</button>
        </span>
      )}
    >
      <div className="fv-ops__frl-voy">
        <span><b>Surrender Phase-in %</b> {editing ? nIn(view.phaseInPct, (v) => setField({ phaseInPct: v })) : <b>{view.phaseInPct}%</b>}</span>
        <span><b>Total EUAs to Pay:</b> {fmt(totalEuas, 3)}</span>
        <span><b>Held (Bought − Used):</b> {fmt(balance, 3)}</span>
        <span className={shortfall > 0 ? 'fv-ops__neg' : 'fv-ops__pos'}><b>{shortfall > 0 ? 'Shortfall:' : 'Surplus:'}</b> {fmt(Math.abs(shortfall), 3)} EUAs</span>
      </div>

      <div className="fv-ops__vd-sub-head"><i className="fas fa-smog" aria-hidden="true" /> EUA Calculation (emissions × scope × phase-in)</div>
      <div className="fv-ops__eta-scroll">
        <table className="fv-ops__soa-tbl fv-ops__eua-tbl">
          <thead>
            <tr>
              <th>From</th><th>To</th><th>Fuel</th><th className="fv-ops__r">Cons (MT)</th><th className="fv-ops__r">CO₂ Factor</th>
              <th className="fv-ops__r">CO₂ Emission (t)</th><th className="fv-ops__r">% Phase</th><th className="fv-ops__r">EUAs</th><th className="fv-ops__r">EUAs @ {view.phaseInPct}%</th>{editing && <th aria-label="Remove" />}
            </tr>
          </thead>
          <tbody>
            {view.legs.length === 0 && <tr><td colSpan={editing ? 10 : 9} className="fv-ops__vd-empty">No legs. {editing ? 'Use “Leg” to add one.' : ''}</td></tr>}
            {view.legs.map((l) => {
              const c = calc(l);
              return (
                <tr key={l.id}>
                  <td>{tIn(l.from, (v) => setLeg(l.id, { from: v }), 'From')}</td>
                  <td>{tIn(l.to, (v) => setLeg(l.id, { to: v }), 'To')}</td>
                  <td>
                    {editing
                      ? <select className="fv-ops__eta-sel" value={l.fuel} onChange={(e) => setLeg(l.id, { fuel: e.target.value, emissionFactor: String(euaFactor(e.target.value)) })}>
                          {l.fuel && !OPS_FUEL_GRADES.includes(l.fuel) && <option value={l.fuel}>{l.fuel}</option>}
                          {OPS_FUEL_GRADES.map((f) => <option key={f} value={f}>{f}</option>)}
                        </select>
                      : <span className="fv-ops__vr-val">{l.fuel}</span>}
                  </td>
                  <td className="fv-ops__r">{nIn(l.cons, (v) => setLeg(l.id, { cons: v }))}</td>
                  <td className="fv-ops__r">{nIn(l.emissionFactor, (v) => setLeg(l.id, { emissionFactor: v }))}</td>
                  <td className="fv-ops__r">{fmt(c.co2, 3)}</td>
                  <td className="fv-ops__r">
                    {editing
                      ? <select className="fv-ops__eta-sel" value={l.phasePct} onChange={(e) => setLeg(l.id, { phasePct: e.target.value })}><option value="50">50%</option><option value="100">100%</option></select>
                      : <span className="fv-ops__vr-val">{l.phasePct}%</span>}
                  </td>
                  <td className="fv-ops__r">{fmt(c.euas, 3)}</td>
                  <td className="fv-ops__r">{fmt(c.euasPhased, 3)}</td>
                  {editing && <td className="fv-ops__r"><button type="button" className="fv-ops__bnk-rm" aria-label="Remove leg" onClick={() => delLeg(l.id)}><i className="fas fa-xmark" aria-hidden="true" /></button></td>}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="fv-ops__soa-total">
              <td colSpan={editing ? 9 : 8}>Total EUAs Applicable (to be paid)</td>
              <td className="fv-ops__r">{fmt(totalEuas, 3)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="fv-ops__vd-sub-head"><i className="fas fa-book" aria-hidden="true" /> Allowance Ledger (bought / used &amp; rate)</div>
      <div className="fv-ops__eta-scroll">
        <table className="fv-ops__soa-tbl fv-ops__eua-tbl">
          <thead>
            <tr><th>Date</th><th>Type</th><th className="fv-ops__r">Qty (EUAs)</th><th className="fv-ops__r">Rate (€/EUA)</th><th className="fv-ops__r">Amount (€)</th>{editing && <th aria-label="Remove" />}</tr>
          </thead>
          <tbody>
            {view.ledger.length === 0 && <tr><td colSpan={editing ? 6 : 5} className="fv-ops__vd-empty">No allowances recorded. {editing ? 'Use “Allowance” to add a bought / used entry.' : ''}</td></tr>}
            {view.ledger.map((x) => (
              <tr key={x.id}>
                <td>{tIn(x.date, (v) => setLed(x.id, { date: v }), 'dd-mm-yyyy')}</td>
                <td>
                  {editing
                    ? <select className="fv-ops__eta-sel" value={x.type} onChange={(e) => setLed(x.id, { type: e.target.value })}><option>Bought</option><option>Used</option><option>Surrendered</option></select>
                    : <span className="fv-ops__vr-val">{x.type}</span>}
                </td>
                <td className="fv-ops__r">{nIn(x.qty, (v) => setLed(x.id, { qty: v }))}</td>
                <td className="fv-ops__r">{nIn(x.rate, (v) => setLed(x.id, { rate: v }))}</td>
                <td className="fv-ops__r">{money2(num(x.qty) * num(x.rate))}</td>
                {editing && <td className="fv-ops__r"><button type="button" className="fv-ops__bnk-rm" aria-label="Remove allowance" onClick={() => delLed(x.id)}><i className="fas fa-xmark" aria-hidden="true" /></button></td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="fv-ops__soa-sum">
              <td colSpan={2}>Bought {fmt(bought, 3)} · Used {fmt(used, 3)} · Balance {fmt(balance, 3)}</td>
              <td className="fv-ops__r" colSpan={editing ? 4 : 3}>Cost {money2(cost)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="fv-ops__hint">CO₂ Emission = Cons × factor (VLSFO/LFO 3.151 · MGO/MDO 3.206 · HFO 3.114). EUAs = CO₂ × scope % (100% intra-EU · 50% EU↔non-EU), then × the surrender phase-in % (2025 40% · 2026 70% · 2027+ 100%). Use <b>Edit</b> to adjust, add legs / allowances, then export to <b>Excel</b> or <b>PDF</b>.</p>
    </Card>
  );
}

/* ------------------------------------------------------------ Freight & Laytime */

export function FreightTab({ recap, setRecap, voyage, section = 'all', module = 'Operations' }: { recap: Recap; setRecap: Dispatch<SetStateAction<Recap>>; voyage: Voyage; section?: 'all' | 'freight' | 'pda-services'; module?: 'Operations' | 'Postfix' }) {
  const { isInRole } = useFleetView();
  const canApproveHire = isInRole('Manager, Operations Manager, Administrator');
  const fixtureNo = useFixtureNumbers()[voyage.id] ?? voyage.id;
  const accountTxns = useAccountTxns();
  const stored = recap.freightLaytime;
  const valid = !!stored && Array.isArray(stored.invoices) && Array.isArray(stored.laytimes);
  const fl = valid ? (stored as FreightLaytimeData) : seedFreightLaytime(recap);
  const voyageType = (recap.voyageFixType || '').toUpperCase();
  const [inType = '', outType = ''] = voyageType.split('-');
  const hasVoyageLeg = inType === 'VIN' || outType === 'VOUT';

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
  const [copiedInvoices, setCopiedInvoices] = useState(false);
  const [copiedLaytime, setCopiedLaytime] = useState(false);
  const [selInvoices, setSelInvoices] = useState<Set<string>>(new Set());
  const [selLaytimes, setSelLaytimes] = useState<Set<string>>(new Set());
  const toggleInv = (id: string) => setSelInvoices((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleLay = (id: string) => setSelLaytimes((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const copyInvoicesToPostfix = () => {
    copyLaytimeToPostfix(voyage.id);
    addNotification(`Freight invoices for ${voyage.vessel} (${voyage.id}) sent to Postfix.`, 'Postfix');
    setCopiedInvoices(true);
  };
  const copyLaytimeCalcToPostfix = () => {
    copyLaytimeToPostfix(voyage.id);
    addNotification(`Laytime calculations for ${voyage.vessel} (${voyage.id}) sent to Postfix.`, 'Postfix');
    setCopiedLaytime(true);
  };

  // --- Invoice list operations ---
  const addInvoice = (kind: 'Freight' | 'Demurrage') => {
    const n = fl.invoices.length + 1;
    const inv: FreightInvoice = {
      id: uid('inv'), kind,
      title: kind === 'Freight' ? 'Freight Invoice' : 'Demurrage / Despatch Invoice',
      invoiceNo: String(n), invoiceDate: '', invoiceTo: recap.charterers,
      paymentTerms: freightPaymentClause(recap), dueDate: computeFreightDue(recap), status: 'Draft',
      freightType: kind === 'Freight' ? 'Final' : 'Initial',
      freightDifferential: '0', pctFreightDue: '100', initialFreightReceived: '0',
      includeDemurrage: kind === 'Demurrage',
      includedPortOps: kind === 'Demurrage' ? [
        ...(recap.loadPort ? ['Load' as const] : []),
        ...(recap.dischargePort ? ['Discharge' as const] : []),
      ] : undefined,
      claimIds: [],
    };
    setFL({ invoices: [...fl.invoices, inv] });
    setInvoiceId(inv.id);
  };
  const delInvoice = (id: string) => setFL({ invoices: fl.invoices.filter((x) => x.id !== id) });
  const saveInvoice = (id: string, patch: Partial<FreightInvoice>) =>
    setFL({ invoices: fl.invoices.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const invoicePaymentStatus = (invoice: FreightInvoice) => {
    if (invoice.paymentStatusManual && invoice.paymentStatus) return invoice.paymentStatus;
    const txn = accountTxns.find((x) => x.invoiceNo === `INV-${voyage.id}-${invoice.id}` || x.invoiceNo === invoice.invoiceNo);
    if (!txn) return invoice.paymentStatus || 'Pending';
    if (txn.status === 'Paid' || txn.status === 'Received') return 'Paid';
    if (txn.status === 'Partially Paid') return 'Partially Paid';
    return 'Pending';
  };
  const advanceInvoice = (id: string, to: string) => {
    if (to === 'Sent For Payment') {
      const invoice = fl.invoices.find((x) => x.id === id);
      if (!invoice) return;
      const { total } = calcInvoice(invoice, recap, fl.laytimes, settlement.claims);
      const sent = sendPayable(invoice.id, invoice.invoiceTo || recap.charterers, `INV-${voyage.id}-${invoice.id}`, Math.max(0, total), invoice.dueDate, invoice.kind === 'Freight' ? 'Freight' : 'Demurrage');
      if (!sent) return;
    }
    saveInvoice(id, { workflowStatus: to as HireStatus });
    if (to === 'Sent For Approval') {
      const invoice = fl.invoices.find((x) => x.id === id);
      if (invoice) {
        addNotification(`Freight invoice ${invoice.invoiceNo || invoice.title} for ${voyage.vessel} is ready for manager review and approval.`, 'Manager');
      }
    } else if (to === 'Approved') {
      addNotification(`Freight invoice for ${voyage.vessel} was approved by the manager and is ready to send to Accounts.`, module);
    } else if (to === 'Sent For Payment') {
      const invoice = fl.invoices.find((x) => x.id === id);
      if (invoice) {
        const { total } = calcInvoice(invoice, recap, fl.laytimes, settlement.claims);
        addNotification(`Freight invoice sent to Accounts. Fixture: ${fixtureNo}; Vessel: ${voyage.vessel}; Voyage: ${voyage.id}; Amount: ${money(total)}.`, 'Accounts');
      }
    }
  };
  const deleteSelInvoices = () => { setFL({ invoices: fl.invoices.filter((x) => !selInvoices.has(x.id)) }); setSelInvoices(new Set()); };
  const duplicateSelInvoices = () => {
    const copies = fl.invoices.filter((x) => selInvoices.has(x.id)).map((x) => ({ ...x, id: uid('inv'), title: `${x.title} (copy)`, status: 'Draft' }));
    setFL({ invoices: [...fl.invoices, ...copies] });
    setSelInvoices(new Set());
  };
  const pdfSelInvoices = () => {
    const sel = fl.invoices.filter((x) => selInvoices.has(x.id));
    if (sel.length === 0) return;
    printSections(`Invoices — ${recap.vesselName}`, sel.map((x) => invoicePdfSection(x, recap, voyage, fl.laytimes, settlement.claims)).join(''));
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
  const advanceLaytime = (id: string, to: HireStatus | 'Approved & Sent for Payment') => {
    saveLaytime(id, { status: to as HireStatus });
    const port = fl.laytimes.find((x) => x.id === id);
    if (!port) return;
    if (to === 'Sent For Approval') {
      addNotification(`Laytime calculation for ${port.name || port.op} on ${voyage.vessel} is ready for manager review and approval.`, 'Manager');
    } else if (to === 'Approved') {
      addNotification(`Laytime calculation for ${port.name || port.op} on ${voyage.vessel} was approved by the manager.`, module);
    } else if (to === 'Sent For Payment') {
      const result = calcLaytime(port);
      sendPayable(port.id, port.accountName || recap.charterers, `LAY-${voyage.id}-${port.id}`, Math.max(0, result.demurrageAmt - result.despatchAmt), port.completed, 'Demurrage');
      addNotification(`Laytime calculation for ${port.name || port.op} sent to Accounts. Fixture: ${fixtureNo}; Vessel: ${voyage.vessel}; Voyage: ${voyage.id}.`, 'Accounts');
    }
  };
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

  const seededSettlement = useMemo(() => seedFreightSettlement(voyage, recap), [voyage.id, voyage.portFrom, voyage.portTo, recap.loadPort, recap.dischargePort]);
  const settlement = fl.settlement ?? seededSettlement;
  useEffect(() => {
    if (!fl.settlement) setFL({ settlement: seededSettlement });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fl.settlement, seededSettlement]);

  const setSettlement = (patch: Partial<FreightSettlementData>) => setFL({ settlement: { ...settlement, ...patch } });

  const [selPda, setSelPda] = useState<Set<string>>(new Set());
  const [selAgentInv, setSelAgentInv] = useState<Set<string>>(new Set());
  const [selServices, setSelServices] = useState<Set<string>>(new Set());
  const [agentServiceCreateType, setAgentServiceCreateType] = useState<'invoice' | 'service' | null>(null);
  useEffect(() => { setAgentServiceCreateType(null); }, [voyage.id]);
  const [pdaId, setPdaId] = useState<string | null>(null);
  const [agentInvId, setAgentInvId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [pdaStatusOpen, setPdaStatusOpen] = useState(false);
  const [pdaStatusValue, setPdaStatusValue] = useState('Approved');
  const [agentServiceStatusOpen, setAgentServiceStatusOpen] = useState(false);
  const [agentServiceStatusValue, setAgentServiceStatusValue] = useState('Requested');

  const fmtAmt = (n: number) => n.toLocaleString('en-US');
  const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const pdaTotal = settlement.pda.reduce((s, x) => s + x.estimated, 0);
  const fdaTotal = settlement.pda.reduce((s, x) => s + (x.fdaFinal || x.estimated), 0);
  const servicesTotal = settlement.services.reduce((s, x) => s + x.cost + x.tax, 0);

  const openFirstSelected = (ids: Set<string>) => Array.from(ids)[0] ?? null;

  const addPda = () => {
    const row: PdaRow = { id: uid('pda'), port: '', agent: '', due: '', currency: 'USD', estimated: 0, advance: 0, fdaFinal: 0, status: 'Requested', fdaStatus: 'Requested', paymentStatus: 'Pending', approval: 'Pending', attachments: [] };
    setSettlement({ pda: [...settlement.pda, row] });
    setPdaId(row.id);
  };
  const savePda = (id: string, patch: Partial<PdaRow>) => setSettlement({ pda: settlement.pda.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const deleteSelPda = () => { setSettlement({ pda: settlement.pda.filter((x) => !selPda.has(x.id)) }); setSelPda(new Set()); };
  const copySelPda = () => { setSettlement({ pda: [...settlement.pda, ...settlement.pda.filter((x) => selPda.has(x.id)).map((x) => ({ ...x, id: uid('pda'), status: 'Requested', fdaStatus: 'Requested', paymentStatus: 'Pending', approval: 'Pending' }))] }); setSelPda(new Set()); };
  const updateSelPdaStatus = () => {
    setPdaStatusValue('Approved');
    setPdaStatusOpen(true);
  };
  const applySelPdaStatus = () => {
    setSettlement({ pda: settlement.pda.map((x) => (selPda.has(x.id) ? { ...x, status: pdaStatusValue } : x)) });
    setPdaStatusOpen(false);
  };
  const pdfSelPda = () => {
    const rows = settlement.pda.filter((x) => selPda.has(x.id));
    if (rows.length === 0) return;
    const body = rows.map((r) => `<tr><td>${esc(r.port)}</td><td>${esc(r.agent)}</td><td>${esc(r.currency)}</td><td class="r">${fmtAmt(r.estimated)}</td><td class="r">${fmtAmt(r.advance)}</td><td class="r">${fmtAmt(r.fdaFinal)}</td><td>${esc(r.fdaStatus || (r.fdaFinal ? 'Received' : 'Pending'))}</td><td>${esc(r.paymentStatus || (r.advance >= (r.fdaFinal || r.estimated) ? 'Paid' : r.advance > 0 ? 'Partially Paid' : 'Not Paid'))}</td><td>${esc(r.approval)}</td></tr>`).join('');
    const banks = rows.map((r) => accountBoxHtml('Payee Account Details', r.agent || 'Agent', findClientBankByName(r.agent))).join('');
    printSections(`PDA-FDA — ${recap.vesselName}`, `<section><h1>PDA / FDA</h1><table><thead><tr><th>Port</th><th>Agent</th><th>Cur</th><th class="r">PDA</th><th class="r">Advance</th><th class="r">FDA</th><th>Status</th><th>Payment Status</th><th>Approval</th></tr></thead><tbody>${body}</tbody></table>${banks}</section>`);
  };

  const addAgentInv = () => {
    const row: AgentInvoiceRow = { id: uid('agi'), invoiceNo: '', vendor: '', category: '', port: '', due: '', currency: 'USD', amount: 0, approved: 0, paid: 0, dept: 'Pending', accounts: '-', status: 'Requested', paymentStatus: 'Pending', attachments: [] };
    setSettlement({ agentInvoices: [...settlement.agentInvoices, row] });
    setAgentInvId(row.id);
  };
  const saveAgentInv = (id: string, patch: Partial<AgentInvoiceRow>) => setSettlement({ agentInvoices: settlement.agentInvoices.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const copySelAgentInv = () => { setSettlement({ agentInvoices: [...settlement.agentInvoices, ...settlement.agentInvoices.filter((x) => selAgentInv.has(x.id)).map((x) => ({ ...x, id: uid('agi'), status: 'Requested', paymentStatus: 'Pending' }))] }); setSelAgentInv(new Set()); };

  const addService = () => {
    const row: ServiceRow = { id: uid('srv'), service: '', vendor: '', invoice: '', currency: 'USD', cost: 0, tax: 0, reason: '', status: 'Requested', paymentStatus: 'Pending', attachments: [] };
    setSettlement({ services: [...settlement.services, row] });
    setServiceId(row.id);
  };
  const saveService = (id: string, patch: Partial<ServiceRow>) => setSettlement({ services: settlement.services.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const copySelServices = () => { setSettlement({ services: [...settlement.services, ...settlement.services.filter((x) => selServices.has(x.id)).map((x) => ({ ...x, id: uid('srv'), status: 'Requested', paymentStatus: 'Pending' }))] }); setSelServices(new Set()); };

  const hasAgentServiceSelection = selAgentInv.size > 0 || selServices.size > 0;
  const addAgentService = () => {
    if (agentServiceCreateType === 'service') addService();
    else if (agentServiceCreateType === 'invoice') addAgentInv();
  };
  const editAgentService = () => {
    if (selAgentInv.size > 0) { setAgentInvId(openFirstSelected(selAgentInv)); return; }
    if (selServices.size > 0) { setServiceId(openFirstSelected(selServices)); }
  };
  const copyAgentService = () => {
    if (selAgentInv.size > 0) copySelAgentInv();
    if (selServices.size > 0) copySelServices();
  };
  const deleteAgentService = () => {
    if (selAgentInv.size > 0) {
      setSettlement({ agentInvoices: settlement.agentInvoices.filter((x) => !selAgentInv.has(x.id)) });
      setSelAgentInv(new Set());
    }
    if (selServices.size > 0) {
      setSettlement({ services: settlement.services.filter((x) => !selServices.has(x.id)) });
      setSelServices(new Set());
    }
  };
  const updateAgentServiceStatus = () => {
    setAgentServiceStatusValue('Requested');
    setAgentServiceStatusOpen(true);
  };
  const applyAgentServiceStatus = () => {
    if (selAgentInv.size > 0) {
      setSettlement({ agentInvoices: settlement.agentInvoices.map((x) => (selAgentInv.has(x.id) ? { ...x, status: agentServiceStatusValue } : x)) });
    }
    if (selServices.size > 0) {
      setSettlement({ services: settlement.services.map((x) => (selServices.has(x.id) ? { ...x, status: agentServiceStatusValue } : x)) });
    }
    setAgentServiceStatusOpen(false);
  };
  const pdfAgentService = () => {
    const invRows = settlement.agentInvoices.filter((x) => selAgentInv.has(x.id));
    const srvRows = settlement.services.filter((x) => selServices.has(x.id));
    if (invRows.length === 0 && srvRows.length === 0) return;
    const invBody = invRows.map((r) => `<tr><td>${esc(r.invoiceNo)}</td><td>${esc(r.vendor)}</td><td>${esc(r.category)}</td><td>${esc(r.port)}</td><td class="r">${fmtAmt(r.amount)}</td><td class="r">${fmtAmt(r.approved)}</td><td class="r">${fmtAmt(r.paid)}</td><td>${esc(r.status)}</td></tr>`).join('');
    const srvBody = srvRows.map((r) => `<tr><td>${esc(r.service)}</td><td>${esc(r.vendor)}</td><td>${esc(r.invoice)}</td><td class="r">${fmtAmt(r.cost)}</td><td class="r">${fmtAmt(r.tax)}</td><td class="r">${fmtAmt(r.cost + r.tax)}</td><td>${esc(r.status)}</td></tr>`).join('');
    const invBanks = invRows.map((r) => accountBoxHtml('Payee Account Details', r.vendor || 'Vendor', findClientBankByName(r.vendor))).join('');
    const srvBanks = srvRows.map((r) => accountBoxHtml('Payee Account Details', r.vendor || 'Vendor', findClientBankByName(r.vendor))).join('');
    const sections = `${invRows.length > 0 ? `<section><h1>Agent Invoices</h1><table><thead><tr><th>Invoice</th><th>Vendor</th><th>Category</th><th>Port</th><th class="r">Amount</th><th class="r">Approved</th><th class="r">Paid</th><th>Status</th></tr></thead><tbody>${invBody}</tbody></table>${invBanks}</section>` : ''}${srvRows.length > 0 ? `<section><h1>Additional Services</h1><table><thead><tr><th>Service</th><th>Vendor</th><th>Invoice</th><th class="r">Cost</th><th class="r">Tax</th><th class="r">Total</th><th>Status</th></tr></thead><tbody>${srvBody}</tbody></table>${srvBanks}</section>` : ''}`;
    printSections(`Agent Invoices & Services — ${recap.vesselName}`, sections);
  };

  const sendSelectedPdaToAccounts = () => {
    const sent = settlement.pda
      .filter((x) => selPda.has(x.id))
      .filter((x) => sendPayable(x.id, x.agent, `${x.fdaFinal ? 'FDA' : 'PDA'}-${voyage.id}-${x.id}`, Math.max(0, (x.fdaFinal || x.estimated) - x.advance), x.due || '', x.fdaFinal ? 'FDA' : 'PDA')).length;
    if (sent > 0) addNotification(`Selected PDA/FDA payments for ${voyage.vessel} sent to Accounts.`, 'Accounts');
  };
  const sendSelectedAgentInvoicesToAccounts = () => {
    const sent = settlement.agentInvoices
      .filter((x) => selAgentInv.has(x.id))
      .filter((x) => sendPayable(x.id, x.vendor, x.invoiceNo || `AGT-${x.id}`, Math.max(0, (x.approved || x.amount) - x.paid), x.due, /fda/i.test(x.category) ? 'FDA' : 'Agency')).length;
    if (sent > 0) addNotification(`Selected agent invoices for ${voyage.vessel} sent to Accounts.`, 'Accounts');
  };
  const sendSelectedServicesToAccounts = () => {
    const sent = settlement.services
      .filter((x) => selServices.has(x.id))
      .filter((x) => sendPayable(x.id, x.vendor, x.invoice || `SRV-${x.id}`, x.cost + x.tax, '', 'Agency')).length;
    if (sent > 0) addNotification(`Selected services for ${voyage.vessel} sent to Accounts.`, 'Accounts');
  };
  const openPda = settlement.pda.find((x) => x.id === pdaId) ?? null;
  const openAgentInv = settlement.agentInvoices.find((x) => x.id === agentInvId) ?? null;
  const openService = settlement.services.find((x) => x.id === serviceId) ?? null;

  const sendPayable = (id: string, supplier: string, invoiceNo: string, amount: number, dueDate: string, category: 'PDA' | 'FDA' | 'Agency' | 'Claims' | 'Freight' | 'Demurrage') => {
    if (amount <= 0) return false;
    const payee = supplier || 'Settlement counterparty';
    const bank = findClientBankByName(payee);
    if (!bank?.verified) {
      window.alert(`Cannot send ${invoiceNo} to Accounts. Bank account details for "${payee}" are missing or not verified.`);
      return false;
    }
    addPayable({
      reference: `${voyage.id}-${id}`,
      vessel: voyage.vessel,
      voyage: voyage.id,
      supplier: payee,
      invoiceNo,
      amount,
      currency: 'USD',
      dueDate: dueDate || '—',
      module,
      category,
      bank: 'Verified account details on file',
      remarks: `Verified payment account: ${(bank.details || bank.accountHolder || payee).trim()}`,
    });
    return true;
  };
  const advanceSettlement = (kind: 'pda' | 'invoice' | 'service' | 'claim', id: string, to: HireStatus) => {
    if (to === 'Sent For Payment') {
      let sent = false;
      if (kind === 'pda') {
        const row = settlement.pda.find((x) => x.id === id);
        if (row) sent = sendPayable(row.id, row.agent, `${row.fdaFinal ? 'FDA' : 'PDA'}-${voyage.id}-${row.id}`, Math.max(0, (row.fdaFinal || row.estimated) - row.advance), row.due || '', row.fdaFinal ? 'FDA' : 'PDA');
      } else if (kind === 'invoice') {
        const row = fl.invoices.find((x) => x.id === id);
        if (row) { const { total } = calcInvoice(row, recap, fl.laytimes, settlement.claims); sent = sendPayable(row.id, row.invoiceTo, `INV-${voyage.id}-${row.id}`, Math.max(0, total), row.dueDate, 'Agency'); }
      } else if (kind === 'service') {
        const row = settlement.services.find((x) => x.id === id);
        if (row) sent = sendPayable(row.id, row.vendor, row.invoice || `SRV-${row.id}`, row.cost + row.tax, '', 'Agency');
      } else {
        const row = settlement.claims.find((x) => x.id === id);
        if (row) sent = sendPayable(row.id, claimChargeTo(row), `CLM-${voyage.id}-${row.id}`, Math.max(0, row.amount - (row.settlement || 0)), row.due || '', 'Claims');
      }
      if (!sent) return;
    }
    if (kind === 'pda') setSettlement({ pda: settlement.pda.map((x) => x.id === id ? { ...x, workflowStatus: to } : x) });
    if (kind === 'invoice') setFL({ invoices: fl.invoices.map((x) => x.id === id ? { ...x, status: x.status, workflowStatus: to } : x) });
    if (kind === 'service') setSettlement({ services: settlement.services.map((x) => x.id === id ? { ...x, workflowStatus: to } : x) });
    if (kind === 'claim') setSettlement({ claims: settlement.claims.map((x) => x.id === id ? { ...x, workflowStatus: to } : x) });
    if (to === 'Sent For Approval') {
      addNotification(`${kind} payment for ${voyage.vessel} is ready for manager review and approval. Voyage: ${voyage.id}.`, 'Manager');
      return;
    }
    if (to === 'Approved') {
      addNotification(`${kind} payment for ${voyage.vessel} was approved by the manager and is ready to send to Accounts.`, module);
      return;
    }
    if (to !== 'Sent For Payment') return;
    addNotification(`${kind} payment sent to Accounts. Fixture: ${fixtureNo}; Vessel: ${voyage.vessel}; Voyage: ${voyage.id}.`, 'Accounts');
  };
  const settlementActions = (kind: 'pda' | 'invoice' | 'service' | 'claim', id: string, workflowStatus: HireStatus = 'Draft') => (
    <span className="fv-ops__hire-actions">
      {workflowStatus === 'Draft' && <button type="button" className="fv-ops__btn" onClick={() => kind === 'invoice' ? advanceInvoice(id, 'Sent For Approval') : advanceSettlement(kind, id, 'Sent For Approval')}><i className="fas fa-paper-plane" aria-hidden="true" /> Send for Approval</button>}
      {workflowStatus === 'Sent For Approval' && canApproveHire && <>
        <button type="button" className="fv-ops__btn fv-ops__btn--go" onClick={() => kind === 'invoice' ? advanceInvoice(id, 'Approved') : advanceSettlement(kind, id, 'Approved')}><i className="fas fa-user-check" aria-hidden="true" /> Approve</button>
        <button type="button" className="fv-ops__btn" onClick={() => kind === 'invoice' ? advanceInvoice(id, 'Draft') : advanceSettlement(kind, id, 'Draft')}><i className="fas fa-rotate-left" aria-hidden="true" /> Reject</button>
      </>}
      {workflowStatus === 'Approved' && <button type="button" className="fv-ops__btn fv-ops__btn--go" onClick={() => kind === 'invoice' ? advanceInvoice(id, 'Sent For Payment') : advanceSettlement(kind, id, 'Sent For Payment')}><i className="fas fa-paper-plane" aria-hidden="true" /> Send for Payment</button>}
      {workflowStatus === 'Sent For Payment' && canApproveHire && <button type="button" className="fv-ops__btn" onClick={() => kind === 'invoice' ? advanceInvoice(id, 'Approved') : advanceSettlement(kind, id, 'Approved')} title="Manager unlock"><i className="fas fa-lock-open" aria-hidden="true" /> Unlock</button>}
    </span>
  );
  useEffect(() => {
    if (hasVoyageLeg) return;
    setInvoiceId(null);
    setLaytimeId(null);
    setSelInvoices(new Set());
    setSelLaytimes(new Set());
  }, [hasVoyageLeg]);

  return (
    <>
    <div className="fv-ops__frl">
      {/* ---------------------------------------------------------- Invoices list */}
      {(section === 'all' || section === 'freight') && hasVoyageLeg && <Card title="Freight Invoice" icon="fa-file-invoice-dollar" wide
        right={
          <span className="fv-ops__frl-secbtns">
            <button type="button" className="fv-ops__btn" onClick={() => addInvoice('Freight')}><i className="fas fa-plus" aria-hidden="true" /> Freight Invoice</button>
            <button type="button" className="fv-ops__btn" onClick={() => addInvoice('Demurrage')}><i className="fas fa-plus" aria-hidden="true" /> Demurrage Invoice</button>
            <button type="button" className="fv-ops__btn" onClick={duplicateSelInvoices} disabled={selInvoices.size === 0} title="Duplicate selected invoices"><i className="fas fa-copy" aria-hidden="true" /> Duplicate{selInvoices.size > 0 ? ` (${selInvoices.size})` : ''}</button>
            <button type="button" className="fv-ops__btn" onClick={pdfSelInvoices} disabled={selInvoices.size === 0} title="Generate PDF of selected invoices"><i className="fas fa-file-pdf" aria-hidden="true" /> PDF{selInvoices.size > 0 ? ` (${selInvoices.size})` : ''}</button>
            <button type="button" className="fv-ops__btn" onClick={deleteSelInvoices} disabled={selInvoices.size === 0} title="Delete selected invoices"><i className="fas fa-trash" aria-hidden="true" /> Delete{selInvoices.size > 0 ? ` (${selInvoices.size})` : ''}</button>
            <button type="button" className={`fv-ops__btn${copiedInvoices ? '' : ' fv-ops__btn--primary'}`} onClick={copyInvoicesToPostfix} disabled={copiedInvoices} title="Send freight invoices to Postfix department"><i className={`fas ${copiedInvoices ? 'fa-circle-check' : 'fa-share-from-square'}`} aria-hidden="true" /> {copiedInvoices ? 'Sent to Postfix' : 'Copy to Postfix'}</button>
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
              <th>Invoice</th><th>No.</th><th>Invoice To</th><th>Date</th><th className="fv-ops__r">Amount (US$)</th><th>Status</th><th>Payment Status</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {fl.invoices.length === 0 && <tr><td colSpan={9} className="fv-ops__vd-empty">No invoices yet. Use “Freight Invoice” or “Demurrage Invoice” to add one.</td></tr>}
            {fl.invoices.map((inv) => {
              const { total } = calcInvoice(inv, recap, fl.laytimes, settlement.claims);
              return (
                <tr key={inv.id}>
                  <td className="fv-ops__hire-selcol"><input type="checkbox" aria-label={`Select ${inv.title}`} checked={selInvoices.has(inv.id)} onChange={() => toggleInv(inv.id)} /></td>
                  <td><button type="button" className="fv-ops__hire-namebtn" onClick={() => setInvoiceId(inv.id)}>{inv.title || `${inv.freightType} Freight Invoice`}</button></td>
                  <td>{inv.invoiceNo}</td>
                  <td>{inv.invoiceTo || '—'}</td>
                  <td>{inv.invoiceDate || '—'}</td>
                  <td className="fv-ops__r">{money(total)}</td>
                  <td><span className={`fv-ops__pill fv-ops__pill--${freightStatusPill(inv.workflowStatus || inv.status)}`}>{inv.workflowStatus || inv.status}</span></td>
                  <td><span className={`fv-ops__pill fv-ops__pill--${invoicePaymentStatus(inv) === 'Paid' ? 'green' : 'amber'}`}>{invoicePaymentStatus(inv)}</span></td>
                  <td className="fv-ops__r">
                    <span className="fv-ops__hire-actions">
                      {settlementActions('invoice', inv.id, inv.workflowStatus)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>}

      {/* --------------------------------------------------- Laytime Calculations */}
      {(section === 'all' || section === 'freight') && hasVoyageLeg && <Card title="Laytime Calculations" icon="fa-hourglass-half" wide
        right={
          <span className="fv-ops__frl-secbtns">
            <button type="button" className="fv-ops__btn" onClick={() => addLaytime('Load')}><i className="fas fa-plus" aria-hidden="true" /> Load Port</button>
            <button type="button" className="fv-ops__btn" onClick={() => addLaytime('Discharge')}><i className="fas fa-plus" aria-hidden="true" /> Discharge Port</button>
            <button type="button" className="fv-ops__btn" onClick={duplicateSelLaytimes} disabled={selLaytimes.size === 0} title="Duplicate selected laytime calculations"><i className="fas fa-copy" aria-hidden="true" /> Duplicate{selLaytimes.size > 0 ? ` (${selLaytimes.size})` : ''}</button>
            <button type="button" className="fv-ops__btn" onClick={pdfSelLaytimes} disabled={selLaytimes.size === 0} title="Generate PDF of selected laytime calculations"><i className="fas fa-file-pdf" aria-hidden="true" /> PDF{selLaytimes.size > 0 ? ` (${selLaytimes.size})` : ''}</button>
            <button type="button" className="fv-ops__btn" onClick={deleteSelLaytimes} disabled={selLaytimes.size === 0} title="Delete selected laytime calculations"><i className="fas fa-trash" aria-hidden="true" /> Delete{selLaytimes.size > 0 ? ` (${selLaytimes.size})` : ''}</button>
            <button type="button" className={`fv-ops__btn${copiedLaytime ? '' : ' fv-ops__btn--primary'}`} onClick={copyLaytimeCalcToPostfix} disabled={copiedLaytime} title="Send laytime calculations to Postfix department"><i className={`fas ${copiedLaytime ? 'fa-circle-check' : 'fa-share-from-square'}`} aria-hidden="true" /> {copiedLaytime ? 'Sent to Postfix' : 'Copy to Postfix'}</button>
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
              <th>Port</th><th>Account</th><th>Operation</th><th className="fv-ops__r">Allowed (d)</th><th className="fv-ops__r">Used (d)</th><th>Result</th><th className="fv-ops__r">Amount (US$)</th><th>Status</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {fl.laytimes.length === 0 && <tr><td colSpan={10} className="fv-ops__vd-empty">No laytime calculations yet. Use “Load Port” or “Discharge Port” to add one.</td></tr>}
            {fl.laytimes.map((p) => {
              const r = calcLaytime(p);
              const status = p.status ?? 'Draft';
              return (
                <tr key={p.id}>
                  <td className="fv-ops__hire-selcol"><input type="checkbox" aria-label={`Select ${p.name || 'port'}`} checked={selLaytimes.has(p.id)} onChange={() => toggleLay(p.id)} /></td>
                  <td><button type="button" className="fv-ops__hire-namebtn" onClick={() => setLaytimeId(p.id)}>{p.name || 'New Port'}</button></td>
                  <td>{p.accountName || '—'}</td>
                  <td>{p.op}</td>
                  <td className="fv-ops__r">{fmt(r.allowed, 3)}</td>
                  <td className="fv-ops__r">{fmt(r.used, 3)}</td>
                  <td className={r.onDemurrage ? 'fv-ops__neg' : 'fv-ops__pos'}>{r.onDemurrage ? 'Demurrage' : 'Despatch'}</td>
                  <td className={`fv-ops__r ${r.onDemurrage ? 'fv-ops__neg' : 'fv-ops__pos'}`}>{r.onDemurrage ? money(r.demurrageAmt) : `-${money(r.despatchAmt)}`}</td>
                  <td><span className={`fv-ops__pill fv-ops__pill--${freightStatusPill(status)}`}>{status}</span></td>
                  <td className="fv-ops__r">
                    <span className="fv-ops__hire-actions">
                      {status === 'Draft' && <button type="button" className="fv-ops__btn" onClick={() => advanceLaytime(p.id, 'Sent For Approval')}><i className="fas fa-paper-plane" aria-hidden="true" /> Send for Approval &amp; Payment</button>}
                      {status === 'Sent For Approval' && canApproveHire && <>
                        <button type="button" className="fv-ops__btn fv-ops__btn--go" onClick={() => advanceLaytime(p.id, 'Approved')}><i className="fas fa-user-check" aria-hidden="true" /> Approve</button>
                        <button type="button" className="fv-ops__btn" onClick={() => advanceLaytime(p.id, 'Draft')}><i className="fas fa-rotate-left" aria-hidden="true" /> Reject</button>
                      </>}
                      {status === 'Approved' && <button type="button" className="fv-ops__btn fv-ops__btn--go" onClick={() => advanceLaytime(p.id, 'Sent For Payment')}><i className="fas fa-paper-plane" aria-hidden="true" /> Send for Payment</button>}
                      {status === 'Sent For Payment' && canApproveHire && <button type="button" className="fv-ops__btn" onClick={() => advanceLaytime(p.id, 'Approved')} title="Manager unlock"><i className="fas fa-lock-open" aria-hidden="true" /> Unlock</button>}
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
      </Card>}

      {(section === 'all' || section === 'pda-services') && <Card
        title="PDA / FDA"
        icon="fa-file-circle-check"
        wide
        right={(
          <span className="fv-ops__frl-secbtns">
            <button type="button" className="fv-ops__btn" onClick={addPda}><i className="fas fa-plus" aria-hidden="true" /> New</button>
            <button type="button" className="fv-ops__btn" onClick={() => setPdaId(openFirstSelected(selPda))} disabled={selPda.size === 0}><i className="fas fa-pen" aria-hidden="true" /> Edit</button>
            <button type="button" className="fv-ops__btn" onClick={copySelPda} disabled={selPda.size === 0}><i className="fas fa-copy" aria-hidden="true" /> Copy</button>
            <button type="button" className="fv-ops__btn" onClick={deleteSelPda} disabled={selPda.size === 0}><i className="fas fa-trash" aria-hidden="true" /> Delete</button>
            <button type="button" className="fv-ops__btn" onClick={pdfSelPda} disabled={selPda.size === 0}><i className="fas fa-file-pdf" aria-hidden="true" /> Pdf</button>
            <button type="button" className="fv-ops__btn" onClick={updateSelPdaStatus} disabled={selPda.size === 0}><i className="fas fa-rotate" aria-hidden="true" /> Status</button>
            <button type="button" className="fv-ops__btn fv-ops__btn--primary" onClick={sendSelectedPdaToAccounts} disabled={selPda.size === 0}><i className="fas fa-paper-plane" aria-hidden="true" /> Send to Accounts</button>
          </span>
        )}
      >
        <div className="fv-ops__frl-box">
          <div className="fv-ops__frl-box-title">PDA Summary</div>
          <table className="fv-ops__table">
          <thead>
            <tr><th className="fv-ops__hire-selcol"><input type="checkbox" aria-label="Select all PDA rows" checked={settlement.pda.length > 0 && settlement.pda.every((x) => selPda.has(x.id))} ref={(el) => { if (el) el.indeterminate = selPda.size > 0 && !settlement.pda.every((x) => selPda.has(x.id)); }} onChange={(e) => setSelPda(e.target.checked ? new Set(settlement.pda.map((x) => x.id)) : new Set())} /></th><th>Port</th><th>Agent</th><th>Due</th><th>Cur.</th><th className="fv-ops__r">PDA</th><th className="fv-ops__r">Advance</th><th className="fv-ops__r">Outstanding</th><th>Attachment</th><th>Status</th><th>Payment Status</th><th>Approval</th><th>Action</th></tr>
          </thead>
          <tbody>
            {settlement.pda.map((p) => (
              <tr key={p.id}>
                <td className="fv-ops__hire-selcol"><input type="checkbox" aria-label={`Select ${p.port || 'PDA row'}`} checked={selPda.has(p.id)} onChange={() => setSelPda((prev) => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} /></td>
                <td><button type="button" className="fv-ops__hire-namebtn" onClick={() => setPdaId(p.id)}>{p.port || 'Open'}</button></td>
                <td>{p.agent}</td>
                <td>{p.due || '—'}</td>
                <td>{p.currency}</td>
                <td className="fv-ops__r">{fmtAmt(p.estimated)}</td>
                <td className="fv-ops__r">{fmtAmt(p.advance)}</td>
                <td className="fv-ops__r">{fmtAmt(p.estimated - p.advance)}</td>
                <td>{attachmentStatusLabel(p.attachments)}</td>
                <td><span className="fv-ops__pill fv-ops__pill--blue">{p.workflowStatus || p.status}</span></td>
                <td><span className={`fv-ops__pill fv-ops__pill--${p.paymentStatus === 'Paid' ? 'green' : 'amber'}`}>{p.paymentStatus || 'Pending'}</span></td>
                <td><span className={`fv-ops__pill fv-ops__pill--${p.approval === 'Approved' ? 'green' : 'amber'}`}>{p.approval}</span></td>
                <td>{settlementActions('pda', p.id, p.workflowStatus)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="fv-ops__row-sub"><td colSpan={5}>Total PDA</td><td className="fv-ops__r">{fmtAmt(pdaTotal)}</td><td className="fv-ops__r">{fmtAmt(settlement.pda.reduce((s, p) => s + p.advance, 0))}</td><td colSpan={6} /></tr>
          </tfoot>
          </table>
        </div>
        <div className="fv-ops__frl-box fv-ops__frl-box--spaced">
          <div className="fv-ops__frl-box-title">FDA Variance</div>
          <table className="fv-ops__table">
          <thead>
            <tr><th className="fv-ops__hire-selcol"><input type="checkbox" aria-label="Select all FDA rows" checked={settlement.pda.length > 0 && settlement.pda.every((x) => selPda.has(x.id))} ref={(el) => { if (el) el.indeterminate = selPda.size > 0 && !settlement.pda.every((x) => selPda.has(x.id)); }} onChange={(e) => setSelPda(e.target.checked ? new Set(settlement.pda.map((x) => x.id)) : new Set())} /></th><th>Port</th><th className="fv-ops__r">PDA</th><th className="fv-ops__r">FDA</th><th className="fv-ops__r">Variance</th><th className="fv-ops__r">Balance</th><th>Attachment</th><th>Status</th><th>Payment Status</th><th>Action</th></tr>
          </thead>
          <tbody>
            {settlement.pda.map((p) => {
              const fda = p.fdaFinal || 0;
              const variance = fda ? fda - p.estimated : 0;
              const balance = fda ? fda - p.advance : 0;
              return (
                <tr key={`${p.id}-fda`}>
                  <td className="fv-ops__hire-selcol"><input type="checkbox" aria-label={`Select ${p.port || 'FDA row'}`} checked={selPda.has(p.id)} onChange={() => setSelPda((prev) => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} /></td>
                  <td><button type="button" className="fv-ops__hire-namebtn" onClick={() => setPdaId(p.id)}>{p.port || 'Open'}</button></td>
                  <td className="fv-ops__r">{fmtAmt(p.estimated)}</td>
                  <td className="fv-ops__r">{fda ? fmtAmt(fda) : '-'}</td>
                  <td className={`fv-ops__r${variance > 0 ? ' fv-ops__neg' : variance < 0 ? ' fv-ops__pos' : ''}`}>{fda ? `${variance >= 0 ? '+' : ''}${fmtAmt(variance)}` : '-'}</td>
                  <td className={`fv-ops__r${balance < 0 ? ' fv-ops__neg' : ''}`}>{fda ? fmtAmt(balance) : '-'}</td>
                  <td>{attachmentStatusLabel(p.attachments)}</td>
                  <td><span className="fv-ops__pill fv-ops__pill--blue">{p.workflowStatus || p.fdaStatus || (fda ? 'Received' : 'Pending')}</span></td>
                  <td><span className={`fv-ops__pill fv-ops__pill--${(p.paymentStatus || (p.advance >= (fda || p.estimated) ? 'Paid' : p.advance > 0 ? 'Partially Paid' : 'Not Paid')) === 'Paid' ? 'green' : 'amber'}`}>{p.paymentStatus || (p.advance >= (fda || p.estimated) ? 'Paid' : p.advance > 0 ? 'Partially Paid' : 'Not Paid')}</span></td>
                  <td>{settlementActions('pda', p.id, p.workflowStatus)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="fv-ops__row-sub"><td colSpan={2}>FDA Total</td><td className="fv-ops__r">{fmtAmt(pdaTotal)}</td><td className="fv-ops__r">{fmtAmt(fdaTotal)}</td><td colSpan={6} /></tr>
          </tfoot>
          </table>
        </div>
      </Card>}

      {(section === 'all' || section === 'pda-services') && <Card
        title="Agent Invoice & Services"
        icon="fa-file-invoice-dollar"
        wide
        right={(
          <span className="fv-ops__frl-secbtns">
            <button type="button" className="fv-ops__btn" onClick={addAgentService} disabled={!agentServiceCreateType}><i className="fas fa-plus" aria-hidden="true" /> New</button>
            <button type="button" className="fv-ops__btn" onClick={editAgentService} disabled={!hasAgentServiceSelection}><i className="fas fa-pen" aria-hidden="true" /> Edit</button>
            <button type="button" className="fv-ops__btn" onClick={copyAgentService} disabled={!hasAgentServiceSelection}><i className="fas fa-copy" aria-hidden="true" /> Copy</button>
            <button type="button" className="fv-ops__btn" onClick={deleteAgentService} disabled={!hasAgentServiceSelection}><i className="fas fa-trash" aria-hidden="true" /> Delete</button>
            <button type="button" className="fv-ops__btn" onClick={pdfAgentService} disabled={!hasAgentServiceSelection}><i className="fas fa-file-pdf" aria-hidden="true" /> Pdf</button>
            <button type="button" className="fv-ops__btn" onClick={updateAgentServiceStatus} disabled={!hasAgentServiceSelection}><i className="fas fa-rotate" aria-hidden="true" /> Status</button>
            <button type="button" className="fv-ops__btn fv-ops__btn--primary" onClick={() => { sendSelectedAgentInvoicesToAccounts(); sendSelectedServicesToAccounts(); }} disabled={!hasAgentServiceSelection}><i className="fas fa-paper-plane" aria-hidden="true" /> Send to Accounts</button>
          </span>
        )}
      >
        <div className="fv-ops__frl-box">
          <div className="fv-ops__frl-box-title">Agent Invoices</div>
          <table className="fv-ops__table">
          <thead>
            <tr><th className="fv-ops__hire-selcol"><input type="checkbox" aria-label="Select all agent invoices" checked={agentServiceCreateType === 'invoice' || (settlement.agentInvoices.length > 0 && settlement.agentInvoices.every((x) => selAgentInv.has(x.id)))} ref={(el) => { if (el) el.indeterminate = agentServiceCreateType !== 'invoice' && selAgentInv.size > 0 && !settlement.agentInvoices.every((x) => selAgentInv.has(x.id)); }} onChange={(e) => { setAgentServiceCreateType(e.target.checked ? 'invoice' : null); setSelAgentInv(e.target.checked ? new Set(settlement.agentInvoices.map((x) => x.id)) : new Set()); if (e.target.checked) setSelServices(new Set()); }} /></th><th>Invoice</th><th>Vendor</th><th>Category</th><th>Port</th><th>Due</th><th className="fv-ops__r">Amount</th><th className="fv-ops__r">Approved</th><th className="fv-ops__r">Paid</th><th className="fv-ops__r">Outstanding</th><th>Attachment</th><th>Dept</th><th>Accounts</th><th>Status</th><th>Payment Status</th><th>Action</th></tr>
          </thead>
          <tbody>
            {settlement.agentInvoices.map((i) => {
              const outstanding = (i.approved || i.amount) - i.paid;
              return (
                <tr key={i.id}>
                  <td className="fv-ops__hire-selcol"><input type="checkbox" aria-label={`Select ${i.invoiceNo || 'invoice'}`} checked={selAgentInv.has(i.id)} onChange={() => setSelAgentInv((prev) => { const n = new Set(prev); n.has(i.id) ? n.delete(i.id) : n.add(i.id); return n; })} /></td>
                  <td><button type="button" className="fv-ops__hire-namebtn" onClick={() => setAgentInvId(i.id)}>{i.invoiceNo || 'Open'}</button></td>
                  <td>{i.vendor}</td>
                  <td>{i.category}</td>
                  <td>{i.port}</td>
                  <td>{i.due}</td>
                  <td className="fv-ops__r">{fmtAmt(i.amount)}</td>
                  <td className="fv-ops__r">{fmtAmt(i.approved)}</td>
                  <td className="fv-ops__r">{fmtAmt(i.paid)}</td>
                  <td className={`fv-ops__r${outstanding > 0 ? ' fv-ops__neg' : ''}`}>{fmtAmt(outstanding)}</td>
                  <td>{attachmentStatusLabel(i.attachments)}</td>
                  <td><span className={`fv-ops__pill fv-ops__pill--${i.dept === 'Approved' ? 'green' : 'amber'}`}>{i.dept}</span></td>
                  <td><span className={`fv-ops__pill fv-ops__pill--${i.accounts === 'Paid' ? 'green' : i.accounts === 'Pending' ? 'amber' : 'blue'}`}>{i.accounts}</span></td>
                  <td><span className={`fv-ops__pill fv-ops__pill--${i.workflowStatus === 'Paid & Locked' || i.status === 'Closed' ? 'green' : 'amber'}`}>{i.workflowStatus || i.status}</span></td>
                  <td><span className={`fv-ops__pill fv-ops__pill--${i.paymentStatus === 'Paid' ? 'green' : 'amber'}`}>{i.paymentStatus || 'Pending'}</span></td>
                  <td>{settlementActions('invoice', i.id, i.workflowStatus)}</td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
        <div className="fv-ops__frl-box fv-ops__frl-box--spaced">
          <div className="fv-ops__frl-box-title">Services</div>
          <table className="fv-ops__table">
          <thead>
            <tr><th className="fv-ops__hire-selcol"><input type="checkbox" aria-label="Select all services" checked={agentServiceCreateType === 'service' || (settlement.services.length > 0 && settlement.services.every((x) => selServices.has(x.id)))} ref={(el) => { if (el) el.indeterminate = agentServiceCreateType !== 'service' && selServices.size > 0 && !settlement.services.every((x) => selServices.has(x.id)); }} onChange={(e) => { setAgentServiceCreateType(e.target.checked ? 'service' : null); setSelServices(e.target.checked ? new Set(settlement.services.map((x) => x.id)) : new Set()); if (e.target.checked) setSelAgentInv(new Set()); }} /></th><th>Service</th><th>Vendor</th><th>Invoice</th><th>Reason</th><th className="fv-ops__r">Cost</th><th className="fv-ops__r">Tax</th><th className="fv-ops__r">Total</th><th>Attachment</th><th>Status</th><th>Payment Status</th><th>Action</th></tr>
          </thead>
          <tbody>
            {settlement.services.map((s) => (
              <tr key={s.id}>
                <td className="fv-ops__hire-selcol"><input type="checkbox" aria-label={`Select ${s.service || 'service'}`} checked={selServices.has(s.id)} onChange={() => setSelServices((prev) => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })} /></td>
                <td><button type="button" className="fv-ops__hire-namebtn" onClick={() => setServiceId(s.id)}>{s.service || 'Open'}</button></td>
                <td>{s.vendor}</td>
                <td>{s.invoice}</td>
                <td>{s.reason}</td>
                <td className="fv-ops__r">{fmtAmt(s.cost)}</td>
                <td className="fv-ops__r">{fmtAmt(s.tax)}</td>
                <td className="fv-ops__r">{fmtAmt(s.cost + s.tax)}</td>
                <td>{attachmentStatusLabel(s.attachments)}</td>
                <td><span className={`fv-ops__pill fv-ops__pill--${s.workflowStatus === 'Paid & Locked' || s.status === 'Approved' ? 'green' : 'amber'}`}>{s.workflowStatus || s.status}</span></td>
                <td><span className={`fv-ops__pill fv-ops__pill--${s.paymentStatus === 'Paid' ? 'green' : 'amber'}`}>{s.paymentStatus || 'Pending'}</span></td>
                <td>{settlementActions('service', s.id, s.workflowStatus)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="fv-ops__row-sub"><td colSpan={8}>Additional Services Total</td><td className="fv-ops__r">{fmtAmt(servicesTotal)}</td><td colSpan={3} /></tr>
          </tfoot>
          </table>
        </div>
      </Card>}

    </div>

    {hasVoyageLeg && openInvoice && (
      <FreightInvoiceModal
        key={openInvoice.id}
        inv={openInvoice}
        recap={recap}
        voyage={voyage}
        laytimes={fl.laytimes}
        claims={settlement.claims}
        onSave={(patch) => saveInvoice(openInvoice.id, patch)}
        onDelete={() => { delInvoice(openInvoice.id); setInvoiceId(null); }}
        onClose={() => setInvoiceId(null)}
      />
    )}
    {hasVoyageLeg && openLaytime && (
      <LaytimeModal
        key={openLaytime.id}
        port={openLaytime}
        siblings={fl.laytimes}
        recap={recap}
        onSave={(patch) => saveLaytime(openLaytime.id, patch)}
        onDelete={() => { delLaytime(openLaytime.id); setLaytimeId(null); }}
        onClose={() => setLaytimeId(null)}
      />
    )}
    {openPda && (
      <PdaModal
        row={openPda}
        onSave={(patch) => savePda(openPda.id, patch)}
        onDelete={() => {
          setSettlement({ pda: settlement.pda.filter((x) => x.id !== openPda.id) });
          setSelPda((prev) => { const n = new Set(prev); n.delete(openPda.id); return n; });
          setPdaId(null);
        }}
        onClose={() => setPdaId(null)}
      />
    )}
    {openAgentInv && (
      <AgentInvoiceModal
        row={openAgentInv}
        onSave={(patch) => saveAgentInv(openAgentInv.id, patch)}
        onDelete={() => {
          setSettlement({ agentInvoices: settlement.agentInvoices.filter((x) => x.id !== openAgentInv.id) });
          setSelAgentInv((prev) => { const n = new Set(prev); n.delete(openAgentInv.id); return n; });
          setAgentInvId(null);
        }}
        onClose={() => setAgentInvId(null)}
      />
    )}
    {openService && (
      <ServiceModal
        row={openService}
        onSave={(patch) => saveService(openService.id, patch)}
        onDelete={() => {
          setSettlement({ services: settlement.services.filter((x) => x.id !== openService.id) });
          setSelServices((prev) => { const n = new Set(prev); n.delete(openService.id); return n; });
          setServiceId(null);
        }}
        onClose={() => setServiceId(null)}
      />
    )}
    {pdaStatusOpen && (
      <StatusPickerModal
        title="Update PDA / FDA Status"
        options={STATUS_OPTIONS_PDA}
        value={pdaStatusValue}
        onChange={setPdaStatusValue}
        onApply={applySelPdaStatus}
        onClose={() => setPdaStatusOpen(false)}
      />
    )}
    {agentServiceStatusOpen && (
      <StatusPickerModal
        title="Update Agent / Service Status"
        options={STATUS_OPTIONS_AGENT_SERVICE}
        value={agentServiceStatusValue}
        onChange={setAgentServiceStatusValue}
        onApply={applyAgentServiceStatus}
        onClose={() => setAgentServiceStatusOpen(false)}
      />
    )}
    </>
  );
}

function attachmentStatusLabel(attachments?: SettlementAttachment[]): string {
  const count = attachments?.length ?? 0;
  return count > 0 ? `Yes (${count})` : 'No';
}

function claimChargeTo(row: ClaimRow): string {
  return row.chargeTo || row.owner || '';
}

function claimOutstanding(row: ClaimRow): number {
  return Math.max(0, row.amount - row.settlement);
}

function claimForOwners(row: ClaimRow): boolean {
  return /owner/i.test(claimChargeTo(row));
}

function claimForCharterers(row: ClaimRow): boolean {
  return /charter/i.test(claimChargeTo(row));
}

function StatusPickerModal({
  title,
  options,
  value,
  onChange,
  onApply,
  onClose,
}: {
  title: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fv-ops__modal-overlay" onClick={onClose}>
      <div className="fv-ops__soa" onClick={(e) => e.stopPropagation()}>
        <div className="fv-ops__soa-head">
          <div>
            <h2>{title}</h2>
            <span className="fv-ops__soa-sub">Select a status and apply to selected rows.</span>
          </div>
          <div className="fv-ops__soa-headbtns">
            <button type="button" className="fv-ops__btn fv-ops__btn--go" onClick={onApply}><i className="fas fa-check" aria-hidden="true" /> Apply</button>
            <button type="button" className="fv-ops__icon-btn" onClick={onClose} aria-label="Close"><i className="fas fa-xmark" aria-hidden="true" /></button>
          </div>
        </div>
        <div className="fv-ops__soa-body">
          <div className="fv-ops__vd-fields">
            <label className="fv-ops__vd-field">
              <span>Status</span>
              <select className="fv-ops__vd-in" value={value} onChange={(e) => onChange(e.target.value)}>
                {options.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttachmentEditor({ attachments, onChange, kind, onExtract, onBusyChange, disabled }: {
  attachments: SettlementAttachment[]; onChange: (next: SettlementAttachment[]) => void;
  kind?: InvoiceDocumentKind; onExtract?: (fields: InvoiceDocumentFields) => void;
  onBusyChange?: (busy: boolean) => void; disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [documentKind, setDocumentKind] = useState(kind);
  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || busy || disabled) return;
    const uploaded = Array.from(files);
    const now = new Date().toISOString();
    const added = uploaded.map((f) => ({
      id: uid('att'),
      name: f.name,
      sizeKb: Math.max(1, Math.round(f.size / 1024)),
      at: now,
    }));
    onChange([...attachments, ...added]);
    if (fileRef.current) fileRef.current.value = '';
    if (!onExtract || !documentKind) return;
    setBusy(true);
    onBusyChange?.(true);
    const results: string[] = [];
    try {
      for (const file of uploaded) {
        try {
          setMessage(`Reading ${file.name}`);
          const fields = await extractInvoiceDocument(file, documentKind, (progress) => setMessage(`${file.name}: ${progress}`));
          const count = Object.keys(fields).length;
          if (count) onExtract(fields);
          results.push(`${file.name}: ${count ? `${count} fields filled. Review before saving.` : 'No matching fields found; existing values unchanged.'}`);
        } catch (error) {
          results.push(`${file.name}: ${error instanceof Error ? error.message : 'Extraction failed; existing values unchanged.'}`);
        }
      }
      setMessage(results.join(' '));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  const remove = (id: string) => onChange(attachments.filter((a) => a.id !== id));

  return (
    <div className="fv-ops__col">
      <div className="fv-ops__card-controls">
        {(kind === 'PDA' || kind === 'FDA') && <select className="fv-ops__eta-sel" aria-label="Uploaded document type" value={documentKind} disabled={busy || disabled} onChange={(event) => setDocumentKind(event.target.value as InvoiceDocumentKind)}><option value="PDA">PDA</option><option value="FDA">FDA</option></select>}
        <button type="button" className="fv-ops__btn fv-ops__btn--sm" disabled={busy || disabled} onClick={() => fileRef.current?.click()}>
          <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-paperclip'}`} aria-hidden="true" /> {busy ? 'Reading...' : 'Attach File'}
        </button>
        <input ref={fileRef} type="file" multiple hidden disabled={busy || disabled} onChange={(event) => { void addFiles(event.target.files); }} />
      </div>
      {message && <div className="fv-ops__hint" role="status" aria-live="polite">{message}</div>}
      <table className="fv-ops__table">
        <thead>
          <tr><th>File</th><th className="fv-ops__r">Size (KB)</th><th aria-label="Remove" /></tr>
        </thead>
        <tbody>
          {attachments.length === 0 && <tr><td colSpan={3} className="fv-ops__vd-empty">No attachments</td></tr>}
          {attachments.map((a) => (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td className="fv-ops__r">{a.sizeKb}</td>
              <td className="fv-ops__r"><button type="button" className="fv-ops__bnk-rm" disabled={busy || disabled} aria-label={`Remove ${a.name}`} onClick={() => remove(a.id)}><i className="fas fa-trash" aria-hidden="true" /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PdaModal({ row, onSave, onDelete, onClose }: {
  row: PdaRow;
  onSave: (patch: Partial<PdaRow>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<PdaRow>(row);
  const [extracting, setExtracting] = useState(false);
  const setD = (patch: Partial<PdaRow>) => setDraft((d) => ({ ...d, ...patch }));
  const outstanding = draft.estimated - draft.advance;
  const variance = draft.fdaFinal - draft.estimated;
  const balance = draft.fdaFinal - draft.advance;
  return (
    <div className="fv-ops__modal-overlay" onClick={onClose}>
      <div className="fv-ops__soa" onClick={(e) => e.stopPropagation()}>
        <div className="fv-ops__soa-head">
          <div>
            <h2>PDA / FDA Details</h2>
            <span className="fv-ops__soa-sub">{draft.port || 'Port'} · {draft.agent || 'Agent'} · {draft.currency}</span>
          </div>
          <div className="fv-ops__soa-headbtns">
            <button type="button" className="fv-ops__btn fv-ops__btn--go" disabled={extracting} onClick={() => { onSave(draft); onClose(); }}><i className="fas fa-floppy-disk" aria-hidden="true" /> Save</button>
            <button type="button" className="fv-ops__btn" onClick={onDelete}><i className="fas fa-trash" aria-hidden="true" /> Delete</button>
            <button type="button" className="fv-ops__icon-btn" onClick={onClose} aria-label="Close"><i className="fas fa-xmark" aria-hidden="true" /></button>
          </div>
        </div>
        <div className="fv-ops__soa-body">
          <div className="fv-ops__vd-fields">
            <VdField label="Port" value={draft.port} onChange={(v) => setD({ port: v })} />
            <VdField label="Agent" value={draft.agent} onChange={(v) => setD({ agent: v })} />
            <VdField label="Due Date" value={draft.due || ''} onChange={(v) => setD({ due: v })} />
            <VdField label="Currency" value={draft.currency} onChange={(v) => setD({ currency: v })} />
            <VdField label="Estimated PDA" value={String(draft.estimated)} onChange={(v) => setD({ estimated: num(v) })} num />
            <VdField label="Advance Paid" value={String(draft.advance)} onChange={(v) => setD({ advance: num(v) })} num />
            <VdField label="FDA Final" value={String(draft.fdaFinal)} onChange={(v) => setD({ fdaFinal: num(v) })} num />
            <VdSelect label="Status" value={settlementStatusValue(draft.status)} onChange={(v) => setD({ status: v })} options={STATUS_OPTIONS_PDA} />
            <VdSelect label="FDA Status" value={settlementStatusValue(draft.fdaStatus, draft.fdaFinal ? 'Received' : 'Requested')} onChange={(v) => setD({ fdaStatus: v })} options={STATUS_OPTIONS_PDA} />
            <VdSelect label="Payment Status" value={settlementPaymentValue(draft.paymentStatus)} onChange={(v) => setD({ paymentStatus: v })} options={PAYMENT_STATUS_OPTIONS} />
            <VdField label="Approval" value={draft.approval} onChange={(v) => setD({ approval: v })} />
          </div>
          <div className="fv-ops__vd-sub">
            <div className="fv-ops__vd-sub-head"><i className="fas fa-paperclip" aria-hidden="true" /> Attachments</div>
            <AttachmentEditor attachments={draft.attachments ?? []} onChange={(attachments) => setD({ attachments })} kind="PDA" onExtract={setD} onBusyChange={setExtracting} />
          </div>
          <div className="fv-ops__frl-voy">
            <span><b>Outstanding:</b> {money(outstanding)}</span>
            <span><b>Variance:</b> {money(variance)}</span>
            <span><b>Balance:</b> {money(balance)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentInvoiceModal({ row, onSave, onDelete, onClose }: {
  row: AgentInvoiceRow;
  onSave: (patch: Partial<AgentInvoiceRow>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<AgentInvoiceRow>(row);
  const [extracting, setExtracting] = useState(false);
  const setD = (patch: Partial<AgentInvoiceRow>) => setDraft((d) => ({ ...d, ...patch }));
  const outstanding = (draft.approved || draft.amount) - draft.paid;
  return (
    <div className="fv-ops__modal-overlay" onClick={onClose}>
      <div className="fv-ops__soa" onClick={(e) => e.stopPropagation()}>
        <div className="fv-ops__soa-head">
          <div>
            <h2>Agent Invoice Details</h2>
            <span className="fv-ops__soa-sub">{draft.invoiceNo || 'Invoice'} · {draft.vendor || 'Vendor'} · {draft.currency}</span>
          </div>
          <div className="fv-ops__soa-headbtns">
            <button type="button" className="fv-ops__btn fv-ops__btn--go" disabled={extracting} onClick={() => { onSave(draft); onClose(); }}><i className="fas fa-floppy-disk" aria-hidden="true" /> Save</button>
            <button type="button" className="fv-ops__btn" onClick={onDelete}><i className="fas fa-trash" aria-hidden="true" /> Delete</button>
            <button type="button" className="fv-ops__icon-btn" onClick={onClose} aria-label="Close"><i className="fas fa-xmark" aria-hidden="true" /></button>
          </div>
        </div>
        <div className="fv-ops__soa-body">
          <div className="fv-ops__vd-fields">
            <VdField label="Invoice No" value={draft.invoiceNo} onChange={(v) => setD({ invoiceNo: v })} />
            <VdField label="Vendor" value={draft.vendor} onChange={(v) => setD({ vendor: v })} />
            <VdField label="Category" value={draft.category} onChange={(v) => setD({ category: v })} />
            <VdField label="Port" value={draft.port} onChange={(v) => setD({ port: v })} />
            <VdField label="Due Date" value={draft.due} onChange={(v) => setD({ due: v })} />
            <VdField label="Currency" value={draft.currency} onChange={(v) => setD({ currency: v })} />
            <VdField label="Amount" value={String(draft.amount)} onChange={(v) => setD({ amount: num(v) })} num />
            <VdField label="Approved" value={String(draft.approved)} onChange={(v) => setD({ approved: num(v) })} num />
            <VdField label="Paid" value={String(draft.paid)} onChange={(v) => setD({ paid: num(v) })} num />
            <VdField label="Dept" value={draft.dept} onChange={(v) => setD({ dept: v })} />
            <VdField label="Accounts" value={draft.accounts} onChange={(v) => setD({ accounts: v })} />
            <VdSelect label="Status" value={settlementStatusValue(draft.status)} onChange={(v) => setD({ status: v })} options={STATUS_OPTIONS_AGENT_SERVICE} />
            <VdSelect label="Payment Status" value={settlementPaymentValue(draft.paymentStatus)} onChange={(v) => setD({ paymentStatus: v })} options={PAYMENT_STATUS_OPTIONS} />
          </div>
          <div className="fv-ops__vd-sub">
            <div className="fv-ops__vd-sub-head"><i className="fas fa-paperclip" aria-hidden="true" /> Attachments</div>
            <AttachmentEditor attachments={draft.attachments ?? []} onChange={(attachments) => setD({ attachments })} kind="Agent" onExtract={setD} onBusyChange={setExtracting} />
          </div>
          <div className="fv-ops__frl-voy">
            <span><b>Outstanding:</b> {money(outstanding)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ServiceModal({ row, onSave, onDelete, onClose }: {
  row: ServiceRow;
  onSave: (patch: Partial<ServiceRow>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ServiceRow>(row);
  const [extracting, setExtracting] = useState(false);
  const setD = (patch: Partial<ServiceRow>) => setDraft((d) => ({ ...d, ...patch }));
  const total = draft.cost + draft.tax;
  return (
    <div className="fv-ops__modal-overlay" onClick={onClose}>
      <div className="fv-ops__soa" onClick={(e) => e.stopPropagation()}>
        <div className="fv-ops__soa-head">
          <div>
            <h2>Service Details</h2>
            <span className="fv-ops__soa-sub">{draft.service || 'Service'} · {draft.vendor || 'Vendor'} · {draft.currency}</span>
          </div>
          <div className="fv-ops__soa-headbtns">
            <button type="button" className="fv-ops__btn fv-ops__btn--go" disabled={extracting} onClick={() => { onSave(draft); onClose(); }}><i className="fas fa-floppy-disk" aria-hidden="true" /> Save</button>
            <button type="button" className="fv-ops__btn" onClick={onDelete}><i className="fas fa-trash" aria-hidden="true" /> Delete</button>
            <button type="button" className="fv-ops__icon-btn" onClick={onClose} aria-label="Close"><i className="fas fa-xmark" aria-hidden="true" /></button>
          </div>
        </div>
        <div className="fv-ops__soa-body">
          <div className="fv-ops__vd-fields">
            <VdField label="Service" value={draft.service} onChange={(v) => setD({ service: v })} />
            <VdField label="Vendor" value={draft.vendor} onChange={(v) => setD({ vendor: v })} />
            <VdField label="Invoice" value={draft.invoice} onChange={(v) => setD({ invoice: v })} />
            <VdField label="Currency" value={draft.currency} onChange={(v) => setD({ currency: v })} />
            <VdField label="Cost" value={String(draft.cost)} onChange={(v) => setD({ cost: num(v) })} num />
            <VdField label="Tax" value={String(draft.tax)} onChange={(v) => setD({ tax: num(v) })} num />
            <VdField label="Reason" value={draft.reason} onChange={(v) => setD({ reason: v })} />
            <VdSelect label="Status" value={settlementStatusValue(draft.status)} onChange={(v) => setD({ status: v })} options={STATUS_OPTIONS_AGENT_SERVICE} />
            <VdSelect label="Payment Status" value={settlementPaymentValue(draft.paymentStatus)} onChange={(v) => setD({ paymentStatus: v })} options={PAYMENT_STATUS_OPTIONS} />
          </div>
          <div className="fv-ops__vd-sub">
            <div className="fv-ops__vd-sub-head"><i className="fas fa-paperclip" aria-hidden="true" /> Attachments</div>
            <AttachmentEditor attachments={draft.attachments ?? []} onChange={(attachments) => setD({ attachments })} kind="Service" onExtract={setD} onBusyChange={setExtracting} />
          </div>
          <div className="fv-ops__frl-voy">
            <span><b>Total:</b> {money(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClaimModal({ row, onSave, onDelete, onClose }: {
  row: ClaimRow;
  onSave: (patch: Partial<ClaimRow>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ClaimRow>({ ...row, status: claimStatusValue(row.status) });
  const setD = (patch: Partial<ClaimRow>) => setDraft((d) => ({ ...d, ...patch }));
  const balance = draft.amount - draft.settlement;
  const chargeToValue = draft.chargeTo || draft.owner || '';
  return (
    <div className="fv-ops__modal-overlay" onClick={onClose}>
      <div className="fv-ops__soa" onClick={(e) => e.stopPropagation()}>
        <div className="fv-ops__soa-head">
          <div>
            <h2>Claim Details</h2>
            <span className="fv-ops__soa-sub">{draft.reference || 'Claim'} · {chargeToValue || 'Charge To'} · {draft.currency}</span>
          </div>
          <div className="fv-ops__soa-headbtns">
            <button type="button" className="fv-ops__btn fv-ops__btn--go" onClick={() => { onSave(draft); onClose(); }}><i className="fas fa-floppy-disk" aria-hidden="true" /> Save</button>
            <button type="button" className="fv-ops__btn" onClick={onDelete}><i className="fas fa-trash" aria-hidden="true" /> Delete</button>
            <button type="button" className="fv-ops__icon-btn" onClick={onClose} aria-label="Close"><i className="fas fa-xmark" aria-hidden="true" /></button>
          </div>
        </div>
        <div className="fv-ops__soa-body">
          <div className="fv-ops__vd-fields">
            <VdField label="Type" value={draft.type} onChange={(v) => setD({ type: v })} />
            <VdField label="Reference" value={draft.reference} onChange={(v) => setD({ reference: v })} />
            <VdCombo label="Charge To" value={chargeToValue} onChange={(v) => setD({ chargeTo: v, owner: v })} options={CLAIM_CHARGE_TO_OPTIONS} />
            <VdField label="Due Date" value={draft.due || ''} onChange={(v) => setD({ due: v })} />
            <VdField label="Currency" value={draft.currency} onChange={(v) => setD({ currency: v })} />
            <VdField label="Amount" value={String(draft.amount)} onChange={(v) => setD({ amount: num(v) })} num />
            <VdField label="Settlement" value={String(draft.settlement)} onChange={(v) => setD({ settlement: num(v) })} num />
            <VdSelect label="Status" value={claimStatusValue(draft.status)} onChange={(v) => setD({ status: v })} options={STATUS_OPTIONS_CLAIMS} />
            <VdSelect label="Payment Status" value={settlementPaymentValue(draft.paymentStatus)} onChange={(v) => setD({ paymentStatus: v })} options={PAYMENT_STATUS_OPTIONS} />
          </div>
          <div className="fv-ops__vd-sub">
            <div className="fv-ops__vd-sub-head"><i className="fas fa-paperclip" aria-hidden="true" /> Attachments</div>
            <AttachmentEditor attachments={draft.attachments ?? []} onChange={(attachments) => setD({ attachments })} />
          </div>
          <div className="fv-ops__frl-voy">
            <span><b>Balance:</b> {money(balance)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Freight / demurrage invoice editor — mirrors the SOA modal (edit / save / pdf). */
function FreightInvoiceModal({ inv, recap, voyage, laytimes, claims, onSave, onDelete, onClose }: {
  inv: FreightInvoice; recap: Recap; voyage: Voyage; laytimes: LaytimePort[]; claims: ClaimRow[];
  onSave: (patch: Partial<FreightInvoice>) => void; onDelete: () => void; onClose: () => void;
}) {
  const [editing, setEditing] = useState(true);
  const [draft, setDraft] = useState<FreightInvoice>(() => ({ ...inv, invoiceTo: inv.invoiceTo || recap.charterers, paymentTerms: freightPaymentClause(recap), dueDate: inv.dueDate || computeFreightDue(recap) }));
  const [extracting, setExtracting] = useState(false);
  const accountTxns = useAccountTxns();
  const clients = useClients();
  const accountNames = useMemo(() => Array.from(new Set(clients
    .filter((client) => (client.kind ?? 'Account') === 'Account' && client.category === 'Charterer' && client.name.trim())
    .map((client) => client.name.trim()))).sort((a, b) => a.localeCompare(b)), [clients]);
  const setD = (patch: Partial<FreightInvoice>) => setDraft((d) => ({ ...d, ...patch }));
  const view = editing ? draft : inv;
  const accountPaymentStatus = (() => {
    if (view.paymentStatusManual && view.paymentStatus) return view.paymentStatus;
    const txn = accountTxns.find((x) => x.invoiceNo === `INV-${voyage.id}-${view.id}` || x.invoiceNo === view.invoiceNo);
    if (!txn) return view.paymentStatus || 'Pending';
    if (txn.status === 'Paid' || txn.status === 'Received') return 'Paid';
    if (txn.status === 'Partially Paid') return 'Partially Paid';
    return 'Pending';
  })();
  const { lines, total } = calcInvoice(view, recap, laytimes, claims);
  const effBlQty = view.blQtyOverride?.trim() ? num(view.blQtyOverride) : num(recap.finalQtyLoaded);
  const effFreight = view.freightRateOverride?.trim() ? num(view.freightRateOverride) : num(recap.freightPerMt);
  const effAdcom = view.adcomOverride?.trim() ? num(view.adcomOverride) : num(recap.adcom);
  const demurrageRate = num(recap.demDespatch);
  const despatchRate = /no\s*despatch|free\s*despatch/i.test(recap.despatchTerm) ? 0 : /half\s*despatch/i.test(recap.despatchTerm) ? demurrageRate / 2 : demurrageRate;
  const today = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');

  const save = () => {
    onSave({ ...draft, paymentTerms: freightPaymentClause(recap) });
    setEditing(false);
  };
  const discard = () => { setDraft({ ...inv, invoiceTo: inv.invoiceTo || recap.charterers, paymentTerms: freightPaymentClause(recap), dueDate: inv.dueDate || computeFreightDue(recap) }); setEditing(false); };

  const inp = (val: string, on: (v: string) => void, w?: number, ph?: string) => (
    <input className="fv-ops__vd-in" style={w ? { width: w } : undefined} value={val} placeholder={ph} disabled={!editing} onChange={(e) => on(e.target.value)} />
  );
  const inpDate = (val: string, on: (v: string) => void, w?: number) => {
    const toInput = (v: string) => { const m = (v || '').match(/(\d{1,2})-(\d{1,2})-(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
    const fromInput = (iso: string) => { const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
    return (
      <input type="date" className="fv-ops__vd-in fv-ops__vd-in--dt" style={w ? { width: w } : undefined} value={toInput(val)} disabled={!editing} onChange={(e) => on(fromInput(e.target.value))} />
    );
  };
  const addAdjustment = () => setD({ adjustments: [...(draft.adjustments ?? []), { id: uid('frtadj'), description: '', amount: '0', direction: 'Add' }] });
  const updateAdjustment = (id: string, patch: Partial<FreightInvoiceAdjustment>) => setD({ adjustments: (draft.adjustments ?? []).map((adjustment) => adjustment.id === id ? { ...adjustment, ...patch } : adjustment) });
  const removeAdjustment = (id: string) => setD({ adjustments: (draft.adjustments ?? []).filter((adjustment) => adjustment.id !== id) });
  const invoicePortOptions: { op: 'Load' | 'Discharge'; name: string }[] = [
    ...(recap.loadPort ? [{ op: 'Load' as const, name: recap.loadPort }] : []),
    ...(recap.dischargePort ? [{ op: 'Discharge' as const, name: recap.dischargePort }] : []),
  ];
  const includedPortOps = view.includedPortOps ?? invoicePortOptions.map((port) => port.op);
  const toggleInvoicePort = (op: 'Load' | 'Discharge', checked: boolean) => setD({
    includedPortOps: checked
      ? Array.from(new Set([...includedPortOps, op]))
      : includedPortOps.filter((includedOp) => includedOp !== op),
  });
  const linkedClaimIds = view.claimIds ?? [];
  const linkedClaims = linkedClaimIds.map((id) => claims.find((c) => c.id === id)).filter((c): c is ClaimRow => !!c && claimForCharterers(c));
  const claimChoices = claims.filter((c) => claimForCharterers(c) && !(view.claimIds ?? []).includes(c.id));
  const [claimPick, setClaimPick] = useState('');
  const addClaimToInvoice = (id: string) => {
    if (!id || linkedClaimIds.includes(id)) return;
    setD({ claimIds: [...linkedClaimIds, id] });
    setClaimPick('');
  };
  const removeClaimFromInvoice = (id: string) => setD({ claimIds: linkedClaimIds.filter((x) => x !== id) });

  const exportPdf = () => {
    const w = window.open('', '_blank', 'width=900,height=1100');
    if (!w) return;
    const rows = lines.map((l) => `<tr><td>${pdfEsc(l.desc)}</td><td class="r">${l.sign < 0 ? '-' : ''}${money(l.amount)}</td></tr>`).join('');
    const payerBank = findClientBankByName(view.invoiceTo || recap.charterers);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${view.title} — ${recap.vesselName}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:28px;font-size:12px}
      h1{font-size:16px;margin:0 0 2px}.sub{color:#555;margin:0 0 14px;font-size:11px}
      table{border-collapse:collapse;width:100%;margin:8px 0}
      th,td{border:1px solid #bbb;padding:4px 7px;text-align:left}
      th.r,td.r{text-align:right}tfoot td{font-weight:700;background:#f2f2f2}.tot{font-size:13px}
      .meta{margin:0 0 12px;font-size:11px}.meta span{display:inline-block;min-width:130px;color:#555}
    </style></head><body>${pdfCompanyHeader()}
      <h1>${view.title || `${view.freightType} Freight Invoice`}</h1>
      <p class="sub">${recap.vesselName} · IMO ${recap.vesselImo || voyage.imo || '—'} · ${voyage.flag || '—'} · CP ${recap.cpDate || '—'}</p>
      <div class="meta">
        <div><span>Invoice To:</span> ${view.invoiceTo || '—'}</div>
        <div><span>Invoice No.:</span> ${view.invoiceNo || '—'}</div>
        <div><span>Invoice Date:</span> ${view.invoiceDate || '—'}</div>
        <div><span>Payment Terms:</span> ${pdfEsc(freightPaymentClause(recap))}</div>
        <div><span>Due Date:</span> ${view.dueDate || '—'}</div>
        <div><span>Voyage:</span> ${recap.loadPort} → ${recap.dischargePort}</div>
        <div><span>Cargo:</span> ${recap.cargoName}</div>
      </div>
      <table><thead><tr><th>Description</th><th class="r">Amount (US$)</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="tot"><td>Total Payable Due to Owners</td><td class="r">${money(total)}</td></tr></tfoot></table>
      ${companyAccountBoxHtml('Beneficiary Account Details (Our Company)')}
      ${accountBoxHtml('Payer Details (Reference)', view.invoiceTo || recap.charterers || 'Counterparty', payerBank)}
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
            <h2>{view.title || `${view.freightType} Freight Invoice`}</h2>
            <span className="fv-ops__soa-sub">{recap.vesselName} · IMO {recap.vesselImo || voyage.imo || '—'} · {view.invoiceTo || '—'} · No. {view.invoiceNo} · <span className={`fv-ops__pill fv-ops__pill--${freightStatusPill(view.status)}`}>{view.status}</span>{editing && <span className="fv-ops__soa-editing"> · editing</span>}</span>
          </div>
          <div className="fv-ops__soa-headbtns">
            {!editing && <button type="button" className="fv-ops__btn" onClick={() => setEditing(true)}><i className="fas fa-pen" aria-hidden="true" /> Edit</button>}
            {editing && <button type="button" className="fv-ops__btn fv-ops__btn--go" disabled={extracting} onClick={save}><i className="fas fa-floppy-disk" aria-hidden="true" /> Save</button>}
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
              {editing
                ? <VdAutocomplete value={view.invoiceTo} onChange={(v) => setD({ invoiceTo: v })} options={accountNames.map((name) => ({ value: name }))} inputClass="fv-ops__vd-in" inputLabel="Invoice To" placeholder="Search Account Details…" />
                : inp(view.invoiceTo, (v) => setD({ invoiceTo: v }), undefined, 'Charterers')}
              <div className="fv-ops__frl-meta">
                <span>Vessel</span><b>{recap.vesselName}</b>
                <span>IMO</span><b>{recap.vesselImo || voyage.imo || '—'}</b>
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
              <label>Invoice Name{inp(view.title, (v) => setD({ title: v }), 170, 'Invoice name')}</label>
              <label>Invoice No.{inp(view.invoiceNo, (v) => setD({ invoiceNo: v }), 90)}</label>
              <label>Invoice Date{inpDate(view.invoiceDate, (v) => setD({ invoiceDate: v }), 140)}</label>
              <label>Payment Terms<input className="fv-ops__vd-in" value={freightPaymentClause(recap)} readOnly /></label>
              <label>Due Date{inpDate(view.dueDate, (v) => setD({ dueDate: v }), 140)}</label>
              <label>Status
                <select className="fv-ops__eta-sel" value={view.status} disabled={!editing} onChange={(e) => setD({ status: e.target.value })}>
                  <option value="Draft">Draft</option>
                  <option value="Sent">Sent</option>
                  <option value="Paid">Paid</option>
                </select>
              </label>
              <label>Payment Status
                <select className="fv-ops__eta-sel" value={accountPaymentStatus} disabled={!editing} onChange={(e) => setD({ paymentStatus: e.target.value, paymentStatusManual: true })}>
                  {PAYMENT_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
            </div>
          </div>
          <div className="fv-ops__frl-voy">
            <div className="fv-ops__frl-voyrow">
              <span><b>Voyage:</b></span>
              {view.kind === 'Demurrage' ? (
                invoicePortOptions.length > 0 ? invoicePortOptions.map((port, idx) => (
                  <Fragment key={port.op}>
                    {idx > 0 && <span>→</span>}
                    <label className="fv-ops__frl-chk fv-ops__frl-chk--inline">
                      <input type="checkbox" checked={includedPortOps.includes(port.op)} disabled={!editing} onChange={(e) => toggleInvoicePort(port.op, e.target.checked)} />
                      {port.name}
                    </label>
                  </Fragment>
                )) : <span>—</span>
              ) : (
                <span>{recap.loadPort || '—'} → {recap.dischargePort || '—'}</span>
              )}
              <span><b>Cargo:</b> {recap.cargoName}</span>
            </div>
            <div className="fv-ops__frl-voyrow">
              {editing ? (
                <>
                  {view.kind === 'Freight' ? (
                    <>
                      <label className="fv-ops__frl-voyed"><span>B/L Qty (MT)</span>{inp(view.blQtyOverride ?? '', (v) => setD({ blQtyOverride: v }), 96, fmt(num(recap.finalQtyLoaded), 0))}</label>
                      <label className="fv-ops__frl-voyed"><span>Freight (PMT)</span>{inp(view.freightRateOverride ?? '', (v) => setD({ freightRateOverride: v }), 84, String(num(recap.freightPerMt)))}</label>
                    </>
                  ) : (
                    <>
                      <label className="fv-ops__frl-voyed"><span>Demurrage Rate (US$/day)</span><input className="fv-ops__vd-in" value={String(demurrageRate)} readOnly /></label>
                      <label className="fv-ops__frl-voyed"><span>Despatch Rate (US$/day)</span><input className="fv-ops__vd-in" value={String(despatchRate)} readOnly /></label>
                    </>
                  )}
                  <label className="fv-ops__frl-voyed"><span>Address Comm (%)</span>{inp(view.adcomOverride ?? '', (v) => setD({ adcomOverride: v }), 76, String(num(recap.adcom)))}</label>
                  {view.kind === 'Freight' && <label className="fv-ops__frl-voyed"><span>% Freight Due</span>{inp(view.pctFreightDue, (v) => setD({ pctFreightDue: v }), 76, '100')}</label>}
                </>
              ) : (
                <>
                  {view.kind === 'Freight' ? <>
                    <span><b>B/L Qty:</b> {fmt(effBlQty, 0)} MT</span>
                    <span><b>Freight:</b> {money(effFreight)} PMT</span>
                  </> : <>
                    <span><b>Demurrage Rate:</b> {money(demurrageRate)}/day</span>
                    <span><b>Despatch Rate:</b> {money(despatchRate)}/day</span>
                  </>}
                  <span><b>Address Comm:</b> {fmt(effAdcom, 3)}%</span>
                  {view.kind === 'Freight' && <span><b>% Freight Due:</b> {fmt(num(view.pctFreightDue), 2)}%</span>}
                </>
              )}
            </div>
          </div>
          {view.kind === 'Freight' && editing && (
            <div className="fv-ops__frl-adj">
              {view.freightType === 'Final' && <label>Freight Differential (PMT){inp(view.freightDifferential, (v) => setD({ freightDifferential: v }), 80)}</label>}
              {view.freightType === 'Final' && <label>Initial Freight Received{inp(view.initialFreightReceived, (v) => setD({ initialFreightReceived: v }), 120)}</label>}
              {view.freightType === 'Final' && <label className="fv-ops__frl-chk"><input type="checkbox" checked={view.includeDemurrage} onChange={(e) => setD({ includeDemurrage: e.target.checked })} /> Include demurrage / despatch</label>}
            </div>
          )}
          <div className="fv-ops__vd-sub">
            <div className="fv-ops__vd-sub-head"><i className="fas fa-link" aria-hidden="true" /> Linked Claims (Charge To Charterers)</div>
            {editing && (
              <div className="fv-ops__frl-adj">
                <label>
                  Add Claim
                  <select className="fv-ops__eta-sel" value={claimPick} onChange={(e) => setClaimPick(e.target.value)}>
                    <option value="">Select claim…</option>
                    {claimChoices.map((c) => (
                      <option key={c.id} value={c.id}>{`${c.reference || c.type || 'Claim'} · ${money(claimOutstanding(c))}`}</option>
                    ))}
                  </select>
                </label>
                <button type="button" className="fv-ops__btn" disabled={!claimPick} onClick={() => addClaimToInvoice(claimPick)}><i className="fas fa-plus" aria-hidden="true" /> Add Claim</button>
              </div>
            )}
            <table className="fv-ops__soa-tbl">
              <thead><tr><th>Reference</th><th>Type</th><th>Charge To</th><th className="fv-ops__r">Amount</th>{editing && <th aria-label="Remove" />}</tr></thead>
              <tbody>
                {linkedClaims.length === 0 && <tr><td colSpan={editing ? 5 : 4} className="fv-ops__vd-empty">No linked claims.</td></tr>}
                {linkedClaims.map((c) => (
                  <tr key={c.id}>
                    <td>{c.reference || '—'}</td>
                    <td>{c.type || '—'}</td>
                    <td>{claimChargeTo(c) || '—'}</td>
                    <td className="fv-ops__r">{money(claimOutstanding(c))}</td>
                    {editing && <td className="fv-ops__r"><button type="button" className="fv-ops__bnk-rm" aria-label="Remove linked claim" onClick={() => removeClaimFromInvoice(c.id)}><i className="fas fa-xmark" aria-hidden="true" /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <table className="fv-ops__soa-tbl fv-ops__soa-tbl--inv">
            <thead>
              <tr><th>Description</th><th className="fv-ops__r">Amount (US$)</th></tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const adjustment = l.adjustmentId ? (view.adjustments ?? []).find((item) => item.id === l.adjustmentId) : undefined;
                return (
                  <tr key={l.adjustmentId ?? i}>
                    <td>{adjustment && editing ? (
                      <span className="fv-ops__soa-extra">
                        <input className="fv-ops__vd-in" value={adjustment.description} placeholder="Adjustment description" onChange={(e) => updateAdjustment(adjustment.id, { description: e.target.value })} />
                        <select className="fv-ops__eta-sel" value={adjustment.direction} onChange={(e) => updateAdjustment(adjustment.id, { direction: e.target.value as 'Add' | 'Deduct' })}>
                          <option value="Add">Add</option><option value="Deduct">Deduct</option>
                        </select>
                        <input className="fv-ops__eta-in" inputMode="decimal" value={adjustment.amount} onChange={(e) => updateAdjustment(adjustment.id, { amount: e.target.value })} />
                        <button type="button" className="fv-ops__bnk-rm" aria-label="Remove adjustment" onClick={() => removeAdjustment(adjustment.id)}><i className="fas fa-xmark" aria-hidden="true" /></button>
                      </span>
                    ) : l.desc}</td>
                    <td className={`fv-ops__r ${l.sign < 0 ? 'fv-ops__neg' : ''}`}>{l.sign < 0 ? '-' : ''}{money(l.amount)}</td>
                  </tr>
                );
              })}
              {editing && <tr><td colSpan={2}><button type="button" className="fv-ops__btn fv-ops__soa-add" onClick={addAdjustment}><i className="fas fa-plus" aria-hidden="true" /> Add adjustment</button></td></tr>}
            </tbody>
            <tfoot>
              <tr className="fv-ops__soa-total"><td>Total Payable Due to Owners</td><td className="fv-ops__r">{money(total)}</td></tr>
            </tfoot>
          </table>
          <div className="fv-ops__vd-sub">
            <div className="fv-ops__vd-sub-head"><i className="fas fa-paperclip" aria-hidden="true" /> Attachments</div>
            <AttachmentEditor attachments={view.attachments ?? []} onChange={(attachments) => setD({ attachments })} kind={view.kind} onExtract={setD} onBusyChange={setExtracting} disabled={!editing} />
          </div>
          <p className="fv-ops__hint">Freight and commissions are pulled from the voyage recap; payment terms follow the Charterers freight clause. {view.kind === 'Freight' && view.freightType === 'Final' ? 'Demurrage / despatch fold in from the laytime calculations when enabled.' : ''} Use <b>Add adjustment</b> for additional charges or deductions. Use <b>Save</b> to persist and <b>PDF</b> to print. *E&amp;OE.</p>
        </div>
      </div>
    </div>
  );
}

/** Laytime calculation editor — mirrors the SOA modal (edit / save / pdf) with a statement of facts. */
function LaytimeModal({ port, siblings, recap, onSave, onDelete, onClose }: {
  port: LaytimePort; siblings: LaytimePort[]; recap: Recap;
  onSave: (patch: Partial<LaytimePort>) => void; onDelete: () => void; onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LaytimePort>(port);
  const worldPorts = useWorldPorts();
  const clients = useClients();
  const cargoMaster = useCargoMaster();
  const voyageRate = port.op === 'Load' ? recap.loadRate : recap.dischRate;
  const voyageTerms = [...LAYTIME_TERMS_OPTIONS].sort((first, second) => second.length - first.length).find((term) => voyageRate.toUpperCase().includes(term.toUpperCase()));
  const demRate = num(recap.demDespatch);
  const voyageDefaults = {
    name: (port.op === 'Load' ? recap.loadPort : recap.dischargePort) || port.name,
    accountName: recap.charterers || recap.owners || port.accountName || '',
    cargo: recap.cargoName || port.cargo,
    quantity: String(num(recap.finalQtyLoaded) || num(recap.cpQuantity) || num(port.quantity)),
    rate: voyageRate ? String(num(voyageRate)) : port.rate,
    terms: voyageTerms || port.terms || LAYTIME_TERMS_OPTIONS[0],
    demurrageRate: recap.demDespatch ? String(demRate) : port.demurrageRate,
    despatchRate: recap.demDespatch ? String(/no\s*despatch|free\s*despatch/i.test(recap.despatchTerm) ? 0 : /half/i.test(recap.despatchTerm) ? demRate / 2 : demRate) : port.despatchRate,
  };
  const withVoyageDetails = (row: LaytimePort): LaytimePort => ({
    ...row,
    ...Object.fromEntries(Object.entries(voyageDefaults).filter(([key]) => !row.voyageFieldOverrides?.includes(key))),
  });
  const view = withVoyageDetails(editing ? draft : port);
  const setD = (patch: Partial<LaytimePort>) => setDraft((previous) => ({
    ...previous, ...patch,
    voyageFieldOverrides: Array.from(new Set([...(previous.voyageFieldOverrides ?? []), ...Object.keys(patch).filter((key) => key in voyageDefaults)])),
  }));
  const searchable = (label: string, value: string, onChange: (value: string) => void, options: { value: string; meta?: string }[]) => (
    <label><span>{label}</span>{editing
      ? <VdAutocomplete value={value} onChange={onChange} options={options} inputLabel={label} />
      : <input className="fv-ops__vd-in" value={value} disabled />}</label>
  );
  const res = calcLaytime(view);
  const method = view.calcMethod ?? 'counting';
  const today = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  const fmtDT2 = (d: Date | null) => (d ? `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}` : '—');
  // Reversible laytime pools the allowance & time used across every reversible port (this draft substituted live).
  const reversiblePorts = siblings.map((p) => (p.id === view.id ? view : p)).filter((p) => p.reversible);
  const pool = view.reversible && reversiblePorts.length > 1 ? calcLaytimeCombined(reversiblePorts, view) : null;
  // Result / demurrage figures use the combined pool when reversible, else this port alone.
  const outcome = pool ?? res;

  const autoCalculate = () => {
    const next: LaytimePort = {
      ...view,
      terms: view.terms || LAYTIME_TERMS_OPTIONS[0],
    };
    if (!next.commenced && next.norAccepted) next.commenced = next.norAccepted;
    if (next.events.length === 0 && next.commenced && next.completed) {
      const date = next.commenced.split(' ')[0] || '';
      const from = next.commenced.split(' ')[1] || '';
      const to = next.completed.split(' ')[1] || '';
      next.events = [{ date, from, to, pct: '100', remark: 'Auto-populated from SOF / port log' }];
    }
    setDraft(next);
    onSave(next);
    addNotification(`Laytime for ${next.name || next.op} auto-calculated from recap, charter-party terms and SOF / port log.`, 'Operations');
  };

  const save = () => { onSave(view); setEditing(false); };
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
    const factRows = res.rows.map(({ ev, elapsed, counted, cumulative }) => `<tr><td>${ev.date || ''}</td><td>${ev.from || ''}</td><td>${ev.to || ''}</td><td class="r">${fmt(elapsed, 3)}</td><td class="r">${ev.pct}</td><td class="r">${fmt(counted, 3)}</td><td class="r">${fmt(cumulative, 3)}</td><td>${ev.remark || ''}</td></tr>`).join('');
    const payeeName = outcome.onDemurrage ? (getWorkflowConfig().companyName || 'Our Company') : (view.accountName || recap.charterers || 'Counterparty');
    const payeeBank = outcome.onDemurrage ? getWorkflowConfig().companyBankAccount : findClientBankByName(payeeName);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Laytime — ${view.name} — ${recap.vesselName}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:28px;font-size:12px}
      h1{font-size:16px;margin:0 0 2px}.sub{color:#555;margin:0 0 14px;font-size:11px}
      table{border-collapse:collapse;width:100%;margin:8px 0}
      th,td{border:1px solid #bbb;padding:4px 7px;text-align:left}
      th.r,td.r{text-align:right}tfoot td{font-weight:700;background:#f2f2f2}
      .meta{margin:0 0 12px;font-size:11px}.meta span{display:inline-block;min-width:150px;color:#555}
    </style></head><body>${pdfCompanyHeader()}
      <h1>Laytime Calculation — ${view.name} (${view.op})</h1>
      <p class="sub">${recap.vesselName} · Cargo ${view.cargo} · CP ${recap.cpDate || '—'}</p>
      <div class="meta">
        <div><span>In Favour Of:</span> ${view.accountName || '—'}</div>
        <div><span>Quantity:</span> ${fmt(num(view.quantity), 0)} MT</div>
        <div><span>Rate:</span> ${fmt(num(view.rate), 0)} mt/day</div>
        <div><span>Terms:</span> ${view.terms || '—'}</div>
        <div><span>Method:</span> ${method === 'deduction' ? 'Deduction' : 'Time Counting'} · ${view.reversible ? 'Reversible' : 'Non-Reversible'}${view.onceOnDemurrage ? ' · Once on Dem, Always on Dem' : ''}</div>
        <div><span>NOR Tendered:</span> ${view.norTendered || '—'}</div>
        <div><span>Turn Time:</span> ${view.turnTimeHours || '—'} hrs</div>
        <div><span>NOR Accepted:</span> ${view.norAccepted || '—'}</div>
        <div><span>Laytime Allowed:</span> ${fmt(res.allowed, 3)} days</div>
        <div><span>Laytime Used:</span> ${fmt(res.used, 3)} days</div>
        <div><span>${outcome.onDemurrage ? 'On Demurrage:' : 'Time Saved:'}</span> ${fmt(Math.abs(outcome.balance), 3)} days</div>
        <div><span>${outcome.onDemurrage ? 'Demurrage Starts:' : 'Demurrage Starts:'}</span> ${outcome.onDemurrage ? fmtDT2(outcome.demurrageStart) : '—'}</div>
        <div><span>${outcome.onDemurrage ? 'Demurrage Due:' : 'Despatch Due:'}</span> ${outcome.onDemurrage ? money(outcome.demurrageAmt) : money(outcome.despatchAmt)}</div>
      </div>
      <table><thead><tr><th>Date</th><th>From</th><th>To</th><th class="r">Time</th><th class="r">% Count</th><th class="r">Time Used / Deducted</th><th class="r">Cumulative</th><th>Remarks</th></tr></thead>
      <tbody>${factRows}</tbody>
      <tfoot><tr><td colspan="6">Total Time Used</td><td class="r">${fmt(res.used, 3)}</td><td>days</td></tr></tfoot></table>
      ${accountBoxHtml(outcome.onDemurrage ? 'Beneficiary Account Details' : 'Payee Account Details', payeeName, payeeBank)}
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
            <span className="fv-ops__soa-sub">{recap.vesselName} · {view.op} · {view.cargo || '—'}{view.accountName ? ` · In favour of ${view.accountName}` : ''}{editing && <span className="fv-ops__soa-editing"> · editing</span>}</span>
          </div>
          <div className="fv-ops__soa-headbtns">
            <button type="button" className="fv-ops__btn fv-ops__btn--primary" onClick={autoCalculate}><i className="fas fa-calculator" aria-hidden="true" /> Auto Calculate</button>
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
            <div className="fv-ops__frl-layeditor">
              <div className="fv-ops__frl-layfields fv-ops__frl-layidentity">
                {searchable('Port Name', view.name, (value) => setD({ name: value }), [{ value: voyageDefaults.name }, ...worldPorts.map((entry) => ({ value: entry.label, meta: entry.country }))])}
                {searchable('In Favour Of (Account)', view.accountName ?? '', (value) => setD({ accountName: value }), clients.filter((client) => (client.kind ?? 'Account') === 'Account').map((client) => ({ value: client.name })))}
              </div>
              <div className="fv-ops__frl-laycolumns">
                <div className="fv-ops__frl-layfields fv-ops__frl-laycolumn">
                  <VdDateTime label="NOR Tendered" value={view.norTendered} onChange={(value) => setD({ norTendered: value })} readOnly={!editing} />
                  <VdDateTime label="NOR Accepted" value={view.norAccepted} onChange={(value) => setD({ norAccepted: value })} readOnly={!editing} />
                  <label>Turn Time (hrs)<input type="number" min="0" className="fv-ops__vd-in" value={view.turnTimeHours} disabled={!editing} onChange={(event) => setD({ turnTimeHours: event.target.value })} /></label>
                  <VdDateTime label="Laytime Commenced" value={view.commenced} onChange={(value) => setD({ commenced: value })} readOnly={!editing} />
                  <VdDateTime label="Laytime Completed" value={view.completed} onChange={(value) => setD({ completed: value })} readOnly={!editing} />
                  <VdDateTime label="Demurrage Starts" value={view.demurrageStarts || (outcome.demurrageStart ? fmtDT2(outcome.demurrageStart) : '')} onChange={(value) => setD({ demurrageStarts: value })} readOnly={!editing} />
                </div>
                <div className="fv-ops__frl-layfields fv-ops__frl-laycolumn">
                  {searchable('Cargo', view.cargo, (value) => setD({ cargo: value }), cargoMaster.filter((cargo) => cargo.status === 'Active').map((cargo) => ({ value: cargo.cargoName })))}
                  <label>Quantity (MT)<input type="number" min="0" className="fv-ops__vd-in" value={view.quantity} disabled={!editing} onChange={(event) => setD({ quantity: event.target.value })} /></label>
                  <label>{view.op === 'Load' ? 'Load' : 'Discharge'} Rate (MT/day)<input type="number" min="0" className="fv-ops__vd-in" value={view.rate} disabled={!editing} onChange={(event) => setD({ rate: event.target.value })} /></label>
                  {searchable('Terms', view.terms, (value) => setD({ terms: value }), LAYTIME_TERMS_OPTIONS.map((value) => ({ value })))}
                  <label>Demurrage Rate (US$/day)<input type="number" min="0" className="fv-ops__vd-in" value={view.demurrageRate} disabled={!editing} onChange={(event) => setD({ demurrageRate: event.target.value })} /></label>
                  <label>Despatch Rate (US$/day)<input type="number" min="0" className="fv-ops__vd-in" value={view.despatchRate} disabled={!editing} onChange={(event) => setD({ despatchRate: event.target.value })} /></label>
                </div>
              </div>
            </div>
            <div className="fv-ops__frl-layaside">
            <div className="fv-ops__frl-laysum">
              <div><span>Laytime Allowed</span><b>{fmt(res.allowed, 3)} d</b></div>
              <div><span>Laytime Used</span><b>{fmt(res.used, 3)} d</b></div>
              {method === 'deduction' && <div><span>Gross Time</span><b>{fmt(res.gross, 3)} d</b></div>}
              {method === 'deduction' && <div><span>Total Deducted</span><b>{fmt(res.deductions, 3)} d</b></div>}
              <div><span>{outcome.onDemurrage ? 'On Demurrage' : 'Time Saved'}</span><b className={outcome.onDemurrage ? 'fv-ops__neg' : 'fv-ops__pos'}>{fmt(Math.abs(outcome.balance), 3)} d</b></div>
              <div><span>{outcome.onDemurrage ? 'Demurrage Due' : 'Despatch Due'}</span><b className={outcome.onDemurrage ? 'fv-ops__neg' : 'fv-ops__pos'}>{outcome.onDemurrage ? money(outcome.demurrageAmt) : money(outcome.despatchAmt)}</b></div>
              {pool && <div className="fv-ops__frl-laypool"><span>Reversible — combined {reversiblePorts.length} ports</span><b>Allowed {fmt(pool.allowed, 3)} d · Used {fmt(pool.used, 3)} d</b></div>}
            </div>
              <div className="fv-ops__frl-layfields fv-ops__frl-layoptions">
                <label>Calculation Method
                  <select className="fv-ops__vd-in" value={method} disabled={!editing} onChange={(e) => setD({ calcMethod: e.target.value as 'counting' | 'deduction' })}>
                    <option value="counting">Time Counting</option>
                    <option value="deduction">Deduction</option>
                  </select>
                </label>
                <label>Laytime Type
                  <select className="fv-ops__vd-in" value={view.reversible ? 'reversible' : 'non'} disabled={!editing} onChange={(e) => setD({ reversible: e.target.value === 'reversible' })}>
                    <option value="non">Non-Reversible</option>
                    <option value="reversible">Reversible</option>
                  </select>
                </label>
                <label>Demurrage Term Basis
                  <select className="fv-ops__vd-in" value={view.onceOnDemurrage ? 'always' : 'standard'} disabled={!editing} onChange={(e) => setD({ onceOnDemurrage: e.target.value === 'always' })}>
                    <option value="standard">Standard (exceptions apply)</option>
                    <option value="always">Once on Demurrage, Always on Demurrage</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
          <div className="fv-ops__vd-sub-head"><i className="fas fa-list-ul" aria-hidden="true" /> Statement of Facts — {method === 'deduction' ? 'enter deducted / excepted periods only' : 'time-counting'}
            {editing && <button type="button" className="fv-ops__btn fv-ops__soa-add" onClick={addEvent}><i className="fas fa-plus" aria-hidden="true" /> Row</button>}
          </div>
          <table className="fv-ops__soa-tbl">
            <thead>
              <tr><th>Date</th><th>From</th><th>To</th><th className="fv-ops__r">Time (d)</th><th className="fv-ops__r">% Count</th><th className="fv-ops__r">Time Used / Deducted (d)</th><th className="fv-ops__r">Cumulative (d)</th><th>Remarks</th>{editing && <th aria-label="Remove" />}</tr>
            </thead>
            <tbody>
              {res.rows.length === 0 && <tr><td colSpan={editing ? 9 : 8} className="fv-ops__vd-empty">No facts recorded.{editing ? ' Use “Row” to log NOR, laytime periods, stoppages, weather etc.' : ''}</td></tr>}
              {res.rows.map(({ ev, elapsed, counted, cumulative }, i) => (
                <tr key={i}>
                  <td><input type="date" className="fv-ops__vd-in" aria-label={`Fact ${i + 1} Date`} value={dmyToDateTimeInput(ev.date).split('T')[0]} disabled={!editing} onChange={(event) => setEvent(i, { date: dateTimeInputToDmy(`${event.target.value}T00:00`).split(' ')[0] })} /></td>
                  <td><input type="time" className="fv-ops__vd-in" aria-label={`Fact ${i + 1} From`} value={ev.from} disabled={!editing} onChange={(event) => setEvent(i, { from: event.target.value })} /></td>
                  <td><input type="time" className="fv-ops__vd-in" aria-label={`Fact ${i + 1} To`} value={ev.to} disabled={!editing} onChange={(event) => setEvent(i, { to: event.target.value })} /></td>
                  <td className="fv-ops__r">{fmt(elapsed, 3)}</td>
                  <td className="fv-ops__r">{inp(ev.pct, (v) => setEvent(i, { pct: v }), 48)}</td>
                  <td className="fv-ops__r">{fmt(counted, 3)}</td>
                  <td className="fv-ops__r">{fmt(cumulative, 3)}</td>
                  <td>{inp(ev.remark, (v) => setEvent(i, { remark: v }), undefined, 'Remarks')}</td>
                  {editing && <td className="fv-ops__r"><button type="button" className="fv-ops__bnk-rm" aria-label="Remove row" onClick={() => delEvent(i)}><i className="fas fa-xmark" aria-hidden="true" /></button></td>}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="fv-ops__soa-sum"><td colSpan={5}>{method === 'deduction' ? 'Total Time Deducted' : 'Total Time Used'}</td><td className="fv-ops__r">{fmt(method === 'deduction' ? res.deductions : res.used, 3)}</td><td className="fv-ops__r" colSpan={editing ? 3 : 2}>days</td></tr>
            </tfoot>
          </table>
          <p className="fv-ops__hint">Laytime Allowed = Quantity ÷ Rate. {method === 'deduction' ? 'Deduction method: laytime used = gross time (Commenced → Completed) minus the deducted periods entered below.' : 'Time-counting method: each fact row counts its time × % as laytime used.'} Demurrage starts automatically once used laytime reaches the allowance{view.reversible ? ', pooled across reversible ports' : ''}. Use <b>Edit</b> to adjust, <b>Save</b> to persist, <b>PDF</b> to print. *E&amp;OE.</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Cost Comparisons */

/* ------------------------------------------------------------ Tools tab */

type OpsToolTab = 'eta' | 'rob' | 'leg' | 'weather';
const OPS_TOOL_TABS: { id: OpsToolTab; label: string; icon: string }[] = [
  { id: 'eta', label: 'ETA Calculation', icon: 'fa-calculator' },
  { id: 'rob', label: 'ROB Calculation', icon: 'fa-gas-pump' },
  { id: 'leg', label: 'Leg Estimation', icon: 'fa-chart-line' },
  { id: 'weather', label: 'Weather Margins', icon: 'fa-cloud-sun-rain' },
];

function CostsTab() {
  const [tool, setTool] = useState<OpsToolTab>('eta');
  return (
    <div className="fv-ops__col">
      <nav className="fv-ops__tabs fv-ops__subtabs" aria-label="Tools">
        {OPS_TOOL_TABS.map((t) => (
          <button key={t.id} type="button" className={`fv-ops__tab${tool === t.id ? ' fv-ops__tab--active' : ''}`} onClick={() => setTool(t.id)}>
            <i className={`fas ${t.icon}`} aria-hidden="true" /> {t.label}
          </button>
        ))}
      </nav>
      {tool === 'eta' && <EtaCalculation />}
      {tool === 'rob' && <RobCalculation />}
      {tool === 'leg' && <VoyageEstimation />}
      {tool === 'weather' && <WeatherMargins />}
    </div>
  );
}

function NotesTab({ recap, setRecap }: { recap: Recap; setRecap: Dispatch<SetStateAction<Recap>> }) {
  return (
    <Card title="Operations Notes" icon="fa-note-sticky" right={<span className="fv-ops__note-meta">Auto-saved per voyage</span>}>
      <RichTextEditor
        value={recap.notes ?? ''}
        onChange={(notes) => setRecap((current) => ({ ...current, notes }))}
        minHeight={240}
        placeholder="Write operational notes here…"
      />
    </Card>
  );
}

/* ------------------------------------------------------------ Vessel Reports */

/** Seed a representative set of vessel reports from the voyage figures. */
function seedVesselReports(recap: Recap, voyage: Voyage): VesselReport[] {
  const spd = voyage.instSpeed ?? 12.4;
  const fo = voyage.instCons ?? 26;
  const blank = (): VesselReport => ({
    id: uid('vr'), type: 'NOON - SEA', shiftSub: '', dtUtc: '', dtLt: '', duration: '', position: '',
    avgSpdGps: '', avgSpdLog: '', distSinceLast: '', distTotal: '', robFo: '', robDo: '',
    consFo: '', consDo: '', rpm: '', mcr: '', slip: '', weather: '', remarks: '',
  });
  return [
    { ...blank(), type: 'COSP (Departure)', dtUtc: '14-07-2025 22:00', dtLt: '15-07-2025 03:30', position: recap.loadPort || 'Salalah', distSinceLast: '0', distTotal: '0', robFo: String(num(recap.etaPlan.startRobVlsfo)), robDo: String(num(recap.etaPlan.startRobMgo)), consFo: '0', consDo: '0', weather: 'NE 3 / 1.0m / nil', remarks: 'Full away on passage' },
    { ...blank(), type: 'NOON - SEA', dtUtc: '15-07-2025 12:00', dtLt: '15-07-2025 17:30', duration: '14.0', position: '14°20N 070°10E', avgSpdGps: fmt(spd, 1), avgSpdLog: fmt(spd - 0.3, 1), distSinceLast: fmt(spd * 14, 0), distTotal: fmt(spd * 14, 0), robFo: '325', robDo: '215', consFo: fmt(fo * 14 / 24, 1), consDo: '0.1', rpm: '104', mcr: '68', weather: 'SW 4 / 1.5m / +0.3kt' },
    { ...blank(), type: 'NOON - SEA', dtUtc: '16-07-2025 12:00', dtLt: '16-07-2025 17:30', duration: '24.0', position: '13°02N 073°44E', avgSpdGps: '12.1', avgSpdLog: '11.8', distSinceLast: '290', distTotal: fmt(spd * 14 + 290, 0), robFo: '299', robDo: '215', consFo: fmt(fo, 1), consDo: '0.1', rpm: '103', mcr: '67', weather: 'SW 5 / 2.0m / +0.2kt' },
    { ...blank(), type: 'EOSP (Arrival)', dtUtc: '19-07-2025 06:00', dtLt: '19-07-2025 11:30', duration: '18.0', position: recap.dischargePort || 'Paradip', avgSpdGps: '12.3', avgSpdLog: '12.0', distSinceLast: '221', distTotal: '685', robFo: '250', robDo: '213', consFo: fmt(fo * 18 / 24, 1), consDo: '0.1', rpm: '102', mcr: '66', weather: 'S 3 / 1.2m / nil', remarks: 'End of sea passage' },
  ];
}

function ReportsTab({ recap, setRecap, voyage }: { recap: Recap; setRecap: Dispatch<SetStateAction<Recap>>; voyage: Voyage }) {
  const stored = recap.vesselReports;
  const valid = Array.isArray(stored);
  const reports = valid ? (stored as VesselReport[]) : seedVesselReports(recap, voyage);

  useEffect(() => {
    if (!valid) setRecap((r) => ({ ...r, vesselReports: seedVesselReports(r, voyage) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid]);

  // Reports arrive automatically from the vessel; the log is read-only until Edit is pressed.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<VesselReport[]>(reports);
  const view = editing ? draft : reports;

  const beginEdit = () => { setDraft(reports); setEditing(true); };
  const save = () => { setRecap((r) => ({ ...r, vesselReports: draft })); setEditing(false); };
  const discard = () => { setDraft(reports); setEditing(false); };

  const setRep = (id: string, patch: Partial<VesselReport>) => setDraft((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const addRep = () => setDraft((list) => {
    const last = list[list.length - 1];
    return [...list, {
      id: uid('vr'), type: 'NOON - SEA', shiftSub: '', dtUtc: '', dtLt: '', duration: '', position: '',
      avgSpdGps: '', avgSpdLog: '', distSinceLast: '', distTotal: last?.distTotal ?? '', robFo: last?.robFo ?? '', robDo: last?.robDo ?? '',
      consFo: '', consDo: '', rpm: '', mcr: '', slip: '', weather: '', remarks: '',
    }];
  });
  const delRep = (id: string) => setDraft((list) => list.filter((x) => x.id !== id));

  const txt = (val: string, on: (v: string) => void, ph?: string, wide?: boolean) => (
    editing
      ? <input className={`fv-ops__vd-in${wide ? ' fv-ops__vr-in--wide' : ''}`} value={val} placeholder={ph} onChange={(e) => on(e.target.value)} />
      : <span className="fv-ops__vr-val">{val || '—'}</span>
  );
  const nIn = (val: string, on: (v: string) => void, ph?: string) => (
    editing
      ? <input className="fv-ops__eta-in" inputMode="decimal" value={val} placeholder={ph} onChange={(e) => on(e.target.value)} />
      : <span className="fv-ops__vr-val">{val || '—'}</span>
  );
  const isShifting = (t: string) => /shifting/i.test(t);
  const typeLabel = (r: VesselReport) => (isShifting(r.type) && r.shiftSub ? `${r.type} — ${r.shiftSub}` : r.type);

  const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cols = ['Report Type', 'Date/Time UTC', 'Date/Time LT', 'Duration (hrs)', 'Position', 'Avg Spd GPS', 'Avg Spd LOG', 'Dist Since Last (nm)', 'Total Dist (nm)', 'ROB FO', 'ROB DO', 'Cons FO', 'Cons DO', 'RPM', '% MCR', 'Slip (%)', 'Weather', 'Remarks'];
  const rowCells = (r: VesselReport) => [typeLabel(r), r.dtUtc, r.dtLt, r.duration, r.position, r.avgSpdGps, r.avgSpdLog, r.distSinceLast, r.distTotal, r.robFo, r.robDo, r.consFo, r.consDo, r.rpm, r.mcr, r.slip, r.weather, r.remarks];
  const tableHtml = () => {
    const head = `<tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>`;
    const body = view.map((r) => `<tr>${rowCells(r).map((c, i) => `<td class="${i >= 3 && i <= 14 ? 'r' : ''}">${esc(String(c))}</td>`).join('')}</tr>`).join('');
    return `<thead>${head}</thead><tbody>${body}</tbody>`;
  };

  const exportExcel = () => {
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>
      <table border="1"><caption>Vessel Reports — ${esc(recap.vesselName)}</caption>${tableHtml()}</table></body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VesselReports_${(recap.vesselName || 'voyage').replace(/\s+/g, '_')}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const exportPdf = () => {
    const w = window.open('', '_blank', 'width=1200,height=800');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Vessel Reports — ${esc(recap.vesselName)}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:20px;font-size:10px}
      h1{font-size:14px;margin:0 0 2px}.sub{color:#555;margin:0 0 10px;font-size:10px}
      table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #bbb;padding:3px 5px;text-align:left}
      td.r,th.r{text-align:right}thead th{background:#f2f2f2}
      @page{size:landscape}
    </style></head><body>${pdfCompanyHeader()}
      <h1>Vessel Reports — ${esc(recap.vesselName)}</h1>
      <p class="sub">Owners ${esc(recap.owners)} · ${esc(recap.loadPort)} → ${esc(recap.dischargePort)} · CP ${esc(recap.cpDate || '—')}</p>
      <table>${tableHtml()}</table>
      <p class="sub">*E&amp;OE.</p></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <Card
      title="Vessel Reports"
      icon="fa-file-lines"
      right={(
        <span className="fv-ops__frl-secbtns">
          {!editing && <button type="button" className="fv-ops__btn" onClick={beginEdit}><i className="fas fa-pen" aria-hidden="true" /> Edit</button>}
          {editing && <button type="button" className="fv-ops__btn fv-ops__btn--go" onClick={save}><i className="fas fa-floppy-disk" aria-hidden="true" /> Save</button>}
          {editing && <button type="button" className="fv-ops__btn" onClick={discard}><i className="fas fa-rotate-left" aria-hidden="true" /> Discard</button>}
          {editing && <button type="button" className="fv-ops__btn" onClick={addRep}><i className="fas fa-plus" aria-hidden="true" /> Add Report</button>}
          <button type="button" className="fv-ops__btn" onClick={exportExcel}><i className="fas fa-file-excel" aria-hidden="true" /> Excel</button>
          <button type="button" className="fv-ops__btn" onClick={exportPdf}><i className="fas fa-file-pdf" aria-hidden="true" /> PDF</button>
        </span>
      )}
    >
      <div className="fv-ops__eta-scroll">
        <table className="fv-ops__eta fv-ops__vr">
          <thead>
            <tr>
              <th rowSpan={2}>Report Type</th>
              <th colSpan={2}>Date / Time</th>
              <th rowSpan={2}>Dur<br />(hrs)</th>
              <th rowSpan={2}>Position</th>
              <th colSpan={2}>Avg Spd (kn)</th>
              <th colSpan={2}>Distance (nm)</th>
              <th colSpan={2}>ROB (MT)</th>
              <th colSpan={2}>Cons Last (MT)</th>
              <th rowSpan={2}>RPM</th>
              <th rowSpan={2}>%MCR</th>
              <th rowSpan={2}>Slip<br />(%)</th>
              <th rowSpan={2}>Weather<br />(Wind / Wave / Curr.)</th>
              <th rowSpan={2}>Remarks</th>
              {editing && <th rowSpan={2} aria-label="Remove" />}
            </tr>
            <tr>
              <th>UTC</th>
              <th>LT</th>
              <th>GPS</th>
              <th>LOG</th>
              <th>Last</th>
              <th>Total</th>
              <th>FO</th>
              <th>DO</th>
              <th>FO</th>
              <th>DO</th>
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && <tr><td colSpan={editing ? 20 : 19} className="fv-ops__vd-empty">No reports received yet.{editing ? ' Use “Add Report” to log one.' : ''}</td></tr>}
            {view.map((r) => (
              <tr key={r.id}>
                <td className="fv-ops__vr-type">
                  {editing ? (
                    <>
                      <select className="fv-ops__eta-sel" value={r.type} onChange={(e) => setRep(r.id, { type: e.target.value })}>
                        {r.type && !OPS_REPORT_TYPES.includes(r.type) && <option value={r.type}>{r.type}</option>}
                        {OPS_REPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {isShifting(r.type) && (
                        <select className="fv-ops__eta-sel fv-ops__vr-sub" value={r.shiftSub} onChange={(e) => setRep(r.id, { shiftSub: e.target.value })}>
                          <option value="">— sub-type —</option>
                          {OPS_SHIFTING_SUBTYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      )}
                    </>
                  ) : (
                    <span className="fv-ops__vr-val fv-ops__vr-typeval">{typeLabel(r)}</span>
                  )}
                </td>
                <td>{txt(r.dtUtc, (v) => setRep(r.id, { dtUtc: v }), 'dd-mm-yyyy HH:MM', true)}</td>
                <td>{txt(r.dtLt, (v) => setRep(r.id, { dtLt: v }), 'dd-mm-yyyy HH:MM', true)}</td>
                <td className="fv-ops__r">{nIn(r.duration, (v) => setRep(r.id, { duration: v }))}</td>
                <td>{txt(r.position, (v) => setRep(r.id, { position: v }), 'Lat / Long or port', true)}</td>
                <td className="fv-ops__r">{nIn(r.avgSpdGps, (v) => setRep(r.id, { avgSpdGps: v }))}</td>
                <td className="fv-ops__r">{nIn(r.avgSpdLog, (v) => setRep(r.id, { avgSpdLog: v }))}</td>
                <td className="fv-ops__r">{nIn(r.distSinceLast, (v) => setRep(r.id, { distSinceLast: v }))}</td>
                <td className="fv-ops__r">{nIn(r.distTotal, (v) => setRep(r.id, { distTotal: v }))}</td>
                <td className="fv-ops__r">{nIn(r.robFo, (v) => setRep(r.id, { robFo: v }))}</td>
                <td className="fv-ops__r">{nIn(r.robDo, (v) => setRep(r.id, { robDo: v }))}</td>
                <td className="fv-ops__r">{nIn(r.consFo, (v) => setRep(r.id, { consFo: v }))}</td>
                <td className="fv-ops__r">{nIn(r.consDo, (v) => setRep(r.id, { consDo: v }))}</td>
                <td className="fv-ops__r">{nIn(r.rpm, (v) => setRep(r.id, { rpm: v }))}</td>
                <td className="fv-ops__r">{nIn(r.mcr, (v) => setRep(r.id, { mcr: v }))}</td>
                <td className="fv-ops__r">{nIn(r.slip, (v) => setRep(r.id, { slip: v }))}</td>
                <td>{txt(r.weather, (v) => setRep(r.id, { weather: v }), 'e.g. SW 4 / 1.5m / +0.3kt', true)}</td>
                <td>{txt(r.remarks, (v) => setRep(r.id, { remarks: v }), 'Remarks', true)}</td>
                {editing && <td className="fv-ops__r"><button type="button" className="fv-ops__vd-sp-rm" aria-label="Remove report" onClick={() => delRep(r.id)}><i className="fas fa-trash" aria-hidden="true" /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fv-ops__hint">Reports (SBE · FWE · COSP · Noon at Sea / Port / Anchor · EOSP · Bunker · Shifting · Speed / Fuel change · Stop · Resume · Deviation) update automatically as received from the vessel. Use <b>Edit</b> to correct entries, then <b>Save</b>; export the log to <b>Excel</b> or <b>PDF</b>.</p>
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

function ConfigHistoryPanel({ entries }: { entries: ConfigHistoryEntry[] }) {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  if (entries.length === 0) {
    return <p className="fv-ops__hint">No changes recorded yet — every edit to this voyage will appear here.</p>;
  }
  return (
    <div className="fv-ops__config-history">
      {entries.map((e) => (
        <div key={e.id} className="fv-ops__config-history-row">
          <div className="fv-ops__config-history-meta">
            <span className="fv-ops__config-history-date">{fmt(e.at)}</span>
            <span className="fv-ops__config-history-user"><i className="fas fa-user" aria-hidden="true" /> {e.by}</span>
          </div>
          <div className="fv-ops__config-history-field">{e.field}</div>
          {(e.before !== '—' || e.after !== '—') && (
            <div className="fv-ops__config-history-vals">
              <span className="fv-ops__config-history-before">{e.before}</span>
              <i className="fas fa-arrow-right" aria-hidden="true" />
              <span className="fv-ops__config-history-after">{e.after}</span>
            </div>
          )}
        </div>
      ))}
    </div>
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

function DueAlertsPopup({ items, onClose }: { items: DuePopupItem[]; onClose: () => void }) {
  return (
    <div className="fv-ops__due-popup" role="status" aria-live="polite">
      <div className="fv-ops__due-popup-head">
        <strong><i className="fas fa-bell" aria-hidden="true" /> Due Alerts</strong>
        <button type="button" className="fv-ops__icon-btn" aria-label="Close due alerts" onClick={onClose}>
          <i className="fas fa-xmark" aria-hidden="true" />
        </button>
      </div>
      <ul className="fv-ops__due-popup-list">
        {items.map((it) => (
          <li key={it.id} className={`fv-ops__due-popup-item fv-ops__due-popup-item--${it.level}`}>
            {it.text}
          </li>
        ))}
      </ul>
      <p className="fv-ops__due-popup-note">This alert will reappear after 3 hours if still due.</p>
    </div>
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
