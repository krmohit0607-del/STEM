/**
 * Voyage-estimation dropdown option lists.
 *
 * Single source of truth for the estimation module's selectable values
 * (vessel types, cargo/freight units, port types, canals, fuel grades,
 * currencies, expense types, hire basis, etc). Centralised here so an Admin
 * panel can later add / edit / reorder / disable values without touching the
 * estimation component. Keep values as plain arrays of strings.
 */

/** Vessel Particular → Type. */
export const VESSEL_TYPE_OPTIONS = [
  'Bulk Carrier', 'Handy', 'Handymax', 'Supramax', 'Ultramax', 'Panamax',
  'Kamsarmax', 'Newcastlemax', 'Capesize', 'VLOC', 'Tanker', 'Aframax',
  'Suezmax', 'VLCC', 'Product Tanker', 'Chemical Tanker', 'Bitumen Tanker',
  'LPG Carrier', 'LNG Carrier', 'Container', 'Feeder', 'PCC', 'PCTC',
  'Heavy Lift', 'Multi Purpose (MPP)', 'Log Carrier', 'Cement Carrier',
  'Offshore Vessel', 'Other',
];

/** Cargo quantity units grouped by cargo family. */
export const QTY_UNIT_GROUPS: { group: string; units: string[] }[] = [
  { group: 'Dry Bulk', units: ['MT', 'WMT', 'DMT', 'LT', 'ST'] },
  { group: 'Steel Cargo', units: ['MT', 'Coils', 'Bundles', 'Pieces'] },
  { group: 'Breakbulk', units: ['Units', 'Pieces', 'Packages', 'Bundles', 'Crates', 'Cases', 'Pallets'] },
  { group: 'Project Cargo', units: ['Units', 'Pieces', 'Packages', 'MT'] },
  { group: 'Logs', units: ['CBM', 'CFT', 'MT'] },
  { group: 'Container', units: ['TEU', 'FEU', 'Container'] },
  { group: 'Liquid Cargo', units: ['MT', 'CBM', 'KL', 'BBL'] },
  { group: 'Chemical', units: ['MT', 'CBM', 'KL'] },
  { group: 'Gas', units: ['MT', 'CBM', 'm³'] },
  { group: 'General', units: ['Tons', 'Kg'] },
];

/** Flat list of every quantity unit (de-duplicated). */
export const QTY_UNIT_OPTIONS = Array.from(
  new Set(QTY_UNIT_GROUPS.flatMap((g) => g.units)),
);

/** Cargo freight rate units. */
export const FREIGHT_UNIT_OPTIONS = [
  'USD/MT', 'USD/LT', 'USD/ST', 'USD/WMT', 'USD/DMT', 'USD/CBM', 'USD/CFT',
  'USD/BBL', 'USD/KL', 'USD/TEU', 'USD/FEU', 'USD/Container', 'USD/Unit',
  'USD/Piece', 'USD/Package', 'Lump Sum',
];

/** Freight / loading terms. */
export const FREIGHT_TERMS_OPTIONS = [
  'FIO', 'FILO', 'LIFO', 'FIOS', 'FIOST', 'Gross Terms', 'Liner Terms',
  'Free In', 'Free Out', 'Hook/Hook', 'Custom',
];

/** Basis for brokerage / address commission. */
export const COMMISSION_BASIS_OPTIONS = ['%', 'USD/MT', 'Lump Sum'];

/** Basis for freight tax. */
export const FREIGHT_TAX_BASIS_OPTIONS = ['%', 'Lump Sum'];

/** Currencies (default USD). */
export const CURRENCY_OPTIONS = ['USD', 'EUR', 'GBP', 'SGD', 'AED', 'INR', 'JPY', 'CNY'];

/** Port rotation → Type. */
export const PORT_TYPE_OPTIONS = [
  'Delivery', 'Loading', 'Part Loading', 'Bunkering', 'Canal Transit',
  'Waiting', 'Anchorage', 'STS', 'Discharging', 'Part Discharging',
  'Dry Dock', 'Redelivery', 'Other',
];

