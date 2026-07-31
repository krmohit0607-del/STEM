import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { useSelectedVoyage } from '../data/selectedVoyage';
import type { Voyage } from '../data/voyages';
import { NoVesselSelected } from './NoVesselSelected';
import { addPayable } from '../data/accounts';

/**
 * Postfix Department — Voyage Settlement & Claims Management Center.
 *
 * Opens after a voyage completes (linked to the Operations voyage). Manages
 * PDA/FDA, agent invoices, additional services, laytime → demurrage/despatch,
 * freight settlement, claims, documents, accounting and audit. Reuses the
 * Operations (`fv-ops`) shell so the look matches exactly: tabbed main area +
 * right icon rail. Settlement can be pushed to the Accounts module.
 */

/* ------------------------------------------------------------------ types */

type TabId = 'summary' | 'pdafda' | 'freightlaytime' | 'invoices' | 'services' | 'claims' | 'documents' | 'accounting' | 'audit';
type RailPanel = 'summary' | 'activity' | 'docs' | 'reminders' | null;

interface PdaRow { id: string; port: string; agent: string; currency: string; estimated: number; advance: number; fdaFinal: number; status: string; approval: string; }
interface AgentInvoice { id: string; invoiceNo: string; agent: string; vendor: string; date: string; due: string; currency: string; amount: number; approved: number; paid: number; category: string; port: string; dept: string; accounts: string; }
interface AddService { id: string; service: string; vendor: string; invoice: string; currency: string; cost: number; tax: number; reason: string; requestedBy: string; approvedBy: string; status: string; }
interface Claim { id: string; type: string; reference: string; amount: number; currency: string; status: string; owner: string; settlement: number; remarks: string; }
interface DocRow { id: string; name: string; type: string; date: string; }
interface TimelineStep { label: string; date: string; user: string; status: 'done' | 'current' | 'todo'; }

/* ---------------------------------------------------------------- helpers */

function money(n: number): string { return `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`; }
function num(n: number, dp = 0): string { return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }); }

/* --------- mock settlement bundle (linked to the Operations voyage) --------- */

