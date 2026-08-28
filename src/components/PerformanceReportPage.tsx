import { useMemo, useState } from 'react';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { getPerformanceReport, type AbstractRow, type DetailedRow, type PerformanceReport, type VoyageSummaryRow } from '../data/reports';
import type { Voyage } from '../data/voyages';
import { ReportsPageShell } from './ReportsTabs';
import { STUB_ROWS } from './TracksheetGrid';

function asNumber(value: string): number {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function recalculateReport(report: PerformanceReport): PerformanceReport {
  const timeAtSea = report.summary.reduce((total, row) => total + asNumber(row.timeAtSea), 0);
  const timeInPort = report.summary.reduce((total, row) => total + asNumber(row.timeInPort), 0);
  const vlsfoConsumed = report.summary.reduce((total, row) => total + asNumber(row.vlsfoCons), 0);
  const lsmgoConsumed = report.summary.reduce((total, row) => total + asNumber(row.lsmgoCons), 0);
  const distanceSailed = report.abstract.reduce((total, row) => total + asNumber(row.dist), 0);
  const averageSpeed = timeAtSea > 0 ? distanceSailed / timeAtSea : 0;
  return {
    ...report,
    totals: {
      ...report.totals,
      timeAtSea: `${timeAtSea.toFixed(2)} hrs`,
      timeInPort: `${timeInPort.toFixed(2)} hrs`,
      vlsfoConsumed: `${vlsfoConsumed.toFixed(3)} mts`,
      lsmgoConsumed: `${lsmgoConsumed.toFixed(3)} mts`,
    },
    speed: {
      ...report.speed,
      distanceSailed: { ...report.speed.distanceSailed, overall: `${distanceSailed.toFixed(2)} nm` },
      timeAtSea: { ...report.speed.timeAtSea, overall: `${timeAtSea.toFixed(2)} hrs` },
      averageSpeed: { ...report.speed.averageSpeed, overall: `${averageSpeed.toFixed(2)} kts` },
    },
  };
}

function EditableValue({ value, editing, onChange }: { value: string; editing: boolean; onChange: (value: string) => void }) {
  if (!editing) return <span>{value}</span>;
  return <input className="fv-performance__edit-input" value={value} onChange={(event) => onChange(event.target.value)} />;
}

function EditableCell({ value, editing, onChange }: { value: string; editing: boolean; onChange: (value: string) => void }) {
  return <td><EditableValue value={value} editing={editing} onChange={onChange} /></td>;
}

function buildFullVoyageReport(voyage: Parameters<typeof getPerformanceReport>[0]): PerformanceReport {
  const base = getPerformanceReport(voyage);
  const summary = STUB_ROWS.map((row, index): VoyageSummaryRow => {
    const previous = STUB_ROWS[index - 1];
    const vlsfoCons = previous?.vlsfoRob != null && row.vlsfoRob != null ? Math.max(0, previous.vlsfoRob - row.vlsfoRob) : 0;
    const lsmgoCons = previous?.lsmgoRob != null && row.lsmgoRob != null ? Math.max(0, previous.lsmgoRob - row.lsmgoRob) : 0;
    return {
      code: index === 0 ? 'D' : index === STUB_ROWS.length - 1 ? 'A' : row.rt || 'N',
      port: index === 0 ? voyage.portFrom : index === STUB_ROWS.length - 1 ? voyage.portTo : 'At Sea',
      when: `${row.date} ${row.time}`,
      timeInPort: '0.00',
      timeAtSea: row.hrs?.toFixed(2) ?? '0.00',
      vlsfoRob: row.vlsfoRob?.toFixed(3) ?? '0.000',
      vlsfoCons: vlsfoCons.toFixed(3),
      lsmgoRob: row.lsmgoRob?.toFixed(3) ?? '0.000',
      lsmgoCons: lsmgoCons.toFixed(3),
    };
  });
  const abstract = STUB_ROWS.map((row, index) => ({
    code: index === 0 ? 'D' : index === STUB_ROWS.length - 1 ? 'A' : row.rt || 'N',
    date: row.date,
    time: row.time,
    lat: row.lat,
    lon: row.lng,
    dist: row.distR?.toFixed(2) ?? '',
    spd: row.avgSpeedO?.toFixed(2) ?? '',
    vlsfoRob: row.vlsfoRob?.toFixed(3) ?? '0.000',
    vlsfoDaily: row.vlsfoRob?.toFixed(3) ?? '0.000',
    lsmgoRob: row.lsmgoRob?.toFixed(3) ?? '0.000',
    lsmgoDaily: row.lsmgoRob?.toFixed(3) ?? '0.000',
  }));
  const detailed = STUB_ROWS.map((row, index) => ({
    code: index === 0 ? 'D' : index === STUB_ROWS.length - 1 ? 'A' : row.rt || 'N',
    date: row.date,
    time: row.time,
    lat: row.lat,
    lon: row.lng,
    dist: row.distR?.toFixed(2) ?? '',
    spd: row.avgSpeedO?.toFixed(2) ?? '',
    wind: row.windO,
    seas: row.wavesO,
    currentAvg: row.currF.toFixed(2),
  }));
  return recalculateReport({ ...base, summary, abstract, detailed });
}

/**
 * Performance Report page — `/reports/performance`.
 *
 * The full end-of-voyage Voyage Performance Report: cover details,
 * voyage summary + totals, good-weather gain/loss, speed summary,
 * VLSFO/LSMGO bunker analysis, voyage abstract (noon-report breakdown)
 * and voyage detailed analysis. Unlike the other report tabs (which are
 * sent by email), this one is produced as a PDF document. (The mid-voyage
 * interim report is shown separately on the Interim Dashboard.)
 */
export function PerformanceReportPage() {
  const voyage = useSelectedVoyage();

  if (!voyage) {
    return (
      <ReportsPageShell active="performance" icon="fa-chart-line" title="Performance Report">
        <section className="fv-voyage__card">
          <div className="fv-voyage__card-body">
            <p className="fv-voyage__notes">
              No open voyage is selected. Open a vessel from the Fleet List to create its reports.
            </p>
          </div>
        </section>
      </ReportsPageShell>
    );
  }

  return <PerformanceReportContent voyage={voyage} />;
}

function PerformanceReportContent({ voyage }: { voyage: Voyage }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [report, setReport] = useState<PerformanceReport>(() => buildFullVoyageReport(voyage));
  const r = useMemo(() => recalculateReport(report), [report]);

  const updateMeta = (key: keyof typeof r.meta, value: string) => {
    setReport((current) => ({ ...current, meta: { ...current.meta, [key]: value } }));
  };

  const updateSummary = (index: number, key: keyof VoyageSummaryRow, value: string) => {
    setReport((current) => ({
      ...current,
      summary: current.summary.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row),
    }));
  };

  const updateGoodWeather = (key: keyof PerformanceReport['goodWeather'], value: string) => {
    setReport((current) => ({ ...current, goodWeather: { ...current.goodWeather, [key]: value } }));
  };

  const updateSpeed = (key: 'goodWeatherAverageSpeed' | 'goodWeatherCurrentFactors' | 'goodWeatherPerformanceSpeed' | 'timeGainLoss', value: string) => {
    setReport((current) => ({ ...current, speed: { ...current.speed, [key]: value } }));
  };

  const updateSpeedPair = (key: 'distanceSailed' | 'timeAtSea' | 'averageSpeed', side: 'overall' | 'goodWx', value: string) => {
    setReport((current) => ({ ...current, speed: { ...current.speed, [key]: { ...current.speed[key], [side]: value } } }));
  };

  const updateBunker = (fuel: 'vlsfo' | 'lsmgo', key: 'fuel' | 'goodWeatherOverUnder', value: string) => {
    setReport((current) => ({ ...current, [fuel]: { ...current[fuel], [key]: value } }));
  };

  const updateBunkerPair = (fuel: 'vlsfo' | 'lsmgo', key: 'totalConsumed' | 'avgDaily', side: 'overall' | 'goodWx', value: string) => {
    setReport((current) => ({ ...current, [fuel]: { ...current[fuel], [key]: { ...current[fuel][key], [side]: value } } }));
  };

  const updateAbstract = (index: number, key: keyof AbstractRow, value: string) => {
    setReport((current) => ({ ...current, abstract: current.abstract.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row) }));
  };

  const updateDetailed = (index: number, key: keyof DetailedRow, value: string) => {
    setReport((current) => ({ ...current, detailed: current.detailed.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row) }));
  };

  const removeVoyagePart = (index: number) => {
    setReport((current) => ({
      ...current,
      summary: current.summary.filter((_, rowIndex) => rowIndex !== index),
      abstract: current.abstract.filter((_, rowIndex) => rowIndex !== index),
      detailed: current.detailed.filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  const addVoyagePart = () => {
    const newRow: VoyageSummaryRow = {
      code: 'N', port: 'New Port', when: '', timeInPort: '0.00', timeAtSea: '0.00',
      vlsfoRob: '0.000', vlsfoCons: '0.000', lsmgoRob: '0.000', lsmgoCons: '0.000',
    };
    setReport((current) => ({
      ...current,
      summary: [...current.summary, newRow],
      abstract: [...current.abstract, { code: 'N', date: '', time: '', lat: '', lon: '', dist: '0.00', spd: '0.00', vlsfoRob: '0.000', vlsfoDaily: '0.000', lsmgoRob: '0.000', lsmgoDaily: '0.000' }],
      detailed: [...current.detailed, { code: 'N', date: '', time: '', lat: '', lon: '', dist: '0.00', spd: '0.00', wind: '', seas: '', currentAvg: '' }],
    }));
  };

  return (
    <ReportsPageShell active="performance" icon="fa-chart-line" title="Performance Report">
      <div className="fv-report__pdfbar">
        <p className="fv-voyage__notes fv-report__pdfbar-note">
          End-of-voyage Voyage Performance Report (PDF). The mid-voyage interim report is available
          on the Interim Dashboard (Dashboard &amp; Tools).
        </p>
        <div className="fv-performance__actions">
          <button type="button" className="fv-report__btn" onClick={() => { setEditing((value) => !value); setSaved(false); }}>
            <i className={`fas ${editing ? 'fa-eye' : 'fa-pen-to-square'}`} aria-hidden="true" /> {editing ? 'Preview Report' : 'Edit Report'}
          </button>
          {editing && <button type="button" className="fv-report__btn" onClick={() => { setSaved(true); setEditing(false); }}> <i className="fas fa-save" aria-hidden="true" /> Save Changes</button>}
          <button type="button" className="fv-report__btn fv-report__btn--primary" onClick={() => window.print()}>
            <i className="fas fa-file-pdf" aria-hidden="true" /> Generate PDF
          </button>
        </div>
      </div>
      {saved && <p className="fv-performance__saved"><i className="fas fa-circle-check" aria-hidden="true" /> Report changes saved for this session. Calculations updated automatically.</p>}

      {/* 1. Cover / report details */}
      <section className="fv-voyage__card">
        <header className="fv-voyage__card-head">
          <h2 className="fv-voyage__card-title">
            <span className="fv-voyage__card-num">1.</span> REPORT DETAILS
          </h2>
        </header>
        <div className="fv-voyage__card-body">
          <div className="fv-voyage__grid fv-voyage__grid--3">
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">Prepared for</span>
              <span className="fv-voyage__info-value"><EditableValue value={r.meta.preparedFor} editing={editing} onChange={(value) => updateMeta('preparedFor', value)} /></span>
            </div>
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">Reference No</span>
              <span className="fv-voyage__info-value"><EditableValue value={r.meta.reference} editing={editing} onChange={(value) => updateMeta('reference', value)} /></span>
            </div>
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">Type of Voyage</span>
              <span className="fv-voyage__info-value"><EditableValue value={r.meta.voyageType} editing={editing} onChange={(value) => updateMeta('voyageType', value)} /></span>
            </div>
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">Report Date</span>
              <span className="fv-voyage__info-value"><EditableValue value={r.meta.reportDate} editing={editing} onChange={(value) => updateMeta('reportDate', value)} /></span>
            </div>
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">Vessel Name</span>
              <span className="fv-voyage__info-value">
                <EditableValue value={r.meta.vessel} editing={editing} onChange={(value) => updateMeta('vessel', value)} /> (IMO <EditableValue value={r.meta.imo} editing={editing} onChange={(value) => updateMeta('imo', value)} />)
              </span>
            </div>
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">Itinerary</span>
              <span className="fv-voyage__info-value"><EditableValue value={r.meta.itinerary} editing={editing} onChange={(value) => updateMeta('itinerary', value)} /></span>
            </div>
          </div>
          <p className="fv-voyage__notes">Criteria: <EditableValue value={r.meta.criteria} editing={editing} onChange={(value) => updateMeta('criteria', value)} /></p>
        </div>
      </section>

      {/* 2. Voyage summary + totals */}
      <section className="fv-voyage__card">
        <header className="fv-voyage__card-head">
          <h2 className="fv-voyage__card-title">
            <span className="fv-voyage__card-num">2.</span> VOYAGE SUMMARY
          </h2>
        </header>
        <div className="fv-voyage__card-body">
          <div className="fv-voyage__table-scroll">
            <table className="fv-voyage__dtable fv-voyage__dtable--wide">
              <thead>
                <tr>
                  <th>Dep/Arr</th>
                  <th>Port</th>
                  <th>Time (UTC)</th>
                  <th>In Port (hrs)</th>
                  <th>At Sea (hrs)</th>
                  <th>VLSFO ROB</th>
                  <th>VLSFO Cons.</th>
                  <th>LSMGO ROB</th>
                  <th>LSMGO Cons.</th>
                  {editing && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {r.summary.map((row, i) => (
                  <tr key={`${row.port}-${i}`}>
                    <EditableCell value={row.code} editing={editing} onChange={(value) => updateSummary(i, 'code', value)} />
                    <EditableCell value={row.port} editing={editing} onChange={(value) => updateSummary(i, 'port', value)} />
                    <EditableCell value={row.when} editing={editing} onChange={(value) => updateSummary(i, 'when', value)} />
                    <EditableCell value={row.timeInPort} editing={editing} onChange={(value) => updateSummary(i, 'timeInPort', value)} />
                    <EditableCell value={row.timeAtSea} editing={editing} onChange={(value) => updateSummary(i, 'timeAtSea', value)} />
                    <EditableCell value={row.vlsfoRob} editing={editing} onChange={(value) => updateSummary(i, 'vlsfoRob', value)} />
                    <EditableCell value={row.vlsfoCons} editing={editing} onChange={(value) => updateSummary(i, 'vlsfoCons', value)} />
                    <EditableCell value={row.lsmgoRob} editing={editing} onChange={(value) => updateSummary(i, 'lsmgoRob', value)} />
                    <EditableCell value={row.lsmgoCons} editing={editing} onChange={(value) => updateSummary(i, 'lsmgoCons', value)} />
                    {editing && <td><button type="button" className="fv-performance__row-action" onClick={() => removeVoyagePart(i)} title="Remove this part of the voyage"><i className="fas fa-trash" aria-hidden="true" /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {editing && <button type="button" className="fv-report__btn fv-performance__add-row" onClick={addVoyagePart}><i className="fas fa-plus" aria-hidden="true" /> Add Voyage Part</button>}
          <div className="fv-voyage__grid fv-voyage__grid--3">
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">Time at Sea</span>
              <span className="fv-voyage__info-value">{r.totals.timeAtSea}</span>
            </div>
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">Time in Port</span>
              <span className="fv-voyage__info-value">{r.totals.timeInPort}</span>
            </div>
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">VLSFO Consumed</span>
              <span className="fv-voyage__info-value">{r.totals.vlsfoConsumed}</span>
            </div>
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">LSMGO Consumed</span>
              <span className="fv-voyage__info-value">{r.totals.lsmgoConsumed}</span>
            </div>
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">None Consumed</span>
              <span className="fv-voyage__info-value">{r.totals.noneConsumed}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Good weather summary */}
      <section className="fv-voyage__card">
        <header className="fv-voyage__card-head">
          <h2 className="fv-voyage__card-title">
            <span className="fv-voyage__card-num">3.</span> GOOD WEATHER SUMMARY
          </h2>
        </header>
        <div className="fv-voyage__card-body">
          <p className="fv-voyage__notes">Section of voyage on <EditableValue value={r.goodWeather.section} editing={editing} onChange={(value) => updateGoodWeather('section', value)} /></p>
          <div className="fv-voyage__grid fv-voyage__grid--3">
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">Speed Performance Analysis</span>
              <span className="fv-voyage__info-value"><EditableValue value={r.goodWeather.speedPerformance} editing={editing} onChange={(value) => updateGoodWeather('speedPerformance', value)} /></span>
            </div>
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">VLSFO Bunker Analysis</span>
              <span className="fv-voyage__info-value"><EditableValue value={r.goodWeather.vlsfoBunker} editing={editing} onChange={(value) => updateGoodWeather('vlsfoBunker', value)} /></span>
            </div>
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">LSMGO Bunker Analysis</span>
              <span className="fv-voyage__info-value"><EditableValue value={r.goodWeather.lsmgoBunker} editing={editing} onChange={(value) => updateGoodWeather('lsmgoBunker', value)} /></span>
            </div>
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">Good Weather Days</span>
              <span className="fv-voyage__info-value"><EditableValue value={r.goodWeather.goodWeatherDays} editing={editing} onChange={(value) => updateGoodWeather('goodWeatherDays', value)} /></span>
            </div>
          </div>
          <p className="fv-voyage__notes"><EditableValue value={r.goodWeather.basis} editing={editing} onChange={(value) => updateGoodWeather('basis', value)} /></p>
        </div>
      </section>

      {/* 4. Speed summary + time gain/loss */}
      <section className="fv-voyage__card">
        <header className="fv-voyage__card-head">
          <h2 className="fv-voyage__card-title">
            <span className="fv-voyage__card-num">4.</span> SPEED SUMMARY
          </h2>
        </header>
        <div className="fv-voyage__card-body">
          <div className="fv-voyage__table-scroll">
            <table className="fv-voyage__dtable fv-voyage__dtable--wide">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Overall</th>
                  <th>Good Wx</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Distance Sailed</td>
                  <td><EditableValue value={r.speed.distanceSailed.overall} editing={editing} onChange={(value) => updateSpeedPair('distanceSailed', 'overall', value)} /></td>
                  <td><EditableValue value={r.speed.distanceSailed.goodWx} editing={editing} onChange={(value) => updateSpeedPair('distanceSailed', 'goodWx', value)} /></td>
                </tr>
                <tr>
                  <td>Time At Sea</td>
                  <td><EditableValue value={r.speed.timeAtSea.overall} editing={editing} onChange={(value) => updateSpeedPair('timeAtSea', 'overall', value)} /></td>
                  <td><EditableValue value={r.speed.timeAtSea.goodWx} editing={editing} onChange={(value) => updateSpeedPair('timeAtSea', 'goodWx', value)} /></td>
                </tr>
                <tr>
                  <td>Average Speed</td>
                  <td><EditableValue value={r.speed.averageSpeed.overall} editing={editing} onChange={(value) => updateSpeedPair('averageSpeed', 'overall', value)} /></td>
                  <td><EditableValue value={r.speed.averageSpeed.goodWx} editing={editing} onChange={(value) => updateSpeedPair('averageSpeed', 'goodWx', value)} /></td>
                </tr>
                <tr>
                  <td>Good Weather Average Speed</td>
                  <td colSpan={2}><EditableValue value={r.speed.goodWeatherAverageSpeed} editing={editing} onChange={(value) => updateSpeed('goodWeatherAverageSpeed', value)} /></td>
                </tr>
                <tr>
                  <td>Good Weather Current Factors</td>
                  <td colSpan={2}><EditableValue value={r.speed.goodWeatherCurrentFactors} editing={editing} onChange={(value) => updateSpeed('goodWeatherCurrentFactors', value)} /></td>
                </tr>
                <tr>
                  <td>Good Weather Performance Speed</td>
                  <td colSpan={2}><EditableValue value={r.speed.goodWeatherPerformanceSpeed} editing={editing} onChange={(value) => updateSpeed('goodWeatherPerformanceSpeed', value)} /></td>
                </tr>
                <tr>
                  <td>Time Gain/Loss</td>
                  <td colSpan={2} className="fv-report__loss">
                    <EditableValue value={r.speed.timeGainLoss} editing={editing} onChange={(value) => updateSpeed('timeGainLoss', value)} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="fv-voyage__notes">Note: "About" is basis 0.5 kts.</p>
        </div>
      </section>

      {/* 5. Bunker analysis */}
      <section className="fv-voyage__card">
        <header className="fv-voyage__card-head">
          <h2 className="fv-voyage__card-title">
            <span className="fv-voyage__card-num">5.</span> BUNKER ANALYSIS
          </h2>
        </header>
        <div className="fv-voyage__card-body">
          <div className="fv-voyage__table-scroll">
            <table className="fv-voyage__dtable fv-voyage__dtable--wide">
              <thead>
                <tr>
                  <th>Fuel</th>
                  <th>Total Consumed (Overall)</th>
                  <th>Total Consumed (Good Wx)</th>
                  <th>Avg Daily (Overall)</th>
                  <th>Avg Daily (Good Wx)</th>
                  <th>Good Wx Over/Under</th>
                </tr>
              </thead>
              <tbody>
                {[r.vlsfo, r.lsmgo].map((b) => (
                  <tr key={b.fuel}>
                    <td><EditableValue value={b.fuel} editing={editing} onChange={(value) => updateBunker(b.fuel === 'VLSFO' ? 'vlsfo' : 'lsmgo', 'fuel', value)} /></td>
                    <td><EditableValue value={b.totalConsumed.overall} editing={editing} onChange={(value) => updateBunkerPair(b.fuel === 'VLSFO' ? 'vlsfo' : 'lsmgo', 'totalConsumed', 'overall', value)} /></td>
                    <td><EditableValue value={b.totalConsumed.goodWx} editing={editing} onChange={(value) => updateBunkerPair(b.fuel === 'VLSFO' ? 'vlsfo' : 'lsmgo', 'totalConsumed', 'goodWx', value)} /></td>
                    <td><EditableValue value={b.avgDaily.overall} editing={editing} onChange={(value) => updateBunkerPair(b.fuel === 'VLSFO' ? 'vlsfo' : 'lsmgo', 'avgDaily', 'overall', value)} /></td>
                    <td><EditableValue value={b.avgDaily.goodWx} editing={editing} onChange={(value) => updateBunkerPair(b.fuel === 'VLSFO' ? 'vlsfo' : 'lsmgo', 'avgDaily', 'goodWx', value)} /></td>
                    <td><EditableValue value={b.goodWeatherOverUnder} editing={editing} onChange={(value) => updateBunker(b.fuel === 'VLSFO' ? 'vlsfo' : 'lsmgo', 'goodWeatherOverUnder', value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 6. Voyage abstract (noon reports) */}
      <section className="fv-voyage__card">
        <header className="fv-voyage__card-head">
          <h2 className="fv-voyage__card-title">
            <span className="fv-voyage__card-num">6.</span> VOYAGE ABSTRACT (NOON REPORTS)
          </h2>
        </header>
        <div className="fv-voyage__card-body">
          <div className="fv-voyage__table-scroll">
            <table className="fv-voyage__dtable fv-voyage__dtable--wide">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Time (UTC)</th>
                  <th>Lat</th>
                  <th>Lon</th>
                  <th>Dist (nm)</th>
                  <th>Spd (kts)</th>
                  <th>VLSFO ROB</th>
                  <th>VLSFO Daily</th>
                  <th>LSMGO ROB</th>
                  <th>LSMGO Daily</th>
                </tr>
              </thead>
              <tbody>
                {r.abstract.map((row, i) => (
                  <tr key={`${row.date}-${row.time}-${i}`}>
                    <EditableCell value={row.code} editing={editing} onChange={(value) => updateAbstract(i, 'code', value)} />
                    <EditableCell value={row.date} editing={editing} onChange={(value) => updateAbstract(i, 'date', value)} />
                    <EditableCell value={row.time} editing={editing} onChange={(value) => updateAbstract(i, 'time', value)} />
                    <EditableCell value={row.lat} editing={editing} onChange={(value) => updateAbstract(i, 'lat', value)} />
                    <EditableCell value={row.lon} editing={editing} onChange={(value) => updateAbstract(i, 'lon', value)} />
                    <EditableCell value={row.dist} editing={editing} onChange={(value) => updateAbstract(i, 'dist', value)} />
                    <EditableCell value={row.spd} editing={editing} onChange={(value) => updateAbstract(i, 'spd', value)} />
                    <EditableCell value={row.vlsfoRob} editing={editing} onChange={(value) => updateAbstract(i, 'vlsfoRob', value)} />
                    <EditableCell value={row.vlsfoDaily} editing={editing} onChange={(value) => updateAbstract(i, 'vlsfoDaily', value)} />
                    <EditableCell value={row.lsmgoRob} editing={editing} onChange={(value) => updateAbstract(i, 'lsmgoRob', value)} />
                    <EditableCell value={row.lsmgoDaily} editing={editing} onChange={(value) => updateAbstract(i, 'lsmgoDaily', value)} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 7. Voyage detailed analysis */}
      <section className="fv-voyage__card">
        <header className="fv-voyage__card-head">
          <h2 className="fv-voyage__card-title">
            <span className="fv-voyage__card-num">7.</span> VOYAGE DETAILED ANALYSIS
          </h2>
        </header>
        <div className="fv-voyage__card-body">
          <div className="fv-voyage__table-scroll">
            <table className="fv-voyage__dtable fv-voyage__dtable--wide">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Time (UTC)</th>
                  <th>Lat</th>
                  <th>Lon</th>
                  <th>Dist (nm)</th>
                  <th>Spd (kts)</th>
                  <th>Winds (BF)</th>
                  <th>Seas (swh m)</th>
                  <th>Current Avg</th>
                </tr>
              </thead>
              <tbody>
                {r.detailed.map((row, i) => (
                  <tr key={`${row.date}-${row.time}-${i}`}>
                    <EditableCell value={row.code} editing={editing} onChange={(value) => updateDetailed(i, 'code', value)} />
                    <EditableCell value={row.date} editing={editing} onChange={(value) => updateDetailed(i, 'date', value)} />
                    <EditableCell value={row.time} editing={editing} onChange={(value) => updateDetailed(i, 'time', value)} />
                    <EditableCell value={row.lat} editing={editing} onChange={(value) => updateDetailed(i, 'lat', value)} />
                    <EditableCell value={row.lon} editing={editing} onChange={(value) => updateDetailed(i, 'lon', value)} />
                    <EditableCell value={row.dist} editing={editing} onChange={(value) => updateDetailed(i, 'dist', value)} />
                    <EditableCell value={row.spd} editing={editing} onChange={(value) => updateDetailed(i, 'spd', value)} />
                    <EditableCell value={row.wind} editing={editing} onChange={(value) => updateDetailed(i, 'wind', value)} />
                    <EditableCell value={row.seas} editing={editing} onChange={(value) => updateDetailed(i, 'seas', value)} />
                    <EditableCell value={row.currentAvg} editing={editing} onChange={(value) => updateDetailed(i, 'currentAvg', value)} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fv-voyage__notes">swh: Significant Wave Height (m).</p>
        </div>
      </section>
    </ReportsPageShell>
  );
}
