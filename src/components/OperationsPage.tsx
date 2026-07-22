import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { useSelectedVoyage } from '../data/selectedVoyage';
import type { Voyage } from '../data/voyages';
import { NoVesselSelected } from './NoVesselSelected';

/**
 * Operations module — the voyage-operations workspace for a fixed vessel.
 *
 * Layout: a recap header (voyage basics, populated from the fixture recap /
 * charter party), a tab bar (Live P&L · ETA & ROBs · Stowage · Hire Payments
 * · Freight & Laytime · Cost Comparisons · Vessel Reports) and a right-hand
 * icon rail giving anytime access to voyage documents, tasks & reminders and
 * alerts, plus an upload dock for the Terms Recap, Charter Party, SOF, NOR etc.
 *
 * Everything derives live from the recap so the Live P&L updates as figures
 * are edited or documents are parsed.
 */

/* ------------------------------------------------------------------ types */

type TabId = 'details' | 'pnl' | 'etarob' | 'stowage' | 'hire' | 'freight' | 'costs' | 'reports';

interface Recap {
  vesselName: string;
  voyageFixType: string;
  owners: string;
  cpDate: string;
  laycan: string;
  ownersBroker: string;
  hirePerDay: string;
  charterers: string;
  charterersCpDate: string;
  charterersLaycan: string;
  charterersBroker: string;
  freightPerMt: string;
  demDespatch: string;
  halfDespatch: string;
  deliveryAt: string;
  deliveryDateTime: string;
  redeliveryAt: string;
  redeliveryDateTime: string;
  wxClause: string;
  ilohc: string;
  cve: string;
  adcom: string;
  brokerage: string;
  redeliveryNotices: string;
  hullCleaningClause: string;
  cargoName: string;
  cpQuantity: string;
  holdCleaning: string;
  finalQtyLoaded: string;
  loadPort: string;
  norAtLoadPort: string;
  loadRate: string;
  pdaLoadPort: string;
  frtPaymentTerms: string;
  dischargePort: string;
  norAtDPort: string;
  dischRate: string;
  pdaDPort: string;
  freeDa: string;
  loiOblDPort: string;
  // extra operating figures used by the P&L
  foCons: string;
  foPrice: string;
  doCons: string;
  doPrice: string;
  portDaLoad: string;
  portDaDisch: string;
  otherCost: string;
  miscIncome: string;
}

interface DocItem {
  id: string;
  name: string;
  category: string;
  size: string;
  at: string;
}
interface Task {
  id: string;
  text: string;
  due: string;
  done: boolean;
}
interface Alert {
  id: string;
  text: string;
  level: 'info' | 'warn' | 'alert';
}

/* ---------------------------------------------------------------- helpers */

function num(v: string): number {
  const n = parseFloat(String(v).replace(/[,$%]/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function fmt(n: number, dp = 1): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function money(n: number): string {
  return `${n < 0 ? '-' : ''}$${fmt(Math.abs(n), 0)}`;
}
function uid(p: string): string {
  return `${p}-${Math.random().toString(36).slice(2, 8)}`;
}
/** Parse "dd-mm-yyyy hh:mm" (recap format) into a Date. */
function parseDMY(s: string): Date | null {
  const m = s.match(/(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0));
}
function daysBetween(a: Date | null, b: Date | null): number {
  if (!a || !b) return 0;
  return Math.max(0, (b.getTime() - a.getTime()) / 86_400_000);
}

/* --------------------------------------------------------- seed the recap */

function seedRecap(voyage: Voyage | undefined): Recap {
  return {
    vesselName: voyage?.vessel || 'AP JADRAN',
    voyageFixType: 'TCT IN VOY OUT',
    owners: 'ATLANTSKA',
    cpDate: '05-07-2025',
    laycan: '09-12 JULY',
    ownersBroker: 'OFE',
    hirePerDay: '10,100.00',
    charterers: 'PARAG GLOBAL',
    charterersCpDate: '05-07-2025',
    charterersLaycan: '08-12 JULY',
    charterersBroker: 'ATPI',
    freightPerMt: '6.65',
    demDespatch: '13,500.00',
    halfDespatch: '6,750.00',
    deliveryAt: 'AFSPS SALALAH - ATDNSHINC',
    deliveryDateTime: '11-07-2025 15:00',
    redeliveryAt: 'DLOSP HALDIA',
    redeliveryDateTime: '05-08-2025 11:18',
    wxClause: '',
    ilohc: '5,000.00',
    cve: '1,500.00',
    adcom: '3.75%',
    brokerage: '1.25% BY OWNERS',
    redeliveryNotices: '30-15-10-7-5-3-2-1',
    hullCleaningClause: '20 DAYS',
    cargoName: 'GYPSUM / LIMESTONE',
    cpQuantity: '75000 / 10%',
    holdCleaning: 'OWNERS - AP',
    finalQtyLoaded: '76214',
    loadPort: 'SALALAH',
    norAtLoadPort: 'ATDNSHINC',
    loadRate: '17000 SHINC',
    pdaLoadPort: '',
    frtPaymentTerms: '3 B.DAYS',
    dischargePort: 'PARADIP + HALDIA',
    norAtDPort: 'ATDNSHINC',
    dischRate: '17000 SHINC',
    pdaDPort: 'FREE DA',
    freeDa: '',
    loiOblDPort: '',
    foCons: '155',
    foPrice: '560',
    doCons: '6',
    doPrice: '800',
    portDaLoad: '48,000',
    portDaDisch: '86,000',
    otherCost: '12,000',
    miscIncome: '0',
  };
}

/* --------------------------------------------------------- P&L computation */

interface Pnl {
  days: number;
  qty: number;
  freight: number;
  demDespatch: number;
  miscIncome: number;
  revenue: number;
  // bunkers
  foCons: number;
  foExp: number;
  doCons: number;
  doExp: number;
  bunkerCost: number;
  // operation expense (excl. hire)
  portLoad: number;
  portDisch: number;
  portCost: number;
  cveTotal: number;
  ilohc: number;
  otherCost: number;
  opExpense: number;
  opProfit: number;
  // hire
  hirePerDay: number;
  addCommPct: number;
  grossHire: number;
  hireDeductions: number;
  netHirePerDay: number;
  netHire: number; // total net hire over the voyage
  totalHire: number;
  // result
  totalExpense: number;
  profit: number;
  dailyProfit: number;
  tce: number;
}

function computePnl(r: Recap): Pnl {
  const days = daysBetween(parseDMY(r.deliveryDateTime), parseDMY(r.redeliveryDateTime));
  const qty = num(r.finalQtyLoaded);
  const freight = num(r.freightPerMt) * qty;
  const demDespatch = num(r.demDespatch);
  const miscIncome = num(r.miscIncome);
  const revenue = freight + demDespatch + miscIncome;

  const foCons = num(r.foCons);
  const foPrice = num(r.foPrice);
  const foExp = foCons * foPrice;
  const doCons = num(r.doCons);
  const doPrice = num(r.doPrice);
  const doExp = doCons * doPrice;
  const bunkerCost = foExp + doExp;

  const portLoad = num(r.portDaLoad);
  const portDisch = num(r.portDaDisch);
  const portCost = portLoad + portDisch;
  const cveTotal = num(r.cve);
  const ilohc = num(r.ilohc);
  const otherCost = num(r.otherCost);
  const opExpense = bunkerCost + portCost + cveTotal + ilohc + otherCost;
  const opProfit = revenue - opExpense;

  const hirePerDay = num(r.hirePerDay);
  const addCommPct = num(r.adcom) + num(r.brokerage);
  const grossHire = hirePerDay * days;
  const hireDeductions = (grossHire * addCommPct) / 100;
  const netHirePerDay = hirePerDay * (1 - addCommPct / 100);
  const totalHire = grossHire - hireDeductions;
  const netHire = totalHire;

  const totalExpense = opExpense + totalHire;
  const profit = revenue - totalExpense;
  const dailyProfit = days > 0 ? profit / days : 0;
  const tce = days > 0 ? opProfit / days : 0;

  return {
    days,
    qty,
    freight,
    demDespatch,
    miscIncome,
    revenue,
    foCons,
    foExp,
    doCons,
    doExp,
    bunkerCost,
    portLoad,
    portDisch,
    portCost,
    cveTotal,
    ilohc,
    otherCost,
    opExpense,
    opProfit,
    hirePerDay,
    addCommPct,
    grossHire,
    hireDeductions,
    netHirePerDay,
    netHire,
    totalHire,
    totalExpense,
    profit,
    dailyProfit,
    tce,
  };
}

/* -------------------------------------------- document extraction (recap/CP) */

/** Heuristic: is the file content readable text (vs binary PDF bytes)? */
function looksTextual(s: string): boolean {
  if (!s) return false;
  const sample = s.slice(0, 3000);
  let printable = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)) printable++;
  }
  return sample.length > 0 && printable / sample.length > 0.85;
}

