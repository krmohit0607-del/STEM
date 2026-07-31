import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  useAccountTxns,
  settleTxn,
  approveTxn,
  holdTxn,
  scheduleTxn,
  findTxnByInvoice,
  daysUntil,
  isOverdue,
  ACCT_NOW,
  useSelectedAccountVessel,
  clearSelectedAccountVessel,
  type FinTxn,
  type TxnStatus,
  type Approval,
  type Priority,
  type TxnCategory,
} from '../data/accounts';
import { getBunkerRequirements, updateBunkerRequirement } from '../data/bunker';

/**
 * Accounts — Financial Control Center. Single source of truth: every financial
 * event from other ODAS modules flows into one ledger. Settling a payable that
 * originated in Bunker reflects the status back to that module in real time.
 */

/* ---------------------------------------------------------------- helpers */

function money(n: number): string {
  return `USD ${Math.round(n).toLocaleString('en-US')}`;
}
function abbr(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e6) return `${sign}USD ${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}USD ${(a / 1e3).toFixed(0)}K`;
  return `${sign}USD ${a.toFixed(0)}`;
}
function num(n: number): string {
  return n.toLocaleString('en-US');
}

const CAT_COLOR: Record<TxnCategory, string> = {
  Hire: '#58a6ff', Freight: '#6fdc8c', PDA: '#b98cff', FDA: '#8a6cff', Bunker: '#e3b341',
  Agency: '#4fd1c5', Port: '#f0883e', Canal: '#f0a35e', Demurrage: '#ff6b6b', Despatch: '#4fd1c5',
  Claims: '#ff8a5c', Commission: '#9fd0ff', Performance: '#b98cff', Weather: '#5ad1e0',
  Insurance: '#9aa6b6', Taxes: '#8b98ad', Misc: '#6e7681',
};

const STATUS_TONE: Record<TxnStatus, string> = {
  'Approval Pending': 'purple', Due: 'amber', Scheduled: 'blue', 'On Hold': 'grey',
  Paid: 'green', Received: 'green', Cancelled: 'grey',
};

/** Settle a transaction and reflect Bunker-origin payments back to the Bunker module. */
function settleAndReflect(t: FinTxn): void {
  settleTxn(t.id);
  if (t.kind === 'Payable' && t.module === 'Bunker') {
    const updated = findTxnByInvoice(t.invoiceNo);
    const req = getBunkerRequirements().find((r) => r.invoiceNo === t.invoiceNo);
    if (req) {
      updateBunkerRequirement(
        req.id,
        { status: 'Paid', paymentStatus: 'Paid', amountPaid: t.amount, paymentRef: updated?.paymentRef, paymentDate: updated?.paymentDate },
        { user: 'Accounts', role: 'Accounts', action: `Payment settled — ${updated?.paymentRef ?? ''}` },
      );
    }
  }
}

/* --------- small ui atoms --------- */

function Kpi({ label, value, delta, tone, icon, hint }: { label: string; value: string; delta?: string; tone?: string; icon: string; hint?: string }) {
  const up = delta?.startsWith('+');
  return (
    <div className={`fv-acct__kpi${tone ? ` fv-acct__kpi--${tone}` : ''}`}>
      <div className="fv-acct__kpi-icon"><i className={`fas ${icon}`} aria-hidden="true" /></div>
      <div className="fv-acct__kpi-body">
        <span className="fv-acct__kpi-label">{label}</span>
        <span className="fv-acct__kpi-value">{value}</span>
        <span className="fv-acct__kpi-foot">
          {delta && <span className={`fv-acct__delta fv-acct__delta--${up ? 'up' : 'down'}`}><i className={`fas fa-arrow-${up ? 'up' : 'down'}`} /> {delta}</span>}
          {hint && <span className="fv-acct__kpi-hint">{hint}</span>}
        </span>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: TxnStatus }) {
  return <span className={`fv-acct__pill fv-acct__pill--${STATUS_TONE[status]}`}>{status}</span>;
}
function ApprovalPill({ a }: { a: Approval }) {
  const tone = a === 'Approved' || a === 'Auto' ? 'green' : a === 'Pending' ? 'amber' : 'red';
  return <span className={`fv-acct__pill fv-acct__pill--${tone}`}>{a}</span>;
}
function PriorityPill({ p }: { p: Priority }) {
  const tone = p === 'High' ? 'red' : p === 'Medium' ? 'amber' : 'green';
  return <span className={`fv-acct__prio fv-acct__prio--${tone}`}>{p}</span>;
}

/* --------- donut (payables by category) --------- */

