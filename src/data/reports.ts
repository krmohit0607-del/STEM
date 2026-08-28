import type { Voyage } from './voyages';

/**
 * Data + templates for the Reports & Calculations section
 * (`/reports/*`). Header fields (vessel, client, itinerary, reference)
 * are derived from the selected voyage; the tabular content is sourced
 * from the reference operations documents (Voyage Plan / Voyage Forecast
 * / Interim Report / Voyage Performance Report) until the live report
 * endpoints are wired for the React app.
 */

export interface ReportEmail {
  to: string;
  subject: string;
  body: string;
  attachments: string[];
}

function today(): Date {
  return new Date();
}

/** e.g. "07Jul2026". */
function fmtCompactDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-US', { month: 'short' });
  return `${day}${mon}${d.getFullYear()}`;
}

/** e.g. "2026 Jul 07". */
function fmtReportDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-US', { month: 'short' });
  return `${d.getFullYear()} ${mon} ${day}`;
}

function getSystemRouteAttachments(v: Voyage): string[] {
  try {
    const activeRouteId = window.localStorage.getItem('fv.activeRouteId');
    const raw = window.localStorage.getItem('fv.savedRoutes');
    if (!activeRouteId || !raw) return [];

    const routes = JSON.parse(raw) as Array<{ id?: string; waypoints?: unknown[] }>;
    const savedRouteId = activeRouteId.startsWith('saved-')
      ? activeRouteId.slice('saved-'.length)
      : activeRouteId;
    const activeRoute = routes.find((route) => route.id === savedRouteId);
    if (!activeRoute?.waypoints?.length) return [];

    const fileStem = `${v.vessel.replace(/[^a-z0-9]+/gi, '_')}_Route`;
    return [`${fileStem}.rtz`, `${fileStem}.csv`];
  } catch {
    return [];
  }
}

/** e.g. "07 Jul 2026". */
function fmtLongDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-US', { month: 'short' });
  return `${day} ${mon} ${d.getFullYear()}`;
}

/** Map a service code (PMO / RPM / …) to a customer-facing label. */
function serviceLabel(service: string): string {
  const map: Record<string, string> = {
    RPM: 'Weather Routing + Performance Monitoring (RPM)',
    PMO: 'Performance Monitoring (PMO)',
    WR: 'Weather Routing (WR)',
  };
  return map[service?.toUpperCase()] ?? 'Weather Routing + Performance Monitoring (RPM)';
}

// --- Order Confirmation ------------------------------------------------------

export interface OrderConfirmation {
  date: string;
  to: string;
  vessel: string;
  serviceType: string;
  reference: string;
  itinerary: string;
  amount: string;
  legs: Array<{ legType: 'Ballast' | 'Laden' | 'Del' | 'Redel'; portFrom: string; portTo: string; cost: string }>;
}

function formatOrderLegsTable(legs: OrderConfirmation['legs']): string {
  const headers = ['Leg Type', 'Port From', 'Port To', 'Cost'];
  const rows = legs.map((leg) => [leg.legType, leg.portFrom, leg.portTo, leg.cost]);
  const minimumWidths = [16, 26, 26, 16];
  const widths = headers.map((header, index) => Math.max(minimumWidths[index], header.length, ...rows.map((row) => row[index].length)));
  const formatRow = (row: string[]) => `| ${row.map((value, index) => value.padEnd(widths[index])).join(' | ')} |`;
  const solidBorder = `+${widths.map((width) => '-'.repeat(width + 2)).join('+')}+`;

  return `${solidBorder}\n${formatRow(headers)}\n${solidBorder}\n${rows.map(formatRow).join(`\n${solidBorder}\n`)}\n${solidBorder}`;
}

export function getOrderConfirmation(v: Voyage): OrderConfirmation {
  const amount = v.price
    ? `${v.price.toLocaleString('en-US')} $`
    : '0 $';
  return {
    date: fmtLongDate(today()),
    to: v.client,
    vessel: v.vessel,
    serviceType: serviceLabel(v.service),
    reference: v.routeRef,
    itinerary: `${v.portFrom} - ${v.portTo}`,
    amount,
    legs: [{ legType: 'Laden', portFrom: v.portFrom, portTo: v.portTo, cost: amount }],
  };
}

export function buildOrderConfirmationEmail(v: Voyage): ReportEmail {
  const o = getOrderConfirmation(v);
  const body = `ORDER CONFIRMATION

${o.date}
To: ${o.to}

Vessel: ${o.vessel}
Type of Service ordered: ${o.serviceType}
Our Voyage Reference: ${o.reference}

Thank you for the order form for subject vessel. We are attending.

Itinerary & Cost
${formatOrderLegsTable(o.legs)}

If you have any questions or require assistance during voyage, please contact ops@odasgroup.net

Best Regards
ODAS Group

We can be reached via our email ops@odasgroup.net. In case of urgent need of assistance, Please contact +91-7015080678`;
  return {
    to: v.clientEmail,
    subject: `${o.vessel} - ${v.id} - ${o.serviceType} Order Confirmation - ${o.itinerary}`,
    attachments: [],
    body,
  };
}

