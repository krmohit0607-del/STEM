import type { ReportEmail } from './reports';

/**
 * Voyage guidance report — sent to the vessel from the Route Simulator's
 * per-route "Send guidance" action (the suitcase button). Mirrors the
 * figures shown in the route's "to go" table row (speed, ETA, distance,
 * ECA, fuel, cost) plus a forecast of expected positions + weather along
 * the remaining route, in the same spirit as the Reports → Forecast page.
 */

export interface GuidanceWeatherPoint {
  /** Formatted UTC date/time, e.g. "Oct 21, 14:00Z". */
  dateTime: string;
  /** Formatted `DD° MM.M' N DDD° MM.M' E` position. */
  latLon: string;
  speedKn: number;
  rpm: number;
  distanceToGoNm: number;
  wind: string;
  waves: string;
  swell: string;
  current: string;
}

/** A waypoint-specific Min/Max RPM/MCR instruction still ahead on the route. */
export interface GuidanceEngineInstruction {
  posLabel: string;
  rpmMin?: number;
  rpmMax?: number;
  mcrMin?: number;
  mcrMax?: number;
}

/** A waypoint where the vessel is to drift until a given date/time before resuming. */
export interface GuidanceDriftNotice {
  posLabel: string;
  untilLabel: string;
}

export interface GuidanceReportData {
  vessel: string;
  imo: string;
  client: string;
  clientEmail: string;
  routeLabel: string;
  routeRef: string;
  etdLabel: string;
  etaLabel: string;
  speedKn: number;
  rpm: number;
  distanceToGoNm: number;
  durationToGoLabel: string;
  ecaDistanceNm: number;
  ecaDurationLabel: string;
  fuelReqToGoMt: number;
  ecaFuelReqToGoMt: number;
  co2ToGoMt: number;
  totalCostToGoUsd: number;
  fuelCostToGoUsd: number;
  timeCostToGoUsd: number;
  emissionsCostToGoUsd: number;
  points: GuidanceWeatherPoint[];
  /** Waypoint-level Min/Max RPM/MCR instructions still ahead, from the
   *  Waypoint details panel — overrides Limits & Constraints for those legs. */
  engineInstructions?: GuidanceEngineInstruction[];
  /** The nearest upcoming waypoint where the vessel is to drift until a set time. */
  driftNotice?: GuidanceDriftNotice;
  generatedAtLabel: string;
}

function usd(v: number): string {
  return `US$${Math.round(v).toLocaleString('en-US')}`;
}

/** Guidance report filename stem shared by the PDF title + email attachment note. */
export function guidanceFileStem(vessel: string): string {
  return `${vessel.replace(/[^a-z0-9]+/gi, '_')}_Voyage_Guidance`;
}

function engineInstructionLine(i: GuidanceEngineInstruction): string {
  const parts: string[] = [];
  if (i.rpmMin != null || i.rpmMax != null) {
    parts.push(`RPM ${i.rpmMin ?? '—'}-${i.rpmMax ?? '—'}`);
  }
  if (i.mcrMin != null || i.mcrMax != null) {
    parts.push(`MCR ${i.mcrMin ?? '—'}-${i.mcrMax ?? '—'}%`);
  }
  return `- ${i.posLabel}: ${parts.join(', ')}`;
}

