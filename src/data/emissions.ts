import { emissionsApi } from '../api/emissionsApi';

/**
 * Per-voyage Emissions & Compliance workspace document.
 *
 * Kept separate from the Operations recap so the Emissions module can persist
 * its editable/manual data (compliance statuses, manual adjustments with audit
 * trail, header overrides) independently. Linked with ASP.NET Core Web API.
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

export async function fetchEmissionsDocFromBackend(voyageId: string | undefined): Promise<EmissionsDoc | undefined> {
  if (!voyageId) return undefined;
  try {
    const res = await emissionsApi.getByVoyage(voyageId);
    if (res) {
      let compliance = defaultEmissionsDoc().compliance;
      let adjustments: EmissionAdjustment[] = [];
      try { if (res.complianceJson) compliance = JSON.parse(res.complianceJson); } catch { /* ignore */ }
      try { if (res.adjustmentsJson) adjustments = JSON.parse(res.adjustmentsJson); } catch { /* ignore */ }

      const doc: EmissionsDoc = {
        complianceYear: res.complianceYear,
        trade: res.trade ?? '',
        euaPriceEur: res.euaPriceEur,
        co2AdjustmentT: res.co2AdjustmentT,
        compliance,
        adjustments,
        approvedBy: res.approvedBy ?? '',
        approvedDate: res.approvedDate ?? '',
        updatedAt: res.updatedAt ?? res.createdAt,
      };
      writeEmissionsRaw(voyageId, JSON.stringify(doc));
      return doc;
    }
  } catch {
    /* ignore fallback */
  }
  return loadEmissionsDoc(voyageId);
}

export function writeEmissionsRaw(voyageId: string | undefined, raw: string, metricsJson?: string): void {
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

  // Push to backend asynchronously
  void (async () => {
    try {
      const parsed = JSON.parse(raw) as EmissionsDoc;
      await emissionsApi.save({
        voyageCode: voyageId,
        complianceYear: parsed.complianceYear,
        trade: parsed.trade,
        euaPriceEur: parsed.euaPriceEur,
        co2AdjustmentT: parsed.co2AdjustmentT,
        complianceJson: JSON.stringify(parsed.compliance),
        adjustmentsJson: JSON.stringify(parsed.adjustments),
        approvedBy: parsed.approvedBy,
        approvedDate: parsed.approvedDate,
        metricsJson,
      });
    } catch {
      /* fallback */
    }
  })();
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

/* -------------------------------------------------- Report Studio scenarios */

/**
 * A named, user-editable "what-if" snapshot used by the Report Studio tab — lets an operator
 * override any figure and regenerate a report WITHOUT touching the voyage's real, live-calculated
 * Emissions data (which stays untouched in every other tab).
 */
export interface EmissionsScenario {
  id: string;
  voyageCode: string;
  name: string;
  inputs: Record<string, string>;
  metrics?: Record<string, number | string>;
  notes: string;
  createdByName: string;
  createdAt: string;
  updatedAt?: string;
}

function mapScenarioDto(dto: { id: string; voyageCode: string; name: string; inputsJson?: string | null; metricsJson?: string | null; notes?: string | null; createdByName?: string | null; createdAt: string; updatedAt?: string | null }): EmissionsScenario {
  let inputs: Record<string, string> = {};
  let metrics: Record<string, number | string> | undefined;
  try { if (dto.inputsJson) inputs = JSON.parse(dto.inputsJson); } catch { /* ignore */ }
  try { if (dto.metricsJson) metrics = JSON.parse(dto.metricsJson); } catch { /* ignore */ }
  return {
    id: dto.id, voyageCode: dto.voyageCode, name: dto.name, inputs, metrics,
    notes: dto.notes ?? '', createdByName: dto.createdByName ?? 'Operator',
    createdAt: dto.createdAt, updatedAt: dto.updatedAt ?? undefined,
  };
}

export async function listEmissionsScenarios(voyageId: string | undefined): Promise<EmissionsScenario[]> {
  if (!voyageId) return [];
  try {
    const rows = await emissionsApi.listScenarios(voyageId);
    return rows.map(mapScenarioDto);
  } catch {
    return [];
  }
}

export async function createEmissionsScenario(voyageId: string, name: string, inputs: Record<string, string>, metrics: Record<string, unknown>, notes = ''): Promise<EmissionsScenario | undefined> {
  try {
    const dto = await emissionsApi.createScenario({
      voyageCode: voyageId, name, inputsJson: JSON.stringify(inputs), metricsJson: JSON.stringify(metrics), notes, createdByName: 'Operator',
    });
    return mapScenarioDto(dto);
  } catch {
    return undefined;
  }
}

export async function updateEmissionsScenario(id: string, voyageId: string, name: string, inputs: Record<string, string>, metrics: Record<string, unknown>, notes = ''): Promise<EmissionsScenario | undefined> {
  try {
    const dto = await emissionsApi.updateScenario(id, {
      voyageCode: voyageId, name, inputsJson: JSON.stringify(inputs), metricsJson: JSON.stringify(metrics), notes, createdByName: 'Operator',
    });
    return mapScenarioDto(dto);
  } catch {
    return undefined;
  }
}

export async function deleteEmissionsScenario(id: string): Promise<void> {
  try {
    await emissionsApi.deleteScenario(id);
  } catch {
    /* ignore */
  }
}

/* -------------------------------------------------- Fleet-wide aggregation */

export interface EmissionsFleetRecord {
  voyageCode: string;
  vesselName: string;
  complianceYear: string;
  metrics?: Record<string, number>;
}

/** Every voyage's persisted computed-metrics snapshot — backs the Fleet/Monthly/Annual/Executive/
 * ESG report categories' "Entire Fleet" scope. Reads the MetricsJson column saved on every edit. */
export async function fetchAllEmissionsForFleet(): Promise<EmissionsFleetRecord[]> {
  try {
    const rows = await emissionsApi.list();
    return rows.map((r) => {
      let metrics: Record<string, number> | undefined;
      try { metrics = r.metricsJson ? JSON.parse(r.metricsJson) : undefined; } catch { metrics = undefined; }
      return { voyageCode: r.voyageCode, vesselName: r.vesselName, complianceYear: r.complianceYear, metrics };
    });
  } catch {
    return [];
  }
}
