/**
 * Accounts Configuration History — a fleet-wide automatic audit log of every change made in the
 * Accounts module: transaction status/approval changes, SWIFT document uploads, new transactions,
 * counterparty bank-detail edits, and company settings (Cash In Bank, company bank account).
 *
 * Settings-style fields (Cash In Bank, Company Bank Account) are logged via a quiet-period
 * debounce + before/after diff — the SAME mechanism `src/data/opsConfigHistory.ts` uses for the
 * Operations recap — so typing "101" into a field logs one entry (— → 101), never one entry per
 * keystroke (1 → 10 → 101). Discrete, already-atomic actions (status dropdown, SWIFT upload,
 * transaction creation) are appended directly since there is no keystroke risk for those.
 *
 * Backed by the tenant database (same Settings key-value API as `workflowConfig`): localStorage is
 * the instant offline cache, writes push through to the backend (debounced), and
 * `hydrateConfigHistory` pulls the server copy down.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { settingsApi } from '../api/settingsApi';

export interface ConfigHistoryEntry {
  id: string;
  /** ISO timestamp. */
  at: string;
  /** Who made the change. */
  by: string;
  /** Human-readable field/action name. */
  field: string;
  before: string;
  after: string;
}

const KEY = 'fv.acctConfigHistory';
const SETTING_KEY = 'acctConfigHistory';
const EVENT = 'fv-acct-config-history';
const MAX_ENTRIES = 500;
/** Above this many simultaneously-changed fields, log one consolidated entry instead of flooding
 *  the log with one row per field. */
const BULK_THRESHOLD = 12;

// Debounced write-through to the backend, same pattern as workflowConfig/opsConfigHistory.
let pushTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedPut(list: ConfigHistoryEntry[]): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void settingsApi.put(SETTING_KEY, list).catch(() => { /* offline — localStorage keeps it */ });
  }, 800);
}

function readFromStorage(): ConfigHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as ConfigHistoryEntry[];
  } catch {
    /* ignore malformed */
  }
  return [];
}

// Module-level cache with a stable reference — required by useSyncExternalStore (a getSnapshot
// that parses JSON fresh on every call would return a new array identity each render and loop).
let cache: ConfigHistoryEntry[] = readFromStorage();

export function loadConfigHistory(): ConfigHistoryEntry[] {
  return cache;
}

function persist(list: ConfigHistoryEntry[]): void {
  cache = list;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
  debouncedPut(list);
  try {
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* ignore */
  }
}

/** Append new entries (newest first), capped at {@link MAX_ENTRIES}. */
export function appendConfigHistory(entries: ConfigHistoryEntry[]): void {
  if (entries.length === 0) return;
  const next = [...entries, ...loadConfigHistory()].slice(0, MAX_ENTRIES);
  persist(next);
}

/** Pull the server copy of the Accounts config history into the local cache. */
export async function hydrateConfigHistory(): Promise<ConfigHistoryEntry[]> {
  try {
    const res = await settingsApi.get(SETTING_KEY);
    const parsed = JSON.parse(res.valueJson);
    if (Array.isArray(parsed)) {
      cache = parsed as ConfigHistoryEntry[];
      try { window.localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent(EVENT));
      return cache;
    }
  } catch {
    /* offline / not found — keep the local cache */
  }
  return loadConfigHistory();
}


export function subscribeConfigHistory(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/** Reactive hook for the Configuration History tab — hydrates from the backend on mount, then
 *  re-renders whenever a new entry is appended (locally or from another tab/device). */
export function useAcctConfigHistory(): ConfigHistoryEntry[] {
  useEffect(() => {
    void hydrateConfigHistory();
  }, []);
  return useSyncExternalStore(subscribeConfigHistory, loadConfigHistory, loadConfigHistory);
}

export function newConfigHistoryId(): string {
  return `ach-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Friendly labels for the trackable Accounts settings fields; anything else falls back to a
 *  camelCase → Title Case conversion so every field still gets a readable name. */
const FIELD_LABELS: Record<string, string> = {
  cashInBankUsd: 'Cash In Bank (USD)',
  companyBankVerified: 'Company Bank — Verified',
  companyBankDetails: 'Company Bank — Details',
  companyBankName: 'Company Bank — Bank Name',
  companyBankAccountHolder: 'Company Bank — Account Holder',
  companyBankAccountNumber: 'Company Bank — Account Number',
  companyBankSwift: 'Company Bank — SWIFT',
  companyBankIban: 'Company Bank — IBAN',
};

function labelFor(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  // camelCase -> Title Case fallback, e.g. "someNewField" -> "Some New Field".
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

function summarizeValue(v: unknown): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  return 'Updated';
}

/** Shallow diff between two flat settings snapshots — one entry per changed field, or a single
 *  consolidated entry when a large batch changed at once. */
export function diffAcctSettings(before: Record<string, unknown>, after: Record<string, unknown>, by: string): ConfigHistoryEntry[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (before[key] !== after[key]) changed.push(key);
  }
  if (changed.length === 0) return [];
  const at = new Date().toISOString();
  if (changed.length > BULK_THRESHOLD) {
    return [{
      id: newConfigHistoryId(), at, by,
      field: `Bulk update (${changed.length} fields)`,
      before: '—',
      after: changed.map(labelFor).slice(0, 8).join(', ') + (changed.length > 8 ? ', …' : ''),
    }];
  }
  return changed.map((key) => ({
    id: newConfigHistoryId(),
    at,
    by,
    field: labelFor(key),
    before: summarizeValue(before[key]),
    after: summarizeValue(after[key]),
  }));
}