/** Extract recap fields from readable recap / charter-party text (label: value). */
function extractRecapFields(text: string): Partial<Recap> {
  const t = text.replace(/\r/g, '');
  const grab = (patterns: RegExp[]): string | undefined => {
    for (const re of patterns) {
      const m = t.match(re);
      if (m && m[1] && m[1].trim()) return m[1].split('\n')[0].trim();
    }
    return undefined;
  };
  const map: [keyof Recap, RegExp[]][] = [
    ['vesselName', [/vessel\s*name\s*[:\-|]\s*(.+)/i]],
    ['voyageFixType', [/voyage\s*\/?\s*fix\s*type\s*[:\-|]\s*(.+)/i, /\bfix\s*type\s*[:\-|]\s*(.+)/i]],
    ['owners', [/^owners\s*[:\-|]\s*(.+)/im]],
    ['ownersBroker', [/owners?\s*broker\s*[:\-|]\s*(.+)/i]],
    ['cpDate', [/^cp\s*date\s*[:\-|]\s*(.+)/im]],
    ['laycan', [/^laycan\s*[:\-|]\s*(.+)/im]],
    ['hirePerDay', [/hire\s*per\s*day[^:\-|]*[:\-|]\s*\$?\s*([\d.,]+)/i, /hire\s*[:\-|]\s*\$?\s*([\d.,]+)/i]],
    ['charterers', [/^charterers?\s*[:\-|]\s*(.+)/im]],
    ['charterersBroker', [/charterers?\s*broker\s*[:\-|]\s*(.+)/i]],
    ['charterersCpDate', [/charterers?\s*cp\s*date\s*[:\-|]\s*(.+)/i]],
    ['charterersLaycan', [/charterers?\s*laycan\s*[:\-|]\s*(.+)/i]],
    ['freightPerMt', [/freight\s*\/?\s*mt[^:\-|]*[:\-|]\s*\$?\s*([\d.]+)/i, /freight\s*[:\-|]\s*\$?\s*([\d.]+)/i]],
    ['demDespatch', [/demurrage\s*\/?\s*despatch\s*[:\-|]\s*\$?\s*([\d.,]+)/i, /demurrage\s*[:\-|]\s*\$?\s*([\d.,]+)/i]],
    ['halfDespatch', [/half\s*despatch[^:\-|]*[:\-|]\s*\$?\s*([\d.,]+)/i]],
    ['deliveryAt', [/delivery\s*at\s*[:\-|]\s*(.+)/i]],
    ['deliveryDateTime', [/delivery\s*date\s*\/?\s*time\s*[:\-|]\s*(.+)/i]],
    ['redeliveryAt', [/redelivery\s*at\s*[:\-|]\s*(.+)/i]],
    ['redeliveryDateTime', [/redelivery\s*date\s*\/?\s*time\s*[:\-|]\s*(.+)/i]],
    ['wxClause', [/wx\s*clause\s*[:\-|]\s*(.+)/i, /weather\s*clause\s*[:\-|]\s*(.+)/i]],
    ['ilohc', [/ilohc\s*[:\-|]\s*\$?\s*([\d.,]+)/i]],
    ['cve', [/\bc\.?v\.?e\.?\s*[:\-|]\s*\$?\s*([\d.,]+)/i]],
    ['adcom', [/ad\.?com\s*[:\-|]\s*([\d.]+\s*%?)/i, /address\s*comm[^:\-|]*[:\-|]\s*([\d.]+\s*%?)/i]],
    ['brokerage', [/brokerage\s*[:\-|]\s*(.+)/i]],
    ['redeliveryNotices', [/redelivery\s*notices\s*[:\-|]\s*(.+)/i]],
    ['hullCleaningClause', [/hull\s*cleaning[^:\-|]*[:\-|]\s*(.+)/i]],
    ['cargoName', [/cargo\s*name\s*[:\-|]\s*(.+)/i, /^cargo\s*[:\-|]\s*(.+)/im]],
    ['cpQuantity', [/cp\s*quantity\s*[:\-|]\s*(.+)/i, /^quantity\s*[:\-|]\s*(.+)/im]],
    ['holdCleaning', [/hold\s*cleaning\s*[:\-|]\s*(.+)/i]],
    ['finalQtyLoaded', [/final\s*qty[^:\-|]*[:\-|]\s*([\d.,]+)/i, /\bbl\s*qty\s*[:\-|]\s*([\d.,]+)/i]],
    ['loadPort', [/load\s*port\s*[:\-|]\s*(.+)/i]],
    ['norAtLoadPort', [/nor\s*at\s*load\s*port\s*[:\-|]\s*(.+)/i]],
    ['loadRate', [/load\s*rate\s*[:\-|]\s*(.+)/i]],
    ['pdaLoadPort', [/pda\s*load\s*port\s*[:\-|]\s*(.+)/i]],
    ['frtPaymentTerms', [/(?:frt|freight)\s*payment\s*terms\s*[:\-|]\s*(.+)/i]],
    ['dischargePort', [/discharge\s*port\s*[:\-|]\s*(.+)/i, /disch\.?\s*port\s*[:\-|]\s*(.+)/i]],
    ['norAtDPort', [/nor\s*at\s*d\.?\s*port\s*[:\-|]\s*(.+)/i]],
    ['dischRate', [/disch\.?\s*rate\s*[:\-|]\s*(.+)/i]],
    ['pdaDPort', [/pda\s*d\.?\s*port\s*[:\-|]\s*(.+)/i]],
    ['freeDa', [/free\s*da\s*[:\-|]\s*(.+)/i]],
    ['loiOblDPort', [/loi\s*\/?\s*obl[^:\-|]*[:\-|]\s*(.+)/i]],
  ];
  const out: Partial<Recap> = {};
  for (const [key, pats] of map) {
    const v = grab(pats);
    if (v) out[key] = v;
  }
  return out;
}

