import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { useSelectedVoyage } from '../data/selectedVoyage';
import type { Voyage } from '../data/voyages';
import { NoVesselSelected } from './NoVesselSelected';

/**
 * Chartering — Voyage Estimation (Netpas-style calculation sheet).
 *
 * Reproduces the Netpas voyage-estimation layout: Vessel Particular · Cargo ·
 * Port Rotation · Operation Expense / Bunker Expense / Result. The modern ODAS
 * header (status + New / Duplicate / Compare / Save / … actions) stays on top.
 * Every value is derived live.
 *
 * Calculation model:
 *   Revenue        = Σ (quantity × freight)
 *   Operation Exp. = Dem/Des + Add Comm + Brokerage + Freight Tax + Liner
 *                    Terms + Port Charge + Bunker Exp + CEV + ILOHC +
 *                    Ballast Bonus + Routing + Others
 *   Op. Profit     = Revenue − Operation Expense
 *   Net Hire       = Hire/Day × (1 − H.Add Comm%)
 *   Total Hire     = Net Hire × Voyage Days
 *   Total Expense  = Operation Expense + Total Hire
 *   PROFIT (USD)   = Revenue − Total Expense
 *   C/Base (TCE)   = Op. Profit ÷ Voyage Days
 */

/* ------------------------------------------------------------------ types */

type EstStatus = 'Estimate' | 'Quoted' | 'On Subs' | 'Fixed' | 'Cancelled' | 'Lost';
type LegType = 'Ballast' | 'Loading' | 'Discharging' | 'Bunker' | 'Canal' | 'Margin';

interface VesselParticular {
  name: string;
  dwt: number;
  draft: number;
  tpc: number;
  built: number;
  kind: string;
  type: string;
}

interface SpeedSet {
  ballast: number;
  laden: number;
}
interface MainCons {
  type: string;
  ballast: number;
  laden: number;
  idle: number;
  work: number;
}
interface SubCons {
  type: string;
  sea: number;
  idle: number;
  work: number;
}
interface Performance {
  speedMode: 'Full' | 'Eco';
  full: SpeedSet;
  eco: SpeedSet;
  mainNormal: MainCons;
  mainEca: MainCons;
  subNormal: SubCons;
  subEca: SubCons;
}

interface Cargo {
  id: string;
  account: string;
  name: string;
  loadPort: string;
  dischPort: string;
  quantity: number;
  unit: string;
  frt: number;
  term: string;
  aCommPct: number;
  brkgPct: number;
  frtTaxPct: number;
  linerTerm: number;
}

interface PortRow {
  id: string;
  type: LegType;
  port: string;
  distance: number;
  ecaDistance: number;
  wf: number;
  speed: number;
  ldRate: number;
  idle: number;
  work: number;
  seaManual: number;
  dem: number;
  des: number;
  portCharge: number;
}

interface Commercial {
  dailyHire: number;
  hAddCommPct: number;
  cev: number;
  ilohc: number;
  ballastBonus: number;
  routingService: number;
  others: number;
  linerTerms: number;
  vlsfoPrice: number;
  mgoPrice: number;
  ulsfoPrice: number;
}

interface Canals {
  suez: boolean;
  panama: boolean;
  kiel: boolean;
}

interface EstimateInputs {
  perf: Performance;
  cargoes: Cargo[];
  ports: PortRow[];
  commercial: Commercial;
  canals: Canals;
  startDate: string;
}

interface LegCalc {
  sea: number;
  eca: number;
  arrival: string;
  departure: string;
}

interface EstimateResult {
  freight: number;
  addComm: number;
  brokerage: number;
  freightTax: number;
  linerTermTotal: number;
  seaDays: number;
  ecaDays: number;
  ladenDays: number;
  ballastDays: number;
  idleTotal: number;
  workTotal: number;
  portDays: number;
  voyageDays: number;
  distanceTotal: number;
  ecaDistanceTotal: number;
  portCharge: number;
  demTotal: number;
  desTotal: number;
  demDes: number;
  vlsfoCons: number;
  ulsfoCons: number;
  mgoCons: number;
  vlsfoExp: number;
  ulsfoExp: number;
  mgoExp: number;
  bunkerExpense: number;
  opExpense: number;
  revenue: number;
  opProfit: number;
  netHire: number;
  totalHire: number;
  totalExpense: number;
  profit: number;
  profitPct: number;
  tce: number;
  startStr: string;
  endStr: string;
  perLeg: LegCalc[];
}

interface Snapshot {
  id: string;
  name: string;
  result: EstimateResult;
}

/* -------------------------------------------------------------- constants */

const STATUS_FLOW: EstStatus[] = ['Estimate', 'Quoted', 'On Subs', 'Fixed', 'Cancelled', 'Lost'];
const STATUS_META: Record<EstStatus, { color: string }> = {
  Estimate: { color: 'slate' },
  Quoted: { color: 'blue' },
  'On Subs': { color: 'amber' },
  Fixed: { color: 'green' },
  Cancelled: { color: 'red' },
  Lost: { color: 'grey' },
};
const LEG_TYPES: LegType[] = ['Ballast', 'Loading', 'Discharging', 'Bunker', 'Canal', 'Margin'];

/* ---------------------------------------------------------------- helpers */

