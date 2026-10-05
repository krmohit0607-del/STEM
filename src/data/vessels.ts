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

import { useSyncExternalStore } from 'react';
import { vesselsApi, type BackendVesselDto } from '../api/vesselsApi';

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

  // --- Performance profile (Vessel Profile tab — Create Voyage / Performance
  // module). Saved once per vessel so operators don't re-enter it on every
  // new voyage; stored as plain strings like every other field here
  // (booleans as 'true'/'false') to keep the generic editor working. ---
  ecdisModel: string;
  autoSendForecast: string;
  autoSendForecastTime: string;
  weather4x: string;
  weather4xDuration: string;
  autoSendReports: string;
  scrubber: string;
  scrubberType: string;
  meType: string;
  defaultBallastDraft: string;
  defaultLadenDraft: string;
  summerDraft: string;
  minRpm: string;
  maxRpm: string;
  minMcr: string;
  maxMcr: string;
  minSpeed: string;
  maxSpeed: string;
  minPowerFraction: string;
  maxPowerFraction: string;
  nominalPowerFraction: string;
  blowerBallastMin: string;
  blowerBallastMax: string;
  blowerLadenMin: string;
  blowerLadenMax: string;
  criticalRpmMin: string;
  criticalRpmMax: string;
  deadSlowRpm: string;
  slowAheadRpm: string;
  halfAheadRpm: string;
  fullAheadRpm: string;
  deadSlowSpeedBallast: string;
  deadSlowSpeedLaden: string;
  slowAheadSpeedBallast: string;
  slowAheadSpeedLaden: string;
  halfAheadSpeedBallast: string;
  halfAheadSpeedLaden: string;
  fullAheadSpeedBallast: string;
  fullAheadSpeedLaden: string;
  wslMaxSwhBallast: string;
  wslMaxSwhLaden: string;
  wslMaxWindsBallast: string;
  wslMaxWindsLaden: string;
  wslMaxSeaStateBallast: string;
  wslMaxSeaStateLaden: string;

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
  | 'Commercial'
  | 'Performance';

export const VESSEL_GROUPS: VesselGroup[] = [
  'Identity',
  'Type',
  'Builder',
  'Dimensions',
  'Engine',
  'Commercial',
  'Performance',
];

