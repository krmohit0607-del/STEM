/**
 * Derived, cross-linked detail views for the open voyage.
 *
 * The Vessel / Client / Email / Passage detail pages all resolve the same
 * selected `Voyage` (see `selectedVoyage.ts`) and project it into a focused
 * view model. Everything is deterministic from the voyage's `seed`, so the
 * four pages stay self-consistent with each other and with the Voyage
 * Details page.
 *
 * Replace these derivations with real API payloads (vessel particulars,
 * client master, email log, passage plan) when those endpoints are exposed.
 */

import { PORT_COORDS } from './fleet';
import { VOYAGES, type Voyage } from './voyages';

/** Mulberry32 deterministic PRNG seeded by an integer. */
export function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(arr: T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length];
}

function numFmt(n: number): string {
  return Math.round(n).toLocaleString();
}

function emailDomain(email: string): string {
  return email.split('@')[1] ?? 'client.example.com';
}

// --- Vessel details --------------------------------------------------------

export interface VesselDetailsView {
  vesselName: string;
  imo: string;
  mmsi: string;
  callSign: string;
  vesselType: string;
  flag: string;
  portOfRegistry: string;
  built: string;
  builder: string;
  classSociety: string;
  owner: string;
  manager: string;
  dwt: string;
  gt: string;
  nrt: string;
  loa: string;
  beam: string;
  summerDraft: string;
  enginePower: string;
  meType: string;
  ecdisModel: string;
  egcsType: string;
  scrubber: string;
  ciiRating: string;
  aisProvider: string;
}

const BUILDERS = [
  'Hyundai Heavy Industries',
  'Daewoo (DSME)',
  'Samsung Heavy Industries',
  'Imabari Shipbuilding',
  'New Times Shipbuilding',
  'Tsuneishi Shipbuilding',
];
const CLASS_SOCIETIES = ['DNV', 'Lloyd\u2019s Register', 'ABS', 'Bureau Veritas', 'ClassNK', 'RINA'];
const OWNERS = [
  'Oceanic Shipping',
  'Trident Marine',
  'Polaris Bulk',
  'Meridian Tankers',
  'Cobalt Carriers',
  'Aurora Lines',
  'Vanguard Maritime',
];
const MANAGERS = [
  'ABC Ship Management',
  'Bernhard Schulte',
  'Anglo-Eastern',
  'Wallem Group',
  'Synergy Marine',
  'V.Group',
  'Thome Ship Management',
];
const ME_TYPES = [
  'MAN B&W 6S60ME-C8.2',
  'MAN B&W 7S50ME-C9.5',
  'W\u00e4rtsil\u00e4 RT-flex58T-E',
  'MAN B&W 6G70ME-C9.5',
  'WinGD W7X72',
  'MAN B&W 5S60ME-C8.5',
];
const AIS_PROVIDERS = ['MarineTraffic', 'Spire', 'exactEarth', 'ORBCOMM', 'VesselFinder'];

export function getVesselDetails(v: Voyage): VesselDetailsView {
  const r = Array.from({ length: 16 }, makeRng(v.seed));
  const dwtNum = Number(v.dwt.replace(/[^\d.]/g, '')) || 0;
  const gt = dwtNum * (0.52 + r[0] * 0.06);
  const nrt = gt * (0.42 + r[1] * 0.06);
  const mmsi = String(563000000 + Math.floor(r[2] * 999999)).slice(0, 9);
  const callSign = `9V${String.fromCharCode(65 + Math.floor(r[3] * 26))}${Math.floor(
    1000 + r[4] * 8999,
  )}`;
  return {
    vesselName: v.vessel,
    imo: v.imo,
    mmsi,
    callSign,
    vesselType: v.vesselType,
    flag: v.flag,
    portOfRegistry: v.flag === 'Singapore' ? 'Singapore' : pick(['Panama City', 'Monrovia', 'Majuro', 'Valletta', 'Hong Kong'], r[5]),
    built: String(v.built),
    builder: pick(BUILDERS, r[6]),
    classSociety: pick(CLASS_SOCIETIES, r[7]),
    owner: pick(OWNERS, r[8]),
    manager: pick(MANAGERS, r[9]),
    dwt: v.dwt,
    gt: `${numFmt(gt)} GT`,
    nrt: `${numFmt(nrt)} NRT`,
    loa: v.loa,
    beam: v.beam,
    summerDraft: `${(12 + r[10] * 6).toFixed(1)} m`,
    enginePower: v.enginePower,
    meType: pick(ME_TYPES, r[11]),
    ecdisModel: v.ecdisModel,
    egcsType: pick(['Closed', 'Open', 'Hybrid'], r[12]),
    scrubber: r[13] > 0.35 ? 'Yes' : 'No',
    ciiRating: pick(['A', 'B', 'C', 'D'], r[14]),
    aisProvider: pick(AIS_PROVIDERS, r[15]),
  };
}

