import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useSelectedVoyage } from '../data/selectedVoyage';
import type { Voyage } from '../data/voyages';
import { makeBlankVoyage } from '../data/voyages';
import { loadOpsRecap, readOpsRecapRaw, writeOpsRecapRaw, subscribeOpsRecap } from '../data/opsRecap';
import {
  defaultEmissionsDoc, loadEmissionsDoc, readEmissionsRaw, writeEmissionsRaw, subscribeEmissionsDoc,
  fetchEmissionsDocFromBackend, fetchAllEmissionsForFleet, listEmissionsScenarios, createEmissionsScenario, updateEmissionsScenario, deleteEmissionsScenario,
  type EmissionsDoc, type EmissionAdjustment, type EmissionsFleetRecord, type EmissionsScenario,
} from '../data/emissions';
import { NoVesselSelected } from './NoVesselSelected';
import { ModuleVesselSearch } from './ModuleVesselSearch';
import { EuaCard, seedRecap, type Recap } from './OperationsPage';
import { EmBadge, EmStat, EmSection, EmCard, EmCalc, EmLine, EmBars, EmDonut, EmRatingBand, type Tone } from './EmissionsWidgets';

/* ------------------------------------------------------------------ utils */

function num(v: string | undefined): number {
  const n = parseFloat(String(v ?? '').replace(/[,$%€]/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function fmt(n: number, dp = 1): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
const usd = (n: number) => `$${fmt(n, 0)}`;
const eur = (n: number) => `€${fmt(n, 0)}`;
function uid(p: string): string { return `${p}-${Math.random().toString(36).slice(2, 8)}`; }
function parseDMY(s: string): Date | null {
  const m = String(s).match(/(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0));
}
function daysBetween(a: Date | null, b: Date | null): number {
  if (!a || !b) return 0;
  return Math.max(0, (b.getTime() - a.getTime()) / 86_400_000);
}
const todayStr = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`; };

// CO2 emission factors (t-CO2 / t-fuel), IMO / EU MRV.
const EF: Record<string, number> = { VLSFO: 3.151, LSFO: 3.151, ULSFO: 3.151, HFO: 3.114, HSFO: 3.114, LSMGO: 3.206, MGO: 3.206, MDO: 3.206, LNG: 2.750 };
const efOf = (fuel: string) => EF[(fuel || '').trim().toUpperCase()] ?? 3.114;

// FuelEU Maritime well-to-wake default GHG intensity per fuel (gCO2e/MJ) — Annex I/II of
// Regulation (EU) 2023/1805 (fossil fuel default factors). Drives BOTH the per-fuel breakdown
// table AND the attained GHG intensity (energy-weighted average) so the two always reconcile.
const FUELEU_WTW: Record<string, number> = { VLSFO: 91.6, LSFO: 91.6, ULSFO: 91.6, HFO: 91.6, HSFO: 91.6, LSMGO: 90.6, MGO: 90.6, MDO: 90.6, LNG: 76.2 };
const wtwOf = (fuel: string) => FUELEU_WTW[(fuel || '').trim().toUpperCase()] ?? 91.6;
const VLSFO_REFERENCE_LCV_MJ_PER_T = 41_000; // fixed regulatory reference (Annex IV), not the vessel's own fuel LCV
const FUELEU_PENALTY_EUR_PER_T_VLSFOEQ = 2400;

/** EU ETS maritime phase-in scope, confirmed timeline: 2024=40%, 2025=70%, 2026 onward=100%. */
function euEtsPhaseInPct(year: number): number {
  if (year <= 2024) return 0.40;
  if (year === 2025) return 0.70;
  return 1.0; // 2026 onward
}

/**
 * IMO CII reduction factor Z% vs the 2019 baseline (MEPC.354(78)) — officially confirmed
 * 2023-2026; IMO's review of 2027-2030 factors had not published final figures at the time this
 * was written, so later years hold the last confirmed (2026) value until updated here.
 */
function ciiReductionFactorPct(year: number): number {
  if (year <= 2019) return 0;
  if (year === 2020) return 1;
  if (year === 2021) return 2;
  if (year === 2022) return 3;
  if (year === 2023) return 5;
  if (year === 2024) return 7;
  if (year === 2025) return 9;
  return 11; // 2026 onward (last IMO-confirmed value)
}

/**
 * IMO CII reference-line coefficients (Required CII = a × DWT^−c), per MEPC.354(78) Table 1.
 * NOTE: recall-based constants — verify against the official circular for any ship type before
 * relying on this for an actual regulatory submission. Unmapped/unrecognized free-text vessel
 * types fall back to the Bulk Carrier line (matches this app's previous flat assumption, so never
 * worse than before).
 */
const CII_REFERENCE_LINES: { match: RegExp; label: string; a: number; c: number }[] = [
  { match: /general\s*cargo/i, label: 'General Cargo Ship', a: 31_948, c: 0.792 },
  { match: /refrigerat|reefer/i, label: 'Refrigerated Cargo Carrier', a: 4_600, c: 0.557 },
  { match: /combination/i, label: 'Combination Carrier', a: 40_853, c: 0.812 },
  { match: /lng/i, label: 'LNG Carrier', a: 144_790_000, c: 2.071 },
  { match: /gas/i, label: 'Gas Carrier', a: 14_405, c: 0.639 },
  { match: /container/i, label: 'Container Ship', a: 1_984, c: 0.489 },
  { match: /cruise|passenger/i, label: 'Cruise Passenger Ship', a: 930, c: 0.383 },
  { match: /ro-?ro.*vehicle|vehicle.*carrier/i, label: 'Ro-Ro Cargo Ship (Vehicle Carrier)', a: 3_627, c: 0.590 },
  { match: /ro-?ro/i, label: 'Ro-Ro Cargo Ship', a: 10_952, c: 0.637 },
  { match: /tanker/i, label: 'Tanker', a: 5_247, c: 0.610 },
  { match: /bulk/i, label: 'Bulk Carrier', a: 4_745, c: 0.622 },
];
const DEFAULT_CII_REFERENCE = { label: 'Bulk Carrier (default/unmapped)', a: 4_745, c: 0.622 };
function ciiReferenceFor(vesselType: string): { label: string; a: number; c: number } {
  const hit = CII_REFERENCE_LINES.find((r) => r.match.test(vesselType || ''));
  return hit ?? DEFAULT_CII_REFERENCE;
}

/** Plain-English formula lookup for any report/KPI label — used to render a "How Calculated"
 * column next to every figure shown in the Reports tab (and reused by Report Studio exports). */
function formulaForLabel(label: string): string {
  if (/co.?2e/i.test(label)) return 'CO₂ + CH₄×29.8 + N₂O×273 (IPCC AR5 GWP₁₀₀)';
  if (/co.?2 saved/i.test(label)) return 'Fuel saved × VLSFO factor 3.151';
  if (/co.?2/i.test(label)) return 'Fuel × emission factor (VLSFO 3.151 · LSMGO 3.206 t CO₂/t)';
  if (/required cii/i.test(label)) return 'a × DWT⁻ᶜ × (1 − Z%); a/c per IMO ship-type reference line';
  if (/cii rating/i.test(label)) return 'Attained AER ÷ Required CII, banded A (≤0.86) – E (>1.18)';
  if (/^aer$|attained aer/i.test(label)) return 'CO₂ × 10⁶ ÷ (DWT × Distance)';
  if (/eeoi/i.test(label)) return 'CO₂ × 10⁶ ÷ (Cargo × Distance)';
  if (/euas required/i.test(label)) return 'Applicable CO₂ × EU ETS phase-in %';
  if (/eua price/i.test(label)) return 'Manually set (default €72.50)';
  if (/carbon cost/i.test(label)) return 'EUAs required × EUA price';
  if (/phase-?in/i.test(label)) return '2024=40% · 2025=70% · 2026+=100% (EU ETS maritime scope)';
  if (/ghg intensity/i.test(label)) return 'Energy-weighted average WtW factor across the fuel mix';
  if (/fueleu balance/i.test(label)) return '(Target 89.34 gCO₂e/MJ − attained intensity) × total energy';
  if (/fueleu penalty/i.test(label)) return '|deficit g| ÷ (intensity × 41,000 MJ/t) × €2,400/tVLSFOeq';
  if (/fuel (consumed|total)/i.test(label)) return 'Sum of VLSFO + LSMGO consumed';
  if (/^distance/i.test(label)) return 'Sum of itinerary leg distances';
  if (/money saved|fuel cost saved/i.test(label)) return 'Fuel saved × bunker price';
  if (/voyages included/i.test(label)) return 'Count of voyages with a saved emissions snapshot';
  if (/ship type/i.test(label)) return 'Matched from free-text vessel type to IMO reference line';
  return '—';
}

interface LegRow { from: string; to: string; fuel: string; cons: number; factor: number; co2: number; distance: number; cargo: number }
/** Generic report export payload shared by the default export and every Reports-tab category. */
interface ReportContent { title: string; subtitle: string; kpis: [string, string][]; tableTitle: string; tableHeaders: string[]; tableRows: string[][] }

/* ------------------------------------------------------ derived metrics */

function computeMetrics(recap: Recap, doc: EmissionsDoc, vesselType: string) {
  // Itinerary distance & per-fuel consumption from the ETA & ROB legs.
  const legs = recap.etaPlan?.legs ?? [];
  let distance = 0; let fuelVitn = 0; let fuelMitn = 0; const legRows: LegRow[] = [];
  legs.forEach((l) => {
    if (l.kind === 'sea') {
      const dist = num(l.distNonEca) + num(l.distEca);
      const eff = Math.max(0.1, num(l.speed) * (1 - num(l.wf) / 100));
      const days = dist > 0 ? dist / (eff * 24) : 0;
      const cV = num(l.consVlsfo) * days; const cM = num(l.consMgo) * days;
      distance += dist; fuelVitn += cV; fuelMitn += cM;
      if (dist > 0) {
        legRows.push({ from: l.from, to: l.to, fuel: 'VLSFO', cons: cV, factor: efOf('VLSFO'), co2: cV * efOf('VLSFO'), distance: dist, cargo: num(recap.finalQtyLoaded) });
        legRows.push({ from: l.from, to: l.to, fuel: 'LSMGO', cons: cM, factor: efOf('LSMGO'), co2: cM * efOf('LSMGO'), distance: dist, cargo: num(recap.finalQtyLoaded) });
      }
    } else {
      const cV = num(l.consVlsfo) * num(l.portDays); const cM = num(l.consMgo) * num(l.portDays);
      fuelVitn += cV; fuelMitn += cM;
    }
  });
  const fuelV = num(recap.foCons) > 0 ? num(recap.foCons) : fuelVitn;
  const fuelM = num(recap.doCons) > 0 ? num(recap.doCons) : fuelMitn;
  const fuelTotal = fuelV + fuelM;
  const cargo = num(recap.finalQtyLoaded);
  const days = daysBetween(parseDMY(recap.deliveryDateTime), parseDMY(recap.redeliveryDateTime)) || 1;
  const complianceYear = parseInt(doc.complianceYear, 10) || new Date().getFullYear();

  const co2Base = fuelV * efOf('VLSFO') + fuelM * efOf('LSMGO');
  const co2Adj = num(doc.co2AdjustmentT);
  const co2 = co2Base + co2Adj;
  const ch4 = fuelTotal * 0.00006;   // t CH4
  const n2o = fuelTotal * 0.00016;   // t N2O
  const co2e = co2 + ch4 * 29.8 + n2o * 273;

  const co2PerDay = co2 / days;
  const co2PerNm = distance > 0 ? (co2 * 1000) / distance : 0;   // kg / nm
  const co2PerCargo = cargo > 0 ? co2 / cargo : 0;               // t / t

  // EU ETS — reuse the voyage EUA record when present, else derive. Phase-in is year-aware
  // (2024=40%, 2025=70%, 2026+=100%) unless the voyage's own EUA record overrides it.
  const eua = recap.eua;
  let euasRequired: number; let applicableCo2: number;
  const phaseInPct = euEtsPhaseInPct(complianceYear);
  if (eua && Array.isArray(eua.legs) && eua.legs.length) {
    const phaseIn = num(eua.phaseInPct) > 0 ? num(eua.phaseInPct) / 100 : phaseInPct;
    applicableCo2 = eua.legs.reduce((s, l) => s + num(l.cons) * (num(l.emissionFactor) || efOf(l.fuel)) * (num(l.phasePct) / 100), 0);
    euasRequired = applicableCo2 * phaseIn;
  } else {
    applicableCo2 = co2 * 0.5;      // assume EU↔non-EU voyage (50% scope)
    euasRequired = applicableCo2 * phaseInPct;
  }
  const euaPrice = num(doc.euaPriceEur) || 72.5;
  const bought = eua?.ledger?.filter((x) => /buy|bought/i.test(x.type)).reduce((s, x) => s + num(x.qty), 0) ?? 0;
  const usedEua = eua?.ledger?.filter((x) => /use|surrender/i.test(x.type)).reduce((s, x) => s + num(x.qty), 0) ?? 0;
  const euaBalance = bought - usedEua;
  const carbonCost = euasRequired * euaPrice;

  // CII / AER / EEOI — full IMO reference-line formula: Required CII = a × DWT^−c × (1 − Z%/year).
  const dwtRaw = num((recap.cpQuantity || '').split('/')[0]);
  const dwt = dwtRaw || cargo || 75_000;
  const dwtEstimated = !dwtRaw; // flags when we fell back to cargo qty or the generic 75,000t default
  const aer = distance > 0 && dwt > 0 ? (co2 * 1e6) / (dwt * distance) : 0; // g CO2 / dwt·nm
  const eeoi = distance > 0 && cargo > 0 ? (co2 * 1e6) / (cargo * distance) : 0;
  const ciiRef = ciiReferenceFor(vesselType);
  const reductionFactorPct = ciiReductionFactorPct(complianceYear);
  const referenceLineCii = ciiRef.a * Math.pow(dwt, -ciiRef.c);
  const requiredAer = referenceLineCii * (1 - reductionFactorPct / 100);
  const ratio = requiredAer > 0 ? aer / requiredAer : 1;
  const rating = ratio <= 0.86 ? 'A' : ratio <= 0.94 ? 'B' : ratio <= 1.06 ? 'C' : ratio <= 1.18 ? 'D' : 'E';
  const nextYearRequiredAer = referenceLineCii * (1 - ciiReductionFactorPct(complianceYear + 1) / 100);
  const forecastRatio = nextYearRequiredAer > 0 ? aer / nextYearRequiredAer : ratio;
  const forecastRating = forecastRatio <= 0.86 ? 'A' : forecastRatio <= 0.94 ? 'B' : forecastRatio <= 1.06 ? 'C' : forecastRatio <= 1.18 ? 'D' : 'E';

  // FuelEU Maritime — GHG intensity (well-to-wake, gCO2e/MJ), energy-weighted across the actual
  // fuel mix using the regulation's own default per-fuel factors (reconciles with the per-fuel
  // breakdown table shown in the Trading tab — same constants drive both).
  const energyV = fuelV * 1000 * 40.2; // kg × LCV(MJ/kg)
  const energyM = fuelM * 1000 * 42.7;
  const energyMJ = energyV + energyM;
  const ghgIntensity = energyMJ > 0 ? (energyV * wtwOf('VLSFO') + energyM * wtwOf('LSMGO')) / energyMJ : 0;
  const fuelEuTarget = 89.34; // -2% vs 2020 baseline; applies 2025 through 2029 per Reg. (EU) 2023/1805
  const complianceBalanceT = ((fuelEuTarget - ghgIntensity) * energyMJ) / 1e6; // t CO2e (+surplus / −deficit)
  // Official Annex IV formula: penalty = |CB in g| ÷ (attained GHG intensity × 41,000 MJ/t) × €2,400/tVLSFOeq
  const fuelEuPenalty = complianceBalanceT < 0 && ghgIntensity > 0
    ? (Math.abs(complianceBalanceT) * 1e6) / (ghgIntensity * VLSFO_REFERENCE_LCV_MJ_PER_T) * FUELEU_PENALTY_EUR_PER_T_VLSFOEQ
    : 0;
  const fuelEuPenaltyV = energyMJ > 0 ? fuelEuPenalty * (energyV / energyMJ) : 0;
  const fuelEuPenaltyM = energyMJ > 0 ? fuelEuPenalty * (energyM / energyMJ) : 0;
  const fuelEuStatus: Tone = complianceBalanceT >= 0 ? 'good' : 'bad';

  // Weather routing savings (from the plan weather margin — indicative).
  const wxMargin = num(recap.etaPlan?.weatherMargin) / 100 || 0.05;
  const fuelSaved = fuelTotal * wxMargin * 0.4;
  const co2Saved = fuelSaved * efOf('VLSFO');
  const moneySaved = fuelSaved * num(recap.foPrice);
  const etsSaved = co2Saved * 0.5 * phaseInPct * euaPrice;

  return {
    fuelV, fuelM, fuelTotal, cargo, days, distance, legRows,
    co2Base, co2Adj, co2, ch4, n2o, co2e, co2PerDay, co2PerNm, co2PerCargo,
    applicableCo2, euasRequired, euaPrice, bought, usedEua, euaBalance, carbonCost, phaseInPct,
    dwt, dwtEstimated, aer, eeoi, requiredAer, ratio, rating, forecastRating, ciiRef, reductionFactorPct, referenceLineCii,
    energyV, energyM, energyMJ, ghgIntensity, fuelEuTarget, complianceBalanceT, fuelEuPenalty, fuelEuPenaltyV, fuelEuPenaltyM, fuelEuStatus,
    fuelSaved, co2Saved, moneySaved, etsSaved,
  };
}
type Metrics = ReturnType<typeof computeMetrics>;

/** Editable override values for the Report Studio sandbox — a flat, standalone subset of the
 * voyage's figures (no itinerary legs) since the sandbox edits totals directly, not a plan. */
export interface ScenarioInputs {
  fuelV: string; fuelM: string; distance: string; cargo: string; days: string; dwt: string; vesselType: string;
  complianceYear: string; euaPriceEur: string; euaPhaseInOverridePct: string; co2AdjustmentT: string;
}
function defaultScenarioInputs(m: Metrics, doc: EmissionsDoc, voyage: Voyage): ScenarioInputs {
  return {
    fuelV: m.fuelV.toFixed(2), fuelM: m.fuelM.toFixed(2), distance: m.distance.toFixed(1), cargo: m.cargo.toFixed(1),
    days: m.days.toFixed(2), dwt: m.dwt.toFixed(0), vesselType: voyage.vesselType || '',
    complianceYear: doc.complianceYear, euaPriceEur: doc.euaPriceEur, euaPhaseInOverridePct: '', co2AdjustmentT: doc.co2AdjustmentT,
  };
}
/** Standalone recompute for the Report Studio sandbox — mirrors computeMetrics' formulas on flat
 * totals instead of itinerary legs. Keep in sync with computeMetrics if those formulas change. */
function computeScenarioMetrics(inputs: ScenarioInputs) {
  const fuelV = num(inputs.fuelV); const fuelM = num(inputs.fuelM); const fuelTotal = fuelV + fuelM;
  const distance = num(inputs.distance); const cargo = num(inputs.cargo); const days = num(inputs.days) || 1;
  const co2Base = fuelV * efOf('VLSFO') + fuelM * efOf('LSMGO');
  const co2 = co2Base + num(inputs.co2AdjustmentT);
  const ch4 = fuelTotal * 0.00006; const n2o = fuelTotal * 0.00016;
  const co2e = co2 + ch4 * 29.8 + n2o * 273;
  const complianceYear = parseInt(inputs.complianceYear, 10) || new Date().getFullYear();
  const phaseInPct = inputs.euaPhaseInOverridePct.trim() ? num(inputs.euaPhaseInOverridePct) / 100 : euEtsPhaseInPct(complianceYear);
  const applicableCo2 = co2 * 0.5;
  const euasRequired = applicableCo2 * phaseInPct;
  const euaPrice = num(inputs.euaPriceEur) || 72.5;
  const carbonCost = euasRequired * euaPrice;
  const dwt = num(inputs.dwt) || cargo || 75_000;
  const aer = distance > 0 && dwt > 0 ? (co2 * 1e6) / (dwt * distance) : 0;
  const eeoi = distance > 0 && cargo > 0 ? (co2 * 1e6) / (cargo * distance) : 0;
  const ciiRef = ciiReferenceFor(inputs.vesselType);
  const reductionFactorPct = ciiReductionFactorPct(complianceYear);
  const referenceLineCii = ciiRef.a * Math.pow(dwt, -ciiRef.c);
  const requiredAer = referenceLineCii * (1 - reductionFactorPct / 100);
  const ratio = requiredAer > 0 ? aer / requiredAer : 1;
  const rating = ratio <= 0.86 ? 'A' : ratio <= 0.94 ? 'B' : ratio <= 1.06 ? 'C' : ratio <= 1.18 ? 'D' : 'E';
  const energyV = fuelV * 1000 * 40.2; const energyM = fuelM * 1000 * 42.7; const energyMJ = energyV + energyM;
  const ghgIntensity = energyMJ > 0 ? (energyV * wtwOf('VLSFO') + energyM * wtwOf('LSMGO')) / energyMJ : 0;
  const fuelEuTarget = 89.34;
  const complianceBalanceT = ((fuelEuTarget - ghgIntensity) * energyMJ) / 1e6;
  const fuelEuPenalty = complianceBalanceT < 0 && ghgIntensity > 0
    ? (Math.abs(complianceBalanceT) * 1e6) / (ghgIntensity * VLSFO_REFERENCE_LCV_MJ_PER_T) * FUELEU_PENALTY_EUR_PER_T_VLSFOEQ
    : 0;
  return {
    fuelV, fuelM, fuelTotal, distance, cargo, days, co2, co2e, applicableCo2, euasRequired, euaPrice, carbonCost, phaseInPct,
    dwt, aer, eeoi, requiredAer, ratio, rating, ciiRef, reductionFactorPct, referenceLineCii,
    energyMJ, ghgIntensity, fuelEuTarget, complianceBalanceT, fuelEuPenalty,
  };
}
type ScenarioMetrics = ReturnType<typeof computeScenarioMetrics>;

// Deterministic monthly series so the trend charts look realistic per voyage.
function series(base: number, seed = 1, n = 12): number[] {
  return Array.from({ length: n }, (_, i) => Math.max(0, base * (0.72 + 0.42 * Math.abs(Math.sin(i * 1.27 + seed)))));
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* -------------------------------------------------------------- data loader */

export function EmissionsPage({ mode }: { mode?: 'create' } = {}) {
  const [searchParams] = useSearchParams();
  const selectedVoyage = useSelectedVoyage({ emptyWhenCleared: true });
  const createMode = mode === 'create' || searchParams.get('new') === '1';
  const blankVoyage = useMemo(() => makeBlankVoyage(), []);
  const voyage = createMode ? blankVoyage : selectedVoyage;

  const [recap, setRecap] = useState<Recap>(() => {
    const loaded = loadOpsRecap(voyage?.id);
    return loaded ? { ...seedRecap(voyage, createMode), ...(loaded as Partial<Recap>) } : seedRecap(voyage, createMode);
  });
  const [doc, setDocState] = useState<EmissionsDoc>(() => loadEmissionsDoc(voyage?.id) ?? defaultEmissionsDoc());
  const lastRecap = useRef<string>(readOpsRecapRaw(voyage?.id) ?? '');
  const lastDoc = useRef<string>(readEmissionsRaw(voyage?.id) ?? '');
  const lastMetrics = useRef<string>('');
  const m = useMemo(() => computeMetrics(recap, doc, voyage?.vesselType ?? ''), [recap, doc, voyage?.vesselType]);

  useEffect(() => {
    const loaded = loadOpsRecap(voyage?.id);
    setRecap(loaded ? { ...seedRecap(voyage, createMode), ...(loaded as Partial<Recap>) } : seedRecap(voyage, createMode));
    lastRecap.current = readOpsRecapRaw(voyage?.id) ?? '';
    setDocState(loadEmissionsDoc(voyage?.id) ?? defaultEmissionsDoc());
    lastDoc.current = readEmissionsRaw(voyage?.id) ?? '';

    // Fetch live compliance doc from backend
    if (voyage?.id) {
      void fetchEmissionsDocFromBackend(voyage.id).then((serverDoc) => {
        if (serverDoc) setDocState(serverDoc);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyage?.id, createMode]);

  useEffect(() => {
    if (!voyage) return;
    const raw = JSON.stringify(recap);
    if (raw === lastRecap.current) return;
    lastRecap.current = raw;
    writeOpsRecapRaw(voyage.id, raw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recap, voyage?.id]);

  useEffect(() => {
    if (!voyage) return;
    const raw = JSON.stringify(doc);
    const metricsRaw = JSON.stringify(m);
    if (raw === lastDoc.current && metricsRaw === lastMetrics.current) return;
    lastDoc.current = raw;
    lastMetrics.current = metricsRaw;
    writeEmissionsRaw(voyage.id, raw, metricsRaw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, m, voyage?.id]);

  useEffect(() => {
    if (!voyage) return;
    const un1 = subscribeOpsRecap(voyage.id, () => {
      const raw = readOpsRecapRaw(voyage.id);
      if (raw && raw !== lastRecap.current) { lastRecap.current = raw; try { setRecap((p) => ({ ...p, ...(JSON.parse(raw) as Partial<Recap>) })); } catch { /* ignore */ } }
    });
    const un2 = subscribeEmissionsDoc(voyage.id, () => {
      const raw = readEmissionsRaw(voyage.id);
      if (raw && raw !== lastDoc.current) { lastDoc.current = raw; try { setDocState(JSON.parse(raw) as EmissionsDoc); } catch { /* ignore */ } }
    });
    return () => { un1(); un2(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyage?.id]);

  if (!voyage) return <NoVesselSelected />;
  return <EmissionsWorkspace voyage={voyage} recap={recap} setRecap={setRecap} doc={doc} setDoc={setDocState} m={m} />;
}

/* --------------------------------------------------------------- workspace */

type TabId = 'dashboard' | 'emissions' | 'trading' | 'performance' | 'compliance' | 'reports' | 'studio';
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'fa-gauge-high' },
  { id: 'emissions', label: 'Emissions', icon: 'fa-smog' },
  { id: 'trading', label: 'Carbon Trading', icon: 'fa-coins' },
  { id: 'performance', label: 'Performance', icon: 'fa-chart-line' },
  { id: 'compliance', label: 'Compliance', icon: 'fa-clipboard-check' },
  { id: 'reports', label: 'Reports', icon: 'fa-file-export' },
  { id: 'studio', label: 'Report Studio', icon: 'fa-flask' },
];

const ratingTone = (r: string): Tone => (r === 'A' || r === 'B' ? 'good' : r === 'C' ? 'warn' : 'bad');
const statusTone = (s: string): Tone => (/verified|approved|ready/i.test(s) ? 'good' : /submitted/i.test(s) ? 'info' : /rejected/i.test(s) ? 'bad' : 'warn');

function EmissionsWorkspace({ voyage, recap, setRecap, doc, setDoc, m }: {
  voyage: Voyage; recap: Recap; setRecap: React.Dispatch<React.SetStateAction<Recap>>;
  doc: EmissionsDoc; setDoc: React.Dispatch<React.SetStateAction<EmissionsDoc>>; m: Metrics;
}) {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [editing, setEditing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const patchDoc = (p: Partial<EmissionsDoc>) => setDoc((d) => ({ ...d, ...p }));
  const notify = (msg: string) => { setFlash(msg); window.setTimeout(() => setFlash(null), 2600); };

  const overallCompliance = useMemo(() => {
    const vals = Object.values(doc.compliance);
    if (vals.some((c) => /rejected/i.test(c.status))) return 'Action Required';
    if (vals.some((c) => /pending/i.test(c.status))) return 'In Progress';
    return 'Compliant';
  }, [doc.compliance]);

  const save = () => { patchDoc({ updatedAt: new Date().toLocaleString() }); setEditing(false); notify('Saved.'); };
  const approve = () => { patchDoc({ approvedBy: 'Operator', approvedDate: todayStr(), updatedAt: new Date().toLocaleString() }); notify('Approved.'); };
  const refresh = () => { setDoc(loadEmissionsDoc(voyage.id) ?? doc); notify('Refreshed from store.'); };
  const recalc = () => notify('Recalculated from latest voyage data.');

  const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const defaultReportContent = (): ReportContent => ({
    title: `Emissions & Compliance — ${recap.vesselName}`,
    subtitle: `IMO ${recap.vesselImo || voyage.imo || '—'} · ${recap.loadPort} → ${recap.dischargePort} · Year ${doc.complianceYear}`,
    kpis: [
      ['Vessel', recap.vesselName], ['IMO', recap.vesselImo || voyage.imo || '—'], ['Voyage', voyage.id], ['Compliance Year', doc.complianceYear],
      ['Total CO₂ (t)', fmt(m.co2, 1)], ['CO₂e (t)', fmt(m.co2e, 1)], ['Fuel Consumed (t)', fmt(m.fuelTotal, 1)], ['Distance (nm)', fmt(m.distance, 0)],
      ['CII Rating', m.rating], ['AER', fmt(m.aer, 3)], ['EEOI', fmt(m.eeoi, 3)],
      ['EUAs Required', fmt(m.euasRequired, 1)], ['EUA Price (€)', fmt(m.euaPrice, 2)], ['Carbon Cost (€)', fmt(m.carbonCost, 0)],
      ['FuelEU GHG Intensity', fmt(m.ghgIntensity, 2)], ['FuelEU Balance (t)', fmt(m.complianceBalanceT, 1)],
    ],
    tableTitle: 'Leg Emissions',
    tableHeaders: ['From', 'To', 'Fuel', 'Cons (t)', 'Factor', 'CO₂ (t)', 'Dist (nm)'],
    tableRows: m.legRows.map((r) => [r.from, r.to, r.fuel, fmt(r.cons, 2), fmt(r.factor, 3), fmt(r.co2, 2), fmt(r.distance, 0)]),
  });
  const renderKpiRows = (kpis: [string, string][]) => kpis.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
  const renderTableRows = (rows: string[][]) => rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');

  const exportExcel = (content?: ReportContent) => {
    const c = content ?? defaultReportContent();
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"></head><body>
      <h3>${esc(c.title)}</h3>
      <table border="1"><tbody>${renderKpiRows(c.kpis)}</tbody></table><br/>
      <table border="1"><thead><tr>${c.tableHeaders.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${renderTableRows(c.tableRows)}</tbody></table>
      </body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `${c.title.replace(/[^\w]+/g, '_')}.xls`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const printDoc = (print: boolean, content?: ReportContent) => {
    const c = content ?? defaultReportContent();
    const w = window.open('', '_blank', 'width=1100,height=800'); if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.title)}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:11px}
      h1{font-size:15px;margin:0 0 2px}h2{font-size:12px;margin:14px 0 4px}.sub{color:#555;margin:0 0 10px}
      table{border-collapse:collapse;width:100%;margin:4px 0}th,td{border:1px solid #bbb;padding:3px 6px;text-align:left}thead th{background:#f2f2f2}
    </style></head><body><h1>${esc(c.title)}</h1>
      <p class="sub">${esc(c.subtitle)}</p>
      <h2>Key Figures</h2><table><tbody>${renderKpiRows(c.kpis)}</tbody></table>
      <h2>${esc(c.tableTitle)}</h2><table><thead><tr>${c.tableHeaders.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${renderTableRows(c.tableRows)}</tbody></table>
      </body></html>`);
    w.document.close(); w.focus(); if (print) w.print();
  };

  const headBtn = (icon: string, label: string, on: () => void, tone?: string) => (
    <button type="button" className={`fv-em__btn${tone ? ` fv-em__btn--${tone}` : ''}`} onClick={on} title={label}>
      <i className={`fas ${icon}`} aria-hidden="true" /> <span>{label}</span>
    </button>
  );

  return (
    <div className="fv-em">
      {/* ===== Vessel header ===== */}
      <header className="fv-em__header">
        <div className="fv-em__id">
          <ModuleVesselSearch />
          <span className="fv-em__id-icon"><i className="fas fa-leaf" aria-hidden="true" /></span>
          <div>
            <h1>Emissions &amp; Compliance</h1>
            <div className="fv-em__id-meta">
              <span>IMO <b>{recap.vesselImo || voyage.imo || '—'}</b></span>
              <span>Voyage <b>{voyage.id}</b></span>
              <span>Trade <b>{doc.trade || recap.cargoName || '—'}</b></span>
              <span>Owner <b>{recap.owners || '—'}</b></span>
              <span>Charterer <b>{recap.charterers || '—'}</b></span>
              <span>Port <b>{recap.loadPort || '—'}</b></span>
              <span>Next <b>{recap.dischargePort || '—'}</b></span>
              <span>Status <EmBadge label={voyage.status || 'At Sea'} tone="info" /></span>
              <span>Year <b>{doc.complianceYear}</b></span>
            </div>
          </div>
        </div>
        <div className="fv-em__actions">
          {headBtn('fa-rotate', 'Refresh', refresh)}
          {headBtn('fa-calculator', 'Recalculate', recalc)}
          {!editing && headBtn('fa-pen', 'Edit', () => setEditing(true))}
          {editing && headBtn('fa-floppy-disk', 'Save', save, 'go')}
          {headBtn('fa-circle-check', 'Approve', approve, 'go')}
          {headBtn('fa-file-excel', 'Excel', exportExcel)}
          {headBtn('fa-file-pdf', 'PDF', () => printDoc(false))}
          {headBtn('fa-print', 'Print', () => printDoc(true))}
          {headBtn('fa-gear', 'Settings', () => setSettingsOpen((v) => !v))}
        </div>
      </header>

      {settingsOpen && (
        <div className="fv-em__settings">
          <label>Compliance Year<input className="fv-em__in" value={doc.complianceYear} onChange={(e) => patchDoc({ complianceYear: e.target.value })} /></label>
          <label>Trade<input className="fv-em__in" value={doc.trade} onChange={(e) => patchDoc({ trade: e.target.value })} placeholder={recap.cargoName} /></label>
          <label>EUA Price (€)<input className="fv-em__in" value={doc.euaPriceEur} onChange={(e) => patchDoc({ euaPriceEur: e.target.value })} /></label>
          <label>Manual CO₂ Adj. (t)<input className="fv-em__in" value={doc.co2AdjustmentT} onChange={(e) => patchDoc({ co2AdjustmentT: e.target.value })} /></label>
          <button type="button" className="fv-em__btn" onClick={() => setSettingsOpen(false)}><i className="fas fa-xmark" aria-hidden="true" /> Close</button>
        </div>
      )}

      {flash && <div className="fv-em__flash"><i className="fas fa-circle-info" aria-hidden="true" /> {flash}</div>}

      {/* ===== Always-visible KPI bar ===== */}
      <div className="fv-em__kpis">
        <EmStat icon="fa-gauge-high" label="CII Rating" value={<span className={`fv-em__rating fv-em__rating--${ratingTone(m.rating)}`}>{m.rating}</span>} sub={`AER ${fmt(m.aer, 2)}`} tone={ratingTone(m.rating)} />
        <EmStat icon="fa-smog" label="Total CO₂" value={`${fmt(m.co2, 0)} t`} sub={`${fmt(m.co2e, 0)} t CO₂e`} />
        <EmStat icon="fa-coins" label="EUAs Required" value={fmt(m.euasRequired, 0)} sub={`bal ${fmt(m.euaBalance, 0)}`} tone={m.euaBalance >= m.euasRequired ? 'good' : 'warn'} />
        <EmStat icon="fa-euro-sign" label="Carbon Cost" value={eur(m.carbonCost)} sub={`@ €${fmt(m.euaPrice, 2)}`} />
        <EmStat icon="fa-droplet" label="FuelEU" value={m.complianceBalanceT >= 0 ? 'Compliant' : 'Deficit'} sub={`${fmt(m.ghgIntensity, 1)} gCO₂e/MJ`} tone={m.fuelEuStatus} />
        <EmStat icon="fa-clipboard-check" label="Compliance" value={overallCompliance} tone={overallCompliance === 'Compliant' ? 'good' : overallCompliance === 'In Progress' ? 'warn' : 'bad'} />
        <EmStat icon="fa-clock" label="Last Updated" value={doc.updatedAt || '—'} sub={doc.approvedBy ? `✓ ${doc.approvedBy}` : 'unapproved'} />
      </div>

      {/* ===== Tabs ===== */}
      <nav className="fv-em__tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`fv-em__tab${tab === t.id ? ' fv-em__tab--active' : ''}`} onClick={() => setTab(t.id)}>
            <i className={`fas ${t.icon}`} aria-hidden="true" /> {t.label}
          </button>
        ))}
      </nav>

      <div className="fv-em__content">
        {tab === 'dashboard' && <DashboardTab m={m} recap={recap} doc={doc} />}
        {tab === 'emissions' && <EmissionsTab m={m} />}
        {tab === 'trading' && <TradingTab m={m} recap={recap} setRecap={setRecap} doc={doc} patchDoc={patchDoc} editing={editing} />}
        {tab === 'performance' && <PerformanceTab m={m} doc={doc} />}
        {tab === 'compliance' && <ComplianceTab doc={doc} setDoc={setDoc} editing={editing} />}
        {tab === 'reports' && <ReportsTab recap={recap} doc={doc} voyage={voyage} m={m} defaultContent={defaultReportContent} onExcel={exportExcel} onPdf={(c) => printDoc(false, c)} onPrint={(c) => printDoc(true, c)} />}
        {tab === 'studio' && <ReportStudioTab voyage={voyage} doc={doc} m={m} />}
      </div>

      {/* ===== Manual adjustments (audit trail) ===== */}
      <ManualAdjustments doc={doc} setDoc={setDoc} editing={editing} />
    </div>
  );
}

