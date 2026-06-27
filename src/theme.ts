import { useSyncExternalStore } from 'react';

/**
 * Global app theme.
 *
 * A single source of truth shared by every theme toggle in the app. The theme
 * is persisted to `localStorage` and applied as an `fv-light` class on the
 * document root so all components can be styled from one place. Any number of
 * toggles can call `toggleTheme()` / `setTheme()` and they stay in sync via the
 * `useTheme()` hook.
 */

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'fv.theme';
const listeners = new Set<() => void>();

function readStoredTheme(): Theme {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

let current: Theme = readStoredTheme();

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('fv-light', theme === 'light');
}

// Apply the persisted theme as soon as this module loads.
applyTheme(current);

// Keep separate tabs/windows in sync: when another tab changes the theme,
// `localStorage` fires a `storage` event here.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    const next: Theme = event.newValue === 'light' ? 'light' : 'dark';
    if (next === current) return;
    current = next;
    applyTheme(next);
    listeners.forEach((listener) => listener());
  });
}

export function getTheme(): Theme {
  return current;
}

export function setTheme(theme: Theme): void {
  if (theme === current) return;
  current = theme;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
  listeners.forEach((listener) => listener());
}

export function toggleTheme(): void {
  setTheme(current === 'dark' ? 'light' : 'dark');
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Subscribe a component to the global theme. Returns `[theme, toggleTheme]`. */
export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(subscribe, getTheme, getTheme);
  return [theme, toggleTheme];
}
