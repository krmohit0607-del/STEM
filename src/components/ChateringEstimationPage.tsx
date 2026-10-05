import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useSelectedVoyage } from '../data/selectedVoyage';
import type { Voyage } from '../data/voyages';
import { VOYAGES, makeBlankVoyage, upsertCreatedVoyage } from '../data/voyages';
import { useWorldPorts, resolveWorldPort } from '../data/ports';
import { accountNames } from '../data/clients';
import { useVessels } from '../data/vessels';
import { cargoStowageFactor } from '../data/cargoMaster';
import { VesselSearchInput } from './VesselSearchInput';
import { ModuleVesselSearch } from './ModuleVesselSearch';
import { EstimationRouteMap } from './EstimationRouteMap';
import { generateSeaRoute } from '../data/seaRoute';
import { upsertSavedEstimate, getSavedEstimate, setSavedEstimateStatus, deleteSavedEstimate, nextEstimateNo } from '../data/savedEstimates';
import { VESSEL_TEMPLATES, type VesselTemplate } from '../data/vesselTemplates';
import { setEstimationStatus, setEstimationFixType, makeFixtureNo, setFixtureNumber, handoverToOperations, addNotification, useHandedOver, setCpdd, useCpdds, estStatusLabel } from '../data/workflow';
import {
  defaultQtyUnitForVessel,
  defaultFreightUnit,
  PORT_TYPE_OPTIONS,
  useEstimationOptions,
} from '../data/estimationOptions';
import { NoVesselSelected } from './NoVesselSelected';
import { ConfirmationDialog } from './ConfirmationDialog';
import { useAutoSaveEstimate, findBestMatchPort, normalizePortName } from '../hooks/useCharteringCalcuations';
import { charteringApi } from '../api/charteringApi';

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
type LegType = string;

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
  // FULL mode consumption
  fullMainNormal: MainCons;
  fullMainEca: MainCons;
  fullSubNormal: SubCons;
  fullSubEca: SubCons;
  // ECO mode consumption
  ecoMainNormal: MainCons;
  ecoMainEca: MainCons;
  ecoSubNormal: SubCons;
  ecoSubEca: SubCons;
  // CUSTOM mode consumption
  customMainNormal: MainCons;
  customMainEca: MainCons;
  customSubNormal: SubCons;
  customSubEca: SubCons;
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
  frtUnit: string;
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
  idle: number; // Turn time / free time allowance (excluded from laytime, but counts toward hire)
  work: number;
  seaManual: number;
  dem: number;
  des: number;
  portCharge: number;
  laytimeTerm: string; // SHINC, SHEX, SHEX SXUI, etc. - determines exclusions automatically
  rateUnit: string;
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
  list: string[];
}

/** Ad-hoc operation expense line with an admin-defined type. */
interface ExpenseLine {
  id: string;
  type: string;
  amount: number;
}

interface EstimateInputs {
  fixType: FixType;
  perf: Performance;
  cargoes: Cargo[];
  ports: PortRow[];
  commercial: Commercial;
  canals: Canals;
  startDate: string;
  currency: string;
  laytimeTerms: string;
  ecaRoute: string;
  remark: string;
  expenses: ExpenseLine[];
}

interface LegCalc {
  sea: number;
  eca: number;
  work: number;
  dem: number;
  des: number;
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

interface ParsedPasteDraft {
  vesselName?: string;
  vesselType?: string;
  built?: number;
  dwt?: number;
  draft?: number;
  tpc?: number;
  cargoName?: string;
  quantity?: number;
  laycanStart?: string;
  laycanEnd?: string;
  loadPort?: string;
  dischargePorts: string[];
  loadRate?: number;
  dischargeRates: Record<string, number>;
  freightRate?: number;
  demurrage?: number;
  despatch?: number;
  serviceLadenSpeed?: number;
  serviceBallastSpeed?: number;
  serviceLadenFo?: number;
  serviceBallastFo?: number;
  serviceLadenMgo?: number;
  serviceBallastMgo?: number;
  ecoLadenSpeed?: number;
  ecoBallastSpeed?: number;
  ecoLadenFo?: number;
  ecoBallastFo?: number;
  ecoLadenMgo?: number;
  ecoBallastMgo?: number;
  inPortIdleFo?: number;
  inPortWorkFo?: number;
}

/** A comparison scenario: same estimate with a vessel or cargo override. */
type CompareBasis = 'vessel' | 'cargo';
interface Scenario {
  id: string;
  name: string;
  basis: CompareBasis;
  // vessel overrides
  ballastSpeed: number;
  ladenSpeed: number;
  foBallast: number;
  foLaden: number;
  dailyHire: number;
  hAddCommPct: number;
  // cargo overrides
  qty: number;
  rate: number;
  aCommPct: number;
  brkgPct: number;
  frtTaxPct: number;
}

/** Compute the estimate result for a scenario by cloning inputs + applying its override. */
function scenarioResult(base: EstimateInputs, sc: Scenario): EstimateResult {
  const i: EstimateInputs = JSON.parse(JSON.stringify(base));
  if (sc.basis === 'vessel') {
    i.perf.speedMode = 'Full';
    i.perf.full = { ballast: sc.ballastSpeed, laden: sc.ladenSpeed };
    i.perf.fullMainNormal = { ...i.perf.fullMainNormal, ballast: sc.foBallast, laden: sc.foLaden };
    i.ports = i.ports.map((p) => ({
      ...p,
      speed:
        p.type === 'Ballast' || p.type === 'Delivery' || p.type === 'Redelivery'
          ? sc.ballastSpeed
          : sc.ladenSpeed,
    }));
    i.commercial = { ...i.commercial, dailyHire: sc.dailyHire, hAddCommPct: sc.hAddCommPct };
  } else {
    i.cargoes = i.cargoes.map((c, idx) =>
      idx === 0
        ? { ...c, quantity: sc.qty, frt: sc.rate, aCommPct: sc.aCommPct, brkgPct: sc.brkgPct, frtTaxPct: sc.frtTaxPct }
        : c,
    );
  }
  return computeEstimate(i);
}

/* -------------------------------------------------------------- constants */

const STATUS_META: Record<EstStatus, { color: string }> = {
  Estimate: { color: 'green' },
  Quoted: { color: 'blue' },
  'On Subs': { color: 'amber' },
  Fixed: { color: 'green' },
  Cancelled: { color: 'red' },
  Lost: { color: 'grey' },
};
// Port-type dropdown values are derived from the admin options store inside the
// component. 'Ballast' / 'Laden' drive the sea-day (empty vs loaded) classification.

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
/** Currency symbols for money display; ACTIVE_CURRENCY is set from the estimate. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', SGD: 'S$', AED: 'AED ', INR: '₹', JPY: '¥', CNY: 'CN¥',
};
let ACTIVE_CURRENCY = 'USD';
function money(n: number): string {
  const sym = CURRENCY_SYMBOLS[ACTIVE_CURRENCY] ?? '$';
  return `${n < 0 ? '-' : ''}${sym}${fmt(Math.abs(n), 0)}`;
}
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
function fmtDate(d: Date): string {
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// CPDD "DD.MM.YYYY" -> ISO "YYYY-MM-DD" for the date input.
function cpddToIso(cpdd: string): string {
  const [d, m, y] = cpdd.split('.');
  return d && m && y ? `${y}-${m}-${d}` : new Date().toISOString().slice(0, 10);
}
function uid(p: string): string {
  return `${p}-${Math.random().toString(36).slice(2, 8)}`;
}

function readNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const v = Number.parseFloat(raw.replace(/,/g, '').trim());
  return Number.isFinite(v) ? v : undefined;
}

function keyPortName(port: string): string {
  return port.replace(/\s+/g, ' ').trim().toUpperCase();
}

function prettyPortName(raw: string): string {
  const cleaned = raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:CHOPS|ECI|MPT|SP|SB|PORT\s+DISCHARGE\s+BASIS|SINGLE\s+PORT\s+DISCHARGE\s+BASIS)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function squeezePortName(line: string): string {
  const noMarks = line.replace(/\*/g, '').replace(/\([^)]*\)/g, ' ');
  const parts = noMarks.split(',').map((x) => x.trim()).filter(Boolean);
  const ignored = /^(?:\d+\s*SP.*|\d+\/?\d*\s*SB.*|MPT|ECI|CHOPS|SOUTH AFRICA|INDIA)$/i;
  const pick = parts.find((p) => /[A-Za-z]/.test(p) && !ignored.test(p));
  return prettyPortName(pick ?? parts[0] ?? noMarks);
}

function parseDateWithMonthToken(token: string): { y: number; m: number; d: number } | null {
  const m = token.match(/(\d{1,2})(?:ST|ND|RD|TH)?\s*([A-Z]{3,9})\s*(\d{4})/i);
  if (!m) return null;
  const months: Record<string, number> = {
    JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
    JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
  };
  const day = Number(m[1]);
  const mon = months[m[2].slice(0, 3).toUpperCase()] ?? 0;
  const year = Number(m[3]);
  if (!day || !mon || !year) return null;
  return { y: year, m: mon, d: day };
}

function toIsoDateTime(part: { y: number; m: number; d: number }, hhmm = '0000'): string {
  const hh = hhmm.padStart(4, '0').slice(0, 2);
  const mm = hhmm.padStart(4, '0').slice(2, 4);
  return `${String(part.y).padStart(4, '0')}-${String(part.m).padStart(2, '0')}-${String(part.d).padStart(2, '0')}T${hh}:${mm}`;
}

function parseLadenBallastPair(section: string): {
  ladenSpeed?: number;
  ladenFo?: number;
  ladenMgo?: number;
  ballastSpeed?: number;
  ballastFo?: number;
  ballastMgo?: number;
} {
  const laden = section.match(/LADEN\s*:\s*ABOUT\s*([\d.]+)\s*KNOTS[\s\S]*?ON\s*ABOUT\s*([\d.]+)\s*MT[\s\S]*?\+\s*ABOUT\s*([\d.]+)\s*MT/i);
  const ballast = section.match(/BALLAST\s*:\s*ABOUT\s*([\d.]+)\s*KNOTS[\s\S]*?ON\s*ABOUT\s*([\d.]+)\s*MT[\s\S]*?\+\s*ABOUT\s*([\d.]+)\s*MT/i);
  return {
    ladenSpeed: readNumber(laden?.[1]),
    ladenFo: readNumber(laden?.[2]),
    ladenMgo: readNumber(laden?.[3]),
    ballastSpeed: readNumber(ballast?.[1]),
    ballastFo: readNumber(ballast?.[2]),
    ballastMgo: readNumber(ballast?.[3]),
  };
}

