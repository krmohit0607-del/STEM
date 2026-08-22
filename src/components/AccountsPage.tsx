import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  useAccountTxns,
  updateTxn,
  findTxnByInvoice,
  daysUntil,
  isOverdue,
  ACCT_NOW,
  STATUS_TONES,
  stamp,
  useSelectedAccountVessel,
  type FinTxn,
  type TxnStatus,
  type Approval,
  type Priority,
  type TxnCategory,
} from '../data/accounts';
import { addNotification } from '../data/workflow';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { useFixtureNumbers } from '../data/workflow';
import { ModuleVesselSearch } from './ModuleVesselSearch';
import { getBunkerRequirements, updateBunkerRequirement } from '../data/bunker';
import { loadClients, newClientId, saveClients, type Client } from '../data/clients';
import { getWorkflowConfig, setWorkflowConfig } from '../data/workflowConfig';
import { BankAccountBox, type BankAccount } from './BankAccountBox';

/**
 * Accounts â€” Financial Control Center. Single source of truth: every financial
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

function downloadAccountFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function accountExcel(headers: string[], rows: (string | number | undefined)[][]): string {
  const cell = (value: string | number | undefined) => `<td>${String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</td>`;
  return `<table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map(cell).join('')}</tr>`).join('')}</tbody></table>`;
}

function accountPdf(headers: string[], rows: (string | number | undefined)[][]): void {
  const popup = window.open('', '_blank', 'width=1200,height=800');
  if (!popup) return;
  const esc = (value: string | number | undefined) => String(value ?? '').replace(/[&<>]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character] ?? character));
  popup.document.write(`<html><head><title>Accounts Reports</title><style>body{font:10px Arial;margin:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #aaa;padding:4px;text-align:left}th{background:#e8edf5}</style></head><body><h2>Accounts Reports</h2><table><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.onload=function(){window.print()}</script></body></html>`);
  popup.document.close();
}

function openPaymentPdf(t: FinTxn): void {
  const popup = window.open('', '_blank', 'width=900,height=760');
  if (!popup) return;
  const esc = (value: unknown) => String(value ?? '—').replace(/[&<>]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character] ?? character));
  const cfg = getWorkflowConfig();
  const counterparty = loadClients().find((c) => c.name.trim().toLowerCase() === (t.counterparty ?? '').trim().toLowerCase());
  const bank = t.kind === 'Receivable' ? cfg.companyBankAccount : (counterparty?.bankAccount ?? null);
  const party = t.kind === 'Receivable' ? (cfg.companyName || 'Our Company') : (t.counterparty || 'Counterparty');
  const detailsText = bank?.verified ? bank?.details?.trim() : '';
  const bankHtml = bank?.verified ? `<div style="margin-top:14px;border:1px solid #cdd5e1;background:#f8fafc;padding:10px;border-radius:6px">
    <div style="font-size:11px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">${esc(t.kind === 'Receivable' ? 'Our Company Account Details' : 'Payee Account Details')}</div>
    <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:6px">${esc(party)}</div>
    ${detailsText
      ? `<pre style="margin:0;white-space:pre-wrap;font:12px Arial;color:#182235">${esc(detailsText)}</pre>`
      : `<table style="width:100%;border-collapse:collapse;margin:0">
      <tbody>
        <tr><td style="border:none;padding:2px 8px 2px 0;color:#64748b;width:140px">Bank Name</td><td style="border:none;padding:2px 0">${esc(bank?.bankName || '—')}</td></tr>
        <tr><td style="border:none;padding:2px 8px 2px 0;color:#64748b">Account Holder</td><td style="border:none;padding:2px 0">${esc(bank?.accountHolder || '—')}</td></tr>
        <tr><td style="border:none;padding:2px 8px 2px 0;color:#64748b">Account Number</td><td style="border:none;padding:2px 0">${esc(bank?.accountNumber || '—')}</td></tr>
        <tr><td style="border:none;padding:2px 8px 2px 0;color:#64748b">SWIFT</td><td style="border:none;padding:2px 0">${esc(bank?.swift || '—')}</td></tr>
        <tr><td style="border:none;padding:2px 8px 2px 0;color:#64748b">IBAN</td><td style="border:none;padding:2px 0">${esc(bank?.iban || '—')}</td></tr>
      </tbody>
    </table>`}
  </div>` : '';
  const title = t.category === 'Hire' ? 'Hire SOA / Payment Statement' : `${t.category} Payment Statement`;
  const rows = [
    ['Transaction ID', t.id], ['Source Module', t.module], ['Company', t.company], ['Reference', t.reference],
    ['Vessel', t.vessel], ['Voyage', t.voyage], ['Counterparty', t.counterparty], ['Invoice No.', t.invoiceNo],
    ['Amount', `${t.currency} ${num(t.amount)}`], ['Invoice Date', t.invoiceDate], ['Due Date', t.dueDate],
    ['Approval', t.approval], ['Payment Status', t.status], ['Payment Reference', t.paymentRef], ['Payment Date', t.paymentDate],
  ];
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} - ${esc(t.invoiceNo)}</title><style>body{font:12px Arial;color:#182235;margin:32px}h1{font-size:20px;margin:0 0 4px}h2{font-size:13px;color:#5b687b;margin:0 0 22px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #cdd5e1;padding:9px;text-align:left}th{width:30%;background:#edf2f8;color:#506078}footer{margin-top:32px;color:#69778a;font-size:10px}@media print{button{display:none}}</style></head><body><h1>${esc(title)}</h1><h2>${esc(t.invoiceNo)} · ${esc(t.vessel)} · Generated from ${esc(t.module)}</h2><table>${rows.map(([label, value]) => `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`).join('')}</table>${bankHtml}<footer>This payment statement was generated from the Accounts transaction record. Use the browser print dialog to save as PDF.</footer><script>window.onload=function(){window.print()}</script></body></html>`);
  popup.document.close();
}

const CAT_COLOR: Record<TxnCategory, string> = {
  Hire: '#58a6ff', Freight: '#6fdc8c', PDA: '#b98cff', FDA: '#8a6cff', Bunker: '#e3b341',
  Agency: '#4fd1c5', Port: '#f0883e', Canal: '#f0a35e', Demurrage: '#ff6b6b', Despatch: '#4fd1c5',
  Claims: '#ff8a5c', Commission: '#9fd0ff', Performance: '#b98cff', Weather: '#5ad1e0',
  Insurance: '#9aa6b6', Taxes: '#8b98ad', Misc: '#6e7681',
};

const STATUS_TONE: Record<TxnStatus, string> = STATUS_TONES;

// All statuses available for manual selection — allows reverting to any state
const ALL_STATUSES: TxnStatus[] = [
  'Draft','Submitted','Accounts Review','Pending Approval','Approved','Scheduled',
  'Payment Executed','Bank Confirmation','Reconciled','Closed',
  'Overdue','Due','On Hold','Partially Paid','Payment Failed','Rejected','Cancelled',
  'Paid','Received',
];

const ACCOUNT_REPORTS = [
  ['cashflow', 'Cash Flow', 'All incoming and outgoing transactions'], ['receivables', 'Receivables', 'Open and settled customer receipts'], ['payables', 'Payables', 'Open and settled supplier payments'],
  ['outstanding', 'Outstanding', 'Unpaid balances by transaction'], ['ageing', 'Ageing Analysis', 'Due dates and ageing status'], ['hire', 'Hire Payments', 'Hire-related ledger entries'],
  ['freight', 'Freight', 'Freight-related ledger entries'], ['pda-fda', 'PDA / FDA', 'PDA and FDA ledger entries'], ['bunker', 'Bunker', 'Bunker-related ledger entries'],
  ['vendor', 'Vendor Ledger', 'Payables grouped by counterparty'], ['customer', 'Customer Ledger', 'Receivables grouped by counterparty'], ['voyage', 'Voyage Financials', 'Transactions with voyage references'],
  ['pnl', 'Profit & Loss', 'All financial entries for the selected scope'], ['payment-history', 'Payment History', 'Payment and settlement entries'], ['collection-history', 'Collection History', 'Receivable collection entries'], ['audit', 'Audit Trail', 'Transaction workflow history'],
] as const;

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

function CashFlowChart({ bars }: { bars: { label: string; inn: number; out: number; net: number }[] }) {
  const max = Math.max(1, ...bars.flatMap((b) => [b.inn, b.out]), 1);
  // Always show every alternate label so dates don't crowd
  const every = 2;
  return (
    <div className="fv-acct__chart fv-acct__chart--paired">
      <div className="fv-acct__chart-bars">
        {bars.map((b, i) => (
          <div key={i} className="fv-acct__bar-col" title={`${b.label}\nIn: ${abbr(b.inn)}  Out: ${abbr(b.out)}`}>
            <div className="fv-acct__bar-pair">
              <div className="fv-acct__bar fv-acct__bar--pos" style={{ height: `${(b.inn / max) * 100}%` }} />
              <div className="fv-acct__bar fv-acct__bar--neg" style={{ height: `${(b.out / max) * 100}%` }} />
            </div>
            <div className="fv-acct__bar-date">{i % every === 0 ? b.label : ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------- side-by-side cashflow table (like image) --------- */