function buildPostfix(v: Voyage) {
  const load = v.portFrom || 'Richards Bay';
  const disch = v.portTo || 'Qingdao';

  const pda: PdaRow[] = [
    { id: 'p1', port: load, agent: 'Sturrock Grindrod', currency: 'USD', estimated: 128_500, advance: 120_000, fdaFinal: 131_240, status: 'FDA Received', approval: 'Approved' },
    { id: 'p2', port: 'Singapore (Bunker)', agent: 'Inchcape', currency: 'USD', estimated: 18_400, advance: 18_400, fdaFinal: 17_950, status: 'FDA Received', approval: 'Approved' },
    { id: 'p3', port: disch, agent: 'Wilhelmsen', currency: 'USD', estimated: 96_200, advance: 90_000, fdaFinal: 0, status: 'PDA Approved', approval: 'Pending' },
  ];

  const invoices: AgentInvoice[] = [
    { id: 'i1', invoiceNo: 'AGT-24118', agent: 'Sturrock Grindrod', vendor: 'Sturrock Grindrod', date: '18 Jun 2026', due: '18 Jul 2026', currency: 'USD', amount: 131_240, approved: 131_240, paid: 120_000, category: 'FDA — Port', port: load, dept: 'Approved', accounts: 'Pending' },
    { id: 'i2', invoiceNo: 'AGT-24119', agent: 'Inchcape', vendor: 'Inchcape', date: '19 Jun 2026', due: '19 Jul 2026', currency: 'USD', amount: 17_950, approved: 17_950, paid: 18_400, category: 'FDA — Bunker Port', port: 'Singapore', dept: 'Approved', accounts: 'Paid' },
    { id: 'i3', invoiceNo: 'SRV-5521', agent: 'Ocean Towage', vendor: 'Ocean Towage', date: '20 Jun 2026', due: '20 Jul 2026', currency: 'USD', amount: 14_800, approved: 0, paid: 0, category: 'Towage', port: disch, dept: 'Pending', accounts: '—' },
    { id: 'i4', invoiceNo: 'SUR-3390', agent: 'Bureau Veritas', vendor: 'Bureau Veritas', date: '21 Jun 2026', due: '21 Jul 2026', currency: 'USD', amount: 6_200, approved: 6_200, paid: 0, category: 'Survey', port: disch, dept: 'Approved', accounts: 'Pending' },
  ];

  const services: AddService[] = [
    { id: 's1', service: 'Launch Boat', vendor: 'Harbour Craft', invoice: 'LB-771', currency: 'USD', cost: 2_400, tax: 0, reason: 'Crew & stores transfer at anchorage', requestedBy: 'Master', approvedBy: 'A. Nair', status: 'Approved' },
    { id: 's2', service: 'Fresh Water', vendor: 'Aqua Marine', invoice: 'FW-210', currency: 'USD', cost: 1_850, tax: 0, reason: '120 MT fresh water supply', requestedBy: 'C/E', approvedBy: 'A. Nair', status: 'Approved' },
    { id: 's3', service: 'Crew Change', vendor: 'Wilhelmsen', invoice: 'CC-455', currency: 'USD', cost: 8_600, tax: 430, reason: '3 officers sign off / on', requestedBy: 'HR', approvedBy: 'Pending', status: 'Pending' },
    { id: 's4', service: 'Sludge Disposal', vendor: 'EcoPort', invoice: 'SL-108', currency: 'USD', cost: 1_200, tax: 0, reason: 'MARPOL sludge landing', requestedBy: 'C/E', approvedBy: 'A. Nair', status: 'Approved' },
    { id: 's5', service: 'Cash To Master', vendor: '—', invoice: 'CTM-090', currency: 'USD', cost: 5_000, tax: 0, reason: 'Ship operating cash', requestedBy: 'Master', approvedBy: 'A. Nair', status: 'Approved' },
  ];

  const claims: Claim[] = [
    { id: 'c1', type: 'Demurrage Claim', reference: 'DEM-2606-01', amount: 96_600, currency: 'USD', status: 'Under Review', owner: 'Charterer', settlement: 0, remarks: 'Discharge port demurrage — awaiting charterer response' },
    { id: 'c2', type: 'Cargo Claim', reference: 'CGO-2606-04', amount: 22_000, currency: 'USD', status: 'Open', owner: 'Receiver', settlement: 0, remarks: 'Short-landing alleged at discharge' },
    { id: 'c3', type: 'Offhire Claim', reference: 'OFF-2606-02', amount: 14_500, currency: 'USD', status: 'Settled', owner: 'Owner', settlement: 12_000, remarks: 'Main engine slowdown 8.5 hrs' },
  ];

  const documents: DocRow[] = [
    { id: 'd1', name: `FDA-${load.slice(0, 3).toUpperCase()}-24118.pdf`, type: 'FDA', date: '18 Jun 2026' },
    { id: 'd2', name: 'SOF-LoadPort.pdf', type: 'SOF', date: '02 Jun 2026' },
    { id: 'd3', name: 'NOR-DischPort.pdf', type: 'NOR', date: '15 Jun 2026' },
    { id: 'd4', name: 'Laytime-Statement.pdf', type: 'Laytime Statement', date: '20 Jun 2026' },
    { id: 'd5', name: 'Freight-Invoice-FR-2606.pdf', type: 'Invoice', date: '05 Jun 2026' },
    { id: 'd6', name: 'Survey-Report-BV3390.pdf', type: 'Claims', date: '21 Jun 2026' },
  ];

  const timeline: TimelineStep[] = [
    { label: 'Fixture Confirmed', date: '18 May 2026', user: 'Chartering', status: 'done' },
    { label: 'Operations Started', date: '28 May 2026', user: 'Operations', status: 'done' },
    { label: 'Loading Complete', date: '02 Jun 2026', user: 'Operations', status: 'done' },
    { label: 'Sailing', date: '03 Jun 2026', user: 'Master', status: 'done' },
    { label: 'Discharge Complete', date: '16 Jun 2026', user: 'Operations', status: 'done' },
    { label: 'FDA Received', date: '18 Jun 2026', user: 'Postfix', status: 'current' },
    { label: 'Laytime Completed', date: '—', user: 'Postfix', status: 'todo' },
    { label: 'Freight Settled', date: '—', user: 'Postfix', status: 'todo' },
    { label: 'Claims Closed', date: '—', user: 'Postfix', status: 'todo' },
    { label: 'Voyage Closed', date: '—', user: 'Postfix', status: 'todo' },
  ];

  const laytime = {
    laycan: '30 May – 04 Jun 2026', norTendered: '15 Jun 2026, 06:00', norAccepted: '15 Jun 2026, 12:00',
    dischCommenced: '15 Jun 2026, 14:00', dischCompleted: '16 Jun 2026, 22:00',
    allowed: 4.5, used: 6.28, weatherDelay: 0.42, shifting: 0.25, excepted: 0.5,
    demRate: 18_500, desRate: 9_250,
  };
  const laySaved = Math.max(0, laytime.allowed - laytime.used);
  const layExcess = Math.max(0, laytime.used - laytime.allowed);
  const demurrage = layExcess * laytime.demRate;
  const despatch = laySaved * laytime.desRate;

  const contractFreight = Math.round((v.price || 620_000));
  const freight = {
    contract: contractFreight, currency: 'USD', basis: 'Lumpsum', advance: Math.round(contractFreight * 0.9),
    addComm: Math.round(contractFreight * 0.0375), brokerage: Math.round(contractFreight * 0.0125), deadfreight: 0, taxes: 0,
  };
  const finalFreight = freight.contract - freight.addComm - freight.brokerage;
  const balanceFreight = finalFreight - freight.advance;

  // financial roll-up
  const pdaTotal = pda.reduce((s, p) => s + p.estimated, 0);
  const fdaTotal = pda.reduce((s, p) => s + (p.fdaFinal || p.estimated), 0);
  const servicesTotal = services.reduce((s, x) => s + x.cost + x.tax, 0);
  const claimsPayable = claims.filter((c) => c.owner === 'Owner').reduce((s, c) => s + (c.settlement || c.amount), 0);
  const claimsReceivable = claims.filter((c) => c.owner !== 'Owner').reduce((s, c) => s + c.amount, 0);
  const receivable = finalFreight + demurrage + claimsReceivable - freight.advance + Math.max(0, balanceFreight);
  const payable = fdaTotal + servicesTotal + despatch + claimsPayable - pda.reduce((s, p) => s + p.advance, 0);
  const net = receivable - payable;
  const completion = Math.round((timeline.filter((s) => s.status === 'done').length / timeline.length) * 100);

  return { pda, invoices, services, claims, documents, timeline, laytime, laySaved, layExcess, demurrage, despatch, freight, finalFreight, balanceFreight, pdaTotal, fdaTotal, servicesTotal, claimsPayable, claimsReceivable, receivable, payable, net, completion, load, disch };
}