function parseEstimatePaste(text: string): ParsedPasteDraft {
  const src = text.replace(/\r/g, '').replace(/\*/g, '');
  const upper = src.toUpperCase();
  const out: ParsedPasteDraft = {
    dischargePorts: [],
    dischargeRates: {},
  };

  // Try to find vessel name near BUILT line or before TYPE line
  let vesselName = src.match(/\n\s*([A-Z][A-Z0-9 .'-]{2,})\s*\n\s*BUILT\b/i)?.[1]?.trim();
  if (!vesselName) {
    // Fallback: look for a substantial word before TYPE line
    const typeMatch = src.match(/\n\s*([A-Z][A-Z0-9 .'-]{2,})\s*\n\s*TYPE\s*:/i);
    vesselName = typeMatch?.[1]?.trim();
  }
  if (vesselName) out.vesselName = vesselName;

  out.built = readNumber(src.match(/\bBUILT\s*(\d{4})\b/i)?.[1]);
  out.vesselType = src.match(/\bTYPE\s*:\s*([^\n]+)/i)?.[1]?.trim();
  out.tpc = readNumber(src.match(/\bTPC\s*:\s*([\d.,]+)/i)?.[1]);
  const dwtDraft = src.match(/\bDWA?T\/?SSW\s*:\s*([\d.,]+)\s*MT\s*ON\s*([\d.]+)\s*M/i);
  out.dwt = readNumber(dwtDraft?.[1]);
  out.draft = readNumber(dwtDraft?.[2]);

  const serviceBlock = upper.match(/SERVICE\s+SPEED([\s\S]*?)ECO\s+SPEED/i)?.[1] ?? '';
  const ecoBlock = upper.match(/ECO\s+SPEED([\s\S]*?)IN\s+PORT/i)?.[1] ?? '';
  const service = parseLadenBallastPair(serviceBlock);
  const eco = parseLadenBallastPair(ecoBlock);
  out.serviceLadenSpeed = service.ladenSpeed;
  out.serviceBallastSpeed = service.ballastSpeed;
  out.serviceLadenFo = service.ladenFo;
  out.serviceBallastFo = service.ballastFo;
  out.serviceLadenMgo = service.ladenMgo;
  out.serviceBallastMgo = service.ballastMgo;
  out.ecoLadenSpeed = eco.ladenSpeed;
  out.ecoBallastSpeed = eco.ballastSpeed;
  out.ecoLadenFo = eco.ladenFo;
  out.ecoBallastFo = eco.ballastFo;
  out.ecoLadenMgo = eco.ladenMgo;
  out.ecoBallastMgo = eco.ballastMgo;
  out.inPortIdleFo = readNumber(src.match(/\bIDLE\s*:\s*ABOUT\s*([\d.]+)\s*MT/i)?.[1]);
  out.inPortWorkFo = readNumber(src.match(/\bWORK\s*:\s*ABOUT\s*([\d.]+)\s*MT/i)?.[1]);

  const laycanBlock = src.match(/LAYCAN\s*:\s*([\s\S]{0,220})/i)?.[1] ?? '';
  const dateMatches = [...laycanBlock.matchAll(/\d{1,2}(?:ST|ND|RD|TH)?\s*[A-Z]{3,9}\s*\d{4}/gi)].map((m) => m[0]);
  const timeMatches = [...laycanBlock.matchAll(/(\d{3,4})\s*HRS/gi)].map((m) => m[1]);
  const firstDate = dateMatches[0] ? parseDateWithMonthToken(dateMatches[0]) : null;
  const lastDate = dateMatches[1] ? parseDateWithMonthToken(dateMatches[1]) : null;
  if (firstDate) out.laycanStart = toIsoDateTime(firstDate, timeMatches[0] ?? '0001');
  if (lastDate) out.laycanEnd = toIsoDateTime(lastDate, timeMatches[1] ?? '2359');

  const cargoLine = src.match(/CARGO\s*&\s*QTY\s*:\s*([^\n]+)/i)?.[1]?.trim();
  if (cargoLine) out.cargoName = cargoLine.replace(/\s+/g, ' ');
  out.quantity = readNumber(src.match(/\b(\d{1,3}(?:,\d{3})+(?:\.\d+)?)\s*\+\/-\s*\d+(?:\.\d+)?%/i)?.[1]);

  const loadPortLine = src.match(/LOAD\s+PORT\s*:\s*([^\n]+)/i)?.[1] ?? '';
  const loadPort = squeezePortName(loadPortLine);
  if (loadPort) out.loadPort = loadPort;

  const dischPortOptions = [...src.matchAll(/[A-Z]\)\s*[^\n\-]*-\s*([^\n]+)/gi)].map((m) => squeezePortName(m[1])).filter(Boolean);
  out.dischargePorts = Array.from(new Set(dischPortOptions));

  // Load rate: match "LOAD RATE" section, look for first number-MT pattern
  const loadRateSection = src.match(/LOAD\s+RATE\s*:\s*([\s\S]{0,300})/i)?.[1] ?? '';
  out.loadRate = readNumber(loadRateSection.match(/([\d,]+(?:\.\d+)?)\s*MT\s*P/i)?.[1]);

  // Discharge rates: match any port name followed by dash and MT quantity
  // Look for lines like "PARADIP-15,000 MT" or "VPT BERTH, VIZAG-15,000 MT"
  const dischRateSection = src.match(/DISCHARGE\s+RATE\s*:\s*([\s\S]{0,1000})/i)?.[1] ?? '';
  const dischRateMatches = [...dischRateSection.matchAll(/([A-Z][A-Z0-9, .]*?)[\s–-]+(\d{1,3}(?:,\d{3})?(?:\.\d+)?)\s*MT\s*PW/gi)];
  for (const m of dischRateMatches) {
    const portName = prettyPortName(m[1]);
    const rate = readNumber(m[2]);
    if (portName && rate) {
      out.dischargeRates[keyPortName(portName)] = rate;
    }
  }

  // Freight rate: capture first USD rate value from FREIGHT RATE section
  const freightSection = src.match(/FREIGHT\s+RATE\s*:\s*([\s\S]{0,500})/i)?.[1] ?? '';
  out.freightRate = readNumber(freightSection.match(/USD\s*(\d+(?:\.\d+)?)/i)?.[1]);

  out.demurrage = readNumber(src.match(/DEM\/?DSP[^\n:]*:\s*USD\s*([\d,]+(?:\.\d+)?)/i)?.[1]);
  if (typeof out.demurrage === 'number' && out.demurrage > 0) out.despatch = out.demurrage / 2;

  return out;
}

/** Great-circle distance between two lat/lon points, in nautical miles. */
function haversineNm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 3440.065; // Earth radius in nm
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Total length of a sea-route polyline, in nautical miles. */
function routeDistanceNm(pts: { lat: number; lon: number }[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i += 1) d += haversineNm(pts[i - 1], pts[i]);
  return d;
}

/** Centered modal used by the estimation header tools (Loadable Qty / Result Plus / Remark). */
function ToolModal({
  title,
  onClose,
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="fv-ce__modal-overlay" role="presentation" onClick={onClose}>
      <div
        className={`fv-ce__modal${wide ? ' fv-ce__modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fv-ce__modal-head">
          <h5>{title}</h5>
          <button type="button" className="fv-ce__modal-close" onClick={onClose} aria-label="Close">
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </header>
        <div className="fv-ce__modal-body">{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------- estimate engine */

/** Normalise a port name (strip "<Country>" / "(code)") for cargo↔port matching. */
function cleanPortName(s: string): string {
  // Remove country/state info after comma, parentheses, or angle brackets
  // E.g., "VISHAKHAPATNAM, INDIA" → "VISHAKHAPATNAM"
  //       "PORT (CODE)" → "PORT"
  return s.split(',')[0].split('<')[0].split('(')[0].trim().toLowerCase();
}

/**
 * Cargo quantity handled at each port row, in rotation order. Each cargo's
 * load/discharge quantity is assigned to the next matching port that hasn't
 * been used yet (so multiple same-named berths each take a cargo), falling
 * back to the last matching port when they're all used.
 */
function portHandledQty(ports: PortRow[], cargoes: Cargo[]): Record<string, number> {
  const handled: Record<string, number> = {};
  const loadUsed = new Set<string>();
  const dischUsed = new Set<string>();
  const add = (id: string, q: number) => { handled[id] = (handled[id] ?? 0) + q; };
  const match = (a: string, b: string) => {
    const x = cleanPortName(a);
    return x !== '' && x === cleanPortName(b);
  };
  const pick = (target: string, used: Set<string>): PortRow | undefined => {
    const fresh = ports.find((p) => match(p.port, target) && !used.has(p.id));
    if (fresh) return fresh;
    for (let k = ports.length - 1; k >= 0; k -= 1) if (match(ports[k].port, target)) return ports[k];
    return undefined;
  };
  for (const c of cargoes) {
    if (c.quantity <= 0) continue;
    if (c.loadPort) {
      const p = pick(c.loadPort, loadUsed);
      if (p) { loadUsed.add(p.id); add(p.id, c.quantity); }
    }
    if (c.dischPort) {
      const p = pick(c.dischPort, dischUsed);
      if (p) { dischUsed.add(p.id); add(p.id, c.quantity); }
    }
  }
  return handled;
}

/** Working days at a port: from L/D rate + cargo handled when set, else manual. */
function portWorkDays(p: PortRow, handledQty: number): number {
  if (p.ldRate > 0 && handledQty > 0) {
    const perDay = /hour/i.test(p.rateUnit) ? p.ldRate * 24 : p.ldRate;
    if (perDay > 0) return handledQty / perDay;
  }
  return p.work;
}

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
  let foSea = 0;
  let foEcaSea = 0;
  let foPort = 0;
  let mgoSea = 0;
  let mgoEcaSea = 0;
  let mgoPort = 0;

  const start = new Date(i.startDate);
  let cursor = start;
  const perLeg: LegCalc[] = [];
  const handled = portHandledQty(ports, cargoes);

  // Track cargo on board: determine after each port if cargo remains
  const cargoOnBoardAfter: boolean[] = [];
  let cargoRemaining = 0;
  for (let idx = 0; idx < ports.length; idx++) {
    const p = ports[idx];
    const isLoading = p.type === 'Loading' || p.type === 'Part Loading' || 
                      (p.type === 'Ballast' && (handled[p.id] ?? 0) > 0); // Ballast type with cargo = loading
    const isDischarging = p.type === 'Discharging' || p.type === 'Part Discharging';
    
    if (isLoading) {
      cargoRemaining += handled[p.id] ?? 0;
    } else if (isDischarging) {
      cargoRemaining -= handled[p.id] ?? 0;
    }
    
    cargoOnBoardAfter[idx] = cargoRemaining > 0;
  }

  for (let portIdx = 0; portIdx < ports.length; portIdx++) {
    const p = ports[portIdx];
    const spd = p.speed > 0 ? p.speed : 12;
    // Weather margin reduces the effective speed used for the leg time.
    const effSpeed = Math.max(0.1, spd * (1 - p.wf / 100));
    let legSea: number;
    let legEca: number;
    if (p.distance > 0) {
      legSea = p.distance / (effSpeed * 24);
      legEca = p.ecaDistance > 0 ? p.ecaDistance / (effSpeed * 24) : 0;
      legEca = Math.min(legEca, legSea); // ECA portion can't exceed the whole leg
    } else {
      // No distance → manual buffer days (e.g. Delivery / Redelivery margin).
      legSea = p.seaManual;
      legEca = 0;
    }
    const normalSea = Math.max(0, legSea - legEca);
    
    // Determine if the LEG TO this port is ballast or laden
    // The cargo status at the START of the leg (after processing the previous port)
    // determines whether this leg is ballast or laden
    const cargoOnBoardAtStartOfLeg = portIdx > 0 ? cargoOnBoardAfter[portIdx - 1] : false;
    const isLadenLeg = cargoOnBoardAtStartOfLeg;
    
    // Working days: ALWAYS calculated from L/D rate + cargo when available, else manual.
    const ratePerDay = /hour/i.test(p.rateUnit) ? p.ldRate * 24 : p.ldRate;
    const qtyHandled = handled[p.id] ?? 0;
    const work = portWorkDays(p, qtyHandled);

    // Demurrage / despatch calculation for estimation:
    // Step 1: Allowed Laytime = Cargo Quantity ÷ L/D Rate (contract allowance)
    // Step 2: Working Days (W days) = Calculated from L/D rate + cargo
    // Step 3: Idle Time = Delays, stoppages, weather, shifting, etc. (ADDS to working time)
    // Step 4: Effective Working Time = W days + Idle (total time actually used)
    // Step 5: Calculate Dem/Des
    //   Balance = Allowed - Effective Working Time
    //   If Balance > 0: Despatch (finished early)
    //   If Balance < 0: Demurrage (took longer than allowed)
    
    let legDem = 0;
    let legDes = 0;
    
    // ALWAYS calculate dem/des if demurrage rate is set
    if (p.dem > 0) {
      let allowed = 0;
      
      // Step 1: Calculate allowed laytime from cargo qty and L/D rate
      if (ratePerDay > 0 && qtyHandled > 0) {
        allowed = qtyHandled / ratePerDay;
      }
      
      // Step 4: Effective working time = actual work + idle time delays
      const effectiveWork = work + p.idle;
      
      // Step 5: Compare allowed vs effective working time
      const balance = allowed - effectiveWork;
      
      if (allowed > 0) {
        if (balance > 0) {
          // Effective work < Allowed → Despatch (owner pays charterer). Use the port's
          // despatch rate when set, else the customary half-demurrage default.
          legDes = balance * (p.des > 0 ? p.des : p.dem / 2);
        } else if (balance < 0) {
          // Effective work > Allowed → Demurrage (charterer pays owner)
          legDem = (-balance) * p.dem;
        }
        // If balance = 0 → dem/des = 0 (perfect match)
      }
    }

    // Select fuel consumption rates based on speed mode
    let foCons: MainCons, mgoCons: SubCons;
    if (perf.speedMode === 'Eco') {
      foCons = perf.ecoMainNormal;
      mgoCons = perf.ecoSubNormal;
    } else if (perf.speedMode === 'Full') {
      foCons = perf.fullMainNormal;
      mgoCons = perf.fullSubNormal;
    } else {
      // Custom mode
      foCons = perf.customMainNormal;
      mgoCons = perf.customSubNormal;
    }
    
    // Apply consumption based on port type and leg cargo status
    // Rules:
    // 1. Sea legs (Ballast, Laden): Use sea consumption based on cargo status
    // 2. Sailing Delivery/Redelivery: Use sea consumption (ballast if empty, laden if cargo on board)
    // 3. Port operations (Loading, Discharging, Bunkering, etc.): Use work/idle consumption only
    // 4. Canal Transit: Use work consumption
    
    if (p.distance > 0) {
      // Sea leg: Apply ballast or laden consumption based on cargo status
      foSea += normalSea * (isLadenLeg ? foCons.laden : foCons.ballast);
      foEcaSea += legEca * (isLadenLeg ? foCons.laden : foCons.ballast);
      mgoSea += normalSea * mgoCons.sea;
      mgoEcaSea += legEca * mgoCons.sea;
    }
    
    // Port operations: Always use work rate for work time, idle rate for idle time (regardless of cargo)
    // This is the primary consumption at ports (loading, discharging, waiting, bunkering, etc.)
    foPort += p.idle * foCons.idle + work * foCons.work;
    mgoPort += p.idle * mgoCons.idle + work * mgoCons.work;

    seaDays += legSea;
    ecaDays += legEca;
    if (!isLadenLeg && p.distance > 0) ballastDays += legSea;
    else if (isLadenLeg && p.distance > 0) ladenDays += legSea;
    idleTotal += p.idle;
    workTotal += work;
    distanceTotal += p.distance;
    ecaDistanceTotal += p.ecaDistance;
    portCharge += p.portCharge;
    demTotal += legDem;
    desTotal += legDes;

    const arrival = addDays(cursor, legSea);
    const departure = addDays(arrival, p.idle + work);
    cursor = departure;
    perLeg.push({
      sea: round(legSea, 2),
      eca: round(legEca, 2),
      work: round(work, 2),
      dem: round(legDem),
      des: round(legDes),
      arrival: legSea > 0 ? fmtDate(arrival) : '—',
      departure: fmtDate(departure),
    });
  }

  const portDays = idleTotal + workTotal;
  const voyageDays = seaDays + portDays;
  const vlsfoCons = foSea + foPort;
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
  const extraOpex = (i.expenses ?? []).reduce((s, e) => s + e.amount, 0);
  const opExpense = fixedOpex + extraOpex + freightCommOpex + demDesOpex + portOpex + bunkerOpex + bodOpex;

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

/* --------------------------------------------------------- sync ports with cargo */

/**
 * Auto-sync port rotation based on cargo loading/discharging ports.
 * Creates Loading ports for each unique loadPort and Discharging ports for
 * each unique dischPort found in the cargo list. Preserves existing port
 * properties (distance, speed, rates, etc.) where possible.
 */
function syncPortsWithCargo(ports: PortRow[], cargoes: Cargo[]): PortRow[] {
  // Extract unique loading and discharging ports from cargoes, preserving order
  const seenLoadPorts = new Set<string>();
  const seenDischPorts = new Set<string>();
  const loadPorts: string[] = [];
  const dischPorts: string[] = [];

  for (const cargo of cargoes) {
    if (cargo.loadPort && !seenLoadPorts.has(cargo.loadPort)) {
      seenLoadPorts.add(cargo.loadPort);
      loadPorts.push(cargo.loadPort);
    }
    if (cargo.dischPort && !seenDischPorts.has(cargo.dischPort)) {
      seenDischPorts.add(cargo.dischPort);
      dischPorts.push(cargo.dischPort);
    }
  }

  // Find Delivery and Redelivery ports (preserve them)
  const delivery = ports.find((p) => p.type === 'Delivery');
  const redelivery = ports.find((p) => p.type === 'Redelivery');

  // Build a map of existing ports by port name for quick lookup
  const existingByPort = new Map<string, PortRow>();
  for (const port of ports) {
    const normalized = normalizePortName(port.port);
    if (!existingByPort.has(normalized)) {
      existingByPort.set(normalized, port);
    }
  }

  // Template for creating new ports (with defaults)
  const createPort = (type: LegType, port: string): PortRow => ({
    id: uid('pr'),
    type,
    port,
    distance: 0,
    ecaDistance: 0,
    wf: 5,
    speed: 0,
    ldRate: type === 'Loading' ? 15000 : type === 'Discharging' ? 15000 : 0,
    idle: 0.5, // Turn time / free time allowance (not counted in laytime)
    work: 0,
    seaManual: 0,
    dem: type === 'Loading' ? 18000 : type === 'Discharging' ? 20000 : 0,
    des: 0,
    portCharge: type === 'Loading' ? 40000 : type === 'Discharging' ? 45000 : 0,
    laytimeTerm: 'SHINC',
    rateUnit: 'MT/Day',
  });

  // Build new ports array: Delivery → Loading ports → Discharging ports → Redelivery
  const newPorts: PortRow[] = [];

  if (delivery) {
    newPorts.push(delivery);
  }

  for (const loadPort of loadPorts) {
    // Try to find existing port with same name; if found, preserve its properties
    const normalized = normalizePortName(loadPort);
    const existing = existingByPort.get(normalized);
    if (existing && existing.type === 'Loading') {
      newPorts.push({ ...existing });
    } else {
      newPorts.push(createPort('Loading', loadPort));
    }
  }

  for (const dischPort of dischPorts) {
    // Try to find existing port with same name; if found, preserve its properties
    const normalized = normalizePortName(dischPort);
    const existing = existingByPort.get(normalized);
    if (existing && existing.type === 'Discharging') {
      newPorts.push({ ...existing });
    } else {
      newPorts.push(createPort('Discharging', dischPort));
    }
  }

  if (redelivery) {
    newPorts.push(redelivery);
  }

  return newPorts;
}

/* ------------------------------------------------------------ seed inputs */

function seedInputs(voyage: Voyage | undefined, blank = false): EstimateInputs {
  const perf: Performance = {
    speedMode: 'Full',
    full: { ballast: 14, laden: 14 },
    eco: { ballast: 12, laden: 11.5 },
    customs: [],
    // FULL mode consumption
    fullMainNormal: { type: 'VLSFO', ballast: 29, laden: 33, idle: 2.5, work: 5 },
    fullMainEca: { type: 'ULSFO', ballast: 29, laden: 33, idle: 2.5, work: 5 },
    fullSubNormal: { type: 'MGO', sea: 0.1, idle: 0, work: 0 },
    fullSubEca: { type: 'MGO', sea: 0.1, idle: 0, work: 0 },
    // ECO mode consumption (20-25% lower than Full)
    ecoMainNormal: { type: 'VLSFO', ballast: 23, laden: 26, idle: 2.0, work: 4 },
    ecoMainEca: { type: 'ULSFO', ballast: 23, laden: 26, idle: 2.0, work: 4 },
    ecoSubNormal: { type: 'MGO', sea: 0.08, idle: 0, work: 0 },
    ecoSubEca: { type: 'MGO', sea: 0.08, idle: 0, work: 0 },
    // CUSTOM mode (initialize with Full values, user can edit)
    customMainNormal: { type: 'VLSFO', ballast: 29, laden: 33, idle: 2.5, work: 5 },
    customMainEca: { type: 'ULSFO', ballast: 29, laden: 33, idle: 2.5, work: 5 },
    customSubNormal: { type: 'MGO', sea: 0.1, idle: 0, work: 0 },
    customSubEca: { type: 'MGO', sea: 0.1, idle: 0, work: 0 },
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
    frtUnit: 'USD/MT',
    term: 'FIO',
    aCommPct: 3.75,
    brkgPct: 1.25,
    frtTaxPct: 0,
    linerTerm: 0,
  });

  const cargoes: Cargo[] = blank
    ? [c('', '', '', '', 0, 0)]
    : [c('ACCT1', 'Iron Ore', 'Vishakhapatnam <India>', 'Qingdao <China>', 50_000, 22)];

  const p = (
    type: LegType,
    port: string,
    distance: number,
    ecaDistance: number,
    speed: number,
    ldRate: number,
    idle: number,
    work: number,
    demRate: number,
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
    dem: demRate,
    des: 0,
    portCharge,
    laytimeTerm: 'SHINC',
    rateUnit: 'MT/Day',
  });

  const ports: PortRow[] = blank
    ? [
        p('Loading', '', 0, 0, perf.full.laden, 0, 0.5, 0, 0, 0),
        p('Discharging', '', 0, 0, perf.full.laden, 0, 0.5, 0, 0, 0),
      ]
    : [
        p('Delivery', 'Chittagong <Bangladesh>', 0, 0, 14, 0, 0, 0, 0, 0),
        p('Loading', 'Vishakhapatnam <India>', 660, 0, 14, 15_000, 0.5, 0, 18_000, 40_000),
        p('Bunker', 'Singapore <Singapore>', 1_650, 0, 14, 0, 0.5, 0, 0, 5_000),
        p('Discharging', 'Qingdao <China>', 2_750, 0, 14, 15_000, 0.5, 0, 20_000, 45_000),
      ];

  const commercial: Commercial = blank
    ? {
        dailyHire: 0, hAddCommPct: 3.75, dailyHireOut: 0, hAddCommOutPct: 1.25, ownDailyCost: 0,
        freightIn: 0, bodQty: 0, bodPrice: 0, borQty: 0, borPrice: 0, cev: 0, ilohc: 0,
        ballastBonus: 0, routingService: 0, others: 0, linerTerms: 0,
        vlsfoPrice: 320, mgoPrice: 360, ulsfoPrice: 360,
      }
    : {
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
        // ECA fuel (ULSFO) is a premium over VLSFO, so ECA distance raises cost.
        ulsfoPrice: (voyage?.foCost || 320) + 40,
      };

  return { fixType: 'TCIN-VOUT', perf, cargoes, ports, commercial, canals: { list: blank ? [] : ['Suez Canal', 'Panama Canal'] }, startDate: blank ? new Date().toISOString().slice(0, 16) : '2020-08-06T16:10', currency: 'USD', laytimeTerms: 'SHINC', ecaRoute: 'Non-Bypass ECA Route', remark: '', expenses: [] };
}

/** Vessel types for the Vessel Particular "Type" dropdown come from the shared
 * options list ({@link VESSEL_TYPE_OPTIONS}). */

function seedVessel(voyage: Voyage | undefined, blank = false): VesselParticular {
  if (blank) {
    return { name: '', dwt: 0, draft: 0, tpc: 0, built: 0, kind: '', type: '' };
  }
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

/**
 * Themed autocomplete cell: a free-text input that filters a saved option list
 * (vessels / accounts / ports from Settings). The dropdown is fixed-positioned
 * so it is never clipped by the scrollable estimation tables. Manual entry stays
 * possible — the field is plain text.
 */
function CeAutocomplete({ value, onChange, options, placeholder, disabled, min }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; disabled?: boolean; min?: number }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return list.slice(0, 50);
  }, [value, options]);
  const place = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom + 2, width: Math.max(r.width, 180) });
  };
  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);
  const choose = (v: string) => { onChange(v); setOpen(false); };
  return (
    <span className="fv-ce__combo" ref={wrapRef}>
      <input
        ref={inputRef}
        className="fv-ce__cell-input"
        style={{ minWidth: min }}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); place(); }}
        onFocus={() => { setOpen(true); place(); }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && matches[active]) { e.preventDefault(); choose(matches[active]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && !disabled && matches.length > 0 && rect && (
        <ul className="fv-port-combo__list fv-ce__combo-list" style={{ position: 'fixed', left: rect.left, top: rect.top, width: rect.width, right: 'auto' }}>
          {matches.map((o, i) => (
            <li
              key={`${o}-${i}`}
              className={`fv-port-combo__item${i === active ? ' fv-port-combo__item--active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); choose(o); }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="fv-port-combo__name">{o}</span>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

/* ------------------------------------------------------------ main component */

export function ChateringEstimationPage({ mode }: { mode?: 'create' } = {}) {
  const [searchParams] = useSearchParams();
  // Extract URL parameters early so we can use them as stable dependencies
  const newParam = searchParams.get('new');
  const estParam = searchParams.get('est');
  const fromParam = searchParams.get('from');
  const bookDataParam = searchParams.get('bookData');
  const bookRefParam = searchParams.get('bookRef');
  
  const selectedVoyage = useSelectedVoyage({ emptyWhenCleared: true });
  // "create" mode (prop or ?new=1) opens a blank estimate — no vessel required.
  const createMode = mode === 'create' || newParam === '1';
  // Opening a previously saved estimate from the sidebar (?est=<id>).
  
  // Compute the stable estimate ID early so we can use it to find savedRecord
  const [estimateId] = useState(() => {
    if (estParam) return estParam;  // Reusing a saved estimate via URL param
    
    if (createMode && bookRefParam) {
      // Create a stable ID derived from the bookRef so clicking Estimate multiple times
      // on the same book entry reuses the same draft instead of creating duplicates
      return `est-book-${bookRefParam}`;
    }
    
    return createMode ? `est-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` : `est-${Date.now()}`;
  });
  
  // Track the actual backend ID (GUID) for deletion - separate from draft IDs
  const [backendEstimateId, setBackendEstimateId] = useState<string | null>(
    estParam && !estParam.startsWith('est-') ? estParam : null
  );
  
  // Now use estimateId to find the savedRecord (could be from URL or from reusing a book draft)
  const savedRecord = useMemo(() => getSavedEstimate(estimateId), [estimateId]);
  const blankVoyage = useMemo(() => makeBlankVoyage(), []);
  // A saved estimate (or a brand-new one) works off a blank voyage base; the
  // saved snapshot then overrides the seeded values.
  const voyage = createMode || estParam ? blankVoyage : selectedVoyage;

  const [inputs, setInputs] = useState<EstimateInputs>(() => {
    const snap = savedRecord?.data as { inputs?: EstimateInputs } | undefined;
    return snap?.inputs ?? seedInputs(voyage, createMode);
  });
  const [vessel, setVessel] = useState<VesselParticular>(() => {
    const snap = savedRecord?.data as { vessel?: VesselParticular } | undefined;
    return snap?.vessel ?? seedVessel(voyage, createMode);
  });
  const [status, setStatus] = useState<EstStatus>((savedRecord?.status as EstStatus) ?? 'Estimate');
  const [locked, setLocked] = useState(false);
  const [fixtureNo, setFixtureNo] = useState<string | null>(null);
  const [lastModified, setLastModified] = useState('2020-08-06 17:11');
  const [compareOpen, setCompareOpen] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [linkHF, setLinkHF] = useState(false);
  const [hireBasis, setHireBasis] = useState('Time Charter');
  const [canalsOpen, setCanalsOpen] = useState(false);
  const canalsRef = useRef<HTMLDivElement | null>(null);
  const [manualStartDate, setManualStartDate] = useState<string>(() => {
    const d = new Date(inputs.startDate);
    return d.toISOString().split('T')[0];
  });
  const [isSaving, setIsSaving] = useState(false);
  const [draftCreated, setDraftCreated] = useState(false);
  const [gettingDist, setGettingDist] = useState(false);
  const [quickPasteText, setQuickPasteText] = useState('');
  const [quickPasteMsg, setQuickPasteMsg] = useState('');
  const [quickPasteOpen, setQuickPasteOpen] = useState(createMode);
  // Header tool popups (Loadable Qty / Result Plus / Remark).
  const [lqOpen, setLqOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  // Mark-Fixed CP-date picker.
  const [fixOpen, setFixOpen] = useState(false);
  const [cpDate, setCpDate] = useState('');

  // Confirmation dialog state for delete operations
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [lq, setLq] = useState({
    summerDwt: 0,
    densityAtPort: 1.025,
    lightship: 0,
    point: '',
    vlsfo: 0,
    mgo: 0,
    bw: 0,
    fw: 150,
    constants: 500,
  });
  const handedOver = useHandedOver();
  const isSent = voyage ? handedOver.includes(voyage.id) : false;
  const cpdd = useCpdds()[voyage?.id ?? ''];
  const opts = useEstimationOptions();
  const worldPorts = useWorldPorts();
  const portOptions = useMemo(() => worldPorts.slice(0, 4000).map((p) => p.label), [worldPorts]);
  // Vessel options come from Settings → Vessels Details (plus any voyage vessels).
  const vessels = useVessels();
  const vesselOptions = useMemo(
    () => Array.from(new Set([...vessels.map((v) => v.name.trim()), ...VOYAGES.map((v) => v.vessel)].filter(Boolean))).sort(),
    [vessels],
  );
  // Account options come from Settings → Account Details.
  const accountOptions = useMemo(() => accountNames(), []);
  // Common cargo commodities offered as type-ahead suggestions (free text stays).
  const cargoOptions = useMemo(
    () => [
      'Iron Ore', 'Coal', 'Steam Coal', 'Coking Coal', 'Bauxite', 'Alumina', 'Gypsum', 'Limestone',
      'Clinker', 'Cement', 'Grain', 'Wheat', 'Corn', 'Soybeans', 'Soybean Meal', 'Rice', 'Sugar',
      'Salt', 'Fertilizer', 'Urea', 'DAP', 'MOP', 'Sulphur', 'Petcoke', 'Scrap', 'Steel Products',
      'HR Coils', 'Rebar', 'Logs', 'Woodchips', 'Manganese Ore', 'Chrome Ore', 'Nickel Ore', 'Concentrates',
    ],
    [],
  );

  // Stable estimate number generated once for a brand-new estimate.
  const [createEstNo] = useState(() => nextEstimateNo());
  const estNo = useMemo(() => {
    if (savedRecord?.estNo) return savedRecord.estNo;
    // A brand-new estimate works off a throwaway `new-<timestamp>` voyage id, so
    // give it a proper sequential number instead of exposing that internal id.
    if (createMode) return createEstNo;
    return `EST-${voyage?.id ?? '0000'}`;
  }, [savedRecord?.estNo, createMode, createEstNo, voyage?.id]);

  // Publish the estimate status so the Chartering sidebar buckets it correctly.
  useEffect(() => {
    if (voyage) setEstimationStatus(voyage.id, status);
  }, [voyage?.id, status]);

  // Keep the saved-estimate record's status in sync so the sidebar badge (e.g.
  // "On Subs") updates immediately when the status changes.
  useEffect(() => {
    setSavedEstimateStatus(estimateId, status);
  }, [estimateId, status]);

  // Publish the selected fix type so the sidebar shows it against the vessel.
  useEffect(() => {
    if (voyage) setEstimationFixType(voyage.id, inputs.fixType);
  }, [voyage?.id, inputs.fixType]);

  // Close the canals dropdown on outside click.
  useEffect(() => {
    if (!canalsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (canalsRef.current && !canalsRef.current.contains(e.target as Node)) setCanalsOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [canalsOpen]);

  // Close the Loadable Quantity pop-up on Escape.
  useEffect(() => {
    if (!lqOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLqOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lqOpen]);

  useEffect(() => {
    const snap = savedRecord?.data as { inputs?: EstimateInputs; vessel?: VesselParticular } | undefined;
    let initialInputs = snap?.inputs ?? seedInputs(voyage, createMode);
    let initialVessel = snap?.vessel ?? seedVessel(voyage, createMode);

    // Handle pre-fill from cargo/tonnage books via URL parameter
    if (fromParam === 'book') {
      try {
        if (bookDataParam) {
          const bookDataStr = atob(bookDataParam);  // searchParams already decodes, so just decode base64
          const bookData = JSON.parse(bookDataStr);

          // Pre-fill cargo from cargo book
          if (bookData?.type === 'cargo' && bookData?.data) {
            const cargoData = bookData.data;
            const quantity = Number((cargoData.quantity || '').replace(/,/g, '')) || 0;
            const frtRate = cargoData.frtRate ? Number((cargoData.frtRate || '').replace(/,/g, '')) : 0;
            
            initialInputs = {
              ...initialInputs,
              cargoes: [{
                id: uid('cg'),
                account: cargoData.account || '',
                name: cargoData.commodity || '',
                loadPort: cargoData.loadPort || '',
                dischPort: cargoData.dischargePort || '',
                quantity,
                unit: 'MT',
                frt: frtRate,
                frtUnit: cargoData.frtUnit || 'USD/MT',
                term: cargoData.terms || 'FIO',
                aCommPct: 3.75,
                brkgPct: 1.25,
                frtTaxPct: 0,
                linerTerm: 0,
              }],
            };
          }

          // Pre-fill vessel from tonnage book
          if (bookData?.type === 'tonnage' && bookData?.data) {
            const vesselData = bookData.data;
            const dwt = Number((vesselData.dwt || '').replace(/,/g, '')) || 180_000;
            const draft = Number(vesselData.draft || 9.5) || 9.5;
            const tpc = Number(vesselData.tpc || 42) || 42;
            const built = Number(vesselData.built || 2015) || 2015;
            
            initialVessel = {
              name: vesselData.vessel || 'Untitled',
              dwt,
              draft,
              tpc,
              built,
              kind: vesselData.vesselType || 'Bulk Carrier',
              type: vesselData.vesselType || 'Bulk Carrier',
            };
          }
        }
      } catch {
        /* ignore */
      }
    }
    
    // Sync ports with cargoes on load to ensure port rotation matches cargo entries
    if (initialInputs.cargoes.length > 0) {
      initialInputs = { ...initialInputs, ports: syncPortsWithCargo(initialInputs.ports, initialInputs.cargoes) };
    }
    
    setInputs(initialInputs);
    setVessel(initialVessel);
    const loadedStatus = (savedRecord?.status as EstStatus) ?? 'Estimate';
    setStatus(loadedStatus);
    // Lock estimation when it's marked as Fixed (can only be reopened with Reopen button)
    setLocked(loadedStatus === 'Fixed');
    setFixtureNo(null);
    setScenarios([]);
  }, [voyage?.id, estParam, fromParam, bookDataParam]);

  // Create a draft estimation in the sidebar when entering create mode (only once)
  useEffect(() => {
    if (!createMode || !estimateId || draftCreated) return;
    
    // Only create the draft once on component mount
    // This runs AFTER pre-fill has updated the state
    const existing = getSavedEstimate(estimateId);
    if (!existing) {
      upsertSavedEstimate({
        id: estimateId,
        estNo: estNo,
        vessel: vessel.name.trim() || 'Untitled',
        fixType: inputs.fixType,
        status: 'Estimate',
        profit: result.profit,
        tce: result.tce,
        savedAt: new Date().toLocaleString(),
        data: { inputs, vessel },
      });
      setDraftCreated(true);
    }
  }, [createMode, estimateId, vessel.name, inputs.cargoes.length]); // Re-run if vessel name or cargo count changes

  // Update the draft in the savedEstimates when pre-fill data changes
  useEffect(() => {
    if (!createMode || !estimateId || !draftCreated) return;
    
    const existing = getSavedEstimate(estimateId);
    if (existing) {
      // Update the draft with pre-filled data
      const updated = computeEstimate(inputs);
      upsertSavedEstimate({
        ...existing,
        vessel: vessel.name.trim() || 'Untitled',
        fixType: inputs.fixType,
        profit: updated.profit,
        tce: updated.tce,
        savedAt: new Date().toLocaleString(),
        data: { inputs, vessel },
      });
    }
  }, [createMode, estimateId, draftCreated, vessel.name, inputs.cargoes.length]); // Remove result from deps

  const result = useMemo(() => computeEstimate(inputs), [inputs]);

  // Auto-save with 2.5 second debounce (fire-and-forget, non-blocking)
  const autoSave = useAutoSaveEstimate(2500);

  useEffect(() => {
    if (locked || !voyage || !estimateId) return;

    const dto = {
      id: estimateId,
      estimateNo: estNo,
      vesselName: vessel.name.trim() || 'Untitled',
      fixType: inputs.fixType,
      status: status as any,
      profit: result.profit,
      tce: result.tce,
      commodity: inputs.cargoes[0]?.name || '',
      loadPort: inputs.ports.find((p) => p.type === 'Loading')?.port || '',
      dischargePort: inputs.ports.find((p) => p.type === 'Discharging')?.port || '',
      quantity: inputs.cargoes.reduce((s, c) => s + c.quantity, 0),
      freightRate: inputs.cargoes[0]?.frt || 0,
      dataJson: JSON.stringify({ inputs, vessel }),
    };

    // Only auto-save if estimation has meaningful data (vessel name or cargo entered)
    // This prevents creating untitled/empty estimations in the list
    const hasVessel = vessel?.name?.trim() || '';
    const hasCargo = inputs.cargoes.some((c) => c.name?.trim() || c.quantity > 0);
    if (hasVessel || hasCargo) {
      autoSave(dto);
    }
  }, [inputs, vessel, status, result, estNo, locked, voyage, estimateId, autoSave]);

  // Keep Hire/Day synced to the break-even hire (voyage-out fixtures only).
  useEffect(() => {
    if (!linkHF || locked || inputs.fixType.slice(inputs.fixType.indexOf('-') + 1) !== 'VOUT') return;
    const rounded = round(breakEvenHire(result, inputs.commercial.hAddCommPct));
    if (rounded !== inputs.commercial.dailyHire) {
      setInputs((prev) => ({ ...prev, commercial: { ...prev.commercial, dailyHire: rounded } }));
    }
  }, [linkHF, locked, result, inputs.fixType, inputs.commercial.hAddCommPct, inputs.commercial.dailyHire]);

  // Sync manual start date with inputs (used for first port arrival date)
  useEffect(() => {
    if (manualStartDate && !locked) {
      const time = inputs.startDate.split('T')[1] || '12:00';
      setInputs((prev) => ({ ...prev, startDate: `${manualStartDate}T${time}` }));
    }
  }, [manualStartDate, locked, inputs.startDate]);

  const compareOptions = useMemo(
    () => [{ id: 'current', name: 'Current', result }, ...scenarios.map((s) => ({ id: s.id, name: s.name, result: scenarioResult(inputs, s) }))],
    [result, scenarios, inputs],
  );
  const best = useMemo(() => {
    const r = compareOptions.map((o) => o.result);
    const resultDay = (x: EstimateResult) => (x.voyageDays > 0 ? x.profit / x.voyageDays : 0);
    return {
      profit: Math.max(...r.map((x) => x.profit)),
      cost: Math.min(...r.map((x) => x.totalExpense)),
      tce: Math.max(...r.map((x) => x.tce)),
      days: Math.min(...r.map((x) => x.voyageDays)),
      resultDay: Math.max(...r.map(resultDay)),
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
  const patchMain = (which: 'fullMainNormal' | 'fullMainEca' | 'ecoMainNormal' | 'ecoMainEca' | 'customMainNormal' | 'customMainEca', p: Partial<MainCons>) =>
    patchPerf({ [which]: { ...inputs.perf[which], ...p } } as Partial<Performance>);
  const patchSub = (which: 'fullSubNormal' | 'fullSubEca' | 'ecoSubNormal' | 'ecoSubEca' | 'customSubNormal' | 'customSubEca', p: Partial<SubCons>) =>
    patchPerf({ [which]: { ...inputs.perf[which], ...p } } as Partial<Performance>);
  const patchComm = (p: Partial<Commercial>) => patch({ commercial: { ...inputs.commercial, ...p } });

  // Get active consumption values based on current speedMode
  const getActiveMainConsumption = (): { normal: MainCons; eca: MainCons; normalKey: 'fullMainNormal' | 'ecoMainNormal' | 'customMainNormal'; ecaKey: 'fullMainEca' | 'ecoMainEca' | 'customMainEca' } => {
    if (inputs.perf.speedMode === 'Eco') {
      return { normal: inputs.perf.ecoMainNormal, eca: inputs.perf.ecoMainEca, normalKey: 'ecoMainNormal', ecaKey: 'ecoMainEca' };
    } else if (inputs.perf.speedMode === 'Full') {
      return { normal: inputs.perf.fullMainNormal, eca: inputs.perf.fullMainEca, normalKey: 'fullMainNormal', ecaKey: 'fullMainEca' };
    } else {
      return { normal: inputs.perf.customMainNormal, eca: inputs.perf.customMainEca, normalKey: 'customMainNormal', ecaKey: 'customMainEca' };
    }
  };

  const getActiveSubConsumption = (): { normal: SubCons; eca: SubCons; normalKey: 'fullSubNormal' | 'ecoSubNormal' | 'customSubNormal'; ecaKey: 'fullSubEca' | 'ecoSubEca' | 'customSubEca' } => {
    if (inputs.perf.speedMode === 'Eco') {
      return { normal: inputs.perf.ecoSubNormal, eca: inputs.perf.ecoSubEca, normalKey: 'ecoSubNormal', ecaKey: 'ecoSubEca' };
    } else if (inputs.perf.speedMode === 'Full') {
      return { normal: inputs.perf.fullSubNormal, eca: inputs.perf.fullSubEca, normalKey: 'fullSubNormal', ecaKey: 'fullSubEca' };
    } else {
      return { normal: inputs.perf.customSubNormal, eca: inputs.perf.customSubEca, normalKey: 'customSubNormal', ecaKey: 'customSubEca' };
    }
  };

  const activeMain = getActiveMainConsumption();
  const activeSub = getActiveSubConsumption();

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

  const updateCargo = (id: string, p: Partial<Cargo>) => {
    const updatedCargoes = inputs.cargoes.map((c) => (c.id === id ? { ...c, ...p } : c));
    const syncedPorts = syncPortsWithCargo(inputs.ports, updatedCargoes);
    patch({ cargoes: updatedCargoes, ports: syncedPorts });
  };
  const addCargo = () => {
    const newCargoes = [
      ...inputs.cargoes,
      { id: uid('cg'), account: '', name: '', loadPort: '', dischPort: '', quantity: 0, unit: defaultQtyUnitForVessel(vessel.type), frt: 0, frtUnit: defaultFreightUnit(defaultQtyUnitForVessel(vessel.type)), term: 'FIO', aCommPct: 3.75, brkgPct: 1.25, frtTaxPct: 0, linerTerm: 0 },
    ];
    const syncedPorts = syncPortsWithCargo(inputs.ports, newCargoes);
    patch({ cargoes: newCargoes, ports: syncedPorts });
  };
  const removeCargo = (id: string) => {
    const filteredCargoes = inputs.cargoes.filter((c) => c.id !== id);
    const syncedPorts = syncPortsWithCargo(inputs.ports, filteredCargoes);
    patch({ cargoes: filteredCargoes, ports: syncedPorts });
  };

  // Ad-hoc operation expenses (type dropdown + amount).
  const addExpense = () => patch({ expenses: [...inputs.expenses, { id: uid('ex'), type: opts.expenseTypes[0] ?? 'Other', amount: 0 }] });
  const updateExpense = (id: string, p: Partial<ExpenseLine>) => patch({ expenses: inputs.expenses.map((e) => (e.id === id ? { ...e, ...p } : e)) });
  const removeExpense = (id: string) => patch({ expenses: inputs.expenses.filter((e) => e.id !== id) });

  const updatePort = (id: string, p: Partial<PortRow>) =>
    patch({ ports: inputs.ports.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const addPort = () => {
    const speedSet = resolveSpeedSet(inputs.perf, inputs.perf.speedMode);
    // New ports default to Discharging (laden speed)
    return patch({
      ports: [
        ...inputs.ports,
        { id: uid('pr'), type: 'Discharging', port: '', distance: 0, ecaDistance: 0, wf: 5, speed: speedSet.laden, ldRate: 0, idle: 0.5, work: 0, seaManual: 0, dem: 15_000, des: 0, portCharge: 0, laytimeTerm: 'SHINC', rateUnit: 'MT/Day' },
      ],
    });
  };
  const removePort = (id: string) => patch({ ports: inputs.ports.filter((r) => r.id !== id) });

  const applyQuickPaste = () => {
    if (locked) return;
    const body = quickPasteText.trim();
    if (!body) {
      setQuickPasteMsg('Paste vessel/cargo details first, then click Apply.');
      return;
    }
    const parsed = parseEstimatePaste(body);
    const applied: string[] = [];

    const nextVessel: VesselParticular = { ...vessel };
    if (parsed.vesselName) {
      nextVessel.name = parsed.vesselName;
      applied.push('vessel name');
    }
    if (typeof parsed.vesselType === 'string' && parsed.vesselType.trim()) {
      nextVessel.type = parsed.vesselType.trim();
      applied.push('vessel type');
    }
    if (typeof parsed.built === 'number' && parsed.built > 0) {
      nextVessel.built = parsed.built;
      applied.push('built year');
    }
    if (typeof parsed.dwt === 'number' && parsed.dwt > 0) {
      nextVessel.dwt = parsed.dwt;
      applied.push('DWT');
    }
    if (typeof parsed.draft === 'number' && parsed.draft > 0) {
      nextVessel.draft = parsed.draft;
      applied.push('draft');
    }
    if (typeof parsed.tpc === 'number' && parsed.tpc > 0) {
      nextVessel.tpc = parsed.tpc;
      applied.push('TPC');
    }

    const nextInputs: EstimateInputs = {
      ...inputs,
      cargoes: [...inputs.cargoes],
      ports: [...inputs.ports],
      perf: {
        speedMode: inputs.perf.speedMode,
        full: { ...inputs.perf.full },
        eco: { ...inputs.perf.eco },
        customs: inputs.perf.customs,
        fullMainNormal: { ...inputs.perf.fullMainNormal },
        fullMainEca: { ...inputs.perf.fullMainEca },
        fullSubNormal: { ...inputs.perf.fullSubNormal },
        fullSubEca: { ...inputs.perf.fullSubEca },
        ecoMainNormal: { ...inputs.perf.ecoMainNormal },
        ecoMainEca: { ...inputs.perf.ecoMainEca },
        ecoSubNormal: { ...inputs.perf.ecoSubNormal },
        ecoSubEca: { ...inputs.perf.ecoSubEca },
        customMainNormal: { ...inputs.perf.customMainNormal },
        customMainEca: { ...inputs.perf.customMainEca },
        customSubNormal: { ...inputs.perf.customSubNormal },
        customSubEca: { ...inputs.perf.customSubEca },
      },
      commercial: { ...inputs.commercial },
    };

    if (typeof parsed.serviceBallastSpeed === 'number' && parsed.serviceBallastSpeed > 0) {
      nextInputs.perf.full.ballast = parsed.serviceBallastSpeed;
      applied.push('service ballast speed');
    }
    if (typeof parsed.serviceLadenSpeed === 'number' && parsed.serviceLadenSpeed > 0) {
      nextInputs.perf.full.laden = parsed.serviceLadenSpeed;
      applied.push('service laden speed');
    }
    if (typeof parsed.ecoBallastSpeed === 'number' && parsed.ecoBallastSpeed > 0) {
      nextInputs.perf.eco.ballast = parsed.ecoBallastSpeed;
      applied.push('eco ballast speed');
    }
    if (typeof parsed.ecoLadenSpeed === 'number' && parsed.ecoLadenSpeed > 0) {
      nextInputs.perf.eco.laden = parsed.ecoLadenSpeed;
      applied.push('eco laden speed');
    }
    // Service (Full Speed) FO values → Full mode consumption (Normal and ECA zones)
    if (typeof parsed.serviceBallastFo === 'number' && parsed.serviceBallastFo > 0) {
      nextInputs.perf.fullMainNormal.ballast = parsed.serviceBallastFo;
      nextInputs.perf.fullMainEca.ballast = parsed.serviceBallastFo;
      applied.push('service FO ballast');
    }
    if (typeof parsed.serviceLadenFo === 'number' && parsed.serviceLadenFo > 0) {
      nextInputs.perf.fullMainNormal.laden = parsed.serviceLadenFo;
      nextInputs.perf.fullMainEca.laden = parsed.serviceLadenFo;
      applied.push('service FO laden');
    }

    // Eco Speed FO values → Eco mode consumption (Normal and ECA zones)
    if (typeof parsed.ecoBallastFo === 'number' && parsed.ecoBallastFo > 0) {
      nextInputs.perf.ecoMainNormal.ballast = parsed.ecoBallastFo;
      nextInputs.perf.ecoMainEca.ballast = parsed.ecoBallastFo;
      applied.push('eco FO ballast');
    }
    if (typeof parsed.ecoLadenFo === 'number' && parsed.ecoLadenFo > 0) {
      nextInputs.perf.ecoMainNormal.laden = parsed.ecoLadenFo;
      nextInputs.perf.ecoMainEca.laden = parsed.ecoLadenFo;
      applied.push('eco FO laden');
    }

    // In-port FO for Full mode
    if (typeof parsed.inPortIdleFo === 'number' && parsed.inPortIdleFo > 0) {
      nextInputs.perf.fullMainNormal.idle = parsed.inPortIdleFo;
      nextInputs.perf.fullMainEca.idle = parsed.inPortIdleFo;
      applied.push('in-port idle FO');
    }
    if (typeof parsed.inPortWorkFo === 'number' && parsed.inPortWorkFo > 0) {
      nextInputs.perf.fullMainNormal.work = parsed.inPortWorkFo;
      nextInputs.perf.fullMainEca.work = parsed.inPortWorkFo;
      applied.push('in-port work FO');
    }
    // Service (Full Speed) MGO → BOTH subNormal and subEca (same consumption, different fuel type)
    const serviceMgo = [parsed.serviceLadenMgo, parsed.serviceBallastMgo].filter((v): v is number => typeof v === 'number' && v >= 0);
    if (serviceMgo.length > 0) {
      const seaMgo = round(serviceMgo.reduce((s, v) => s + v, 0) / serviceMgo.length, 3);
      nextInputs.perf.fullSubNormal.sea = seaMgo;
      nextInputs.perf.fullSubEca.sea = seaMgo;
      applied.push('service MGO sea');
    }

    // Eco Speed MGO → BOTH subNormal and subEca (same consumption, different fuel type)
    const ecoMgo = [parsed.ecoLadenMgo, parsed.ecoBallastMgo].filter((v): v is number => typeof v === 'number' && v >= 0);
    if (ecoMgo.length > 0) {
      const seaMgo = round(ecoMgo.reduce((s, v) => s + v, 0) / ecoMgo.length, 3);
      nextInputs.perf.ecoSubNormal.sea = seaMgo;
      nextInputs.perf.ecoSubEca.sea = seaMgo;
      applied.push('eco MGO sea');
    }

    if (parsed.laycanStart) {
      nextInputs.startDate = parsed.laycanStart;
      applied.push('laycan start');
    }
    const cargoNameParts = (parsed.cargoName ?? '')
      .split(/\bOR\b/i)[0]
      ?.split('+')
      .map((s) => s.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean) ?? [];
    const inferredCargoNames = cargoNameParts.length > 0 ? cargoNameParts : (parsed.cargoName ? [parsed.cargoName] : []);
    const targetCargoCount = Math.max(1, inferredCargoNames.length);
    const baseCargo = nextInputs.cargoes[0] ?? {
      id: uid('cg'),
      account: '',
      name: '',
      loadPort: '',
      dischPort: '',
      quantity: 0,
      unit: defaultQtyUnitForVessel(nextVessel.type),
      frt: 0,
      frtUnit: defaultFreightUnit(defaultQtyUnitForVessel(nextVessel.type)),
      term: 'FIO',
      aCommPct: 3.75,
      brkgPct: 1.25,
      frtTaxPct: 0,
      linerTerm: 0,
    } as Cargo;
    const nextCargoes = [...nextInputs.cargoes];
    while (nextCargoes.length < targetCargoCount) {
      nextCargoes.push({ ...baseCargo, id: uid('cg') });
    }
    const splitQty = typeof parsed.quantity === 'number' && parsed.quantity > 0 && targetCargoCount > 1
      ? round(parsed.quantity / targetCargoCount, 0)
      : undefined;
    for (let idx = 0; idx < targetCargoCount; idx += 1) {
      const curr = nextCargoes[idx];
      const cargoName = inferredCargoNames[idx] ?? curr.name;
      const dischPort = parsed.dischargePorts[idx] ?? parsed.dischargePorts[0] ?? curr.dischPort;
      nextCargoes[idx] = {
        ...curr,
        name: cargoName,
        quantity: typeof parsed.quantity === 'number' && parsed.quantity > 0 ? (splitQty ?? parsed.quantity) : curr.quantity,
        loadPort: parsed.loadPort ?? curr.loadPort,
        dischPort,
        frt: typeof parsed.freightRate === 'number' && parsed.freightRate > 0 ? parsed.freightRate : curr.frt,
      };
    }
    nextInputs.cargoes = nextCargoes;
    if (inferredCargoNames.length > 0) applied.push(inferredCargoNames.length > 1 ? 'cargoes' : 'cargo name');
    if (typeof parsed.quantity === 'number' && parsed.quantity > 0) applied.push('cargo quantity');
    if (parsed.loadPort) applied.push('load port (cargo)');
    if (parsed.dischargePorts.length > 0) applied.push('discharge port (cargo)');
    if (typeof parsed.freightRate === 'number' && parsed.freightRate > 0) {
      applied.push('freight rate');
      const totalQty = nextInputs.cargoes.reduce((s, c) => s + c.quantity, 0);
      nextInputs.commercial.freightIn = round(totalQty * parsed.freightRate, 0);
    }

    const basePorts = nextInputs.ports.length > 0 ? [...nextInputs.ports] : seedInputs(voyage, true).ports;
    const findRowIndex = (type: string, from = 0) => basePorts.findIndex((p, idx) => idx >= from && p.type === type);
    let loadIdx = findRowIndex('Loading');
    if (loadIdx < 0) {
      basePorts.unshift({ id: uid('pr'), type: 'Loading', port: '', distance: 0, ecaDistance: 0, wf: 5, speed: nextInputs.perf.full.laden, ldRate: 0, idle: 0.5, work: 0, seaManual: 0, dem: 0, des: 0, portCharge: 0, laytimeTerm: 'SHINC', rateUnit: 'MT/Day' });
      loadIdx = 0;
    }
    if (parsed.loadPort) {
      const matchedPort = findBestMatchPort(parsed.loadPort, 
        portOptions.map(p => ({ name: p })));
      basePorts[loadIdx] = { 
        ...basePorts[loadIdx], 
        port: matchedPort || parsed.loadPort 
      };
      applied.push('load port (rotation)');
    }
    if (typeof parsed.loadRate === 'number' && parsed.loadRate > 0) {
      basePorts[loadIdx] = { ...basePorts[loadIdx], ldRate: parsed.loadRate };
      applied.push('load rate');
    }

    const dischTargets = parsed.dischargePorts.length > 0 ? parsed.dischargePorts : [];
    const dischIndexes = basePorts
      .map((p, idx) => ({ p, idx }))
      .filter((x) => x.p.type === 'Discharging')
      .map((x) => x.idx);
    const dischTemplate = dischIndexes.length > 0
      ? { ...basePorts[dischIndexes[0]] }
      : { id: uid('pr'), type: 'Discharging', port: '', distance: 0, ecaDistance: 0, wf: 5, speed: nextInputs.perf.full.laden, ldRate: 0, idle: 0.5, work: 0, seaManual: 0, dem: 0, des: 0, portCharge: 0, laytimeTerm: 'SHINC', rateUnit: 'MT/Day' };

    while (dischIndexes.length < dischTargets.length) {
      const row: PortRow = { ...dischTemplate, id: uid('pr') };
      basePorts.push(row);
      dischIndexes.push(basePorts.length - 1);
    }
    dischTargets.forEach((portName, idx) => {
      const di = dischIndexes[idx];
      if (di == null) return;
      const matchedPort = findBestMatchPort(portName, 
        portOptions.map(p => ({ name: p })));
      const rate = parsed.dischargeRates[normalizePortName(portName)] ?? basePorts[di].ldRate;
      basePorts[di] = { 
        ...basePorts[di], 
        port: matchedPort || portName, 
        ldRate: rate > 0 ? rate : basePorts[di].ldRate 
      };
    });
    if (dischTargets.length > 0) applied.push('discharge options');
    if (Object.keys(parsed.dischargeRates).length > 0) applied.push('discharge rates');

    if (typeof parsed.demurrage === 'number' && parsed.demurrage > 0) {
      const des = typeof parsed.despatch === 'number' && parsed.despatch > 0 ? parsed.despatch : parsed.demurrage / 2;
      basePorts.forEach((p, idx) => {
        if (p.type === 'Loading' || p.type === 'Discharging') {
          basePorts[idx] = { ...p, dem: parsed.demurrage ?? p.dem, des };
        }
      });
      applied.push('demurrage/despatch');
    }

    nextInputs.ports = basePorts;

    setVessel(nextVessel);
    setInputs(nextInputs);
    touch();
    setQuickPasteMsg(
      applied.length > 0
        ? `Applied ${Array.from(new Set(applied)).length} sections from pasted details.`
        : 'No recognizable vessel/cargo fields found. Paste a recap-like block and try again.',
    );
  };

  // Resolve a port/landmark name to coordinates for auto-distance.
  const resolvePortCoord = (name: string): { lat: number; lon: number } | null => {
    const raw = name.trim();
    if (!raw) return null;
    // The port cells store the full "Name, Country (CODE)" label, so match that first.
    const exact = resolveWorldPort(raw, worldPorts);
    if (exact) return { lat: exact.lat, lon: exact.lon };
    // Fall back to a fuzzy match on just the leading name segment.
    const v = raw.split('(')[0].split(',')[0].trim().toLowerCase();
    if (v.length < 3) return null;
    const p =
      worldPorts.find((w) => w.name.toLowerCase() === v) ??
      worldPorts.find((w) => w.name.toLowerCase().startsWith(v)) ??
      worldPorts.find((w) => w.name.toLowerCase().includes(v));
    return p ? { lat: p.lat, lon: p.lon } : null;
  };

  // Auto-fill each leg's distance from the water route between consecutive ports.
  const getDistances = async () => {
    if (locked || gettingDist) return;
    setGettingDist(true);
    try {
      const updated = [...inputs.ports];
      for (let idx = 1; idx < updated.length; idx += 1) {
        const a = resolvePortCoord(updated[idx - 1].port);
        const b = resolvePortCoord(updated[idx].port);
        if (!a || !b) continue;
        try {
          const route = await generateSeaRoute(a, b);
          updated[idx] = { ...updated[idx], distance: Math.round(routeDistanceNm(route)) };
        } catch {
          /* leave this leg's distance unchanged */
        }
      }
      patch({ ports: updated });
    } finally {
      setGettingDist(false);
    }
  };
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
    const newCustom = { id, name: `Custom ${inputs.perf.customs.length + 1}`, ballast: 12, laden: 12 };
    const newPerf = { ...inputs.perf, customs: [...inputs.perf.customs, newCustom], speedMode: id };
    setInputs((prev) => ({ ...prev, perf: newPerf, ports: setLegSpeeds({ ...prev, perf: newPerf }, newCustom) }));
    touch();
  };
  const renameCustomSpeed = (id: string, name: string) =>
    patchPerf({ customs: inputs.perf.customs.map((c) => (c.id === id ? { ...c, name } : c)) });
  const removeCustomSpeed = (id: string) =>
    patchPerf({ customs: inputs.perf.customs.filter((c) => c.id !== id), speedMode: inputs.perf.speedMode === id ? 'Full' : inputs.perf.speedMode });
  const patchActiveSpeed = (p: Partial<SpeedSet>) => {
    if (locked) return;
    setInputs((prev) => {
      const mode = prev.perf.speedMode;
      const perf: Performance =
        mode === 'Full'
          ? { ...prev.perf, full: { ...prev.perf.full, ...p } }
          : mode === 'Eco'
            ? { ...prev.perf, eco: { ...prev.perf.eco, ...p } }
            : { ...prev.perf, customs: prev.perf.customs.map((c) => (c.id === mode ? { ...c, ...p } : c)) };
      // Re-apply the edited speed to the port legs (ballast / laden by leg type).
      return { ...prev, perf, ports: setLegSpeeds({ ...prev, perf }, resolveSpeedSet(perf, mode)) };
    });
    touch();
  };

  /* -------- header actions -------- */
  const newEstimate = () => {
    setInputs(seedInputs(voyage, true));
    setVessel(seedVessel(voyage, true));
    setStatus('Estimate');
    setLocked(false);
    setFixtureNo(null);
    setScenarios([]);
    setQuickPasteOpen(true);
    // Don't create sidebar entry yet - wait until save
  };
  // Duplicate the current estimation with a new EstimateNo
  const duplicate = async () => {
    try {
      const label = vessel.name.trim() || 'New Estimate';
      
      // Call backend API to create a duplicate with a new EstimateNo
      const apiDto = {
        // Don't provide estimateNo - let backend generate a new one
        vesselName: label,
        fixType: inputs.fixType,
        status: 'Estimate' as const,
        profit: result.profit,
        tce: result.tce,
        commodity: inputs.cargoes[0]?.name || '',
        loadPort: inputs.ports.find((p) => p.type === 'Loading')?.port || '',
        dischargePort: inputs.ports.find((p) => p.type === 'Discharging')?.port || '',
        quantity: inputs.cargoes.reduce((s, c) => s + c.quantity, 0),
        freightRate: inputs.cargoes[0]?.frt || 0,
        dataJson: JSON.stringify({ inputs, vessel }),
      };
      
      const response = await charteringApi.upsertEstimate(apiDto);
      const returnedEstNo = response?.estimateNo;
      
      // Save duplicate to local state
      upsertSavedEstimate({
        id: uid('est'),
        estNo: returnedEstNo || estNo,
        vessel: label,
        fixType: inputs.fixType,
        status: 'Estimate',
        profit: result.profit,
        tce: result.tce,
        savedAt: new Date().toLocaleString(),
        data: { inputs, vessel },
      });
      
      // Reset form for the new estimation
      setStatus('Estimate');
      setLocked(false);
      setFixtureNo(null);
      
      addNotification(
        `Estimation #${returnedEstNo} duplicated — ${label} (${money(result.profit)} profit)`,
        'Chartering'
      );
    } catch (error) {
      console.error('Failed to duplicate estimation:', error);
      addNotification(
        `Failed to duplicate estimation: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Chartering'
      );
    }
  };
  // Apply a standard vessel-size template: fill the vessel particulars +
  // performance profile, keeping the (searched) vessel name intact.
  const applyTemplate = (tpl: VesselTemplate) => {
    if (locked) return;
    setVessel((prev) => ({ ...prev, dwt: tpl.dwt, draft: tpl.draft, tpc: tpl.tpc, type: tpl.type }));
    setInputs((prev) => {
      const perf: Performance = {
        ...prev.perf,
        full: { ballast: tpl.fullBallast, laden: tpl.fullLaden },
        eco: { ballast: tpl.ecoBallast, laden: tpl.ecoLaden },
        // Apply template consumption to Full mode
        fullMainNormal: { ...prev.perf.fullMainNormal, ballast: tpl.mainBallast, laden: tpl.mainLaden, idle: tpl.mainIdle, work: tpl.mainWork },
        fullMainEca: { ...prev.perf.fullMainEca, ballast: tpl.mainBallast, laden: tpl.mainLaden, idle: tpl.mainIdle, work: tpl.mainWork },
        fullSubNormal: { ...prev.perf.fullSubNormal, sea: tpl.subSea, idle: tpl.subIdle, work: tpl.subWork },
        fullSubEca: { ...prev.perf.fullSubEca, sea: tpl.subSea, idle: tpl.subIdle, work: tpl.subWork },
      };
      return { ...prev, perf, ports: setLegSpeeds({ ...prev, perf }, resolveSpeedSet(perf, prev.perf.speedMode)) };
    });
    touch();
    setTplOpen(false);
  };
  const save = async () => {
    if (isSaving) return; // Prevent duplicate saves
    
    try {
      setIsSaving(true);
      touch();
      const label = vessel.name.trim() || 'New Estimate';
      
      // Call backend API to create/update estimation
      const apiDto = {
        estimateNo: estNo && !estNo.startsWith('new-') ? estNo : undefined, // Let backend generate if not set
        vesselName: label,
        fixType: inputs.fixType,
        status,
        profit: result.profit,
        tce: result.tce,
        commodity: inputs.cargoes[0]?.name || '',
        loadPort: inputs.ports.find((p) => p.type === 'Loading')?.port || '',
        dischargePort: inputs.ports.find((p) => p.type === 'Discharging')?.port || '',
        quantity: inputs.cargoes.reduce((s, c) => s + c.quantity, 0),
        freightRate: inputs.cargoes[0]?.frt || 0,
        dataJson: JSON.stringify({ inputs, vessel }),
        bookRef: bookRefParam || undefined, // Include book reference if from book
      };
      
      const response = await charteringApi.upsertEstimate(apiDto);
      
      // Extract the returned EstimateNo and ID from the response
      const returnedEstNo = response?.estimateNo;
      const returnedEstId = response?.id;
      
      // Update the backend ID for future deletion - only if we got a valid GUID back
      if (returnedEstId && !returnedEstId.startsWith('est-')) {
        setBackendEstimateId(returnedEstId);
      }
      
      // If this estimate came from a book, update the book with the estimateId
      if (bookRefParam && returnedEstId) {
        // Update the cargo book in localStorage
        try {
          const cargoBookStr = localStorage.getItem('fv.chartering.cargoBook');
          if (cargoBookStr) {
            const cargoBook = JSON.parse(cargoBookStr);
            const updatedBook = cargoBook.map((entry: any) => 
              entry.id === bookRefParam 
                ? { ...entry, estimateId: returnedEstId, estimationStatus: status }
                : entry
            );
            localStorage.setItem('fv.chartering.cargoBook', JSON.stringify(updatedBook));
          }
        } catch { /* ignore */ }
        
        // Update the tonnage book in localStorage
        try {
          const tonnageBookStr = localStorage.getItem('fv.chartering.tonnageBook');
          if (tonnageBookStr) {
            const tonnageBook = JSON.parse(tonnageBookStr);
            const updatedBook = tonnageBook.map((entry: any) => 
              entry.id === bookRefParam 
                ? { ...entry, estimateId: returnedEstId, estimationStatus: status }
                : entry
            );
            localStorage.setItem('fv.chartering.tonnageBook', JSON.stringify(updatedBook));
          }
        } catch { /* ignore */ }
      }
      
      // Save to local state for UI consistency
      upsertSavedEstimate({
        id: estimateId,
        estNo: returnedEstNo || estNo,
        vessel: label,
        fixType: inputs.fixType,
        status,
        profit: result.profit,
        tce: result.tce,
        savedAt: new Date().toLocaleString(),
        data: { inputs, vessel },
      });
      
      // Update sidebar status to reflect saved state (or create new entry if not existing)
      if (voyage?.id) {
        setEstimationStatus(voyage.id, status);
      }
      
      // Show success notification with Estimation Number
      addNotification(
        `Estimation #${returnedEstNo || estNo} created — ${label} (${money(result.profit)} profit)`,
        'Chartering'
      );
    } catch (error) {
      console.error('Failed to save estimation:', error);
      addNotification(
        `Failed to save estimation: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Chartering'
      );
    } finally {
      setIsSaving(false);
    }
  };
  const discard = () => newEstimate();
  const deleteEstimate = () => {
    if (!estimateId) {
      addNotification('No estimation to delete.', 'Chartering');
      return;
    }
    // Show confirmation dialog
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = () => {
    setShowDeleteConfirm(false);

    // Store current state in case we need to restore it
    const previousInputs = inputs;
    const previousVessel = vessel;
    const previousStatus = status;
    const previousLocked = locked;
    const previousFixtureNo = fixtureNo;
    const previousScenarios = scenarios;

    // Optimistically reset form to create mode
    setInputs(seedInputs(voyage, true));
    setVessel(seedVessel(voyage, true));
    setStatus('Estimate');
    setLocked(false);
    setFixtureNo(null);
    setScenarios([]);

    // Delete from backend
    void (async () => {
      try {
        // For backend-only operation: use backendEstimateId if available (GUID),
        // otherwise use the draft ID. Backend delete will be called for GUIDs.
        const idToDelete = backendEstimateId || estimateId;
        await deleteSavedEstimate(idToDelete);

        addNotification('Estimation deleted.', 'Chartering');
      } catch (error) {
        // Restore the previous state if deletion fails
        setInputs(previousInputs);
        setVessel(previousVessel);
        setStatus(previousStatus);
        setLocked(previousLocked);
        setFixtureNo(previousFixtureNo);
        setScenarios(previousScenarios);

        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to delete estimation:', error);
        addNotification(
          `Failed to delete estimation: ${errorMsg}`,
          'Chartering'
        );
      }
    })();
  };
  // Build and print a PDF report. When Compare is open with variants, the
  // report is the comparison table; otherwise it is the single-estimate sheet.
  const exportPdf = () => {
    const win = window.open('', '_blank', 'width=900,height=1200');
    if (!win) return;
    const esc = (s: unknown) =>
      String(s ?? '').replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] as string));
    const isCompare = compareOpen && scenarios.length > 0;
    const title = isCompare ? 'Voyage Estimation — Comparison' : 'Voyage Estimation';
    let bodyHtml = '';
    if (isCompare) {
      const row = (label: string, get: (r: (typeof compareOptions)[number]['result']) => number, kind: 'money' | 'num' | 'pct' = 'money') =>
        `<tr><td>${label}</td>${compareOptions
          .map((o) => {
            const v = get(o.result);
            const cell = kind === 'money' ? money(v) : kind === 'pct' ? `${fmt(v, 1)}%` : fmt(v, 2);
            return `<td class="r">${cell}</td>`;
          })
          .join('')}</tr>`;
      bodyHtml = `<table><thead><tr><th>Metric</th>${compareOptions
        .map((o) => `<th class="r">${esc(o.name)}</th>`)
        .join('')}</tr></thead><tbody>
        ${row('Profit', (r) => r.profit)}
        ${row('Revenue', (r) => r.revenue)}
        ${row('Total Expense', (r) => r.totalExpense)}
        ${row('TCE / Day', (r) => r.tce)}
        ${row('Total Hire', (r) => r.totalHire)}
        ${row('Result / Day', (r) => (r.voyageDays > 0 ? r.profit / r.voyageDays : 0))}
        ${row('Voyage Days', (r) => r.voyageDays, 'num')}
        ${row('Bunker', (r) => r.bunkerExpense)}
      </tbody></table>`;
    } else {
      const cargoRows = inputs.cargoes
        .map(
          (c) =>
            `<tr><td>${esc(c.name || '—')}</td><td>${esc(c.loadPort || '—')} → ${esc(c.dischPort || '—')}</td><td class="r">${fmt(c.quantity, 0)} ${esc(c.unit)}</td><td class="r">${fmt(c.frt, 2)} ${esc(c.frtUnit)}</td></tr>`,
        )
        .join('');
      const portRows = inputs.ports
        .map((p, idx) => {
          const leg = result.perLeg[idx];
          return `<tr><td>${esc(p.type)}</td><td>${esc(p.port || '—')}</td><td class="r">${fmt(p.distance, 0)}</td><td class="r">${leg ? fmt(leg.sea, 2) : '—'}</td><td class="r">${leg ? fmt(leg.work, 2) : '—'}</td></tr>`;
        })
        .join('');
      bodyHtml = `
        <div class="meta"><b>Vessel:</b> ${esc(vessel.name || '—')} &middot; <b>Type:</b> ${esc(vessel.type || '—')} &middot; <b>DWT:</b> ${fmt(vessel.dwt, 0)} &middot; <b>Fix Type:</b> ${esc(inputs.fixType)} &middot; <b>Status:</b> ${esc(status)}</div>
        <h3>Cargo</h3>
        <table><thead><tr><th>Cargo</th><th>Route</th><th class="r">Qty</th><th class="r">Rate</th></tr></thead><tbody>${cargoRows}</tbody></table>
        <h3>Port Rotation</h3>
        <table><thead><tr><th>Type</th><th>Port</th><th class="r">Distance</th><th class="r">Sea (d)</th><th class="r">Work (d)</th></tr></thead><tbody>${portRows}</tbody></table>
        <h3>Result</h3>
        <table><tbody>
          <tr><td>Revenue</td><td class="r">${money(result.revenue)}</td></tr>
          <tr><td>Operating Expense</td><td class="r">${money(result.opExpense)}</td></tr>
          <tr><td>Bunker Expense</td><td class="r">${money(result.bunkerExpense)}</td></tr>
          <tr><td>Total Hire</td><td class="r">${money(result.totalHire)}</td></tr>
          <tr><td>TCE / Day</td><td class="r">${money(result.tce)}</td></tr>
          <tr><td>Voyage Days</td><td class="r">${fmt(result.voyageDays, 2)}</td></tr>
          <tr class="profit"><td>Profit</td><td class="r">${money(result.profit)}</td></tr>
        </tbody></table>`;
    }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#111;}
      h1{font-size:18px;margin:0 0 2px;}
      h3{font-size:13px;margin:16px 0 4px;border-bottom:1px solid #ccc;padding-bottom:2px;}
      .meta{font-size:12px;color:#333;margin-bottom:8px;}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;}
      th,td{border:1px solid #ddd;padding:4px 6px;text-align:left;}
      th{background:#f0f0f0;}
      td.r,th.r{text-align:right;}
      .profit td{font-weight:bold;border-top:2px solid #333;}
    </style></head><body>
      <h1>${esc(title)}</h1>
      <div class="meta">${esc(vessel.name || 'New Estimate')} &middot; ${esc(estNo)} &middot; ${esc(new Date().toLocaleString())}${fixtureNo ? ` &middot; ${esc(fixtureNo)}` : ''}</div>
      ${bodyHtml}
    </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };
  const changeStatus = (next: EstStatus) => {
    if (locked && next !== 'Cancelled') return; // Allow cancel even when locked
    setStatus(next);
    // Update backend state
    if (voyage) setEstimationStatus(voyage.id, next);
    // Save to backend if in a saveable state
    if (next === 'On Subs' || next === 'Cancelled') {
      touch();
      const label = vessel.name.trim() || 'New Estimate';
      upsertSavedEstimate({
        id: estimateId,
        estNo: estNo,
        vessel: label,
        fixType: inputs.fixType,
        status: next,
        profit: result.profit,
        tce: result.tce,
        savedAt: new Date().toLocaleString(),
        data: { inputs, vessel },
      });
    }
  };
  const markFixed = () => {
    if (locked) return;
    // Ask for the Charter Party date so a delayed fix still records the real
    // CP date rather than today.
    setCpDate(cpdd ? cpddToIso(cpdd) : new Date().toISOString().slice(0, 10));
    setFixOpen(true);
  };
  const confirmFixed = async () => {
    if (!voyage || !cpDate) return;
    
    try {
      // Set status and save to backend
      setStatus('Fixed');
      const [y, m, d] = cpDate.split('-');
      const cpddStr = `${d}.${m}.${y}`;
      setCpdd(voyage.id, cpddStr);
      
      // Monthly fixture sequence derived deterministically from the voyage.
      const seq = (Math.abs(Math.round(voyage.seed ?? 0)) % 99) + 1;
      const fno = makeFixtureNo(seq);
      setFixtureNo(fno);
      setFixtureNumber(voyage.id, fno);
      setLocked(true);
      setFixOpen(false);
      
      // Save to local state
      const label = vessel.name.trim() || 'New Estimate';
      upsertSavedEstimate({
        id: estimateId,
        estNo: estNo,
        vessel: label,
        fixType: inputs.fixType,
        status: 'Fixed',
        profit: result.profit,
        tce: result.tce,
        savedAt: new Date().toLocaleString(),
        data: { inputs, vessel },
      });
      
      // Update backend state
      if (voyage) setEstimationStatus(voyage.id, 'Fixed');
      
      addNotification(
        `Estimation #${estNo} marked as Fixed — Charter Party Date: ${cpddStr} — Fixture No: ${fno}`,
        'Chartering'
      );
    } catch (error) {
      console.error('Failed to mark as fixed:', error);
      addNotification(
        `Failed to mark as fixed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Chartering'
      );
    }
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
    const confirmed = window.confirm(
      'Are you sure you want to cancel this fixture?\n\nThis action will mark the estimation as Cancelled and cannot be undone.'
    );
    if (!confirmed) return;
    
    try {
      setLocked(false);
      setStatus('Cancelled');
      setFixtureNo(null);
      
      // Update backend state
      if (voyage) setEstimationStatus(voyage.id, 'Cancelled');
      
      // Save to local state
      const label = vessel.name.trim() || 'New Estimate';
      upsertSavedEstimate({
        id: estimateId,
        estNo: estNo,
        vessel: label,
        fixType: inputs.fixType,
        status: 'Cancelled',
        profit: result.profit,
        tce: result.tce,
        savedAt: new Date().toLocaleString(),
        data: { inputs, vessel },
      });
      
      addNotification(
        `Estimation #${estNo} cancelled — ${label}`,
        'Chartering'
      );
    } catch (error) {
      console.error('Failed to cancel estimation:', error);
      addNotification(
        `Failed to cancel estimation: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Chartering'
      );
    }
  };
  // Hand the fixed voyage over to Operations and notify the team to assign a PIC.
  const copyToOperations = () => {
    if (!voyage || status !== 'Fixed') return;

    // Extract ports from estimation
    const deliveryPort = inputs.ports.find((p) => p.type === 'Delivery')?.port || '';
    const loadingPorts = inputs.ports.filter((p) => p.type === 'Loading' || p.type === 'Part Loading');
    const dischargingPorts = inputs.ports.filter((p) => p.type === 'Discharging' || p.type === 'Part Discharging');
    const redeliveryPort = inputs.ports.find((p) => p.type === 'Redelivery')?.port || '';
    
    const firstLoad = loadingPorts[0]?.port ?? voyage.portFrom ?? '';
    const firstDisch = dischargingPorts[0]?.port ?? voyage.portTo ?? '';
    const cargo = inputs.cargoes[0];
    
    // Format dates to recap format (dd-mm-yyyy)
    const formatDateToRecap = (isoDate: string): string => {
      if (!isoDate) return '';
      const date = new Date(isoDate);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    };
    
    // Build ETA plan with legs from estimation
    const buildEtaLegList = () => {
      const legs: any[] = [];
      for (let i = 0; i < inputs.ports.length; i++) {
        const port = inputs.ports[i];
        
        // Sea leg to this port (if there's a previous port)
        if (i > 0) {
          const prevPort = inputs.ports[i - 1];
          legs.push({
            from: prevPort.port,
            to: port.port,
            kind: 'sea',
            type: port.type === 'Discharging' || port.type === 'Part Discharging' ? 'Laden' : 'Ballast',
            distNonEca: String(port.distance - port.ecaDistance),
            distEca: String(port.ecaDistance),
            speed: String(port.speed),
            wf: String(port.wf),
            portDays: '',
            consVlsfo: String(inputs.perf.fullMainNormal.laden),
            consMgo: String(inputs.perf.fullSubNormal.sea),
            supVlsfo: '',
            supMgo: '',
            tz: '0',
          });
        }
        
        // Port leg
        if (port.type !== 'Ballast' && port.type !== 'Delivery') {
          legs.push({
            from: port.port,
            to: port.port,
            kind: 'port',
            type: port.type,
            distNonEca: '0',
            distEca: '0',
            speed: '',
            wf: '',
            portDays: String(port.idle + port.work),
            consVlsfo: String(inputs.perf.fullMainNormal.idle + inputs.perf.fullMainNormal.work),
            consMgo: String(inputs.perf.fullSubNormal.idle + inputs.perf.fullSubNormal.work),
            supVlsfo: '',
            supMgo: '',
            tz: '0',
          });
        }
      }
      return legs;
    };
    
    // Start date from estimation
    const startDate = new Date(inputs.startDate);
    const startDateStr = formatDateToRecap(inputs.startDate);

    // Distribute the estimation's cargoes across the vessel's actual physical holds (from the
    // fleet record) instead of creating exactly one hold per cargo — so e.g. a single-grade
    // cargo on a 5-hold vessel still shows 5 holds, not 1.
    const vesselHoldCount = (() => {
      const match = vessels.find((v) => v.name.trim().toLowerCase() === vessel.name.trim().toLowerCase());
      const n = Number(match?.holds);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : Math.max(1, inputs.cargoes.length);
    })();
    const totalCargoQty = inputs.cargoes.reduce((s, c) => s + c.quantity, 0) || 1;
    const holdsList: { name: string; cargo: string; qty: string }[] = [];
    inputs.cargoes.forEach((c, ci) => {
      const isLast = ci === inputs.cargoes.length - 1;
      const share = isLast ? vesselHoldCount - holdsList.length : Math.max(1, Math.round(vesselHoldCount * (c.quantity / totalCargoQty)));
      const perHoldQty = share > 0 ? c.quantity / share : 0;
      for (let h = 0; h < share; h++) {
        holdsList.push({ name: `Hold ${holdsList.length + 1}`, cargo: c.name, qty: String(Math.round(perHoldQty)) });
      }
    });
    while (holdsList.length < vesselHoldCount) holdsList.push({ name: `Hold ${holdsList.length + 1}`, cargo: '', qty: '0' });

    // Create comprehensive recap object
    const recap: any = {
      vesselName: vessel.name.trim() || '',
      vesselEmail: '',
      draftBallast: String(vessel.draft),
      draftLaden: String(vessel.draft),
      voyageFixType: inputs.fixType,
      owners: '',
      cpDate: cpdd || startDateStr,
      laycanStart: startDateStr,
      laycanEnd: startDateStr,
      ownersBroker: '',
      hirePerDay: String(Math.round(inputs.commercial.dailyHire)),
      charterers: cargo?.account || '',
      charterersLaycanStart: '',
      charterersLaycanEnd: '',
      charterersBroker: '',
      freightPerMt: cargo ? String(cargo.frt) : '',
      demDespatch: String(loadingPorts[0]?.dem || 0),
      despatchTerm: '',
      deliveryPort: deliveryPort,
      deliveryTerm: '',
      deliveryDateTime: startDateStr + ' 00:00',
      redeliveryPort: redeliveryPort,
      redeliveryTerm: '',
      redeliveryDateTime: formatDateToRecap(addDays(startDate, Math.ceil(result.voyageDays)).toISOString()) + ' 00:00',
      deliveryNotices: '',
      wxClause: '',
      ilohc: String(inputs.commercial.ilohc),
      cve: String(inputs.commercial.cev),
      adcom: inputs.commercial.hAddCommPct ? `${inputs.commercial.hAddCommPct}%` : '',
      brokerage: String(inputs.cargoes[0]?.brkgPct || ''),
      pniClub: '',
      arbitrationPlace: '',
      governingLaw: '',
      sanctionsClause: '',
      ballastBonus: String(inputs.commercial.ballastBonus || 0),
      redeliveryNotices: '',
      hullCleaningClause: '',
      cargoName: inputs.cargoes.map((c) => c.name).join(' / '),
      holdCount: String(vesselHoldCount),
      cpQuantity: cargo ? String(cargo.quantity) : '',
      holdCleaning: '',
      finalQtyLoaded: cargo ? String(cargo.quantity) : '',
      blIssueDate: '',
      loadPort: loadingPorts.map((p) => p.port).join(' + '),
      norAtLoadPort: '',
      loadRate: loadingPorts[0] ? String(loadingPorts[0].ldRate) : '',
      pdaLoadPort: '',
      frtPaymentTerms: cargo?.term || '',
      dischargePort: dischargingPorts.map((p) => p.port).join(' + '),
      norAtDPort: '',
      dischRate: dischargingPorts[0] ? String(dischargingPorts[0].ldRate) : '',
      pdaDPort: '',
      freeDa: '',
      loiOblDPort: '',
      loiStatus: '',
      foCons: String(Math.round(result.vlsfoCons)),
      foPrice: String(inputs.commercial.vlsfoPrice),
      doCons: String(Math.round(result.mgoCons)),
      doPrice: String(inputs.commercial.mgoPrice),
      portDaLoad: loadingPorts[0] ? String(loadingPorts[0].portCharge) : '',
      portDaDisch: dischargingPorts[0] ? String(dischargingPorts[0].portCharge) : '',
      otherCost: String(inputs.expenses.reduce((s, e) => s + e.amount, 0)),
      miscIncome: '',
      cpSpeed: String(inputs.perf.full.laden),
      cpCons: String(inputs.perf.fullMainNormal.laden),
      cpConsByFuel: {},
      hireCurrency: inputs.currency,
      freightCurrency: inputs.currency,
      cargoQtyUnit: cargo?.unit || '',
      charterHirePerDay: String(Math.round(inputs.commercial.dailyHireOut)),
      charterHireCurrency: inputs.currency,
      firstHirePeriodDays: String(Math.ceil(result.voyageDays / 15) * 15 || ''),
      firstHireInclude: '',
      firstHireDays: '',
      firstHireBasis: 'PRO RATA',
      hireEveryDays: '15',
      charterFirstHirePeriodDays: String(Math.ceil(result.voyageDays / 15) * 15 || ''),
      charterFirstHireInclude: '',
      charterFirstHireDays: '',
      charterFirstHireBasis: 'PRO RATA',
      charterHireEveryDays: '15',
      hirePayState: {},
      charterHirePayState: {},
      freightPaymentDays: '',
      freightPaymentBasis: '',
      serviceProviders: [],
      additionalVoyageLegs: inputs.ports.map((p, index) => ({ p, index })).filter(({ p }) => /bunker/i.test(p.type)).map(({ p, index }) => ({
        id: `est-bunker-${p.id}`,
        type: 'Bunker Port',
        port: p.port,
        term: p.laytimeTerm || 'Upon arrival',
        rate: String(p.ldRate || ''),
        pda: String(p.portCharge || ''),
        dateTime: result.perLeg[index]?.arrival || '',
        notice: 'Bunker supply schedule',
        loi: '',
        loiStatus: '',
      })),
      bunkerSpecs: '',
      bunkers: [
        { fuel: 'VLSFO', bod: String(Math.round(result.vlsfoCons)), expBor: inputs.commercial.borQty ? String(Math.round(inputs.commercial.borQty)) : '', cpPrice: String(inputs.commercial.vlsfoPrice), bookedPrice: '', masterReq: '', actualSupply: '', actualBor: '' },
        { fuel: 'ULSFO', bod: String(Math.round(result.ulsfoCons)), expBor: '', cpPrice: String(inputs.commercial.ulsfoPrice || ''), bookedPrice: '', masterReq: '', actualSupply: '', actualBor: '' },
        { fuel: 'MGO', bod: String(Math.round(result.mgoCons)), expBor: '', cpPrice: String(inputs.commercial.mgoPrice), bookedPrice: '', masterReq: '', actualSupply: '', actualBor: '' },
      ],
      pnlNotes: {},
      etaPlan: {
        startDep: startDateStr + ' 00:00',
        startRobVlsfo: String(Math.round(result.vlsfoCons * 1.15)),
        startRobMgo: String(Math.round(result.mgoCons * 0.1)),
        weatherMargin: '',
        perf: {
          speedMode: inputs.perf.speedMode,
          full: { ballast: String(inputs.perf.full.ballast), laden: String(inputs.perf.full.laden) },
          eco: { ballast: String(inputs.perf.eco.ballast), laden: String(inputs.perf.eco.laden) },
          customs: inputs.perf.customs.map((c) => ({ id: c.id, name: c.name, ballast: String(c.ballast), laden: String(c.laden) })),
          fullMainNormal: {
            type: String(inputs.perf.fullMainNormal.type),
            ballast: String(inputs.perf.fullMainNormal.ballast),
            laden: String(inputs.perf.fullMainNormal.laden),
            idle: String(inputs.perf.fullMainNormal.idle),
            work: String(inputs.perf.fullMainNormal.work),
          },
          fullMainEca: {
            type: String(inputs.perf.fullMainEca.type),
            ballast: String(inputs.perf.fullMainEca.ballast),
            laden: String(inputs.perf.fullMainEca.laden),
            idle: String(inputs.perf.fullMainEca.idle),
            work: String(inputs.perf.fullMainEca.work),
          },
          fullSubNormal: { type: String(inputs.perf.fullSubNormal.type), sea: String(inputs.perf.fullSubNormal.sea), idle: String(inputs.perf.fullSubNormal.idle), work: String(inputs.perf.fullSubNormal.work) },
          fullSubEca: { type: String(inputs.perf.fullSubEca.type), sea: String(inputs.perf.fullSubEca.sea), idle: String(inputs.perf.fullSubEca.idle), work: String(inputs.perf.fullSubEca.work) },
          ecoMainNormal: {
            type: String(inputs.perf.ecoMainNormal.type),
            ballast: String(inputs.perf.ecoMainNormal.ballast),
            laden: String(inputs.perf.ecoMainNormal.laden),
            idle: String(inputs.perf.ecoMainNormal.idle),
            work: String(inputs.perf.ecoMainNormal.work),
          },
          ecoMainEca: {
            type: String(inputs.perf.ecoMainEca.type),
            ballast: String(inputs.perf.ecoMainEca.ballast),
            laden: String(inputs.perf.ecoMainEca.laden),
            idle: String(inputs.perf.ecoMainEca.idle),
            work: String(inputs.perf.ecoMainEca.work),
          },
          ecoSubNormal: { type: String(inputs.perf.ecoSubNormal.type), sea: String(inputs.perf.ecoSubNormal.sea), idle: String(inputs.perf.ecoSubNormal.idle), work: String(inputs.perf.ecoSubNormal.work) },
          ecoSubEca: { type: String(inputs.perf.ecoSubEca.type), sea: String(inputs.perf.ecoSubEca.sea), idle: String(inputs.perf.ecoSubEca.idle), work: String(inputs.perf.ecoSubEca.work) },
          customMainNormal: {
            type: String(inputs.perf.customMainNormal.type),
            ballast: String(inputs.perf.customMainNormal.ballast),
            laden: String(inputs.perf.customMainNormal.laden),
            idle: String(inputs.perf.customMainNormal.idle),
            work: String(inputs.perf.customMainNormal.work),
          },
          customMainEca: {
            type: String(inputs.perf.customMainEca.type),
            ballast: String(inputs.perf.customMainEca.ballast),
            laden: String(inputs.perf.customMainEca.laden),
            idle: String(inputs.perf.customMainEca.idle),
            work: String(inputs.perf.customMainEca.work),
          },
          customSubNormal: { type: String(inputs.perf.customSubNormal.type), sea: String(inputs.perf.customSubNormal.sea), idle: String(inputs.perf.customSubNormal.idle), work: String(inputs.perf.customSubNormal.work) },
          customSubEca: { type: String(inputs.perf.customSubEca.type), sea: String(inputs.perf.customSubEca.sea), idle: String(inputs.perf.customSubEca.idle), work: String(inputs.perf.customSubEca.work) },
          mainNormal: {
            type: 'VLSFO',
            ballast: String(inputs.perf.fullMainNormal.ballast),
            laden: String(inputs.perf.fullMainNormal.laden),
            idle: String(inputs.perf.fullMainNormal.idle),
            work: String(inputs.perf.fullMainNormal.work),
          },
          mainEca: {
            type: 'ULSFO',
            ballast: String(inputs.perf.fullMainEca.ballast),
            laden: String(inputs.perf.fullMainEca.laden),
            idle: String(inputs.perf.fullMainEca.idle),
            work: String(inputs.perf.fullMainEca.work),
          },
          subNormal: { type: 'MGO', sea: String(inputs.perf.fullSubNormal.sea), idle: String(inputs.perf.fullSubNormal.idle), work: String(inputs.perf.fullSubNormal.work) },
          subEca: { type: 'MGO', sea: String(inputs.perf.fullSubEca.sea), idle: String(inputs.perf.fullSubEca.idle), work: String(inputs.perf.fullSubEca.work) },
        },
        legs: buildEtaLegList(),
      },
      stowage: {
        lightship: String(Math.round(vessel.dwt * 0.2)),
        autoBunker: true,
        constants: '500',
        freshWater: '150',
        ballastWater: '150',
        refDisplacement: String(Math.round(vessel.dwt * 1.2)),
        points: [
          {
            name: 'Lightship',
            displacement: String(Math.round(vessel.dwt * 0.2)),
            density: '1.000',
            vlsfo: '0',
            mgo: '0',
            bw: '0',
            fw: '0',
            constants: '0',
          },
          {
            name: 'VLSFO On Board',
            displacement: String(Math.round(result.vlsfoCons * 1.15)),
            density: '0.890',
            vlsfo: String(Math.round(result.vlsfoCons * 1.15)),
            mgo: '0',
            bw: '0',
            fw: '0',
            constants: '0',
          },
          {
            name: 'MGO On Board',
            displacement: String(Math.round(result.mgoCons * 0.1)),
            density: '0.860',
            vlsfo: '0',
            mgo: String(Math.round(result.mgoCons * 0.1)),
            bw: '0',
            fw: '0',
            constants: '0',
          },
          {
            name: 'Ballast Water',
            displacement: '150',
            density: '1.025',
            vlsfo: '0',
            mgo: '0',
            bw: '150',
            fw: '0',
            constants: '0',
          },
          {
            name: 'Fresh Water',
            displacement: '150',
            density: '1.000',
            vlsfo: '0',
            mgo: '0',
            bw: '0',
            fw: '150',
            constants: '0',
          },
          {
            name: 'Stores & Constants',
            displacement: '500',
            density: '1.000',
            vlsfo: '0',
            mgo: '0',
            bw: '0',
            fw: '0',
            constants: '500',
          },
        ],
        holds: holdsList.map((h) => ({
          name: h.name,
          cargo: h.cargo,
          qty: h.qty,
          capacity: '',
          grainCap: '',
          baleCap: '',
          tankTopArea: '',
          tankTopMax: '',
        })),
        draft: {
          tpc: String(vessel.tpc),
          densityFrom: '',
          densityTo: '',
          draftCurrent: String(vessel.draft),
          dispSW: '',
          vlsfo: String(Math.round(result.vlsfoCons * 1.15)),
          mgo: String(Math.round(result.mgoCons * 0.1)),
          bw: '',
          fw: '',
          constants: '',
          shipSurveyQty: cargo ? String(cargo.quantity) : '',
          shoreScaleQty: cargo ? String(cargo.quantity) : '',
          loiTolerancePct: '0.5',
        },
        grades: inputs.cargoes.map((c) => ({
          grade: c.name,
          sf: cargoStowageFactor(c.name),
          qty: String(c.quantity),
          sfAuto: true,
        })),
        // Build ports from ALL ports in estimation, not just first/last
        ports: inputs.ports
          .filter((p) => p.port) // Only include ports with names
          .map((p) => ({
            name: p.port,
            maxDraft: '',
            density: '',
            remarks: p.type,
          })),
        summerDraft: String(vessel.draft),
        winterDraft: String(vessel.draft),
        tropicalDraft: String(vessel.draft),
      },
      freightLaytime: undefined,
      notes: inputs.remark || '',
    };
    
    // Save voyage in Voyage system - use ONLY estimation data for ports
    const saved = upsertCreatedVoyage({
      id: voyage.id,
      vessel: vessel.name.trim() || '',
      imo: '',
      vesselType: vessel.type || '',
      dwt: vessel.dwt > 0 ? String(Math.round(vessel.dwt)) : '',
      built: vessel.built || 0,
      client: '',
      clientEmail: '',
      pic: '',
      service: '',
      status: 'At Sea',
      portFrom: firstLoad,
      portTo: firstDisch,
      cpSpeed: inputs.perf.full.laden || 0,
      cpCons: inputs.perf.fullMainNormal.laden || 0,
      instSpeed: inputs.perf.eco.laden || 0,
      instCons: inputs.perf.ecoMainNormal.laden || 0,
      price: inputs.commercial.dailyHire || 0,
      pricingBasis: '',
      costPerDay: inputs.commercial.dailyHire || 0,
      foCost: inputs.commercial.vlsfoPrice || 0,
      goCost: inputs.commercial.mgoPrice || 0,
      euaCost: 0,
      openTasks: 0,
      open: 'OPEN',
      health: 74,
      seed: Date.now() % 10_000,
    });
    
    // Save the comprehensive recap to Operations module
    void (async () => {
      try {
        const { writeOpsRecapRaw, writeOpsEstBaseline } = await import('../data/opsRecap');
        const recapJson = JSON.stringify(recap);
        writeOpsRecapRaw(saved.id, recapJson);
        // Snapshot the fixed estimate so the Live P&L "Estimated" column stays put.
        writeOpsEstBaseline(saved.id, recapJson);
      } catch (error) {
        console.error('Failed to save operations recap:', error);
      }
    })();
    
    handoverToOperations(saved.id);
    addNotification(
      `Fixture ${estNo} copied to Operations — ${saved.vessel} | Load: ${firstLoad} | Disch: ${firstDisch} | ${money(result.profit)} profit | ${fmt(result.tce, 0)}/day TCE`,
      'Operations'
    );
  };

  /* -------- compare scenarios -------- */
  const baseVariant = (basis: CompareBasis, name: string): Scenario => ({
    id: uid('sc'),
    name,
    basis,
    ballastSpeed: inputs.perf.full.ballast,
    ladenSpeed: inputs.perf.full.laden,
    foBallast: activeMain.normal.ballast,
    foLaden: activeMain.normal.laden,
    dailyHire: inputs.commercial.dailyHire,
    hAddCommPct: inputs.commercial.hAddCommPct,
    qty: inputs.cargoes[0]?.quantity ?? 0,
    rate: inputs.cargoes[0]?.frt ?? 0,
    aCommPct: inputs.cargoes[0]?.aCommPct ?? 0,
    brkgPct: inputs.cargoes[0]?.brkgPct ?? 0,
    frtTaxPct: inputs.cargoes[0]?.frtTaxPct ?? 0,
  });
  const addVesselVariant = () => {
    const n = scenarios.filter((s) => s.basis === 'vessel').length + 1;
    setScenarios((s) => [...s, baseVariant('vessel', `Vessel ${n}`)]);
    setCompareOpen(true);
  };
  const addCargoVariant = () => {
    const n = scenarios.filter((s) => s.basis === 'cargo').length + 1;
    setScenarios((s) => [...s, baseVariant('cargo', `Cargo ${n}`)]);
    setCompareOpen(true);
  };
  const updateScenario = (id: string, p: Partial<Scenario>) =>
    setScenarios((s) => s.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const removeScenario = (id: string) => setScenarios((s) => s.filter((x) => x.id !== id));

  const stat = STATUS_META[status];
  // Port-type dropdown values from the admin store (+ math-critical Ballast/Laden).
  const legacyPortType = (value: string) => ({ Bunkering: 'Bunker', 'Dry Dock': 'DryDock', Redelivery: 'ReDelivery', Waiting: 'Idle / Waiting', Idle: 'Idle / Waiting', Other: 'Idle / Waiting', 'Bunker Port': 'Bunker' } as Record<string, string>)[value] || value;
  const legTypes = ['Ballast', 'Laden', ...PORT_TYPE_OPTIONS];
  // Drive currency-aware money() formatting for this render.
  ACTIVE_CURRENCY = inputs.currency;

  // Loadable-quantity constraining points from the voyage (load/bunker/disch) + zone entry.
  const lqPoints = [
    ...inputs.ports.filter((p) => p.port && /Load|Bunker|Disch/i.test(p.type)).map((p) => `${p.type} — ${p.port}`),
    'Summer Zone Entry',
  ];
  const openLq = () => {
    // Calculate bunker requirements based on voyage data
    const totalSeaDays = result.perLeg.reduce((sum, leg) => sum + (leg?.sea ?? 0), 0);
    // Use loaded main engine consumption as average for voyage bunker estimation (MT/day)
    const mainFoConsumption = getActiveMainConsumption().normal.laden ?? 30; // Default to 30 MT/day if not set
    const estimatedVlsfo = Math.round(mainFoConsumption * totalSeaDays * 1.15); // 15% buffer for reserve
    const estimatedMgo = Math.round(estimatedVlsfo * 0.15); // ~15% of VLSFO for maneuvering/port ops
    
    setLq((s) => ({
      ...s,
      summerDwt: s.summerDwt || vessel.dwt,
      lightship: s.lightship || Math.round(vessel.dwt * 0.2),
      densityAtPort: s.densityAtPort || 1.025,
      // Only set bunker quantities if not already manually entered
      vlsfo: s.vlsfo > 0 ? s.vlsfo : estimatedVlsfo,
      mgo: s.mgo > 0 ? s.mgo : estimatedMgo,
      bw: s.bw > 0 ? s.bw : 150, // Typical ballast water in port
      fw: s.fw > 0 ? s.fw : 150, // Fresh water for crew
      constants: s.constants > 0 ? s.constants : 500, // Stores, spares, provisions
      point: s.point || lqPoints[0] || '',
    }));
    setLqOpen(true);
  };
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
  // Numeric cell that sizes its width to the current value (grows / shrinks).
  const autoNumCell = (value: number, onChange: (n: number) => void, minCh = 3.5) => {
    const w = Math.max(minCh, String(value ?? '').length + 2.5);
    return <input className="fv-ce__cell-num fv-ce__cell-auto" style={{ width: `${w}ch` }} type="number" value={value} disabled={locked} onChange={(e) => onChange(num(e.target.value))} />;
  };
  // Port cell backed by our world-port data (settings database).
  const portCell = (value: string, onChange: (v: string) => void, min = 160) => (
    <CeAutocomplete value={value} onChange={onChange} options={portOptions} placeholder="Search port…" disabled={locked} min={min} />
  );
  const vesselCell = (value: string, onChange: (v: string) => void, min = 150) => (
    <CeAutocomplete value={value} onChange={onChange} options={vesselOptions} placeholder="Select vessel…" disabled={locked} min={min} />
  );
  // Account cell backed by the accounts created in Settings → Account Details.
  const accountCell = (value: string, onChange: (v: string) => void, min = 90) => (
    <CeAutocomplete value={value} onChange={onChange} options={accountOptions} placeholder="Select account…" disabled={locked} min={min} />
  );
  // Cargo-name cell with common-commodity suggestions (free text stays).
  const cargoCell = (value: string, onChange: (v: string) => void, min = 100) => (
    <CeAutocomplete value={value} onChange={onChange} options={cargoOptions} placeholder="Cargo…" disabled={locked} min={min} />
  );
  // Compact in-cell select for units / terms sourced from the options list.
  const optCell = (value: string, onChange: (v: string) => void, options: string[], min = 62) => (
    <select className="fv-ce__cell-select" style={{ minWidth: min }} value={value} disabled={locked} onChange={(e) => onChange(e.target.value)}>
      {value && !options.includes(value) && <option value={value}>{value}</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  // Fuel-grade select cell.
  const fuelCell = (value: string, onChange: (v: string) => void) => (
    <select className="fv-ce__cell-select" style={{ minWidth: 78 }} value={value} disabled={locked} onChange={(e) => onChange(e.target.value)}>
      {value && !opts.fuelGrades.includes(value) && <option value={value}>{value}</option>}
      {opts.fuelGrades.map((f) => <option key={f} value={f}>{f}</option>)}
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
    <>
      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        title="Delete Estimation"
        message="Delete this estimation? This action cannot be undone."
        isDangerous={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        confirmText="Delete"
        cancelText="Cancel"
      />
      <div className="fv-ce">
      {fixOpen && (
        <ToolModal title="Mark Fixed — Charter Party Date" onClose={() => setFixOpen(false)}>
          <p className="fv-ce__lq-hint">Select the Charter Party (CP) date. This is recorded as the CPDD, so a fix marked a few days late still carries the correct date.</p>
          <label className="fv-ce__lq-point">
            <span>Charter Party Date</span>
            <input type="date" value={cpDate} onChange={(e) => setCpDate(e.target.value)} />
          </label>
          <div className="fv-ce__modal-actions">
            <button type="button" className="fv-ce__btn" onClick={() => setFixOpen(false)}>Cancel</button>
            <button type="button" className="fv-ce__btn fv-ce__btn--green" disabled={!cpDate} onClick={confirmFixed}><i className="fas fa-anchor" /> Confirm Fixed</button>
          </div>
        </ToolModal>
      )}
      {tplOpen && (
        <ToolModal title="Vessel Templates" wide onClose={() => setTplOpen(false)}>
          <p className="fv-ce__lq-hint">Pick a standard vessel size to fill the Vessel Particular and performance profile (DWT, draft, TPC, speeds and fuel consumption). The vessel name is kept so you can search the actual ship.</p>
          <div className="fv-ce__tpl-grid">
            {VESSEL_TEMPLATES.map((tpl) => (
              <button key={tpl.id} type="button" className="fv-ce__tpl-card" disabled={locked} onClick={() => applyTemplate(tpl)}>
                <div className="fv-ce__tpl-head">
                  <span className="fv-ce__tpl-name">{tpl.name}</span>
                  <span className="fv-ce__tpl-type">{tpl.type}</span>
                </div>
                <div className="fv-ce__tpl-stats">
                  <span><b>{fmt(tpl.dwt, 0)}</b> DWT</span>
                  <span><b>{fmt(tpl.draft, 1)}</b> m draft</span>
                  <span><b>{fmt(tpl.tpc, 0)}</b> TPC</span>
                </div>
                <div className="fv-ce__tpl-perf">
                  <span>Speed {fmt(tpl.fullBallast, 1)}/{fmt(tpl.fullLaden, 1)} kn</span>
                  <span>ME {fmt(tpl.mainBallast, 1)}/{fmt(tpl.mainLaden, 1)} MT</span>
                  <span>AE {fmt(tpl.subSea, 1)} MT</span>
                </div>
              </button>
            ))}
          </div>
        </ToolModal>
      )}
      {/* ============================ TOP HEADER ============================ */}
      <header className="fv-ce__header">
        <div className="fv-ce__title-block">
          <div className="fv-ce__title-row">
            <ModuleVesselSearch />
            <i className="fas fa-file-signature fv-ce__title-icon" aria-hidden="true" />
            <h1>Voyage Estimation</h1>
            <span className={`fv-ce__badge fv-ce__badge--${stat.color}`}>{estStatusLabel(status)}</span>
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
            {cpdd && <span><b>CPDD</b> {cpdd}</span>}
            <span className="fv-ce__meta-status">
              <b>Fix Type</b>
              <select value={inputs.fixType} disabled={locked} onChange={(e) => patch({ fixType: e.target.value as FixType })}>
                {FIX_TYPES.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </span>
            <span className="fv-ce__meta-status">
              <b>Currency</b>
              <select value={inputs.currency} disabled={locked} onChange={(e) => patch({ currency: e.target.value })}>
                {opts.currencies.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </span>
          </div>
        </div>

        <div className="fv-ce__actions">
          <button type="button" className="fv-ce__btn" onClick={newEstimate}><i className="fas fa-plus" /> New</button>
          <button
            type="button"
            className={`fv-ce__btn${quickPasteOpen ? ' fv-ce__btn--on' : ''}`}
            onClick={() => setQuickPasteOpen((v) => !v)}
          >
            <i className="fas fa-paste" /> {quickPasteOpen ? 'Hide Paste Box' : 'Paste Details'}
          </button>
          <button type="button" className="fv-ce__btn" onClick={duplicate}><i className="fas fa-clone" /> Duplicate</button>
          <button type="button" className={`fv-ce__btn${compareOpen ? ' fv-ce__btn--on' : ''}`} onClick={() => setCompareOpen((v) => !v)}><i className="fas fa-scale-balanced" /> Compare</button>
          <button 
            type="button" 
            className="fv-ce__btn fv-ce__btn--primary" 
            onClick={save}
            disabled={isSaving}
          >
            <i className={`fas ${isSaving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} />
            {isSaving ? ' Saving...' : ' Save'}
          </button>
          <button type="button" className="fv-ce__btn" onClick={discard}><i className="fas fa-rotate-left" /> Discard</button>
          <button type="button" className="fv-ce__btn fv-ce__btn--danger" onClick={deleteEstimate} title="Delete this estimation permanently"><i className="fas fa-trash" /> Delete</button>
          <button type="button" className="fv-ce__btn" onClick={() => setTplOpen(true)}><i className="fas fa-file-lines" /> Template</button>
          <button type="button" className="fv-ce__btn" onClick={exportPdf}><i className="fas fa-file-pdf" /> PDF</button>
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

      {quickPasteOpen && (
        <section className="fv-ce__quickfill">
          <div className="fv-ce__quickfill-head">
            <h3>Paste Vessel & Cargo Details</h3>
            <p>Paste recap/fixture text and auto-fill vessel particulars, cargo, laycan, ports, rates, freight and demurrage fields.</p>
          </div>
          <textarea
            className="fv-ce__quickfill-input"
            value={quickPasteText}
            onChange={(e) => setQuickPasteText(e.target.value)}
            placeholder="Paste charter recap / vessel details here..."
          />
          <div className="fv-ce__quickfill-actions">
            <button type="button" className="fv-ce__btn fv-ce__btn--primary" onClick={applyQuickPaste} disabled={!quickPasteText.trim() || locked}>
              <i className="fas fa-wand-magic-sparkles" /> Apply to Estimation
            </button>
            <button type="button" className="fv-ce__btn" onClick={() => { setQuickPasteText(''); setQuickPasteMsg(''); }} disabled={locked}>
              <i className="fas fa-eraser" /> Clear
            </button>
            {quickPasteMsg && <span className="fv-ce__quickfill-msg">{quickPasteMsg}</span>}
          </div>
        </section>
      )}

      {/* ===================== COMPARISON (toggle) ===================== */}
      {compareOpen && (
        <Section
          title="Comparison"
          icon="fa-scale-balanced"
          right={
            <span className="fv-ce__scenario-add">
              <button type="button" className="fv-ce__chip" onClick={addVesselVariant}><i className="fas fa-ship" /> Vessel Variant</button>
              <button type="button" className="fv-ce__chip" onClick={addCargoVariant}><i className="fas fa-boxes-stacked" /> Cargo Variant</button>
            </span>
          }
        >
          {scenarios.length === 0 ? (
            <p className="fv-ce__hint">
              Add a <b>Vessel Variant</b> (same cargo, different vessel speed &amp; consumption) or a{' '}
              <b>Cargo Variant</b> (same vessel, different quantity &amp; freight). Each variant is
              calculated against the current voyage and compared side by side.
            </p>
          ) : (
            <div className="fv-ce__scenarios">
              {scenarios.map((sc) => (
                <div key={sc.id} className={`fv-ce__scenario fv-ce__scenario--${sc.basis}`}>
                  <span className="fv-ce__scenario-tag">{sc.basis === 'vessel' ? 'Vessel' : 'Cargo'}</span>
                  <input className="fv-ce__scenario-name" value={sc.name} onChange={(e) => updateScenario(sc.id, { name: e.target.value })} />
                  {sc.basis === 'vessel' ? (
                    <>
                      <label>Ballast Spd<input type="number" value={sc.ballastSpeed} onChange={(e) => updateScenario(sc.id, { ballastSpeed: num(e.target.value) })} /></label>
                      <label>Laden Spd<input type="number" value={sc.ladenSpeed} onChange={(e) => updateScenario(sc.id, { ladenSpeed: num(e.target.value) })} /></label>
                      <label>FO Ballast<input type="number" value={sc.foBallast} onChange={(e) => updateScenario(sc.id, { foBallast: num(e.target.value) })} /></label>
                      <label>FO Laden<input type="number" value={sc.foLaden} onChange={(e) => updateScenario(sc.id, { foLaden: num(e.target.value) })} /></label>
                      <label>Hire Rate<input type="number" value={sc.dailyHire} onChange={(e) => updateScenario(sc.id, { dailyHire: num(e.target.value) })} /></label>
                      <label>Hire AdCom %<input type="number" value={sc.hAddCommPct} onChange={(e) => updateScenario(sc.id, { hAddCommPct: num(e.target.value) })} /></label>
                    </>
                  ) : (
                    <>
                      <label>Cargo Qty<input type="number" value={sc.qty} onChange={(e) => updateScenario(sc.id, { qty: num(e.target.value) })} /></label>
                      <label>Freight Rate<input type="number" value={sc.rate} onChange={(e) => updateScenario(sc.id, { rate: num(e.target.value) })} /></label>
                      <label>Add Com %<input type="number" value={sc.aCommPct} onChange={(e) => updateScenario(sc.id, { aCommPct: num(e.target.value) })} /></label>
                      <label>Brokerage %<input type="number" value={sc.brkgPct} onChange={(e) => updateScenario(sc.id, { brkgPct: num(e.target.value) })} /></label>
                      <label>Frt Tax %<input type="number" value={sc.frtTaxPct} onChange={(e) => updateScenario(sc.id, { frtTaxPct: num(e.target.value) })} /></label>
                    </>
                  )}
                  <button type="button" className="fv-ce__icon-btn" onClick={() => removeScenario(sc.id)} title="Remove variant"><i className="fas fa-xmark" /></button>
                </div>
              ))}
            </div>
          )}
          {scenarios.length > 0 && (
          <div className="fv-ce__tablewrap">
            <table className="fv-ce__compare-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  {compareOptions.map((o) => (
                    <th key={o.id}>{o.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  ['Profit', (r: EstimateResult) => r.profit, (r: EstimateResult) => r.profit === best.profit],
                  ['Revenue', (r: EstimateResult) => r.revenue, () => false],
                  ['Expenses', (r: EstimateResult) => r.totalExpense, (r: EstimateResult) => r.totalExpense === best.cost],
                  ['TCE / Day', (r: EstimateResult) => r.tce, (r: EstimateResult) => r.tce === best.tce],
                  ['Total Hire', (r: EstimateResult) => r.totalHire, () => false],
                  ['Result / Day', (r: EstimateResult) => (r.voyageDays > 0 ? r.profit / r.voyageDays : 0), (r: EstimateResult) => (r.voyageDays > 0 ? r.profit / r.voyageDays : 0) === best.resultDay],
                  ['Voyage Days', (r: EstimateResult) => r.voyageDays, (r: EstimateResult) => r.voyageDays === best.days],
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
          )}
          {scenarios.length > 0 && <p className="fv-ce__hint">Green cells mark the best profit, lowest cost, highest TCE and fastest voyage across the current estimate and all variants.</p>}
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
          <div className="fv-ce__vp-fields">
            <label className="fv-ce__vp-field"><span>Vessel Name</span>{vesselCell(vessel.name, (v) => setVessel((s) => ({ ...s, name: v })), 150)}</label>
            <label className="fv-ce__vp-field"><span>DWT</span>{numCell(vessel.dwt, (n) => setVessel((s) => ({ ...s, dwt: n })), 80)}</label>
            <label className="fv-ce__vp-field"><span>Draft (M)</span>{numCell(vessel.draft, (n) => setVessel((s) => ({ ...s, draft: n })), 60)}</label>
            <label className="fv-ce__vp-field"><span>TPC</span>{numCell(vessel.tpc, (n) => setVessel((s) => ({ ...s, tpc: n })), 56)}</label>
            <label className="fv-ce__vp-field"><span>Built</span>{numCell(vessel.built, (n) => setVessel((s) => ({ ...s, built: n })), 60)}</label>
            <label className="fv-ce__vp-field">
              <span>Type</span>
              <select
                className="fv-ce__cell-select"
                value={vessel.type}
                disabled={locked}
                onChange={(e) => setVessel((s) => ({ ...s, type: e.target.value }))}
              >
                {vessel.type && !opts.vesselTypes.includes(vessel.type) && <option value={vessel.type}>{vessel.type}</option>}
                {opts.vesselTypes.map((tp) => (
                  <option key={tp} value={tp}>{tp}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="fv-ce__vp-right">
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

          <div className="fv-ce__vp-cons">
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
                  <td>{fuelCell(activeMain.normal.type, (v) => patchMain(activeMain.normalKey, { type: v }))}</td>
                  <td className="fv-ce__r">{numCell(activeMain.normal.ballast, (n) => patchMain(activeMain.normalKey, { ballast: n }), 56)}</td>
                  <td className="fv-ce__r">{numCell(activeMain.normal.laden, (n) => patchMain(activeMain.normalKey, { laden: n }), 56)}</td>
                  <td className="fv-ce__r">{numCell(activeMain.normal.idle, (n) => patchMain(activeMain.normalKey, { idle: n }), 50)}</td>
                  <td className="fv-ce__r">{numCell(activeMain.normal.work, (n) => patchMain(activeMain.normalKey, { work: n }), 50)}</td>
                </tr>
                <tr>
                  <td>ECA</td>
                  <td>{fuelCell(activeMain.eca.type, (v) => patchMain(activeMain.ecaKey, { type: v }))}</td>
                  <td className="fv-ce__r">{numCell(activeMain.eca.ballast, (n) => patchMain(activeMain.ecaKey, { ballast: n }), 56)}</td>
                  <td className="fv-ce__r">{numCell(activeMain.eca.laden, (n) => patchMain(activeMain.ecaKey, { laden: n }), 56)}</td>
                  <td className="fv-ce__r">{numCell(activeMain.eca.idle, (n) => patchMain(activeMain.ecaKey, { idle: n }), 50)}</td>
                  <td className="fv-ce__r">{numCell(activeMain.eca.work, (n) => patchMain(activeMain.ecaKey, { work: n }), 50)}</td>
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
                  <td>{fuelCell(activeSub.normal.type, (v) => patchSub(activeSub.normalKey, { type: v }))}</td>
                  <td className="fv-ce__r">{numCell(activeSub.normal.sea, (n) => patchSub(activeSub.normalKey, { sea: n }), 50)}</td>
                  <td className="fv-ce__r">{numCell(activeSub.normal.idle, (n) => patchSub(activeSub.normalKey, { idle: n }), 50)}</td>
                  <td className="fv-ce__r">{numCell(activeSub.normal.work, (n) => patchSub(activeSub.normalKey, { work: n }), 50)}</td>
                </tr>
                <tr>
                  <td>ECA</td>
                  <td>{fuelCell(activeSub.eca.type, (v) => patchSub(activeSub.ecaKey, { type: v }))}</td>
                  <td className="fv-ce__r">{numCell(activeSub.eca.sea, (n) => patchSub(activeSub.ecaKey, { sea: n }), 50)}</td>
                  <td className="fv-ce__r">{numCell(activeSub.eca.idle, (n) => patchSub(activeSub.ecaKey, { idle: n }), 50)}</td>
                  <td className="fv-ce__r">{numCell(activeSub.eca.work, (n) => patchSub(activeSub.ecaKey, { work: n }), 50)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          </div>
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
            <div className="fv-ce__tool">
              <button type="button" className={`fv-ce__chip${lqOpen ? ' fv-ce__chip--on' : ''}`} onClick={() => (lqOpen ? setLqOpen(false) : openLq())}>
                <i className="fas fa-calculator" /> Loadable Quantity
              </button>
              {lqOpen && (() => {
                const summerDisp = lq.summerDwt + lq.lightship;
                const dispPort = summerDisp * (lq.densityAtPort / 1.025);
                const dwtPort = dispPort - lq.lightship;
                const deductions = lq.vlsfo + lq.mgo + lq.bw + lq.fw + lq.constants;
                const maxCargo = Math.max(0, dwtPort - deductions);
                const setL = (k: keyof typeof lq, v: number | string) => setLq((s) => ({ ...s, [k]: v }));
                return (
                  <ToolModal title="Loadable Quantity Calculator" wide onClose={() => setLqOpen(false)}>
                    <label className="fv-ce__lq-point">
                      <span>Constraining Point</span>
                      <select value={lq.point} onChange={(e) => setL('point', e.target.value)}>
                        {lqPoints.map((pt) => <option key={pt} value={pt}>{pt}</option>)}
                      </select>
                    </label>
                    <p className="fv-ce__lq-hint">Max cargo is limited by the load line at this point using the bunker/water ROB expected there. Switch the point to find the binding one (least cargo).</p>
                    <div className="fv-ce__lq-grid">
                      <label><span>Summer DWT (MT)</span><input type="number" value={lq.summerDwt} onChange={(e) => setL('summerDwt', num(e.target.value))} /></label>
                      <label><span>Density at Port</span><input type="number" step="0.001" value={lq.densityAtPort} onChange={(e) => setL('densityAtPort', num(e.target.value))} /></label>
                      <label><span>Lightship (MT)</span><input type="number" value={lq.lightship} onChange={(e) => setL('lightship', num(e.target.value))} /></label>
                    </div>
                    <div className="fv-ce__lq-calc">
                      <div><span>Summer Displacement</span><b>{fmt(summerDisp, 0)}</b></div>
                      <div><span>Displacement in Port Density</span><b>{fmt(dispPort, 0)}</b></div>
                      <div><span>DWT at Port</span><b>{fmt(dwtPort, 0)}</b></div>
                    </div>
                    <h6 className="fv-ce__lq-sub">ROB &amp; Constants at Point (MT)</h6>
                    <div className="fv-ce__lq-grid">
                      <label><span>VLSFO</span><input type="number" value={lq.vlsfo} onChange={(e) => setL('vlsfo', num(e.target.value))} /></label>
                      <label><span>MGO</span><input type="number" value={lq.mgo} onChange={(e) => setL('mgo', num(e.target.value))} /></label>
                      <label><span>Ballast Water (BW)</span><input type="number" value={lq.bw} onChange={(e) => setL('bw', num(e.target.value))} /></label>
                      <label><span>Fresh Water (FW)</span><input type="number" value={lq.fw} onChange={(e) => setL('fw', num(e.target.value))} /></label>
                      <label><span>Constants (CONST)</span><input type="number" value={lq.constants} onChange={(e) => setL('constants', num(e.target.value))} /></label>
                    </div>
                    <div className="fv-ce__tool-result"><span>Max Loadable Cargo</span><b>{fmt(maxCargo, 0)} MT</b></div>
                    {inputs.cargoes.length > 0 && (
                      <button type="button" className="fv-ce__chip fv-ce__chip--on" disabled={locked} onClick={() => { updateCargo(inputs.cargoes[0].id, { quantity: Math.round(maxCargo) }); setLqOpen(false); }}>
                        Use for Cargo #1
                      </button>
                    )}
                  </ToolModal>
                );
              })()}
            </div>
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
                  <td>{cargoCell(c.name, (v) => updateCargo(c.id, { name: v }), 100)}</td>
                  <td>{portCell(c.loadPort, (v) => updateCargo(c.id, { loadPort: v }), 150)}</td>
                  <td>{portCell(c.dischPort, (v) => updateCargo(c.id, { dischPort: v }), 150)}</td>
                  <td className="fv-ce__r fv-ce__qty">{autoNumCell(c.quantity, (n) => updateCargo(c.id, { quantity: n }))}{optCell(c.unit, (v) => updateCargo(c.id, { unit: v }), opts.qtyUnits, 56)}</td>
                  <td className="fv-ce__r">{autoNumCell(c.frt, (n) => updateCargo(c.id, { frt: n }))}{optCell(c.frtUnit, (v) => updateCargo(c.id, { frtUnit: v }), opts.freightUnits, 78)}</td>
                  <td>{optCell(c.term, (v) => updateCargo(c.id, { term: v }), opts.freightTerms, 72)}</td>
                  <td className="fv-ce__r fv-ce__calc">{fmt(c.quantity * c.frt)}</td>
                  <td className="fv-ce__r">{autoNumCell(c.aCommPct, (n) => updateCargo(c.id, { aCommPct: n }))}<span className="fv-ce__unit">%</span></td>
                  <td className="fv-ce__r">{autoNumCell(c.brkgPct, (n) => updateCargo(c.id, { brkgPct: n }))}<span className="fv-ce__unit">%</span></td>
                  <td className="fv-ce__r">{autoNumCell(c.frtTaxPct, (n) => updateCargo(c.id, { frtTaxPct: n }))}<span className="fv-ce__unit">%</span></td>
                  <td className="fv-ce__r">{autoNumCell(c.linerTerm, (n) => updateCargo(c.id, { linerTerm: n }))}</td>
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
            <label className="fv-ce__hire-basis" title="ECA / distance route">
              <span>Route</span>
              <select className="fv-ce__cell-select" value={inputs.ecaRoute} disabled={locked} onChange={(e) => patch({ ecaRoute: e.target.value })}>
                {opts.ecaRoutes.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <div className="fv-ce__canal-dd" ref={canalsRef}>
              <button
                type="button"
                className="fv-ce__chip"
                aria-haspopup="menu"
                aria-expanded={canalsOpen}
                onClick={() => setCanalsOpen((v) => !v)}
                title="Canals — select all that apply"
              >
                <i className="fas fa-water" aria-hidden="true" /> Canals
                {inputs.canals.list.length > 0 && <span className="fv-ce__canal-badge">{inputs.canals.list.length}</span>}
                <i className="fas fa-chevron-down" aria-hidden="true" />
              </button>
              {canalsOpen && (
                <div className="fv-ce__canal-menu" role="menu">
                  {opts.canals.map((cn) => {
                    const on = inputs.canals.list.includes(cn);
                    return (
                      <label key={cn} className={`fv-ce__check${on ? ' fv-ce__check--on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={locked}
                          onChange={(e) =>
                            patch({
                              canals: {
                                list: e.target.checked
                                  ? [...inputs.canals.list, cn]
                                  : inputs.canals.list.filter((x) => x !== cn),
                              },
                            })
                          }
                        />{' '}
                        {cn}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <button type="button" className="fv-ce__chip" onClick={addPort} disabled={locked}><i className="fas fa-plus" /> Add Port</button>
            <button type="button" className="fv-ce__chip" onClick={getDistances} disabled={locked || gettingDist} title="Auto-fill leg distances from the sea route">
              <i className={`fas ${gettingDist ? 'fa-spinner fa-spin' : 'fa-ruler'}`} /> {gettingDist ? 'Calculating…' : 'Get Distance'}
            </button>
          </div>
        }
      >
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
                <th>Laytime</th>
                <th className="fv-ce__r">I (Days)</th>
                <th className="fv-ce__r">W (Days)</th>
                <th className="fv-ce__r">Dem $/d</th>
                <th className="fv-ce__r">Dem / Des</th>
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
                      <select className="fv-ce__cell-select" value={legacyPortType(p.type)} disabled={locked} onChange={(e) => updatePort(p.id, { type: e.target.value as LegType })}>
                        {legTypes.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="fv-ce__port-name-cell">{portCell(p.port, (v) => updatePort(p.id, { port: v }))}</td>
                    <td className="fv-ce__r">{autoNumCell(p.distance, (n) => updatePort(p.id, { distance: n }))}</td>
                    <td className="fv-ce__r">{autoNumCell(p.ecaDistance, (n) => updatePort(p.id, { ecaDistance: n }))}</td>
                    <td className="fv-ce__r">{autoNumCell(p.wf, (n) => updatePort(p.id, { wf: n }))}</td>
                    <td className="fv-ce__r">{p.speed > 0 ? <span className="fv-ce__calc" title="Vessel-particular speed after weather margin">{fmt(p.speed * (1 - p.wf / 100), 1)}</span> : <span className="fv-ce__calc">—</span>}</td>
                    <td className="fv-ce__r">{manualSea ? autoNumCell(p.seaManual, (n) => updatePort(p.id, { seaManual: n })) : <span className="fv-ce__calc">{leg ? fmt(leg.sea, 2) : '—'}</span>}</td>
                    <td className="fv-ce__r">{autoNumCell(p.ldRate, (n) => updatePort(p.id, { ldRate: n }))}{optCell(p.rateUnit, (v) => updatePort(p.id, { rateUnit: v }), opts.rateUnits, 80)}</td>
                    <td>{optCell(p.laytimeTerm, (v) => updatePort(p.id, { laytimeTerm: v }), opts.laytimeTerms, 96)}</td>
                    <td className="fv-ce__r">{autoNumCell(p.idle, (n) => updatePort(p.id, { idle: n }))}</td>
                    <td className="fv-ce__r">
                      {leg ? <span className="fv-ce__calc" title="Auto-calculated from L/D rate × cargo handled">{fmt(leg.work, 2)}</span> : <span className="fv-ce__calc">—</span>}
                    </td>
                    <td className="fv-ce__r">{autoNumCell(p.dem, (n) => updatePort(p.id, { dem: n }))}</td>
                    <td className="fv-ce__r">
                      {leg ? (
                        leg.dem > 0 ? (
                          <span className="fv-ce__calc fv-ce__dem" title="Demurrage (charterer cost)">-{fmt(leg.dem)}</span>
                        ) : leg.des > 0 ? (
                          <span className="fv-ce__calc fv-ce__des" title="Despatch (owner benefit)">+{fmt(leg.des)}</span>
                        ) : (
                          <span className="fv-ce__calc">0</span>
                        )
                      ) : (
                        <span className="fv-ce__calc">—</span>
                      )}
                    </td>
                    <td className="fv-ce__r">{autoNumCell(p.portCharge, (n) => updatePort(p.id, { portCharge: n }))}</td>
                    <td className="fv-ce__calc">
                      {idx === 0 ? (
                        <input 
                          type="datetime-local" 
                          className="fv-ce__arrival-date-input"
                          value={manualStartDate ? `${manualStartDate}T00:00` : ''}
                          disabled={locked}
                          onChange={(e) => {
                            if (e.target.value) {
                              const dateStr = e.target.value.split('T')[0];
                              setManualStartDate(dateStr);
                            }
                          }}
                          title="Edit first port arrival date"
                        />
                      ) : (
                        leg?.arrival ?? '—'
                      )}
                    </td>
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
                <td />
                <td className="fv-ce__r">{fmt(result.idleTotal, 2)}</td>
                <td className="fv-ce__r">{fmt(result.workTotal, 2)}</td>
                <td />
                <td className="fv-ce__r">{money(result.demTotal - result.desTotal)}</td>
                <td className="fv-ce__r">{fmt(result.portCharge)}</td>
                <td>{result.startStr}</td>
                <td>{result.endStr}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="fv-ce__port-foot">
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
          <div className="fv-ce__exp">
            <div className="fv-ce__exp-head">
              <span>Additional Expenses</span>
              <button type="button" className="fv-ce__chip" onClick={addExpense} disabled={locked}><i className="fas fa-plus" /> Add</button>
            </div>
            {inputs.expenses.map((e) => (
              <div key={e.id} className="fv-ce__exp-row">
                <select className="fv-ce__cell-select" value={e.type} disabled={locked} onChange={(ev) => updateExpense(e.id, { type: ev.target.value })}>
                  {e.type && !opts.expenseTypes.includes(e.type) && <option value={e.type}>{e.type}</option>}
                  {opts.expenseTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="number" className="fv-ce__cell-num" value={e.amount} disabled={locked} onChange={(ev) => updateExpense(e.id, { amount: num(ev.target.value) })} />
                {!locked && (
                  <button type="button" className="fv-ce__icon-btn" onClick={() => removeExpense(e.id)} title="Remove expense"><i className="fas fa-xmark" /></button>
                )}
              </div>
            ))}
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
                  <td>{getActiveMainConsumption().normal.type}</td>
                  <td className="fv-ce__r">{autoNumCell(inputs.commercial.vlsfoPrice, (n) => patchComm({ vlsfoPrice: n }))}</td>
                  <td className="fv-ce__r fv-ce__calc">{fmt(result.vlsfoCons)}</td>
                  <td className="fv-ce__r fv-ce__calc">{fmt(result.vlsfoExp)}</td>
                </tr>
                <tr>
                  <td>{getActiveSubConsumption().normal.type}</td>
                  <td className="fv-ce__r">{autoNumCell(inputs.commercial.mgoPrice, (n) => patchComm({ mgoPrice: n }))}</td>
                  <td className="fv-ce__r fv-ce__calc">{fmt(result.mgoCons)}</td>
                  <td className="fv-ce__r fv-ce__calc">{fmt(result.mgoExp)}</td>
                </tr>
                <tr>
                  <td>{getActiveMainConsumption().eca.type} <span className="fv-ce__unit">(ECA)</span></td>
                  <td className="fv-ce__r">{autoNumCell(inputs.commercial.ulsfoPrice, (n) => patchComm({ ulsfoPrice: n }))}</td>
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
              <label className="fv-ce__hire-basis" title="Hire basis">
                <span>Hire Basis</span>
                <select className="fv-ce__cell-select" value={hireBasis} disabled={locked} onChange={(e) => setHireBasis(e.target.value)}>
                  {opts.hireBasis.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
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
              {kvOut(isRelet ? 'Freight In' : 'Net Hire (Total)', money(result.totalHire))}
              {!isRelet && fix.inKind !== 'OWN' && kvOut('Net Hire / Day', money(result.voyageDays > 0 ? result.totalHire / result.voyageDays : 0))}
              {kvOut('C / Base (TCE / Day)', money(result.tce))}
              {kvOut('Result / Day', money(result.voyageDays > 0 ? result.profit / result.voyageDays : 0))}
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
            <span className="fv-ce__kv-out">{money(result.profit)}</span>
          </div>
        </Section>
      </div>

      {/* ===================== VOYAGE MAP & REMARK ===================== */}
      <Section title="Voyage Map & Remark" icon="fa-map-location-dot">
        <div className="fv-ce__map-row">
          <EstimationRouteMap ports={inputs.ports.map((p) => ({ type: p.type, port: p.port }))} canals={inputs.canals.list} />
          <div className="fv-ce__map-remark">
            <label className="fv-ce__map-remark-label">Remark</label>
            <textarea
              value={inputs.remark}
              disabled={locked}
              placeholder="Notes for this estimate (assumptions, subs, chartering comments)…"
              onChange={(e) => patch({ remark: e.target.value })}
            />
          </div>
        </div>
      </Section>
    </div>
    </>
  );
}
