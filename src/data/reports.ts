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

Itinerary: ${o.itinerary}    ${o.amount}

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
  const body = `To: Master ${v.vessel}
Fm: ODAS Voyage Operations
Dt: ${dt}
Rf: ${v.routeRef}

Itinerary
${itinerary}

Good Day Captain,

We have been appointed by Messrs ${v.client} to provide Weather Routing + Performance Monitoring (RPM) for ${v.vessel} on the above itinerary.

Please review the voyage in ODAS and provide or confirm the following information before departure.

VESSEL REPORTING PORTAL
Online submission and offline email preparation: ${reportingPortalUrl}
Open this link in a browser, select the required report type, complete the fields, and either submit online or generate an email when internet connectivity is unavailable.

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

Please confirm that the route displayed in ODAS reflects the vessel's intentions. Waypoints and recommendations are for guidance only. The Master remains responsible for safe navigation and compliance with loadline regulations, ECA requirements and all vessel operating limits. Advise ODAS immediately if the itinerary, route, draft, speed or safety limits change.

REPORTS TO BE SENT FROM THE VESSEL
1. NOON REPORT - UTC position, course, speed, distance, weather, wind, waves, swell, current, drafts, ROB and engine performance.
2. ARRIVAL REPORT (EOSP) - EOSP time and position, ETA, speed, drafts, ROB, weather and any route or operational remarks.
3. DEPARTURE REPORT (COSP) - COSP time and position, departure drafts, cargo condition, ROB, engine settings and intended speed.
4. PORT / BERTH REPORT - arrival, all fast, berth, port operations, ROB, consumption, drafts and next movement.
5. NOR REPORT - notice of readiness time, position, tendered time, acceptance status and any exceptions.
6. CARGO OPERATION REPORT - operation type, start time, quantity handled, rate, holds or tanks, stoppages and weather impact.
7. COMPLETION OF CARGO REPORT - completion time, final quantity, drafts, ROB, documents and readiness to sail.
8. ANCHOR REPORT - anchor drop or aweigh time, position, depth, reason, weather and ROB.
9. DRIFTING REPORT - drifting start or stop time, position, reason, weather, course, speed and ROB.
10. BUNKERING REPORT - supplier, port or position, start and completion, grades, quantities, ROB, BDN and samples.
11. STOP / RESUME REPORT - stop or resume time, position, reason, weather, engine status, ROB and operational impact.
12. BUNKER SURVEY REPORT - surveyor, time, location, tank soundings, quantities, density, temperature, ROB and survey documents.
13. INCIDENT / ACCIDENT REPORT - time, position, persons or equipment involved, facts, damage, immediate actions and supporting evidence.
14. SHIFTING REPORT - shifting start and completion, berth or anchorage, reason, drafts, ROB, weather and manoeuvring details.
15. FUEL CHANGE-OVER REPORT - start and completion time, position, fuel grades, tanks, ROB, sulphur compliance and operational remarks.
16. SPEED CHANGE-OVER REPORT - time, position, old and new speed, engine settings, reason, weather, ETA and consumption impact.

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
  const body = `To: Master ${v.vessel}
Fm: Accelleron Voyage Operations

Itinerary: ${v.portFrom} - ${v.portTo}

VOYAGE PLAN
Please find attached the Voyage Plan (route map, major waypoints and route forecast).

ROUTE SUMMARY
Route        : ${s.route}
TTL Distance : ${s.ttlDistNm} nm
Speed        : ${s.speedKts} kts
Total Cons   : ${s.consMtDay}
Sailing Time : ${s.sailingDays} days
ETA          : ${s.etaUtc}

Please refer to the approximate waypoints indicated for your voyage plan. Waypoints (if any) are for guidance only and not to be used for navigation. Please note in the event of changes to the above itinerary master must inform us and advise reason for same.

Best Regards
Accelleron Voyage Operations`;
  return {
    to: v.clientEmail,
    subject: `Voyage Plan \u2014 ${v.vessel} \u2014 ${v.portFrom} - ${v.portTo}`,
    attachments: ['Voyage Plan.pdf'],
    body,
  };
}

// --- Forecast ----------------------------------------------------------------

export function buildForecastEmail(v: Voyage): ReportEmail {
  const body = `To: Master ${v.vessel}
Fm: Accelleron Voyage Operations

Itinerary: ${v.portFrom} - ${v.portTo}

VOYAGE FORECAST
Please find attached the latest voyage forecast covering wind, seas, current and swell along the recommended route.

ROUTE RECOMMENDATION
Our last route recommendation remains valid.

Please note that forecasts are advisory in nature and basis best available data from third party sources and subject to change. Above expected positions in forecast are not to be used for navigation.

Best Regards
Accelleron Voyage Operations`;
  return {
    to: v.clientEmail,
    subject: `Voyage Forecast \u2014 ${v.vessel} \u2014 ${v.portFrom} - ${v.portTo}`,
    attachments: ['Voyage Forecast.pdf'],
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