function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
function num(v: string): number {
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function fmt(n: number, dp = 1): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function money(n: number): string {
  return `${n < 0 ? '-' : ''}$${fmt(Math.abs(n), 0)}`;
}
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
function fmtDate(d: Date): string {
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function uid(p: string): string {
  return `${p}-${Math.random().toString(36).slice(2, 8)}`;
}

/* -------------------------------------------------------- estimate engine */

function computeEstimate(i: EstimateInputs): EstimateResult {
  const { cargoes, ports, perf, commercial } = i;

  let freight = 0;
  let addComm = 0;
  let brokerage = 0;
  let freightTax = 0;
  let linerTermTotal = 0;
  for (const c of cargoes) {
    const tf = c.quantity * c.frt;
    freight += tf;
    addComm += (tf * c.aCommPct) / 100;
    brokerage += (tf * c.brkgPct) / 100;
    freightTax += (tf * c.frtTaxPct) / 100;
    linerTermTotal += c.linerTerm;
  }

  let seaDays = 0;
  let ecaDays = 0;
  let ladenDays = 0;
  let ballastDays = 0;
  let idleTotal = 0;
  let workTotal = 0;
  let distanceTotal = 0;
  let ecaDistanceTotal = 0;
  let portCharge = 0;
  let demTotal = 0;
  let desTotal = 0;
  let foNormalSea = 0;
  let foEcaSea = 0;
  let foPort = 0;
  let mgoSea = 0;
  let mgoEcaSea = 0;
  let mgoPort = 0;

  const start = new Date(i.startDate);
  let cursor = start;
  const perLeg: LegCalc[] = [];

  for (const p of ports) {
    const spd = p.speed > 0 ? p.speed : 12;
    let legSea: number;
    let legEca: number;
    if (p.type === 'Margin') {
      legSea = p.seaManual;
      legEca = 0;
    } else {
      legSea = p.distance > 0 ? (p.distance / (spd * 24)) * (1 + p.wf / 100) : 0;
      legEca = p.ecaDistance > 0 ? p.ecaDistance / (spd * 24) : 0;
    }
    const normalSea = Math.max(0, legSea - legEca);
    const isBallast = p.type === 'Ballast';

    foNormalSea += normalSea * (isBallast ? perf.mainNormal.ballast : perf.mainNormal.laden);
    foEcaSea += legEca * (isBallast ? perf.mainEca.ballast : perf.mainEca.laden);
    foPort += p.idle * perf.mainNormal.idle + p.work * perf.mainNormal.work;
    mgoSea += normalSea * perf.subNormal.sea;
    mgoEcaSea += legEca * perf.subEca.sea;
    mgoPort += p.idle * perf.subNormal.idle + p.work * perf.subNormal.work;

    seaDays += legSea;
    ecaDays += legEca;
    if (isBallast) ballastDays += legSea;
    else ladenDays += legSea;
    idleTotal += p.idle;
    workTotal += p.work;
    distanceTotal += p.distance;
    ecaDistanceTotal += p.ecaDistance;
    portCharge += p.portCharge;
    demTotal += p.dem;
    desTotal += p.des;

    const arrival = addDays(cursor, legSea);
    const departure = addDays(arrival, p.idle + p.work);
    cursor = departure;
    perLeg.push({
      sea: round(legSea, 2),
      eca: round(legEca, 2),
      arrival: legSea > 0 ? fmtDate(arrival) : '—',
      departure: fmtDate(departure),
    });
  }

  const portDays = idleTotal + workTotal;
  const voyageDays = seaDays + portDays;
  const vlsfoCons = foNormalSea + foPort;
  const ulsfoCons = foEcaSea;
  const mgoCons = mgoSea + mgoEcaSea + mgoPort;
  const vlsfoExp = vlsfoCons * commercial.vlsfoPrice;
  const ulsfoExp = ulsfoCons * commercial.ulsfoPrice;
  const mgoExp = mgoCons * commercial.mgoPrice;
  const bunkerExpense = vlsfoExp + ulsfoExp + mgoExp;

  const demDes = desTotal - demTotal;
  const opExpense =
    demDes +
    addComm +
    brokerage +
    freightTax +
    commercial.linerTerms +
    linerTermTotal +
    portCharge +
    bunkerExpense +
    commercial.cev +
    commercial.ilohc +
    commercial.ballastBonus +
    commercial.routingService +
    commercial.others;

  const revenue = freight;
  const opProfit = revenue - opExpense;
  const netHire = commercial.dailyHire * (1 - commercial.hAddCommPct / 100);
  const totalHire = netHire * voyageDays;
  const totalExpense = opExpense + totalHire;
  const profit = revenue - totalExpense;
  const profitPct = revenue !== 0 ? (profit / revenue) * 100 : 0;
  const tce = voyageDays > 0 ? opProfit / voyageDays : 0;

  return {
    freight,
    addComm,
    brokerage,
    freightTax,
    linerTermTotal,
    seaDays,
    ecaDays,
    ladenDays,
    ballastDays,
    idleTotal,
    workTotal,
    portDays,
    voyageDays,
    distanceTotal,
    ecaDistanceTotal,
    portCharge,
    demTotal,
    desTotal,
    demDes,
    vlsfoCons,
    ulsfoCons,
    mgoCons,
    vlsfoExp,
    ulsfoExp,
    mgoExp,
    bunkerExpense,
    opExpense,
    revenue,
    opProfit,
    netHire,
    totalHire,
    totalExpense,
    profit,
    profitPct,
    tce,
    startStr: fmtDate(start),
    endStr: fmtDate(cursor),
    perLeg,
  };
}

function setLegSpeeds(i: EstimateInputs, set: SpeedSet): PortRow[] {
  return i.ports.map((p) => ({ ...p, speed: p.type === 'Ballast' ? set.ballast : p.type === 'Margin' ? 0 : set.laden }));
}

/* ------------------------------------------------------------ seed inputs */

function seedInputs(voyage: Voyage | undefined): EstimateInputs {
  const perf: Performance = {
    speedMode: 'Full',
    full: { ballast: 14, laden: 14 },
    eco: { ballast: 12, laden: 11.5 },
    mainNormal: { type: 'VLSFO', ballast: 29, laden: 33, idle: 2.5, work: 5 },
    mainEca: { type: 'ULSFO', ballast: 29, laden: 33, idle: 2.5, work: 5 },
    subNormal: { type: 'MGO', sea: 0.1, idle: 0, work: 0 },
    subEca: { type: 'MGO', sea: 0.1, idle: 0, work: 0 },
  };

  const c = (
    account: string,
    name: string,
    loadPort: string,
    dischPort: string,
    quantity: number,
    frt: number,
  ): Cargo => ({
    id: uid('cg'),
    account,
    name,
    loadPort,
    dischPort,
    quantity,
    unit: 'MT',
    frt,
    term: 'FIO',
    aCommPct: 3.75,
    brkgPct: 1.25,
    frtTaxPct: 0,
    linerTerm: 0,
  });

  const cargoes: Cargo[] = [
    c('5011ACCT1', 'general', 'Tianjin <China>', 'Ravenna <Italy>', 15_000, 28),
    c('5011ACCT1', 'general', 'Rizhao <China>', 'Ravenna <Italy>', 10_000, 28),
    c('5011ACCT1', 'general', 'Tianjin <China>', 'Rotterdam <Netherlands>', 10_000, 30),
    c('5011ACCT2', 'steel', 'Qingdao <China>', 'Rotterdam <Netherlands>', 15_000, 35),
  ];
  if (voyage) {
    cargoes[0].loadPort = voyage.portFrom || cargoes[0].loadPort;
    cargoes[0].dischPort = voyage.portTo || cargoes[0].dischPort;
  }

  const p = (
    type: LegType,
    port: string,
    distance: number,
    ecaDistance: number,
    speed: number,
    ldRate: number,
    idle: number,
    work: number,
    des: number,
    portCharge: number,
    seaManual = 0,
  ): PortRow => ({
    id: uid('pr'),
    type,
    port,
    distance,
    ecaDistance,
    wf: type === 'Margin' ? 0 : 5,
    speed,
    ldRate,
    idle,
    work,
    seaManual,
    dem: 0,
    des,
    portCharge,
  });

  const ports: PortRow[] = [
    p('Ballast', 'CJK (Changjiangkou) <China>', 0, 0, 14, 0, 0, 0, 0, 0),
    p('Loading', 'Tianjin <China>', 676, 0, 14, 10_000, 0.5, 2.5, 3_000, 45_000),
    p('Loading', 'Qingdao <China>', 463, 0, 14, 5_000, 0.5, 3.0, 2_500, 35_000),
    p('Loading', 'Rizhao <China>', 82, 0, 14, 5_000, 0.5, 2.0, 3_000, 35_000),
    p('Bunker', 'Singapore <Singapore>', 2_461, 0, 14, 0, 0.5, 0, 0, 3_000),
    p('Canal', 'Suez Canal (RP)', 5_047, 0, 14, 0, 0.21, 0, 0, 185_000),
    p('Discharging', 'Ravenna <Italy>', 1_356, 0, 14, 8_000, 0.5, 3.13, 3_000, 40_000),
    p('Discharging', 'Rotterdam <Netherlands>', 3_057, 417, 14, 10_000, 0.5, 1.0, 2_500, 20_000),
    p('Discharging', 'Rotterdam <Netherlands>', 0, 0, 14, 5_000, 1.66, 3.0, 3_000, 20_000),
    p('Margin', 'Margin', 0, 0, 0, 0, 1.0, 0, 0, 0, 2.0),
  ];

  const commercial: Commercial = {
    dailyHire: voyage ? Math.round(voyage.price) : 8_500,
    hAddCommPct: 3.75,
    cev: 3_177.9,
    ilohc: 5_000,
    ballastBonus: 0,
    routingService: 0,
    others: 0,
    linerTerms: 0,
    vlsfoPrice: voyage?.foCost || 320,
    mgoPrice: voyage?.goCost || 360,
    ulsfoPrice: 350,
  };

  return { perf, cargoes, ports, commercial, canals: { suez: true, panama: true, kiel: false }, startDate: '2020-08-06T16:10' };
}

function seedVessel(voyage: Voyage | undefined): VesselParticular {
  return {
    name: voyage?.vessel || 'oriental phoenix',
    dwt: voyage ? num(voyage.dwt) : 56_811,
    draft: 12.8,
    tpc: 58,
    built: voyage?.built || 2012,
    kind: '—',
    type: 'TCT',
  };
}

/* -------------------------------------------------------- small UI helpers */

function Section({
  title,
  icon,
  right,
  children,
}: {
  title: string;
  icon: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="fv-ce__card">
      <header className="fv-ce__card-head">
        <span className="fv-ce__card-toggle">
          <i className={`fas ${icon} fv-ce__card-icon`} aria-hidden="true" />
          <span>{title}</span>
        </span>
        {right && <div className="fv-ce__card-right">{right}</div>}
      </header>
      <div className="fv-ce__card-body">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------ main component */

export function ChateringEstimationPage() {
  const voyage = useSelectedVoyage();

  const [inputs, setInputs] = useState<EstimateInputs>(() => seedInputs(voyage));
  const [vessel, setVessel] = useState<VesselParticular>(() => seedVessel(voyage));
  const [status, setStatus] = useState<EstStatus>('Estimate');
  const [locked, setLocked] = useState(false);
  const [fixtureNo, setFixtureNo] = useState<string | null>(null);
  const [lastModified, setLastModified] = useState('2020-08-06 17:11');
  const [compareOpen, setCompareOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotName, setSnapshotName] = useState('');

  const estNo = useMemo(() => `EST-${voyage?.id ?? '0000'}`, [voyage?.id]);

  useEffect(() => {
    setInputs(seedInputs(voyage));
    setVessel(seedVessel(voyage));
    setStatus('Estimate');
    setLocked(false);
    setFixtureNo(null);
    setSnapshots([]);
  }, [voyage?.id]);

  const result = useMemo(() => computeEstimate(inputs), [inputs]);

  const compareOptions = useMemo(
    () => [{ id: 'current', name: 'Current', result }, ...snapshots.map((s) => ({ id: s.id, name: s.name, result: s.result }))],
    [result, snapshots],
  );
  const best = useMemo(() => {
    const r = compareOptions.map((o) => o.result);
    return {
      profit: Math.max(...r.map((x) => x.profit)),
      cost: Math.min(...r.map((x) => x.totalExpense)),
      tce: Math.max(...r.map((x) => x.tce)),
      days: Math.min(...r.map((x) => x.voyageDays)),
    };
  }, [compareOptions]);
  const cargoTotals = useMemo(() => {
    const qty = inputs.cargoes.reduce((s, c) => s + c.quantity, 0);
    const tf = inputs.cargoes.reduce((s, c) => s + c.quantity * c.frt, 0);
    return { qty, tf, frtAvg: qty > 0 ? tf / qty : 0 };
  }, [inputs.cargoes]);

  if (!voyage) return <NoVesselSelected />;

  /* -------- mutation helpers -------- */
  const touch = () => setLastModified(fmtDate(new Date()));
  const patch = (p: Partial<EstimateInputs>) => {
    if (locked) return;
    setInputs((prev) => ({ ...prev, ...p }));
    touch();
  };
  const patchPerf = (p: Partial<Performance>) => patch({ perf: { ...inputs.perf, ...p } });
  const patchMain = (which: 'mainNormal' | 'mainEca', p: Partial<MainCons>) =>
    patchPerf({ [which]: { ...inputs.perf[which], ...p } } as Partial<Performance>);
  const patchSub = (which: 'subNormal' | 'subEca', p: Partial<SubCons>) =>
    patchPerf({ [which]: { ...inputs.perf[which], ...p } } as Partial<Performance>);
  const patchComm = (p: Partial<Commercial>) => patch({ commercial: { ...inputs.commercial, ...p } });

  const updateCargo = (id: string, p: Partial<Cargo>) =>
    patch({ cargoes: inputs.cargoes.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const addCargo = () =>
    patch({
      cargoes: [
        ...inputs.cargoes,
        { id: uid('cg'), account: '', name: '', loadPort: '', dischPort: '', quantity: 0, unit: 'MT', frt: 0, term: 'FIO', aCommPct: 3.75, brkgPct: 1.25, frtTaxPct: 0, linerTerm: 0 },
      ],
    });
  const removeCargo = (id: string) => patch({ cargoes: inputs.cargoes.filter((c) => c.id !== id) });

  const updatePort = (id: string, p: Partial<PortRow>) =>
    patch({ ports: inputs.ports.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const addPort = () =>
    patch({
      ports: [
        ...inputs.ports,
        { id: uid('pr'), type: 'Discharging', port: '', distance: 0, ecaDistance: 0, wf: 5, speed: inputs.perf.full.laden, ldRate: 0, idle: 0.5, work: 0, seaManual: 0, dem: 0, des: 0, portCharge: 0 },
      ],
    });
  const removePort = (id: string) => patch({ ports: inputs.ports.filter((r) => r.id !== id) });

  const setSpeedMode = (mode: 'Full' | 'Eco') => {
    if (locked) return;
    setInputs((prev) => ({ ...prev, perf: { ...prev.perf, speedMode: mode }, ports: setLegSpeeds(prev, prev.perf[mode === 'Full' ? 'full' : 'eco']) }));
    touch();
  };

  /* -------- header actions -------- */
  const newEstimate = () => {
    setInputs(seedInputs(voyage));
    setStatus('Estimate');
    setLocked(false);
    setFixtureNo(null);
    setSnapshots([]);
  };
  const save = () => touch();
  const changeStatus = (next: EstStatus) => {
    if (locked) return;
    setStatus(next);
  };
  const markFixed = () => {
    if (locked) return;
    setStatus('Fixed');
    setFixtureNo(`FIX-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
    setLocked(true);
  };

  /* -------- compare -------- */
  const captureSnapshot = () => {
    const name = snapshotName.trim() || `Option ${String.fromCharCode(65 + snapshots.length)}`;
    setSnapshots((s) => [...s, { id: uid('sn'), name, result }]);
    setSnapshotName('');
  };
  const removeSnapshot = (id: string) => setSnapshots((s) => s.filter((x) => x.id !== id));

  const stat = STATUS_META[status];
  const activeCanals = [inputs.canals.suez && 'SUEZ', inputs.canals.panama && 'PANAMA', inputs.canals.kiel && 'KIEL'].filter(Boolean).join(', ');
  const speeds = inputs.perf.speedMode === 'Full' ? 'full' : 'eco';

  /* inline cell renderers */
  const numCell = (value: number, onChange: (n: number) => void, min = 66) => (
    <input className="fv-ce__cell-num" style={{ minWidth: min }} type="number" value={value} disabled={locked} onChange={(e) => onChange(num(e.target.value))} />
  );
  const txtCell = (value: string, onChange: (v: string) => void, min = 120) => (
    <input className="fv-ce__cell-input" style={{ minWidth: min }} value={value} disabled={locked} onChange={(e) => onChange(e.target.value)} />
  );
  const kvIn = (label: string, value: number, onChange: (n: number) => void, pct?: boolean) => (
    <li className="fv-ce__kv-line">
      <span>{label}</span>
      <span className="fv-ce__kv-edit">
        <input type="number" value={value} disabled={locked} onChange={(e) => onChange(num(e.target.value))} />
        {pct && <em>%</em>}
      </span>
    </li>
  );
  const kvOut = (label: string, value: string) => (
    <li className="fv-ce__kv-line">
      <span>{label}</span>
      <span className="fv-ce__kv-out">{value}</span>
    </li>
  );

  return (
    <div className="fv-ce">
      {/* ============================ TOP HEADER ============================ */}
      <header className="fv-ce__header">
        <div className="fv-ce__title-block">
          <div className="fv-ce__title-row">
            <i className="fas fa-file-signature fv-ce__title-icon" aria-hidden="true" />
            <h1>Voyage Estimation</h1>
            <span className={`fv-ce__badge fv-ce__badge--${stat.color}`}>{status}</span>
            {fixtureNo && (
              <span className="fv-ce__fixture">
                <i className="fas fa-lock" aria-hidden="true" /> {fixtureNo}
              </span>
            )}
          </div>
          <div className="fv-ce__meta">
            <span><b>Estimation No.</b> {estNo}</span>
            <span><b>Created By</b> {voyage.pic}</span>
            <span><b>Last Modified</b> {lastModified}</span>
            <span><b>Customer</b> {voyage.client}</span>
            <span><b>PIC</b> {voyage.pic}</span>
            <span className="fv-ce__meta-status">
              <b>Status</b>
              <select value={status} disabled={locked} onChange={(e) => changeStatus(e.target.value as EstStatus)}>
                {STATUS_FLOW.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </span>
          </div>
        </div>

        <div className="fv-ce__actions">
          <button type="button" className="fv-ce__btn" onClick={newEstimate}><i className="fas fa-plus" /> New</button>
          <button type="button" className="fv-ce__btn" onClick={() => setSnapshots((s) => [...s, { id: uid('sn'), name: `Option ${String.fromCharCode(65 + s.length)}`, result }])}><i className="fas fa-clone" /> Duplicate</button>
          <button type="button" className={`fv-ce__btn${compareOpen ? ' fv-ce__btn--on' : ''}`} onClick={() => setCompareOpen((v) => !v)}><i className="fas fa-scale-balanced" /> Compare</button>
          <button type="button" className="fv-ce__btn fv-ce__btn--primary" onClick={save}><i className="fas fa-floppy-disk" /> Save</button>
          <button type="button" className="fv-ce__btn"><i className="fas fa-file-lines" /> Template</button>
          <button type="button" className="fv-ce__btn"><i className="fas fa-file-pdf" /> PDF</button>
          <button type="button" className="fv-ce__btn fv-ce__btn--amber" onClick={() => changeStatus('On Subs')} disabled={locked}><i className="fas fa-hourglass-half" /> On Subs</button>
          <button type="button" className="fv-ce__btn fv-ce__btn--green" onClick={markFixed} disabled={locked}><i className="fas fa-anchor" /> Mark Fixed</button>
          <button type="button" className="fv-ce__btn fv-ce__btn--danger" onClick={() => changeStatus('Cancelled')} disabled={locked}><i className="fas fa-ban" /> Cancel</button>
        </div>
      </header>

      {/* ===================== COMPARISON (toggle) ===================== */}
      {compareOpen && (
        <Section
          title="Comparison"
          icon="fa-scale-balanced"
          right={
            <span className="fv-ce__scenario-add">
              <input placeholder="Option name…" value={snapshotName} onChange={(e) => setSnapshotName(e.target.value)} />
              <button type="button" className="fv-ce__chip" onClick={captureSnapshot}><i className="fas fa-camera" /> Capture Current</button>
            </span>
          }
        >
          <div className="fv-ce__tablewrap">
            <table className="fv-ce__compare-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  {compareOptions.map((o) => (
                    <th key={o.id}>
                      {o.name}
                      {o.id !== 'current' && (
                        <button type="button" className="fv-ce__icon-btn" onClick={() => removeSnapshot(o.id)} title="Remove"><i className="fas fa-xmark" /></button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  ['Profit', (r: EstimateResult) => r.profit, (r: EstimateResult) => r.profit === best.profit],
                  ['Revenue', (r: EstimateResult) => r.revenue, () => false],
                  ['Expenses', (r: EstimateResult) => r.totalExpense, (r: EstimateResult) => r.totalExpense === best.cost],
                  ['TCE / Day', (r: EstimateResult) => r.tce, (r: EstimateResult) => r.tce === best.tce],
                  ['Voyage Days', (r: EstimateResult) => r.voyageDays, (r: EstimateResult) => r.voyageDays === best.days],
                  ['Total Hire', (r: EstimateResult) => r.totalHire, () => false],
                  ['Bunker', (r: EstimateResult) => r.bunkerExpense, () => false],
                  ['Profit %', (r: EstimateResult) => r.profitPct, () => false],
                ] as [string, (r: EstimateResult) => number, (r: EstimateResult) => boolean][]).map(([label, get, isBest]) => (
                  <tr key={label}>
                    <td className="fv-ce__compare-metric">{label}</td>
                    {compareOptions.map((o) => (
                      <td key={o.id} className={`fv-ce__r${isBest(o.result) ? ' fv-ce__cell-best' : ''}`}>
                        {label.includes('%') ? `${fmt(get(o.result))}%` : label === 'Voyage Days' ? fmt(get(o.result), 2) : money(get(o.result))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fv-ce__hint">Capture the current estimate as an option, adjust vessel / cargo / speed / freight, then compare. Green cells mark the best profit, lowest cost, highest TCE and fastest voyage.</p>
        </Section>
      )}

      {/* ===================== VESSEL PARTICULAR ===================== */}
      <Section
        title="Vessel Particular"
        icon="fa-ship"
        right={
          <div className="fv-ce__search">
            <i className="fas fa-magnifying-glass" aria-hidden="true" />
            <input placeholder="Search vessel…" value={vessel.name} disabled={locked} onChange={(e) => setVessel((v) => ({ ...v, name: e.target.value }))} />
          </div>
        }
      >
        <div className="fv-ce__vp">
          <div className="fv-ce__tablewrap">
            <table className="fv-ce__table fv-ce__table--vp">
              <thead>
                <tr>
                  <th>MV</th>
                  <th className="fv-ce__r">DWT</th>
                  <th className="fv-ce__r">Draft (M)</th>
                  <th className="fv-ce__r">TPC</th>
                  <th className="fv-ce__r">Built</th>
                  <th>Kind</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{txtCell(vessel.name, (v) => setVessel((s) => ({ ...s, name: v })), 150)}</td>
                  <td className="fv-ce__r">{numCell(vessel.dwt, (n) => setVessel((s) => ({ ...s, dwt: n })), 80)}</td>
                  <td className="fv-ce__r">{numCell(vessel.draft, (n) => setVessel((s) => ({ ...s, draft: n })), 60)}</td>
                  <td className="fv-ce__r">{numCell(vessel.tpc, (n) => setVessel((s) => ({ ...s, tpc: n })), 56)}</td>
                  <td className="fv-ce__r">{numCell(vessel.built, (n) => setVessel((s) => ({ ...s, built: n })), 60)}</td>
                  <td>{txtCell(vessel.kind, (v) => setVessel((s) => ({ ...s, kind: v })), 70)}</td>
                  <td>{txtCell(vessel.type, (v) => setVessel((s) => ({ ...s, type: v })), 70)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="fv-ce__vp-speed">
            <div className="fv-ce__vp-modes">
              <label className={`fv-ce__radio${inputs.perf.speedMode === 'Full' ? ' fv-ce__radio--on' : ''}`}>
                <input type="radio" name="speedMode" checked={inputs.perf.speedMode === 'Full'} disabled={locked} onChange={() => setSpeedMode('Full')} /> Full
              </label>
              <label className={`fv-ce__radio${inputs.perf.speedMode === 'Eco' ? ' fv-ce__radio--on' : ''}`}>
                <input type="radio" name="speedMode" checked={inputs.perf.speedMode === 'Eco'} disabled={locked} onChange={() => setSpeedMode('Eco')} /> Eco
              </label>
            </div>
            <table className="fv-ce__table fv-ce__table--mini">
              <thead>
                <tr>
                  <th className="fv-ce__r">Ballast</th>
                  <th className="fv-ce__r">Laden</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="fv-ce__r">{numCell(inputs.perf[speeds].ballast, (n) => patchPerf({ [speeds]: { ...inputs.perf[speeds], ballast: n } } as Partial<Performance>), 56)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf[speeds].laden, (n) => patchPerf({ [speeds]: { ...inputs.perf[speeds], laden: n } } as Partial<Performance>), 56)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="fv-ce__tablewrap">
            <table className="fv-ce__table fv-ce__table--mini">
              <thead>
                <tr>
                  <th>Main</th>
                  <th>Type</th>
                  <th className="fv-ce__r">Ballast</th>
                  <th className="fv-ce__r">Laden</th>
                  <th className="fv-ce__r">Idle</th>
                  <th className="fv-ce__r">Work</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Normal</td>
                  <td>{txtCell(inputs.perf.mainNormal.type, (v) => patchMain('mainNormal', { type: v }), 70)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.mainNormal.ballast, (n) => patchMain('mainNormal', { ballast: n }), 56)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.mainNormal.laden, (n) => patchMain('mainNormal', { laden: n }), 56)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.mainNormal.idle, (n) => patchMain('mainNormal', { idle: n }), 50)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.mainNormal.work, (n) => patchMain('mainNormal', { work: n }), 50)}</td>
                </tr>
                <tr>
                  <td>ECA</td>
                  <td>{txtCell(inputs.perf.mainEca.type, (v) => patchMain('mainEca', { type: v }), 70)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.mainEca.ballast, (n) => patchMain('mainEca', { ballast: n }), 56)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.mainEca.laden, (n) => patchMain('mainEca', { laden: n }), 56)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.mainEca.idle, (n) => patchMain('mainEca', { idle: n }), 50)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.mainEca.work, (n) => patchMain('mainEca', { work: n }), 50)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="fv-ce__tablewrap">
            <table className="fv-ce__table fv-ce__table--mini">
              <thead>
                <tr>
                  <th>Sub</th>
                  <th>Type</th>
                  <th className="fv-ce__r">Sea</th>
                  <th className="fv-ce__r">Idle</th>
                  <th className="fv-ce__r">Work</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Normal</td>
                  <td>{txtCell(inputs.perf.subNormal.type, (v) => patchSub('subNormal', { type: v }), 70)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.subNormal.sea, (n) => patchSub('subNormal', { sea: n }), 50)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.subNormal.idle, (n) => patchSub('subNormal', { idle: n }), 50)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.subNormal.work, (n) => patchSub('subNormal', { work: n }), 50)}</td>
                </tr>
                <tr>
                  <td>ECA</td>
                  <td>{txtCell(inputs.perf.subEca.type, (v) => patchSub('subEca', { type: v }), 70)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.subEca.sea, (n) => patchSub('subEca', { sea: n }), 50)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.subEca.idle, (n) => patchSub('subEca', { idle: n }), 50)}</td>
                  <td className="fv-ce__r">{numCell(inputs.perf.subEca.work, (n) => patchSub('subEca', { work: n }), 50)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* ===================== CARGO ===================== */}
      <Section
        title="Cargo"
        icon="fa-boxes-stacked"
        right={
          <div className="fv-ce__port-head">
            <button type="button" className="fv-ce__chip"><i className="fas fa-calculator" /> Loadable Quantity Calculator</button>
            <button type="button" className="fv-ce__chip"><i className="fas fa-chart-simple" /> Frt. Simulator</button>
            <button type="button" className="fv-ce__chip" onClick={addCargo} disabled={locked}><i className="fas fa-plus" /> Add Cargo</button>
          </div>
        }
      >
        <div className="fv-ce__tablewrap">
          <table className="fv-ce__table">
            <thead>
              <tr>
                <th className="fv-ce__num">#</th>
                <th>Account</th>
                <th>Cargo Name</th>
                <th>Loading Port</th>
                <th>Discharging Port</th>
                <th className="fv-ce__r">Quantity</th>
                <th className="fv-ce__r">Frt</th>
                <th>Term</th>
                <th className="fv-ce__r">Total Freight</th>
                <th className="fv-ce__r">A. Comm</th>
                <th className="fv-ce__r">Brkg</th>
                <th className="fv-ce__r">Frt Tax</th>
                <th className="fv-ce__r">Liner Term</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {inputs.cargoes.map((c, idx) => (
                <tr key={c.id}>
                  <td className="fv-ce__num">{idx + 1}</td>
                  <td>{txtCell(c.account, (v) => updateCargo(c.id, { account: v }), 90)}</td>
                  <td>{txtCell(c.name, (v) => updateCargo(c.id, { name: v }), 100)}</td>
                  <td>{txtCell(c.loadPort, (v) => updateCargo(c.id, { loadPort: v }), 150)}</td>
                  <td>{txtCell(c.dischPort, (v) => updateCargo(c.id, { dischPort: v }), 150)}</td>
                  <td className="fv-ce__r fv-ce__qty">{numCell(c.quantity, (n) => updateCargo(c.id, { quantity: n }), 76)}<span className="fv-ce__unit">{c.unit}</span></td>
                  <td className="fv-ce__r">{numCell(c.frt, (n) => updateCargo(c.id, { frt: n }), 56)}</td>
                  <td>{txtCell(c.term, (v) => updateCargo(c.id, { term: v }), 54)}</td>
                  <td className="fv-ce__r fv-ce__calc">{fmt(c.quantity * c.frt)}</td>
                  <td className="fv-ce__r">{numCell(c.aCommPct, (n) => updateCargo(c.id, { aCommPct: n }), 54)}<span className="fv-ce__unit">%</span></td>
                  <td className="fv-ce__r">{numCell(c.brkgPct, (n) => updateCargo(c.id, { brkgPct: n }), 52)}<span className="fv-ce__unit">%</span></td>
                  <td className="fv-ce__r">{numCell(c.frtTaxPct, (n) => updateCargo(c.id, { frtTaxPct: n }), 52)}<span className="fv-ce__unit">%</span></td>
                  <td className="fv-ce__r">{numCell(c.linerTerm, (n) => updateCargo(c.id, { linerTerm: n }), 66)}</td>
                  <td>
                    {inputs.cargoes.length > 1 && (
                      <button type="button" className="fv-ce__icon-btn" onClick={() => removeCargo(c.id)} disabled={locked} title="Remove cargo">
                        <i className="fas fa-xmark" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="fv-ce__total">
                <td colSpan={5}>Total</td>
                <td className="fv-ce__r">{fmt(cargoTotals.qty)}</td>
                <td className="fv-ce__r">{fmt(cargoTotals.frtAvg)}</td>
                <td />
                <td className="fv-ce__r">{fmt(cargoTotals.tf)}</td>
                <td className="fv-ce__r">{fmt(cargoTotals.tf > 0 ? (result.addComm / cargoTotals.tf) * 100 : 0)} %</td>
                <td className="fv-ce__r">{fmt(cargoTotals.tf > 0 ? (result.brokerage / cargoTotals.tf) * 100 : 0)} %</td>
                <td className="fv-ce__r">{fmt(cargoTotals.tf > 0 ? (result.freightTax / cargoTotals.tf) * 100 : 0)} %</td>
                <td className="fv-ce__r">{fmt(result.linerTermTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>

      {/* ===================== PORT ROTATION ===================== */}
      <Section
        title="Port Rotation"
        icon="fa-route"
        right={
          <div className="fv-ce__port-head">
            <label className="fv-ce__check"><input type="checkbox" checked={inputs.canals.suez} disabled={locked} onChange={(e) => patch({ canals: { ...inputs.canals, suez: e.target.checked } })} /> SUEZ</label>
            <label className="fv-ce__check"><input type="checkbox" checked={inputs.canals.panama} disabled={locked} onChange={(e) => patch({ canals: { ...inputs.canals, panama: e.target.checked } })} /> PANAMA</label>
            <label className="fv-ce__check"><input type="checkbox" checked={inputs.canals.kiel} disabled={locked} onChange={(e) => patch({ canals: { ...inputs.canals, kiel: e.target.checked } })} /> KIEL</label>
            <button type="button" className="fv-ce__chip" onClick={addPort} disabled={locked}><i className="fas fa-plus" /> Add Port</button>
          </div>
        }
      >
        <div className="fv-ce__port-summary">
          Total Duration: {fmt(result.voyageDays, 2)} Days (Ballast: {fmt(result.ballastDays, 2)}, Laden: {fmt(result.ladenDays, 2)}, ECA: {fmt(result.ecaDays, 2)}, Port: {fmt(result.portDays, 2)}) · (Port local time) {result.startStr} ~ {result.endStr}
          {activeCanals && <> · Canals: {activeCanals}</>}
        </div>
        <div className="fv-ce__tablewrap">
          <table className="fv-ce__table">
            <thead>
              <tr>
                <th className="fv-ce__num">#</th>
                <th>Type</th>
                <th>Port Name or Coordinates</th>
                <th className="fv-ce__r" colSpan={2}>Distance / ECA</th>
                <th className="fv-ce__r">W.F</th>
                <th className="fv-ce__r">Spd</th>
                <th className="fv-ce__r">Sea</th>
                <th className="fv-ce__r">L / D Rate</th>
                <th className="fv-ce__r" colSpan={2}>Port (I / W)</th>
                <th className="fv-ce__r">Dem</th>
                <th className="fv-ce__r">Des</th>
                <th className="fv-ce__r">Port Charge</th>
                <th>Arrival</th>
                <th>Departure</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {inputs.ports.map((p, idx) => {
                const leg = result.perLeg[idx];
                const isMargin = p.type === 'Margin';
                return (
                  <tr key={p.id}>
                    <td className="fv-ce__num">{idx + 1}</td>
                    <td>
                      <select className="fv-ce__cell-select" value={p.type} disabled={locked} onChange={(e) => updatePort(p.id, { type: e.target.value as LegType })}>
                        {LEG_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{txtCell(p.port, (v) => updatePort(p.id, { port: v }), 160)}</td>
                    <td className="fv-ce__r">{isMargin ? <span className="fv-ce__muted-cell">—</span> : numCell(p.distance, (n) => updatePort(p.id, { distance: n }), 60)}</td>
                    <td className="fv-ce__r">{isMargin ? <span className="fv-ce__muted-cell">—</span> : numCell(p.ecaDistance, (n) => updatePort(p.id, { ecaDistance: n }), 50)}</td>
                    <td className="fv-ce__r">{isMargin ? <span className="fv-ce__muted-cell">—</span> : numCell(p.wf, (n) => updatePort(p.id, { wf: n }), 44)}</td>
                    <td className="fv-ce__r">{isMargin ? <span className="fv-ce__muted-cell">—</span> : numCell(p.speed, (n) => updatePort(p.id, { speed: n }), 48)}</td>
                    <td className="fv-ce__r">{isMargin ? numCell(p.seaManual, (n) => updatePort(p.id, { seaManual: n }), 48) : <span className="fv-ce__calc">{leg ? fmt(leg.sea, 2) : '—'}</span>}</td>
                    <td className="fv-ce__r">{isMargin ? <span className="fv-ce__muted-cell">—</span> : numCell(p.ldRate, (n) => updatePort(p.id, { ldRate: n }), 74)}</td>
                    <td className="fv-ce__r">{numCell(p.idle, (n) => updatePort(p.id, { idle: n }), 44)}</td>
                    <td className="fv-ce__r">{numCell(p.work, (n) => updatePort(p.id, { work: n }), 44)}</td>
                    <td className="fv-ce__r">{numCell(p.dem, (n) => updatePort(p.id, { dem: n }))}</td>
                    <td className="fv-ce__r">{numCell(p.des, (n) => updatePort(p.id, { des: n }))}</td>
                    <td className="fv-ce__r">{numCell(p.portCharge, (n) => updatePort(p.id, { portCharge: n }), 80)}</td>
                    <td className="fv-ce__calc">{leg?.arrival ?? '—'}</td>
                    <td className="fv-ce__calc">{leg?.departure ?? '—'}</td>
                    <td>
                      {inputs.ports.length > 1 && (
                        <button type="button" className="fv-ce__icon-btn" onClick={() => removePort(p.id)} disabled={locked} title="Remove leg">
                          <i className="fas fa-xmark" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="fv-ce__total">
                <td colSpan={3}>Total</td>
                <td className="fv-ce__r">{fmt(result.distanceTotal, 0)}</td>
                <td className="fv-ce__r">{fmt(result.ecaDistanceTotal, 0)}</td>
                <td colSpan={2} />
                <td className="fv-ce__r">{fmt(result.seaDays, 2)}</td>
                <td />
                <td className="fv-ce__r">{fmt(result.idleTotal, 2)}</td>
                <td className="fv-ce__r">{fmt(result.workTotal, 2)}</td>
                <td className="fv-ce__r">{fmt(result.demTotal)}</td>
                <td className="fv-ce__r">{fmt(result.desTotal)}</td>
                <td className="fv-ce__r">{fmt(result.portCharge)}</td>
                <td>{result.startStr}</td>
                <td>{result.endStr}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="fv-ce__port-foot">
          <button type="button" className="fv-ce__chip">Get Distance (F9)</button>
          <button type="button" className="fv-ce__chip">To Distance (F10)</button>
          <button type="button" className="fv-ce__chip">To Operation</button>
          <span className="fv-ce__port-foot-right">
            <span className="fv-ce__chip fv-ce__chip--on">Port Local</span>
            <span className="fv-ce__chip">PC Time</span>
          </span>
        </div>
      </Section>

      {/* ============= OPERATION EXPENSE | BUNKER EXPENSE | RESULT ============= */}
      <div className="fv-ce__panels3">
        {/* Operation Expense */}
        <Section title="Operation Expense" icon="fa-file-invoice-dollar">
          <div className="fv-ce__kv2">
            <ul className="fv-ce__kv-list">
              {kvOut('Dem / Des', money(result.demDes))}
              {kvOut('Add Comm.', money(result.addComm))}
              {kvOut('Brokerage', money(result.brokerage))}
              {kvOut('Freight Tax', money(result.freightTax))}
              {kvIn('Liner Terms', inputs.commercial.linerTerms, (n) => patchComm({ linerTerms: n }))}
              {kvOut('Port Charge', money(result.portCharge))}
            </ul>
            <ul className="fv-ce__kv-list">
              {kvOut('Bunker Expense', money(result.bunkerExpense))}
              {kvIn('C.E.V.', inputs.commercial.cev, (n) => patchComm({ cev: n }))}
              {kvIn('ILOHC', inputs.commercial.ilohc, (n) => patchComm({ ilohc: n }))}
              {kvIn('Ballast Bonus', inputs.commercial.ballastBonus, (n) => patchComm({ ballastBonus: n }))}
              {kvIn('Routing Service', inputs.commercial.routingService, (n) => patchComm({ routingService: n }))}
              {kvIn('Others', inputs.commercial.others, (n) => patchComm({ others: n }))}
            </ul>
          </div>
          <div className="fv-ce__kv-line fv-ce__kv-line--sub">
            <span>Total Operation Expense</span>
            <span className="fv-ce__kv-out">{money(result.opExpense)}</span>
          </div>
        </Section>

        {/* Bunker Expense */}
        <Section
          title="Bunker Expense"
          icon="fa-gas-pump"
          right={
            <div className="fv-ce__port-head">
              <span className="fv-ce__chip fv-ce__chip--on"><i className="fas fa-list" /> Bunker Index</span>
              <span className="fv-ce__chip">Recent</span>
              <span className="fv-ce__chip"><i className="fas fa-gas-pump" /> Bunker Simulator</span>
            </div>
          }
        >
          <div className="fv-ce__tablewrap">
            <table className="fv-ce__table">
              <thead>
                <tr>
                  <th>Grade</th>
                  <th className="fv-ce__r">Price / MT</th>
                  <th className="fv-ce__r">Consumption</th>
                  <th className="fv-ce__r">Expense</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>VLSFO</td>
                  <td className="fv-ce__r">{numCell(inputs.commercial.vlsfoPrice, (n) => patchComm({ vlsfoPrice: n }), 70)}</td>
                  <td className="fv-ce__r fv-ce__calc">{fmt(result.vlsfoCons)}</td>
                  <td className="fv-ce__r fv-ce__calc">{fmt(result.vlsfoExp)}</td>
                </tr>
                <tr>
                  <td>MGO</td>
                  <td className="fv-ce__r">{numCell(inputs.commercial.mgoPrice, (n) => patchComm({ mgoPrice: n }), 70)}</td>
                  <td className="fv-ce__r fv-ce__calc">{fmt(result.mgoCons)}</td>
                  <td className="fv-ce__r fv-ce__calc">{fmt(result.mgoExp)}</td>
                </tr>
                <tr>
                  <td>ULSFO</td>
                  <td className="fv-ce__r">{numCell(inputs.commercial.ulsfoPrice, (n) => patchComm({ ulsfoPrice: n }), 70)}</td>
                  <td className="fv-ce__r fv-ce__calc">{fmt(result.ulsfoCons)}</td>
                  <td className="fv-ce__r fv-ce__calc">{fmt(result.ulsfoExp)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="fv-ce__total">
                  <td colSpan={3}>Total Bunker Expense</td>
                  <td className="fv-ce__r">{fmt(result.bunkerExpense)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Section>

        {/* Result */}
        <Section
          title="Result"
          icon="fa-chart-line"
          right={
            <div className="fv-ce__port-head">
              <span className="fv-ce__chip"><i className="fas fa-plus" /> Result Plus</span>
              <span className="fv-ce__chip"><i className="fas fa-chart-line" /> Analyzer</span>
              <span className="fv-ce__chip"><i className="fas fa-note-sticky" /> Remark</span>
            </div>
          }
        >
          <div className="fv-ce__kv2">
            <ul className="fv-ce__kv-list">
              {kvIn('Hire / Day', inputs.commercial.dailyHire, (n) => patchComm({ dailyHire: n }))}
              {kvIn('H / Add Comm.', inputs.commercial.hAddCommPct, (n) => patchComm({ hAddCommPct: n }), true)}
              {kvOut('Net Hire', money(result.netHire))}
              {kvOut('C / Base (TCE)', money(result.tce))}
            </ul>
            <ul className="fv-ce__kv-list">
              {kvOut('Revenue', money(result.revenue))}
              {kvOut('Op. Expense', money(result.opExpense))}
              <li className="fv-ce__kv-line fv-ce__kv-line--sub"><span>Op. Profit</span><span className="fv-ce__kv-out">{money(result.opProfit)}</span></li>
              {kvOut('Total Hire', money(result.totalHire))}
              {kvOut('Total Expense', money(result.totalExpense))}
            </ul>
          </div>
          <div className={`fv-ce__kv-line fv-ce__kv-line--profit${result.profit < 0 ? ' fv-ce__kv-line--loss' : ''}`}>
            <span>PROFIT (USD)</span>
            <span className="fv-ce__kv-out">{money(result.profit)} · {fmt(result.profitPct)}%</span>
          </div>
        </Section>
      </div>
    </div>
  );
}
