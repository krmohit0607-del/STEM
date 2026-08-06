/**
 * Per-voyage Emissions & Compliance workspace document.
 *
 * Kept separate from the Operations recap so the Emissions module can persist
 * its editable/manual data (compliance statuses, manual adjustments with audit
 * trail, header overrides) independently. Metrics themselves are derived live
 * from the shared voyage recap; this store only holds what the user edits.
 */

export interface EmissionAdjustment {
  id: string;
  field: string;
  oldValue: string;
  newValue: string;
  reason: string;
  createdBy: string;
  createdDate: string;
  modifiedBy: string;
  modifiedDate: string;
  approvedBy: string;
  approvedDate: string;
}

export interface ComplianceItem {
  status: string;          // Ready / Pending / Submitted / Verified / Rejected
  submissionDate: string;
  verifier: string;
  dueDate: string;
  comments: string;
}

export interface EmissionsDoc {
  complianceYear: string;
  trade: string;
  euaPriceEur: string;       // current EUA market price (€/EUA)
  co2AdjustmentT: string;    // manual CO2 delta applied to the total (t)
  compliance: Record<string, ComplianceItem>;
  adjustments: EmissionAdjustment[];
  approvedBy: string;
  approvedDate: string;
  updatedAt: string;
}

const KEY = (id: string) => `fv.emissions.${id}`;
const EVENT = 'fv-emissions-doc';

export function defaultEmissionsDoc(): EmissionsDoc {
  const mk = (status: string, dueDate: string): ComplianceItem => ({ status, submissionDate: '', verifier: '', dueDate, comments: '' });
  return {
    complianceYear: String(new Date().getFullYear()),
    trade: '',
    euaPriceEur: '72.50',
    co2AdjustmentT: '0',
    compliance: {
      'IMO DCS': mk('Pending', '30-06'),
      'EU MRV': mk('Ready', '31-03'),
      'FuelEU': mk('Pending', '30-04'),
      'CII': mk('Ready', '31-05'),
      'SEEMP': mk('Verified', '—'),
      'SOx': mk('Verified', '—'),
      'NOx': mk('Verified', '—'),
    },
    adjustments: [],
    approvedBy: '',
    approvedDate: '',
    updatedAt: '',
  };
}

export function readEmissionsRaw(voyageId: string | undefined): string | null {
  if (!voyageId) return null;
  try {
    return window.localStorage.getItem(KEY(voyageId));
  } catch {
    return null;
  }
}

export function loadEmissionsDoc(voyageId: string | undefined): EmissionsDoc | undefined {
  const raw = readEmissionsRaw(voyageId);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as EmissionsDoc;
  } catch {
    /* ignore malformed */
  }
  return undefined;
}

export function writeEmissionsRaw(voyageId: string | undefined, raw: string): void {
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

export function subscribeEmissionsDoc(voyageId: string | undefined, cb: () => void): () => void {
  if (!voyageId) return () => {};
  const onCustom = (e: Event) => { if ((e as CustomEvent).detail?.id === voyageId) cb(); };
  const onStorage = (e: StorageEvent) => { if (e.key === KEY(voyageId)) cb(); };
  window.addEventListener(EVENT, onCustom as EventListener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onCustom as EventListener);
    window.removeEventListener('storage', onStorage);
  };
}