export function buildReportingInstructions(v: Voyage): ReportEmail {
  const itinerary = `${v.portFrom} - ${v.portTo}`;
  const dt = fmtCompactDate(today());
  const routeAttachments = getSystemRouteAttachments(v);
  const reportingPortalUrl = typeof window === 'undefined'
    ? '/vessel-reports/offline'
    : `${window.location.origin}/vessel-reports/offline`;
  const appOrigin = typeof window === 'undefined' ? '' : window.location.origin;
  const voyageQuery = `?voyage=${encodeURIComponent(v.id)}`;
  const vesselProfileUrl = `${appOrigin}/voyage${voyageQuery}#vessel`;
  const limitsConstraintsUrl = `${appOrigin}/limits${voyageQuery}`;
  const reportingPortalLink = `${reportingPortalUrl}${voyageQuery}`;
  const body = `To: Master ${v.vessel}
From: ODAS Voyage Operations
Date: ${dt}
Reference: ${v.routeRef}

Subject: Vessel Profile, Voyage Limits and Reporting Requirements

VOYAGE
${itinerary}

Dear Captain,

We have been appointed by Messrs ${v.client} to provide Weather Routing and Performance Monitoring (RPM) for ${v.vessel} on the above itinerary.

Before departure, please review the three ODAS pages below for the selected voyage. Complete or correct the information and advise us immediately if anything is inaccurate or changes during the voyage.

REQUIRED ODAS PAGES
1. Vessel Profile
${vesselProfileUrl}
Use this page to confirm the vessel particulars, machinery and fuel information, ECDIS details, cargo information, drafts, and the vessel's operating performance data.

2. Limits & Constraints
${limitsConstraintsUrl}
Use this page to confirm the ordered speed and consumption, weather safety limits, draft and under-keel limits, loadline and ECA restrictions, no-go areas, and any vessel-specific routing constraints. Save the updated values before reviewing the route.

3. Vessel Reporting Portal
${reportingPortalLink}
Use this page to submit the required vessel reports. Select the correct report type, enter the event time in UTC and LT where requested, enter the position in degrees/minutes and direction, complete all applicable fields with units, review the formatted message, and then select Submit Report. If connectivity is unavailable, use No Internet? Email Report and send the generated message to ops@odasgroup.net.

REPORTING RULES
- Use the report type that matches the event. Do not combine separate events in one report.
- Enter UTC and local time (LT) accurately. Retain the same time zone convention throughout each report.
- Enter latitude and longitude as degrees, minutes, and N/S or E/W. Check the sign and direction before submitting.
- Enter fuel and fresh-water ROB separately and use MT. Enter distance in NM, speed in knots, draft in metres, and temperature in °C.
- Complete all applicable sections. Where a field does not apply, enter N/A rather than leaving the operational detail ambiguous.
- Use the preview/message area to check the report before sending. Include explanations for abnormal readings, stoppages, delays, deviations, or missing data.
- Attach supporting BDNs, survey reports, photographs, or other documents when relevant.

VESSEL REPORTING PORTAL
The portal contains the complete report formats, including Noon, Arrival (EOSP), Departure (COSP), Anchorage/Drifting Daily, In Port Daily, Bunkering, Shifting, Fuel Change-over, Stop/Resume, NOR, Cargo Operation, Completion of Cargo, Anchor, Drifting, Incident/Accident, Bunker Survey, Speed Change-over, and Drydock Daily reports.

VESSEL PROFILE
- Vessel name, IMO number, vessel type and flag of registry
- Deadweight, year built, LOA, beam and draft limits
- Main engine rated power, MCR/NCR and minimum operating MCR
- Auxiliary engine power and fuel consumption particulars
- Main engine specific fuel oil consumption curve
- Cargo type, cargo quantity in metric tonnes and any deck cargo
- Current and maximum permitted fore and aft sailing drafts

MACHINERY, SCRUBBER AND ECDIS DETAILS
- Fuel measurement method: BDN, flow meters or bunker tank monitoring
- Fuel types carried and fuel change-over procedure
- Scrubber fitted: Yes/No; type: open loop, closed loop or hybrid
- Scrubber operational status, washwater restrictions and operating limitations
- ECDIS make, model, software version and latest chart update
- Route import format supported by the vessel ECDIS

VOYAGE SETTINGS AND SAFETY LIMITS
- Confirm ETD, expected sailing draft and intended route
- Voyage performance criteria: ordered speed and consumption
- Weather safety limits for wind, wave height, swell, current and visibility
- Vessel-specific limits for speed, draft, under-keel clearance and sea state
- Loadline, emission control area and no-go area constraints
- Any routing restrictions, pilotage requirements or special considerations
- Route plan with key waypoints, distances and intended manoeuvring areas

ROUTE AND SAFETY CONFIRMATION
Please confirm that the route displayed in ODAS reflects the vessel's intended voyage, key waypoints, distances, draft, speed, and manoeuvring plan. Waypoints and routing recommendations are provided for guidance only. The Master remains responsible for safe navigation, compliance with loadline regulations and ECA requirements, and adherence to all vessel operating limits.

If the itinerary, route, draft, speed, cargo condition, machinery status, safety limit, ETA, or port schedule changes, update the relevant ODAS page and notify ODAS Voyage Operations without delay.

REPORTS TO BE SENT FROM THE VESSEL
1. NOON REPORT - Report details, steaming since last report, ROB, daily consumption, equipment consumption, calorific value, ME performance, weather conditions, total since COSP, next port, estimated ROB on arrival, voyage info, cargo onboard, remarks.
2. ARRIVAL REPORT (EOSP) - Report details, EOSP, POB, anchored/berthed, FWE, NOR tendered, steaming to EOSP, EOSP to anchor/berth/FWE, total COSP to EOSP, cargo, drafts, port schedule, delays, remarks.
3. DEPARTURE REPORT (COSP) - Report details, SBE, POB, all cast off, pilot off, ROB at COSP, cargo onboard, departure draft, next port, ETA next port, estimated arrival ROB, remarks.
5. ANCHORAGE / DRIFTING - DAILY REPORT - Report details, ROB, daily consumption, equipment consumption, calorific value, drifting details, weather, bunkers/FW, expected berthing/departure, estimated departure ROB, remarks.
6. IN PORT DAILY REPORT - Report details, ROB, daily consumption, bunkers/FW, cargo last 24 hours (HoldWise 1H-7H), total cargo to date, cargo remaining, weather, port schedule, estimated departure ROB, delays, remarks.
7. BUNKERING REPORT - Report details, ROB before/after, bunker received, survey adjusted qty, barge name & timings, hose & pumping timings, documentation, departure, LOP, remarks.
8. SHIFTING REPORT - Shifting types: Anchorage to Another Anchorage, Anchorage to Berth, Berth to Berth, Berth to Anchorage. Port details, commence/completed timings, totals (distance, duration, consumption, ROBs), weather, reason, cargo, draft, remarks.
9. FUEL CHANGE-OVER REPORT - Fuel grades, commence & completion timings and positions, ECA details, consumption, calorific value, ME performance, remarks.
10. STOP / RESUME REPORT - Stop/resume details, positions, STW, SOG, ROBs, stoppage distance/consumption/duration, voyage details, remarks.
11. NOR REPORT - Report details, NOR tendered position & time, NOR acceptance time & party, vessel & cargo readiness, exceptions/remarks.
12. CARGO OPERATION REPORT - Port/berth/terminal, operation timings, cargo name & quantities (period, total, remaining), holds distribution, drafts, delays, remarks.
13. COMPLETION OF CARGO REPORT - Port/berth/terminal, completion timings, cargo name & final quantities, holds distribution, drafts, delays, remarks.
14. ANCHOR REPORT - Anchor drop/aweigh, position, time, water depth, reason, ROB, weather, remarks.
15. DRIFTING REPORT - Drifting start/stop positions & times, heading, STW, SOG, reason, ROB, weather, remarks.
16. INCIDENT / ACCIDENT REPORT - Incident position & time, incident type, parties/equipment involved, facts, damage/impact, immediate actions, supporting documents, remarks.
17. BUNKER SURVEY REPORT - Location, surveyor, date/time, tank soundings, fuel grades/density/temp, ROB before/after survey, survey documents, discrepancies/remarks.
18. SPEED CHANGE-OVER REPORT - Position, date/time, steaming since last report, speed change (STW/SOG), engine settings/RPM/load before & after, reason, weather, ETA, remarks.
19. DRYDOCK DAILY REPORT - Shipyard, berth/dock, drydock position, ROB, daily/equipment consumption, weather, bunkers/FW, expected departure, estimated departure ROB, daily jobs & remarks.

Send each report through the ODAS reporting workflow at the required event time. Include UTC date and time, latitude and longitude, units, ROB by fuel grade, supporting BDN or survey documents, and an explanation for any missing or abnormal data.

Best Regards
ODAS Voyage Operations
ops@odasgroup.net
+91-7015080678`;
  return {
    to: v.clientEmail,
    subject: `${v.vessel} - ${v.client} - Reporting Instructions - ${itinerary}`,
    attachments: routeAttachments,
    body,
  };
}

