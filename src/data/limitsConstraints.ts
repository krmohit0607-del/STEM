/**
 * Voyage limits & constraints store (Settings → left menu "Limits &
 * Constraints"). Holds the editable market factors, weather safety limits,
 * RTA constraint and speed / consumption constraints for the voyage, plus a
 * change log (who / when) so operators can audit edits.
 *
 * Persisted to localStorage; replace with the real API when exposed.
 */

export interface MarketFactors {
  foPrice: string;
  goPrice: string;
  euaPrice: string;
  hirePerDay: string;
  freightRate: string;
}

export interface WeatherSafetyLimits {
  maxSwh: string;
  maxWind: string;
  maxSeaState: string;
  maxRollPeriod: string;
  maxSwell: string;
}

export interface RtaConstraint {
  enabled: boolean;
  /** Which zone the operator typed the value in. */
  mode: 'UTC' | 'LT';
  /** `YYYY-MM-DDTHH:mm` in the chosen mode. */
  value: string;
  /** Local time-zone offset in hours (LT = UTC + tz). */
  tz: string;
}

export interface SpeedConsConstraint {
  minSpeed: string;
  maxSpeed: string;
  minRpm: string;
  maxRpm: string;
  maxFoPerDay: string;
  maxGoPerDay: string;
}

export interface VoyageLimits {
  marketFactors: MarketFactors;
  weatherLimits: WeatherSafetyLimits;
  rta: RtaConstraint;
  speedCons: SpeedConsConstraint;
  requirements: string;
}

export interface LimitsHistoryEntry {
  id: string;
  /** ISO timestamp. */
  at: string;
  /** Who made the change. */
  by: string;
  /** Short summary of what changed. */
  summary: string;
  /** Per-field before/after values for the change. */
  changes?: LimitsChange[];
}

/** One field's value before and after a change, for the audit log. */
export interface LimitsChange {
  /** Human-readable field name, e.g. "Market Factors · FO Price". */
  field: string;
  before: string;
  after: string;
}

export const DEFAULT_LIMITS: VoyageLimits = {
  marketFactors: {
    foPrice: '620',
    goPrice: '700',
    euaPrice: '80',
    hirePerDay: '14000',
    freightRate: '',
  },
  weatherLimits: {
    maxSwh: '4.5',
    maxWind: '7',
    maxSeaState: '5',
    maxRollPeriod: '',
    maxSwell: '3.0',
  },
  rta: {
    enabled: true,
    mode: 'UTC',
    value: '2026-07-08T06:00',
    tz: '8',
  },
  speedCons: {
    minSpeed: '9.5',
    maxSpeed: '13.0',
    minRpm: '',
    maxRpm: '',
    maxFoPerDay: '24',
    maxGoPerDay: '0.1',
  },
  requirements: '',
};

const STORAGE_KEY = 'fv.voyageLimits';
const HISTORY_KEY = 'fv.voyageLimits.history';

/** Merge a parsed snapshot with the defaults so old saves stay valid. */
function mergeWithDefaults(parsed: Partial<VoyageLimits> | undefined): VoyageLimits {
  if (!parsed) return structuredClone(DEFAULT_LIMITS);
  return {
    marketFactors: { ...DEFAULT_LIMITS.marketFactors, ...parsed.marketFactors },
    weatherLimits: { ...DEFAULT_LIMITS.weatherLimits, ...parsed.weatherLimits },
    rta: { ...DEFAULT_LIMITS.rta, ...parsed.rta },
    speedCons: { ...DEFAULT_LIMITS.speedCons, ...parsed.speedCons },
    requirements: parsed.requirements ?? DEFAULT_LIMITS.requirements,
  };
}

export function loadLimits(): VoyageLimits {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Merge with defaults so newly added fields don't break older saves.
      return {
        marketFactors: { ...DEFAULT_LIMITS.marketFactors, ...parsed.marketFactors },
        weatherLimits: { ...DEFAULT_LIMITS.weatherLimits, ...parsed.weatherLimits },
        rta: { ...DEFAULT_LIMITS.rta, ...parsed.rta },
        speedCons: { ...DEFAULT_LIMITS.speedCons, ...parsed.speedCons },
        requirements: parsed.requirements ?? DEFAULT_LIMITS.requirements,
      };
    }
  } catch {
    /* fall back to defaults */
  }
  return structuredClone(DEFAULT_LIMITS);
}

