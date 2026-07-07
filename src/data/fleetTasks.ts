/**
 * Fleet List View (`/main`) grid data.
 *
 * This is the single source of truth for the operations dashboard rows. It is
 * exported to the backend (see `scripts/exportSeed.mts` → `/api/data/fleetTasks`)
 * so the page can fetch the same data from the API, falling back to this array
 * when the backend is unavailable.
 */

export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

export type ClientType = 'Charter' | 'Owner';

export interface TaskRow {
  priority: Priority;
  dueLt: number;
  dueUtc: number;
  remaining: string;
  orderId: string;
  vessel: string;
  createdDate: string;
  pic: string;
  client: string;
  clientType: ClientType;
  voyageType: string;
  service: string;
  status: string;
  /** Leg-type code (e.g. `D+B+L+RD`); count is derived from the segments. */
  legDesc: string;
  portFrom: string;
  portVia: string;
  portTo: string;
  etd: string;
  eta: string;
  /** Hours since the last noon report was received. */
  lastNoon: number;
  /** Minutes since the last AIS position was fetched. */
  lastAis: number;
  wx: string;
  int: string;
  eov: string;
  opt: string;
  openTasks: number;
  tags: string;
  aiAlert: string;
  health: number;
  handoverNote: string;
  open: string;
}