export interface VesselFieldDef {
  key: VesselFieldKey;
  label: string;
  group: VesselGroup;
  type?: 'text' | 'email' | 'number' | 'boolean';
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
  // Performance profile (Vessel Profile tab — Create Voyage / Performance module)
  { key: 'ecdisModel', label: 'ECDIS Model', group: 'Performance' },
  { key: 'autoSendForecast', label: 'Auto Send Forecast', group: 'Performance', type: 'boolean' },
  { key: 'autoSendForecastTime', label: 'Forecast Time', group: 'Performance' },
  { key: 'weather4x', label: '4X Weather', group: 'Performance', type: 'boolean' },
  { key: 'weather4xDuration', label: 'Duration', group: 'Performance' },
  { key: 'autoSendReports', label: 'Auto Reports', group: 'Performance', type: 'boolean' },
  { key: 'scrubber', label: 'Scrubber', group: 'Performance', type: 'boolean' },
  { key: 'scrubberType', label: 'Scrubber Type', group: 'Performance' },
  { key: 'meType', label: 'M/E Type', group: 'Performance' },
  { key: 'defaultBallastDraft', label: 'Default Draft — Ballast (m)', group: 'Performance', type: 'number' },
  { key: 'defaultLadenDraft', label: 'Default Draft — Laden (m)', group: 'Performance', type: 'number' },
  { key: 'summerDraft', label: 'Summer Draft (m)', group: 'Performance', type: 'number' },
  { key: 'minRpm', label: 'Min RPM', group: 'Performance', type: 'number' },
  { key: 'maxRpm', label: 'Max RPM', group: 'Performance', type: 'number' },
  { key: 'minMcr', label: 'Min MCR (kW)', group: 'Performance', type: 'number' },
  { key: 'maxMcr', label: 'Max MCR (kW)', group: 'Performance', type: 'number' },
  { key: 'minSpeed', label: 'Min Speed (kt)', group: 'Performance', type: 'number' },
  { key: 'maxSpeed', label: 'Max Speed (kt)', group: 'Performance', type: 'number' },
  { key: 'minPowerFraction', label: 'Min Power Fraction', group: 'Performance', type: 'number' },
  { key: 'maxPowerFraction', label: 'Max Power Fraction', group: 'Performance', type: 'number' },
  { key: 'nominalPowerFraction', label: 'Nominal Power Fraction', group: 'Performance', type: 'number' },
  { key: 'blowerBallastMin', label: 'Blower On/Off — Ballast Min (RPM)', group: 'Performance', type: 'number' },
  { key: 'blowerBallastMax', label: 'Blower On/Off — Ballast Max (RPM)', group: 'Performance', type: 'number' },
  { key: 'blowerLadenMin', label: 'Blower On/Off — Laden Min (RPM)', group: 'Performance', type: 'number' },
  { key: 'blowerLadenMax', label: 'Blower On/Off — Laden Max (RPM)', group: 'Performance', type: 'number' },
  { key: 'criticalRpmMin', label: 'Critical RPM Min', group: 'Performance', type: 'number' },
  { key: 'criticalRpmMax', label: 'Critical RPM Max', group: 'Performance', type: 'number' },
  { key: 'deadSlowRpm', label: 'Telegraph — Dead Slow Ahead RPM', group: 'Performance', type: 'number' },
  { key: 'slowAheadRpm', label: 'Telegraph — Slow Ahead RPM', group: 'Performance', type: 'number' },
  { key: 'halfAheadRpm', label: 'Telegraph — Half Ahead RPM', group: 'Performance', type: 'number' },
  { key: 'fullAheadRpm', label: 'Telegraph — Full Ahead RPM', group: 'Performance', type: 'number' },
  { key: 'deadSlowSpeedBallast', label: 'Telegraph — Dead Slow Speed, Ballast (kt)', group: 'Performance', type: 'number' },
  { key: 'deadSlowSpeedLaden', label: 'Telegraph — Dead Slow Speed, Laden (kt)', group: 'Performance', type: 'number' },
  { key: 'slowAheadSpeedBallast', label: 'Telegraph — Slow Ahead Speed, Ballast (kt)', group: 'Performance', type: 'number' },
  { key: 'slowAheadSpeedLaden', label: 'Telegraph — Slow Ahead Speed, Laden (kt)', group: 'Performance', type: 'number' },
  { key: 'halfAheadSpeedBallast', label: 'Telegraph — Half Ahead Speed, Ballast (kt)', group: 'Performance', type: 'number' },
  { key: 'halfAheadSpeedLaden', label: 'Telegraph — Half Ahead Speed, Laden (kt)', group: 'Performance', type: 'number' },
  { key: 'fullAheadSpeedBallast', label: 'Telegraph — Full Ahead Speed, Ballast (kt)', group: 'Performance', type: 'number' },
  { key: 'fullAheadSpeedLaden', label: 'Telegraph — Full Ahead Speed, Laden (kt)', group: 'Performance', type: 'number' },
  { key: 'wslMaxSwhBallast', label: 'Max SWH, Ballast (m)', group: 'Performance', type: 'number' },
  { key: 'wslMaxSwhLaden', label: 'Max SWH, Laden (m)', group: 'Performance', type: 'number' },
  { key: 'wslMaxWindsBallast', label: 'Max Winds, Ballast (BF)', group: 'Performance', type: 'number' },
  { key: 'wslMaxWindsLaden', label: 'Max Winds, Laden (BF)', group: 'Performance', type: 'number' },
  { key: 'wslMaxSeaStateBallast', label: 'Max Sea State, Ballast (DSS)', group: 'Performance', type: 'number' },
  { key: 'wslMaxSeaStateLaden', label: 'Max Sea State, Laden (DSS)', group: 'Performance', type: 'number' },
];