type Bundle = ReturnType<typeof buildPostfix>;

/* ------------------------------------------------------------ small atoms */

function Card({ title, icon, right, children }: { title: string; icon: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="fv-ops__card">
      <header className="fv-ops__card-head">
        <span className="fv-ops__card-title"><i className={`fas ${icon}`} aria-hidden="true" /> {title}</span>
        {right && <span className="fv-ops__card-right">{right}</span>}
      </header>
      <div className="fv-ops__card-body">{children}</div>
    </section>
  );
}
function Pill({ text }: { text: string }) {
  const t = text.toLowerCase();
  const tone = /approv|paid|settl|received|done|clos/.test(t) ? 'green' : /pending|review|open|progress/.test(t) ? 'amber' : /reject|overdue|fail/.test(t) ? 'bad' : 'blue';
  return <span className={`fv-ops__pill fv-ops__pill--${tone === 'bad' ? 'amber' : tone}`}>{text}</span>;
}
function RailIcon({ icon, label, active, badge, onClick }: { icon: string; label: string; active: boolean; badge?: number; onClick: () => void }) {
  return (
    <button type="button" className={`fv-ops__rail-icon${active ? ' fv-ops__rail-icon--active' : ''}`} onClick={onClick} title={label}>
      <i className={`fas ${icon}`} aria-hidden="true" />
      {badge != null && badge > 0 && <span className="fv-ops__rail-badge">{badge}</span>}
      <span className="fv-ops__rail-icon-label">{label}</span>
    </button>
  );
}

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'summary', label: 'Voyage Summary', icon: 'fa-clipboard-list' },
  { id: 'pdafda', label: 'PDA & FDA', icon: 'fa-file-circle-check' },
  { id: 'freightlaytime', label: 'Freight & Laytime', icon: 'fa-scale-balanced' },
  { id: 'invoices', label: 'Agent Invoices', icon: 'fa-file-invoice-dollar' },
  { id: 'services', label: 'Additional Services', icon: 'fa-screwdriver-wrench' },
  { id: 'claims', label: 'Claims', icon: 'fa-gavel' },
  { id: 'documents', label: 'Documents', icon: 'fa-folder-open' },
  { id: 'accounting', label: 'Accounting', icon: 'fa-building-columns' },
  { id: 'audit', label: 'Audit', icon: 'fa-clock-rotate-left' },
];

/* ============================================================ main page */