// --- Client details --------------------------------------------------------

export interface ClientDetailsView {
  clientName: string;
  clientType: string;
  service: string;
  pricingBasis: string;
  price: string;
  pic: string;
  team: string;
  accountManager: string;
  region: string;
  segment: string;
  contractRef: string;
  clientSince: string;
  status: string;
  /** Other open voyages for the same client (cross-page linking). */
  fleet: Array<{ id: string; vessel: string; route: string; status: string }>;
}

const REGIONS = ['EMEA', 'APAC', 'Americas', 'Middle East'];
const SEGMENTS = ['Dry Bulk', 'Tankers', 'Energy', 'Agri Commodities'];
const ACCOUNT_MANAGERS = ['Priya Nair', 'Tom Becker', 'Liang Wei', 'Sofia Marin', 'James Okoro'];

export function getClientDetails(v: Voyage): ClientDetailsView {
  const r = Array.from({ length: 10 }, makeRng(v.seed + 101));
  const fleet = VOYAGES.filter((x) => x.client === v.client).map((x) => ({
    id: x.id,
    vessel: x.vessel,
    route: `${x.portFrom} \u2192 ${x.portTo}`,
    status: x.status,
  }));
  return {
    clientName: v.client,
    clientType: r[0] > 0.5 ? 'Owner' : 'Charterer',
    service: v.service,
    pricingBasis: v.pricingBasis,
    price: v.price > 0 ? `${v.price.toLocaleString()} USD` : 'As Agreed',
    pic: v.pic,
    team: pick(['Weather Routing', 'Performance', 'Operations', 'Voyage Desk'], r[1]),
    accountManager: pick(ACCOUNT_MANAGERS, r[2]),
    region: pick(REGIONS, r[3]),
    segment: pick(SEGMENTS, r[4]),
    contractRef: `CT-${2020 + Math.floor(r[5] * 6)}-${Math.floor(100 + r[6] * 899)}`,
    clientSince: String(2008 + Math.floor(r[7] * 16)),
    status: 'Active',
    fleet,
  };
}

// --- Email details ---------------------------------------------------------

export interface EmailContact {
  role: string;
  name: string;
  address: string;
}

export interface EmailLogRow {
  date: string;
  subject: string;
  to: string;
  direction: 'Sent' | 'Received';
  status: string;
}

export interface EmailDetailsView {
  clientName: string;
  contacts: EmailContact[];
  log: EmailLogRow[];
}

const OPS_NAMES = ['A. Sharma', 'M. Tan', 'K. Olsen', 'R. Costa', 'D. Ahmed', 'L. Petrov'];

