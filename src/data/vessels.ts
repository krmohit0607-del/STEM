/**
 * Vessel administration records shown in Settings → Vessels Details.
 *
 * The field set mirrors the IMO ship-search particulars (Ship Identity /
 * Type / Builder / Dimensions / Engine) plus a Commercial group and the
 * operator-facing extras (short name/code, email). Every field is stored
 * as a string so the editor stays generic; a per-vessel change history
 * makes edits auditable. Records persist to localStorage over a seed list
 * derived from the voyage data plus one fully-populated example vessel.
 */

import { VOYAGES } from './voyages';

/** A single recorded field change for a vessel. */
export interface VesselChange {
  at: string;
  by: string;
  field: string;
  from: string;
  to: string;
}

export interface Vessel {
  id: string;
  // --- Identity ---
  name: string;
  shortName: string;
  imo: string;
  mmsi: string;
  email: string;
  iceClass: string;
  // --- Type ---
  statcode5: string;
  statcode5Desc: string;
  vesselType: string;
  // --- Builder ---
  builderName: string;
  builderCountry: string;
  builderCode: string;
  builderTown: string;
  builtYear: string;
  standardDesign: string;
  // --- Dimensions ---
  gt: string;
  lengthBp: string;
  lengthOverall: string;
  depth: string;
  breadthMoulded: string;
  deadweight: string;
  displacement: string;
  draught: string;
  hullType: string;
  holds: string;
  teu: string;
  gasCapacity: string;
  sternLoading: string;
  inertGasSystem: string;
  keelLaid: string;
  keelToMastHeight: string;
  linesPerSide: string;
  parallelBodyLength: string;
  roroLanesLength: string;
  // --- Engine ---
  engineBuilder: string;
  engineDesign: string;
  engineModel: string;
  enginesRpm: string;
  totalKwMainEng: string;
  fuelConsMainEng: string;
  auxEngineTotalKw: string;
  generatorsKw: string;
  thrustersTotalKw: string;
  serviceSpeed: string;
  // --- Commercial / other ---
  flag: string;
  owner: string;
  operator: string;
  classSociety: string;
  /** Newest-first log of field changes. */
  history: VesselChange[];
}

export type VesselFieldKey = Exclude<keyof Vessel, 'id' | 'history'>;

export type VesselGroup =
  | 'Identity'
  | 'Type'
  | 'Builder'
  | 'Dimensions'
  | 'Engine'
  | 'Commercial';

export const VESSEL_GROUPS: VesselGroup[] = [
  'Identity',
  'Type',
  'Builder',
  'Dimensions',
  'Engine',
  'Commercial',
];

export interface VesselFieldDef {
  key: VesselFieldKey;
  label: string;
  group: VesselGroup;
  type?: 'text' | 'email';
  placeholder?: string;
  required?: boolean;
}