/** Plain-text guidance email, in the same reporting style as the other Reports emails. */
export function buildGuidanceEmail(d: GuidanceReportData, withPdf: boolean): ReportEmail {
  const headers = ['Date/Time (UTC)', 'Lat / Lon', 'Speed (kn)', 'RPM', 'Dist. to Go (NM)', 'Wind', 'Waves', 'Swell', 'Current'];
  const rows = d.points.map((p) => [p.dateTime, p.latLon, p.speedKn.toFixed(1), String(p.rpm), p.distanceToGoNm.toFixed(0), p.wind, p.waves, p.swell, p.current]);
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0)));
  const gap = '  ';
  const formatRow = (row: string[]) => row.map((v, i) => v.padEnd(widths[i])).join(gap);
  const table = rows.length
    ? [formatRow(headers), widths.map((w) => '-'.repeat(w)).join(gap), ...rows.map(formatRow)].join('\n')
    : 'No forecast positions are available for this route.';

  const driftSection = d.driftNotice
    ? `\nDRIFT INSTRUCTION:\nDrift at ${d.driftNotice.posLabel} until ${d.driftNotice.untilLabel}, then resume the voyage.\n`
    : '';
  const engineSection = d.engineInstructions?.length
    ? `\nWAYPOINT RPM/MCR INSTRUCTIONS (overrides Limits & Constraints):\n${d.engineInstructions.map(engineInstructionLine).join('\n')}\n`
    : '';

  const body = `To: Master ${d.vessel}
From: Accelleron Voyage Operations
Date: ${d.generatedAtLabel}
Reference: ${d.routeRef}

Subject: Voyage Guidance - ${d.routeLabel}

Dear Captain,

Please find below the voyage guidance for ${d.vessel} on route "${d.routeLabel}".${withPdf ? ' The full guidance report is attached as a PDF.' : ''}

VOYAGE GUIDANCE
ETD: ${d.etdLabel}
ETA: ${d.etaLabel}
Recommended Speed: ${d.speedKn.toFixed(1)} knots
Recommended RPM: ${d.rpm}
Distance to Go: ${d.distanceToGoNm.toFixed(0)} NM
Time to Go: ${d.durationToGoLabel}
ECA Distance to Go: ${d.ecaDistanceNm.toFixed(0)} NM
ECA Time to Go: ${d.ecaDurationLabel}

FUEL & EMISSIONS (TO GO)
M/E Fuel Required: ${d.fuelReqToGoMt.toFixed(0)} MT
ECA Fuel Required: ${d.ecaFuelReqToGoMt.toFixed(0)} MT
M/E CO2 Emissions: ${d.co2ToGoMt.toFixed(0)} MT

COST (TO GO)
Total Cost: ${usd(d.totalCostToGoUsd)}
Fuel Cost: ${usd(d.fuelCostToGoUsd)}
Time Cost: ${usd(d.timeCostToGoUsd)}
Emissions Cost: ${usd(d.emissionsCostToGoUsd)}

RPM SETTING AND SPEED OPTIMIZATION:
This guidance uses the expected average voyage speed of ${d.speedKn.toFixed(1)} knots (approx. ${d.rpm} RPM). The vessel should maintain the expected speed unless the Master determines that safety, traffic, machinery, or navigational conditions require otherwise.
${driftSection}${engineSection}
EXPECTED POSITIONS & WEATHER FORECAST:
${table}

IMPORTANT
Forecasts are advisory and based on the best available third-party data. Conditions may change. The Master remains responsible for safe navigation. Please report any material change in route, speed, weather, ETA, or vessel condition through the Vessel Reporting Portal.

Warm Regards,
The Accelleron Team
routing@odas.com
ODAS Help Center | For Emergencies Call: +1 (855) 229 9558`;

  return {
    to: d.clientEmail,
    subject: `Voyage Guidance - ${d.vessel} - ${d.routeLabel}`,
    attachments: withPdf ? [`${guidanceFileStem(d.vessel)}.pdf`] : [],
    body,
  };
}

/** Build the voyage/fuel/cost key-value rows shared by the PDF's two summary tables. */
function guidanceSummaryRows(d: GuidanceReportData): { voyage: string[][]; cost: string[][] } {
  return {
    voyage: [
      ['ETD', d.etdLabel],
      ['ETA', d.etaLabel],
      ['Recommended Speed', `${d.speedKn.toFixed(1)} kn`],
      ['Recommended RPM', String(d.rpm)],
      ['Distance to Go', `${d.distanceToGoNm.toFixed(0)} NM`],
      ['Time to Go', d.durationToGoLabel],
      ['ECA Distance to Go', `${d.ecaDistanceNm.toFixed(0)} NM`],
      ['ECA Time to Go', d.ecaDurationLabel],
    ],
    cost: [
      ['M/E Fuel Required', `${d.fuelReqToGoMt.toFixed(0)} MT`],
      ['ECA Fuel Required', `${d.ecaFuelReqToGoMt.toFixed(0)} MT`],
      ['M/E CO2 Emissions', `${d.co2ToGoMt.toFixed(0)} MT`],
      ['Total Cost', usd(d.totalCostToGoUsd)],
      ['Fuel Cost', usd(d.fuelCostToGoUsd)],
      ['Time Cost', usd(d.timeCostToGoUsd)],
      ['Emissions Cost', usd(d.emissionsCostToGoUsd)],
    ],
  };
}

