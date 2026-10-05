import { useSyncExternalStore } from 'react';
import { settingsApi } from '../api/settingsApi';

/**
 * Company-level workflow configuration flags, stored in localStorage and
 * reactive (any component using the hooks re-renders when values change).
 * Also written through to the tenant database via the Settings key-value API
 * so the company name/address/logo/bank details used on invoices and the
 * postfix workflow flag are shared across devices, not just one browser.
 */

const KEY = 'fv.workflowConfig';
const SETTING_KEY = 'workflowConfig';

export interface WorkflowConfig {
  /**
   * When true: every voyage that exists in Operations also appears in Postfix
   * automatically (for companies where Operations handles postfix work).
   * When false: a voyage appears in Postfix only after Operations explicitly
   * clicks "Copy to Postfix" on the Freight Invoices or Laytime Calculations.
   */
  postfixAlwaysShowOpsVoyages: boolean;
  /** Full legal company name printed on invoices, SOA, freight laytime docs, etc. */
  companyName: string;
  /** Street / city / country address block (multi-line text). */
  companyAddress: string;
  /** Base-64 data-URL of the company logo image (PNG/JPG/SVG). */
  companyLogoDataUrl: string;
    /** Company bank account details for receiving payments. */
    companyBankAccount: {
      verified: boolean;
      details: string;
      bankName: string;
      accountHolder: string;
      accountNumber: string;
      swift: string;
      iban: string;
    };
  /** Cash-in-bank balance (USD) shown on the Accounts dashboard — manually maintained until a real bank feed is integrated, but persisted server-side like the rest of this config. */
  cashInBankUsd: number;
}

const DEFAULTS: WorkflowConfig = {
  postfixAlwaysShowOpsVoyages: false,
  companyName: '',
  companyAddress: '',
  companyLogoDataUrl: '',
    companyBankAccount: {
      verified: false,
      details: '',
      bankName: '',
      accountHolder: '',
      accountNumber: '',
      swift: '',
      iban: '',
    },
  cashInBankUsd: 4_245_890,
};

function load(): WorkflowConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

let snapshot = load();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function getWorkflowConfig(): WorkflowConfig {
  return snapshot;
}

export function setWorkflowConfig(patch: Partial<WorkflowConfig>): void {
  snapshot = { ...snapshot, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(snapshot)); } catch { /* ignore */ }
  void settingsApi.put(SETTING_KEY, snapshot).catch(() => { /* offline — localStorage keeps it */ });
  emit();
}

/** Pull the server copy of the company config into the local cache (called once on load). */
async function hydrateWorkflowConfig(): Promise<void> {
  try {
    const res = await settingsApi.get(SETTING_KEY);
    const parsed = JSON.parse(res.valueJson) as Partial<WorkflowConfig>;
    snapshot = { ...DEFAULTS, ...parsed };
    try { localStorage.setItem(KEY, JSON.stringify(snapshot)); } catch { /* ignore */ }
    emit();
  } catch {
    /* offline / not found — keep the local cache */
  }
}
void hydrateWorkflowConfig();

export function useWorkflowConfig(): WorkflowConfig {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    getWorkflowConfig,
    getWorkflowConfig,
  );
}