/** Editable fields (drives the editor + the change log labels). */
export const VESSEL_FIELDS: VesselFieldDef[] = [
  // Identity
  { key: 'name', label: 'Vessel Name', group: 'Identity', required: true },
  { key: 'shortName', label: 'Short Name / Code', group: 'Identity', placeholder: 'Used in emails, e.g. ATLSAIL' },
  { key: 'imo', label: 'IMO Number', group: 'Identity', required: true },
  { key: 'mmsi', label: 'MMSI', group: 'Identity' },
  { key: 'email', label: 'Email', group: 'Identity', type: 'email', placeholder: 'master@vessel.example.com' },
  { key: 'iceClass', label: 'Ship Ice Class', group: 'Identity' },
  // Type
  { key: 'statcode5', label: 'Statcode 5', group: 'Type' },
  { key: 'statcode5Desc', label: 'Statcode 5 Description', group: 'Type' },
  { key: 'vesselType', label: 'Vessel Type', group: 'Type' },
  // Builder
  { key: 'builderName', label: 'Ship Builder Name', group: 'Builder' },
  { key: 'builderCountry', label: 'Ship Builder Country', group: 'Builder' },
  { key: 'builderCode', label: 'Ship Builder Code', group: 'Builder' },
  { key: 'builderTown', label: 'Ship Builder Town', group: 'Builder' },
  { key: 'builtYear', label: 'Built Year', group: 'Builder' },
  { key: 'standardDesign', label: 'Standard Design', group: 'Builder' },
  // Dimensions
  { key: 'gt', label: 'GT', group: 'Dimensions' },
  { key: 'lengthBp', label: 'Length BP', group: 'Dimensions' },
  { key: 'lengthOverall', label: 'Length Overall (LOA)', group: 'Dimensions' },
  { key: 'depth', label: 'Depth', group: 'Dimensions' },
  { key: 'breadthMoulded', label: 'Breadth Moulded', group: 'Dimensions' },
  { key: 'deadweight', label: 'Deadweight (DWT)', group: 'Dimensions' },
  { key: 'displacement', label: 'Displacement', group: 'Dimensions' },
  { key: 'draught', label: 'Draught', group: 'Dimensions' },
  { key: 'hullType', label: 'Hull Type', group: 'Dimensions' },
  { key: 'holds', label: 'Holds', group: 'Dimensions' },
  { key: 'teu', label: 'TEU', group: 'Dimensions' },
  { key: 'gasCapacity', label: 'Gas Capacity', group: 'Dimensions' },
  { key: 'sternLoading', label: 'Stern Loading', group: 'Dimensions' },
  { key: 'inertGasSystem', label: 'Inert Gas System', group: 'Dimensions' },
  { key: 'keelLaid', label: 'Keel Laid', group: 'Dimensions' },
  { key: 'keelToMastHeight', label: 'Keel To Mast Height', group: 'Dimensions' },
  { key: 'linesPerSide', label: 'Lines Per Side', group: 'Dimensions' },
  { key: 'parallelBodyLength', label: 'Parallel Body Length Light', group: 'Dimensions' },
  { key: 'roroLanesLength', label: 'RORO Lanes Length', group: 'Dimensions' },
  // Engine
  { key: 'engineBuilder', label: 'Engine Builder', group: 'Engine' },
  { key: 'engineDesign', label: 'Engine Design', group: 'Engine' },
  { key: 'engineModel', label: 'Engine Model', group: 'Engine' },
  { key: 'enginesRpm', label: 'Engines RPM', group: 'Engine' },
  { key: 'totalKwMainEng', label: 'Total kW Main Eng', group: 'Engine' },
  { key: 'fuelConsMainEng', label: 'Fuel Consumption Main Engines', group: 'Engine' },
  { key: 'auxEngineTotalKw', label: 'Aux. Engine Total kW', group: 'Engine' },
  { key: 'generatorsKw', label: 'Generators kW', group: 'Engine' },
  { key: 'thrustersTotalKw', label: 'Thrusters Total kW', group: 'Engine' },
  { key: 'serviceSpeed', label: 'Service Speed', group: 'Engine' },
  // Commercial / other
  { key: 'flag', label: 'Flag', group: 'Commercial' },
  { key: 'owner', label: 'Owner', group: 'Commercial' },
  { key: 'operator', label: 'Operator', group: 'Commercial' },
  { key: 'classSociety', label: 'Class Society', group: 'Commercial' },
];

/** A blank vessel with every field set to an empty string. */
export function makeBlankVessel(): Vessel {
  const base = { id: '', history: [] } as unknown as Vessel;
  for (const f of VESSEL_FIELDS) {
    (base as unknown as Record<string, unknown>)[f.key] = '';
  }
  return base;
}