// --- Route Recommendation ----------------------------------------------------

export interface RouteSummary {
  route: string;
  ttlDistNm: string;
  speedKts: string;
  consMtDay: string;
  sailingDays: string;
  etaUtc: string;
}

export function getRouteSummary(v: Voyage): RouteSummary {
  return {
    route: `${v.portFrom} - ${v.portTo}`,
    ttlDistNm: '3,798.50',
    speedKts: v.cpSpeed ? v.cpSpeed.toFixed(1) : '13.0',
    consMtDay: `${(v.cpCons || 23.5).toFixed(2)} ME / 0.10 AE`,
    sailingDays: '12.20',
    etaUtc: '18-Jul-2026 18:11UTC',
  };
}

/** Route forecast rows: [date, position, wind, seas, current, swell]. */
export const ROUTE_FORECAST: Array<[string, string, string, string, string, string]> = [
  ['07-Jul-2026 00:00Z', '0258N / 00520W', 'SSE 4', 'SSW 1.4', 'E 1.93', 'SSW 0.64'],
  ['07-Jul-2026 12:00Z', '0123N / 00723W', 'SE 4', 'SE 1.2', 'ENE 1.42', 'SSW 0.92'],
  ['08-Jul-2026 00:00Z', '0011S / 00927W', 'ESE 3', 'SE 1.3', 'ENE 0.30', 'SE 1.02'],
  ['08-Jul-2026 12:00Z', '0147S / 01129W', 'SE 4', 'S 1.4', 'SW 0.82', 'SSW 0.87'],
  ['09-Jul-2026 00:00Z', '0326S / 01330W', 'E 4', 'SSW 1.6', 'WSW 0.97', 'SSW 0.94'],
  ['09-Jul-2026 12:00Z', '0506S / 01531W', 'ESE 4', 'S 2.2', 'W 0.61', 'S 1.49'],
  ['10-Jul-2026 00:00Z', '0645S / 01731W', 'E 5', 'S 2.7', 'W 0.63', 'S 2.27'],
  ['10-Jul-2026 12:00Z', '0825S / 01932W', 'ESE 4', 'S 2.4', 'W 0.56', 'S 2.17'],
  ['11-Jul-2026 00:00Z', '1004S / 02133W', 'ESE 4', 'SSE 2.0', 'WSW 0.20', 'SSE 1.57'],
  ['11-Jul-2026 12:00Z', '1144S / 02335W', 'E 3', 'S 1.4', 'SW 0.25', 'SSE 1.29'],
  ['12-Jul-2026 00:00Z', '1324S / 02537W', 'ENE 3', 'SSW 1.8', 'W 0.37', 'SSW 1.50'],
  ['12-Jul-2026 12:00Z', '1503S / 02740W', 'NE 3', 'SSE 1.5', 'SW 0.27', 'SSW 0.98'],
  ['13-Jul-2026 00:00Z', '1643S / 02945W', 'NNE 4', 'SE 1.2', 'SE 0.15', 'SE 0.83'],
  ['13-Jul-2026 12:00Z', '1823S / 03150W', 'NNE 4', 'S 1.7', 'SW 0.25', 'S 0.80'],
];

