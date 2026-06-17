/**
 * Shared fleet stub data used by:
 *   - `/main` Fleet List View (`FleetListPage`)
 *   - `/?voyage=ID` voyage overview map (`VoyageOverviewMap`)
 *
 * Replace `STUB_ROWS` with the real `/api/voyage/list` payload when the
 * endpoint is exposed for the React app.
 */

export interface FleetRow {
  voyageId: string;
  vesselName: string;
  clientName: string;
  pic: string;
  serviceTypes: string[];
  statuses: string[];
  legLB: string[];
  departurePort: string;
  etd: string;
  atd: string;
  interimPort: string;
  ataInterim: string;
  atdInterim: string;
  arrivalPort: string;
  eta: string;
  ataArrival: string;
  lastNN: string;
  optimizationTypes: string[];
  cpSpeed: number;
  cpCons: number;
  instSpeed: number;
  instCons: number;
  avgSpdSinceCOSP: number;
  perfSpeedSinceCOSP: number;
  costPerDay: number;
  foCost: number;
  goCost: number;
  euaCostPerMt: number;
  performance: string[];
  rrRiSent: string;
  weatherSent: string;
  interimSent: string;
  eovReportSent: string;
  fileStatus: string[];
  voyageTags: string;
}

/**
 * Approximate [lat, lon] for every port referenced by `STUB_ROWS`. Used
 * to draw the route polyline on the voyage overview map. Coordinates
 * are deliberately rounded — when the real port-master endpoint is
 * wired up, swap this lookup for the API response.
 */
export const PORT_COORDS: Record<string, [number, number]> = {
  Singapore: [1.27, 103.85],
  Santos: [-23.96, -46.33],
  Houston: [29.76, -95.36],
  Rotterdam: [51.92, 4.48],
  Suez: [30.02, 32.55],
  Qingdao: [36.07, 120.38],
  Piraeus: [37.95, 23.65],
  Alexandria: [31.2, 29.92],
  'Cape Town': [-33.92, 18.42],
  Gdansk: [54.35, 18.65],
  Hamburg: [53.55, 9.99],
  'Jebel Ali': [25.01, 55.06],
  Mumbai: [19.07, 72.88],
  Fujairah: [25.12, 56.32],
  'Long Beach': [33.77, -118.19],
};

/** Build the polyline coordinates for a row (departure → interim → arrival). */
export function getRoutePath(row: FleetRow): Array<[number, number]> {
  const ports = [row.departurePort, row.interimPort, row.arrivalPort].filter(
    (p): p is string => !!p,
  );
  return ports
    .map((p) => PORT_COORDS[p])
    .filter((c): c is [number, number] => !!c);
}

