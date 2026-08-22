export interface SavedPassage {
  id: string;
  name: string;
  source?: string;
  points: [number, number][];
}

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