export function saveLimits(limits: VoyageLimits): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(limits));
  } catch {
    /* storage unavailable */
  }
}

/** Per-voyage variant of {@link loadLimits} (falls back to the global store). */
export function loadLimitsFor(voyageId: string | undefined): VoyageLimits {
  if (!voyageId) return loadLimits();
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}.${voyageId}`);
    if (raw) return mergeWithDefaults(JSON.parse(raw));
  } catch {
    /* fall back to defaults */
  }
  return structuredClone(DEFAULT_LIMITS);
}

/** Per-voyage variant of {@link saveLimits}. */
export function saveLimitsFor(voyageId: string | undefined, limits: VoyageLimits): void {
  const storageKey = voyageId ? `${STORAGE_KEY}.${voyageId}` : STORAGE_KEY;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(limits));
  } catch {
    /* storage unavailable */
  }
}

export function loadLimitsHistory(): LimitsHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as LimitsHistoryEntry[];
  } catch {
    /* ignore */
  }
  return [];
}

export function appendLimitsHistory(entry: LimitsHistoryEntry): LimitsHistoryEntry[] {
  const next = [entry, ...loadLimitsHistory()].slice(0, 100);
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function newHistoryId(): string {
  return `lh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Human-readable list of which sections changed between two snapshots. */
export function diffLimits(a: VoyageLimits, b: VoyageLimits): string[] {
  const changed: string[] = [];
  const eq = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  if (!eq(a.marketFactors, b.marketFactors)) changed.push('Market Factors');
  if (!eq(a.weatherLimits, b.weatherLimits)) changed.push('Weather Safety Limits');
  if (!eq(a.rta, b.rta)) changed.push('RTA Constraint');
  if (!eq(a.speedCons, b.speedCons)) changed.push('Speed / Cons Constraint');
  if (a.requirements !== b.requirements) changed.push('Requirements');
  return changed;
}

/** Flatten a limits snapshot into labelled scalar values for the audit diff. */
function flattenLimits(l: VoyageLimits): Record<string, string> {
  return {
    'Market Factors · FO Price': l.marketFactors.foPrice,
    'Market Factors · GO Price': l.marketFactors.goPrice,
    'Market Factors · EUA Price': l.marketFactors.euaPrice,
    'Market Factors · Hire Per Day': l.marketFactors.hirePerDay,
    'Market Factors · Freight Rate': l.marketFactors.freightRate,
    'Weather · Max Sig Wave Height': l.weatherLimits.maxSwh,
    'Weather · Max Wind Speed': l.weatherLimits.maxWind,
    'Weather · Max Sea State': l.weatherLimits.maxSeaState,
    'Weather · Max Swell': l.weatherLimits.maxSwell,
    'Weather · Max Roll Period': l.weatherLimits.maxRollPeriod,
    'RTA · Enabled': l.rta.enabled ? 'Yes' : 'No',
    'RTA · Entered In': l.rta.mode,
    'RTA · Value': l.rta.value,
    'RTA · Time Zone': l.rta.tz,
    'Speed / Cons · Min Speed': l.speedCons.minSpeed,
    'Speed / Cons · Max Speed': l.speedCons.maxSpeed,
    'Speed / Cons · Min RPM': l.speedCons.minRpm,
    'Speed / Cons · Max RPM': l.speedCons.maxRpm,
    'Speed / Cons · Max FO / Day': l.speedCons.maxFoPerDay,
    'Speed / Cons · Max GO / Day': l.speedCons.maxGoPerDay,
    'Requirements / Notes': l.requirements,
  };
}

/** Per-field before/after diff between two snapshots for the audit log. */
export function diffLimitsDetailed(a: VoyageLimits, b: VoyageLimits): LimitsChange[] {
  const fa = flattenLimits(a);
  const fb = flattenLimits(b);
  const out: LimitsChange[] = [];
  (Object.keys(fa) as (keyof typeof fa)[]).forEach((key) => {
    if (fa[key] !== fb[key]) {
      out.push({ field: key, before: fa[key] || '—', after: fb[key] || '—' });
    }
  });
  return out;
}