/**
 * Generate the voyage-guidance PDF and save it straight to the browser's
 * downloads folder (via jsPDF) — a real file on disk, not a print-dialog
 * popup. Used by the guidance popup's standalone "Download PDF" action.
 */
export async function downloadGuidancePdfFile(d: GuidanceReportData): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 40;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Voyage Guidance', marginX, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(91, 104, 123);
  doc.text(`${d.vessel} (IMO ${d.imo}) \u00b7 ${d.routeLabel} \u00b7 Generated ${d.generatedAtLabel}`, marginX, 66);
  doc.setTextColor(24, 34, 53);

  const { voyage, cost } = guidanceSummaryRows(d);
  const tableStyle = { fontSize: 9, cellPadding: 4 } as const;
  const headStyle = { fillColor: [237, 242, 248] as [number, number, number], textColor: [80, 96, 120] as [number, number, number] };

  autoTable(doc, {
    startY: 82,
    head: [['Voyage', '']],
    body: voyage,
    styles: tableStyle,
    headStyles: headStyle,
    columnStyles: { 0: { cellWidth: 140, textColor: [100, 116, 139] }, 1: { cellWidth: 110 } },
    tableWidth: 250,
    margin: { left: marginX },
  });
  const voyageEndY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  autoTable(doc, {
    startY: 82,
    head: [['Fuel, Emissions & Cost (To Go)', '']],
    body: cost,
    styles: tableStyle,
    headStyles: headStyle,
    columnStyles: { 0: { cellWidth: 150, textColor: [100, 116, 139] }, 1: { cellWidth: 100 } },
    tableWidth: 250,
    margin: { left: marginX + 275 },
  });
  const costEndY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  let nextY = Math.max(voyageEndY, costEndY) + 22;

  if (d.driftNotice || d.engineInstructions?.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Drift & Waypoint Instructions', marginX, nextY);

    const instructionRows: string[][] = [];
    if (d.driftNotice) {
      instructionRows.push([
        d.driftNotice.posLabel,
        `Drift until ${d.driftNotice.untilLabel}, then resume voyage.`,
      ]);
    }
    d.engineInstructions?.forEach((i) => {
      const parts: string[] = [];
      if (i.rpmMin != null || i.rpmMax != null) parts.push(`RPM ${i.rpmMin ?? '—'}-${i.rpmMax ?? '—'}`);
      if (i.mcrMin != null || i.mcrMax != null) parts.push(`MCR ${i.mcrMin ?? '—'}-${i.mcrMax ?? '—'}%`);
      instructionRows.push([i.posLabel, parts.join(', ')]);
    });

    autoTable(doc, {
      startY: nextY + 8,
      margin: { left: marginX, right: marginX },
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: headStyle,
      head: [['Waypoint', 'Instruction']],
      body: instructionRows,
    });
    nextY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Expected Positions & Weather Forecast', marginX, nextY);

  autoTable(doc, {
    startY: nextY + 8,
    margin: { left: marginX, right: marginX },
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: headStyle,
    head: [['Date/Time (UTC)', 'Lat / Lon', 'Speed (kn)', 'RPM', 'Dist. to Go (NM)', 'Wind', 'Waves', 'Swell', 'Current']],
    body: d.points.length
      ? d.points.map((p) => [p.dateTime, p.latLon, p.speedKn.toFixed(1), String(p.rpm), p.distanceToGoNm.toFixed(0), p.wind, p.waves, p.swell, p.current])
      : [['No forecast positions are available for this route.', '', '', '', '', '', '', '', '']],
  });

  doc.save(`${guidanceFileStem(d.vessel)}.pdf`);
}

