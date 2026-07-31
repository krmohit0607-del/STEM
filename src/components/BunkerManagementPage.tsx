import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { FUEL_TYPE_OPTIONS } from './voyage/types';

import {
  useBunkerRequirements,
  updateBunkerRequirement,
  addBunkerQuote,
  addBunkerRequirement,
  nowStamp,
  STATUS_TONE,
  PAYMENT_TONE,
  APPROVAL_TONE,
  reached,
  useSelectedBunkerId,
  writeSelectedBunkerId,
  clearSelectedBunkerId,
  type BunkerRequirement,
  type BunkerDoc,
  type BunkerStatus,
  type PaymentStatus,
  type ApprovalStatus,
  type Priority,
  type Quote,
} from '../data/bunker';
import { addPayable } from '../data/accounts';

/**
 * Bunker Management module — the central collaboration hub between Operations,
 * the Bunker desk, Management and Accounts.
 *
 * Operations raises a bunker requirement during voyage planning; it lands here
 * as `Pending RFQ` and flows through RFQ → Quotes → Booking → Supply → Invoice
 * → Manager approval → Accounts → Payment. Every stage has a coloured badge and
 * a right-hand detail panel with the full requirement, approval workflow,
 * documents, timeline and audit log.
 *
 * The data model + mock dataset live in `../data/bunker` so the left fleet menu
 * can list requirements and drive this page's detail panel via a shared store.
 */

/* -------------------------------------------------------------- view types */

interface TimelineEvent {
  label: string;
  at: string;
  state: 'done' | 'current' | 'todo';
  icon: string;
}

/* ---------------------------------------------------------------- helpers */

const NOW = new Date('2026-06-16T00:00:00');

function money(n: number | undefined, dp = 0): string {
  if (n == null) return '—';
  return `USD ${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}
function num(n: number): string {
  return n.toLocaleString('en-US');
}
function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - NOW.getTime()) / 86_400_000);
}
function dueInLabel(iso?: string, paid?: boolean): string {
  if (paid) return 'Paid';
  const d = daysUntil(iso);
  if (d == null) return '—';
  if (d < 0) return `Overdue by ${Math.abs(d)}d`;
  if (d === 0) return 'Due today';
  return `In ${d} day${d === 1 ? '' : 's'}`;
}

/* --------- workspace tabs --------- */

type WsTab = 'order' | 'rfq' | 'booking' | 'supply' | 'invoice' | 'history';

const WS_TABS: { id: WsTab; label: string; icon: string }[] = [
  { id: 'order', label: 'Order Details', icon: 'fa-clipboard-list' },
  { id: 'rfq', label: 'RFQ', icon: 'fa-paper-plane' },
  { id: 'booking', label: 'Booking Details', icon: 'fa-handshake' },
  { id: 'supply', label: 'Supply Details', icon: 'fa-gas-pump' },
  { id: 'invoice', label: 'Invoice & Payments', icon: 'fa-file-invoice-dollar' },
  { id: 'history', label: 'Configuration History', icon: 'fa-clock-rotate-left' },
];

/* ------------------------------------------------------------ mock data */

// Requirement dataset lives in ../data/bunker (shared with the fleet menu).

/* ---------------------------------------------------- notifications feed */

const NOTIFICATIONS: { icon: string; tone: string; text: string; at: string }[] = [
  { icon: 'fa-triangle-exclamation', tone: 'red', text: 'MV Seafarer — invoice INV-MJ-3390 overdue by 2 days', at: '2h ago' },
  { icon: 'fa-file-invoice-dollar', tone: 'amber', text: 'MV Northern Light — invoice awaiting manager approval', at: '4h ago' },
  { icon: 'fa-quote-right', tone: 'blue', text: 'MV Global Ace — 4 quotations received', at: '5h ago' },
  { icon: 'fa-circle-check', tone: 'green', text: 'MV Horizon — bunkering completed (798 MT)', at: '1d ago' },
  { icon: 'fa-money-bill-wave', tone: 'green', text: 'MV Unity — payment settled TT-2026-4471', at: '2d ago' },
];

/* ============================================================ components */

function StatusBadge({ status }: { status: BunkerStatus }) {
  return <span className={`fv-bk__badge fv-bk__badge--${STATUS_TONE[status]}`}>{status}</span>;
}

function PaymentBadge({ status }: { status: PaymentStatus }) {
  if (status === 'None') return <span className="fv-bk__muted">—</span>;
  return <span className={`fv-bk__pbadge fv-bk__pbadge--${PAYMENT_TONE[status]}`}>{status}</span>;
}

function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  if (status === 'Not Submitted') return <span className="fv-bk__muted">—</span>;
  return <span className={`fv-bk__pbadge fv-bk__pbadge--${APPROVAL_TONE[status]}`}>{status}</span>;
}

function PriorityDot({ p }: { p: Priority }) {
  const tone = p === 'High' ? 'red' : p === 'Medium' ? 'amber' : 'green';
  return <span className={`fv-bk__prio fv-bk__prio--${tone}`} title={`${p} priority`} />;
}

function Rating({ value }: { value: number }) {
  return (
    <span className="fv-bk__rating" title={`${value.toFixed(1)} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={`fas fa-star${value >= i ? '' : value >= i - 0.5 ? '-half-stroke' : ' fv-bk__star-off'}`} aria-hidden="true" />
      ))}
    </span>
  );
}

/* --------- detail panel section --------- */

function PanelSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="fv-bk__psec">
      <div className="fv-bk__psec-head">
        <span>{title}</span>
        {action}
      </div>
      <div className="fv-bk__psec-body">{children}</div>
    </div>
  );
}
function Field({ label, value, tone }: { label: string; value: ReactNode; tone?: 'accent' | 'good' | 'bad' }) {
  return (
    <div className="fv-bk__field">
      <span className="fv-bk__field-label">{label}</span>
      <span className={`fv-bk__field-value${tone ? ` fv-bk__field-value--${tone}` : ''}`}>{value ?? '—'}</span>
    </div>
  );
}

/* --------- approval / timeline --------- */

