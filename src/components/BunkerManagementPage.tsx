import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import { FUEL_TYPE_OPTIONS } from './voyage/types';
import { ModuleVesselSearch } from './ModuleVesselSearch';

import {
  useBunkerRequirements,
  updateBunkerRequirement,
  addBunkerQuote,
  updateBunkerQuote,
  deleteBunkerQuote,
  addBunkerClaim,
  updateBunkerClaim,
  deleteBunkerClaim,
  deleteBunkerInvoice,
  duplicateBunkerInvoice,
  addBunkerRequirement,
  nowStamp,
  STATUS_TONE,
  PAYMENT_TONE,
  APPROVAL_TONE,
  reached,
  useSelectedBunkerId,
  writeSelectedBunkerId,
  clearSelectedBunkerId,
  sumAdditionalCharges,
  sumBunkerClaims,
  ADDITIONAL_CHARGE_PRESETS,
  BUNKER_CLAIM_TYPES,
  BUNKER_CLAIM_STATUSES,
  type BunkerRequirement,
  type BunkerDoc,
  type BunkerStatus,
  type PaymentStatus,
  type ApprovalStatus,
  type Priority,
  type Quote,
  type AdditionalCharge,
  type BunkerClaim,
} from '../data/bunker';
import { addPayable, findTxnByInvoice, updateTxn } from '../data/accounts';
import { addNotification } from '../data/workflow';
import { useFleetView } from '../context/FleetViewContext';
import { getWorkflowConfig } from '../data/workflowConfig';
import { loadClients } from '../data/clients';

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
/** Short one-line preview of a longer free-text field, for table cells. */
function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
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
  { id: 'supply', label: 'Supply Details & Claims', icon: 'fa-gas-pump' },
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

/** Shows the additional-charges total, with the breakdown as a hover tooltip. */
function ChargesCell({ charges }: { charges?: AdditionalCharge[] }) {
  const total = sumAdditionalCharges(charges);
  if (!charges || charges.length === 0 || total === 0) return <span className="fv-bk__muted">—</span>;
  const tooltip = charges.map((c) => `${c.label}: USD ${c.amount.toLocaleString('en-US')}`).join('\n');
  return <span title={tooltip}>USD {total.toLocaleString('en-US')}</span>;
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
                  <th className="fv-bk__r">Add'l Charges</th>
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
                    <td className="fv-bk__r"><ChargesCell charges={qt.additionalCharges} /></td>
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
      <span className="fv-bk__rail-icon-label">{label}</span>
    </button>
  );
}