export function getEmailDetails(v: Voyage): EmailDetailsView {
  const r = Array.from({ length: 12 }, makeRng(v.seed + 202));
  const domain = emailDomain(v.clientEmail);
  const opsName = pick(OPS_NAMES, r[0]);
  const contacts: EmailContact[] = [
    { role: 'Client Operations', name: opsName, address: v.clientEmail },
    { role: 'Chartering Desk', name: `${pick(OPS_NAMES, r[1])}`, address: `chartering@${domain}` },
    { role: 'Daily Fleet Summary', name: 'Distribution List', address: `reports@${domain}` },
    { role: 'Vessel (Master)', name: `Master ${v.vessel}`, address: `master.${v.id.toLowerCase()}@vessel.example.com` },
    { role: 'Emergency / 24x7', name: 'Duty Officer', address: `emergency@${domain}` },
    { role: 'Accounts', name: 'Billing', address: `accounts@${domain}` },
  ];

  const subjects = [
    `Weather Routing Advisory \u2013 ${v.vessel}`,
    `Noon Report ${v.id}`,
    `ETA Update \u2013 ${v.portTo}`,
    `Interim Report \u2013 ${v.vessel}`,
    `Bunker Plan \u2013 ${v.id}`,
    `Route Optimization Summary`,
  ];
  const statuses = ['Delivered', 'Read', 'Queued', 'Delivered', 'Read'];
  const log: EmailLogRow[] = subjects.map((subject, i) => {
    const day = String(10 + Math.floor(r[i + 2] * 18)).padStart(2, '0');
    const dir: 'Sent' | 'Received' = r[i + 2] > 0.6 ? 'Received' : 'Sent';
    return {
      date: `${day}-Jun-2026 ${String(6 + Math.floor(r[i + 2] * 12)).padStart(2, '0')}:${String(
        Math.floor(r[i + 2] * 59),
      ).padStart(2, '0')} UTC`,
      subject,
      to: dir === 'Sent' ? v.clientEmail : contacts[3].address,
      direction: dir,
      status: pick(statuses, r[i + 2]),
    };
  });

  return { clientName: v.client, contacts, log };
}

// --- Passage details -------------------------------------------------------

export interface PassageLeg {
  no: string;
  type: string;
  from: string;
  to: string;
  etd: string;
  eta: string;
  distanceNm: string;
  speed: string;
  status: string;
}

export interface PassageDetailsView {
  vessel: string;
  origin: string;
  destination: string;
  interimPort: string;
  routeRef: string;
  totalDistanceNm: string;
  legs: PassageLeg[];
}

/** Great-circle distance (NM) between two [lat, lon] points. */
function distanceNm(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function legDistance(from: string, to: string, fallback: number): number {
  const a = PORT_COORDS[from];
  const b = PORT_COORDS[to];
  if (a && b) return Math.round(distanceNm(a, b));
  return Math.round(fallback);
}

export function getPassageDetails(v: Voyage): PassageDetailsView {
  const r = Array.from({ length: 8 }, makeRng(v.seed + 303));
  const interim = v.interimPort || '';
  const speed = v.cpSpeed.toFixed(1);

  const legs: PassageLeg[] = [];
  if (interim && interim !== v.portTo) {
    const d1 = legDistance(v.portFrom, interim, 2000 + r[0] * 3000);
    const d2 = legDistance(interim, v.portTo, 2000 + r[1] * 4000);
    legs.push({
      no: 'P-1',
      type: 'Departure Leg',
      from: v.portFrom,
      to: interim,
      etd: v.etdDisplay,
      eta: interim,
      distanceNm: d1.toLocaleString(),
      speed: `${speed} kt`,
      status: v.status === 'At Sea' ? 'Active' : 'Planned',
    });
    legs.push({
      no: 'P-2',
      type: 'Final Leg',
      from: interim,
      to: v.portTo,
      etd: 'On departure',
      eta: v.eta,
      distanceNm: d2.toLocaleString(),
      speed: `${speed} kt`,
      status: 'Planned',
    });
  } else {
    const d = legDistance(v.portFrom, v.portTo, 3000 + r[0] * 5000);
    legs.push({
      no: 'P-1',
      type: 'Direct Passage',
      from: v.portFrom,
      to: v.portTo,
      etd: v.etdDisplay,
      eta: v.eta,
      distanceNm: d.toLocaleString(),
      speed: `${speed} kt`,
      status: v.status === 'At Sea' ? 'Active' : 'Planned',
    });
  }

  const total = legs.reduce((sum, leg) => sum + Number(leg.distanceNm.replace(/,/g, '')), 0);

  return {
    vessel: v.vessel,
    origin: v.portFrom,
    destination: v.portTo,
    interimPort: interim || '\u2014',
    routeRef: v.routeRef,
    totalDistanceNm: total.toLocaleString(),
    legs,
  };
}