/** A blank vessel with every field set to an empty string. */
export function makeBlankVessel(): Vessel {
  const base = { id: '', history: [] } as unknown as Vessel;
  for (const f of VESSEL_FIELDS) {
    (base as unknown as Record<string, unknown>)[f.key] = '';
  }
  return base;
}

/** No local vessel fixtures: registered vessels come from the backend database. */
export const VESSELS: Vessel[] = [];

// --- Persistence -------------------------------------------------------------

const STORAGE_KEY = 'fv.vessels';
const DEMO_VESSEL_KEYS = new Set(['9417878', '9670585', '9321483', 'MV OCEANIC PIONEER', 'ATLANTIC SAIL', 'MV ATLANTIC TRADER']);

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

function mapBackendToVessel(dto: BackendVesselDto): Vessel {
  const v = makeBlankVessel();
  v.id = dto.id;
  v.name = dto.name;
  v.shortName = dto.shortName ?? '';
  v.imo = dto.imo;
  v.mmsi = dto.mmsi ?? '';
  v.email = dto.email ?? '';
  v.iceClass = dto.iceClass ?? '';
  v.statcode5 = dto.statcode5 ?? '';
  v.statcode5Desc = dto.statcode5Desc ?? '';
  v.vesselType = dto.vesselType ?? '';
  v.builderName = dto.builderName ?? '';
  v.builderCountry = dto.builderCountry ?? '';
  v.builderCode = dto.builderCode ?? '';
  v.builderTown = dto.builderTown ?? '';
  v.builtYear = dto.builtYear ?? '';
  v.standardDesign = dto.standardDesign ?? '';
  v.gt = dto.gt ?? '';
  v.lengthBp = dto.lengthBp ?? '';
  v.lengthOverall = dto.lengthOverall ?? '';
  v.depth = dto.depth ?? '';
  v.breadthMoulded = dto.breadthMoulded ?? '';
  v.deadweight = dto.deadweight ?? '';
  v.displacement = dto.displacement ?? '';
  v.draught = dto.draught ?? '';
  v.hullType = dto.hullType ?? '';
  v.holds = dto.holds ?? '';
  v.teu = dto.teu ?? '';
  v.gasCapacity = dto.gasCapacity ?? '';
  v.sternLoading = dto.sternLoading ?? '';
  v.inertGasSystem = dto.inertGasSystem ?? '';
  v.keelLaid = dto.keelLaid ?? '';
  v.keelToMastHeight = dto.keelToMastHeight ?? '';
  v.linesPerSide = dto.linesPerSide ?? '';
  v.parallelBodyLength = dto.parallelBodyLength ?? '';
  v.roroLanesLength = dto.roroLanesLength ?? '';
  v.engineBuilder = dto.engineBuilder ?? '';
  v.engineDesign = dto.engineDesign ?? '';
  v.engineModel = dto.engineModel ?? '';
  v.enginesRpm = dto.enginesRpm ?? '';
  v.totalKwMainEng = dto.totalKwMainEng ?? '';
  v.fuelConsMainEng = dto.fuelConsMainEng ?? '';
  v.auxEngineTotalKw = dto.auxEngineTotalKw ?? '';
  v.generatorsKw = dto.generatorsKw ?? '';
  v.thrustersTotalKw = dto.thrustersTotalKw ?? '';
  v.serviceSpeed = dto.serviceSpeed ?? '';
  v.flag = dto.flag ?? '';
  v.owner = dto.owner ?? '';
  v.operator = dto.operator ?? '';
  v.classSociety = dto.classSociety ?? '';
  v.ecdisModel = dto.ecdisModel ?? '';
  v.autoSendForecast = dto.autoSendForecast ?? '';
  v.autoSendForecastTime = dto.autoSendForecastTime ?? '';
  v.weather4x = dto.weather4x ?? '';
  v.weather4xDuration = dto.weather4xDuration ?? '';
  v.autoSendReports = dto.autoSendReports ?? '';
  v.scrubber = dto.scrubber ?? '';
  v.scrubberType = dto.scrubberType ?? '';
  v.meType = dto.meType ?? '';
  v.defaultBallastDraft = dto.defaultBallastDraft ?? '';
  v.defaultLadenDraft = dto.defaultLadenDraft ?? '';
  v.summerDraft = dto.summerDraft ?? '';
  v.minRpm = dto.minRpm ?? '';
  v.maxRpm = dto.maxRpm ?? '';
  v.minMcr = dto.minMcr ?? '';
  v.maxMcr = dto.maxMcr ?? '';
  v.minSpeed = dto.minSpeed ?? '';
  v.maxSpeed = dto.maxSpeed ?? '';
  v.minPowerFraction = dto.minPowerFraction ?? '';
  v.maxPowerFraction = dto.maxPowerFraction ?? '';
  v.nominalPowerFraction = dto.nominalPowerFraction ?? '';
  v.blowerBallastMin = dto.blowerBallastMin ?? '';
  v.blowerBallastMax = dto.blowerBallastMax ?? '';
  v.blowerLadenMin = dto.blowerLadenMin ?? '';
  v.blowerLadenMax = dto.blowerLadenMax ?? '';
  v.criticalRpmMin = dto.criticalRpmMin ?? '';
  v.criticalRpmMax = dto.criticalRpmMax ?? '';
  v.deadSlowRpm = dto.deadSlowRpm ?? '';
  v.slowAheadRpm = dto.slowAheadRpm ?? '';
  v.halfAheadRpm = dto.halfAheadRpm ?? '';
  v.fullAheadRpm = dto.fullAheadRpm ?? '';
  v.deadSlowSpeedBallast = dto.deadSlowSpeedBallast ?? '';
  v.deadSlowSpeedLaden = dto.deadSlowSpeedLaden ?? '';
  v.slowAheadSpeedBallast = dto.slowAheadSpeedBallast ?? '';
  v.slowAheadSpeedLaden = dto.slowAheadSpeedLaden ?? '';
  v.halfAheadSpeedBallast = dto.halfAheadSpeedBallast ?? '';
  v.halfAheadSpeedLaden = dto.halfAheadSpeedLaden ?? '';
  v.fullAheadSpeedBallast = dto.fullAheadSpeedBallast ?? '';
  v.fullAheadSpeedLaden = dto.fullAheadSpeedLaden ?? '';
  v.wslMaxSwhBallast = dto.wslMaxSwhBallast ?? '';
  v.wslMaxSwhLaden = dto.wslMaxSwhLaden ?? '';
  v.wslMaxWindsBallast = dto.wslMaxWindsBallast ?? '';
  v.wslMaxWindsLaden = dto.wslMaxWindsLaden ?? '';
  v.wslMaxSeaStateBallast = dto.wslMaxSeaStateBallast ?? '';
  v.wslMaxSeaStateLaden = dto.wslMaxSeaStateLaden ?? '';
  v.history = (dto.history ?? []).map((h) => ({
    at: h.changedAt,
    by: h.changedBy,
    field: h.fieldName,
    from: h.fromValue ?? '',
    to: h.toValue ?? '',
  }));
  return v;
}

