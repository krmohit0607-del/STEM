import { useSyncExternalStore, useEffect } from 'react';
import { charteringApi, type VoyageEstimateDto } from '../api/charteringApi';

/** A saved voyage estimate (persisted with backend sync). */
export interface SavedEstimate {
  id: string;
  estNo: string;
  vessel: string;
  fixType: string;
  status: string;
  profit: number;
  tce: number;
  savedAt: string;
  /** Full snapshot ({ inputs, vessel }) for reopening the estimate. */
  data: unknown;
}

const KEY = 'fv.savedEstimates';
let items: SavedEstimate[] = load();
const listeners = new Set<() => void>();

function load(): SavedEstimate[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedEstimate[]) : [];
    if (!Array.isArray(parsed)) return [];
    return migrateEstNos(parsed);
  } catch {
    return [];
  }
}

/** Replace legacy `EST-new-<timestamp>` (and other malformed) numbers with clean
 * sequential `EST-YYMM-NN` values, persisting the fix once. */
function migrateEstNos(list: SavedEstimate[]): SavedEstimate[] {
  const clean = /^EST-\d{4}-\d{2,}$/;
  const counters = new Map<string, number>();
  for (const it of list) {
    const m = /^(EST-\d{4}-)(\d+)$/.exec(it.estNo ?? '');
    if (m) counters.set(m[1], Math.max(counters.get(m[1]) ?? 0, parseInt(m[2], 10)));
  }
  let changed = false;
  const out = list.map((it) => {
    if (it.estNo && clean.test(it.estNo)) return it;
    const d = new Date(it.savedAt);
    const date = Number.isNaN(d.getTime()) ? new Date() : d;
    const prefix = `EST-${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, '0')}-`;
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    changed = true;
    return { ...it, estNo: `${prefix}${String(next).padStart(2, '0')}` };
  });
  if (changed) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(out));
    } catch {
      /* storage unavailable — ignore */
    }
  }
  return out;
}

function persist(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable — ignore */
  }
  listeners.forEach((l) => l());
}

function mapDtoToSavedEstimate(dto: VoyageEstimateDto): SavedEstimate {
  let parsedData: unknown = undefined;
  if (dto.dataJson) {
    try {
      parsedData = JSON.parse(dto.dataJson);
    } catch {
      /* ignore */
    }
  }

  return {
    id: dto.id,
    estNo: dto.estimateNo,
    vessel: dto.vesselName,
    fixType: dto.fixType,
    status: dto.status,
    profit: dto.profit,
    tce: dto.tce,
    savedAt: dto.createdAt,
    data: parsedData,
  };
}

export async function syncEstimatesFromBackend(): Promise<SavedEstimate[]> {
  try {
    const list = await charteringApi.getEstimates();
    if (list) {
      // Update items with whatever the backend returns (including empty array)
      const mapped = list.map(mapDtoToSavedEstimate);
      items = mapped;
      persist();
      listeners.forEach((l) => l()); // Notify subscribers of the change
      return mapped;
    }
  } catch (error) {
    // If sync fails, at least notify listeners of current state
    console.error('Failed to sync estimates from backend:', error);
    listeners.forEach((l) => l());
  }
  return items;
}

/** Insert or update a saved estimate by id. */
export function upsertSavedEstimate(rec: SavedEstimate): void {
  const i = items.findIndex((x) => x.id === rec.id);
  if (i >= 0) items = items.map((x, idx) => (idx === i ? rec : x));
  else items = [rec, ...items];
  persist();

  // Push to backend
  void (async () => {
    try {
      await charteringApi.upsertEstimate({
        id: rec.id,
        estimateNo: rec.estNo,
        vesselName: rec.vessel,
        fixType: rec.fixType,
        status: rec.status,
        profit: rec.profit,
        tce: rec.tce,
        dataJson: rec.data ? JSON.stringify(rec.data) : undefined,
      });
    } catch {
      /* fallback */
    }
  })();
}

export function deleteSavedEstimate(id: string): Promise<void> {
  // Store the item in case we need to restore it
  const itemToDelete = items.find((x) => x.id === id);
  if (!itemToDelete) {
    return Promise.resolve(); // Item not found, nothing to delete
  }

  items = items.filter((x) => x.id !== id);
  persist(); // This calls listeners immediately to update UI

  // Attempt to delete from backend asynchronously
  return (async () => {
    try {
      // Only call backend delete if ID is a GUID (not a draft ID like 'est-book-...')
      if (!id.startsWith('est-') && id.includes('-')) {
        await charteringApi.deleteEstimate(id);
      }
    } catch (error) {
      // Restore the item if backend deletion fails
      items = [...items, itemToDelete].sort((a, b) => a.estNo.localeCompare(b.estNo));
      persist();
      throw error; // Re-throw so caller knows about the error
    }
  })();
}

/** Update just the status of a saved estimate (no-op if not saved / unchanged). */
export function setSavedEstimateStatus(id: string, status: string): void {
  const i = items.findIndex((x) => x.id === id);
  if (i < 0 || items[i].status === status) return;
  items = items.map((x, idx) => (idx === i ? { ...x, status } : x));
  persist();

  const it = items[i];
  void (async () => {
    try {
      await charteringApi.upsertEstimate({
        id: it.id,
        estimateNo: it.estNo,
        vesselName: it.vessel,
        fixType: it.fixType,
        status: status,
        profit: it.profit,
        tce: it.tce,
      });
    } catch {
      /* fallback */
    }
  })();
}

export function getSavedEstimates(): SavedEstimate[] {
  return items;
}

export function getSavedEstimate(id: string): SavedEstimate | undefined {
  return items.find((x) => x.id === id);
}

/** Next human-readable estimate number, e.g. EST-2608-01 (EST-YYMM-seq). The
 * sequence increments per calendar month across all saved estimates. */
export function nextEstimateNo(date: Date = new Date()): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const prefix = `EST-${yy}${mm}-`;
  let max = 0;
  for (const it of items) {
    if (it.estNo?.startsWith(prefix)) {
      const n = parseInt(it.estNo.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}

export function useSavedEstimates(): SavedEstimate[] {
  useEffect(() => {
    void syncEstimatesFromBackend();
  }, []);
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    getSavedEstimates,
    getSavedEstimates,
  );
}