export function buildRouteRecommendationEmail(v: Voyage): ReportEmail {
  const s = getRouteSummary(v);
  const body = `To: Master ${v.vessel}
Fm: Accelleron Voyage Operations

Itinerary: ${v.portFrom} - ${v.portTo}

ROUTE RECOMMENDATION
Shortest safe navigable route to destination per major waypoints (see attachment: Voyage Plan).

ROUTE SUMMARY
Route            : ${s.route}
TTL Distance     : ${s.ttlDistNm} nm
Speed            : ${s.speedKts} kts
Consumption      : ${s.consMtDay}
Sailing Time     : ${s.sailingDays} days
ETA              : ${s.etaUtc}

Above route recommendation is basis safe navigation on your part. Waypoints (if any) mentioned are for guidance only. All route recommendations are basis vessel compliance with loadline regulation and INL limits.

**Kindly revert with your intentions / route plan with key waypoints and distances for review.

Best Regards
Accelleron Voyage Operations`;
  return {
    to: v.clientEmail,
    subject: `Route Recommendation \u2014 ${v.vessel} \u2014 ${v.portFrom} - ${v.portTo}`,
    attachments: ['Voyage Plan.pdf'],
    body,
  };
}

// --- Voyage Plan -------------------------------------------------------------

/** Major waypoints: [waypoint, expectedTime, distNm, rlOrGc]. */
export const MAJOR_WAYPOINTS: Array<[string, string, string, string]> = [
  ['0418N, 00337W', '06-Jul-2026 14:00UTC', '552.76', 'RL'],
  ['0119S, 01055W', '08-Jul-2026 08:31UTC', '437.34', 'RL'],
  ['0557S, 01633W', '09-Jul-2026 18:09UTC', '2,658.71', 'RL'],
  ['3416S, 05317W', '18-Jul-2026 06:40UTC', '35.28', 'RL'],
  ['3444S, 05343W', '18-Jul-2026 09:23UTC', '13.49', 'RL'],
  ['3447S, 05359W', '18-Jul-2026 10:25UTC', '74.18', 'RL'],
  ['3504S, 05527W', '18-Jul-2026 16:08UTC', '4.10', 'RL'],
  ['3504S, 05532W', '18-Jul-2026 16:27UTC', '22.65', 'RL'],
  ['3506S, 05559W', '18-Jul-2026 18:11UTC', '0.00', 'RL'],
];