function CashflowTable({ scope }: { scope: FinTxn[] }) {
  const recs = scope.filter((t) => t.kind === 'Receivable' && t.status !== 'Received' && t.status !== 'Cancelled').sort((a, b) => a.dueIso.localeCompare(b.dueIso));
  const pays = scope.filter((t) => t.kind === 'Payable' && t.status !== 'Paid' && t.status !== 'Cancelled').sort((a, b) => a.dueIso.localeCompare(b.dueIso));
  const rows = Math.max(recs.length, pays.length);
  const totalRec = recs.reduce((s, t) => s + t.amount, 0);
  const totalPay = pays.reduce((s, t) => s + t.amount, 0);
  const net = totalRec - totalPay;
  if (rows === 0) return null;
  return (
    <div className="fv-acct__cft-wrap">
      <table className="fv-acct__cft">
        <thead>
          <tr>
            <th>Date</th><th>Receivables</th><th className="fv-acct__r">Amount (USD)</th>
            <td className="fv-acct__cft-divider" />
            <th>Date</th><th>Payables</th><th className="fv-acct__r">Amount (USD)</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => {
            const r = recs[i], p = pays[i];
            return (
              <tr key={i}>
                <td className="fv-acct__cft-date">{r?.dueDate.split(' ').slice(0, 2).join(' ') ?? ''}</td>
                <td>{r ? `${r.category} (${r.counterparty})` : ''}</td>
                <td className="fv-acct__r fv-acct__pos">{r ? num(r.amount) : ''}</td>
                <td className="fv-acct__cft-divider" />
                <td className="fv-acct__cft-date">{p?.dueDate.split(' ').slice(0, 2).join(' ') ?? ''}</td>
                <td>{p ? `${p.category} (${p.counterparty})` : ''}</td>
                <td className="fv-acct__r fv-acct__neg">{p ? num(p.amount) : ''}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="fv-acct__cft-totrow">
            <td /><td><b>Total Receivables</b></td><td className="fv-acct__r"><b>{money(totalRec)}</b></td>
            <td />
            <td /><td><b>Total Payables</b></td><td className="fv-acct__r"><b>{money(totalPay)}</b></td>
          </tr>
          <tr className="fv-acct__cft-netrow">
            <td colSpan={3}><b>Net Cash Flow (Receivables – Payables)</b></td>
            <td />
            <td colSpan={3} className="fv-acct__r"><b className={net >= 0 ? 'fv-acct__pos' : 'fv-acct__neg'}>{money(net)}</b></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* --------- transaction detail modal --------- */

function TxnDetail({ t, onClose }: { t: FinTxn; onClose: () => void }) {
  const [live, setLive] = useState(t);
  const [counterpartyBank, setCounterpartyBank] = useState<BankAccount>({ verified: false, details: '', bankName: '', accountHolder: '', accountNumber: '', swift: '', iban: '' });
  const [companyBank, setCompanyBank] = useState<BankAccount>(() => getWorkflowConfig().companyBankAccount);
  const refresh = () => { const u = findTxnByInvoice(live.invoiceNo); if (u) setLive(u); };

  useEffect(() => {
    const match = loadClients().find((c) => c.name.trim().toLowerCase() === live.counterparty.trim().toLowerCase());
    setCounterpartyBank(match?.bankAccount ?? { verified: false, details: '', bankName: '', accountHolder: '', accountNumber: '', swift: '', iban: '' });
    setCompanyBank(getWorkflowConfig().companyBankAccount);
  }, [live.counterparty]);

  const saveCounterpartyBank = (account: BankAccount) => {
    setCounterpartyBank(account);
    const name = live.counterparty.trim();
    if (!name) return;
    const all = loadClients();
    const idx = all.findIndex((c) => c.name.trim().toLowerCase() === name.toLowerCase());
    if (idx >= 0) {
      const updated = [...all];
      updated[idx] = { ...updated[idx], bankAccount: account };
      saveClients(updated);
      return;
    }
    const created: Client = {
      id: newClientId(),
      kind: 'Account',
      category: 'Operator',
      name,
      location: '',
      email: '',
      contactName: '',
      phone: '',
      username: '',
      password: '',
      role: 'Account User',
      pic: '',
      active: true,
      bankAccount: account,
    };
    saveClients([created, ...all]);
  };

  const saveCompanyBank = (account: BankAccount) => {
    setCompanyBank(account);
    setWorkflowConfig({ companyBankAccount: account });
  };

  const changeStatus = (next: TxnStatus) => {
    if (!next || next === live.status) return;
    updateTxn(live.id,
      { status: next, ...(next === 'Payment Executed' || next === 'Reconciled' ? { paymentDate: stamp() } : {}) },
      { user: 'Accounts', action: 'Status changed', from: live.status, to: next },
    );
    if ((next === 'Payment Executed' || next === 'Reconciled') && live.kind === 'Payable' && live.module === 'Bunker') {
      const req = getBunkerRequirements().find((r) => r.invoiceNo === live.invoiceNo);
      if (req) updateBunkerRequirement(req.id, { status: 'Paid', paymentStatus: 'Paid', amountPaid: live.amount }, { user: 'Accounts', role: 'Accounts', action: `Accounts \u2014 status: ${next}` });
    }
    addNotification(`${live.invoiceNo} \u00b7 ${live.vessel} status \u2192 ${next}`, live.module);
    refresh();
  };

  const uploadSwift = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { updateTxn(live.id, { swiftDocUrl: reader.result as string }, { user: 'Accounts', action: `SWIFT doc uploaded \u2014 ${file.name}` }); refresh(); };
    reader.readAsDataURL(file);
  };

  const F = ({ label, value }: { label: string; value: ReactNode }) => (
    <div className="fv-acct__field"><span>{label}</span><b>{value ?? '\u2014'}</b></div>
  );

  const tone = STATUS_TONE[live.status] ?? 'grey';

  return (
    <div className="fv-acct__modal-backdrop" onClick={onClose}>
      <div className="fv-acct__modal fv-acct__modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="fv-acct__modal-head">
          <span><i className="fas fa-receipt" /> {live.invoiceNo} \u00b7 {live.category} {live.kind}</span>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            {/* Inline status dropdown — shows all statuses so user can revert freely */}
            <select
              className={`fv-acct__status-sel fv-acct__status-sel--${tone}`}
              value={live.status}
              onChange={(e) => changeStatus(e.target.value as TxnStatus)}
              onClick={(e) => e.stopPropagation()}
            >
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="button" className="fv-acct__icon-btn" onClick={onClose}><i className="fas fa-xmark" /></button>
          </div>
        </div>
        <div className="fv-acct__modal-body">
          <div className="fv-acct__grid4">
            <F label="Transaction ID" value={live.id} />
            <F label="Source Module" value={live.module} />
            <F label="Company" value={live.company} />
            <F label="Reference No" value={live.reference} />
            <F label="Vessel" value={live.vessel} />
            <F label="Voyage" value={live.voyage} />
            <F label="Fixture" value={live.fixture} />
            <F label="Counterparty" value={live.counterparty} />
            <F label="Invoice No" value={live.invoiceNo} />
            <F label="Amount" value={`${live.currency} ${num(live.amount)}`} />
            <F label="Exchange Rate" value={live.exchangeRate} />
            <F label="Base (USD)" value={money(live.amount * live.exchangeRate)} />
            <F label="Invoice Date" value={live.invoiceDate} />
            <F label="Due Date" value={live.dueDate} />
            <F label="Bank" value={live.bank} />
            <F label="Method" value={live.method} />
            <F label="Priority" value={<PriorityPill p={live.priority} />} />
            <F label="Approval" value={<ApprovalPill a={live.approval} />} />
            <F label="Payment Ref" value={live.paymentRef} />
            <F label="Payment Date" value={live.paymentDate} />
            {live.remarks && <div className="fv-acct__field fv-acct__field--full"><span>Remarks</span><b>{live.remarks}</b></div>}
          </div>
          {/* Compact SWIFT document section */}
          <div className="fv-acct__swift-compact">
            <span><i className="fas fa-file-invoice" /> {live.category === 'Hire' ? 'Hire SOA / Payment Document' : 'Payment Document'}</span>
            <button type="button" className="fv-acct__btn fv-acct__btn--ghost" style={{fontSize:11}} onClick={() => openPaymentPdf(live)}>
              <i className="fas fa-file-pdf" /> View / Print PDF
            </button>
            {live.swiftDocUrl ? (
              <div className="fv-acct__swift-compact-file">
                <i className="fas fa-file-circle-check" style={{color:'var(--a-good)'}} />
                <span>Document uploaded</span>
                <a href={live.swiftDocUrl} target="_blank" rel="noreferrer" className="fv-acct__btn fv-acct__btn--ghost" style={{fontSize:11}}>
                  <i className="fas fa-eye" /> View
                </a>
                <a href={live.swiftDocUrl} download={`SWIFT-${live.invoiceNo}`} className="fv-acct__btn fv-acct__btn--ghost" style={{fontSize:11}}>
                  <i className="fas fa-download" /> Download
                </a>
                <label className="fv-acct__btn fv-acct__btn--ghost" style={{fontSize:11,cursor:'pointer'}}>
                  <i className="fas fa-arrow-up-from-bracket" /> Replace
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg" style={{display:'none'}} onChange={uploadSwift} />
                </label>
              </div>
            ) : (
              <label className="fv-acct__btn fv-acct__btn--ghost" style={{cursor:'pointer'}}>
                <i className="fas fa-cloud-arrow-up" /> Upload SWIFT / Bank receipt
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" style={{display:'none'}} onChange={uploadSwift} />
              </label>
            )}
          </div>
          <BankAccountBox
            label={live.kind === 'Receivable' ? 'Our Company Account Details' : 'Payee Account Details'}
            partyName={live.kind === 'Receivable' ? (getWorkflowConfig().companyName || 'Our Company') : (live.counterparty || 'Counterparty')}
            account={live.kind === 'Receivable' ? companyBank : counterpartyBank}
            editable
            onUpdate={live.kind === 'Receivable' ? saveCompanyBank : saveCounterpartyBank}
          />
        </div>
      </div>
    </div>
  );
}

/* --------- reusable data grid --------- */

function TxnGrid({ rows, onView }: { rows: FinTxn[]; onView: (t: FinTxn) => void }) {
  const [auditId, setAuditId] = useState<string | null>(null);
  const [dueSort, setDueSort] = useState<'asc' | 'desc'>('asc');

  const changeStatus = (t: FinTxn, next: TxnStatus) => {
    if (!next || next === t.status) return;
    updateTxn(t.id,
      { status: next, ...(next === 'Payment Executed' || next === 'Reconciled' ? { paymentDate: stamp() } : {}) },
      { user: 'Accounts', action: 'Status changed', from: t.status, to: next },
    );
    addNotification(`${t.invoiceNo} \u00b7 ${t.vessel} status \u2192 ${next}`, t.module);
  };

  const uploadSwift = (t: FinTxn, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateTxn(t.id, { swiftDocUrl: reader.result as string }, { user: 'Accounts', action: `SWIFT doc uploaded \u2014 ${file.name}` });
    reader.readAsDataURL(file);
  };

  if (rows.length === 0) return <div className="fv-acct__empty"><i className="fas fa-inbox" aria-hidden="true" /> No transactions match the current view.</div>;
  const sortedRows = [...rows].sort((a, b) => {
    const result = a.dueIso.localeCompare(b.dueIso);
    return dueSort === 'asc' ? result : -result;
  });
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
            <th aria-sort={dueSort === 'asc' ? 'ascending' : 'descending'}><button type="button" className="fv-acct__sort-btn" onClick={() => setDueSort((direction) => direction === 'asc' ? 'desc' : 'asc')} aria-label={`Sort by due date ${dueSort === 'asc' ? 'descending' : 'ascending'}`} title={`Due date: ${dueSort === 'asc' ? 'earliest first' : 'latest first'}`}>Due <i className={`fas fa-sort-${dueSort === 'asc' ? 'up' : 'down'}`} aria-hidden="true" /></button></th>
            <th>Approval</th>
            <th>Status</th>
            <th>Priority</th>
            <th className="fv-acct__actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((t) => {
            const overdue = isOverdue(t);
            const tone = STATUS_TONE[t.status] ?? 'grey';
            const auditOpen = auditId === t.id;
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
                {/* Inline status change dropdown */}
                <td onClick={(e) => e.stopPropagation()}>
                  <select
                    className={`fv-acct__status-sel fv-acct__status-sel--${tone}`}
                    value={t.status}
                    onChange={(e) => changeStatus(t, e.target.value as TxnStatus)}
                  >
                    {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td><PriorityPill p={t.priority} /></td>
                {/* Actions: View, SWIFT upload, Audit */}
                <td className="fv-acct__actions" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="fv-acct__icon-btn" title="View invoice" onClick={() => onView(t)}><i className="fas fa-eye" /></button>
                  <label className="fv-acct__icon-btn" title={t.swiftDocUrl ? 'SWIFT uploaded — replace' : 'Upload SWIFT / bank receipt'} style={{cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                    <i className={`fas ${t.swiftDocUrl ? 'fa-file-circle-check' : 'fa-file-arrow-up'}`} style={{color: t.swiftDocUrl ? 'var(--a-good)' : undefined}} />
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg" style={{display:'none'}} onChange={(e) => uploadSwift(t, e)} />
                  </label>
                  <div style={{position:'relative',display:'inline-block'}}>
                    <button type="button" className={`fv-acct__icon-btn${auditOpen?' fv-acct__icon-btn--active':''}`} title="Audit trail" onClick={() => setAuditId(auditOpen ? null : t.id)}>
                      <i className="fas fa-clock-rotate-left" />
                      {t.audit.length > 0 && <span className="fv-acct__audit-badge">{t.audit.length}</span>}
                    </button>
                    {auditOpen && (
                      <div className="fv-acct__audit-popup" onClick={(e) => e.stopPropagation()}>
                        <div className="fv-acct__audit-popup-head">
                          <span><i className="fas fa-clock-rotate-left" /> Audit Trail — {t.invoiceNo}</span>
                          <button type="button" className="fv-acct__icon-btn" onClick={() => setAuditId(null)}><i className="fas fa-xmark" /></button>
                        </div>
                        <ul className="fv-acct__audit-timeline" style={{maxHeight:260,overflowY:'auto',padding:'8px 12px'}}>
                          {t.audit.length === 0 ? (
                            <li style={{color:'var(--a-faint)',fontSize:11,padding:'8px 0'}}>No audit entries yet</li>
                          ) : t.audit.map((a, i) => (
                            <li key={i} className="fv-acct__audit-entry">
                              <div className="fv-acct__audit-marker">
                                <div className="fv-acct__audit-dot-big" />
                                {i < t.audit.length-1 && <div className="fv-acct__audit-line" />}
                              </div>
                              <div className="fv-acct__audit-content">
                                <div className="fv-acct__audit-action">{a.action}</div>
                                {a.from && a.to && (
                                  <div className="fv-acct__audit-transition">
                                    <span className={`fv-acct__pill fv-acct__pill--${STATUS_TONE[a.from]??'grey'}`}>{a.from}</span>
                                    <i className="fas fa-arrow-right" style={{color:'var(--a-faint)',fontSize:10,margin:'0 4px'}} />
                                    <span className={`fv-acct__pill fv-acct__pill--${STATUS_TONE[a.to]??'grey'}`}>{a.to}</span>
                                  </div>
                                )}
                                <div className="fv-acct__audit-meta"><b>{a.user}</b> \u00b7 {a.at}</div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------ main page */

type Tab = 'dashboard' | 'cashflow' | 'calendar' | 'payments' | 'reports';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'fa-gauge-high' },
  { id: 'cashflow', label: 'Cash Flow', icon: 'fa-chart-column' },
  { id: 'calendar', label: 'Calendar', icon: 'fa-calendar' },
  { id: 'payments', label: 'Payments', icon: 'fa-money-bill-wave' },
  { id: 'reports', label: 'Reports', icon: 'fa-file-chart-column' },
];

const CASH_IN_BANK = 4_245_890;

export function AccountsPage({ mode }: { mode?: 'create' } = {}) {
  const [searchParams] = useSearchParams();
  const createMode = mode === 'create' || searchParams.get('new') === '1';
  const txns = useAccountTxns();
  const rows = createMode ? [] : txns;
  const sidebarVessel = useSelectedAccountVessel();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [vessel, setVessel] = useState('All');
  const [typeF, setTypeF] = useState('All');
  const [statusF, setStatusF] = useState('All');
  const [moduleF, setModuleF] = useState('All');
  const [query, setQuery] = useState('');
  const [cfRange, setCfRange] = useState<'7d' | '15d' | '30d' | '60d' | '90d' | '1y'>('30d');
  const [dashCfRange, setDashCfRange] = useState<'7d' | '15d' | '30d' | '60d' | '90d' | '1y'>('30d');
  const [dashVessel, setDashVessel] = useState('All');
  const [calMonth, setCalMonth] = useState(ACCT_NOW);
  const [calFrom, setCalFrom] = useState('');
  const [calTo, setCalTo] = useState('');
  const [calShowRec, setCalShowRec] = useState(true);
  const [calShowPay, setCalShowPay] = useState(true);
  const [detail, setDetail] = useState<FinTxn | null>(null);
  const [selectedReports, setSelectedReports] = useState<string[]>(['cashflow']);

  const selectedVoyage = useSelectedVoyage({ emptyWhenCleared: true });
  const fixtureNo = useFixtureNumbers()[selectedVoyage?.id ?? ''];
  const vessels = useMemo(() => ['All', ...Array.from(new Set(rows.map((t) => t.vessel)))], [rows]);
  const modules = useMemo(() => ['All', ...Array.from(new Set(rows.map((t) => t.module)))], [rows]);

  useEffect(() => {
    if (!sidebarVessel && !selectedVoyage && vessel !== 'All') setVessel('All');
  }, [sidebarVessel, selectedVoyage, vessel]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((t) => {
      if (sidebarVessel && t.vessel !== sidebarVessel) return false;
      if (vessel !== 'All' && t.vessel !== vessel) return false;
      if (typeF !== 'All' && t.kind !== typeF) return false;
      if (moduleF !== 'All' && t.module !== moduleF) return false;
      if (statusF && statusF !== 'All' && t.status !== statusF) return false;
      if (q && !`${t.invoiceNo} ${t.vessel} ${t.counterparty} ${t.reference} ${t.category} ${t.module}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, sidebarVessel, vessel, typeF, moduleF, statusF, query]);

  // Dashboard scope follows the sidebar-selected vessel (all vessels when none).
  const scope = useMemo(() => (sidebarVessel ? rows.filter((t) => t.vessel === sidebarVessel) : rows), [rows, sidebarVessel]);

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
    const daysMap: Record<typeof cfRange, number> = { '7d': 7, '15d': 15, '30d': 30, '60d': 60, '90d': 90, '1y': 365 };
    const days = daysMap[cfRange];
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const bars: { label: string; inn: number; out: number; net: number }[] = [];
    const step = days <= 30 ? 1 : days <= 90 ? 3 : days <= 180 ? 7 : 30;
    for (let i = 0; i < days; i += step) {
      const day = new Date(ACCT_NOW.getTime() + i * 86_400_000);
      const iso = day.toISOString().slice(0, 10);
      const inn = scope.filter((t) => t.kind === 'Receivable' && t.status !== 'Received' && t.dueIso.startsWith(iso.slice(0, step > 1 ? 7 : 10))).reduce((s, t) => s + t.amount, 0);
      const out = scope.filter((t) => t.kind === 'Payable' && t.status !== 'Paid' && t.dueIso.startsWith(iso.slice(0, step > 1 ? 7 : 10))).reduce((s, t) => s + t.amount, 0);
      const base = Math.sin(i / 2) * 80_000;
      const label = step >= 30 ? MONTHS[day.getMonth()] : `${day.getDate()} ${MONTHS[day.getMonth()]}`;
      bars.push({ label, inn, out, net: inn - out + base });
    }
    return bars;
  }, [scope, cfRange]);

  const paymentsDue7 = useMemo(() => scope.filter((t) => t.kind === 'Payable' && t.status !== 'Paid' && daysUntil(t.dueIso) >= 0 && daysUntil(t.dueIso) <= 8).sort((a, b) => daysUntil(a.dueIso) - daysUntil(b.dueIso)), [scope]);


  const asOn = `${ACCT_NOW.getDate()} Jun ${ACCT_NOW.getFullYear()}`;
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const recDueToday = useMemo(() =>
    scope.filter((t) => t.kind === 'Receivable' && t.status !== 'Received' && t.status !== 'Cancelled' && daysUntil(t.dueIso) === 0),
  [scope]);

  const pendingApprovals = useMemo(() =>
    scope.filter((t) => t.approval === 'Pending' && t.status !== 'Paid' && t.status !== 'Received' && t.status !== 'Cancelled'),
  [scope]);

  // AP/AR aging: buckets by days-past-due for unpaid items
  const agingBuckets = useMemo(() => {
    const make = () => ({ current: 0, d30: 0, d60: 0, d90p: 0 });
    const pay = make(), rec = make();
    scope.filter((t) => t.status !== 'Paid' && t.status !== 'Received' && t.status !== 'Cancelled').forEach((t) => {
      const d = daysUntil(t.dueIso);
      const b = t.kind === 'Payable' ? pay : rec;
      if (d >= 0) b.current += t.amount;
      else if (d >= -30) b.d30 += t.amount;
      else if (d >= -60) b.d60 += t.amount;
      else b.d90p += t.amount;
    });
    return { pay, rec };
  }, [scope]);

  const dashForecast = useMemo(() => {
    const daysMap = { '7d': 7, '15d': 15, '30d': 30, '60d': 60, '90d': 90, '1y': 365 } as const;
    const days = daysMap[dashCfRange];
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const step = days <= 30 ? 1 : days <= 90 ? 3 : days <= 180 ? 7 : 30;
    const src = dashVessel === 'All' ? scope : scope.filter((t) => t.vessel === dashVessel);
    const bars: { label: string; inn: number; out: number; net: number }[] = [];
    for (let i = 0; i < days; i += step) {
      const day = new Date(ACCT_NOW.getTime() + i * 86_400_000);
      const pfx = day.toISOString().slice(0, step > 1 ? 7 : 10);
      const inn = src.filter((t) => t.kind === 'Receivable' && t.status !== 'Received' && t.dueIso.startsWith(pfx)).reduce((s, t) => s + t.amount, 0);
      const out = src.filter((t) => t.kind === 'Payable' && t.status !== 'Paid' && t.dueIso.startsWith(pfx)).reduce((s, t) => s + t.amount, 0);
      const label = step >= 30 ? MONTHS[day.getMonth()] : `${day.getDate()} ${MONTHS[day.getMonth()]}`;
      bars.push({ label, inn, out, net: inn - out });
    }
    return bars;
  }, [scope, dashCfRange, dashVessel]);

  // MTD (month-to-date) collected and paid
  const mtd = useMemo(() => {
    const now = ACCT_NOW;
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const collected = scope.filter((t) => t.kind === 'Receivable' && t.status === 'Received' && t.dueIso?.startsWith(monthStart)).reduce((s, t) => s + t.amount, 0);
    const paid = scope.filter((t) => t.kind === 'Payable' && t.status === 'Paid' && t.dueIso?.startsWith(monthStart)).reduce((s, t) => s + t.amount, 0);
    return { collected, paid };
  }, [scope]);

  // Calendar helpers
  const calYear = calMonth.getFullYear();
  const calMon = calMonth.getMonth();
  const calDaysInMonth = new Date(calYear, calMon + 1, 0).getDate();
  const calFirstDay = new Date(calYear, calMon, 1).getDay();
  const calTxnsByDay = useMemo(() => {
    const map = new Map<number, { pay: number; rec: number; count: number }>();
    scope.forEach((t) => {
      if (!t.dueIso) return;
      const d = new Date(t.dueIso);
      if (d.getFullYear() !== calYear || d.getMonth() !== calMon) return;
      const day = d.getDate();
      const e = map.get(day) ?? { pay: 0, rec: 0, count: 0 };
      if (t.kind === 'Payable') e.pay += t.amount; else e.rec += t.amount;
      e.count++;
      map.set(day, e);
    });
    return map;
  }, [scope, calYear, calMon]);


  return (
    <div className="fv-acct">
      {/* Non-scrolling header: topbar + tab nav */}
      <div className="fv-acct__header">
        <header className="fv-acct__topbar">
          <div className="fv-acct__topbar-left">
            <ModuleVesselSearch />
            <h1><i className="fas fa-building-columns" aria-hidden="true" /> Accounts</h1>
            {selectedVoyage && <span className="fv-acct__vessel-meta">{fixtureNo || selectedVoyage.id} · IMO {selectedVoyage.imo || '—'} · {selectedVoyage.portFrom || '—'} → {selectedVoyage.portTo || '—'} · {selectedVoyage.client || '—'}</span>}
          </div>
          <div className="fv-acct__actions">
            <button type="button" className="fv-acct__btn fv-acct__btn--ghost" onClick={() => setTab('reports')}><i className="fas fa-file-export" /> Export</button>
            <button type="button" className="fv-acct__icon-btn fv-acct__icon-btn--lg" title="Notifications"><i className="fas fa-bell" /></button>
          </div>
        </header>
        <nav className="fv-acct__tabs" aria-label="Accounts sections">
          {TABS.map((tb) => (
            <button key={tb.id} type="button" className={`fv-acct__tab${tab === tb.id ? ' fv-acct__tab--active' : ''}`} onClick={() => setTab(tb.id)}>
              <i className={`fas ${tb.icon}`} aria-hidden="true" /> {tb.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Scrollable content area */}
      <div className="fv-acct__main">

        {/* ---- DASHBOARD ---- */}
        {tab === 'dashboard' && (
          <>
            {/* ── Row 1: KPI tiles ── */}
            <div className="fv-acct__kpis">
              <Kpi label="Overdue" value={abbr(kpi.overdueAmt)} tone="red" icon="fa-triangle-exclamation" hint={`${kpi.overdueCount} items`} />
              <Kpi label="Due Today (Out)" value={abbr(kpi.dueTodayAmt)} tone="amber" icon="fa-arrow-up-from-bracket" hint={`${kpi.dueTodayCount} payables`} />
              <Kpi label="Due Today (In)" value={abbr(recDueToday.reduce((s,t)=>s+t.amount,0))} tone="green" icon="fa-arrow-down-to-bracket" hint={`${recDueToday.length} receivables`} />
              <Kpi label="Pending Approval" value={String(pendingApprovals.length)} tone="purple" icon="fa-user-clock" hint={`${abbr(pendingApprovals.reduce((s,t)=>s+t.amount,0))} total`} />
              <Kpi label="Due This Week" value={abbr(kpi.upcomingAmt)} tone="blue" icon="fa-calendar-week" hint={`${kpi.upcomingCount} payables`} />
              <Kpi label="Cash In Bank" value={abbr(kpi.cash)} tone="blue" icon="fa-vault" hint={`As on ${asOn}`} />
              <Kpi label="MTD Collected" value={abbr(mtd.collected)} tone="green" icon="fa-circle-check" hint="This month" />
              <Kpi label="Working Capital" value={abbr(kpi.working)} tone="green" icon="fa-scale-balanced" />
            </div>

            {/* ── Row 2: Priority Actions — 3 equal columns ── */}
            <div className="fv-acct__row3">
              {/* Column 1: OVERDUE */}
              <section className="fv-acct__card">
                <div className="fv-acct__card-head fv-acct__card-head--red">
                  <span><i className="fas fa-triangle-exclamation" /> Overdue</span>
                  <span className="fv-acct__count-badge fv-acct__count-badge--red">{scope.filter(isOverdue).length}</span>
                </div>
                <div className="fv-acct__action-body fv-acct__action-body--scroll">
                  {scope.filter(isOverdue).length === 0 ? (
                    <div className="fv-acct__hint" style={{textAlign:'center',padding:'20px 0'}}><i className="fas fa-circle-check" style={{color:'var(--a-good)'}}/> None overdue</div>
                  ) : scope.filter(isOverdue).sort((a,b)=>daysUntil(a.dueIso)-daysUntil(b.dueIso)).map((t) => {
                    const days = -daysUntil(t.dueIso);
                    return (
                      <div key={t.id} className="fv-acct__action-item fv-acct__action-item--overdue" onClick={() => setDetail(t)}>
                        <div className="fv-acct__action-age fv-acct__od">{days}d</div>
                        <div className="fv-acct__action-info">
                          <span><b>{t.category}</b> · {t.vessel}</span>
                          <small>{t.counterparty} · {t.invoiceNo}</small>
                        </div>
                        <div className="fv-acct__action-amt fv-acct__neg">{money(t.amount)}</div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Column 2: DUE TODAY (Pay + Collect) */}
              <section className="fv-acct__card">
                <div className="fv-acct__card-head fv-acct__card-head--amber">
                  <span><i className="fas fa-clock" /> Due Today</span>
                  <span className="fv-acct__count-badge fv-acct__count-badge--amber">{kpi.dueTodayCount + recDueToday.length}</span>
                </div>
                <div className="fv-acct__action-body fv-acct__action-body--scroll">
                  {kpi.dueTodayCount > 0 && (
                    <>
                      <div className="fv-acct__action-group fv-acct__action-group--amber">
                        <i className="fas fa-arrow-up-from-bracket" /> PAY
                        <span className="fv-acct__action-count">{kpi.dueTodayCount}</span>
                      </div>
                      {scope.filter((t) => t.kind==='Payable' && t.status!=='Paid' && daysUntil(t.dueIso)===0).map((t) => (
                        <div key={t.id} className="fv-acct__action-item fv-acct__action-item--today-out" onClick={() => setDetail(t)}>
                          <div className="fv-acct__action-age" style={{color:'var(--a-amber)'}}>0d</div>
                          <div className="fv-acct__action-info">
                            <span><b>{t.category}</b> · {t.vessel}</span>
                            <small>{t.counterparty} · {t.invoiceNo}</small>
                          </div>
                          <div className="fv-acct__action-amt">{money(t.amount)}</div>
                        </div>
                      ))}
                    </>
                  )}
                  {recDueToday.length > 0 && (
                    <>
                      <div className="fv-acct__action-group fv-acct__action-group--green">
                        <i className="fas fa-arrow-down-to-bracket" /> COLLECT
                        <span className="fv-acct__action-count">{recDueToday.length}</span>
                      </div>
                      {recDueToday.map((t) => (
                        <div key={t.id} className="fv-acct__action-item fv-acct__action-item--today-in" onClick={() => setDetail(t)}>
                          <div className="fv-acct__action-age" style={{color:'var(--a-good)'}}>0d</div>
                          <div className="fv-acct__action-info">
                            <span><b>{t.category}</b> · {t.vessel}</span>
                            <small>{t.counterparty} · {t.invoiceNo}</small>
                          </div>
                          <div className="fv-acct__action-amt fv-acct__pos">{money(t.amount)}</div>
                        </div>
                      ))}
                    </>
                  )}
                  {kpi.dueTodayCount === 0 && recDueToday.length === 0 && (
                    <div className="fv-acct__hint" style={{textAlign:'center',padding:'20px 0'}}><i className="fas fa-circle-check" style={{color:'var(--a-good)'}}/> Nothing due today</div>
                  )}
                </div>
              </section>

              {/* Column 3: AWAITING APPROVAL */}
              <section className="fv-acct__card">
                <div className="fv-acct__card-head fv-acct__card-head--purple">
                  <span><i className="fas fa-user-clock" /> Awaiting Approval</span>
                  <span className="fv-acct__count-badge fv-acct__count-badge--purple">{pendingApprovals.length}</span>
                </div>
                <div className="fv-acct__action-body fv-acct__action-body--scroll">
                  {pendingApprovals.length === 0 ? (
                    <div className="fv-acct__hint" style={{textAlign:'center',padding:'20px 0'}}><i className="fas fa-circle-check" style={{color:'var(--a-good)'}}/> Nothing pending</div>
                  ) : pendingApprovals.map((t) => (
                    <div key={t.id} className="fv-acct__action-item fv-acct__action-item--approval" onClick={() => setDetail(t)}>
                      <div className="fv-acct__action-age" style={{color:'var(--a-purple)'}}><i className="fas fa-clock"/></div>
                      <div className="fv-acct__action-info">
                        <span><b>{t.invoiceNo}</b> · {t.category}</span>
                        <small>{t.vessel} · {t.counterparty}</small>
                      </div>
                      <div className="fv-acct__action-amt">{money(t.amount)}</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* ── Row 3: AP/AR Aging | Payables by Category ── */}
            <div className="fv-acct__equal-row">
              <section className="fv-acct__card">
                <div className="fv-acct__card-head"><i className="fas fa-chart-bar" /> AP / AR Aging</div>
                <div className="fv-acct__card-body">
                  {(['pay','rec'] as const).map((kind) => {
                    const b = agingBuckets[kind];
                    const total = b.current + b.d30 + b.d60 + b.d90p || 1;
                    const label = kind === 'pay' ? 'Payables' : 'Receivables';
                    const color = kind === 'pay' ? 'var(--a-bad)' : 'var(--a-good)';
                    return (
                      <div key={kind} className="fv-acct__aging-block">
                        <div className="fv-acct__aging-title" style={{color}}><i className={`fas fa-${kind==='pay'?'arrow-up':'arrow-down'}`}/> {label}</div>
                        {([['current', 'Current', '#58a6ff'], ['d30', '1–30d overdue', 'var(--a-amber)'], ['d60', '31–60d overdue', '#ff8c42'], ['d90p', '61d+ overdue', 'var(--a-bad)']] as const).map(([key, lbl, clr]) => {
                          const val = b[key as keyof typeof b];
                          if (val === 0) return null;
                          const pct = (val / total) * 100;
                          return (
                            <div key={key} className="fv-acct__aging-row">
                              <span className="fv-acct__aging-lbl">{lbl}</span>
                              <div className="fv-acct__aging-bar-wrap">
                                <div className="fv-acct__aging-bar" style={{width:`${pct}%`, background: clr}} />
                              </div>
                              <span className="fv-acct__aging-val">{abbr(val)}</span>
                            </div>
                          );
                        })}
                        <div className="fv-acct__aging-total"><span>Total Outstanding</span><b>{abbr(total === 1 ? 0 : total)}</b></div>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="fv-acct__card">
                <div className="fv-acct__card-head"><i className="fas fa-chart-pie" /> Payables by Category</div>
                <div className="fv-acct__card-body"><Donut segments={catSegments} total={catTotal} /></div>
              </section>
            </div>

            {/* ── Row 4: Vessel Cash Flow — chart + transaction detail ── */}
            <section className="fv-acct__card">
              <div className="fv-acct__card-head">
                <span><i className="fas fa-chart-column" /> Vessel Cash Flow</span>
                <div className="fv-acct__cf-chart-toolbar">
                  <select className="fv-acct__vsel" value={dashVessel} onChange={(e) => setDashVessel(e.target.value)}>
                    <option value="All">All Vessels</option>
                    {Array.from(new Set(scope.map((t) => t.vessel))).sort().map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                  <span className="fv-acct__legend-inline">
                    <span className="fv-acct__dot" style={{background:'#6fdc8c'}}/> Inflows
                    <span className="fv-acct__dot" style={{background:'#ff6b6b'}}/> Outflows
                  </span>
                  <div className="fv-acct__range-group">
                    {(['7d','15d','30d','60d','90d','1y'] as const).map((r) => (
                      <button key={r} type="button" className={`fv-acct__range-btn${dashCfRange===r?' fv-acct__range-btn--on':''}`} onClick={() => setDashCfRange(r)}>{r.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
              </div>
              {/* KPI strip for selected vessel */}
              {dashVessel !== 'All' && (() => {
                const vTxns = scope.filter((t) => t.vessel === dashVessel && t.status !== 'Cancelled');
                const vPay = vTxns.filter((t) => t.kind==='Payable' && t.status!=='Paid').reduce((s,t)=>s+t.amount,0);
                const vRec = vTxns.filter((t) => t.kind==='Receivable' && t.status!=='Received').reduce((s,t)=>s+t.amount,0);
                const vOd = vTxns.filter(isOverdue).length;
                return (
                  <div className="fv-acct__vkpis">
                    <div className="fv-acct__vkpi fv-acct__vkpi--out"><span>Total Payable</span><b className="fv-acct__neg">{abbr(vPay)}</b></div>
                    <div className="fv-acct__vkpi fv-acct__vkpi--in"><span>Total Receivable</span><b className="fv-acct__pos">{abbr(vRec)}</b></div>
                    <div className="fv-acct__vkpi"><span>Net Position</span><b className={vRec-vPay>=0?'fv-acct__pos':'fv-acct__neg'}>{vRec-vPay>=0?'+':''}{abbr(vRec-vPay)}</b></div>
                    {vOd > 0 && <div className="fv-acct__vkpi fv-acct__vkpi--od"><span>Overdue Items</span><b className="fv-acct__neg">{vOd}</b></div>}
                  </div>
                );
              })()}
              {/* Cash flow chart */}
              <div className="fv-acct__card-body"><CashFlowChart bars={dashForecast} /></div>
              {/* Transaction detail — visible when a vessel is selected */}
              {dashVessel !== 'All' && (
                <div className="fv-acct__vcf-txns">
                  <div className="fv-acct__vcf-txns-head">
                    <i className="fas fa-list" /> All Transactions · {dashVessel}
                    <span className="fv-acct__count-badge" style={{marginLeft:6}}>{scope.filter(t=>t.vessel===dashVessel&&t.status!=='Cancelled').length}</span>
                  </div>
                  <table className="fv-acct__table fv-acct__table--compact">
                    <thead>
                      <tr><th>Due Date</th><th>Invoice</th><th>Voyage</th><th>Category</th><th>Counterparty</th><th className="fv-acct__r">Amount</th><th>Type</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {scope.filter((t) => t.vessel === dashVessel && t.status !== 'Cancelled')
                        .sort((a, b) => a.dueIso.localeCompare(b.dueIso))
                        .map((t) => {
                          const od = isOverdue(t);
                          return (
                            <tr key={t.id} onClick={() => setDetail(t)} style={{cursor:'pointer'}} className={od ? 'fv-acct__tr--od' : undefined}>
                              <td>
                                <b>{t.dueDate}</b>
                                {od && <div className="fv-acct__sub fv-acct__od">{Math.abs(daysUntil(t.dueIso))}d overdue</div>}
                              </td>
                              <td className="fv-acct__ref">{t.invoiceNo}</td>
                              <td><div className="fv-acct__sub">{t.voyage || t.reference}</div></td>
                              <td>
                                <span className="fv-acct__cat-dot" style={{background: CAT_COLOR[t.category] ?? '#8b98ad', verticalAlign:'middle', marginRight:4}} />
                                {t.category}
                              </td>
                              <td>{t.counterparty}</td>
                              <td className={`fv-acct__r ${t.kind==='Receivable'?'fv-acct__pos':'fv-acct__neg'}`}><b>{money(t.amount)}</b></td>
                              <td><span className={`fv-acct__pill fv-acct__pill--${t.kind==='Payable'?'amber':'blue'}`}>{t.kind==='Payable'?'Payable':'Receivable'}</span></td>
                              <td><StatusPill status={t.status} /></td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ── Row 5: Side-by-side cashflow statement ── */}
            <section className="fv-acct__card">
              <div className="fv-acct__card-head"><i className="fas fa-table-columns" /> Cash Flow Statement</div>
              <div className="fv-acct__card-body" style={{padding:0}}>
                <CashflowTable scope={dashVessel === 'All' ? scope : scope.filter(t => t.vessel === dashVessel)} />
              </div>
            </section>

            {/* ── Row 6: Due-this-week full width ── */}
            <section className="fv-acct__card">
              <div className="fv-acct__card-head"><i className="fas fa-calendar-check" /> Due This Week</div>
              <div className="fv-acct__card-body">
                <ul className="fv-acct__due-list">
                  {paymentsDue7.slice(0, 8).map((t) => { const d = daysUntil(t.dueIso); return (
                    <li key={t.id} onClick={() => setDetail(t)} style={{cursor:'pointer'}}>
                      <span className="fv-acct__due-date">{t.dueDate.split(' ').slice(0,2).join(' ')}</span>
                      <span className="fv-acct__due-main"><b>{t.category} · {t.vessel}</b><small>{t.counterparty} · <span className="fv-acct__module-tag">{t.module}</span></small></span>
                      <span className="fv-acct__due-amt">{money(t.amount)}</span>
                      <span className={`fv-acct__pill fv-acct__pill--${d===0?'red':d<=2?'amber':'blue'}`}>{d===0?'Today':d===1?'Tomorrow':`${d}d`}</span>
                    </li>
                  ); })}
                </ul>
              </div>
            </section>
          </>
        )}

        {/* ---- CASH FLOW ---- */}
        {tab === 'cashflow' && (
          <div className="fv-acct__cf-layout">
            <div className="fv-acct__cf-toolbar">
              <div className="fv-acct__cf-kpis">
                <div className="fv-acct__cf-kpi fv-acct__cf-kpi--in"><span>Inflows</span><b className="fv-acct__pos">{abbr(kpi.totalRec)}</b></div>
                <div className="fv-acct__cf-kpi fv-acct__cf-kpi--out"><span>Outflows</span><b className="fv-acct__neg">{abbr(kpi.totalPay)}</b></div>
                <div className="fv-acct__cf-kpi"><span>Net</span><b>{abbr(kpi.totalRec - kpi.totalPay)}</b></div>
                <div className="fv-acct__cf-kpi"><span>Bank</span><b>{abbr(kpi.cash)}</b></div>
                <div className="fv-acct__cf-kpi fv-acct__cf-kpi--wc"><span>Working Capital</span><b>{abbr(kpi.working)}</b></div>
              </div>
              <div className="fv-acct__cf-range">
                <label className="fv-acct__cf-range-label">Vessel</label>
                <select className="fv-acct__cf-sel" value={vessel} onChange={e => setVessel(e.target.value)}>{vessels.map(v=><option key={v}>{v}</option>)}</select>
                <label className="fv-acct__cf-range-label">Period</label>
                {(['7d','15d','30d','60d','90d','1y'] as const).map(r => (
                  <button key={r} type="button" className={`fv-acct__range-btn${cfRange===r?' fv-acct__range-btn--on':''}`} onClick={() => setCfRange(r)}>{r.toUpperCase()}</button>
                ))}
              </div>
            </div>
            <section className="fv-acct__card">
              <div className="fv-acct__card-head"><i className="fas fa-chart-column" /> Cash Flow â€” {cfRange.toUpperCase()}<span className="fv-acct__cf-legend"><span className="fv-acct__cf-leg fv-acct__cf-leg--in"/>Inflows<span className="fv-acct__cf-leg fv-acct__cf-leg--out"/>Outflows</span></div>
              <div className="fv-acct__card-body"><CashFlowChart bars={forecast} /></div>
            </section>
            <section className="fv-acct__card">
              <div className="fv-acct__card-head"><i className="fas fa-table-columns" /> Cash Flow Statement</div>
              <div className="fv-acct__card-body" style={{padding:0}}>
                <CashflowTable scope={vessel === 'All' ? scope : scope.filter(t => t.vessel === vessel)} />
              </div>
            </section>
            <section className="fv-acct__card">
              <div className="fv-acct__card-head"><i className="fas fa-table-list" /> Breakdown by Module &amp; Category</div>
              <div className="fv-acct__card-body">
                <table className="fv-acct__table">
                  <thead><tr><th>Module</th><th>Category</th><th className="fv-acct__c">Count</th><th className="fv-acct__c">Inflows</th><th className="fv-acct__c">Outflows</th><th className="fv-acct__c">Net</th></tr></thead>
                  <tbody>
                    {(() => {
                      const groups = new Map<string,{module:string;category:string;inAmt:number;outAmt:number;count:number}>();
                      scope.filter(t=>t.status!=='Cancelled').forEach(t=>{
                        const key=`${t.module}||${t.category}`;
                        const g=groups.get(key)??{module:t.module,category:t.category,inAmt:0,outAmt:0,count:0};
                        if(t.kind==='Receivable')g.inAmt+=t.amount;else g.outAmt+=t.amount;g.count++;
                        groups.set(key,g);
                      });
                      return [...groups.values()].sort((a,b)=>(b.inAmt+b.outAmt)-(a.inAmt+a.outAmt)).map((g,i)=>{
                        const net=g.inAmt-g.outAmt;
                        return <tr key={i}><td><span className="fv-acct__module-tag">{g.module}</span></td><td><span className="fv-acct__cat-dot" style={{background:CAT_COLOR[g.category as TxnCategory]??'#8b98ad',verticalAlign:'middle',marginRight:5}}/>{g.category}</td><td className="fv-acct__c">{g.count}</td><td className="fv-acct__c fv-acct__pos">{g.inAmt>0?num(g.inAmt):'â€”'}</td><td className="fv-acct__c fv-acct__neg">{g.outAmt>0?num(g.outAmt):'â€”'}</td><td className={`fv-acct__c ${net>=0?'fv-acct__pos':'fv-acct__neg'}`}>{num(Math.abs(net))}</td></tr>;
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="fv-acct__card">
              <div className="fv-acct__card-head"><i className="fas fa-clock" /> Upcoming Payments ({cfRange.toUpperCase()})</div>
              <div className="fv-acct__card-body">
                <table className="fv-acct__table">
                  <thead><tr><th>Due</th><th>Vessel</th><th className="fv-acct__c">Module</th><th className="fv-acct__c">Category</th><th>Counterparty</th><th className="fv-acct__c">Invoice</th><th className="fv-acct__c">Amount</th><th className="fv-acct__c">Type</th><th className="fv-acct__c">Status</th></tr></thead>
                  <tbody>
                    {scope.filter(t=>{const d=daysUntil(t.dueIso);return t.status!=='Paid'&&t.status!=='Received'&&t.status!=='Cancelled'&&d>=-7&&d<=({'7d':7,'15d':15,'30d':30,'60d':60,'90d':90,'1y':365} as Record<string,number>)[cfRange];}).sort((a,b)=>daysUntil(a.dueIso)-daysUntil(b.dueIso)).map(t=>{
                      const od=isOverdue(t);const d=daysUntil(t.dueIso);
                      return <tr key={t.id} onClick={()=>setDetail(t)} style={{cursor:'pointer'}}><td className={od?'fv-acct__od':undefined}>{t.dueDate}{od?<div className="fv-acct__sub fv-acct__od">Overdue {Math.abs(d)}d</div>:d===0?<div className="fv-acct__sub fv-acct__od">Today</div>:null}</td><td><b>{t.vessel}</b></td><td><span className="fv-acct__module-tag" style={{margin:'0 auto'}}>{t.module}</span></td><td className="fv-acct__c"><span className="fv-acct__cat-dot" style={{background:CAT_COLOR[t.category]??'#8b98ad',verticalAlign:'middle',marginRight:4}}/>{t.category}</td><td>{t.counterparty}</td><td className="fv-acct__c fv-acct__ref">{t.invoiceNo}</td><td className="fv-acct__c"><b>{t.currency} {num(t.amount)}</b></td><td className="fv-acct__c"><span className={`fv-acct__pill fv-acct__pill--${t.kind==='Payable'?'amber':'blue'}`}>{t.kind}</span></td><td className="fv-acct__c">{od?<span className="fv-acct__pill fv-acct__pill--red">Overdue</span>:<StatusPill status={t.status}/>}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* ---- CALENDAR ---- */}
        {tab === 'calendar' && (
          <div className="fv-acct__cal-wrap">
            {/* Single toolbar row: month/year dropdowns + vessel + All/Today + date range + legend */}
            <div className="fv-acct__cal-toolbar">
              <select className="fv-acct__cal-sel" value={calMon}
                onChange={e => setCalMonth(new Date(calYear, Number(e.target.value), 1))}>
                {MONTHS_SHORT.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <select className="fv-acct__cal-sel" value={calYear}
                onChange={e => setCalMonth(new Date(Number(e.target.value), calMon, 1))}>
                {Array.from({length: 5}, (_, i) => calYear - 2 + i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <div className="fv-acct__cal-toolbar-sep" />
              <select className="fv-acct__cf-sel" value={vessel} onChange={e=>setVessel(e.target.value)}>{vessels.map(v=><option key={v}>{v}</option>)}</select>
              <div className="fv-acct__cal-toolbar-sep" />
              <button type="button" className={`fv-acct__range-btn${!calFrom && !calTo ? ' fv-acct__range-btn--on' : ''}`}
                onClick={() => { setCalFrom(''); setCalTo(''); }}>All</button>
              <button type="button" className={`fv-acct__range-btn${calFrom === ACCT_NOW.toISOString().slice(0,10) && calTo === ACCT_NOW.toISOString().slice(0,10) ? ' fv-acct__range-btn--on' : ''}`}
                onClick={() => { const d = ACCT_NOW.toISOString().slice(0,10); setCalFrom(d); setCalTo(d); setCalMonth(new Date(ACCT_NOW)); }}>Today</button>
              <label className="fv-acct__cal-range-lbl">From</label>
              <input type="date" className="fv-acct__cal-date-input" value={calFrom} onChange={e => setCalFrom(e.target.value)} />
              <label className="fv-acct__cal-range-lbl">To</label>
              <input type="date" className="fv-acct__cal-date-input" value={calTo} onChange={e => setCalTo(e.target.value)} />
              {(calFrom || calTo) && (
                <button type="button" className="fv-acct__icon-btn" title="Clear range" onClick={() => { setCalFrom(''); setCalTo(''); }}>
                  <i className="fas fa-xmark" />
                </button>
              )}
              <span className="fv-acct__cf-legend" style={{marginLeft:'auto'}}>
                <button type="button" className={`fv-acct__cal-toggle${calShowRec?'':' fv-acct__cal-toggle--off'}`}
                  onClick={() => setCalShowRec(v => !v)} title={calShowRec ? 'Hide receivables' : 'Show receivables'}>
                  <span className="fv-acct__cf-leg" style={{background: calShowRec ? '#6fdc8c' : 'var(--a-border)'}}/>
                  Receivable
                </button>
                <button type="button" className={`fv-acct__cal-toggle${calShowPay?'':' fv-acct__cal-toggle--off'}`}
                  onClick={() => setCalShowPay(v => !v)} title={calShowPay ? 'Hide payables' : 'Show payables'}>
                  <span className="fv-acct__cf-leg" style={{background: calShowPay ? '#ff6b6b' : 'var(--a-border)'}}/>
                  Payable
                </button>
              </span>
            </div>
            <div className="fv-acct__cal">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><div key={d} className="fv-acct__cal-dow">{d}</div>)}
              {Array.from({length: calFirstDay}, (_,i) => <div key={`e${i}`} className="fv-acct__cal-empty" />)}
              {Array.from({length: calDaysInMonth}, (_,i) => {
                const day = i + 1;
                const today = new Date(ACCT_NOW);
                const isToday = calYear === today.getFullYear() && calMon === today.getMonth() && day === today.getDate();
                const dayIso = `${calYear}-${String(calMon+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                // Apply date range filter
                const inRange = (!calFrom || dayIso >= calFrom) && (!calTo || dayIso <= calTo);
                const info = calTxnsByDay.get(day);
                const dayTxns = (info && inRange) ? scope.filter(t => {
                  if (!t.dueIso) return false;
                  const d = new Date(t.dueIso);
                  return d.getFullYear() === calYear && d.getMonth() === calMon && d.getDate() === day;
                }) : [];
                return (
                  <div key={day} className={`fv-acct__cal-day${isToday?' fv-acct__cal-day--today':''}${info&&inRange?' fv-acct__cal-day--has':''}${!inRange?' fv-acct__cal-day--dim':''}`}>
                    <span className="fv-acct__cal-daynum">{day}</span>
                    {info && inRange && (
                      <div className="fv-acct__cal-events">
                        {info.rec > 0 && calShowRec && <span className="fv-acct__cal-dot fv-acct__cal-dot--in" title={`Receive ${money(info.rec)}`}>{abbr(info.rec)}</span>}
                        {info.pay > 0 && calShowPay && <span className="fv-acct__cal-dot fv-acct__cal-dot--out" title={`Pay ${money(info.pay)}`}>{abbr(info.pay)}</span>}
                        {dayTxns.filter(t => (t.kind==='Receivable'?calShowRec:calShowPay)).slice(0,2).map(t => (
                          <button key={t.id} type="button" className="fv-acct__cal-txn" onClick={() => setDetail(t)} title={`${t.category} · ${t.vessel} · ${money(t.amount)}`}>
                            <span className="fv-acct__cat-dot" style={{background:CAT_COLOR[t.category]??'#8b98ad'}}/> {!sidebarVessel && vessel === 'All' ? `${t.vessel} · ` : ''}{t.category}
                          </button>
                        ))}
                        {dayTxns.filter(t => (t.kind==='Receivable'?calShowRec:calShowPay)).length > 2 && <span className="fv-acct__cal-more">+{dayTxns.filter(t => (t.kind==='Receivable'?calShowRec:calShowPay)).length - 2}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Date range summary list */}
            {(calFrom || calTo) && (() => {
              const rangeTxns = scope.filter(t => {
                if (!t.dueIso) return false;
                return (!calFrom || t.dueIso >= calFrom) && (!calTo || t.dueIso <= calTo);
              }).sort((a,b)=>a.dueIso.localeCompare(b.dueIso));
              if (rangeTxns.length === 0) return <div className="fv-acct__hint" style={{padding:16}}>No transactions in selected range</div>;
              return (
                <div className="fv-acct__cal-range-list">
                  <div className="fv-acct__cal-range-list-head">
                    <i className="fas fa-list" /> Transactions in range ({rangeTxns.length})
                    <span style={{marginLeft:'auto'}} className="fv-acct__pos">In: {abbr(rangeTxns.filter(t=>t.kind==='Receivable').reduce((s,t)=>s+t.amount,0))}</span>
                    <span style={{marginLeft:12}} className="fv-acct__neg">Out: {abbr(rangeTxns.filter(t=>t.kind==='Payable').reduce((s,t)=>s+t.amount,0))}</span>
                  </div>
                  <table className="fv-acct__table fv-acct__table--compact">
                    <thead><tr><th>Due</th><th>Vessel</th><th>Category</th><th>Counterparty</th><th>Invoice</th><th className="fv-acct__r">Amount</th><th>Type</th><th>Status</th></tr></thead>
                    <tbody>
                      {rangeTxns.map(t => (
                        <tr key={t.id} onClick={() => setDetail(t)} style={{cursor:'pointer'}}>
                          <td>{t.dueDate.split(' ').slice(0,2).join(' ')}</td>
                          <td>{t.vessel}</td>
                          <td><span className="fv-acct__cat-dot" style={{background:CAT_COLOR[t.category]??'#8b98ad',verticalAlign:'middle',marginRight:4}}/>{t.category}</td>
                          <td>{t.counterparty}</td>
                          <td className="fv-acct__ref">{t.invoiceNo}</td>
                          <td className={`fv-acct__r ${t.kind==='Receivable'?'fv-acct__pos':'fv-acct__neg'}`}><b>{num(t.amount)}</b></td>
                          <td><span className={`fv-acct__pill fv-acct__pill--${t.kind==='Payable'?'amber':'blue'}`}>{t.kind==='Payable'?'Pay':'Rec'}</span></td>
                          <td><StatusPill status={t.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}

        {/* ---- PAYMENTS ---- */}
        {tab === 'payments' && (
          <div className="fv-acct__pay-layout">
            <div className="fv-acct__filters">
              <label><span>Vessel</span><select value={vessel} onChange={e=>setVessel(e.target.value)}>{vessels.map(v=><option key={v}>{v}</option>)}</select></label>
              <label><span>Module</span><select value={moduleF} onChange={e=>setModuleF(e.target.value)}>{modules.map(m=><option key={m}>{m}</option>)}</select></label>
              <label><span>Type</span><select value={typeF} onChange={e=>setTypeF(e.target.value)}><option>All</option><option value="Payable">Payable</option><option value="Receivable">Receivable</option></select></label>
              <label className="fv-acct__grow"><span>Status</span><select value={statusF} onChange={e=>setStatusF(e.target.value)}><option value="">All</option>{ALL_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
              <label className="fv-acct__grow"><span>Search</span><span className="fv-acct__search"><i className="fas fa-magnifying-glass"/><input value={query} placeholder="Invoice, counterparty, module…" onChange={e=>setQuery(e.target.value)}/>{query&&<button type="button" className="fv-acct__icon-btn" style={{width:16,height:16}} onClick={()=>setQuery('')}><i className="fas fa-xmark"/></button>}</span></label>
            </div>
            <div className="fv-acct__pay-counts">
              <span className="fv-acct__pay-stat fv-acct__pay-stat--red"><b>{filtered.filter(isOverdue).length}</b> Overdue</span>
              <span className="fv-acct__pay-stat fv-acct__pay-stat--amber"><b>{filtered.filter(t=>t.status==='Due'&&!isOverdue(t)).length}</b> Due</span>
              <span className="fv-acct__pay-stat fv-acct__pay-stat--blue"><b>{filtered.filter(t=>t.status==='Scheduled').length}</b> Scheduled</span>
              <span className="fv-acct__pay-stat fv-acct__pay-stat--purple"><b>{filtered.filter(t=>t.approval==='Pending').length}</b> Awaiting Approval</span>
              <span className="fv-acct__pay-stat fv-acct__pay-stat--green"><b>{filtered.filter(t=>t.status==='Paid'||t.status==='Received').length}</b> Settled</span>
            </div>
            <TxnGrid rows={filtered} onView={setDetail} />
          </div>
        )}

        {/* ---- REPORTS ---- */}
        {tab === 'reports' && (() => {
                const headers = ['Report', 'Transaction ID', 'Date', 'Vessel', 'Module', 'Category', 'Counterparty', 'Invoice', 'Kind', 'Currency', 'Amount', 'Due Date', 'Status', 'Approval', 'Reference'];
                const reportRows = (id: string): (string | number | undefined)[][] => {
                  if (id === 'audit') return filtered.flatMap((t) => t.audit.map((entry) => [id, t.id, entry.at, t.vessel, t.module, t.category, entry.user, t.invoiceNo, t.kind, t.currency, t.amount, t.dueDate, `${entry.from ?? ''} → ${entry.to ?? ''}`, t.approval, t.reference]));
                  const source: FinTxn[] = id === 'receivables' || id === 'customer' || id === 'collection-history' ? filtered.filter((t) => t.kind === 'Receivable')
                    : id === 'payables' || id === 'vendor' || id === 'hire' || id === 'freight' || id === 'pda-fda' || id === 'bunker' ? filtered.filter((t) => t.kind === 'Payable')
                    : id === 'outstanding' || id === 'ageing' ? filtered.filter((t) => !['Paid', 'Received', 'Cancelled', 'Closed'].includes(t.status))
                    : id === 'payment-history' ? filtered.filter((t) => ['Paid', 'Received', 'Payment Executed', 'Bank Confirmation', 'Reconciled'].includes(t.status))
                    : filtered;
                  return source.map((t) => [id, t.id, t.invoiceDate, t.vessel, t.module, t.category, t.counterparty, t.invoiceNo, t.kind, t.currency, t.amount, t.dueDate, t.status, t.approval, t.reference]);
                };
                const selectedData = selectedReports.flatMap((id) => reportRows(id));
                const previewRows = selectedReports.length > 0 ? reportRows(selectedReports[0]) : [];
                const toggle = (id: string) => setSelectedReports((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
                const allReportsSelected = selectedReports.length === ACCOUNT_REPORTS.length;
                const toggleAllReports = () => setSelectedReports(allReportsSelected ? [] : ACCOUNT_REPORTS.map(([id]) => id));
                const downloadExcel = () => downloadAccountFile('accounts-reports.xls', accountExcel(headers, selectedData), 'application/vnd.ms-excel');
                const downloadJson = () => downloadAccountFile('accounts-reports.json', JSON.stringify({ reports: selectedReports, transactions: selectedData }, null, 2), 'application/json;charset=utf-8');
                const downloadPdf = () => accountPdf(headers, selectedData);
                return <section className="fv-acct__card">
                  <div className="fv-acct__card-head"><span><i className="fas fa-file-lines" /> Accounts Reports</span><div className="fv-acct__report-header-actions"><button type="button" className="fv-acct__btn fv-acct__btn--ghost" disabled={selectedReports.length === 0} onClick={downloadExcel}><i className="fas fa-file-excel" /> Excel</button><button type="button" className="fv-acct__btn fv-acct__btn--ghost" disabled={selectedReports.length === 0} onClick={downloadJson}><i className="fas fa-file-code" /> JSON</button><button type="button" className="fv-acct__btn fv-acct__btn--ghost" disabled={selectedReports.length === 0} onClick={downloadPdf}><i className="fas fa-file-pdf" /> PDF</button></div></div>
                  <div className="fv-acct__card-body"><div className="fv-acct__reports-layout">
                  <div className="fv-acct__report-list">
                    <div className="fv-acct__report-list-head"><b>Available reports</b><button type="button" className="fv-acct__link-btn" onClick={toggleAllReports}>{allReportsSelected ? 'Unselect all' : 'Select all'}</button></div>
                    {ACCOUNT_REPORTS.map(([id, title, description]) => <label key={id} className="fv-acct__report-option"><input type="checkbox" checked={selectedReports.includes(id)} onChange={() => toggle(id)} /><span><b>{title}</b><small>{description}</small></span></label>)}
                  </div>
                  <div className="fv-acct__report-preview"><div className="fv-acct__report-preview-head"><b>Preview</b><span>{previewRows.length} rows · {selectedReports.length} selected</span></div><div className="fv-acct__report-preview-scroll"><table className="fv-acct__table fv-acct__table--compact"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{previewRows.slice(0, 20).map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{String(cell ?? '—')}</td>)}</tr>)}</tbody></table></div></div>
                  </div></div>
                </section>;
              })()}
      </div>

      {detail && <TxnDetail t={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
