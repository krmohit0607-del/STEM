import { useEffect, useMemo, useRef, useState } from 'react';

import { useSelectedVoyage } from '../data/selectedVoyage';
import type { Voyage } from '../data/voyages';
import { loadOpsRecap, readOpsRecapRaw, writeOpsRecapRaw, subscribeOpsRecap } from '../data/opsRecap';
import {
  defaultEmissionsDoc, loadEmissionsDoc, readEmissionsRaw, writeEmissionsRaw, subscribeEmissionsDoc,
  type EmissionsDoc, type EmissionAdjustment,
} from '../data/emissions';
import { NoVesselSelected } from './NoVesselSelected';
import { EuaCard, seedRecap, type Recap } from './OperationsPage';
import { EmBadge, EmStat, EmSection, EmCard, EmCalc, EmLine, EmBars, EmDonut, EmRatingBand, type Tone } from './EmissionsWidgets';

/* ------------------------------------------------------------------ utils */

function num(v: string | undefined): number {
  const n = parseFloat(String(v ?? '').replace(/[,$%€]/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function fmt(n: number, dp = 1): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
const usd = (n: number) => `$${fmt(n, 0)}`;
const eur = (n: number) => `€${fmt(n, 0)}`;
function uid(p: string): string { return `${p}-${Math.random().toString(36).slice(2, 8)}`; }
function parseDMY(s: string): Date | null {
  const m = String(s).match(/(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0));
}
function daysBetween(a: Date | null, b: Date | null): number {
  if (!a || !b) return 0;
  return Math.max(0, (b.getTime() - a.getTime()) / 86_400_000);
}
const todayStr = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`; };

// CO2 emission factors (t-CO2 / t-fuel), IMO / EU MRV.
const EF: Record<string, number> = { VLSFO: 3.151, LSFO: 3.151, ULSFO: 3.151, HFO: 3.114, HSFO: 3.114, LSMGO: 3.206, MGO: 3.206, MDO: 3.206, LNG: 2.750 };
const efOf = (fuel: string) => EF[(fuel || '').trim().toUpperCase()] ?? 3.114;

interface LegRow { from: string; to: string; fuel: string; cons: number; factor: number; co2: number; distance: number; cargo: number }

/* ------------------------------------------------------ derived metrics */

function computeMetrics(recap: Recap, doc: EmissionsDoc) {
  // Itinerary distance & per-fuel consumption from the ETA & ROB legs.
  const legs = recap.etaPlan?.legs ?? [];
  let distance = 0; let fuelVitn = 0; let fuelMitn = 0; const legRows: LegRow[] = [];
  legs.forEach((l) => {
    if (l.kind === 'sea') {
      const dist = num(l.distNonEca) + num(l.distEca);
      const eff = Math.max(0.1, num(l.speed) * (1 - num(l.wf) / 100));
      const days = dist > 0 ? dist / (eff * 24) : 0;
      const cV = num(l.consVlsfo) * days; const cM = num(l.consMgo) * days;
      distance += dist; fuelVitn += cV; fuelMitn += cM;
      if (dist > 0) {
        legRows.push({ from: l.from, to: l.to, fuel: 'VLSFO', cons: cV, factor: efOf('VLSFO'), co2: cV * efOf('VLSFO'), distance: dist, cargo: num(recap.finalQtyLoaded) });
        legRows.push({ from: l.from, to: l.to, fuel: 'LSMGO', cons: cM, factor: efOf('LSMGO'), co2: cM * efOf('LSMGO'), distance: dist, cargo: num(recap.finalQtyLoaded) });
      }
    } else {
      const cV = num(l.consVlsfo) * num(l.portDays); const cM = num(l.consMgo) * num(l.portDays);
      fuelVitn += cV; fuelMitn += cM;
    }
  });
  const fuelV = num(recap.foCons) > 0 ? num(recap.foCons) : fuelVitn;
  const fuelM = num(recap.doCons) > 0 ? num(recap.doCons) : fuelMitn;
  const fuelTotal = fuelV + fuelM;
  const cargo = num(recap.finalQtyLoaded);
  const days = daysBetween(parseDMY(recap.deliveryDateTime), parseDMY(recap.redeliveryDateTime)) || 1;

  const co2Base = fuelV * efOf('VLSFO') + fuelM * efOf('LSMGO');
  const co2Adj = num(doc.co2AdjustmentT);
  const co2 = co2Base + co2Adj;
  const ch4 = fuelTotal * 0.00006;   // t CH4
  const n2o = fuelTotal * 0.00016;   // t N2O
  const co2e = co2 + ch4 * 29.8 + n2o * 273;

  const co2PerDay = co2 / days;
  const co2PerNm = distance > 0 ? (co2 * 1000) / distance : 0;   // kg / nm
  const co2PerCargo = cargo > 0 ? co2 / cargo : 0;               // t / t

  // EU ETS — reuse the voyage EUA record when present, else derive.
  const eua = recap.eua;
  let euasRequired: number; let applicableCo2: number;
  if (eua && Array.isArray(eua.legs) && eua.legs.length) {
    const phaseIn = num(eua.phaseInPct) / 100;
    applicableCo2 = eua.legs.reduce((s, l) => s + num(l.cons) * (num(l.emissionFactor) || efOf(l.fuel)) * (num(l.phasePct) / 100), 0);
    euasRequired = applicableCo2 * phaseIn;
  } else {
    applicableCo2 = co2 * 0.5;      // assume EU↔non-EU voyage (50% scope)
    euasRequired = applicableCo2 * 0.70; // 2026 phase-in
  }
  const euaPrice = num(doc.euaPriceEur) || 72.5;
  const bought = eua?.ledger?.filter((x) => /buy|bought/i.test(x.type)).reduce((s, x) => s + num(x.qty), 0) ?? 0;
  const usedEua = eua?.ledger?.filter((x) => /use|surrender/i.test(x.type)).reduce((s, x) => s + num(x.qty), 0) ?? 0;
  const euaBalance = bought - usedEua;
  const carbonCost = euasRequired * euaPrice;

  // CII / AER / EEOI
  const dwt = num((recap.cpQuantity || '').split('/')[0]) || cargo || 75000;
  const aer = distance > 0 && dwt > 0 ? (co2 * 1e6) / (dwt * distance) : 0; // g CO2 / dwt·nm
  const eeoi = distance > 0 && cargo > 0 ? (co2 * 1e6) / (cargo * distance) : 0;
  const requiredAer = 6.5; // sample reference (bulk) g/dwt·nm
  const ratio = requiredAer > 0 ? aer / requiredAer : 1;
  const rating = ratio <= 0.86 ? 'A' : ratio <= 0.94 ? 'B' : ratio <= 1.06 ? 'C' : ratio <= 1.18 ? 'D' : 'E';
  const forecastRating = ratio <= 0.9 ? 'A' : ratio <= 0.98 ? 'B' : ratio <= 1.1 ? 'C' : ratio <= 1.2 ? 'D' : 'E';

  // FuelEU Maritime — GHG intensity (well-to-wake, gCO2e/MJ)
  const energyMJ = fuelV * 1000 * 40.2 + fuelM * 1000 * 42.7; // kg × LCV(MJ/kg)
  const ghgIntensity = energyMJ > 0 ? (co2e * 1e6) / energyMJ : 0;
  const fuelEuTarget = 89.34; // 2025 target gCO2e/MJ
  const complianceBalanceT = ((fuelEuTarget - ghgIntensity) * energyMJ) / 1e6; // t CO2e (+surplus / −deficit)
  const fuelEuPenalty = complianceBalanceT < 0 ? Math.abs(complianceBalanceT) * 640 : 0; // €2400/t·VLSFOe approx simplified
  const fuelEuStatus: Tone = complianceBalanceT >= 0 ? 'good' : 'bad';

  // Weather routing savings (from the plan weather margin — indicative).
  const wxMargin = num(recap.etaPlan?.weatherMargin) / 100 || 0.05;
  const fuelSaved = fuelTotal * wxMargin * 0.4;
  const co2Saved = fuelSaved * efOf('VLSFO');
  const moneySaved = fuelSaved * num(recap.foPrice);
  const etsSaved = co2Saved * 0.5 * 0.70 * euaPrice;

  return {
    fuelV, fuelM, fuelTotal, cargo, days, distance, legRows,
    co2Base, co2Adj, co2, ch4, n2o, co2e, co2PerDay, co2PerNm, co2PerCargo,
    applicableCo2, euasRequired, euaPrice, bought, usedEua, euaBalance, carbonCost,
    dwt, aer, eeoi, requiredAer, ratio, rating, forecastRating,
    energyMJ, ghgIntensity, fuelEuTarget, complianceBalanceT, fuelEuPenalty, fuelEuStatus,
    fuelSaved, co2Saved, moneySaved, etsSaved,
  };
}
type Metrics = ReturnType<typeof computeMetrics>;

// Deterministic monthly series so the trend charts look realistic per voyage.
function series(base: number, seed = 1, n = 12): number[] {
  return Array.from({ length: n }, (_, i) => Math.max(0, base * (0.72 + 0.42 * Math.abs(Math.sin(i * 1.27 + seed)))));
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* -------------------------------------------------------------- data loader */

export function EmissionsPage() {
  const voyage = useSelectedVoyage();

  const [recap, setRecap] = useState<Recap>(() => {
    const loaded = loadOpsRecap(voyage?.id);
    return loaded ? { ...seedRecap(voyage), ...(loaded as Partial<Recap>) } : seedRecap(voyage);
  });
  const [doc, setDocState] = useState<EmissionsDoc>(() => loadEmissionsDoc(voyage?.id) ?? defaultEmissionsDoc());
  const lastRecap = useRef<string>(readOpsRecapRaw(voyage?.id) ?? '');
  const lastDoc = useRef<string>(readEmissionsRaw(voyage?.id) ?? '');

  useEffect(() => {
    const loaded = loadOpsRecap(voyage?.id);
    setRecap(loaded ? { ...seedRecap(voyage), ...(loaded as Partial<Recap>) } : seedRecap(voyage));
    lastRecap.current = readOpsRecapRaw(voyage?.id) ?? '';
    setDocState(loadEmissionsDoc(voyage?.id) ?? defaultEmissionsDoc());
    lastDoc.current = readEmissionsRaw(voyage?.id) ?? '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyage?.id]);

  useEffect(() => {
    if (!voyage) return;
    const raw = JSON.stringify(recap);
    if (raw === lastRecap.current) return;
    lastRecap.current = raw;
    writeOpsRecapRaw(voyage.id, raw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recap, voyage?.id]);

  useEffect(() => {
    if (!voyage) return;
    const raw = JSON.stringify(doc);
    if (raw === lastDoc.current) return;
    lastDoc.current = raw;
    writeEmissionsRaw(voyage.id, raw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, voyage?.id]);

  useEffect(() => {
    if (!voyage) return;
    const un1 = subscribeOpsRecap(voyage.id, () => {
      const raw = readOpsRecapRaw(voyage.id);
      if (raw && raw !== lastRecap.current) { lastRecap.current = raw; try { setRecap((p) => ({ ...p, ...(JSON.parse(raw) as Partial<Recap>) })); } catch { /* ignore */ } }
    });
    const un2 = subscribeEmissionsDoc(voyage.id, () => {
      const raw = readEmissionsRaw(voyage.id);
      if (raw && raw !== lastDoc.current) { lastDoc.current = raw; try { setDocState(JSON.parse(raw) as EmissionsDoc); } catch { /* ignore */ } }
    });
    return () => { un1(); un2(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyage?.id]);

  if (!voyage) return <NoVesselSelected />;
  return <EmissionsWorkspace voyage={voyage} recap={recap} setRecap={setRecap} doc={doc} setDoc={setDocState} />;
}

/* --------------------------------------------------------------- workspace */

type TabId = 'dashboard' | 'emissions' | 'trading' | 'performance' | 'compliance' | 'reports';
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'fa-gauge-high' },
  { id: 'emissions', label: 'Emissions', icon: 'fa-smog' },
  { id: 'trading', label: 'Carbon Trading', icon: 'fa-coins' },
  { id: 'performance', label: 'Performance', icon: 'fa-chart-line' },
  { id: 'compliance', label: 'Compliance', icon: 'fa-clipboard-check' },
  { id: 'reports', label: 'Reports', icon: 'fa-file-export' },
];

const ratingTone = (r: string): Tone => (r === 'A' || r === 'B' ? 'good' : r === 'C' ? 'warn' : 'bad');
const statusTone = (s: string): Tone => (/verified|approved|ready/i.test(s) ? 'good' : /submitted/i.test(s) ? 'info' : /rejected/i.test(s) ? 'bad' : 'warn');

function EmissionsWorkspace({ voyage, recap, setRecap, doc, setDoc }: {
  voyage: Voyage; recap: Recap; setRecap: React.Dispatch<React.SetStateAction<Recap>>;
  doc: EmissionsDoc; setDoc: React.Dispatch<React.SetStateAction<EmissionsDoc>>;
}) {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [editing, setEditing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const m = useMemo(() => computeMetrics(recap, doc), [recap, doc]);

  const patchDoc = (p: Partial<EmissionsDoc>) => setDoc((d) => ({ ...d, ...p }));
  const notify = (msg: string) => { setFlash(msg); window.setTimeout(() => setFlash(null), 2600); };

  const overallCompliance = useMemo(() => {
    const vals = Object.values(doc.compliance);
    if (vals.some((c) => /rejected/i.test(c.status))) return 'Action Required';
    if (vals.some((c) => /pending/i.test(c.status))) return 'In Progress';
    return 'Compliant';
  }, [doc.compliance]);

  const save = () => { patchDoc({ updatedAt: new Date().toLocaleString() }); setEditing(false); notify('Saved.'); };
  const approve = () => { patchDoc({ approvedBy: 'Operator', approvedDate: todayStr(), updatedAt: new Date().toLocaleString() }); notify('Approved.'); };
  const refresh = () => { setDoc(loadEmissionsDoc(voyage.id) ?? doc); notify('Refreshed from store.'); };
  const recalc = () => notify('Recalculated from latest voyage data.');

  const exportTable = () => {
    const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const kpi = [
      ['Vessel', recap.vesselName], ['IMO', voyage.imo || '—'], ['Voyage', voyage.id], ['Compliance Year', doc.complianceYear],
      ['Total CO₂ (t)', fmt(m.co2, 1)], ['CO₂e (t)', fmt(m.co2e, 1)], ['Fuel Consumed (t)', fmt(m.fuelTotal, 1)], ['Distance (nm)', fmt(m.distance, 0)],
      ['CII Rating', m.rating], ['AER', fmt(m.aer, 3)], ['EEOI', fmt(m.eeoi, 3)],
      ['EUAs Required', fmt(m.euasRequired, 1)], ['EUA Price (€)', fmt(m.euaPrice, 2)], ['Carbon Cost (€)', fmt(m.carbonCost, 0)],
      ['FuelEU GHG Intensity', fmt(m.ghgIntensity, 2)], ['FuelEU Balance (t)', fmt(m.complianceBalanceT, 1)],
    ];
    const legs = m.legRows.map((r) => `<tr><td>${esc(r.from)}</td><td>${esc(r.to)}</td><td>${esc(r.fuel)}</td><td>${fmt(r.cons, 2)}</td><td>${fmt(r.factor, 3)}</td><td>${fmt(r.co2, 2)}</td><td>${fmt(r.distance, 0)}</td></tr>`).join('');
    return { esc, kpiRows: kpi.map(([k, v]) => `<tr><td>${esc(String(k))}</td><td>${esc(String(v))}</td></tr>`).join(''), legs };
  };
  const exportExcel = () => {
    const { kpiRows, legs } = exportTable();
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"></head><body>
      <h3>Emissions &amp; Compliance — ${recap.vesselName}</h3>
      <table border="1"><tbody>${kpiRows}</tbody></table><br/>
      <table border="1"><thead><tr><th>From</th><th>To</th><th>Fuel</th><th>Cons (t)</th><th>Factor</th><th>CO₂ (t)</th><th>Dist (nm)</th></tr></thead><tbody>${legs}</tbody></table>
      </body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `Emissions_${(recap.vesselName || 'voyage').replace(/\s+/g, '_')}.xls`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const printDoc = (print: boolean) => {
    const { kpiRows, legs } = exportTable();
    const w = window.open('', '_blank', 'width=1100,height=800'); if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Emissions — ${recap.vesselName}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:11px}
      h1{font-size:15px;margin:0 0 2px}h2{font-size:12px;margin:14px 0 4px}.sub{color:#555;margin:0 0 10px}
      table{border-collapse:collapse;width:100%;margin:4px 0}th,td{border:1px solid #bbb;padding:3px 6px;text-align:left}thead th{background:#f2f2f2}
    </style></head><body><h1>Emissions &amp; Compliance — ${recap.vesselName}</h1>
      <p class="sub">IMO ${voyage.imo || '—'} · ${recap.loadPort} → ${recap.dischargePort} · Year ${doc.complianceYear}</p>
      <h2>Key Figures</h2><table><tbody>${kpiRows}</tbody></table>
      <h2>Leg Emissions</h2><table><thead><tr><th>From</th><th>To</th><th>Fuel</th><th>Cons (t)</th><th>Factor</th><th>CO₂ (t)</th><th>Dist (nm)</th></tr></thead><tbody>${legs}</tbody></table>
      </body></html>`);
    w.document.close(); w.focus(); if (print) w.print();
  };

  const headBtn = (icon: string, label: string, on: () => void, tone?: string) => (
    <button type="button" className={`fv-em__btn${tone ? ` fv-em__btn--${tone}` : ''}`} onClick={on} title={label}>
      <i className={`fas ${icon}`} aria-hidden="true" /> <span>{label}</span>
    </button>
  );

  return (
    <div className="fv-em">
      {/* ===== Vessel header ===== */}
      <header className="fv-em__header">
        <div className="fv-em__id">
          <span className="fv-em__id-icon"><i className="fas fa-leaf" aria-hidden="true" /></span>
          <div>
            <h1>{recap.vesselName}</h1>
            <div className="fv-em__id-meta">
              <span>IMO <b>{voyage.imo || '—'}</b></span>
              <span>Voyage <b>{voyage.id}</b></span>
              <span>Trade <b>{doc.trade || recap.cargoName || '—'}</b></span>
              <span>Owner <b>{recap.owners || '—'}</b></span>
              <span>Charterer <b>{recap.charterers || '—'}</b></span>
              <span>Port <b>{recap.loadPort || '—'}</b></span>
              <span>Next <b>{recap.dischargePort || '—'}</b></span>
              <span>Status <EmBadge label={voyage.status || 'At Sea'} tone="info" /></span>
              <span>Year <b>{doc.complianceYear}</b></span>
            </div>
          </div>
        </div>
        <div className="fv-em__actions">
          {headBtn('fa-rotate', 'Refresh', refresh)}
          {headBtn('fa-calculator', 'Recalculate', recalc)}
          {!editing && headBtn('fa-pen', 'Edit', () => setEditing(true))}
          {editing && headBtn('fa-floppy-disk', 'Save', save, 'go')}
          {headBtn('fa-circle-check', 'Approve', approve, 'go')}
          {headBtn('fa-file-excel', 'Excel', exportExcel)}
          {headBtn('fa-file-pdf', 'PDF', () => printDoc(false))}
          {headBtn('fa-print', 'Print', () => printDoc(true))}
          {headBtn('fa-gear', 'Settings', () => setSettingsOpen((v) => !v))}
        </div>
      </header>

      {settingsOpen && (
        <div className="fv-em__settings">
          <label>Compliance Year<input className="fv-em__in" value={doc.complianceYear} onChange={(e) => patchDoc({ complianceYear: e.target.value })} /></label>
          <label>Trade<input className="fv-em__in" value={doc.trade} onChange={(e) => patchDoc({ trade: e.target.value })} placeholder={recap.cargoName} /></label>
          <label>EUA Price (€)<input className="fv-em__in" value={doc.euaPriceEur} onChange={(e) => patchDoc({ euaPriceEur: e.target.value })} /></label>
          <label>Manual CO₂ Adj. (t)<input className="fv-em__in" value={doc.co2AdjustmentT} onChange={(e) => patchDoc({ co2AdjustmentT: e.target.value })} /></label>
          <button type="button" className="fv-em__btn" onClick={() => setSettingsOpen(false)}><i className="fas fa-xmark" aria-hidden="true" /> Close</button>
        </div>
      )}

      {flash && <div className="fv-em__flash"><i className="fas fa-circle-info" aria-hidden="true" /> {flash}</div>}

      {/* ===== Always-visible KPI bar ===== */}
      <div className="fv-em__kpis">
        <EmStat icon="fa-gauge-high" label="CII Rating" value={<span className={`fv-em__rating fv-em__rating--${ratingTone(m.rating)}`}>{m.rating}</span>} sub={`AER ${fmt(m.aer, 2)}`} tone={ratingTone(m.rating)} />
        <EmStat icon="fa-smog" label="Total CO₂" value={`${fmt(m.co2, 0)} t`} sub={`${fmt(m.co2e, 0)} t CO₂e`} />
        <EmStat icon="fa-coins" label="EUAs Required" value={fmt(m.euasRequired, 0)} sub={`bal ${fmt(m.euaBalance, 0)}`} tone={m.euaBalance >= m.euasRequired ? 'good' : 'warn'} />
        <EmStat icon="fa-euro-sign" label="Carbon Cost" value={eur(m.carbonCost)} sub={`@ €${fmt(m.euaPrice, 2)}`} />
        <EmStat icon="fa-droplet" label="FuelEU" value={m.complianceBalanceT >= 0 ? 'Compliant' : 'Deficit'} sub={`${fmt(m.ghgIntensity, 1)} gCO₂e/MJ`} tone={m.fuelEuStatus} />
        <EmStat icon="fa-clipboard-check" label="Compliance" value={overallCompliance} tone={overallCompliance === 'Compliant' ? 'good' : overallCompliance === 'In Progress' ? 'warn' : 'bad'} />
        <EmStat icon="fa-clock" label="Last Updated" value={doc.updatedAt || '—'} sub={doc.approvedBy ? `✓ ${doc.approvedBy}` : 'unapproved'} />
      </div>

      {/* ===== Tabs ===== */}
      <nav className="fv-em__tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`fv-em__tab${tab === t.id ? ' fv-em__tab--active' : ''}`} onClick={() => setTab(t.id)}>
            <i className={`fas ${t.icon}`} aria-hidden="true" /> {t.label}
          </button>
        ))}
      </nav>

      <div className="fv-em__content">
        {tab === 'dashboard' && <DashboardTab m={m} recap={recap} doc={doc} />}
        {tab === 'emissions' && <EmissionsTab m={m} />}
        {tab === 'trading' && <TradingTab m={m} recap={recap} setRecap={setRecap} doc={doc} patchDoc={patchDoc} editing={editing} />}
        {tab === 'performance' && <PerformanceTab m={m} />}
        {tab === 'compliance' && <ComplianceTab doc={doc} setDoc={setDoc} editing={editing} />}
        {tab === 'reports' && <ReportsTab recap={recap} doc={doc} onExcel={exportExcel} onPdf={() => printDoc(false)} onPrint={() => printDoc(true)} />}
      </div>

      {/* ===== Manual adjustments (audit trail) ===== */}
      <ManualAdjustments doc={doc} setDoc={setDoc} editing={editing} />
    </div>
  );
}