export function PostfixPage() {
  const voyage = useSelectedVoyage();
  const [tab, setTab] = useState<TabId>('summary');
  const [rail, setRail] = useState<RailPanel>('summary');
  const [sent, setSent] = useState<Set<string>>(new Set());

  const b = useMemo<Bundle | null>(() => (voyage ? buildPostfix(voyage) : null), [voyage]);

  if (!voyage || !b) return <NoVesselSelected />;

  const pendingApprovals = b.invoices.filter((i) => i.dept === 'Pending').length + b.services.filter((s) => s.status === 'Pending').length + b.pda.filter((p) => p.approval === 'Pending').length;

  const sendToAccounts = (inv: AgentInvoice) => {
    addPayable({
      reference: voyage.id,
      vessel: voyage.vessel,
      voyage: voyage.id,
      supplier: inv.vendor,
      invoiceNo: inv.invoiceNo,
      amount: inv.approved || inv.amount,
      currency: inv.currency,
      dueDate: inv.due,
      module: 'Postfix',
      category: inv.category.startsWith('FDA') ? 'FDA' : 'Agency',
    });
    setSent((prev) => new Set(prev).add(inv.id));
  };

  return (
    <div className="fv-ops">
      <div className="fv-ops__main">
        {/* header */}
        <div className="fv-ops__topbar fv-pf__topbar">
          <div className="fv-ops__recap-title">
            <i className="fas fa-file-signature" aria-hidden="true" />
            <div>
              <h1>{voyage.vessel} · Voyage Settlement</h1>
              <span className="fv-ops__recap-sub">{voyage.id} · IMO {voyage.imo} · {b.load} → {b.disch} · Charterer: {voyage.client}</span>
            </div>
            <span className="fv-ops__recap-badge">Settlement In Progress</span>
          </div>
        </div>

        {/* tabs */}
        <nav className="fv-ops__tabs" aria-label="Postfix sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`fv-ops__tab${tab === t.id ? ' fv-ops__tab--active' : ''}`} onClick={() => setTab(t.id)}>
              <i className={`fas ${t.icon}`} aria-hidden="true" /> {t.label}
            </button>
          ))}
        </nav>

        <div className="fv-ops__content">
          {tab === 'summary' && (
            <div className="fv-ops__grid2">
              <Card title="Voyage Information" icon="fa-clipboard-list">
                <ul className="fv-ops__kv-list">
                  {kv('Vessel', voyage.vessel)}
                  {kv('IMO', voyage.imo)}
                  {kv('Voyage No', voyage.id)}
                  {kv('Fixture No', voyage.id.replace(/^[A-Z]+/, 'FIX-'))}
                  {kv('Charterer', voyage.client)}
                  {kv('Vessel Type', voyage.vesselType || '—')}
                  {kv('DWT', voyage.dwt ? `${voyage.dwt} MT` : '—')}
                </ul>
              </Card>
              <Card title="Route & Cargo" icon="fa-route">
                <ul className="fv-ops__kv-list">
                  {kv('Load Port', b.load)}
                  {kv('Discharge Port', b.disch)}
                  {kv('Bunker Port', b.pda.find((p) => /bunker/i.test(p.port))?.port ?? '—')}
                  {kv('ETD', voyage.etdDisplay || '—')}
                  {kv('ETA', voyage.eta || '—')}
                  {kv('Service', voyage.service || '—')}
                  {kv('Operational Status', voyage.status || 'Completed')}
                </ul>
              </Card>
              <Card title="Commercial" icon="fa-file-contract">
                <ul className="fv-ops__kv-list">
                  {kv('Contract Freight', money(b.freight.contract))}
                  {kv('Freight Basis', b.freight.basis)}
                  {kv('Final Freight', money(b.finalFreight))}
                  {kv('Demurrage', money(b.demurrage))}
                  {kv('Despatch', money(b.despatch))}
                </ul>
              </Card>
              <Card title="Settlement Status" icon="fa-scale-balanced">
                <ul className="fv-ops__kv-list">
                  {kv('Total Receivable', money(b.receivable))}
                  {kv('Total Payable', money(b.payable))}
                  {kv('FDA Total', money(b.fdaTotal))}
                  {kv('Additional Services', money(b.servicesTotal))}
                  {kv('Open Claims', String(b.claims.filter((c) => c.status !== 'Settled').length))}
                </ul>
                <div className="fv-ops__kv-line fv-ops__kv-line--profit"><span>Net Settlement</span><span className="fv-ops__kv-out">{money(b.net)}</span></div>
              </Card>
            </div>
          )}

          {tab === 'pdafda' && (
            <Card title="Proforma Disbursement Accounts (PDA)" icon="fa-file-invoice" right={<><button type="button" className="fv-ops__btn">Upload PDA</button><button type="button" className="fv-ops__btn">Compare with FDA</button></>}>
              <table className="fv-ops__table">
                <thead><tr><th>Port</th><th>Agent</th><th>Cur.</th><th className="fv-ops__r">Estimated PDA</th><th className="fv-ops__r">Advance Paid</th><th className="fv-ops__r">Outstanding</th><th>Status</th><th>Approval</th><th /></tr></thead>
                <tbody>
                  {b.pda.map((p) => (
                    <tr key={p.id}>
                      <td>{p.port}</td><td>{p.agent}</td><td>{p.currency}</td>
                      <td className="fv-ops__r">{num(p.estimated)}</td>
                      <td className="fv-ops__r">{num(p.advance)}</td>
                      <td className="fv-ops__r">{num(p.estimated - p.advance)}</td>
                      <td><Pill text={p.status} /></td>
                      <td><Pill text={p.approval} /></td>
                      <td>{p.approval === 'Pending' && <><button type="button" className="fv-ops__btn">Approve</button> <button type="button" className="fv-ops__btn">Reject</button></>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="fv-ops__row-sub"><td colSpan={3}>Total</td><td className="fv-ops__r">{num(b.pdaTotal)}</td><td className="fv-ops__r">{num(b.pda.reduce((s, p) => s + p.advance, 0))}</td><td colSpan={3} /></tr></tfoot>
              </table>
            </Card>
          )}

          {tab === 'pdafda' && (
            <Card title="Final Disbursement Accounts (FDA) — Variance vs PDA" icon="fa-file-circle-check">
              <table className="fv-ops__table">
                <thead><tr><th>Port</th><th>Agent</th><th className="fv-ops__r">PDA</th><th className="fv-ops__r">FDA (Actual)</th><th className="fv-ops__r">Advance</th><th className="fv-ops__r">Balance</th><th className="fv-ops__r">Variance</th><th className="fv-ops__r">Var %</th><th>Invoice</th></tr></thead>
                <tbody>
                  {b.pda.map((p) => {
                    const fda = p.fdaFinal || 0;
                    const variance = fda ? fda - p.estimated : 0;
                    const balance = fda - p.advance;
                    return (
                      <tr key={p.id}>
                        <td>{p.port}</td><td>{p.agent}</td>
                        <td className="fv-ops__r">{num(p.estimated)}</td>
                        <td className="fv-ops__r">{fda ? num(fda) : '—'}</td>
                        <td className="fv-ops__r">{num(p.advance)}</td>
                        <td className={`fv-ops__r${balance < 0 ? ' fv-ops__neg' : ''}`}>{fda ? num(balance) : '—'}</td>
                        <td className={`fv-ops__r${variance > 0 ? ' fv-ops__neg' : variance < 0 ? ' fv-ops__pos' : ''}`}>{fda ? (variance >= 0 ? '+' : '') + num(variance) : '—'}</td>
                        <td className="fv-ops__r">{fda ? `${((variance / p.estimated) * 100).toFixed(1)}%` : '—'}</td>
                        <td><Pill text={fda ? 'Received' : 'Awaited'} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="fv-ops__hint">Auto-variance flags FDA lines deviating &gt; 10% from PDA for review; exchange-rate conversion applied to non-USD ports.</p>
            </Card>
          )}

          {tab === 'invoices' && (
            <Card title="Agent & Vendor Invoices" icon="fa-file-invoice-dollar" right={<button type="button" className="fv-ops__btn">Generate Payment Request</button>}>
              <table className="fv-ops__table">
                <thead><tr><th>Invoice</th><th>Vendor</th><th>Category</th><th>Port</th><th>Due</th><th className="fv-ops__r">Amount</th><th className="fv-ops__r">Approved</th><th className="fv-ops__r">Paid</th><th className="fv-ops__r">Outstanding</th><th>Dept</th><th>Accounts</th><th /></tr></thead>
                <tbody>
                  {b.invoices.map((i) => {
                    const acctStatus = sent.has(i.id) ? 'Sent' : i.accounts;
                    return (
                      <tr key={i.id}>
                        <td>{i.invoiceNo}</td><td>{i.vendor}</td><td>{i.category}</td><td>{i.port}</td><td>{i.due}</td>
                        <td className="fv-ops__r">{num(i.amount)}</td>
                        <td className="fv-ops__r">{i.approved ? num(i.approved) : '—'}</td>
                        <td className="fv-ops__r">{num(i.paid)}</td>
                        <td className="fv-ops__r">{num((i.approved || i.amount) - i.paid)}</td>
                        <td><Pill text={i.dept} /></td>
                        <td><Pill text={acctStatus} /></td>
                        <td>
                          {i.dept === 'Pending' && <button type="button" className="fv-ops__btn">Approve</button>}
                          {i.dept === 'Approved' && i.accounts !== 'Paid' && !sent.has(i.id) && <button type="button" className="fv-ops__btn fv-ops__btn--primary" onClick={() => sendToAccounts(i)}>Send to Accounts</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="fv-ops__hint">Duplicate & missing-invoice detection runs on upload; approved invoices can be pushed to the Accounts payable ledger.</p>
            </Card>
          )}

          {tab === 'services' && (
            <Card title="Additional Services & Husbandry" icon="fa-screwdriver-wrench" right={<button type="button" className="fv-ops__btn">Add Service</button>}>
              <table className="fv-ops__table">
                <thead><tr><th>Service</th><th>Vendor</th><th>Invoice</th><th>Reason</th><th className="fv-ops__r">Cost</th><th className="fv-ops__r">Tax</th><th>Requested</th><th>Approved</th><th>Status</th></tr></thead>
                <tbody>
                  {b.services.map((s) => (
                    <tr key={s.id}>
                      <td>{s.service}</td><td>{s.vendor}</td><td>{s.invoice}</td><td>{s.reason}</td>
                      <td className="fv-ops__r">{num(s.cost)}</td><td className="fv-ops__r">{num(s.tax)}</td>
                      <td>{s.requestedBy}</td><td>{s.approvedBy}</td><td><Pill text={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="fv-ops__row-sub"><td colSpan={4}>Total Additional Services</td><td className="fv-ops__r">{num(b.servicesTotal)}</td><td colSpan={4} /></tr></tfoot>
              </table>
            </Card>
          )}

          {tab === 'freightlaytime' && (
            <div className="fv-ops__grid2">
              <Card title="Laytime Calculation" icon="fa-stopwatch" right={<><button type="button" className="fv-ops__btn">Recalculate</button><button type="button" className="fv-ops__btn">Statement</button></>}>
                <ul className="fv-ops__kv-list">
                  {kv('Laycan', b.laytime.laycan)}
                  {kv('NOR Tendered', b.laytime.norTendered)}
                  {kv('NOR Accepted', b.laytime.norAccepted)}
                  {kv('Discharge Commenced', b.laytime.dischCommenced)}
                  {kv('Discharge Completed', b.laytime.dischCompleted)}
                  {kv('Weather / Rain Delay', `${b.laytime.weatherDelay.toFixed(2)} d`)}
                  {kv('Shifting / Excepted', `${(b.laytime.shifting + b.laytime.excepted).toFixed(2)} d`)}
                </ul>
              </Card>
              <Card title="Result" icon="fa-scale-balanced">
                <ul className="fv-ops__kv-list">
                  {kv('Allowed Time', `${b.laytime.allowed.toFixed(2)} d`)}
                  {kv('Time Used', `${b.laytime.used.toFixed(2)} d`)}
                  {kv('Saved Time', `${b.laySaved.toFixed(2)} d`)}
                  {kv('Excess Time', `${b.layExcess.toFixed(2)} d`)}
                  {kv('Demurrage Rate', money(b.laytime.demRate))}
                  {kv('Despatch Rate', money(b.laytime.desRate))}
                </ul>
                <div className={`fv-ops__kv-line fv-ops__kv-line--sub`}><span>Calculated Demurrage</span><span className="fv-ops__kv-out">{money(b.demurrage)}</span></div>
                <div className={`fv-ops__kv-line fv-ops__kv-line--sub`}><span>Calculated Despatch</span><span className="fv-ops__kv-out">{money(b.despatch)}</span></div>
                <div className="fv-pf__laybar">
                  <div className="fv-pf__laybar-used" style={{ width: `${Math.min(100, (b.laytime.used / (b.laytime.allowed + b.layExcess)) * 100)}%` }} />
                  <span className="fv-pf__laybar-mark" style={{ left: `${(b.laytime.allowed / (b.laytime.allowed + b.layExcess)) * 100}%` }} title="Allowed" />
                </div>
                <p className="fv-ops__hint">Auto-generated from SOF. Excess over allowed laytime accrues demurrage; time saved accrues despatch (½ demurrage).</p>
              </Card>
            </div>
          )}

          {tab === 'freightlaytime' && (
            <div className="fv-ops__grid2">
              <Card title="Freight Settlement" icon="fa-sack-dollar">
                <ul className="fv-ops__kv-list">
                  {kv('Contract Freight', money(b.freight.contract))}
                  {kv('Basis', b.freight.basis)}
                  {kv('Advance Freight (90%)', money(b.freight.advance))}
                  {kv('Address Commission', `- ${money(b.freight.addComm)}`)}
                  {kv('Brokerage', `- ${money(b.freight.brokerage)}`)}
                  {kv('Deadfreight', money(b.freight.deadfreight))}
                  {kv('Taxes', money(b.freight.taxes))}
                </ul>
                <div className="fv-ops__kv-line fv-ops__kv-line--sub"><span>Final Freight</span><span className="fv-ops__kv-out">{money(b.finalFreight)}</span></div>
                <div className="fv-ops__kv-line fv-ops__kv-line--profit"><span>Balance Freight Due</span><span className="fv-ops__kv-out">{money(b.balanceFreight)}</span></div>
              </Card>
              <Card title="Collection" icon="fa-hand-holding-dollar">
                <ul className="fv-ops__kv-list">
                  {kv('Invoice No', 'FR-2606')}
                  {kv('Invoice Date', '05 Jun 2026')}
                  {kv('Payment Due', '05 Jul 2026')}
                  {kv('Amount Received', money(b.freight.advance))}
                  {kv('Outstanding', money(b.balanceFreight))}
                </ul>
                <div className="fv-ops__kv-line fv-ops__kv-line--sub"><span>Collection Status</span><span className="fv-ops__kv-out"><Pill text="Partially Collected" /></span></div>
              </Card>
            </div>
          )}

          {tab === 'claims' && (
            <Card title="Claims Management" icon="fa-gavel" right={<button type="button" className="fv-ops__btn">New Claim</button>}>
              <table className="fv-ops__table">
                <thead><tr><th>Type</th><th>Reference</th><th>Owner</th><th className="fv-ops__r">Claim Amount</th><th className="fv-ops__r">Settlement</th><th>Status</th><th>Remarks</th></tr></thead>
                <tbody>
                  {b.claims.map((c) => (
                    <tr key={c.id}>
                      <td>{c.type}</td><td>{c.reference}</td><td>{c.owner}</td>
                      <td className="fv-ops__r">{num(c.amount)}</td>
                      <td className="fv-ops__r">{c.settlement ? num(c.settlement) : '—'}</td>
                      <td><Pill text={c.status} /></td>
                      <td className="fv-pf__remark">{c.remarks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {tab === 'documents' && (
            <Card title="Document Repository" icon="fa-folder-open" right={<span className="fv-pf__ocr"><i className="fas fa-magnifying-glass" /> <input placeholder="OCR search documents…" /></span>}>
              <ul className="fv-pf__docs">
                {b.documents.map((d) => (
                  <li key={d.id}><i className="fas fa-file-lines" /> <span className="fv-pf__doc-name">{d.name}</span><span className="fv-pf__doc-meta">{d.type} · {d.date}</span><button type="button" className="fv-ops__icon-btn" title="Open"><i className="fas fa-up-right-from-square" /></button></li>
                ))}
              </ul>
            </Card>
          )}

          {tab === 'accounting' && (
            <div className="fv-ops__grid2">
              <Card title="Financial Summary" icon="fa-building-columns">
                <ul className="fv-ops__kv-list">
                  {kv('Total Receivable', money(b.receivable))}
                  {kv('Total Payable', money(b.payable))}
                  {kv('FDA Total', money(b.fdaTotal))}
                  {kv('Additional Services', money(b.servicesTotal))}
                  {kv('Demurrage / Despatch', `${money(b.demurrage)} / ${money(b.despatch)}`)}
                </ul>
                <div className="fv-ops__kv-line fv-ops__kv-line--profit"><span>Net Settlement</span><span className="fv-ops__kv-out">{money(b.net)}</span></div>
              </Card>
              <Card title="Payment Requests → Accounts" icon="fa-money-check-dollar">
                <table className="fv-ops__table">
                  <thead><tr><th>Invoice</th><th>Vendor</th><th className="fv-ops__r">Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    {b.invoices.filter((i) => i.dept === 'Approved').map((i) => (
                      <tr key={i.id}>
                        <td>{i.invoiceNo}</td><td>{i.vendor}</td>
                        <td className="fv-ops__r">{num(i.approved || i.amount)}</td>
                        <td>{sent.has(i.id) ? <Pill text="Sent to Accounts" /> : i.accounts === 'Paid' ? <Pill text="Paid" /> : <button type="button" className="fv-ops__btn fv-ops__btn--primary" onClick={() => sendToAccounts(i)}>Send</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="fv-ops__hint">Sent requests appear in the Accounts module payables; payment status flows back here automatically.</p>
              </Card>
            </div>
          )}

          {tab === 'audit' && (
            <Card title="Audit Trail — Immutable" icon="fa-clock-rotate-left">
              <ul className="fv-pf__audit">
                {[
                  { u: 'A. Nair', a: 'FDA-24118 approved (PDA 128,500 → FDA 131,240)', at: '18 Jun 2026, 10:12' },
                  { u: 'System', a: 'Variance flagged: Load port +2.1% vs PDA', at: '18 Jun 2026, 10:12' },
                  { u: 'R. Khan', a: 'Laytime statement generated from SOF', at: '20 Jun 2026, 09:40' },
                  { u: 'Postfix', a: 'Demurrage claim DEM-2606-01 raised (96,600)', at: '20 Jun 2026, 11:05' },
                  { u: 'A. Nair', a: 'Survey invoice SUR-3390 approved', at: '21 Jun 2026, 14:22' },
                ].map((e, i) => (
                  <li key={i}><span className="fv-pf__audit-dot" /><div><span>{e.a}</span><small>{e.u} · {e.at}</small></div></li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {/* right icon rail */}
      <aside className="fv-ops__rail">
        {rail && (
          <div className="fv-ops__rail-panel">
            <div className="fv-ops__rail-panel-head">
              <span>{rail === 'summary' ? 'Live Financial Summary' : rail === 'activity' ? 'Activity & Notes' : rail === 'docs' ? 'Documents' : 'Reminders'}</span>
              <button type="button" className="fv-ops__icon-btn" onClick={() => setRail(null)} title="Close"><i className="fas fa-xmark" /></button>
            </div>
            <div className="fv-ops__rail-panel-body">
              {rail === 'summary' && (
                <ul className="fv-ops__kv-list">
                  {kv('PDA', money(b.pdaTotal))}
                  {kv('FDA', money(b.fdaTotal))}
                  {kv('Additional', money(b.servicesTotal))}
                  {kv('Demurrage', money(b.demurrage))}
                  {kv('Despatch', money(b.despatch))}
                  {kv('Freight', money(b.finalFreight))}
                  {kv('Net Receivable', money(Math.max(0, b.net)))}
                  {kv('Net Payable', money(Math.max(0, -b.net)))}
                  {kv('Completion', `${b.completion}%`)}
                  {kv('Pending Approvals', String(pendingApprovals))}
                </ul>
              )}
              {rail === 'activity' && (
                <ul className="fv-pf__feed">
                  <li><i className="fas fa-circle-check" /> FDA received for {b.load}</li>
                  <li><i className="fas fa-triangle-exclamation" /> Demurrage claim open — {money(b.demurrage)}</li>
                  <li><i className="fas fa-comment" /> Note: awaiting discharge FDA from Wilhelmsen</li>
                  <li><i className="fas fa-envelope" /> Email sent to charterer re: laytime</li>
                </ul>
              )}
              {rail === 'docs' && (
                <ul className="fv-pf__docs">
                  {b.documents.map((d) => (<li key={d.id}><i className="fas fa-file-lines" /> <span className="fv-pf__doc-name">{d.name}</span><span className="fv-pf__doc-meta">{d.type}</span></li>))}
                </ul>
              )}
              {rail === 'reminders' && (
                <ul className="fv-pf__feed">
                  <li><i className="fas fa-clock" /> Freight balance due 05 Jul 2026</li>
                  <li><i className="fas fa-clock" /> Agent invoice AGT-24118 due 18 Jul 2026</li>
                  <li><i className="fas fa-clock" /> Discharge FDA follow-up in 3 days</li>
                </ul>
              )}
            </div>
          </div>
        )}
        <div className="fv-ops__rail-icons">
          <RailIcon icon="fa-chart-pie" label="Summary" active={rail === 'summary'} onClick={() => setRail(rail === 'summary' ? null : 'summary')} />
          <RailIcon icon="fa-list-check" label="Activity" active={rail === 'activity'} badge={pendingApprovals} onClick={() => setRail(rail === 'activity' ? null : 'activity')} />
          <RailIcon icon="fa-folder-open" label="Docs" active={rail === 'docs'} badge={b.documents.length} onClick={() => setRail(rail === 'docs' ? null : 'docs')} />
          <RailIcon icon="fa-bell" label="Reminders" active={rail === 'reminders'} onClick={() => setRail(rail === 'reminders' ? null : 'reminders')} />
        </div>
      </aside>
    </div>
  );
}

/* key/value line reused from the ops kv-list pattern */
function kv(label: string, value: ReactNode) {
  return (
    <li className="fv-ops__kv-line">
      <span>{label}</span>
      <span className="fv-ops__kv-out">{value}</span>
    </li>
  );
}