export const DISTANCE_UNIT_OPTIONS = ['Nautical Miles', 'Kilometers'];
export const SPEED_UNIT_OPTIONS = ['Knots', 'Km/Hr'];

export const WEATHER_FACTOR_OPTIONS = [
  'None', 'Good Weather', 'Moderate', 'Heavy Weather', 'Ice Conditions', 'Seasonal Adjustment',
];

/** Loading / discharging rate units. */
export const RATE_UNIT_OPTIONS = [
  'MT/Day', 'MT/Hour', 'CBM/Day', 'CBM/Hour', 'TEU/Day', 'Units/Day', 'Pieces/Day',
];

export const RATE_BASIS_OPTIONS = ['Per Day', 'Per Hour'];

export const LAYTIME_TERMS_OPTIONS = [
  'SHINC', 'SHEX', 'SHEX EIU', 'SHEX UU', 'FHEX', 'FHINC', 'SATPM', 'SATSH',
  'WWD', 'WWD SHEX', 'Weather Working Days', 'Running Hours', 'Running Days',
  'Reversible', 'Non-Reversible', 'Custom',
];

/** Canals (multi-select). */
export const CANAL_OPTIONS = [
  'Suez Canal', 'Panama Canal', 'Kiel Canal', 'St. Lawrence Seaway',
  'Bosphorus', 'Dardanelles', 'Corinth Canal', 'Welland Canal', 'Other',
];

/** Bunker fuel grades. */
export const FUEL_GRADE_OPTIONS = [
  'VLSFO', 'HSFO', 'ULSFO', 'IFO380', 'IFO180', 'MGO', 'MDO', 'LSMGO',
  'LNG', 'LPG', 'Methanol', 'Biofuel', 'HFO', 'Custom',
];

export const CONSUMPTION_UNIT_OPTIONS = ['MT/Day', 'MT/Hour'];

/** Operation expense types. */
export const EXPENSE_TYPE_OPTIONS = [
  'Port Charges', 'Canal Charges', 'Agency', 'Towage', 'Pilotage',
  'Stevedoring', 'Lashing', 'Fresh Water', 'Garbage', 'Crew Change',
  'Survey', 'Bunker', 'Weather Routing', 'Communication', 'Miscellaneous', 'Other',
];

/** Result panel → Hire Basis. */
export const HIRE_BASIS_OPTIONS = ['Time Charter', 'Voyage Charter', 'COA', 'Bareboat', 'Spot Fixture'];

/** ECA / distance route options for the Port Rotation distance lookup. */
export const ECA_ROUTE_OPTIONS = [
  'Non-Bypass ECA Route', 'Normal Bypass ECA Route', 'Shortest ECA Route', 'Optimized ECA Route',
];

/** Default cargo quantity unit for a vessel type. */
export function defaultQtyUnitForVessel(vesselType: string): string {
  const t = vesselType.toLowerCase();
  if (t.includes('container') || t.includes('feeder')) return 'TEU';
  if (t.includes('log')) return 'CBM';
  if (t.includes('lng') || t.includes('lpg') || t.includes('gas')) return 'CBM';
  if (t.includes('chemical') || t.includes('bitumen')) return 'CBM';
  if (t.includes('tanker') || t.includes('vlcc') || t.includes('aframax') || t.includes('suezmax')) return 'MT';
  if (t.includes('heavy') || t.includes('mpp') || t.includes('multi') || t.includes('project')) return 'Units';
  return 'MT';
}

/** Default freight-rate unit derived from a quantity unit. */
export function defaultFreightUnit(qtyUnit: string): string {
  const match = FREIGHT_UNIT_OPTIONS.find((f) => f === `USD/${qtyUnit}`);
  return match ?? 'USD/MT';
}

/* ----------------------------------------------- admin-editable option store */

import { useSyncExternalStore } from 'react';

/** Every editable option category. */
export type EstOptionKey =
  | 'vesselTypes'
  | 'qtyUnits'
  | 'freightUnits'
  | 'freightTerms'
  | 'commissionBasis'
  | 'freightTaxBasis'
  | 'currencies'
  | 'portTypes'
  | 'distanceUnits'
  | 'speedUnits'
  | 'weatherFactors'
  | 'rateUnits'
  | 'rateBasis'
  | 'laytimeTerms'
  | 'canals'
  | 'fuelGrades'
  | 'consumptionUnits'
  | 'expenseTypes'
  | 'hireBasis'
  | 'ecaRoutes';

