import { useSyncExternalStore, useEffect } from 'react';
import { accountsApi, type FinancialTransactionDto } from '../api/accountsApi';
import { appendConfigHistory, newConfigHistoryId } from './acctConfigHistory';

/**
 * Accounts — the single financial source of truth for ODAS.
 *
 * Every financial event raised by another module (Chartering, Operations,
 * Postfix, Bunker, Performance, Weather…) flows into this transaction ledger.
 * Accounts users verify, approve, execute, reconcile and close. When a status
 * changes here it is meant to synchronise back to the originating module
 * (the Bunker bridge is wired live; others are mocked in the seed).
 */

export type TxnKind = 'Payable' | 'Receivable';
export type TxnStatus =
  | 'Draft'
  | 'Submitted'
  | 'Accounts Review'
  | 'Pending Approval'
  | 'Approved'
  | 'Scheduled'
  | 'Payment Executed'
  | 'Bank Confirmation'
  | 'Reconciled'
  | 'Closed'
  | 'Rejected'
  | 'On Hold'
  | 'Cancelled'
  | 'Partially Paid'
  | 'Payment Failed'
  // Legacy seed statuses kept for backward compat
  | 'Due'
  | 'Overdue'
  | 'Paid'
  | 'Received'
  | 'Approval Pending';
export type Approval = 'Auto' | 'Pending' | 'Approved' | 'Rejected';
export type Priority = 'High' | 'Medium' | 'Low';

export type TxnCategory =
  | 'Hire'
  | 'Freight'
  | 'PDA'
  | 'FDA'
  | 'Bunker'
  | 'Agency'
  | 'Port'
  | 'Canal'
  | 'Demurrage'
  | 'Despatch'
  | 'Claims'
  | 'Commission'
  | 'Performance'
  | 'Weather'
  | 'Insurance'
  | 'Taxes'
  | 'Misc';

export interface AuditEntry {
  at: string;
  user: string;
  action: string;
  from?: TxnStatus;
  to?: TxnStatus;
}

export interface FinTxn {
  id: string;
  /** Real database GUID (PUT /api/accounts/transactions/{id} requires a GUID, not the
   * human-readable transactionNo held in `id`) — undefined until the create round-trip
   * resolves for bridge-created transactions. */
  backendId?: string;
  kind: TxnKind;
  category: TxnCategory;
  module: string;
  company: string;
  vessel: string;
  voyage: string;
  /** Shared cross-module reference (same across Chartering/Ops/Bunker/Performance). */
  reference: string;
  fixture?: string;
  counterparty: string;
  invoiceNo: string;
  currency: string;
  amount: number;
  exchangeRate: number;
  invoiceDate: string;
  dueDate: string;
  dueIso: string;
  status: TxnStatus;
  approval: Approval;
  priority: Priority;
  pic: string;
  bank?: string;
  method?: string;
  paymentDate?: string;
  paymentRef?: string;
  swiftDocUrl?: string;
  remarks?: string;
  audit: AuditEntry[];
}

/** Reference "today" for ageing / due calculations (matches the seed month). */
export const ACCT_NOW = new Date('2026-06-12T00:00:00');

