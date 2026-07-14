import { useSyncExternalStore } from 'react';

/**
 * Cross-page "selected leg" plumbing.
 *
 * The leg the operator picks in the top header (STEM row) leg dropdown is the
 * single source of truth for the active leg across the app. Pages such as the
 * Interim Dashboard read it via `useSelectedLegNo()` instead of owning their
 * own leg picker, so the header selection and the page stay in sync.
 *
 * The value is the leg's `no` (e.g. "LEG-1"), matching `buildView(voyage).legs`.
 * It is mirrored to `localStorage` so a selection survives reloads, and a small
 * listener set keeps every mounted consumer live-updated within the session.
 */

const STORAGE_KEY = 'fv.selectedLegNo';

let current: string | undefined = read();
const listeners = new Set<() => void>();

function read(): string | undefined {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function getSelectedLegNo(): string | undefined {
  return current;
}

export function setSelectedLegNo(no: string): void {
  if (current === no) return;
  current = no;
  try {
    window.localStorage.setItem(STORAGE_KEY, no);
  } catch {
    /* ignore */
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive hook returning the currently selected leg `no` (or undefined). */
export function useSelectedLegNo(): string | undefined {
  return useSyncExternalStore(subscribe, getSelectedLegNo, getSelectedLegNo);
}