export type EstimationOptions = Record<EstOptionKey, string[]>;

/** Human labels for the Admin editor. */
export const EST_OPTION_LABELS: Record<EstOptionKey, string> = {
  vesselTypes: 'Vessel Types',
  qtyUnits: 'Cargo Quantity Units',
  freightUnits: 'Freight Units',
  freightTerms: 'Freight / Loading Terms',
  commissionBasis: 'Commission / Brokerage Basis',
  freightTaxBasis: 'Freight Tax Basis',
  currencies: 'Currencies',
  portTypes: 'Port Types',
  distanceUnits: 'Distance Units',
  speedUnits: 'Speed Units',
  weatherFactors: 'Weather Factors',
  rateUnits: 'Loading / Discharging Rate Units',
  rateBasis: 'Rate Basis',
  laytimeTerms: 'Laytime Terms',
  canals: 'Canals',
  fuelGrades: 'Fuel Grades',
  consumptionUnits: 'Consumption Units',
  expenseTypes: 'Expense Types',
  hireBasis: 'Hire Basis',
  ecaRoutes: 'ECA Route Options',
};

export const DEFAULT_ESTIMATION_OPTIONS: EstimationOptions = {
  vesselTypes: VESSEL_TYPE_OPTIONS,
  qtyUnits: QTY_UNIT_OPTIONS,
  freightUnits: FREIGHT_UNIT_OPTIONS,
  freightTerms: FREIGHT_TERMS_OPTIONS,
  commissionBasis: COMMISSION_BASIS_OPTIONS,
  freightTaxBasis: FREIGHT_TAX_BASIS_OPTIONS,
  currencies: CURRENCY_OPTIONS,
  portTypes: PORT_TYPE_OPTIONS,
  distanceUnits: DISTANCE_UNIT_OPTIONS,
  speedUnits: SPEED_UNIT_OPTIONS,
  weatherFactors: WEATHER_FACTOR_OPTIONS,
  rateUnits: RATE_UNIT_OPTIONS,
  rateBasis: RATE_BASIS_OPTIONS,
  laytimeTerms: LAYTIME_TERMS_OPTIONS,
  canals: CANAL_OPTIONS,
  fuelGrades: FUEL_GRADE_OPTIONS,
  consumptionUnits: CONSUMPTION_UNIT_OPTIONS,
  expenseTypes: EXPENSE_TYPE_OPTIONS,
  hireBasis: HIRE_BASIS_OPTIONS,
  ecaRoutes: ECA_ROUTE_OPTIONS,
};

const STORAGE_KEY = 'fv.estimationOptions';

function cloneDefaults(): EstimationOptions {
  return Object.fromEntries(
    Object.entries(DEFAULT_ESTIMATION_OPTIONS).map(([k, v]) => [k, [...v]]),
  ) as EstimationOptions;
}

let current: EstimationOptions = load();
const listeners = new Set<() => void>();

function load(): EstimationOptions {
  const base = cloneDefaults();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<EstimationOptions>;
    // Layer stored lists over defaults so newly-added categories still appear.
    for (const key of Object.keys(base) as EstOptionKey[]) {
      const v = parsed[key];
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) base[key] = v;
    }
  } catch {
    /* fall back to defaults */
  }
  return base;
}

export function getEstimationOptions(): EstimationOptions {
  return current;
}

export function saveEstimationOptions(next: EstimationOptions): void {
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — ignore */
  }
  listeners.forEach((l) => l());
}

export function setEstimationOptionList(key: EstOptionKey, values: string[]): void {
  saveEstimationOptions({ ...current, [key]: values });
}

export function resetEstimationOptions(): EstimationOptions {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  current = cloneDefaults();
  listeners.forEach((l) => l());
  return current;
}

export function useEstimationOptions(): EstimationOptions {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    getEstimationOptions,
    getEstimationOptions,
  );
}