/** Example vessel from the IMO ship-search sheet (ATLANTIC SAIL). */
const EXAMPLE_VESSEL: Vessel = {
  ...makeBlankVessel(),
  id: 'ves-9670585',
  name: 'ATLANTIC SAIL',
  shortName: 'ATLSAIL',
  imo: '9670585',
  mmsi: '215809000',
  iceClass: 'FS Ice Class 1C',
  statcode5: 'A35C2RC',
  statcode5Desc: 'Container/Ro-Ro Cargo Ship',
  vesselType: 'Ro-Ro cargo ships',
  builderName: 'Rongcheng Xixiakou Shipyard Co Ltd',
  builderCountry: "China, People's Republic Of",
  builderCode: 'CHR398',
  builderTown: 'Rongcheng, Shandong',
  builtYear: '2016',
  standardDesign: 'ACL G4',
  gt: '100430',
  lengthBp: '286.8',
  lengthOverall: '296',
  depth: '22.95',
  breadthMoulded: '37.6',
  deadweight: '55631',
  displacement: '89565',
  draught: '11.5',
  hullType: 'Double Bottom Entire Compartment Length',
  holds: '0',
  teu: '3817',
  gasCapacity: '0',
  sternLoading: '0',
  inertGasSystem: '0',
  keelLaid: '2014',
  keelToMastHeight: '0',
  linesPerSide: '0',
  parallelBodyLength: '0',
  roroLanesLength: '5270',
  engineBuilder: 'Hudong Heavy Machinery Co Ltd - China',
  engineDesign: 'Wartsila',
  engineModel: '8RT-flex68D',
  enginesRpm: '95',
  totalKwMainEng: '22000',
  fuelConsMainEng: '70',
  auxEngineTotalKw: '2325',
  generatorsKw: '8748',
  thrustersTotalKw: '5250',
  serviceSpeed: '18',
  flag: '',
  owner: 'Atlantic Container Line',
  operator: '',
  classSociety: '',
  history: [],
};

/** Build the seed vessel list from the voyages plus the example vessel. */
function buildSeed(): Vessel[] {
  const seen = new Set<string>([EXAMPLE_VESSEL.imo]);
  const list: Vessel[] = [EXAMPLE_VESSEL];
  for (const v of VOYAGES) {
    const key = v.imo || v.vessel;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    list.push({
      ...makeBlankVessel(),
      id: `ves-${v.imo || v.id}`,
      name: v.vessel,
      imo: v.imo,
      vesselType: v.vesselType,
      builtYear: v.built ? String(v.built) : '',
      lengthOverall: v.loa,
      breadthMoulded: v.beam,
      deadweight: v.dwt,
      totalKwMainEng: v.enginePower,
      serviceSpeed: v.cpSpeed ? `${v.cpSpeed} kn` : '',
      flag: v.flag,
      owner: v.client,
    });
  }
  return list;
}

export const VESSELS: Vessel[] = buildSeed();

// --- Persistence -------------------------------------------------------------

const STORAGE_KEY = 'fv.vessels';

/** Fill in any missing keys so older stored records stay controlled inputs. */
function normalise(v: Partial<Vessel>): Vessel {
  const out = { ...makeBlankVessel(), ...v } as Vessel;
  for (const f of VESSEL_FIELDS) {
    const rec = out as unknown as Record<string, unknown>;
    if (typeof rec[f.key] !== 'string') rec[f.key] = '';
  }
  out.history = Array.isArray(v.history) ? v.history : [];
  return out;
}

export function loadVessels(): Vessel[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return VESSELS.map((v) => ({ ...v }));
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(isVessel)) {
      return (parsed as Vessel[]).map(normalise);
    }
  } catch {
    /* fall back to seed */
  }
  return VESSELS.map((v) => ({ ...v }));
}

export function saveVessels(vessels: Vessel[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(vessels));
  } catch {
    /* storage unavailable — ignore */
  }
}

export function resetVessels(): Vessel[] {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return VESSELS.map((v) => ({ ...v }));
}

export function newVesselId(): string {
  return `ves-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Field-level changes between two vessel records, newest-first. */
export function diffVessel(prev: Vessel, next: Vessel, by = ''): VesselChange[] {
  const at = new Date().toISOString();
  const changes: VesselChange[] = [];
  for (const { key, label } of VESSEL_FIELDS) {
    const a = String(prev[key] ?? '');
    const b = String(next[key] ?? '');
    if (a !== b) changes.push({ at, by, field: label, from: a, to: b });
  }
  return changes;
}

function isVessel(v: unknown): v is Vessel {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Vessel).id === 'string' &&
    typeof (v as Vessel).name === 'string'
  );
}
