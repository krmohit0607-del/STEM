import { useSyncExternalStore } from 'react';

/**
 * Cargo Master — simple, admin-maintained reference database of cargoes
 * handled by ODAS (basic properties for chartering, voyage creation, cargo
 * nomination, intake estimation, stowage and operational planning only).
 *
 * This is a REFERENCE list, not a substitute for the applicable cargo
 * declaration / SDS / IMSBC schedule / IMDG documentation / IBC requirements,
 * charter party or vessel-specific loading instructions.
 */

export const CARGO_CATEGORIES = [
  'Dry Bulk',
  'Liquid Bulk',
  'Gas',
  'Breakbulk',
  'Container',
  'Ro-Ro',
  'Reefer',
  'Project Cargo',
  'Livestock',
  'General Cargo',
] as const;
export type CargoCategory = (typeof CARGO_CATEGORIES)[number];

export const CARGO_VESSEL_TYPES = [
  'Bulk Carrier',
  'Ore Carrier',
  'Tanker',
  'Chemical Tanker',
  'Product Tanker',
  'LNG Carrier',
  'LPG Carrier',
  'Container Vessel',
  'Ro-Ro',
  'Reefer',
  'Multipurpose',
  'Heavy Lift',
  'Livestock Carrier',
] as const;

export const CARGO_TEMPERATURE_TYPES = ['Ambient', 'Heated', 'Cooled', 'Controlled'] as const;

export const CARGO_LOADING_METHODS = [
  'Grab',
  'Conveyor',
  'Pump',
  'Pipeline',
  'Crane',
  'Forklift',
  'Ro-Ro Ramp',
  'Manual',
  'Other',
] as const;

export const CARGO_STATUSES = ['Active', 'Inactive'] as const;
export type CargoStatus = (typeof CARGO_STATUSES)[number];

/** A single Cargo Master record. Numeric fields are stored as strings (raw
 * numbers, no units) so the UI can render them as number-only inputs with the
 * unit shown in the label, per the app-wide fixed-unit-input convention. */
export interface CargoRecord {
  cargoId: string;
  cargoCode: string;
  cargoName: string;
  category: CargoCategory | '';
  subCategory: string;
  description: string;

  unNumber: string;
  imoClassification: string;
  imsbcGroup: string;
  ibcClassification: string;
  igcClassification: string;

  densityMin: string;
  densityMax: string;
  densityUnit: string;

  stowageFactorMin: string;
  stowageFactorMax: string;
  stowageFactorUnit: string;

  particleSize: string;
  angleOfRepose: string;

  pieceWeight: string;
  length: string;
  width: string;
  height: string;

  temperatureType: (typeof CARGO_TEMPERATURE_TYPES)[number] | '';
  minTemperature: string;
  maxTemperature: string;
  loadingTemperature: string;
  carriageTemperature: string;
  dischargeTemperature: string;
  heatingRequired: boolean;
  coolingRequired: boolean;
  flashPoint: string;

  dangerousCargo: boolean;
  marinePollutant: boolean;
  liquefactionRisk: boolean;
  moistureSensitive: boolean;

  vesselTypes: string[];

  typicalParcelSize: string;
  minimumParcelSize: string;
  maximumParcelSize: string;

  loadingMethod: string;
  dischargeMethod: string;
  typicalLoadingRate: string;
  typicalDischargeRate: string;

  lashingRequired: boolean;
  deckRequirement: string;
  tankType: string;

  // Category-specific extras (Gas / Container / Livestock / Project Cargo).
  boilingPoint: string;
  containerType: string;
  reeferRequired: boolean;
  animalType: string;
  ventilationRequirement: string;
  typicalWeight: string;
  liftingRequirement: string;