export function buildVoyagePlanEmail(v: Voyage): ReportEmail {
  const s = getRouteSummary(v);
  const sourceDate = v.etdIso ? new Date(v.etdIso) : null;
  const departure = sourceDate && !Number.isNaN(sourceDate.getTime())
    ? `${sourceDate.toISOString().slice(0, 16).replace('T', ' ')} UTC`
    : v.etdDisplay || 'Not specified';
  const detailRows = [
    ['Client Name', v.client, 'Departure Port', v.portFrom],
    ['Vessel Name', v.vessel, 'Arrival Port', v.portTo],
    ['Departure', departure, 'Reference', v.routeRef],
  ];
  const detailTable = detailRows.map((row) => `${row[0].padEnd(18)} | ${row[1].padEnd(24)} | ${row[2].padEnd(18)} | ${row[3]}`).join('\n');
  const summaryTable = [
    'Route'.padEnd(24) + ' | TTL Dist. (nm) | Avg. Speed (kts) | TTL Cons. (mt) | Sailing Time (days) | ETA (UTC)',
    '-'.repeat(24) + '-+-' + '-'.repeat(15) + '-+-' + '-'.repeat(17) + '-+-' + '-'.repeat(15) + '-+-' + '-'.repeat(19) + '-+-' + '-'.repeat(20),
    `${s.route.padEnd(24)} | ${s.ttlDistNm.padEnd(15)} | ${s.speedKts.padEnd(17)} | ${s.consMtDay.padEnd(15)} | ${s.sailingDays.padEnd(19)} | ${s.etaUtc}`,
  ].join('\n');
  const waypointTable = [
    'Key Waypoint'.padEnd(24) + ' | Time (Expected)'.padEnd(24) + ' | Dist. (nm)'.padEnd(12) + ' | RL or GC | Remark (if any)',
    '-'.repeat(24) + '-+-' + '-'.repeat(24) + '-+-' + '-'.repeat(12) + '-+-' + '-'.repeat(8) + '-+-' + '-'.repeat(18),
    ...MAJOR_WAYPOINTS.map(([waypoint, expectedTime, distance, routeType]) => `${waypoint.padEnd(24)} | ${expectedTime.padEnd(24)} | ${distance.padEnd(12)} | ${routeType.padEnd(8)} | `),
  ].join('\n');
  const body = `To: Master ${v.vessel}
From: Accelleron Voyage Operations
Reference: ${v.routeRef}

Subject: Voyage Plan - ${v.portFrom} to ${v.portTo}

Dear Captain,

Please find below the voyage plan for ${v.vessel}. The route map is included as an attachment for review together with the route details and major waypoints.

VOYAGE DETAILS
${detailTable}

ROUTE MAP
Voyage route map attached. Please review the route, port sequence, and intended waypoints before departure.

ROUTE SUMMARY
${summaryTable}

ROUTE RECOMMENDATION
Shortest safe navigable route to destination per the major waypoints below.

MAJOR WAYPOINTS
${waypointTable}

Please review the above itinerary, route, speed, ETA, and waypoints. Waypoints and recommendations are for guidance only and must not be used as a substitute for the vessel's approved passage plan or navigational procedures.

The Master remains responsible for safe navigation and compliance with applicable regulations, loadline requirements, ECA restrictions, chart information, and vessel operating limits. Please advise Accelleron Voyage Operations immediately if the itinerary, route, draft, speed, ETA, or any safety restriction changes.

Best Regards,
Accelleron Voyage Operations`;
  return {
    to: `master@${v.vessel.toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`,
    subject: `Voyage Plan - ${v.vessel} - ${v.portFrom} - ${v.portTo}`,
    attachments: ['Voyage Plan.pdf'],
    body,
  };
}

// --- Forecast ----------------------------------------------------------------

export type ForecastCriterion = 'wind' | 'waves' | 'current' | 'swell' | 'gusts' | 'visibility' | 'airTemp' | 'seaTemp';

export interface ForecastPoint {
  dateTime: string;
  latLon: string;
  lat?: number;
  lon?: number;
  weather: Partial<Record<ForecastCriterion, string>>;
}

export interface ForecastOptions {
  durationHours: number;
  intervalHours: number;
  averageSpeedKn: number;
  distanceToGoNm: number;
  sourceLabel: string;
  sourceDateTime: string;
  criteria: ForecastCriterion[];
  points: ForecastPoint[];
}