function buildTimeline(r: BunkerRequirement): TimelineEvent[] {
  const s = r.status;
  const step = (label: string, stage: BunkerStatus, icon: string, at: string): TimelineEvent => ({
    label,
    at,
    icon,
    state: reached(s, stage) ? (s === stage ? 'current' : 'done') : 'todo',
  });
  return [
    step('Requirement Raised', 'Pending RFQ', 'fa-flag', r.audit[r.audit.length - 1]?.at ?? ''),
    step('RFQ Sent', 'RFQ Sent', 'fa-paper-plane', ''),
    step('Quotes Received', 'Quotes Received', 'fa-quote-right', ''),
    step('Supplier Booked', 'Booked', 'fa-handshake', r.bookedOn ?? ''),
    step('Bunkering Supplied', 'Supplied', 'fa-gas-pump', ''),
    step('Invoice Received', 'Invoice Received', 'fa-file-invoice', r.invoiceDate ?? ''),
    step('Manager Approval', 'Approved', 'fa-user-check', ''),
    step('Sent to Accounts', 'Sent to Accounts', 'fa-building-columns', ''),
    step('Payment Completed', 'Paid', 'fa-money-bill-wave', r.paymentDate ?? ''),
  ];
}

/* --------- quote comparison modal --------- */

function QuoteComparisonModal({ r, onClose }: { r: BunkerRequirement; onClose: () => void }) {
  const best = r.quotes.find((q) => q.recommended) ?? r.quotes[0];
  return (
    <div className="fv-bk__modal-backdrop" onClick={onClose}>
      <div className="fv-bk__modal" onClick={(e) => e.stopPropagation()}>
        <div className="fv-bk__modal-head">
          <span><i className="fas fa-scale-balanced" aria-hidden="true" /> Quote Comparison — {r.id} · {r.vessel}</span>
          <button type="button" className="fv-bk__icon-btn" onClick={onClose}><i className="fas fa-xmark" /></button>
        </div>
        <div className="fv-bk__modal-body">
          <div className="fv-bk__ai">
            <i className="fas fa-wand-magic-sparkles" aria-hidden="true" />
            <div>
              <b>AI Recommendation</b>
              <p>
                <strong>{best.supplier}</strong> offers the best landed cost ({money(best.totalCost)} @ USD {best.pricePerMt}/MT),
                {best.creditDays}-day credit terms and a {best.rating.toFixed(1)}/5 supplier rating with {best.performance}% on-time
                performance. Recommended supplier — score {best.score}/100.
              </p>
            </div>
          </div>
          <div className="fv-bk__tablewrap">
            <table className="fv-bk__table fv-bk__table--compare">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th className="fv-bk__r">Price / MT</th>
                  <th className="fv-bk__r">Total Cost</th>
                  <th>Terms</th>
                  <th>Delivery Date</th>
                  <th>Method</th>
                  <th className="fv-bk__r">Credit</th>
                  <th>Rating</th>
                  <th className="fv-bk__r">Performance</th>
                  <th className="fv-bk__r">Score</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...r.quotes].sort((a, b) => b.score - a.score).map((qt) => (
                  <tr key={qt.supplier} className={qt.recommended ? 'fv-bk__row-rec' : undefined}>
                    <td>
                      {qt.recommended && <i className="fas fa-award fv-bk__rec-ico" title="Recommended" aria-hidden="true" />} {qt.supplier}
                    </td>
                    <td className="fv-bk__r">USD {qt.pricePerMt}</td>
                    <td className="fv-bk__r">{money(qt.totalCost)}</td>
                    <td>{qt.terms}</td>
                    <td>{qt.deliveryDate}</td>
                    <td>{qt.deliveryMethod}</td>
                    <td className="fv-bk__r">{qt.creditDays}d</td>
                    <td><Rating value={qt.rating} /></td>
                    <td className="fv-bk__r">{qt.performance}%</td>
                    <td className="fv-bk__r"><span className="fv-bk__score">{qt.score}</span></td>
                    <td>
                      <button type="button" className={`fv-bk__btn fv-bk__btn--sm${qt.recommended ? ' fv-bk__btn--primary' : ''}`}>
                        {qt.recommended ? 'Select' : 'Choose'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------- horizontal requirement workflow --------- */

function Workflow({ r }: { r: BunkerRequirement }) {
  const steps = buildTimeline(r);
  return (
    <div className="fv-bk__flow">
      {steps.map((e) => (
        <div key={e.label} className={`fv-bk__flowstep fv-bk__flowstep--${e.state}`}>
          <span className="fv-bk__flowdot"><i className={`fas ${e.icon}`} aria-hidden="true" /></span>
          <span className="fv-bk__flowlabel">{e.label}</span>
          {e.at && <span className="fv-bk__flowat">{e.at}</span>}
        </div>
      ))}
    </div>
  );
}

function DocsList({ docs, filter }: { docs: BunkerDoc[]; filter?: (d: BunkerDoc) => boolean }) {
  const list = filter ? docs.filter(filter) : docs;
  if (list.length === 0) return <p className="fv-bk__muted">No documents uploaded yet.</p>;
  return (
    <ul className="fv-bk__docs">
      {list.map((d) => (
        <li key={d.id}>
          <i className="fas fa-file-lines" aria-hidden="true" />
          <span className="fv-bk__doc-name">{d.name}</span>
          <span className="fv-bk__doc-meta">{d.type} · {d.date}</span>
          <button type="button" className="fv-bk__icon-btn" title="Open in viewer"><i className="fas fa-up-right-from-square" /></button>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="fv-bk__stage-empty">
      <i className={`fas ${icon}`} aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

/* --------- right icon rail (notifications / documents / upload) --------- */

type RailPanel = 'notif' | 'docs' | 'upload' | null;

function RailIcon({ icon, label, active, badge, onClick }: { icon: string; label: string; active: boolean; badge?: number; onClick: () => void }) {
  return (
    <button type="button" className={`fv-bk__rail-icon${active ? ' fv-bk__rail-icon--active' : ''}`} onClick={onClick} title={label} aria-label={label}>
      <i className={`fas ${icon}`} aria-hidden="true" />
      {badge != null && badge > 0 && <span className="fv-bk__rail-badge">{badge}</span>}
    </button>
  );
}

function BunkerRail({ selected, rail, setRail }: { selected: BunkerRequirement | null; rail: RailPanel; setRail: (p: RailPanel) => void }) {
  const docs = selected?.documents ?? [];
  const emailDocs = docs.filter((d) => d.type === 'Email Attachment' || d.type === 'RFQ' || d.type === 'Supplier Quote');
  const fileInputId = 'fv-bk-upload';

  return (
    <aside className="fv-bk__rail">
      {rail && (
        <div className="fv-bk__rail-panel">
          <div className="fv-bk__rail-panel-head">
            <span>
              {rail === 'notif' && 'Notifications'}
              {rail === 'docs' && 'Documents'}
              {rail === 'upload' && 'Upload Documents'}
            </span>
            <button type="button" className="fv-bk__icon-btn" onClick={() => setRail(null)} title="Close"><i className="fas fa-xmark" /></button>
          </div>
          <div className="fv-bk__rail-panel-body">
            {rail === 'notif' && (
              <ul className="fv-bk__notif-list">
                {NOTIFICATIONS.map((n, i) => (
                  <li key={i}>
                    <span className={`fv-bk__notif-ico fv-bk__notif-ico--${n.tone}`}><i className={`fas ${n.icon}`} /></span>
                    <div><span>{n.text}</span><small>{n.at}</small></div>
                  </li>
                ))}
              </ul>
            )}
            {rail === 'docs' && (
              !selected ? (
                <p className="fv-bk__muted">Select a requirement to see its documents.</p>
              ) : (
                <>
                  <div className="fv-bk__rail-group">Uploaded &amp; Received — {selected.id}</div>
                  <DocsList docs={docs} />
                  {emailDocs.length > 0 && (
                    <>
                      <div className="fv-bk__rail-group"><i className="fas fa-envelope" aria-hidden="true" /> Received via Email</div>
                      <DocsList docs={emailDocs} />
                    </>
                  )}
                </>
              )
            )}
            {rail === 'upload' && (
              <div className="fv-bk__upload">
                <label htmlFor={fileInputId} className="fv-bk__dropzone">
                  <i className="fas fa-cloud-arrow-up" aria-hidden="true" />
                  <b>Drop files or browse</b>
                  <small>Purchase Order · Contract · Invoice · BDN · Delivery Receipt · Lab Analysis</small>
                  <input id={fileInputId} type="file" multiple hidden />
                </label>
                <div className="fv-bk__upload-cats">
                  {['Purchase Order', 'Contract', 'Invoice', 'BDN', 'Delivery Receipt', 'Lab Analysis', 'Email Attachment'].map((c) => (
                    <span key={c} className="fv-bk__chip">{c}</span>
                  ))}
                </div>
                {selected && (
                  <>
                    <div className="fv-bk__rail-group">Recent — {selected.id}</div>
                    <DocsList docs={docs} />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="fv-bk__rail-icons">
        <RailIcon icon="fa-bell" label="Notifications" active={rail === 'notif'} badge={NOTIFICATIONS.length} onClick={() => setRail(rail === 'notif' ? null : 'notif')} />
        <RailIcon icon="fa-folder-open" label="Documents" active={rail === 'docs'} badge={docs.length} onClick={() => setRail(rail === 'docs' ? null : 'docs')} />
        <RailIcon icon="fa-cloud-arrow-up" label="Upload" active={rail === 'upload'} onClick={() => setRail(rail === 'upload' ? null : 'upload')} />
      </div>
    </aside>
  );
}

/* --------- payment approval workflow actions --------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function pad2(n: number): string { return String(n).padStart(2, '0'); }
function fmtDate(d: Date): string { return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
function isoDate(d: Date): string { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function uid(p: string): string { return `${p}-${Math.random().toString(36).slice(2, 7)}`; }

/** Book a supplier from a quote — moves the requirement to Booked (→ Booked tab). */
function bookQuote(r: BunkerRequirement, qt: Quote): void {
  updateBunkerRequirement(
    r.id,
    {
      status: 'Booked',
      supplier: qt.supplier,
      pricePerMt: qt.pricePerMt,
      totalCost: qt.totalCost,
      deliveryMethod: qt.deliveryMethod,
      poNo: `PO-${r.id.replace('BR-', '')}`,
      contractRef: `CON-${qt.supplier.slice(0, 2).toUpperCase()}-${Math.floor(10 + Math.random() * 89)}`,
      confirmNo: `CNF-${Math.floor(1000 + Math.random() * 9000)}`,
      bookedOn: nowStamp(),
      documents: [{ id: uid('doc'), name: `PO-${r.id.replace('BR-', '')}.pdf`, type: 'Purchase Order', date: fmtDate(new Date()) }, ...r.documents],
    },
    { user: 'R. Khan', role: 'Bunker Team', action: `Booked ${qt.supplier} @ USD ${qt.pricePerMt}/MT` },
  );
}

/** Record the physical supply — moves the requirement to Supplied (→ Supplied tab). */
function recordSupply(r: BunkerRequirement): void {
  const bdn = { id: uid('doc'), name: `BDN-${r.confirmNo ?? r.id}.pdf`, type: 'BDN', date: fmtDate(new Date()) };
  const receipt = { id: uid('doc'), name: 'Delivery-Receipt.pdf', type: 'Delivery Receipt', date: fmtDate(new Date()) };
  updateBunkerRequirement(
    r.id,
    {
      status: 'Supplied',
      suppliedQty: r.quantity,
      deliveredQty: r.quantity,
      supplyDateTime: `${nowStamp()} LT`,
      documents: [bdn, receipt, ...r.documents],
    },
    { user: 'M. Osei', role: 'Bunker Team', action: `Bunkering completed — ${r.quantity} MT delivered (BDN received)` },
  );
}

/** Register the supplier invoice — enables the payment approval workflow. */
function addInvoice(r: BunkerRequirement): void {
  const now = new Date();
  const due = new Date(now.getTime() + 30 * 86_400_000);
  const amount = r.totalCost ?? Math.round((r.pricePerMt ?? 0) * r.quantity);
  updateBunkerRequirement(
    r.id,
    {
      status: 'Invoice Received',
      invoiceNo: `INV-${r.confirmNo ?? r.id}`,
      invoiceDate: fmtDate(now),
      invoiceAmount: amount,
      paymentTerms: '30 days from BDN',
      dueDate: fmtDate(due),
      dueIso: isoDate(due),
      amountPaid: 0,
      approvalStatus: 'Not Submitted',
      paymentStatus: 'Upcoming',
      documents: [{ id: uid('doc'), name: `INV-${r.confirmNo ?? r.id}.pdf`, type: 'Invoice', date: fmtDate(now) }, ...r.documents],
    },
    { user: 'R. Khan', role: 'Bunker Team', action: `Supplier invoice ${amount} received` },
  );
}

function computePaymentStatus(iso?: string): PaymentStatus {
  const d = daysUntil(iso);
  if (d == null) return 'Upcoming';
  if (d < 0) return 'Overdue';
  if (d === 0) return 'Due Today';
  if (d <= 3) return 'Due in 3 Days';
  if (d <= 7) return 'Due in 7 Days';
  return 'Upcoming';
}

function raiseApproval(r: BunkerRequirement): void {
  updateBunkerRequirement(r.id, { status: 'Manager Approval Pending', approvalStatus: 'Awaiting Approval' }, { user: 'R. Khan', role: 'Bunker Team', action: 'Payment approval requested from manager' });
}
function managerDecision(r: BunkerRequirement, decision: 'approve' | 'reject' | 'revision'): void {
  if (decision === 'approve') updateBunkerRequirement(r.id, { status: 'Approved', approvalStatus: 'Approved' }, { user: 'S. Rao', role: 'Manager', action: 'Invoice approved for payment' });
  else if (decision === 'reject') updateBunkerRequirement(r.id, { approvalStatus: 'Rejected' }, { user: 'S. Rao', role: 'Manager', action: 'Invoice rejected' });
  else updateBunkerRequirement(r.id, { approvalStatus: 'Revision Requested' }, { user: 'S. Rao', role: 'Manager', action: 'Revision requested on invoice' });
}
function sendToAccounts(r: BunkerRequirement): void {
  updateBunkerRequirement(r.id, { status: 'Payment Due', paymentStatus: computePaymentStatus(r.dueIso) }, { user: 'R. Khan', role: 'Bunker Team', action: 'Invoice marked for payment — sent to Accounts' });
  addPayable({
    reference: r.reference,
    vessel: r.vessel,
    voyage: r.leg,
    supplier: r.supplier ?? '',
    invoiceNo: r.invoiceNo ?? '',
    amount: r.invoiceAmount ?? 0,
    currency: 'USD',
    invoiceDate: r.invoiceDate,
    dueDate: r.dueDate,
    dueIso: r.dueIso,
    module: 'Bunker',
    category: 'Bunker',
  });
}

function PaymentWorkflowActions({ r }: { r: BunkerRequirement }) {
  const sentToAccounts = reached(r.status, 'Sent to Accounts') || reached(r.status, 'Payment Due');

  if (r.paymentStatus === 'Paid') {
    return <div className="fv-bk__actionbar fv-bk__actionbar--good"><i className="fas fa-circle-check" aria-hidden="true" /> Payment settled by Accounts{r.paymentRef ? ` — ${r.paymentRef}` : ''}.</div>;
  }
  if (sentToAccounts) {
    return <div className="fv-bk__actionbar fv-bk__actionbar--good"><i className="fas fa-building-columns" aria-hidden="true" /> Sent to Accounts for payment. <PaymentBadge status={r.paymentStatus} /></div>;
  }
  if (r.approvalStatus === 'Approved') {
    return (
      <div className="fv-bk__actionbar">
        <span><i className="fas fa-user-check fv-bk__ok" aria-hidden="true" /> Approved by manager. Mark the invoice for payment to send it to Accounts.</span>
        <button type="button" className="fv-bk__btn fv-bk__btn--primary" onClick={() => sendToAccounts(r)}><i className="fas fa-building-columns" /> Mark for Payment → Accounts</button>
      </div>
    );
  }
  if (r.approvalStatus === 'Awaiting Approval') {
    return (
      <div className="fv-bk__actionbar fv-bk__actionbar--warn">
        <span><i className="fas fa-hourglass-half" aria-hidden="true" /> Awaiting manager approval.</span>
        <span className="fv-bk__actionbar-mgr">Manager:
          <button type="button" className="fv-bk__btn fv-bk__btn--sm fv-bk__btn--primary" onClick={() => managerDecision(r, 'approve')}><i className="fas fa-check" /> Approve</button>
          <button type="button" className="fv-bk__btn fv-bk__btn--sm" onClick={() => managerDecision(r, 'revision')}><i className="fas fa-rotate-left" /> Request Revision</button>
          <button type="button" className="fv-bk__btn fv-bk__btn--sm fv-bk__btn--danger" onClick={() => managerDecision(r, 'reject')}><i className="fas fa-xmark" /> Reject</button>
        </span>
      </div>
    );
  }
  const note = r.approvalStatus === 'Rejected' ? 'Invoice was rejected by the manager.' : r.approvalStatus === 'Revision Requested' ? 'Manager requested a revision.' : 'Raise a payment approval request to your manager to proceed.';
  return (
    <div className={`fv-bk__actionbar${r.approvalStatus === 'Rejected' ? ' fv-bk__actionbar--bad' : ''}`}>
      <span><i className="fas fa-circle-info" aria-hidden="true" /> {note}</span>
      <button type="button" className="fv-bk__btn fv-bk__btn--primary" onClick={() => raiseApproval(r)}><i className="fas fa-paper-plane" /> Raise Payment Approval Request</button>
    </div>
  );
}

/* --------- add quote modal --------- */

function AddQuoteModal({ r, onClose }: { r: BunkerRequirement; onClose: () => void }) {
  const [supplier, setSupplier] = useState('');
  const [pricePerMt, setPricePerMt] = useState('');
  const [creditDays, setCreditDays] = useState('30');
  const [method, setMethod] = useState('Barge');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [rating, setRating] = useState('4.0');
  const [performance, setPerformance] = useState('90');

  const price = parseFloat(pricePerMt) || 0;
  const total = Math.round(price * r.quantity);
  const canSave = supplier.trim() !== '' && price > 0;

  const save = () => {
    if (!canSave) return;
    const quote: Quote = {
      supplier: supplier.trim(),
      pricePerMt: price,
      totalCost: total,
      terms: `${creditDays || 0} days credit`,
      deliveryDate: deliveryDate || r.requiredOn.split(',')[0],
      deliveryMethod: method,
      creditDays: parseInt(creditDays, 10) || 0,
      rating: parseFloat(rating) || 0,
      performance: parseFloat(performance) || 0,
      score: 0,
    };
    addBunkerQuote(r.id, quote);
    onClose();
  };

  return (
    <div className="fv-bk__modal-backdrop" onClick={onClose}>
      <div className="fv-bk__modal fv-bk__modal--sm" onClick={(e) => e.stopPropagation()}>
        <div className="fv-bk__modal-head">
          <span><i className="fas fa-plus" aria-hidden="true" /> Add Quotation — {r.id}</span>
          <button type="button" className="fv-bk__icon-btn" onClick={onClose}><i className="fas fa-xmark" /></button>
        </div>
        <div className="fv-bk__modal-body">
          <div className="fv-bk__form">
            <label className="fv-bk__ffield"><span>Supplier</span><input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Ocean Bunkers" /></label>
            <label className="fv-bk__ffield"><span>Price / MT (USD)</span><input type="number" value={pricePerMt} onChange={(e) => setPricePerMt(e.target.value)} placeholder="0" /></label>
            <label className="fv-bk__ffield"><span>Quantity (MT)</span><input value={num(r.quantity)} disabled /></label>
            <label className="fv-bk__ffield"><span>Total Cost (USD)</span><input value={total ? num(total) : ''} disabled /></label>
            <label className="fv-bk__ffield"><span>Credit (days)</span><input type="number" value={creditDays} onChange={(e) => setCreditDays(e.target.value)} /></label>
            <label className="fv-bk__ffield"><span>Delivery Method</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                {['Barge', 'Ex-pipe', 'Truck to Vessel'].map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
            <label className="fv-bk__ffield"><span>Delivery Date</span><input value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} placeholder="e.g. 17 Jun 2026" /></label>
            <label className="fv-bk__ffield"><span>Supplier Rating (0–5)</span><input type="number" step="0.1" value={rating} onChange={(e) => setRating(e.target.value)} /></label>
            <label className="fv-bk__ffield"><span>Performance (%)</span><input type="number" value={performance} onChange={(e) => setPerformance(e.target.value)} /></label>
          </div>
          <p className="fv-bk__hint"><i className="fas fa-envelope" aria-hidden="true" /> Quotes are also captured automatically from supplier email replies. Add manually only if entering by hand.</p>
        </div>
        <div className="fv-bk__modal-foot">
          <button type="button" className="fv-bk__btn" onClick={onClose}>Cancel</button>
          <button type="button" className={`fv-bk__btn fv-bk__btn--primary${canSave ? '' : ' fv-bk__btn--disabled'}`} disabled={!canSave} onClick={save}><i className="fas fa-plus" /> Add Quote</button>
        </div>
      </div>
    </div>
  );
}

/* --------- tab content --------- */

function TabContent({ tab, r, onCompare }: { tab: WsTab; r: BunkerRequirement; onCompare: () => void }) {
  const [addQuoteOpen, setAddQuoteOpen] = useState(false);
  const dueDays = daysUntil(r.dueIso);
  const outstanding = (r.invoiceAmount ?? 0) - (r.amountPaid ?? 0);

  if (tab === 'order') {
    return (
      <div className="fv-bk__stage">
        <PanelSection title="General Information" action={<span className="fv-bk__ref-note"><i className="fas fa-link" aria-hidden="true" /> Shared reference across Chartering · Operations · Bunker · Performance</span>}>
          <div className="fv-bk__grid4">
            <Field label="Reference No" value={r.reference} tone="accent" />
            <Field label="Vessel / IMO" value={`${r.vessel} · ${r.imo}`} />
            <Field label="Leg" value={r.leg} />
            <Field label="Priority" value={r.priority} tone={r.priority === 'High' ? 'bad' : undefined} />
            <Field label="Requirement No" value={r.id} />
            <Field label="Required On" value={r.requiredOn} tone="accent" />
          </div>
        </PanelSection>
        <PanelSection title="Voyage Information">
          <div className="fv-bk__grid4">
            <Field label="Loading Port" value={r.loadPort} />
            <Field label="Discharge Port" value={r.dischargePort} />
            <Field label="Bunkering Port" value={r.bunkerPort} />
            <Field label="ETA" value={r.eta} />
          </div>
        </PanelSection>
        <PanelSection title="Fuel Requirement">
          <div className="fv-bk__grid4">
            <Field label="Fuel Type" value={r.fuelType} tone="accent" />
            <Field label="Quantity" value={`${num(r.quantity)} MT`} />
            <Field label="Grade" value={r.grade} />
            <Field label="Delivery Mode" value={r.deliveryMethod ?? '—'} />
            <Field label="ROB on Arrival" value={`${num(r.robArrival)} MT`} />
            <Field label="Expected Cons." value={`${num(r.expectedCons)} MT/day`} />
          </div>
          <div className="fv-bk__note"><i className="fas fa-user-tie" aria-hidden="true" /> Charterer: {r.chartererInstructions}</div>
          <div className="fv-bk__note"><i className="fas fa-anchor" aria-hidden="true" /> Owner: {r.ownerInstructions}</div>
        </PanelSection>
      </div>
    );
  }

  if (tab === 'rfq') {
    return (
      <>
        <div className="fv-bk__stage">
          <PanelSection
            title="Sourcing Summary"
            action={r.quotes.length > 1 ? <button type="button" className="fv-bk__link-btn" onClick={onCompare}><i className="fas fa-scale-balanced" /> Compare {r.quotes.length}</button> : undefined}
          >
            <div className="fv-bk__grid4">
              <Field label="Suppliers Invited" value={r.suppliersInvited} />
              <Field label="Quotes Received" value={r.quotes.length} />
              <Field label="Selected Supplier" value={r.supplier ?? 'Pending'} tone={r.supplier ? 'good' : undefined} />
              <Field label="Status" value={<StatusBadge status={r.status} />} />
            </div>
          </PanelSection>
          <PanelSection
            title="Quotations"
            action={<button type="button" className="fv-bk__btn fv-bk__btn--sm fv-bk__btn--primary" onClick={() => setAddQuoteOpen(true)}><i className="fas fa-plus" /> Add Quote</button>}
          >
            {r.quotes.length === 0 ? (
              <div className="fv-bk__quote-empty">
                <i className="fas fa-envelope-open-text" aria-hidden="true" />
                <span>No quotes yet. They are captured automatically from supplier email replies, or add one manually.</span>
              </div>
            ) : (
              <div className="fv-bk__tablewrap">
                <table className="fv-bk__table fv-bk__table--compare">
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th className="fv-bk__r">Price / MT</th>
                      <th className="fv-bk__r">Total Cost</th>
                      <th>Terms</th>
                      <th>Delivery</th>
                      <th>Method</th>
                      <th>Rating</th>
                      <th className="fv-bk__r">Score</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {[...r.quotes].sort((a, b) => b.score - a.score).map((qt) => (
                      <tr key={qt.supplier} className={qt.recommended ? 'fv-bk__row-rec' : undefined}>
                        <td>{qt.recommended && <i className="fas fa-award fv-bk__rec-ico" aria-hidden="true" />} {qt.supplier}</td>
                        <td className="fv-bk__r">USD {qt.pricePerMt}</td>
                        <td className="fv-bk__r">{money(qt.totalCost)}</td>
                        <td>{qt.terms}</td>
                        <td>{qt.deliveryDate}</td>
                        <td>{qt.deliveryMethod}</td>
                        <td><Rating value={qt.rating} /></td>
                        <td className="fv-bk__r"><span className="fv-bk__score">{qt.score}</span></td>
                        <td>
                          {reached(r.status, 'Booked')
                            ? (r.supplier === qt.supplier ? <span className="fv-bk__pbadge fv-bk__pbadge--green">Booked</span> : <span className="fv-bk__muted">—</span>)
                            : <button type="button" className={`fv-bk__btn fv-bk__btn--sm${qt.recommended ? ' fv-bk__btn--primary' : ''}`} onClick={() => bookQuote(r, qt)}>Select &amp; Book</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="fv-bk__hint"><i className="fas fa-envelope" aria-hidden="true" /> Incoming supplier email responses update this list automatically.</p>
          </PanelSection>
          <PanelSection title="RFQ Documents"><DocsList docs={r.documents} filter={(d) => ['RFQ', 'Supplier Quote', 'Email Attachment'].includes(d.type)} /></PanelSection>
        </div>
        {addQuoteOpen && <AddQuoteModal r={r} onClose={() => setAddQuoteOpen(false)} />}
      </>
    );
  }

  if (tab === 'booking') {
    if (!reached(r.status, 'Booked')) return <EmptyState icon="fa-handshake" text="Not booked yet. Select a supplier and generate the purchase order to book." />;
    return (
      <div className="fv-bk__stage">
        <PanelSection title="Booking Details">
          <div className="fv-bk__grid4">
            <Field label="Supplier" value={r.supplier} tone="accent" />
            <Field label="PO No." value={r.poNo} />
            <Field label="Contract Ref." value={r.contractRef} />
            <Field label="Confirm No." value={r.confirmNo} />
            <Field label="Unit Price" value={r.pricePerMt ? `USD ${r.pricePerMt}/MT` : '—'} />
            <Field label="Total Amount" value={money(r.totalCost)} tone="good" />
            <Field label="Delivery Mode" value={r.deliveryMethod} />
            <Field label="Booked On" value={r.bookedOn} />
          </div>
        </PanelSection>
        <PanelSection title="Booking Documents"><DocsList docs={r.documents} filter={(d) => ['Purchase Order', 'Contract', 'Booking Confirmation'].includes(d.type)} /></PanelSection>
      </div>
    );
  }

  if (tab === 'supply') {
    if (!reached(r.status, 'Booked')) return <EmptyState icon="fa-gas-pump" text="Book a supplier first, then record the supply once bunkering is completed." />;
    if (!reached(r.status, 'Supplied')) {
      return (
        <div className="fv-bk__stage">
          <div className="fv-bk__actionbar">
            <span><i className="fas fa-gas-pump" aria-hidden="true" /> Booked with {r.supplier}. Record the supply once bunkering is completed and the BDN is received.</span>
            <button type="button" className="fv-bk__btn fv-bk__btn--primary" onClick={() => recordSupply(r)}><i className="fas fa-check" /> Record Supply (BDN Received)</button>
          </div>
        </div>
      );
    }
    return (
      <div className="fv-bk__stage">
        <PanelSection title="Supply / Delivery">
          <div className="fv-bk__grid4">
            <Field label="Supply Date / Time" value={r.supplyDateTime} tone="accent" />
            <Field label="Nominated Qty" value={`${num(r.quantity)} MT`} />
            <Field label="Supplied Qty" value={r.suppliedQty != null ? `${num(r.suppliedQty)} MT` : '—'} />
            <Field label="Delivered (BDN)" value={r.deliveredQty != null ? `${num(r.deliveredQty)} MT` : '—'} tone="good" />
            <Field label="Delivery Mode" value={r.deliveryMethod} />
            <Field label="Bunker Port" value={r.bunkerPort} />
          </div>
        </PanelSection>
        <PanelSection title="Supply Documents"><DocsList docs={r.documents} filter={(d) => ['BDN', 'Delivery Receipt', 'Lab Analysis'].includes(d.type)} /></PanelSection>
      </div>
    );
  }

  if (tab === 'invoice') {
    if (!r.invoiceNo) {
      if (!reached(r.status, 'Supplied')) return <EmptyState icon="fa-file-invoice-dollar" text="Invoice becomes available once the supply is completed." />;
      return (
        <div className="fv-bk__stage">
          <div className="fv-bk__actionbar">
            <span><i className="fas fa-file-invoice-dollar" aria-hidden="true" /> Supply completed. Register the supplier invoice to start the payment approval workflow.</span>
            <button type="button" className="fv-bk__btn fv-bk__btn--primary" onClick={() => addInvoice(r)}><i className="fas fa-file-arrow-up" /> Add Supplier Invoice</button>
          </div>
        </div>
      );
    }
    return (
      <div className="fv-bk__stage">
        <PaymentWorkflowActions r={r} />
        <PanelSection title="Invoice Details">
          <div className="fv-bk__grid4">
            <Field label="Invoice No." value={r.invoiceNo} />
            <Field label="Invoice Date" value={r.invoiceDate} />
            <Field label="Invoice Amount" value={money(r.invoiceAmount)} tone="accent" />
            <Field label="Payment Terms" value={r.paymentTerms} />
            <Field label="Approval" value={<ApprovalBadge status={r.approvalStatus} />} />
            <Field label="Currency" value="USD" />
          </div>
        </PanelSection>
        <PanelSection title="Payment Details">
          <div className="fv-bk__grid4">
            <Field label="Due Date" value={r.dueDate} />
            <Field label="Due In" value={dueInLabel(r.dueIso, r.paymentStatus === 'Paid')} tone={dueDays != null && dueDays < 0 ? 'bad' : undefined} />
            <Field label="Payment Status" value={<PaymentBadge status={r.paymentStatus} />} />
            <Field label="Amount Paid" value={money(r.amountPaid)} />
            <Field label="Outstanding" value={money(outstanding)} tone={outstanding > 0 ? 'bad' : 'good'} />
            <Field label="Payment Ref." value={r.paymentRef ?? '—'} />
          </div>
        </PanelSection>
        <PanelSection title="Approval Workflow">
          <ol className="fv-bk__timeline">
            {buildTimeline(r).slice(5).map((e) => (
              <li key={e.label} className={`fv-bk__tl fv-bk__tl--${e.state}`}>
                <span className="fv-bk__tl-dot"><i className={`fas ${e.icon}`} aria-hidden="true" /></span>
                <span className="fv-bk__tl-label">{e.label}</span>
                {e.at && <span className="fv-bk__tl-at">{e.at}</span>}
              </li>
            ))}
          </ol>
        </PanelSection>
        <PanelSection title="Invoice & Payment Documents"><DocsList docs={r.documents} filter={(d) => ['Invoice', 'Payment Advice'].includes(d.type)} /></PanelSection>
      </div>
    );
  }

  // history
  return (
    <div className="fv-bk__stage">
      <PanelSection title="Activity Log">
        <ul className="fv-bk__audit">
          {r.audit.map((a, i) => (
            <li key={i}>
              <span className="fv-bk__audit-dot" />
              <div>
                <span className="fv-bk__audit-action">{a.action}</span>
                <span className="fv-bk__audit-meta">{a.user} · {a.role} · {a.at}</span>
              </div>
            </li>
          ))}
        </ul>
      </PanelSection>
      <PanelSection title="All Documents"><DocsList docs={r.documents} /></PanelSection>
    </div>
  );
}

/* --------- new requirement modal (Operations raises requirement) --------- */

function NewRequirementModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [vessel, setVessel] = useState('');
  const [reference, setReference] = useState('');
  const [bunkerPort, setBunkerPort] = useState('');
  const [fuelType, setFuelType] = useState('VLSFO');
  const [quantity, setQuantity] = useState('');
  const [requiredOn, setRequiredOn] = useState('');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [route, setRoute] = useState('');

  const qty = parseFloat(quantity) || 0;
  const canSave = vessel.trim() !== '' && bunkerPort.trim() !== '' && qty > 0;

  const save = () => {
    if (!canSave) return;
    const id = addBunkerRequirement({ vessel: vessel.trim(), reference: reference.trim(), bunkerPort: bunkerPort.trim(), fuelType, quantity: qty, requiredOn: requiredOn.trim(), priority, route: route.trim() });
    onCreated(id);
  };

  return (
    <div className="fv-bk__modal-backdrop" onClick={onClose}>
      <div className="fv-bk__modal fv-bk__modal--sm" onClick={(e) => e.stopPropagation()}>
        <div className="fv-bk__modal-head">
          <span><i className="fas fa-plus" aria-hidden="true" /> New Bunker Requirement</span>
          <button type="button" className="fv-bk__icon-btn" onClick={onClose}><i className="fas fa-xmark" /></button>
        </div>
        <div className="fv-bk__modal-body">
          <div className="fv-bk__form">
            <label className="fv-bk__ffield"><span>Vessel</span><input value={vessel} onChange={(e) => setVessel(e.target.value)} placeholder="e.g. MV Pacific Wind" /></label>
            <label className="fv-bk__ffield"><span>Shared Reference</span><input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="auto if blank" /></label>
            <label className="fv-bk__ffield"><span>Bunkering Port</span><input value={bunkerPort} onChange={(e) => setBunkerPort(e.target.value)} placeholder="e.g. Singapore" /></label>
            <label className="fv-bk__ffield"><span>Route</span><input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="e.g. Australia → India" /></label>
            <label className="fv-bk__ffield"><span>Fuel Type</span>
              <select value={fuelType} onChange={(e) => setFuelType(e.target.value)}>{FUEL_TYPE_OPTIONS.map((f) => <option key={f}>{f}</option>)}</select>
            </label>
            <label className="fv-bk__ffield"><span>Quantity (MT)</span><input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" /></label>
            <label className="fv-bk__ffield"><span>Required On</span><input value={requiredOn} onChange={(e) => setRequiredOn(e.target.value)} placeholder="e.g. 17 Jun 2026, 09:00 LT" /></label>
            <label className="fv-bk__ffield"><span>Priority</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>{['High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}</select>
            </label>
          </div>
          <p className="fv-bk__hint"><i className="fas fa-circle-info" aria-hidden="true" /> Raised requirements land as Pending RFQ and appear in the RFQ tab of the vessel list.</p>
        </div>
        <div className="fv-bk__modal-foot">
          <button type="button" className="fv-bk__btn" onClick={onClose}>Cancel</button>
          <button type="button" className={`fv-bk__btn fv-bk__btn--primary${canSave ? '' : ' fv-bk__btn--disabled'}`} disabled={!canSave} onClick={save}><i className="fas fa-paper-plane" /> Raise Requirement</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ main page */

export function BunkerManagementPage() {
  const data = useBunkerRequirements();
  const selectedId = useSelectedBunkerId() ?? null;
  const [tab, setTab] = useState<WsTab>('order');
  const [compareId, setCompareId] = useState<string | null>(null);
  const [rail, setRail] = useState<RailPanel>('notif');
  const [newOpen, setNewOpen] = useState(false);

  const kpi = useMemo(() => {
    const by = (fn: (r: BunkerRequirement) => boolean) => data.filter(fn);
    const paymentDue = by((r) => r.status === 'Payment Due' && r.paymentStatus !== 'Overdue' && r.paymentStatus !== 'Paid');
    const overdue = by((r) => r.paymentStatus === 'Overdue');
    const outstanding = data.filter((r) => r.invoiceNo && r.paymentStatus !== 'Paid').reduce((s, r) => s + ((r.invoiceAmount ?? 0) - (r.amountPaid ?? 0)), 0);
    return {
      total: data.length,
      pending: by((r) => r.status === 'Pending RFQ').length,
      rfq: by((r) => r.status === 'RFQ Sent').length,
      quotes: by((r) => r.status === 'Quotes Received' || r.status === 'Supplier Selected').length,
      booked: by((r) => r.status === 'Booked').length,
      supplied: by((r) => r.status === 'Supplied').length,
      approval: by((r) => r.approvalStatus === 'Awaiting Approval').length,
      paymentDueCount: paymentDue.length,
      overdueCount: overdue.length,
      overdueAmt: overdue.reduce((s, r) => s + ((r.invoiceAmount ?? 0) - (r.amountPaid ?? 0)), 0),
      paidThisMonth: by((r) => r.paymentStatus === 'Paid').reduce((s, r) => s + (r.amountPaid ?? 0), 0),
      outstanding,
    };
  }, [data]);

  const selected = selectedId ? data.find((r) => r.id === selectedId) ?? null : null;
  const compareRow = compareId ? data.find((r) => r.id === compareId) ?? null : null;

  const stats: { label: string; value: string; tone?: string }[] = [
    { label: 'Requirements', value: String(kpi.total) },
    { label: 'RFQ Sent', value: String(kpi.rfq), tone: 'blue' },
    { label: 'Quotes', value: String(kpi.quotes), tone: 'purple' },
    { label: 'Booked', value: String(kpi.booked), tone: 'green' },
    { label: 'Supplied', value: String(kpi.supplied), tone: 'green' },
    { label: 'Payment Due', value: String(kpi.paymentDueCount), tone: 'amber' },
  ];

  return (
    <div className="fv-bk">
      <div className="fv-bk__main">
        {/* Header with compact stats */}
        <header className="fv-bk__topbar">
          <div className="fv-bk__topbar-title">
            <i className="fas fa-gas-pump" aria-hidden="true" />
            <h1>Bunker</h1>
          </div>
          <div className="fv-bk__hstats">
            {stats.map((s) => (
              <div key={s.label} className={`fv-bk__hstat${s.tone ? ` fv-bk__hstat--${s.tone}` : ''}`}>
                <span className="fv-bk__hstat-value">{s.value}</span>
                <span className="fv-bk__hstat-label">{s.label}</span>
              </div>
            ))}
          </div>
          <div className="fv-bk__topbar-actions">
            <button type="button" className="fv-bk__btn"><i className="fas fa-file-lines" /> Reports</button>
            <button type="button" className="fv-bk__btn fv-bk__btn--primary" onClick={() => setNewOpen(true)}><i className="fas fa-plus" /> New Bunker RFQ</button>
          </div>
        </header>

        {!selected ? (
          <div className="fv-bk__placeholder">
            <i className="fas fa-arrow-left" aria-hidden="true" />
            <p>Select a bunker requirement from the list to view its details.</p>
          </div>
        ) : (
          <>
            {/* Requirement identity */}
            <div className="fv-bk__reqbar">
              <span className="fv-bk__reqbar-badge"><i className="fas fa-ship" aria-hidden="true" /></span>
              <div className="fv-bk__reqbar-main">
                <div className="fv-bk__reqbar-top">
                  <b>{selected.vessel}</b>
                  <span className="fv-bk__leg">{selected.leg}</span>
                  <PriorityDot p={selected.priority} />
                  <StatusBadge status={selected.status} />
                </div>
                <span className="fv-bk__reqbar-sub">{selected.id} · {selected.route} · Bunker at {selected.bunkerPort} · Required {selected.requiredOn}</span>
              </div>
              <div className="fv-bk__reqbar-actions">
                {selected.quotes.length > 1 && <button type="button" className="fv-bk__btn" onClick={() => setCompareId(selected.id)}><i className="fas fa-scale-balanced" /> Compare</button>}
                {selected.status === 'Manager Approval Pending' && <button type="button" className="fv-bk__btn fv-bk__btn--primary" onClick={() => setTab('invoice')}><i className="fas fa-user-check" /> Approval</button>}
                {selected.invoiceNo && selected.paymentStatus !== 'Paid' && <button type="button" className="fv-bk__btn" onClick={() => setTab('invoice')}><i className="fas fa-money-bill-wave" /> Payments</button>}
                <button type="button" className="fv-bk__icon-btn fv-bk__icon-btn--lg" title="Close" onClick={() => clearSelectedBunkerId()}><i className="fas fa-xmark" /></button>
              </div>
            </div>

            {/* Horizontal workflow */}
            <Workflow r={selected} />

            {/* Tabs */}
            <nav className="fv-bk__tabs" aria-label="Requirement sections">
              {WS_TABS.map((t) => (
                <button key={t.id} type="button" className={`fv-bk__tab${tab === t.id ? ' fv-bk__tab--active' : ''}`} onClick={() => setTab(t.id)}>
                  <i className={`fas ${t.icon}`} aria-hidden="true" /> {t.label}
                </button>
              ))}
            </nav>

            <TabContent tab={tab} r={selected} onCompare={() => setCompareId(selected.id)} />
          </>
        )}
      </div>

      <BunkerRail selected={selected} rail={rail} setRail={setRail} />

      {compareRow && <QuoteComparisonModal r={compareRow} onClose={() => setCompareId(null)} />}
      {newOpen && <NewRequirementModal onClose={() => setNewOpen(false)} onCreated={(id) => { writeSelectedBunkerId(id); setNewOpen(false); }} />}
    </div>
  );
}