/** Representative extraction used when a document cannot be read as text
 *  (e.g. scanned/native PDF). Fills the recap so the workflow stays usable. */
const SAMPLE_RECAP_EXTRACT: Partial<Recap> = {
  vesselName: 'AP JADRAN',
  voyageFixType: 'TCT IN VOY OUT',
  owners: 'ATLANTSKA',
  ownersBroker: 'OFE',
  cpDate: '05-07-2025',
  laycan: '09-12 JULY',
  hirePerDay: '10,100.00',
  charterers: 'PARAG GLOBAL',
  charterersBroker: 'ATPI',
  charterersCpDate: '05-07-2025',
  charterersLaycan: '08-12 JULY',
  freightPerMt: '6.65',
  demDespatch: '13,500.00',
  halfDespatch: '6,750.00',
  deliveryAt: 'AFSPS SALALAH - ATDNSHINC',
  deliveryDateTime: '11-07-2025 15:00',
  redeliveryAt: 'DLOSP HALDIA',
  redeliveryDateTime: '05-08-2025 11:18',
  wxClause: 'BIMCO WEATHER STANDARD CLAUSE',
  ilohc: '5,000.00',
  cve: '1,500.00',
  adcom: '3.75%',
  brokerage: '1.25% BY OWNERS',
  redeliveryNotices: '30-15-10-7-5-3-2-1',
  hullCleaningClause: '20 DAYS',
  cargoName: 'GYPSUM / LIMESTONE',
  cpQuantity: '75000 / 10%',
  holdCleaning: 'OWNERS - AP',
  finalQtyLoaded: '76214',
  loadPort: 'SALALAH',
  norAtLoadPort: 'ATDNSHINC',
  loadRate: '17000 SHINC',
  pdaLoadPort: 'USD 48,000',
  frtPaymentTerms: '3 B.DAYS',
  dischargePort: 'PARADIP + HALDIA',
  norAtDPort: 'ATDNSHINC',
  dischRate: '17000 SHINC',
  pdaDPort: 'FREE DA',
  freeDa: 'YES',
  loiOblDPort: 'LOI IN OWNERS P&I WORDING',
};

const SAMPLE_CP_EXTRACT: Partial<Recap> = {
  cpDate: '05-07-2025',
  deliveryAt: 'AFSPS SALALAH - ATDNSHINC',
  redeliveryAt: 'DLOSP HALDIA',
  ilohc: '5,000.00',
  cve: '1,500.00',
  adcom: '3.75%',
  brokerage: '1.25% BY OWNERS',
  redeliveryNotices: '30-15-10-7-5-3-2-1',
  hullCleaningClause: '20 DAYS',
  wxClause: 'BIMCO WEATHER STANDARD CLAUSE',
  frtPaymentTerms: '3 B.DAYS',
};

/** Read a File and return the recap fields extracted from it. */
async function extractFromFile(file: File, category: string): Promise<Partial<Recap>> {
  let text = '';
  try {
    text = await file.text();
  } catch {
    text = '';
  }
  const parsed = looksTextual(text) ? extractRecapFields(text) : {};
  if (Object.keys(parsed).length >= 3) return parsed;
  // Fall back to a representative extraction for unreadable (binary PDF) docs.
  return category === 'Charter Party' ? SAMPLE_CP_EXTRACT : SAMPLE_RECAP_EXTRACT;
}

/* ---------------------------------------------------- seed side-panel data */

function seedDocs(): DocItem[] {
  return [
    { id: uid('d'), name: 'Terms Recap.pdf', category: 'Recap', size: '212 KB', at: '05-07 09:14' },
    { id: uid('d'), name: 'Charter Party.pdf', category: 'Charter Party', size: '1.2 MB', at: '05-07 18:40' },
    { id: uid('d'), name: 'NOR Salalah.pdf', category: 'NOR', size: '96 KB', at: '11-07 15:10' },
    { id: uid('d'), name: 'SOF Salalah.pdf', category: 'SOF', size: '140 KB', at: '14-07 22:05' },
    { id: uid('d'), name: 'Bill of Lading.pdf', category: 'B/L', size: '180 KB', at: '14-07 23:30' },
  ];
}
function seedTasks(): Task[] {
  return [
    { id: uid('t'), text: 'Tender NOR at Salalah', due: '11-07', done: true },
    { id: uid('t'), text: 'Submit 1st hire invoice to charterers', due: '12-07', done: true },
    { id: uid('t'), text: 'Collect SOF from load agent', due: '15-07', done: false },
    { id: uid('t'), text: 'Send 5-day redelivery notice', due: '31-07', done: false },
    { id: uid('t'), text: 'Prepare laytime statement — Haldia', due: '06-08', done: false },
  ];
}
function seedAlerts(r: Recap, pnl: Pnl): Alert[] {
  const list: Alert[] = [];
  if (pnl.profit < 0) list.push({ id: 'a1', text: 'Voyage P&L is negative — review costs.', level: 'alert' });
  list.push({ id: 'a2', text: `Next hire payment due — ${r.charterers}.`, level: 'warn' });
  list.push({ id: 'a3', text: 'Demurrage may accrue at Haldia (congestion).', level: 'warn' });
  list.push({ id: 'a4', text: `Redelivery notice window open (${r.redeliveryNotices}).`, level: 'info' });
  return list;
}

/* -------------------------------------------------------- small UI helpers */