const FORECAST_CRITERION_LABELS: Record<ForecastCriterion, string> = {
  wind: 'Wind',
  waves: 'Waves',
  current: 'Current',
  swell: 'Swell',
  gusts: 'Wind Gusts',
  visibility: 'Visibility',
  airTemp: 'Air Temperature',
  seaTemp: 'Sea Water Temperature',
};

export function buildForecastEmail(v: Voyage, options?: ForecastOptions): ReportEmail {
  const forecast = options ?? {
    durationHours: 72,
    intervalHours: 6,
    averageSpeedKn: v.cpSpeed || 13,
    distanceToGoNm: (v.cpSpeed || 13) * 72,
    sourceLabel: 'Latest available voyage position',
    sourceDateTime: 'Not available',
    criteria: ['wind', 'waves', 'current', 'swell'],
    points: [],
  };
  const speed = Math.max(1, forecast.averageSpeedKn);
  const predictedEta = new Date(Date.now() + (forecast.distanceToGoNm / speed) * 3600_000);
  const fmtDate = (date: Date) => date.toUTCString().replace(' GMT', ' UTC');
  const criterionHeaders = forecast.criteria.map((criterion) => FORECAST_CRITERION_LABELS[criterion]);
  const pointRows = forecast.points.map((point) => [
    point.dateTime,
    point.latLon,
    ...forecast.criteria.map((criterion) => point.weather[criterion] ?? '--'),
  ]);
  const columnWidths = ['Date/Time (UTC)', 'Lat / Lon', ...criterionHeaders].map((header, index) => Math.max(header.length, ...pointRows.map((row) => row[index]?.length ?? 0)));
  const columnGap = '        ';
  const formatRow = (row: string[]) => row.map((value, index) => value.padEnd(columnWidths[index])).join(columnGap);
  const formatHeader = (row: string[]) => row.map((value, index) => {
    const padding = Math.max(0, columnWidths[index] - value.length);
    const left = Math.floor(padding / 2);
    return `${' '.repeat(left)}${value}${' '.repeat(padding - left)}`;
  }).join(columnGap);
  const table = pointRows.length
    ? [formatHeader(['Date/Time (UTC)', 'Lat / Lon', ...criterionHeaders]), '-'.repeat(columnWidths.reduce((sum, width) => sum + width, 0) + (columnWidths.length - 1) * columnGap.length), ...pointRows.map(formatRow)].join('\n')
    : 'No route positions are available. Plot or activate a route before generating the forecast.';
  const body = `To: Master ${v.vessel}
From: Accelleron Voyage Operations
Date: ${fmtDate(new Date())}
Reference: ${v.routeRef}

Subject: Voyage Weather Forecast - ${v.portFrom} to ${v.portTo}

Dear Captain,

Please find below the weather forecast for ${v.vessel} on the ${v.portFrom} to ${v.portTo} voyage.

VOYAGE PREDICTION
Predicted Speed: ${speed.toFixed(1)} knots
Predicted ETA: ${fmtDate(predictedEta)}
Distance to Go: ${forecast.distanceToGoNm.toFixed(0)} NM

RPM SETTING AND SPEED OPTIMIZATION:
The forecast uses the expected average voyage speed of ${speed.toFixed(1)} knots, not the latest daily speed. The vessel should maintain the expected speed unless the Master determines that safety, traffic, machinery, or navigational conditions require otherwise.

WEATHER SUMMARY:
${table}

IMPORTANT
Forecasts are advisory and based on the best available third-party data. Conditions may change. The Master remains responsible for safe navigation. Please report any material change in route, speed, weather, ETA, or vessel condition through the Vessel Reporting Portal.

Warm Regards,
The Accelleron Team
routing@odas.com
ODAS Help Center | For Emergencies Call: +1 (855) 229 9558`;
  return {
    to: v.clientEmail,
    subject: `Voyage Forecast - ${v.vessel} - ${v.portFrom} - ${v.portTo}`,
    attachments: [],
    body,
  };
}

// --- Performance Report (end-of-voyage) --------------------------------------
//
// The Performance Report is the full end-of-voyage report (cover, voyage
// summary + totals, good-weather gain/loss, speed summary, VLSFO/LSMGO
// bunker analysis, voyage abstract / noon-report breakdown and voyage
// detailed analysis). The interim report — the mid-voyage snapshot — is a
// separate document shown on the Interim Dashboard.

export interface TwoCol {
  overall: string;
  goodWx: string;
}

export interface PerfReportMeta {
  preparedFor: string;
  reference: string;
  voyageType: string;
  reportDate: string;
  vessel: string;
  imo: string;
  itinerary: string;
  criteria: string;
}