export async function syncVesselsFromBackend(): Promise<Vessel[]> {
  try {
    const list = await vesselsApi.list();
    // An empty backend result just means nothing has been pushed there yet — don't wipe
    // whatever vessels are already cached locally in that case.
    if (!list || list.length === 0) return loadVessels();
    const mapped = list.map(mapBackendToVessel);
    saveVessels(mapped);
    return mapped;
  } catch {
    // Fallback to local
  }
  return loadVessels();
}

export function loadVessels(): Vessel[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return VESSELS.map((v) => ({ ...v }));
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(isVessel)) {
      const cleaned = (parsed as Vessel[])
        .map(normalise)
        .filter((v) => !DEMO_VESSEL_KEYS.has(v.imo) && !DEMO_VESSEL_KEYS.has(v.name));
      if (cleaned.length !== parsed.length) saveVessels(cleaned);
      return cleaned;
    }
  } catch {
    /* fall back to seed */
  }
  return VESSELS.map((v) => ({ ...v }));
}

/* ----- Reactive vessel state management ----- */

let vesselSnapshot: Vessel[] = loadVessels();
const vesselListeners = new Set<() => void>();

function subscribeVessels(listener: () => void): () => void {
  vesselListeners.add(listener);
  return () => vesselListeners.delete(listener);
}

