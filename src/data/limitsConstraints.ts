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