/** Voyage summary leg rows (dep/arr, ROB + consumption per fuel). */
export interface VoyageSummaryRow {
  code: string; // D (departure) / A (arrival)
  port: string;
  when: string;
  timeInPort: string;
  timeAtSea: string;
  vlsfoRob: string;
  vlsfoCons: string;
  lsmgoRob: string;
  lsmgoCons: string;
}

export interface VoyageTotals {
  timeAtSea: string;
  timeInPort: string;
  vlsfoConsumed: string;
  lsmgoConsumed: string;
  noneConsumed: string;
}

export interface GoodWeatherSummary {
  section: string;
  speedPerformance: string;
  vlsfoBunker: string;
  lsmgoBunker: string;
  basis: string;
  goodWeatherDays: string;
}

export interface SpeedSummary {
  distanceSailed: TwoCol;
  timeAtSea: TwoCol;
  averageSpeed: TwoCol;
  goodWeatherAverageSpeed: string;
  goodWeatherCurrentFactors: string;
  goodWeatherPerformanceSpeed: string;
  timeGainLoss: string;
}

export interface BunkerSummary {
  fuel: string;
  totalConsumed: TwoCol;
  avgDaily: TwoCol;
  goodWeatherOverUnder: string;
}

/** Voyage abstract (noon-report) rows. */
export interface AbstractRow {
  code: string;
  date: string;
  time: string;
  lat: string;
  lon: string;
  dist: string;
  spd: string;
  vlsfoRob: string;
  vlsfoDaily: string;
  lsmgoRob: string;
  lsmgoDaily: string;
}

/** Voyage detailed analysis rows (winds / seas / currents). */
export interface DetailedRow {
  code: string;
  date: string;
  time: string;
  lat: string;
  lon: string;
  dist: string;
  spd: string;
  wind: string;
  seas: string;
  currentAvg: string;
}

export interface PerformanceReport {
  meta: PerfReportMeta;
  summary: VoyageSummaryRow[];
  totals: VoyageTotals;
  goodWeather: GoodWeatherSummary;
  speed: SpeedSummary;
  vlsfo: BunkerSummary;
  lsmgo: BunkerSummary;
  abstract: AbstractRow[];
  detailed: DetailedRow[];
}

const PERF_SUMMARY: VoyageSummaryRow[] = [
  { code: 'D', port: 'Tema', when: '05 Jul 26 0142', timeInPort: '', timeAtSea: '', vlsfoRob: '178.46', vlsfoCons: '', lsmgoRob: '133.78', lsmgoCons: '' },
  { code: 'A', port: 'Abidjan', when: '05 Jul 26 2300', timeInPort: '', timeAtSea: '21.30', vlsfoRob: '160.56', vlsfoCons: '17.900', lsmgoRob: '133.68', lsmgoCons: '0.100' },
  { code: 'A', port: 'Abidjan', when: '06 Jul 26 1400', timeInPort: '15.00', timeAtSea: '', vlsfoRob: '458.02', vlsfoCons: '', lsmgoRob: '133.68', lsmgoCons: '' },
];

const PERF_ABSTRACT: AbstractRow[] = [
  { code: 'D', date: '05Jul', time: '0142', lat: '0526N', lon: '00003E', dist: '', spd: '', vlsfoRob: '178.460', vlsfoDaily: '0.000', lsmgoRob: '133.780', lsmgoDaily: '0.000' },
  { code: 'N', date: '05Jul', time: '1200', lat: '0426N', lon: '00140W', dist: '119.44', spd: '11.60', vlsfoRob: '169.660', vlsfoDaily: '20.505', lsmgoRob: '133.680', lsmgoDaily: '0.233' },
  { code: 'A', date: '05Jul', time: '2300', lat: '0429N', lon: '00347W', dist: '131.63', spd: '11.97', vlsfoRob: '160.560', vlsfoDaily: '19.855', lsmgoRob: '133.680', lsmgoDaily: '0.000' },
  { code: 'A', date: '06Jul', time: '1400', lat: '0418N', lon: '00337W', dist: '', spd: '', vlsfoRob: '458.020', vlsfoDaily: '0.000', lsmgoRob: '133.680', lsmgoDaily: '0.000' },
];

const PERF_DETAILED: DetailedRow[] = [
  { code: 'D', date: '05Jul', time: '0142', lat: '0526N', lon: '00003E', dist: '', spd: '', wind: '', seas: '', currentAvg: '' },
  { code: 'E', date: '05Jul', time: '0600', lat: '', lon: '', dist: '', spd: '', wind: 'SW 3', seas: 'SSE 1.30', currentAvg: '-0.58' },
  { code: 'N', date: '05Jul', time: '1200', lat: '0426N', lon: '00140W', dist: '119.44', spd: '11.60', wind: 'SSW 3', seas: 'SSE 1.40', currentAvg: '-0.62' },
  { code: 'E', date: '05Jul', time: '1800', lat: '', lon: '', dist: '', spd: '', wind: 'SSW 3', seas: 'SSE 1.40', currentAvg: '-0.68' },
  { code: 'A', date: '05Jul', time: '2300', lat: '0429N', lon: '00347W', dist: '131.63', spd: '11.97', wind: 'S 3', seas: 'SSE 1.40', currentAvg: '-0.67' },
  { code: 'A', date: '06Jul', time: '1400', lat: '0418N', lon: '00337W', dist: '', spd: '', wind: '', seas: '', currentAvg: '' },
];

