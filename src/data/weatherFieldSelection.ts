/**
 * Shared on/off + factor-selection state for the weather field, backed by
 * `localStorage` + a `window` event so every mounted `WeatherFieldControl`
 * (and read-only consumers like the legend bar) stay in sync.
 *
 * Split out of `WeatherFieldControl.tsx` on purpose: a module that exports
 * both React components AND a plain hook can confuse Vite/React Fast
 * Refresh ("export is incompatible") during development, which previously
 * left stale/orphaned map layers behind after edits — keeping this a
 * component-free data module keeps `WeatherFieldControl.tsx` Fast-Refresh
 * safe.
 */
import { useEffect, useState } from 'react';

import { FIELD_FACTORS, getFieldFactor } from './weatherField';

export const ON_KEY = 'fv.map.weatherField.on';
export const FACTORS_KEY = 'fv.map.weatherField.factors';
export const EVENT = 'fv-weatherfield-change';

export function readOn(): boolean {
  try {
    return localStorage.getItem(ON_KEY) === '1';
  } catch {
    return false;
  }
}

export function readFactors(): string[] {
  try {
    const raw = localStorage.getItem(FACTORS_KEY);
    if (raw) {
      const ids = (JSON.parse(raw) as string[]).filter((id) => getFieldFactor(id));
      if (ids.length) return ids;
    }
    // Migrate the old single-factor key if present.
    const legacy = localStorage.getItem('fv.map.weatherField.factor');
    if (legacy && getFieldFactor(legacy)) return [legacy];
  } catch {
    /* ignore */
  }
  return [FIELD_FACTORS[0].id];
}

export function broadcast(): void {
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Reactive read of whether the weather field is on and which factor ids are
 * selected, kept in sync with every mounted `WeatherFieldControl` via the
 * same shared event + storage key those controls already use. `factorIds[0]`
 * is the "primary" factor that paints the colour field, so any external
 * legend (e.g. the map's top-of-map legend bar) should follow that one.
 */
export function useWeatherFieldSelection(): { on: boolean; factorIds: string[] } {
  const [on, setOn] = useState<boolean>(() => readOn());
  const [factorIds, setFactorIds] = useState<string[]>(() => readFactors());

  useEffect(() => {
    const sync = () => {
      setOn(readOn());
      setFactorIds(readFactors());
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return { on, factorIds };
}
