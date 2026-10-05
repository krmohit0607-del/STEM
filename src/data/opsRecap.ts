/**
 * Shared, persistent per-voyage Operations recap store.
 *
 * The recap is backed by the tenant database (via the Settings key-value API):
 * localStorage is an instant offline cache, writes are debounced-through to the
 * backend, and `hydrateOpsRecap` pulls the server copy on load. Any component
 * can push a change with `patchOpsRecap`, and every open Operations view for
 * that voyage updates automatically.
 */
import { settingsApi } from '../api/settingsApi';

const KEY = (id: string) => `fv.opsRecap.${id}`;
const EVENT = 'fv-ops-recap';
const RECAP_SETTING = (id: string) => `opsRecap.${id}`;
const BASELINE_SETTING = (id: string) => `opsEstBaseline.${id}`;

// Debounced write-through to the backend so keystroke-level edits don't spam the API.
const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();
function debouncedPut(settingKey: string, raw: string): void {
  const existing = pushTimers.get(settingKey);
  if (existing) clearTimeout(existing);
  pushTimers.set(settingKey, setTimeout(() => {
    pushTimers.delete(settingKey);
    try {
      settingsApi.put(settingKey, JSON.parse(raw)).catch(() => { /* offline — localStorage keeps it */ });
    } catch { /* malformed — skip backend push */ }
  }, 800));
}

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

/** Persist a recap (as a pre-serialised JSON string), mirror to backend, notify listeners. */
export function writeOpsRecapRaw(voyageId: string | undefined, raw: string): void {
  if (!voyageId) return;
  try {
    window.localStorage.setItem(KEY(voyageId), raw);
  } catch {
    /* storage unavailable — ignore */
  }
  debouncedPut(RECAP_SETTING(voyageId), raw);
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { id: voyageId } }));
  } catch {
    /* ignore */
  }
}

/** Pull the server copy of the recap into the local cache; returns true if it changed. */
export async function hydrateOpsRecap(voyageId: string | undefined): Promise<boolean> {
  if (!voyageId) return false;
  try {
    const res = await settingsApi.get(RECAP_SETTING(voyageId));
    const valueJson = res?.valueJson;
    if (!valueJson) return false;
    if (valueJson === readOpsRecapRaw(voyageId)) return false;
    window.localStorage.setItem(KEY(voyageId), valueJson);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { id: voyageId } }));
    return true;
  } catch {
    return false; // offline / not found — keep the local cache
  }
}

/**
 * Immutable estimate baseline captured at Chartering → Operations handover.
 * The live recap (above) is edited by Operations/Postfix and represents the
 * "Actual" side; this snapshot preserves the fixed estimate for the Live P&L
 * "Estimated" column so it never drifts as operational figures change.
 */
const BASELINE_KEY = (id: string) => `fv.opsEstBaseline.${id}`;

/** Persist the estimate baseline (pre-serialised JSON) for a voyage. */
export function writeOpsEstBaseline(voyageId: string | undefined, raw: string): void {
  if (!voyageId) return;
  try {
    window.localStorage.setItem(BASELINE_KEY(voyageId), raw);
  } catch {
    /* storage unavailable — ignore */
  }
  debouncedPut(BASELINE_SETTING(voyageId), raw);
}

/** Pull the server copy of the estimate baseline into the local cache. */
export async function hydrateOpsEstBaseline(voyageId: string | undefined): Promise<void> {
  if (!voyageId) return;
  try {
    const res = await settingsApi.get(BASELINE_SETTING(voyageId));
    const valueJson = res?.valueJson;
    if (valueJson) window.localStorage.setItem(BASELINE_KEY(voyageId), valueJson);
  } catch {
    /* offline / not found — keep the local cache */
  }
}

/** Parsed estimate baseline for a voyage (partial; undefined when none). */
export function loadOpsEstBaseline(voyageId: string | undefined): Record<string, unknown> | undefined {
  if (!voyageId) return undefined;
  try {
    const raw = window.localStorage.getItem(BASELINE_KEY(voyageId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    /* ignore malformed / storage unavailable */
  }
  return undefined;
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