function Donut({ segments, total }: { segments: { label: string; value: number; color: string }[]; total: number }) {
  let acc = 0;
  const stops = segments.map((s) => {
    const start = (acc / total) * 360;
    acc += s.value;
    const end = (acc / total) * 360;
    return `${s.color} ${start}deg ${end}deg`;
  });
  return (
    <div className="fv-acct__donut">
      <div className="fv-acct__donut-ring" style={{ background: `conic-gradient(${stops.join(', ')})` }}>
        <div className="fv-acct__donut-hole">
          <span className="fv-acct__donut-total">{abbr(total)}</span>
          <span className="fv-acct__donut-cap">Total</span>
        </div>
      </div>
      <ul className="fv-acct__legend">
        {segments.map((s) => (
          <li key={s.label}>
            <span className="fv-acct__dot" style={{ background: s.color }} />
            <span className="fv-acct__legend-label">{s.label}</span>
            <span className="fv-acct__legend-pct">{Math.round((s.value / total) * 100)}%</span>
            <span className="fv-acct__legend-val">{num(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------- cash flow bar chart --------- */

function CashFlowChart({ bars }: { bars: { label: string; net: number }[] }) {
  const max = Math.max(1, ...bars.map((b) => Math.abs(b.net)));
  return (
    <div className="fv-acct__chart">
      <div className="fv-acct__chart-bars">
        {bars.map((b, i) => (
          <div key={i} className="fv-acct__bar-col" title={`${b.label}: ${abbr(b.net)}`}>
            <div className={`fv-acct__bar fv-acct__bar--${b.net >= 0 ? 'pos' : 'neg'}`} style={{ height: `${(Math.abs(b.net) / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="fv-acct__chart-axis"><span>{bars[0]?.label}</span><span>Today</span><span>{bars[bars.length - 1]?.label}</span></div>
    </div>
  );
}

/* --------- transaction detail modal --------- */

function TxnDetail({ t, onClose }: { t: FinTxn; onClose: () => void }) {
  const F = ({ label, value }: { label: string; value: ReactNode }) => (
    <div className="fv-acct__field"><span>{label}</span><b>{value ?? '—'}</b></div>
  );
  return (
    <div className="fv-acct__modal-backdrop" onClick={onClose}>
      <div className="fv-acct__modal" onClick={(e) => e.stopPropagation()}>
        <div className="fv-acct__modal-head">
          <span><i className="fas fa-receipt" aria-hidden="true" /> {t.invoiceNo} · {t.category} {t.kind}</span>
          <button type="button" className="fv-acct__icon-btn" onClick={onClose}><i className="fas fa-xmark" /></button>
        </div>
        <div className="fv-acct__modal-body">
          <div className="fv-acct__grid4">
            <F label="Transaction ID" value={t.id} />
            <F label="Source Module" value={t.module} />
            <F label="Company" value={t.company} />
            <F label="Reference No" value={t.reference} />
            <F label="Vessel" value={t.vessel} />
            <F label="Voyage" value={t.voyage} />
            <F label="Fixture" value={t.fixture} />
            <F label="Counterparty" value={t.counterparty} />
            <F label="Invoice No" value={t.invoiceNo} />
            <F label="Amount" value={`${t.currency} ${num(t.amount)}`} />
            <F label="Exchange Rate" value={t.exchangeRate} />
            <F label="Base (USD)" value={money(t.amount * t.exchangeRate)} />
            <F label="Invoice Date" value={t.invoiceDate} />
            <F label="Due Date" value={t.dueDate} />
            <F label="Bank" value={t.bank} />
            <F label="Method" value={t.method} />
            <F label="Priority" value={<PriorityPill p={t.priority} />} />
            <F label="Approval" value={<ApprovalPill a={t.approval} />} />
            <F label="Status" value={<StatusPill status={t.status} />} />
            <F label="Payment Ref" value={t.paymentRef} />
          </div>
          <div className="fv-acct__audit-head">Audit Trail</div>
          <ul className="fv-acct__audit">
            {t.audit.map((a, i) => (
              <li key={i}>
                <span className="fv-acct__audit-dot" />
                <div><span>{a.action}{a.from && a.to ? ` (${a.from} → ${a.to})` : ''}</span><small>{a.user} · {a.at}</small></div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* --------- reusable data grid --------- */

function TxnGrid({ rows, onView }: { rows: FinTxn[]; onView: (t: FinTxn) => void }) {
  if (rows.length === 0) return <div className="fv-acct__empty"><i className="fas fa-inbox" aria-hidden="true" /> No transactions match the current view.</div>;
  return (
    <div className="fv-acct__gridwrap">
      <table className="fv-acct__table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Module</th>
            <th>Vessel / Voyage</th>
            <th>Counterparty</th>
            <th>Reference</th>
            <th>Invoice</th>
            <th className="fv-acct__r">Amount</th>
            <th>Cur.</th>
            <th>Due</th>
            <th>Approval</th>
            <th>Status</th>
            <th>Priority</th>
            <th className="fv-acct__actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const overdue = isOverdue(t);
            const settled = t.status === 'Paid' || t.status === 'Received';
            return (
              <tr key={t.id} onClick={() => onView(t)}>
                <td><span className="fv-acct__cat" style={{ borderColor: CAT_COLOR[t.category] }}><span className="fv-acct__cat-dot" style={{ background: CAT_COLOR[t.category] }} /> {t.category}</span><div className="fv-acct__sub">{t.kind}</div></td>
                <td>{t.module}</td>
                <td><div className="fv-acct__strong">{t.vessel}</div><div className="fv-acct__sub">{t.voyage}</div></td>
                <td>{t.counterparty}</td>
                <td className="fv-acct__ref">{t.reference}</td>
                <td>{t.invoiceNo}</td>
                <td className="fv-acct__r"><b>{num(t.amount)}</b></td>
                <td>{t.currency}</td>
                <td className={overdue ? 'fv-acct__od' : undefined}>{t.dueDate}{overdue ? <div className="fv-acct__sub fv-acct__od">Overdue {Math.abs(daysUntil(t.dueIso))}d</div> : null}</td>
                <td><ApprovalPill a={t.approval} /></td>
                <td>{overdue ? <span className="fv-acct__pill fv-acct__pill--red">Overdue</span> : <StatusPill status={t.status} />}</td>
                <td><PriorityPill p={t.priority} /></td>
                <td className="fv-acct__actions" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="fv-acct__icon-btn" title="View" onClick={() => onView(t)}><i className="fas fa-eye" /></button>
                  {t.approval === 'Pending' && <button type="button" className="fv-acct__icon-btn fv-acct__ok" title="Approve" onClick={() => approveTxn(t.id, 'approve')}><i className="fas fa-check" /></button>}
                  {!settled && t.approval !== 'Pending' && t.status !== 'Cancelled' && (
                    <button type="button" className="fv-acct__icon-btn fv-acct__ok" title={t.kind === 'Payable' ? 'Execute payment' : 'Record receipt'} onClick={() => settleAndReflect(t)}><i className="fas fa-money-bill-wave" /></button>
                  )}
                  {!settled && t.status === 'Due' && <button type="button" className="fv-acct__icon-btn" title="Schedule" onClick={() => scheduleTxn(t.id)}><i className="fas fa-calendar" /></button>}
                  {!settled && t.status !== 'On Hold' && t.status !== 'Cancelled' && <button type="button" className="fv-acct__icon-btn" title="Hold" onClick={() => holdTxn(t.id)}><i className="fas fa-pause" /></button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* --------- AI finance assistant --------- */

const AI_QA: { q: string; a: (t: FinTxn[]) => string }[] = [
  { q: 'What payments are due today?', a: (t) => { const d = t.filter((x) => x.kind === 'Payable' && x.status !== 'Paid' && daysUntil(x.dueIso) === 0); return d.length ? `${d.length} payment(s) due today totalling ${money(d.reduce((s, x) => s + x.amount, 0))}.` : 'No payments are due today.'; } },
  { q: 'Show overdue bunker invoices.', a: (t) => { const d = t.filter((x) => x.category === 'Bunker' && isOverdue(x)); return d.length ? `${d.length} overdue bunker invoice(s): ${d.map((x) => `${x.vessel} (${money(x.amount)})`).join(', ')}.` : 'No overdue bunker invoices.'; } },
  { q: 'Show unpaid hire.', a: (t) => { const d = t.filter((x) => x.category === 'Hire' && x.kind === 'Payable' && x.status !== 'Paid'); return d.length ? `Unpaid hire: ${money(d.reduce((s, x) => s + x.amount, 0))} across ${d.length} vessel(s).` : 'All hire is settled.'; } },
  { q: 'Show outstanding freight.', a: (t) => { const d = t.filter((x) => x.category === 'Freight' && x.kind === 'Receivable' && x.status !== 'Received'); return d.length ? `Outstanding freight receivable: ${money(d.reduce((s, x) => s + x.amount, 0))}.` : 'No outstanding freight.'; } },
  { q: 'Which invoices are awaiting approval?', a: (t) => { const d = t.filter((x) => x.approval === 'Pending'); return d.length ? `${d.length} awaiting approval: ${d.map((x) => x.invoiceNo).join(', ')}.` : 'Nothing awaiting approval.'; } },
  { q: 'What is today\u2019s expected cash position?', a: (t) => { const inn = t.filter((x) => x.kind === 'Receivable' && x.status !== 'Received' && daysUntil(x.dueIso) <= 0).reduce((s, x) => s + x.amount, 0); const out = t.filter((x) => x.kind === 'Payable' && x.status !== 'Paid' && daysUntil(x.dueIso) <= 0).reduce((s, x) => s + x.amount, 0); return `Net expected today: ${abbr(inn - out)} (in ${abbr(inn)} / out ${abbr(out)}).`; } },
];

function AiAssistant({ txns }: { txns: FinTxn[] }) {
  const [answer, setAnswer] = useState<string | null>(null);
  return (
    <div className="fv-acct__ai">
      <div className="fv-acct__ai-head"><i className="fas fa-wand-magic-sparkles" aria-hidden="true" /> AI Finance Assistant</div>
      <div className="fv-acct__ai-chips">
        {AI_QA.map((item) => (
          <button key={item.q} type="button" className="fv-acct__ai-chip" onClick={() => setAnswer(item.a(txns))}>{item.q}</button>
        ))}
      </div>
      {answer && <div className="fv-acct__ai-answer"><i className="fas fa-robot" aria-hidden="true" /> {answer}</div>}
    </div>
  );
}

/* ------------------------------------------------------------ main page */

type Tab = 'overview' | 'payables' | 'receivables' | 'cashflow' | 'approvals' | 'bank' | 'reports';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'payables', label: 'Payables' },
  { id: 'receivables', label: 'Receivables' },
  { id: 'cashflow', label: 'Cash Flow' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'bank', label: 'Bank & Reconciliation' },
  { id: 'reports', label: 'Reports' },
];

const CATEGORY_CHIPS: TxnCategory[] = ['Hire', 'Freight', 'PDA', 'FDA', 'Bunker', 'Demurrage', 'Despatch', 'Agency', 'Port', 'Canal', 'Claims', 'Commission', 'Performance', 'Weather'];

const CASH_IN_BANK = 4_245_890;

export function AccountsPage() {
  const txns = useAccountTxns();
  const sidebarVessel = useSelectedAccountVessel();
  const [tab, setTab] = useState<Tab>('overview');
  const [company, setCompany] = useState('All');
  const [vessel, setVessel] = useState('All');
  const [typeF, setTypeF] = useState('All');
  const [currency, setCurrency] = useState('All');
  const [statusF, setStatusF] = useState('All');
  const [query, setQuery] = useState('');
  const [cats, setCats] = useState<Set<TxnCategory>>(new Set());
  const [gridTab, setGridTab] = useState<'due' | 'overdue' | 'scheduled' | 'completed' | 'all'>('due');
  const [detail, setDetail] = useState<FinTxn | null>(null);

  const vessels = useMemo(() => ['All', ...Array.from(new Set(txns.map((t) => t.vessel)))], [txns]);

  const toggleCat = (c: TxnCategory) => setCats((prev) => { const n = new Set(prev); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return txns.filter((t) => {
      if (sidebarVessel && t.vessel !== sidebarVessel) return false;
      if (vessel !== 'All' && t.vessel !== vessel) return false;
      if (typeF !== 'All' && t.kind !== typeF) return false;
      if (currency !== 'All' && t.currency !== currency) return false;
      if (statusF !== 'All' && t.status !== statusF) return false;
      if (cats.size > 0 && !cats.has(t.category)) return false;
      if (q && !`${t.invoiceNo} ${t.vessel} ${t.counterparty} ${t.reference} ${t.category}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [txns, sidebarVessel, vessel, typeF, currency, statusF, cats, query]);

  // Dashboard scope follows the sidebar-selected vessel (all vessels when none).
  const scope = useMemo(() => (sidebarVessel ? txns.filter((t) => t.vessel === sidebarVessel) : txns), [txns, sidebarVessel]);

  const kpi = useMemo(() => {
    const payUnpaid = scope.filter((t) => t.kind === 'Payable' && t.status !== 'Paid' && t.status !== 'Cancelled');
    const recUnpaid = scope.filter((t) => t.kind === 'Receivable' && t.status !== 'Received' && t.status !== 'Cancelled');
    const overdue = scope.filter(isOverdue);
    const dueToday = payUnpaid.filter((t) => daysUntil(t.dueIso) === 0);
    const upcoming = payUnpaid.filter((t) => { const d = daysUntil(t.dueIso); return d > 0 && d <= 7; });
    const recToday = recUnpaid.filter((t) => daysUntil(t.dueIso) === 0);
    const totalPay = payUnpaid.reduce((s, t) => s + t.amount, 0);
    const totalRec = recUnpaid.reduce((s, t) => s + t.amount, 0);
    const paidToday = scope.filter((t) => t.status === 'Paid').reduce((s, t) => s + t.amount, 0);
    return {
      totalPay, totalRec, payCount: payUnpaid.length, recCount: recUnpaid.length,
      cash: CASH_IN_BANK,
      paidToday, paidTodayCount: scope.filter((t) => t.status === 'Paid').length,
      recToday: recToday.reduce((s, t) => s + t.amount, 0),
      upcomingAmt: upcoming.reduce((s, t) => s + t.amount, 0), upcomingCount: upcoming.length,
      overdueAmt: overdue.reduce((s, t) => s + t.amount, 0), overdueCount: overdue.length,
      dueTodayAmt: dueToday.reduce((s, t) => s + t.amount, 0), dueTodayCount: dueToday.length,
      working: totalRec - totalPay + CASH_IN_BANK,
    };
  }, [scope]);

  const catSegments = useMemo(() => {
    const map = new Map<TxnCategory, number>();
    scope.filter((t) => t.kind === 'Payable' && t.status !== 'Paid' && t.status !== 'Cancelled').forEach((t) => map.set(t.category, (map.get(t.category) ?? 0) + t.amount));
    return Array.from(map.entries()).map(([label, value]) => ({ label, value, color: CAT_COLOR[label] })).sort((a, b) => b.value - a.value);
  }, [scope]);
  const catTotal = catSegments.reduce((s, c) => s + c.value, 0);

  const forecast = useMemo(() => {
    const days = 30;
    const bars: { label: string; net: number }[] = [];
    for (let i = 0; i < days; i += 1) {
      const day = new Date(ACCT_NOW.getTime() + i * 86_400_000);
      const iso = day.toISOString().slice(0, 10);
      const inn = scope.filter((t) => t.kind === 'Receivable' && t.status !== 'Received' && t.dueIso === iso).reduce((s, t) => s + t.amount, 0);
      const out = scope.filter((t) => t.kind === 'Payable' && t.status !== 'Paid' && t.dueIso === iso).reduce((s, t) => s + t.amount, 0);
      // add a little synthetic baseline so the chart reads like a forecast
      const base = Math.sin(i / 2) * 120_000;
      bars.push({ label: `${day.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][day.getMonth()]}`, net: inn - out + base });
    }
    return bars;
  }, [scope]);

  const currencyPos = useMemo(() => {
    const map = new Map<string, number>();
    scope.filter((t) => t.status !== 'Cancelled').forEach((t) => map.set(t.currency, (map.get(t.currency) ?? 0) + (t.kind === 'Receivable' ? t.amount : -t.amount)));
    return Array.from(map.entries()).map(([cur, val]) => ({ cur, val }));
  }, [scope]);

  const paymentsDue7 = useMemo(() => scope.filter((t) => t.kind === 'Payable' && t.status !== 'Paid' && daysUntil(t.dueIso) >= 0 && daysUntil(t.dueIso) <= 8).sort((a, b) => daysUntil(a.dueIso) - daysUntil(b.dueIso)), [scope]);

  const alerts = useMemo(() => {
    const a: { icon: string; tone: string; text: string; at: string }[] = [];
    scope.filter(isOverdue).slice(0, 2).forEach((t) => a.push({ icon: 'fa-triangle-exclamation', tone: 'red', text: `${t.category} ${t.kind === 'Payable' ? 'payment' : 'receipt'} overdue for ${t.vessel} (${money(t.amount)})`, at: '1d ago' }));
    scope.filter((t) => t.approval === 'Pending').slice(0, 2).forEach((t) => a.push({ icon: 'fa-user-clock', tone: 'amber', text: `${t.category} invoice ${t.invoiceNo} awaiting approval`, at: '3h ago' }));
    scope.filter((t) => t.kind === 'Payable' && daysUntil(t.dueIso) === 1).slice(0, 1).forEach((t) => a.push({ icon: 'fa-clock', tone: 'blue', text: `${t.category} payment due tomorrow — ${t.vessel} (${money(t.amount)})`, at: '2h ago' }));
    return a;
  }, [scope]);

  const gridRows = useMemo(() => {
    if (gridTab === 'overdue') return filtered.filter(isOverdue);
    if (gridTab === 'scheduled') return filtered.filter((t) => t.status === 'Scheduled');
    if (gridTab === 'completed') return filtered.filter((t) => t.status === 'Paid' || t.status === 'Received');
    if (gridTab === 'due') return filtered.filter((t) => (t.status === 'Due' || t.status === 'Scheduled') && !isOverdue(t));
    return filtered;
  }, [filtered, gridTab]);

  const asOn = `${ACCT_NOW.getDate()} Jun ${ACCT_NOW.getFullYear()}`;

  return (
    <div className="fv-acct">
      <div className="fv-acct__main">
        {/* header */}
        <header className="fv-acct__topbar">
          <h1><i className="fas fa-building-columns" aria-hidden="true" /> Accounts Dashboard</h1>
          <div className="fv-acct__actions">
            <button type="button" className="fv-acct__btn"><i className="fas fa-plus" /> Create Payment</button>
            <button type="button" className="fv-acct__btn"><i className="fas fa-hand-holding-dollar" /> Record Receipt</button>
            <button type="button" className="fv-acct__btn"><i className="fas fa-file-invoice" /> Create Invoice</button>
            <button type="button" className="fv-acct__btn"><i className="fas fa-file-lines" /> Reports</button>
            <button type="button" className="fv-acct__btn"><i className="fas fa-file-export" /> Export</button>
            <button type="button" className="fv-acct__icon-btn fv-acct__icon-btn--lg" title="Audit Logs"><i className="fas fa-clock-rotate-left" /></button>
            <button type="button" className="fv-acct__icon-btn fv-acct__icon-btn--lg" title="Notifications"><i className="fas fa-bell" /></button>
            <button type="button" className="fv-acct__icon-btn fv-acct__icon-btn--lg" title="Settings"><i className="fas fa-gear" /></button>
          </div>
        </header>

        {/* tabs */}
        <nav className="fv-acct__tabs" aria-label="Accounts sections">
          {TABS.map((tb) => (
            <button key={tb.id} type="button" className={`fv-acct__tab${tab === tb.id ? ' fv-acct__tab--active' : ''}`} onClick={() => setTab(tb.id)}>{tb.label}</button>
          ))}
        </nav>

        {/* filters */}
        <div className="fv-acct__filters">
          <label><span>Entity / Company</span><select value={company} onChange={(e) => setCompany(e.target.value)}><option>All</option><option>ODAS Shipping Ltd</option></select></label>
          <label><span>Vessel</span><select value={vessel} onChange={(e) => setVessel(e.target.value)}>{vessels.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label><span>Type</span><select value={typeF} onChange={(e) => setTypeF(e.target.value)}><option>All</option><option value="Payable">Payables</option><option value="Receivable">Receivables</option></select></label>
          <label><span>Currency</span><select value={currency} onChange={(e) => setCurrency(e.target.value)}><option>All</option><option>USD</option><option>EUR</option><option>CNY</option><option>SGD</option></select></label>
          <label><span>Status</span><select value={statusF} onChange={(e) => setStatusF(e.target.value)}><option>All</option>{['Approval Pending', 'Due', 'Scheduled', 'On Hold', 'Paid', 'Received', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="fv-acct__grow"><span>Search</span><span className="fv-acct__search"><i className="fas fa-magnifying-glass" /><input value={query} placeholder="Invoice, vessel, counterparty, reference…" onChange={(e) => setQuery(e.target.value)} /></span></label>
          <button type="button" className="fv-acct__btn fv-acct__btn--ghost"><i className="fas fa-sliders" /> More Filters</button>
        </div>

        {/* category chips + active vessel (from sidebar) */}
        <div className="fv-acct__chips">
          {sidebarVessel && (
            <button type="button" className="fv-acct__chip fv-acct__chip--vessel" onClick={() => clearSelectedAccountVessel()} title="Clear vessel filter">
              <i className="fas fa-ship" /> {sidebarVessel} <i className="fas fa-xmark" />
            </button>
          )}
          <span className="fv-acct__chips-label">Category:</span>
          <button type="button" className={`fv-acct__chip${cats.size === 0 ? ' fv-acct__chip--on' : ''}`} onClick={() => setCats(new Set())}>All</button>
          {CATEGORY_CHIPS.map((c) => (
            <button key={c} type="button" className={`fv-acct__chip${cats.has(c) ? ' fv-acct__chip--on' : ''}`} onClick={() => toggleCat(c)}>{c}</button>
          ))}
        </div>

        {tab === 'overview' && (
          <>
            <div className="fv-acct__kpis">
              <Kpi label="Total Payables" value={abbr(kpi.totalPay)} delta="+4.2%" tone="red" icon="fa-file-invoice-dollar" hint={`${kpi.payCount} open`} />
              <Kpi label="Total Receivables" value={abbr(kpi.totalRec)} delta="+6.8%" tone="green" icon="fa-hand-holding-dollar" hint={`${kpi.recCount} open`} />
              <Kpi label="Cash In Bank" value={abbr(kpi.cash)} delta="+2.1%" tone="blue" icon="fa-vault" hint={`As on ${asOn}`} />
              <Kpi label="Payments Today" value={abbr(kpi.dueTodayAmt)} tone="purple" icon="fa-money-bill-transfer" hint={`${kpi.dueTodayCount} payments`} />
              <Kpi label="Upcoming (7 Days)" value={abbr(kpi.upcomingAmt)} tone="blue" icon="fa-calendar-day" hint={`${kpi.upcomingCount} payments`} />
              <Kpi label="Overdue" value={abbr(kpi.overdueAmt)} delta="-1.4%" tone="red" icon="fa-triangle-exclamation" hint={`${kpi.overdueCount} items`} />
              <Kpi label="Working Capital" value={abbr(kpi.working)} delta="+3.0%" tone="green" icon="fa-scale-balanced" />
              <Kpi label="Financial Health" value="A- · 82" tone="green" icon="fa-heart-pulse" hint="Stable" />
            </div>

            <div className="fv-acct__row3">
              <section className="fv-acct__card fv-acct__card--wide">
                <div className="fv-acct__card-head"><span><i className="fas fa-chart-column" /> Cash Flow Forecast (Next 30 Days)</span>
                  <span className="fv-acct__legend-inline"><span className="fv-acct__dot" style={{ background: '#6fdc8c' }} /> Inflow <span className="fv-acct__dot" style={{ background: '#ff6b6b' }} /> Outflow</span>
                </div>
                <div className="fv-acct__card-body"><CashFlowChart bars={forecast} /></div>
              </section>
              <section className="fv-acct__card">
                <div className="fv-acct__card-head"><span><i className="fas fa-chart-pie" /> Payables by Category</span></div>
                <div className="fv-acct__card-body"><Donut segments={catSegments} total={catTotal} /></div>
              </section>
            </div>

            <div className="fv-acct__row3">
              <section className="fv-acct__card">
                <div className="fv-acct__card-head"><span><i className="fas fa-calendar-check" /> Payments Due (Next 7 Days)</span></div>
                <div className="fv-acct__card-body">
                  <ul className="fv-acct__due-list">
                    {paymentsDue7.slice(0, 6).map((t) => { const d = daysUntil(t.dueIso); return (
                      <li key={t.id}>
                        <span className="fv-acct__due-date">{t.dueDate.split(' ').slice(0, 2).join(' ')}</span>
                        <span className="fv-acct__due-main"><b>{t.category} — {t.vessel}</b><small>{t.counterparty}</small></span>
                        <span className="fv-acct__due-amt">{money(t.amount)}</span>
                        <span className={`fv-acct__pill fv-acct__pill--${d === 0 ? 'red' : d <= 2 ? 'amber' : 'blue'}`}>{d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `${d}d left`}</span>
                      </li>
                    ); })}
                  </ul>
                </div>
              </section>
              <section className="fv-acct__card">
                <div className="fv-acct__card-head"><span><i className="fas fa-bell" /> Alerts &amp; Notifications</span></div>
                <div className="fv-acct__card-body">
                  <ul className="fv-acct__alerts">
                    {alerts.map((a, i) => (
                      <li key={i}><span className={`fv-acct__alert-ico fv-acct__alert-ico--${a.tone}`}><i className={`fas ${a.icon}`} /></span><div><span>{a.text}</span><small>{a.at}</small></div></li>
                    ))}
                  </ul>
                </div>
              </section>
              <section className="fv-acct__card">
                <div className="fv-acct__card-head"><span><i className="fas fa-coins" /> Cash Position by Currency</span></div>
                <div className="fv-acct__card-body">
                  <ul className="fv-acct__ccy">
                    {currencyPos.map((c) => (
                      <li key={c.cur}><span className="fv-acct__ccy-cur">{c.cur}</span><span className="fv-acct__ccy-val">{num(Math.abs(c.val))}</span><span className={`fv-acct__ccy-net fv-acct__ccy-net--${c.val >= 0 ? 'up' : 'down'}`}>{c.val >= 0 ? '▲' : '▼'} {c.cur}</span></li>
                    ))}
                  </ul>
                </div>
              </section>
            </div>

            <AiAssistant txns={txns} />

            <section className="fv-acct__card">
              <div className="fv-acct__card-head fv-acct__card-head--tabs">
                {(['due', 'overdue', 'scheduled', 'completed', 'all'] as const).map((g) => (
                  <button key={g} type="button" className={`fv-acct__gridtab${gridTab === g ? ' fv-acct__gridtab--active' : ''}`} onClick={() => setGridTab(g)}>
                    {g === 'due' ? 'Payments Due' : g[0].toUpperCase() + g.slice(1)} <span className="fv-acct__count">{
                      g === 'overdue' ? filtered.filter(isOverdue).length : g === 'scheduled' ? filtered.filter((t) => t.status === 'Scheduled').length : g === 'completed' ? filtered.filter((t) => t.status === 'Paid' || t.status === 'Received').length : g === 'all' ? filtered.length : filtered.filter((t) => (t.status === 'Due' || t.status === 'Scheduled') && !isOverdue(t)).length
                    }</span>
                  </button>
                ))}
              </div>
              <TxnGrid rows={gridRows} onView={setDetail} />
            </section>
          </>
        )}

        {tab === 'payables' && <TxnGrid rows={filtered.filter((t) => t.kind === 'Payable')} onView={setDetail} />}
        {tab === 'receivables' && <TxnGrid rows={filtered.filter((t) => t.kind === 'Receivable')} onView={setDetail} />}
        {tab === 'approvals' && (
          <section className="fv-acct__card">
            <div className="fv-acct__card-head"><span><i className="fas fa-user-check" /> Awaiting Approval</span></div>
            <TxnGrid rows={filtered.filter((t) => t.approval === 'Pending')} onView={setDetail} />
          </section>
        )}

        {tab === 'cashflow' && (
          <div className="fv-acct__row3">
            <section className="fv-acct__card fv-acct__card--wide">
              <div className="fv-acct__card-head"><span><i className="fas fa-chart-column" /> Net Cash Flow — Next 30 Days</span></div>
              <div className="fv-acct__card-body"><CashFlowChart bars={forecast} /></div>
            </section>
            <section className="fv-acct__card">
              <div className="fv-acct__card-head"><span><i className="fas fa-arrows-rotate" /> Position</span></div>
              <div className="fv-acct__card-body">
                <ul className="fv-acct__kv">
                  <li><span>Expected Cash In</span><b className="fv-acct__pos">{abbr(kpi.totalRec)}</b></li>
                  <li><span>Expected Cash Out</span><b className="fv-acct__neg">{abbr(kpi.totalPay)}</b></li>
                  <li><span>Net Position</span><b>{abbr(kpi.totalRec - kpi.totalPay)}</b></li>
                  <li><span>Cash In Bank</span><b>{abbr(kpi.cash)}</b></li>
                  <li className="fv-acct__kv-strong"><span>Working Capital</span><b>{abbr(kpi.working)}</b></li>
                </ul>
              </div>
            </section>
          </div>
        )}

        {tab === 'bank' && (
          <section className="fv-acct__card">
            <div className="fv-acct__card-head"><span><i className="fas fa-building-columns" /> Bank &amp; Reconciliation</span>
              <span className="fv-acct__recon-actions"><button type="button" className="fv-acct__btn fv-acct__btn--ghost"><i className="fas fa-file-import" /> Import Statement</button><button type="button" className="fv-acct__btn fv-acct__btn--ghost"><i className="fas fa-wand-magic-sparkles" /> Auto Match</button></span>
            </div>
            <div className="fv-acct__card-body">
              <div className="fv-acct__recon">
                <div className="fv-acct__recon-stat"><span>Bank Balance</span><b>{money(4_128_450)}</b></div>
                <div className="fv-acct__recon-stat"><span>Ledger Balance</span><b>{money(kpi.cash)}</b></div>
                <div className="fv-acct__recon-stat"><span>Difference</span><b className="fv-acct__neg">{money(kpi.cash - 4_128_450)}</b></div>
                <div className="fv-acct__recon-stat"><span>Unmatched</span><b>3 items</b></div>
                <div className="fv-acct__recon-stat"><span>Status</span><span className="fv-acct__pill fv-acct__pill--amber">In Progress</span></div>
              </div>
              <p className="fv-acct__hint">Auto-match links imported bank lines to ledger transactions; duplicates are flagged and unmatched items queued for manual review.</p>
            </div>
          </section>
        )}

        {tab === 'reports' && (
          <section className="fv-acct__card">
            <div className="fv-acct__card-head"><span><i className="fas fa-file-lines" /> Reports &amp; Exports</span></div>
            <div className="fv-acct__card-body">
              <div className="fv-acct__reports">
                {['Cash Flow', 'Receivables', 'Payables', 'Outstanding', 'Ageing', 'Hire', 'Freight', 'PDA', 'FDA', 'Bunker', 'Vendor Ledger', 'Customer Ledger', 'Voyage Financials', 'Profit & Loss', 'Payment History', 'Collection History', 'Audit'].map((r) => (
                  <button key={r} type="button" className="fv-acct__report"><i className="fas fa-file-chart-column" /> {r} Report</button>
                ))}
              </div>
              <div className="fv-acct__export"><span>Export:</span><button type="button" className="fv-acct__btn fv-acct__btn--ghost"><i className="fas fa-file-excel" /> Excel</button><button type="button" className="fv-acct__btn fv-acct__btn--ghost"><i className="fas fa-file-pdf" /> PDF</button><button type="button" className="fv-acct__btn fv-acct__btn--ghost"><i className="fas fa-file-csv" /> CSV</button></div>
            </div>
          </section>
        )}
      </div>

      {detail && <TxnDetail t={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
