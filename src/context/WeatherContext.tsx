import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  WEATHER_FACTORS,
  envApiKey,
  getFactor,
  type WeatherFactor,
} from '../api/stormglass';

/**
 * Global, app-wide marine-weather overlay settings shared by every map.
 *
 * Holds the master on/off switch, the set of selected weather factors,
 * and the user's Storm Glass API key. Everything is persisted to
 * `localStorage` so the choice sticks across reloads and is identical on
 * all maps in the app.
 */
export interface WeatherContextValue {
  /** Master switch — when false no map fetches or renders weather. */
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  toggleEnabled: () => void;
  /** Ids of the factors the user wants drawn on the maps. */
  selectedIds: string[];
  toggleFactor: (id: string) => void;
  /** Resolved selected factors, in catalogue order. */
  selectedFactors: WeatherFactor[];
  /** All factors that can be picked. */
  allFactors: WeatherFactor[];
  /** Storm Glass API key (user supplied or from the build env). */
  apiKey: string;
  setApiKey: (v: string) => void;
}

const ENABLED_KEY = 'fv.weather.enabled';
const FACTORS_KEY = 'fv.weather.factors';
const APIKEY_KEY = 'fv.weather.apiKey';

const DEFAULT_FACTOR_IDS = ['waveHeight', 'windSpeed'];

const WeatherReactContext = createContext<WeatherContextValue | undefined>(undefined);

function readEnabled(): boolean {
  return localStorage.getItem(ENABLED_KEY) === '1';
}

function readFactorIds(): string[] {
  try {
    const raw = localStorage.getItem(FACTORS_KEY);
    if (raw) {
      const ids = JSON.parse(raw) as string[];
      const valid = ids.filter((id) => getFactor(id));
      if (valid.length) return valid;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_FACTOR_IDS;
}

function readApiKey(): string {
  return localStorage.getItem(APIKEY_KEY) ?? envApiKey();
}

export function WeatherProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(readEnabled);
  const [selectedIds, setSelectedIds] = useState<string[]>(readFactorIds);
  const [apiKey, setApiKeyState] = useState<string>(readApiKey);

  useEffect(() => {
    localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
  }, [enabled]);
  useEffect(() => {
    localStorage.setItem(FACTORS_KEY, JSON.stringify(selectedIds));
  }, [selectedIds]);
  useEffect(() => {
    if (apiKey) localStorage.setItem(APIKEY_KEY, apiKey);
    else localStorage.removeItem(APIKEY_KEY);
  }, [apiKey]);

  const setEnabled = useCallback((v: boolean) => setEnabledState(v), []);
  const toggleEnabled = useCallback(() => setEnabledState((v) => !v), []);
  const setApiKey = useCallback((v: string) => setApiKeyState(v.trim()), []);

  const toggleFactor = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const selectedFactors = useMemo(
    () => WEATHER_FACTORS.filter((f) => selectedIds.includes(f.id)),
    [selectedIds],
  );

  const value = useMemo<WeatherContextValue>(
    () => ({
      enabled,
      setEnabled,
      toggleEnabled,
      selectedIds,
      toggleFactor,
      selectedFactors,
      allFactors: WEATHER_FACTORS,
      apiKey,
      setApiKey,
    }),
    [enabled, setEnabled, toggleEnabled, selectedIds, toggleFactor, selectedFactors, apiKey, setApiKey],
  );

  return (
    <WeatherReactContext.Provider value={value}>{children}</WeatherReactContext.Provider>
  );
}

export function useWeather(): WeatherContextValue {
  const ctx = useContext(WeatherReactContext);
  if (!ctx) throw new Error('useWeather must be used inside <WeatherProvider>');
  return ctx;
}