export function daysUntil(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.round((d.getTime() - ACCT_NOW.getTime()) / 86_400_000);
}
/** Overdue = an unpaid item whose due date has passed. */
export function isOverdue(t: FinTxn): boolean {
  const active = new Set<TxnStatus>(['Draft','Submitted','Accounts Review','Pending Approval','Approval Pending','Approved','Scheduled','Due','Overdue','On Hold','Partially Paid']);
  return active.has(t.status) && daysUntil(t.dueIso) < 0;
}
export function stamp(): string {
  const d = new Date();
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getDate())} ${mon} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Valid next statuses from a given status — enforces the workflow. */
const STATUS_FLOW: Partial<Record<TxnStatus, TxnStatus[]>> = {
  Draft:                ['Submitted', 'Cancelled'],
  Submitted:            ['Accounts Review', 'Rejected', 'On Hold', 'Cancelled'],
  'Accounts Review':    ['Pending Approval', 'Rejected', 'On Hold', 'Cancelled'],
  'Pending Approval':   ['Approved', 'Rejected', 'On Hold', 'Cancelled'],
  'Approval Pending':   ['Approved', 'Rejected', 'On Hold', 'Cancelled'],
  Approved:             ['Scheduled', 'On Hold', 'Cancelled'],
  Scheduled:            ['Payment Executed', 'On Hold', 'Cancelled'],
  Due:                  ['Payment Executed', 'Scheduled', 'Partially Paid', 'On Hold', 'Cancelled'],
  Overdue:              ['Payment Executed', 'Scheduled', 'Partially Paid', 'On Hold', 'Cancelled'],
  'Payment Executed':   ['Bank Confirmation', 'Payment Failed', 'Partially Paid'],
  Paid:                 ['Reconciled'],
  Received:             ['Reconciled'],
  'Bank Confirmation':  ['Reconciled', 'Payment Failed'],
  Reconciled:           ['Closed'],
  Rejected:             ['Submitted', 'Cancelled'],
  'On Hold':            ['Submitted', 'Accounts Review', 'Cancelled'],
  'Partially Paid':     ['Payment Executed', 'On Hold', 'Cancelled'],
  'Payment Failed':     ['Scheduled', 'On Hold', 'Cancelled'],
  Closed:               [],
  Cancelled:            [],
};
export function getValidTransitions(status: TxnStatus): TxnStatus[] {
  return STATUS_FLOW[status] ?? [];
}

/** Status tone for pill colouring. */
export const STATUS_TONES: Record<TxnStatus, string> = {
  Draft: 'grey', Submitted: 'blue', 'Accounts Review': 'blue',
  'Pending Approval': 'purple', 'Approval Pending': 'purple',
  Approved: 'green', Scheduled: 'blue',
  'Payment Executed': 'green', 'Bank Confirmation': 'green',
  Reconciled: 'green', Closed: 'grey',
  Rejected: 'red', 'On Hold': 'grey', Cancelled: 'grey',
  'Partially Paid': 'amber', 'Payment Failed': 'red',
  Due: 'amber', Overdue: 'red', Paid: 'green', Received: 'green',
};

/* ------------------------------------------------------------ mock ledger */