  cargoNotes: string;
  status: CargoStatus;

  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export const CARGO_CSV_HEADERS: (keyof CargoRecord)[] = [
  'cargoCode',
  'cargoName',
  'category',
  'subCategory',
  'description',
  'unNumber',
  'imoClassification',
  'imsbcGroup',
  'ibcClassification',
  'igcClassification',
  'densityMin',
  'densityMax',
  'densityUnit',
  'stowageFactorMin',
  'stowageFactorMax',
  'stowageFactorUnit',
  'particleSize',
  'angleOfRepose',
  'pieceWeight',
  'length',
  'width',
  'height',
  'temperatureType',
  'minTemperature',
  'maxTemperature',
  'loadingTemperature',
  'carriageTemperature',
  'dischargeTemperature',
  'heatingRequired',
  'coolingRequired',
  'flashPoint',
  'dangerousCargo',
  'marinePollutant',
  'liquefactionRisk',
  'moistureSensitive',
  'vesselTypes',
  'typicalParcelSize',
  'minimumParcelSize',
  'maximumParcelSize',
  'loadingMethod',
  'dischargeMethod',
  'typicalLoadingRate',
  'typicalDischargeRate',
  'lashingRequired',
  'deckRequirement',
  'tankType',
  'cargoNotes',
  'status',
];

function nowStamp(): string {
  const d = new Date();
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())} ${mon} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function newCargoId(): string {
  return `CRG-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Blank, fully-editable record for the "Add Cargo" form. */
export function emptyCargoRecord(): CargoRecord {
  return {
    cargoId: '',
    cargoCode: '',
    cargoName: '',
    category: '',
    subCategory: '',
    description: '',
    unNumber: '',
    imoClassification: '',
    imsbcGroup: '',
    ibcClassification: '',
    igcClassification: '',
    densityMin: '',
    densityMax: '',
    densityUnit: 'MT/m³',
    stowageFactorMin: '',
    stowageFactorMax: '',
    stowageFactorUnit: 'm³/MT',
    particleSize: '',
    angleOfRepose: '',
    pieceWeight: '',
    length: '',
    width: '',
    height: '',
    temperatureType: '',
    minTemperature: '',
    maxTemperature: '',
    loadingTemperature: '',
    carriageTemperature: '',
    dischargeTemperature: '',
    heatingRequired: false,
    coolingRequired: false,
    flashPoint: '',
    dangerousCargo: false,
    marinePollutant: false,
    liquefactionRisk: false,
    moistureSensitive: false,
    vesselTypes: [],
    typicalParcelSize: '',
    minimumParcelSize: '',
    maximumParcelSize: '',
    loadingMethod: '',
    dischargeMethod: '',
    typicalLoadingRate: '',
    typicalDischargeRate: '',
    lashingRequired: false,
    deckRequirement: '',
    tankType: '',
    boilingPoint: '',
    containerType: '',
    reeferRequired: false,
    animalType: '',
    ventilationRequirement: '',
    typicalWeight: '',
    liftingRequirement: '',
    cargoNotes: '',
    status: 'Active',
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
  };
}

/* --------------------------------------------------------- seed generation */

/** Minimal per-item seed input: only the name/category/notes are asserted —
 * every technical property is left blank unless explicitly given, per the
 * "do not fabricate maritime technical data" rule. */
interface SeedInput {
  name: string;
  category: CargoCategory;
  subCategory?: string;
  vesselTypes?: string[];
  dangerous?: boolean;
}

const HAZARD_NAMES = new Set([
  'Sulphuric Acid',
  'Phosphoric Acid',
  'Caustic Soda',
  'Methanol',
  'Ethanol',
  'Benzene',
  'Toluene',
  'Xylene',
  'Ammonium Nitrate',
  'Crude Oil',
  'Fuel Oil',
  'Heavy Fuel Oil',
  'Marine Fuel Oil',
  'Gas Oil',
  'Marine Gas Oil',
  'Diesel',
  'Automotive Diesel',
  'Gasoline',
  'Naphtha',
  'Jet Fuel',
  'Kerosene',
  'Lithium Batteries',
  'Dangerous Goods',
  'LNG',
  'LPG',
  'Propane',
  'Butane',
  'Ammonia',
  'Ethylene',
  'Propylene',
  'Butadiene',
  'Vinyl Chloride',
  'Sulphur',
]);

function seedCode(name: string, used: Set<string>): string {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 3)
    .join('-');
  let code = base || 'CARGO';
  let n = 2;
  while (used.has(code)) {
    code = `${base}-${n}`;
    n += 1;
  }
  used.add(code);
  return code;
}

/**
 * Reference data for well-documented cargoes, drawn from the IMSBC Code
 * (dry bulk — Individual Schedules: Group A/B/C, stowage factor and angle of
 * repose ranges), the International Grain Code (grain cargoes), and general
 * physical-chemistry references (density/flash point/boiling point ranges
 * for liquid and gas cargoes). Values are stored as published RANGES (never
 * a single invented figure) and every entry carries a "verify" cargoNotes
 * reminder — this table is a starting reference, not a substitute for the
 * current IMSBC/IMDG/IBC/IGC schedule or the cargo's actual declaration/SDS.
 * Cargoes not listed here are intentionally left blank (no reliable published
 * generic value, or the value varies too much by grade/supplier to state).
 */
const REFERENCE_OVERRIDES: Record<string, Partial<CargoRecord> & { verifyNote?: string }> = {
  // --- Dry Bulk — IMSBC Code individual schedules -----------------------
  'Iron Ore': { imsbcGroup: 'Group C', stowageFactorMin: '0.35', stowageFactorMax: '0.40', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group C (not liable to liquefy) for typical lump/sinter ore — some fine ore grades are Group A.' },
  'Iron Ore Fines': { imsbcGroup: 'Group A', liquefactionRisk: true, moistureSensitive: true, stowageFactorMin: '0.38', stowageFactorMax: '0.45', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group A (liable to liquefy) — TML/FMP certificates required before loading.' },
  'Pellet Feed': { imsbcGroup: 'Group A', liquefactionRisk: true, moistureSensitive: true, verifyNote: 'Typically shipped as IMSBC Group A (liable to liquefy) — TML/FMP certificates required.' },
  'Iron Ore Pellets': { imsbcGroup: 'Group C', stowageFactorMin: '0.45', stowageFactorMax: '0.53', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group C (not liable to liquefy).' },
  'Bauxite': { imsbcGroup: 'Group C', stowageFactorMin: '0.62', stowageFactorMax: '0.85', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group C for most grades — confirm grade against the current schedule.' },
  'Bauxite Fines': { imsbcGroup: 'Group A', liquefactionRisk: true, moistureSensitive: true, verifyNote: 'IMSBC Group A (liable to liquefy) — TML/FMP certificates required.' },
  'Coal': { imsbcGroup: 'Group B', stowageFactorMin: '1.20', stowageFactorMax: '1.50', stowageFactorUnit: 'm³/MT', angleOfRepose: '35', verifyNote: 'IMSBC Group B (may liquefy AND has chemical hazards — self-heating, methane emission). Some coals are dual A/B — confirm per schedule.' },
  'Thermal Coal': { imsbcGroup: 'Group B', stowageFactorMin: '1.25', stowageFactorMax: '1.55', stowageFactorUnit: 'm³/MT', angleOfRepose: '35', verifyNote: 'IMSBC Group B — self-heating / methane emission risk.' },
  'Coking Coal': { imsbcGroup: 'Group B', stowageFactorMin: '1.20', stowageFactorMax: '1.45', stowageFactorUnit: 'm³/MT', angleOfRepose: '35', verifyNote: 'IMSBC Group B — self-heating / methane emission risk.' },
  'Steam Coal': { imsbcGroup: 'Group B', stowageFactorMin: '1.25', stowageFactorMax: '1.55', stowageFactorUnit: 'm³/MT', angleOfRepose: '35', verifyNote: 'IMSBC Group B — self-heating / methane emission risk.' },
  'Petroleum Coke': { imsbcGroup: 'Group B', stowageFactorMin: '0.99', stowageFactorMax: '1.33', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group B (calcined petroleum coke — self-heating risk).' },
  'Metallurgical Coke': { imsbcGroup: 'Group B', stowageFactorMin: '1.40', stowageFactorMax: '2.00', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group B — self-heating risk.' },
  'Nickel Ore': { imsbcGroup: 'Group A', liquefactionRisk: true, moistureSensitive: true, stowageFactorMin: '0.55', stowageFactorMax: '0.65', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group A (well-documented liquefaction hazard) — TML/FMP certificates required before loading.' },
  'Manganese Ore': { imsbcGroup: 'Group A', liquefactionRisk: true, moistureSensitive: true, verifyNote: 'Fine manganese ore is IMSBC Group A (liable to liquefy) — TML/FMP certificates required. Lump ore may be Group C — confirm grade.' },
  'Chromite Ore': { imsbcGroup: 'Group A', liquefactionRisk: true, moistureSensitive: true, verifyNote: 'Fine chromite ore/sand is IMSBC Group A (liable to liquefy) — confirm grade against schedule.' },
  'Copper Concentrate': { imsbcGroup: 'Group A', liquefactionRisk: true, moistureSensitive: true, stowageFactorMin: '0.36', stowageFactorMax: '0.44', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group A (well-documented liquefaction hazard) — TML/FMP certificates required before loading.' },
  'Zinc Concentrate': { imsbcGroup: 'Group A', liquefactionRisk: true, moistureSensitive: true, stowageFactorMin: '0.35', stowageFactorMax: '0.45', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group A (liable to liquefy) — TML/FMP certificates required.' },
  'Lead Concentrate': { imsbcGroup: 'Group A', liquefactionRisk: true, moistureSensitive: true, stowageFactorMin: '0.31', stowageFactorMax: '0.37', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group A (liable to liquefy) — TML/FMP certificates required.' },
  'Alumina': { imsbcGroup: 'Group C', stowageFactorMin: '0.67', stowageFactorMax: '0.99', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group C (calcined alumina).' },
  'Limestone': { imsbcGroup: 'Group C', stowageFactorMin: '0.42', stowageFactorMax: '0.55', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group C.' },
  'Dolomite': { imsbcGroup: 'Group C', stowageFactorMin: '0.42', stowageFactorMax: '0.55', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group C.' },
  'Gypsum': { imsbcGroup: 'Group C', stowageFactorMin: '0.60', stowageFactorMax: '0.75', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group C.' },
  'Cement': { imsbcGroup: 'Group C', stowageFactorMin: '0.68', stowageFactorMax: '0.92', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group C.' },
  'Cement Clinker': { imsbcGroup: 'Group C', stowageFactorMin: '0.40', stowageFactorMax: '0.45', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group C.' },
  'Salt': { imsbcGroup: 'Group C', stowageFactorMin: '0.80', stowageFactorMax: '1.06', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group C.' },
  'Sulphur': { imsbcGroup: 'Group B', stowageFactorMin: '0.74', stowageFactorMax: '0.99', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group B (Sulphur, lumps/crushed/formed/pastilles — flammable/self-heating risk per form). Confirm exact schedule entry for the shipped form.' },
  'Soda Ash': { imsbcGroup: 'Group C', stowageFactorMin: '0.66', stowageFactorMax: '0.94', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group C.' },
  'Urea': { imsbcGroup: 'Group C', stowageFactorMin: '0.87', stowageFactorMax: '1.27', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group C (Urea, prilled/granular — non-hazardous). Fertilizer blends may differ — confirm grade.' },
  'Potash': { imsbcGroup: 'Group C', stowageFactorMin: '0.70', stowageFactorMax: '0.95', stowageFactorUnit: 'm³/MT', verifyNote: 'IMSBC Group C.' },
  'DAP Fertilizer': { imsbcGroup: 'Group C', stowageFactorMin: '0.60', stowageFactorMax: '0.70', stowageFactorUnit: 'm³/MT', verifyNote: 'Diammonium phosphate — IMSBC Group C for most grades. Confirm against schedule.' },
  'MAP Fertilizer': { imsbcGroup: 'Group C', stowageFactorMin: '0.60', stowageFactorMax: '0.70', stowageFactorUnit: 'm³/MT', verifyNote: 'Monoammonium phosphate — IMSBC Group C for most grades. Confirm against schedule.' },
  'Ammonium Nitrate': { verifyNote: 'IMSBC schedule and UN/class entry depend heavily on composition/grade (fertilizer vs. technical grade) — always verify the specific product against the current IMSBC Code and IMDG entries before shipment.' },
  'Phosphate Rock': { verifyNote: 'IMSBC lists both Group A (uncalcined, fine) and Group C (calcined/coarse) phosphate entries — confirm the exact grade against the current schedule before loading.' },
  'Wood Pellets': { imsbcGroup: 'Group B', stowageFactorMin: '1.50', stowageFactorMax: '2.00', stowageFactorUnit: 'm³/MT', moistureSensitive: true, verifyNote: 'IMSBC Group B (self-heating, off-gassing risk — oxygen depletion/CO in enclosed spaces).' },
  'Wood Chips': { imsbcGroup: 'Group B', stowageFactorMin: '2.50', stowageFactorMax: '3.50', stowageFactorUnit: 'm³/MT', moistureSensitive: true, verifyNote: 'IMSBC Group B (self-heating, off-gassing/oxygen depletion risk).' },

  // --- Grain / Agricultural bulk — International Grain Code -------------
  'Wheat': { stowageFactorMin: '1.25', stowageFactorMax: '1.40', stowageFactorUnit: 'm³/MT', angleOfRepose: '27', verifyNote: 'Carried under the International Grain Code — confirm document of authorization / grain loading stability booklet.' },
  'Corn': { stowageFactorMin: '1.25', stowageFactorMax: '1.35', stowageFactorUnit: 'm³/MT', angleOfRepose: '27', verifyNote: 'Carried under the International Grain Code — confirm document of authorization.' },
  'Maize': { stowageFactorMin: '1.25', stowageFactorMax: '1.35', stowageFactorUnit: 'm³/MT', angleOfRepose: '27', verifyNote: 'Carried under the International Grain Code — confirm document of authorization.' },
  'Barley': { stowageFactorMin: '1.35', stowageFactorMax: '1.55', stowageFactorUnit: 'm³/MT', angleOfRepose: '28', verifyNote: 'Carried under the International Grain Code — confirm document of authorization.' },
  'Sorghum': { stowageFactorMin: '1.25', stowageFactorMax: '1.35', stowageFactorUnit: 'm³/MT', verifyNote: 'Carried under the International Grain Code — confirm document of authorization.' },
  'Rice': { stowageFactorMin: '1.40', stowageFactorMax: '1.60', stowageFactorUnit: 'm³/MT', verifyNote: 'Carried under the International Grain Code (bulk) — confirm document of authorization.' },
  'Soybeans': { stowageFactorMin: '1.30', stowageFactorMax: '1.35', stowageFactorUnit: 'm³/MT', angleOfRepose: '29', verifyNote: 'Carried under the International Grain Code — confirm document of authorization.' },
  'Rapeseed': { stowageFactorMin: '1.30', stowageFactorMax: '1.40', stowageFactorUnit: 'm³/MT', verifyNote: 'Carried under the International Grain Code — confirm document of authorization.' },
  'Canola': { stowageFactorMin: '1.30', stowageFactorMax: '1.40', stowageFactorUnit: 'm³/MT', verifyNote: 'Carried under the International Grain Code — confirm document of authorization.' },
  'Sunflower Seeds': { stowageFactorMin: '1.85', stowageFactorMax: '2.30', stowageFactorUnit: 'm³/MT', verifyNote: 'Carried under the International Grain Code — confirm document of authorization.' },
  'Oats': { stowageFactorMin: '1.85', stowageFactorMax: '2.20', stowageFactorUnit: 'm³/MT', verifyNote: 'Carried under the International Grain Code — confirm document of authorization.' },
  'Rye': { stowageFactorMin: '1.35', stowageFactorMax: '1.45', stowageFactorUnit: 'm³/MT', verifyNote: 'Carried under the International Grain Code — confirm document of authorization.' },
  'Peas': { stowageFactorMin: '1.25', stowageFactorMax: '1.35', stowageFactorUnit: 'm³/MT', verifyNote: 'Carried under the International Grain Code — confirm document of authorization.' },
  'Lentils': { stowageFactorMin: '1.20', stowageFactorMax: '1.35', stowageFactorUnit: 'm³/MT', verifyNote: 'Carried under the International Grain Code — confirm document of authorization.' },
  'Sugar': { imsbcGroup: 'Group C', stowageFactorMin: '0.66', stowageFactorMax: '0.76', stowageFactorUnit: 'm³/MT', moistureSensitive: true, verifyNote: 'IMSBC Group C (raw sugar).' },
  'Coffee Beans': { stowageFactorMin: '1.70', stowageFactorMax: '2.00', stowageFactorUnit: 'm³/MT', moistureSensitive: true, verifyNote: 'Typically shipped bagged/in containers — bulk stowage factor is indicative only.' },
  'Cocoa Beans': { stowageFactorMin: '1.60', stowageFactorMax: '1.90', stowageFactorUnit: 'm³/MT', moistureSensitive: true, verifyNote: 'Typically shipped bagged/in containers — bulk stowage factor is indicative only.' },

  // --- Liquid Bulk — typical published density / flash point ranges -----
  'Crude Oil': { densityMin: '0.80', densityMax: '0.99', flashPoint: 'Varies (often < 60°C)', verifyNote: 'Density and flash point vary widely by field/grade — always use the actual certificate of quality / MSDS.' },
  'Fuel Oil': { densityMin: '0.90', densityMax: '0.99', flashPoint: '> 60°C (typical)', verifyNote: 'Grade-dependent — confirm against certificate of quality.' },
  'Heavy Fuel Oil': { densityMin: '0.94', densityMax: '0.99', flashPoint: '> 60°C (typical)', verifyNote: 'Grade-dependent — confirm against certificate of quality.' },
  'Marine Fuel Oil': { densityMin: '0.91', densityMax: '0.99', flashPoint: '> 60°C (typical)', verifyNote: 'Grade-dependent (VLSFO/HSFO) — confirm against certificate of quality.' },
  'Gas Oil': { densityMin: '0.82', densityMax: '0.88', flashPoint: '> 60°C (typical)', verifyNote: 'Confirm against certificate of quality.' },
  'Marine Gas Oil': { densityMin: '0.82', densityMax: '0.88', flashPoint: '> 60°C (typical)', verifyNote: 'Confirm against certificate of quality.' },
  'Diesel': { densityMin: '0.82', densityMax: '0.87', flashPoint: '55–65°C (typical)', verifyNote: 'Confirm against certificate of quality.' },
  'Automotive Diesel': { densityMin: '0.82', densityMax: '0.87', flashPoint: '55–65°C (typical)', verifyNote: 'Confirm against certificate of quality.' },
  'Gasoline': { densityMin: '0.72', densityMax: '0.78', flashPoint: '< 21°C', imoClassification: 'Class 3', verifyNote: 'Confirm packing group against certificate of quality / MSDS.' },
  'Naphtha': { densityMin: '0.65', densityMax: '0.75', flashPoint: '< 21°C (typical)', imoClassification: 'Class 3', verifyNote: 'Confirm packing group against certificate of quality / MSDS.' },
  'Jet Fuel': { densityMin: '0.78', densityMax: '0.84', flashPoint: '38–66°C (typical)', imoClassification: 'Class 3', verifyNote: 'Confirm packing group against certificate of quality / MSDS.' },
  'Kerosene': { densityMin: '0.78', densityMax: '0.82', flashPoint: '38–72°C (typical)', imoClassification: 'Class 3', verifyNote: 'Confirm packing group against certificate of quality / MSDS.' },
  'Lubricating Oil': { densityMin: '0.86', densityMax: '0.95', flashPoint: '> 60°C (typical)', verifyNote: 'Confirm against certificate of quality.' },
  'Base Oil': { densityMin: '0.85', densityMax: '0.92', flashPoint: '> 60°C (typical)', verifyNote: 'Confirm against certificate of quality.' },
  'Bitumen': { densityMin: '1.00', densityMax: '1.05', temperatureType: 'Heated', minTemperature: '140', maxTemperature: '180', verifyNote: 'Carriage temperature varies by grade — confirm against certificate of quality / loading instructions.' },
  'Palm Oil': { densityMin: '0.89', densityMax: '0.92', temperatureType: 'Heated', minTemperature: '30', maxTemperature: '35', verifyNote: 'Carriage temperature varies by product (olein/stearin) — confirm against certificate of quality.' },
  'Palm Olein': { densityMin: '0.89', densityMax: '0.91', temperatureType: 'Heated', minTemperature: '25', maxTemperature: '30', verifyNote: 'Confirm against certificate of quality.' },
  'Palm Stearin': { densityMin: '0.86', densityMax: '0.89', temperatureType: 'Heated', minTemperature: '50', maxTemperature: '55', verifyNote: 'Confirm against certificate of quality.' },
  'Soybean Oil': { densityMin: '0.91', densityMax: '0.93', verifyNote: 'Confirm against certificate of quality.' },
  'Sunflower Oil': { densityMin: '0.91', densityMax: '0.93', verifyNote: 'Confirm against certificate of quality.' },
  'Rapeseed Oil': { densityMin: '0.91', densityMax: '0.92', verifyNote: 'Confirm against certificate of quality.' },
  'Coconut Oil': { densityMin: '0.91', densityMax: '0.92', temperatureType: 'Heated', minTemperature: '28', maxTemperature: '32', verifyNote: 'Solidifies below ~24°C — confirm carriage temperature against certificate of quality.' },
  'Corn Oil': { densityMin: '0.91', densityMax: '0.92', verifyNote: 'Confirm against certificate of quality.' },
  'Fish Oil': { densityMin: '0.90', densityMax: '0.93', verifyNote: 'Confirm against certificate of quality.' },
  'Molasses': { densityMin: '1.35', densityMax: '1.45', verifyNote: 'Confirm against certificate of quality.' },
  'Methanol': { densityMin: '0.79', densityMax: '0.80', flashPoint: '11–12°C', imoClassification: 'Class 3', verifyNote: 'Confirm packing group against MSDS.' },
  'Ethanol': { densityMin: '0.78', densityMax: '0.79', flashPoint: '13–17°C', imoClassification: 'Class 3', verifyNote: 'Confirm packing group against MSDS.' },
  'Benzene': { densityMin: '0.87', densityMax: '0.88', flashPoint: '−11°C', imoClassification: 'Class 3', verifyNote: 'Confirm packing group against MSDS.' },
  'Toluene': { densityMin: '0.86', densityMax: '0.87', flashPoint: '4°C', imoClassification: 'Class 3', verifyNote: 'Confirm packing group against MSDS.' },
  'Xylene': { densityMin: '0.86', densityMax: '0.88', flashPoint: '25–32°C', imoClassification: 'Class 3', verifyNote: 'Confirm packing group against MSDS.' },
  'Sulphuric Acid': { densityMin: '1.79', densityMax: '1.84', imoClassification: 'Class 8', verifyNote: 'Confirm concentration/packing group against MSDS; carried per IBC Code chapter 17.' },
  'Phosphoric Acid': { densityMin: '1.60', densityMax: '1.75', verifyNote: 'Confirm concentration and IBC/IMDG applicability against MSDS.' },
  'Caustic Soda': { densityMin: '1.40', densityMax: '1.53', temperatureType: 'Heated', minTemperature: '20', maxTemperature: '60', imoClassification: 'Class 8', verifyNote: 'Solution strength affects density/carriage temperature — confirm against MSDS; carried per IBC Code.' },

  // --- Gas — physical constants (IGC Code cargoes) -----------------------
  'LNG': { boilingPoint: '-162', imoClassification: 'Class 2.1', tankType: 'Membrane / Moss (IGC Code)', verifyNote: 'Carried per IGC Code — confirm cargo containment/tank type for the specific vessel.' },
  'LPG': { boilingPoint: '-42 to 0', imoClassification: 'Class 2.1', tankType: 'Pressurised / Semi-refrigerated / Fully refrigerated (IGC Code)', verifyNote: 'Boiling point depends on propane/butane mix — confirm against certificate of quality; carried per IGC Code.' },
  'Propane': { boilingPoint: '-42', imoClassification: 'Class 2.1', tankType: 'Pressurised / Semi-refrigerated / Fully refrigerated (IGC Code)' },
  'Butane': { boilingPoint: '-0.5', imoClassification: 'Class 2.1', tankType: 'Pressurised / Semi-refrigerated (IGC Code)' },
  'Ammonia': { boilingPoint: '-33', imoClassification: 'Class 2.3', tankType: 'Semi-refrigerated / Fully refrigerated (IGC Code)', verifyNote: 'Toxic + corrosive — confirm cargo containment and PPE requirements against IGC Code.' },
  'Ethylene': { boilingPoint: '-104', imoClassification: 'Class 2.1', tankType: 'Fully refrigerated (IGC Code)' },
  'Propylene': { boilingPoint: '-47', imoClassification: 'Class 2.1', tankType: 'Pressurised / Semi-refrigerated (IGC Code)' },
  'Butadiene': { boilingPoint: '-4', imoClassification: 'Class 2.1', tankType: 'Pressurised / Semi-refrigerated (IGC Code)', verifyNote: 'Requires inhibitor / oxygen exclusion — confirm handling requirements against IGC Code.' },
  'Vinyl Chloride': { boilingPoint: '-13', imoClassification: 'Class 2.1', tankType: 'Pressurised / Semi-refrigerated (IGC Code)', verifyNote: 'Requires inhibitor — confirm handling requirements against IGC Code.' },
};

function mk(input: SeedInput, used: Set<string>): CargoRecord {
  const rec = emptyCargoRecord();
  const dangerous = input.dangerous ?? HAZARD_NAMES.has(input.name);
  rec.cargoId = newCargoId();
  rec.cargoCode = seedCode(input.name, used);
  rec.cargoName = input.name;
  rec.category = input.category;
  rec.subCategory = input.subCategory ?? '';
  rec.vesselTypes = input.vesselTypes ?? [];
  rec.dangerousCargo = dangerous;
  if (dangerous) {
    // Regulated properties need verification against the applicable IMDG /
    // IMSBC / IBC / IGC schedule before use — never fabricate these.
    rec.unNumber = 'Verify';
    rec.imoClassification = 'Verify';
  }

  const { verifyNote, ...overrides } = REFERENCE_OVERRIDES[input.name] ?? {};
  Object.assign(rec, overrides);
  if (verifyNote) {
    rec.cargoNotes = rec.cargoNotes ? `${rec.cargoNotes} ${verifyNote}` : verifyNote;
  }

  rec.status = 'Active';
  rec.createdAt = nowStamp();
  rec.createdBy = 'System (seed)';
  rec.updatedAt = rec.createdAt;
  rec.updatedBy = rec.createdBy;
  return rec;
}

const DRY_BULK = [
  'Iron Ore', 'Iron Ore Fines', 'Pellet Feed', 'Iron Ore Pellets', 'Bauxite', 'Bauxite Fines',
  'Coal', 'Thermal Coal', 'Coking Coal', 'Steam Coal', 'Petroleum Coke', 'Metallurgical Coke',
  'Nickel Ore', 'Manganese Ore', 'Chromite Ore', 'Copper Concentrate', 'Zinc Concentrate',
  'Lead Concentrate', 'Alumina', 'Limestone', 'Dolomite', 'Gypsum', 'Cement', 'Cement Clinker',
  'Salt', 'Sulphur', 'Soda Ash', 'Fertilizer', 'Urea', 'Potash', 'DAP Fertilizer', 'MAP Fertilizer',
  'Ammonium Nitrate', 'Phosphate Rock', 'Wood Pellets', 'Wood Chips',
];

const GRAIN_AGRI = [
  'Wheat', 'Corn', 'Maize', 'Barley', 'Sorghum', 'Rice', 'Soybeans', 'Rapeseed', 'Canola',
  'Sunflower Seeds', 'Oats', 'Rye', 'Peas', 'Lentils', 'Sugar', 'Coffee Beans', 'Cocoa Beans',
];

const LIQUID_BULK = [
  'Crude Oil', 'Fuel Oil', 'Heavy Fuel Oil', 'Marine Fuel Oil', 'Gas Oil', 'Marine Gas Oil',
  'Diesel', 'Automotive Diesel', 'Gasoline', 'Naphtha', 'Jet Fuel', 'Kerosene', 'Lubricating Oil',
  'Base Oil', 'Bitumen', 'Palm Oil', 'Palm Olein', 'Palm Stearin', 'Soybean Oil', 'Sunflower Oil',
  'Rapeseed Oil', 'Coconut Oil', 'Corn Oil', 'Fish Oil', 'Molasses', 'Methanol', 'Ethanol',
  'Benzene', 'Toluene', 'Xylene', 'Sulphuric Acid', 'Phosphoric Acid', 'Caustic Soda',
];

const GAS = ['LNG', 'LPG', 'Propane', 'Butane', 'Ammonia', 'Ethylene', 'Propylene', 'Butadiene', 'Vinyl Chloride'];

const BREAKBULK = [
  'Steel Coils', 'Steel Plates', 'Steel Sheets', 'Steel Billets', 'Steel Slabs', 'Steel Pipes',
  'Steel Tubes', 'Rebar', 'Wire Rod', 'Steel Rails', 'Aluminium Ingots', 'Copper Cathodes',
  'Zinc Ingots', 'Lead Ingots', 'Paper Rolls', 'Pulp Bales', 'Cotton Bales', 'Timber', 'Lumber',
  'Logs', 'Plywood', 'Veneer', 'MDF', 'Rubber', 'Bagged Cement', 'Bagged Fertilizer',
  'Bagged Rice', 'Bagged Sugar',
];

const PROJECT_CARGO = [
  'Transformers', 'Generators', 'Boilers', 'Reactors', 'Pressure Vessels', 'Wind Turbine Blades',
  'Wind Turbine Nacelles', 'Wind Turbine Towers', 'Heavy Machinery', 'Excavators', 'Bulldozers',
  'Mining Equipment', 'Cranes', 'Locomotives', 'Rail Wagons', 'Yachts', 'Aircraft', 'Offshore Modules',
];

const RO_RO = [
  'Passenger Cars', 'SUV', 'Trucks', 'Buses', 'Trailers', 'Tractors', 'Excavators', 'Bulldozers',
  'Agricultural Machinery', 'Construction Machinery', 'Mining Machinery',
];

const REEFER = [
  'Frozen Beef', 'Frozen Pork', 'Frozen Poultry', 'Frozen Fish', 'Frozen Seafood', 'Fresh Fish',
  'Bananas', 'Apples', 'Oranges', 'Grapes', 'Pears', 'Avocados', 'Potatoes', 'Onions', 'Dairy Products',
];

const CONTAINER = [
  'General Cargo', 'Electronics', 'Furniture', 'Textiles', 'Clothing', 'Machinery',
  'Automotive Parts', 'Consumer Goods', 'Food Products', 'Pharmaceuticals', 'Dangerous Goods',
  'Lithium Batteries',
];

const LIVESTOCK = ['Cattle', 'Sheep', 'Goats', 'Horses', 'Poultry'];

function buildSeed(): CargoRecord[] {
  const used = new Set<string>();
  const out: CargoRecord[] = [];
  DRY_BULK.forEach((n) => out.push(mk({ name: n, category: 'Dry Bulk', vesselTypes: ['Bulk Carrier'] }, used)));
  GRAIN_AGRI.forEach((n) =>
    out.push(mk({ name: n, category: 'Dry Bulk', subCategory: 'Grain / Agricultural', vesselTypes: ['Bulk Carrier'] }, used)),
  );
  LIQUID_BULK.forEach((n) =>
    out.push(
      mk(
        {
          name: n,
          category: 'Liquid Bulk',
          vesselTypes: ['Sulphuric Acid', 'Phosphoric Acid', 'Caustic Soda', 'Methanol', 'Ethanol', 'Benzene', 'Toluene', 'Xylene'].includes(n)
            ? ['Chemical Tanker']
            : ['Tanker'],
        },
        used,
      ),
    ),
  );
  GAS.forEach((n) => out.push(mk({ name: n, category: 'Gas', vesselTypes: n === 'LNG' ? ['LNG Carrier'] : ['LPG Carrier'] }, used)));
  BREAKBULK.forEach((n) => out.push(mk({ name: n, category: 'Breakbulk', vesselTypes: ['Multipurpose'] }, used)));
  PROJECT_CARGO.forEach((n) => out.push(mk({ name: n, category: 'Project Cargo', vesselTypes: ['Heavy Lift', 'Multipurpose'] }, used)));
  RO_RO.forEach((n) => out.push(mk({ name: n, category: 'Ro-Ro', vesselTypes: ['Ro-Ro'] }, used)));
  REEFER.forEach((n) => out.push(mk({ name: n, category: 'Reefer', vesselTypes: ['Reefer'] }, used)));
  CONTAINER.forEach((n) => out.push(mk({ name: n, category: 'Container', vesselTypes: ['Container Vessel'] }, used)));
  LIVESTOCK.forEach((n) => out.push(mk({ name: n, category: 'Livestock', vesselTypes: ['Livestock Carrier'] }, used)));
  return out;
}

/* -------------------------------------------------- persisted reactive store */

const KEY = 'fv.cargoMaster';
let items: CargoRecord[] = load();
const listeners = new Set<() => void>();

function load(): CargoRecord[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CargoRecord[]) : null;
    if (Array.isArray(parsed) && parsed.length > 0) {
      const migrated = applyReferenceMigration(parsed);
      if (migrated !== parsed) persistList(migrated);
      return migrated;
    }
  } catch {
    /* fall through to seed */
  }
  const seeded = buildSeed();
  persistList(seeded);
  return seeded;
}

/**
 * One-time upgrade for records seeded before the IMSBC/IGC/IBC reference
 * data was added: fills in the reference fields for untouched, system-seeded
 * records (never overwrites a field the admin has already edited).
 */
function applyReferenceMigration(list: CargoRecord[]): CargoRecord[] {
  let changed = false;
  const next = list.map((rec) => {
    if (rec.createdBy !== 'System (seed)') return rec;
    const { verifyNote, ...overrides } = REFERENCE_OVERRIDES[rec.cargoName] ?? {};
    if (Object.keys(overrides).length === 0 && !verifyNote) return rec;
    const patch: Partial<CargoRecord> = {};
    (Object.keys(overrides) as (keyof CargoRecord)[]).forEach((key) => {
      const current = rec[key];
      const isBlank = current === '' || current === false || (Array.isArray(current) && current.length === 0);
      if (isBlank) (patch as Record<string, unknown>)[key] = overrides[key];
    });
    const noteMissing = !!verifyNote && !rec.cargoNotes.includes(verifyNote);
    if (Object.keys(patch).length === 0 && !noteMissing) return rec;
    changed = true;
    return {
      ...rec,
      ...patch,
      cargoNotes: noteMissing ? (rec.cargoNotes ? `${rec.cargoNotes} ${verifyNote}` : verifyNote!) : rec.cargoNotes,
    };
  });
  return changed ? next : list;
}

function persistList(list: CargoRecord[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — ignore */
  }
}

function persist(): void {
  persistList(items);
  listeners.forEach((l) => l());
}

export function getCargoMaster(): CargoRecord[] {
  return items;
}

export function useCargoMaster(): CargoRecord[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getCargoMaster,
    getCargoMaster,
  );
}

export function getCargoById(cargoId: string): CargoRecord | undefined {
  return items.find((c) => c.cargoId === cargoId);
}

export function isDuplicateCargoCode(code: string, ignoreId?: string): boolean {
  const norm = code.trim().toUpperCase();
  return items.some((c) => c.cargoId !== ignoreId && c.cargoCode.trim().toUpperCase() === norm);
}

export function upsertCargo(rec: CargoRecord, user = 'You'): CargoRecord {
  const stamp = nowStamp();
  if (rec.cargoId && items.some((c) => c.cargoId === rec.cargoId)) {
    const saved: CargoRecord = { ...rec, updatedAt: stamp, updatedBy: user };
    items = items.map((c) => (c.cargoId === rec.cargoId ? saved : c));
    persist();
    return saved;
  }
  const saved: CargoRecord = {
    ...rec,
    cargoId: rec.cargoId || newCargoId(),
    createdAt: rec.createdAt || stamp,
    createdBy: rec.createdBy || user,
    updatedAt: stamp,
    updatedBy: user,
  };
  items = [saved, ...items];
  persist();
  return saved;
}

export function duplicateCargo(cargoId: string, user = 'You'): CargoRecord | undefined {
  const source = getCargoById(cargoId);
  if (!source) return undefined;
  const used = new Set(items.map((c) => c.cargoCode.trim().toUpperCase()));
  let code = `${source.cargoCode}-COPY`;
  let n = 2;
  while (used.has(code.toUpperCase())) {
    code = `${source.cargoCode}-COPY-${n}`;
    n += 1;
  }
  const stamp = nowStamp();
  const copy: CargoRecord = {
    ...source,
    cargoId: newCargoId(),
    cargoCode: code,
    cargoName: `${source.cargoName} (Copy)`,
    createdAt: stamp,
    createdBy: user,
    updatedAt: stamp,
    updatedBy: user,
  };
  items = [copy, ...items];
  persist();
  return copy;
}

export function setCargoStatus(cargoId: string, status: CargoStatus, user = 'You'): void {
  const stamp = nowStamp();
  items = items.map((c) => (c.cargoId === cargoId ? { ...c, status, updatedAt: stamp, updatedBy: user } : c));
  persist();
}

export function deleteCargo(cargoId: string): void {
  items = items.filter((c) => c.cargoId !== cargoId);
  persist();
}

/* ------------------------------------------------------------- CSV import/export */

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function cargoToCsvRow(rec: CargoRecord): string {
  return CARGO_CSV_HEADERS.map((key) => {
    const v = rec[key];
    if (Array.isArray(v)) return csvCell(v.join('|'));
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return csvCell(String(v ?? ''));
  }).join(',');
}

export function exportCargoCsv(records: CargoRecord[]): string {
  return [CARGO_CSV_HEADERS.join(','), ...records.map(cargoToCsvRow)].join('\r\n');
}

export function downloadCargoTemplateCsv(): string {
  return CARGO_CSV_HEADERS.join(',');
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export interface CargoImportRow {
  row: number;
  data: Partial<CargoRecord>;
  status: 'valid' | 'duplicate' | 'invalid';
  reason?: string;
}

/** Parse a CSV (or CSV-like) import into preview rows: valid / duplicate / invalid. */
export function parseCargoImport(text: string): CargoImportRow[] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const seenCodes = new Set(items.map((c) => c.cargoCode.trim().toUpperCase()));
  const rows: CargoImportRow[] = [];

  lines.slice(1).forEach((line, idx) => {
    const cells = parseCsvLine(line);
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => {
      raw[h] = (cells[i] ?? '').trim();
    });

    const cargoName = raw.cargoName || '';
    const cargoCode = raw.cargoCode || '';
    const category = raw.category || '';

    if (!cargoName || !cargoCode || !category) {
      rows.push({ row: idx + 2, data: { cargoName, cargoCode, category: category as CargoCategory }, status: 'invalid', reason: 'Missing required field (Cargo Name, Cargo Code or Category).' });
      return;
    }
    if (!(CARGO_CATEGORIES as readonly string[]).includes(category)) {
      rows.push({ row: idx + 2, data: { cargoName, cargoCode, category: category as CargoCategory }, status: 'invalid', reason: `Unknown category "${category}".` });
      return;
    }
    if (raw.vesselTypes) {
      const badTypes = raw.vesselTypes.split('|').map((v) => v.trim()).filter((v) => v && !(CARGO_VESSEL_TYPES as readonly string[]).includes(v));
      if (badTypes.length > 0) {
        rows.push({ row: idx + 2, data: { cargoName, cargoCode, category: category as CargoCategory }, status: 'invalid', reason: `Unknown vessel type "${badTypes[0]}".` });
        return;
      }
    }
    for (const numField of ['densityMin', 'densityMax', 'stowageFactorMin', 'stowageFactorMax'] as const) {
      const v = raw[numField];
      if (v && Number.isNaN(Number(v))) {
        rows.push({ row: idx + 2, data: { cargoName, cargoCode, category: category as CargoCategory }, status: 'invalid', reason: `"${numField}" must be a number.` });
        return;
      }
    }

    const codeNorm = cargoCode.trim().toUpperCase();
    if (seenCodes.has(codeNorm)) {
      rows.push({ row: idx + 2, data: { cargoName, cargoCode, category: category as CargoCategory }, status: 'duplicate', reason: `Cargo Code "${cargoCode}" already exists.` });
      return;
    }
    seenCodes.add(codeNorm);

    const data: Partial<CargoRecord> = { cargoName, cargoCode, category: category as CargoCategory };
    CARGO_CSV_HEADERS.forEach((key) => {
      if (key === 'cargoName' || key === 'cargoCode' || key === 'category') return;
      const v = raw[key];
      if (v === undefined || v === '') return;
      if (key === 'vesselTypes') {
        (data as CargoRecord).vesselTypes = v.split('|').map((x) => x.trim()).filter(Boolean);
      } else if (['heatingRequired', 'coolingRequired', 'dangerousCargo', 'marinePollutant', 'liquefactionRisk', 'moistureSensitive', 'lashingRequired', 'reeferRequired'].includes(key)) {
        (data as Record<string, boolean>)[key] = /^y(es)?$/i.test(v);
      } else {
        (data as Record<string, string>)[key] = v;
      }
    });
    rows.push({ row: idx + 2, data, status: 'valid' });
  });

  return rows;
}

/** Commit the valid rows from a parsed import preview into the store. */
export function importValidCargoRows(rows: CargoImportRow[], user = 'You'): number {
  const valid = rows.filter((r) => r.status === 'valid');
  valid.forEach((r) => {
    const rec: CargoRecord = { ...emptyCargoRecord(), ...r.data } as CargoRecord;
    upsertCargo(rec, user);
  });
  return valid.length;
}
