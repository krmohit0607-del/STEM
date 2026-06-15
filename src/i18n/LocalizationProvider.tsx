import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { api } from '../api/client';
import type { LocaleDictionary } from '../types';

/**
 * React port of `Localization.js` + `_l()` / `_q()` helpers.
 *
 * Calls:
 *   GET /api/cultureinfo/currentlanguage  -> "en-US" | "fr-CA" | ...
 *   GET /api/cultureinfo/locale/{lang}    -> { key: translation, ... }
 */

interface LocalizationContextValue {
  /** Locale string e.g. "en-US". */
  culture: string;
  /** Lookup table loaded for the current culture. */
  dictionary: LocaleDictionary;
  /** True while either request is in flight. */
  isLoading: boolean;
  /** Translate `key`; falls back to the key when not found (legacy behavior). */
  l: (key: string) => string;
}

const LocalizationReactContext = createContext<LocalizationContextValue | undefined>(undefined);

const SUPPORTED_LOCALE_PREFIXES = ['en', 'fr'] as const;

function chooseLocaleEndpoint(culture: string): string {
  // Legacy: most-specific match first ("en-US" -> "en"). Default "en".
  const parts = culture.split('-');
  for (const part of parts) {
    if ((SUPPORTED_LOCALE_PREFIXES as readonly string[]).includes(part)) {
      return `/api/cultureinfo/locale/${part}`;
    }
  }
  return '/api/cultureinfo/locale/en';
}

export function LocalizationProvider({ children }: { children: ReactNode }) {
  const [culture, setCulture] = useState('en-US');
  const [dictionary, setDictionary] = useState<LocaleDictionary>({});
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lang = await api
          .get<string>('/api/cultureinfo/currentlanguage')
          .catch(() => 'en-US');
        if (cancelled) return;
        const effective = lang || 'en-US';
        setCulture(effective);
        const dict = await api
          .get<LocaleDictionary>(chooseLocaleEndpoint(effective))
          .catch(() => ({}) as LocaleDictionary);
        if (cancelled) return;
        setDictionary(dict);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const l = useCallback(
    (key: string) => {
      const value = dictionary[key];
      return typeof value === 'string' && value.length > 0 ? value : key;
    },
    [dictionary],
  );

  const value = useMemo<LocalizationContextValue>(
    () => ({ culture, dictionary, isLoading, l }),
    [culture, dictionary, isLoading, l],
  );

  return (
    <LocalizationReactContext.Provider value={value}>{children}</LocalizationReactContext.Provider>
  );
}

export function useLocalization(): LocalizationContextValue {
  const ctx = useContext(LocalizationReactContext);
  if (!ctx) throw new Error('useLocalization must be used inside <LocalizationProvider>');
  return ctx;
}

/** Convenience: returns just the `_l()` translator. */
export function useL(): (key: string) => string {
  return useLocalization().l;
}