function seed(): FinTxn[] {
  let n = 4400;
  const t = (
    kind: TxnKind,
    category: TxnCategory,
    module: string,
    vessel: string,
    voyage: string,
    reference: string,
    counterparty: string,
    amount: number,
    currency: string,
    dueIso: string,
    dueDate: string,
    status: TxnStatus,
    priority: Priority,
    approval: Approval = 'Approved',
    extra: Partial<FinTxn> = {},
  ): FinTxn => {
    n += 1;
    return {
      id: `TXN-${n}`,
      kind,
      category,
      module,
      company: 'ODAS Shipping Ltd',
      vessel,
      voyage,
      reference,
      fixture: reference.replace('VOY', 'FIX'),
      counterparty,
      invoiceNo: `${category.slice(0, 3).toUpperCase()}-${n}`,
      currency,
      amount,
      exchangeRate: currency === 'USD' ? 1 : currency === 'EUR' ? 1.08 : currency === 'CNY' ? 0.14 : currency === 'SGD' ? 0.74 : 1,
      invoiceDate: '05 Jun 2026',
      dueDate,
      dueIso,
      status,
      approval,
      priority,
      pic: 'A. Nair',
      bank: 'HSBC — USD Operating',
      method: kind === 'Payable' ? 'TT' : 'Incoming TT',
      audit: [{ at: '05 Jun 2026, 09:00', user: module, action: `Transaction auto-generated from ${module}` }],
      ...extra,
    };
  };

  return [
    t('Payable', 'Hire', 'Operations', 'MV ABC', 'V-24/26', 'VOY-2606-024', 'Oceanic Shipping Ltd.', 215_000, 'USD', '2026-06-14', '14 Jun 2026', 'Due', 'High'),
    t('Payable', 'Bunker', 'Bunker', 'MV Pacific Wind', 'V-02/26', 'VOY-2606-021', 'Ocean Bunkers', 82_500, 'USD', '2026-06-15', '15 Jun 2026', 'Due', 'Medium'),
    t('Receivable', 'Freight', 'Chartering', 'MV Oceanic Star', 'V-11/26', 'VOY-2606-023', 'Cargill International', 340_000, 'USD', '2026-06-16', '16 Jun 2026', 'Due', 'High'),
    t('Payable', 'Demurrage', 'Postfix', 'MV Global Ace', 'V-08/26', 'VOY-2606-022', 'Qingdao Port Authority', 126_000, 'USD', '2026-06-18', '18 Jun 2026', 'Due', 'Low'),
    t('Payable', 'Hire', 'Operations', 'MV Horizon', 'V-05/26', 'VOY-2606-020', 'Blue Ocean Ltd.', 198_750, 'USD', '2026-06-19', '19 Jun 2026', 'Scheduled', 'Medium'),
    t('Payable', 'PDA', 'Operations', 'MV Seafarer', 'V-06/26', 'VOY-2606-018', 'Fujairah Agencies', 64_200, 'USD', '2026-06-10', '10 Jun 2026', 'Due', 'High'),
    t('Payable', 'Bunker', 'Bunker', 'MV Seafarer', 'V-06/26', 'VOY-2606-018', 'Monjasa', 325_000, 'USD', '2026-06-08', '08 Jun 2026', 'Due', 'High'),
    t('Receivable', 'Demurrage', 'Postfix', 'MV Blue Whale', 'V-03/26', 'VOY-2606-019', 'Sinochem', 94_500, 'USD', '2026-06-22', '22 Jun 2026', 'Due', 'Medium'),
    t('Receivable', 'Freight', 'Chartering', 'MV Meridian', 'V-09/26', 'VOY-2606-014', 'Louis Dreyfus', 620_000, 'USD', '2026-06-25', '25 Jun 2026', 'Due', 'High'),
    t('Payable', 'FDA', 'Operations', 'MV Northern Light', 'V-07/26', 'VOY-2606-016', 'Singapore Agencies', 41_800, 'USD', '2026-06-20', '20 Jun 2026', 'Approval Pending', 'Medium', 'Pending'),
    t('Payable', 'Agency', 'Operations', 'MV Aurora', 'V-04/26', 'VOY-2606-015', 'Gibraltar Shipping', 18_900, 'EUR', '2026-06-24', '24 Jun 2026', 'Scheduled', 'Low'),
    t('Payable', 'Canal', 'Operations', 'MV Global Ace', 'V-08/26', 'VOY-2606-022', 'Suez Canal Authority', 185_000, 'USD', '2026-06-09', '09 Jun 2026', 'Paid', 'High', 'Approved', { paymentDate: '08 Jun 2026', paymentRef: 'TT-2026-3391' }),
    t('Receivable', 'Freight', 'Chartering', 'MV Unity', 'V-01/26', 'VOY-2606-017', 'ADM', 476_000, 'USD', '2026-06-10', '10 Jun 2026', 'Received', 'Low', 'Approved', { paymentDate: '09 Jun 2026', paymentRef: 'RC-2026-2210' }),
    t('Payable', 'Weather', 'Weather', 'MV Oceanic Star', 'V-11/26', 'VOY-2606-023', 'StormGeo', 8_400, 'USD', '2026-06-28', '28 Jun 2026', 'Approval Pending', 'Low', 'Pending'),
    t('Payable', 'Performance', 'Performance', 'MV Horizon', 'V-05/26', 'VOY-2606-020', 'ClassNK Perf.', 12_600, 'USD', '2026-06-30', '30 Jun 2026', 'Approval Pending', 'Low', 'Pending'),
    t('Receivable', 'Despatch', 'Postfix', 'MV Pacific Wind', 'V-02/26', 'VOY-2606-021', 'Rio Tinto', 33_400, 'USD', '2026-07-02', '02 Jul 2026', 'Due', 'Low'),
    t('Payable', 'Claims', 'Postfix', 'MV ABC', 'V-24/26', 'VOY-2606-024', 'P&I Club', 55_000, 'USD', '2026-06-11', '11 Jun 2026', 'On Hold', 'Medium'),
    t('Payable', 'Commission', 'Chartering', 'MV Meridian', 'V-09/26', 'VOY-2606-014', 'Clarksons', 23_250, 'USD', '2026-06-26', '26 Jun 2026', 'Due', 'Low'),
    t('Payable', 'Port', 'Operations', 'MV Blue Whale', 'V-03/26', 'VOY-2606-019', 'Busan Port', 29_700, 'USD', '2026-06-13', '13 Jun 2026', 'Due', 'Medium'),
    t('Receivable', 'Hire', 'Chartering', 'MV Aurora', 'V-04/26', 'VOY-2606-015', 'Trafigura', 152_000, 'USD', '2026-06-27', '27 Jun 2026', 'Due', 'Medium'),
  ];
}

