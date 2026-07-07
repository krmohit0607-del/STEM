import { useSelectedVoyage } from '../data/selectedVoyage';
import { getPerformanceReport } from '../data/reports';
import { ReportsPageShell } from './ReportsTabs';

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

  const r = getPerformanceReport(voyage);

  return (
    <ReportsPageShell active="performance" icon="fa-chart-line" title="Performance Report">
      <div className="fv-report__pdfbar">
        <p className="fv-voyage__notes fv-report__pdfbar-note">
          End-of-voyage Voyage Performance Report (PDF). The mid-voyage interim report is available
          on the Interim Dashboard (Dashboard &amp; Tools).
        </p>
        <button
          type="button"
          className="fv-report__btn fv-report__btn--primary"
          onClick={() => window.print()}
        >
          <i className="fas fa-file-pdf" aria-hidden="true" /> Generate PDF
        </button>
      </div>

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
              <span className="fv-voyage__info-value">{r.meta.preparedFor}</span>
            </div>
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">Reference No</span>
              <span className="fv-voyage__info-value">{r.meta.reference}</span>
            </div>
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">Type of Voyage</span>
              <span className="fv-voyage__info-value">{r.meta.voyageType}</span>
            </div>
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">Report Date</span>
              <span className="fv-voyage__info-value">{r.meta.reportDate}</span>
            </div>
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">Vessel Name</span>
              <span className="fv-voyage__info-value">
                {r.meta.vessel} (IMO {r.meta.imo})
              </span>
            </div>
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">Itinerary</span>
              <span className="fv-voyage__info-value">{r.meta.itinerary}</span>
            </div>
          </div>
          <p className="fv-voyage__notes">Criteria: {r.meta.criteria}</p>
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
                </tr>
              </thead>
              <tbody>
                {r.summary.map((row, i) => (
                  <tr key={`${row.port}-${i}`}>
                    <td>{row.code}</td>
                    <td>{row.port}</td>
                    <td>{row.when}</td>
                    <td>{row.timeInPort || '\u2014'}</td>
                    <td>{row.timeAtSea || '\u2014'}</td>
                    <td>{row.vlsfoRob}</td>
                    <td>{row.vlsfoCons || '\u2014'}</td>
                    <td>{row.lsmgoRob}</td>
                    <td>{row.lsmgoCons || '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          <p className="fv-voyage__notes">Section of voyage on {r.goodWeather.section}</p>
          <div className="fv-voyage__grid fv-voyage__grid--3">
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">Speed Performance Analysis</span>
              <span className="fv-voyage__info-value">{r.goodWeather.speedPerformance}</span>
            </div>
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">VLSFO Bunker Analysis</span>
              <span className="fv-voyage__info-value">{r.goodWeather.vlsfoBunker}</span>
            </div>
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">LSMGO Bunker Analysis</span>
              <span className="fv-voyage__info-value">{r.goodWeather.lsmgoBunker}</span>
            </div>
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">Good Weather Days</span>
              <span className="fv-voyage__info-value">{r.goodWeather.goodWeatherDays}</span>
            </div>
          </div>
          <p className="fv-voyage__notes">{r.goodWeather.basis}</p>
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
                  <td>{r.speed.distanceSailed.overall}</td>
                  <td>{r.speed.distanceSailed.goodWx}</td>
                </tr>
                <tr>
                  <td>Time At Sea</td>
                  <td>{r.speed.timeAtSea.overall}</td>
                  <td>{r.speed.timeAtSea.goodWx}</td>
                </tr>
                <tr>
                  <td>Average Speed</td>
                  <td>{r.speed.averageSpeed.overall}</td>
                  <td>{r.speed.averageSpeed.goodWx}</td>
                </tr>
                <tr>
                  <td>Good Weather Average Speed</td>
                  <td colSpan={2}>{r.speed.goodWeatherAverageSpeed}</td>
                </tr>
                <tr>
                  <td>Good Weather Current Factors</td>
                  <td colSpan={2}>{r.speed.goodWeatherCurrentFactors}</td>
                </tr>
                <tr>
                  <td>Good Weather Performance Speed</td>
                  <td colSpan={2}>{r.speed.goodWeatherPerformanceSpeed}</td>
                </tr>
                <tr>
                  <td>Time Gain/Loss</td>
                  <td colSpan={2} className="fv-report__loss">
                    {r.speed.timeGainLoss}
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
                    <td>{b.fuel}</td>
                    <td>{b.totalConsumed.overall}</td>
                    <td>{b.totalConsumed.goodWx}</td>
                    <td>{b.avgDaily.overall}</td>
                    <td>{b.avgDaily.goodWx}</td>
                    <td>{b.goodWeatherOverUnder}</td>
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
                    <td>{row.code}</td>
                    <td>{row.date}</td>
                    <td>{row.time}</td>
                    <td>{row.lat || '\u2014'}</td>
                    <td>{row.lon || '\u2014'}</td>
                    <td>{row.dist || '\u2014'}</td>
                    <td>{row.spd || '\u2014'}</td>
                    <td>{row.vlsfoRob}</td>
                    <td>{row.vlsfoDaily}</td>
                    <td>{row.lsmgoRob}</td>
                    <td>{row.lsmgoDaily}</td>
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
                    <td>{row.code}</td>
                    <td>{row.date}</td>
                    <td>{row.time}</td>
                    <td>{row.lat || '\u2014'}</td>
                    <td>{row.lon || '\u2014'}</td>
                    <td>{row.dist || '\u2014'}</td>
                    <td>{row.spd || '\u2014'}</td>
                    <td>{row.wind || '\u2014'}</td>
                    <td>{row.seas || '\u2014'}</td>
                    <td>{row.currentAvg || '\u2014'}</td>
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
