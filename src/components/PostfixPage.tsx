import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useSelectedVoyage } from '../data/selectedVoyage';
import { useCpdds } from '../data/workflow';
import { WorkflowStatusSelect } from './WorkflowStatusSelect';
import type { Voyage } from '../data/voyages';
import { makeBlankVoyage } from '../data/voyages';
import { NoVesselSelected } from './NoVesselSelected';
import { loadOpsRecap, writeOpsRecapRaw, subscribeOpsRecap } from '../data/opsRecap';
import { seedRecap, VoyageDetailsTab, HireTab, FreightTab, computePnl, type Recap, type Pnl } from './OperationsPage';

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

type TabId = 'details' | 'hire' | 'freightlaytime' | 'pdaservices' | 'history';
type RailPanel = 'activity' | 'docs' | 'reminders' | null;

interface PdaRow { id: string; port: string; agent: string; currency: string; estimated: number; advance: number; fdaFinal: number; status: string; approval: string; }
interface AgentInvoice { id: string; invoiceNo: string; agent: string; vendor: string; date: string; due: string; currency: string; amount: number; approved: number; paid: number; category: string; port: string; dept: string; accounts: string; }
interface AddService { id: string; service: string; vendor: string; invoice: string; currency: string; cost: number; tax: number; reason: string; requestedBy: string; approvedBy: string; status: string; }
interface Claim { id: string; type: string; reference: string; amount: number; currency: string; status: string; owner: string; settlement: number; remarks: string; }
interface DocRow { id: string; name: string; type: string; date: string; }
interface TimelineStep { label: string; date: string; user: string; status: 'done' | 'current' | 'todo'; }

/* ---------------------------------------------------------------- helpers */

function money(n: number): string { return `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`; }

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
  { id: 'details', label: 'Voyage Details', icon: 'fa-clipboard-list' },
  { id: 'hire', label: 'Hire & Claims', icon: 'fa-money-bill-wave' },
  { id: 'freightlaytime', label: 'Freight & Laytime', icon: 'fa-file-invoice-dollar' },
  { id: 'pdaservices', label: 'PDA/FDA & Services', icon: 'fa-file-circle-check' },
  { id: 'history', label: 'Configuration History', icon: 'fa-clock-rotate-left' },
];

/* ============================================================ main page */

export function PostfixPage({ mode }: { mode?: 'create' } = {}) {
  const [searchParams] = useSearchParams();
  const selectedVoyage = useSelectedVoyage();
  const createMode = mode === 'create' || searchParams.get('new') === '1';
  const blankVoyage = useMemo(() => makeBlankVoyage(), []);
  const voyage = createMode ? blankVoyage : selectedVoyage;
  const cpdds = useCpdds();
  const [tab, setTab] = useState<TabId>('details');
  const [rail, setRail] = useState<RailPanel>(null);

  // Live recap state shared with Operations (same localStorage key).
  const [recap, setRecap] = useState<Recap>(() => {
    const stored = loadOpsRecap(voyage?.id) as Partial<Recap> | undefined;
    return { ...seedRecap(voyage ?? undefined), ...stored };
  });

  // Re-hydrate when the voyage selection changes.
  useEffect(() => {
    const stored = loadOpsRecap(voyage?.id) as Partial<Recap> | undefined;
    setRecap({ ...seedRecap(voyage ?? undefined), ...stored });
  }, [voyage?.id]);

  // Persist edits to the shared Operations recap store.
  useEffect(() => {
    writeOpsRecapRaw(voyage?.id, JSON.stringify(recap));
  }, [recap, voyage?.id]);

  // Subscribe to changes made in Operations so this tab stays in sync.
  useEffect(() => {
    return subscribeOpsRecap(voyage?.id, () => {
      const stored = loadOpsRecap(voyage?.id) as Partial<Recap> | undefined;
      if (stored) setRecap((prev) => ({ ...prev, ...stored }));
    });
  }, [voyage?.id]);

  const b = useMemo<Bundle | null>(() => (voyage ? buildPostfix(voyage) : null), [voyage]);
  const pnl = useMemo<Pnl>(() => computePnl(recap), [recap]);

  if (!voyage || !b) return <NoVesselSelected />;

  return (
    <div className="fv-ops">
      <div className="fv-ops__main">
        {/* header */}
        <div className="fv-ops__topbar fv-pf__topbar">
          <div className="fv-ops__recap-title">
            <i className="fas fa-file-signature" aria-hidden="true" />
            <div>
              <h1>{voyage.vessel} · Voyage Settlement</h1>
              <span className="fv-ops__recap-sub">{voyage.id} · IMO {voyage.imo} · {b.load} → {b.disch} · {voyage.client}{cpdds[voyage.id] ? ` / CPDD ${cpdds[voyage.id]}` : ''}</span>
            </div>
            <span className="fv-ops__recap-badge">Settlement In Progress</span>
            <div className="fv-pf__topbar-status">
              <WorkflowStatusSelect module="Postfix" voyageId={voyage.id} />
            </div>
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
          {tab === 'details' && (
            <VoyageDetailsTab recap={recap} setRecap={setRecap} voyage={voyage} status="Completed" />
          )}

          {tab === 'hire' && (
            <HireTab recap={recap} setRecap={setRecap} pnl={pnl} voyage={voyage} />
          )}

          {tab === 'freightlaytime' && (
            <FreightTab recap={recap} setRecap={setRecap} voyage={voyage} section="freight" />
          )}

          {tab === 'pdaservices' && (
            <FreightTab recap={recap} setRecap={setRecap} voyage={voyage} section="pda-services" />
          )}

          {tab === 'history' && (
            <Card title="Configuration History" icon="fa-clock-rotate-left">
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
              <span>{rail === 'activity' ? 'Activity & Notes' : rail === 'docs' ? 'Documents' : 'Reminders'}</span>
              <button type="button" className="fv-ops__icon-btn" onClick={() => setRail(null)} title="Close"><i className="fas fa-xmark" /></button>
            </div>
            <div className="fv-ops__rail-panel-body">
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
          <RailIcon icon="fa-list-check" label="Activity" active={rail === 'activity'} badge={b.invoices.filter(i=>i.dept==='Pending').length} onClick={() => setRail(rail === 'activity' ? null : 'activity')} />
          <RailIcon icon="fa-folder-open" label="Docs" active={rail === 'docs'} badge={b.documents.length} onClick={() => setRail(rail === 'docs' ? null : 'docs')} />
          <RailIcon icon="fa-bell" label="Reminders" active={rail === 'reminders'} onClick={() => setRail(rail === 'reminders' ? null : 'reminders')} />
        </div>
      </aside>
    </div>
  );
}

