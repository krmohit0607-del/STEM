/**
 * Shared, persistent per-voyage Operations recap store.
 *
 * The Voyage Details / Operations recap is saved per voyage id in
 * localStorage so edits survive navigation & reload, sync across tabs, and are
 * reflected live anywhere that reads this store. Any component can push a
 * change with `patchOpsRecap(voyageId, patch)` and every open Operations view
 * for that voyage updates automatically. Swap for the real API when exposed.
 */

const KEY = (id: string) => `fv.opsRecap.${id}`;
const EVENT = 'fv-ops-recap';

/** Raw JSON string for a voyage's saved recap (or null when none). */
export function readOpsRecapRaw(voyageId: string | undefined): string | null {
  if (!voyageId) return null;
  try {
    return window.localStorage.getItem(KEY(voyageId));
  } catch {
    return null;
  }
}

/** Parsed saved recap for a voyage (partial; undefined when none). */
export function loadOpsRecap(voyageId: string | undefined): Record<string, unknown> | undefined {
  const raw = readOpsRecapRaw(voyageId);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    /* ignore malformed */
  }
  return undefined;
}

/** Persist a recap (as a pre-serialised JSON string) and notify listeners. */
export function writeOpsRecapRaw(voyageId: string | undefined, raw: string): void {
  if (!voyageId) return;
  try {
    window.localStorage.setItem(KEY(voyageId), raw);
  } catch {
    /* storage unavailable — ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { id: voyageId } }));
  } catch {
    /* ignore */
  }
}

/** Merge a field patch into a voyage's recap — the way other pages push edits. */
export function patchOpsRecap(voyageId: string | undefined, patch: Record<string, unknown>): void {
  if (!voyageId) return;
  const current = loadOpsRecap(voyageId) ?? {};
  writeOpsRecapRaw(voyageId, JSON.stringify({ ...current, ...patch }));
}

/** Subscribe to recap changes for a voyage (same-tab custom event + cross-tab storage). */
export function subscribeOpsRecap(voyageId: string | undefined, cb: () => void): () => void {
  if (!voyageId) return () => {};
  const onCustom = (e: Event) => {
    if ((e as CustomEvent).detail?.id === voyageId) cb();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY(voyageId)) cb();
  };
  window.addEventListener(EVENT, onCustom as EventListener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onCustom as EventListener);
    window.removeEventListener('storage', onStorage);
  };
}