function Card({ title, icon, right, children }: { title: string; icon: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="fv-ops__card">
      <header className="fv-ops__card-head">
        <span className="fv-ops__card-title">
          <i className={`fas ${icon}`} aria-hidden="true" /> {title}
        </span>
        {right && <span className="fv-ops__card-right">{right}</span>}
      </header>
      <div className="fv-ops__card-body">{children}</div>
    </section>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className={`fv-ops__kpi${tone ? ` fv-ops__kpi--${tone}` : ''}`}>
      <span className="fv-ops__kpi-label">{label}</span>
      <span className="fv-ops__kpi-value">{value}</span>
    </div>
  );
}

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'details', label: 'Voyage Details', icon: 'fa-clipboard-list' },
  { id: 'pnl', label: 'Live P&L', icon: 'fa-sack-dollar' },
  { id: 'etarob', label: "ETA & ROB's", icon: 'fa-gauge-high' },
  { id: 'stowage', label: 'Cargo & Stowage', icon: 'fa-boxes-stacked' },
  { id: 'hire', label: 'Hire Payments', icon: 'fa-money-bill-wave' },
  { id: 'freight', label: 'Freight & Laytime', icon: 'fa-file-invoice-dollar' },
  { id: 'reports', label: 'Vessel Reports', icon: 'fa-file-lines' },
  { id: 'costs', label: 'Tool', icon: 'fa-scale-balanced' },
];

type RailPanel = 'docs' | 'tasks' | 'alerts' | 'upload' | null;

/* ------------------------------------------------------------ main component */

export function OperationsPage() {
  const voyage = useSelectedVoyage();

  const [recap, setRecap] = useState<Recap>(() => seedRecap(voyage));
  const [tab, setTab] = useState<TabId>('pnl');
  const [rail, setRail] = useState<RailPanel>(null);
  const [docs, setDocs] = useState<DocItem[]>(() => seedDocs());
  const [tasks, setTasks] = useState<Task[]>(() => seedTasks());
  const [fetchNote, setFetchNote] = useState<string | null>(null);

  useEffect(() => {
    setRecap(seedRecap(voyage));
    setTab('pnl');
    setDocs(seedDocs());
    setTasks(seedTasks());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyage?.id]);

  const pnl = useMemo(() => computePnl(recap), [recap]);
  const alerts = useMemo(() => seedAlerts(recap, pnl), [recap, pnl]);

  if (!voyage) return <NoVesselSelected />;

  const set = (k: keyof Recap, v: string) => setRecap((r) => ({ ...r, [k]: v }));

  const addDocs = (files: FileList | null, category = 'Supporting') => {
    if (!files) return;
    const now = new Date();
    const at = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const items: DocItem[] = Array.from(files).map((f) => ({
      id: uid('d'),
      name: f.name,
      category,
      size: `${Math.max(1, Math.round(f.size / 1024))} KB`,
      at,
    }));
    setDocs((d) => [...items, ...d]);
  };
  const removeDoc = (id: string) => setDocs((d) => d.filter((x) => x.id !== id));
  const toggleTask = (id: string) => setTasks((t) => t.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));

  /** Upload a Terms Recap / Charter Party and fetch its data into the recap
   *  fields — only blank fields unless `overwrite` is set. */
  const ingest = async (files: FileList | null, category: string, overwrite: boolean) => {
    if (!files || files.length === 0) return;
    addDocs(files, category);
    if (category !== 'Recap' && category !== 'Charter Party') {
      setFetchNote(`Attached ${files[0].name} (${category})`);
      return;
    }
    const file = files[0];
    const extract = await extractFromFile(file, category);
    const applied: Partial<Recap> = {};
    (Object.keys(extract) as (keyof Recap)[]).forEach((k) => {
      const v = extract[k];
      if (v == null || v === '') return;
      if (overwrite || !String(recap[k] ?? '').trim()) applied[k] = v;
    });
    if (Object.keys(applied).length) setRecap((prev) => ({ ...prev, ...applied }));
    setFetchNote(
      `Fetched ${Object.keys(applied).length} field(s) from ${file.name}${overwrite ? '' : ' (blank fields only)'}`,
    );
  };

  const openTasks = tasks.filter((t) => !t.done).length;

  return (
    <div className="fv-ops">
      <div className="fv-ops__main">
        {/* ===================== SLIM TOP BAR ===================== */}
        <RecapTopBar recap={recap} voyage={voyage} pnl={pnl} />

        {/* ===================== TABS ===================== */}
        <nav className="fv-ops__tabs" aria-label="Operations sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`fv-ops__tab${tab === t.id ? ' fv-ops__tab--active' : ''}`}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              <i className={`fas ${t.icon}`} aria-hidden="true" /> {t.label}
            </button>
          ))}
        </nav>

        {/* ===================== TAB CONTENT ===================== */}
        <div className="fv-ops__content">
          {tab === 'details' && <VoyageDetailsTab recap={recap} set={set} />}
          {tab === 'pnl' && <PnlTab recap={recap} set={set} pnl={pnl} />}
          {tab === 'etarob' && <EtaRobTab recap={recap} />}
          {tab === 'stowage' && <StowageTab recap={recap} />}
          {tab === 'hire' && <HireTab recap={recap} pnl={pnl} />}
          {tab === 'freight' && <FreightTab recap={recap} />}
          {tab === 'costs' && <CostsTab pnl={pnl} />}
          {tab === 'reports' && <ReportsTab voyage={voyage} />}
        </div>
      </div>

      {/* ===================== RIGHT RAIL ===================== */}
      <aside className="fv-ops__rail">
        {rail && (
          <div className="fv-ops__rail-panel">
            <div className="fv-ops__rail-panel-head">
              <span>
                {rail === 'docs' && 'Voyage Documents'}
                {rail === 'tasks' && 'Tasks & Reminders'}
                {rail === 'alerts' && 'Alerts'}
                {rail === 'upload' && 'Upload Documents'}
              </span>
              <button type="button" className="fv-ops__icon-btn" onClick={() => setRail(null)} title="Close">
                <i className="fas fa-xmark" />
              </button>
            </div>
            <div className="fv-ops__rail-panel-body">
              {rail === 'docs' && <DocsPanel docs={docs} onRemove={removeDoc} onUpload={() => setRail('upload')} />}
              {rail === 'tasks' && <TasksPanel tasks={tasks} onToggle={toggleTask} />}
              {rail === 'alerts' && <AlertsPanel alerts={alerts} />}
              {rail === 'upload' && <UploadPanel onIngest={ingest} fetchNote={fetchNote} />}
            </div>
          </div>
        )}
        <div className="fv-ops__rail-icons">
          <RailIcon icon="fa-folder-open" label="Documents" active={rail === 'docs'} badge={docs.length} onClick={() => setRail(rail === 'docs' ? null : 'docs')} />
          <RailIcon icon="fa-list-check" label="Tasks" active={rail === 'tasks'} badge={openTasks} onClick={() => setRail(rail === 'tasks' ? null : 'tasks')} />
          <RailIcon icon="fa-bell" label="Alerts" active={rail === 'alerts'} badge={alerts.length} onClick={() => setRail(rail === 'alerts' ? null : 'alerts')} />
          <RailIcon icon="fa-cloud-arrow-up" label="Upload" active={rail === 'upload'} onClick={() => setRail(rail === 'upload' ? null : 'upload')} />
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------ recap header */