function BunkerRail({ selected, rail, setRail }: { selected: BunkerRequirement | null; rail: RailPanel; setRail: (p: RailPanel) => void }) {
  const docs = selected?.documents ?? [];
  const emailDocs = docs.filter((d) => d.type === 'Email Attachment' || d.type === 'RFQ' || d.type === 'Supplier Quote');
  const fileInputId = 'fv-bk-upload';
  const uploadCats = ['Purchase Order', 'Contract', 'Invoice', 'BDN', 'Delivery Receipt', 'Lab Analysis', 'Email Attachment'];
  const [uploadCat, setUploadCat] = useState(uploadCats[3]);

  const onFilesPicked = (files: FileList | null) => {
    if (!files || !selected) return;
    Array.from(files).forEach((file) => uploadBunkerDocument(selected, file, uploadCat));
  };

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
                  <small>Uploading as: {uploadCat}</small>
                  <input id={fileInputId} type="file" multiple hidden disabled={!selected} onChange={(e) => { onFilesPicked(e.target.files); e.target.value = ''; }} />
                </label>
                <div className="fv-bk__upload-cats">
                  {uploadCats.map((c) => (
                    <button key={c} type="button" className={`fv-bk__chip fv-bk__chip--pick${c === uploadCat ? ' fv-bk__chip--active' : ''}`} onClick={() => setUploadCat(c)}>{c}</button>
                  ))}
                </div>
                <p className="fv-bk__hint"><i className="fas fa-circle-info" aria-hidden="true" /> A BDN or Delivery Receipt automatically records the supply (Supply Details tab) once uploaded for a booked requirement — quantities can be corrected there afterwards.</p>
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

/** Convert a display string ("22 Aug 2026, 15:46 LT") into a <input type="datetime-local"> value. */
function toDatetimeLocalValue(display: string): string {
  const m = /(\d{1,2})\s+(\w{3})\s+(\d{4}),\s*(\d{1,2}):(\d{2})/.exec(display);
  if (!m) return '';
  const monthIdx = MONTHS.indexOf(m[2]);
  if (monthIdx < 0) return '';
  return `${m[3]}-${pad2(monthIdx + 1)}-${pad2(Number(m[1]))}T${pad2(Number(m[4]))}:${m[5]}`;
}

/** Convert a <input type="datetime-local"> value back into the display string used elsewhere ("22 Aug 2026, 15:46 LT"). */
function fromDatetimeLocalValue(value: string): string {
  const m = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return '';
  const monthIdx = Number(m[2]) - 1;
  return `${pad2(Number(m[3]))} ${MONTHS[monthIdx] ?? ''} ${m[1]}, ${m[4]}:${m[5]} LT`;
}

/** The current date/time as a <input type="datetime-local"> value — used to auto-fetch the supply timestamp. */
function currentDatetimeLocalValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Book a supplier from a quote — moves the requirement to Booked (→ Booked tab). */
function bookQuote(r: BunkerRequirement, qt: Quote): void {
  updateBunkerRequirement(
    r.id,
    {
      status: 'Booked',
      supplier: qt.supplier,
      pricePerMt: qt.pricePerMt,
      additionalCharges: qt.additionalCharges,
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

/** Correct the supply record after it was auto-created (or entered manually). */
function updateSupplyDetails(r: BunkerRequirement, patch: { supplyDateTime: string; suppliedQty: number; deliveredQty: number; deliveryMethod: string }): void {
  updateBunkerRequirement(r.id, patch, { user: 'Bunker Team', role: 'Bunker Team', action: 'Supply details corrected' });
}

/**
 * Attach an uploaded document to the requirement. When a BDN (or Delivery
 * Receipt) is received for a booked-but-not-yet-supplied requirement, the
 * supply record is auto-created from it — quantities default to the nominated
 * quantity and can be corrected afterwards from the Supply Details tab.
 */
function uploadBunkerDocument(r: BunkerRequirement, file: File, type: string): void {
  const doc: BunkerDoc = { id: uid('doc'), name: file.name, type, date: fmtDate(new Date()) };
  const autoSupply = (type === 'BDN' || type === 'Delivery Receipt') && reached(r.status, 'Booked') && !reached(r.status, 'Supplied');
  updateBunkerRequirement(
    r.id,
    {
      documents: [doc, ...r.documents],
      ...(autoSupply
        ? {
            status: 'Supplied' as BunkerStatus,
            suppliedQty: r.quantity,
            deliveredQty: r.quantity,
            supplyDateTime: `${nowStamp()} LT`,
          }
        : {}),
    },
    {
      user: 'Bunker Team',
      role: 'Bunker Team',
      action: autoSupply ? `${type} received (${file.name}) — supply auto-recorded` : `${type} uploaded (${file.name})`,
    },
  );
}

/** Company letterhead block reused across generated PDF documents. */
function pdfCompanyHeader(): string {
  const cfg = getWorkflowConfig();
  if (!cfg.companyName && !cfg.companyAddress && !cfg.companyLogoDataUrl) return '';
  const logo = cfg.companyLogoDataUrl
    ? `<img src="${cfg.companyLogoDataUrl}" style="max-height:60px;max-width:220px;object-fit:contain;display:block" alt="${cfg.companyName}" />`
    : '';
  const name = cfg.companyName ? `<div style="font-size:14px;font-weight:700;color:#111;margin-bottom:3px">${cfg.companyName}</div>` : '';
  const addr = cfg.companyAddress
    ? `<div style="font-size:11px;color:#555;white-space:pre-line;text-align:right">${cfg.companyAddress}</div>`
    : '';
  return `<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px">
    <div>${logo}</div>
    <div style="text-align:right">${name}${addr}</div>
  </div>`;
}

/** Generate a printable PDF of the bunker supplier invoice (opens the browser print dialog). */
function exportBunkerInvoicePdf(r: BunkerRequirement): void {
  const w = window.open('', '_blank', 'width=900,height=1100');
  if (!w) return;
  const supplierName = (r.supplier ?? '').trim();
  const supplier = loadClients().find((client) => client.name.trim().toLowerCase() === supplierName.toLowerCase());
  const bank = supplier?.bankAccount;
  const esc = (value: unknown) => String(value ?? '').replace(/[&<>]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character] ?? character));
  const detailsText = bank?.verified ? bank?.details?.trim() : '';
  const bankHtml = bank?.verified ? `<div style="margin:14px 0 8px;border:1px solid #cdd5e1;background:#f8fafc;padding:10px 12px;border-radius:6px">
    <div style="font-size:11px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Payee Account Details</div>
    <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:6px">${esc(supplierName || 'Supplier')}</div>
    ${detailsText
      ? `<pre style="margin:0;white-space:pre-wrap;font:12px Arial;color:#111">${esc(detailsText)}</pre>`
      : `<table style="width:100%;border-collapse:collapse;margin:0"><tbody>
      <tr><td style="border:none;padding:2px 6px 2px 0;color:#64748b;width:150px">Bank Name</td><td style="border:none;padding:2px 0">${esc(bank?.bankName || '—')}</td></tr>
      <tr><td style="border:none;padding:2px 6px 2px 0;color:#64748b">Account Holder</td><td style="border:none;padding:2px 0">${esc(bank?.accountHolder || '—')}</td></tr>
      <tr><td style="border:none;padding:2px 6px 2px 0;color:#64748b">Account Number</td><td style="border:none;padding:2px 0">${esc(bank?.accountNumber || '—')}</td></tr>
      <tr><td style="border:none;padding:2px 6px 2px 0;color:#64748b">SWIFT</td><td style="border:none;padding:2px 0">${esc(bank?.swift || '—')}</td></tr>
      <tr><td style="border:none;padding:2px 6px 2px 0;color:#64748b">IBAN</td><td style="border:none;padding:2px 0">${esc(bank?.iban || '—')}</td></tr>
    </tbody></table>
    `}
  </div>` : '';
  const fuelCost = r.pricePerMt != null ? Math.round(r.pricePerMt * r.quantity) : (r.invoiceAmount ?? 0) - sumAdditionalCharges(r.additionalCharges);
  const chargesTotal = sumAdditionalCharges(r.additionalCharges);
  const claimsTotal = sumBunkerClaims(r.claims);
  const total = fuelCost + chargesTotal - claimsTotal;
  const outstanding = total - (r.amountPaid ?? 0);
  const chargeRows = (r.additionalCharges ?? [])
    .map((c) => `<tr><td>${c.label}</td><td class="r">${money(c.amount)}</td></tr>`)
    .join('');
  const claimRow = claimsTotal > 0 ? `<tr><td>Less: Supplier Claims / Deductions</td><td class="r">-${money(claimsTotal)}</td></tr>` : '';
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${r.invoiceNo} — ${r.vessel}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:28px;font-size:12px}
    h1{font-size:16px;margin:0 0 2px} .sub{color:#555;margin:0 0 14px;font-size:11px}
    table{border-collapse:collapse;width:100%;margin:8px 0}
    th,td{border:1px solid #bbb;padding:4px 7px;text-align:left}
    th.r,td.r{text-align:right} tfoot td{font-weight:700;background:#f2f2f2}
    .tot{font-size:13px}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 18px;margin:10px 0}
    .grid div span{display:block;font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.03em}
    .grid div b{font-size:12.5px}
  </style></head><body>${pdfCompanyHeader()}
    <h1>Bunker Supplier Invoice — ${r.invoiceNo}</h1>
    <p class="sub">${r.vessel} · IMO ${r.imo} · Reference ${r.reference} · Requirement ${r.id}</p>
    <div class="grid">
      <div><span>Supplier</span><b>${r.supplier ?? '—'}</b></div>
      <div><span>Bunker Port</span><b>${r.bunkerPort}</b></div>
      <div><span>Fuel Type / Grade</span><b>${r.fuelType} · ${r.grade}</b></div>
      <div><span>Quantity Supplied</span><b>${num(r.deliveredQty ?? r.quantity)} MT</b></div>
      <div><span>Invoice Date</span><b>${r.invoiceDate ?? '—'}</b></div>
      <div><span>Payment Terms</span><b>${r.paymentTerms ?? '—'}</b></div>
      <div><span>Due Date</span><b>${r.dueDate ?? '—'}</b></div>
      <div><span>Approval</span><b>${r.approvalStatus}</b></div>
      <div><span>Payment Status</span><b>${r.paymentStatus}</b></div>
    </div>
    <table>
      <thead><tr><th>Line Item</th><th class="r">Amount</th></tr></thead>
      <tbody>
        <tr><td>Fuel Cost (${num(r.quantity)} MT @ USD ${r.pricePerMt ?? '—'}/MT)</td><td class="r">${money(fuelCost)}</td></tr>
        ${chargeRows}
        ${claimRow}
      </tbody>
      <tfoot><tr class="tot"><td>Total Invoice Amount</td><td class="r">${money(total)}</td></tr></tfoot>
    </table>
    <table>
      <tbody>
        <tr><td>Amount Paid</td><td class="r">${money(r.amountPaid)}</td></tr>
        <tr class="tot"><td>Outstanding</td><td class="r">${money(outstanding)}</td></tr>
        ${r.paymentRef ? `<tr><td>Payment Ref.</td><td class="r">${r.paymentRef}</td></tr>` : ''}
      </tbody>
    </table>
    ${bankHtml}
    <p class="sub">*E&amp;OE. Generated from ODAS Bunker Management.</p>
  </body></html>`);
  w.document.close();
  w.focus();
  w.print();
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
  addNotification(`Bunker invoice ${r.invoiceNo} (${r.vessel}) is ready for manager review. Amount: USD ${(r.invoiceAmount ?? 0).toLocaleString('en-US')}.`, 'Manager');
}
function managerDecision(r: BunkerRequirement, decision: 'approve' | 'reject' | 'revision'): void {
  if (decision === 'approve') {
    updateBunkerRequirement(r.id, { status: 'Approved', approvalStatus: 'Approved' }, { user: 'S. Rao', role: 'Manager', action: 'Invoice approved for payment' });
    addNotification(`Bunker invoice ${r.invoiceNo} (${r.vessel}) was approved by the manager. Ready to send to Accounts.`, 'Bunker');
  } else if (decision === 'reject') {
    updateBunkerRequirement(r.id, { approvalStatus: 'Rejected' }, { user: 'S. Rao', role: 'Manager', action: 'Invoice rejected' });
    addNotification(`Bunker invoice ${r.invoiceNo} (${r.vessel}) was rejected by the manager.`, 'Bunker');
  } else {
    updateBunkerRequirement(r.id, { approvalStatus: 'Revision Requested' }, { user: 'S. Rao', role: 'Manager', action: 'Revision requested on invoice' });
    addNotification(`Manager requested a revision on bunker invoice ${r.invoiceNo} (${r.vessel}).`, 'Bunker');
  }
}
function sendToAccounts(r: BunkerRequirement): void {
  const supplier = loadClients().find((c) => c.name.trim().toLowerCase() === (r.supplier ?? '').trim().toLowerCase());
  const verifiedBank = supplier?.bankAccount?.verified ? supplier.bankAccount : null;
  if (!verifiedBank) {
    window.alert(`Cannot send ${r.invoiceNo || 'this invoice'} to Accounts. Bank account details for "${r.supplier || 'supplier'}" are missing or not verified.`);
    return;
  }
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
    bank: verifiedBank ? 'Verified account details on file' : undefined,
    remarks: verifiedBank ? `Verified payment account: ${(verifiedBank.details || verifiedBank.accountHolder || r.supplier || '').trim()}` : undefined,
  });
  addNotification(`Bunker invoice ${r.invoiceNo} (${r.vessel}) sent to Accounts. Amount: USD ${(r.invoiceAmount ?? 0).toLocaleString('en-US')}.`, 'Accounts');
}

function hasVerifiedSupplierBank(r: BunkerRequirement): boolean {
  const supplier = loadClients().find((c) => c.name.trim().toLowerCase() === (r.supplier ?? '').trim().toLowerCase());
  return Boolean(supplier?.bankAccount?.verified);
}

/** Revert a payment sent to Accounts (manager unlock) — voids the Accounts payable and moves the invoice back to Approved. */
function cancelSentToAccounts(r: BunkerRequirement): void {
  if (!window.confirm(`Cancel the payment sent to Accounts for invoice ${r.invoiceNo}? This reverts it to Approved.`)) return;
  const txn = r.invoiceNo ? findTxnByInvoice(r.invoiceNo) : undefined;
  if (txn && txn.status !== 'Paid') {
    updateTxn(txn.id, { status: 'Cancelled' }, { user: 'Bunker Team', action: 'Payment cancelled from Bunker module', from: txn.status, to: 'Cancelled' });
  }
  updateBunkerRequirement(r.id, { status: 'Approved', paymentStatus: 'Upcoming' }, { user: 'Bunker Team', role: 'Bunker Team', action: 'Payment sent to Accounts was cancelled/reverted' });
  addNotification(`Payment for bunker invoice ${r.invoiceNo} (${r.vessel}) was cancelled and reverted from Accounts.`, 'Accounts');
}

/** Compact workflow buttons shown directly in the invoice row's Actions column. */
function InvoiceRowActions({ r }: { r: BunkerRequirement }) {
  const { isInRole } = useFleetView();
  const canApprove = isInRole('Manager, Operations Manager, Administrator');
  const sentToAccounts = reached(r.status, 'Sent to Accounts') || reached(r.status, 'Payment Due');

  if (r.paymentStatus === 'Paid') {
    return <span className="fv-bk__muted" title="Payment settled"><i className="fas fa-circle-check fv-bk__ok" aria-hidden="true" /></span>;
  }
  if (sentToAccounts) {
    return canApprove ? (
      <button type="button" className="fv-bk__btn fv-bk__btn--sm" onClick={() => cancelSentToAccounts(r)} title="Manager: revert this payment back to Approved">
        <i className="fas fa-rotate-left" /> Cancel Payment
      </button>
    ) : <span className="fv-bk__muted">Sent to Accounts</span>;
  }
  if (r.approvalStatus === 'Approved') {
    const canSendPayment = hasVerifiedSupplierBank(r);
    return (
      <button
        type="button"
        className="fv-bk__btn fv-bk__btn--sm fv-bk__btn--primary"
        onClick={() => sendToAccounts(r)}
        disabled={!canSendPayment}
        title={canSendPayment ? 'Send for payment' : 'Verify supplier bank account details first'}
      >
        <i className="fas fa-paper-plane" /> Send for Payment
      </button>
    );
  }
  if (r.approvalStatus === 'Awaiting Approval') {
    return <span className="fv-bk__muted">Awaiting approval</span>;
  }
  return (
    <button type="button" className="fv-bk__btn fv-bk__btn--sm fv-bk__btn--primary" onClick={() => raiseApproval(r)}><i className="fas fa-paper-plane" /> Send for Approval</button>
  );
}

function PaymentWorkflowActions({ r }: { r: BunkerRequirement }) {
  const { isInRole } = useFleetView();
  const canApprove = isInRole('Manager, Operations Manager, Administrator');
  const sentToAccounts = reached(r.status, 'Sent to Accounts') || reached(r.status, 'Payment Due');

  if (r.paymentStatus === 'Paid') {
    return <div className="fv-bk__actionbar fv-bk__actionbar--good"><i className="fas fa-circle-check" aria-hidden="true" /> Payment settled by Accounts{r.paymentRef ? ` — ${r.paymentRef}` : ''}.</div>;
  }
  if (sentToAccounts) {
    return (
      <div className="fv-bk__actionbar fv-bk__actionbar--good">
        <span><i className="fas fa-building-columns" aria-hidden="true" /> Sent to Accounts for payment. <PaymentBadge status={r.paymentStatus} /></span>
      </div>
    );
  }
  if (r.approvalStatus === 'Approved') {
    return (
      <div className="fv-bk__actionbar">
        <span><i className="fas fa-user-check fv-bk__ok" aria-hidden="true" /> Approved by manager. Send the invoice for payment to Accounts.</span>
      </div>
    );
  }
  if (r.approvalStatus === 'Awaiting Approval') {
    if (!canApprove) {
      return (
        <div className="fv-bk__actionbar fv-bk__actionbar--warn">
          <span><i className="fas fa-hourglass-half" aria-hidden="true" /> Sent for approval — awaiting manager decision.</span>
        </div>
      );
    }
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
  const note = r.approvalStatus === 'Rejected' ? 'Invoice was rejected by the manager.' : r.approvalStatus === 'Revision Requested' ? 'Manager requested a revision.' : 'Send the invoice for manager approval to proceed.';
  return (
    <div className={`fv-bk__actionbar${r.approvalStatus === 'Rejected' ? ' fv-bk__actionbar--bad' : ''}`}>
      <span><i className="fas fa-circle-info" aria-hidden="true" /> {note}</span>
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
  const [charges, setCharges] = useState<AdditionalCharge[]>([]);

  const price = parseFloat(pricePerMt) || 0;
  const fuelCost = Math.round(price * r.quantity);
  const chargesTotal = sumAdditionalCharges(charges);
  const total = fuelCost + chargesTotal;
  const canSave = supplier.trim() !== '' && price > 0;

  const addCharge = () => setCharges((prev) => [...prev, { id: uid('chg'), label: ADDITIONAL_CHARGE_PRESETS[0], amount: 0 }]);
  const setCharge = (id: string, patch: Partial<AdditionalCharge>) =>
    setCharges((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCharge = (id: string) => setCharges((prev) => prev.filter((c) => c.id !== id));

  const save = () => {
    if (!canSave) return;
    const quote: Quote = {
      supplier: supplier.trim(),
      pricePerMt: price,
      additionalCharges: charges.filter((c) => c.label.trim() && c.amount > 0),
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
            <label className="fv-bk__ffield"><span>Fuel Cost (USD)</span><input value={fuelCost ? num(fuelCost) : ''} disabled /></label>
            <label className="fv-bk__ffield"><span>Total Cost incl. Charges (USD)</span><input value={total ? num(total) : ''} disabled /></label>
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
          <div className="fv-bk__charges">
            <div className="fv-bk__charges-head">
              <span>Additional Charges (barging, port dues, agency fee, etc.)</span>
              <button type="button" className="fv-bk__btn fv-bk__btn--sm" onClick={addCharge}><i className="fas fa-plus" /> Add Charge</button>
            </div>
            {charges.length === 0 ? (
              <p className="fv-bk__muted">No additional charges added — total will be fuel cost only.</p>
            ) : (
              <div className="fv-bk__charges-list">
                {charges.map((c) => (
                  <div key={c.id} className="fv-bk__charge-row">
                    <select value={c.label} onChange={(e) => setCharge(c.id, { label: e.target.value })}>
                      {ADDITIONAL_CHARGE_PRESETS.map((p) => <option key={p}>{p}</option>)}
                    </select>
                    <input type="number" value={c.amount || ''} onChange={(e) => setCharge(c.id, { amount: parseFloat(e.target.value) || 0 })} placeholder="Amount (USD)" />
                    <button type="button" className="fv-bk__icon-btn" onClick={() => removeCharge(c.id)} aria-label="Remove charge"><i className="fas fa-trash" /></button>
                  </div>
                ))}
              </div>
            )}
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
  const [editingSupplier, setEditingSupplier] = useState<string | null>(null);
  const [draft, setDraft] = useState<Quote | null>(null);
  const dueDays = daysUntil(r.dueIso);

  const startEditQuote = (qt: Quote) => {
    setEditingSupplier(qt.supplier);
    setDraft({ ...qt, additionalCharges: (qt.additionalCharges ?? []).map((c) => ({ ...c })) });
  };
  const cancelEditQuote = () => {
    setEditingSupplier(null);
    setDraft(null);
  };
  const saveEditQuote = () => {
    if (!editingSupplier || !draft) return;
    const fuelCost = Math.round((draft.pricePerMt || 0) * r.quantity);
    const total = fuelCost + sumAdditionalCharges(draft.additionalCharges);
    updateBunkerQuote(r.id, editingSupplier, { ...draft, totalCost: total });
    setEditingSupplier(null);
    setDraft(null);
  };
  const deleteQuote = (qt: Quote) => {
    if (!window.confirm(`Delete the quotation from "${qt.supplier}"?`)) return;
    if (editingSupplier === qt.supplier) cancelEditQuote();
    deleteBunkerQuote(r.id, qt.supplier);
  };
  const setDraftField = <K extends keyof Quote>(key: K, value: Quote[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const addDraftCharge = () => setDraft((d) => (d ? { ...d, additionalCharges: [...(d.additionalCharges ?? []), { id: uid('chg'), label: ADDITIONAL_CHARGE_PRESETS[0], amount: 0 }] } : d));
  const setDraftCharge = (id: string, patch: Partial<AdditionalCharge>) =>
    setDraft((d) => (d ? { ...d, additionalCharges: (d.additionalCharges ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)) } : d));
  const removeDraftCharge = (id: string) => setDraft((d) => (d ? { ...d, additionalCharges: (d.additionalCharges ?? []).filter((c) => c.id !== id) } : d));

  const [editingSupply, setEditingSupply] = useState(false);
  const [supplyDraft, setSupplyDraft] = useState({ supplyDateTime: '', suppliedQty: '', deliveredQty: '', deliveryMethod: '' });
  const startEditSupply = () => {
    setSupplyDraft({
      // Auto-fetched from when the BDN/supply was recorded; falls back to "now" if not yet set.
      supplyDateTime: toDatetimeLocalValue(r.supplyDateTime ?? '') || currentDatetimeLocalValue(),
      suppliedQty: r.suppliedQty != null ? String(r.suppliedQty) : '',
      deliveredQty: r.deliveredQty != null ? String(r.deliveredQty) : '',
      deliveryMethod: r.deliveryMethod ?? '',
    });
    setEditingSupply(true);
  };
  const saveEditSupply = () => {
    updateSupplyDetails(r, {
      supplyDateTime: fromDatetimeLocalValue(supplyDraft.supplyDateTime) || r.supplyDateTime || '',
      suppliedQty: parseFloat(supplyDraft.suppliedQty) || 0,
      deliveredQty: parseFloat(supplyDraft.deliveredQty) || 0,
      deliveryMethod: supplyDraft.deliveryMethod,
    });
    setEditingSupply(false);
  };

  const [addClaimOpen, setAddClaimOpen] = useState(false);
  const [claimDraft, setClaimDraft] = useState({ type: BUNKER_CLAIM_TYPES[0] as string, description: '', amount: '' });
  const [editingClaimId, setEditingClaimId] = useState<string | null>(null);
  const startAddClaim = () => {
    setClaimDraft({ type: BUNKER_CLAIM_TYPES[0], description: '', amount: '' });
    setEditingClaimId(null);
    setAddClaimOpen(true);
  };
  const startEditClaim = (c: BunkerClaim) => {
    setClaimDraft({ type: c.type, description: c.description, amount: String(c.amount) });
    setEditingClaimId(c.id);
    setAddClaimOpen(true);
  };
  const saveClaim = () => {
    const amount = parseFloat(claimDraft.amount) || 0;
    if (!claimDraft.description.trim() || amount <= 0) return;
    if (editingClaimId) {
      updateBunkerClaim(r.id, editingClaimId, { type: claimDraft.type, description: claimDraft.description.trim(), amount });
    } else {
      addBunkerClaim(r.id, { id: uid('claim'), type: claimDraft.type, description: claimDraft.description.trim(), amount, status: 'Open', raisedOn: fmtDate(new Date()) });
    }
    setAddClaimOpen(false);
    setEditingClaimId(null);
  };
  const setClaimStatus = (c: BunkerClaim, status: BunkerClaim['status']) => updateBunkerClaim(r.id, c.id, { status });
  const removeClaim = (c: BunkerClaim) => {
    if (!window.confirm(`Remove the claim "${c.type}"?`)) return;
    deleteBunkerClaim(r.id, c.id);
  };

  const [editingInvoice, setEditingInvoice] = useState(false);
  const [invoiceSelected, setInvoiceSelected] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState<{
    invoiceNo: string; invoiceDate: string; pricePerMt: string; additionalCharges: AdditionalCharge[];
    paymentTerms: string; dueDate: string; amountPaid: string; paymentRef: string;
  }>({ invoiceNo: '', invoiceDate: '', pricePerMt: '', additionalCharges: [], paymentTerms: '', dueDate: '', amountPaid: '', paymentRef: '' });
  const startEditInvoice = () => {
    setInvoiceDraft({
      invoiceNo: r.invoiceNo ?? '',
      invoiceDate: r.invoiceDate ?? '',
      pricePerMt: r.pricePerMt != null ? String(r.pricePerMt) : '',
      additionalCharges: (r.additionalCharges ?? []).map((c) => ({ ...c })),
      paymentTerms: r.paymentTerms ?? '',
      dueDate: r.dueDate ?? '',
      amountPaid: r.amountPaid != null ? String(r.amountPaid) : '0',
      paymentRef: r.paymentRef ?? '',
    });
    setEditingInvoice(true);
  };
  const addInvoiceCharge = () => setInvoiceDraft((d) => ({ ...d, additionalCharges: [...d.additionalCharges, { id: uid('chg'), label: ADDITIONAL_CHARGE_PRESETS[0], amount: 0 }] }));
  const setInvoiceCharge = (id: string, patch: Partial<AdditionalCharge>) =>
    setInvoiceDraft((d) => ({ ...d, additionalCharges: d.additionalCharges.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const removeInvoiceCharge = (id: string) => setInvoiceDraft((d) => ({ ...d, additionalCharges: d.additionalCharges.filter((c) => c.id !== id) }));
  const saveEditInvoice = () => {
    const pricePerMt = parseFloat(invoiceDraft.pricePerMt) || 0;
    const fuelCost = Math.round(pricePerMt * r.quantity);
    const claimsTotal = sumBunkerClaims(r.claims);
    const invoiceAmount = fuelCost + sumAdditionalCharges(invoiceDraft.additionalCharges) - claimsTotal;
    updateBunkerRequirement(
      r.id,
      {
        invoiceNo: invoiceDraft.invoiceNo,
        invoiceDate: invoiceDraft.invoiceDate,
        pricePerMt,
        additionalCharges: invoiceDraft.additionalCharges,
        invoiceAmount,
        paymentTerms: invoiceDraft.paymentTerms,
        dueDate: invoiceDraft.dueDate,
        amountPaid: parseFloat(invoiceDraft.amountPaid) || 0,
        paymentRef: invoiceDraft.paymentRef,
      },
      { user: 'Bunker Team', role: 'Bunker Team', action: 'Invoice details corrected' },
    );
    setEditingInvoice(false);
  };

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
          {(r.fuelLines?.length ?? 0) > 1 ? (
            <table className="fv-bk__table" style={{ marginBottom: 8 }}>
              <thead><tr><th>Fuel Type</th><th>Grade</th><th className="fv-bk__r">Required (MT)</th><th className="fv-bk__r">Supplied (MT)</th><th className="fv-bk__r">Delivered (MT)</th></tr></thead>
              <tbody>
                {(r.fuelLines ?? [{ fuel: r.fuelType, quantity: r.quantity, grade: r.grade }]).map((fl, i) => (
                  <tr key={i}>
                    <td><span className="fv-bk__fuel-chip">{fl.fuel}</span></td>
                    <td>{fl.grade}</td>
                    <td className="fv-bk__r">{num(fl.quantity)}</td>
                    <td className="fv-bk__r">{fl.suppliedQty != null ? num(fl.suppliedQty) : '—'}</td>
                    <td className="fv-bk__r">{fl.deliveredQty != null ? num(fl.deliveredQty) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="fv-bk__row-sub">
                  <td colSpan={2}>Total</td>
                  <td className="fv-bk__r">{num((r.fuelLines ?? []).reduce((s, l) => s + l.quantity, 0))} MT</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="fv-bk__grid4">
              <Field label="Fuel Type" value={r.fuelType} tone="accent" />
              <Field label="Quantity" value={`${num(r.quantity)} MT`} />
              <Field label="Grade" value={r.grade} />
              <Field label="Delivery Mode" value={r.deliveryMethod ?? '—'} />
            </div>
          )}
          <div className="fv-bk__grid4" style={{ marginTop: 6 }}>
            <Field label="ROB on Arrival" value={`${num(r.robArrival)} MT`} />
            <Field label="Expected Cons." value={`${num(r.expectedCons)} MT/day`} />
            <Field label="Delivery Mode" value={r.deliveryMethod ?? '—'} />
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
                <table className="fv-bk__table fv-bk__table--compare fv-bk__table--center">
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th>Price / MT</th>
                      <th>Add'l Charges</th>
                      <th>Total Cost</th>
                      <th>Terms</th>
                      <th>Delivery</th>
                      <th>Method</th>
                      <th>Rating</th>
                      <th>Score</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...r.quotes].sort((a, b) => b.score - a.score).map((qt) => {
                      const isEditing = editingSupplier === qt.supplier && draft;
                      if (isEditing && draft) {
                        const fuelCost = Math.round((draft.pricePerMt || 0) * r.quantity);
                        const total = fuelCost + sumAdditionalCharges(draft.additionalCharges);
                        return (
                          <tr key={qt.supplier} className="fv-bk__row-editing">
                            <td><input value={draft.supplier} onChange={(e) => setDraftField('supplier', e.target.value)} /></td>
                            <td><input type="number" value={draft.pricePerMt || ''} onChange={(e) => setDraftField('pricePerMt', parseFloat(e.target.value) || 0)} /></td>
                            <td>
                              <div className="fv-bk__charges-inline">
                                {(draft.additionalCharges ?? []).map((c) => (
                                  <div key={c.id} className="fv-bk__charge-row fv-bk__charge-row--inline">
                                    <select value={c.label} onChange={(e) => setDraftCharge(c.id, { label: e.target.value })}>
                                      {ADDITIONAL_CHARGE_PRESETS.map((p) => <option key={p}>{p}</option>)}
                                    </select>
                                    <input type="number" value={c.amount || ''} onChange={(e) => setDraftCharge(c.id, { amount: parseFloat(e.target.value) || 0 })} placeholder="Amount" />
                                    <button type="button" className="fv-bk__icon-btn" onClick={() => removeDraftCharge(c.id)} aria-label="Remove charge"><i className="fas fa-trash" /></button>
                                  </div>
                                ))}
                                <button type="button" className="fv-bk__btn fv-bk__btn--sm" onClick={addDraftCharge}><i className="fas fa-plus" /> Add Charge</button>
                              </div>
                            </td>
                            <td>{money(total)}</td>
                            <td><input value={draft.terms} onChange={(e) => setDraftField('terms', e.target.value)} /></td>
                            <td><input value={draft.deliveryDate} onChange={(e) => setDraftField('deliveryDate', e.target.value)} /></td>
                            <td>
                              <select value={draft.deliveryMethod} onChange={(e) => setDraftField('deliveryMethod', e.target.value)}>
                                {['Barge', 'Ex-pipe', 'Truck to Vessel'].map((m) => <option key={m}>{m}</option>)}
                              </select>
                            </td>
                            <td><input type="number" step="0.1" value={draft.rating} onChange={(e) => setDraftField('rating', parseFloat(e.target.value) || 0)} /></td>
                            <td>{qt.score}</td>
                            <td>
                              <div className="fv-bk__row-actions">
                                <button type="button" className="fv-bk__icon-btn" title="Save" onClick={saveEditQuote}><i className="fas fa-check" /></button>
                                <button type="button" className="fv-bk__icon-btn" title="Cancel" onClick={cancelEditQuote}><i className="fas fa-xmark" /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={qt.supplier} className={qt.recommended ? 'fv-bk__row-rec' : undefined}>
                          <td>{qt.recommended && <i className="fas fa-award fv-bk__rec-ico" aria-hidden="true" />} {qt.supplier}</td>
                          <td>USD {qt.pricePerMt}</td>
                          <td><ChargesCell charges={qt.additionalCharges} /></td>
                          <td>{money(qt.totalCost)}</td>
                          <td>{qt.terms}</td>
                          <td>{qt.deliveryDate}</td>
                          <td>{qt.deliveryMethod}</td>
                          <td><Rating value={qt.rating} /></td>
                          <td><span className="fv-bk__score">{qt.score}</span></td>
                          <td>
                            <div className="fv-bk__row-actions">
                              {reached(r.status, 'Booked')
                                ? (r.supplier === qt.supplier ? <span className="fv-bk__pbadge fv-bk__pbadge--green">Booked</span> : <span className="fv-bk__muted">—</span>)
                                : <button type="button" className={`fv-bk__btn fv-bk__btn--sm${qt.recommended ? ' fv-bk__btn--primary' : ''}`} onClick={() => bookQuote(r, qt)}>Select &amp; Book</button>}
                              <button type="button" className="fv-bk__icon-btn" title="Edit quote" onClick={() => startEditQuote(qt)}><i className="fas fa-pen" /></button>
                              <button type="button" className="fv-bk__icon-btn" title="Delete quote" onClick={() => deleteQuote(qt)}><i className="fas fa-trash" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
    const fuelCost = r.pricePerMt != null ? Math.round(r.pricePerMt * r.quantity) : undefined;
    return (
      <div className="fv-bk__stage">
        <PanelSection title="Booking Details">
          <div className="fv-bk__grid4">
            <Field label="Supplier" value={r.supplier} tone="accent" />
            <Field label="PO No." value={r.poNo} />
            <Field label="Contract Ref." value={r.contractRef} />
            <Field label="Confirm No." value={r.confirmNo} />
            <Field label="Unit Price" value={r.pricePerMt ? `USD ${r.pricePerMt}/MT` : '—'} />
            <Field label="Fuel Cost" value={money(fuelCost)} />
            <Field label="Total Amount incl. Charges" value={money(r.totalCost)} tone="good" />
            <Field label="Delivery Mode" value={r.deliveryMethod} />
            <Field label="Booked On" value={r.bookedOn} />
          </div>
        </PanelSection>
        <PanelSection title="Additional Charges">
          {(r.additionalCharges?.length ?? 0) === 0 ? (
            <p className="fv-bk__muted">No additional charges on this booking.</p>
          ) : (
            <div className="fv-bk__tablewrap">
              <table className="fv-bk__table">
                <thead><tr><th>Charge</th><th className="fv-bk__r">Amount</th></tr></thead>
                <tbody>
                  {r.additionalCharges!.map((c) => (
                    <tr key={c.id}><td>{c.label}</td><td className="fv-bk__r">{money(c.amount)}</td></tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="fv-bk__row-sub"><td>Total Additional Charges</td><td className="fv-bk__r">{money(sumAdditionalCharges(r.additionalCharges))}</td></tr>
                </tfoot>
              </table>
            </div>
          )}
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
            <span><i className="fas fa-gas-pump" aria-hidden="true" /> Booked with {r.supplier}. Supply is auto-recorded as soon as the BDN or Delivery Receipt is uploaded (right-hand Upload panel), or record it manually below.</span>
            <button type="button" className="fv-bk__btn fv-bk__btn--primary" onClick={() => recordSupply(r)}><i className="fas fa-check" /> Record Supply (BDN Received)</button>
          </div>
        </div>
      );
    }
    return (
      <div className="fv-bk__stage">
        <PanelSection
          title="Supply / Delivery"
          action={
            editingSupply ? (
              <div className="fv-bk__row-actions">
                <button type="button" className="fv-bk__btn fv-bk__btn--sm fv-bk__btn--primary" onClick={saveEditSupply}><i className="fas fa-check" /> Save</button>
                <button type="button" className="fv-bk__btn fv-bk__btn--sm" onClick={() => setEditingSupply(false)}><i className="fas fa-xmark" /> Cancel</button>
              </div>
            ) : (
              <button type="button" className="fv-bk__btn fv-bk__btn--sm" onClick={startEditSupply}><i className="fas fa-pen" /> Edit</button>
            )
          }
        >
          {editingSupply ? (
            <div className="fv-bk__grid4">
              <label className="fv-bk__ffield"><span>Supply Date / Time</span><input type="datetime-local" value={supplyDraft.supplyDateTime} onChange={(e) => setSupplyDraft((d) => ({ ...d, supplyDateTime: e.target.value }))} /></label>
              <Field label="Nominated Qty" value={`${num(r.quantity)} MT`} />
              <label className="fv-bk__ffield"><span>Supplied Qty (MT)</span><input type="number" value={supplyDraft.suppliedQty} onChange={(e) => setSupplyDraft((d) => ({ ...d, suppliedQty: e.target.value }))} /></label>
              <label className="fv-bk__ffield"><span>Delivered — BDN (MT)</span><input type="number" value={supplyDraft.deliveredQty} onChange={(e) => setSupplyDraft((d) => ({ ...d, deliveredQty: e.target.value }))} /></label>
              <label className="fv-bk__ffield"><span>Delivery Mode</span>
                <select value={supplyDraft.deliveryMethod} onChange={(e) => setSupplyDraft((d) => ({ ...d, deliveryMethod: e.target.value }))}>
                  {['Barge', 'Ex-pipe', 'Truck to Vessel'].map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
              <Field label="Bunker Port" value={r.bunkerPort} />
            </div>
          ) : (
            <div className="fv-bk__grid4">
              <Field label="Supply Date / Time" value={r.supplyDateTime} tone="accent" />
              <Field label="Nominated Qty" value={`${num(r.quantity)} MT`} />
              <Field label="Supplied Qty" value={r.suppliedQty != null ? `${num(r.suppliedQty)} MT` : '—'} />
              <Field label="Delivered (BDN)" value={r.deliveredQty != null ? `${num(r.deliveredQty)} MT` : '—'} tone="good" />
              <Field label="Delivery Mode" value={r.deliveryMethod} />
              <Field label="Bunker Port" value={r.bunkerPort} />
            </div>
          )}
        </PanelSection>
        <PanelSection title="Supply Documents"><DocsList docs={r.documents} filter={(d) => ['BDN', 'Delivery Receipt', 'Lab Analysis'].includes(d.type)} /></PanelSection>
        <PanelSection
          title="Claims / Deductions"
          action={<button type="button" className="fv-bk__btn fv-bk__btn--sm fv-bk__btn--primary" onClick={startAddClaim}><i className="fas fa-plus" /> Add Claim</button>}
        >
          {(r.claims ?? []).length === 0 ? (
            <p className="fv-bk__muted">No claims raised against the supplier — e.g. short supply, off-spec fuel, delivery delay or equipment damage.</p>
          ) : (
            <div className="fv-bk__tablewrap">
              <table className="fv-bk__table fv-bk__table--center">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Raised On</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(r.claims ?? []).map((c) => (
                    <tr key={c.id}>
                      <td>{c.type}</td>
                      <td className="fv-bk__claim-desc" title={c.description}>{truncate(c.description, 40)}</td>
                      <td>{c.raisedOn}</td>
                      <td>{money(c.amount)}</td>
                      <td>
                        <select className="fv-bk__claim-status" value={c.status} onChange={(e) => setClaimStatus(c, e.target.value as BunkerClaim['status'])}>
                          {BUNKER_CLAIM_STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td>
                        <div className="fv-bk__row-actions">
                          <button type="button" className="fv-bk__icon-btn" title="Edit claim" onClick={() => startEditClaim(c)}><i className="fas fa-pen" /></button>
                          <button type="button" className="fv-bk__icon-btn" title="Delete claim" onClick={() => removeClaim(c)}><i className="fas fa-trash" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="fv-bk__row-sub"><td colSpan={3}>Total Deductible</td><td>{money(sumBunkerClaims(r.claims))}</td><td colSpan={2} /></tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="fv-bk__hint"><i className="fas fa-circle-info" aria-hidden="true" /> Claims raised here (excluding rejected ones) are automatically deducted from the supplier invoice under Invoice &amp; Payments.</p>
          {addClaimOpen && (
            <div className="fv-bk__claim-form">
              <div className="fv-bk__claim-form-row">
                <label className="fv-bk__ffield"><span>Claim Type</span>
                  <select value={claimDraft.type} onChange={(e) => setClaimDraft((d) => ({ ...d, type: e.target.value }))}>
                    {BUNKER_CLAIM_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label className="fv-bk__ffield"><span>Amount (USD)</span><input type="number" value={claimDraft.amount} onChange={(e) => setClaimDraft((d) => ({ ...d, amount: e.target.value }))} /></label>
              </div>
              <label className="fv-bk__ffield fv-bk__ffield--grow">
                <span>Description <em className="fv-bk__ffield-hint">(full details — only a short summary shows in the table)</em></span>
                <textarea rows={4} value={claimDraft.description} onChange={(e) => setClaimDraft((d) => ({ ...d, description: e.target.value }))} placeholder="e.g. 12 MT short-delivered per BDN vs invoice — calculation: 700 MT invoiced, 688 MT per BDN, shortfall 12 MT × USD 680/MT = USD 8,160" />
              </label>
              <div className="fv-bk__row-actions">
                <button type="button" className="fv-bk__btn fv-bk__btn--sm fv-bk__btn--primary" onClick={saveClaim}><i className="fas fa-check" /> Save</button>
                <button type="button" className="fv-bk__btn fv-bk__btn--sm" onClick={() => { setAddClaimOpen(false); setEditingClaimId(null); }}><i className="fas fa-xmark" /> Cancel</button>
              </div>
            </div>
          )}
        </PanelSection>
      </div>
    );
  }

  if (tab === 'invoice') {
    if (!r.invoiceNo) {
      if (!reached(r.status, 'Supplied')) return <EmptyState icon="fa-file-invoice-dollar" text="Invoice becomes available once the supply is completed." />;
      return (
        <div className="fv-bk__stage">
          <PanelSection title="Invoice & Payment">
            <div className="fv-bk__actionbar">
              <span><i className="fas fa-file-invoice-dollar" aria-hidden="true" /> Supply completed. Register the supplier invoice to start the payment approval workflow, or attach the invoice received from the supplier.</span>
              <button type="button" className="fv-bk__btn fv-bk__btn--primary" onClick={() => addInvoice(r)}><i className="fas fa-file-arrow-up" /> Add Supplier Invoice</button>
            </div>
            <label className="fv-bk__btn fv-bk__btn--sm fv-bk__attach-btn">
              <i className="fas fa-paperclip" /> Attach Invoice
              <input
                type="file"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) uploadBunkerDocument(r, file, 'Invoice');
                }}
              />
            </label>
            <p className="fv-bk__hint"><i className="fas fa-circle-info" aria-hidden="true" /> Attaching a file here automatically registers the invoice if it hasn't been added yet.</p>
          </PanelSection>
        </div>
      );
    }
    const fuelCost = r.pricePerMt != null ? Math.round(r.pricePerMt * r.quantity) : (r.invoiceAmount ?? 0) - sumAdditionalCharges(r.additionalCharges);
    const chargesTotal = sumAdditionalCharges(r.additionalCharges);
    const claimsTotal = sumBunkerClaims(r.claims);
    const liveInvoiceAmount = fuelCost + chargesTotal - claimsTotal;
    const liveOutstanding = liveInvoiceAmount - (r.amountPaid ?? 0);
    const invoiceDocs = r.documents.filter((d) => d.type === 'Invoice');
    const deleteInvoice = () => {
      if (!window.confirm(`Delete invoice ${r.invoiceNo}? This clears the invoice and payment details so a new one can be registered.`)) return;
      deleteBunkerInvoice(r.id);
    };
    const duplicateInvoice = () => {
      const newId = duplicateBunkerInvoice(r.id);
      if (newId) {
        writeSelectedBunkerId(newId);
        setEditingInvoice(false);
      }
    };
    const invoiceActions = (
      <div className="fv-bk__row-actions">
        {!editingInvoice && <button type="button" className="fv-bk__icon-btn" title="Edit invoice" onClick={startEditInvoice}><i className="fas fa-pen" /></button>}
        {!editingInvoice && <button type="button" className="fv-bk__icon-btn" title={invoiceSelected ? 'Download PDF' : 'Select the invoice checkbox first'} disabled={!invoiceSelected} onClick={() => exportBunkerInvoicePdf(r)}><i className="fas fa-file-pdf" /></button>}
        {!editingInvoice && <button type="button" className="fv-bk__icon-btn" title={invoiceSelected ? 'Duplicate invoice' : 'Select the invoice checkbox first'} disabled={!invoiceSelected} onClick={duplicateInvoice}><i className="fas fa-copy" /></button>}
        {!editingInvoice && <button type="button" className="fv-bk__icon-btn" title={invoiceSelected ? 'Delete invoice' : 'Select the invoice checkbox first'} disabled={!invoiceSelected} onClick={deleteInvoice}><i className="fas fa-trash" /></button>}
        {editingInvoice && (
          <>
            <button type="button" className="fv-bk__icon-btn" title="Save" onClick={saveEditInvoice}><i className="fas fa-check" /></button>
            <button type="button" className="fv-bk__icon-btn" title="Cancel" onClick={() => setEditingInvoice(false)}><i className="fas fa-xmark" /></button>
          </>
        )}
      </div>
    );
    return (
      <div className="fv-bk__stage">
        <PanelSection title="Invoice & Payment" action={invoiceActions}>
          <div className="fv-bk__tablewrap">
            <table className="fv-bk__table fv-bk__table--invoice">
              <thead>
                <tr>
                  <th aria-label="Select" />
                  <th>Invoice No.</th>
                  <th>Supplier</th>
                  <th>Qty @ Price</th>
                  <th>Total Amount</th>
                  <th>Due Date</th>
                  <th>Approval</th>
                  <th>Payment Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr className={dueDays != null && dueDays < 0 && r.paymentStatus !== 'Paid' ? 'fv-bk__row-bad' : undefined}>
                  <td>
                    <input type="checkbox" checked={invoiceSelected} onChange={(e) => setInvoiceSelected(e.target.checked)} aria-label={`Select invoice ${r.invoiceNo}`} />
                  </td>
                  <td>{r.invoiceNo}</td>
                  <td>{r.supplier}</td>
                  <td>{num(r.deliveredQty ?? r.quantity)} MT @ USD {r.pricePerMt ?? '—'}</td>
                  <td>{money(liveInvoiceAmount)}</td>
                  <td>{r.dueDate}<br /><small className="fv-bk__muted">{dueInLabel(r.dueIso, r.paymentStatus === 'Paid')}</small></td>
                  <td><ApprovalBadge status={r.approvalStatus} /></td>
                  <td><PaymentBadge status={r.paymentStatus} /></td>
                  <td>
                    {editingInvoice ? (
                      <div className="fv-bk__row-actions">
                        <button type="button" className="fv-bk__icon-btn" title="Save" onClick={saveEditInvoice}><i className="fas fa-check" /></button>
                        <button type="button" className="fv-bk__icon-btn" title="Cancel" onClick={() => setEditingInvoice(false)}><i className="fas fa-xmark" /></button>
                      </div>
                    ) : (
                      <InvoiceRowActions r={r} />
                    )}
                  </td>
                </tr>
                {editingInvoice && (
                  <tr className="fv-bk__row-editing">
                    <td colSpan={9}>
                      <div className="fv-bk__invoice-expand">
                        <div className="fv-bk__invoice-section">
                          <h5>Invoice Details</h5>
                          <div className="fv-bk__grid4">
                            <label className="fv-bk__ffield"><span>Invoice No.</span><input value={invoiceDraft.invoiceNo} onChange={(e) => setInvoiceDraft((d) => ({ ...d, invoiceNo: e.target.value }))} /></label>
                            <label className="fv-bk__ffield"><span>Invoice Date</span><input value={invoiceDraft.invoiceDate} onChange={(e) => setInvoiceDraft((d) => ({ ...d, invoiceDate: e.target.value }))} /></label>
                            <label className="fv-bk__ffield"><span>Payment Terms</span><input value={invoiceDraft.paymentTerms} onChange={(e) => setInvoiceDraft((d) => ({ ...d, paymentTerms: e.target.value }))} /></label>
                            <label className="fv-bk__ffield"><span>Due Date</span><input value={invoiceDraft.dueDate} onChange={(e) => setInvoiceDraft((d) => ({ ...d, dueDate: e.target.value }))} /></label>
                          </div>
                        </div>

                        <div className="fv-bk__invoice-section">
                          <h5>Supply Details</h5>
                          <div className="fv-bk__grid4">
                            <Field label="Supplier" value={r.supplier} tone="accent" />
                            <Field label="Bunker Port" value={r.bunkerPort} />
                            <Field label="Fuel Type / Grade" value={`${r.fuelType} · ${r.grade}`} />
                            <Field label="Quantity Supplied" value={`${num(r.deliveredQty ?? r.quantity)} MT`} />
                          </div>
                        </div>

                        <div className="fv-bk__invoice-section">
                          <h5>Charges</h5>
                          <div className="fv-bk__tablewrap">
                            <table className="fv-bk__table fv-bk__table--center">
                              <thead><tr><th>Line Item</th><th>Amount</th></tr></thead>
                              <tbody>
                                <tr>
                                  <td className="fv-bk__charge-line">
                                    <span className="fv-bk__nowrap">Fuel Cost ({num(r.quantity)} MT @ USD <input className="fv-bk__inline-input" type="number" value={invoiceDraft.pricePerMt} onChange={(e) => setInvoiceDraft((d) => ({ ...d, pricePerMt: e.target.value }))} />/MT)</span>
                                  </td>
                                  <td>{money(Math.round((parseFloat(invoiceDraft.pricePerMt) || 0) * r.quantity))}</td>
                                </tr>
                                {invoiceDraft.additionalCharges.map((c) => (
                                  <tr key={c.id}>
                                    <td>
                                      <select value={c.label} onChange={(e) => setInvoiceCharge(c.id, { label: e.target.value })}>
                                        {ADDITIONAL_CHARGE_PRESETS.map((p) => <option key={p}>{p}</option>)}
                                      </select>
                                    </td>
                                    <td>
                                      <div className="fv-bk__row-actions">
                                        <input className="fv-bk__inline-input" type="number" value={c.amount || ''} onChange={(e) => setInvoiceCharge(c.id, { amount: parseFloat(e.target.value) || 0 })} />
                                        <button type="button" className="fv-bk__icon-btn" onClick={() => removeInvoiceCharge(c.id)} aria-label="Remove charge"><i className="fas fa-trash" /></button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                <tr><td colSpan={2}><button type="button" className="fv-bk__btn fv-bk__btn--sm" onClick={addInvoiceCharge}><i className="fas fa-plus" /> Add Charge</button></td></tr>
                                {claimsTotal > 0 && (
                                  <tr className="fv-bk__row-bad"><td>Less: Supplier Claims / Deductions</td><td>-{money(claimsTotal)}</td></tr>
                                )}
                              </tbody>
                              <tfoot>
                                <tr className="fv-bk__row-sub">
                                  <td>Total Invoice Amount</td>
                                  <td>{money(Math.round((parseFloat(invoiceDraft.pricePerMt) || 0) * r.quantity) + sumAdditionalCharges(invoiceDraft.additionalCharges) - claimsTotal)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>

                        <div className="fv-bk__invoice-section">
                          <h5>Payment</h5>
                          <div className="fv-bk__grid4">
                            <Field label="Approval" value={<ApprovalBadge status={r.approvalStatus} />} />
                            <Field label="Payment Status" value={<PaymentBadge status={r.paymentStatus} />} />
                            <label className="fv-bk__ffield"><span>Amount Paid (USD)</span><input type="number" value={invoiceDraft.amountPaid} onChange={(e) => setInvoiceDraft((d) => ({ ...d, amountPaid: e.target.value }))} /></label>
                            <label className="fv-bk__ffield"><span>Payment Ref.</span><input value={invoiceDraft.paymentRef} onChange={(e) => setInvoiceDraft((d) => ({ ...d, paymentRef: e.target.value }))} /></label>
                          </div>
                        </div>

                        <div className="fv-bk__invoice-section">
                          <h5>Supplier Invoice Document</h5>
                          {invoiceDocs.length === 0 ? (
                            <p className="fv-bk__muted">No invoice file attached yet.</p>
                          ) : (
                            <DocsList docs={invoiceDocs} />
                          )}
                          <label className="fv-bk__btn fv-bk__btn--sm fv-bk__attach-btn">
                            <i className="fas fa-paperclip" /> Attach Invoice
                            <input
                              type="file"
                              hidden
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (file) uploadBunkerDocument(r, file, 'Invoice');
                              }}
                            />
                          </label>
                        </div>

                        <div className="fv-bk__row-actions">
                          <button type="button" className="fv-bk__btn fv-bk__btn--sm fv-bk__btn--primary" onClick={saveEditInvoice}><i className="fas fa-check" /> Save</button>
                          <button type="button" className="fv-bk__btn fv-bk__btn--sm" onClick={() => setEditingInvoice(false)}><i className="fas fa-xmark" /> Cancel</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!editingInvoice && (
            <>
              <div className="fv-bk__invoice-outstanding">
                <span>Amount Paid: <strong>{money(r.amountPaid)}</strong></span>
                <span>Outstanding: <strong className={liveOutstanding > 0 ? 'fv-bk__field-value--bad' : 'fv-bk__field-value--good'}>{money(liveOutstanding)}</strong></span>
                {r.paymentRef && <span>Payment Ref.: <strong>{r.paymentRef}</strong></span>}
              </div>
              <PaymentWorkflowActions r={r} />
            </>
          )}
        </PanelSection>
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

export function BunkerManagementPage({ mode }: { mode?: 'create' } = {}) {
  const [searchParams] = useSearchParams();
  const createMode = mode === 'create' || searchParams.get('new') === '1';
  const data = useBunkerRequirements();
  const selectedId = createMode ? null : (useSelectedBunkerId() ?? null);
  const [tab, setTab] = useState<WsTab>('order');
  const [compareId, setCompareId] = useState<string | null>(null);
  const [rail, setRail] = useState<RailPanel>(null);
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    if (!createMode) return;
    clearSelectedBunkerId();
  }, [createMode]);

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
            <ModuleVesselSearch />
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