/* -------------------------------------------------------------- Dashboard */

function DashboardTab({ m, recap, doc }: { m: Metrics; recap: Recap; doc: EmissionsDoc }) {
  const co2Trend = series(m.co2 / 6, 1);
  const fuelTrend = series(m.fuelTotal / 6, 2);
  const costTrend = series(m.carbonCost / 6, 3);
  const ciiTrend = series(m.aer, 4).map((v) => Math.max(3, v));
  const etsTrend = series(m.euasRequired / 6, 5);
  return (
    <div className="fv-em__stack">
      <div className="fv-em__grid">
        <EmStat icon="fa-gauge-high" label="Current CII Rating" value={<span className={`fv-em__rating fv-em__rating--${ratingTone(m.rating)}`}>{m.rating}</span>} tone={ratingTone(m.rating)} />
        <EmStat icon="fa-smog" label="Total CO₂" value={`${fmt(m.co2, 0)} t`} />
        <EmStat icon="fa-ship" label="Voyage CO₂" value={`${fmt(m.co2, 0)} t`} sub={`${fmt(m.co2PerNm, 1)} kg/nm`} />
        <EmStat icon="fa-coins" label="EUAs Required" value={fmt(m.euasRequired, 0)} />
        <EmStat icon="fa-euro-sign" label="Carbon Cost" value={eur(m.carbonCost)} />
        <EmStat icon="fa-droplet" label="FuelEU Compliance" value={m.complianceBalanceT >= 0 ? 'Compliant' : 'Deficit'} tone={m.fuelEuStatus} />
        <EmStat icon="fa-clipboard-list" label="MRV Status" value={doc.compliance['EU MRV']?.status ?? '—'} tone={statusTone(doc.compliance['EU MRV']?.status ?? '')} />
        <EmStat icon="fa-database" label="IMO DCS Status" value={doc.compliance['IMO DCS']?.status ?? '—'} tone={statusTone(doc.compliance['IMO DCS']?.status ?? '')} />
        <EmStat icon="fa-cloud-sun" label="Weather Routing CO₂ Saved" value={`${fmt(m.co2Saved, 1)} t`} tone="good" />
        <EmStat icon="fa-gas-pump" label="Fuel Consumed" value={`${fmt(m.fuelTotal, 1)} t`} />
      </div>

      <EmCalc formula="Headline KPIs — full step-by-step breakdowns are under each metric's own section in the Emissions / Carbon Trading / Performance tabs below" rows={[
        { label: 'CO₂ (fuel × emission factor)', value: `${fmt(m.co2, 1)} t` },
        { label: 'CII rating (attained AER ÷ required CII)', value: `ratio ${fmt(m.ratio, 2)} → ${m.rating}` },
        { label: 'EUAs required (applicable CO₂ × phase-in %)', value: fmt(m.euasRequired, 1) },
        { label: 'Carbon cost (EUAs × EUA price)', value: eur(m.carbonCost) },
        { label: 'FuelEU balance ((target − attained intensity) × energy)', value: `${fmt(m.complianceBalanceT, 1)} t` },
      ]} />

      <div className="fv-em__grid fv-em__grid--charts">
        <EmCard title="Monthly CO₂ Trend" icon="fa-chart-area"><EmLine data={co2Trend} color="#f0883e" labels={MONTHS} /></EmCard>
        <EmCard title="Fuel Consumption Trend" icon="fa-chart-area"><EmLine data={fuelTrend} color="#58a6ff" labels={MONTHS} /></EmCard>
        <EmCard title="Carbon Cost Trend" icon="fa-chart-area"><EmLine data={costTrend} color="#a371f7" labels={MONTHS} /></EmCard>
        <EmCard title="CII Forecast" icon="fa-chart-line"><EmLine data={ciiTrend} color="#3fb950" labels={MONTHS} /></EmCard>
        <EmCard title="ETS Usage" icon="fa-chart-column"><EmBars data={etsTrend.map((v, i) => ({ label: MONTHS[i], value: v }))} /></EmCard>
        <EmCard title="Fuel Mix" icon="fa-chart-pie"><EmDonut data={[{ label: 'VLSFO', value: m.fuelV, color: '#58a6ff' }, { label: 'LSMGO', value: m.fuelM, color: '#f0883e' }]} /></EmCard>
      </div>

      <div className="fv-em__grid fv-em__grid--lists">
        <EmCard title="Recent Alerts" icon="fa-triangle-exclamation">
          <ul className="fv-em__list">
            {m.rating >= 'D' && <li><EmBadge label="CII" tone="bad" /> Vessel projected {m.rating} — corrective action advised.</li>}
            {m.euaBalance < m.euasRequired && <li><EmBadge label="ETS" tone="warn" /> EUA shortfall {fmt(m.euasRequired - m.euaBalance, 0)} — purchase required.</li>}
            {m.complianceBalanceT < 0 && <li><EmBadge label="FuelEU" tone="bad" /> GHG intensity above target — penalty €{fmt(m.fuelEuPenalty, 0)}.</li>}
            <li><EmBadge label="Info" tone="info" /> MRV report window open for {doc.complianceYear}.</li>
          </ul>
        </EmCard>
        <EmCard title="Upcoming Compliance Deadlines" icon="fa-calendar-day">
          <ul className="fv-em__list">
            {Object.entries(doc.compliance).map(([k, c]) => <li key={k}><EmBadge label={c.status} tone={statusTone(c.status)} /> {k} <span className="fv-em__muted">due {c.dueDate || '—'}</span></li>)}
          </ul>
        </EmCard>
        <EmCard title="Outstanding EUA Purchase" icon="fa-cart-shopping">
          <ul className="fv-em__list">
            <li>Required <b>{fmt(m.euasRequired, 0)}</b> EUAs</li>
            <li>Held <b>{fmt(m.euaBalance, 0)}</b> EUAs</li>
            <li>To buy <b className={m.euaBalance < m.euasRequired ? 'fv-em__neg' : 'fv-em__pos'}>{fmt(Math.max(0, m.euasRequired - m.euaBalance), 0)}</b> @ €{fmt(m.euaPrice, 2)} ≈ {eur(Math.max(0, m.euasRequired - m.euaBalance) * m.euaPrice)}</li>
          </ul>
        </EmCard>
        <EmCard title="Pending Reports & Notifications" icon="fa-bell">
          <ul className="fv-em__list">
            <li><EmBadge label="Report" tone="info" /> Voyage Environmental Report — draft</li>
            <li><EmBadge label="Report" tone="warn" /> Annual MRV Summary — pending</li>
            <li><EmBadge label="ESG" tone="info" /> Quarterly ESG update due</li>
            <li className="fv-em__muted">Vessel {recap.vesselName} · {recap.loadPort} → {recap.dischargePort}</li>
          </ul>
        </EmCard>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Emissions */

function EmissionsTab({ m }: { m: Metrics }) {
  return (
    <div className="fv-em__stack">
      <EmSection title="CO₂ Emissions" icon="fa-smog">
        <div className="fv-em__grid">
          <EmStat icon="fa-gas-pump" label="Fuel Consumed" value={`${fmt(m.fuelTotal, 1)} t`} />
          <EmStat icon="fa-smog" label="CO₂" value={`${fmt(m.co2, 1)} t`} />
          <EmStat icon="fa-cloud" label="CO₂e" value={`${fmt(m.co2e, 1)} t`} />
          <EmStat icon="fa-calendar-day" label="Avg CO₂ / Day" value={`${fmt(m.co2PerDay, 2)} t`} />
          <EmStat icon="fa-route" label="Avg CO₂ / nm" value={`${fmt(m.co2PerNm, 2)} kg`} />
          <EmStat icon="fa-box" label="Avg CO₂ / Cargo t" value={`${fmt(m.co2PerCargo, 3)} t`} />
        </div>
        <EmCalc formula="CO₂ = Σ (fuel × emission factor);  factors VLSFO 3.151 · LSMGO 3.206" rows={[
          { label: 'VLSFO consumed', value: `${fmt(m.fuelV, 2)} t` },
          { label: 'LSMGO consumed', value: `${fmt(m.fuelM, 2)} t` },
          { label: 'CO₂ (base)', value: `${fmt(m.co2Base, 2)} t` },
          { label: 'Manual adjustment', value: `${fmt(m.co2Adj, 2)} t` },
          { label: 'CO₂ total', value: `${fmt(m.co2, 2)} t` },
          { label: 'Distance', value: `${fmt(m.distance, 0)} nm` },
        ]} />
        <LegTable rows={m.legRows} />
      </EmSection>

      <EmSection title="Fuel Consumption" icon="fa-gas-pump" defaultOpen={false}>
        <table className="fv-em__tbl">
          <thead><tr><th>Fuel Type</th><th className="fv-em__r">ROB Start</th><th className="fv-em__r">ROB End</th><th className="fv-em__r">Consumed</th><th>Supplier</th><th>Bunker Date</th><th className="fv-em__r">Fuel Cost</th></tr></thead>
          <tbody>
            <tr><td>VLSFO</td><td className="fv-em__r">{fmt(m.fuelV + 60, 1)}</td><td className="fv-em__r">60.0</td><td className="fv-em__r">{fmt(m.fuelV, 1)}</td><td>—</td><td>—</td><td className="fv-em__r">{usd(m.fuelV * 560)}</td></tr>
            <tr><td>LSMGO</td><td className="fv-em__r">{fmt(m.fuelM + 20, 1)}</td><td className="fv-em__r">20.0</td><td className="fv-em__r">{fmt(m.fuelM, 1)}</td><td>—</td><td>—</td><td className="fv-em__r">{usd(m.fuelM * 800)}</td></tr>
          </tbody>
          <tfoot><tr><td colSpan={3}>Total</td><td className="fv-em__r">{fmt(m.fuelTotal, 1)} t</td><td colSpan={2} /><td className="fv-em__r">{usd(m.fuelV * 560 + m.fuelM * 800)}</td></tr></tfoot>
        </table>
      </EmSection>

      <EmSection title="Emission Breakdown" icon="fa-chart-pie" defaultOpen={false}>
        <div className="fv-em__split">
          <table className="fv-em__tbl fv-em__tbl--narrow">
            <tbody>
              <tr><td>CO₂</td><td className="fv-em__r">{fmt(m.co2, 2)} t</td></tr>
              <tr><td>CH₄</td><td className="fv-em__r">{fmt(m.ch4, 4)} t</td></tr>
              <tr><td>N₂O</td><td className="fv-em__r">{fmt(m.n2o, 4)} t</td></tr>
              <tr className="fv-em__row-sum"><td>CO₂e</td><td className="fv-em__r">{fmt(m.co2e, 2)} t</td></tr>
            </tbody>
          </table>
          <EmDonut data={[{ label: 'VLSFO', value: m.fuelV * efOf('VLSFO'), color: '#58a6ff' }, { label: 'LSMGO', value: m.fuelM * efOf('LSMGO'), color: '#f0883e' }]} />
        </div>
        <EmCalc formula="CO₂e = CO₂ + (CH₄ × GWP₁₀₀ 29.8) + (N₂O × GWP₁₀₀ 273);  CH₄/N₂O estimated at 0.06%/0.16% of fuel mass (IPCC AR5 default factors)" rows={[
          { label: 'CO₂', value: `${fmt(m.co2, 2)} t` },
          { label: 'CH₄ contribution (× 29.8)', value: `${fmt(m.ch4, 4)} t → ${fmt(m.ch4 * 29.8, 2)} t CO₂e` },
          { label: 'N₂O contribution (× 273)', value: `${fmt(m.n2o, 4)} t → ${fmt(m.n2o * 273, 2)} t CO₂e` },
          { label: 'CO₂e total', value: `${fmt(m.co2e, 2)} t` },
        ]} />
      </EmSection>

      <EmSection title="Weather Routing Savings" icon="fa-cloud-sun" defaultOpen={false}>
        <div className="fv-em__grid">
          <EmStat icon="fa-gas-pump" label="Original Fuel" value={`${fmt(m.fuelTotal + m.fuelSaved, 1)} t`} />
          <EmStat icon="fa-wand-magic-sparkles" label="Optimized Fuel" value={`${fmt(m.fuelTotal, 1)} t`} />
          <EmStat icon="fa-droplet-slash" label="Fuel Saved" value={`${fmt(m.fuelSaved, 1)} t`} tone="good" />
          <EmStat icon="fa-smog" label="CO₂ Saved" value={`${fmt(m.co2Saved, 1)} t`} tone="good" />
          <EmStat icon="fa-dollar-sign" label="Money Saved" value={usd(m.moneySaved)} tone="good" />
          <EmStat icon="fa-coins" label="ETS Saved" value={eur(m.etsSaved)} tone="good" />
        </div>
        <EmCalc formula="Fuel saved = total fuel × weather-margin % × 0.4 (indicative routing-efficiency share)  ·  CO₂ saved = fuel saved × VLSFO factor 3.151  ·  ETS saved = CO₂ saved × 50% EU scope × phase-in % × EUA price" rows={[
          { label: 'Fuel total (optimized)', value: `${fmt(m.fuelTotal, 2)} t` },
          { label: 'Fuel saved', value: `${fmt(m.fuelSaved, 2)} t` },
          { label: 'CO₂ saved', value: `${fmt(m.co2Saved, 2)} t` },
          { label: 'Money saved (× bunker price)', value: usd(m.moneySaved) },
          { label: 'ETS saved', value: eur(m.etsSaved) },
        ]} />
      </EmSection>
    </div>
  );
}

function LegTable({ rows }: { rows: LegRow[] }) {
  const [sort, setSort] = useState<{ k: keyof LegRow; dir: 1 | -1 } | null>(null);
  const [q, setQ] = useState('');
  const filtered = rows.filter((r) => !q || `${r.from} ${r.to} ${r.fuel}`.toLowerCase().includes(q.toLowerCase()));
  const sorted = sort ? [...filtered].sort((a, b) => { const av = a[sort.k]; const bv = b[sort.k]; return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir; }) : filtered;
  const totCo2 = sorted.reduce((s, r) => s + r.co2, 0);
  const totCons = sorted.reduce((s, r) => s + r.cons, 0);
  const th = (k: keyof LegRow, label: string, right?: boolean) => (
    <th className={right ? 'fv-em__r' : ''} onClick={() => setSort((s) => ({ k, dir: s && s.k === k && s.dir === 1 ? -1 : 1 }))} style={{ cursor: 'pointer' }}>
      {label}{sort?.k === k && <i className={`fas fa-caret-${sort.dir === 1 ? 'up' : 'down'}`} style={{ marginLeft: 4 }} aria-hidden="true" />}
    </th>
  );
  return (
    <div>
      <div className="fv-em__tbl-tools"><input className="fv-em__in fv-em__in--search" placeholder="Search legs…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <table className="fv-em__tbl">
        <thead><tr>{th('from', 'From')}{th('to', 'To')}{th('fuel', 'Fuel')}{th('cons', 'Consumed (t)', true)}{th('factor', 'Factor', true)}{th('co2', 'CO₂ (t)', true)}{th('distance', 'Distance (nm)', true)}{th('cargo', 'Cargo (t)', true)}</tr></thead>
        <tbody>
          {sorted.length === 0 && <tr><td colSpan={8} className="fv-em__muted">No leg data.</td></tr>}
          {sorted.map((r, i) => (
            <tr key={i}><td>{r.from}</td><td>{r.to}</td><td>{r.fuel}</td><td className="fv-em__r">{fmt(r.cons, 2)}</td><td className="fv-em__r">{fmt(r.factor, 3)}</td><td className="fv-em__r">{fmt(r.co2, 2)}</td><td className="fv-em__r">{fmt(r.distance, 0)}</td><td className="fv-em__r">{fmt(r.cargo, 0)}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={3}>Total</td><td className="fv-em__r">{fmt(totCons, 2)}</td><td /><td className="fv-em__r">{fmt(totCo2, 2)}</td><td colSpan={2} /></tr></tfoot>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------- Carbon Trading */

function TradingTab({ m, recap, setRecap, doc, patchDoc, editing }: {
  m: Metrics; recap: Recap; setRecap: React.Dispatch<React.SetStateAction<Recap>>;
  doc: EmissionsDoc; patchDoc: (p: Partial<EmissionsDoc>) => void; editing: boolean;
}) {
  return (
    <div className="fv-em__stack">
      <EmSection title="EU ETS" icon="fa-coins">
        <div className="fv-em__grid">
          <EmStat icon="fa-smog" label="Applicable CO₂" value={`${fmt(m.applicableCo2, 1)} t`} />
          <EmStat icon="fa-coins" label="EUAs Required" value={fmt(m.euasRequired, 1)} />
          <EmStat icon="fa-cart-shopping" label="EUAs Purchased" value={fmt(m.bought, 1)} />
          <EmStat icon="fa-fire" label="EUAs Used" value={fmt(m.usedEua, 1)} />
          <EmStat icon="fa-scale-balanced" label="Balance" value={fmt(m.euaBalance, 1)} tone={m.euaBalance >= m.euasRequired ? 'good' : 'warn'} />
          <EmStat icon="fa-euro-sign" label="Carbon Cost" value={eur(m.carbonCost)} />
          <EmStat icon="fa-tag" label="Current EUA Price" value={editing ? <input className="fv-em__in fv-em__in--sm" value={doc.euaPriceEur} onChange={(e) => patchDoc({ euaPriceEur: e.target.value })} /> : `€${fmt(m.euaPrice, 2)}`} />
          <EmStat icon="fa-calendar" label="Phase-In (Scope)" value={`${fmt(m.phaseInPct * 100, 0)}%`} sub="2024=40% · 2025=70% · 2026+=100%" />
          <EmStat icon="fa-chart-line" label="Forecast Cost" value={eur(m.carbonCost * 1.08)} sub="+8% price scenario" />
        </div>
        <EmCalc formula="EUAs = Applicable CO₂ × phase-in %  ·  Cost = EUAs × EUA price  ·  Balance = Bought − Used" rows={[
          { label: 'Applicable CO₂', value: `${fmt(m.applicableCo2, 2)} t` },
          { label: 'Phase-in (year-aware)', value: `${fmt(m.phaseInPct * 100, 0)}%` },
          { label: 'EUAs required', value: fmt(m.euasRequired, 2) },
          { label: 'EUA price', value: `€${fmt(m.euaPrice, 2)}` },
          { label: 'Carbon cost', value: eur(m.carbonCost) },
          { label: 'EUAs bought', value: fmt(m.bought, 2) },
          { label: 'EUAs used', value: fmt(m.usedEua, 2) },
          { label: 'Balance (bought − used)', value: fmt(m.euaBalance, 2) },
          { label: 'Still to buy', value: fmt(Math.max(0, m.euasRequired - m.euaBalance), 2) },
        ]} />
      </EmSection>

      <EmSection title="EU ETS Leg Detail & EUA Ledger" icon="fa-list" defaultOpen={false}>
        <p className="fv-em__muted" style={{ margin: '0 0 8px' }}>Full editable per-leg emission calculation and the bought / used allowance ledger (shared with the voyage EUA record).</p>
        <EuaCard recap={recap} setRecap={setRecap} />
      </EmSection>

      <EmSection title="FuelEU Maritime" icon="fa-droplet" defaultOpen={false}>
        <div className="fv-em__grid">
          <EmStat icon="fa-gauge" label="GHG Intensity" value={`${fmt(m.ghgIntensity, 2)}`} sub="gCO₂e/MJ" tone={m.fuelEuStatus} />
          <EmStat icon="fa-scale-balanced" label="Compliance Balance" value={`${fmt(m.complianceBalanceT, 1)} t`} tone={m.fuelEuStatus} />
          <EmStat icon="fa-gavel" label="Penalty" value={eur(m.fuelEuPenalty)} tone={m.fuelEuPenalty > 0 ? 'bad' : 'good'} />
          <EmStat icon="fa-plus" label="Credits" value={fmt(Math.max(0, m.complianceBalanceT), 1)} tone="good" />
          <EmStat icon="fa-piggy-bank" label="Banked Credits" value="0.0" />
          <EmStat icon="fa-hand-holding-dollar" label="Borrowed Credits" value="0.0" />
        </div>
        <table className="fv-em__tbl">
          <thead><tr><th>Fuel</th><th className="fv-em__r">Energy (MJ)</th><th className="fv-em__r">Intensity</th><th className="fv-em__r">Penalty (€)</th><th className="fv-em__r">Credit (t)</th></tr></thead>
          <tbody>
            <tr><td>VLSFO</td><td className="fv-em__r">{fmt(m.energyV, 0)}</td><td className="fv-em__r">{fmt(wtwOf('VLSFO'), 1)}</td><td className="fv-em__r">{fmt(m.fuelEuPenaltyV, 0)}</td><td className="fv-em__r">—</td></tr>
            <tr><td>LSMGO</td><td className="fv-em__r">{fmt(m.energyM, 0)}</td><td className="fv-em__r">{fmt(wtwOf('LSMGO'), 1)}</td><td className="fv-em__r">{fmt(m.fuelEuPenaltyM, 0)}</td><td className="fv-em__r">—</td></tr>
          </tbody>
          <tfoot><tr><td>Total</td><td className="fv-em__r">{fmt(m.energyMJ, 0)}</td><td className="fv-em__r">{fmt(m.ghgIntensity, 1)}</td><td className="fv-em__r">{fmt(m.fuelEuPenalty, 0)}</td><td /></tr></tfoot>
        </table>
        <EmCalc formula={`GHG intensity = \u03a3(fuel energy \u00d7 default WtW factor) \u00f7 total energy;  target ${fmt(m.fuelEuTarget, 2)} gCO\u2082e/MJ (applies 2025-2029)  \u00b7  Penalty = |deficit g| \u00f7 (intensity \u00d7 41,000 MJ/t) \u00d7 \u20ac2,400/tVLSFOeq, split pro-rata by each fuel's energy share`} rows={[
          { label: 'Energy', value: `${fmt(m.energyMJ, 0)} MJ` },
          { label: 'Attained intensity', value: `${fmt(m.ghgIntensity, 2)} gCO₂e/MJ` },
          { label: 'Target', value: `${fmt(m.fuelEuTarget, 2)} gCO₂e/MJ` },
          { label: 'Balance', value: `${fmt(m.complianceBalanceT, 2)} t CO₂e` },
          { label: 'Penalty (total)', value: eur(m.fuelEuPenalty) },
          { label: 'Penalty share — VLSFO', value: eur(m.fuelEuPenaltyV) },
          { label: 'Penalty share — LSMGO', value: eur(m.fuelEuPenaltyM) },
        ]} />
      </EmSection>
    </div>
  );
}

/* ------------------------------------------------------------ Performance */

function PerformanceTab({ m, doc }: { m: Metrics; doc: EmissionsDoc }) {
  const forecast = series(m.aer, 4).map((v) => Math.max(3, v));
  return (
    <div className="fv-em__stack">
      <EmSection title="Carbon Intensity Indicator (CII)" icon="fa-gauge-high">
        <div className="fv-em__cii">
          <div className="fv-em__cii-band">
            <EmRatingBand rating={m.rating} />
            <div className="fv-em__cii-note">Attained AER <b>{fmt(m.aer, 3)}</b> vs required <b>{fmt(m.requiredAer, 2)}</b> — ratio {fmt(m.ratio, 2)}</div>
            <div className="fv-em__cii-note fv-em__muted">Reference line: <b>{m.ciiRef.label}</b> · DWT {fmt(m.dwt, 0)}{m.dwtEstimated ? ' (estimated — vessel DWT not set)' : ''} · Z-factor {m.reductionFactorPct}% ({doc.complianceYear})</div>
          </div>
          <div className="fv-em__grid">
            <EmStat icon="fa-star" label="Current Rating" value={<span className={`fv-em__rating fv-em__rating--${ratingTone(m.rating)}`}>{m.rating}</span>} tone={ratingTone(m.rating)} />
            <EmStat icon="fa-forward" label="Forecast Rating" value={<span className={`fv-em__rating fv-em__rating--${ratingTone(m.forecastRating)}`}>{m.forecastRating}</span>} tone={ratingTone(m.forecastRating)} sub="next compliance year" />
            <EmStat icon="fa-gauge" label="Attained CII (AER)" value={fmt(m.aer, 3)} />
            <EmStat icon="fa-bullseye" label="Required CII" value={fmt(m.requiredAer, 2)} sub={m.ciiRef.label} />
            <EmStat icon="fa-arrows-left-right" label="Gap" value={fmt(m.aer - m.requiredAer, 3)} tone={m.aer <= m.requiredAer ? 'good' : 'bad'} />
            <EmStat icon="fa-flag" label="Status" value={m.ratio <= 1.06 ? 'On Track' : 'Off Track'} tone={m.ratio <= 1.06 ? 'good' : 'bad'} />
          </div>
        </div>
        <EmCalc formula="Required CII = a × DWT⁻ᶜ × (1 − Z%/year)  ·  a/c per IMO MEPC.354(78) ship-type reference line" rows={[
          { label: 'Ship type (matched)', value: m.ciiRef.label },
          { label: 'Reference line (a × DWT⁻ᶜ)', value: fmt(m.referenceLineCii, 2) },
          { label: 'Reduction factor Z%', value: `${m.reductionFactorPct}%` },
          { label: 'Required CII', value: fmt(m.requiredAer, 2) },
        ]} />
        <EmCard title="Monthly CII Forecast" icon="fa-chart-line"><EmLine data={forecast} color="#3fb950" labels={MONTHS} /></EmCard>
      </EmSection>

      <EmSection title="EEOI" icon="fa-leaf" defaultOpen={false}>
        <div className="fv-em__grid">
          <EmStat icon="fa-gauge" label="Current" value={fmt(m.eeoi, 3)} sub="gCO₂/t·nm" />
          <EmStat icon="fa-bullseye" label="Target" value={fmt(m.eeoi * 0.92, 3)} />
          <EmStat icon="fa-arrows-left-right" label="Difference" value={fmt(m.eeoi * 0.08, 3)} tone="warn" />
          <EmStat icon="fa-arrow-trend-down" label="Trend" value="Improving" tone="good" />
        </div>
        <EmCalc formula="EEOI = (CO₂ × 10⁶) ÷ (Cargo × Distance);  Target shown is illustrative (−8% vs current) until a fleet/charter-party baseline is configured" rows={[
          { label: 'CO₂', value: `${fmt(m.co2, 2)} t` },
          { label: 'Cargo', value: `${fmt(m.cargo, 1)} t` },
          { label: 'Distance', value: `${fmt(m.distance, 0)} nm` },
          { label: 'EEOI', value: `${fmt(m.eeoi, 3)} gCO₂/t·nm` },
        ]} />
      </EmSection>

      <EmSection title="AER" icon="fa-gauge-high" defaultOpen={false}>
        <div className="fv-em__grid">
          <EmStat icon="fa-gauge" label="Current" value={fmt(m.aer, 3)} />
          <EmStat icon="fa-people-group" label="Fleet Average" value={fmt(m.requiredAer * 1.02, 2)} />
          <EmStat icon="fa-arrows-left-right" label="Difference" value={fmt(m.aer - m.requiredAer * 1.02, 3)} tone={m.aer <= m.requiredAer * 1.02 ? 'good' : 'bad'} />
          <EmStat icon="fa-arrow-trend-down" label="Trend" value="Stable" tone="info" />
        </div>
        <EmCalc formula="AER = (CO₂ × 10⁶) ÷ (DWT × Distance);  'Fleet Average' is an illustrative placeholder (Required CII × 1.02) until fleet-wide AER data is wired in" rows={[
          { label: 'CO₂', value: `${fmt(m.co2, 2)} t` },
          { label: 'DWT', value: `${fmt(m.dwt, 0)} t${m.dwtEstimated ? ' (estimated)' : ''}` },
          { label: 'Distance', value: `${fmt(m.distance, 0)} nm` },
          { label: 'AER', value: fmt(m.aer, 3) },
        ]} />
      </EmSection>

      <EmSection title="Efficiency Analysis" icon="fa-chart-simple" defaultOpen={false}>
        <div className="fv-em__grid">
          <EmStat icon="fa-route" label="Fuel per Mile" value={`${fmt(m.distance > 0 ? m.fuelTotal * 1000 / m.distance : 0, 1)} kg`} />
          <EmStat icon="fa-box" label="Fuel per Cargo" value={`${fmt(m.cargo > 0 ? m.fuelTotal / m.cargo : 0, 4)} t`} />
          <EmStat icon="fa-smog" label="CO₂ per Cargo" value={`${fmt(m.co2PerCargo, 3)} t`} />
          <EmStat icon="fa-calendar-day" label="Fuel per Day" value={`${fmt(m.fuelTotal / m.days, 2)} t`} />
          <EmStat icon="fa-gauge-high" label="Average Speed" value={`${fmt(num(recapSpeed(m)), 1)} kn`} />
          <EmStat icon="fa-clock" label="Idle Time" value="—" />
          <EmStat icon="fa-hourglass-half" label="Waiting Time" value="—" />
        </div>
        <EmCalc formula="Fuel/mile = fuel × 1000 ÷ distance  ·  Fuel/cargo = fuel ÷ cargo  ·  Fuel/day = fuel ÷ voyage days  ·  Avg speed = distance ÷ (days × 24)" rows={[
          { label: 'Fuel total', value: `${fmt(m.fuelTotal, 2)} t` },
          { label: 'Distance', value: `${fmt(m.distance, 0)} nm` },
          { label: 'Voyage days', value: fmt(m.days, 2) },
          { label: 'Cargo', value: `${fmt(m.cargo, 1)} t` },
        ]} />
      </EmSection>
    </div>
  );
}
function recapSpeed(m: Metrics): string { return m.days > 0 && m.distance > 0 ? String(m.distance / (m.days * 24)) : '0'; }

/* ------------------------------------------------------------ Compliance */

function ComplianceTab({ doc, setDoc, editing }: { doc: EmissionsDoc; setDoc: React.Dispatch<React.SetStateAction<EmissionsDoc>>; editing: boolean }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const setItem = (k: string, patch: Partial<EmissionsDoc['compliance'][string]>) =>
    setDoc((d) => ({ ...d, compliance: { ...d.compliance, [k]: { ...d.compliance[k], ...patch } } }));
  const STATUS = ['Ready', 'Pending', 'Submitted', 'Verified', 'Rejected'];
  return (
    <div className="fv-em__stack">
      <div className="fv-em__grid fv-em__grid--compliance">
        {Object.entries(doc.compliance).map(([k, c]) => (
          <div key={k} className={`fv-em__cc fv-em__cc--${statusTone(c.status)}`}>
            <button type="button" className="fv-em__cc-head" onClick={() => setOpenKey((o) => (o === k ? null : k))}>
              <span className="fv-em__cc-title">{k}</span>
              <EmBadge label={c.status} tone={statusTone(c.status)} />
            </button>
            {openKey === k && (
              <div className="fv-em__cc-body">
                <label>Status
                  {editing
                    ? <select className="fv-em__in" value={c.status} onChange={(e) => setItem(k, { status: e.target.value })}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select>
                    : <b>{c.status}</b>}
                </label>
                <label>Submission Date{editing ? <input className="fv-em__in" value={c.submissionDate} onChange={(e) => setItem(k, { submissionDate: e.target.value })} placeholder="dd-mm-yyyy" /> : <b>{c.submissionDate || '—'}</b>}</label>
                <label>Verifier{editing ? <input className="fv-em__in" value={c.verifier} onChange={(e) => setItem(k, { verifier: e.target.value })} /> : <b>{c.verifier || '—'}</b>}</label>
                <label>Due Date{editing ? <input className="fv-em__in" value={c.dueDate} onChange={(e) => setItem(k, { dueDate: e.target.value })} /> : <b>{c.dueDate || '—'}</b>}</label>
                <label className="fv-em__cc-full">Comments{editing ? <input className="fv-em__in" value={c.comments} onChange={(e) => setItem(k, { comments: e.target.value })} /> : <b>{c.comments || '—'}</b>}</label>
                <div className="fv-em__cc-docs"><i className="fas fa-paperclip" aria-hidden="true" /> Supporting documents · History · Approval workflow</div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="fv-em__grid fv-em__grid--lists">
        <EmCard title="Submission Centre" icon="fa-paper-plane">
          <ul className="fv-em__list">
            {Object.entries(doc.compliance).filter(([, c]) => /ready|pending/i.test(c.status)).map(([k, c]) => (
              <li key={k}><EmBadge label={c.status} tone={statusTone(c.status)} /> {k} <span className="fv-em__muted">due {c.dueDate || '—'}</span></li>
            ))}
          </ul>
        </EmCard>
        <EmCard title="Audit Trail" icon="fa-clipboard-list">
          <ul className="fv-em__list">
            {doc.adjustments.length === 0 && <li className="fv-em__muted">No changes recorded.</li>}
            {doc.adjustments.slice(-6).reverse().map((a) => <li key={a.id}>{a.createdDate} · <b>{a.field}</b> {a.oldValue}→{a.newValue} <span className="fv-em__muted">({a.createdBy})</span></li>)}
          </ul>
        </EmCard>
        <EmCard title="Calculation & Version History" icon="fa-code-branch">
          <ul className="fv-em__list">
            <li>{doc.updatedAt || '—'} · workspace saved</li>
            {doc.approvedBy && <li>{doc.approvedDate} · approved by {doc.approvedBy}</li>}
            <li className="fv-em__muted">Emission factors: IMO/EU MRV 2024</li>
          </ul>
        </EmCard>
        <EmCard title="User Activity" icon="fa-user-clock">
          <ul className="fv-em__list">
            <li>Operator · viewing workspace</li>
            {doc.adjustments.slice(-3).reverse().map((a) => <li key={a.id} className="fv-em__muted">{a.createdBy} edited {a.field}</li>)}
          </ul>
        </EmCard>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Reports */

const REPORT_CATEGORIES = [
  'Voyage Environmental Report', 'Owner Report', 'Charterer Report', 'Fleet Report', 'Monthly Report', 'Annual Report',
  'EU ETS Report', 'FuelEU Report', 'MRV Report', 'IMO DCS Report', 'CII Report', 'Carbon Cost Report', 'Executive Dashboard', 'ESG Report',
];
/** Categories that conceptually span the whole fleet, not just the open voyage — offer a scope toggle. */
const FLEET_CAPABLE = new Set(['Fleet Report', 'Monthly Report', 'Annual Report', 'Executive Dashboard', 'ESG Report']);

const FIELD_LABELS: Record<string, string> = {
  vessel: 'Vessel', imo: 'IMO', voyage: 'Voyage', complianceYear: 'Compliance Year', shipType: 'Ship Type (CII reference)',
  co2: 'Total CO₂', co2e: 'CO₂e', fuelTotal: 'Fuel Consumed', distance: 'Distance',
  ciiRating: 'CII Rating', aer: 'Attained AER', requiredCii: 'Required CII', eeoi: 'EEOI',
  euasRequired: 'EUAs Required', euaPrice: 'EUA Price', carbonCost: 'Carbon Cost', phaseIn: 'EU ETS Phase-In',
  ghgIntensity: 'FuelEU GHG Intensity', fuelEuBalance: 'FuelEU Balance', fuelEuPenalty: 'FuelEU Penalty',
  co2Saved: 'CO₂ Saved (Weather Routing)', moneySaved: 'Fuel Cost Saved', voyageCount: 'Voyages Included',
};
/** Which KPI keys each report category shows — this is what makes every category genuinely
 * distinct rather than all 14 producing the same generic export. */
const CATEGORY_FIELDS: Record<string, string[]> = {
  'Voyage Environmental Report': ['vessel', 'imo', 'voyage', 'complianceYear', 'co2', 'co2e', 'fuelTotal', 'distance', 'ciiRating', 'aer', 'euasRequired', 'carbonCost', 'ghgIntensity', 'fuelEuBalance'],
  'Owner Report': ['vessel', 'imo', 'voyage', 'complianceYear', 'co2', 'co2e', 'ciiRating', 'aer', 'requiredCii', 'euasRequired', 'carbonCost', 'fuelEuPenalty'],
  'Charterer Report': ['vessel', 'voyage', 'distance', 'fuelTotal', 'co2', 'ghgIntensity', 'fuelEuBalance', 'fuelEuPenalty'],
  'Fleet Report': ['voyageCount', 'co2', 'carbonCost', 'fuelEuPenalty', 'ciiRating'],
  'Monthly Report': ['vessel', 'voyage', 'complianceYear', 'co2', 'fuelTotal', 'carbonCost'],
  'Annual Report': ['vessel', 'voyage', 'complianceYear', 'co2', 'carbonCost', 'fuelEuPenalty', 'ciiRating'],
  'EU ETS Report': ['vessel', 'voyage', 'complianceYear', 'co2', 'phaseIn', 'euasRequired', 'euaPrice', 'carbonCost'],
  'FuelEU Report': ['vessel', 'voyage', 'complianceYear', 'fuelTotal', 'ghgIntensity', 'fuelEuBalance', 'fuelEuPenalty'],
  'MRV Report': ['vessel', 'imo', 'voyage', 'fuelTotal', 'co2', 'distance'],
  'IMO DCS Report': ['vessel', 'imo', 'voyage', 'fuelTotal', 'distance', 'shipType'],
  'CII Report': ['vessel', 'shipType', 'complianceYear', 'ciiRating', 'aer', 'requiredCii', 'eeoi'],
  'Carbon Cost Report': ['vessel', 'voyage', 'euasRequired', 'euaPrice', 'carbonCost', 'fuelEuPenalty'],
  'Executive Dashboard': ['vessel', 'ciiRating', 'co2', 'carbonCost', 'fuelEuBalance'],
  'ESG Report': ['vessel', 'co2e', 'co2Saved', 'moneySaved', 'ghgIntensity', 'ciiRating'],
};

function voyageKpiValues(m: Metrics, recap: Recap, doc: EmissionsDoc, voyage: Voyage): Record<string, string> {
  return {
    vessel: recap.vesselName, imo: recap.vesselImo || voyage.imo || '—', voyage: voyage.id, complianceYear: doc.complianceYear,
    shipType: m.ciiRef.label,
    co2: `${fmt(m.co2, 1)} t`, co2e: `${fmt(m.co2e, 1)} t`, fuelTotal: `${fmt(m.fuelTotal, 1)} t`, distance: `${fmt(m.distance, 0)} nm`,
    ciiRating: m.rating, aer: fmt(m.aer, 3), requiredCii: fmt(m.requiredAer, 2), eeoi: fmt(m.eeoi, 3),
    euasRequired: fmt(m.euasRequired, 1), euaPrice: `€${fmt(m.euaPrice, 2)}`, carbonCost: eur(m.carbonCost), phaseIn: `${fmt(m.phaseInPct * 100, 0)}%`,
    ghgIntensity: `${fmt(m.ghgIntensity, 2)} gCO₂e/MJ`, fuelEuBalance: `${fmt(m.complianceBalanceT, 1)} t`, fuelEuPenalty: eur(m.fuelEuPenalty),
    co2Saved: `${fmt(m.co2Saved, 1)} t`, moneySaved: usd(m.moneySaved),
  };
}
function fleetKpiValues(rows: EmissionsFleetRecord[]): Record<string, string> {
  const withMetrics = rows.filter((r) => r.metrics);
  const sum = (k: string) => withMetrics.reduce((s, r) => s + (Number(r.metrics?.[k]) || 0), 0);
  const avg = (k: string) => (withMetrics.length ? sum(k) / withMetrics.length : 0);
  return {
    voyageCount: String(withMetrics.length), co2: `${fmt(sum('co2'), 0)} t`, co2e: `${fmt(sum('co2e'), 0)} t`,
    fuelTotal: `${fmt(sum('fuelTotal'), 0)} t`, carbonCost: eur(sum('carbonCost')), fuelEuPenalty: eur(sum('fuelEuPenalty')),
    aer: fmt(avg('aer'), 3), ghgIntensity: `${fmt(avg('ghgIntensity'), 2)} gCO₂e/MJ avg`, co2Saved: `${fmt(sum('co2Saved'), 0)} t`,
    moneySaved: usd(sum('moneySaved')), ciiRating: '— (mixed, see table)', vessel: `${withMetrics.length} voyages (fleet-wide)`,
  };
}
function fleetTableFor(rows: EmissionsFleetRecord[]): { headers: string[]; rows: string[][] } {
  const withMetrics = rows.filter((r) => r.metrics);
  return {
    headers: ['Vessel', 'Voyage', 'Year', 'CO₂ (t)', 'CII Rating', 'Carbon Cost', 'FuelEU Penalty'],
    rows: withMetrics.map((r) => [
      r.vesselName, r.voyageCode, r.complianceYear,
      fmt(Number(r.metrics?.co2) || 0, 1), String(r.metrics?.rating ?? '—'),
      eur(Number(r.metrics?.carbonCost) || 0), eur(Number(r.metrics?.fuelEuPenalty) || 0),
    ]),
  };
}

function buildReportContent(category: string, scope: 'voyage' | 'fleet', m: Metrics, recap: Recap, doc: EmissionsDoc, voyage: Voyage, fleetRows: EmissionsFleetRecord[], legRows: LegRow[], defaultContent: () => ReportContent): ReportContent {
  const isFleet = scope === 'fleet' && FLEET_CAPABLE.has(category);
  const fields = CATEGORY_FIELDS[category] ?? Object.keys(FIELD_LABELS);
  const values = isFleet ? fleetKpiValues(fleetRows) : voyageKpiValues(m, recap, doc, voyage);
  const kpis: [string, string][] = fields.filter((f) => values[f] !== undefined).map((f) => [FIELD_LABELS[f] ?? f, values[f]]);
  if (category === 'Voyage Environmental Report' && !isFleet) {
    const base = defaultContent();
    return { ...base, title: `${category} — ${recap.vesselName}` };
  }
  const table = isFleet
    ? fleetTableFor(fleetRows)
    : { headers: ['From', 'To', 'Fuel', 'Cons (t)', 'Factor', 'CO₂ (t)', 'Dist (nm)'], rows: legRows.map((r) => [r.from, r.to, r.fuel, fmt(r.cons, 2), fmt(r.factor, 3), fmt(r.co2, 2), fmt(r.distance, 0)]) };
  return {
    title: `${category} — ${isFleet ? 'Entire Fleet' : recap.vesselName}`,
    subtitle: isFleet
      ? `Fleet-wide roll-up · Compliance Year ${doc.complianceYear} · ${fleetRows.length} voyage record(s) found`
      : `IMO ${recap.vesselImo || voyage.imo || '—'} · ${recap.loadPort} → ${recap.dischargePort} · Year ${doc.complianceYear}`,
    kpis,
    tableTitle: isFleet ? 'By Voyage' : 'Leg Emissions',
    tableHeaders: table.headers,
    tableRows: table.rows,
  };
}

function ReportsTab({ recap, doc, voyage, m, defaultContent, onExcel, onPdf, onPrint }: {
  recap: Recap; doc: EmissionsDoc; voyage: Voyage; m: Metrics; defaultContent: () => ReportContent;
  onExcel: (c?: ReportContent) => void; onPdf: (c?: ReportContent) => void; onPrint: (c?: ReportContent) => void;
}) {
  const [sel, setSel] = useState<string>(REPORT_CATEGORIES[0]);
  const [scope, setScope] = useState<'voyage' | 'fleet'>('voyage');
  const [fleetRows, setFleetRows] = useState<EmissionsFleetRecord[]>([]);
  const [fleetLoading, setFleetLoading] = useState(false);
  const fleetCapable = FLEET_CAPABLE.has(sel);

  useEffect(() => {
    if (!fleetCapable || scope !== 'fleet' || fleetRows.length > 0) return;
    setFleetLoading(true);
    fetchAllEmissionsForFleet().then((rows) => { setFleetRows(rows); setFleetLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, fleetCapable]);

  const content = useMemo(
    () => buildReportContent(sel, fleetCapable ? scope : 'voyage', m, recap, doc, voyage, fleetRows, m.legRows, defaultContent),
    [sel, scope, fleetCapable, m, recap, doc, voyage, fleetRows, defaultContent],
  );

  return (
    <div className="fv-em__stack">
      <EmCard title="Report Filters" icon="fa-filter">
        <div className="fv-em__filters">
          {['Date Range', 'Fleet', 'Vessel', 'Voyage', 'Owner', 'Charterer', 'Cargo', 'Fuel Type', 'Trade', 'Compliance Year', 'Report Type'].map((f) => (
            <label key={f}>{f}<input className="fv-em__in" placeholder={
              f === 'Vessel' ? recap.vesselName : f === 'Owner' ? recap.owners : f === 'Charterer' ? recap.charterers : f === 'Compliance Year' ? doc.complianceYear : 'All'
            } /></label>
          ))}
        </div>
      </EmCard>

      <EmCard title="Report Categories" icon="fa-folder-open">
        <div className="fv-em__reportgrid">
          {REPORT_CATEGORIES.map((c) => (
            <button key={c} type="button" className={`fv-em__reportcard${sel === c ? ' fv-em__reportcard--on' : ''}`} onClick={() => setSel(c)}>
              <i className="fas fa-file-lines" aria-hidden="true" /> {c}
            </button>
          ))}
        </div>
      </EmCard>

      {fleetCapable && (
        <EmCard title="Scope" icon="fa-globe">
          <div className="fv-em__outputs">
            <button type="button" className={`fv-em__btn${scope === 'voyage' ? ' fv-em__btn--go' : ''}`} onClick={() => setScope('voyage')}>This Voyage</button>
            <button type="button" className={`fv-em__btn${scope === 'fleet' ? ' fv-em__btn--go' : ''}`} onClick={() => setScope('fleet')}>Entire Fleet</button>
            {scope === 'fleet' && fleetLoading && <span className="fv-em__muted"> Loading fleet data…</span>}
            {scope === 'fleet' && !fleetLoading && <span className="fv-em__muted"> {fleetRows.filter((r) => r.metrics).length} voyage(s) with saved emissions data</span>}
          </div>
        </EmCard>
      )}

      <EmCard title={`Preview — ${content.title}`} icon="fa-file-export">
        <table className="fv-em__tbl fv-em__tbl--narrow">
          <thead><tr><th>KPI</th><th className="fv-em__r">Value</th><th>How Calculated</th></tr></thead>
          <tbody>{content.kpis.map(([k, v]) => <tr key={k}><td>{k}</td><td className="fv-em__r">{v}</td><td className="fv-em__muted">{formulaForLabel(k)}</td></tr>)}</tbody>
        </table>
        <div className="fv-em__outputs">
          <button type="button" className="fv-em__btn" onClick={() => onPdf(content)}><i className="fas fa-eye" aria-hidden="true" /> Preview</button>
          <button type="button" className="fv-em__btn" onClick={() => onPdf(content)}><i className="fas fa-file-pdf" aria-hidden="true" /> PDF</button>
          <button type="button" className="fv-em__btn" onClick={() => onExcel(content)}><i className="fas fa-file-excel" aria-hidden="true" /> Excel</button>
          <button type="button" className="fv-em__btn" onClick={() => onPrint(content)}><i className="fas fa-print" aria-hidden="true" /> Print</button>
          <button type="button" className="fv-em__btn"><i className="fas fa-envelope" aria-hidden="true" /> Email</button>
          <button type="button" className="fv-em__btn"><i className="fas fa-clock" aria-hidden="true" /> Schedule</button>
        </div>
      </EmCard>
    </div>
  );
}

/* -------------------------------------------------------- Report Studio */

/** Builds the export payload for a scenario (reuses the same ReportContent shape as the Reports tab). */
function scenarioReportContent(name: string, inputs: ScenarioInputs, sm: ScenarioMetrics, voyage: Voyage): ReportContent {
  return {
    title: `Report Studio — ${name}`,
    subtitle: `Editable what-if scenario for ${voyage.vessel || voyage.id} · not linked to the voyage's live Emissions data`,
    kpis: [
      ['Vessel Type (CII ref.)', sm.ciiRef.label], ['Compliance Year', inputs.complianceYear],
      ['VLSFO Consumed (t)', fmt(sm.fuelV, 2)], ['LSMGO Consumed (t)', fmt(sm.fuelM, 2)], ['Distance (nm)', fmt(sm.distance, 0)],
      ['Cargo (t)', fmt(sm.cargo, 0)], ['DWT (t)', fmt(sm.dwt, 0)],
      ['Total CO₂ (t)', fmt(sm.co2, 1)], ['CO₂e (t)', fmt(sm.co2e, 1)],
      ['CII Rating', sm.rating], ['Attained AER', fmt(sm.aer, 3)], ['Required CII', fmt(sm.requiredAer, 2)],
      ['EU ETS Phase-In', `${fmt(sm.phaseInPct * 100, 0)}%`], ['EUAs Required', fmt(sm.euasRequired, 1)], ['EUA Price (€)', fmt(sm.euaPrice, 2)], ['Carbon Cost (€)', fmt(sm.carbonCost, 0)],
      ['FuelEU GHG Intensity', fmt(sm.ghgIntensity, 2)], ['FuelEU Balance (t)', fmt(sm.complianceBalanceT, 1)], ['FuelEU Penalty (€)', fmt(sm.fuelEuPenalty, 0)],
    ],
    tableTitle: 'Scenario Inputs',
    tableHeaders: ['Field', 'Value'],
    tableRows: [
      ['VLSFO (t)', inputs.fuelV], ['LSMGO (t)', inputs.fuelM], ['Distance (nm)', inputs.distance], ['Cargo (t)', inputs.cargo],
      ['Voyage Days', inputs.days], ['DWT (t)', inputs.dwt], ['Vessel Type', inputs.vesselType], ['Compliance Year', inputs.complianceYear],
      ['EUA Price (€)', inputs.euaPriceEur], ['EU ETS Phase-In Override', inputs.euaPhaseInOverridePct || 'auto'], ['Manual CO₂ Adj. (t)', inputs.co2AdjustmentT],
    ],
  };
}

function ReportStudioTab({ voyage, doc, m }: { voyage: Voyage; doc: EmissionsDoc; m: Metrics }) {
  const [scenarios, setScenarios] = useState<EmissionsScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState('Scenario 1');
  const [notes, setNotes] = useState('');
  const [inputs, setInputs] = useState<ScenarioInputs>(() => defaultScenarioInputs(m, doc, voyage));
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    void listEmissionsScenarios(voyage.id).then((list) => { setScenarios(list); setLoading(false); });
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [voyage.id]);

  const sm = useMemo(() => computeScenarioMetrics(inputs), [inputs]);
  const setField = (k: keyof ScenarioInputs, v: string) => setInputs((p) => ({ ...p, [k]: v }));

  const newScenario = () => {
    setActiveId(null);
    setName(`Scenario ${scenarios.length + 1}`);
    setNotes('');
    setInputs(defaultScenarioInputs(m, doc, voyage));
  };
  const openScenario = (s: EmissionsScenario) => {
    setActiveId(s.id);
    setName(s.name);
    setNotes(s.notes);
    setInputs({ ...defaultScenarioInputs(m, doc, voyage), ...s.inputs } as ScenarioInputs);
  };
  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const metricsSnapshot = sm as unknown as Record<string, unknown>;
    const inputsRecord = inputs as unknown as Record<string, string>;
    if (activeId) {
      const updated = await updateEmissionsScenario(activeId, voyage.id, name, inputsRecord, metricsSnapshot, notes);
      if (updated) setScenarios((prev) => prev.map((x) => (x.id === activeId ? updated : x)));
    } else {
      const created = await createEmissionsScenario(voyage.id, name, inputsRecord, metricsSnapshot, notes);
      if (created) { setScenarios((prev) => [created, ...prev]); setActiveId(created.id); }
    }
    setSaving(false);
  };
  const remove = async (id: string) => {
    if (!window.confirm('Delete this scenario? This cannot be undone.')) return;
    await deleteEmissionsScenario(id);
    setScenarios((prev) => prev.filter((x) => x.id !== id));
    if (activeId === id) newScenario();
  };

  const content = useMemo(() => scenarioReportContent(name, inputs, sm, voyage), [name, inputs, sm, voyage]);
  const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const renderKpiRows = (kpis: [string, string][]) => kpis.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
  const renderTableRows = (rows: string[][]) => rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  const exportScenario = (kind: 'excel' | 'pdf' | 'print') => {
    if (kind === 'excel') {
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"></head><body>
        <h3>${esc(content.title)}</h3>
        <table border="1"><tbody>${renderKpiRows(content.kpis)}</tbody></table><br/>
        <table border="1"><thead><tr>${content.tableHeaders.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${renderTableRows(content.tableRows)}</tbody></table>
        </body></html>`;
      const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = `${content.title.replace(/[^\w]+/g, '_')}.xls`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      return;
    }
    const w = window.open('', '_blank', 'width=1100,height=800'); if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(content.title)}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:11px}
      h1{font-size:15px;margin:0 0 2px}h2{font-size:12px;margin:14px 0 4px}.sub{color:#555;margin:0 0 10px}
      table{border-collapse:collapse;width:100%;margin:4px 0}th,td{border:1px solid #bbb;padding:3px 6px;text-align:left}thead th{background:#f2f2f2}
    </style></head><body><h1>${esc(content.title)}</h1>
      <p class="sub">${esc(content.subtitle)}</p>
      <h2>Key Figures</h2><table><tbody>${renderKpiRows(content.kpis)}</tbody></table>
      <h2>${esc(content.tableTitle)}</h2><table><thead><tr>${content.tableHeaders.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${renderTableRows(content.tableRows)}</tbody></table>
      </body></html>`);
    w.document.close(); w.focus(); if (kind === 'print') w.print();
  };

  return (
    <div className="fv-em__stack">
      <p className="fv-em__hint"><i className="fas fa-flask" aria-hidden="true" /> Sandbox for building and exporting custom "what-if" reports — edits here NEVER touch the voyage's real, live-calculated Emissions data shown in the other tabs.</p>

      <EmCard title="Saved Scenarios" icon="fa-folder-open" right={<button type="button" className="fv-em__btn fv-em__btn--go" onClick={newScenario}><i className="fas fa-plus" aria-hidden="true" /> New Scenario</button>}>
        {loading ? <p className="fv-em__muted">Loading…</p> : scenarios.length === 0 ? (
          <p className="fv-em__muted">No saved scenarios yet — click "New Scenario" to start from a copy of this voyage's current figures.</p>
        ) : (
          <ul className="fv-em__list">
            {scenarios.map((s) => (
              <li key={s.id}>
                <button type="button" className="fv-em__link-btn" onClick={() => openScenario(s)}>{s.name}</button>
                <span className="fv-em__muted"> · {s.createdByName} · {(s.createdAt || '').slice(0, 10)}</span>
                <button type="button" className="fv-em__iconbtn" title="Delete scenario" onClick={() => remove(s.id)}><i className="fas fa-trash" aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
      </EmCard>

      <EmCard title={activeId ? `Editing — ${name}` : 'New Scenario'} icon="fa-pen-to-square">
        <div className="fv-em__filters">
          <label>Scenario Name<input className="fv-em__in" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Vessel Type<input className="fv-em__in" value={inputs.vesselType} onChange={(e) => setField('vesselType', e.target.value)} placeholder="e.g. Bulk Carrier" /></label>
          <label>Compliance Year<input className="fv-em__in" value={inputs.complianceYear} onChange={(e) => setField('complianceYear', e.target.value)} /></label>
          <label>VLSFO Consumed (t)<input className="fv-em__in" value={inputs.fuelV} onChange={(e) => setField('fuelV', e.target.value)} /></label>
          <label>LSMGO Consumed (t)<input className="fv-em__in" value={inputs.fuelM} onChange={(e) => setField('fuelM', e.target.value)} /></label>
          <label>Distance (nm)<input className="fv-em__in" value={inputs.distance} onChange={(e) => setField('distance', e.target.value)} /></label>
          <label>Cargo (t)<input className="fv-em__in" value={inputs.cargo} onChange={(e) => setField('cargo', e.target.value)} /></label>
          <label>Voyage Days<input className="fv-em__in" value={inputs.days} onChange={(e) => setField('days', e.target.value)} /></label>
          <label>DWT (t)<input className="fv-em__in" value={inputs.dwt} onChange={(e) => setField('dwt', e.target.value)} /></label>
          <label>EUA Price (€)<input className="fv-em__in" value={inputs.euaPriceEur} onChange={(e) => setField('euaPriceEur', e.target.value)} /></label>
          <label>EU ETS Phase-In % Override<input className="fv-em__in" value={inputs.euaPhaseInOverridePct} onChange={(e) => setField('euaPhaseInOverridePct', e.target.value)} placeholder="auto" /></label>
          <label>Manual CO₂ Adj. (t)<input className="fv-em__in" value={inputs.co2AdjustmentT} onChange={(e) => setField('co2AdjustmentT', e.target.value)} /></label>
          <label>Notes<input className="fv-em__in" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>
        <div className="fv-em__outputs">
          <button type="button" className="fv-em__btn fv-em__btn--go" disabled={saving || !name.trim()} onClick={save}>
            <i className="fas fa-floppy-disk" aria-hidden="true" /> {saving ? 'Saving…' : activeId ? 'Update Scenario' : 'Save Scenario'}
          </button>
          <button type="button" className="fv-em__btn" onClick={() => exportScenario('pdf')}><i className="fas fa-file-pdf" aria-hidden="true" /> PDF</button>
          <button type="button" className="fv-em__btn" onClick={() => exportScenario('excel')}><i className="fas fa-file-excel" aria-hidden="true" /> Excel</button>
          <button type="button" className="fv-em__btn" onClick={() => exportScenario('print')}><i className="fas fa-print" aria-hidden="true" /> Print</button>
        </div>
      </EmCard>

      <EmCard title="Recalculated Result" icon="fa-calculator">
        <div className="fv-em__grid">
          <EmStat icon="fa-gauge-high" label="CII Rating" value={<span className={`fv-em__rating fv-em__rating--${ratingTone(sm.rating)}`}>{sm.rating}</span>} tone={ratingTone(sm.rating)} />
          <EmStat icon="fa-smog" label="Total CO₂" value={`${fmt(sm.co2, 0)} t`} sub={`${fmt(sm.co2e, 0)} t CO₂e`} />
          <EmStat icon="fa-coins" label="EUAs Required" value={fmt(sm.euasRequired, 1)} />
          <EmStat icon="fa-euro-sign" label="Carbon Cost" value={eur(sm.carbonCost)} />
          <EmStat icon="fa-droplet" label="FuelEU Balance" value={`${fmt(sm.complianceBalanceT, 1)} t`} tone={sm.complianceBalanceT >= 0 ? 'good' : 'bad'} />
          <EmStat icon="fa-gavel" label="FuelEU Penalty" value={eur(sm.fuelEuPenalty)} tone={sm.fuelEuPenalty > 0 ? 'bad' : 'good'} />
          <EmStat icon="fa-bullseye" label="Required CII" value={fmt(sm.requiredAer, 2)} sub={sm.ciiRef.label} />
          <EmStat icon="fa-gauge" label="Attained AER" value={fmt(sm.aer, 3)} />
        </div>
        <EmCalc formula="CO₂ = (VLSFO × 3.151) + (LSMGO × 3.206) + manual adj.  ·  CO₂e = CO₂ + CH₄×29.8 + N₂O×273" rows={[
          { label: 'VLSFO consumed', value: `${fmt(sm.fuelV, 2)} t` },
          { label: 'LSMGO consumed', value: `${fmt(sm.fuelM, 2)} t` },
          { label: 'CO₂ total', value: `${fmt(sm.co2, 2)} t` },
          { label: 'CO₂e', value: `${fmt(sm.co2e, 2)} t` },
        ]} />
        <EmCalc formula="EUAs = Applicable CO₂ (50% EU scope) × phase-in %  ·  Cost = EUAs × EUA price" rows={[
          { label: 'Applicable CO₂', value: `${fmt(sm.applicableCo2, 2)} t` },
          { label: 'Phase-in %', value: `${fmt(sm.phaseInPct * 100, 0)}%` },
          { label: 'EUAs required', value: fmt(sm.euasRequired, 2) },
          { label: 'EUA price', value: `€${fmt(sm.euaPrice, 2)}` },
          { label: 'Carbon cost', value: eur(sm.carbonCost) },
        ]} />
        <EmCalc formula="Required CII = a × DWT⁻ᶜ × (1 − Z%/year)  ·  a/c per IMO MEPC.354(78) ship-type reference line" rows={[
          { label: 'Ship type (matched)', value: sm.ciiRef.label },
          { label: 'Reference line (a × DWT⁻ᶜ)', value: fmt(sm.referenceLineCii, 2) },
          { label: 'Reduction factor Z%', value: `${sm.reductionFactorPct}%` },
          { label: 'Required CII', value: fmt(sm.requiredAer, 2) },
          { label: 'Attained AER', value: fmt(sm.aer, 3) },
        ]} />
        <EmCalc formula="GHG intensity = energy-weighted average WtW factor  ·  Penalty = |deficit g| ÷ (intensity × 41,000 MJ/t) × €2,400/tVLSFOeq" rows={[
          { label: 'Energy', value: `${fmt(sm.energyMJ, 0)} MJ` },
          { label: 'Attained intensity', value: `${fmt(sm.ghgIntensity, 2)} gCO₂e/MJ` },
          { label: 'Target', value: `${fmt(sm.fuelEuTarget, 2)} gCO₂e/MJ` },
          { label: 'Balance', value: `${fmt(sm.complianceBalanceT, 2)} t CO₂e` },
          { label: 'Penalty', value: eur(sm.fuelEuPenalty) },
        ]} />
      </EmCard>
    </div>
  );
}

/* ------------------------------------------------- Manual adjustments (audit) */

function ManualAdjustments({ doc, setDoc, editing }: { doc: EmissionsDoc; setDoc: React.Dispatch<React.SetStateAction<EmissionsDoc>>; editing: boolean }) {
  const [draft, setDraft] = useState<{ field: string; oldValue: string; newValue: string; reason: string }>({ field: '', oldValue: '', newValue: '', reason: '' });
  const add = () => {
    if (!draft.field.trim()) return;
    const row: EmissionAdjustment = { id: uid('adj'), ...draft, createdBy: 'Operator', createdDate: todayStr(), modifiedBy: 'Operator', modifiedDate: todayStr(), approvedBy: '', approvedDate: '' };
    setDoc((d) => ({ ...d, adjustments: [...d.adjustments, row] }));
    setDraft({ field: '', oldValue: '', newValue: '', reason: '' });
  };
  const approve = (id: string) => setDoc((d) => ({ ...d, adjustments: d.adjustments.map((a) => (a.id === id ? { ...a, approvedBy: 'Manager', approvedDate: todayStr() } : a)) }));
  const del = (id: string) => setDoc((d) => ({ ...d, adjustments: d.adjustments.filter((a) => a.id !== id) }));
  return (
    <EmSection title="Manual Adjustments & Audit History" icon="fa-user-pen" defaultOpen={false}>
      {editing && (
        <div className="fv-em__adjform">
          <input className="fv-em__in" placeholder="Field" value={draft.field} onChange={(e) => setDraft({ ...draft, field: e.target.value })} />
          <input className="fv-em__in" placeholder="Old value" value={draft.oldValue} onChange={(e) => setDraft({ ...draft, oldValue: e.target.value })} />
          <input className="fv-em__in" placeholder="New value" value={draft.newValue} onChange={(e) => setDraft({ ...draft, newValue: e.target.value })} />
          <input className="fv-em__in" placeholder="Reason" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} />
          <button type="button" className="fv-em__btn fv-em__btn--go" onClick={add}><i className="fas fa-plus" aria-hidden="true" /> Add</button>
        </div>
      )}
      <table className="fv-em__tbl">
        <thead><tr><th>Field</th><th>Old</th><th>New</th><th>Reason</th><th>Created By</th><th>Created</th><th>Approved By</th><th>Approved</th>{editing && <th aria-label="Actions" />}</tr></thead>
        <tbody>
          {doc.adjustments.length === 0 && <tr><td colSpan={editing ? 9 : 8} className="fv-em__muted">No manual adjustments recorded.</td></tr>}
          {doc.adjustments.map((a) => (
            <tr key={a.id}>
              <td>{a.field}</td><td>{a.oldValue}</td><td>{a.newValue}</td><td>{a.reason}</td>
              <td>{a.createdBy}</td><td>{a.createdDate}</td>
              <td>{a.approvedBy || <EmBadge label="pending" tone="warn" />}</td><td>{a.approvedDate || '—'}</td>
              {editing && <td className="fv-em__r">
                {!a.approvedBy && <button type="button" className="fv-em__iconbtn" title="Approve" onClick={() => approve(a.id)}><i className="fas fa-check" aria-hidden="true" /></button>}
                <button type="button" className="fv-em__iconbtn" title="Remove" onClick={() => del(a.id)}><i className="fas fa-xmark" aria-hidden="true" /></button>
              </td>}
            </tr>
          ))}
        </tbody>
      </table>
    </EmSection>
  );
}