/* -------------------------------------------------------------- Dashboard */

function DashboardTab({ m, recap, doc }: { m: Metrics; recap: Recap; doc: EmissionsDoc }) {
  const co2Trend = series(m.co2 / 6, 1);
  const fuelTrend = series(m.fuelTotal / 6, 2);
  const costTrend = series(m.carbonCost / 6, 3);
  const ciiTrend = series(m.aer, 4).map((v) => Math.max(3, v));
  const etsTrend = series(m.euasRequired / 6, 5);
  return (
    <div className="fv-em__stack">
      <div className="fv-em__grid">
        <EmStat icon="fa-gauge-high" label="Current CII Rating" value={<span className={`fv-em__rating fv-em__rating--${ratingTone(m.rating)}`}>{m.rating}</span>} tone={ratingTone(m.rating)} />
        <EmStat icon="fa-smog" label="Total CO₂" value={`${fmt(m.co2, 0)} t`} />
        <EmStat icon="fa-ship" label="Voyage CO₂" value={`${fmt(m.co2, 0)} t`} sub={`${fmt(m.co2PerNm, 1)} kg/nm`} />
        <EmStat icon="fa-coins" label="EUAs Required" value={fmt(m.euasRequired, 0)} />
        <EmStat icon="fa-euro-sign" label="Carbon Cost" value={eur(m.carbonCost)} />
        <EmStat icon="fa-droplet" label="FuelEU Compliance" value={m.complianceBalanceT >= 0 ? 'Compliant' : 'Deficit'} tone={m.fuelEuStatus} />
        <EmStat icon="fa-clipboard-list" label="MRV Status" value={doc.compliance['EU MRV']?.status ?? '—'} tone={statusTone(doc.compliance['EU MRV']?.status ?? '')} />
        <EmStat icon="fa-database" label="IMO DCS Status" value={doc.compliance['IMO DCS']?.status ?? '—'} tone={statusTone(doc.compliance['IMO DCS']?.status ?? '')} />
        <EmStat icon="fa-cloud-sun" label="Weather Routing CO₂ Saved" value={`${fmt(m.co2Saved, 1)} t`} tone="good" />
        <EmStat icon="fa-gas-pump" label="Fuel Consumed" value={`${fmt(m.fuelTotal, 1)} t`} />
      </div>

      <div className="fv-em__grid fv-em__grid--charts">
        <EmCard title="Monthly CO₂ Trend" icon="fa-chart-area"><EmLine data={co2Trend} color="#f0883e" labels={MONTHS} /></EmCard>
        <EmCard title="Fuel Consumption Trend" icon="fa-chart-area"><EmLine data={fuelTrend} color="#58a6ff" labels={MONTHS} /></EmCard>
        <EmCard title="Carbon Cost Trend" icon="fa-chart-area"><EmLine data={costTrend} color="#a371f7" labels={MONTHS} /></EmCard>
        <EmCard title="CII Forecast" icon="fa-chart-line"><EmLine data={ciiTrend} color="#3fb950" labels={MONTHS} /></EmCard>
        <EmCard title="ETS Usage" icon="fa-chart-column"><EmBars data={etsTrend.map((v, i) => ({ label: MONTHS[i], value: v }))} /></EmCard>
        <EmCard title="Fuel Mix" icon="fa-chart-pie"><EmDonut data={[{ label: 'VLSFO', value: m.fuelV, color: '#58a6ff' }, { label: 'LSMGO', value: m.fuelM, color: '#f0883e' }]} /></EmCard>
      </div>

      <div className="fv-em__grid fv-em__grid--lists">
        <EmCard title="Recent Alerts" icon="fa-triangle-exclamation">
          <ul className="fv-em__list">
            {m.rating >= 'D' && <li><EmBadge label="CII" tone="bad" /> Vessel projected {m.rating} — corrective action advised.</li>}
            {m.euaBalance < m.euasRequired && <li><EmBadge label="ETS" tone="warn" /> EUA shortfall {fmt(m.euasRequired - m.euaBalance, 0)} — purchase required.</li>}
            {m.complianceBalanceT < 0 && <li><EmBadge label="FuelEU" tone="bad" /> GHG intensity above target — penalty €{fmt(m.fuelEuPenalty, 0)}.</li>}
            <li><EmBadge label="Info" tone="info" /> MRV report window open for {doc.complianceYear}.</li>
          </ul>
        </EmCard>
        <EmCard title="Upcoming Compliance Deadlines" icon="fa-calendar-day">
          <ul className="fv-em__list">
            {Object.entries(doc.compliance).map(([k, c]) => <li key={k}><EmBadge label={c.status} tone={statusTone(c.status)} /> {k} <span className="fv-em__muted">due {c.dueDate || '—'}</span></li>)}
          </ul>
        </EmCard>
        <EmCard title="Outstanding EUA Purchase" icon="fa-cart-shopping">
          <ul className="fv-em__list">
            <li>Required <b>{fmt(m.euasRequired, 0)}</b> EUAs</li>
            <li>Held <b>{fmt(m.euaBalance, 0)}</b> EUAs</li>
            <li>To buy <b className={m.euaBalance < m.euasRequired ? 'fv-em__neg' : 'fv-em__pos'}>{fmt(Math.max(0, m.euasRequired - m.euaBalance), 0)}</b> @ €{fmt(m.euaPrice, 2)} ≈ {eur(Math.max(0, m.euasRequired - m.euaBalance) * m.euaPrice)}</li>
          </ul>
        </EmCard>
        <EmCard title="Pending Reports & Notifications" icon="fa-bell">
          <ul className="fv-em__list">
            <li><EmBadge label="Report" tone="info" /> Voyage Environmental Report — draft</li>
            <li><EmBadge label="Report" tone="warn" /> Annual MRV Summary — pending</li>
            <li><EmBadge label="ESG" tone="info" /> Quarterly ESG update due</li>
            <li className="fv-em__muted">Vessel {recap.vesselName} · {recap.loadPort} → {recap.dischargePort}</li>
          </ul>
        </EmCard>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Emissions */

function EmissionsTab({ m }: { m: Metrics }) {
  return (
    <div className="fv-em__stack">
      <EmSection title="CO₂ Emissions" icon="fa-smog">
        <div className="fv-em__grid">
          <EmStat icon="fa-gas-pump" label="Fuel Consumed" value={`${fmt(m.fuelTotal, 1)} t`} />
          <EmStat icon="fa-smog" label="CO₂" value={`${fmt(m.co2, 1)} t`} />
          <EmStat icon="fa-cloud" label="CO₂e" value={`${fmt(m.co2e, 1)} t`} />
          <EmStat icon="fa-calendar-day" label="Avg CO₂ / Day" value={`${fmt(m.co2PerDay, 2)} t`} />
          <EmStat icon="fa-route" label="Avg CO₂ / nm" value={`${fmt(m.co2PerNm, 2)} kg`} />
          <EmStat icon="fa-box" label="Avg CO₂ / Cargo t" value={`${fmt(m.co2PerCargo, 3)} t`} />
        </div>
        <EmCalc formula="CO₂ = Σ (fuel × emission factor);  factors VLSFO 3.151 · LSMGO 3.206" rows={[
          { label: 'VLSFO consumed', value: `${fmt(m.fuelV, 2)} t` },
          { label: 'LSMGO consumed', value: `${fmt(m.fuelM, 2)} t` },
          { label: 'CO₂ (base)', value: `${fmt(m.co2Base, 2)} t` },
          { label: 'Manual adjustment', value: `${fmt(m.co2Adj, 2)} t` },
          { label: 'CO₂ total', value: `${fmt(m.co2, 2)} t` },
          { label: 'Distance', value: `${fmt(m.distance, 0)} nm` },
        ]} />
        <LegTable rows={m.legRows} />
      </EmSection>

      <EmSection title="Fuel Consumption" icon="fa-gas-pump" defaultOpen={false}>
        <table className="fv-em__tbl">
          <thead><tr><th>Fuel Type</th><th className="fv-em__r">ROB Start</th><th className="fv-em__r">ROB End</th><th className="fv-em__r">Consumed</th><th>Supplier</th><th>Bunker Date</th><th className="fv-em__r">Fuel Cost</th></tr></thead>
          <tbody>
            <tr><td>VLSFO</td><td className="fv-em__r">{fmt(m.fuelV + 60, 1)}</td><td className="fv-em__r">60.0</td><td className="fv-em__r">{fmt(m.fuelV, 1)}</td><td>—</td><td>—</td><td className="fv-em__r">{usd(m.fuelV * 560)}</td></tr>
            <tr><td>LSMGO</td><td className="fv-em__r">{fmt(m.fuelM + 20, 1)}</td><td className="fv-em__r">20.0</td><td className="fv-em__r">{fmt(m.fuelM, 1)}</td><td>—</td><td>—</td><td className="fv-em__r">{usd(m.fuelM * 800)}</td></tr>
          </tbody>
          <tfoot><tr><td colSpan={3}>Total</td><td className="fv-em__r">{fmt(m.fuelTotal, 1)} t</td><td colSpan={2} /><td className="fv-em__r">{usd(m.fuelV * 560 + m.fuelM * 800)}</td></tr></tfoot>
        </table>
      </EmSection>

      <EmSection title="Emission Breakdown" icon="fa-chart-pie" defaultOpen={false}>
        <div className="fv-em__split">
          <table className="fv-em__tbl fv-em__tbl--narrow">
            <tbody>
              <tr><td>CO₂</td><td className="fv-em__r">{fmt(m.co2, 2)} t</td></tr>
              <tr><td>CH₄</td><td className="fv-em__r">{fmt(m.ch4, 4)} t</td></tr>
              <tr><td>N₂O</td><td className="fv-em__r">{fmt(m.n2o, 4)} t</td></tr>
              <tr className="fv-em__row-sum"><td>CO₂e</td><td className="fv-em__r">{fmt(m.co2e, 2)} t</td></tr>
            </tbody>
          </table>
          <EmDonut data={[{ label: 'VLSFO', value: m.fuelV * efOf('VLSFO'), color: '#58a6ff' }, { label: 'LSMGO', value: m.fuelM * efOf('LSMGO'), color: '#f0883e' }]} />
        </div>
      </EmSection>

      <EmSection title="Weather Routing Savings" icon="fa-cloud-sun" defaultOpen={false}>
        <div className="fv-em__grid">
          <EmStat icon="fa-gas-pump" label="Original Fuel" value={`${fmt(m.fuelTotal + m.fuelSaved, 1)} t`} />
          <EmStat icon="fa-wand-magic-sparkles" label="Optimized Fuel" value={`${fmt(m.fuelTotal, 1)} t`} />
          <EmStat icon="fa-droplet-slash" label="Fuel Saved" value={`${fmt(m.fuelSaved, 1)} t`} tone="good" />
          <EmStat icon="fa-smog" label="CO₂ Saved" value={`${fmt(m.co2Saved, 1)} t`} tone="good" />
          <EmStat icon="fa-dollar-sign" label="Money Saved" value={usd(m.moneySaved)} tone="good" />
          <EmStat icon="fa-coins" label="ETS Saved" value={eur(m.etsSaved)} tone="good" />
        </div>
      </EmSection>
    </div>
  );
}

function LegTable({ rows }: { rows: LegRow[] }) {
  const [sort, setSort] = useState<{ k: keyof LegRow; dir: 1 | -1 } | null>(null);
  const [q, setQ] = useState('');
  const filtered = rows.filter((r) => !q || `${r.from} ${r.to} ${r.fuel}`.toLowerCase().includes(q.toLowerCase()));
  const sorted = sort ? [...filtered].sort((a, b) => { const av = a[sort.k]; const bv = b[sort.k]; return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir; }) : filtered;
  const totCo2 = sorted.reduce((s, r) => s + r.co2, 0);
  const totCons = sorted.reduce((s, r) => s + r.cons, 0);
  const th = (k: keyof LegRow, label: string, right?: boolean) => (
    <th className={right ? 'fv-em__r' : ''} onClick={() => setSort((s) => ({ k, dir: s && s.k === k && s.dir === 1 ? -1 : 1 }))} style={{ cursor: 'pointer' }}>
      {label}{sort?.k === k && <i className={`fas fa-caret-${sort.dir === 1 ? 'up' : 'down'}`} style={{ marginLeft: 4 }} aria-hidden="true" />}
    </th>
  );
  return (
    <div>
      <div className="fv-em__tbl-tools"><input className="fv-em__in fv-em__in--search" placeholder="Search legs…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <table className="fv-em__tbl">
        <thead><tr>{th('from', 'From')}{th('to', 'To')}{th('fuel', 'Fuel')}{th('cons', 'Consumed (t)', true)}{th('factor', 'Factor', true)}{th('co2', 'CO₂ (t)', true)}{th('distance', 'Distance (nm)', true)}{th('cargo', 'Cargo (t)', true)}</tr></thead>
        <tbody>
          {sorted.length === 0 && <tr><td colSpan={8} className="fv-em__muted">No leg data.</td></tr>}
          {sorted.map((r, i) => (
            <tr key={i}><td>{r.from}</td><td>{r.to}</td><td>{r.fuel}</td><td className="fv-em__r">{fmt(r.cons, 2)}</td><td className="fv-em__r">{fmt(r.factor, 3)}</td><td className="fv-em__r">{fmt(r.co2, 2)}</td><td className="fv-em__r">{fmt(r.distance, 0)}</td><td className="fv-em__r">{fmt(r.cargo, 0)}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={3}>Total</td><td className="fv-em__r">{fmt(totCons, 2)}</td><td /><td className="fv-em__r">{fmt(totCo2, 2)}</td><td colSpan={2} /></tr></tfoot>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------- Carbon Trading */

function TradingTab({ m, recap, setRecap, doc, patchDoc, editing }: {
  m: Metrics; recap: Recap; setRecap: React.Dispatch<React.SetStateAction<Recap>>;
  doc: EmissionsDoc; patchDoc: (p: Partial<EmissionsDoc>) => void; editing: boolean;
}) {
  return (
    <div className="fv-em__stack">
      <EmSection title="EU ETS" icon="fa-coins">
        <div className="fv-em__grid">
          <EmStat icon="fa-smog" label="Applicable CO₂" value={`${fmt(m.applicableCo2, 1)} t`} />
          <EmStat icon="fa-coins" label="EUAs Required" value={fmt(m.euasRequired, 1)} />
          <EmStat icon="fa-cart-shopping" label="EUAs Purchased" value={fmt(m.bought, 1)} />
          <EmStat icon="fa-fire" label="EUAs Used" value={fmt(m.usedEua, 1)} />
          <EmStat icon="fa-scale-balanced" label="Balance" value={fmt(m.euaBalance, 1)} tone={m.euaBalance >= m.euasRequired ? 'good' : 'warn'} />
          <EmStat icon="fa-euro-sign" label="Carbon Cost" value={eur(m.carbonCost)} />
          <EmStat icon="fa-tag" label="Current EUA Price" value={editing ? <input className="fv-em__in fv-em__in--sm" value={doc.euaPriceEur} onChange={(e) => patchDoc({ euaPriceEur: e.target.value })} /> : `€${fmt(m.euaPrice, 2)}`} />
          <EmStat icon="fa-chart-line" label="Forecast Cost" value={eur(m.carbonCost * 1.08)} sub="+8% price scenario" />
        </div>
        <EmCalc formula="EUAs = Applicable CO₂ × phase-in %  ·  Cost = EUAs × EUA price" rows={[
          { label: 'Applicable CO₂', value: `${fmt(m.applicableCo2, 2)} t` },
          { label: 'EUAs required', value: fmt(m.euasRequired, 2) },
          { label: 'EUA price', value: `€${fmt(m.euaPrice, 2)}` },
          { label: 'Carbon cost', value: eur(m.carbonCost) },
        ]} />
      </EmSection>

      <EmSection title="EU ETS Leg Detail & EUA Ledger" icon="fa-list" defaultOpen={false}>
        <p className="fv-em__muted" style={{ margin: '0 0 8px' }}>Full editable per-leg emission calculation and the bought / used allowance ledger (shared with the voyage EUA record).</p>
        <EuaCard recap={recap} setRecap={setRecap} />
      </EmSection>

      <EmSection title="FuelEU Maritime" icon="fa-droplet" defaultOpen={false}>
        <div className="fv-em__grid">
          <EmStat icon="fa-gauge" label="GHG Intensity" value={`${fmt(m.ghgIntensity, 2)}`} sub="gCO₂e/MJ" tone={m.fuelEuStatus} />
          <EmStat icon="fa-scale-balanced" label="Compliance Balance" value={`${fmt(m.complianceBalanceT, 1)} t`} tone={m.fuelEuStatus} />
          <EmStat icon="fa-gavel" label="Penalty" value={eur(m.fuelEuPenalty)} tone={m.fuelEuPenalty > 0 ? 'bad' : 'good'} />
          <EmStat icon="fa-plus" label="Credits" value={fmt(Math.max(0, m.complianceBalanceT), 1)} tone="good" />
          <EmStat icon="fa-piggy-bank" label="Banked Credits" value="0.0" />
          <EmStat icon="fa-hand-holding-dollar" label="Borrowed Credits" value="0.0" />
        </div>
        <table className="fv-em__tbl">
          <thead><tr><th>Fuel</th><th className="fv-em__r">Energy (MJ)</th><th className="fv-em__r">Intensity</th><th className="fv-em__r">Penalty (€)</th><th className="fv-em__r">Credit (t)</th></tr></thead>
          <tbody>
            <tr><td>VLSFO</td><td className="fv-em__r">{fmt(m.fuelV * 1000 * 40.2, 0)}</td><td className="fv-em__r">91.6</td><td className="fv-em__r">{fmt(m.fuelEuPenalty * 0.7, 0)}</td><td className="fv-em__r">—</td></tr>
            <tr><td>LSMGO</td><td className="fv-em__r">{fmt(m.fuelM * 1000 * 42.7, 0)}</td><td className="fv-em__r">90.6</td><td className="fv-em__r">{fmt(m.fuelEuPenalty * 0.3, 0)}</td><td className="fv-em__r">—</td></tr>
          </tbody>
          <tfoot><tr><td>Total</td><td className="fv-em__r">{fmt(m.energyMJ, 0)}</td><td className="fv-em__r">{fmt(m.ghgIntensity, 1)}</td><td className="fv-em__r">{fmt(m.fuelEuPenalty, 0)}</td><td /></tr></tfoot>
        </table>
        <EmCalc formula="GHG intensity = CO₂e (g) ÷ energy (MJ);  target 89.34 gCO₂e/MJ (2025)" rows={[
          { label: 'Energy', value: `${fmt(m.energyMJ, 0)} MJ` },
          { label: 'Attained intensity', value: `${fmt(m.ghgIntensity, 2)} gCO₂e/MJ` },
          { label: 'Target', value: `${fmt(m.fuelEuTarget, 2)} gCO₂e/MJ` },
          { label: 'Balance', value: `${fmt(m.complianceBalanceT, 2)} t CO₂e` },
        ]} />
      </EmSection>
    </div>
  );
}

/* ------------------------------------------------------------ Performance */

function PerformanceTab({ m }: { m: Metrics }) {
  const forecast = series(m.aer, 4).map((v) => Math.max(3, v));
  return (
    <div className="fv-em__stack">
      <EmSection title="Carbon Intensity Indicator (CII)" icon="fa-gauge-high">
        <div className="fv-em__cii">
          <div className="fv-em__cii-band">
            <EmRatingBand rating={m.rating} />
            <div className="fv-em__cii-note">Attained AER <b>{fmt(m.aer, 3)}</b> vs required <b>{fmt(m.requiredAer, 2)}</b> — ratio {fmt(m.ratio, 2)}</div>
          </div>
          <div className="fv-em__grid">
            <EmStat icon="fa-star" label="Current Rating" value={<span className={`fv-em__rating fv-em__rating--${ratingTone(m.rating)}`}>{m.rating}</span>} tone={ratingTone(m.rating)} />
            <EmStat icon="fa-forward" label="Forecast Rating" value={<span className={`fv-em__rating fv-em__rating--${ratingTone(m.forecastRating)}`}>{m.forecastRating}</span>} tone={ratingTone(m.forecastRating)} />
            <EmStat icon="fa-gauge" label="Attained CII (AER)" value={fmt(m.aer, 3)} />
            <EmStat icon="fa-bullseye" label="Required CII" value={fmt(m.requiredAer, 2)} />
            <EmStat icon="fa-arrows-left-right" label="Gap" value={fmt(m.aer - m.requiredAer, 3)} tone={m.aer <= m.requiredAer ? 'good' : 'bad'} />
            <EmStat icon="fa-flag" label="Status" value={m.ratio <= 1.06 ? 'On Track' : 'Off Track'} tone={m.ratio <= 1.06 ? 'good' : 'bad'} />
          </div>
        </div>
        <EmCard title="Monthly CII Forecast" icon="fa-chart-line"><EmLine data={forecast} color="#3fb950" labels={MONTHS} /></EmCard>
      </EmSection>

      <EmSection title="EEOI" icon="fa-leaf" defaultOpen={false}>
        <div className="fv-em__grid">
          <EmStat icon="fa-gauge" label="Current" value={fmt(m.eeoi, 3)} sub="gCO₂/t·nm" />
          <EmStat icon="fa-bullseye" label="Target" value={fmt(m.eeoi * 0.92, 3)} />
          <EmStat icon="fa-arrows-left-right" label="Difference" value={fmt(m.eeoi * 0.08, 3)} tone="warn" />
          <EmStat icon="fa-arrow-trend-down" label="Trend" value="Improving" tone="good" />
        </div>
      </EmSection>

      <EmSection title="AER" icon="fa-gauge-high" defaultOpen={false}>
        <div className="fv-em__grid">
          <EmStat icon="fa-gauge" label="Current" value={fmt(m.aer, 3)} />
          <EmStat icon="fa-people-group" label="Fleet Average" value={fmt(m.requiredAer * 1.02, 2)} />
          <EmStat icon="fa-arrows-left-right" label="Difference" value={fmt(m.aer - m.requiredAer * 1.02, 3)} tone={m.aer <= m.requiredAer * 1.02 ? 'good' : 'bad'} />
          <EmStat icon="fa-arrow-trend-down" label="Trend" value="Stable" tone="info" />
        </div>
      </EmSection>

      <EmSection title="Efficiency Analysis" icon="fa-chart-simple" defaultOpen={false}>
        <div className="fv-em__grid">
          <EmStat icon="fa-route" label="Fuel per Mile" value={`${fmt(m.distance > 0 ? m.fuelTotal * 1000 / m.distance : 0, 1)} kg`} />
          <EmStat icon="fa-box" label="Fuel per Cargo" value={`${fmt(m.cargo > 0 ? m.fuelTotal / m.cargo : 0, 4)} t`} />
          <EmStat icon="fa-smog" label="CO₂ per Cargo" value={`${fmt(m.co2PerCargo, 3)} t`} />
          <EmStat icon="fa-calendar-day" label="Fuel per Day" value={`${fmt(m.fuelTotal / m.days, 2)} t`} />
          <EmStat icon="fa-gauge-high" label="Average Speed" value={`${fmt(num(recapSpeed(m)), 1)} kn`} />
          <EmStat icon="fa-clock" label="Idle Time" value="—" />
          <EmStat icon="fa-hourglass-half" label="Waiting Time" value="—" />
        </div>
      </EmSection>
    </div>
  );
}
function recapSpeed(m: Metrics): string { return m.days > 0 && m.distance > 0 ? String(m.distance / (m.days * 24)) : '0'; }

/* ------------------------------------------------------------ Compliance */

function ComplianceTab({ doc, setDoc, editing }: { doc: EmissionsDoc; setDoc: React.Dispatch<React.SetStateAction<EmissionsDoc>>; editing: boolean }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const setItem = (k: string, patch: Partial<EmissionsDoc['compliance'][string]>) =>
    setDoc((d) => ({ ...d, compliance: { ...d.compliance, [k]: { ...d.compliance[k], ...patch } } }));
  const STATUS = ['Ready', 'Pending', 'Submitted', 'Verified', 'Rejected'];
  return (
    <div className="fv-em__stack">
      <div className="fv-em__grid fv-em__grid--compliance">
        {Object.entries(doc.compliance).map(([k, c]) => (
          <div key={k} className={`fv-em__cc fv-em__cc--${statusTone(c.status)}`}>
            <button type="button" className="fv-em__cc-head" onClick={() => setOpenKey((o) => (o === k ? null : k))}>
              <span className="fv-em__cc-title">{k}</span>
              <EmBadge label={c.status} tone={statusTone(c.status)} />
            </button>
            {openKey === k && (
              <div className="fv-em__cc-body">
                <label>Status
                  {editing
                    ? <select className="fv-em__in" value={c.status} onChange={(e) => setItem(k, { status: e.target.value })}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select>
                    : <b>{c.status}</b>}
                </label>
                <label>Submission Date{editing ? <input className="fv-em__in" value={c.submissionDate} onChange={(e) => setItem(k, { submissionDate: e.target.value })} placeholder="dd-mm-yyyy" /> : <b>{c.submissionDate || '—'}</b>}</label>
                <label>Verifier{editing ? <input className="fv-em__in" value={c.verifier} onChange={(e) => setItem(k, { verifier: e.target.value })} /> : <b>{c.verifier || '—'}</b>}</label>
                <label>Due Date{editing ? <input className="fv-em__in" value={c.dueDate} onChange={(e) => setItem(k, { dueDate: e.target.value })} /> : <b>{c.dueDate || '—'}</b>}</label>
                <label className="fv-em__cc-full">Comments{editing ? <input className="fv-em__in" value={c.comments} onChange={(e) => setItem(k, { comments: e.target.value })} /> : <b>{c.comments || '—'}</b>}</label>
                <div className="fv-em__cc-docs"><i className="fas fa-paperclip" aria-hidden="true" /> Supporting documents · History · Approval workflow</div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="fv-em__grid fv-em__grid--lists">
        <EmCard title="Submission Centre" icon="fa-paper-plane">
          <ul className="fv-em__list">
            {Object.entries(doc.compliance).filter(([, c]) => /ready|pending/i.test(c.status)).map(([k, c]) => (
              <li key={k}><EmBadge label={c.status} tone={statusTone(c.status)} /> {k} <span className="fv-em__muted">due {c.dueDate || '—'}</span></li>
            ))}
          </ul>
        </EmCard>
        <EmCard title="Audit Trail" icon="fa-clipboard-list">
          <ul className="fv-em__list">
            {doc.adjustments.length === 0 && <li className="fv-em__muted">No changes recorded.</li>}
            {doc.adjustments.slice(-6).reverse().map((a) => <li key={a.id}>{a.createdDate} · <b>{a.field}</b> {a.oldValue}→{a.newValue} <span className="fv-em__muted">({a.createdBy})</span></li>)}
          </ul>
        </EmCard>
        <EmCard title="Calculation & Version History" icon="fa-code-branch">
          <ul className="fv-em__list">
            <li>{doc.updatedAt || '—'} · workspace saved</li>
            {doc.approvedBy && <li>{doc.approvedDate} · approved by {doc.approvedBy}</li>}
            <li className="fv-em__muted">Emission factors: IMO/EU MRV 2024</li>
          </ul>
        </EmCard>
        <EmCard title="User Activity" icon="fa-user-clock">
          <ul className="fv-em__list">
            <li>Operator · viewing workspace</li>
            {doc.adjustments.slice(-3).reverse().map((a) => <li key={a.id} className="fv-em__muted">{a.createdBy} edited {a.field}</li>)}
          </ul>
        </EmCard>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Reports */

const REPORT_CATEGORIES = [
  'Voyage Environmental Report', 'Owner Report', 'Charterer Report', 'Fleet Report', 'Monthly Report', 'Annual Report',
  'EU ETS Report', 'FuelEU Report', 'MRV Report', 'IMO DCS Report', 'CII Report', 'Carbon Cost Report', 'Executive Dashboard', 'ESG Report',
];
function ReportsTab({ recap, doc, onExcel, onPdf, onPrint }: { recap: Recap; doc: EmissionsDoc; onExcel: () => void; onPdf: () => void; onPrint: () => void }) {
  const [sel, setSel] = useState<string>(REPORT_CATEGORIES[0]);
  return (
    <div className="fv-em__stack">
      <EmCard title="Report Filters" icon="fa-filter">
        <div className="fv-em__filters">
          {['Date Range', 'Fleet', 'Vessel', 'Voyage', 'Owner', 'Charterer', 'Cargo', 'Fuel Type', 'Trade', 'Compliance Year', 'Report Type'].map((f) => (
            <label key={f}>{f}<input className="fv-em__in" placeholder={
              f === 'Vessel' ? recap.vesselName : f === 'Owner' ? recap.owners : f === 'Charterer' ? recap.charterers : f === 'Compliance Year' ? doc.complianceYear : 'All'
            } /></label>
          ))}
        </div>
      </EmCard>

      <EmCard title="Report Categories" icon="fa-folder-open">
        <div className="fv-em__reportgrid">
          {REPORT_CATEGORIES.map((c) => (
            <button key={c} type="button" className={`fv-em__reportcard${sel === c ? ' fv-em__reportcard--on' : ''}`} onClick={() => setSel(c)}>
              <i className="fas fa-file-lines" aria-hidden="true" /> {c}
            </button>
          ))}
        </div>
      </EmCard>

      <EmCard title={`Output — ${sel}`} icon="fa-file-export">
        <div className="fv-em__outputs">
          <button type="button" className="fv-em__btn" onClick={onPdf}><i className="fas fa-eye" aria-hidden="true" /> Preview</button>
          <button type="button" className="fv-em__btn" onClick={onPdf}><i className="fas fa-file-pdf" aria-hidden="true" /> PDF</button>
          <button type="button" className="fv-em__btn" onClick={onExcel}><i className="fas fa-file-excel" aria-hidden="true" /> Excel</button>
          <button type="button" className="fv-em__btn" onClick={onPrint}><i className="fas fa-print" aria-hidden="true" /> Print</button>
          <button type="button" className="fv-em__btn"><i className="fas fa-envelope" aria-hidden="true" /> Email</button>
          <button type="button" className="fv-em__btn"><i className="fas fa-clock" aria-hidden="true" /> Schedule</button>
        </div>
      </EmCard>
    </div>
  );
}

/* ------------------------------------------------- Manual adjustments (audit) */

function ManualAdjustments({ doc, setDoc, editing }: { doc: EmissionsDoc; setDoc: React.Dispatch<React.SetStateAction<EmissionsDoc>>; editing: boolean }) {
  const [draft, setDraft] = useState<{ field: string; oldValue: string; newValue: string; reason: string }>({ field: '', oldValue: '', newValue: '', reason: '' });
  const add = () => {
    if (!draft.field.trim()) return;
    const row: EmissionAdjustment = { id: uid('adj'), ...draft, createdBy: 'Operator', createdDate: todayStr(), modifiedBy: 'Operator', modifiedDate: todayStr(), approvedBy: '', approvedDate: '' };
    setDoc((d) => ({ ...d, adjustments: [...d.adjustments, row] }));
    setDraft({ field: '', oldValue: '', newValue: '', reason: '' });
  };
  const approve = (id: string) => setDoc((d) => ({ ...d, adjustments: d.adjustments.map((a) => (a.id === id ? { ...a, approvedBy: 'Manager', approvedDate: todayStr() } : a)) }));
  const del = (id: string) => setDoc((d) => ({ ...d, adjustments: d.adjustments.filter((a) => a.id !== id) }));
  return (
    <EmSection title="Manual Adjustments & Audit History" icon="fa-user-pen" defaultOpen={false}>
      {editing && (
        <div className="fv-em__adjform">
          <input className="fv-em__in" placeholder="Field" value={draft.field} onChange={(e) => setDraft({ ...draft, field: e.target.value })} />
          <input className="fv-em__in" placeholder="Old value" value={draft.oldValue} onChange={(e) => setDraft({ ...draft, oldValue: e.target.value })} />
          <input className="fv-em__in" placeholder="New value" value={draft.newValue} onChange={(e) => setDraft({ ...draft, newValue: e.target.value })} />
          <input className="fv-em__in" placeholder="Reason" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} />
          <button type="button" className="fv-em__btn fv-em__btn--go" onClick={add}><i className="fas fa-plus" aria-hidden="true" /> Add</button>
        </div>
      )}
      <table className="fv-em__tbl">
        <thead><tr><th>Field</th><th>Old</th><th>New</th><th>Reason</th><th>Created By</th><th>Created</th><th>Approved By</th><th>Approved</th>{editing && <th aria-label="Actions" />}</tr></thead>
        <tbody>
          {doc.adjustments.length === 0 && <tr><td colSpan={editing ? 9 : 8} className="fv-em__muted">No manual adjustments recorded.</td></tr>}
          {doc.adjustments.map((a) => (
            <tr key={a.id}>
              <td>{a.field}</td><td>{a.oldValue}</td><td>{a.newValue}</td><td>{a.reason}</td>
              <td>{a.createdBy}</td><td>{a.createdDate}</td>
              <td>{a.approvedBy || <EmBadge label="pending" tone="warn" />}</td><td>{a.approvedDate || '—'}</td>
              {editing && <td className="fv-em__r">
                {!a.approvedBy && <button type="button" className="fv-em__iconbtn" title="Approve" onClick={() => approve(a.id)}><i className="fas fa-check" aria-hidden="true" /></button>}
                <button type="button" className="fv-em__iconbtn" title="Remove" onClick={() => del(a.id)}><i className="fas fa-xmark" aria-hidden="true" /></button>
              </td>}
            </tr>
          ))}
        </tbody>
      </table>
    </EmSection>
  );
}
