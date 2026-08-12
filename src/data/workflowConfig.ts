import { useSyncExternalStore } from 'react';

/**
 * Company-level workflow configuration flags, stored in localStorage and
 * reactive (any component using the hooks re-renders when values change).
 */

const KEY = 'fv.workflowConfig';

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
}

const DEFAULTS: WorkflowConfig = {
  postfixAlwaysShowOpsVoyages: false,
  companyName: '',
  companyAddress: '',
  companyLogoDataUrl: '',
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
  emit();
}

export function useWorkflowConfig(): WorkflowConfig {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    getWorkflowConfig,
    getWorkflowConfig,
  );
}
