import {
  fmtDurationH,
  fmtEtaUtc,
  usd,
  type RouteMetrics,
} from './routeMetrics';
import type { OptimizationRun } from './optimizationStore';

export interface ScenarioReportRow {
  name: string;
  metrics: RouteMetrics;
}

/** Open a printable comparison report of the selected optimized scenarios. */
export function openScenarioReport(
  rows: ScenarioReportRow[],
  run: OptimizationRun | null,
  nm: string,
): void {
  if (rows.length === 0) return;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cols = [
    'Scenario', 'ETA', 'Duration', 'ECA Duration', `Distance (${nm})`, `ECA Distance (${nm})`,
    'Avg Speed', 'Total Cost', 'Hire Cost', 'Fuel Cost', 'Fuel Req (t)', 'ECA Fuel (t)',
    'EUA Cost', 'EUA Allow (t)',
  ];
  const body = rows
    .map((r) => {
      const m = r.metrics;
      const cells = [
        r.name,
        fmtEtaUtc(m.eta),
        fmtDurationH(m.durationH),
        fmtDurationH(m.ecaDurationH),
        Math.round(m.distanceNm).toLocaleString(),
        Math.round(m.ecaDistanceNm).toLocaleString(),
        `${m.speedKn.toFixed(1)} kn`,
        usd(m.totalCost),
        usd(m.hireCost),
        usd(m.fuelCost),
        Math.round(m.fuelTons).toLocaleString(),
        Math.round(m.ecaFuelTons).toLocaleString(),
        usd(m.euaCost),
        Math.round(m.euaAllowanceTons).toLocaleString(),
      ];
      return `<tr>${cells.map((c) => `<td>${esc(String(c))}</td>`).join('')}</tr>`;
    })
    .join('');

  const context = run
    ? `<p class="ctx"><strong>Base route:</strong> ${esc(run.baseRouteName)} &nbsp;·&nbsp; ` +
      `<strong>ETD:</strong> ${esc(fmtEtaUtc(new Date(run.etd)))} &nbsp;·&nbsp; ` +
      `<strong>Hire:</strong> ${esc(usd(run.market.hirePerDay))}/day &nbsp;·&nbsp; ` +
      `<strong>VLSFO:</strong> ${esc(usd(run.market.foCost))}/t &nbsp;·&nbsp; ` +
      `<strong>LSMGO:</strong> ${esc(usd(run.market.goCost))}/t &nbsp;·&nbsp; ` +
      `<strong>EUA:</strong> ${esc(usd(run.market.euaCost))}/t</p>`
    : '';

  const html =
    `<!doctype html><html><head><meta charset="utf-8"><title>Optimization Scenario Report</title>` +
    `<style>body{font-family:Arial,Helvetica,sans-serif;color:#1b2434;margin:24px;}` +
    `h1{font-size:18px;color:#123;}p.ctx{font-size:12px;color:#444;}` +
    `table{border-collapse:collapse;width:100%;font-size:11px;margin-top:12px;}` +
    `th,td{border:1px solid #cbd2dc;padding:5px 7px;text-align:right;}` +
    `th{background:#eef2f7;}td:first-child,th:first-child{text-align:left;font-weight:600;}` +
    `.gen{margin-top:18px;font-size:10px;color:#888;}</style></head><body>` +
    `<h1>Optimization Scenario Comparison</h1>${context}` +
    `<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>` +
    `<tbody>${body}</tbody></table>` +
    `<p class="gen">Generated ${esc(new Date().toUTCString())}</p></body></html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.setTimeout(() => w.print(), 300);
}