export function getPerformanceReport(v: Voyage): PerformanceReport {
  const criteria = `ABT ${(v.cpSpeed || 13).toFixed(2)}kts on ABT ${(v.cpCons || 23.5).toFixed(2)}mts VLSFO + ABT 0.10mts LSMGO`;
  return {
    meta: {
      preparedFor: v.client,
      reference: v.routeRef,
      voyageType: 'Ballast',
      reportDate: fmtReportDate(today()),
      vessel: v.vessel,
      imo: v.imo,
      itinerary: `${v.portFrom} - ${v.portTo}`,
      criteria,
    },
    summary: PERF_SUMMARY,
    totals: {
      timeAtSea: '21.30 hrs',
      timeInPort: '15.00 hrs',
      vlsfoConsumed: '17.900 mts',
      lsmgoConsumed: '0.100 mts',
      noneConsumed: '0.000 mts',
    },
    goodWeather: {
      section: criteria,
      speedPerformance: 'N/A',
      vlsfoBunker: 'N/A',
      lsmgoBunker: 'N/A',
      basis: 'Good weather analysis basis BF4, DSS3, 2m, 0m, No Adverse Currents & No Effect of Favorable Currents.',
      goodWeatherDays: 'None identified',
    },
    speed: {
      distanceSailed: { overall: '251.07 nm', goodWx: '0.00 nm' },
      timeAtSea: { overall: '21.30 hrs', goodWx: '0.00 hrs' },
      averageSpeed: { overall: '11.79 kts', goodWx: '0.00 kts' },
      goodWeatherAverageSpeed: '0.00 kts',
      goodWeatherCurrentFactors: '0.00 kts',
      goodWeatherPerformanceSpeed: '0 kts',
      timeGainLoss: '323.97 hrs \u2212 N/A hrs = N/A',
    },
    vlsfo: {
      fuel: 'VLSFO',
      totalConsumed: { overall: '17.900 mts', goodWx: '0.000 mts' },
      avgDaily: { overall: '20.169 mts', goodWx: '0.000 mts' },
      goodWeatherOverUnder: 'N/A',
    },
    lsmgo: {
      fuel: 'LSMGO',
      totalConsumed: { overall: '0.100 mts', goodWx: '0.000 mts' },
      avgDaily: { overall: '0.113 mts', goodWx: '0.000 mts' },
      goodWeatherOverUnder: 'N/A',
    },
    abstract: PERF_ABSTRACT,
    detailed: PERF_DETAILED,
  };
}

export function buildPerformanceReportEmail(v: Voyage): ReportEmail {
  const p = getPerformanceReport(v);
  const body = `To: Messrs ${v.client}
Fm: Accelleron Voyage Operations

Vessel: ${v.vessel} (IMO ${v.imo})
Reference: ${p.meta.reference}
Type of voyage: ${p.meta.voyageType}
Itinerary: ${p.meta.itinerary}
Criteria: ${p.meta.criteria}

VOYAGE PERFORMANCE REPORT (END OF VOYAGE)
Please find attached the full end-of-voyage performance report, including voyage summary, good-weather gain/loss analysis, speed summary, VLSFO/LSMGO bunker analysis, voyage abstract (noon reports) and voyage detailed analysis.

VOYAGE TOTALS
Time at Sea      : ${p.totals.timeAtSea}
Time in Port     : ${p.totals.timeInPort}
VLSFO Consumed   : ${p.totals.vlsfoConsumed}
LSMGO Consumed   : ${p.totals.lsmgoConsumed}

SPEED SUMMARY (Overall / Good Wx)
Distance Sailed  : ${p.speed.distanceSailed.overall} / ${p.speed.distanceSailed.goodWx}
Average Speed    : ${p.speed.averageSpeed.overall} / ${p.speed.averageSpeed.goodWx}
Time Gain/Loss   : ${p.speed.timeGainLoss}

BUNKER ANALYSIS (Overall)
VLSFO Avg Daily  : ${p.vlsfo.avgDaily.overall}
LSMGO Avg Daily  : ${p.lsmgo.avgDaily.overall}

${p.goodWeather.basis}

Best Regards
Accelleron Voyage Operations`;
  return {
    to: v.clientEmail,
    subject: `Voyage Performance Report \u2014 ${v.vessel} \u2014 ${v.portFrom} - ${v.portTo}`,
    attachments: ['Voyage Performance Report.pdf'],
    body,
  };
}