function notifyVesselListeners(): void {
  vesselListeners.forEach((l) => l());
}

export function getVessels(): Vessel[] {
  return vesselSnapshot;
}

/**
 * React hook: the live list of vessels (updates when any component changes them).
 * Used by chartering estimation to keep vessel dropdown options in sync.
 */
export function useVessels(): Vessel[] {
  return useSyncExternalStore(subscribeVessels, getVessels, getVessels);
}

export function saveVessels(vessels: Vessel[]): void {
  try {
    vesselSnapshot = vessels;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(vessels));
    notifyVesselListeners();
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

// --- Vessel Profile tab sync (Create Voyage / Performance module) ----------
//
// The Vessel Profile tab on a voyage shares this same performance-profile
// data with the Settings → Vessels Details master record: selecting a known
// vessel prefills the tab from here (`vesselProfileFromVessel`), and saving
// edits on that tab pushes them back (`syncVesselProfileFromVoyage`) so the
// next voyage for that vessel starts pre-filled with the latest values.

/** The vessel-profile fields shared with a voyage's Vessel Profile tab.
 *  Field names mirror `VoyageView` directly except where noted. */
export interface VesselProfileFields {
  vesselType: string;
  flag: string;
  /** -> Vessel.email */
  vesselEmail: string;
  ecdisModel: string;
  autoSendForecast: boolean;
  autoSendForecastTime: string;
  weather4x: boolean;
  weather4xDuration: string;
  autoSendReports: boolean;
  scrubber: boolean;
  scrubberType: string;
  meType: string;
  /** -> Vessel.engineModel */
  meModel: string;
  /** -> Vessel.lengthOverall */
  loa: string;
  /** -> Vessel.breadthMoulded */
  beam: string;
  defaultBallastDraft: string;
  defaultLadenDraft: string;
  summerDraft: string;
  /** -> Vessel.displacement */
  summerDisplacement: string;
  /** -> Vessel.deadweight */
  summerDeadweight: string;
  minRpm: string;
  maxRpm: string;
  minMcr: string;
  maxMcr: string;
  minSpeed: string;
  maxSpeed: string;
  minPowerFraction: string;
  maxPowerFraction: string;
  nominalPowerFraction: string;
  blowerBallastMin: string;
  blowerBallastMax: string;
  blowerLadenMin: string;
  blowerLadenMax: string;
  criticalRpmMin: string;
  criticalRpmMax: string;
  deadSlowRpm: string;
  slowAheadRpm: string;
  halfAheadRpm: string;
  fullAheadRpm: string;
  deadSlowSpeedBallast: string;
  deadSlowSpeedLaden: string;
  slowAheadSpeedBallast: string;
  slowAheadSpeedLaden: string;
  halfAheadSpeedBallast: string;
  halfAheadSpeedLaden: string;
  fullAheadSpeedBallast: string;
  fullAheadSpeedLaden: string;
  wslMaxSwhBallast: string;
  wslMaxSwhLaden: string;
  wslMaxWindsBallast: string;
  wslMaxWindsLaden: string;
  wslMaxSeaStateBallast: string;
  wslMaxSeaStateLaden: string;
}

function boolStr(b: boolean): string {
  return b ? 'true' : 'false';
}

function strBool(s: string): boolean {
  return s === 'true';
}

/** Find the Settings → Vessels Details master record for a voyage's vessel (by IMO first, then name). */
export function findVesselForVoyage(name: string, imo: string): Vessel | undefined {
  const vessels = loadVessels();
  const trimmedImo = imo.trim();
  const byImo = trimmedImo ? vessels.find((v) => v.imo.trim() === trimmedImo) : undefined;
  if (byImo) return byImo;
  const trimmedName = name.trim().toLowerCase();
  return trimmedName ? vessels.find((v) => v.name.trim().toLowerCase() === trimmedName) : undefined;
}

export function vesselProfileFromVessel(v: Vessel): VesselProfileFields {
  return {
    vesselType: v.vesselType,
    flag: v.flag,
    vesselEmail: v.email,
    ecdisModel: v.ecdisModel,
    autoSendForecast: strBool(v.autoSendForecast),
    autoSendForecastTime: v.autoSendForecastTime,
    weather4x: strBool(v.weather4x),
    weather4xDuration: v.weather4xDuration,
    autoSendReports: strBool(v.autoSendReports),
    scrubber: strBool(v.scrubber),
    scrubberType: v.scrubberType,
    meType: v.meType,
    meModel: v.engineModel,
    loa: v.lengthOverall,
    beam: v.breadthMoulded,
    defaultBallastDraft: v.defaultBallastDraft,
    defaultLadenDraft: v.defaultLadenDraft,
    summerDraft: v.summerDraft,
    summerDisplacement: v.displacement,
    summerDeadweight: v.deadweight,
    minRpm: v.minRpm,
    maxRpm: v.maxRpm,
    minMcr: v.minMcr,
    maxMcr: v.maxMcr,
    minSpeed: v.minSpeed,
    maxSpeed: v.maxSpeed,
    minPowerFraction: v.minPowerFraction,
    maxPowerFraction: v.maxPowerFraction,
    nominalPowerFraction: v.nominalPowerFraction,
    blowerBallastMin: v.blowerBallastMin,
    blowerBallastMax: v.blowerBallastMax,
    blowerLadenMin: v.blowerLadenMin,
    blowerLadenMax: v.blowerLadenMax,
    criticalRpmMin: v.criticalRpmMin,
    criticalRpmMax: v.criticalRpmMax,
    deadSlowRpm: v.deadSlowRpm,
    slowAheadRpm: v.slowAheadRpm,
    halfAheadRpm: v.halfAheadRpm,
    fullAheadRpm: v.fullAheadRpm,
    deadSlowSpeedBallast: v.deadSlowSpeedBallast,
    deadSlowSpeedLaden: v.deadSlowSpeedLaden,
    slowAheadSpeedBallast: v.slowAheadSpeedBallast,
    slowAheadSpeedLaden: v.slowAheadSpeedLaden,
    halfAheadSpeedBallast: v.halfAheadSpeedBallast,
    halfAheadSpeedLaden: v.halfAheadSpeedLaden,
    fullAheadSpeedBallast: v.fullAheadSpeedBallast,
    fullAheadSpeedLaden: v.fullAheadSpeedLaden,
    wslMaxSwhBallast: v.wslMaxSwhBallast,
    wslMaxSwhLaden: v.wslMaxSwhLaden,
    wslMaxWindsBallast: v.wslMaxWindsBallast,
    wslMaxWindsLaden: v.wslMaxWindsLaden,
    wslMaxSeaStateBallast: v.wslMaxSeaStateBallast,
    wslMaxSeaStateLaden: v.wslMaxSeaStateLaden,
  };
}

/**
 * Create-or-update the vessel master record's performance-profile fields from
 * a voyage's Vessel Profile tab (two-way sync). Matches by IMO first, then
 * vessel name; creates a new master record if neither matches.
 */
export function syncVesselProfileFromVoyage(name: string, imo: string, profile: VesselProfileFields, by = ''): void {
  const trimmedName = name.trim();
  const trimmedImo = imo.trim();
  if (!trimmedName && !trimmedImo) return;

  const patch: Partial<Vessel> = {
    vesselType: profile.vesselType,
    flag: profile.flag,
    email: profile.vesselEmail,
    ecdisModel: profile.ecdisModel,
    autoSendForecast: boolStr(profile.autoSendForecast),
    autoSendForecastTime: profile.autoSendForecastTime,
    weather4x: boolStr(profile.weather4x),
    weather4xDuration: profile.weather4xDuration,
    autoSendReports: boolStr(profile.autoSendReports),
    scrubber: boolStr(profile.scrubber),
    scrubberType: profile.scrubberType,
    meType: profile.meType,
    engineModel: profile.meModel,
    lengthOverall: profile.loa,
    breadthMoulded: profile.beam,
    defaultBallastDraft: profile.defaultBallastDraft,
    defaultLadenDraft: profile.defaultLadenDraft,
    summerDraft: profile.summerDraft,
    displacement: profile.summerDisplacement,
    deadweight: profile.summerDeadweight,
    minRpm: profile.minRpm,
    maxRpm: profile.maxRpm,
    minMcr: profile.minMcr,
    maxMcr: profile.maxMcr,
    minSpeed: profile.minSpeed,
    maxSpeed: profile.maxSpeed,
    minPowerFraction: profile.minPowerFraction,
    maxPowerFraction: profile.maxPowerFraction,
    nominalPowerFraction: profile.nominalPowerFraction,
    blowerBallastMin: profile.blowerBallastMin,
    blowerBallastMax: profile.blowerBallastMax,
    blowerLadenMin: profile.blowerLadenMin,
    blowerLadenMax: profile.blowerLadenMax,
    criticalRpmMin: profile.criticalRpmMin,
    criticalRpmMax: profile.criticalRpmMax,
    deadSlowRpm: profile.deadSlowRpm,
    slowAheadRpm: profile.slowAheadRpm,
    halfAheadRpm: profile.halfAheadRpm,
    fullAheadRpm: profile.fullAheadRpm,
    deadSlowSpeedBallast: profile.deadSlowSpeedBallast,
    deadSlowSpeedLaden: profile.deadSlowSpeedLaden,
    slowAheadSpeedBallast: profile.slowAheadSpeedBallast,
    slowAheadSpeedLaden: profile.slowAheadSpeedLaden,
    halfAheadSpeedBallast: profile.halfAheadSpeedBallast,
    halfAheadSpeedLaden: profile.halfAheadSpeedLaden,
    fullAheadSpeedBallast: profile.fullAheadSpeedBallast,
    fullAheadSpeedLaden: profile.fullAheadSpeedLaden,
    wslMaxSwhBallast: profile.wslMaxSwhBallast,
    wslMaxSwhLaden: profile.wslMaxSwhLaden,
    wslMaxWindsBallast: profile.wslMaxWindsBallast,
    wslMaxWindsLaden: profile.wslMaxWindsLaden,
    wslMaxSeaStateBallast: profile.wslMaxSeaStateBallast,
    wslMaxSeaStateLaden: profile.wslMaxSeaStateLaden,
  };

  const vessels = loadVessels();
  const idx = vessels.findIndex(
    (v) =>
      (trimmedImo && v.imo.trim() === trimmedImo) ||
      (!trimmedImo && v.name.trim().toLowerCase() === trimmedName.toLowerCase()),
  );

  let before: Vessel | undefined;
  let next: Vessel;
  if (idx >= 0) {
    before = vessels[idx];
    next = { ...before, ...patch };
    const changes = diffVessel(before, next, by);
    next.history = [...changes, ...before.history];
    vessels[idx] = next;
  } else {
    next = {
      ...makeBlankVessel(),
      ...patch,
      id: newVesselId(),
      name: trimmedName,
      imo: trimmedImo,
      history: [{ at: new Date().toISOString(), by, field: 'Created', from: '', to: trimmedName }],
    };
    vessels.unshift(next);
  }
  saveVessels(vessels);

  void (async () => {
    try {
      if (before) {
        await vesselsApi.update(next.id, next);
      } else {
        const res = await vesselsApi.create(next);
        if (res?.id) {
          saveVessels(getVessels().map((v) => (v.id === next.id ? { ...v, id: res.id } : v)));
        }
      }
    } catch {
      /* local fallback — already saved to localStorage above */
    }
  })();
}