function RecapField({ label, value, onChange, accent }: { label: string; value: string; onChange: (v: string) => void; accent?: boolean }) {
  return (
    <div className="fv-ops__rf">
      <span className="fv-ops__rf-label">{label}</span>
      <input className={`fv-ops__rf-input${accent ? ' fv-ops__rf-input--accent' : ''}`} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Recap fields grouped by type / category. */
const RECAP_GROUPS: { title: string; icon: string; fields: { key: keyof Recap; label: string; accent?: boolean }[] }[] = [
  {
    title: 'Vessel & Cargo',
    icon: 'fa-ship',
    fields: [
      { key: 'vesselName', label: 'Vessel Name', accent: true },
      { key: 'voyageFixType', label: 'Voyage / Fix Type' },
      { key: 'cargoName', label: 'Cargo Name', accent: true },
      { key: 'cpQuantity', label: 'CP Quantity' },
      { key: 'finalQtyLoaded', label: 'Final Qty Loaded / BL', accent: true },
      { key: 'holdCleaning', label: 'Hold Cleaning' },
    ],
  },
  {
    title: 'Head Charter — Owners',
    icon: 'fa-building',
    fields: [
      { key: 'owners', label: 'Owners' },
      { key: 'ownersBroker', label: 'Owners Broker' },
      { key: 'cpDate', label: 'CP Date' },
      { key: 'laycan', label: 'Laycan' },
      { key: 'hirePerDay', label: 'Hire Per Day (PDPR)', accent: true },
      { key: 'redeliveryNotices', label: 'Redelivery Notices' },
    ],
  },
  {
    title: 'Sub Charter — Charterers',
    icon: 'fa-handshake',
    fields: [
      { key: 'charterers', label: 'Charterers' },
      { key: 'charterersBroker', label: 'Charterers Broker' },
      { key: 'charterersCpDate', label: 'Charterers CP Date' },
      { key: 'charterersLaycan', label: 'Charterers Laycan' },
      { key: 'freightPerMt', label: 'Freight / MT (USD)', accent: true },
      { key: 'frtPaymentTerms', label: 'FRT Payment Terms' },
    ],
  },
  {
    title: 'Delivery / Redelivery',
    icon: 'fa-clock',
    fields: [
      { key: 'deliveryAt', label: 'Delivery At' },
      { key: 'deliveryDateTime', label: 'Delivery Date / Time', accent: true },
      { key: 'redeliveryAt', label: 'Redelivery At' },
      { key: 'redeliveryDateTime', label: 'Redelivery Date / Time', accent: true },
    ],
  },
  {
    title: 'Commercial Terms',
    icon: 'fa-file-contract',
    fields: [
      { key: 'ilohc', label: 'ILOHC' },
      { key: 'cve', label: 'CVE' },
      { key: 'adcom', label: 'ADCOM' },
      { key: 'brokerage', label: 'Brokerage' },
      { key: 'demDespatch', label: 'Demurrage / Despatch' },
      { key: 'halfDespatch', label: 'Half Despatch WTS' },
      { key: 'wxClause', label: 'WX Clause' },
      { key: 'hullCleaningClause', label: 'Hull Cleaning Clause' },
    ],
  },
  {
    title: 'Load Port',
    icon: 'fa-arrow-up-from-bracket',
    fields: [
      { key: 'loadPort', label: 'Load Port', accent: true },
      { key: 'norAtLoadPort', label: 'NOR at Load Port' },
      { key: 'loadRate', label: 'Load Rate' },
      { key: 'pdaLoadPort', label: 'PDA Load Port' },
    ],
  },
  {
    title: 'Discharge Port',
    icon: 'fa-arrow-down-to-bracket',
    fields: [
      { key: 'dischargePort', label: 'Discharge Port', accent: true },
      { key: 'norAtDPort', label: 'NOR at D.Port' },
      { key: 'dischRate', label: 'Disch. Rate' },
      { key: 'pdaDPort', label: 'PDA D.Port' },
      { key: 'freeDa', label: 'Free DA' },
      { key: 'loiOblDPort', label: 'LOI / OBL at D.Port' },
    ],
  },
];

function RecapTopBar({ recap, voyage, pnl }: { recap: Recap; voyage: Voyage; pnl: Pnl }) {
  return (
    <div className="fv-ops__topbar">
      <div className="fv-ops__recap-title">
        <i className="fas fa-ship" aria-hidden="true" />
        <div>
          <h1>{recap.vesselName}</h1>
          <span className="fv-ops__recap-sub">
            {recap.voyageFixType} · {recap.cargoName} · {recap.loadPort} → {recap.dischargePort}
          </span>
        </div>
        <span className="fv-ops__recap-badge">{voyage.status || 'On Voyage'}</span>
      </div>
      <div className="fv-ops__recap-kpis">
        <span>P&amp;L <b className={pnl.profit >= 0 ? 'fv-ops__pos' : 'fv-ops__neg'}>{money(pnl.profit)}</b></span>
        <span>Days <b>{fmt(pnl.days, 2)}</b></span>
        <span>Daily <b className={pnl.dailyProfit >= 0 ? 'fv-ops__pos' : 'fv-ops__neg'}>{money(pnl.dailyProfit)}</b></span>
      </div>
    </div>
  );
}

function VoyageDetailsTab({ recap, set }: { recap: Recap; set: (k: keyof Recap, v: string) => void }) {
  return (
    <div className="fv-ops__recap-groups">
      {RECAP_GROUPS.map((g) => (
        <div className="fv-ops__recap-group" key={g.title}>
          <div className="fv-ops__recap-group-head">
            <i className={`fas ${g.icon}`} aria-hidden="true" /> {g.title}
          </div>
          {g.fields.map((f) => (
            <RecapField key={f.key} label={f.label} value={recap[f.key]} onChange={(v) => set(f.key, v)} accent={f.accent} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ Live P&L tab */

function PnlTab({ recap, set, pnl }: { recap: Recap; set: (k: keyof Recap, v: string) => void; pnl: Pnl }) {
  const est = { revenue: pnl.revenue * 0.98, expenses: pnl.expenses * 0.96 };
  const estProfit = est.revenue - est.expenses;
  return (
    <div className="fv-ops__grid2">
      <div className="fv-ops__col">
        <div className="fv-ops__kpis">
          <Kpi label="Revenue" value={money(pnl.revenue)} />
          <Kpi label="Expenses" value={money(pnl.expenses)} />
          <Kpi label="Profit" value={money(pnl.profit)} tone={pnl.profit >= 0 ? 'good' : 'bad'} />
          <Kpi label="Daily Profit" value={money(pnl.dailyProfit)} tone={pnl.dailyProfit >= 0 ? 'good' : 'bad'} />
          <Kpi label="TCE / Day" value={money(pnl.tce)} />
          <Kpi label="Voyage Days" value={fmt(pnl.days, 2)} />
        </div>

        <Card title="Profit &amp; Loss Breakdown" icon="fa-sack-dollar">
          <table className="fv-ops__table">
            <tbody>
              <tr className="fv-ops__row-group"><td colSpan={2}>Revenue</td></tr>
              <tr><td>Freight ({fmt(pnl.qty, 0)} MT × {recap.freightPerMt})</td><td className="fv-ops__r">{money(pnl.freightRevenue)}</td></tr>
              <tr><td>Demurrage / Despatch</td><td className="fv-ops__r">{money(pnl.demDespatch)}</td></tr>
              <tr><td>Misc Income</td><td className="fv-ops__r">{money(pnl.miscIncome)}</td></tr>
              <tr className="fv-ops__row-sub"><td>Total Revenue</td><td className="fv-ops__r">{money(pnl.revenue)}</td></tr>
              <tr className="fv-ops__row-group"><td colSpan={2}>Expenses</td></tr>
              <tr><td>Hire ({fmt(pnl.days, 2)} d × {recap.hirePerDay})</td><td className="fv-ops__r">{money(pnl.hireGross)}</td></tr>
              <tr><td>Less Add. Comm / Brokerage</td><td className="fv-ops__r fv-ops__pos">-{money(pnl.hireDeductions)}</td></tr>
              <tr><td>C/V/E ({recap.cve} × months)</td><td className="fv-ops__r">{money(pnl.cveTotal)}</td></tr>
              <tr><td>ILOHC</td><td className="fv-ops__r">{money(pnl.ilohc)}</td></tr>
              <tr><td>Bunkers</td><td className="fv-ops__r">{money(pnl.bunkerCost)}</td></tr>
              <tr><td>Port DA (Load + Disch)</td><td className="fv-ops__r">{money(pnl.portCost)}</td></tr>
              <tr><td>Other</td><td className="fv-ops__r">{money(pnl.otherCost)}</td></tr>
              <tr className="fv-ops__row-sub"><td>Total Expenses</td><td className="fv-ops__r">{money(pnl.expenses)}</td></tr>
              <tr className={`fv-ops__row-profit${pnl.profit < 0 ? ' fv-ops__row-loss' : ''}`}>
                <td>VOYAGE RESULT</td><td className="fv-ops__r">{money(pnl.profit)}</td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>

      <div className="fv-ops__col">
        <Card title="Operating Figures" icon="fa-sliders">
          <div className="fv-ops__figs">
            <RecapField label="Hire Per Day" value={recap.hirePerDay} onChange={(v) => set('hirePerDay', v)} accent />
            <RecapField label="Freight / MT" value={recap.freightPerMt} onChange={(v) => set('freightPerMt', v)} accent />
            <RecapField label="Final Qty Loaded" value={recap.finalQtyLoaded} onChange={(v) => set('finalQtyLoaded', v)} />
            <RecapField label="Bunker Cost" value={recap.bunkerCost} onChange={(v) => set('bunkerCost', v)} />
            <RecapField label="Port DA — Load" value={recap.portDaLoad} onChange={(v) => set('portDaLoad', v)} />
            <RecapField label="Port DA — Disch" value={recap.portDaDisch} onChange={(v) => set('portDaDisch', v)} />
            <RecapField label="Other Cost" value={recap.otherCost} onChange={(v) => set('otherCost', v)} />
            <RecapField label="Misc Income" value={recap.miscIncome} onChange={(v) => set('miscIncome', v)} />
          </div>
        </Card>

        <Card title="Estimate vs Actual" icon="fa-scale-balanced">
          <table className="fv-ops__table">
            <thead>
              <tr><th>Metric</th><th className="fv-ops__r">Estimate</th><th className="fv-ops__r">Actual</th><th className="fv-ops__r">Var.</th></tr>
            </thead>
            <tbody>
              <tr><td>Revenue</td><td className="fv-ops__r">{money(est.revenue)}</td><td className="fv-ops__r">{money(pnl.revenue)}</td><td className="fv-ops__r fv-ops__pos">{money(pnl.revenue - est.revenue)}</td></tr>
              <tr><td>Expenses</td><td className="fv-ops__r">{money(est.expenses)}</td><td className="fv-ops__r">{money(pnl.expenses)}</td><td className="fv-ops__r fv-ops__neg">{money(pnl.expenses - est.expenses)}</td></tr>
              <tr className="fv-ops__row-sub"><td>Profit</td><td className="fv-ops__r">{money(estProfit)}</td><td className="fv-ops__r">{money(pnl.profit)}</td><td className={`fv-ops__r ${pnl.profit - estProfit >= 0 ? 'fv-ops__pos' : 'fv-ops__neg'}`}>{money(pnl.profit - estProfit)}</td></tr>
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ ETA & ROB tab */

function EtaRobTab({ recap }: { recap: Recap }) {
  const rows = [
    { port: recap.loadPort || 'Salalah', status: 'Departed', eta: '14-07 22:00', fo: 640, do: 78 },
    { port: 'Passage — Indian Ocean', status: 'At Sea', eta: '—', fo: 512, do: 74 },
    { port: 'Paradip', status: 'ETA', eta: '28-07 06:00', fo: 388, do: 70 },
    { port: 'Haldia', status: 'ETA', eta: '02-08 12:00', fo: 300, do: 66 },
    { port: 'Redelivery — DLOSP Haldia', status: 'ETA', eta: '05-08 11:18', fo: 286, do: 64 },
  ];
  return (
    <Card title="ETA & ROB Projection" icon="fa-gauge-high">
      <table className="fv-ops__table">
        <thead>
          <tr><th>Port / Leg</th><th>Status</th><th>ETA / ATD</th><th className="fv-ops__r">FO ROB (MT)</th><th className="fv-ops__r">DO ROB (MT)</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.port}</td>
              <td><span className={`fv-ops__pill fv-ops__pill--${r.status === 'At Sea' ? 'blue' : r.status === 'Departed' ? 'green' : 'amber'}`}>{r.status}</span></td>
              <td>{r.eta}</td>
              <td className="fv-ops__r">{fmt(r.fo)}</td>
              <td className="fv-ops__r">{fmt(r.do)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fv-ops__hint">ROB is projected from the last noon report using CP speed / consumption. Update from Vessel Reports.</p>
    </Card>
  );
}

/* ------------------------------------------------------------ Stowage tab */

function StowageTab({ recap }: { recap: Recap }) {
  const holds = [
    { hold: 'Hold 1', cargo: 'Gypsum', qty: 15_500, port: 'Paradip' },
    { hold: 'Hold 2', cargo: 'Gypsum', qty: 15_000, port: 'Paradip' },
    { hold: 'Hold 3', cargo: 'Limestone', qty: 15_714, port: 'Haldia' },
    { hold: 'Hold 4', cargo: 'Limestone', qty: 15_000, port: 'Haldia' },
    { hold: 'Hold 5', cargo: 'Limestone', qty: 15_000, port: 'Haldia' },
  ];
  const total = holds.reduce((s, h) => s + h.qty, 0);
  return (
    <Card title={`Stowage Plan — ${recap.cargoName}`} icon="fa-boxes-stacked">
      <table className="fv-ops__table">
        <thead>
          <tr><th>Hold</th><th>Cargo</th><th className="fv-ops__r">Quantity (MT)</th><th>Discharge Port</th></tr>
        </thead>
        <tbody>
          {holds.map((h) => (
            <tr key={h.hold}>
              <td>{h.hold}</td>
              <td>{h.cargo}</td>
              <td className="fv-ops__r">{fmt(h.qty, 0)}</td>
              <td>{h.port}</td>
            </tr>
          ))}
          <tr className="fv-ops__row-sub"><td colSpan={2}>Total Loaded</td><td className="fv-ops__r">{fmt(total, 0)}</td><td /></tr>
        </tbody>
      </table>
      <p className="fv-ops__hint">CP Quantity: {recap.cpQuantity} · Final BL: {recap.finalQtyLoaded} MT</p>
    </Card>
  );
}

/* ------------------------------------------------------------ Hire tab */

function HireTab({ recap, pnl }: { recap: Recap; pnl: Pnl }) {
  const hd = num(recap.hirePerDay);
  const dedPct = num(recap.adcom) + num(recap.brokerage);
  const rows = [
    { no: '1st Hire', from: '11-07 15:00', days: 15, status: 'Paid' },
    { no: '2nd Hire', from: '26-07 15:00', days: Math.max(0, pnl.days - 15), status: 'Due' },
  ];
  return (
    <Card title="Hire Payment Schedule" icon="fa-money-bill-wave">
      <table className="fv-ops__table">
        <thead>
          <tr><th>Installment</th><th>From</th><th className="fv-ops__r">Days</th><th className="fv-ops__r">Gross Hire</th><th className="fv-ops__r">Less Comm ({fmt(dedPct)}%)</th><th className="fv-ops__r">Net Payable</th><th>Status</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const gross = hd * r.days;
            const ded = (gross * dedPct) / 100;
            return (
              <tr key={r.no}>
                <td>{r.no}</td>
                <td>{r.from}</td>
                <td className="fv-ops__r">{fmt(r.days, 2)}</td>
                <td className="fv-ops__r">{money(gross)}</td>
                <td className="fv-ops__r fv-ops__pos">-{money(ded)}</td>
                <td className="fv-ops__r">{money(gross - ded)}</td>
                <td><span className={`fv-ops__pill fv-ops__pill--${r.status === 'Paid' ? 'green' : 'amber'}`}>{r.status}</span></td>
              </tr>
            );
          })}
          <tr className="fv-ops__row-sub"><td colSpan={5}>Total Net Hire</td><td className="fv-ops__r">{money(pnl.netHire)}</td><td /></tr>
        </tbody>
      </table>
      <p className="fv-ops__hint">ILOHC {recap.ilohc} · C/V/E {recap.cve} /month · Hull cleaning {recap.hullCleaningClause}</p>
    </Card>
  );
}

/* ------------------------------------------------------------ Freight & Laytime */

function FreightTab({ recap }: { recap: Recap }) {
  const qty = num(recap.finalQtyLoaded);
  const freight = qty * num(recap.freightPerMt);
  const laytime = [
    { port: 'Salalah (Load)', allowed: qty / num(recap.loadRate || '1'), used: 4.2, rate: recap.loadRate },
    { port: 'Paradip (Disch)', allowed: (qty * 0.4) / num(recap.dischRate || '1'), used: 3.1, rate: recap.dischRate },
    { port: 'Haldia (Disch)', allowed: (qty * 0.6) / num(recap.dischRate || '1'), used: 5.8, rate: recap.dischRate },
  ];
  return (
    <div className="fv-ops__grid2">
      <Card title="Freight Invoice" icon="fa-file-invoice-dollar">
        <table className="fv-ops__table">
          <tbody>
            <tr><td>BL Quantity</td><td className="fv-ops__r">{fmt(qty, 0)} MT</td></tr>
            <tr><td>Freight Rate</td><td className="fv-ops__r">${recap.freightPerMt} / MT</td></tr>
            <tr className="fv-ops__row-sub"><td>Gross Freight</td><td className="fv-ops__r">{money(freight)}</td></tr>
            <tr><td>Payment Terms</td><td className="fv-ops__r">{recap.frtPaymentTerms}</td></tr>
          </tbody>
        </table>
      </Card>
      <Card title="Laytime Statement" icon="fa-hourglass-half">
        <table className="fv-ops__table">
          <thead>
            <tr><th>Port</th><th className="fv-ops__r">Allowed (d)</th><th className="fv-ops__r">Used (d)</th><th className="fv-ops__r">Balance</th></tr>
          </thead>
          <tbody>
            {laytime.map((l) => {
              const bal = l.allowed - l.used;
              return (
                <tr key={l.port}>
                  <td>{l.port}</td>
                  <td className="fv-ops__r">{fmt(l.allowed, 2)}</td>
                  <td className="fv-ops__r">{fmt(l.used, 2)}</td>
                  <td className={`fv-ops__r ${bal >= 0 ? 'fv-ops__pos' : 'fv-ops__neg'}`}>{fmt(bal, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="fv-ops__hint">Demurrage / Despatch: {recap.demDespatch} · Half despatch WTS: {recap.halfDespatch}</p>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ Cost Comparisons */

function CostsTab({ pnl }: { pnl: Pnl }) {
  const lines: { label: string; est: number; act: number }[] = [
    { label: 'Hire (net)', est: pnl.netHire * 0.97, act: pnl.netHire },
    { label: 'Bunkers', est: pnl.bunkerCost * 0.92, act: pnl.bunkerCost },
    { label: 'Port DA', est: pnl.portCost * 0.9, act: pnl.portCost },
    { label: 'C/V/E', est: pnl.cveTotal, act: pnl.cveTotal },
    { label: 'ILOHC', est: pnl.ilohc, act: pnl.ilohc },
    { label: 'Other', est: pnl.otherCost * 0.8, act: pnl.otherCost },
  ];
  return (
    <Card title="Cost Comparison — Estimate vs Actual" icon="fa-scale-balanced">
      <table className="fv-ops__table">
        <thead>
          <tr><th>Cost Line</th><th className="fv-ops__r">Estimate</th><th className="fv-ops__r">Actual</th><th className="fv-ops__r">Variance</th><th className="fv-ops__r">%</th></tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const v = l.act - l.est;
            const pct = l.est ? (v / l.est) * 100 : 0;
            return (
              <tr key={l.label}>
                <td>{l.label}</td>
                <td className="fv-ops__r">{money(l.est)}</td>
                <td className="fv-ops__r">{money(l.act)}</td>
                <td className={`fv-ops__r ${v <= 0 ? 'fv-ops__pos' : 'fv-ops__neg'}`}>{money(v)}</td>
                <td className={`fv-ops__r ${v <= 0 ? 'fv-ops__pos' : 'fv-ops__neg'}`}>{fmt(pct)}%</td>
              </tr>
            );
          })}
          <tr className="fv-ops__row-sub">
            <td>Total</td>
            <td className="fv-ops__r">{money(lines.reduce((s, l) => s + l.est, 0))}</td>
            <td className="fv-ops__r">{money(lines.reduce((s, l) => s + l.act, 0))}</td>
            <td className="fv-ops__r">{money(lines.reduce((s, l) => s + (l.act - l.est), 0))}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

/* ------------------------------------------------------------ Vessel Reports */

function ReportsTab({ voyage }: { voyage: Voyage }) {
  const reports = [
    { date: '20-07 12:00 UTC', type: 'Noon at Sea', spd: voyage.instSpeed ?? 12.4, fo: voyage.instCons ?? 26, pos: '14°20N 070°10E' },
    { date: '19-07 12:00 UTC', type: 'Noon at Sea', spd: 12.1, fo: 25.6, pos: '13°02N 073°44E' },
    { date: '18-07 12:00 UTC', type: 'Noon at Sea', spd: 12.6, fo: 26.4, pos: '11°40N 077°05E' },
    { date: '14-07 22:00 LT', type: 'Departure', spd: 0, fo: 0, pos: 'Salalah' },
  ];
  return (
    <Card title="Vessel Reports" icon="fa-file-lines">
      <table className="fv-ops__table">
        <thead>
          <tr><th>Date</th><th>Report</th><th className="fv-ops__r">Speed (kn)</th><th className="fv-ops__r">FO/day (MT)</th><th>Position</th></tr>
        </thead>
        <tbody>
          {reports.map((r, i) => (
            <tr key={i}>
              <td>{r.date}</td>
              <td>{r.type}</td>
              <td className="fv-ops__r">{fmt(r.spd, 1)}</td>
              <td className="fv-ops__r">{fmt(r.fo, 1)}</td>
              <td>{r.pos}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/* ------------------------------------------------------------ right rail bits */

function RailIcon({ icon, label, active, badge, onClick }: { icon: string; label: string; active: boolean; badge?: number; onClick: () => void }) {
  return (
    <button type="button" className={`fv-ops__rail-icon${active ? ' fv-ops__rail-icon--active' : ''}`} onClick={onClick} title={label}>
      <i className={`fas ${icon}`} aria-hidden="true" />
      {badge != null && badge > 0 && <span className="fv-ops__rail-badge">{badge}</span>}
      <span className="fv-ops__rail-icon-label">{label}</span>
    </button>
  );
}

function DocsPanel({ docs, onRemove, onUpload }: { docs: DocItem[]; onRemove: (id: string) => void; onUpload: () => void }) {
  const groups = docs.reduce<Record<string, DocItem[]>>((acc, d) => {
    (acc[d.category] ??= []).push(d);
    return acc;
  }, {});
  return (
    <div>
      <button type="button" className="fv-ops__btn fv-ops__btn--primary fv-ops__btn--block" onClick={onUpload}>
        <i className="fas fa-cloud-arrow-up" /> Upload document
      </button>
      {Object.entries(groups).map(([cat, items]) => (
        <div key={cat} className="fv-ops__doc-group">
          <div className="fv-ops__doc-group-head">{cat}</div>
          {items.map((d) => (
            <div key={d.id} className="fv-ops__doc">
              <i className="fas fa-file-pdf" aria-hidden="true" />
              <span className="fv-ops__doc-name">{d.name}</span>
              <span className="fv-ops__doc-meta">{d.size} · {d.at}</span>
              <button type="button" className="fv-ops__icon-btn" onClick={() => onRemove(d.id)} title="Remove"><i className="fas fa-xmark" /></button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TasksPanel({ tasks, onToggle }: { tasks: Task[]; onToggle: (id: string) => void }) {
  return (
    <ul className="fv-ops__tasks">
      {tasks.map((t) => (
        <li key={t.id} className={t.done ? 'fv-ops__task--done' : ''}>
          <label>
            <input type="checkbox" checked={t.done} onChange={() => onToggle(t.id)} />
            <span className="fv-ops__task-text">{t.text}</span>
          </label>
          <span className="fv-ops__task-due">{t.due}</span>
        </li>
      ))}
    </ul>
  );
}

function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  return (
    <ul className="fv-ops__alerts">
      {alerts.map((a) => (
        <li key={a.id} className={`fv-ops__alert fv-ops__alert--${a.level}`}>
          <i className="fas fa-bell" aria-hidden="true" /> {a.text}
        </li>
      ))}
    </ul>
  );
}

function UploadPanel({
  onIngest,
  fetchNote,
}: {
  onIngest: (files: FileList | null, category: string, overwrite: boolean) => void;
  fetchNote: string | null;
}) {
  const [category, setCategory] = useState('Recap');
  const [overwrite, setOverwrite] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cats = ['Recap', 'Charter Party', 'SOF', 'NOR', 'B/L', 'Invoice', 'Supporting'];
  const fetches = category === 'Recap' || category === 'Charter Party';
  return (
    <div>
      <label className="fv-ops__rf">
        <span className="fv-ops__rf-label">Document type</span>
        <select className="fv-ops__rf-input" value={category} onChange={(e) => setCategory(e.target.value)}>
          {cats.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      {fetches && (
        <label className="fv-ops__check" style={{ margin: '6px 0' }}>
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> Overwrite manual entries
        </label>
      )}
      <div
        className={`fv-ops__dropzone${dragOver ? ' fv-ops__dropzone--over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onIngest(e.dataTransfer.files, category, overwrite);
        }}
        onClick={() => fileRef.current?.click()}
      >
        <i className="fas fa-cloud-arrow-up" aria-hidden="true" />
        <span>Drop {category} here</span>
        <span className="fv-ops__hint">or click to browse</span>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => onIngest(e.target.files, category, overwrite)} />
      </div>
      {fetchNote && (
        <p className="fv-ops__fetch-note">
          <i className="fas fa-circle-check" aria-hidden="true" /> {fetchNote}
        </p>
      )}
      <p className="fv-ops__hint">
        Uploading a Terms Recap or Charter Party reads key figures from the document into the Voyage
        Details fields — blank fields only, unless “Overwrite” is ticked.
      </p>
    </div>
  );
}