export const FLEET_TASKS: TaskRow[] = [
  {
    priority: 'HIGH', dueLt: 900, dueUtc: 300, remaining: '01:20', orderId: 'OPT001',
    vessel: 'MV ABC', createdDate: '12-Jun-2026 09:15', pic: 'Amit', client: 'Cargill',
    clientType: 'Charter', voyageType: 'LT', service: 'PMO', status: 'At Sea',
    legDesc: 'D+B+L+RD', portFrom: 'Singapore', portVia: 'Cape Town', portTo: 'Santos',
    etd: '14-Jun 0800', eta: '18-Jun 1200', lastNoon: 5, lastAis: 125,
    wx: 'Y', int: 'Y', eov: 'N', opt: 'Y', openTasks: 3, tags: 'Typhoon, ETA',
    aiAlert: 'ETA Risk', health: 65, handoverNote: 'Monitor weather near Japan', open: 'OPEN',
  },
  {
    priority: 'MEDIUM', dueLt: 1000, dueUtc: 400, remaining: '02:35', orderId: 'OPT002',
    vessel: 'MV XYZ', createdDate: '14-Jun-2026 11:40', pic: 'Rahul', client: 'Bunge',
    clientType: 'Owner', voyageType: 'TCIN-TCOUT', service: 'RPM', status: 'At Sea',
    legDesc: 'B+L', portFrom: 'Fujairah', portVia: 'Suez', portTo: 'Rotterdam',
    etd: '16-Jun 1000', eta: '22-Jun 0800', lastNoon: 8, lastAis: 190,
    wx: 'Y', int: 'N', eov: 'N', opt: 'N', openTasks: 2, tags: 'FuelIssue',
    aiAlert: 'Fuel Increase', health: 78, handoverNote: 'Awaiting owner reply', open: 'OPEN',
  },
  {
    priority: 'LOW', dueLt: 1300, dueUtc: 700, remaining: '05:10', orderId: 'OPT003',
    vessel: 'MV John', createdDate: '10-Jun-2026 08:05', pic: 'John', client: 'WX',
    clientType: 'Charter', voyageType: 'TCIN-VOUT', service: 'Monitoring', status: 'At Port',
    legDesc: 'D', portFrom: 'Santos', portVia: 'N/A', portTo: 'Santos',
    etd: '10-Jun 0600', eta: 'N/A', lastNoon: 30, lastAis: 745,
    wx: 'Y', int: 'N/A', eov: 'N/A', opt: 'N/A', openTasks: 0, tags: 'PortStay',
    aiAlert: 'None', health: 98, handoverNote: 'Cargo ops ongoing', open: 'OPEN',
  },
  {
    priority: 'HIGH', dueLt: 800, dueUtc: 200, remaining: '00:45', orderId: 'OPT004',
    vessel: 'MV Pacific', createdDate: '11-Jun-2026 14:30', pic: 'Sara', client: 'Trafigura',
    clientType: 'Owner', voyageType: 'TCTIN-TCTOUT', service: 'PMO', status: 'At Sea',
    legDesc: 'D+B+L', portFrom: 'Houston', portVia: 'Gibraltar', portTo: 'Rotterdam',
    etd: '15-Jun 0900', eta: '20-Jun 1500', lastNoon: 3, lastAis: 35,
    wx: 'Y', int: 'Y', eov: 'N', opt: 'Y', openTasks: 5, tags: 'Storm, Deviation',
    aiAlert: 'Weather Risk', health: 58, handoverNote: 'Route deviation under review', open: 'OPEN',
  },
  {
    priority: 'MEDIUM', dueLt: 1100, dueUtc: 500, remaining: '03:15', orderId: 'OPT005',
    vessel: 'MV Atlantic', createdDate: '15-Jun-2026 16:50', pic: 'Amit', client: 'Cargill',
    clientType: 'Charter', voyageType: 'VIN-VOUT', service: 'RPM', status: 'At Sea',
    legDesc: 'B+L+RD', portFrom: 'Santos', portVia: 'Cape Town', portTo: 'Qingdao',
    etd: '18-Jun 1100', eta: '28-Jun 0200', lastNoon: 10, lastAis: 250,
    wx: 'Y', int: 'Y', eov: 'N', opt: 'Y', openTasks: 1, tags: 'ETA',
    aiAlert: 'On Track', health: 82, handoverNote: 'Steady progress, no issues', open: 'OPEN',
  },
  {
    priority: 'LOW', dueLt: 1400, dueUtc: 800, remaining: '06:40', orderId: 'OPT006',
    vessel: 'MV Orient', createdDate: '09-Jun-2026 07:20', pic: 'Rahul', client: 'Bunge',
    clientType: 'Owner', voyageType: 'OWN-TCOUT', service: 'Optinav', status: 'At Port',
    legDesc: 'D', portFrom: 'Qingdao', portVia: 'N/A', portTo: 'Qingdao',
    etd: '09-Jun 0700', eta: 'N/A', lastNoon: 28, lastAis: 1095,
    wx: 'N', int: 'N/A', eov: 'N/A', opt: 'N/A', openTasks: 0, tags: 'Bunkering',
    aiAlert: 'None', health: 95, handoverNote: 'Bunkering scheduled tomorrow', open: 'OPEN',
  },
  {
    priority: 'HIGH', dueLt: 950, dueUtc: 350, remaining: '01:05', orderId: 'OPT007',
    vessel: 'MV Northern Star', createdDate: '13-Jun-2026 10:55', pic: 'John', client: 'Vitol',
    clientType: 'Charter', voyageType: 'TCIN-TCTOUT', service: 'PMO', status: 'At Sea',
    legDesc: 'D+B', portFrom: 'Rotterdam', portVia: 'Azores', portTo: 'New York',
    etd: '17-Jun 1300', eta: '24-Jun 1800', lastNoon: 6, lastAis: 130,
    wx: 'Y', int: 'N', eov: 'N', opt: 'Y', openTasks: 4, tags: 'Typhoon, FuelIssue',
    aiAlert: 'Fuel Increase', health: 61, handoverNote: 'High consumption flagged by AI', open: 'OPEN',
  },
  {
    priority: 'MEDIUM', dueLt: 1050, dueUtc: 450, remaining: '02:50', orderId: 'OPT008',
    vessel: 'MV Southern Cross', createdDate: '14-Jun-2026 13:10', pic: 'Sara', client: 'Glencore',
    clientType: 'Owner', voyageType: 'VIN-TCOUT', service: 'Weather Only', status: 'At Sea',
    legDesc: 'L', portFrom: 'Singapore', portVia: 'Colombo', portTo: 'Fujairah',
    etd: '16-Jun 0800', eta: '21-Jun 0900', lastNoon: 9, lastAis: 320,
    wx: 'Y', int: 'N', eov: 'N', opt: 'N', openTasks: 2, tags: 'ETA',
    aiAlert: 'ETA Risk', health: 74, handoverNote: 'Monitoring monsoon swell', open: 'OPEN',
  },
  {
    priority: 'LOW', dueLt: 1500, dueUtc: 900, remaining: '07:20', orderId: 'OPT009',
    vessel: 'MV Endeavour', createdDate: '08-Jun-2026 06:45', pic: 'Amit', client: 'Trafigura',
    clientType: 'Charter', voyageType: 'OWN-VOUT', service: 'Shadow Monitoring', status: 'Completed',
    legDesc: 'D+B+L+RD', portFrom: 'New York', portVia: 'Miami', portTo: 'Houston',
    etd: '08-Jun 0500', eta: '15-Jun 1000', lastNoon: 26, lastAis: 555,
    wx: 'N', int: 'N/A', eov: 'Y', opt: 'N/A', openTasks: 0, tags: 'None',
    aiAlert: 'None', health: 99, handoverNote: 'Voyage closed, EOV sent', open: 'CLOSED',
  },
  {
    priority: 'HIGH', dueLt: 870, dueUtc: 270, remaining: '00:30', orderId: 'OPT010',
    vessel: 'MV Voyager', createdDate: '16-Jun-2026 18:25', pic: 'Rahul', client: 'Cargill',
    clientType: 'Owner', voyageType: 'TCTIN-TCOUT', service: 'RPM', status: 'At Sea',
    legDesc: 'B+RD', portFrom: 'Fujairah', portVia: 'Colombo', portTo: 'Singapore',
    etd: '13-Jun 1200', eta: '19-Jun 0600', lastNoon: 4, lastAis: 20,
    wx: 'Y', int: 'Y', eov: 'N', opt: 'Y', openTasks: 6, tags: 'Storm, ETA, Deviation',
    aiAlert: 'Weather Risk', health: 54, handoverNote: 'Awaiting revised routing from ops', open: 'OPEN',
  },
];