/* ---------------------------------------------------------------- store */

let txns: FinTxn[] = seed();

/** Auto-promote 'Due' transactions past their due date to 'Overdue'. Only affects 'Due' status. */
function autoMarkOverdue(): void {
  txns = txns.map((t) => {
    if (t.status === 'Due' && daysUntil(t.dueIso) < 0) {
      return { ...t, status: 'Overdue' as TxnStatus };
    }
    return t;
  });
}

// Run once at module load so seed data is immediately up to date
autoMarkOverdue();

const listeners = new Set<() => void>();
function emit(): void {
  listeners.forEach((l) => l());
}
export function getAccountTxns(): FinTxn[] {
  return txns;
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function mapDtoToFinTxn(dto: FinancialTransactionDto): FinTxn {
  let audit: AuditEntry[] = [];
  try { if (dto.auditJson) audit = JSON.parse(dto.auditJson); } catch { /* ignore */ }

  return {
    id: dto.transactionNo || dto.id,
    backendId: dto.id,
    kind: dto.kind,
    category: (dto.category as TxnCategory) || 'Freight',
    module: dto.module,
    company: dto.company,
    vessel: dto.vesselName,
    voyage: dto.voyage,
    reference: dto.reference,
    fixture: dto.fixture ?? undefined,
    counterparty: dto.counterparty,
    invoiceNo: dto.invoiceNo,
    currency: dto.currency,
    amount: dto.amount,
    exchangeRate: dto.exchangeRate,
    invoiceDate: dto.invoiceDate,
    dueDate: dto.dueDate,
    dueIso: dto.dueIso,
    status: (dto.status as TxnStatus) || 'Draft',
    approval: (dto.approval as Approval) || 'Approved',
    priority: (dto.priority as Priority) || 'Medium',
    pic: dto.pic,
    bank: dto.bank ?? undefined,
    method: dto.method ?? undefined,
    paymentDate: dto.paymentDate ?? undefined,
    paymentRef: dto.paymentRef ?? undefined,
    swiftDocUrl: dto.swiftDocUrl ?? undefined,
    remarks: dto.remarks ?? undefined,
    audit: audit.length > 0 ? audit : [{ at: stamp(), user: dto.module, action: 'Loaded from server' }],
  };
}

export async function syncAccountsFromBackend(): Promise<FinTxn[]> {
  try {
    const list = await accountsApi.getTransactions();
    if (list && list.length > 0) {
      const mapped = list.map(mapDtoToFinTxn);
      txns = mapped;
      autoMarkOverdue();
      emit();
      return mapped;
    }
  } catch {
    // fallback
  }
  return txns;
}

export function useAccountTxns(): FinTxn[] {
  useEffect(() => {
    void syncAccountsFromBackend();
  }, []);
  return useSyncExternalStore(subscribe, getAccountTxns, getAccountTxns);
}

export function updateTxn(id: string, patch: Partial<FinTxn>, audit?: Omit<AuditEntry, 'at'>): void {
  txns = txns.map((x) => {
    if (x.id !== id) return x;
    const at = stamp();
    const updated = { ...x, ...patch, audit: audit ? [{ ...audit, at }, ...x.audit] : x.audit };

    // Mirror every audited per-transaction change into the fleet-wide Configuration History —
    // this is already a single, discrete, committed action (dropdown select / button click), so
    // it is logged immediately, never fragmented per keystroke.
    if (audit) {
      appendConfigHistory([{
        id: newConfigHistoryId(),
        at: new Date().toISOString(),
        by: audit.user,
        field: `${updated.invoiceNo} · ${updated.vessel} — ${audit.action}`,
        before: audit.from ?? '—',
        after: audit.to ?? '—',
      }]);
    }

    // Push update to backend. Requires the real database GUID (backendId), not the
    // human-readable transactionNo held in `id` — the PUT route only accepts a GUID.
    if (updated.backendId) {
      void (async () => {
        try {
          await accountsApi.updateTransaction(updated.backendId!, {
            transactionNo: updated.id,
            kind: updated.kind,
            category: updated.category,
            module: updated.module,
            company: updated.company,
            vesselName: updated.vessel,
            voyage: updated.voyage,
            reference: updated.reference,
            fixture: updated.fixture,
            counterparty: updated.counterparty,
            invoiceNo: updated.invoiceNo,
            currency: updated.currency,
            amount: updated.amount,
            exchangeRate: updated.exchangeRate,
            invoiceDate: updated.invoiceDate,
            dueDate: updated.dueDate,
            dueIso: updated.dueIso,
            status: updated.status,
            approval: updated.approval,
            priority: updated.priority,
            pic: updated.pic,
            bank: updated.bank,
            method: updated.method,
            paymentDate: updated.paymentDate,
            paymentRef: updated.paymentRef,
            swiftDocUrl: updated.swiftDocUrl,
            remarks: updated.remarks,
            auditJson: updated.audit ? JSON.stringify(updated.audit) : undefined,
          });
        } catch {
          /* fallback */
        }
      })();
    }

    return updated;
  });
  emit();
}

/** Mark a payable executed / a receivable collected. */
export function settleTxn(id: string): void {
  const x = txns.find((r) => r.id === id);
  if (!x) return;
  const paid: TxnStatus = x.kind === 'Payable' ? 'Paid' : 'Received';
  const ref = x.kind === 'Payable' ? `TT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}` : `RC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  updateTxn(
    id,
    { status: paid, approval: 'Approved', paymentRef: ref, paymentDate: stamp() },
    { user: 'Accounts', action: x.kind === 'Payable' ? `Payment executed — ${ref}` : `Receipt recorded — ${ref}`, from: x.status, to: paid },
  );
}

export function approveTxn(id: string, decision: 'approve' | 'reject'): void {
  const x = txns.find((r) => r.id === id);
  if (!x) return;
  if (decision === 'approve') updateTxn(id, { approval: 'Approved', status: 'Due' }, { user: 'Accounts Manager', action: 'Transaction approved', from: x.status, to: 'Due' });
  else updateTxn(id, { approval: 'Rejected', status: 'Cancelled' }, { user: 'Accounts Manager', action: 'Transaction rejected', from: x.status, to: 'Cancelled' });
}

export function holdTxn(id: string): void {
  updateTxn(id, { status: 'On Hold' }, { user: 'Accounts', action: 'Transaction placed on hold' });
}
export function scheduleTxn(id: string): void {
  updateTxn(id, { status: 'Scheduled' }, { user: 'Accounts', action: 'Payment scheduled' });
}

/* ----------------------------------------------- cross-module bridge (Bunker) */

export interface PayableInput {
  reference: string;
  vessel: string;
  voyage?: string;
  supplier: string;
  invoiceNo: string;
  amount: number;
  currency?: string;
  invoiceDate?: string;
  dueDate?: string;
  dueIso?: string;
  module?: string;
  category?: TxnCategory;
  bank?: string;
  method?: string;
  remarks?: string;
}

/** Called by other modules (e.g. Bunker) to raise a payable into Accounts. */
export function addPayable(p: PayableInput): void {
  if (txns.some((x) => x.invoiceNo === p.invoiceNo)) return;
  const at = stamp();
  const txn: FinTxn = {
    id: `TXN-${p.invoiceNo}`,
    kind: 'Payable',
    category: p.category ?? 'Bunker',
    module: p.module ?? 'Bunker',
    company: 'ODAS Shipping Ltd',
    vessel: p.vessel,
    voyage: p.voyage ?? '',
    reference: p.reference,
    fixture: p.reference.replace('VOY', 'FIX'),
    counterparty: p.supplier,
    invoiceNo: p.invoiceNo,
    currency: p.currency ?? 'USD',
    amount: p.amount,
    exchangeRate: 1,
    invoiceDate: p.invoiceDate ?? at,
    dueDate: p.dueDate ?? '—',
    dueIso: p.dueIso ?? '',
    status: 'Due',
    approval: 'Approved',
    priority: 'High',
    pic: 'A. Nair',
    bank: p.bank ?? 'HSBC — USD Operating',
    method: p.method ?? 'TT',
    remarks: p.remarks,
    audit: [{ at, user: p.module ?? 'Bunker', action: `Payable received from ${p.module ?? 'Bunker'} module` }],
  };
  txns = [txn, ...txns];
  emit();

  // Push new payable to backend, then backfill the real GUID so later status updates work.
  void (async () => {
    try {
      const created = await accountsApi.createTransaction({
        transactionNo: txn.id,
        kind: txn.kind,
        category: txn.category,
        module: txn.module,
        company: txn.company,
        vesselName: txn.vessel,
        voyage: txn.voyage,
        reference: txn.reference,
        fixture: txn.fixture,
        counterparty: txn.counterparty,
        invoiceNo: txn.invoiceNo,
        currency: txn.currency,
        amount: txn.amount,
        exchangeRate: txn.exchangeRate,
        invoiceDate: txn.invoiceDate,
        dueDate: txn.dueDate,
        dueIso: txn.dueIso,
        status: txn.status,
        approval: txn.approval,
        priority: txn.priority,
        pic: txn.pic,
        bank: txn.bank,
        method: txn.method,
        remarks: txn.remarks,
        auditJson: JSON.stringify(txn.audit),
      });
      if (created?.id) {
        txns = txns.map((x) => (x.id === txn.id ? { ...x, backendId: created.id } : x));
        emit();
      }
    } catch {
      /* fallback */
    }
  })();
}

export interface ReceivableInput {
  reference: string;
  vessel: string;
  voyage?: string;
  counterparty: string;
  invoiceNo: string;
  amount: number;
  currency?: string;
  invoiceDate?: string;
  dueDate?: string;
  dueIso?: string;
  module?: string;
  category?: TxnCategory;
  remarks?: string;
}

/** Called by other modules (e.g. Operations, Chartering) to raise a receivable into Accounts. */
export function addReceivable(p: ReceivableInput): void {
  if (txns.some((x) => x.invoiceNo === p.invoiceNo)) return;
  const at = stamp();
  const txn: FinTxn = {
    id: `TXN-${p.invoiceNo}`,
    kind: 'Receivable',
    category: p.category ?? 'Freight',
    module: p.module ?? 'Operations',
    company: 'ODAS Shipping Ltd',
    vessel: p.vessel,
    voyage: p.voyage ?? '',
    reference: p.reference,
    fixture: p.reference.replace('VOY', 'FIX'),
    counterparty: p.counterparty,
    invoiceNo: p.invoiceNo,
    currency: p.currency ?? 'USD',
    amount: p.amount,
    exchangeRate: 1,
    invoiceDate: p.invoiceDate ?? at,
    dueDate: p.dueDate ?? '—',
    dueIso: p.dueIso ?? '',
    status: 'Due',
    approval: 'Approved',
    priority: 'Medium',
    pic: 'A. Nair',
    bank: 'HSBC — USD Operating',
    method: 'TT',
    remarks: p.remarks,
    audit: [{ at, user: p.module ?? 'Operations', action: `Receivable received from ${p.module ?? 'Operations'} module` }],
  };
  txns = [txn, ...txns];
  emit();

  // Push new receivable to backend, then backfill the real GUID so later status updates work.
  // (Previously this function never persisted at all — only addPayable did.)
  void (async () => {
    try {
      const created = await accountsApi.createTransaction({
        transactionNo: txn.id,
        kind: txn.kind,
        category: txn.category,
        module: txn.module,
        company: txn.company,
        vesselName: txn.vessel,
        voyage: txn.voyage,
        reference: txn.reference,
        fixture: txn.fixture,
        counterparty: txn.counterparty,
        invoiceNo: txn.invoiceNo,
        currency: txn.currency,
        amount: txn.amount,
        exchangeRate: txn.exchangeRate,
        invoiceDate: txn.invoiceDate,
        dueDate: txn.dueDate,
        dueIso: txn.dueIso,
        status: txn.status,
        approval: txn.approval,
        priority: txn.priority,
        pic: txn.pic,
        bank: txn.bank,
        method: txn.method,
        remarks: txn.remarks,
        auditJson: JSON.stringify(txn.audit),
      });
      if (created?.id) {
        txns = txns.map((x) => (x.id === txn.id ? { ...x, backendId: created.id } : x));
        emit();
      }
    } catch {
      /* fallback */
    }
  })();
}

/* ----------------------------------------------------- manual creation (Accounts UI) */

export interface ManualTxnInput {
  kind: TxnKind;
  category: TxnCategory;
  module?: string;
  vessel: string;
  voyage?: string;
  counterparty: string;
  invoiceNo: string;
  currency?: string;
  amount: number;
  invoiceDate?: string;
  dueDate?: string;
  dueIso: string;
  priority?: Priority;
  remarks?: string;
}

/** Raised directly from the Accounts "New Transaction" form (manual entries, not bridged from another module). */
export async function createManualTxn(p: ManualTxnInput): Promise<FinTxn> {
  if (txns.some((x) => x.invoiceNo === p.invoiceNo)) {
    throw new Error(`Invoice No "${p.invoiceNo}" already exists.`);
  }
  const at = stamp();
  const txn: FinTxn = {
    id: `TXN-${p.invoiceNo}`,
    kind: p.kind,
    category: p.category,
    module: p.module ?? 'Accounts',
    company: 'ODAS Shipping Ltd',
    vessel: p.vessel,
    voyage: p.voyage ?? '',
    reference: p.voyage ?? p.invoiceNo,
    fixture: undefined,
    counterparty: p.counterparty,
    invoiceNo: p.invoiceNo,
    currency: p.currency ?? 'USD',
    amount: p.amount,
    exchangeRate: p.currency === 'EUR' ? 1.08 : p.currency === 'CNY' ? 0.14 : p.currency === 'SGD' ? 0.74 : 1,
    invoiceDate: p.invoiceDate ?? at,
    dueDate: p.dueDate ?? at,
    dueIso: p.dueIso,
    status: 'Draft',
    approval: 'Pending',
    priority: p.priority ?? 'Medium',
    pic: 'Accounts',
    method: p.kind === 'Payable' ? 'TT' : 'Incoming TT',
    remarks: p.remarks,
    audit: [{ at, user: 'Accounts', action: 'Transaction created manually in Accounts' }],
  };
  // Persist first so a backend failure surfaces to the form instead of silently going local-only.
  const created = await accountsApi.createTransaction({
    transactionNo: txn.id,
    kind: txn.kind,
    category: txn.category,
    module: txn.module,
    company: txn.company,
    vesselName: txn.vessel,
    voyage: txn.voyage,
    reference: txn.reference,
    counterparty: txn.counterparty,
    invoiceNo: txn.invoiceNo,
    currency: txn.currency,
    amount: txn.amount,
    exchangeRate: txn.exchangeRate,
    invoiceDate: txn.invoiceDate,
    dueDate: txn.dueDate,
    dueIso: txn.dueIso,
    status: txn.status,
    approval: txn.approval,
    priority: txn.priority,
    pic: txn.pic,
    method: txn.method,
    remarks: txn.remarks,
    auditJson: JSON.stringify(txn.audit),
  });
  const final = created ? { ...txn, id: created.transactionNo || created.id, backendId: created.id } : txn;
  txns = [final, ...txns];
  emit();
  appendConfigHistory([{
    id: newConfigHistoryId(),
    at: new Date().toISOString(),
    by: 'Accounts',
    field: 'New Transaction Created',
    before: '—',
    after: `${final.invoiceNo} · ${final.vessel} · ${final.currency} ${final.amount}`,
  }]);
  return final;
}

export function findTxnByInvoice(invoiceNo: string): FinTxn | undefined {
  return txns.find((x) => x.invoiceNo === invoiceNo);
}

/* --------------------------------------------- left-sidebar buckets + filters */

export type AcctBucket = 'overdue' | 'due' | 'upcoming' | 'settled';

export const ACCOUNT_TABS: { key: AcctBucket; label: string }[] = [
  { key: 'due', label: 'Due' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'settled', label: 'Settled' },
];

/** Coarse monitoring bucket for the left sidebar status tabs. */
export function bucketOfTxn(t: FinTxn): AcctBucket {
  // Terminal / post-payment statuses are settled — never age them as due/overdue.
  const settled = new Set<TxnStatus>(['Paid', 'Received', 'Cancelled', 'Closed', 'Reconciled', 'Payment Executed', 'Bank Confirmation']);
  if (settled.has(t.status)) return 'settled';
  if (isOverdue(t)) return 'overdue';
  return daysUntil(t.dueIso) <= 7 ? 'due' : 'upcoming';
}

export const ACCOUNT_TYPE_FILTERS = [
  'All',
  'Payables',
  'Receivables',
  'Hire',
  'Freight',
  'PDA / FDA',
  'Bunker',
  'Demurrage / Despatch',
  'Claims',
  'Awaiting Approval',
] as const;

export function matchesAccountType(t: FinTxn, f: string): boolean {
  switch (f) {
    case 'All':
      return true;
    case 'Payables':
      return t.kind === 'Payable';
    case 'Receivables':
      return t.kind === 'Receivable';
    case 'PDA / FDA':
      return t.category === 'PDA' || t.category === 'FDA';
    case 'Demurrage / Despatch':
      return t.category === 'Demurrage' || t.category === 'Despatch';
    case 'Awaiting Approval':
      return t.approval === 'Pending';
    default:
      return t.category === (f as TxnCategory);
  }
}

/* --------------------------------------------------- selected-vessel store */

let selVessel: string | undefined;
const vListeners = new Set<() => void>();
export function getSelectedAccountVessel(): string | undefined {
  return selVessel;
}
export function writeSelectedAccountVessel(v: string): void {
  if (selVessel === v) return;
  selVessel = v;
  vListeners.forEach((l) => l());
}
export function clearSelectedAccountVessel(): void {
  if (selVessel === undefined) return;
  selVessel = undefined;
  vListeners.forEach((l) => l());
}
function subVessel(listener: () => void): () => void {
  vListeners.add(listener);
  return () => vListeners.delete(listener);
}
export function useSelectedAccountVessel(): string | undefined {
  return useSyncExternalStore(subVessel, getSelectedAccountVessel, getSelectedAccountVessel);
}

/* --------------------------------------------------- live accounts alerts */

export interface AccountAlert {
  id: string;
  icon: string;
  tone: 'red' | 'amber' | 'blue' | 'purple';
  text: string;
  sub: string;
  txnId?: string;
}

/** Derives priority alerts from the live ledger — consumed by TopNav. */
export function computeAccountAlerts(all: FinTxn[]): AccountAlert[] {
  const out: AccountAlert[] = [];
  const overdue = all.filter(isOverdue);
  if (overdue.length > 0) {
    const total = overdue.reduce((s, t) => s + t.amount, 0);
    out.push({ id: 'acct-overdue', icon: 'fa-triangle-exclamation', tone: 'red', text: `${overdue.length} overdue invoice${overdue.length > 1 ? 's' : ''}`, sub: `USD ${(total / 1_000).toFixed(0)}K outstanding · Accounts` });
  }
  const dueToday = all.filter((t) => t.kind === 'Payable' && t.status !== 'Paid' && t.status !== 'Cancelled' && daysUntil(t.dueIso) === 0);
  if (dueToday.length > 0) {
    out.push({ id: 'acct-due-today', icon: 'fa-clock', tone: 'amber', text: `${dueToday.length} payment${dueToday.length > 1 ? 's' : ''} due today`, sub: `USD ${(dueToday.reduce((s,t)=>s+t.amount,0)/1_000).toFixed(0)}K to pay · Accounts` });
  }
  const pending = all.filter((t) => t.approval === 'Pending' && t.status !== 'Paid' && t.status !== 'Received' && t.status !== 'Cancelled');
  if (pending.length > 0) {
    out.push({ id: 'acct-approval', icon: 'fa-user-clock', tone: 'purple', text: `${pending.length} invoice${pending.length > 1 ? 's' : ''} awaiting approval`, sub: `USD ${(pending.reduce((s,t)=>s+t.amount,0)/1_000).toFixed(0)}K pending · Accounts` });
  }
  const dueTomorrow = all.filter((t) => t.kind === 'Payable' && t.status !== 'Paid' && t.status !== 'Cancelled' && daysUntil(t.dueIso) === 1);
  if (dueTomorrow.length > 0) {
    out.push({ id: 'acct-due-tmr', icon: 'fa-calendar-day', tone: 'blue', text: `${dueTomorrow.length} payment${dueTomorrow.length > 1 ? 's' : ''} due tomorrow`, sub: `USD ${(dueTomorrow.reduce((s,t)=>s+t.amount,0)/1_000).toFixed(0)}K · Accounts` });
  }
  return out;
}

export function useAccountAlerts(): AccountAlert[] {
  const all = useAccountTxns();
  return computeAccountAlerts(all);
}
