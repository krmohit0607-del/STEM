export interface SavedPassage {
  id: string;
  name: string;
  source?: string;
  points: [number, number][];
}

import { settingsApi } from '../api/settingsApi';

const SETTING_KEY = 'savedPassages';

const STORAGE_KEY = 'fv.savedPassages';

function readStored(): SavedPassage[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadSavedPassages(): SavedPassage[] {
  return readStored();
}

export function saveSavedPassages(passages: SavedPassage[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(passages));
    window.dispatchEvent(new CustomEvent('fv-saved-passages-changed'));
  } catch {
  }
  void settingsApi.put(SETTING_KEY, passages).catch(() => { /* local fallback */ });
}

async function hydrateSavedPassages(): Promise<void> {
  try {
    const setting = await settingsApi.get(SETTING_KEY);
    const parsed = JSON.parse(setting.valueJson) as unknown;
    if (Array.isArray(parsed)) {
      saveLocal(parsed as SavedPassage[]);
      window.dispatchEvent(new CustomEvent('fv-saved-passages-changed'));
    }
  } catch {
    const local = readStored();
    if (local.length) void settingsApi.put(SETTING_KEY, local).catch(() => { /* unavailable */ });
  }
}

function saveLocal(passages: SavedPassage[]): void {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(passages)); } catch { /* ignore */ }
}

export async function loadBundledSavedPassages(): Promise<SavedPassage[]> {
  try {
    const response = await fetch('/saved-passages.json');
    if (!response.ok) return [];
    const parsed = await response.json();
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function mergeSavedPassages(bundled: SavedPassage[]): SavedPassage[] {
  const current = readStored();
  const known = new Set(current.map((passage) => passage.id));
  const next = [...current, ...bundled.filter((passage) => !known.has(passage.id))];
  saveSavedPassages(next);
  return next;
}

void hydrateSavedPassages();