export const STUB_ROWS: FleetRow[] = [
  {
    voyageId: 'V-2026-014',
    vesselName: 'MV Atlantic Voyager',
    clientName: 'Acme Shipping',
    pic: 'amit',
    serviceTypes: ['RPM', 'Optimization'],
    statuses: ['Active at sea'],
    legLB: ['Laden'],
    departurePort: 'Singapore',
    etd: '12-06-2026 08:00',
    atd: '12-06-2026 08:20',
    interimPort: 'Suez',
    ataInterim: '20-06-2026 14:00',
    atdInterim: '20-06-2026 22:00',
    arrivalPort: 'Rotterdam',
    eta: '27-06-2026 12:00',
    ataArrival: '###',
    lastNN: '15-06-2026 12:00',
    optimizationTypes: ['RTA', 'Least Cost'],
    cpSpeed: 12,
    cpCons: 30,
    instSpeed: 12.1,
    instCons: 30.4,
    avgSpdSinceCOSP: 12.0,
    perfSpeedSinceCOSP: 12.15,
    costPerDay: 58_400,
    foCost: 765,
    goCost: 1120,
    euaCostPerMt: 74.5,
    performance: ['Gain'],
    rrRiSent: 'Yes',
    weatherSent: 'Yes',
    interimSent: '',
    eovReportSent: '',
    fileStatus: ['open'],
    voyageTags: 'priority',
  },
  {
    voyageId: 'V-2026-013',
    vesselName: 'MV Pacific Star',
    clientName: 'Oceanic Shipping Co.',
    pic: 'priya',
    serviceTypes: ['PMO', 'Weather Only'],
    statuses: ['Stdby for arrival'],
    legLB: ['Laden'],
    departurePort: 'Houston',
    etd: '22-05-2026 14:00',
    atd: '22-05-2026 14:30',
    interimPort: '',
    ataInterim: '',
    atdInterim: '',
    arrivalPort: 'Singapore',
    eta: '17-06-2026 06:00',
    ataArrival: '###',
    lastNN: '15-06-2026 12:00',
    optimizationTypes: ['Speed'],
    cpSpeed: 13,
    cpCons: 32,
    instSpeed: 13.4,
    instCons: 33.1,
    avgSpdSinceCOSP: 13.1,
    perfSpeedSinceCOSP: 13.2,
    costPerDay: 61_200,
    foCost: 762,
    goCost: 1115,
    euaCostPerMt: 74.5,
    performance: ['Gain'],
    rrRiSent: 'Yes',
    weatherSent: 'Yes',
    interimSent: 'Yes',
    eovReportSent: '',
    fileStatus: ['open'],
    voyageTags: '',
  },
  {
    voyageId: 'V-2026-012',
    vesselName: 'MV Indian Trader',
    clientName: 'Bharat Lines',
    pic: 'amit',
    serviceTypes: ['Optimization'],
    statuses: ['at port', 'bunkering'],
    legLB: ['Ballast'],
    departurePort: 'Rotterdam',
    etd: '30-04-2026 09:30',
    atd: '30-04-2026 10:05',
    interimPort: 'Fujairah',
    ataInterim: '14-05-2026 03:00',
    atdInterim: '14-05-2026 10:00',
    arrivalPort: 'Houston',
    eta: '24-05-2026 18:00',
    ataArrival: '24-05-2026 19:20',
    lastNN: '24-05-2026 12:00',
    optimizationTypes: ['Least Cost', 'Least Emission'],
    cpSpeed: 11.5,
    cpCons: 28,
    instSpeed: 11.4,
    instCons: 28.2,
    avgSpdSinceCOSP: 11.45,
    perfSpeedSinceCOSP: 11.5,
    costPerDay: 49_800,
    foCost: 745,
    goCost: 1095,
    euaCostPerMt: 74.5,
    performance: ['Loss'],
    rrRiSent: 'Yes',
    weatherSent: 'Yes',
    interimSent: 'Yes',
    eovReportSent: 'Yes',
    fileStatus: ['closed'],
    voyageTags: '',
  },
  {
    voyageId: 'V-2026-011',
    vesselName: 'MV Northern Light',
    clientName: 'Nordic Maritime',
    pic: 'leah',
    serviceTypes: ['RPM', 'Safety Optimization'],
    statuses: ['Active at sea'],
    legLB: ['Laden'],
    departurePort: 'Qingdao',
    etd: '01-06-2026 22:00',
    atd: '01-06-2026 22:30',
    interimPort: '',
    ataInterim: '',
    atdInterim: '',
    arrivalPort: 'Long Beach',
    eta: '21-06-2026 09:00',
    ataArrival: '###',
    lastNN: '15-06-2026 12:00',
    optimizationTypes: ['RTA', 'Cons'],
    cpSpeed: 14,
    cpCons: 35,
    instSpeed: 14.2,
    instCons: 35.4,
    avgSpdSinceCOSP: 14.0,
    perfSpeedSinceCOSP: 14.1,
    costPerDay: 64_700,
    foCost: 770,
    goCost: 1125,
    euaCostPerMt: 74.5,
    performance: ['Gain'],
    rrRiSent: 'Yes',
    weatherSent: 'Yes',
    interimSent: '',
    eovReportSent: '',
    fileStatus: ['open'],
    voyageTags: 'priority',
  },
  {
    voyageId: 'V-2026-010',
    vesselName: 'MV Mediterranean Sun',
    clientName: 'Levant Carriers',
    pic: 'priya',
    serviceTypes: ['PMO'],
    statuses: ['Stdby for Departure'],
    legLB: ['Ballast'],
    departurePort: 'Piraeus',
    etd: '18-06-2026 06:00',
    atd: '',
    interimPort: '',
    ataInterim: '',
    atdInterim: '',
    arrivalPort: 'Alexandria',
    eta: '20-06-2026 14:00',
    ataArrival: '',
    lastNN: '',
    optimizationTypes: ['Speed'],
    cpSpeed: 13,
    cpCons: 30,
    instSpeed: 0,
    instCons: 0,
    avgSpdSinceCOSP: 0,
    perfSpeedSinceCOSP: 0,
    costPerDay: 42_500,
    foCost: 755,
    goCost: 1100,
    euaCostPerMt: 74.5,
    performance: [],
    rrRiSent: '',
    weatherSent: '',
    interimSent: '',
    eovReportSent: '',
    fileStatus: ['open'],
    voyageTags: '',
  },
  {
    voyageId: 'V-2026-009',
    vesselName: 'MV Cape Horn',
    clientName: 'SouthCone Shipping',
    pic: 'leah',
    serviceTypes: ['Weather Only', 'PVA'],
    statuses: ['arrived'],
    legLB: ['Laden'],
    departurePort: 'Santos',
    etd: '20-05-2026 11:00',
    atd: '20-05-2026 11:40',
    interimPort: 'Cape Town',
    ataInterim: '02-06-2026 08:00',
    atdInterim: '02-06-2026 18:00',
    arrivalPort: 'Singapore',
    eta: '15-06-2026 04:00',
    ataArrival: '15-06-2026 03:45',
    lastNN: '15-06-2026 03:00',
    optimizationTypes: ['Least Cost'],
    cpSpeed: 12.5,
    cpCons: 29,
    instSpeed: 12.6,
    instCons: 29.4,
    avgSpdSinceCOSP: 12.55,
    perfSpeedSinceCOSP: 12.6,
    costPerDay: 53_900,
    foCost: 760,
    goCost: 1110,
    euaCostPerMt: 74.5,
    performance: ['Gain'],
    rrRiSent: 'Yes',
    weatherSent: 'Yes',
    interimSent: 'Yes',
    eovReportSent: 'Yes',
    fileStatus: ['closed'],
    voyageTags: '',
  },
  {
    voyageId: 'V-2026-008',
    vesselName: 'MV Baltic Wave',
    clientName: 'Acme Shipping',
    pic: 'amit',
    serviceTypes: ['Optimization', 'Waypoint only optimization'],
    statuses: ['Active at sea'],
    legLB: ['Ballast'],
    departurePort: 'Gdansk',
    etd: '10-06-2026 16:00',
    atd: '10-06-2026 16:30',
    interimPort: '',
    ataInterim: '',
    atdInterim: '',
    arrivalPort: 'Hamburg',
    eta: '12-06-2026 04:00',
    ataArrival: '12-06-2026 04:25',
    lastNN: '12-06-2026 04:00',
    optimizationTypes: ['Least Emission'],
    cpSpeed: 11,
    cpCons: 24,
    instSpeed: 11.1,
    instCons: 24.2,
    avgSpdSinceCOSP: 11.05,
    perfSpeedSinceCOSP: 11.1,
    costPerDay: 38_400,
    foCost: 748,
    goCost: 1098,
    euaCostPerMt: 74.5,
    performance: ['Gain'],
    rrRiSent: 'Yes',
    weatherSent: 'Yes',
    interimSent: 'Yes',
    eovReportSent: '',
    fileStatus: ['dispute'],
    voyageTags: '',
  },
  {
    voyageId: 'V-2026-007',
    vesselName: 'MV Arabian Pearl',
    clientName: 'Gulf Maritime',
    pic: 'priya',
    serviceTypes: ['RPM'],
    statuses: ['at port'],
    legLB: ['Laden'],
    departurePort: 'Jebel Ali',
    etd: '08-06-2026 20:00',
    atd: '08-06-2026 20:30',
    interimPort: '',
    ataInterim: '',
    atdInterim: '',
    arrivalPort: 'Mumbai',
    eta: '13-06-2026 08:00',
    ataArrival: '13-06-2026 08:30',
    lastNN: '13-06-2026 08:00',
    optimizationTypes: ['RTA'],
    cpSpeed: 13.5,
    cpCons: 31,
    instSpeed: 13.4,
    instCons: 31.2,
    avgSpdSinceCOSP: 13.45,
    perfSpeedSinceCOSP: 13.5,
    costPerDay: 51_200,
    foCost: 758,
    goCost: 1108,
    euaCostPerMt: 74.5,
    performance: ['Loss'],
    rrRiSent: 'Yes',
    weatherSent: 'Yes',
    interimSent: 'Yes',
    eovReportSent: '',
    fileStatus: ['claim'],
    voyageTags: 'attention',
  },
];
